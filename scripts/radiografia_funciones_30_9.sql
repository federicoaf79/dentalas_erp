-- Solo lectura, no cambia nada. Funciones y vistas de producción que no están versionadas en el repo.
-- Dónde: https://supabase.com/dashboard/project/hsfudsnmooaesrzdwecg/sql/new (SQL Editor, tu cuenta de Supabase)
select 'funcion' as seccion,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as nombre,
       regexp_replace(regexp_replace(regexp_replace(pg_get_functiondef(p.oid),
         '(Bearer\s+)[A-Za-z0-9._\-]+', '\1***', 'g'),
         'sb_secret_[A-Za-z0-9_\-]+', 'sb_secret_***', 'g'),
         'eyJ[A-Za-z0-9._\-]+', 'eyJ***', 'g') as detalle
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  and p.proname not in (
    '_llamar_sync_yiqi','buscar_articulos_proveedor','calcular_punto_equilibrio','candidatos_equivalencia_precios',
    'contadores_sidebar','es_administrativo','es_comprable','es_para_fraccionar','evaluar_reglas_reposicion_central',
    'generar_remito_reposicion_central','generar_remitos_reposicion','generar_reposicion_interna',
    'generar_y_declarar_remito_central','historial_ventas','marcar_reposicion_sugerida','nombres_usuarios',
    'recalcular_candidatos_equivalencia_precios','reintentar_ordenes_pendientes_yiqi','reposicion_interna',
    'sugerencias_compra','sync_material_cron','sync_movimientos_stock_cron','sync_oc_y_clientes_cron',
    'sync_precios_cron','sync_stock_cron','sync_ventas_cron','sync_ventas_vendedor_cron',
    'trg_lineas_remito_clase_abc','trigger_auto_preparar_central','upsert_ordenes_yiqi',
    'upsert_precios_proveedor_yiqi','upsert_stock_yiqi','upsert_ultimo_movimiento_stock_yiqi',
    'upsert_ventas_mensual_yiqi_vendedor','yiqi_estado_actual')
union all
select 'permisos_funcion',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end
       || ' | ejecutan: ' || coalesce((select string_agg(distinct case when a.grantee = 0 then 'public' else r.rolname end, ',')
                                       from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                       left join pg_roles r on r.oid = a.grantee
                                       where a.privilege_type = 'EXECUTE'), '-')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'vista', c.relname, pg_get_viewdef(c.oid, true)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')
order by 1, 2;
