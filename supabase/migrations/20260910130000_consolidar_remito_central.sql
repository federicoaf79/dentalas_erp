-- ============================================================
-- 20260910130000_consolidar_remito_central.sql
-- ============================================================
-- Unificación Eje 1 — cambio 4 (consolidar remitos). Aris, feedback
-- 10/9/2026: "que se consoliden en 1 solo remito de hasta 20/30
-- artículos por remito. Siempre priorizar los quiebres A VS los B.
-- Si hay más de B o de C, generar un segundo remito o tercer remito."
--
-- Reemplaza generar_remito_reposicion_central() — leída completa
-- antes de tocarla (pegada por Federico el 10/9). Toda la lógica
-- existente se mantiene igual (neteo contra reservas en_preparacion,
-- exclusión de alertas_suspendidas, gate por punto de pedido, tope
-- contra stock_central real) — solo se agrega:
--
--   1. Un ORDEN de prioridad antes de insertar. ⚠️ SUPUESTO A
--      CONFIRMAR CON ARIS: punto_equilibrio_local no tiene
--      clasificación ABC (esa clasificación solo existe en el
--      circuito viejo, reposicion_interna()). Se aproxima "quiebre"
--      con stock_local <= 0 (máxima prioridad) y, dentro de eso,
--      menor cobertura (stock_local / objetivo_local) primero. Si
--      Aris quiere el ABC real, hay que sumarlo a punto_equilibrio_local
--      o a la consulta — no está hoy.
--   2. Un LIMIT 30 sobre esas líneas ordenadas — el remito que arma
--      esta solicitud nunca supera 30 artículos.
--   3. Si queda déficit sin entrar (más de 30 SKU en quiebre/riesgo),
--      se crea automáticamente una solicitud nueva ('solicitada',
--      mismo origen/destino) para el sobrante. Si el origen es
--      Central (157), el trigger trg_auto_preparar_central (migración
--      anterior) la procesa sola — así se encadena el 2do/3er remito
--      sin intervención manual, uno por vez, hasta que no quede
--      déficit. Se autolimita: cada pasada neta contra lo ya
--      reservado, así que el déficit restante baja siempre.
--
-- ⚠️ RIESGO A TENER EN CUENTA ANTES DE CONFIAR ESTO CON DATOS REALES:
-- con la migración anterior (trigger de Depósito Central) ya activa,
-- si hay mucho déficit acumulado (por ejemplo, la primera vez que
-- corre después de mucho tiempo), esto puede encadenar varias
-- solicitudes/remitos seguidos, cada una declarando "en tránsito"
-- sola. Es el comportamiento que pidió Aris, pero conviene probarlo
-- primero con el volumen real de hoy antes de dejarlo corriendo solo
-- (ver prueba sugerida al final).
-- ============================================================

create or replace function generar_remito_reposicion_central(p_solicitud_id bigint)
returns bigint
language plpgsql
security definer
as $function$
declare
  v_solicitud record;
  v_restantes int;
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

  with base as (
    select
      pel.sku,
      coalesce(st.mate_nombre, pel.mate_nombre) as mate_nombre,
      greatest(coalesce(st.stock_local, 0), 0) as stock_local,
      greatest(coalesce(st.stock_central, 0), 0) as stock_central,
      mat.mate_punto_de_pedido,
      pel.venta_mensual_prom as objetivo_local
    from public.punto_equilibrio_local pel
    join public.stock_yiqi st on st.sku = pel.sku
    left join public.material_yiqi mat on mat.mate_codigo = pel.sku
    where pel.excluido = false
  ),
  con_alerta as (
    select
      b.*,
      greatest(b.objetivo_local - b.stock_local, 0) as deficit_local
    from base b
    where b.mate_punto_de_pedido is not null
      and b.stock_local <= b.mate_punto_de_pedido
  ),
  deficit as (
    select
      sku, mate_nombre,
      ceil(least(deficit_local, stock_central)) as mover_desde_central,
      -- Ver nota arriba: aproximación de "quiebre primero" sin ABC real.
      case when stock_local <= 0 then 0
           else stock_local / nullif(objetivo_local, 0)
      end as orden_prioridad
    from con_alerta
    where deficit_local > 0
  ),
  neto as (
    select
      d.sku, d.mate_nombre, d.orden_prioridad,
      d.mover_desde_central - coalesce(reservado.cantidad, 0) as cantidad_neta
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
      )
  ),
  limitadas as (
    select * from neto
    order by orden_prioridad asc
    limit 30
  )
  insert into public.solicitudes_reposicion_lineas
    (solicitud_id, sku, mate_nombre, cantidad_solicitada, estado_linea)
  select p_solicitud_id, sku, mate_nombre, cantidad_neta, 'reservada'
  from limitadas;

  update public.solicitudes_reposicion
     set estado = 'en_preparacion',
         procesada_en = now(),
         remito_numero = coalesce(remito_numero, 'REP-' || to_char(now(), 'YYYY') || '-' || lpad(p_solicitud_id::text, 4, '0'))
   where id = p_solicitud_id;

  -- ¿Quedó déficit sin entrar en este remito (más de 30 artículos en
  -- quiebre/riesgo)? Si sí, se genera la solicitud siguiente sola.
  with base as (
    select
      pel.sku,
      greatest(coalesce(st.stock_local, 0), 0) as stock_local,
      greatest(coalesce(st.stock_central, 0), 0) as stock_central,
      mat.mate_punto_de_pedido,
      pel.venta_mensual_prom as objetivo_local
    from public.punto_equilibrio_local pel
    join public.stock_yiqi st on st.sku = pel.sku
    left join public.material_yiqi mat on mat.mate_codigo = pel.sku
    where pel.excluido = false
  ),
  con_alerta as (
    select b.*, greatest(b.objetivo_local - b.stock_local, 0) as deficit_local
    from base b
    where b.mate_punto_de_pedido is not null
      and b.stock_local <= b.mate_punto_de_pedido
  ),
  deficit as (
    select sku, ceil(least(deficit_local, stock_central)) as mover_desde_central
    from con_alerta
    where deficit_local > 0
  )
  select count(*) into v_restantes
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

  if v_restantes > 0 then
    insert into public.solicitudes_reposicion (deposito_origen_id, deposito_destino_id, estado, generada_por)
    values (157, 155, 'solicitada', 'regla_automatica');
  end if;

  return p_solicitud_id;
end;
$function$;

-- ============================================================
-- PRUEBA SUGERIDA — correr ANTES de confiar esto con volumen real:
--
--   insert into solicitudes_reposicion (deposito_origen_id, deposito_destino_id, estado, generada_por)
--   values (157, 155, 'solicitada', 'manual')
--   returning id;
--
-- Con el id que devuelva, mirar cuántas solicitudes se encadenaron y
-- cuántas líneas quedaron en cada una:
--
--   select s.id, s.remito_numero, s.estado, s.generada_por, count(l.id) as articulos
--   from solicitudes_reposicion s
--   left join solicitudes_reposicion_lineas l on l.solicitud_id = s.id
--   where s.deposito_origen_id = 157 and s.deposito_destino_id = 155
--     and s.creada_en > now() - interval '10 minutes'
--   group by s.id, s.remito_numero, s.estado, s.generada_por
--   order by s.id;
--
-- Esperado: cada fila con como máximo 30 artículos; si el déficit real
-- de hoy supera 30 SKU, va a aparecer más de una solicitud encadenada.
--
-- Si hace falta volver a la versión anterior (sin consolidar), correr
-- de nuevo el CREATE OR REPLACE con el cuerpo que pegó Federico el
-- 10/9 (sin el ORDER BY/LIMIT/encadenado) — está completo en
-- FEEDBACK_ARIS_10-9-2026.md / el historial de este chat.
-- ============================================================
