-- ============================================================
-- 20261118180000_remito_interno_yiqi.sql — 18/11/2026
-- ============================================================
-- Decisión de Federico (18/11), camino B: la app PLANIFICA los pedidos entre
-- depósitos (reglas ABC, tope de pedidos abiertos, recálculo de los que están en
-- espera, pedidos manuales) y los ESCRIBE en YiQi como "Remito Interno" Pendiente.
-- Los depósitos los ejecutan en YiQi como hoy (Enviar -> cargan recibidos ->
-- Procesado) y la app lee el estado de vuelta. YiQi mueve el stock solo al
-- procesar ("Crea mov. de stock de los recibidos"): la app NO escribe además
-- MOVIMIENTO_STOCK para esos pedidos.
--
-- Mientras no se habilite la escritura (modo prueba) NADA se escribe en YiQi:
--   reglas_compra.escritura_yiqi_habilitada = true  Y
--   reglas_reposicion_central.escribir_remito_en_yiqi = true
-- (ambas apagadas hoy). La lectura/sincronización anda siempre.
--
-- Qué hace (idempotente, re-ejecutable):
--  a) Columnas yiqi_* en solicitudes_reposicion; escribir_remito_en_yiqi y
--     yiqi_usuario_responsable en reglas_reposicion_central.
--     (Extra al contrato: yiqi_publicando_en = candado anti-duplicados.)
--  b) _rechazar_si_gestion_yiqi(): chequeo común. Las RPC del circuito de la app
--     que siguen vivas (declarar_linea_reposicion, confirmar_recepcion_linea,
--     revisar_diferencia_linea, corregir_envio_linea, registrar_no_previsto,
--     resolver_no_previsto) RECHAZAN los pedidos con gestion_en_yiqi = true.
--     Se redefinen copiando la versión vigente y agregando SOLO ese chequeo.
--  c) configurar_remito_yiqi(p_activo) (admin), publicar_pedido_en_yiqi_pendiente(id)
--     (marca intención, no escribe), reclamar_publicacion_yiqi(id) (candado, solo service_role).
--  d) aplicar_estado_remito_yiqi(id, payload) (solo service_role): espejo del estado
--     del remito de YiQi en el pedido (declarada / recibida / completada / anulada).
--  e) recalcular_remitos_en_espera() redefinida: un pedido publicado sigue "en espera"
--     solo si en YiQi sigue Pendiente (y la última lectura es de hace menos de 30 min);
--     al recalcularlo marca yiqi_requiere_actualizar si cambió su contenido.
--  f) estado_reposicion_automatica() redefinida con los campos de YiQi.
--  g) Cron remito-interno-yiqi-ciclo cada 10 min (key en Vault, timeout 120 s).
--
-- Requiere 20261118170000 (y las anteriores) aplicadas.
-- Orden de deploy: 1) esta migración, 2) functions remito-interno-yiqi y mover-stock-reposicion.
-- ============================================================

-- a) Columnas ---------------------------------------------------------------------
alter table public.solicitudes_reposicion
  add column if not exists gestion_en_yiqi boolean not null default false,
  add column if not exists yiqi_remito_id bigint,
  add column if not exists yiqi_remito_nro bigint,
  add column if not exists yiqi_remito_estado text,
  add column if not exists yiqi_hay_diferencias boolean,
  add column if not exists yiqi_publicado_en timestamptz,
  add column if not exists yiqi_sincronizado_en timestamptz,
  add column if not exists yiqi_requiere_actualizar boolean not null default false,
  add column if not exists yiqi_error text,
  add column if not exists yiqi_publicando_en timestamptz;

create unique index if not exists solicitudes_reposicion_yiqi_remito_id_uq
  on public.solicitudes_reposicion (yiqi_remito_id) where yiqi_remito_id is not null;

alter table public.reglas_reposicion_central
  add column if not exists escribir_remito_en_yiqi boolean not null default false,
  add column if not exists yiqi_usuario_responsable integer not null default 156;

-- b) Chequeo común para las RPC del circuito de la app --------------------------------
create or replace function public._rechazar_si_gestion_yiqi(p_solicitud_id bigint)
returns void
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v record;
begin
  select s.gestion_en_yiqi, s.yiqi_remito_nro, s.yiqi_remito_id into v
  from public.solicitudes_reposicion s
  where s.id = p_solicitud_id;
  if found and v.gestion_en_yiqi then
    raise exception 'Este pedido se gestiona en YiQi (Remito Interno N° %): hacelo desde YiQi',
      coalesce(v.yiqi_remito_nro::text, v.yiqi_remito_id::text, '?');
  end if;
end;
$function$;
revoke all on function public._rechazar_si_gestion_yiqi(bigint) from public, anon, authenticated;

-- c) RPC de configuración / intención / candado ---------------------------------------
create or replace function public.configurar_remito_yiqi(p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id bigint;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede configurar la escritura de remitos en YiQi';
  end if;
  if p_activo is null then
    raise exception 'Falta indicar si la escritura de remitos en YiQi queda activada o apagada';
  end if;

  select id into v_id from public.reglas_reposicion_central order by id limit 1;
  if v_id is null then
    -- Sin fila de reglas: se crea apagada (activa = false) para no prender la reposición automática de rebote.
    insert into public.reglas_reposicion_central (activa, escribir_remito_en_yiqi, actualizada_por, actualizada_en)
    values (false, p_activo, auth.uid(), now());
  else
    update public.reglas_reposicion_central
       set escribir_remito_en_yiqi = p_activo,
           actualizada_por = auth.uid(),
           actualizada_en = now()
     where id = v_id;
  end if;

  return jsonb_build_object(
    'escribir_remito_en_yiqi', p_activo,
    'escritura_yiqi_habilitada', coalesce((select rc.escritura_yiqi_habilitada from public.reglas_compra rc where rc.id = 1), false)
  );
end;
$function$;

-- Solo marca intención. NO escribe en YiQi: el front llama después a la edge function remito-interno-yiqi.
create or replace function public.publicar_pedido_en_yiqi_pendiente(p_solicitud_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sol public.solicitudes_reposicion;
begin
  select * into v_sol from public.solicitudes_reposicion where id = p_solicitud_id for update;
  if not found then
    raise exception 'Pedido % no existe', p_solicitud_id;
  end if;
  if auth.uid() is not null and not (
       public.es_admin()
       or v_sol.deposito_origen_id in (select public.mis_depositos())
       or v_sol.deposito_destino_id in (select public.mis_depositos())) then
    raise exception 'Solo un depósito involucrado en el pedido % (o un admin) puede publicarlo en YiQi', p_solicitud_id;
  end if;
  if v_sol.estado not in ('solicitada', 'en_preparacion') then
    raise exception 'El pedido % no está abierto (estado actual: %)', p_solicitud_id, v_sol.estado;
  end if;

  -- Ya publicado: queda marcado para que el próximo ciclo (o el front) lo actualice en YiQi.
  -- No publicado: no hay nada que marcar, lo publica la edge function / el ciclo.
  if v_sol.yiqi_remito_id is not null then
    update public.solicitudes_reposicion set yiqi_requiere_actualizar = true where id = p_solicitud_id;
  end if;

  return jsonb_build_object(
    'solicitud_id', p_solicitud_id,
    'publicado', v_sol.yiqi_remito_id is not null,
    'requiere_actualizar', v_sol.yiqi_remito_id is not null,
    'escritura_yiqi_habilitada', coalesce((select rc.escritura_yiqi_habilitada from public.reglas_compra rc where rc.id = 1), false),
    'escribir_remito_en_yiqi', coalesce((select r.escribir_remito_en_yiqi from public.reglas_reposicion_central r order by r.id limit 1), false)
  );
end;
$function$;

-- Candado anti-duplicados (solo service_role): evita que el click del usuario y el cron
-- publiquen el mismo pedido a la vez. Se vence a los 3 minutos por si una invocación se cae.
create or replace function public.reclamar_publicacion_yiqi(p_solicitud_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_n integer;
begin
  update public.solicitudes_reposicion
     set yiqi_publicando_en = now()
   where id = p_solicitud_id
     and estado = 'en_preparacion'
     and yiqi_remito_id is null
     and (yiqi_publicando_en is null or yiqi_publicando_en < now() - interval '3 minutes');
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$function$;

-- d) Espejo del estado del remito de YiQi en el pedido --------------------------------
-- p_payload (lo normaliza la edge function a partir del GET /REMITO_INTERNO/{id}):
--   { "existe": true|false,            -- false = 404 en YiQi
--     "estado": "Pendiente",           -- ESTA_NOMBRE
--     "nro": 6596,                     -- REIN_NRO_REMITO_INTERNO
--     "hay_diferencias": false,        -- REIN_HAY_DIFERENCIAS = 'S'
--     "items_enviados":  [{"mate_id": 1, "cantidad": 10, "estado": "Enviado"}],   -- ITEMSENVIADOS
--     "items_recibidos": [{"mate_id": 1, "cantidad": 9}] }                         -- ITEMSRECIBIDOS
-- Mapeo:
--   anulado / cancelado / eliminado / rechazado / 404 -> pedido 'anulada'.
--   estado distinto de Pendiente                      -> armado_iniciado_en (deja de recalcularse).
--   enviado (estado o ítems 'Enviado')                -> líneas 'reservada' pasan a 'declarada' con
--                                                        cantidad_enviada = DERI_CANTIDAD (0 si el ítem ya no está).
--   Procesado                                         -> líneas pasan a 'recibida' con REIR_CANTIDAD; el trigger
--                                                        de cierre deja el pedido 'completada'. Las diferencias se
--                                                        gestionan en YiQi (solo se refleja yiqi_hay_diferencias).
--   Estado desconocido                                -> se trata como "en curso" y se deja un aviso (no se anula).
create or replace function public.aplicar_estado_remito_yiqi(p_solicitud_id bigint, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sol public.solicitudes_reposicion;
  v_linea public.solicitudes_reposicion_lineas;
  v_existe boolean := coalesce((p_payload ->> 'existe')::boolean, true);
  v_estado text := nullif(btrim(coalesce(p_payload ->> 'estado', '')), '');
  v_est text := lower(coalesce(nullif(btrim(coalesce(p_payload ->> 'estado', '')), ''), ''));
  v_nro bigint := nullif(p_payload ->> 'nro', '')::numeric::bigint;
  v_hay_dif boolean := coalesce((p_payload ->> 'hay_diferencias')::boolean, false);
  v_items_env jsonb := coalesce(p_payload -> 'items_enviados', '[]'::jsonb);
  v_items_rec jsonb := coalesce(p_payload -> 'items_recibidos', '[]'::jsonb);
  v_anulado boolean;
  v_procesado boolean;
  v_pendiente boolean;
  v_enviado boolean;
  v_conocido boolean;
  v_mate text;
  v_hay_env boolean;
  v_env numeric;
  v_rec numeric;
  v_declaradas integer := 0;
  v_recibidas integer := 0;
  v_avisos text[] := '{}';
  v_extra text;
  v_estado_app text;
begin
  perform pg_advisory_xact_lock(hashtext('reposicion_central_remitos'));

  select * into v_sol from public.solicitudes_reposicion where id = p_solicitud_id for update;
  if not found then
    raise exception 'Pedido % no existe', p_solicitud_id;
  end if;
  if not v_sol.gestion_en_yiqi or v_sol.estado not in ('solicitada', 'en_preparacion') then
    return jsonb_build_object('aplicado', false, 'estado_app', v_sol.estado,
      'motivo', 'El pedido no está publicado en YiQi o ya está cerrado');
  end if;

  v_anulado := (not v_existe) or v_est ~ '(anul|cancel|elimin|rechaz)';
  v_procesado := (not v_anulado) and v_est ~ 'procesad';
  v_pendiente := (not v_anulado) and v_est in ('pendiente', '');
  v_enviado := (not v_anulado) and (not v_procesado) and (
    v_est ~ '(enviad|tr[aá]nsit)'
    or exists (select 1 from jsonb_array_elements(v_items_env) i where lower(coalesce(i ->> 'estado', '')) ~ 'enviad'));
  v_conocido := v_anulado or v_procesado or v_pendiente or v_enviado;

  -- Sello de la lectura
  update public.solicitudes_reposicion
     set yiqi_remito_estado = case when v_existe then coalesce(v_estado, yiqi_remito_estado) else 'No existe en YiQi' end,
         yiqi_hay_diferencias = v_hay_dif,
         yiqi_sincronizado_en = now(),
         yiqi_remito_nro = coalesce(v_nro, yiqi_remito_nro)
   where id = p_solicitud_id;

  -- Anulado / borrado en YiQi
  if v_anulado then
    update public.solicitudes_reposicion
       set estado = 'anulada',
           cerrada_en = coalesce(cerrada_en, now()),
           armado_iniciado_en = coalesce(armado_iniciado_en, now()),
           yiqi_requiere_actualizar = false
     where id = p_solicitud_id;
    return jsonb_build_object('aplicado', true, 'estado_app', 'anulada', 'declaradas', 0, 'recibidas', 0, 'avisos', '[]'::jsonb);
  end if;

  -- Ya no está Pendiente (o ya tiene ítems enviados): Central empezó, deja de recalcularse
  if (not v_pendiente) or v_enviado then
    update public.solicitudes_reposicion
       set armado_iniciado_en = coalesce(armado_iniciado_en, now()),
           yiqi_requiere_actualizar = false
     where id = p_solicitud_id;
  end if;
  if not v_conocido then
    v_avisos := v_avisos || ('Estado de YiQi no reconocido: ' || coalesce(v_estado, '?') || ' (se trata como en curso, no se anula)')::text;
  end if;

  -- Enviado / Procesado: líneas declaradas
  if v_enviado or v_procesado then
    for v_linea in
      select * from public.solicitudes_reposicion_lineas
      where solicitud_id = p_solicitud_id and not no_previsto and estado_linea in ('reservada', 'declarada')
      order by id
    loop
      select m.yiqi_id::text into v_mate from public.material_yiqi m where m.mate_codigo = v_linea.sku limit 1;
      select count(*) > 0, coalesce(sum((i ->> 'cantidad')::numeric), 0)
        into v_hay_env, v_env
      from jsonb_array_elements(v_items_env) i
      where v_mate is not null and (i ->> 'mate_id') = v_mate;

      if v_linea.estado_linea = 'reservada' then
        if v_procesado and not v_hay_env then
          -- Pasó de Pendiente a Procesado entre lecturas y no vino el detalle enviado: se toma lo recibido.
          select coalesce(sum((i ->> 'cantidad')::numeric), 0) into v_env
          from jsonb_array_elements(v_items_rec) i
          where v_mate is not null and (i ->> 'mate_id') = v_mate;
        end if;
        update public.solicitudes_reposicion_lineas
           set cantidad_enviada  = v_env,
               cantidad_faltante = greatest(cantidad_solicitada - v_env, 0),
               motivo_sin_stock  = case when v_env is distinct from cantidad_solicitada
                                        then 'Ajustado en YiQi (Remito Interno)' else null end,
               estado_linea      = 'declarada',
               declarada_en      = now()
         where id = v_linea.id;
        perform public.registrar_evento_linea(v_linea, 'declarada', v_linea.cantidad_solicitada, v_env,
          case when v_env is distinct from v_linea.cantidad_solicitada then 'Ajustado en YiQi (Remito Interno)' end,
          'Espejo del Remito Interno de YiQi');
        v_declaradas := v_declaradas + 1;
      elsif v_hay_env and v_env is distinct from v_linea.cantidad_enviada then
        -- Ya declarada y en YiQi cambiaron la cantidad antes de procesar.
        update public.solicitudes_reposicion_lineas
           set cantidad_enviada  = v_env,
               cantidad_faltante = greatest(cantidad_solicitada - v_env, 0),
               motivo_sin_stock  = case when v_env is distinct from cantidad_solicitada
                                        then 'Ajustado en YiQi (Remito Interno)' else null end
         where id = v_linea.id;
        perform public.registrar_evento_linea(v_linea, 'envio_corregido', v_linea.cantidad_enviada, v_env,
          'Ajustado en YiQi (Remito Interno)', 'Espejo del Remito Interno de YiQi');
      end if;
    end loop;
  end if;

  -- Procesado: líneas recibidas
  if v_procesado then
    if jsonb_array_length(v_items_rec) = 0
       and exists (select 1 from public.solicitudes_reposicion_lineas
                   where solicitud_id = p_solicitud_id and not no_previsto and coalesce(cantidad_enviada, 0) > 0) then
      -- Procesado pero sin recibidos en la respuesta: no se inventa nada, no se cierra.
      v_avisos := v_avisos || 'Procesado en YiQi pero sin artículos recibidos en la respuesta: el pedido no se cerró, revisar el remito en YiQi'::text;
    else
      for v_linea in
        select * from public.solicitudes_reposicion_lineas
        where solicitud_id = p_solicitud_id and not no_previsto
          and estado_linea = 'declarada' and coalesce(cantidad_enviada, 0) > 0
        order by id
      loop
        select m.yiqi_id::text into v_mate from public.material_yiqi m where m.mate_codigo = v_linea.sku limit 1;
        select coalesce(sum((i ->> 'cantidad')::numeric), 0) into v_rec
        from jsonb_array_elements(v_items_rec) i
        where v_mate is not null and (i ->> 'mate_id') = v_mate;

        update public.solicitudes_reposicion_lineas
           set cantidad_recibida = v_rec,
               cantidad_recibida_inicial = v_rec,
               estado_linea = 'recibida',
               recibida_en = now()
         where id = v_linea.id;
        perform public.registrar_evento_linea(v_linea,
          case when v_rec = v_linea.cantidad_enviada then 'recibida_ok' else 'recibida_con_diferencia' end,
          v_linea.cantidad_enviada, v_rec, null, 'Espejo del Remito Interno de YiQi');
        v_recibidas := v_recibidas + 1;
      end loop;
      perform public.cerrar_solicitud_reposicion_si_completa(p_solicitud_id);
    end if;
  end if;

  -- Artículos de YiQi que no están en el pedido: se ignoran y se avisa.
  select string_agg(distinct x.mate_id, ', ') into v_extra
  from (
    select (i ->> 'mate_id') as mate_id from jsonb_array_elements(v_items_env) i
    union
    select (i ->> 'mate_id') from jsonb_array_elements(v_items_rec) i
  ) x
  where x.mate_id is not null
    and not exists (
      select 1
      from public.solicitudes_reposicion_lineas l
      join public.material_yiqi m on m.mate_codigo = l.sku
      where l.solicitud_id = p_solicitud_id and m.yiqi_id::text = x.mate_id);
  if v_extra is not null then
    v_avisos := v_avisos || ('YiQi tiene artículos que no están en el pedido (MATE_ID ' || v_extra || '): se ignoran')::text;
  end if;

  update public.solicitudes_reposicion
     set yiqi_error = case
           when cardinality(v_avisos) > 0 then left('Aviso: ' || array_to_string(v_avisos, ' | '), 1000)
           when yiqi_error like 'Aviso:%' then null
           else yiqi_error end
   where id = p_solicitud_id;

  select estado into v_estado_app from public.solicitudes_reposicion where id = p_solicitud_id;
  return jsonb_build_object('aplicado', true, 'estado_app', v_estado_app,
    'declaradas', v_declaradas, 'recibidas', v_recibidas, 'avisos', to_jsonb(v_avisos));
end;
$function$;

-- e) Recálculo de los remitos en espera (redefinida: respeta los publicados en YiQi) ----
create or replace function public.recalcular_remitos_en_espera()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_ids bigint[];
  v_id bigint;
  v_n integer;
  v_recalculados integer := 0;
  v_anulados integer := 0;
  v_conservados integer := 0;
  v_snap jsonb;
  v_publicado boolean;
  v_antes text;
  v_despues text;
begin
  perform pg_advisory_xact_lock(hashtext('reposicion_central_remitos'));

  -- En espera: automático, abierto, en preparación, sin armado iniciado y sin líneas declaradas.
  -- 18/11/2026 (YiQi): si ya está publicado, solo si en YiQi sigue Pendiente (o sin estado) y la
  -- última lectura es de hace menos de 30 min (si no sabemos qué pasó en YiQi, no se toca).
  select coalesce(array_agg(x.id order by x.id), '{}') into v_ids
  from (
    select s.id
    from public.solicitudes_reposicion s
    where s.generada_por = 'regla_automatica'
      and s.deposito_origen_id = 157
      and s.deposito_destino_id = 155
      and s.estado = 'en_preparacion'
      and s.armado_iniciado_en is null
      and (s.yiqi_remito_id is null
           or (lower(coalesce(s.yiqi_remito_estado, 'pendiente')) = 'pendiente'
               and s.yiqi_sincronizado_en > now() - interval '30 minutes'))
      and not exists (
        select 1 from public.solicitudes_reposicion_lineas l
        where l.solicitud_id = s.id and l.estado_linea <> 'reservada'
      )
    order by s.id
    for update of s
  ) x;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('en_espera', 0, 'recalculados', 0, 'anulados', 0, 'conservados', 0);
  end if;

  -- Bloquea las líneas y reconfirma que ninguna se declaró mientras esperábamos el lock.
  perform 1 from public.solicitudes_reposicion_lineas l where l.solicitud_id = any (v_ids) for update;
  select coalesce(array_agg(i order by i), '{}') into v_ids
  from unnest(v_ids) i
  where not exists (
    select 1 from public.solicitudes_reposicion_lineas l
    where l.solicitud_id = i and l.estado_linea <> 'reservada'
  );

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('en_espera', 0, 'recalculados', 0, 'anulados', 0, 'conservados', 0);
  end if;

  -- Foto de las líneas de los PUBLICADOS (firma para saber si cambian + copia por si el recálculo no deja nada).
  select coalesce(jsonb_object_agg(t.solicitud_id::text, jsonb_build_object('firma', t.firma, 'lineas', t.lineas)), '{}'::jsonb)
    into v_snap
  from (
    select l.solicitud_id,
           string_agg(l.sku || ':' || l.cantidad_solicitada::text, ',' order by l.sku) as firma,
           jsonb_agg(to_jsonb(l)) as lineas
    from public.solicitudes_reposicion_lineas l
    join public.solicitudes_reposicion s on s.id = l.solicitud_id
    where l.solicitud_id = any (v_ids) and s.yiqi_remito_id is not null
    group by l.solicitud_id
  ) t;

  -- Fase 1: todos pasan a 'solicitada' (libera sus reservas y evita el cierre por "sin líneas")
  -- y se vacían. Fase 2: del más viejo al más nuevo se vuelven a armar con el stock de hoy.
  update public.solicitudes_reposicion set estado = 'solicitada' where id = any (v_ids);
  delete from public.solicitudes_reposicion_lineas where solicitud_id = any (v_ids) and estado_linea = 'reservada';

  foreach v_id in array v_ids loop
    v_publicado := v_snap ? v_id::text;
    v_n := public.armar_lineas_remito_central(v_id);

    if v_n = 0 and v_publicado then
      -- Ya existe en YiQi como Pendiente: anularlo acá lo dejaría huérfano. Se restituyen las líneas
      -- como estaban (Central todavía puede mandarlas) y queda como está.
      insert into public.solicitudes_reposicion_lineas
      overriding system value
      select * from jsonb_populate_recordset(null::public.solicitudes_reposicion_lineas, v_snap -> v_id::text -> 'lineas');
      update public.solicitudes_reposicion
         set estado = 'en_preparacion', recalculado_en = now()
       where id = v_id;
      v_conservados := v_conservados + 1;
    elsif v_n = 0 then
      update public.solicitudes_reposicion
         set estado = 'anulada', cerrada_en = now(), recalculado_en = now()
       where id = v_id;
      v_anulados := v_anulados + 1;
    else
      update public.solicitudes_reposicion
         set estado = 'en_preparacion', recalculado_en = now()
       where id = v_id;
      v_recalculados := v_recalculados + 1;
      if v_publicado then
        select string_agg(l.sku || ':' || l.cantidad_solicitada::text, ',' order by l.sku) into v_despues
        from public.solicitudes_reposicion_lineas l where l.solicitud_id = v_id;
        v_antes := v_snap -> v_id::text ->> 'firma';
        if v_despues is distinct from v_antes then
          update public.solicitudes_reposicion set yiqi_requiere_actualizar = true where id = v_id;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object('en_espera', cardinality(v_ids), 'recalculados', v_recalculados,
                            'anulados', v_anulados, 'conservados', v_conservados);
end;
$function$;
revoke all on function public.recalcular_remitos_en_espera() from public, anon, authenticated;

-- f) estado_reposicion_automatica: copia de 20261118170000 + campos de YiQi ------------------
create or replace function public.estado_reposicion_automatica(p_incluir_candidatos boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, cron
as $function$
declare
  r public.reglas_reposicion_central;
  v_cron boolean;
  v_ultimo jsonb;
  v_regla jsonb;
  v_candidatos jsonb := null;
  v_total int;
  v_abiertos jsonb;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede ver el estado de la reposición automática';
  end if;

  select * into r from public.reglas_reposicion_central order by id limit 1;

  if r.id is not null then
    v_regla := jsonb_build_object(
      'id', r.id,
      'activa', r.activa,
      'frecuencia_minutos', r.frecuencia_minutos,
      'maximo_lineas', r.maximo_lineas,
      'umbral_deficit', r.umbral_deficit,
      'maximo_ordenes_abiertas', r.maximo_ordenes_abiertas,
      'recalcular_en_espera', r.recalcular_en_espera,
      'actualizada_en', r.actualizada_en,
      'actualizada_por', r.actualizada_por,
      'actualizada_por_email', (select u.email from auth.users u where u.id = r.actualizada_por)
    );
  end if;

  select coalesce(bool_or(j.active), false) into v_cron
  from cron.job j where j.jobname = 'evaluar-reglas-reposicion-central';

  select jsonb_build_object(
           'id', s.id,
           'remito_numero', s.remito_numero,
           'creada_en', s.creada_en,
           'estado', s.estado)
    into v_ultimo
  from public.solicitudes_reposicion s
  where s.generada_por = 'regla_automatica'
  order by s.creada_en desc, s.id desc
  limit 1;

  -- Pedidos automáticos abiertos, con si están en espera (se actualizan solos) o ya en armado.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'remito_numero', s.remito_numero,
           'estado', s.estado,
           'en_espera', (s.estado = 'en_preparacion'
                         and s.armado_iniciado_en is null
                         and not exists (select 1 from public.solicitudes_reposicion_lineas l
                                         where l.solicitud_id = s.id and l.estado_linea <> 'reservada')),
           'recalculado_en', s.recalculado_en,
           'armado_iniciado_en', s.armado_iniciado_en,
           'lineas', (select count(*) from public.solicitudes_reposicion_lineas l where l.solicitud_id = s.id),
           'gestion_en_yiqi', s.gestion_en_yiqi,
           'yiqi_remito_nro', s.yiqi_remito_nro,
           'yiqi_remito_estado', s.yiqi_remito_estado
         ) order by s.id), '[]'::jsonb)
    into v_abiertos
  from public.solicitudes_reposicion s
  where s.generada_por = 'regla_automatica'
    and s.deposito_origen_id = 157
    and s.deposito_destino_id = 155
    and s.estado in ('solicitada', 'en_preparacion');

  -- Opcional (recorre el universo, es lo más caro): la pantalla lo pide aparte.
  if p_incluir_candidatos then
    select count(*) into v_total from public.reposicion_central_candidatos();
    v_candidatos := jsonb_build_object(
      'total', v_total,
      'primer_remito', least(v_total, coalesce(r.maximo_lineas, 30))
    );
  end if;

  return jsonb_build_object(
    'regla', v_regla,
    'cron_activo', v_cron,
    'ultimo_pedido_automatico', v_ultimo,
    'maximo_ordenes_abiertas', coalesce(r.maximo_ordenes_abiertas, 2),
    'recalcular_en_espera', coalesce(r.recalcular_en_espera, true),
    'abiertos_ahora', jsonb_array_length(v_abiertos),
    'pedidos_abiertos', v_abiertos,
    'candidatos', v_candidatos,
    'escribir_remito_en_yiqi', coalesce(r.escribir_remito_en_yiqi, false),
    'yiqi_usuario_responsable', coalesce(r.yiqi_usuario_responsable, 156),
    'escritura_yiqi_habilitada', coalesce((select rc.escritura_yiqi_habilitada from public.reglas_compra rc where rc.id = 1), false)
  );
end;
$function$;

-- g) RPC del circuito de la app: rechazan pedidos que se gestionan en YiQi ----------------
-- Copia de la versión vigente de cada una (la última definición entre 20261117140000 y
-- 20261118150000) + el chequeo _rechazar_si_gestion_yiqi(). Los permisos (EXECUTE) no cambian.

-- declarar_linea_reposicion (base: vigente)
create or replace function public.declarar_linea_reposicion(p_linea_id bigint, p_cantidad_enviada numeric, p_motivo_sin_stock text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_linea public.solicitudes_reposicion_lineas;
  v_faltante numeric;
  v_difiere boolean;
  v_origen integer;
begin
  select * into v_linea from public.solicitudes_reposicion_lineas where id = p_linea_id for update;
  if not found then
    raise exception 'Línea % no existe', p_linea_id;
  end if;

  -- 18/11/2026 (Remito Interno en YiQi): los pedidos publicados se gestionan desde YiQi.
  perform public._rechazar_si_gestion_yiqi(v_linea.solicitud_id);

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

  perform public.registrar_evento_linea(v_linea, 'declarada', v_linea.cantidad_solicitada, p_cantidad_enviada,
    case when v_difiere then p_motivo_sin_stock end, null);

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

-- confirmar_recepcion_linea (base: vigente)
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
  v_linea public.solicitudes_reposicion_lineas;
  v_destino integer;
begin
  select * into v_linea from public.solicitudes_reposicion_lineas where id = p_linea_id for update;
  if not found then
    raise exception 'Línea % no existe', p_linea_id;
  end if;

  -- 18/11/2026 (Remito Interno en YiQi): los pedidos publicados se gestionan desde YiQi.
  perform public._rechazar_si_gestion_yiqi(v_linea.solicitud_id);

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
    perform public.registrar_evento_linea(v_linea, 'recibida_ok', v_linea.cantidad_enviada, p_cantidad_recibida, null, null);
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
  perform public.registrar_evento_linea(v_linea, 'recibida_con_diferencia', v_linea.cantidad_enviada, p_cantidad_recibida,
    p_motivo_diferencia, p_nota_diferencia);
  return 'con_diferencia';
end;
$function$;

-- revisar_diferencia_linea (base: vigente)
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
  v_linea public.solicitudes_reposicion_lineas;
  v_destino integer;
begin
  select * into v_linea from public.solicitudes_reposicion_lineas where id = p_linea_id for update;
  if not found then
    raise exception 'Línea % no existe', p_linea_id;
  end if;

  -- 18/11/2026 (Remito Interno en YiQi): los pedidos publicados se gestionan desde YiQi.
  perform public._rechazar_si_gestion_yiqi(v_linea.solicitud_id);

  select deposito_destino_id into v_destino from public.solicitudes_reposicion where id = v_linea.solicitud_id;
  if auth.uid() is not null and not (public.es_admin() or v_destino in (select public.mis_depositos())) then
    raise exception 'Solo el depósito que recibe (o un admin) puede revisar la diferencia de la línea %', p_linea_id;
  end if;

  if v_linea.estado_linea <> 'con_diferencia' then
    raise exception 'La línea % no tiene una diferencia pendiente (estado actual: %)', p_linea_id, v_linea.estado_linea;
  end if;
  if v_linea.no_previsto then
    raise exception 'Este artículo no estaba en el remito: lo acepta o lo rechaza el depósito que envió';
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
  perform public.registrar_evento_linea(v_linea, 'diferencia_revisada', v_linea.cantidad_recibida, p_cantidad_final,
    v_linea.motivo_diferencia, p_nota);
end;
$function$;

-- corregir_envio_linea (base: vigente)
create or replace function public.corregir_envio_linea(
  p_linea_id bigint,
  p_cantidad_enviada numeric,
  p_motivo text
)
 returns void
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_linea public.solicitudes_reposicion_lineas;
  v_origen integer;
  v_faltante numeric;
begin
  select * into v_linea from public.solicitudes_reposicion_lineas where id = p_linea_id for update;
  if not found then
    raise exception 'Línea % no existe', p_linea_id;
  end if;

  -- 18/11/2026 (Remito Interno en YiQi): los pedidos publicados se gestionan desde YiQi.
  perform public._rechazar_si_gestion_yiqi(v_linea.solicitud_id);

  select deposito_origen_id into v_origen from public.solicitudes_reposicion where id = v_linea.solicitud_id;
  if auth.uid() is not null and not (public.es_admin() or v_origen in (select public.mis_depositos())) then
    raise exception 'Solo el depósito que envió (origen) o un admin puede corregir lo enviado en la línea %', p_linea_id;
  end if;

  if v_linea.estado_linea <> 'con_diferencia' then
    raise exception 'La línea % no tiene una diferencia pendiente (estado actual: %)', p_linea_id, v_linea.estado_linea;
  end if;
  if v_linea.no_previsto then
    raise exception 'Este artículo no estaba en el remito: no se corrige lo enviado, se acepta o se rechaza';
  end if;
  if p_cantidad_enviada is null or p_cantidad_enviada < 0 then
    raise exception 'Cantidad enviada inválida para la línea %', p_linea_id;
  end if;
  if p_cantidad_enviada = v_linea.cantidad_enviada then
    raise exception 'La cantidad enviada ya es %: si es correcta, la diferencia la revisa quien recibió', p_cantidad_enviada;
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Falta el motivo de la corrección';
  end if;

  v_faltante := greatest(v_linea.cantidad_solicitada - p_cantidad_enviada, 0);

  update public.solicitudes_reposicion_lineas
     set cantidad_enviada  = p_cantidad_enviada,
         cantidad_faltante = v_faltante,
         motivo_sin_stock  = case when p_cantidad_enviada is distinct from cantidad_solicitada then p_motivo else null end,
         estado_linea      = 'declarada',
         cantidad_recibida = null,
         cantidad_recibida_inicial = null,
         motivo_diferencia = null,
         nota_diferencia   = null,
         recibida_en       = null
   where id = p_linea_id;

  perform public.registrar_evento_linea(v_linea, 'envio_corregido', v_linea.cantidad_enviada, p_cantidad_enviada,
    p_motivo, 'Recibido en destino: ' || coalesce(v_linea.cantidad_recibida::text, '—'));

  if v_faltante > 0 then
    insert into public.alertas_suspendidas (sku, motivo, solicitud_linea_id)
    values (v_linea.sku, p_motivo, p_linea_id)
    on conflict (sku) do update
      set motivo = excluded.motivo,
          solicitud_linea_id = excluded.solicitud_linea_id,
          suspendida_en = now(),
          reactivada_en = null;
  end if;
end;
$function$;

-- registrar_no_previsto (base: vigente)
create or replace function public.registrar_no_previsto(
  p_solicitud_id bigint,
  p_sku text,
  p_cantidad numeric,
  p_motivo text,
  p_nota text default null,
  p_reemplaza_linea_id bigint default null
)
 returns bigint
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_sol record;
  v_nombre text;
  v_sku text := nullif(btrim(coalesce(p_sku, '')), '');
  v_linea public.solicitudes_reposicion_lineas;
  v_id bigint;
begin
  select * into v_sol from public.solicitudes_reposicion where id = p_solicitud_id for update;
  if not found then
    raise exception 'Pedido % no existe', p_solicitud_id;
  end if;

  -- 18/11/2026 (Remito Interno en YiQi): los pedidos publicados se gestionan desde YiQi.
  perform public._rechazar_si_gestion_yiqi(p_solicitud_id);

  if auth.uid() is not null and not (public.es_admin() or v_sol.deposito_destino_id in (select public.mis_depositos())) then
    raise exception 'Solo el depósito que recibe (o un admin) puede registrar un artículo no previsto en el pedido %', p_solicitud_id;
  end if;

  if v_sol.estado <> 'en_preparacion' then
    raise exception 'El pedido % no está abierto (estado actual: %): no se puede registrar un artículo no previsto', p_solicitud_id, v_sol.estado;
  end if;

  if v_sku is null then
    raise exception 'Falta el artículo';
  end if;
  select m.mate_nombre into v_nombre from public.material_yiqi m where m.mate_codigo = v_sku limit 1;
  if not found then
    raise exception 'El artículo % no existe en el catálogo', v_sku;
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad recibida tiene que ser mayor que 0';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Falta el motivo';
  end if;

  if p_reemplaza_linea_id is not null and not exists (
    select 1 from public.solicitudes_reposicion_lineas
    where id = p_reemplaza_linea_id and solicitud_id = p_solicitud_id
  ) then
    raise exception 'La línea % no es de este pedido', p_reemplaza_linea_id;
  end if;

  insert into public.solicitudes_reposicion_lineas
    (solicitud_id, sku, mate_nombre, cantidad_solicitada, estado_linea, cantidad_enviada,
     cantidad_recibida, cantidad_recibida_inicial, motivo_diferencia, nota_diferencia,
     recibida_en, no_previsto, reemplaza_linea_id)
  values
    (p_solicitud_id, v_sku, v_nombre, 0, 'con_diferencia', 0,
     p_cantidad, p_cantidad, btrim(p_motivo), nullif(btrim(coalesce(p_nota, '')), ''),
     now(), true, p_reemplaza_linea_id)
  returning * into v_linea;
  v_id := v_linea.id;

  perform public.registrar_evento_linea(v_linea, 'no_previsto_recibido', 0, p_cantidad, p_motivo, p_nota);
  return v_id;
end;
$function$;

-- resolver_no_previsto (base: vigente)
create or replace function public.resolver_no_previsto(
  p_linea_id bigint,
  p_aceptar boolean,
  p_motivo text
)
 returns void
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_linea public.solicitudes_reposicion_lineas;
  v_origen integer;
begin
  select * into v_linea from public.solicitudes_reposicion_lineas where id = p_linea_id for update;
  if not found then
    raise exception 'Línea % no existe', p_linea_id;
  end if;

  -- 18/11/2026 (Remito Interno en YiQi): los pedidos publicados se gestionan desde YiQi.
  perform public._rechazar_si_gestion_yiqi(v_linea.solicitud_id);

  select deposito_origen_id into v_origen from public.solicitudes_reposicion where id = v_linea.solicitud_id;
  if auth.uid() is not null and not (public.es_admin() or v_origen in (select public.mis_depositos())) then
    raise exception 'Solo el depósito que envió (origen) o un admin puede aceptar o rechazar el artículo no previsto de la línea %', p_linea_id;
  end if;

  if not v_linea.no_previsto then
    raise exception 'La línea % no es un artículo no previsto', p_linea_id;
  end if;
  if v_linea.estado_linea <> 'con_diferencia' then
    raise exception 'La línea % ya fue resuelta (estado actual: %)', p_linea_id, v_linea.estado_linea;
  end if;
  if p_aceptar is null then
    raise exception 'Falta indicar si se acepta o se rechaza';
  end if;

  if p_aceptar then
    update public.solicitudes_reposicion_lineas
       set cantidad_enviada        = cantidad_recibida,
           estado_linea            = 'recibida',
           diferencia_revisada_en  = now(),
           diferencia_revisada_por = auth.uid(),
           nota_revision           = nullif(btrim(coalesce(p_motivo, '')), '')
     where id = p_linea_id;
    perform public.registrar_evento_linea(v_linea, 'no_previsto_aceptado', 0, v_linea.cantidad_recibida, p_motivo, null);
  else
    if p_motivo is null or btrim(p_motivo) = '' then
      raise exception 'Falta el motivo del rechazo';
    end if;
    update public.solicitudes_reposicion_lineas
       set cantidad_recibida       = 0,
           estado_linea            = 'recibida',
           diferencia_revisada_en  = now(),
           diferencia_revisada_por = auth.uid(),
           nota_revision           = 'Rechazado: ' || btrim(p_motivo)
     where id = p_linea_id;
    perform public.registrar_evento_linea(v_linea, 'no_previsto_rechazado', v_linea.cantidad_recibida, 0, p_motivo, 'Hay que devolverlo físicamente');
  end if;
end;
$function$;

-- Permisos ----------------------------------------------------------------------------
revoke all on function public.configurar_remito_yiqi(boolean) from public, anon;
grant execute on function public.configurar_remito_yiqi(boolean) to authenticated;
revoke all on function public.publicar_pedido_en_yiqi_pendiente(bigint) from public, anon;
grant execute on function public.publicar_pedido_en_yiqi_pendiente(bigint) to authenticated;
revoke all on function public.estado_reposicion_automatica(boolean) from public, anon;
grant execute on function public.estado_reposicion_automatica(boolean) to authenticated;
-- Solo la edge function (service_role):
revoke all on function public.reclamar_publicacion_yiqi(bigint) from public, anon, authenticated;
grant execute on function public.reclamar_publicacion_yiqi(bigint) to service_role;
revoke all on function public.aplicar_estado_remito_yiqi(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_estado_remito_yiqi(bigint, jsonb) to service_role;

-- h) Cron remito-interno-yiqi-ciclo (cada 10 min) --------------------------------------
-- Mismo patrón que 20260930120000: función SECURITY DEFINER que lee la key de Vault y llama
-- a la edge function con pg_net (timeout 120 s). Con la escritura apagada la función solo
-- sincroniza (y si no hay nada publicado, no toca YiQi).
create or replace function public._llamar_remito_interno_ciclo()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  service_key text;
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'yiqi_functions_key'
  limit 1;

  if service_key is null or service_key = '' then
    raise warning 'remito-interno-yiqi: falta el secreto "yiqi_functions_key" en Supabase Vault. Ciclo salteado esta corrida.';
    return;
  end if;

  perform net.http_post(
    url := 'https://hsfudsnmooaesrzdwecg.supabase.co/functions/v1/remito-interno-yiqi',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('accion', 'ciclo'),
    timeout_milliseconds := 120000
  );
end;
$function$;
revoke all on function public._llamar_remito_interno_ciclo() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'remito-interno-yiqi-ciclo') then
    perform cron.unschedule('remito-interno-yiqi-ciclo');
  end if;
end $cron$;
select cron.schedule('remito-interno-yiqi-ciclo', '*/10 * * * *', $$ select public._llamar_remito_interno_ciclo(); $$);

-- ============================================================
-- Verificación (solo lectura) — SQL Editor de Supabase, proyecto hsfudsnmooaesrzdwecg:
--
--   select (select count(*) from information_schema.columns
--            where table_schema = 'public' and table_name = 'solicitudes_reposicion'
--              and column_name in ('gestion_en_yiqi','yiqi_remito_id','yiqi_remito_nro','yiqi_remito_estado',
--                                  'yiqi_hay_diferencias','yiqi_publicado_en','yiqi_sincronizado_en',
--                                  'yiqi_requiere_actualizar','yiqi_error','yiqi_publicando_en')) as columnas_solicitudes,
--          (select count(*) from information_schema.columns
--            where table_schema = 'public' and table_name = 'reglas_reposicion_central'
--              and column_name in ('escribir_remito_en_yiqi','yiqi_usuario_responsable')) as columnas_reglas,
--          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--            where n.nspname = 'public'
--              and p.proname in ('configurar_remito_yiqi','publicar_pedido_en_yiqi_pendiente','reclamar_publicacion_yiqi',
--                                'aplicar_estado_remito_yiqi','_rechazar_si_gestion_yiqi','_llamar_remito_interno_ciclo')) as funciones_nuevas,
--          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--            where n.nspname = 'public'
--              and p.proname in ('declarar_linea_reposicion','confirmar_recepcion_linea','revisar_diferencia_linea',
--                                'corregir_envio_linea','registrar_no_previsto','resolver_no_previsto')
--              and pg_get_functiondef(p.oid) like '%_rechazar_si_gestion_yiqi%') as rpc_con_chequeo,
--          (select count(*) from cron.job where jobname = 'remito-interno-yiqi-ciclo' and active) as cron_activo,
--          (select r.escribir_remito_en_yiqi from public.reglas_reposicion_central r order by r.id limit 1) as escribir_remito,
--          (select rc.escritura_yiqi_habilitada from public.reglas_compra rc where rc.id = 1) as escritura_habilitada,
--          (select count(*) from public.solicitudes_reposicion where gestion_en_yiqi) as pedidos_en_yiqi;
--   -- Esperado: columnas_solicitudes = 10, columnas_reglas = 2, funciones_nuevas = 6, rpc_con_chequeo = 6,
--   --           cron_activo = 1, escribir_remito = false, escritura_habilitada = false, pedidos_en_yiqi = 0
-- ============================================================
