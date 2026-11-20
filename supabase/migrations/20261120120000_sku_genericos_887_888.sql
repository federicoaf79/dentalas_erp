-- ============================================================
-- 20261120120000_sku_genericos_887_888.sql — 20/11/2026
-- ============================================================
-- Ivana (20/11, vía Federico): los SKU 887 y 888 se usan para productos
-- que se compraron específicamente para un cliente o un vendedor, sin
-- crearles código propio. No son artículos de reposición: no deben entrar
-- en alertas, sugerencias de compra, máximos, predictor ni reposición
-- entre depósitos. Se suman a la lista centralizada de es_administrativo()
-- (889, 890, 99999), que ya usan sugerencias_compra(), reposicion_interna(),
-- contadores_sidebar() y el resto de los análisis.
-- "Prioritario a domicilio" queda sin tocar: Ivana no sabe qué es (pendiente).
-- Idempotente.
-- ============================================================

create or replace function public.es_administrativo(p_sku text)
returns boolean
language sql
immutable
as $function$
  select coalesce(p_sku, '') in ('887', '888', '889', '890', '99999');
$function$;

comment on function public.es_administrativo(text) is
  'SKU que no son artículos de reposición: 889/890/99999 administrativos (Aris, 9.4/6.3) y 887/888 genéricos de compras puntuales para un cliente o vendedor (Ivana, 20/11/2026). No entran en reposición, artículos a pedir ni análisis operativo de stock.';

-- La reposición automática Central → Local no usaba es_administrativo(): se agrega.
-- Copia de la versión vigente (20261118130000) + esa sola línea.
create or replace function public.reposicion_central_candidatos()
returns table (sku text, mate_nombre text, cantidad_neta numeric, orden_prioridad integer)
language sql
stable
security definer
set search_path = public, extensions
as $function$
  with abc as (
    -- Clasificación ABC real de Aris, reutilizada tal cual.
    select r.sku, r.clase_abc from public.reposicion_interna() r
  ),
  base as (
    select
      pel.sku,
      coalesce(st.mate_nombre, pel.mate_nombre) as mate_nombre,
      greatest(coalesce(st.stock_local, 0), 0) as stock_local,
      greatest(coalesce(st.stock_central, 0), 0) as stock_central,
      mat.mate_punto_de_pedido,
      pel.venta_mensual_prom as objetivo_local,
      coalesce(abc.clase_abc, 'C') as clase_abc
    from public.punto_equilibrio_local pel
    join public.stock_yiqi st on st.sku = pel.sku
    left join public.material_yiqi mat on mat.mate_codigo = pel.sku
    left join abc on abc.sku = pel.sku
    where pel.excluido = false
      -- 18/11/2026: fuera publicaciones de Mercado Libre, combos y discontinuados.
      and coalesce(mat.mate_nombre, st.mate_nombre, pel.mate_nombre, '') not like '%###%'
      and coalesce(mat.mate_nombre, st.mate_nombre, pel.mate_nombre, '') not ilike 'combo%'
      and coalesce(mat.mate_nombre, st.mate_nombre, pel.mate_nombre, '') not ilike '%discontinuad%'
      -- 20/11/2026: fuera administrativos y genéricos (887/888/889/890/99999).
      and not public.es_administrativo(pel.sku)
  ),
  con_alerta as (
    select
      b.*,
      greatest(b.objetivo_local - b.stock_local, 0) as deficit_local,
      case when b.objetivo_local > 0 then b.stock_local / (b.objetivo_local / 30.0) else null end as cobertura_dias_local
    from base b
    where b.mate_punto_de_pedido is not null
      and b.stock_local <= b.mate_punto_de_pedido
  ),
  deficit as (
    select
      c.sku, c.mate_nombre,
      ceil(least(c.deficit_local, c.stock_central)) as mover_desde_central,
      case
        when c.stock_local = 0 and c.clase_abc = 'A' then 1
        when c.stock_local = 0 and c.clase_abc = 'B' then 2
        when c.stock_local = 0 then 3
        when c.stock_local > 0 and c.cobertura_dias_local < 7 then 4
        else 5
      end as orden_prioridad
    from con_alerta c
    where c.deficit_local > 0
  )
  select
    d.sku,
    d.mate_nombre,
    (d.mover_desde_central - coalesce(reservado.cantidad, 0))::numeric as cantidad_neta,
    d.orden_prioridad::integer
  from deficit d
  left join (
    select l.sku, sum(l.cantidad_solicitada) as cantidad
    from public.solicitudes_reposicion_lineas l
    join public.solicitudes_reposicion s on s.id = l.solicitud_id
    where s.estado = 'en_preparacion'
      and s.deposito_origen_id = 157
      and s.deposito_destino_id = 155
    group by l.sku
  ) reservado on reservado.sku = d.sku
  where d.mover_desde_central > 0
    and (d.mover_desde_central - coalesce(reservado.cantidad, 0)) > 0
    and not exists (
      select 1 from public.alertas_suspendidas al
      where al.sku = d.sku and al.reactivada_en is null
    );
$function$;
revoke all on function public.reposicion_central_candidatos() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Verificación (solo lectura):
--   select public.es_administrativo('887') as a887, public.es_administrativo('888') as a888,
--          public.es_administrativo('889') as a889, public.es_administrativo('1000') as a1000;
--   -- debe dar true · true · true · false
--   select count(*) from public.reposicion_central_candidatos() where public.es_administrativo(sku);
--   -- debe dar 0
-- ------------------------------------------------------------
