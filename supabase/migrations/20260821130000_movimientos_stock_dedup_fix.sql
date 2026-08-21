-- ============================================================
-- 20260821130000_movimientos_stock_dedup_fix.sql
-- Fix: "ON CONFLICT DO UPDATE command cannot affect row a second
-- time" en upsert_ultimo_movimiento_stock_yiqi
-- ============================================================
--
-- Encontrado el 21/8/2026 en la primera corrida real que llegó a
-- intentar guardar datos (las 2 corridas anteriores nunca llegaron
-- porque pg_net cortaba a los 120s antes de terminar el loop de 300
-- páginas -- ver 20260821120000_movimientos_stock_pgnet_timeout.sql y
-- el fix de guardado incremental en sync-yiqi/index.ts).
--
-- CAUSA: MOVIMIENTO_STOCK es un historial -- el mismo SKU aparece una
-- vez por CADA movimiento, no una sola vez. Un lote de hasta 5.000
-- filas (TAMANIO_TANDA_MOVIMIENTOS) puede perfectamente traer el
-- mismo SKU repetido varias veces. Postgres no permite que un mismo
-- INSERT ... ON CONFLICT DO UPDATE toque la misma fila dos veces
-- dentro de UNA sola sentencia -- corta con error ANTES de evaluar
-- siquiera el WHERE, sin importar que ese WHERE ya filtre por fecha.
--
-- FIX: la propia función dedupea el lote entrante por sku (se queda
-- con el movimiento más reciente de cada uno, vía DISTINCT ON) ANTES
-- de armar el INSERT -- así nunca puede llegar a tocar el mismo sku
-- dos veces en una sentencia, sin depender de que quien arma el lote
-- (la Edge Function) lo haga bien.
-- ============================================================

create or replace function public.upsert_ultimo_movimiento_stock_yiqi(p_rows jsonb)
returns integer
language plpgsql
as $function$
declare
  filas integer;
begin
  insert into ultimo_movimiento_stock_yiqi (
    sku, mate_nombre, cantidad, ubicacion_origen, ubicacion_destino,
    observaciones, entidad_origen, fecha_movimiento, yiqi_movimiento_id,
    hash_datos, actualizado_en, sincronizado_en
  )
  select
    x.sku, x.mate_nombre, x.cantidad, x.ubicacion_origen, x.ubicacion_destino,
    x.observaciones, x.entidad_origen, x.fecha_movimiento, x.yiqi_movimiento_id,
    x.hash_datos, now(), now()
  from (
    select distinct on (sku)
      sku, mate_nombre, cantidad, ubicacion_origen, ubicacion_destino,
      observaciones, entidad_origen, fecha_movimiento, yiqi_movimiento_id,
      hash_datos
    from jsonb_to_recordset(p_rows) as x(
      sku text, mate_nombre text, cantidad numeric, ubicacion_origen text,
      ubicacion_destino text, observaciones text, entidad_origen text,
      fecha_movimiento timestamptz, yiqi_movimiento_id bigint, hash_datos text
    )
    -- DISTINCT ON exige que el ORDER BY arranque con la columna del
    -- DISTINCT (sku). Con fecha_movimiento desc a continuación, nos
    -- quedamos con el movimiento más reciente de cada sku dentro de
    -- este lote puntual.
    order by sku, fecha_movimiento desc
  ) as x
  on conflict (sku) do update set
    mate_nombre = excluded.mate_nombre,
    cantidad = excluded.cantidad,
    ubicacion_origen = excluded.ubicacion_origen,
    ubicacion_destino = excluded.ubicacion_destino,
    observaciones = excluded.observaciones,
    entidad_origen = excluded.entidad_origen,
    fecha_movimiento = excluded.fecha_movimiento,
    yiqi_movimiento_id = excluded.yiqi_movimiento_id,
    actualizado_en = case
      when ultimo_movimiento_stock_yiqi.hash_datos is distinct from excluded.hash_datos
      then now()
      else ultimo_movimiento_stock_yiqi.actualizado_en
    end,
    hash_datos = excluded.hash_datos,
    sincronizado_en = now()
  where excluded.fecha_movimiento > ultimo_movimiento_stock_yiqi.fecha_movimiento;

  get diagnostics filas = row_count;
  return filas;
end;
$function$;

comment on function public.upsert_ultimo_movimiento_stock_yiqi(jsonb) is
  'Upsert por sku -- dedupea el lote entrante por sku (DISTINCT ON, se queda con el más reciente) antes de insertar, porque MOVIMIENTO_STOCK trae el mismo sku repetido muchas veces y un INSERT..ON CONFLICT no tolera tocar la misma fila 2 veces en una sentencia. Además solo actualiza si el movimiento entrante es más reciente que el guardado (WHERE en el DO UPDATE) -- idempotente sin importar el orden en que se reprocesen páginas del backfill o del modo incremental. Devuelve la cantidad de filas realmente insertadas/actualizadas.';
