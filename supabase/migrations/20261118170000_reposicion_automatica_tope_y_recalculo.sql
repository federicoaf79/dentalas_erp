-- ============================================================
-- 20261118170000_reposicion_automatica_tope_y_recalculo.sql — 18/11/2026
-- ============================================================
-- Pedido de Aris (dueño, admin) sobre la reposición automática Central→Local:
--  1) Con el automático activado, como máximo 2 remitos abiertos a la vez
--     (de hasta 30 artículos cada uno). Mientras no se preparen y se
--     entreguen, el sistema NO genera pedidos nuevos.
--  2) La clasificación ABC por importancia y rotación se mantiene (se reutiliza
--     reposicion_central_candidatos(), sin cambios).
--  3) Los remitos EN ESPERA (Central todavía no empezó a armarlos) se
--     reformulan con el stock nuevo: si después de generarlos aparece un
--     artículo A con necesidad, entra según la prioridad ABC.
--  4) Botón "Recalcular remitos" (RPC forzar_actualizacion_reposicion).
--  5) Todo se modifica desde el usuario de Aris (configurar_reposicion_automatica).
--
-- Definiciones:
--  - "Pedido automático abierto": generada_por = 'regla_automatica', origen 157,
--    destino 155, estado 'solicitada' o 'en_preparacion'. Los manuales NO cuentan.
--  - "En espera": abierto, 'en_preparacion', armado_iniciado_en IS NULL y TODAS
--    sus líneas 'reservada' (ninguna declarada). Deja de estar en espera cuando
--    Central imprime el remito (marcar_armado_iniciado) o declara una línea.
--
-- Qué cambia:
--  a) reglas_reposicion_central: maximo_ordenes_abiertas (default 2, 1..10) y
--     recalcular_en_espera (default true).
--  b) solicitudes_reposicion: armado_iniciado_en, recalculado_en.
--  c) armar_lineas_remito_central(id): inserta las líneas (hasta maximo_lineas) con
--     el mismo criterio ABC de siempre. generar_remito_reposicion_central() la usa.
--  d) generar_remito_reposicion_central(): el pedido siguiente solo se encadena si
--     la regla está activa Y abiertos (contando el actual) < maximo_ordenes_abiertas.
--  e) recalcular_remitos_en_espera() (interna, sin grant a authenticated).
--     Para no disparar el cierre automático por "remito sin líneas" mientras se
--     regeneran, los pedidos en espera pasan transitoriamente a 'solicitada'
--     (eso además libera sus reservas para que los candidatos no se descuenten
--     contra sí mismos). Todo en una transacción y bajo un advisory lock.
--  f) evaluar_reglas_reposicion_central() (cron 15): recalcula los en espera cuando
--     toca según frecuencia_minutos y crea un pedido solo si abiertos < máximo.
--  g) RPC marcar_armado_iniciado(id), forzar_actualizacion_reposicion() (admin),
--     estado_pedidos_automaticos_abiertos() (depósito o admin).
--  h) configurar_reposicion_automatica(): 2 parámetros opcionales nuevos (null = no
--     cambia). estado_reposicion_automatica(): devuelve además el máximo, el
--     recálculo, los abiertos y su lista.
--
-- Idempotente. Con la regla pausada (estado actual) no cambia nada visible: el
-- evaluador solo mira reglas activas y no se crea ni se recalcula nada.
-- Pedidos manuales: no cuentan para el tope, no se recalculan y siguen igual.
-- Rollback del tope: update public.reglas_reposicion_central set maximo_ordenes_abiertas = 10;
-- Rollback del recálculo: update public.reglas_reposicion_central set recalcular_en_espera = false;
-- ============================================================

-- a) Reglas ---------------------------------------------------------------------
alter table public.reglas_reposicion_central
  add column if not exists maximo_ordenes_abiertas integer not null default 2,
  add column if not exists recalcular_en_espera boolean not null default true;

do $b$ begin
  if not exists (select 1 from pg_constraint where conname = 'reglas_reposicion_central_maximo_ordenes_abiertas_check') then
    alter table public.reglas_reposicion_central
      add constraint reglas_reposicion_central_maximo_ordenes_abiertas_check
      check (maximo_ordenes_abiertas between 1 and 10);
  end if;
end $b$;

-- b) Solicitudes ----------------------------------------------------------------
alter table public.solicitudes_reposicion
  add column if not exists armado_iniciado_en timestamptz,
  add column if not exists recalculado_en timestamptz;

-- Helper: cuántos pedidos automáticos hay abiertos (única definición) ---------------
create or replace function public.reposicion_central_cantidad_abiertos()
returns integer
language sql
stable
security definer
set search_path = public
as $function$
  select count(*)::integer
  from public.solicitudes_reposicion s
  where s.generada_por = 'regla_automatica'
    and s.deposito_origen_id = 157
    and s.deposito_destino_id = 155
    and s.estado in ('solicitada', 'en_preparacion');
$function$;
revoke all on function public.reposicion_central_cantidad_abiertos() from public, anon, authenticated;

-- c) Inserta las líneas de un remito (mismo criterio de siempre) ---------------------
create or replace function public.armar_lineas_remito_central(p_solicitud_id bigint)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_max int;
  v_n int;
begin
  select coalesce((select r.maximo_lineas from public.reglas_reposicion_central r order by r.id limit 1), 30)
    into v_max;

  insert into public.solicitudes_reposicion_lineas
    (solicitud_id, sku, mate_nombre, cantidad_solicitada, estado_linea)
  select p_solicitud_id, c.sku, c.mate_nombre, c.cantidad_neta, 'reservada'
  from public.reposicion_central_candidatos() c
  order by c.orden_prioridad asc, c.sku asc
  limit v_max;

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;
revoke all on function public.armar_lineas_remito_central(bigint) from public, anon, authenticated;

-- d) Armado del remito con tope de pedidos abiertos ---------------------------------
create or replace function public.generar_remito_reposicion_central(p_solicitud_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_solicitud record;
  v_restantes int;
  v_regla record;
begin
  -- 18/11/2026: serializa con el recálculo y con el evaluador (reentrante en la transacción).
  perform pg_advisory_xact_lock(hashtext('reposicion_central_remitos'));

  select * into v_solicitud
  from public.solicitudes_reposicion
  where id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud % no existe', p_solicitud_id;
  end if;

  if v_solicitud.estado <> 'solicitada' then
    raise exception 'La solicitud % no está en estado "solicitada" (actual: %)', p_solicitud_id, v_solicitud.estado;
  end if;

  if v_solicitud.deposito_origen_id <> 157 or v_solicitud.deposito_destino_id <> 155 then
    raise exception 'Esta función solo aplica al circuito principal Central(157)->Local(155). Para el circuito inverso usar crear_remito_reposicion_manual().';
  end if;

  perform public.armar_lineas_remito_central(p_solicitud_id);

  update public.solicitudes_reposicion
     set estado = 'en_preparacion',
         procesada_en = now(),
         remito_numero = coalesce(remito_numero, 'REP-' || to_char(now(), 'YYYY') || '-' || lpad(p_solicitud_id::text, 4, '0'))
   where id = p_solicitud_id;

  -- ¿Quedó déficit sin entrar en este remito (más artículos que el máximo)?
  select count(*) into v_restantes from public.reposicion_central_candidatos();

  select * into v_regla from public.reglas_reposicion_central order by id limit 1;

  -- 18/11/2026: el pedido siguiente solo se arma si la reposición automática está
  -- activa Y hay lugar: pedidos automáticos abiertos (contando este) < máximo.
  if v_restantes > 0
     and coalesce(v_regla.activa, false)
     and public.reposicion_central_cantidad_abiertos() < coalesce(v_regla.maximo_ordenes_abiertas, 2) then
    insert into public.solicitudes_reposicion (deposito_origen_id, deposito_destino_id, estado, generada_por)
    values (157, 155, 'solicitada', 'regla_automatica');
  end if;

  return p_solicitud_id;
end;
$function$;

-- e) Recálculo de los remitos en espera (interna) -----------------------------------
create or replace function public.recalcular_remitos_en_espera()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_ids bigint[];
  v_id bigint;
  v_n integer;
  v_recalculados integer := 0;
  v_anulados integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('reposicion_central_remitos'));

  -- En espera: automático, abierto, en preparación, sin armado iniciado y sin líneas declaradas.
  select coalesce(array_agg(x.id order by x.id), '{}') into v_ids
  from (
    select s.id
    from public.solicitudes_reposicion s
    where s.generada_por = 'regla_automatica'
      and s.deposito_origen_id = 157
      and s.deposito_destino_id = 155
      and s.estado = 'en_preparacion'
      and s.armado_iniciado_en is null
      and not exists (
        select 1 from public.solicitudes_reposicion_lineas l
        where l.solicitud_id = s.id and l.estado_linea <> 'reservada'
      )
    order by s.id
    for update of s
  ) x;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('en_espera', 0, 'recalculados', 0, 'anulados', 0);
  end if;

  -- Bloquea las líneas y reconfirma que ninguna se declaró mientras esperábamos el lock.
  perform 1 from public.solicitudes_reposicion_lineas l where l.solicitud_id = any (v_ids) for update;
  select coalesce(array_agg(i order by i), '{}') into v_ids
  from unnest(v_ids) i
  where not exists (
    select 1 from public.solicitudes_reposicion_lineas l
    where l.solicitud_id = i and l.estado_linea <> 'reservada'
  );

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('en_espera', 0, 'recalculados', 0, 'anulados', 0);
  end if;

  -- Fase 1: todos pasan a 'solicitada' (libera sus reservas y evita el cierre por "sin líneas")
  -- y se vacían. Fase 2: del más viejo al más nuevo se vuelven a armar con el stock de hoy.
  update public.solicitudes_reposicion set estado = 'solicitada' where id = any (v_ids);
  delete from public.solicitudes_reposicion_lineas where solicitud_id = any (v_ids) and estado_linea = 'reservada';

  foreach v_id in array v_ids loop
    v_n := public.armar_lineas_remito_central(v_id);
    if v_n = 0 then
      update public.solicitudes_reposicion
         set estado = 'anulada', cerrada_en = now(), recalculado_en = now()
       where id = v_id;
      v_anulados := v_anulados + 1;
    else
      update public.solicitudes_reposicion
         set estado = 'en_preparacion', recalculado_en = now()
       where id = v_id;
      v_recalculados := v_recalculados + 1;
    end if;
  end loop;

  return jsonb_build_object('en_espera', cardinality(v_ids), 'recalculados', v_recalculados, 'anulados', v_anulados);
end;
$function$;
revoke all on function public.recalcular_remitos_en_espera() from public, anon, authenticated;

-- f) Evaluador periódico (cron 15) ---------------------------------------------------
create or replace function public.evaluar_reglas_reposicion_central()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_ultima timestamptz;
  v_ultimo_ciclo timestamptz;
  v_hay_para_mandar boolean;
begin
  perform pg_advisory_xact_lock(hashtext('reposicion_central_remitos'));

  for r in select * from reglas_reposicion_central where activa = true loop

    -- 1) Recalcular los en espera, solo cuando toca según la frecuencia (para no
    --    cambiarle la lista a Central cada 15 minutos).
    if r.recalcular_en_espera then
      select greatest(max(s.creada_en), max(s.recalculado_en)) into v_ultimo_ciclo
      from solicitudes_reposicion s
      where s.generada_por = 'regla_automatica'
        and s.deposito_origen_id = 157
        and s.deposito_destino_id = 155;

      if v_ultimo_ciclo is null
         or v_ultimo_ciclo <= now() - (r.frecuencia_minutos || ' minutes')::interval then
        perform public.recalcular_remitos_en_espera();
      end if;
    end if;

    -- 2) Crear un pedido nuevo: solo si hay lugar, se cumple la frecuencia y hay candidatos.
    if public.reposicion_central_cantidad_abiertos() >= r.maximo_ordenes_abiertas then
      continue;
    end if;

    select max(creada_en) into v_ultima
    from solicitudes_reposicion
    where regla_id = r.id and generada_por = 'regla_automatica';

    if v_ultima is not null
       and v_ultima > now() - (r.frecuencia_minutos || ' minutes')::interval then
      continue;
    end if;

    select exists (
      select 1 from public.reposicion_central_candidatos() c
      where c.cantidad_neta >= r.umbral_deficit
    ) into v_hay_para_mandar;

    if v_hay_para_mandar then
      perform crear_solicitud_reposicion(157, 155, 'regla_automatica', r.id);
    end if;

  end loop;
end;
$function$;

-- g) RPC: Central empezó a armar el remito (lo imprimió) ----------------------------
create or replace function public.marcar_armado_iniciado(p_solicitud_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_origen integer;
begin
  select deposito_origen_id into v_origen from public.solicitudes_reposicion where id = p_solicitud_id;
  if not found then
    raise exception 'Solicitud % no existe', p_solicitud_id;
  end if;
  if auth.uid() is not null and not (public.es_admin() or v_origen in (select public.mis_depositos())) then
    raise exception 'Solo el depósito de origen o un admin puede marcar el armado de la solicitud %', p_solicitud_id;
  end if;

  -- Toma el mismo lock que el recálculo: si está recalculando, espera y recién después queda marcado.
  perform pg_advisory_xact_lock(hashtext('reposicion_central_remitos'));

  update public.solicitudes_reposicion
     set armado_iniciado_en = coalesce(armado_iniciado_en, now())
   where id = p_solicitud_id
     and estado in ('solicitada', 'en_preparacion');
end;
$function$;

-- RPC admin: forzar la actualización (botón "Recalcular remitos") ------------------
create or replace function public.forzar_actualizacion_reposicion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  r public.reglas_reposicion_central;
  v_rec jsonb;
  v_max_id_antes bigint;
  v_creados integer;
  v_vueltas integer := 0;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede forzar la actualización de la reposición automática';
  end if;

  perform pg_advisory_xact_lock(hashtext('reposicion_central_remitos'));

  select * into r from public.reglas_reposicion_central order by id limit 1;
  select coalesce(max(id), 0) into v_max_id_antes from public.solicitudes_reposicion;

  v_rec := public.recalcular_remitos_en_espera();

  -- Con la regla activa y lugar disponible crea los pedidos que falten, ignorando la frecuencia.
  if r.id is not null and r.activa then
    while v_vueltas < 10
      and public.reposicion_central_cantidad_abiertos() < r.maximo_ordenes_abiertas
      and exists (select 1 from public.reposicion_central_candidatos() c where c.cantidad_neta >= r.umbral_deficit)
    loop
      perform public.crear_solicitud_reposicion(157, 155, 'regla_automatica', r.id);
      v_vueltas := v_vueltas + 1;
    end loop;
  end if;

  select count(*)::integer into v_creados
  from public.solicitudes_reposicion s
  where s.id > v_max_id_antes
    and s.generada_por = 'regla_automatica'
    and s.deposito_origen_id = 157
    and s.deposito_destino_id = 155;

  return jsonb_build_object(
    'recalculados', coalesce((v_rec ->> 'recalculados')::integer, 0),
    'anulados', coalesce((v_rec ->> 'anulados')::integer, 0),
    'creados', v_creados,
    'abiertos', public.reposicion_central_cantidad_abiertos(),
    'maximo', coalesce(r.maximo_ordenes_abiertas, 2),
    'activa', coalesce(r.activa, false)
  );
end;
$function$;

-- RPC lectura: ¿el automático está frenado por el tope? (depósito o admin) ----------
create or replace function public.estado_pedidos_automaticos_abiertos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  r public.reglas_reposicion_central;
  v_abiertos integer;
  v_max integer;
begin
  if auth.uid() is not null
     and not (public.es_admin() or exists (select 1 from public.mis_depositos())) then
    raise exception 'Solo cuentas de depósito o un administrador pueden ver este estado';
  end if;

  select * into r from public.reglas_reposicion_central order by id limit 1;
  v_abiertos := public.reposicion_central_cantidad_abiertos();
  v_max := coalesce(r.maximo_ordenes_abiertas, 2);

  return jsonb_build_object(
    'abiertos', v_abiertos,
    'maximo', v_max,
    'frenado', v_abiertos >= v_max,
    'activa', coalesce(r.activa, false)
  );
end;
$function$;

-- h) Configuración: firma nueva con 2 parámetros opcionales al final -----------------
drop function if exists public.configurar_reposicion_automatica(boolean, integer, integer, numeric);

create or replace function public.configurar_reposicion_automatica(
  p_activa boolean,
  p_frecuencia_minutos integer,
  p_maximo_lineas integer,
  p_umbral_deficit numeric,
  p_maximo_ordenes_abiertas integer default null,
  p_recalcular_en_espera boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id bigint;
  v_fila public.reglas_reposicion_central;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede configurar la reposición automática';
  end if;
  if p_activa is null then
    raise exception 'Falta indicar si la reposición automática queda activada o pausada';
  end if;
  if p_frecuencia_minutos is null or p_frecuencia_minutos < 60 or p_frecuencia_minutos > 1440 then
    raise exception 'La frecuencia tiene que estar entre 60 y 1440 minutos (1 a 24 horas)';
  end if;
  if p_maximo_lineas is null or p_maximo_lineas < 1 or p_maximo_lineas > 100 then
    raise exception 'El máximo de artículos por remito tiene que estar entre 1 y 100';
  end if;
  if p_umbral_deficit is null or p_umbral_deficit < 0 then
    raise exception 'El umbral no puede ser negativo';
  end if;
  if p_maximo_ordenes_abiertas is not null and (p_maximo_ordenes_abiertas < 1 or p_maximo_ordenes_abiertas > 10) then
    raise exception 'El máximo de pedidos abiertos a la vez tiene que estar entre 1 y 10';
  end if;

  select id into v_id from public.reglas_reposicion_central order by id limit 1;

  if v_id is null then
    insert into public.reglas_reposicion_central
      (activa, frecuencia_minutos, maximo_lineas, umbral_deficit, excluir_sin_stock,
       maximo_ordenes_abiertas, recalcular_en_espera, actualizada_por, actualizada_en)
    values
      (p_activa, p_frecuencia_minutos, p_maximo_lineas, p_umbral_deficit, true,
       coalesce(p_maximo_ordenes_abiertas, 2), coalesce(p_recalcular_en_espera, true), auth.uid(), now())
    returning * into v_fila;
  else
    update public.reglas_reposicion_central
       set activa = p_activa,
           frecuencia_minutos = p_frecuencia_minutos,
           maximo_lineas = p_maximo_lineas,
           umbral_deficit = p_umbral_deficit,
           maximo_ordenes_abiertas = coalesce(p_maximo_ordenes_abiertas, maximo_ordenes_abiertas),
           recalcular_en_espera = coalesce(p_recalcular_en_espera, recalcular_en_espera),
           actualizada_por = auth.uid(),
           actualizada_en = now()
     where id = v_id
    returning * into v_fila;
  end if;

  return to_jsonb(v_fila);
end;
$function$;

create or replace function public.estado_reposicion_automatica(p_incluir_candidatos boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, cron
as $function$
declare
  r public.reglas_reposicion_central;
  v_cron boolean;
  v_ultimo jsonb;
  v_regla jsonb;
  v_candidatos jsonb := null;
  v_total int;
  v_abiertos jsonb;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede ver el estado de la reposición automática';
  end if;

  select * into r from public.reglas_reposicion_central order by id limit 1;

  if r.id is not null then
    v_regla := jsonb_build_object(
      'id', r.id,
      'activa', r.activa,
      'frecuencia_minutos', r.frecuencia_minutos,
      'maximo_lineas', r.maximo_lineas,
      'umbral_deficit', r.umbral_deficit,
      'maximo_ordenes_abiertas', r.maximo_ordenes_abiertas,
      'recalcular_en_espera', r.recalcular_en_espera,
      'actualizada_en', r.actualizada_en,
      'actualizada_por', r.actualizada_por,
      'actualizada_por_email', (select u.email from auth.users u where u.id = r.actualizada_por)
    );
  end if;

  select coalesce(bool_or(j.active), false) into v_cron
  from cron.job j where j.jobname = 'evaluar-reglas-reposicion-central';

  select jsonb_build_object(
           'id', s.id,
           'remito_numero', s.remito_numero,
           'creada_en', s.creada_en,
           'estado', s.estado)
    into v_ultimo
  from public.solicitudes_reposicion s
  where s.generada_por = 'regla_automatica'
  order by s.creada_en desc, s.id desc
  limit 1;

  -- Pedidos automáticos abiertos, con si están en espera (se actualizan solos) o ya en armado.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'remito_numero', s.remito_numero,
           'estado', s.estado,
           'en_espera', (s.estado = 'en_preparacion'
                         and s.armado_iniciado_en is null
                         and not exists (select 1 from public.solicitudes_reposicion_lineas l
                                         where l.solicitud_id = s.id and l.estado_linea <> 'reservada')),
           'recalculado_en', s.recalculado_en,
           'armado_iniciado_en', s.armado_iniciado_en,
           'lineas', (select count(*) from public.solicitudes_reposicion_lineas l where l.solicitud_id = s.id)
         ) order by s.id), '[]'::jsonb)
    into v_abiertos
  from public.solicitudes_reposicion s
  where s.generada_por = 'regla_automatica'
    and s.deposito_origen_id = 157
    and s.deposito_destino_id = 155
    and s.estado in ('solicitada', 'en_preparacion');

  -- Opcional (recorre el universo, es lo más caro): la pantalla lo pide aparte.
  if p_incluir_candidatos then
    select count(*) into v_total from public.reposicion_central_candidatos();
    v_candidatos := jsonb_build_object(
      'total', v_total,
      'primer_remito', least(v_total, coalesce(r.maximo_lineas, 30))
    );
  end if;

  return jsonb_build_object(
    'regla', v_regla,
    'cron_activo', v_cron,
    'ultimo_pedido_automatico', v_ultimo,
    'maximo_ordenes_abiertas', coalesce(r.maximo_ordenes_abiertas, 2),
    'recalcular_en_espera', coalesce(r.recalcular_en_espera, true),
    'abiertos_ahora', jsonb_array_length(v_abiertos),
    'pedidos_abiertos', v_abiertos,
    'candidatos', v_candidatos
  );
end;
$function$;

-- Permisos -------------------------------------------------------------------------
revoke all on function public.configurar_reposicion_automatica(boolean, integer, integer, numeric, integer, boolean) from public, anon;
grant execute on function public.configurar_reposicion_automatica(boolean, integer, integer, numeric, integer, boolean) to authenticated;
revoke all on function public.estado_reposicion_automatica(boolean) from public, anon;
grant execute on function public.estado_reposicion_automatica(boolean) to authenticated;
revoke all on function public.marcar_armado_iniciado(bigint) from public, anon;
grant execute on function public.marcar_armado_iniciado(bigint) to authenticated;
revoke all on function public.forzar_actualizacion_reposicion() from public, anon;
grant execute on function public.forzar_actualizacion_reposicion() to authenticated;
revoke all on function public.estado_pedidos_automaticos_abiertos() from public, anon;
grant execute on function public.estado_pedidos_automaticos_abiertos() to authenticated;

-- ============================================================
-- Verificación (solo lectura) — SQL Editor de Supabase, proyecto hsfudsnmooaesrzdwecg:
--
--   select r.activa, r.maximo_lineas, r.maximo_ordenes_abiertas, r.recalcular_en_espera,
--          public.reposicion_central_cantidad_abiertos() as abiertos_ahora,
--          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--            where n.nspname = 'public'
--              and p.proname in ('marcar_armado_iniciado','forzar_actualizacion_reposicion',
--                                'estado_pedidos_automaticos_abiertos','recalcular_remitos_en_espera',
--                                'armar_lineas_remito_central')) as funciones_nuevas,
--          (select count(*) from information_schema.columns
--            where table_schema = 'public' and table_name = 'solicitudes_reposicion'
--              and column_name in ('armado_iniciado_en','recalculado_en')) as columnas_nuevas
--   from public.reglas_reposicion_central r order by r.id limit 1;
--   -- Esperado: activa = false (no cambia), maximo_lineas = 30, maximo_ordenes_abiertas = 2,
--   --           recalcular_en_espera = true, abiertos_ahora = 0, funciones_nuevas = 5, columnas_nuevas = 2
-- ============================================================
