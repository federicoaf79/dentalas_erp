-- ============================================================
-- 20260906180000_movimiento_stock_reposicion.sql
-- Dentalab-Compras — Reposición interna, Fase 3: reflejar "Movido"
-- también en YiQi (POST /MOVIMIENTO_STOCK)
-- ============================================================
--
-- Confirmado por Aris (pendiente #5, ver PROMPT_CONTINUIDAD_RESUMEN.md):
-- "SÍ, DEBERIA FIGURAR EN YIQI TAMBIEN" -- hoy marcar_reposicion_sugerida()
-- solo escribe en esta tabla, nunca en YiQi.
--
-- Antes de esta migración se probó en vivo, con datos mínimos, un
-- POST /MOVIMIENTO_STOCK real contra un SKU de bajo impacto
-- (70340-2, yiqi_id 13175, 1 unidad Central->Local) y su reversión --
-- confirmado que el body { MATE_ID_MATE, MOST_CANTIDAD, CEDI_ID_CED1
-- (destino), CEDI_ID_CEDI (origen) } alcanza y YiQi devuelve el
-- movimiento creado completo (id, MOST_NRO_MOVIMIENTO, estado
-- "Registrada/o"). Ver INCIDENTE_duplicados_ordenes_yiqi_5-9-2026.md
-- y la conversación del 6/9/2026 para el detalle de esa prueba.
--
-- Solo agrega columnas de idempotencia/auditoría -- mismo patrón que
-- yiqi_enviada_en/yiqi_id_creado/yiqi_error en ordenes_propias. La
-- escritura real a YiQi vive en la Edge Function mover-stock-yiqi
-- (nueva, ver ese archivo), invocada fire-and-forget desde el
-- frontend justo después de marcar_reposicion_sugerida(p_estado =
-- 'movido') -- mismo patrón que enviar-oc-yiqi después de aprobar una
-- OC. REGLA DE ORO, igual que en enviar-oc-yiqi: un error acá NUNCA
-- deshace ni bloquea el "movido" local -- el usuario ya movió la
-- mercadería físicamente, no tiene sentido revertir el registro local
-- porque YiQi no respondió.
-- ============================================================

alter table public.reposiciones_sugeridas
  add column if not exists yiqi_movimiento_id bigint,
  add column if not exists yiqi_enviado_en timestamptz,
  add column if not exists yiqi_error text;

comment on column public.reposiciones_sugeridas.yiqi_movimiento_id is
  'id real del registro creado en MOVIMIENTO_STOCK (YiQi) cuando esta fila se marca "movido". NULL = todavía no se escribió en YiQi (pendiente, descartada, o falló el envío -- ver yiqi_error).';
comment on column public.reposiciones_sugeridas.yiqi_enviado_en is
  'Cuándo se confirmó la escritura en MOVIMIENTO_STOCK. NULL si nunca se envió o si falló.';
comment on column public.reposiciones_sugeridas.yiqi_error is
  'Último error al intentar escribir en MOVIMIENTO_STOCK, si lo hubo. Se limpia (NULL) en un envío exitoso. NUNCA bloquea ni revierte el estado local -- ver mover-stock-yiqi/index.ts.';
