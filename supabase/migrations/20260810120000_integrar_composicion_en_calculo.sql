-- ============================================================
-- Integrar composicion_articulos en sugerencias_compra() e
-- historial_ventas()
-- ============================================================
-- Contexto: composicion_articulos (20260810000000 +
-- 20260810000100) ya existe y tiene los 41 mapeos confirmados,
-- pero hasta ahora no la usaba nadie — el Predictor y Nueva OC
-- seguian calculando demanda agrupando por el codigo que aparece
-- en la venta (ej. "245-F", "251"), no por el codigo que
-- realmente hay que comprar (ej. "245", "251-BLA"..."251-VEA").
--
-- Esta migration reemplaza el cuerpo de las dos funciones que
-- hacen ese calculo (via CREATE OR REPLACE, misma firma, no
-- rompe los llamados desde el frontend). El resto de cada
-- funcion (topes, umbral, criticidad, formato de salida) queda
-- identico — el unico cambio real es como se agrupan las ventas
-- antes de calcular el promedio.
--
-- Regla de traduccion (igual en las dos funciones):
--   - Si el codigo vendido no tiene fila en composicion_articulos
--     como codigo_padre, se cuenta tal cual (multiplicador 1) —
--     el 99% de los articulos, sin cambio de comportamiento.
--   - Si tiene fila(s), se traduce a codigo_componente y se
--     multiplica la cantidad vendida por la proporcion. Un combo
--     con varios componentes (ej. "251" -> 7 colores) expande una
--     venta en varias lineas de demanda, una por componente.
--   - Las filas con cantidad NULL (ej. 244-F: "segun necesidad",
--     sin proporcion fija) se excluyen del calculo automatico, tal
--     como pidio Aris explicitamente — no deben inflar ni generar
--     demanda inventada.
-- ============================================================

-- ------------------------------------------------------------
-- 1) sugerencias_compra(p_proveedor)
--    Unico cambio: el CTE `prom` ahora traduce via
--    composicion_articulos antes de agrupar. `base`, `calc`,
--    `bruta` y `final` quedan exactamente igual que antes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sugerencias_compra(p_proveedor text)
 RETURNS TABLE(mate_codigo text, mate_nombre text, stock numeric, umbral numeric, promedio numeric, unidades_por_bulto numeric, costo_unitario numeric, cantidad_sugerida numeric, topeada boolean, nivel text)
 LANGUAGE sql
 STABLE
AS $function$
  with reglas as (
    select meses_cobertura, max_cajas_por_producto
    from public.reglas_compra where id = 1
  ),
  prom as (
    select
      coalesce(ca.codigo_componente, v.mate_codigo) as mate_codigo,
      sum(v.cantidad * coalesce(ca.cantidad, 1)) / 12.0 as promedio
    from public.ventas_mensual_yiqi v
    left join public.composicion_articulos ca
      on ca.codigo_padre = v.mate_codigo
    where v.periodo >= (date_trunc('month', current_date) - interval '12 months')::date
      and v.periodo <  date_trunc('month', current_date)::date
      and (ca.codigo_padre is null or ca.cantidad is not null)
    group by coalesce(ca.codigo_componente, v.mate_codigo)
  ),
  base as (
    select
      m.mate_codigo,
      m.mate_nombre,
      coalesce(m.mate_stock_disponible, 0) as stock,
      case when m.mate_punto_de_pedido > 0 then m.mate_punto_de_pedido
           else m.mate_stock_seguridad end as umbral,
      greatest(coalesce(p.promedio, 0), 0) as promedio,
      nullif(coalesce(m.mate_cantidad_de_unidades, 0), 0) as bulto,
      nullif(coalesce(m.mate_crm, 0), 0) as costo
    from public.material_yiqi m
    left join prom p on p.mate_codigo = m.mate_codigo
    where m.clie_nombre = p_proveedor
      and public.es_comprable(m.mate_nombre, m.clie_nombre)
  ),
  calc as (
    select b.*, r.max_cajas_por_producto,
           greatest(b.promedio * r.meses_cobertura, coalesce(b.umbral, 0)) - b.stock as faltante,
           (b.promedio <= 0 and coalesce(b.umbral, 0) <= 0) as sin_base
    from base b, reglas r
    where b.umbral is not null and b.stock <= b.umbral
  ),
  bruta as (
    select c.*,
           case when c.sin_base then null
                when c.faltante <= 0 then coalesce(c.bulto, 1)
                when c.bulto is not null then ceil(c.faltante / c.bulto) * c.bulto
                else ceil(c.faltante) end as sugerida_sin_tope
    from calc c
  ),
  final as (
    select b.*,
           case when b.sugerida_sin_tope is null then null
                when b.bulto is null then b.sugerida_sin_tope
                else least(b.sugerida_sin_tope, b.max_cajas_por_producto * b.bulto) end as sugerida_final
    from bruta b
  )
  select f.mate_codigo, f.mate_nombre, f.stock, f.umbral, round(f.promedio, 1),
         f.bulto, f.costo, f.sugerida_final,
         (f.sugerida_final is not null and f.sugerida_final < f.sugerida_sin_tope),
         case when f.stock <= 0 then 'critica' else 'preventiva' end
  from final f
  order by f.sin_base, (case when f.stock <= 0 then 0 else 1 end), f.promedio desc;
$function$;

-- ------------------------------------------------------------
-- 2) historial_ventas(p_meses)
--    Dos cambios:
--    a) `v` traduce via composicion_articulos, igual que en
--       sugerencias_compra.
--    b) CTE nuevo `v_mes`: pre-agrega por (codigo, mes) ANTES de
--       armar el jsonb. Sin este paso, si un mismo componente
--       recibe ventas directas + ventas traducidas en el mismo
--       mes (ej. "245" vendido suelto Y via "245-F" el mismo
--       mes), jsonb_object_agg pisaria una de las dos filas al
--       repetirse la clave del mes (se queda con la ultima que
--       procese, sin avisar) y `meses_con_venta` contaria de mas.
--       El `total` no se veia afectado (es un sum aparte), pero
--       el desglose mes a mes del Predictor si.
--    c) `proveedor` ahora sale de material_yiqi.clie_nombre (via
--       el join que ya existia para nombre/stock) en vez del
--       proveedor registrado en la venta original — decision
--       confirmada: para un codigo traducido (ej. un color del
--       combo 251) el proveedor real del componente puede no
--       coincidir con el proveedor de la venta de la publicacion.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.historial_ventas(p_meses integer DEFAULT 12)
 RETURNS TABLE(mate_codigo text, mate_nombre text, proveedor text, stock_actual numeric, meses jsonb, total numeric, promedio numeric, meses_con_venta integer)
 LANGUAGE sql
 STABLE
AS $function$
  with limites as (
    select date_trunc('month', current_date)::date as mes_actual,
           (date_trunc('month', current_date) - (p_meses || ' months')::interval)::date as desde
  ),
  v as (
    select
      coalesce(ca.codigo_componente, vm.mate_codigo) as mate_codigo,
      vm.periodo,
      vm.cantidad * coalesce(ca.cantidad, 1) as cantidad
    from public.ventas_mensual_yiqi vm
    cross join limites l
    left join public.composicion_articulos ca
      on ca.codigo_padre = vm.mate_codigo
    where vm.periodo >= l.desde
      and vm.periodo <  l.mes_actual   -- excluye el mes en curso: esta incompleto
      and (ca.codigo_padre is null or ca.cantidad is not null)
  ),
  v_mes as (
    select mate_codigo, periodo, sum(cantidad) as cantidad
    from v
    group by mate_codigo, periodo
  ),
  agg as (
    select vm.mate_codigo,
           jsonb_object_agg(to_char(vm.periodo,'YYYY-MM'), vm.cantidad) as meses,
           sum(vm.cantidad)                                             as total,
           count(*)::int                                                as meses_con_venta
    from v_mes vm
    group by vm.mate_codigo
  )
  select a.mate_codigo,
         m.mate_nombre,
         m.clie_nombre                                                as proveedor,
         m.mate_stock_disponible,
         a.meses,
         a.total,
         -- SUM/N, no AVG(): las celdas vacias no generan fila, asi que
         -- AVG dividiria solo por los meses con venta y sobreestimaria.
         round(a.total / p_meses, 2)                                  as promedio,
         a.meses_con_venta
  from agg a
  left join public.material_yiqi m on m.mate_codigo = a.mate_codigo
  order by a.total desc nulls last;
$function$;
