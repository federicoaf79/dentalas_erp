-- ============================================================
-- 20260904170000_archivar_declaraciones_causa.sql
-- Dentalab-Compras — Ítem #47 (sprint 4/9/2026)
-- ============================================================
--
-- Pedido de Federico: "que haya opción de borrar, o archivar" una
-- causa declarada en Alertas / Órdenes de compra / Seguimiento de OC.
--
-- declaraciones_causa es append-only por diseño (acordado 22/8/2026,
-- ver 20260822000000_declaraciones_causa.sql): cada declaración es un
-- registro nuevo, nunca se pisa ni se borra una fila, para no perder
-- el rastro de qué causa se declaró y cuándo. Un DELETE real rompería
-- eso. En cambio se usa el mismo patrón de "papelera" reversible que
-- ya existe en el proyecto para ordenes_propias (ver
-- 20260810150000_papelera_ordenes_propias.sql): un archivada_en/
-- archivada_por que la saca de "vigente" sin borrar la fila.
--
-- La tabla ya tiene RLS que permite este UPDATE:
--   "cada uno edita lo suyo"  update  using (declarada_por = auth.uid() OR es_admin())
-- (ver 20260822000000_declaraciones_causa.sql) -- no hace falta
-- tocar políticas, alcanza con agregar las columnas.
--
-- Causales múltiples (la otra mitad del ítem #47): Federico confirmó
-- que no hace falta cambiar el modelo -- declarar causas distintas en
-- momentos distintos ya funciona hoy y el historial las muestra
-- todas. No hay cambio de esquema para esa parte.
-- ============================================================

alter table public.declaraciones_causa
  add column if not exists archivada_en timestamptz,
  add column if not exists archivada_por uuid references auth.users(id);

comment on column public.declaraciones_causa.archivada_en is
  'Cuándo se archivó esta declaración (null = activa/vigente). Reversible -- ver restaurarCausa() en frontend/src/lib/causas.js. No borra la fila: el historial completo se sigue mostrando en el modal, con esta marcada.';
comment on column public.declaraciones_causa.archivada_por is
  'Quién archivó la declaración. Null cuando archivada_en también es null.';
