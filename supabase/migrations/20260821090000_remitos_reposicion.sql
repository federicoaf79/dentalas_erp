-- ============================================================
-- 20260821090000_remitos_reposicion.sql
-- Dentalab-Compras — Módulo de Stock, Fase 2c: remitos/tandas de
-- hasta 30 artículos para Reposición interna
-- ============================================================
--
-- Implementa la sección 4.5 de la especificación de Aris
-- (claude/ARIS_Especificacion_Reposicion_Interna_y_Produccion.md):
-- agrupar las sugerencias pendientes (prioridades 1-5, "mover desde
-- Central") en remitos de hasta 30 artículos, separados por
-- prioridad, con numeración correlativa tipo:
--   Remito 01 - Quiebre A
--   Remito 02 - Quiebre A
--   Remito 03 - Quiebre B
--   Remito 04 - Riesgo alto
--   ...
-- No es por límite de camioneta -- es para facilitar picking,
-- control y evitar errores (Aris, sección 4.5): "si hace falta
-- varios viajes, se hacen varios viajes".
--
-- La columna `remito` ya existe en reposiciones_sugeridas desde la
-- migración 20260819130000 (se dejó NULL a propósito para esto).
--
-- DISEÑO: recalcular remito para TODAS las filas pendientes cada vez
-- que se llama a esta función (no solo las que no tengan remito
-- todavía). Los remitos son una hoja de trabajo del día, no un
-- historial permanente -- si algunas filas ya se marcaron
-- movido/descartado desde la última corrida, conviene que el resto
-- se reacomode en tandas de 30 sin huecos, en vez de ir arrastrando
-- remitos cada vez más incompletos. El estado ya resuelto
-- (movido/descartado/vencido) no se toca -- solo cambia el campo
-- `remito`, nunca `estado`.
-- ============================================================

create or replace function public.generar_remitos_reposicion()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  with base as (
    select
      id,
      prioridad_orden,
      prioridad_label,
      row_number() over (
        partition by prioridad_orden
        order by venta_12_meses desc nulls last, sku
      ) as pos_en_prioridad
    from public.reposiciones_sugeridas
    where estado = 'pendiente'
  ),
  bloques as (
    select
      id,
      prioridad_orden,
      prioridad_label,
      ceil(pos_en_prioridad::numeric / 30) as bloque_en_prioridad
    from base
  ),
  numerado as (
    select
      id,
      prioridad_label,
      dense_rank() over (order by prioridad_orden, bloque_en_prioridad) as numero_remito
    from bloques
  )
  update public.reposiciones_sugeridas rs
  set remito = 'Remito ' || lpad(n.numero_remito::text, 2, '0') || ' - ' || n.prioridad_label
  from numerado n
  where rs.id = n.id;

  get diagnostics filas = row_count;

  -- Limpiar remito de filas que ya no están pendientes (movido/descartado/vencido
  -- desde la última corrida) -- no deben seguir apareciendo en una hoja de picking.
  update public.reposiciones_sugeridas
  set remito = null
  where estado <> 'pendiente'
    and remito is not null;

  return filas;
end;
$$;

comment on function public.generar_remitos_reposicion() is
  'Fase 2c: agrupa las filas pendientes de reposiciones_sugeridas (prioridades 1-5) en remitos de hasta 30 artículos, separados por prioridad y numerados correlativamente ("Remito 01 - Quiebre A", ver sección 4.5 de la especificación de Aris). Recalcula TODAS las filas pendientes en cada corrida (no es acumulativo) para no dejar remitos con huecos a medida que se van marcando movido/descartado. SECURITY DEFINER porque necesita reasignar remitos across todos los proveedores a la vez, igual que generar_reposicion_interna(). Devuelve la cantidad de filas con remito asignado.';

-- No lleva cron propio: se dispara a demanda desde la pantalla (botón
-- "↻ Generar remitos"), después de que generar_reposicion_interna()
-- ya corrió (a mano o por su propio cron diario) -- generar remitos
-- sin sugerencias frescas no tendría sentido.
