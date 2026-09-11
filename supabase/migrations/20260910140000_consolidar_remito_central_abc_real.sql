-- ============================================================
-- 20260910140000_consolidar_remito_central_abc_real.sql
-- ============================================================
-- Corrige la migración anterior (20260910130000). Federico, 10/9:
-- "Nunca pedimos sacar ese nivel de prioridad. es algo que definió
-- Aris, y el se maneja de esa manera y lo entiende así."
--
-- La versión anterior aproximaba prioridad con stock_local<=0 +
-- cobertura, inventando un criterio nuevo. Esto lo reemplaza: usa la
-- clasificación ABC REAL que ya existe y ya usa Aris, calculada
-- adentro de reposicion_interna() (Pareto sobre venta de 18 meses —
-- ver migración 20260910150000 —: 80% acumulado = A, hasta 95% = B,
-- resto = C) — no se reimplementa el cálculo, se reutiliza esa misma
-- función (STABLE, sin efectos secundarios) solo para traer
-- sku + clase_abc.
--
-- El orden de prioridad dentro del remito queda igual a los niveles
-- 1-5 de reposicion_interna() (los únicos que aplican a este circuito
-- — stock disponible en Central; el nivel 6, "Artículos a pedir" sin
-- stock en Central, ya queda afuera solo porque mover_desde_central
-- da 0 en ese caso):
--   1 = Quiebre total (stock Local = 0) + clase A
--   2 = Quiebre total + clase B
--   3 = Quiebre total + clase C / sin clasificar
--   4 = Con stock, cobertura < 7 días (riesgo alto)
--   5 = Resto con déficit (completar cobertura)
--
-- Todo lo demás (neteo contra reservas, tope de 30, exclusión de
-- alertas_suspendidas, encadenado de remitos si sobra) queda igual
-- que en la migración anterior.
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

  with abc as (
    -- Clasificación real de Aris, reutilizada tal cual — no se recalcula acá.
    select sku, clase_abc from public.reposicion_interna()
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
      sku, mate_nombre,
      ceil(least(deficit_local, stock_central)) as mover_desde_central,
      -- Mismos 5 niveles de reposicion_interna() (1-5, los que aplican
      -- acá — ver comentario de arriba).
      case
        when stock_local = 0 and clase_abc = 'A' then 1
        when stock_local = 0 and clase_abc = 'B' then 2
        when stock_local = 0 then 3
        when stock_local > 0 and cobertura_dias_local < 7 then 4
        else 5
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
  with abc as (
    select sku, clase_abc from public.reposicion_interna()
  ),
  base as (
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
