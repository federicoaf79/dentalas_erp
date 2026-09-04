-- ============================================================
-- 20260904160000_notas_punto_pedido_en_app.sql
-- Dentalab-Compras — Ítem #43 (sprint 4/9/2026)
-- ============================================================
--
-- Pedido de Ivana (vía Federico, 4/9/2026): las anotaciones que ella
-- ya escribe en YiQi, en la ficha de artículo → pestaña "Punto
-- pedido" → campo "Notas sobre punto de pedido" (screenshot
-- compartido), que aparezcan también en Dentalab-Compras -- no hace
-- falta entrar a YiQi para verlas.
--
-- Ese campo ya se sincroniza como material_yiqi.mate_notas_sobre_
-- punto_de (viene de la smartie 2344, columna MATE_NOTAS_SOBRE_
-- PUNTO_DE) y YA se muestra en Alertas.jsx. Lo que faltaba: las dos
-- funciones que alimentan "Nueva OC" (sugerencias_compra y
-- buscar_articulos_proveedor) no devuelven esa columna, así que no
-- hay forma de mostrarla ahí. Monitor de Stock no necesita cambio de
-- función -- ya hace select('*') sobre material_yiqi, solo falta
-- pintar la columna en el frontend (ver JSX de este mismo item).
--
-- Cambio: agregar "notas" (mate_notas_sobre_punto_de) a la salida de
-- ambas funciones. Solo LECTURA -- no se agrega ninguna forma de
-- escribir de vuelta a YiQi (eso quedó descartado en la conversación
-- con Federico: Ivana ya escribe ahí a mano, no hay que arriesgarse a
-- pisarlo).
--
-- Cuerpo de ambas funciones: idéntico al de
-- 20260904140000_prommes_redondeo_arriba.sql (última definición
-- vigente, confirmado leyéndola completa antes de tocarla), agregando
-- solo la columna "notas".
--
-- Nota (corrección tras el primer intento): Postgres no permite que
-- CREATE OR REPLACE FUNCTION cambie el tipo de retorno de una función
-- RETURNS TABLE (agregar una columna cuenta como cambio de tipo) --
-- error 42P13. Hace falta DROP FUNCTION antes. El DROP borra también
-- los permisos (GRANT) que tuviera la función vieja, así que se
-- vuelven a otorgar explícitamente al final (a "authenticated", mismo
-- criterio que el resto de las funciones RPC del proyecto -- ver
-- 20260810150000_papelera_ordenes_propias.sql y
-- 20260820120000_yiqi_diagnostico.sql).
-- ============================================================

drop function if exists public.sugerencias_compra(text);
drop function if exists public.buscar_articulos_proveedor(text, text, integer);

create or replace function public.sugerencias_compra(p_proveedor text)
returns table(mate_codigo text, mate_nombre text, stock numeric, umbral numeric, promedio numeric, unidades_por_bulto numeric, costo_unitario numeric, cantidad_sugerida numeric, topeada boolean, nivel text, notas text)
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
      m.mate_notas_sobre_punto_de as notas
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
         f.notas
  from final f
  order by f.sin_base, (case when f.stock <= 0 then 0 else 1 end), f.promedio desc;
$function$;

create or replace function public.buscar_articulos_proveedor(
  p_proveedor text,
  p_busqueda text default null,
  p_limite integer default 30
)
returns table(mate_codigo text, mate_nombre text, stock numeric, umbral numeric, promedio numeric, unidades_por_bulto numeric, costo_unitario numeric, notas text)
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
    nullif(coalesce(m.mate_crm, 0), 0) as costo_unitario,
    m.mate_notas_sobre_punto_de as notas
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

-- El DROP de arriba borra los GRANT que tuviera cada función -- se
-- vuelven a otorgar acá para que Nueva OC (llamada vía supabase-js
-- .rpc(), con el usuario logueado) pueda seguir invocándolas.
grant execute on function public.sugerencias_compra(text) to authenticated;
grant execute on function public.buscar_articulos_proveedor(text, text, integer) to authenticated;
