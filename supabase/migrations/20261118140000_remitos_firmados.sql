-- ============================================================
-- 18/11/2026 — Copia firmada del remito entre depósitos
-- ============================================================
-- Aris preguntó si los remitos a firmar entre Central y Local están
-- contemplados. El remito se imprime (pdfRemito.js) pero la copia firmada
-- no quedaba en el sistema. Esta migración agrega:
--   1. Bucket privado `remitos-firmados` (10 MB; jpeg/png/webp/heic/pdf).
--      Path: <solicitud_id>/<timestamp>-<nombre_saneado>
--   2. Policies de storage.objects: SELECT e INSERT para admin o para quien
--      tenga el depósito origen o destino de la solicitud. Sin UPDATE ni
--      DELETE (append-only).
--   3. Tabla public.remitos_firmados + RPC registrar_remito_firmado().
-- Idempotente. No toca YiQi.
-- ============================================================

-- 1) Bucket privado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('remitos-firmados', 'remitos-firmados', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

-- 2) Función de permiso por path (casteo seguro del primer segmento)
create or replace function public.puede_ver_remito_firmado(p_solicitud_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.es_admin(), false) or exists (
    select 1 from public.solicitudes_reposicion s
    where s.id = p_solicitud_id
      and (s.deposito_origen_id in (select public.mis_depositos())
           or s.deposito_destino_id in (select public.mis_depositos()))
  );
$$;
revoke execute on function public.puede_ver_remito_firmado(bigint) from public, anon;
grant execute on function public.puede_ver_remito_firmado(bigint) to authenticated;

-- 3) Policies sobre storage.objects (solo este bucket)
drop policy if exists "remitos firmados: ver" on storage.objects;
create policy "remitos firmados: ver" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'remitos-firmados'
    and (storage.foldername(name))[1] ~ '^[0-9]{1,18}$'
    and public.puede_ver_remito_firmado(((storage.foldername(name))[1])::bigint)
  );

drop policy if exists "remitos firmados: subir" on storage.objects;
create policy "remitos firmados: subir" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'remitos-firmados'
    and (storage.foldername(name))[1] ~ '^[0-9]{1,18}$'
    and public.puede_ver_remito_firmado(((storage.foldername(name))[1])::bigint)
  );

-- 4) Tabla de registro
create table if not exists public.remitos_firmados (
  id            bigint generated always as identity primary key,
  solicitud_id  bigint not null references public.solicitudes_reposicion(id) on delete cascade,
  storage_path  text not null unique,
  nombre_archivo text,
  tipo          text,
  tamano_bytes  bigint,
  subido_por    uuid default auth.uid(),
  subido_en     timestamptz default now(),
  nota          text
);
create index if not exists remitos_firmados_solicitud_idx on public.remitos_firmados (solicitud_id);

alter table public.remitos_firmados enable row level security;
drop policy if exists "remitos firmados: ver registro" on public.remitos_firmados;
create policy "remitos firmados: ver registro" on public.remitos_firmados
  for select to authenticated
  using (public.puede_ver_remito_firmado(solicitud_id));
-- Sin policies de insert/update/delete: solo la RPC (security definer).
revoke insert, update, delete on public.remitos_firmados from anon, authenticated;

-- 5) RPC de registro
create or replace function public.registrar_remito_firmado(
  p_solicitud_id bigint, p_path text, p_nombre text, p_tipo text,
  p_tamano bigint, p_nota text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origen int; v_destino int; v_id bigint;
begin
  select deposito_origen_id, deposito_destino_id into v_origen, v_destino
  from public.solicitudes_reposicion where id = p_solicitud_id;
  if not found then
    raise exception 'La solicitud % no existe', p_solicitud_id;
  end if;
  if auth.uid() is not null and not coalesce(
       public.es_admin()
       or v_origen in (select public.mis_depositos())
       or v_destino in (select public.mis_depositos()), false) then
    raise exception 'No tenés permiso sobre esta solicitud';
  end if;
  if p_path is null or left(p_path, length(p_solicitud_id::text) + 1) <> p_solicitud_id::text || '/' then
    raise exception 'El archivo tiene que estar en la carpeta de la solicitud %', p_solicitud_id;
  end if;
  insert into public.remitos_firmados (solicitud_id, storage_path, nombre_archivo, tipo, tamano_bytes, nota)
  values (p_solicitud_id, p_path, p_nombre, p_tipo, p_tamano, p_nota)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.registrar_remito_firmado(bigint, text, text, text, bigint, text) from public, anon;
grant execute on function public.registrar_remito_firmado(bigint, text, text, text, bigint, text) to authenticated;

-- ============================================================
-- Verificación (solo lectura)
-- ============================================================
-- select id, public, file_size_limit from storage.buckets where id = 'remitos-firmados';
--   -> 1 fila, public = false, 10485760
-- select policyname, cmd from pg_policies
--  where (schemaname='storage' and tablename='objects' and policyname like 'remitos firmados%')
--     or (schemaname='public' and tablename='remitos_firmados') order by 1;
--   -> 3 filas: ver (SELECT), subir (INSERT) en storage.objects y "ver registro" (SELECT)
-- select to_regclass('public.remitos_firmados') is not null as tabla,
--        to_regprocedure('public.registrar_remito_firmado(bigint,text,text,text,bigint,text)') is not null as rpc;
--   -> true, true
