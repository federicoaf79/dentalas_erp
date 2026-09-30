-- ============================================================
-- 30/9/2026 — Crons de sync de material (jobid 3), OC + clientes
-- (jobid 4) y ventas (jobid 5) pasan a leer la key de Supabase Vault.
--
-- Hasta hoy los tres tenían la service key escrita literal dentro de
-- cron.job (radiografía del 30/9: usa_vault=false). Mismo patrón que
-- sync_ventas_vendedor_cron() (migración 20260914090000): una función
-- SECURITY DEFINER lee 'yiqi_functions_key' de Vault y llama a la Edge
-- Function. Paso previo para rotar la service key: después de esto,
-- rotarla = actualizar el secreto de Vault, sin tocar los crons.
--
-- Además todos llevan timeout de 120 s (antes: default de pg_net, 5 s,
-- que cortaba la espera del sync de ventas).
-- Horarios sin cambios. Los jobid cambian (unschedule + schedule).
-- ============================================================

create or replace function public._llamar_sync_yiqi(p_entidad text)
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
    raise warning 'sync-yiqi (%): falta el secreto "yiqi_functions_key" en Supabase Vault. Sync salteado esta corrida.', p_entidad;
    return;
  end if;

  perform net.http_post(
    url := 'https://hsfudsnmooaesrzdwecg.supabase.co/functions/v1/sync-yiqi?entidad=' || p_entidad,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );
end;
$$;

create or replace function public.sync_material_cron()
returns void language sql security definer set search_path = public
as $$ select public._llamar_sync_yiqi('material'); $$;

create or replace function public.sync_oc_y_clientes_cron()
returns void language sql security definer set search_path = public
as $$
  select public._llamar_sync_yiqi('oc');
  select public._llamar_sync_yiqi('clientes');
$$;

create or replace function public.sync_ventas_cron()
returns void language sql security definer set search_path = public
as $$ select public._llamar_sync_yiqi('ventas'); $$;

-- Nadie fuera de postgres/cron las necesita invocar.
revoke all on function public._llamar_sync_yiqi(text) from public, anon, authenticated;
revoke all on function public.sync_material_cron() from public, anon, authenticated;
revoke all on function public.sync_oc_y_clientes_cron() from public, anon, authenticated;
revoke all on function public.sync_ventas_cron() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-material-cada-15-min') then
    perform cron.unschedule('sync-material-cada-15-min');
  end if;
  if exists (select 1 from cron.job where jobname = 'sync-oc-y-clientes-diario') then
    perform cron.unschedule('sync-oc-y-clientes-diario');
  end if;
  if exists (select 1 from cron.job where jobname = 'sync-ventas-diario') then
    perform cron.unschedule('sync-ventas-diario');
  end if;
end $$;

select cron.schedule('sync-material-cada-15-min', '*/15 * * * *', $$ select public.sync_material_cron(); $$);
select cron.schedule('sync-oc-y-clientes-diario', '0 6 * * *', $$ select public.sync_oc_y_clientes_cron(); $$);
select cron.schedule('sync-ventas-diario', '30 6 * * *', $$ select public.sync_ventas_cron(); $$);
