-- ============================================================
-- 20260820160000_fix_candidatos_equivalencia_precios_timeout.sql
-- Fix: candidatos_equivalencia_precios() daba "canceling statement due
-- to statement timeout" en producción (probado en vivo, Aris, 20/8/2026,
-- al abrir "Revisar equivalencias" por primera vez).
-- ============================================================
--
-- CAUSA: la versión anterior hacía el self-join completo
-- (precios_proveedor_yiqi x precios_proveedor_yiqi, ~6.939 filas de
-- cada lado) y recién DESPUÉS aplicaba `order by similitud desc limit
-- p_limite`. Con el umbral permisivo (0.22, a propósito más laxo que
-- el 0.28 del cálculo rápido en ComparacionPrecios.jsx), esto son
-- decenas/cientos de miles de pares que hay que materializar y ordenar
-- antes de poder cortar en 30 -- no llegaba a tiempo.
--
-- FIX: reescrita con LATERAL. Por cada fila de la izquierda (a), se
-- piden directamente los 5 candidatos más parecidos de la derecha (b)
-- -- el índice GIN por trigramas (precios_proveedor_yiqi_nombre_trgm_idx,
-- creado en la migración anterior) puede resolver ese "top 5" por fila
-- de forma eficiente (nested loop + index scan), en vez de generar el
-- producto completo. El ORDER BY + LIMIT final corre sobre un conjunto
-- ya acotado (a lo sumo 6.939 x 5 = 34.695 filas), no sobre el
-- self-join sin filtrar.
--
-- Se mantiene `b.yiqi_id > a.yiqi_id` (ahora DENTRO del LATERAL) para
-- que cada par se evalúe una sola vez, nunca en las dos direcciones --
-- mismo criterio que la versión anterior, solo que ahora vive adentro
-- del LATERAL en vez de en el WHERE externo.
--
-- LIMITACIÓN CONOCIDA (documentada a propósito, no es un bug): como el
-- top-5 se calcula por fila de "a" y no globalmente, un artículo con
-- yiqi_id muy alto nunca es "a" con candidatos propios (no hay ningún
-- b con id mayor) -- pero SÍ puede aparecer como candidato "b" desde
-- el lateral de artículos con yiqi_id menor, así que ningún par se
-- pierde estructuralmente. Lo que sí puede pasar es que un par
-- genuinamente parecido quede afuera del top-5 de su fila "a" porque
-- esa fila tiene muchos otros candidatos aún más parecidos ocupando
-- los 5 lugares -- aceptable para una herramienta de sugerencia
-- iterativa (mismo criterio que el umbral permisivo: mejor de más
-- sugerencias con algún hueco ocasional, que none por timeout).
--
-- Se suma también un statement_timeout local más alto (20s) como
-- margen de seguridad -- no reemplaza el fix real (la reescritura con
-- LATERAL), es un respaldo ante picos de carga en Supabase.
-- ============================================================

create or replace function public.candidatos_equivalencia_precios(p_limite integer default 30)
returns table (
  yiqi_id_a bigint,
  sku_a text,
  proveedor_a text,
  mate_nombre_a text,
  precio_final_a numeric,
  precio_neto_a numeric,
  yiqi_id_b bigint,
  sku_b text,
  proveedor_b text,
  mate_nombre_b text,
  precio_final_b numeric,
  precio_neto_b numeric,
  similitud numeric
)
language plpgsql
as $$
begin
  if p_limite is null or p_limite <= 0 or p_limite > 200 then
    p_limite := 30;
  end if;

  perform set_config('pg_trgm.similarity_threshold', '0.22', true);
  perform set_config('statement_timeout', '20000', true); -- 20s, margen de seguridad (ver comentario arriba)

  return query
  select
    a.yiqi_id, a.sku, a.proveedor, a.mate_nombre, a.precio_final, a.precio_neto,
    cand.yiqi_id, cand.sku, cand.proveedor, cand.mate_nombre, cand.precio_final, cand.precio_neto,
    cand.similitud
  from public.precios_proveedor_yiqi a
  cross join lateral (
    select
      b.yiqi_id, b.sku, b.proveedor, b.mate_nombre, b.precio_final, b.precio_neto,
      similarity(lower(a.mate_nombre), lower(b.mate_nombre))::numeric as similitud
    from public.precios_proveedor_yiqi b
    where b.yiqi_id > a.yiqi_id
      and b.proveedor <> a.proveedor
      and b.mate_nombre is not null
      and lower(b.mate_nombre) % lower(a.mate_nombre)
      and not exists (
        select 1 from public.equivalencias_precios e
        where e.yiqi_id_menor = a.yiqi_id
          and e.yiqi_id_mayor = b.yiqi_id
      )
    order by similitud desc
    limit 5
  ) as cand
  where a.mate_nombre is not null
  order by cand.similitud desc
  limit p_limite;
end;
$$;

comment on function public.candidatos_equivalencia_precios(integer) is
  'Trae hasta p_limite pares de precios_proveedor_yiqi (proveedores distintos) con nombre parecido y todavía sin confirmar/rechazar en equivalencias_precios, para la pantalla de revisión en tandas. Reescrita 20/8/2026 con LATERAL (ver migración) para evitar el timeout del self-join sin acotar. No es SECURITY DEFINER: respeta el RLS de precios_proveedor_yiqi, así que un operador solo revisa pares entre sus proveedores asignados.';
