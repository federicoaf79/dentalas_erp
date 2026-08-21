-- ============================================================
-- 20260821120000_movimientos_stock_pgnet_timeout.sql
-- Fix: net.http_post tiene un timeout por default de 5 SEGUNDOS
-- ============================================================
--
-- Encontrado el 21/8/2026 revisando net._http_response tras la
-- primera prueba en vivo del cron de movimientos: ninguna de las
-- migraciones del proyecto (stock, precios, sweep de reintentos OC)
-- fija `timeout_milliseconds` en su llamada a net.http_post -- todas
-- corren con el default de pg_net, que son 5000ms. Los syncs chicos
-- zafan porque terminan rápido (stock: ~3s para 7.151 filas), pero
-- el backfill de movimientos pide hasta 300 páginas SEGUIDAS a YiQi
-- (~300 x 200-500ms = 60-150s) -- muy por encima de 5s.
--
-- No se sabe con certeza si un timeout de pg_net corta la ejecución
-- de la Edge Function del lado de Deno (podría seguir corriendo en
-- background igual) o si además cierra la conexión de forma que la
-- función se corta a medias -- no vale la pena arriesgarlo: se fija
-- un timeout explícito de 120s (margen bajo el límite de ~150s de
-- una invocación de Edge Function) SOLO para este cron, que es el
-- único con syncs realmente largos por ahora.
--
-- NOTA para más adelante: el mismo problema probablemente afecta a
-- reintentar-oc-pendientes-yiqi (sweep cada 10 min) y quizás a otros
-- crons del proyecto -- se vieron timeouts de 5000ms en net._http_response
-- en esos horarios también. No se tocan acá (fuera del alcance de
-- esta migración) porque sus Edge Functions son rápidas en el caso
-- normal y esto no bloquea nada hoy -- queda anotado para revisar si
-- alguna vez se ve un síntoma real (OC que no se reintenta, etc.).
-- ============================================================

create or replace function public.sync_movimientos_stock_cron()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  service_key text;
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'yiqi_functions_key'
  limit 1;

  if service_key is null or service_key = '' then
    raise warning 'sync_movimientos_stock_cron: falta el secreto "yiqi_functions_key" en Supabase Vault. Sync salteado esta corrida.';
    return;
  end if;

  perform net.http_post(
    url := 'https://hsfudsnmooaesrzdwecg.supabase.co/functions/v1/sync-yiqi?entidad=movimientos',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );
end;
$$;

comment on function public.sync_movimientos_stock_cron() is
  'Dispara sync-yiqi?entidad=movimientos cada 15 min. timeout_milliseconds=120000 (default de pg_net es 5000ms, insuficiente para el backfill de hasta 300 páginas -- ver esta migración). Durante el backfill inicial cada corrida avanza un tramo más; una vez que cruza el corte de antigüedad o llega al final, pasa sola a modo incremental.';
