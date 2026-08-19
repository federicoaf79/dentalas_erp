-- ============================================================
-- 20260819000000_yiqi_sweep_reintentos_oc.sql
-- Dentalab-Compras — red de seguridad: reintenta el envío a YiQi
-- de órdenes aprobadas que quedaron sin yiqi_id_creado
-- ============================================================
--
-- CONTEXTO: enviar-oc-yiqi se dispara "fire and forget" desde el
-- frontend justo después de aprobar una orden (OrdenesPropias.jsx
-- -> confirmarDecision(), NuevaOC.jsx -> guardarOrden()). Si esa
-- llamada nunca llega a hacerse o falla (pestaña cerrada, red
-- cortada, error transitorio de YiQi), la orden queda aprobada
-- localmente pero sin yiqi_id_creado, sin que nadie se entere hasta
-- que alguien mire manualmente. Esta función + cron job barre
-- periódicamente las órdenes en esa situación y reintenta.
--
-- Mismo patrón que los otros 3 cron jobs ya en producción
-- (sync-material-cada-15-min, sync-oc-y-clientes-diario,
-- sync-ventas-diario): pg_net llamando a la Edge Function con la
-- service_role key.
--
-- SEGURIDAD (19/8/2026): la primera versión de este archivo traía la
-- service_role key pegada en texto plano -- GitHub Push Protection
-- bloqueó el commit. El segundo intento la sacaba a una GUC de
-- Postgres (current_setting + ALTER DATABASE ... SET), pero el SQL
-- Editor de Supabase no tiene permiso para correr ALTER DATABASE
-- (42501: permission denied). Solución final: Supabase Vault
-- (extensión "supabase_vault", ya viene habilitada en todo proyecto
-- Supabase) -- pensada justo para este caso: guardar un secreto una
-- vez, encriptado, y leerlo desde una función SECURITY DEFINER sin
-- que el valor real pise ningún archivo del repo.
-- ============================================================

create or replace function public.reintentar_ordenes_pendientes_yiqi()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fila record;
  service_key text;
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'yiqi_functions_key'
  limit 1;

  if service_key is null or service_key = '' then
    raise warning 'reintentar_ordenes_pendientes_yiqi: falta cargar el secreto "yiqi_functions_key" en Supabase Vault (ver instrucciones al pie de la migration 20260819000000_yiqi_sweep_reintentos_oc.sql). Sweep saltado esta corrida.';
    return;
  end if;

  for fila in
    select id
    from ordenes_propias
    where estado = 'aprobada'
      and yiqi_id_creado is null
      -- No reintentar en loop tight si algo esta sistemáticamente roto:
      -- solo órdenes aprobadas hace más de 5 minutos, para no pisar el
      -- fire-and-forget que el frontend acaba de disparar (ver nota de
      -- "CUIDADO CON DUPLICAR" mas abajo).
      and coalesce(decidida_en, creada_en) < now() - interval '5 minutes'
  loop
    perform net.http_post(
      url := 'https://hsfudsnmooaesrzdwecg.supabase.co/functions/v1/enviar-oc-yiqi',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('orden_id', fila.id)
    );
  end loop;
end;
$$;

comment on function public.reintentar_ordenes_pendientes_yiqi() is
  'Sweep de red de seguridad (pg_cron): reintenta enviar-oc-yiqi para órdenes aprobadas hace más de 5 min que todavía no tienen yiqi_id_creado. Requiere el secreto "yiqi_functions_key" cargado en Supabase Vault (ver comentario al pie de esta migration).';

select cron.schedule(
  'reintentar-oc-pendientes-yiqi',
  '*/10 * * * *',
  $$select public.reintentar_ordenes_pendientes_yiqi();$$
);

-- ============================================================
-- CUIDADO CON DUPLICAR EN YIQI: enviar-oc-yiqi es idempotente (si la
-- orden YA tiene yiqi_id_creado, no reenvía), pero esa protección no
-- alcanza si el sweep corre EN PARALELO con el fire-and-forget del
-- frontend, antes de que cualquiera de los dos haya terminado de
-- guardar el resultado. El filtro de "más de 5 minutos" de arriba es
-- lo que evita esa carrera.
-- ============================================================

-- ============================================================
-- PASO MANUAL OBLIGATORIO -- correr UNA SOLA VEZ desde el SQL Editor
-- de Supabase, NUNCA agregar esto a un archivo que se commitea.
-- Reemplazar el placeholder por la service_role key real (Project
-- Settings -> API Keys -- la misma que ya usan los otros 3 cron
-- jobs):
--
--   select vault.create_secret(
--     'PEGAR_SERVICE_ROLE_KEY_ACA',
--     'yiqi_functions_key',
--     'Service role key usada por el sweep de reintentos de YiQi (pg_cron -> enviar-oc-yiqi)'
--   );
--
-- Verificar que quedó cargado (esto NO expone el valor desencriptado,
-- solo confirma que el secreto existe):
--
--   select id, name, description, created_at from vault.secrets where name = 'yiqi_functions_key';
--
-- Si en algún momento hay que rotar la key, "vault.create_secret" con
-- el mismo "name" falla (ya existe) -- usar en cambio:
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'yiqi_functions_key'),
--     'NUEVA_KEY_ACA'
--   );
-- ============================================================
