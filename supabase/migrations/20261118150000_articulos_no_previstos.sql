-- ============================================================
-- 20261118150000_articulos_no_previstos.sql — 18/11/2026
-- ============================================================
-- Recepción de artículos NO previstos en el remito (caso de Aris, dueño):
--   "decía vasos y llegaron platos" o "llegó todo y además algo extra".
-- Decisión: el artículo no previsto queda FRENADO (estado 'con_diferencia',
-- como cualquier diferencia) y su stock se mueve recién cuando el depósito
-- que ENVIÓ (origen) lo ACEPTA. Si lo rechaza, no se mueve stock y queda
-- asentado (hay que devolverlo físicamente).
--
-- Qué hace (idempotente, re-ejecutable):
--   a) Columnas en solicitudes_reposicion_lineas: no_previsto,
--      reemplaza_linea_id (línea del remito a la que reemplaza).
--   b) Amplía el check de reposicion_lineas_eventos.evento con
--      'no_previsto_recibido', 'no_previsto_aceptado', 'no_previsto_rechazado'.
--   c) cerrar_solicitud_reposicion_si_completa: una línea 'con_diferencia'
--      NUNCA es terminal (la no prevista tiene cantidad_enviada 0 y antes
--      habría cerrado el pedido).
--   d) registrar_no_previsto(): lo hace el destino (o admin).
--   e) resolver_no_previsto(): lo hace el origen (o admin): aceptar o rechazar.
--   f) revisar_diferencia_linea() y corregir_envio_linea() redefinidas
--      (copia de 20261117140000) para rechazar las líneas no previstas.
-- Requiere 20260930140000, 20261117130000 y 20261117140000 aplicadas.
-- No mueve stock en YiQi: lo hace el front con mover-stock-reposicion
-- después de aceptar.
-- ============================================================

-- a) Columnas
alter table public.solicitudes_reposicion_lineas
  add column if not exists no_previsto boolean not null default false,
  add column if not exists reemplaza_linea_id bigint;

-- b) Eventos nuevos
alter table public.reposicion_lineas_eventos
  drop constraint if exists reposicion_lineas_eventos_evento_check;
alter table public.reposicion_lineas_eventos
  add constraint reposicion_lineas_eventos_evento_check check (evento in (
    'declarada', 'recibida_ok', 'recibida_con_diferencia', 'envio_corregido', 'diferencia_revisada',
    'no_previsto_recibido', 'no_previsto_aceptado', 'no_previsto_rechazado'
  ));

-- c) Cierre automático: 'con_diferencia' nunca es terminal.
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
      or (l.estado_linea not in ('reservada', 'con_diferencia')
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
revoke execute on function public.cerrar_solicitud_reposicion_si_completa(bigint) from public, anon, authenticated;

-- d) Registrar un artículo no previsto (lo hace quien RECIBE).
create or replace function public.registrar_no_previsto(
  p_solicitud_id bigint,
  p_sku text,
  p_cantidad numeric,
  p_motivo text,
  p_nota text default null,
  p_reemplaza_linea_id bigint default null
)
 returns bigint
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_sol record;
  v_nombre text;
  v_sku text := nullif(btrim(coalesce(p_sku, '')), '');
  v_linea public.solicitudes_reposicion_lineas;
  v_id bigint;
begin
  select * into v_sol from public.solicitudes_reposicion where id = p_solicitud_id for update;
  if not found then
    raise exception 'Pedido % no existe', p_solicitud_id;
  end if;

  if auth.uid() is not null and not (public.es_admin() or v_sol.deposito_destino_id in (select public.mis_depositos())) then
    raise exception 'Solo el depósito que recibe (o un admin) puede registrar un artículo no previsto en el pedido %', p_solicitud_id;
  end if;

  if v_sol.estado <> 'en_preparacion' then
    raise exception 'El pedido % no está abierto (estado actual: %): no se puede registrar un artículo no previsto', p_solicitud_id, v_sol.estado;
  end if;

  if v_sku is null then
    raise exception 'Falta el artículo';
  end if;
  select m.mate_nombre into v_nombre from public.material_yiqi m where m.mate_codigo = v_sku limit 1;
  if not found then
    raise exception 'El artículo % no existe en el catálogo', v_sku;
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad recibida tiene que ser mayor que 0';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Falta el motivo';
  end if;

  if p_reemplaza_linea_id is not null and not exists (
    select 1 from public.solicitudes_reposicion_lineas
    where id = p_reemplaza_linea_id and solicitud_id = p_solicitud_id
  ) then
    raise exception 'La línea % no es de este pedido', p_reemplaza_linea_id;
  end if;

  insert into public.solicitudes_reposicion_lineas
    (solicitud_id, sku, mate_nombre, cantidad_solicitada, estado_linea, cantidad_enviada,
     cantidad_recibida, cantidad_recibida_inicial, motivo_diferencia, nota_diferencia,
     recibida_en, no_previsto, reemplaza_linea_id)
  values
    (p_solicitud_id, v_sku, v_nombre, 0, 'con_diferencia', 0,
     p_cantidad, p_cantidad, btrim(p_motivo), nullif(btrim(coalesce(p_nota, '')), ''),
     now(), true, p_reemplaza_linea_id)
  returning * into v_linea;
  v_id := v_linea.id;

  perform public.registrar_evento_linea(v_linea, 'no_previsto_recibido', 0, p_cantidad, p_motivo, p_nota);
  return v_id;
end;
$function$;

-- e) Resolver un no previsto (lo hace quien ENVIÓ): aceptar o rechazar.
create or replace function public.resolver_no_previsto(
  p_linea_id bigint,
  p_aceptar boolean,
  p_motivo text
)
 returns void
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_linea public.solicitudes_reposicion_lineas;
  v_origen integer;
begin
  select * into v_linea from public.solicitudes_reposicion_lineas where id = p_linea_id for update;
  if not found then
    raise exception 'Línea % no existe', p_linea_id;
  end if;

  select deposito_origen_id into v_origen from public.solicitudes_reposicion where id = v_linea.solicitud_id;
  if auth.uid() is not null and not (public.es_admin() or v_origen in (select public.mis_depositos())) then
    raise exception 'Solo el depósito que envió (origen) o un admin puede aceptar o rechazar el artículo no previsto de la línea %', p_linea_id;
  end if;

  if not v_linea.no_previsto then
    raise exception 'La línea % no es un artículo no previsto', p_linea_id;
  end if;
  if v_linea.estado_linea <> 'con_diferencia' then
    raise exception 'La línea % ya fue resuelta (estado actual: %)', p_linea_id, v_linea.estado_linea;
  end if;
  if p_aceptar is null then
    raise exception 'Falta indicar si se acepta o se rechaza';
  end if;

  if p_aceptar then
    update public.solicitudes_reposicion_lineas
       set cantidad_enviada        = cantidad_recibida,
           estado_linea            = 'recibida',
           diferencia_revisada_en  = now(),
           diferencia_revisada_por = auth.uid(),
           nota_revision           = nullif(btrim(coalesce(p_motivo, '')), '')
     where id = p_linea_id;
    perform public.registrar_evento_linea(v_linea, 'no_previsto_aceptado', 0, v_linea.cantidad_recibida, p_motivo, null);
  else
    if p_motivo is null or btrim(p_motivo) = '' then
      raise exception 'Falta el motivo del rechazo';
    end if;
    update public.solicitudes_reposicion_lineas
       set cantidad_recibida       = 0,
           estado_linea            = 'recibida',
           diferencia_revisada_en  = now(),
           diferencia_revisada_por = auth.uid(),
           nota_revision           = 'Rechazado: ' || btrim(p_motivo)
     where id = p_linea_id;
    perform public.registrar_evento_linea(v_linea, 'no_previsto_rechazado', v_linea.cantidad_recibida, 0, p_motivo, 'Hay que devolverlo físicamente');
  end if;
end;
$function$;

-- f) revisar_diferencia_linea: copia de 20261117140000 + rechazo de no previstos.
create or replace function public.revisar_diferencia_linea(
  p_linea_id bigint,
  p_cantidad_final numeric,
  p_nota text default null
)
 returns void
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_linea public.solicitudes_reposicion_lineas;
  v_destino integer;
begin
  select * into v_linea from public.solicitudes_reposicion_lineas where id = p_linea_id for update;
  if not found then
    raise exception 'Línea % no existe', p_linea_id;
  end if;

  select deposito_destino_id into v_destino from public.solicitudes_reposicion where id = v_linea.solicitud_id;
  if auth.uid() is not null and not (public.es_admin() or v_destino in (select public.mis_depositos())) then
    raise exception 'Solo el depósito que recibe (o un admin) puede revisar la diferencia de la línea %', p_linea_id;
  end if;

  if v_linea.estado_linea <> 'con_diferencia' then
    raise exception 'La línea % no tiene una diferencia pendiente (estado actual: %)', p_linea_id, v_linea.estado_linea;
  end if;
  if v_linea.no_previsto then
    raise exception 'Este artículo no estaba en el remito: lo acepta o lo rechaza el depósito que envió';
  end if;
  if p_cantidad_final is null or p_cantidad_final < 0 then
    raise exception 'Cantidad final inválida para la línea %', p_linea_id;
  end if;

  update public.solicitudes_reposicion_lineas
     set cantidad_recibida       = p_cantidad_final,
         estado_linea            = 'recibida',
         diferencia_revisada_en  = now(),
         diferencia_revisada_por = auth.uid(),
         nota_revision           = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_linea_id;
  perform public.registrar_evento_linea(v_linea, 'diferencia_revisada', v_linea.cantidad_recibida, p_cantidad_final,
    v_linea.motivo_diferencia, p_nota);
end;
$function$;

-- f) corregir_envio_linea: copia de 20261117140000 + rechazo de no previstos.
create or replace function public.corregir_envio_linea(
  p_linea_id bigint,
  p_cantidad_enviada numeric,
  p_motivo text
)
 returns void
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_linea public.solicitudes_reposicion_lineas;
  v_origen integer;
  v_faltante numeric;
begin
  select * into v_linea from public.solicitudes_reposicion_lineas where id = p_linea_id for update;
  if not found then
    raise exception 'Línea % no existe', p_linea_id;
  end if;

  select deposito_origen_id into v_origen from public.solicitudes_reposicion where id = v_linea.solicitud_id;
  if auth.uid() is not null and not (public.es_admin() or v_origen in (select public.mis_depositos())) then
    raise exception 'Solo el depósito que envió (origen) o un admin puede corregir lo enviado en la línea %', p_linea_id;
  end if;

  if v_linea.estado_linea <> 'con_diferencia' then
    raise exception 'La línea % no tiene una diferencia pendiente (estado actual: %)', p_linea_id, v_linea.estado_linea;
  end if;
  if v_linea.no_previsto then
    raise exception 'Este artículo no estaba en el remito: no se corrige lo enviado, se acepta o se rechaza';
  end if;
  if p_cantidad_enviada is null or p_cantidad_enviada < 0 then
    raise exception 'Cantidad enviada inválida para la línea %', p_linea_id;
  end if;
  if p_cantidad_enviada = v_linea.cantidad_enviada then
    raise exception 'La cantidad enviada ya es %: si es correcta, la diferencia la revisa quien recibió', p_cantidad_enviada;
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Falta el motivo de la corrección';
  end if;

  v_faltante := greatest(v_linea.cantidad_solicitada - p_cantidad_enviada, 0);

  update public.solicitudes_reposicion_lineas
     set cantidad_enviada  = p_cantidad_enviada,
         cantidad_faltante = v_faltante,
         motivo_sin_stock  = case when p_cantidad_enviada is distinct from cantidad_solicitada then p_motivo else null end,
         estado_linea      = 'declarada',
         cantidad_recibida = null,
         cantidad_recibida_inicial = null,
         motivo_diferencia = null,
         nota_diferencia   = null,
         recibida_en       = null
   where id = p_linea_id;

  perform public.registrar_evento_linea(v_linea, 'envio_corregido', v_linea.cantidad_enviada, p_cantidad_enviada,
    p_motivo, 'Recibido en destino: ' || coalesce(v_linea.cantidad_recibida::text, '—'));

  if v_faltante > 0 then
    insert into public.alertas_suspendidas (sku, motivo, solicitud_linea_id)
    values (v_linea.sku, p_motivo, p_linea_id)
    on conflict (sku) do update
      set motivo = excluded.motivo,
          solicitud_linea_id = excluded.solicitud_linea_id,
          suspendida_en = now(),
          reactivada_en = null;
  end if;
end;
$function$;

revoke execute on function public.registrar_no_previsto(bigint, text, numeric, text, text, bigint) from public, anon;
revoke execute on function public.resolver_no_previsto(bigint, boolean, text) from public, anon;
revoke execute on function public.revisar_diferencia_linea(bigint, numeric, text) from public, anon;
revoke execute on function public.corregir_envio_linea(bigint, numeric, text) from public, anon;
grant execute on function public.registrar_no_previsto(bigint, text, numeric, text, text, bigint) to authenticated;
grant execute on function public.resolver_no_previsto(bigint, boolean, text) to authenticated;
grant execute on function public.revisar_diferencia_linea(bigint, numeric, text) to authenticated;
grant execute on function public.corregir_envio_linea(bigint, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- Verificación (solo lectura):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'solicitudes_reposicion_lineas'
--      and column_name in ('no_previsto','reemplaza_linea_id');                      -- 2 filas
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('registrar_no_previsto','resolver_no_previsto');             -- 2 filas
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'reposicion_lineas_eventos_evento_check';                       -- incluye no_previsto_*
--   select pg_get_functiondef('public.cerrar_solicitud_reposicion_si_completa(bigint)'::regprocedure)
--     like '%con_diferencia%' as con_diferencia_no_terminal;                          -- true
-- ------------------------------------------------------------
