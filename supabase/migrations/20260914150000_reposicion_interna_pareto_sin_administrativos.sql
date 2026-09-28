-- ============================================================
-- 20260914150000_reposicion_interna_pareto_sin_administrativos.sql
-- ============================================================
-- Hallazgo (14/9/2026): el CTE "abc" suma TODOS los SKUs de "base"
-- (incluidos SKU 888 y similares, ya marcados prioridad_orden=8 /
-- "No considerados") para calcular participacion_acumulada. SKU 888
-- solo (venta_12_meses=13613, ~1.9% del total junto con SKU 887) se
-- ordena muy arriba en el ranking (order by venta_12_meses desc) y
-- "adelanta" el acumulado de todos los SKUs reales que vienen
-- despues, empujando su participacion_acumulada por encima de los
-- cortes 80%/95% antes de tiempo.
--
-- Medido en vivo: 22 SKUs reales cambian de clase si se excluyen del
-- calculo los SKUs administrativos/sin nombre (mismos que ya excluye
-- el CASE final via es_administrativo(sku) o mate_nombre vacio):
--   9  suben de B a A
--   13 suben de C a B
--   0  bajan de clase
-- Los 22 cambios van en la misma direccion: hoy estan SUBPRIORIZADOS
-- (les corresponde mas atencion de la que reciben hoy). No es
-- cosmetico.
--
-- No requiere decision de Aris: es una correccion tecnica del calculo
-- de Pareto para que sea consistente con un criterio que YA existe en
-- la funcion (es_administrativo/nombre vacio => fuera de la accion de
-- compra). Antes influian en la clasificacion de otros SKUs sin
-- aparecer ellos mismos en ninguna accion; ahora tampoco influyen.
--
-- QUE CAMBIA (unico cambio real, resto copia exacta de
-- 20260911180000_reposicion_interna_excluye_patricia.sql):
--   El CTE "abc": las dos sum(...) over (...) ahora usan
--   "case when es_administrativo(sku) or nombre vacio then 0 else
--   venta_12_meses end" en vez de venta_12_meses directo. El order by
--   (venta_12_meses desc) no cambia -- el orden de filas es el mismo,
--   solo cambia que valor se acumula.
--
-- QUE NO CAMBIA:
--   - prioridad_orden/prioridad_label: SKU 888 y similares siguen
--     cayendo en 8 ("No considerados") exactamente igual que hoy.
--   - Exclusion de Patricia Bazan, capeo de outliers a 3x mediana,
--     umbrales 80%/95%, el resto de la funcion: identico.
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
      sum(
        case
          when public.es_administrativo(b.sku) or b.mate_nombre is null or trim(b.mate_nombre) = ''
            then 0
          else b.venta_12_meses
        end
      ) over (order by b.venta_12_meses desc)
      / nullif(
          sum(
            case
              when public.es_administrativo(b.sku) or b.mate_nombre is null or trim(b.mate_nombre) = ''
                then 0
              else b.venta_12_meses
            end
          ) over (),
          0
        ) as participacion_acumulada
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
