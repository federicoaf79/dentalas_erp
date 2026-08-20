-- ============================================================
-- 20260819140000_whatsapp_envio_oc.sql
-- Envío semi-automático de la OC por WhatsApp (19/8/2026)
--
-- Agrega el registro de auditoría de cuándo y quién mandó una orden
-- aprobada al proveedor por WhatsApp, mismo patrón que ya usa el resto
-- del sistema (archivada_en/archivada_por, marcado_en/marcado_por,
-- decidida_en/decidida_por). No cambia RLS: la política de UPDATE que
-- ya existe sobre ordenes_propias cubre estas dos columnas nuevas igual
-- que cubre el resto de la fila.
-- ============================================================

alter table public.ordenes_propias
  add column if not exists whatsapp_enviada_en timestamptz,
  add column if not exists whatsapp_enviada_por uuid references auth.users(id);
