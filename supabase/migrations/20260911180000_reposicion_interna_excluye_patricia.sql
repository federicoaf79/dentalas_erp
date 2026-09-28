-- ============================================================
-- 20260911180000_reposicion_interna_excluye_patricia.sql
-- ============================================================
-- Motivo (Federico, 11/9/2026, verbatim): "El vendedor lo necesitamos
-- para las reglas del punto de venta promedio mensual, porque la
-- persona de licitaciones, patricia es la que vende mucho volumen,
-- que usa todo el stock posible que haya entre todos los depositos, y
-- nos rompe el promedio ya que es un canal de ventas o unidad de
-- negocio diferente al local y a las ventas de los demas canales."
--
-- Decisiones confirmadas por Federico (AskUserQuestion, 11/9/2026):
--   - Alcance: excluir SOLO a Patricia Bazan por ahora (no Mercado
--     Libre ni Showroom).
--   - "Ventas esporadicas del local": no es un vendedor puntual, es
--     un umbral de pico anomalo por SKU/mes -> cap estadistico
--     (winsorizar), no filtro por persona.
--   - SKU 888 (placeholder de catalogo) y "Prioritario a domicilio"
--     (linea de flete, no es un SKU real) quedan APARTE, fuera de
--     esta migracion.
--
-- Validado en 2 pasos antes de este migration:
--   1. Simulacion manual con datos reales pegados a mano en el SQL
--      Editor (11/9/2026) -- confirmo que excluir a Patricia + capear
--      outliers a 3x la mediana por SKU baja el promedio de forma
--      consistente (ej. SKU 676: 56.4->0.8; SKU 6243: 65.1->7.9).
--   2. Repeticion del mismo query contra datos YA PERSISTIDOS (tras
--      sumar smartie 2369 a sync-yiqi, migracion
--      20260911170000_ventas_mensual_yiqi_vendedor.sql) -- mismos
--      SKUs arriba de la lista, mismos ordenes de magnitud. Datos
--      reales, no la migracion en si.
--
-- QUE CAMBIA (unico cambio real, todo lo demas es copia exacta del
-- cuerpo vigente segun 20260910150000_reposicion_interna_18_meses.sql):
--   La CTE "prom" ya no suma directo desde ventas_mensual_yiqi. Ahora
--   pasa por 3 CTEs nuevas ANTES de sumar:
--     1. ventas_ajustadas: por (mate_codigo crudo, periodo), resta la
--        cantidad que vendio Patricia Bazan de ese mismo SKU/mes
--        (tabla ventas_mensual_yiqi_vendedor, sync separado del
--        smartie 2369). Nunca negativo (greatest(..., 0)).
--     2. medianas: por SKU crudo, la mediana de sus meses con venta >
--        0 (ya sin Patricia), sobre la ventana de 18 meses.
--     3. ventas_capeadas: cualquier mes que supere 3x esa mediana se
--        corta (winsoriza) A la mediana, en vez de mantenerse como
--        esta o irse a 0 -- para no perder la señal de demanda real,
--        solo evitar que un pico puntual (licitacion o lo que sea)
--        domine el promedio. El 3x es un default ajustable, no una
--        regla fija -- revisar si con el uso real hace falta subirlo
--        o bajarlo.
--   La CTE "prom" resultante usa "ventas_capeadas" en vez de
--   "ventas_mensual_yiqi" directo, pero el join con
--   composicion_articulos y el group by quedan iguales.
--
-- QUE NO CAMBIA:
--   - El RETURNS TABLE, los nombres de columna (incluido
--     "venta_12_meses", que sigue significando 18 meses por el mismo
--     motivo documentado en la migracion anterior).
--   - Los umbrales de Pareto (80%/95%), los 9 niveles de prioridad,
--     el divisor /18.0.
--   - ventas_mensual_yiqi y su sync (smartie 2353) -- esta migracion
--     no los toca, solo LEE de ventas_mensual_yiqi_vendedor (tabla
--     nueva, sync separado, smartie 2369) ademas de la de siempre.
--   - SKU 888 y "Prioritario a domicilio" -- quedan con el mismo
--     comportamiento de hoy, a proposito (ver arriba).
-- ============================================================

create or replace function public.reposicion_interna()
 returns table(sku text, mate_nombre text, proveedor text, proveedor_codigo text, stock_local numeric, stock_central numeric, promedio_mensual numeric, venta_12_meses numeric, clase_abc text, objetivo_local numeric, deficit_local numeric, mover_desde_central numeric, faltante_a_pedir numeric, cobertura_dias_local numeric, prioridad_orden integer, prioridad_label text)
 language sql
 stable
as $function$
  with ventas_ajustadas as (
    select
      v.mate_codigo,
      v.periodo,
      greatest(v.cantidad - coalesce(pb.cantidad_patricia, 0), 0) as cantidad
    from public.ventas_mensual_yiqi v
    left join (
      select mate_codigo, periodo, sum(cantidad) as cantidad_patricia
      from public.ventas_mensual_yiqi_vendedor
      where vendedor = 'Patricia Bazan'
      group by mate_codigo, periodo
    ) pb on pb.mate_codigo = v.mate_codigo and pb.periodo = v.periodo
    where v.periodo >= (date_trunc('month', current_date) - interval '18 months')::date
      and v.periodo <  date_trunc('month', current_date)::date
  ),
  medianas as (
    select
      mate_codigo,
      percentile_cont(0.5) within group (order by cantidad) as mediana
    from ventas_ajustadas
    where cantidad > 0
    group by mate_codigo
  ),
  ventas_capeadas as (
    select
      va.mate_codigo,
      va.periodo,
      case
        when m.mediana is not null and va.cantidad > 3 * m.mediana
          then m.mediana::numeric
        else va.cantidad
      end as cantidad
    from ventas_ajustadas va
    left join medianas m on m.mate_codigo = va.mate_codigo
  ),
  prom as (
    select
      coalesce(ca.codigo_componente, vc.mate_codigo) as mate_codigo,
      sum(vc.cantidad * coalesce(ca.cantidad, 1)) as venta_12_meses
    from ventas_capeadas vc
    left join public.composicion_articulos ca
      on ca.codigo_padre = vc.mate_codigo
    where (ca.codigo_padre is null or ca.cantidad is not null)
    group by coalesce(ca.codigo_componente, vc.mate_codigo)
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
