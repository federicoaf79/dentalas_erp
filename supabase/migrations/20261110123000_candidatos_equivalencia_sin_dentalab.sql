-- ============================================================
-- 20261110123000_candidatos_equivalencia_sin_dentalab.sql — 10/11/2026
-- Corrige 20261110122000: es_comprable() compara el proveedor con 'Dentalab'
-- (como viene en material_yiqi), pero en precios_proveedor_yiqi el proveedor
-- viene 'DENTALAB'. Validado en vivo el 10/11 (federico@ en /?page=equivalencias):
-- 0 pares de discontinuados, pero seguían 6 tarjetas con proveedor DENTALAB.
-- No se toca es_comprable() (la usan sugerencias, alertas y reposición).
-- Idempotente.
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
      and upper(coalesce(b.proveedor, '')) <> 'DENTALAB'     -- 10/11/2026 (b): en precios_proveedor_yiqi viene en mayúsculas
      and lower(b.mate_nombre) % lower(a.mate_nombre)
    order by similitud desc
    limit 5
  ) as cand
  where a.mate_nombre is not null
    and public.es_comprable(a.mate_nombre, a.proveedor)     -- 10/11/2026: ídem, lado A
    and upper(coalesce(a.proveedor, '')) <> 'DENTALAB'       -- 10/11/2026 (b): ídem, lado A
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

delete from public.candidatos_equivalencia_precios_cache c
using public.precios_proveedor_yiqi a, public.precios_proveedor_yiqi b
where a.yiqi_id = c.yiqi_id_menor
  and b.yiqi_id = c.yiqi_id_mayor
  and (upper(coalesce(a.proveedor, '')) = 'DENTALAB' or upper(coalesce(b.proveedor, '')) = 'DENTALAB');

-- Verificación (debe dar 0):
-- select count(*) from public.candidatos_equivalencia_precios_cache c
--   join public.precios_proveedor_yiqi a on a.yiqi_id = c.yiqi_id_menor
--   join public.precios_proveedor_yiqi b on b.yiqi_id = c.yiqi_id_mayor
--  where upper(a.proveedor) = 'DENTALAB' or upper(b.proveedor) = 'DENTALAB';
