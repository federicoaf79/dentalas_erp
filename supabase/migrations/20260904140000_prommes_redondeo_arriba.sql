-- ============================================================
-- 20260904140000_prommes_redondeo_arriba.sql
-- Dentalab-Compras — Sprint de cambios 4/9/2026, ítem del feedback
-- de la reunión con Dentalab del 3/9 ("decimales en mín/máx y
-- redondeo de Prom./mes").
--
-- Alcance de este archivo: SOLO el redondeo de "Prom./mes" (Nueva
-- OC). El "por qué Mín. tiene decimales" NO es un bug de cálculo acá
-- -- se explica en el mensaje que acompaña este archivo, con una
-- consulta de verificación aparte, no en una migración.
--
-- Qué cambia:
--   sugerencias_compra() y buscar_articulos_proveedor() devuelven la
--   columna "promedio" (consumo mensual promedio, Nueva OC la
--   muestra como "Prom./mes") con round(x, 1) -- redondeo al décimo
--   más cercano, para abajo o para arriba según corresponda. A
--   pedido del cliente pasa a ceil(x): siempre para arriba y sin
--   decimales, para no subestimar nunca el consumo que se está
--   mostrando como referencia.
--
--   IMPORTANTE -- esto NO toca el cálculo de cuánto comprar: dentro
--   de sugerencias_compra(), el promedio SIN redondear (el de la CTE
--   "base") es el que se usa para "faltante" y "sugerida_final". Acá
--   se cambia únicamente el número que se muestra en la columna
--   "Prom./mes" al final del SELECT, que hasta ahora no se
--   reutilizaba en ningún cálculo posterior. Verificado leyendo la
--   definición completa de la función antes de tocar esta línea.
--
-- Cuerpo de ambas funciones: idéntico al de
-- 20260821140000_exclusiones_aris.sql (única migración que las
-- define, confirmado con grep), cambiando solo la línea del
-- redondeo de "promedio" en el SELECT final de cada una.
-- ============================================================

create or replace function public.sugerencias_compra(p_proveedor text)
returns table(mate_codigo text, mate_nombre text, stock numeric, umbral numeric, promedio numeric, unidades_por_bulto numeric, costo_unitario numeric, cantidad_sugerida numeric, topeada boolean, nivel text)
language sql
stable
as $function$
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
      and not public.es_administrativo(m.mate_codigo)
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
  select f.mate_codigo, f.mate_nombre, f.stock, f.umbral, ceil(f.promedio),
         f.bulto, f.costo, f.sugerida_final,
         (f.sugerida_final is not null and f.sugerida_final < f.sugerida_sin_tope),
         case when f.stock <= 0 then 'critica' else 'preventiva' end
  from final f
  order by f.sin_base, (case when f.stock <= 0 then 0 else 1 end), f.promedio desc;
$function$;

create or replace function public.buscar_articulos_proveedor(
  p_proveedor text,
  p_busqueda text default null,
  p_limite integer default 30
)
returns table(mate_codigo text, mate_nombre text, stock numeric, umbral numeric, promedio numeric, unidades_por_bulto numeric, costo_unitario numeric)
language sql
stable
as $function$
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
    ceil(greatest(coalesce(p.promedio, 0), 0)) as promedio,
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

-- ------------------------------------------------------------
-- Verificación 1: evidencia real de por qué "Mín." puede tener
-- decimales -- mate_punto_de_pedido/mate_stock_seguridad son
-- valores que vienen tal cual cargados en YiQi (no hay ningún
-- cálculo nuestro sobre ellos). Si esto devuelve filas, confirma
-- que el decimal está cargado así en YiQi, no es un bug de acá.
-- Si NO devuelve filas, no hay (hoy) ningún artículo con decimales
-- en esos dos campos -- el reclamo puede haber sido sobre "Prom./mes"
-- (que este archivo sí redondea) y no sobre "Mín." en sí.
-- ------------------------------------------------------------
select mate_codigo, mate_nombre, clie_nombre, mate_punto_de_pedido, mate_stock_seguridad
from public.material_yiqi
where (mate_punto_de_pedido % 1 <> 0) or (mate_stock_seguridad % 1 <> 0)
limit 20;

-- ------------------------------------------------------------
-- Verificación 2: "Prom./mes" ya redondeado para arriba y sin
-- decimales, contra el proveedor con más artículos cargados (para
-- asegurar que haya datos reales para mirar).
-- ------------------------------------------------------------
select mate_codigo, mate_nombre, stock, umbral, promedio, unidades_por_bulto
from public.sugerencias_compra(
  (select clie_nombre from public.material_yiqi group by clie_nombre order by count(*) desc limit 1)
)
where promedio > 0
order by promedio desc
limit 15;
