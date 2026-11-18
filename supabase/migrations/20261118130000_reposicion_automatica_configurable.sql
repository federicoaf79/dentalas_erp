-- ============================================================
-- 20261118130000_reposicion_automatica_configurable.sql — 18/11/2026
-- ============================================================
-- Pedido de Aris (dueño, admin): "lo que más me interesa es activar el
-- automático". Hasta hoy la reposición automática Central→Local estaba
-- apagada desde el 23/10 porque se pausó el cron 15
-- (evaluar-reglas-reposicion-central, migración 20261023170000), y la
-- regla solo vivía en la tabla reglas_reposicion_central, sin pantalla.
--
-- Qué hace esta migración:
--  1) reglas_reposicion_central.maximo_lineas (default 30, 1..100): tope de
--     artículos por remito (antes era un "limit 30" fijo).
--  2) Función helper reposicion_central_candidatos(): UNA sola definición
--     de "qué entraría hoy al remito" (la usan el armado del remito, el
--     evaluador periódico y la pantalla). Criterio: lo que en el Local está
--     en o por debajo del punto de pedido de YiQi; cantidad = venta mensual
--     promedio del Local − stock del Local, con tope en el stock de Central,
--     neteado contra lo ya reservado; fuera lo marcado "no hay"
--     (alertas_suspendidas), las publicaciones de Mercado Libre (nombre con
--     '###'), los combos (nombre que empieza con 'combo') y los
--     discontinuados. Prioridad A sin stock → B → C → poca cobertura → resto.
--  3) generar_remito_reposicion_central(): usa el helper y maximo_lineas;
--     el pedido siguiente (si hay más del máximo) solo se arma si la regla
--     automática está activa.
--  4) evaluar_reglas_reposicion_central(): decide con el helper (si no hay
--     nada para mandar no crea solicitud vacía).
--  5) trigger_auto_preparar_central(): ahora solo genera el remito
--     (líneas 'reservada'); Central declara A MANO lo que envía, que es lo
--     que alimenta el control de diferencias.
--  6) RPC configurar_reposicion_automatica() y estado_reposicion_automatica()
--     (solo admin) para la tarjeta de la pantalla Reposición Central-Local.
--  7) estado_automatismos(): reposicion_central_activa = regla activa Y cron activo.
--  8) El cron 15 queda SIEMPRE activo; el interruptor es reglas_reposicion_central.activa.
--     Para que al reactivar el cron NO arranque solo: primero activa = false,
--     después se activa el cron. Aris la prende desde la pantalla.
--
-- Solo existe Central→Local. Local→Central automático NO existe y no se
-- construye: a Central la repone Compras.
--
-- Idempotente. Si se vuelve a correr después de que Aris activó la regla,
-- NO la pausa de nuevo (el paso 8 solo actúa mientras el cron sigue pausado).
-- Rollback del interruptor: update public.reglas_reposicion_central set activa = false;
-- ============================================================

-- 1) Tope de artículos por remito ------------------------------------------------
alter table public.reglas_reposicion_central
  add column if not exists maximo_lineas integer not null default 30;

do $b$ begin
  if not exists (select 1 from pg_constraint where conname = 'reglas_reposicion_central_maximo_lineas_check') then
    alter table public.reglas_reposicion_central
      add constraint reglas_reposicion_central_maximo_lineas_check check (maximo_lineas between 1 and 100);
  end if;
end $b$;

-- 2) Universo de candidatos (única definición) ----------------------------------
create or replace function public.reposicion_central_candidatos()
returns table (sku text, mate_nombre text, cantidad_neta numeric, orden_prioridad integer)
language sql
stable
security definer
set search_path = public, extensions
as $function$
  with abc as (
    -- Clasificación ABC real de Aris, reutilizada tal cual.
    select r.sku, r.clase_abc from public.reposicion_interna() r
  ),
  base as (
    select
      pel.sku,
      coalesce(st.mate_nombre, pel.mate_nombre) as mate_nombre,
      greatest(coalesce(st.stock_local, 0), 0) as stock_local,
      greatest(coalesce(st.stock_central, 0), 0) as stock_central,
      mat.mate_punto_de_pedido,
      pel.venta_mensual_prom as objetivo_local,
      coalesce(abc.clase_abc, 'C') as clase_abc
    from public.punto_equilibrio_local pel
    join public.stock_yiqi st on st.sku = pel.sku
    left join public.material_yiqi mat on mat.mate_codigo = pel.sku
    left join abc on abc.sku = pel.sku
    where pel.excluido = false
      -- 18/11/2026: fuera publicaciones de Mercado Libre, combos y discontinuados.
      and coalesce(mat.mate_nombre, st.mate_nombre, pel.mate_nombre, '') not like '%###%'
      and coalesce(mat.mate_nombre, st.mate_nombre, pel.mate_nombre, '') not ilike 'combo%'
      and coalesce(mat.mate_nombre, st.mate_nombre, pel.mate_nombre, '') not ilike '%discontinuad%'
  ),
  con_alerta as (
    select
      b.*,
      greatest(b.objetivo_local - b.stock_local, 0) as deficit_local,
      case when b.objetivo_local > 0 then b.stock_local / (b.objetivo_local / 30.0) else null end as cobertura_dias_local
    from base b
    where b.mate_punto_de_pedido is not null
      and b.stock_local <= b.mate_punto_de_pedido
  ),
  deficit as (
    select
      c.sku, c.mate_nombre,
      ceil(least(c.deficit_local, c.stock_central)) as mover_desde_central,
      case
        when c.stock_local = 0 and c.clase_abc = 'A' then 1
        when c.stock_local = 0 and c.clase_abc = 'B' then 2
        when c.stock_local = 0 then 3
        when c.stock_local > 0 and c.cobertura_dias_local < 7 then 4
        else 5
      end as orden_prioridad
    from con_alerta c
    where c.deficit_local > 0
  )
  select
    d.sku,
    d.mate_nombre,
    (d.mover_desde_central - coalesce(reservado.cantidad, 0))::numeric as cantidad_neta,
    d.orden_prioridad::integer
  from deficit d
  left join (
    select l.sku, sum(l.cantidad_solicitada) as cantidad
    from public.solicitudes_reposicion_lineas l
    join public.solicitudes_reposicion s on s.id = l.solicitud_id
    where s.estado = 'en_preparacion'
      and s.deposito_origen_id = 157
      and s.deposito_destino_id = 155
    group by l.sku
  ) reservado on reservado.sku = d.sku
  where d.mover_desde_central > 0
    and (d.mover_desde_central - coalesce(reservado.cantidad, 0)) > 0
    and not exists (
      select 1 from public.alertas_suspendidas al
      where al.sku = d.sku and al.reactivada_en is null
    );
$function$;

comment on function public.reposicion_central_candidatos() is
  'Reposición Central→Local (18/11/2026): artículos que entrarían hoy a un remito, con cantidad neta de lo ya reservado y prioridad 1-5. Única definición del universo; la usan generar_remito_reposicion_central, evaluar_reglas_reposicion_central y estado_reposicion_automatica. Excluye ### (Mercado Libre), combo%, discontinuados y lo marcado "no hay".';

revoke all on function public.reposicion_central_candidatos() from public, anon, authenticated;

-- 3) Armado del remito -----------------------------------------------------------
create or replace function public.generar_remito_reposicion_central(p_solicitud_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_solicitud record;
  v_restantes int;
  v_max int;
begin
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

  -- 18/11/2026: tope de artículos por remito configurable (antes "limit 30").
  select coalesce((select r.maximo_lineas from public.reglas_reposicion_central r order by r.id limit 1), 30)
    into v_max;

  insert into public.solicitudes_reposicion_lineas
    (solicitud_id, sku, mate_nombre, cantidad_solicitada, estado_linea)
  select p_solicitud_id, c.sku, c.mate_nombre, c.cantidad_neta, 'reservada'
  from public.reposicion_central_candidatos() c
  order by c.orden_prioridad asc, c.sku asc
  limit v_max;

  update public.solicitudes_reposicion
     set estado = 'en_preparacion',
         procesada_en = now(),
         remito_numero = coalesce(remito_numero, 'REP-' || to_char(now(), 'YYYY') || '-' || lpad(p_solicitud_id::text, 4, '0'))
   where id = p_solicitud_id;

  -- ¿Quedó déficit sin entrar en este remito (más artículos que el máximo)?
  -- Ahora las líneas recién creadas ya cuentan como reservadas, así que el
  -- helper devuelve solo lo que quedó afuera.
  select count(*) into v_restantes from public.reposicion_central_candidatos();

  -- 18/11/2026: el pedido siguiente solo se arma si la reposición automática
  -- está activada (con la regla pausada no se crea nada automático).
  if v_restantes > 0
     and exists (select 1 from public.reglas_reposicion_central r where r.activa) then
    insert into public.solicitudes_reposicion (deposito_origen_id, deposito_destino_id, estado, generada_por)
    values (157, 155, 'solicitada', 'regla_automatica');
  end if;

  return p_solicitud_id;
end;
$function$;

-- 4) Evaluador periódico (cron 15) ----------------------------------------------
create or replace function public.evaluar_reglas_reposicion_central()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_ultima timestamptz;
  v_ya_pendiente boolean;
  v_hay_para_mandar boolean;
begin
  for r in select * from reglas_reposicion_central where activa = true loop

    select max(creada_en) into v_ultima
    from solicitudes_reposicion
    where regla_id = r.id and generada_por = 'regla_automatica';

    if v_ultima is not null
       and v_ultima > now() - (r.frecuencia_minutos || ' minutes')::interval then
      continue;
    end if;

    select exists (
      select 1 from solicitudes_reposicion
      where deposito_origen_id = 157
        and deposito_destino_id = 155
        and estado in ('solicitada', 'en_preparacion')
    ) into v_ya_pendiente;

    if v_ya_pendiente then
      continue;
    end if;

    -- 18/11/2026: mismo universo que el remito (helper). Si no hay nada para
    -- mandar (o Central no tiene stock) no se crea una solicitud vacía.
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

-- 5) Central declara A MANO lo que envía -----------------------------------------
create or replace function public.trigger_auto_preparar_central()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 18/11/2026: solo genera el remito (líneas 'reservada', en_preparacion).
  -- Ya NO declara: Central declara a mano lo que envía.
  if new.deposito_origen_id = 157 and new.estado = 'solicitada' then
    perform public.generar_remito_reposicion_central(new.id);
  end if;
  return new;
end;
$$;

-- 6) RPC de configuración y estado (solo admin) ----------------------------------
create or replace function public.configurar_reposicion_automatica(
  p_activa boolean,
  p_frecuencia_minutos integer,
  p_maximo_lineas integer,
  p_umbral_deficit numeric
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

  select id into v_id from public.reglas_reposicion_central order by id limit 1;

  if v_id is null then
    insert into public.reglas_reposicion_central
      (activa, frecuencia_minutos, maximo_lineas, umbral_deficit, excluir_sin_stock, actualizada_por, actualizada_en)
    values
      (p_activa, p_frecuencia_minutos, p_maximo_lineas, p_umbral_deficit, true, auth.uid(), now())
    returning * into v_fila;
  else
    update public.reglas_reposicion_central
       set activa = p_activa,
           frecuencia_minutos = p_frecuencia_minutos,
           maximo_lineas = p_maximo_lineas,
           umbral_deficit = p_umbral_deficit,
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
  order by s.creada_en desc
  limit 1;

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
    'candidatos', v_candidatos
  );
end;
$function$;

revoke all on function public.configurar_reposicion_automatica(boolean, integer, integer, numeric) from public, anon;
grant execute on function public.configurar_reposicion_automatica(boolean, integer, integer, numeric) to authenticated;
revoke all on function public.estado_reposicion_automatica(boolean) from public, anon;
grant execute on function public.estado_reposicion_automatica(boolean) to authenticated;

-- 7) estado_automatismos: regla activa Y cron activo (misma forma del jsonb) ----
create or replace function public.estado_automatismos()
returns jsonb
language sql
stable
security definer
set search_path = public, cron
as $function$
  select jsonb_build_object(
    'reposicion_central_activa',
      coalesce((select bool_or(r.activa) from public.reglas_reposicion_central r), false)
      and coalesce((select bool_or(j.active) from cron.job j where j.jobname = 'evaluar-reglas-reposicion-central'), false),
    'reposicion_interna_activa',
      coalesce((select bool_or(j.active) from cron.job j where j.jobname = 'generar-reposicion-interna-diario'), false)
  );
$function$;

revoke all on function public.estado_automatismos() from public, anon;
grant execute on function public.estado_automatismos() to authenticated;

-- 8) Cron 15 siempre activo; el interruptor es la regla ---------------------------
-- PRIMERO se pausa la regla (solo si el cron sigue pausado, o sea la primera vez),
-- DESPUÉS se activa el cron: así no arranca solo. Aris la prende desde la pantalla.
update public.reglas_reposicion_central
   set activa = false,
       actualizada_en = now()
 where activa = true
   and exists (select 1 from cron.job j where j.jobname = 'evaluar-reglas-reposicion-central' and j.active = false);

select cron.alter_job(j.jobid, active := true)
from cron.job j
where j.jobname = 'evaluar-reglas-reposicion-central'
  and j.active = false;

-- ============================================================
-- Verificación (solo lectura) — SQL Editor de Supabase, proyecto hsfudsnmooaesrzdwecg:
--
--   select r.activa, r.frecuencia_minutos, r.maximo_lineas, r.umbral_deficit,
--          (select j.active from cron.job j where j.jobname = 'evaluar-reglas-reposicion-central') as cron_activo,
--          (select count(*) from public.reposicion_central_candidatos()) as candidatos_hoy,
--          public.estado_automatismos() as automatismos
--   from public.reglas_reposicion_central r order by r.id limit 1;
--   -- Esperado: activa = false, maximo_lineas = 30, cron_activo = true,
--   --           candidatos_hoy = N (sin ### ni combos ni discontinuados),
--   --           automatismos = {"reposicion_central_activa": false, "reposicion_interna_activa": false}
--
--   select pg_get_functiondef('public.trigger_auto_preparar_central()'::regprocedure) not ilike '%generar_y_declarar%' as trigger_ya_no_declara;
--   -- Esperado: true
-- ============================================================
