-- ============================================================
-- 20261110121000_estado_automatismos.sql — 10/11/2026
-- Radiografía UX (ítem 18): el frontend no puede leer cron.job, así que
-- esta función expone SOLO si los dos crons de reposición están activos.
-- Las pantallas de Reposición Central-Local y de Depósito la usan para
-- avisar "la reposición automática está pausada: solo pedidos manuales".
--
-- SECURITY DEFINER (lee cron.job, que el rol authenticated no puede leer).
-- Si el job no existe devuelve false. Idempotente (create or replace).
-- ============================================================

create or replace function public.estado_automatismos()
returns jsonb
language sql
stable
security definer
set search_path = public, cron
as $function$
  select jsonb_build_object(
    'reposicion_central_activa',
      coalesce((select bool_or(j.active) from cron.job j where j.jobname = 'evaluar-reglas-reposicion-central'), false),
    'reposicion_interna_activa',
      coalesce((select bool_or(j.active) from cron.job j where j.jobname = 'generar-reposicion-interna-diario'), false)
  );
$function$;

revoke all on function public.estado_automatismos() from public, anon;
grant execute on function public.estado_automatismos() to authenticated;

-- Verificación (SQL Editor de Supabase, proyecto hsfudsnmooaesrzdwecg):
--   select public.estado_automatismos();
-- Esperado hoy (jobs 15 y 10 pausados): {"reposicion_central_activa": false, "reposicion_interna_activa": false}
-- Nota: en el SQL Editor funciona (auth.uid() no interviene); en el navegador,
-- ver el aviso en /?page=reposicion-central-local logueado como admin.
