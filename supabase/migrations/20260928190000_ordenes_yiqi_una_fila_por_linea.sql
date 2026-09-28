-- ============================================================
-- 20260928190000_ordenes_yiqi_una_fila_por_linea.sql
-- Dentalab-Compras -- 28/9/2026
-- ============================================================
-- PROBLEMA (confirmado en prod 28/9/2026, ver FEEDBACK_CLIENTE_28-9-2026.md
-- punto 9): desde el 5-6/9/2026 ordenes_yiqi guarda UNA sola línea por OC.
--   - En la smartie REPORTE_DE_OC (2345) el "ID" es el de la CABECERA de
--     la OC y se repite en cada línea (documentado desde julio). No hay
--     id de línea.
--   - El 5/9 se agregó UNIQUE (yiqi_id) y upsert_ordenes_yiqi() dedup-
--     licaba el lote por yiqi_id quedándose con la última fila -> se
--     descartaban todas las demás líneas de cada OC.
--   - Evidencia: 119 filas = 119 OC = 119 yiqi_id; la OC 1725 (DIS DEN)
--     tenía 27 líneas el 18/8 y hoy tiene 1.
--
-- ARREGLO:
--   1. Se saca la unicidad por yiqi_id y se pasa a unicidad por línea:
--      (yiqi_id, sku).
--   2. upsert_ordenes_yiqi() reemplaza la OC COMPLETA: borra todas las
--      líneas de cada OC presente en el lote (por yiqi_id -- cubre
--      también el caso de nro_oc NULL del incidente del 5/9 -- y por
--      nro_oc), e inserta todas sus líneas.
--   3. Si YiQi manda el mismo SKU dos veces en una misma OC, se suman
--      las cantidades/importes en una sola fila (en vez de descartar
--      una, como hacía la versión anterior).
--
-- LIMITACIÓN: solo se recuperan las líneas de las OC que hoy trae el
-- reporte "API_OC_Recientes" (ventana acotada). Las OC más viejas quedan
-- con 1 línea hasta una carga histórica aparte.
-- ============================================================

begin;

-- 1) Sacar la unicidad por cabecera
alter table public.ordenes_yiqi drop constraint if exists ordenes_yiqi_yiqi_id_key;
drop index if exists public.ordenes_yiqi_yiqi_id_key;

-- Índice común por yiqi_id (se usa en el delete del upsert)
create index if not exists idx_ordenes_yiqi_yiqi_id
  on public.ordenes_yiqi (yiqi_id);

-- 2) Unicidad por línea: una fila por (OC, SKU)
create unique index if not exists ordenes_yiqi_yiqi_id_sku_key
  on public.ordenes_yiqi (yiqi_id, coalesce(sku, ''));

-- 3) Upsert que reemplaza la OC completa
create or replace function public.upsert_ordenes_yiqi(p_rows jsonb)
returns void
language plpgsql
as $function$
begin
  delete from ordenes_yiqi
  where yiqi_id in (
    select distinct (x->>'yiqi_id')::bigint
    from jsonb_array_elements(p_rows) as x
    where x->>'yiqi_id' is not null
  )
  or nro_oc in (
    select distinct (x->>'nro_oc')
    from jsonb_array_elements(p_rows) as x
    where x->>'nro_oc' is not null
  );

  insert into ordenes_yiqi (
    yiqi_id, nro_oc, proveedor, fecha, sku, nombre_art, cantidad,
    cantidad_entregada, cantidad_pendiente, asunto, condicion_de_pago,
    subtotal, total, hash_datos, actualizado_en, sincronizado_en
  )
  select
    x.yiqi_id,
    max(x.nro_oc),
    max(x.proveedor),
    max(x.fecha),
    nullif(coalesce(x.sku, ''), ''),
    max(x.nombre_art),
    sum(x.cantidad),
    sum(x.cantidad_entregada),
    sum(x.cantidad_pendiente),
    max(x.asunto),
    max(x.condicion_de_pago),
    sum(x.subtotal),
    sum(x.total),
    md5(string_agg(coalesce(x.hash_datos, ''), '|' order by x.hash_datos)),
    now(),
    now()
  from jsonb_array_elements(p_rows) as e(elem)
  cross join lateral jsonb_to_record(e.elem) as x(
    yiqi_id bigint, nro_oc text, proveedor text, fecha date, sku text,
    nombre_art text, cantidad numeric, cantidad_entregada numeric,
    cantidad_pendiente numeric, asunto text, condicion_de_pago text,
    subtotal numeric, total numeric, hash_datos text
  )
  where x.yiqi_id is not null
  group by x.yiqi_id, coalesce(x.sku, '');
end;
$function$;

commit;
