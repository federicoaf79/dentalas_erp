-- ============================================================
-- verificar_migraciones_21_8.sql
--
-- Chequeo de "¿está todo lo del repo aplicado en producción?".
-- No usa `supabase migration list` porque casi todas las migraciones
-- de este proyecto se aplicaron pegando el SQL directo en el SQL
-- Editor, no con `supabase db push` -- la tabla que el CLI usa para
-- llevar la cuenta (supabase_migrations.schema_migrations) nunca se
-- llenó, así que ese comando mostraría TODO como "no aplicado" aunque
-- sí lo esté. Este script en cambio pregunta directamente al catálogo
-- de Postgres: ¿existe cada tabla/función que las migraciones del
-- repo dicen que tiene que existir?
--
-- Parte 1: existencia de cada tabla/función creada por las 24
-- migraciones de supabase/migrations/ (10/8 al 21/8/2026).
-- Parte 2: para las funciones que se reemplazaron más de una vez
-- (create or replace), un chequeo de que la definición VIVA en la
-- base contiene el fix de la migración más reciente que la tocó --
-- existir no alcanza, existe puede ser también una versión vieja de
-- la función.
--
-- Se corre entero de una: seleccioná todo (Ctrl+A) y "Run" en el
-- SQL Editor de Supabase. Da dos tablas de resultado, una debajo de
-- la otra. No modifica nada -- son todos SELECT.
-- ============================================================

-- ---------- PARTE 1: objetos que tienen que existir ----------
select 'tabla: composicion_articulos (20260810000000)' as objeto, (to_regclass('public.composicion_articulos') is not null) as existe
union all select 'tabla: stock_yiqi (20260819100000)', (to_regclass('public.stock_yiqi') is not null)
union all select 'tabla: reposiciones_sugeridas (20260819130000)', (to_regclass('public.reposiciones_sugeridas') is not null)
union all select 'tabla: yiqi_token_eventos (20260820120000)', (to_regclass('public.yiqi_token_eventos') is not null)
union all select 'tabla: precios_proveedor_yiqi (20260820140000)', (to_regclass('public.precios_proveedor_yiqi') is not null)
union all select 'tabla: equivalencias_precios (20260820150000)', (to_regclass('public.equivalencias_precios') is not null)
union all select 'tabla: candidatos_equivalencia_precios_cache (20260820180000)', (to_regclass('public.candidatos_equivalencia_precios_cache') is not null)
union all select 'tabla: ultimo_movimiento_stock_yiqi (20260821110000)', (to_regclass('public.ultimo_movimiento_stock_yiqi') is not null)
union all select 'func: sugerencias_compra (20260810120000, actualizada 20260821140000)', (to_regproc('public.sugerencias_compra') is not null)
union all select 'func: historial_ventas (20260810120000)', (to_regproc('public.historial_ventas') is not null)
union all select 'func: nombres_usuarios (20260810150000)', (to_regproc('public.nombres_usuarios') is not null)
union all select 'func: buscar_articulos_proveedor (20260815160000)', (to_regproc('public.buscar_articulos_proveedor') is not null)
union all select 'func: reintentar_ordenes_pendientes_yiqi (20260819000000)', (to_regproc('public.reintentar_ordenes_pendientes_yiqi') is not null)
union all select 'func: upsert_stock_yiqi (20260819100000)', (to_regproc('public.upsert_stock_yiqi') is not null)
union all select 'func: sync_stock_cron (20260819100000)', (to_regproc('public.sync_stock_cron') is not null)
union all select 'func: reposicion_interna (20260819120000, actualizada 20260819130000 y 20260821140000)', (to_regproc('public.reposicion_interna') is not null)
union all select 'func: generar_reposicion_interna (20260819130000)', (to_regproc('public.generar_reposicion_interna') is not null)
union all select 'func: marcar_reposicion_sugerida (20260819130000)', (to_regproc('public.marcar_reposicion_sugerida') is not null)
union all select 'func: yiqi_estado_actual (20260820120000)', (to_regproc('public.yiqi_estado_actual') is not null)
union all select 'func: upsert_precios_proveedor_yiqi (20260820140000)', (to_regproc('public.upsert_precios_proveedor_yiqi') is not null)
union all select 'func: sync_precios_cron (20260820140000)', (to_regproc('public.sync_precios_cron') is not null)
union all select 'func: candidatos_equivalencia_precios (20260820150000, actualizada 3 veces más hasta 20260820180000)', (to_regproc('public.candidatos_equivalencia_precios') is not null)
union all select 'func: recalcular_candidatos_equivalencia_precios (20260820180000)', (to_regproc('public.recalcular_candidatos_equivalencia_precios') is not null)
union all select 'func: generar_remitos_reposicion (20260821090000)', (to_regproc('public.generar_remitos_reposicion') is not null)
union all select 'func: upsert_ultimo_movimiento_stock_yiqi (20260821110000, actualizada 20260821130000)', (to_regproc('public.upsert_ultimo_movimiento_stock_yiqi') is not null)
union all select 'func: sync_movimientos_stock_cron (20260821110000, actualizada 20260821120000)', (to_regproc('public.sync_movimientos_stock_cron') is not null)
union all select 'func: es_administrativo (20260821140000)', (to_regproc('public.es_administrativo') is not null)
union all select 'func: es_para_fraccionar (20260821140000)', (to_regproc('public.es_para_fraccionar') is not null)
union all select 'func: contadores_sidebar (actualizada 20260821150000)', (to_regproc('public.contadores_sidebar') is not null)
order by 2, 1;

-- ---------- PARTE 2: que la versión VIVA sea la más nueva ----------
-- (para funciones que varias migraciones fueron reemplazando)
select
  'sugerencias_compra tiene la exclusión de administrativos (20260821140000)' as chequeo,
  pg_get_functiondef('public.sugerencias_compra'::regproc) ilike '%es_administrativo%' as ok
union all
select
  'reposicion_interna tiene la exclusión de PARA FRACCIONAR (20260821140000)',
  pg_get_functiondef('public.reposicion_interna'::regproc) ilike '%es_para_fraccionar%'
union all
select
  'contadores_sidebar tiene el fix del badge de hoy (20260821150000)',
  pg_get_functiondef('public.contadores_sidebar'::regproc) ilike '%es_administrativo%'
union all
select
  'candidatos_equivalencia_precios usa la tabla de cache, no el cálculo en vivo (20260820180000, la última de las 4 versiones)',
  pg_get_functiondef('public.candidatos_equivalencia_precios'::regproc) ilike '%candidatos_equivalencia_precios_cache%'
union all
select
  'sync_movimientos_stock_cron tiene el timeout de 120s para pg_net (20260821120000, la más nueva de las 2 versiones)',
  pg_get_functiondef('public.sync_movimientos_stock_cron'::regproc) ilike '%timeout_milliseconds%'
union all
select
  'upsert_ultimo_movimiento_stock_yiqi tiene el fix de dedup por sku (20260821130000, la más nueva de las 2 versiones)',
  pg_get_functiondef('public.upsert_ultimo_movimiento_stock_yiqi'::regproc) ilike '%distinct on (sku)%'
order by 2, 1;
