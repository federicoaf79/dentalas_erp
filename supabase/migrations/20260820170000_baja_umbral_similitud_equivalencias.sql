-- ============================================================
-- 20260820170000_baja_umbral_similitud_equivalencias.sql
-- Fix #2 del timeout en candidatos_equivalencia_precios() — probado en
-- vivo (Aris, 20/8/2026): la reescritura con LATERAL de la migración
-- anterior (20260820160000) SIGUE dando timeout.
-- ============================================================
--
-- POR QUÉ EL FIX #1 NO ALCANZÓ: el índice GIN de pg_trgm acelera el
-- operador `%` (¿supera el umbral?), pero NO tiene forma de resolver
-- "top 5 más parecidos" directamente desde el índice -- eso lo sigue
-- calculando Postgres evaluando similarity() fila por fila sobre TODAS
-- las filas que pasan el filtro `%`, y recién ahí ordena y corta en 5.
-- Con el umbral en 0.22 (deliberadamente laxo en el diseño original) y
-- vocabulario muy repetido entre los ~6.939 nombres de artículos
-- dentales ("x100", "unidades", "capsula", nombres de marca cortos,
-- etc.), miles de filas superan ese umbral para cada fila ancla -- el
-- LATERAL evita materializar el cruce completo antes de ORDENAR, pero
-- no evita el costo de evaluar miles de candidatos por cada una de las
-- 6.939 filas ancla.
--
-- FIX REAL: subir el umbral de similitud de 0.22 a 0.45 -- bastante
-- por encima del default de pg_trgm (0.3). Esto reduce drásticamente
-- cuántas filas pasan el filtro `%` por cada ancla (el operador SÍ usa
-- el índice GIN de forma eficiente cuando el umbral filtra la gran
-- mayoría del catálogo), a costa de sugerir candidatos con nombres
-- MÁS parecidos entre sí -- se pierde sensibilidad para pares con
-- nombres bastante distintos (ej. sinónimos entre proveedores), pero
-- eso ya era una limitación conocida del enfoque "por nombre" (ver
-- migración 20260820150000) -- funcionando es mejor que timeout.
--
-- Statement_timeout local sigue en pie como margen de seguridad, sin
-- cambios respecto al fix #1.
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

  -- Subido de 0.22 a 0.45 -- ver comentario arriba. Si con el tiempo
  -- se junta suficiente feedback de que se están perdiendo pares
  -- válidos, se puede bajar de nuevo probando primero en un ambiente
  -- de test con EXPLAIN ANALYZE, no a ciegas en producción otra vez.
  perform set_config('pg_trgm.similarity_threshold', '0.45', true);
  perform set_config('statement_timeout', '25000', true);

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
  'Trae hasta p_limite pares de precios_proveedor_yiqi (proveedores distintos) con nombre parecido y todavía sin confirmar/rechazar en equivalencias_precios, para la pantalla de revisión en tandas. Umbral de similitud en 0.45 (subido de 0.22 el 20/8/2026 tras confirmar en vivo que un umbral más laxo causaba timeout — ver migración 20260820170000). No es SECURITY DEFINER: respeta el RLS de precios_proveedor_yiqi.';
