-- ============================================================
-- 20261120150000_conceptos_de_envio_2.sql — 20/11/2026
-- ============================================================
-- Códigos vendidos que no están en el catálogo [prod 2026-11-20]: además
-- de los 4 "Prioritario…" hay 5 conceptos de envío más (Estándar, Express
-- y Retiro). Misma categoría: conceptos de facturación que no se reponen.
-- Los códigos numéricos sin catálogo (794-F, 5, 7, 6586-5, 6566, …) NO se
-- tocan: parecen artículos dados de baja o renombrados, no envíos.
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
           'retiro en sucursal oca prioritario',
           'estándar a domicilio',
           'estándar a sucursal de correo',
           'express a domicilio',
           'express a sucursal de correo',
           'retiro en una sucursal'
         );
$function$;

comment on function public.es_administrativo(text) is
  'SKU que no son artículos de reposición: 889/890/99999 administrativos (Aris, 9.4/6.3), 887/888 genéricos de compras puntuales para un cliente o vendedor (Ivana, 20/11/2026) y los 9 conceptos de envío del reporte de ventas (Prioritario, Estándar, Express y Retiro; 20/11/2026). No entran en reposición, artículos a pedir ni análisis operativo de stock.';

-- ------------------------------------------------------------
-- Verificación (solo lectura):
--   select v.mate_codigo, public.es_administrativo(v.mate_codigo) as excluido
--   from (select distinct mate_codigo from public.ventas_mensual_yiqi) v
--   left join public.material_yiqi m on m.mate_codigo = v.mate_codigo
--   where m.mate_codigo is null and v.mate_codigo !~ '[0-9]'
--   order by 1;
--   -- los 9 conceptos de envío tienen que dar excluido = true
-- ------------------------------------------------------------
