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
-- service_role key pegada en texto plano dentro del SQL, calcando el
-- patrón de los otros 3 jobs (que hasta hoy vivían sin versionar,
-- aplicados a mano). GitHub Push Protection bloqueó el commit al
-- detectar el secreto. Corregido: la key ya NO vive en este archivo
-- ni en ningún archivo del repo. Se lee en tiempo de ejecución desde
-- una configuración de Postgres (current_setting) que se carga UNA
-- SOLA VEZ a mano desde el SQL Editor -- ver el bloque de
-- instrucciones al final de este archivo (comentado a propósito
-- para que nadie lo ejecute sin querer, y con un placeholder en vez
-- de la key real).
--
-- CUIDADO CON DUPLICAR EN YIQI: enviar-oc-yiqi es idempotente
-- (si la orden YA tiene yiqi_id_creado, no reenvía), pero esa
-- protección no alcanza si el sweep corre EN PARALELO con el
-- fire-and-forget del frontend, antes de que cualquiera de los dos
-- haya terminado de guardar el resultado -- ahí sí podrían crearse
-- dos órdenes en YiQi para el mismo registro. Por eso el sweep solo
-- toma órdenes cuya aprobación (o creación, si no hay
-- decidida_en -- ver NuevaOC.jsx que aprueba directo sin pasar por
-- el flujo de decisión de Aris) tiene más de 5 minutos: le da de
-- sobra al fire-and-forget original margen para completar solo.
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
  service_key := current_setting('app.yiqi_functions_key', true);
  if service_key is null or service_key = '' then
    raise warning 'reintentar_ordenes_pendientes_yiqi: falta configurar app.yiqi_functions_key en la base (ver instrucciones al pie de la migration 20260819000000_yiqi_sweep_reintentos_oc.sql). Sweep saltado esta corrida.';
    return;
  end if;

  for fila in
    select id
    from ordenes_propias
    where estado = 'aprobada'
      and yiqi_id_creado is null
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
  'Sweep de red de seguridad (pg_cron): reintenta enviar-oc-yiqi para órdenes aprobadas hace más de 5 min que todavía no tienen yiqi_id_creado. Requiere la GUC app.yiqi_functions_key cargada a mano (ver comentario al pie de esta migration).';

select cron.schedule(
  'reintentar-oc-pendientes-yiqi',
  '*/10 * * * *',
  $$select public.reintentar_ordenes_pendientes_yiqi();$$
);

-- ============================================================
-- PASO MANUAL OBLIGATORIO -- correr UNA SOLA VEZ desde el SQL Editor
-- de Supabase, NUNCA agregar esto a un archivo que se commitea.
-- Reemplazar el placeholder por la service_role key real (Project
-- Settings -> API Keys -- la misma que ya usan los otros 3 cron
-- jobs):
--
--   alter database postgres set app.yiqi_functions_key = 'PEGAR_SERVICE_ROLE_KEY_ACA';
--
-- Verificar que quedó cargada:
--
--   select current_setting('app.yiqi_functions_key', true);
--
-- (ALTER DATABASE ... SET aplica a conexiones NUEVAS -- pg_cron abre
-- una conexión nueva en cada corrida, así que no hace falta reiniciar
-- nada; alcanza con correr el ALTER una vez.)
-- ============================================================
