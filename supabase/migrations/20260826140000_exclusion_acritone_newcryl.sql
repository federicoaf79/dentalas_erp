-- ============================================================
-- 20260826140000_exclusion_acritone_newcryl.sql
-- Dentalab-Compras — Excluir la línea ACRITONE/NewcryL de todo el
-- sistema, a pedido de Aris (respuesta del 24/8/2026 al pendiente #4):
-- "SON PRODUCTOS, NO PROVEEDORES. ESOS ARTÍCULOS NO LOS VAMOS A
-- INCLUIR TODAVIA EN EL SISTEMA."
--
-- Verificado en material_yiqi (26/8/2026): "acritone"/"newcryl" en el
-- nombre agarra ~97 SKU (dientes en distintos colores/formas,
-- acrílicos autocurables/termocurables, polímeros) de los proveedores
-- O'DENT SRL y MUNTAL — es la línea completa, no 1-2 productos
-- puntuales. Federico confirmó "todo el sistema" como alcance: no solo
-- Alertas, también sugerencias de compra y reposición interna.
--
-- Este archivo SOLO toca es_comprable() — es la única función que
-- hacía falta cambiar en SQL, porque sugerencias_compra() y
-- reposicion_interna() ya filtran por es_comprable(m.mate_nombre,
-- m.clie_nombre) (ver migration 20260821140000_exclusiones_aris.sql).
-- No se toca ninguna otra función.
--
-- Definición ANTERIOR (confirmada en vivo con pg_get_functiondef antes
-- de escribir esto, no asumida):
--   select coalesce(p_nombre, '')    not like  '###%'
--      and coalesce(p_nombre, '')    not ilike '%discontinuad%'
--      and coalesce(p_proveedor, '') <> 'Dentalab';
--
-- Cambio: se agregan dos condiciones más, mismo estilo (not ilike),
-- sin tocar ni reordenar las tres que ya existían.
--
-- Los dos espejos en frontend (esExcluidoDeAlertas() en Alertas.jsx y
-- en MonitorStock.jsx) ya se actualizaron por separado el 26/8/2026
-- con la misma regla (nombre contiene "acritone" o "newcryl").
-- ============================================================

create or replace function public.es_comprable(p_nombre text, p_proveedor text)
returns boolean
language sql
immutable
as $function$
  select coalesce(p_nombre, '')    not like  '###%'          -- publicaciones de ML: virtuales, descuentan del base
     and coalesce(p_nombre, '')    not ilike '%discontinuad%'
     and coalesce(p_nombre, '')    not ilike '%acritone%'     -- [26/8/2026] línea Acritone, a pedido de Aris
     and coalesce(p_nombre, '')    not ilike '%newcryl%'      -- [26/8/2026] línea NewcryL, a pedido de Aris
     and coalesce(p_proveedor, '') <> 'Dentalab';            -- produccion propia: se fabrica, no se compra
$function$;

comment on function public.es_comprable(text, text) is
  'Determina si un artículo es comprable externamente: excluye publicaciones de Mercado Libre ("###"), discontinuados, la línea Acritone/NewcryL (26/8/2026, pedido de Aris — no incluir todavía en el sistema) y producción propia (Dentalab). Usada por sugerencias_compra() y reposicion_interna().';

-- ------------------------------------------------------------
-- Verificación: correr después de aplicar. Debería devolver 0 filas —
-- ningún artículo Acritone/NewcryL debería aparecer como comprable.
-- ------------------------------------------------------------
select mate_codigo, mate_nombre, clie_nombre
from public.material_yiqi
where (mate_nombre ilike '%acritone%' or mate_nombre ilike '%newcryl%')
  and public.es_comprable(mate_nombre, clie_nombre) = true;
