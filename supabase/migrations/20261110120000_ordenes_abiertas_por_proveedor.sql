-- ============================================================
-- 10/11/2026 — radiografía UX (ítem 17): órdenes abiertas por proveedor
-- ============================================================
-- Problema: la RLS de ordenes_propias deja leer solo `es_admin() OR
-- creada_por = auth.uid()`. Cuando Ivana arma una OC para un proveedor,
-- el aviso "Ya hay una orden abierta de X" no la alerta si la abrió
-- Aris (ej. #22 DIS DEN en borrador).
--
-- Solución: función SECURITY DEFINER (mismo patrón que es_admin() /
-- nombres_usuarios()) que expone SOLO id, estado, fecha y nombre del
-- creador de las órdenes abiertas de ese proveedor. Sin ítems, sin
-- montos, sin notas. "Abierta" = el mismo criterio que usaba NuevaOC:
-- estado borrador o pendiente y no archivada (papelera).
-- `es_mia` permite al front linkear solo órdenes que el usuario puede abrir.
-- ============================================================

create or replace function public.ordenes_abiertas_proveedor(p_proveedor text)
returns table(id bigint, estado text, creada_en timestamptz, creador_nombre text, es_mia boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  select o.id,
         o.estado,
         o.creada_en,
         uc.nombre as creador_nombre,
         (o.creada_por = auth.uid()) as es_mia
  from public.ordenes_propias o
  left join public.usuarios_config uc on uc.user_id = o.creada_por
  where o.proveedor_nombre = p_proveedor
    and o.estado in ('borrador', 'pendiente')
    and o.archivada_en is null
  order by o.creada_en desc
  limit 5;
$function$;

revoke all on function public.ordenes_abiertas_proveedor(text) from public, anon;
grant execute on function public.ordenes_abiertas_proveedor(text) to authenticated;

-- ------------------------------------------------------------
-- Verificación (SQL Editor; auth.uid() es NULL ahí, así que es_mia sale null).
-- La prueba real es en el navegador como Ivana en /?page=nueva-oc,
-- eligiendo DIS DEN: debe avisar "#22 en borrador, de Aris".
--
-- select * from public.ordenes_abiertas_proveedor('DIS DEN');
-- select has_function_privilege('anon', 'public.ordenes_abiertas_proveedor(text)', 'execute') as anon_puede,
--        has_function_privilege('authenticated', 'public.ordenes_abiertas_proveedor(text)', 'execute') as auth_puede;
-- -- esperado: anon_puede = false, auth_puede = true
-- ------------------------------------------------------------
