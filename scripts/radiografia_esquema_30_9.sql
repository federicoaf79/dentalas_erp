-- ============================================================
-- scripts/radiografia_esquema_30_9.sql — SOLO LECTURA, no cambia nada.
-- Genera, desde el catálogo de producción, el DDL de cada tabla de
-- public (columnas, constraints, índices, RLS, policies, triggers),
-- las funciones de trigger, los crons (con keys tapadas) y un control
-- del total de unidades pendientes en ordenes_yiqi.
-- Reemplaza el baseline con Docker/pg_dump: con la salida se escriben
-- las migraciones de lo que se creó a mano en producción.
-- Dónde: Supabase → SQL Editor (proyecto hsfudsnmooaesrzdwecg).
-- ============================================================
with tablas as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
),
ddl as (
  select t.relname,
    'create table if not exists public.' || quote_ident(t.relname) || ' (' || E'\n  ' ||
    (select string_agg(
        quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
        || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')
        || case when a.attnotnull then ' not null' else '' end,
        E',\n  ' order by a.attnum)
     from pg_attribute a
     left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped)
    || coalesce(E',\n  ' || (select string_agg('constraint ' || quote_ident(co.conname) || ' ' || pg_get_constraintdef(co.oid), E',\n  ' order by co.contype desc, co.conname)
                           from pg_constraint co where co.conrelid = t.oid), '')
    || E'\n);'
    || coalesce(E'\n' || (select string_agg(pg_get_indexdef(i.indexrelid) || ';', E'\n' order by 1)
                        from pg_index i
                        where i.indrelid = t.oid
                          and not exists (select 1 from pg_constraint co where co.conindid = i.indexrelid)), '')
    || case when t.relrowsecurity then E'\nalter table public.' || quote_ident(t.relname) || ' enable row level security;' else '' end
    || coalesce(E'\n' || (select string_agg(
          'create policy ' || quote_ident(p.policyname) || ' on public.' || quote_ident(t.relname)
          || ' as ' || p.permissive || ' for ' || p.cmd || ' to ' || array_to_string(p.roles, ', ')
          || coalesce(' using (' || p.qual || ')', '') || coalesce(' with check (' || p.with_check || ')', '') || ';',
          E'\n' order by p.policyname)
        from pg_policies p where p.schemaname = 'public' and p.tablename = t.relname), '')
    || coalesce(E'\n' || (select string_agg(pg_get_triggerdef(tg.oid) || ';', E'\n' order by tg.tgname)
                        from pg_trigger tg where tg.tgrelid = t.oid and not tg.tgisinternal), '')
    as detalle
  from tablas t
)
select 'tabla' as seccion, relname as nombre, detalle from ddl
union all
select 'funcion_de_trigger', p.proname,
  regexp_replace(regexp_replace(regexp_replace(pg_get_functiondef(p.oid),
    '(Bearer\s+)[A-Za-z0-9._\-]+', '\1***', 'g'),
    'sb_secret_[A-Za-z0-9_\-]+', 'sb_secret_***', 'g'),
    'eyJ[A-Za-z0-9._\-]+', 'eyJ***', 'g')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid in (select tg.tgfoid from pg_trigger tg where not tg.tgisinternal)
union all
select 'cron', j.jobid || ' ' || j.jobname,
  j.schedule || ' | activo=' || j.active || ' | usa_vault=' || (j.command ilike '%vault%') || E'\n' ||
  regexp_replace(regexp_replace(regexp_replace(j.command,
    '(Bearer\s+)[A-Za-z0-9._\-]+', '\1***', 'g'),
    'sb_secret_[A-Za-z0-9_\-]+', 'sb_secret_***', 'g'),
    'eyJ[A-Za-z0-9._\-]+', 'eyJ***', 'g')
from cron.job j
union all
select 'funcion', p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('upsert_ventas_mensual_yiqi', 'upsert_ventas_mensual_yiqi_vendedor')
union all
select 'control', 'unidades_pendientes_ordenes_yiqi',
  'suma cantidad_pendiente = ' || coalesce(sum(cantidad_pendiente), 0) || ' | OC distintas = ' || count(distinct nro_oc)
from public.ordenes_yiqi
order by 1, 2;
