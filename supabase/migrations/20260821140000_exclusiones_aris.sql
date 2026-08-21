-- ============================================================
-- 20260821140000_exclusiones_aris.sql
-- Dentalab-Compras — Reglas de exclusión de la especificación de
-- Aris (claude/ARIS_Especificacion_Reposicion_Interna_y_Produccion.md
-- secciones 6.1/6.3/6.4, y claude/Dentalab_sistema_Aris_ORIGINAL.txt
-- secciones 9.3/9.4/9.5/10.2/10.5) que todavía no estaban codificadas
-- en ningún lado, o solo a medias.
-- ============================================================
--
-- ESTADO ANTES DE ESTA MIGRATION (confirmado leyendo el código real,
-- no asumido):
--   - es_comprable(nombre, proveedor) YA excluye ML "###", "discontinuad"
--     en el nombre, y producción propia (proveedor = Dentalab). La usan
--     sugerencias_compra() y reposicion_interna().
--   - reposicion_interna() YA excluye los SKU administrativos 889/890/
--     99999 (categoría "No considerados"), pero con la lista pegada
--     directo en el CASE (duplicar la lista en otro lado es un error
--     esperando pasar).
--   - sugerencias_compra() (sugerencia de compra externa) NO excluía
--     los SKU administrativos -- podían aparecer como "hay que comprar
--     889" si por casualidad tuvieran umbral/stock cargado.
--   - Ninguna función excluía "PARA FRACCIONAR" en ningún lado todavía.
--   - Alertas.jsx (calcularAlerta(), frontend puro) no aplicaba NINGÚN
--     filtro de exclusión -- ni siquiera el es_comprable() que ya existe
--     hace rato para compras. Los SKU administrativos, las publicaciones
--     de ML, los discontinuados y la producción propia podían (y
--     probablemente estaban) generando alertas de "Crítica"/"Preventiva"
--     sin sentido.
--
-- DECISIONES DE ALCANCE tomadas leyendo la especificación con cuidado
-- (no se le preguntó a Federico cada una -- son consistentes con el
-- patrón ya usado en el resto del sistema):
--   1) "PARA FRACCIONAR" (sección 6.1) es una regla de "no enviar al
--      local", NO una regla de "no comprar" -- el propio texto de Aris
--      dice que estos artículos "pueden aparecer en planificación de
--      compras si son necesarios como materia prima". Por eso NO se
--      suma a es_comprable() (eso rompería sugerencias_compra() y
--      Alertas para estos artículos) -- se suma como una categoría
--      nueva, propia, dentro de reposicion_interna() únicamente.
--   2) Los SKU administrativos (889/890/99999) sí deben excluirse de
--      TODO análisis operativo -- así lo dice explícito la sección 9.4/
--      6.3 ("no deben incluirse en reposición, artículos a pedir, ni
--      análisis operativo de stock comercial"). Se centraliza en una
--      función nueva (es_administrativo) para no repetir la lista en
--      3 lugares, y se aplica en sugerencias_compra(), reposicion_interna()
--      y Alertas.jsx.
--   3) 978/40156/"31110 T" NO necesitan código nuevo -- son un aviso de
--      "no filtrar por error", no una regla activa. Se verifican al
--      final de este archivo (comentario) contra las reglas nuevas y
--      las que ya existían, para confirmar que ninguna los toca.
-- ============================================================

-- ------------------------------------------------------------
-- 1) es_administrativo(sku) -- fuente única de verdad para los SKU
--    administrativos. IMMUTABLE porque la lista solo cambia si se
--    edita esta función (igual criterio que es_comprable()).
-- ------------------------------------------------------------
create or replace function public.es_administrativo(p_sku text)
returns boolean
language sql
immutable
as $function$
  select coalesce(p_sku, '') in ('889', '890', '99999');
$function$;

comment on function public.es_administrativo(text) is
  'SKU administrativos (Aris, sección 9.4/6.3): no son artículos reales, no deben entrar en reposición, artículos a pedir, ni ningún análisis operativo de stock comercial. Lista centralizada acá para no repetirla en reposicion_interna()/sugerencias_compra()/Alertas.';

-- ------------------------------------------------------------
-- 2) es_para_fraccionar(nombre) -- regla de "no enviar al local"
--    (sección 6.1), separada a propósito de es_comprable(): estos
--    artículos SÍ pueden comprarse (son materia prima), solo no deben
--    moverse al local.
-- ------------------------------------------------------------
create or replace function public.es_para_fraccionar(p_nombre text)
returns boolean
language sql
immutable
as $function$
  select coalesce(p_nombre, '') ilike '%PARA FRACCIONAR%';
$function$;

comment on function public.es_para_fraccionar(text) is
  'Productos "PARA FRACCIONAR" (Aris, sección 6.1): se manipulan solo en Depósito Central, nunca se envían al local. A diferencia de es_comprable(), NO bloquea la compra -- pueden necesitarse como materia prima. Usado solo en reposicion_interna(), a propósito.';

-- ------------------------------------------------------------
-- 3) sugerencias_compra(): suma la exclusión de administrativos que
--    le faltaba. Resto de la función IDÉNTICO a la versión vigente
--    (20260810120000) -- se confirmó con pg_get_functiondef antes de
--    escribir esto, no se asumió.
-- ------------------------------------------------------------
create or replace function public.sugerencias_compra(p_proveedor text)
returns table(mate_codigo text, mate_nombre text, stock numeric, umbral numeric, promedio numeric, unidades_por_bulto numeric, costo_unitario numeric, cantidad_sugerida numeric, topeada boolean, nivel text)
language sql
stable
as $function$
  with reglas as (
    select meses_cobertura, max_cajas_por_producto
    from public.reglas_compra where id = 1
  ),
  prom as (
    select
      coalesce(ca.codigo_componente, v.mate_codigo) as mate_codigo,
      sum(v.cantidad * coalesce(ca.cantidad, 1)) / 12.0 as promedio
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
      m.mate_codigo,
      m.mate_nombre,
      coalesce(m.mate_stock_disponible, 0) as stock,
      case when m.mate_punto_de_pedido > 0 then m.mate_punto_de_pedido
           else m.mate_stock_seguridad end as umbral,
      greatest(coalesce(p.promedio, 0), 0) as promedio,
      nullif(coalesce(m.mate_cantidad_de_unidades, 0), 0) as bulto,
      nullif(coalesce(m.mate_crm, 0), 0) as costo
    from public.material_yiqi m
    left join prom p on p.mate_codigo = m.mate_codigo
    where m.clie_nombre = p_proveedor
      and public.es_comprable(m.mate_nombre, m.clie_nombre)
      and not public.es_administrativo(m.mate_codigo)
  ),
  calc as (
    select b.*, r.max_cajas_por_producto,
           greatest(b.promedio * r.meses_cobertura, coalesce(b.umbral, 0)) - b.stock as faltante,
           (b.promedio <= 0 and coalesce(b.umbral, 0) <= 0) as sin_base
    from base b, reglas r
    where b.umbral is not null and b.stock <= b.umbral
  ),
  bruta as (
    select c.*,
           case when c.sin_base then null
                when c.faltante <= 0 then coalesce(c.bulto, 1)
                when c.bulto is not null then ceil(c.faltante / c.bulto) * c.bulto
                else ceil(c.faltante) end as sugerida_sin_tope
    from calc c
  ),
  final as (
    select b.*,
           case when b.sugerida_sin_tope is null then null
                when b.bulto is null then b.sugerida_sin_tope
                else least(b.sugerida_sin_tope, b.max_cajas_por_producto * b.bulto) end as sugerida_final
    from bruta b
  )
  select f.mate_codigo, f.mate_nombre, f.stock, f.umbral, round(f.promedio, 1),
         f.bulto, f.costo, f.sugerida_final,
         (f.sugerida_final is not null and f.sugerida_final < f.sugerida_sin_tope),
         case when f.stock <= 0 then 'critica' else 'preventiva' end
  from final f
  order by f.sin_base, (case when f.stock <= 0 then 0 else 1 end), f.promedio desc;
$function$;

-- ------------------------------------------------------------
-- 4) reposicion_interna(): mismo shape de salida que la versión
--    vigente (20260819130000) -- no hace falta DROP. Dos cambios en
--    el CASE final, nada más:
--    a) SKU administrativos vía es_administrativo(f.sku) en vez de la
--       lista pegada en el CASE (misma lista, ahora centralizada).
--    b) Nueva rama "PARA FRACCIONAR" (es_para_fraccionar) dentro de
--       la misma categoría "No enviar al local" que ya usaba
--       "not comprable" -- se juntan con OR porque las dos llevan a
--       la misma prioridad_orden/label, solo cambia el motivo.
-- ------------------------------------------------------------
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
      when public.es_administrativo(f.sku) or f.mate_nombre is null or trim(f.mate_nombre) = '' then 8
      when not f.comprable or public.es_para_fraccionar(f.mate_nombre) then 7
      when f.stock_central <= 0 and f.deficit_local > 0 then 6
      when f.stock_local = 0 and f.stock_central > 0 and f.clase_abc = 'A' then 1
      when f.stock_local = 0 and f.stock_central > 0 and f.clase_abc = 'B' then 2
      when f.stock_local = 0 and f.stock_central > 0 then 3
      when f.stock_local > 0 and f.cobertura_dias_local < 7 then 4
      when f.deficit_local > 0 then 5
      else 9
    end as prioridad_orden,
    case
      when public.es_administrativo(f.sku) or f.mate_nombre is null or trim(f.mate_nombre) = '' then 'No considerados'
      when not f.comprable or public.es_para_fraccionar(f.mate_nombre) then 'No enviar al local'
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
  'Fase 2 del módulo de Stock: reposición Local<->Depósito Central según la especificación de Aris (8 niveles de prioridad + ABC). No es SECURITY DEFINER a propósito -- respeta la RLS de material_yiqi/stock_yiqi. 21/8/2026: "No enviar al local" ahora también agrupa PARA FRACCIONAR (es_para_fraccionar), y "No considerados" usa es_administrativo() en vez de la lista pegada en el CASE.';

-- ============================================================
-- Verificación de 978 / 40156 / "31110 T" (Aris, sección 6.4/10.5):
-- estos 3 SKU son artículos reales y NO deben tocarlos ninguna regla
-- de exclusión, ni las nuevas ni las que ya existían. Repaso manual
-- contra cada regla activa (no hace falta código, es solo para dejar
-- registro de que se pensó):
--   - es_administrativo(sku): la lista es ('889','890','99999') --
--     ninguno de los 3 coincide.
--   - es_para_fraccionar(nombre): solo dispara si el NOMBRE contiene
--     literalmente "PARA FRACCIONAR" -- no depende del SKU en absoluto,
--     así que estos 3 SKU solo quedarían atrapados si su descripción
--     real tuviera ese texto, lo cual no tiene que ver con el formato
--     "raro" del SKU (que es el caso que Aris pide no confundir).
--   - es_comprable(nombre, proveedor): ídem -- depende del NOMBRE
--     ("###", "discontinuad") y del PROVEEDOR ("Dentalab"), nunca del
--     formato del SKU.
-- Ninguna de las 3 reglas mira el SKU salvo es_administrativo(), y ahí
-- la lista es explícita y no incluye a estos 3. Confirmar en vivo
-- después de aplicar (ver instrucciones) que aparecen en
-- reposicion_interna() con una categoría normal, no "No considerados"
-- ni "No enviar al local" (salvo que su nombre real sí contenga
-- "PARA FRACCIONAR" o "###", en cuyo caso el motivo sería legítimo y
-- no un error de formato de SKU).
-- ============================================================
