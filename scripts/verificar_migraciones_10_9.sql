-- ============================================================
-- verificar_migraciones_10_9.sql
--
-- Mismo patrón que verificar_migraciones_21_8.sql (repo, no CLI --
-- estas migraciones también se pegaron directo en el SQL Editor, no
-- con `supabase db push`). Cubre las 4 migraciones nuevas de la
-- Unificación Eje 1 (10/9/2026), que el script del 21/8 no incluye
-- por ser posteriores.
--
-- Parte 1: existencia de cada función/trigger que las 4 migraciones
-- de supabase/migrations/2026091[2-5]0000_*.sql dicen que tiene que
-- existir.
-- Parte 2: que la versión VIVA de las funciones reemplazadas más de
-- una vez (generar_remito_reposicion_central, reposicion_interna)
-- tenga el fix de la migración más reciente que las tocó -- existir
-- no alcanza, podría ser la versión vieja (aproximada / 12 meses).
--
-- Se corre entero de una: Ctrl+A y "Run" en el SQL Editor de
-- Supabase. No modifica nada -- son todos SELECT.
-- ============================================================

-- ---------- PARTE 1: objetos que tienen que existir ----------
select 'func: generar_y_declarar_remito_central (20260910120000)' as objeto, (to_regproc('public.generar_y_declarar_remito_central') is not null) as existe
union all select 'func: trigger_auto_preparar_central (20260910120000)', (to_regproc('public.trigger_auto_preparar_central') is not null)
union all select 'trigger: trg_auto_preparar_central en solicitudes_reposicion (20260910120000)',
  exists (select 1 from pg_trigger where tgname = 'trg_auto_preparar_central' and not tgisinternal)
union all select 'func: generar_remito_reposicion_central (20260910130000, reemplazada 20260910140000)', (to_regproc('public.generar_remito_reposicion_central') is not null)
union all select 'func: reposicion_interna (reemplazada 20260910150000)', (to_regproc('public.reposicion_interna') is not null)
order by 2, 1;

-- ---------- PARTE 2: que la versión VIVA sea la más nueva ----------
select
  'generar_remito_reposicion_central usa la clasificación ABC real de reposicion_interna(), no la prioridad aproximada vieja (20260910140000, la más nueva de las 2 versiones)' as chequeo,
  (pg_get_functiondef('public.generar_remito_reposicion_central'::regproc) ilike '%reposicion_interna()%'
   and pg_get_functiondef('public.generar_remito_reposicion_central'::regproc) not ilike '%stock_local / nullif(objetivo_local%') as ok
union all
select
  'reposicion_interna calcula la ventana de venta sobre 18 meses, no 12 (20260910150000)',
  pg_get_functiondef('public.reposicion_interna'::regproc) ilike '%interval ''18 months''%'
union all
select
  'reposicion_interna divide el promedio mensual por 18, no por 12 (20260910150000)',
  pg_get_functiondef('public.reposicion_interna'::regproc) ilike '%/ 18.0%'
order by 2, 1;
