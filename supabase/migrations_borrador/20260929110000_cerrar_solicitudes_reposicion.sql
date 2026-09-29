-- ============================================================
-- 20260929110000_cerrar_solicitudes_reposicion.sql
-- Dentalab-Compras — cierre automático del encabezado de
-- solicitudes_reposicion cuando todas sus líneas llegan a un estado
-- terminal. BORRADOR 29/9/2026 — NO APLICADO. Correr recién después
-- de revisar la salida del diagnóstico (constraints + cuerpos de
-- declarar_linea_reposicion / confirmar_recepcion_linea).
-- ============================================================
--
-- Problema: confirmar_recepcion_linea() (solo existe en prod, no en el
-- repo) marca la línea 'recibida' pero nunca toca
-- solicitudes_reposicion.estado. Nada en el repo mueve un encabezado a
-- un estado cerrado: los únicos UPDATE de estado son
-- generar_remito_reposicion_central() → 'en_preparacion' y
-- crear_solicitud_reposicion() → 'reemplazada' (solo para 'solicitada').
-- Consecuencias:
--   1) evaluar_reglas_reposicion_central() (cron jobid 15) corta en su
--      gate "estado in ('solicitada','en_preparacion')" para 157→155 y
--      no vuelve a crear solicitudes nunca.
--   2) El neteo de generar_remito_reposicion_central() resta como
--      "reservado" TODAS las líneas de encabezados 'en_preparacion',
--      incluidas las ya recibidas → subpide.
--   3) Un remito que se genera con 0 líneas queda 'en_preparacion'
--      sin líneas para siempre (mismo bloqueo del punto 1).
--
-- Qué hace (idempotente, re-ejecutable):
--   a) Agrega 'completada' y 'anulada' al check de estado (si existe
--      un check sobre la columna, lo reemplaza por el superconjunto).
--   b) Columna nueva cerrada_en timestamptz.
--   c) Función cerrar_solicitud_reposicion_si_completa(id): si el
--      encabezado está 'en_preparacion' y todas sus líneas son
--      terminales → 'completada'. Si no tiene ninguna línea → también
--      'completada' (remito vacío, no hay nada que esperar).
--      Línea terminal = 'recibida', o declarada con cantidad_enviada
--      = 0 ("no hay": nunca aparece en Confirmar recepción porque esa
--      pantalla filtra cantidad_enviada > 0). 'reservada' nunca es
--      terminal. Un estado desconocido con cantidad > 0 NO cierra
--      (falla cerrado).
--   d) Trigger AFTER INSERT/UPDATE/DELETE en solicitudes_reposicion_
--      lineas → llama a (c). No toca confirmar_recepcion_linea().
--   e) Trigger AFTER UPDATE OF estado en solicitudes_reposicion, solo
--      cuando pasa a 'en_preparacion' → llama a (c) (cubre el remito
--      de 0 líneas; generar_remito inserta las líneas ANTES del UPDATE).
--   f) Backfill: corre (c) sobre todos los 'en_preparacion' actuales.
--      OJO: esto cierra la #7 (22 líneas 'recibida' por SQL, sin
--      movimiento en YiQi) — cerrar el encabezado NO mueve stock ni
--      impide mover después (mover-stock-reposicion no mira el
--      encabezado). La #2 NO se cierra (199 líneas 'declarada' > 0).
--
-- NO mueve stock en YiQi. Ningún paso llama a mover-stock-reposicion.
--
-- Impacto en frontend (a ajustar aparte, no incluido acá):
--   - ConfirmarRecepcion.jsx / SolicitudesParaPreparar.jsx filtran
--     por estado 'en_preparacion' / ('solicitada','en_preparacion'):
--     una 'completada' o 'anulada' desaparece de ahí (correcto).
--   - ReposicionCentralLocal.jsx estadoDetallado() no conoce
--     'completada'/'anulada': cae en la rama en_preparacion. Hay que
--     sumar dos if al principio (completada → "✓ Completa",
--     anulada → "Anulada") y excluir 'anulada' del filtro Activas.
--
-- Dónde correrlo: SQL Editor de Supabase, proyecto hsfudsnmooaesrzdwecg
-- https://supabase.com/dashboard/project/hsfudsnmooaesrzdwecg/sql/new
-- Probado 29/9/2026 contra un Postgres 16 local con esquema mínimo
-- simulado (no contra prod): aplica 2 veces sin error, cierra/no cierra
-- los casos esperados.
-- ============================================================

begin;

-- 0) Guardas: la columna estado tiene que ser texto (no enum).
do $$
declare v_tipo text;
begin
  select data_type into v_tipo
  from information_schema.columns
  where table_schema = 'public' and table_name = 'solicitudes_reposicion' and column_name = 'estado';
  if v_tipo is null then
    raise exception 'No existe public.solicitudes_reposicion.estado';
  end if;
  if v_tipo not in ('text', 'character varying') then
    raise exception 'solicitudes_reposicion.estado es de tipo %, no texto — revisar antes de aplicar', v_tipo;
  end if;
end $$;

-- a) Check de estado: reemplaza cualquier CHECK que use la columna
--    estado por el superconjunto. Si hay filas con otro valor, falla y
--    el begin/commit revierte todo.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.solicitudes_reposicion'::regclass
      and con.contype = 'c'
      and att.attname = 'estado'
  loop
    execute format('alter table public.solicitudes_reposicion drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.solicitudes_reposicion
  add constraint solicitudes_reposicion_estado_check
  check (estado in ('solicitada', 'en_preparacion', 'reemplazada', 'completada', 'anulada'));

-- b) Cuándo se cerró
alter table public.solicitudes_reposicion
  add column if not exists cerrada_en timestamptz;

-- c) Cierre idempotente de un encabezado
create or replace function public.cerrar_solicitud_reposicion_si_completa(p_solicitud_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_estado text;
  v_pendientes int;
begin
  -- Bloquea el encabezado: dos confirmaciones simultáneas de las
  -- últimas líneas se serializan acá, y la segunda ve la primera ya
  -- commiteada (READ COMMITTED toma snapshot nuevo por sentencia).
  select estado into v_estado
  from solicitudes_reposicion
  where id = p_solicitud_id
  for update;

  if v_estado is distinct from 'en_preparacion' then
    return false;
  end if;

  select count(*) into v_pendientes
  from solicitudes_reposicion_lineas l
  where l.solicitud_id = p_solicitud_id
    and not (
      l.estado_linea = 'recibida'
      or (l.estado_linea is distinct from 'reservada'
          and coalesce(l.cantidad_enviada, 0) = 0)
    );

  if v_pendientes > 0 then
    return false;
  end if;

  update solicitudes_reposicion
     set estado = 'completada',
         cerrada_en = coalesce(cerrada_en, now())
   where id = p_solicitud_id
     and estado = 'en_preparacion';

  return true;
end;
$function$;

comment on function public.cerrar_solicitud_reposicion_si_completa(bigint) is
  '29/9/2026: pasa el encabezado de en_preparacion a completada cuando todas sus líneas son terminales (recibida, o declarada con cantidad_enviada = 0) o no tiene líneas. Idempotente. No mueve stock en YiQi.';

-- d) Trigger sobre las líneas
create or replace function public.trigger_cerrar_solicitud_desde_linea()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    perform cerrar_solicitud_reposicion_si_completa(old.solicitud_id);
    return old;
  end if;
  perform cerrar_solicitud_reposicion_si_completa(new.solicitud_id);
  return new;
end;
$function$;

drop trigger if exists trg_cerrar_solicitud_desde_linea on public.solicitudes_reposicion_lineas;
create trigger trg_cerrar_solicitud_desde_linea
after insert or delete or update of estado_linea, cantidad_enviada
on public.solicitudes_reposicion_lineas
for each row
execute function public.trigger_cerrar_solicitud_desde_linea();

-- e) Trigger sobre el encabezado (remito generado con 0 líneas)
create or replace function public.trigger_cerrar_solicitud_vacia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform cerrar_solicitud_reposicion_si_completa(new.id);
  return new;
end;
$function$;

drop trigger if exists trg_cerrar_solicitud_vacia on public.solicitudes_reposicion;
create trigger trg_cerrar_solicitud_vacia
after update of estado on public.solicitudes_reposicion
for each row
when (new.estado = 'en_preparacion' and old.estado is distinct from 'en_preparacion')
execute function public.trigger_cerrar_solicitud_vacia();

-- f) Backfill: cierra lo que ya está completo hoy (cierra #7, no #2).
select s.id, s.remito_numero,
       public.cerrar_solicitud_reposicion_si_completa(s.id) as cerrada_ahora
from public.solicitudes_reposicion s
where s.estado = 'en_preparacion'
order by s.id;

commit;

-- ============================================================
-- ROLLBACK (correr aparte solo si hace falta volver atrás):
--   drop trigger if exists trg_cerrar_solicitud_desde_linea on public.solicitudes_reposicion_lineas;
--   drop trigger if exists trg_cerrar_solicitud_vacia on public.solicitudes_reposicion;
--   update public.solicitudes_reposicion set estado = 'en_preparacion' where estado = 'completada';
--   (el check con los 5 valores puede quedar, es un superconjunto)
-- ============================================================
