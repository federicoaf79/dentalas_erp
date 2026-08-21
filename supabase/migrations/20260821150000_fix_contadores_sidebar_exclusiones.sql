-- ============================================================
-- Fix: contadores_sidebar() no aplicaba el filtro de exclusiones
-- del ítem 19 (21/8/2026).
--
-- Contexto: hoy se agregó a Alertas.jsx (y, más tarde el mismo día,
-- a MonitorStock.jsx) un filtro que excluye del conteo de alertas
-- a los SKU administrativos (889/890/99999), las publicaciones de
-- Mercado Libre ("###..."), los artículos discontinuados y la
-- producción propia (proveedor = Dentalab). contadores_sidebar()
-- -- la función que alimenta el badge de "Alertas" en el menú
-- lateral -- nunca se tocó, así que el sidebar seguía mostrando un
-- número más alto (2585 críticas / 445 preventivas) que la pantalla
-- real de Alertas (2401 / 440). Es justo el tipo de inconsistencia
-- que hace dudar del sistema: dos lugares de la misma app mostrando
-- dos números distintos para lo mismo.
--
-- Esta función es una de las que se aplicó directo en producción
-- hace tiempo y nunca quedó en el repo (no versionada) -- la
-- definición de abajo es la que Federico sacó en vivo con
-- pg_get_functiondef('public.contadores_sidebar'::regproc) el
-- 21/8/2026, con el único cambio siendo las 4 líneas nuevas al
-- final del WHERE de la CTE `mat` (marcadas abajo). Todo lo demás
-- es textualmente igual a lo que ya corre en producción.
--
-- No se toca "No enviar al local" / PARA FRACCIONAR acá: esa regla
-- es específica de reposicion_interna() (qué no mandar al local),
-- no de qué cuenta como alerta -- mismo criterio que ya tiene
-- Alertas.jsx.
-- ============================================================

create or replace function public.contadores_sidebar()
 returns jsonb
 language sql
 stable
as $function$
  with mat as (
    select coalesce(m.mate_stock_disponible, 0) as stock,
           case when m.mate_punto_de_pedido > 0 then m.mate_punto_de_pedido
                else m.mate_stock_seguridad end as umbral,
           m.sincronizado_en
    from public.material_yiqi m
    where not exists (
      select 1 from public.articulos_excluidos_alertas e
      where e.mate_codigo = m.mate_codigo
    )
    and not exists (
      select 1 from public.alertas_pausadas pa
      where pa.mate_codigo = m.mate_codigo
        and pa.reactivar_en > now()
    )
    -- ítem 19 (21/8/2026) -- mismo criterio que Alertas.jsx/MonitorStock.jsx:
    and not public.es_administrativo(m.mate_codigo)
    and coalesce(m.mate_nombre, '') not like '###%'
    and coalesce(m.mate_nombre, '') not ilike '%discontinuad%'
    and coalesce(m.clie_nombre, '') <> 'Dentalab'
  ),
  alertas as (
    select count(*) filter (where umbral is not null and stock <= 0)                    as criticas,
           count(*) filter (where umbral is not null and stock > 0 and stock <= umbral) as preventivas,
           max(sincronizado_en)                                                          as ultima_sync
    from mat
  ),
  oc as (
    select nro_oc,
           sum(coalesce(cantidad, 0))           as cantidad,
           sum(coalesce(cantidad_entregada, 0)) as entregada,
           sum(coalesce(cantidad_pendiente, 0)) as pendiente
    from public.ordenes_yiqi
    where nro_oc is not null
    group by nro_oc
  ),
  oc_estado as (
    select count(*) filter (where not (cantidad > 0 and pendiente = 0))                   as activas,
           count(*) filter (where not (cantidad > 0 and pendiente = 0) and entregada > 0) as parciales
    from oc
  ),
  propias as (
    -- Cuenta solo lo que el usuario puede ver: el RLS de ordenes_propias
    -- ya filtra, asi que Ivana ve las suyas y Aris todas.
    select count(*) as pendientes
    from public.ordenes_propias
    where estado = 'pendiente'
  ),
  pausadas_vencidas as (
    select count(*) as vencidas
    from public.alertas_pausadas
    where reactivar_en <= now()
  )
  select jsonb_build_object(
    'alertasCriticas',         a.criticas,
    'alertasPreventivas',      a.preventivas,
    'alertasStock',            a.criticas + a.preventivas,
    'ocsActivas',              o.activas,
    'seguimientoPendiente',    o.parciales,
    'aprobacionPendiente',     p.pendientes,
    'alertasPausadasVencidas', v.vencidas,
    'ultimaSync',              a.ultima_sync
  )
  from alertas a, oc_estado o, propias p, pausadas_vencidas v;
$function$;
