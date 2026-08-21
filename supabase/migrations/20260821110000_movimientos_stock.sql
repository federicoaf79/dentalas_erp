-- ============================================================
-- 20260821110000_movimientos_stock.sql
-- Dentalab-Compras — Último movimiento de stock por SKU
-- ============================================================
--
-- ALCANCE (decisión con Federico, 21/8/2026, AskUserQuestion): NO se
-- sincroniza el historial completo de MOVIMIENTO_STOCK (1.381.092
-- filas y creciendo) -- se guarda solo el movimiento MÁS RECIENTE de
-- cada SKU. Es justo lo que hace falta para poder automatizar, más
-- adelante, la regla de "3 años sin movimiento" de Alertas (Etapa 2 --
-- hoy esa regla vive con exclusión/pausa 100% MANUAL, ver sección 8
-- de PROMPT_CONTINUIDAD_Dentalab-Compras.md). Esta migración es solo
-- la base de datos: la automatización en sí todavía no está construida.
--
-- Fuente: smartie MOVIMIENTO_STOCK (id 2359,
-- Z.API_Movimientos_Stock_NO_BORRAR, creada 14/8/2026). Confirmado en
-- vivo el 21/8/2026 contra la API real (vía yiqi-connector):
--   - Viene ordenada por "Fecha de creación" (AUDI_FECHA_ALTA)
--     DESCENDENTE -- lo más reciente primero.
--   - El "id" de cada fila es correlativo de YiQi, baja en el mismo
--     sentido que la fecha.
--   - Página de 50 filas (distinto a las smarties core, que están en
--     100).
--   - Columnas reales: AUDI_FECHA_ALTA, MATE_CODIGO (SKU),
--     MATE_NOMBRE, MOST_CANTIDAD, CEDI_NOMBRE (Ubicación origen),
--     CED1_NOMBRE (Ubicación destino), MOST_OBSERVACIONES,
--     MOST_ENTIDAD_ORIGEN (referencia al comprobante que generó el
--     movimiento, ej. "RV Nro: 159739"), id.
--
-- Esto permite un backfill ACOTADO en vez de traer 1,38M de filas:
-- se pagina desde la más reciente hacia atrás y se corta apenas se
-- cruza un corte de antigüedad (~3 años) o se llega al final real de
-- los datos -- lo que pase primero. Ver sincronizarUltimoMovimientoStock()
-- en sync-yiqi/index.ts para el detalle del algoritmo.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Estado del backfill -- en qué página se quedó y si ya terminó,
--    para poder retomar entre invocaciones del cron (cada 15 min)
--    sin volver a arrancar de cero. Mismo criterio que el resto del
--    proyecto: nunca asumir que una sincronización grande entra en
--    una sola invocación de Edge Function.
-- ------------------------------------------------------------
ALTER TABLE public.yiqi_config
  ADD COLUMN IF NOT EXISTS movimientos_stock_pagina_cursor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS movimientos_stock_backfill_completo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.yiqi_config.movimientos_stock_pagina_cursor IS
  'Última página de la smartie MOVIMIENTO_STOCK (2359) ya procesada durante el backfill inicial. Se retoma desde acá en la próxima corrida del cron.';
COMMENT ON COLUMN public.yiqi_config.movimientos_stock_backfill_completo IS
  'true una vez que el backfill inicial cruzó el corte de antigüedad (~3 años) o llegó al final real de los datos. A partir de ahí, cada corrida pasa a modo incremental (solo repasa las páginas más recientes, mucho más liviano).';

-- ------------------------------------------------------------
-- 2) Último movimiento por SKU (1 fila por SKU, NO 1 fila por
--    movimiento -- ver alcance arriba).
-- ------------------------------------------------------------
create table if not exists public.ultimo_movimiento_stock_yiqi (
  sku text primary key,
  mate_nombre text,
  cantidad numeric,
  ubicacion_origen text,
  ubicacion_destino text,
  observaciones text,
  entidad_origen text,
  fecha_movimiento timestamptz not null,
  yiqi_movimiento_id bigint,
  hash_datos text,
  actualizado_en timestamptz,
  sincronizado_en timestamptz
);

comment on table public.ultimo_movimiento_stock_yiqi is
  'Movimiento de stock más reciente de cada SKU, según la smartie MOVIMIENTO_STOCK (id 2359) de YiQi. NO es un historial completo -- ver el encabezado de esta migración. Base para automatizar la regla de "3 años sin movimiento" de Alertas (todavía no construida -- esto es solo el dato sincronizado).';
comment on column public.ultimo_movimiento_stock_yiqi.sku is
  'SKU tal cual lo devuelve YiQi -- nunca convertir a número (regla de Aris: hay SKU como "31110 T").';
comment on column public.ultimo_movimiento_stock_yiqi.yiqi_movimiento_id is
  'id correlativo de YiQi del movimiento puntual que generó esta fila -- referencia de auditoría, no se usa como clave (la clave es sku).';

-- Mismo criterio de visibilidad que stock_yiqi: esta smartie no trae
-- proveedor propio, se resuelve por join contra material_yiqi.
alter table public.ultimo_movimiento_stock_yiqi enable row level security;

create policy "ultimo movimiento segun proveedores asignados"
on public.ultimo_movimiento_stock_yiqi
for select
to public
using (
  es_admin()
  or sku in (
    select mate_codigo from material_yiqi
    where clie_codigo in (select mis_codigos_proveedor())
       or clie_nombre in (select mis_nombres_proveedor())
  )
);

-- ------------------------------------------------------------
-- 3) Upsert -- a diferencia del resto del proyecto, el conflicto NO
--    se resuelve "el último que llega gana": tanto el backfill (que
--    procesa páginas hacia atrás en el tiempo) como el modo
--    incremental (que reescanea las mismas páginas recientes en cada
--    corrida) pueden reprocesar un movimiento más de una vez, en
--    cualquier orden. Por eso solo se pisa la fila existente si el
--    movimiento entrante es MÁS RECIENTE que el ya guardado -- así el
--    upsert es seguro sin importar cuántas veces o en qué orden se
--    reprocese una página.
-- ------------------------------------------------------------
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
  from jsonb_to_recordset(p_rows) as x(
    sku text, mate_nombre text, cantidad numeric, ubicacion_origen text,
    ubicacion_destino text, observaciones text, entidad_origen text,
    fecha_movimiento timestamptz, yiqi_movimiento_id bigint, hash_datos text
  )
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
  'Upsert por sku -- solo actualiza si el movimiento entrante es más reciente que el guardado (WHERE en el DO UPDATE). Idempotente sin importar el orden en que se reprocesen páginas del backfill o del modo incremental. Devuelve la cantidad de filas realmente insertadas/actualizadas.';

-- ------------------------------------------------------------
-- 4) Cron -- cada 15 min, misma cadencia que stock/material. La
--    propia Edge Function decide adentro si sigue con el backfill o
--    si ya pasó a modo incremental.
-- ------------------------------------------------------------
create or replace function public.sync_movimientos_stock_cron()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  service_key text;
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'yiqi_functions_key'
  limit 1;

  if service_key is null or service_key = '' then
    raise warning 'sync_movimientos_stock_cron: falta el secreto "yiqi_functions_key" en Supabase Vault. Sync salteado esta corrida.';
    return;
  end if;

  perform net.http_post(
    url := 'https://hsfudsnmooaesrzdwecg.supabase.co/functions/v1/sync-yiqi?entidad=movimientos',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    )
  );
end;
$$;

comment on function public.sync_movimientos_stock_cron() is
  'Dispara sync-yiqi?entidad=movimientos cada 15 min. Durante el backfill inicial cada corrida avanza un tramo más (hasta 300 páginas); una vez que cruza el corte de antigüedad o llega al final, pasa sola a modo incremental (40 páginas/corrida, siempre desde la más reciente).';

select cron.schedule(
  'sync-movimientos-stock-cada-15-min',
  '*/15 * * * *',
  $$select public.sync_movimientos_stock_cron();$$
);
