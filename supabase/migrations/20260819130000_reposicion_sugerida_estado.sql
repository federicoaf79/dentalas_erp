-- ============================================================
-- 20260819130000_reposicion_sugerida_estado.sql
-- Dentalab-Compras — Módulo de Stock, Fase 2b: persistencia +
-- acción por fila para Reposición Interna
-- ============================================================
--
-- Decisión con Federico (19/8/2026): reposicion_interna() (Fase 2a)
-- es un cálculo 100% en vivo, sin memoria. Para que el equipo pueda
-- "marcar como movido" y quede un registro de quién hizo qué y
-- cuándo -- tal como lo pide Aris en la sección 14 de su documento
-- ("Reposiciones sugeridas": fecha, remito, prioridad, sku,
-- descripcion, cantidad, motivo, stock_local, stock_central,
-- venta_mensual, cobertura_actual, usuario, estado) -- se agrega
-- una tabla persistente.
--
-- Por qué persistir y no solo loguear el click: si dos personas
-- entran el mismo día, deben ver la MISMA cantidad sugerida (no que
-- a uno la app le muestre 5 y al otro 7 porque el stock cambió entre
-- medio) y saber si alguien ya la marcó. También deja la auditoría
-- que pide la sección 9.5 de Aris.
--
-- ALCANCE de esta fila-acción (para no mezclar dos flujos distintos):
--   Sólo prioridades 1 a 5 (Quiebre A/B/C, Riesgo alto, Completar 1
--   mes) -- es decir, sólo la acción "mover desde Central al local".
--   Prioridad 6 ("Artículos a pedir") sigue siendo sólo informativa
--   en esta tabla: la acción de "comprar a proveedor externo" es un
--   flujo distinto y ya existente (sugerencias_compra() / OC), y
--   mezclarla acá con "mover" complica el campo estado sin necesidad
--   todavía. Integrar ambos flujos queda pendiente para una
--   iteración futura si hace falta.
--
-- NO incluye todavía (deliberado, ver Fase 2 y 2b del alcance ya
-- acordado): agrupación en remitos de 30 artículos ni export a
-- Excel -- por eso la columna `remito` existe pero queda NULL por
-- ahora. Cuando se construya esa funcionalidad, se llena esa
-- columna sin tener que tocar el esquema ni la lógica de estado.
-- ============================================================

-- ------------------------------------------------------------
-- 1) reposicion_interna() ahora también devuelve proveedor_codigo
--    (hace falta para la RLS de la tabla nueva, mismo patrón dual
--    código/nombre que ya usan material_yiqi/ordenes_yiqi/stock_yiqi).
--    Cambia el shape de la tabla de retorno -> hay que DROP primero,
--    CREATE OR REPLACE no permite cambiar columnas de salida.
-- ------------------------------------------------------------
drop function if exists public.reposicion_interna();

create or replace function public.reposicion_interna()
returns table(
  sku text,
  mate_nombre text,
  proveedor text,
  proveedor_codigo text,
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
      m.clie_codigo as proveedor_codigo,
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
      greatest(
        c.promedio_mensual,
        case when c.promedio_mensual = 0 and c.stock_central > 0 then 1 else 0 end
      ) as objetivo_local
    from clasificado c
  ),
  final as (
    select cal.*,
      (cal.objetivo_local - cal.stock_local) as deficit_local,
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
    f.sku, f.mate_nombre, f.proveedor, f.proveedor_codigo, f.stock_local, f.stock_central,
    round(f.promedio_mensual, 1), f.venta_12_meses, f.clase_abc,
    f.objetivo_local, f.deficit_local, f.mover_desde_central, f.faltante_a_pedir,
    round(f.cobertura_dias_local, 1),
    case
      when f.sku in ('889', '890', '99999') or f.mate_nombre is null or trim(f.mate_nombre) = '' then 8
      when not f.comprable then 7
      when f.stock_central <= 0 and f.deficit_local > 0 then 6
      when f.stock_local = 0 and f.stock_central > 0 and f.clase_abc = 'A' then 1
      when f.stock_local = 0 and f.stock_central > 0 and f.clase_abc = 'B' then 2
      when f.stock_local = 0 and f.stock_central > 0 then 3
      when f.stock_local > 0 and f.cobertura_dias_local < 7 then 4
      when f.deficit_local > 0 then 5
      else 9
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
  'Fase 2 del módulo de Stock: reposición Local<->Depósito Central según la especificación de Aris (8 niveles de prioridad + ABC). No es SECURITY DEFINER a propósito -- respeta la RLS de material_yiqi/stock_yiqi, así que Ivana solo ve sus proveedores asignados, igual que sugerencias_compra(). Devuelve proveedor_codigo además de proveedor (19/8/2026) para que reposiciones_sugeridas pueda aplicar la misma RLS dual código/nombre que el resto del sistema.';

-- ------------------------------------------------------------
-- 2) Tabla de sugerencias persistentes con estado
-- ------------------------------------------------------------
create table if not exists public.reposiciones_sugeridas (
  id bigint generated always as identity primary key,
  sku text not null,
  mate_nombre text,
  proveedor text,
  proveedor_codigo text,
  prioridad_orden int not null,
  prioridad_label text not null,
  stock_local numeric,
  stock_central numeric,
  promedio_mensual numeric,
  venta_12_meses numeric,
  clase_abc text,
  objetivo_local numeric,
  deficit_local numeric,
  cantidad numeric not null,           -- = mover_desde_central al momento de generar/actualizar
  faltante_a_pedir numeric,
  cobertura_dias_local numeric,
  remito text,                          -- NULL por ahora; se completa cuando exista agrupación en remitos (fase futura)
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'movido', 'descartado', 'vencido')),
  generado_en timestamptz not null default now(),
  marcado_en timestamptz,
  marcado_por uuid references auth.users(id),
  cantidad_movida numeric,              -- lo que realmente se movió, si difiere de `cantidad` (sugerido); NULL = se movió lo sugerido
  observacion text
);

-- Sólo puede haber UNA sugerencia pendiente por SKU a la vez -- evita
-- duplicar tareas para el mismo artículo en corridas sucesivas.
create unique index if not exists reposiciones_sugeridas_sku_pendiente_idx
  on public.reposiciones_sugeridas (sku)
  where estado = 'pendiente';

create index if not exists reposiciones_sugeridas_estado_idx
  on public.reposiciones_sugeridas (estado, prioridad_orden);

alter table public.reposiciones_sugeridas enable row level security;

-- Mismo criterio que stock_yiqi/material_yiqi: admin ve todo, el
-- resto sólo sus proveedores asignados (código o nombre).
create policy "reposiciones segun proveedores asignados"
  on public.reposiciones_sugeridas
  for select
  to public
  using (
    public.es_admin()
    or proveedor_codigo in (select public.mis_codigos_proveedor())
    or proveedor in (select public.mis_nombres_proveedor())
  );

-- Marcar como movido/descartado es una acción operativa del día a
-- día (mismo criterio que "pausar alerta" en Alertas.jsx) -- se deja
-- abierta a cualquier usuario logueado que tenga ese proveedor
-- asignado, no sólo admin.
create policy "marcar reposiciones de proveedores asignados"
  on public.reposiciones_sugeridas
  for update
  to public
  using (
    public.es_admin()
    or proveedor_codigo in (select public.mis_codigos_proveedor())
    or proveedor in (select public.mis_nombres_proveedor())
  )
  with check (
    public.es_admin()
    or proveedor_codigo in (select public.mis_codigos_proveedor())
    or proveedor in (select public.mis_nombres_proveedor())
  );

-- Sin política de INSERT/DELETE para public: las filas sólo se crean
-- vía generar_reposicion_interna() (SECURITY DEFINER, más abajo).
-- Esto evita que cualquiera pueda insertar sugerencias arbitrarias.

comment on table public.reposiciones_sugeridas is
  'Fase 2b (19/8/2026): snapshot persistente + estado de las sugerencias de reposición Local<->Central (prioridades 1 a 5 de reposicion_interna() -- sólo el flujo "mover desde Central", no "Artículos a pedir"). Se genera/actualiza vía generar_reposicion_interna(); se marca vía marcar_reposicion_sugerida(). remito queda NULL hasta que se construya la agrupación en tandas de 30 (fase futura).';

-- ------------------------------------------------------------
-- 3) Generación/actualización -- SECURITY DEFINER porque necesita
--    leer reposicion_interna() para TODOS los proveedores (no sólo
--    los del usuario que dispara la corrida) para mantener la tabla
--    completa y consistente para todos.
-- ------------------------------------------------------------
create or replace function public.generar_reposicion_interna()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) Cerrar automáticamente sugerencias pendientes cuyo SKU ya no
  --    necesita acción (se cubrió el déficit, cambió el stock, etc.)
  update public.reposiciones_sugeridas rs
  set estado = 'vencido', marcado_en = now()
  where rs.estado = 'pendiente'
    and not exists (
      select 1 from public.reposicion_interna() ri
      where ri.sku = rs.sku
        and ri.prioridad_orden between 1 and 5
        and ri.mover_desde_central > 0
    );

  -- 2) Refrescar los datos calculados de las sugerencias pendientes
  --    que siguen vigentes (no se duplica la fila, se actualiza).
  update public.reposiciones_sugeridas rs
  set mate_nombre = ri.mate_nombre,
      proveedor = ri.proveedor,
      proveedor_codigo = ri.proveedor_codigo,
      prioridad_orden = ri.prioridad_orden,
      prioridad_label = ri.prioridad_label,
      stock_local = ri.stock_local,
      stock_central = ri.stock_central,
      promedio_mensual = ri.promedio_mensual,
      venta_12_meses = ri.venta_12_meses,
      clase_abc = ri.clase_abc,
      objetivo_local = ri.objetivo_local,
      deficit_local = ri.deficit_local,
      cantidad = ri.mover_desde_central,
      faltante_a_pedir = ri.faltante_a_pedir,
      cobertura_dias_local = ri.cobertura_dias_local,
      generado_en = now()
  from public.reposicion_interna() ri
  where rs.estado = 'pendiente'
    and rs.sku = ri.sku
    and ri.prioridad_orden between 1 and 5
    and ri.mover_desde_central > 0;

  -- 3) Insertar sugerencias nuevas: SKU accionable sin fila pendiente ya abierta
  insert into public.reposiciones_sugeridas (
    sku, mate_nombre, proveedor, proveedor_codigo, prioridad_orden, prioridad_label,
    stock_local, stock_central, promedio_mensual, venta_12_meses, clase_abc,
    objetivo_local, deficit_local, cantidad, faltante_a_pedir, cobertura_dias_local,
    estado
  )
  select
    ri.sku, ri.mate_nombre, ri.proveedor, ri.proveedor_codigo, ri.prioridad_orden, ri.prioridad_label,
    ri.stock_local, ri.stock_central, ri.promedio_mensual, ri.venta_12_meses, ri.clase_abc,
    ri.objetivo_local, ri.deficit_local, ri.mover_desde_central, ri.faltante_a_pedir, ri.cobertura_dias_local,
    'pendiente'
  from public.reposicion_interna() ri
  where ri.prioridad_orden between 1 and 5
    and ri.mover_desde_central > 0
    and not exists (
      select 1 from public.reposiciones_sugeridas rs
      where rs.sku = ri.sku and rs.estado = 'pendiente'
    );
end;
$$;

comment on function public.generar_reposicion_interna() is
  'Genera/actualiza reposiciones_sugeridas a partir del cálculo en vivo de reposicion_interna() (prioridades 1-5, mover_desde_central > 0). Idempotente: no duplica sugerencias pendientes por SKU, refresca las vigentes, cierra como "vencido" las que ya no aplican. SECURITY DEFINER para poder ver todos los proveedores al generar.';

-- ------------------------------------------------------------
-- 4) Marcar una sugerencia como movida/descartada -- NO es
--    SECURITY DEFINER: la RLS de UPDATE ya filtra que sólo se
--    pueda marcar algo de los proveedores asignados al usuario.
-- ------------------------------------------------------------
create or replace function public.marcar_reposicion_sugerida(
  p_id bigint,
  p_estado text,
  p_observacion text default null,
  p_cantidad_movida numeric default null
)
returns void
language plpgsql
as $$
begin
  if p_estado not in ('movido', 'descartado') then
    raise exception 'estado inválido: % (debe ser movido o descartado)', p_estado;
  end if;

  update public.reposiciones_sugeridas
  set estado = p_estado,
      marcado_en = now(),
      marcado_por = auth.uid(),
      observacion = coalesce(p_observacion, observacion),
      cantidad_movida = case when p_estado = 'movido' then p_cantidad_movida else cantidad_movida end
  where id = p_id
    and estado = 'pendiente';

  if not found then
    raise exception 'sugerencia % no encontrada, ya resuelta, o sin permiso', p_id;
  end if;
end;
$$;

comment on function public.marcar_reposicion_sugerida(bigint, text, text, numeric) is
  'Marca una fila de reposiciones_sugeridas como movida o descartada. p_cantidad_movida es opcional: si se pasa NULL al marcar "movido", se asume que se movió exactamente lo sugerido (`cantidad`). No es SECURITY DEFINER a propósito: se apoya en la política RLS de UPDATE de la tabla para que un usuario sólo pueda marcar sugerencias de sus proveedores asignados (o admin, todas).';

-- ------------------------------------------------------------
-- 5) Cron de seguridad -- genera/actualiza una vez por día. No
--    depende de Vault: es una función interna a la base, no llama a
--    ningún Edge Function por HTTP (a diferencia de sync-stock-cron).
--    07:00 ART = 10:00 UTC (Argentina no tiene horario de verano).
--    La generación real "on-demand" también va a poder dispararse
--    desde la UI con un botón "Actualizar" -- esto es sólo el
--    respaldo para que la lista nunca quede más de 1 día desactualizada
--    aunque nadie abra la pantalla.
-- ------------------------------------------------------------
select cron.schedule(
  'generar-reposicion-interna-diario',
  '0 10 * * *',
  $$select public.generar_reposicion_interna();$$
);
