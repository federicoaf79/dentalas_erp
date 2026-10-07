-- ============================================================
-- 20261007120000_sugerencias_compra_maximo.sql — 7/10/2026
-- ============================================================
-- Feedback de Ivana (28/9, punto 11): en Nueva OC quiere ver Mín. /
-- Stock / Máx. con la misma barra que Alertas y Monitor. La función
-- sugerencias_compra() no devolvía el máximo: se agrega la columna
-- "maximo" (material_yiqi.mate_punto_pedido_max, el mismo dato que
-- usan Alertas y Monitor), AL FINAL de la tabla de retorno.
--
-- Cuerpo idéntico al de producción al 7/10/2026 (pg_get_functiondef),
-- solo se suma "maximo" en el CTE base y en el select final. No cambia
-- ningún cálculo de cantidad sugerida.
--
-- Agregar una columna a RETURNS TABLE es cambio de tipo de retorno →
-- hace falta DROP (error 42P13 si no). El DROP borra los permisos:
-- se vuelven a dejar como en 20260930130000_permisos_funciones.sql.
-- ============================================================

drop function if exists public.sugerencias_compra(text);

create function public.sugerencias_compra(p_proveedor text)
 returns table(mate_codigo text, mate_nombre text, stock numeric, umbral numeric, promedio numeric, unidades_por_bulto numeric, costo_unitario numeric, cantidad_sugerida numeric, topeada boolean, nivel text, notas text, maximo numeric)
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
      nullif(coalesce(m.mate_crm, 0), 0) as costo,
      m.mate_notas_sobre_punto_de as notas,
      nullif(coalesce(m.mate_punto_pedido_max, 0), 0)::numeric as maximo
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
         case when f.stock <= 0 then 'critica' else 'preventiva' end,
         f.notas,
         f.maximo
  from final f
  order by f.sin_base, (case when f.stock <= 0 then 0 else 1 end), f.promedio desc;
$function$;

revoke execute on function public.sugerencias_compra(text) from public, anon;
grant execute on function public.sugerencias_compra(text) to authenticated;
