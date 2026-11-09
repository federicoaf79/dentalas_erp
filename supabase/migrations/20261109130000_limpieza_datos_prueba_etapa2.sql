-- ============================================================
-- 20261109130000_limpieza_datos_prueba_etapa2.sql — 09/11/2026
-- ============================================================
-- Limpieza de datos de prueba, ETAPA 2: borrado definitivo de las
-- órdenes de la app que están en la papelera, con respaldo previo.
-- Criterio (Federico, 23/10): todo lo que hay en la app es dato de
-- prueba; la herramienta no está aprobada para uso real.
--
-- Qué borra: #2–#12, #18 y #21, SOLO si siguen en la papelera
-- (archivada_en is not null). Sus ítems (ordenes_propias_items) y sus
-- declaraciones de causa de ámbito 'compra' (declaraciones_causa)
-- se van por ON DELETE CASCADE.
-- Qué NO toca: las activas #14, #22 y #23 (Ivana y Aris siguen
-- probando con ellas), ni nada de YiQi.
--
-- Respaldo: schema "respaldo" (no expuesto por la API de Supabase,
-- que solo publica "public"), tablas *_20261109. Para restaurar:
--   insert into public.ordenes_propias select * from respaldo.ordenes_propias_20261109;
--   insert into public.ordenes_propias_items select * from respaldo.ordenes_propias_items_20261109;
--   insert into public.declaraciones_causa select * from respaldo.declaraciones_causa_20261109;
--
-- Guarda: si aparece alguna FK hacia ordenes_propias que no sea de
-- ordenes_propias_items o declaraciones_causa, aborta sin borrar.
-- ============================================================

create schema if not exists respaldo;
revoke all on schema respaldo from public, anon, authenticated;

do $$
declare
  v_ids bigint[] := array[2,3,4,5,6,7,8,9,10,11,12,18,21];
  v_fk_extra text;
  v_borradas int;
begin
  select string_agg(conrelid::regclass::text, ', ')
    into v_fk_extra
  from pg_constraint
  where contype = 'f'
    and confrelid = 'public.ordenes_propias'::regclass
    and conrelid not in ('public.ordenes_propias_items'::regclass,
                         'public.declaraciones_causa'::regclass);
  if v_fk_extra is not null then
    raise exception 'Hay FKs hacia ordenes_propias no previstas: %. No se borra nada.', v_fk_extra;
  end if;

  drop table if exists respaldo.ordenes_propias_20261109;
  drop table if exists respaldo.ordenes_propias_items_20261109;
  drop table if exists respaldo.declaraciones_causa_20261109;

  create table respaldo.ordenes_propias_20261109 as
    select * from public.ordenes_propias
    where id = any(v_ids) and archivada_en is not null;

  create table respaldo.ordenes_propias_items_20261109 as
    select i.* from public.ordenes_propias_items i
    join respaldo.ordenes_propias_20261109 o on o.id = i.orden_id;

  create table respaldo.declaraciones_causa_20261109 as
    select d.* from public.declaraciones_causa d
    join respaldo.ordenes_propias_20261109 o on o.id = d.orden_propia;

  delete from public.ordenes_propias
  where id in (select id from respaldo.ordenes_propias_20261109);
  get diagnostics v_borradas = row_count;
  raise notice 'Órdenes borradas: %', v_borradas;
end $$;
