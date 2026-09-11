-- ============================================================
-- 20260910120000_auto_preparar_central.sql
-- ============================================================
-- Unificación Eje 1 — cambio 1 (ver DISENO_TECNICO_Unificacion_Eje1_
-- 10-9-2026.md, §3.1). Aris, feedback 10/9/2026:
--   "ahorrar el paso de que Depósito Central valide las cantidades,
--    ya que las mismas se ven desde Yiqi. Todo lo de depósito esta
--    en Yiqi."
--
-- Automatiza, SOLO para Depósito Central (id 157) como origen, los 2
-- clics manuales que hoy hace la cuenta de depósito en
-- SolicitudesParaPreparar.jsx ("Generar remito de mercadería" +
-- "Declarar" línea por línea): en cuanto se crea una fila en
-- solicitudes_reposicion con deposito_origen_id = 157 y
-- estado = 'solicitada', se genera y declara sola.
--
-- IMPORTANTE — esto NO modifica ninguna función existente:
--   - generar_remito_reposicion_central(p_solicitud_id) se llama tal
--     cual está hoy, sin tocarla (mantiene el neteo contra reservas
--     `en_preparacion` y la exclusión de alertas_suspendidas).
--   - declarar_linea_reposicion(p_linea_id, p_cantidad_enviada,
--     p_motivo_sin_stock) se llama tal cual está hoy, una vez por
--     línea generada.
-- Solo se agregan 2 funciones nuevas + 1 trigger. Riesgo acotado: si
-- algo sale mal, se puede desactivar el trigger sin afectar el resto
-- del circuito (ver bloque de rollback al final, comentado).
--
-- El circuito inverso (Local pide a Central, vía
-- crear_remito_reposicion_manual) NO se toca — sigue creando la
-- solicitud directo en 'en_preparacion', sin pasar por este trigger.
--
-- ⚠️ ANTES DE CORRER: Federico, correr esto en el SQL Editor de
-- Supabase (https://supabase.com/dashboard/project/hsfudsnmooaesrzdwecg/sql/new)
-- y probarlo con una solicitud de prueba antes de confiarlo con datos
-- reales (ver bloque de prueba comentado al final).
-- ============================================================

create or replace function generar_y_declarar_remito_central(p_solicitud_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_disponible numeric;
  v_enviar numeric;
  v_motivo text;
begin
  -- 1. Genera el remito con el cálculo en vivo ya existente, sin tocarlo.
  perform generar_remito_reposicion_central(p_solicitud_id);

  -- 2. Declara automáticamente cada línea reservada, contra el stock
  --    real de Depósito Central en stock_yiqi.
  for r in
    select l.id, l.sku, l.cantidad_solicitada
    from solicitudes_reposicion_lineas l
    where l.solicitud_id = p_solicitud_id
      and l.estado_linea = 'reservada'
  loop
    select coalesce(stock_central, 0) into v_disponible
    from stock_yiqi
    where sku = r.sku;

    v_enviar := greatest(least(r.cantidad_solicitada, coalesce(v_disponible, 0)), 0);
    v_motivo := case
      when v_enviar < r.cantidad_solicitada
        then 'Automático: stock insuficiente en Depósito Central (disponible ' || coalesce(v_disponible, 0)::text || ')'
      else null
    end;

    perform declarar_linea_reposicion(r.id, v_enviar, v_motivo);
  end loop;
end;
$$;

comment on function generar_y_declarar_remito_central(bigint) is
  'Unificación Eje 1 (10/9/2026): genera y declara en un solo paso, sin intervención humana, cuando el origen es Depósito Central. Llama a generar_remito_reposicion_central() y declarar_linea_reposicion() ya existentes, sin modificarlas.';

create or replace function trigger_auto_preparar_central()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deposito_origen_id = 157 and new.estado = 'solicitada' then
    perform generar_y_declarar_remito_central(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_preparar_central on solicitudes_reposicion;
create trigger trg_auto_preparar_central
after insert on solicitudes_reposicion
for each row
execute function trigger_auto_preparar_central();

-- ============================================================
-- PRUEBA SUGERIDA (correr aparte, después de aplicar lo de arriba):
--
--   insert into solicitudes_reposicion (deposito_origen_id, deposito_destino_id, estado, generada_por)
--   values (157, 155, 'solicitada', 'manual_prueba')
--   returning id;
--
-- Después, verificar que haya pasado sola a 'en_preparacion' con las
-- líneas ya declaradas:
--
--   select l.sku, l.cantidad_solicitada, l.cantidad_enviada, l.estado_linea, l.motivo_sin_stock
--   from solicitudes_reposicion_lineas l
--   where l.solicitud_id = <el id que devolvió el insert de arriba>;
--
-- Si algo sale mal y hace falta volver atrás sin perder el resto del
-- circuito:
--
--   drop trigger if exists trg_auto_preparar_central on solicitudes_reposicion;
-- ============================================================
