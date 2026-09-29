-- ============================================================
-- 20260929100000_rls_ventas_mensual_yiqi_vendedor.sql
-- ============================================================
-- Motivo (29/9/2026): 20260911170000_ventas_mensual_yiqi_vendedor.sql
-- creo la tabla public.ventas_mensual_yiqi_vendedor (ventas por SKU/mes
-- POR VENDEDOR, con nombres de empleados) SIN "enable row level
-- security" y sin politicas. En Supabase una tabla de public sin RLS
-- queda legible/escribible por cualquiera con la anon key via REST.
-- Ademas upsert_ventas_mensual_yiqi_vendedor(jsonb) es SECURITY DEFINER
-- y, por el default de Postgres, EXECUTE queda para PUBLIC: cualquiera
-- con la anon key podia escribir la tabla via /rpc aunque se le ponga
-- RLS. Esta migracion cierra ambas cosas.
--
-- Accesos legitimos encontrados en el repo (29/9/2026):
--   ESCRIBE:
--   - supabase/functions/sync-yiqi/index.ts:684 -> rpc
--     upsert_ventas_mensual_yiqi_vendedor con supabaseAdmin
--     (service_role, index.ts:63 y :1007). service_role ignora RLS.
--   - supabase/migrations/20260914090000_cron_ventas_vendedor.sql:43
--     sync_ventas_vendedor_cron() solo dispara sync-yiqi por HTTP con
--     la key del Vault; no toca la tabla directo.
--   LEE:
--   - public.reposicion_interna() (vigente:
--     20260914150000_reposicion_interna_pareto_sin_administrativos.sql:44,57)
--     es SECURITY INVOKER a proposito (respeta RLS de stock/material
--     por proveedor asignado). Se llama desde el frontend con el JWT
--     del usuario:
--       frontend/src/pages/ReposicionInterna.jsx:248
--       frontend/src/pages/deposito/ConfirmarRecepcion.jsx:147
--       frontend/src/pages/deposito/SolicitudesParaPreparar.jsx:225
--     y desde funciones SECURITY DEFINER (generar_reposicion_interna,
--     consolidar_remito_central), que corren como owner y no dependen
--     de esta politica.
--   - El frontend NO lee la tabla directo (sin .from() en frontend/src).
--
-- Politica elegida: SELECT para authenticated con using (true). Tiene
-- que ver TODAS las filas del vendedor excluido para cualquier SKU que
-- el usuario vea, si no el promedio de reposicion_interna() cambiaria
-- segun quien lo mire. Mismo patron que composicion_articulos
-- (20260810000100_composicion_articulos_rls.sql:19-29). No se filtra
-- por proveedor: la tabla no tiene proveedor y el filtro ya lo aplica
-- material_yiqi/stock_yiqi dentro de la funcion.
-- Sin politicas de escritura: solo service_role (bypass RLS) escribe.
-- anon: sin acceso.
--
-- Rollback (solo si algo legitimo deja de andar; reabre el agujero):
--   drop policy if exists "ventas_vendedor_select_authenticated"
--     on public.ventas_mensual_yiqi_vendedor;
--   alter table public.ventas_mensual_yiqi_vendedor disable row level security;
--   grant execute on function public.upsert_ventas_mensual_yiqi_vendedor(jsonb)
--     to public;
-- ============================================================

alter table public.ventas_mensual_yiqi_vendedor enable row level security;

-- Privilegios de tabla: anon nada; authenticated solo lectura;
-- service_role completo (el sync escribe via RPC SECURITY DEFINER,
-- pero se deja explicito).
revoke all on public.ventas_mensual_yiqi_vendedor from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.ventas_mensual_yiqi_vendedor from authenticated;
grant select on public.ventas_mensual_yiqi_vendedor to authenticated;
grant all on public.ventas_mensual_yiqi_vendedor to service_role;

drop policy if exists "ventas_vendedor_select_authenticated"
  on public.ventas_mensual_yiqi_vendedor;
create policy "ventas_vendedor_select_authenticated"
  on public.ventas_mensual_yiqi_vendedor
  for select
  to authenticated
  using (true);

-- RPC de escritura: solo service_role (sync-yiqi).
revoke execute on function public.upsert_ventas_mensual_yiqi_vendedor(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_ventas_mensual_yiqi_vendedor(jsonb)
  to service_role;
