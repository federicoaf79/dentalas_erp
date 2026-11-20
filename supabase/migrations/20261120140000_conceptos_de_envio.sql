-- ============================================================
-- 20261120140000_conceptos_de_envio.sql — 20/11/2026
-- ============================================================
-- El control de 20261120130000 mostró que en el reporte de ventas hay 4
-- códigos de envío, no uno [prod 2026-11-20]: "Prioritario",
-- "Prioritario a domicilio", "Prioritario a sucursal de correo" y
-- "Retiro en sucursal OCA Prioritario". Son conceptos de facturación
-- (envío), no artículos: no se reponen (Federico, 20/11). Se suman todos a
-- es_administrativo(), comparando sin mayúsculas ni espacios de más.
-- Idempotente.
-- ============================================================

create or replace function public.es_administrativo(p_sku text)
returns boolean
language sql
immutable
as $function$
  select coalesce(p_sku, '') in ('887', '888', '889', '890', '99999')
      or lower(btrim(coalesce(p_sku, ''))) in (
           'prioritario',
           'prioritario a domicilio',
           'prioritario a sucursal de correo',
           'retiro en sucursal oca prioritario'
         );
$function$;

comment on function public.es_administrativo(text) is
  'SKU que no son artículos de reposición: 889/890/99999 administrativos (Aris, 9.4/6.3), 887/888 genéricos de compras puntuales para un cliente o vendedor (Ivana, 20/11/2026) y los conceptos de envío del reporte de ventas (Prioritario, Prioritario a domicilio, Prioritario a sucursal de correo, Retiro en sucursal OCA Prioritario; 20/11/2026). No entran en reposición, artículos a pedir ni análisis operativo de stock.';

-- ------------------------------------------------------------
-- Verificación (solo lectura):
--   select count(*) filter (where public.es_administrativo(mate_codigo)) as codigos_envio_excluidos
--   from (select distinct mate_codigo from public.ventas_mensual_yiqi where mate_codigo ilike '%prioritario%') x;
--   -- debe dar 4
-- ------------------------------------------------------------
