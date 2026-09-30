-- ============================================================
-- 30/9/2026 — Cierra la ejecución de funciones a quien no corresponde.
--
-- Radiografía del 30/9: casi todas las funciones de public tenían
-- EXECUTE para anon (cualquiera con la key pública del bundle). Las más
-- graves, SECURITY DEFINER (corren con permisos del dueño, saltean RLS):
--   * reintentar_ordenes_pendientes_yiqi(): dispara envíos de OC a YiQi.
--   * declarar_linea_reposicion / confirmar_recepcion_linea /
--     crear_remito_reposicion_manual / crear_solicitud_reposicion /
--     generar_remito_reposicion_central / generar_y_declarar_remito_central:
--     crean y mueven remitos de reposición.
--   * sync_*_cron, calcular_punto_equilibrio, evaluar_reglas_reposicion_central,
--     generar_reposicion_interna, generar_remitos_reposicion,
--     recalcular_candidatos_equivalencia_precios: procesos de fondo.
--   * nombres_usuarios(): nombres de los usuarios del sistema.
--
-- Criterio:
--   A) Procesos internos (cron, triggers, Edge Functions con service_role):
--      sin EXECUTE para public/anon/authenticated.
--   B) Lo que llama el frontend logueado: solo authenticated.
--   C) Helpers de RLS (es_admin, mis_*): se dejan como están — devuelven
--      false/vacío para anon y las policies "to public" los evalúan.
--
-- Además, las 3 funciones que usan las pantallas de depósito ahora
-- controlan QUIÉN las llama: el depósito de la solicitud o un admin.
-- Antes cualquier usuario logueado (p. ej. un operador de compras) podía
-- declarar o confirmar líneas de cualquier remito. Si auth.uid() es null
-- es un proceso interno (anon ya no tiene EXECUTE), y se permite.
-- ============================================================

-- A) Internas
revoke execute on function public.calcular_punto_equilibrio() from public, anon, authenticated;
revoke execute on function public.evaluar_reglas_reposicion_central() from public, anon, authenticated;
revoke execute on function public.crear_solicitud_reposicion(integer, integer, text, bigint) from public, anon, authenticated;
revoke execute on function public.generar_y_declarar_remito_central(bigint) from public, anon, authenticated;
revoke execute on function public.recalcular_candidatos_equivalencia_precios() from public, anon, authenticated;
revoke execute on function public.reintentar_ordenes_pendientes_yiqi() from public, anon, authenticated;
revoke execute on function public.sync_movimientos_stock_cron() from public, anon, authenticated;
revoke execute on function public.sync_precios_cron() from public, anon, authenticated;
revoke execute on function public.sync_stock_cron() from public, anon, authenticated;
revoke execute on function public.sync_ventas_vendedor_cron() from public, anon, authenticated;
revoke execute on function public.trigger_auto_preparar_central() from public, anon, authenticated;
revoke execute on function public.trg_recalcular_punto_equilibrio() from public, anon, authenticated;
revoke execute on function public.reactivar_alertas_por_stock() from public, anon, authenticated;
revoke execute on function public.fijar_reactivar_en_alertas_pausadas() from public, anon, authenticated;
revoke execute on function public.upsert_clientes_yiqi(jsonb) from public, anon, authenticated;
revoke execute on function public.upsert_material_yiqi(jsonb) from public, anon, authenticated;
revoke execute on function public.upsert_ordenes_yiqi(jsonb) from public, anon, authenticated;
revoke execute on function public.upsert_precios_proveedor_yiqi(jsonb) from public, anon, authenticated;
revoke execute on function public.upsert_stock_yiqi(jsonb) from public, anon, authenticated;
revoke execute on function public.upsert_ultimo_movimiento_stock_yiqi(jsonb) from public, anon, authenticated;

-- B) Frontend logueado: fuera anon/public, queda authenticated
do $b$
declare
  f text;
begin
  foreach f in array array[
    'public.confirmar_recepcion_linea(bigint, numeric)',
    'public.crear_remito_reposicion_manual(integer, integer, jsonb)',
    'public.declarar_linea_reposicion(bigint, numeric, text)',
    'public.generar_remito_reposicion_central(bigint)',
    'public.generar_remitos_reposicion()',
    'public.generar_reposicion_interna()',
    'public.nombres_usuarios(uuid[])',
    'public.yiqi_estado_actual()',
    'public.buscar_articulos_proveedor(text, text, integer)',
    'public.candidatos_equivalencia_precios(integer)',
    'public.condiciones_proveedor(text)',
    'public.contadores_sidebar()',
    'public.historial_ventas(integer)',
    'public.historial_ventas_json(integer)',
    'public.marcar_reposicion_sugerida(bigint, text, text, numeric)',
    'public.proveedores_con_alertas()',
    'public.reposicion_interna()',
    'public.sugerencias_compra(text)',
    'public.es_administrativo(text)',
    'public.es_comprable(text, text)',
    'public.es_para_fraccionar(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $b$;

-- Control de quién llama, en las 3 funciones de depósito (mismo cuerpo
-- que producción al 30/9 + el chequeo del principio).
create or replace function public.confirmar_recepcion_linea(p_linea_id bigint, p_cantidad_recibida numeric)
 returns void
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_linea record;
  v_destino integer;
begin
  select * into v_linea from public.solicitudes_reposicion_lineas where id = p_linea_id for update;
  if not found then
    raise exception 'Línea % no existe', p_linea_id;
  end if;

  select deposito_destino_id into v_destino from public.solicitudes_reposicion where id = v_linea.solicitud_id;
  if auth.uid() is not null and not (public.es_admin() or v_destino in (select public.mis_depositos())) then
    raise exception 'Solo el depósito destino (o un admin) puede confirmar la recepción de la línea %', p_linea_id;
  end if;

  if v_linea.estado_linea <> 'declarada' then
    raise exception 'La línea % no está lista para confirmar recepción (estado actual: %)', p_linea_id, v_linea.estado_linea;
  end if;
  if v_linea.cantidad_enviada is null or v_linea.cantidad_enviada <= 0 then
    raise exception 'La línea % no tiene cantidad enviada para recibir', p_linea_id;
  end if;

  update public.solicitudes_reposicion_lineas
     set cantidad_recibida = p_cantidad_recibida,
         estado_linea      = 'recibida',
         recibida_en       = now()
   where id = p_linea_id;
end;
$function$;

create or replace function public.crear_remito_reposicion_manual(p_origen integer, p_destino integer, p_lineas jsonb)
 returns bigint
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_id bigint;
begin
  -- El pedido manual lo arma el depósito que va a RECIBIR (destino).
  if auth.uid() is not null and not (public.es_admin() or p_destino in (select public.mis_depositos())) then
    raise exception 'Solo el depósito que pide (destino) o un admin puede crear este pedido';
  end if;

  insert into public.solicitudes_reposicion
    (deposito_origen_id, deposito_destino_id, estado, generada_por, procesada_en, remito_numero)
  values (
    p_origen, p_destino, 'en_preparacion', 'manual', now(),
    'REP-' || to_char(now(), 'YYYY') || '-M' || to_char(now(), 'MMDDHH24MISS')
  )
  returning id into v_id;

  insert into public.solicitudes_reposicion_lineas
    (solicitud_id, sku, mate_nombre, cantidad_solicitada, estado_linea)
  select v_id, (l->>'sku'), (l->>'mate_nombre'), (l->>'cantidad')::numeric, 'reservada'
  from jsonb_array_elements(p_lineas) as l;

  return v_id;
end;
$function$;

create or replace function public.declarar_linea_reposicion(p_linea_id bigint, p_cantidad_enviada numeric, p_motivo_sin_stock text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_linea record;
  v_faltante numeric;
  v_origen integer;
begin
  select * into v_linea from public.solicitudes_reposicion_lineas where id = p_linea_id for update;
  if not found then
    raise exception 'Línea % no existe', p_linea_id;
  end if;

  select deposito_origen_id into v_origen from public.solicitudes_reposicion where id = v_linea.solicitud_id;
  if auth.uid() is not null and not (public.es_admin() or v_origen in (select public.mis_depositos())) then
    raise exception 'Solo el depósito que prepara (origen) o un admin puede declarar la línea %', p_linea_id;
  end if;

  if v_linea.estado_linea <> 'reservada' then
    raise exception 'La línea % ya fue declarada (estado actual: %)', p_linea_id, v_linea.estado_linea;
  end if;

  v_faltante := greatest(v_linea.cantidad_solicitada - p_cantidad_enviada, 0);
  if v_faltante > 0 and (p_motivo_sin_stock is null or btrim(p_motivo_sin_stock) = '') then
    raise exception 'Falta el motivo de "no hay" para cubrir el faltante de %', v_faltante;
  end if;

  update public.solicitudes_reposicion_lineas
     set cantidad_enviada  = p_cantidad_enviada,
         cantidad_faltante = v_faltante,
         motivo_sin_stock  = case when v_faltante > 0 then p_motivo_sin_stock else null end,
         estado_linea      = 'declarada',
         declarada_en      = now()
   where id = p_linea_id;

  if v_faltante > 0 then
    insert into public.alertas_suspendidas (sku, motivo, solicitud_linea_id)
    values (v_linea.sku, p_motivo_sin_stock, p_linea_id)
    on conflict (sku) do update
      set motivo = excluded.motivo,
          solicitud_linea_id = excluded.solicitud_linea_id,
          suspendida_en = now(),
          reactivada_en = null;
    -- Pendiente (desde 7/9): enganchar acá la creación de la OC vía reglas_compra.
  end if;
end;
$function$;

-- create or replace conserva los grants; se reafirman por las dudas.
revoke execute on function public.confirmar_recepcion_linea(bigint, numeric) from public, anon;
revoke execute on function public.crear_remito_reposicion_manual(integer, integer, jsonb) from public, anon;
revoke execute on function public.declarar_linea_reposicion(bigint, numeric, text) from public, anon;
grant execute on function public.confirmar_recepcion_linea(bigint, numeric) to authenticated;
grant execute on function public.crear_remito_reposicion_manual(integer, integer, jsonb) to authenticated;
grant execute on function public.declarar_linea_reposicion(bigint, numeric, text) to authenticated;
