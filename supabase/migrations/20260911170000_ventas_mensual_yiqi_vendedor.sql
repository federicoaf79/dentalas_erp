-- ============================================================
-- 20260911170000_ventas_mensual_yiqi_vendedor.sql
-- ============================================================
-- Motivo (Federico, 11/9/2026): Patricia Bazan (licitaciones) vende
-- grandes volúmenes puntuales usando stock de todos los depósitos, lo
-- que distorsiona el promedio mensual que usa reposicion_interna()
-- para decidir cuánto reponer del Local. Necesitamos su detalle de
-- ventas por SKU/mes para poder excluirlas del cálculo (eso lo hace
-- la PRÓXIMA migración, sobre reposicion_interna() — esta acá no la
-- toca).
--
-- Esta migración SOLO crea la infraestructura de datos: tabla nueva +
-- RPC de upsert, calcados 1:1 del patrón ya probado de
-- ventas_mensual_yiqi / upsert_ventas_mensual_yiqi (confirmado en vivo
-- el 11/9/2026 vía introspección directa de Supabase — columnas,
-- constraint única e índices de la tabla original, y el cuerpo
-- completo del RPC original).
--
-- NO toca ventas_mensual_yiqi ni su RPC. NO toca reposicion_interna().
-- Todavía no hay ningún proceso que la alimente: eso es el paso
-- siguiente (extender supabase/functions/sync-yiqi/index.ts para
-- traer también el smartie 2369
-- "Z.API_Ventas_Vendedor_Origen_NO_BORRAR" y llamar al RPC de acá).
--
-- Diseño: se guarda por (mate_codigo, vendedor, periodo) en vez de
-- resumir directamente a "cantidad_patricia" — igual que trae el
-- smartie 2369 (detalle completo por vendedor). El filtro por
-- vendedor específico (hoy: Patricia Bazan) se aplica después, en el
-- cálculo de reposicion_interna(), no acá. Esto deja la puerta
-- abierta a excluir otro vendedor en el futuro sin tocar esta tabla.
-- ============================================================

create table if not exists public.ventas_mensual_yiqi_vendedor (
  id bigint generated always as identity primary key,
  mate_codigo text not null,
  vendedor text not null,
  periodo date not null,
  cantidad numeric not null,
  sincronizado_en timestamptz not null default now(),
  constraint ventas_mensual_vendedor_unica unique (mate_codigo, vendedor, periodo)
);

create index if not exists ix_ventas_mensual_vendedor_codigo
  on public.ventas_mensual_yiqi_vendedor using btree (mate_codigo);

create index if not exists ix_ventas_mensual_vendedor_periodo
  on public.ventas_mensual_yiqi_vendedor using btree (periodo);

create index if not exists ix_ventas_mensual_vendedor_vendedor
  on public.ventas_mensual_yiqi_vendedor using btree (vendedor);

create or replace function public.upsert_ventas_mensual_yiqi_vendedor(p_filas jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_filas integer;
begin
  with crudas as (
    select
      f->>'mate_codigo'          as mate_codigo,
      f->>'vendedor'              as vendedor,
      (f->>'periodo')::date      as periodo,
      (f->>'cantidad')::numeric  as cantidad
    from jsonb_array_elements(p_filas) as f
  ),
  -- Igual que en upsert_ventas_mensual_yiqi: agrupamos por la clave
  -- real antes del insert para que un duplicado en el lote no rompa
  -- el ON CONFLICT.
  agrupadas as (
    select mate_codigo,
           vendedor,
           periodo,
           sum(cantidad) as cantidad
    from crudas
    where mate_codigo is not null
      and vendedor    is not null
      and periodo     is not null
      and cantidad    is not null
    group by mate_codigo, vendedor, periodo
  )
  insert into public.ventas_mensual_yiqi_vendedor
        (mate_codigo, vendedor, periodo, cantidad, sincronizado_en)
  select mate_codigo, vendedor, periodo, cantidad, now()
  from agrupadas
  on conflict (mate_codigo, vendedor, periodo) do update
    set cantidad        = excluded.cantidad,
        sincronizado_en = now();

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$function$;
