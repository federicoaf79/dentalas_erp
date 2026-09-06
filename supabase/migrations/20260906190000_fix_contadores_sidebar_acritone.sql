-- ============================================================
-- 20260906190000_fix_contadores_sidebar_acritone.sql
-- Fix: contadores_sidebar() no aplica la exclusión de Acritone/NewcryL.
-- ============================================================
--
-- Root cause (auditoría UX 6/9/2026, hallazgo H-1): el badge del
-- sidebar (Monitor de stock, Alertas) muestra números más altos que
-- las pantallas reales -- 2846 vs 2781 en Monitor de stock, 2400/446
-- vs 2347/431 en Alertas -- exactamente el mismo síntoma que ya se
-- había arreglado una vez el 21/8/2026 (ver
-- 20260821150000_fix_contadores_sidebar_exclusiones.sql).
--
-- Lo que pasó: el 26/8/2026 se agregó la exclusión de toda la línea
-- Acritone/NewcryL (~97 SKU, confirmado por Aris: "SON PRODUCTOS, NO
-- PROVEEDORES") en 3 lugares -- esExcluidoDeAlertas() en Alertas.jsx,
-- la copia idéntica en MonitorStock.jsx, y es_comprable() en SQL --
-- pero contadores_sidebar() (la función que alimenta el badge del
-- sidebar) es una cuarta copia del mismo criterio de exclusión, y esa
-- cuarta copia se quedó sin actualizar. Confirmado leyendo el código:
-- esExcluidoDeAlertas() tiene las líneas
--   if (nombreMin.includes('acritone')) return true
--   if (nombreMin.includes('newcryl')) return true
-- agregadas el 26/8/2026, y la definición de contadores_sidebar() en
-- 20260821150000_fix_contadores_sidebar_exclusiones.sql (21/8/2026,
-- anterior a ese cambio) no las tiene.
--
-- Esta migración solo agrega esas 2 líneas al WHERE de la CTE `mat`,
-- para que la función quede textualmente igual al resto del sistema.
-- Ninguna otra parte de la función se toca.
--
-- GOTCHA para el futuro (documentado en la auditoría UX): esta
-- función vive en 4 copias distintas del mismo criterio de exclusión
-- (Alertas.jsx, MonitorStock.jsx, es_comprable() en SQL, y esta). Toda
-- regla de exclusión nueva tiene que tocar las 4, o este mismo
-- síntoma va a volver a aparecer.
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
    -- 6/9/2026 (auditoría UX, H-1) -- agregado el 26/8/2026 en los otros
    -- 3 lugares (Alertas.jsx, MonitorStock.jsx, es_comprable()) y
    -- olvidado acá. Mismo criterio: línea completa, no productos puntuales.
    and coalesce(m.mate_nombre, '') not ilike '%acritone%'
    and coalesce(m.mate_nombre, '') not ilike '%newcryl%'
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
