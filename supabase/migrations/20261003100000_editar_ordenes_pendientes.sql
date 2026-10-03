-- 20261003100000_editar_ordenes_pendientes.sql — 3/10/2026
-- Punto 14 (feedback Ivana 2/10, decisión de Federico 3/10):
--  * quien creó la orden edita sus ítems en 'borrador' o 'pendiente';
--  * Aris (es_admin) edita los ítems de cualquier orden que no esté 'aprobada';
--  * si la creadora edita una orden 'pendiente', vuelve sola a 'borrador'
--    (hay que mandarla a aprobar de nuevo). Lo garantiza la base, no solo la pantalla.
-- Nombres de policy confirmados contra pg_policies el 28/9/2026.
-- Probada en Postgres local el 3/10/2026 (ver FEEDBACK_IVANA_2-10-2026.md, punto 14).

drop policy if exists "crear items" on public.ordenes_propias_items;
create policy "crear items" on public.ordenes_propias_items
  for insert to authenticated
  with check (
    orden_id in (
      select id from public.ordenes_propias
      where archivada_en is null
        and ((creada_por = auth.uid() and estado in ('borrador', 'pendiente'))
             or (public.es_admin() and estado <> 'aprobada'))
    )
  );

drop policy if exists "editar items" on public.ordenes_propias_items;
create policy "editar items" on public.ordenes_propias_items
  for update to authenticated
  using (
    orden_id in (
      select id from public.ordenes_propias
      where archivada_en is null
        and ((creada_por = auth.uid() and estado in ('borrador', 'pendiente'))
             or (public.es_admin() and estado <> 'aprobada'))
    )
  )
  with check (
    orden_id in (
      select id from public.ordenes_propias
      where archivada_en is null
        and ((creada_por = auth.uid() and estado in ('borrador', 'pendiente'))
             or (public.es_admin() and estado <> 'aprobada'))
    )
  );

drop policy if exists "borrar items" on public.ordenes_propias_items;
create policy "borrar items" on public.ordenes_propias_items
  for delete to authenticated
  using (
    orden_id in (
      select id from public.ordenes_propias
      where archivada_en is null
        and ((creada_por = auth.uid() and estado in ('borrador', 'pendiente'))
             or (public.es_admin() and estado <> 'aprobada'))
    )
  );

-- Si NO es Aris quien toca los ítems de una orden 'pendiente', la orden vuelve a 'borrador'.
create or replace function public.volver_a_borrador_si_edita_creadora()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_orden bigint := coalesce(new.orden_id, old.orden_id);
begin
  if not public.es_admin() then
    update public.ordenes_propias
       set estado = 'borrador', enviada_en = null
     where id = v_orden and estado = 'pendiente';
  end if;
  return null;
end;
$$;
revoke all on function public.volver_a_borrador_si_edita_creadora() from public, anon, authenticated;

drop trigger if exists trg_items_vuelve_a_borrador on public.ordenes_propias_items;
create trigger trg_items_vuelve_a_borrador
  after insert or update or delete on public.ordenes_propias_items
  for each row execute function public.volver_a_borrador_si_edita_creadora();
