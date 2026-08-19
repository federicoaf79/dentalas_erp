-- ============================================================
-- 20260819100000_stock_por_deposito.sql
-- Dentalab-Compras — Fase 1 del módulo de Stock: sincronizar el
-- stock real por depósito (Local / Central / Jorge / ML Full)
-- ============================================================
--
-- CONTEXTO: la especificación completa de Aris (reposición interna,
-- ver claude/ARIS_Especificacion_Reposicion_Interna_y_Produccion.md)
-- es mucho más que esto -- 8 niveles de prioridad, clasificación
-- ABC, SKU madre/hijo, recetas de producción. Esta migración es
-- deliberadamente solo la base: tener el dato REAL de stock por
-- depósito sincronizado automáticamente, igual que ya existe para
-- material/OC/clientes/ventas. Sin esto sincronizado, nada de lo
-- demás se puede construir encima.
--
-- Fuente: smartie "STOCK" (id 2360, `Z.API_Stock_Por_Deposito_NO_BORRAR`,
-- creada el 14/8/2026 a pedido). Viene PIVOTEADA (una columna
-- genérica C2..C11 por cada "ubicación"/categoría de stock, igual
-- patrón que REPORTE_DE_VENTAS) -- el significado real de cada
-- columna se resuelve por título en tiempo de sync (ver
-- mapearStock() en sync-yiqi/index.ts), no está hardcodeado por
-- número de columna.
--
-- Columnas reales confirmadas en vivo el 19/8/2026:
--   STOC_SKU (texto -- preservar tal cual, ver Aris: SKU nunca es
--     número, hay casos como "31110 T")
--   MATE_NOMBRE, y por depósito/categoría: "Deposito 1 - Local",
--   "Deposito Central", "Deposito 7 - Jorge", "Deposito ML Full",
--   "Baja", "Diferencia de Stock", "En tránsito", "Exposiciones",
--   "Reclamo Proveedores", "Reserva".
--
-- Sin "yiqi_id" propio (esta smartie no lo trae) -- la clave natural
-- es el SKU.
-- ============================================================

create table if not exists public.stock_yiqi (
  id bigint generated always as identity primary key,
  sku text not null unique,
  mate_nombre text,
  stock_local numeric,
  stock_central numeric,
  stock_jorge numeric,
  stock_ml_full numeric,
  baja numeric,
  diferencia_stock numeric,
  en_transito numeric,
  exposiciones numeric,
  reclamo_proveedores numeric,
  reserva numeric,
  hash_datos text,
  actualizado_en timestamptz,
  sincronizado_en timestamptz
);

comment on table public.stock_yiqi is
  'Espejo de la smartie STOCK de YiQi (id 2360) -- stock real por depósito, 1 fila por SKU. Base del módulo de Stock (Fase 1). Sincronizada por sync-yiqi?entidad=stock.';
comment on column public.stock_yiqi.sku is
  'SKU tal cual lo devuelve YiQi -- NUNCA convertir a número (hay SKU como "31110 T", con espacios/letras).';
comment on column public.stock_yiqi.stock_jorge is
  'Depósito 7 - Jorge. Se ignora en el flujo de reposición Local<->Central (ver especificación de Aris), pero se sincroniza igual por si hace falta más adelante.';
comment on column public.stock_yiqi.stock_ml_full is
  'Depósito ML Full. Se ignora en el flujo de reposición Local<->Central (mercadería vendida ahí no vuelve), se sincroniza igual.';

-- Mismo criterio de visibilidad que material_yiqi (Ivana solo ve sus
-- proveedores asignados): esta smartie no trae proveedor propio, así
-- que se resuelve por join contra material_yiqi.mate_codigo = sku.
alter table public.stock_yiqi enable row level security;

create policy "stock segun proveedores asignados"
on public.stock_yiqi
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

-- Upsert idempotente por sku, mismo patrón que upsert_material_yiqi:
-- solo toca actualizado_en si el hash realmente cambió.
create or replace function public.upsert_stock_yiqi(p_rows jsonb)
returns void
language plpgsql
as $function$
begin
  insert into stock_yiqi (
    sku, mate_nombre, stock_local, stock_central, stock_jorge, stock_ml_full,
    baja, diferencia_stock, en_transito, exposiciones, reclamo_proveedores,
    reserva, hash_datos, actualizado_en, sincronizado_en
  )
  select
    x.sku, x.mate_nombre, x.stock_local, x.stock_central, x.stock_jorge, x.stock_ml_full,
    x.baja, x.diferencia_stock, x.en_transito, x.exposiciones, x.reclamo_proveedores,
    x.reserva, x.hash_datos, now(), now()
  from jsonb_to_recordset(p_rows) as x(
    sku text, mate_nombre text, stock_local numeric, stock_central numeric,
    stock_jorge numeric, stock_ml_full numeric, baja numeric, diferencia_stock numeric,
    en_transito numeric, exposiciones numeric, reclamo_proveedores numeric,
    reserva numeric, hash_datos text
  )
  on conflict (sku) do update set
    mate_nombre = excluded.mate_nombre,
    stock_local = excluded.stock_local,
    stock_central = excluded.stock_central,
    stock_jorge = excluded.stock_jorge,
    stock_ml_full = excluded.stock_ml_full,
    baja = excluded.baja,
    diferencia_stock = excluded.diferencia_stock,
    en_transito = excluded.en_transito,
    exposiciones = excluded.exposiciones,
    reclamo_proveedores = excluded.reclamo_proveedores,
    reserva = excluded.reserva,
    actualizado_en = case
      when stock_yiqi.hash_datos is distinct from excluded.hash_datos
      then now()
      else stock_yiqi.actualizado_en
    end,
    hash_datos = excluded.hash_datos,
    sincronizado_en = now();
end;
$function$;

-- ============================================================
-- Cron job propio, cada 15 min (misma cadencia que material -- el
-- stock es tan crítico para las decisiones de reposición como el
-- punto de pedido). Usa el secreto de Vault cargado el 19/8/2026
-- para el sweep de YiQi (yiqi_functions_key) -- NO hardcodea la
-- service_role key en este archivo versionado.
-- ============================================================
create or replace function public.sync_stock_cron()
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
    raise warning 'sync_stock_cron: falta el secreto "yiqi_functions_key" en Supabase Vault (ya debería existir desde la migration 20260819000000_yiqi_sweep_reintentos_oc.sql). Sync de stock salteado esta corrida.';
    return;
  end if;

  perform net.http_post(
    url := 'https://hsfudsnmooaesrzdwecg.supabase.co/functions/v1/sync-yiqi?entidad=stock',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    )
  );
end;
$$;

comment on function public.sync_stock_cron() is
  'Dispara sync-yiqi?entidad=stock cada 15 min. Requiere el secreto "yiqi_functions_key" en Supabase Vault.';

select cron.schedule(
  'sync-stock-cada-15-min',
  '*/15 * * * *',
  $$select public.sync_stock_cron();$$
);
