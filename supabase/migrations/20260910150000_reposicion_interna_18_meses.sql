-- ============================================================
-- 20260910150000_reposicion_interna_18_meses.sql
-- ============================================================
-- Federico, 10/9/2026: "lo unico, que en ves de venta de 12 mese,
-- cambiarlo a 18 meses." — sobre la clasificación ABC que trae
-- reposicion_interna() (la que ahora reutiliza generar_remito_
-- reposicion_central() para priorizar el remito, migración
-- 20260910140000).
--
-- Cambia SOLO la ventana de venta usada para el cálculo de Pareto/ABC
-- dentro de reposicion_interna(): de 12 a 18 meses. Se pega el cuerpo
-- completo tal cual está hoy en producción (traído con
-- pg_get_functiondef el 10/9) y se tocan únicamente 2 números:
--   1. El filtro de ventas_mensual_yiqi: interval '12 months' -> '18 months'
--   2. El divisor del promedio mensual: venta / 12.0 -> venta / 18.0
--      (para que "promedio mensual" siga siendo venta_total / meses
--      considerados, ahora 18)
--
-- NO se toca:
--   - El nombre de las columnas (sku, ..., venta_12_meses, clase_abc,
--     ...) ni el RETURNS TABLE — se deja "venta_12_meses" como nombre
--     de columna aunque ahora sume 18 meses, para no romper nada que
--     referencie ese nombre (ej. la página vieja ReposicionInterna.jsx,
--     ya desenrutada pero todavía en el repo). El significado real
--     queda documentado acá.
--   - Los umbrales de corte del Pareto (80% / 95%) ni los 9 niveles de
--     prioridad — nada de eso cambia, solo la ventana de venta que
--     alimenta el cálculo.
--   - punto_equilibrio_local (objetivo_local / cobertura del local) —
--     eso es una tabla y un cálculo aparte, ya identificado para pasar
--     a 18 meses en un cambio futuro más amplio (junto con
--     rotacionPorSku.js), pero no es lo que Federico pidió acá.
-- ============================================================

create or replace function public.reposicion_interna()
 returns table(sku text, mate_nombre text, proveedor text, proveedor_codigo text, stock_local numeric, stock_central numeric, promedio_mensual numeric, venta_12_meses numeric, clase_abc text, objetivo_local numeric, deficit_local numeric, mover_desde_central numeric, faltante_a_pedir numeric, cobertura_dias_local numeric, prioridad_orden integer, prioridad_label text)
 language sql
 stable
as $function$
  with prom as (
    select
      coalesce(ca.codigo_componente, v.mate_codigo) as mate_codigo,
      sum(v.cantidad * coalesce(ca.cantidad, 1)) as venta_12_meses
    from public.ventas_mensual_yiqi v
    left join public.composicion_articulos ca
      on ca.codigo_padre = v.mate_codigo
    where v.periodo >= (date_trunc('month', current_date) - interval '18 months')::date
      and v.periodo <  date_trunc('month', current_date)::date
      and (ca.codigo_padre is null or ca.cantidad is not null)
    group by coalesce(ca.codigo_componente, v.mate_codigo)
  ),
  base as (
    select
      m.mate_codigo as sku,
      m.mate_nombre,
      m.clie_nombre as proveedor,
      m.clie_codigo as proveedor_codigo,
      coalesce(s.stock_local, 0) as stock_local,
      coalesce(s.stock_central, 0) as stock_central,
      coalesce(p.venta_12_meses, 0) as venta_12_meses,
      coalesce(p.venta_12_meses, 0) / 18.0 as promedio_mensual,
      public.es_comprable(m.mate_nombre, m.clie_nombre) as comprable
    from public.material_yiqi m
    left join public.stock_yiqi s on s.sku = m.mate_codigo
    left join prom p on p.mate_codigo = m.mate_codigo
  ),
  abc as (
    select b.*,
      sum(b.venta_12_meses) over (order by b.venta_12_meses desc)
        / nullif(sum(b.venta_12_meses) over (), 0) as participacion_acumulada
    from base b
  ),
  clasificado as (
    select a.*,
      case
        when a.venta_12_meses <= 0 then 'C'
        when a.participacion_acumulada <= 0.80 then 'A'
        when a.participacion_acumulada <= 0.95 then 'B'
        else 'C'
      end as clase_abc
    from abc a
  ),
  calculado as (
    select c.*,
      greatest(
        c.promedio_mensual,
        case when c.promedio_mensual = 0 and c.stock_central > 0 then 1 else 0 end
      ) as objetivo_local
    from clasificado c
  ),
  final as (
    select cal.*,
      (cal.objetivo_local - cal.stock_local) as deficit_local,
      least(greatest(cal.objetivo_local - cal.stock_local, 0), greatest(cal.stock_central, 0)) as mover_desde_central,
      greatest(
        (cal.objetivo_local - cal.stock_local)
          - least(greatest(cal.objetivo_local - cal.stock_local, 0), greatest(cal.stock_central, 0)),
        0
      ) as faltante_a_pedir,
      case when cal.promedio_mensual > 0 then cal.stock_local / (cal.promedio_mensual / 30.0) else null end
        as cobertura_dias_local
    from calculado cal
  )
  select
    f.sku, f.mate_nombre, f.proveedor, f.proveedor_codigo, f.stock_local, f.stock_central,
    round(f.promedio_mensual, 1), f.venta_12_meses, f.clase_abc,
    f.objetivo_local, f.deficit_local, f.mover_desde_central, f.faltante_a_pedir,
    round(f.cobertura_dias_local, 1),
    case
      when public.es_administrativo(f.sku) or f.mate_nombre is null or trim(f.mate_nombre) = '' then 8
      when not f.comprable or public.es_para_fraccionar(f.mate_nombre) then 7
      when f.stock_central <= 0 and f.deficit_local > 0 then 6
      when f.stock_local = 0 and f.stock_central > 0 and f.clase_abc = 'A' then 1
      when f.stock_local = 0 and f.stock_central > 0 and f.clase_abc = 'B' then 2
      when f.stock_local = 0 and f.stock_central > 0 then 3
      when f.stock_local > 0 and f.cobertura_dias_local < 7 then 4
      when f.deficit_local > 0 then 5
      else 9
    end as prioridad_orden,
    case
      when public.es_administrativo(f.sku) or f.mate_nombre is null or trim(f.mate_nombre) = '' then 'No considerados'
      when not f.comprable or public.es_para_fraccionar(f.mate_nombre) then 'No enviar al local'
      when f.stock_central <= 0 and f.deficit_local > 0 then 'Artículos a pedir'
      when f.stock_local = 0 and f.stock_central > 0 and f.clase_abc = 'A' then 'Quiebre total A'
      when f.stock_local = 0 and f.stock_central > 0 and f.clase_abc = 'B' then 'Quiebre total B'
      when f.stock_local = 0 and f.stock_central > 0 then 'Quiebre total C / presencia mínima'
      when f.stock_local > 0 and f.cobertura_dias_local < 7 then 'Riesgo alto de quiebre'
      when f.deficit_local > 0 then 'Completar cobertura de 1 mes'
      else 'Sin necesidad'
    end as prioridad_label
  from final f
  order by prioridad_orden, f.venta_12_meses desc nulls last;
$function$;
