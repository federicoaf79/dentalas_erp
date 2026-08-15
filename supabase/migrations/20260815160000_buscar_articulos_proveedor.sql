-- ============================================================
-- buscar_articulos_proveedor(p_proveedor, p_busqueda, p_limite)
-- ============================================================
-- Contexto: Nueva OC solo dejaba armar la orden con los articulos
-- que ya estan en alerta (sugerencias_compra: stock <= umbral).
-- Aris/Ivana pidieron poder agregar CUALQUIER articulo del
-- proveedor a mano, no solo los que estan en quiebre — por
-- ejemplo para completar un pedido con algo que todavia no bajo
-- del punto de pedido pero conviene traer en la misma compra.
--
-- Esta funcion es la contraparte de sugerencias_compra() pero SIN
-- el filtro de alerta (`stock <= umbral`): devuelve el catalogo
-- comprable del proveedor, opcionalmente filtrado por texto (SKU
-- o nombre), pensada para un buscador tipo autocompletar en el
-- frontend (de ahi el p_limite, default 30 — no tiene sentido
-- traer de una miles de filas para un dropdown).
--
-- Mismos filtros de "que es comprable" que sugerencias_compra:
-- es_comprable() saca fraccionados/production/etc. El promedio de
-- venta se calcula igual (mismo criterio de composicion_articulos
-- para traducir combos/fraccionados a lo que hay que comprar), se
-- muestra como referencia, pero a proposito NO se calcula una
-- cantidad_sugerida: no es un articulo en alerta, no hay una
-- necesidad calculada — el frontend deja el campo cantidad vacio
-- ("A definir") para que la persona decida cuanto pedir.
-- ============================================================
CREATE OR REPLACE FUNCTION public.buscar_articulos_proveedor(
  p_proveedor text,
  p_busqueda text DEFAULT NULL,
  p_limite integer DEFAULT 30
)
 RETURNS TABLE(mate_codigo text, mate_nombre text, stock numeric, umbral numeric, promedio numeric, unidades_por_bulto numeric, costo_unitario numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with prom as (
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
  )
  select
    m.mate_codigo,
    m.mate_nombre,
    coalesce(m.mate_stock_disponible, 0) as stock,
    case when m.mate_punto_de_pedido > 0 then m.mate_punto_de_pedido
         else m.mate_stock_seguridad end as umbral,
    round(greatest(coalesce(p.promedio, 0), 0), 1) as promedio,
    nullif(coalesce(m.mate_cantidad_de_unidades, 0), 0) as unidades_por_bulto,
    nullif(coalesce(m.mate_crm, 0), 0) as costo_unitario
  from public.material_yiqi m
  left join prom p on p.mate_codigo = m.mate_codigo
  where m.clie_nombre = p_proveedor
    and public.es_comprable(m.mate_nombre, m.clie_nombre)
    and (
      p_busqueda is null or length(btrim(p_busqueda)) = 0
      or m.mate_codigo ilike '%' || btrim(p_busqueda) || '%'
      or m.mate_nombre ilike '%' || btrim(p_busqueda) || '%'
    )
  order by m.mate_nombre
  limit greatest(coalesce(p_limite, 30), 1);
$function$;
