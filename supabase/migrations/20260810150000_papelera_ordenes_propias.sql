-- ============================================================
-- Papelera para ordenes_propias
-- ============================================================
-- Objetivo: en vez de borrar directo una orden (irreversible), Aris
-- la archiva (reversible) y despues decide si la restaura o la
-- elimina definitivamente. No toca la columna `estado` existente
-- (borrador/pendiente/aprobada/rechazada) para no romper la logica
-- de aprobacion que ya depende de esos 4 valores exactos en
-- OrdenesPropias.jsx y NuevaOC.jsx.
-- ============================================================

alter table public.ordenes_propias
  add column if not exists archivada_en timestamptz,
  add column if not exists archivada_por uuid references auth.users(id);

-- ------------------------------------------------------------
-- nombres_usuarios: para mostrar "creada por Ivana" en cada fila.
--
-- Por que hace falta esta funcion: usuarios_config tiene RLS que
-- limita a cada usuario a leer SOLO su propia fila (ver usePermisos.js).
-- Un join directo desde el frontend (ordenes_propias.creada_por ->
-- usuarios_config) fallaria en silencio para cualquier orden creada
-- por OTRO usuario: Aris no podria ver el nombre de Ivana ni
-- viceversa. Esta funcion, con el mismo patron que es_admin() /
-- mis_codigos_proveedor(), expone UNICAMENTE el nombre (nada
-- sensible) sin saltarse el resto de RLS de la tabla.
-- ------------------------------------------------------------
create or replace function public.nombres_usuarios(p_ids uuid[])
returns table(user_id uuid, nombre text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select uc.user_id, uc.nombre
  from public.usuarios_config uc
  where uc.user_id = any(p_ids);
$function$;

grant execute on function public.nombres_usuarios(uuid[]) to authenticated;
