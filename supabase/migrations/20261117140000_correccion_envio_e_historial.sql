-- ============================================================
-- 20261117140000_correccion_envio_e_historial.sql — 17/11/2026
-- ============================================================
-- Diferencias de recepción, parte B (segunda tanda). Casos de Aris (vía
-- Federico, 17/11):
--   Central declara 8 de un artículo y al Local llegan 6. El Local lo
--   confirma con diferencia y ese ingreso queda frenado
--   ('con_diferencia', 20261117130000) hasta que se resuelva:
--   a) si en Central esas 2 u no existían físicamente (mandaron 6 y el
--      sistema decía 8), CENTRAL corrige desde su panel lo enviado (8 → 6)
--      con motivo. La línea vuelve al Local como "en tránsito" con 6 y
--      recién ahí el Local la confirma (6 = 6 → OK, mueve stock);
--   b) si se perdió o se rompió en el camino, la cierra quien recibe con
--      "Revisado" (sin cambios desde 20261117130000).
--   Todo queda guardado en un historial: tabla reposicion_lineas_eventos
--   (append-only, solo la escriben estas funciones).
-- Idempotente. Requiere 20261117130000 aplicada.
-- ============================================================

create table if not exists public.reposicion_lineas_eventos (
  id bigint generated always as identity primary key,
  linea_id bigint not null,
  solicitud_id bigint not null,
  sku text,
  mate_nombre text,
  evento text not null,
  cantidad_anterior numeric,
  cantidad_nueva numeric,
  motivo text,
  nota text,
  creado_por uuid,
  creado_en timestamptz not null default now(),
  constraint reposicion_lineas_eventos_evento_check check (evento in (
    'declarada', 'recibida_ok', 'recibida_con_diferencia', 'envio_corregido', 'diferencia_revisada'
  ))
);
-- Sin FK a propósito: el historial no se borra si se borra el pedido.
create index if not exists reposicion_lineas_eventos_linea_idx on public.reposicion_lineas_eventos (linea_id);
create index if not exists reposicion_lineas_eventos_solicitud_idx on public.reposicion_lineas_eventos (solicitud_id, creado_en);

alter table public.reposicion_lineas_eventos enable row level security;
drop policy if exists "eventos segun depositos asignados" on public.reposicion_lineas_eventos;
create policy "eventos segun depositos asignados" on public.reposicion_lineas_eventos
  for select to authenticated
  using (
    public.es_admin() or exists (
      select 1 from public.solicitudes_reposicion s
      where s.id = reposicion_lineas_eventos.solicitud_id
        and (s.deposito_origen_id in (select public.mis_depositos())
             or s.deposito_destino_id in (select public.mis_depositos()))
    )
  );
-- Sin policies de insert/update/delete: solo escriben las funciones SECURITY DEFINER.
revoke insert, update, delete on public.reposicion_lineas_eventos from anon, authenticated;
grant select on public.reposicion_lineas_eventos to authenticated;

create or replace function public.registrar_evento_linea(
  p_linea public.solicitudes_reposicion_lineas, p_evento text, p_anterior numeric, p_nueva numeric, p_motivo text, p_nota text
) returns void
 language plpgsql
 security definer
 set search_path = public
as $function$
begin
  insert into public.reposicion_lineas_eventos
    (linea_id, solicitud_id, sku, mate_nombre, evento, cantidad_anterior, cantidad_nueva, motivo, nota, creado_por)
  values
    (p_linea.id, p_linea.solicitud_id, p_linea.sku, p_linea.mate_nombre, p_evento, p_anterior, p_nueva,
     nullif(btrim(coalesce(p_motivo, '')), ''), nullif(btrim(coalesce(p_nota, '')), ''), auth.uid());
end;
$function$;
revoke execute on function public.registrar_evento_linea(public.solicitudes_reposicion_lineas, text, numeric, numeric, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- declarar_linea_reposicion: igual que 20261117130000 + evento.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- confirmar_recepcion_linea: igual que 20261117130000 + evento.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- revisar_diferencia_linea: igual que 20261117130000 + evento.
-- ------------------------------------------------------------
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
  perform public.registrar_evento_linea(v_linea, 'diferencia_revisada', v_linea.cantidad_recibida, p_cantidad_final,
    v_linea.motivo_diferencia, p_nota);
end;
$function$;

-- ------------------------------------------------------------
-- NUEVA: corregir_envio_linea — la corrige el depósito que ENVIÓ (origen)
-- cuando lo que figuraba enviado no existía físicamente. La línea vuelve
-- al destino como "en tránsito" con la cantidad corregida, para que la
-- confirme. Si se corrige a 0, la línea queda sin nada para recibir y el
-- trigger de 20260930140000 la toma como terminal.
-- ------------------------------------------------------------
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

  select deposito_origen_id into v_origen from public.solicitudes_reposicion where id = v_linea.solicitud_id;
  if auth.uid() is not null and not (public.es_admin() or v_origen in (select public.mis_depositos())) then
    raise exception 'Solo el depósito que envió (origen) o un admin puede corregir lo enviado en la línea %', p_linea_id;
  end if;

  if v_linea.estado_linea <> 'con_diferencia' then
    raise exception 'La línea % no tiene una diferencia pendiente (estado actual: %)', p_linea_id, v_linea.estado_linea;
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

revoke execute on function public.corregir_envio_linea(bigint, numeric, text) from public, anon;
grant execute on function public.corregir_envio_linea(bigint, numeric, text) to authenticated;
revoke execute on function public.declarar_linea_reposicion(bigint, numeric, text) from public, anon;
revoke execute on function public.confirmar_recepcion_linea(bigint, numeric, text, text) from public, anon;
revoke execute on function public.revisar_diferencia_linea(bigint, numeric, text) from public, anon;
grant execute on function public.declarar_linea_reposicion(bigint, numeric, text) to authenticated;
grant execute on function public.confirmar_recepcion_linea(bigint, numeric, text, text) to authenticated;
grant execute on function public.revisar_diferencia_linea(bigint, numeric, text) to authenticated;

-- Historial de lo ya hecho hoy con 20261117130000 (líneas frenadas o revisadas
-- antes de que existiera esta tabla). Solo si no tienen eventos.
insert into public.reposicion_lineas_eventos
  (linea_id, solicitud_id, sku, mate_nombre, evento, cantidad_anterior, cantidad_nueva, motivo, nota, creado_en)
select l.id, l.solicitud_id, l.sku, l.mate_nombre, 'recibida_con_diferencia', l.cantidad_enviada,
       coalesce(l.cantidad_recibida_inicial, l.cantidad_recibida), l.motivo_diferencia,
       coalesce(l.nota_diferencia, 'Cargado al crear el historial (17/11)'), coalesce(l.recibida_en, now())
from public.solicitudes_reposicion_lineas l
where l.motivo_diferencia is not null
  and not exists (select 1 from public.reposicion_lineas_eventos e where e.linea_id = l.id);
