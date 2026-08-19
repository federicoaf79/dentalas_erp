-- ============================================================
-- 20260819120000_reposicion_interna.sql
-- Dentalab-Compras — Módulo de Stock, Fase 2: cálculo de
-- reposición interna Local <-> Depósito Central
-- ============================================================
--
-- Implementa la lógica de la especificación de Aris (ver
-- claude/ARIS_Especificacion_Reposicion_Interna_y_Produccion.md,
-- secciones 4 y 11) sobre los datos ya sincronizados:
--   - Fase 1 (19/8/2026): stock_yiqi (stock real por depósito)
--   - Ya existente: ventas_mensual_yiqi + composicion_articulos
--     (misma lógica de venta mensual promedio que usa
--     sugerencias_compra(), incluyendo el ajuste por combos)
--   - Ya existente: es_comprable() para exclusiones (ML virtual,
--     descontinuados, producción propia)
--
-- ALCANCE de esta Fase 2 (decisión explícita 19/8/2026, para no
-- bloquear esto con trabajo de fases posteriores):
--   - SÍ: cálculo Local<->Central, clasificación ABC, las 8
--     prioridades de la sección 4.4 de Aris.
--   - NO todavía (Fase 2b): sustitución SKU madre/hijo para
--     fraccionados en la compra (falta confirmar si
--     composicion_articulos ya modela esa relación o es otra
--     distinta a la de combos que ya usa sugerencias_compra()).
--   - NO todavía: export a Excel en tandas de 30 (remitos) --
--     capa aparte sobre esta función.
--   - NO todavía: recetas de producción/insumos -- el propio
--     documento de Aris lo marca como segunda etapa.
--
-- DECISIÓN DE MODELADO a validar con Federico/Aris: se reutiliza
-- es_comprable() para la categoría "No enviar al local", lo que
-- también excluye de la reposición Local<->Central a los artículos
-- de producción propia (proveedor = 'Dentalab') -- coherente con
-- que la Fase 2 no modela producción todavía, pero significa que
-- esos artículos no van a aparecer con sugerencia de movimiento
-- aunque tengan stock en Central. Si hace falta que sí aparezcan,
-- se ajusta en una iteración siguiente.
--
-- Objetivo local = cobertura de 1 mes de venta promedio -- FIJO,
-- según la especificación de Aris (sección 4.1). Es un concepto
-- DISTINTO de reglas_compra.meses_cobertura, que es la cobertura
-- usada para decidir cuánto comprarle a un proveedor externo
-- (sugerencias_compra()) -- no se reutiliza esa regla acá a
-- propósito, son dos decisiones de negocio separadas.
-- ============================================================

create or replace function public.reposicion_interna()
returns table(
  sku text,
  mate_nombre text,
  proveedor text,
  stock_local numeric,
  stock_central numeric,
  promedio_mensual numeric,
  venta_12_meses numeric,
  clase_abc text,
  objetivo_local numeric,
  deficit_local numeric,
  mover_desde_central numeric,
  faltante_a_pedir numeric,
  cobertura_dias_local numeric,
  prioridad_orden int,
  prioridad_label text
)
language sql
stable
as $function$
  with prom as (
    -- Misma lógica que sugerencias_compra(): venta de un combo se
    -- atribuye a sus componentes reales (composicion_articulos),
    -- para no subestimar la demanda real de cada SKU.
    select
      coalesce(ca.codigo_componente, v.mate_codigo) as mate_codigo,
      sum(v.cantidad * coalesce(ca.cantidad, 1)) as venta_12_meses
    from public.ventas_mensual_yiqi v
    left join public.composicion_articulos ca
      on ca.codigo_padre = v.mate_codigo
    where v.periodo >= (date_trunc('month', current_date) - interval '12 months')::date
      and v.periodo <  date_trunc('month', current_date)::date
      and (ca.codigo_padre is null or ca.cantidad is not null)
    group by coalesce(ca.codigo_componente, v.mate_codigo)
  ),
  base as (
    select
      m.mate_codigo as sku,
      m.mate_nombre,
      m.clie_nombre as proveedor,
      coalesce(s.stock_local, 0) as stock_local,
      coalesce(s.stock_central, 0) as stock_central,
      coalesce(p.venta_12_meses, 0) as venta_12_meses,
      coalesce(p.venta_12_meses, 0) / 12.0 as promedio_mensual,
      public.es_comprable(m.mate_nombre, m.clie_nombre) as comprable
    from public.material_yiqi m
    left join public.stock_yiqi s on s.sku = m.mate_codigo
    left join prom p on p.mate_codigo = m.mate_codigo
  ),
  abc as (
    -- Clasificación ABC por participación ACUMULADA de venta (no
    -- por venta individual): se ordena todo de mayor a menor venta
    -- y se ve en qué corte acumulado (80% / 95%) cae cada SKU.
    select b.*,
      sum(b.venta_12_meses) over (order by b.venta_12_meses desc)
        / nullif(sum(b.venta_12_meses) over (), 0) as participacion_acumulada
    from base b
  ),
  clasificado as (
    select a.*,
      case
        when a.venta_12_meses <= 0 then 'C'
        when a.participacion_acumulada <= 0.80 then 'A'
        when a.participacion_acumulada <= 0.95 then 'B'
        else 'C'
      end as clase_abc
    from abc a
  ),
  calculado as (
    select c.*,
      -- Regla 4.2 de Aris: presencia mínima de 1 unidad si nunca
      -- vendió pero hay stock en Central (salvo exclusión).
      greatest(
        c.promedio_mensual,
        case when c.promedio_mensual = 0 and c.stock_central > 0 then 1 else 0 end
      ) as objetivo_local
    from clasificado c
  ),
  final as (
    select cal.*,
      (cal.objetivo_local - cal.stock_local) as deficit_local,
      -- Regla 4.3 (crítica): nunca mover más de lo que hay en Central.
      -- greatest(stock_central, 0) porque en los datos reales de YiQi
      -- aparecen stocks negativos por ajustes/dato sucio (ver nota del
      -- -58 de "En tránsito" en la doc de continuidad) -- sin este piso,
      -- un Central negativo generaba una cantidad a mover negativa.
      least(greatest(cal.objetivo_local - cal.stock_local, 0), greatest(cal.stock_central, 0)) as mover_desde_central,
      greatest(
        (cal.objetivo_local - cal.stock_local)
          - least(greatest(cal.objetivo_local - cal.stock_local, 0), greatest(cal.stock_central, 0)),
        0
      ) as faltante_a_pedir,
      case when cal.promedio_mensual > 0 then cal.stock_local / (cal.promedio_mensual / 30.0) else null end
        as cobertura_dias_local
    from calculado cal
  )
  select
    f.sku, f.mate_nombre, f.proveedor, f.stock_local, f.stock_central,
    round(f.promedio_mensual, 1), f.venta_12_meses, f.clase_abc,
    f.objetivo_local, f.deficit_local, f.mover_desde_central, f.faltante_a_pedir,
    round(f.cobertura_dias_local, 1),
    -- Prioridad, sección 4.4 de Aris (8 niveles):
    case
      when f.sku in ('889', '890', '99999') or f.mate_nombre is null or trim(f.mate_nombre) = '' then 8
      when not f.comprable then 7
      when f.stock_central <= 0 and f.deficit_local > 0 then 6
      when f.stock_local = 0 and f.stock_central > 0 and f.clase_abc = 'A' then 1
      when f.stock_local = 0 and f.stock_central > 0 and f.clase_abc = 'B' then 2
      when f.stock_local = 0 and f.stock_central > 0 then 3
      when f.stock_local > 0 and f.cobertura_dias_local < 7 then 4
      when f.deficit_local > 0 then 5
      else 9 -- fuera de los 8 de Aris: sin necesidad de acción, se guarda para la auditoría (sección 9.5)
    end as prioridad_orden,
    case
      when f.sku in ('889', '890', '99999') or f.mate_nombre is null or trim(f.mate_nombre) = '' then 'No considerados'
      when not f.comprable then 'No enviar al local'
      when f.stock_central <= 0 and f.deficit_local > 0 then 'Artículos a pedir'
      when f.stock_local = 0 and f.stock_central > 0 and f.clase_abc = 'A' then 'Quiebre total A'
      when f.stock_local = 0 and f.stock_central > 0 and f.clase_abc = 'B' then 'Quiebre total B'
      when f.stock_local = 0 and f.stock_central > 0 then 'Quiebre total C / presencia mínima'
      when f.stock_local > 0 and f.cobertura_dias_local < 7 then 'Riesgo alto de quiebre'
      when f.deficit_local > 0 then 'Completar cobertura de 1 mes'
      else 'Sin necesidad'
    end as prioridad_label
  from final f
  order by prioridad_orden, f.venta_12_meses desc nulls last;
$function$;

comment on function public.reposicion_interna() is
  'Fase 2 del módulo de Stock: reposición Local<->Depósito Central según la especificación de Aris (8 niveles de prioridad + ABC). No es SECURITY DEFINER a propósito -- respeta la RLS de material_yiqi/stock_yiqi, así que Ivana solo ve sus proveedores asignados, igual que sugerencias_compra().';
