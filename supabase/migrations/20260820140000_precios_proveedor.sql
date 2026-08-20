-- ============================================================
-- 20260820140000_precios_proveedor.sql
-- Dentalab-Compras — Comparación de precios entre proveedores
-- ============================================================
--
-- CONTEXTO (20/8/2026): "Comparación de precios entre proveedores"
-- venía anotada desde el 31/7 como algo identificado pero nunca
-- explorado (LISTA_DE_PRECIO_COMP / PRECIO_ARTICULO_COMP). Se probó
-- en vivo: PRECIO_ARTICULO_COMP tiene 6.939 filas -- muy por encima
-- del tope de 1000 que devuelve /search (nuestro modo clásico del
-- conector), así que traerla completa exige una smartie paginada,
-- mismo patrón que MATERIAL/STOCK/REPORTE_DE_OC.
--
-- Se creó a mano en YiQi (20/8/2026) la vista "Z.API_Precios_Comp_
-- NO_BORRAR" (smartieId 2367, SIN pivot -- es tabla plana, no hace
-- falta resolver por título como en ventas/stock) con las columnas:
--   LDPC_NOMBRE (nombre del proveedor/lista de precio)
--   MATE_NOMBRE (nombre del artículo)
--   PRAC_ART_NOMBRE (a pesar del nombre del campo, folleto real: es
--     el SKU del artículo -- confirmado en vivo cruzando el SKU
--     31002-PIN contra material_yiqi, coincide exacto)
--   PRAC_PRECIO_DE_LISTA (precio neto, sin descuento)
--   PRAC_PRECIO_FINAL (precio final, con descuento aplicado)
--   PRAC_PRECIO_MINIMO
--   AUDI_FECHA_ALTA
--   DESC_ESTADO
--   id (clave del registro en YiQi -- SÍ viene, a diferencia de
--       STOCK, así que se usa como clave natural igual que
--       material_yiqi/ordenes_yiqi/clientes_yiqi)
-- ============================================================

create table if not exists public.precios_proveedor_yiqi (
  yiqi_id bigint primary key,
  sku text not null,
  mate_nombre text,
  proveedor text not null,
  precio_neto numeric,
  precio_final numeric,
  precio_minimo numeric,
  estado text,
  fecha_alta timestamptz,
  hash_datos text,
  actualizado_en timestamptz,
  sincronizado_en timestamptz
);

comment on table public.precios_proveedor_yiqi is
  'Espejo de la smartie Z.API_Precios_Comp_NO_BORRAR de YiQi (PRECIO_ARTICULO_COMP, smartieId 2367) -- precio de cada artículo por proveedor, para comparar entre proveedores antes de armar una OC. Sincronizada por sync-yiqi?entidad=precios.';
comment on column public.precios_proveedor_yiqi.sku is
  'Mismo valor que material_yiqi.mate_codigo -- confirmado en vivo (20/8/2026) que PRAC_ART_NOMBRE de YiQi es en realidad el SKU, no un nombre, pese al nombre del campo.';
comment on column public.precios_proveedor_yiqi.precio_neto is
  'PRAC_PRECIO_DE_LISTA -- precio sin descuento aplicado.';
comment on column public.precios_proveedor_yiqi.precio_final is
  'PRAC_PRECIO_FINAL -- precio con descuento aplicado. Es el que hay que comparar entre proveedores para una decisión de compra real.';

create index if not exists precios_proveedor_yiqi_sku_idx
  on public.precios_proveedor_yiqi (sku);

-- Mismo criterio de visibilidad que material_yiqi/stock_yiqi: Ivana
-- solo ve precios de sus proveedores asignados (por nombre, esta
-- smartie no trae código de proveedor); Aris ve todo. No relaja la
-- seguridad solo porque el propósito sea "comparar" -- si hace falta
-- que un operador compare contra un proveedor que no tiene asignado,
-- es una decisión de Aris (asignarle ese proveedor), no un agujero
-- en esta tabla.
alter table public.precios_proveedor_yiqi enable row level security;

grant select on public.precios_proveedor_yiqi to authenticated;

drop policy if exists "precios segun proveedores asignados" on public.precios_proveedor_yiqi;
create policy "precios segun proveedores asignados"
on public.precios_proveedor_yiqi
for select
to authenticated
using (
  es_admin()
  or proveedor in (select mis_nombres_proveedor())
);

-- Upsert idempotente por yiqi_id, mismo patrón que upsert_material_yiqi/
-- upsert_stock_yiqi: solo toca actualizado_en si el hash cambió.
create or replace function public.upsert_precios_proveedor_yiqi(p_rows jsonb)
returns void
language plpgsql
as $function$
begin
  insert into precios_proveedor_yiqi (
    yiqi_id, sku, mate_nombre, proveedor, precio_neto, precio_final,
    precio_minimo, estado, fecha_alta, hash_datos, actualizado_en, sincronizado_en
  )
  select
    x.yiqi_id, x.sku, x.mate_nombre, x.proveedor, x.precio_neto, x.precio_final,
    x.precio_minimo, x.estado, x.fecha_alta, x.hash_datos, now(), now()
  from jsonb_to_recordset(p_rows) as x(
    yiqi_id bigint, sku text, mate_nombre text, proveedor text,
    precio_neto numeric, precio_final numeric, precio_minimo numeric,
    estado text, fecha_alta timestamptz, hash_datos text
  )
  on conflict (yiqi_id) do update set
    sku = excluded.sku,
    mate_nombre = excluded.mate_nombre,
    proveedor = excluded.proveedor,
    precio_neto = excluded.precio_neto,
    precio_final = excluded.precio_final,
    precio_minimo = excluded.precio_minimo,
    estado = excluded.estado,
    fecha_alta = excluded.fecha_alta,
    actualizado_en = case
      when precios_proveedor_yiqi.hash_datos is distinct from excluded.hash_datos
      then now()
      else precios_proveedor_yiqi.actualizado_en
    end,
    hash_datos = excluded.hash_datos,
    sincronizado_en = now();
end;
$function$;

-- ============================================================
-- Cron diario (los precios no cambian con la urgencia del stock).
-- 6:15 UTC -- 15 min después del cron de oc/clientes (6:00 UTC), a
-- propósito, para no sumar una cuarta llamada exactamente en el
-- mismo minuto que las otras 3 y ampliar el riesgo ya documentado de
-- colisión de renovación de token (ver SESIÓN 17/8/2026, "Riesgo
-- residual"). Mismo patrón de Vault que sync_stock_cron -- sin
-- hardcodear la service_role key acá.
-- ============================================================
create or replace function public.sync_precios_cron()
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
    raise warning 'sync_precios_cron: falta el secreto "yiqi_functions_key" en Supabase Vault. Sync de precios salteado esta corrida.';
    return;
  end if;

  perform net.http_post(
    url := 'https://hsfudsnmooaesrzdwecg.supabase.co/functions/v1/sync-yiqi?entidad=precios',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    )
  );
end;
$$;

comment on function public.sync_precios_cron() is
  'Dispara sync-yiqi?entidad=precios una vez por día. Requiere el secreto "yiqi_functions_key" en Supabase Vault.';

select cron.schedule(
  'sync-precios-diario',
  '15 6 * * *',
  $$select public.sync_precios_cron();$$
);
