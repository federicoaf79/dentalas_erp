-- ============================================================
-- 20261117120000_buscar_articulos_deposito.sql — 17/11/2026
-- ============================================================
-- Buscador de artículos para pedidos entre depósitos (app de depósito,
-- "Pedir al otro depósito", y modal "Nuevo pedido entre depósitos" de
-- Aris). Antes era `material_yiqi` con ilike de la frase entera, sin
-- orden y cortado en 20: "acrilico auto" no encontraba "auto acrilico",
-- "acrilico" no encontraba "Acrílico" y la lista eran 20 cualquiera
-- (pedido de Federico, 17/11).
--
-- Ahora:
--   * cada palabra tiene que aparecer en el código o en el nombre, en
--     cualquier orden, sin distinguir mayúsculas ni tildes (unaccent);
--   * orden por relevancia: código exacto, código que empieza con lo
--     buscado, nombre que empieza con la primera palabra, el resto;
--     dentro de cada grupo, alfabético;
--   * devuelve el total y hasta p_limite resultados (default 50, máx 200);
--   * excluye lo que no se mueve entre depósitos: publicaciones de ML
--     ("###"), combos ("COMBO…"), discontinuados y Acritone/NewcryL
--     (misma regla que las alertas). La producción propia (Dentalab) SÍ
--     se incluye: se fabrica pero se traspasa entre depósitos;
--   * suma el stock de Local y Central (stock_yiqi).
-- SECURITY INVOKER: respeta la RLS de material_yiqi / stock_yiqi.
-- Idempotente.
-- ============================================================

create extension if not exists unaccent with schema extensions;

create or replace function public.buscar_articulos_deposito(p_texto text, p_limite integer default 50)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $function$
  with palabras as (
    select array_agg(p) as ps
    from unnest(regexp_split_to_array(
      lower(unaccent(trim(coalesce(p_texto, '')))), '[\s,]+')) as p
    where p <> ''
  ),
  candidatos as (
    select m.mate_codigo, m.mate_nombre,
           lower(unaccent(coalesce(m.mate_codigo, ''))) as cod,
           lower(unaccent(coalesce(m.mate_nombre, ''))) as nom
    from public.material_yiqi m
    where coalesce(m.mate_nombre, '') not like '###%'
      and coalesce(m.mate_nombre, '') not ilike 'combo%'
      and coalesce(m.mate_nombre, '') not ilike '%discontinuad%'
      and coalesce(m.mate_nombre, '') not ilike '%acritone%'
      and coalesce(m.mate_nombre, '') not ilike '%newcryl%'
  ),
  coinciden as (
    select c.*,
           case
             when c.cod = (select ps[1] from palabras) and cardinality((select ps from palabras)) = 1 then 0
             when c.cod like (select ps[1] from palabras) || '%' then 1
             when c.nom like (select ps[1] from palabras) || '%' then 2
             else 3
           end as rango
    from candidatos c, palabras w
    where cardinality(w.ps) > 0
      and not exists (
        select 1 from unnest(w.ps) as p
        where position(p in c.cod || ' ' || c.nom) = 0
      )
  ),
  pagina as (
    select k.*, s.stock_local, s.stock_central
    from coinciden k
    left join public.stock_yiqi s on s.sku = k.mate_codigo
    order by k.rango, k.mate_nombre
    limit least(greatest(coalesce(p_limite, 50), 1), 200)
  )
  select jsonb_build_object(
    'total', (select count(*) from coinciden),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                 'mate_codigo', mate_codigo,
                 'mate_nombre', mate_nombre,
                 'stock_local', stock_local,
                 'stock_central', stock_central) order by rango, mate_nombre)
               from pagina), '[]'::jsonb)
  );
$function$;

revoke all on function public.buscar_articulos_deposito(text, integer) from public, anon;
grant execute on function public.buscar_articulos_deposito(text, integer) to authenticated;

-- ------------------------------------------------------------
-- Verificación (SQL Editor; corre como postgres, sin RLS):
--   select public.buscar_articulos_deposito('acrilico auto', 5);
--   select public.buscar_articulos_deposito('auto acrílico', 5);   -- mismo total
--   select (public.buscar_articulos_deposito('acrilico', 5))->'total';
-- ------------------------------------------------------------
