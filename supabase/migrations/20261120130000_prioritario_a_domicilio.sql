-- ============================================================
-- 20261120130000_prioritario_a_domicilio.sql — 20/11/2026
-- ============================================================
-- "Prioritario a domicilio" aparece como código en el reporte de ventas de
-- YiQi (~300 u/mes en el Predictor) sin estar en el catálogo de artículos.
-- Confirmado (Federico, 20/11): entra en la misma categoría que 887/888 y los
-- administrativos; no se repone. Se suma a es_administrativo(), comparando
-- sin mayúsculas ni espacios de más porque es un texto, no un número.
-- Idempotente.
-- ============================================================

create or replace function public.es_administrativo(p_sku text)
returns boolean
language sql
immutable
as $function$
  select coalesce(p_sku, '') in ('887', '888', '889', '890', '99999')
      or lower(btrim(coalesce(p_sku, ''))) = 'prioritario a domicilio';
$function$;

comment on function public.es_administrativo(text) is
  'SKU que no son artículos de reposición: 889/890/99999 administrativos (Aris, 9.4/6.3), 887/888 genéricos de compras puntuales para un cliente o vendedor (Ivana, 20/11/2026) y "Prioritario a domicilio", concepto de facturación (20/11/2026). No entran en reposición, artículos a pedir ni análisis operativo de stock.';

-- ------------------------------------------------------------
-- Verificación (solo lectura):
--   select public.es_administrativo('Prioritario a domicilio') as prioritario,
--          public.es_administrativo('887') as a887,
--          public.es_administrativo('1000') as a1000,
--          (select string_agg(distinct mate_codigo, ' | ') from public.ventas_mensual_yiqi
--            where mate_codigo ilike '%prioritario%') as codigo_en_ventas;
--   -- debe dar true · true · false · el código tal como viene de YiQi
-- ------------------------------------------------------------
