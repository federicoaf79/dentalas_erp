-- ============================================================
-- 20260916220000_fix_columna_stock_yiqi_evaluar_reglas.sql
-- Dentalab-Compras — fix: columna inexistente en evaluar_reglas_
-- reposicion_central() (bug propio, introducido en la migración del
-- Sprint punto 3, 20260916140000)
-- ============================================================
--
-- Qué pasó: la función usaba "stock_yiqi.mate_codigo" para el join
-- con material_yiqi, pero la columna real en stock_yiqi es "sku"
-- (confirmado en vivo por Federico corriendo un query de diagnóstico
-- que devolvió: ERROR 42703 column s.mate_codigo does not exist,
-- HINT: Perhaps you meant m.mate_codigo). stock_yiqi/ordenes_yiqi/
-- punto_equilibrio_local usan "sku"; material_yiqi/ordenes_propias_
-- items usan "mate_codigo" -- son 2 convenciones distintas que
-- conviven en el proyecto.
--
-- Por qué no se vio en los 4 chequeos del 16/9: la función siempre
-- cortaba antes en el gate de "ya hay una solicitud sin resolver"
-- (solicitud #7, stuck desde el 10/9) -- nunca llegó a ejecutar la
-- consulta de déficit que tenía la columna mal. El bug quedaba
-- latente: en cuanto alguien resolviera la solicitud #7, la próxima
-- corrida del cron iba a fallar con este mismo error.
--
-- Fix: create or replace de la misma función, solo corrigiendo el
-- join (stock_yiqi.sku en vez de stock_yiqi.mate_codigo). Nada más
-- cambia -- misma lógica, mismo cron (evaluar-reglas-reposicion-
-- central, cada 15 min, jobid 15), no hace falta tocarlo de nuevo.
-- ============================================================

create or replace function public.evaluar_reglas_reposicion_central()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_ultima timestamptz;
  v_ya_pendiente boolean;
  v_hay_deficit boolean;
begin
  for r in select * from reglas_reposicion_central where activa = true loop

    -- Respeta la frecuencia configurada: no re-evalúa antes de tiempo,
    -- mirando la última solicitud automática que generó esta regla.
    select max(creada_en) into v_ultima
    from solicitudes_reposicion
    where regla_id = r.id and generada_por = 'regla_automatica';

    if v_ultima is not null
       and v_ultima > now() - (r.frecuencia_minutos || ' minutes')::interval then
      continue;
    end if;

    -- No duplica si ya hay una solicitud sin resolver para el circuito
    -- principal (Central=157 → Local=155).
    select exists (
      select 1 from solicitudes_reposicion
      where deposito_origen_id = 157
        and deposito_destino_id = 155
        and estado in ('solicitada', 'en_preparacion')
    ) into v_ya_pendiente;

    if v_ya_pendiente then
      continue;
    end if;

    -- ¿Hay déficit real? Mismo criterio "Crítica" que ya usan
    -- Alertas/Monitor de stock, sobre SKU no excluidos por rotación
    -- (punto_equilibrio_local.excluido) y, si la regla lo pide, sin
    -- una alerta ya suspendida en este mismo circuito sin reactivar.
    -- FIX 16/9/2026: stock_yiqi.sku (no stock_yiqi.mate_codigo).
    select exists (
      select 1
      from material_yiqi m
      join stock_yiqi s on s.sku = m.mate_codigo
      left join punto_equilibrio_local pe on pe.sku = m.mate_codigo
      where coalesce(pe.excluido, false) = false
        and s.stock_local <= coalesce(
              nullif(m.mate_punto_de_pedido, 0),
              m.mate_stock_seguridad
            )
        and (
          r.excluir_sin_stock = false
          or m.mate_codigo not in (
            select sku from alertas_suspendidas where reactivada_en is null
          )
        )
    ) into v_hay_deficit;

    if v_hay_deficit then
      perform crear_solicitud_reposicion(157, 155, 'regla_automatica', r.id);
    end if;

  end loop;
end;
$function$;

comment on function public.evaluar_reglas_reposicion_central() is
  'Job periódico (Sprint punto 3, 16/9/2026): evalúa reglas_reposicion_central activas y crea una solicitud automática (crear_solicitud_reposicion) para el circuito Central→Local cuando hay déficit real y no hay ya una solicitud sin resolver. Respeta frecuencia_minutos por regla. Fix 16/9/2026 22:03 UTC: stock_yiqi.sku (no .mate_codigo).';
