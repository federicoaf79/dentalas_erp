-- ============================================================
-- 20260818130000_yiqi_escritura_oc.sql
-- Dentalab-Compras — columnas de seguimiento de escritura a YiQi
-- ============================================================
--
-- Agrega a ordenes_propias el estado de la escritura hacia YiQi
-- (POST /ORDEN_DE_COMPRA), disparada al aprobar una orden. Ver
-- PROMPT_CONTINUIDAD_Dentalab-Compras.md, sesión 18/8/2026, para
-- el diseño completo (por qué se hace al aprobar, por qué un
-- error de YiQi nunca bloquea la aprobación local, etc.).
--
-- yiqi_enviada_en:  cuándo se confirmó la escritura exitosa en YiQi.
--                   NULL = todavía no se escribió (o falló).
-- yiqi_id_creado:   el "id" interno que YiQi asignó a la OC creada.
--                   También sirve de guardia de idempotencia: si ya
--                   está seteado, la función de escritura no vuelve
--                   a mandar el POST (protege contra doble click o
--                   doble llamada del reintento).
-- yiqi_error:       último mensaje de error de la escritura, si
--                   falló. Se limpia (NULL) en el próximo intento
--                   exitoso. NO bloquea la aprobación local.
-- ============================================================

alter table public.ordenes_propias
  add column if not exists yiqi_enviada_en timestamptz,
  add column if not exists yiqi_id_creado bigint,
  add column if not exists yiqi_error text;

comment on column public.ordenes_propias.yiqi_enviada_en is
  'Cuándo se confirmó el POST exitoso a YiQi (ORDEN_DE_COMPRA). NULL = no enviada o falló.';
comment on column public.ordenes_propias.yiqi_id_creado is
  'Id interno de YiQi para la OC creada. También actúa como guardia de idempotencia.';
comment on column public.ordenes_propias.yiqi_error is
  'Último error al intentar escribir en YiQi. Se limpia (NULL) al tener éxito.';
