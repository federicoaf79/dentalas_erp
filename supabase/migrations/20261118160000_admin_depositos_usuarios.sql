-- ============================================================
-- 20261118160000_admin_depositos_usuarios.sql — 18/11/2026
-- ============================================================
-- Radiografía en vivo del 18/11: en "Usuarios y accesos" no se veía qué
-- depósito tiene cada cuenta de depósito ni se podía asignar. La tabla
-- public.usuario_deposito solo tiene la policy "cada usuario lee sus
-- asignaciones de deposito" (SELECT de las propias), así que el admin no
-- puede leer ni escribir las ajenas desde el frontend.
--
-- Se agregan dos RPC security definer, solo para es_admin():
--   admin_depositos_usuarios()                      -> todas las asignaciones
--   admin_asignar_deposito(usuario, deposito, acc)  -> 'agregar' | 'quitar'
-- Solo se puede asignar a cuentas con rol 'deposito' (usuarios_config) y
-- a los depósitos 155 (Local) y 157 (Central) (check de la tabla).
-- Idempotente (create or replace). No cambia policies ni datos.
-- ============================================================

create or replace function public.admin_depositos_usuarios()
returns table (usuario_id uuid, deposito_id integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede ver las asignaciones de depósito';
  end if;
  return query
    select ud.usuario_id, ud.deposito_id
    from public.usuario_deposito ud
    order by ud.usuario_id, ud.deposito_id;
end;
$$;

create or replace function public.admin_asignar_deposito(
  p_usuario uuid,
  p_deposito integer,
  p_accion text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede asignar depósitos';
  end if;
  if p_deposito not in (155, 157) then
    raise exception 'Depósito inválido: % (solo 155 Local o 157 Central)', p_deposito;
  end if;
  if p_accion not in ('agregar', 'quitar') then
    raise exception 'Acción inválida: % (agregar o quitar)', p_accion;
  end if;
  if not exists (
    select 1 from public.usuarios_config
    where user_id = p_usuario and rol = 'deposito'
  ) then
    raise exception 'El usuario no es una cuenta de depósito';
  end if;

  if p_accion = 'agregar' then
    insert into public.usuario_deposito (usuario_id, deposito_id)
    values (p_usuario, p_deposito)
    on conflict (usuario_id, deposito_id) do nothing;
  else
    delete from public.usuario_deposito
    where usuario_id = p_usuario and deposito_id = p_deposito;
  end if;
end;
$$;

revoke all on function public.admin_depositos_usuarios() from public, anon;
revoke all on function public.admin_asignar_deposito(uuid, integer, text) from public, anon;
grant execute on function public.admin_depositos_usuarios() to authenticated;
grant execute on function public.admin_asignar_deposito(uuid, integer, text) to authenticated;

-- ------------------------------------------------------------
-- Verificación (solo lectura)
-- ------------------------------------------------------------
-- 1) Deben figurar las 2 funciones, security definer (true) y sin EXECUTE para anon:
-- select p.proname, p.prosecdef,
--        has_function_privilege('anon', p.oid, 'execute') as anon_puede
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('admin_depositos_usuarios', 'admin_asignar_deposito');
-- Esperado: 2 filas, prosecdef = true, anon_puede = false.
--
-- 2) Asignaciones actuales (en el SQL Editor auth.uid() es NULL, así que las RPC
--    se prueban logueado en la app; esta consulta directa sí sirve):
-- select u.email, ud.deposito_id
-- from public.usuario_deposito ud join auth.users u on u.id = ud.usuario_id
-- order by u.email;
-- Esperado: central@... -> 157 y local@... -> 155.
