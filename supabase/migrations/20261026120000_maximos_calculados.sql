-- ============================================================
-- 20261026120000_maximos_calculados.sql — 26/10/2026
-- ============================================================
-- Decisión de Federico (26/10): opción A — la app calcula el máximo.
--
-- Ivana (26/10): no usa ningún máximo de YiQi. Lo calcula a mano con el
-- promedio de ventas de los últimos 3 meses, por lo general sin el mes en
-- curso (salvo picos), y lo anota en YiQi en "Uso mensual". Para los
-- fraccionados, la caja cerrada es el código sin "-F".
--
-- Cálculo (solo lectura, no cambia cantidad sugerida ni alertas):
--   - 3 meses cerrados (sin el mes en curso). Los meses sin venta cuentan 0
--     (SUM/3, no AVG: ventas_mensual_yiqi no tiene fila si no hubo venta).
--   - Ventas de fraccionados y combos sumadas al código que se compra con
--     el factor de composicion_articulos (mismo criterio que
--     sugerencias_compra). Un "-F" sin fila en composicion_articulos no se
--     suma: sin factor no hay cómo convertir.
--   - Ventas netas negativas (devoluciones) del mes se toman como 0.
--   - Máx = promedio redondeado hacia arriba al bulto de compra
--     (mate_cantidad_de_unidades) si está cargado; si no, al entero.
--   - "pico": el mes más alto es >= 3 u y supera el doble de la mediana de
--     los 3 meses. Solo se marca para revisar, no se ajusta.
--
-- Devuelve jsonb (un objeto por SKU) para esquivar el tope de 1.000 filas
-- de PostgREST. SECURITY INVOKER: respeta la RLS de ventas y material
-- (un operador ve solo sus proveedores, igual que en el resto de la app).
-- p_proveedor opcional: Nueva OC lo pide por proveedor; Alertas y Monitor,
-- todo el catálogo.
-- ============================================================

create or replace function public.maximos_calculados(p_proveedor text default null)
returns jsonb
language sql
stable
as $function$
  with meses as (
    select (date_trunc('month', current_date) - make_interval(months => n))::date as periodo
    from generate_series(1, 3) as n
  ),
  ventas as (
    select coalesce(ca.codigo_componente, v.mate_codigo) as sku,
           v.periodo,
           sum(v.cantidad * coalesce(ca.cantidad, 1)) as cant
    from public.ventas_mensual_yiqi v
    left join public.composicion_articulos ca on ca.codigo_padre = v.mate_codigo
    where v.periodo >= (date_trunc('month', current_date) - interval '3 months')::date
      and v.periodo <  date_trunc('month', current_date)::date
      and (ca.codigo_padre is null or ca.cantidad is not null)
    group by 1, 2
  ),
  grilla as (
    select s.sku, m.periodo, greatest(coalesce(v.cant, 0), 0)::numeric as cant
    from (select distinct sku from ventas) s
    cross join meses m
    left join ventas v on v.sku = s.sku and v.periodo = m.periodo
  ),
  agg as (
    select sku,
           sum(cant) / 3.0 as prom,
           max(cant) as mes_max,
           percentile_cont(0.5) within group (order by cant) as mediana,
           jsonb_object_agg(to_char(periodo, 'YYYY-MM'), round(cant, 2)) as meses
    from grilla
    group by sku
  )
  select coalesce(jsonb_object_agg(a.sku, jsonb_build_object(
           'max', case when coalesce(m.mate_cantidad_de_unidades, 0) > 0
                       then ceil(a.prom / m.mate_cantidad_de_unidades) * m.mate_cantidad_de_unidades
                       else ceil(a.prom) end,
           'prom', round(a.prom, 2),
           'bulto', nullif(coalesce(m.mate_cantidad_de_unidades, 0), 0),
           'pico', (a.mes_max >= 3 and a.mes_max > 2 * a.mediana),
           'meses', a.meses
         )), '{}'::jsonb)
  from agg a
  left join public.material_yiqi m on m.mate_codigo = a.sku
  where a.prom > 0
    and (p_proveedor is null or m.clie_nombre = p_proveedor);
$function$;

revoke execute on function public.maximos_calculados(text) from public, anon;
grant execute on function public.maximos_calculados(text) to authenticated;

-- Verificación (una fila): cantidad de SKU con máximo y un ejemplo.
select jsonb_build_object(
  'skus_con_maximo', (select count(*) from jsonb_object_keys(public.maximos_calculados())),
  'skus_con_pico', (select count(*) from jsonb_each(public.maximos_calculados()) e where (e.value->>'pico')::boolean),
  'ejemplo_1999_0_25', public.maximos_calculados() -> '1999-0.25',
  'ejemplo_megadental', (select jsonb_object_agg(k, v) from (select k, v from jsonb_each(public.maximos_calculados('MEGADENTAL')) as t(k, v) limit 3) x)
) as verificacion;
