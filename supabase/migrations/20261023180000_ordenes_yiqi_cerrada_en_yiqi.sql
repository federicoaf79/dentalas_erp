-- ============================================================
-- 20261023180000_ordenes_yiqi_cerrada_en_yiqi.sql
-- Dentalab-Compras -- 23/10/2026 -- punto 3 "Recibida confiable"
-- ============================================================
-- PROBLEMA: 88 OC salen como "Demoradas" y 125 OC quedan "congeladas" en
-- ordenes_yiqi con saldo pendiente, aunque en YiQi ya no tienen nada.
--
-- HECHO [en vivo 2026-10-23, Ventas Online en /view/ORDEN_DE_COMPRA y
-- /view/REMITO_COMPRA; prod 2026-10-23]:
--   - YiQi no registra la recepción en la OC: "# Remitos relacionados" = 0,
--     "Total Entregado" = 0 y estado "En preparación" en todas las revisadas.
--     Los remitos de compra tienen "Nros OC" vacío.
--   - Cuando llega la mercadería, Ivana VACÍA la OC (0 líneas) y le pone
--     "Listo" en el asunto. 13 de 13 congeladas revisadas estaban vacías.
--     Otras (2651, 2672, 2674) se eliminaron de YiQi.
--   - El reporte 2345 (API_OC_Recientes) no corta por fecha (trae OC de
--     2024): trae las OC con algo pendiente. sync-yiqi lo baja COMPLETO
--     (traerSmartieCompleta) y llama UNA vez a upsert_ordenes_yiqi.
--   => Una OC que deja de venir en el reporte está cerrada en YiQi.
--
-- CAMBIO:
--   1. Columna ordenes_yiqi.cerrada_en_yiqi (false = sigue en el reporte).
--      sincronizado_en ya guarda la última vez que vino.
--   2. upsert_ordenes_yiqi(): el cuerpo es el de 20260928190000 (verificado
--      idéntico en prod el 23/10 con pg_get_functiondef) + al final marca
--      cerradas las OC que no vinieron en el lote.
--      Guarda: si el lote trae menos de 10 OC no marca nada (por si YiQi
--      devuelve un reporte vacío o roto). Una OC que vuelve al reporte se
--      reabre sola (el delete+insert la recrea con false).
--      CREATE OR REPLACE conserva los REVOKE de 20260930130000.
--   3. Backfill: las que no vinieron en la última sincronización.
--   4. contadores_sidebar(): "OC en curso" excluye las cerradas. Se parchea
--      sobre la definición VIGENTE en prod (no se reescribe a ciegas): si no
--      encuentra el texto esperado, aborta todo y no cambia nada.
--
-- Frontend que depende de esta columna (deployar DESPUÉS de aplicar esto):
--   lib/estadoOCPorSku.js ("en camino"), pages/OrdenesCompra.jsx,
--   pages/SeguimientoOC.jsx, pages/HistorialOC.jsx.
-- ============================================================

begin;

-- 1) Columna
alter table public.ordenes_yiqi
  add column if not exists cerrada_en_yiqi boolean not null default false;

create index if not exists idx_ordenes_yiqi_vigentes_sku
  on public.ordenes_yiqi (sku) where not cerrada_en_yiqi;

-- 2) Upsert que además marca las OC que ya no vienen en el reporte
create or replace function public.upsert_ordenes_yiqi(p_rows jsonb)
returns void
language plpgsql
as $function$
declare
  v_ocs_en_lote integer;
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

  -- 23/10/2026: el lote es el reporte COMPLETO de OC con pendientes. Lo que
  -- no vino, ya no tiene nada pendiente en YiQi (vaciada o eliminada).
  select count(distinct x->>'yiqi_id') into v_ocs_en_lote
  from jsonb_array_elements(p_rows) as x
  where x->>'yiqi_id' is not null;

  if v_ocs_en_lote >= 10 then
    update ordenes_yiqi o
       set cerrada_en_yiqi = true
     where not o.cerrada_en_yiqi
       and o.yiqi_id not in (
             select distinct (x->>'yiqi_id')::bigint
             from jsonb_array_elements(p_rows) as x
             where x->>'yiqi_id' is not null)
       and (o.nro_oc is null or o.nro_oc not in (
             select distinct (x->>'nro_oc')
             from jsonb_array_elements(p_rows) as x
             where x->>'nro_oc' is not null));
  else
    raise notice 'upsert_ordenes_yiqi: el lote trae % OC (< 10); no se marcan cerradas.', v_ocs_en_lote;
  end if;
end;
$function$;

-- 3) Backfill: lo que no vino en la última sincronización
update public.ordenes_yiqi
   set cerrada_en_yiqi = true
 where not cerrada_en_yiqi
   and sincronizado_en < (select max(sincronizado_en) from public.ordenes_yiqi) - interval '10 minutes';

-- 4) contadores_sidebar(): "OC en curso" sin las cerradas (parche sobre la versión vigente)
do $parche$
declare
  v_def   text := pg_get_functiondef('public.contadores_sidebar()'::regprocedure);
  v_nuevo text;
begin
  if v_def ~ 'cerrada_en_yiqi' then
    raise notice 'contadores_sidebar ya excluye las cerradas; no se toca.';
    return;
  end if;
  v_nuevo := regexp_replace(
    v_def,
    '(from\s+public\.ordenes_yiqi\s+where\s+nro_oc\s+is\s+not\s+null)',
    '\1 and not cerrada_en_yiqi',
    'g');
  if v_nuevo = v_def then
    raise exception 'contadores_sidebar: no se encontró "from public.ordenes_yiqi where nro_oc is not null". No se aplicó nada.';
  end if;
  execute v_nuevo;
end
$parche$;

commit;

-- Verificación (una sola fila)
select jsonb_build_object(
  'columna_ok', exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'ordenes_yiqi'
                           and column_name = 'cerrada_en_yiqi'),
  'ocs_vigentes', (select count(distinct nro_oc) from public.ordenes_yiqi where not cerrada_en_yiqi),
  'ocs_cerradas', (select count(distinct nro_oc) from public.ordenes_yiqi where cerrada_en_yiqi),
  'en_camino_vigente_u', (select sum(cantidad_pendiente) from public.ordenes_yiqi
                           where not cerrada_en_yiqi and cantidad_pendiente > 0),
  'upsert_marca_cerradas', pg_get_functiondef('public.upsert_ordenes_yiqi(jsonb)'::regprocedure) ~ 'cerrada_en_yiqi',
  'sidebar_excluye_cerradas', pg_get_functiondef('public.contadores_sidebar()'::regprocedure) ~ 'cerrada_en_yiqi',
  'acl_upsert', (select proacl::text from pg_proc where oid = 'public.upsert_ordenes_yiqi(jsonb)'::regprocedure)
) as verificacion;
