-- ============================================================
-- 20261110122000_candidatos_equivalencia_sin_ruido.sql — 10/11/2026
-- Radiografía UX (ítem 19): "Revisar equivalencias" mostraba ruido:
--   * pares de artículos "*****DISCONTINUADO*****" (100 % de coincidencia),
--   * pares donde un lado es del proveedor "Dentalab" (producción propia:
--     se fabrica, no se compra, no tiene un precio de proveedor que comparar).
-- Se aplica la misma regla que usan las alertas y sugerencias_compra():
-- public.es_comprable(nombre, proveedor) (excluye discontinuados, "###" de
-- Mercado Libre, Acritone/NewcryL y proveedor 'Dentalab').
--
-- 1) recalcular_candidatos_equivalencia_precios(): create or replace con la
--    misma firma, security definer y search_path; solo se agrega es_comprable
--    a los dos lados del par. Los permisos no cambian (solo procesos de fondo).
-- 2) Se borran de la caché los pares existentes que caen en la regla, sin
--    esperar al cron diario (30 6 * * * UTC).
-- Idempotente. No toca equivalencias_precios (decisiones humanas).
-- ============================================================

create or replace function public.recalcular_candidatos_equivalencia_precios()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  perform set_config('statement_timeout', '0', true);
  perform set_config('pg_trgm.similarity_threshold', '0.4', true);

  delete from public.candidatos_equivalencia_precios_cache;

  insert into public.candidatos_equivalencia_precios_cache (yiqi_id_menor, yiqi_id_mayor, similitud)
  select a.yiqi_id, cand.yiqi_id, cand.similitud
  from public.precios_proveedor_yiqi a
  cross join lateral (
    select
      b.yiqi_id,
      similarity(lower(a.mate_nombre), lower(b.mate_nombre))::numeric as similitud
    from public.precios_proveedor_yiqi b
    where b.yiqi_id > a.yiqi_id
      and b.proveedor <> a.proveedor
      and b.mate_nombre is not null
      and public.es_comprable(b.mate_nombre, b.proveedor)   -- 10/11/2026: sin discontinuados ni producción propia
      and lower(b.mate_nombre) % lower(a.mate_nombre)
    order by similitud desc
    limit 5
  ) as cand
  where a.mate_nombre is not null
    and public.es_comprable(a.mate_nombre, a.proveedor)     -- 10/11/2026: ídem, lado A
    -- no vale la pena cachear un par que ya tiene respuesta humana
    and not exists (
      select 1 from public.equivalencias_precios e
      where e.yiqi_id_menor = a.yiqi_id
        and e.yiqi_id_mayor = cand.yiqi_id
    );

  get diagnostics filas = row_count;
  return filas;
end;
$$;

revoke execute on function public.recalcular_candidatos_equivalencia_precios() from public, anon, authenticated;

-- Limpieza inmediata de la caché actual.
delete from public.candidatos_equivalencia_precios_cache c
using public.precios_proveedor_yiqi a, public.precios_proveedor_yiqi b
where a.yiqi_id = c.yiqi_id_menor
  and b.yiqi_id = c.yiqi_id_mayor
  and not (public.es_comprable(a.mate_nombre, a.proveedor)
       and public.es_comprable(b.mate_nombre, b.proveedor));

-- ------------------------------------------------------------
-- Verificación (SQL Editor de Supabase). Ambas deben dar 0:
-- ------------------------------------------------------------
-- select count(*) from public.candidatos_equivalencia_precios_cache c
--   join public.precios_proveedor_yiqi a on a.yiqi_id = c.yiqi_id_menor
--   join public.precios_proveedor_yiqi b on b.yiqi_id = c.yiqi_id_mayor
--  where a.mate_nombre ilike '%discontinuad%' or b.mate_nombre ilike '%discontinuad%'
--     or a.proveedor = 'Dentalab' or b.proveedor = 'Dentalab';
-- select count(*) from public.candidatos_equivalencia_precios(200)
--  where mate_nombre_a ilike '%discontinuad%' or mate_nombre_b ilike '%discontinuad%'
--     or proveedor_a = 'Dentalab' or proveedor_b = 'Dentalab';
