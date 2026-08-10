-- ============================================================
-- composicion_articulos — permisos y RLS
-- ============================================================
-- La migration anterior (20260810000000) creó la tabla y cargó los
-- datos, pero quedó sin GRANT ni políticas: la validación en vivo
-- después de correrla mostró 200 OK con array vacío para cualquier
-- usuario autenticado — la firma clásica de una tabla nueva sin
-- permisos, no un problema de datos.
--
-- Es una tabla de referencia (mapea qué se compra quiere decir qué se
-- vendió), no de datos sensibles por usuario/proveedor — no necesita
-- el mismo filtro por proveedor que material_yiqi/ordenes_yiqi. Se
-- deja lectura abierta a cualquier usuario logueado (la usan tanto el
-- Predictor como Nueva OC, sin distinción de rol) y escritura
-- restringida a admin, mismo criterio que el resto de las tablas de
-- configuración (ver es_admin() en usePermisos / Fase B).
-- ============================================================

alter table composicion_articulos enable row level security;

grant select on composicion_articulos to authenticated;
grant insert, update, delete on composicion_articulos to authenticated;

drop policy if exists "composicion_articulos_select_authenticated" on composicion_articulos;
create policy "composicion_articulos_select_authenticated"
  on composicion_articulos
  for select
  to authenticated
  using (true);

drop policy if exists "composicion_articulos_write_admin" on composicion_articulos;
create policy "composicion_articulos_write_admin"
  on composicion_articulos
  for all
  to authenticated
  using (es_admin())
  with check (es_admin());
