-- ============================================================
-- 20260914090000_cron_ventas_vendedor.sql
-- ============================================================
-- Federico, 14/9/2026: automatizar el sync de ventas por vendedor
-- (smartie 2369, usado para excluir a Patricia Bazan del promedio de
-- reposicion_interna() -- ver 20260911170000_ventas_mensual_yiqi_vendedor.sql
-- y 20260911180000_reposicion_interna_excluye_patricia.sql) en vez de
-- correrlo a mano.
--
-- Hasta ahora entidad=ventas_vendedor solo se invocaba manualmente.
-- Esta migracion agrega un cron job nuevo, dedicado, siguiendo
-- exactamente el mismo patron que los jobs existentes (jobid 3/4/5:
-- net.http_post directo contra sync-yiqi con la Authorization Bearer
-- de la service_role key nueva, sb_secret_...).
--
-- Horario: 6:35am, 5 minutos DESPUES de sync-ventas-diario (jobid 5,
-- 6:30am) -- a proposito, no arbitrario. Ya hubo un incidente real
-- (17-18/8/2026, ver PROMPT_CONTINUIDAD_Dentalab-Compras.md) donde
-- invocar varias Edge Functions casi al mismo tiempo hizo colisionar
-- la renovacion del token de YiQi (solo permite 1 refresh_token vivo
-- por usuario). Separar 5 minutos evita que ventas y ventas_vendedor
-- disparen una renovacion simultanea.
--
-- NO se toca ningun cron existente. NO se agrega esto a
-- sync-material-cada-15-min ni a ningun job de 15 min -- ventas (la
-- 2353) sincroniza 1 vez por dia, y ventas_vendedor sigue el mismo
-- ritmo que su contraparte por el mismo motivo (smartie derivada de
-- la misma entidad REPORTE_DE_VENTAS).
-- ============================================================

-- ------------------------------------------------------------
-- CORRECCION 28/9/2026: la version original de este archivo tenia la
-- service_role key (sb_secret_...) pegada en texto plano en el header
-- Authorization del cron. GitHub Push Protection bloqueo el push.
-- Se reemplazo por el mismo patron que ya usan los otros crons del
-- repo (ej. 20260821120000_movimientos_stock_pgnet_timeout.sql): una
-- funcion que lee la key desde Supabase Vault ('yiqi_functions_key')
-- en cada corrida. La key nunca queda en el repo ni en cron.job.
-- Para aplicarlo sobre el job que ya existe en prod se desagenda el
-- job viejo y se vuelve a agendar con el mismo nombre y horario.
-- ------------------------------------------------------------

create or replace function public.sync_ventas_vendedor_cron()
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
    raise warning 'sync_ventas_vendedor_cron: falta el secreto "yiqi_functions_key" en Supabase Vault. Sync salteado esta corrida.';
    return;
  end if;

  perform net.http_post(
    url := 'https://hsfudsnmooaesrzdwecg.supabase.co/functions/v1/sync-yiqi?entidad=ventas_vendedor',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-ventas-vendedor-diario') then
    perform cron.unschedule('sync-ventas-vendedor-diario');
  end if;
end $$;

select cron.schedule(
  'sync-ventas-vendedor-diario',
  '35 6 * * *',
  $$ select public.sync_ventas_vendedor_cron(); $$
);
