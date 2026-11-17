-- ============================================================
-- 20261117130000_diferencias_recepcion.sql — 17/11/2026
-- ============================================================
-- Diferencias en el circuito de pedidos entre depósitos (Central ↔ Local).
-- Reglas definidas por Aris (vía Federico, 17/11):
--   1. Si la cantidad ENVIADA difiere de la PEDIDA (de menos o de más), se
--      asienta el motivo. Antes solo se pedía motivo cuando faltaba.
--   2. Si la cantidad RECIBIDA difiere de la ENVIADA, ese artículo queda
--      FRENADO: estado_linea = 'con_diferencia', con motivo obligatorio.
--      No se mueve stock (mover-stock-reposicion solo mueve líneas
--      'recibida') y el pedido no se cierra (no es estado terminal).
--   3. Los artículos donde lo recibido coincide con lo enviado se cierran
--      como siempre ('recibida' = OK) y mueven el stock.
--   4. El artículo frenado lo resuelve QUIEN LO RECIBE (el depósito destino,
--      Local o Central) con "Revisado": confirma la cantidad final recibida
--      (puede corregirla tras recontar) y una nota. Pasa a 'recibida', se
--      mueve el stock con esa cantidad y, si era el último, el pedido se
--      cierra solo (trigger existente).
-- El admin también puede revisar (mismo criterio que el resto de las
-- funciones del circuito).
-- Idempotente.
-- ============================================================

alter table public.solicitudes_reposicion_lineas
  add column if not exists cantidad_recibida_inicial numeric,
  add column if not exists motivo_diferencia text,
  add column if not exists nota_diferencia text,
  add column if not exists diferencia_revisada_en timestamptz,
  add column if not exists diferencia_revisada_por uuid references auth.users(id),
  add column if not exists nota_revision text;

-- El estado nuevo tiene que entrar en la restricción del baseline (:405).
alter table public.solicitudes_reposicion_lineas
  drop constraint if exists solicitudes_reposicion_lineas_estado_linea_check;
alter table public.solicitudes_reposicion_lineas
  add constraint solicitudes_reposicion_lineas_estado_linea_check
  check (estado_linea = any (array['reservada'::text, 'declarada'::text, 'con_diferencia'::text, 'recibida'::text]));

-- 1) Motivo también cuando se envía de más.
create or replace function public.declarar_linea_reposicion(p_linea_id bigint, p_cantidad_enviada numeric, p_motivo_sin_stock text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_linea record;
  v_faltante numeric;
  v_difiere boolean;
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
  v_difiere := p_cantidad_enviada is distinct from v_linea.cantidad_solicitada;
  if v_difiere and (p_motivo_sin_stock is null or btrim(p_motivo_sin_stock) = '') then
    if v_faltante > 0 then
      raise exception 'Falta el motivo de "no hay" para cubrir el faltante de %', v_faltante;
    else
      raise exception 'Falta el motivo: se envía más (%) de lo pedido (%)', p_cantidad_enviada, v_linea.cantidad_solicitada;
    end if;
  end if;

  update public.solicitudes_reposicion_lineas
     set cantidad_enviada  = p_cantidad_enviada,
         cantidad_faltante = v_faltante,
         motivo_sin_stock  = case when v_difiere then p_motivo_sin_stock else null end,
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
  end if;
end;
$function$;

-- 2) Confirmar recepción: si difiere de lo enviado, la línea queda frenada.
--    Se reemplaza la versión de 2 parámetros por una de 4 con defaults
--    (una llamada vieja con 2 parámetros sigue funcionando si no hay diferencia).
drop function if exists public.confirmar_recepcion_linea(bigint, numeric);

create or replace function public.confirmar_recepcion_linea(
  p_linea_id bigint,
  p_cantidad_recibida numeric,
  p_motivo_diferencia text default null,
  p_nota_diferencia text default null
)
 returns text
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
  if p_cantidad_recibida is null or p_cantidad_recibida < 0 then
    raise exception 'Cantidad recibida inválida para la línea %', p_linea_id;
  end if;

  if p_cantidad_recibida = v_linea.cantidad_enviada then
    update public.solicitudes_reposicion_lineas
       set cantidad_recibida = p_cantidad_recibida,
           cantidad_recibida_inicial = p_cantidad_recibida,
           estado_linea      = 'recibida',
           recibida_en       = now()
     where id = p_linea_id;
    return 'recibida';
  end if;

  if p_motivo_diferencia is null or btrim(p_motivo_diferencia) = '' then
    raise exception 'Falta el motivo: se recibió % y se había enviado %', p_cantidad_recibida, v_linea.cantidad_enviada;
  end if;

  update public.solicitudes_reposicion_lineas
     set cantidad_recibida = p_cantidad_recibida,
         cantidad_recibida_inicial = p_cantidad_recibida,
         motivo_diferencia = p_motivo_diferencia,
         nota_diferencia   = nullif(btrim(coalesce(p_nota_diferencia, '')), ''),
         estado_linea      = 'con_diferencia',
         recibida_en       = now()
   where id = p_linea_id;
  return 'con_diferencia';
end;
$function$;

-- 3) Revisado: lo hace quien recibe (destino) o un admin.
create or replace function public.revisar_diferencia_linea(
  p_linea_id bigint,
  p_cantidad_final numeric,
  p_nota text default null
)
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
    raise exception 'Solo el depósito que recibe (o un admin) puede revisar la diferencia de la línea %', p_linea_id;
  end if;

  if v_linea.estado_linea <> 'con_diferencia' then
    raise exception 'La línea % no tiene una diferencia pendiente (estado actual: %)', p_linea_id, v_linea.estado_linea;
  end if;
  if p_cantidad_final is null or p_cantidad_final < 0 then
    raise exception 'Cantidad final inválida para la línea %', p_linea_id;
  end if;

  update public.solicitudes_reposicion_lineas
     set cantidad_recibida       = p_cantidad_final,
         estado_linea            = 'recibida',
         diferencia_revisada_en  = now(),
         diferencia_revisada_por = auth.uid(),
         nota_revision           = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_linea_id;
end;
$function$;

revoke execute on function public.declarar_linea_reposicion(bigint, numeric, text) from public, anon;
revoke execute on function public.confirmar_recepcion_linea(bigint, numeric, text, text) from public, anon;
revoke execute on function public.revisar_diferencia_linea(bigint, numeric, text) from public, anon;
grant execute on function public.declarar_linea_reposicion(bigint, numeric, text) to authenticated;
grant execute on function public.confirmar_recepcion_linea(bigint, numeric, text, text) to authenticated;
grant execute on function public.revisar_diferencia_linea(bigint, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- Verificación (solo lectura):
--   select column_name from information_schema.columns
--    where table_name = 'solicitudes_reposicion_lineas'
--      and column_name in ('cantidad_recibida_inicial','motivo_diferencia','nota_diferencia',
--                          'diferencia_revisada_en','diferencia_revisada_por','nota_revision');
--   select p.proname, pg_get_function_identity_arguments(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('confirmar_recepcion_linea','revisar_diferencia_linea','declarar_linea_reposicion');
-- ------------------------------------------------------------
