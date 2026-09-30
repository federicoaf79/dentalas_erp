-- ============================================================
-- 30/9/2026 — La clase A/B/C queda guardada en cada línea del remito.
--
-- Problema: las pantallas de depósito (SolicitudesParaPreparar.jsx,
-- ConfirmarRecepcion.jsx) llamaban a reposicion_interna() solo para
-- mostrar la etiqueta A/B/C. reposicion_interna() es SECURITY INVOKER y
-- el usuario de depósito no puede leer ventas_mensual_yiqi_vendedor, así
-- que para él no se descuentan las ventas de licitación (Patricia) y la
-- etiqueta en pantalla podía no coincidir con la que usó
-- generar_remito_reposicion_central() (SECURITY DEFINER) para ordenar.
--
-- Decisión (Federico, 30/9/2026): el depósito no necesita ver ventas.
-- La clase se congela en la línea al crearse (misma "foto al momento del
-- clic" que las cantidades) y la pantalla la lee de ahí.
--
-- No se toca generar_remito_reposicion_central() ni
-- crear_remito_reposicion_manual(): un trigger por sentencia completa
-- clase_abc para cualquier línea nueva, venga del circuito principal o
-- del inverso.
-- ============================================================

alter table public.solicitudes_reposicion_lineas
  add column if not exists clase_abc text;

comment on column public.solicitudes_reposicion_lineas.clase_abc is
  'Clase A/B/C del SKU al momento de crearse la línea (misma clasificación de reposicion_interna() calculada con permisos del sistema). Solo informativa para las pantallas de depósito.';

create or replace function public.trg_lineas_remito_clase_abc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Corre como dueño: ve todas las ventas, igual que el armado del remito.
  update public.solicitudes_reposicion_lineas l
     set clase_abc = coalesce(abc.clase_abc, 'C')
    from nuevas n
    left join public.reposicion_interna() abc on abc.sku = n.sku
   where l.id = n.id
     and l.clase_abc is null;
  return null;
end;
$$;

revoke all on function public.trg_lineas_remito_clase_abc() from public, anon, authenticated;

drop trigger if exists trg_lineas_remito_clase_abc on public.solicitudes_reposicion_lineas;
create trigger trg_lineas_remito_clase_abc
  after insert on public.solicitudes_reposicion_lineas
  referencing new table as nuevas
  for each statement
  execute function public.trg_lineas_remito_clase_abc();

-- Líneas existentes: se completan con la clasificación de hoy (no hay
-- registro histórico de la clase al momento en que se crearon).
update public.solicitudes_reposicion_lineas l
   set clase_abc = coalesce(abc.clase_abc, 'C')
  from public.solicitudes_reposicion_lineas x
  left join public.reposicion_interna() abc on abc.sku = x.sku
 where l.id = x.id
   and l.clase_abc is null;

-- Verificación (debe devolver sin_clase = 0)
select count(*) as lineas_total,
       count(*) filter (where clase_abc is null) as sin_clase,
       count(*) filter (where clase_abc = 'A') as a,
       count(*) filter (where clase_abc = 'B') as b,
       count(*) filter (where clase_abc = 'C') as c
from public.solicitudes_reposicion_lineas;
