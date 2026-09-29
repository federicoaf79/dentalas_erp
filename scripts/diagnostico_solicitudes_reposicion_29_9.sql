-- Diagnóstico 29/9/2026 — solicitudes Central→Local trabadas (#2, #7) y cron jobid 15.
-- Solo lectura: no modifica nada. SQL Editor de Supabase, proyecto hsfudsnmooaesrzdwecg.
with enc as (
  select s.id, s.remito_numero, s.estado, s.generada_por, s.creada_en, s.procesada_en,
         count(l.id) as lineas,
         count(l.id) filter (where l.estado_linea = 'reservada') as reservadas,
         count(l.id) filter (where l.estado_linea = 'declarada' and coalesce(l.cantidad_enviada,0) > 0) as declaradas_con_envio,
         count(l.id) filter (where l.estado_linea = 'declarada' and coalesce(l.cantidad_enviada,0) = 0) as declaradas_no_hay,
         count(l.id) filter (where l.estado_linea = 'recibida') as recibidas,
         count(l.id) filter (where l.estado_linea not in ('reservada','declarada','recibida')) as otro_estado,
         count(l.id) filter (where l.estado_linea = 'recibida' and l.yiqi_movimiento_id is null) as recibidas_sin_mov_yiqi,
         count(l.id) filter (where l.yiqi_error is not null) as con_error_yiqi,
         coalesce(sum(l.cantidad_enviada) filter (where l.estado_linea = 'declarada'), 0) as unidades_en_transito
  from public.solicitudes_reposicion s
  left join public.solicitudes_reposicion_lineas l on l.solicitud_id = s.id
  where s.deposito_origen_id = 157 and s.deposito_destino_id = 155
    and s.estado <> 'reemplazada'
  group by s.id
)
select '1_encabezado' as seccion, id as ref, to_jsonb(enc) as detalle from enc
union all
select '2_linea_#' || l.solicitud_id, l.id,
       jsonb_build_object('sku', l.sku, 'mate_nombre', l.mate_nombre, 'estado_linea', l.estado_linea,
         'solicitada', l.cantidad_solicitada, 'enviada', l.cantidad_enviada, 'recibida', l.cantidad_recibida,
         'motivo_sin_stock', l.motivo_sin_stock, 'yiqi_movimiento_id', l.yiqi_movimiento_id,
         'yiqi_enviado_en', l.yiqi_enviado_en, 'yiqi_error', l.yiqi_error,
         'tiene_mov_yiqi', l.yiqi_movimiento_id is not null)
from public.solicitudes_reposicion_lineas l
where l.solicitud_id in (2, 7)
union all
select '3_cron_job', j.jobid, jsonb_build_object('jobname', j.jobname, 'schedule', j.schedule, 'active', j.active)
from cron.job j where j.jobid = 15
union all
select * from (
  select '4_cron_run', d.runid::bigint,
         jsonb_build_object('status', d.status, 'start_time', d.start_time, 'end_time', d.end_time, 'return_message', d.return_message)
  from cron.job_run_details d where d.jobid = 15
  order by d.start_time desc limit 10
) ult
union all
select '5_check_constraint', c.oid::bigint,
       jsonb_build_object('tabla', c.conrelid::regclass::text, 'nombre', c.conname, 'def', pg_get_constraintdef(c.oid))
from pg_constraint c
where c.conrelid in ('public.solicitudes_reposicion'::regclass, 'public.solicitudes_reposicion_lineas'::regclass)
  and c.contype = 'c'
union all
select '6_trigger', t.oid::bigint,
       jsonb_build_object('tabla', t.tgrelid::regclass::text, 'def', pg_get_triggerdef(t.oid))
from pg_trigger t
where t.tgrelid in ('public.solicitudes_reposicion'::regclass, 'public.solicitudes_reposicion_lineas'::regclass)
  and not t.tgisinternal
union all
select '7_funcion', p.oid::bigint,
       jsonb_build_object('firma', p.oid::regprocedure::text, 'def', pg_get_functiondef(p.oid))
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('confirmar_recepcion_linea', 'declarar_linea_reposicion', 'crear_solicitud_reposicion',
                    'crear_remito_reposicion_manual', 'cerrar_solicitud_reposicion_si_completa')
union all
select '8_estados_linea_distintos', count(*), jsonb_build_object('estado_linea', l.estado_linea)
from public.solicitudes_reposicion_lineas l group by l.estado_linea
order by 1, 2;
