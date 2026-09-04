-- ============================================================
-- 20260904150000_vende_en_cajas_cerradas.sql
-- Dentalab-Compras — Ítem #42 (sprint 4/9/2026)
-- ============================================================
--
-- Agrega un campo/checkbox "vende en cajas cerradas" por proveedor,
-- a cargar a mano en "Condiciones comerciales" -- mismo criterio que
-- el resto de esa tabla (whatsapp_pedidos, limite_aprobacion, etc.):
-- dato que Aris carga cuando lo sabe, sin sincronizarse de YiQi.
--
-- Uso: informativo por ahora. Avisa a quien arma la orden que ese
-- proveedor solo vende en caja cerrada (no fracciona/no vende
-- unidades sueltas), para que lo tenga en cuenta al pedir. NO se
-- conecta todavía con ninguna validación de cantidad -- eso ya existe
-- a nivel artículo (múltiplo de bulto, ítem #36, 20260903*) y es un
-- concepto distinto: bulto es por SKU, esto es una condición general
-- del proveedor.
-- ============================================================

ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS vende_en_cajas_cerradas boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.proveedores.vende_en_cajas_cerradas IS
  'true si este proveedor solo vende en caja cerrada (no fracciona ni vende unidades sueltas). Cargado a mano en "Condiciones comerciales", igual que el resto de esta tabla. Informativo por ahora, no valida cantidades.';
