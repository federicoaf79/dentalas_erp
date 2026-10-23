-- ============================================================
-- 20260801000100_declaraciones_causa_tabla.sql — escrita el 23/10/2026
-- ============================================================
-- Versiona la tabla declaraciones_causa, que se creó a mano en
-- producción y nunca tuvo un CREATE TABLE ejecutable en ninguna
-- migración: 20260822000000 solo la documentaba en un comentario, y el
-- baseline 20260801000000 no la incluye. Riesgo "Esquema sin
-- migrations" de Tulkas (HIGH), confirmado en el repo el 18/10/2026.
--
-- Estructura tomada de producción el 23/10/2026 (information_schema,
-- pg_constraint, pg_indexes, pg_policies), corrida por Federico en el
-- SQL Editor. La identidad "generated always" sale de la verificación
-- en vivo del 22/8/2026 (comentario de 20260822000000).
--
-- Lleva fecha 1/8 para quedar después del baseline (catalogo_causas y
-- ordenes_propias) y antes de 20260822000000 (referencia_texto) y
-- 20260904170000 (archivada_en/por), que agregan sus columnas con
-- "add column if not exists".
--
-- Idempotente: en producción no cambia nada (la tabla, los índices y
-- las 4 policies ya existen). Solo sirve para que una base nueva quede
-- igual a producción.
-- ============================================================

create table if not exists public.declaraciones_causa (
  id            bigint generated always as identity primary key,
  ambito        text not null check (ambito = any (array['stock'::text, 'entrega'::text, 'compra'::text])),
  causa_id      bigint references public.catalogo_causas(id),
  mate_codigo   text,
  nro_oc        text,
  orden_propia  bigint references public.ordenes_propias(id) on delete cascade,
  nota          text,
  declarada_por uuid not null references auth.users(id),
  declarada_en  timestamptz not null default now()
);

create index if not exists ix_decl_causa_mate on public.declaraciones_causa using btree (mate_codigo);
create index if not exists ix_decl_causa_oc   on public.declaraciones_causa using btree (nro_oc);

alter table public.declaraciones_causa enable row level security;

do $b$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'declaraciones_causa' and policyname = 'todos leen declaraciones') then
    create policy "todos leen declaraciones" on public.declaraciones_causa for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'declaraciones_causa' and policyname = 'todos declaran') then
    create policy "todos declaran" on public.declaraciones_causa for insert with check (declarada_por = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'declaraciones_causa' and policyname = 'cada uno edita lo suyo') then
    create policy "cada uno edita lo suyo" on public.declaraciones_causa for update using ((declarada_por = auth.uid()) or public.es_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'declaraciones_causa' and policyname = 'cada uno borra lo suyo') then
    create policy "cada uno borra lo suyo" on public.declaraciones_causa for delete using ((declarada_por = auth.uid()) or public.es_admin());
  end if;
end $b$;
