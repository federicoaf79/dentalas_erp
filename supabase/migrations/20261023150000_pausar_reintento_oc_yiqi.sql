-- ============================================================
-- 20261023150000_pausar_reintento_oc_yiqi.sql — 23/10/2026
-- ============================================================
-- Federico, 23/10/2026: "No autorizamos a pasar a Live la herramienta
-- de momento". La investigación del mismo día (SQL de solo lectura en
-- producción, net._http_response) mostró que el cron
-- reintentar-oc-pendientes-yiqi (jobid 6, cada 10 min) seguía
-- llamando a enviar-oc-yiqi para:
--   - #2 (BUDA PABLO, aprobada 31/7): la frena la validación local de
--     costos antes de llamar a YiQi.
--   - #21 (DENTAL MEDRANO, $10.558.824, aprobada por Aris el 20/10 y
--     ARCHIVADA ese mismo día): POST /ORDEN_DE_COMPRA real cada 10 min,
--     YiQi responde 400. Si la causa del 400 desaparece, la OC se crearía
--     en YiQi sin que nadie la vuelva a aprobar.
--
-- Qué hace:
-- 1) Pausa el cron (reversible: cron.alter_job(..., active := true)).
-- 2) El barrido deja de considerar órdenes archivadas (archivada_en),
--    para que, si se reactiva, nunca mande algo que está en la papelera.
--    Cuerpo idéntico al de 20260819000000 salvo ese filtro. Los permisos
--    de 20260930130000 (EXECUTE revocado) se mantienen: CREATE OR REPLACE
--    no toca los GRANT.
--
-- NO apaga el envío al aprobar desde la pantalla (OrdenesPropias.jsx /
-- NuevaOC.jsx). Eso necesita un interruptor en las Edge Functions.
-- ============================================================

select cron.alter_job(jobid, active := false)
from cron.job
where jobname = 'reintentar-oc-pendientes-yiqi';

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
      and archivada_en is null   -- 23/10/2026: nunca reenviar algo que está en la papelera
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
