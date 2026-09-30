-- ============================================================
-- 30/9/2026 — Dos policies de lectura estaban abiertas a "public"
-- (incluye anon = cualquiera con la key pública del bundle):
--   * clientes_yiqi "Lectura publica clientes_yiqi": CUIT, mail y
--     teléfono de todos los proveedores legibles sin login.
--   * alertas_suspendidas "usuarios logueados leen alertas suspendidas":
--     el nombre decía logueados pero la policy era to public.
-- Se restringen a authenticated. Las Edge Functions usan service_role
-- (no pasan por RLS) y el frontend lee estas tablas siempre logueado
-- (Proveedores.jsx, OrdenesPropias.jsx, Alertas).
-- ============================================================

drop policy if exists "Lectura publica clientes_yiqi" on public.clientes_yiqi;
create policy "clientes_yiqi_select_authenticated" on public.clientes_yiqi
  for select to authenticated using (true);

drop policy if exists "usuarios logueados leen alertas suspendidas" on public.alertas_suspendidas;
create policy "alertas_suspendidas_select_authenticated" on public.alertas_suspendidas
  for select to authenticated using (true);
