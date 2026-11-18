-- ============================================================
-- 20261118120000_stock_depositos_y_tope_pedidos.sql — 18/11/2026
-- ============================================================
-- Pedido de Aris: el máximo que un depósito le puede pedir al otro es el
-- stock real que figura en YiQi. Si hay 24 y se piden 40, tiene que avisar.
--
-- Hallazgo (producción, 18/11): las cuentas de depósito veían todo el stock
-- en 0. La policy "stock segun proveedores asignados" de stock_yiqi
-- (es_admin() OR sku en el material de MIS proveedores) no las deja leer,
-- porque no tienen proveedores asignados. Ej.: 60016 tiene local 1 y
-- 60016-100 central 2, y "Pedir al otro depósito" mostraba Local 0 · Central 0.
--
-- Esta migración:
--   a. Policy ADICIONAL de SELECT en stock_yiqi para cuentas con depósito
--      asignado (no se toca la existente; las policies permisivas se suman).
--   b. stock_disponible_deposito(depósito, skus[]) -> jsonb
--      { "<sku>": {"stock", "reservado", "disponible"} }
--      stock      = stock_local (155) o stock_central (157), sin negativos.
--      reservado  = comprometido en pedidos abiertos (solicitada /
--                   en_preparacion) donde ese depósito es ORIGEN: líneas
--                   'reservada' suman cantidad_solicitada; 'declarada' y
--                   'con_diferencia' suman cantidad_enviada (el stock de
--                   YiQi recién se mueve al confirmar la recepción).
--      disponible = max(stock - reservado, 0).
--   c. crear_remito_reposicion_manual: valida por línea que la cantidad no
--      supere el disponible del depósito ORIGEN (error claro si supera) y
--      el número de remito nuevo sale legible, igual que los automáticos:
--      REP-AAAA-NNNN (id con 4 dígitos). Los remitos existentes no se tocan.
-- Idempotente.
-- ============================================================

-- a. Lectura de stock para cuentas de depósito -----------------------------
drop policy if exists "stock para cuentas de deposito" on public.stock_yiqi;
create policy "stock para cuentas de deposito" on public.stock_yiqi
  as permissive for select to authenticated
  using (exists (select 1 from public.mis_depositos()));

-- b. Stock disponible por depósito -----------------------------------------
create or replace function public.stock_disponible_deposito(p_deposito integer, p_skus text[])
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path = public
as $function$
declare
  v_res jsonb;
begin
  if auth.uid() is not null
     and not (public.es_admin() or exists (select 1 from public.mis_depositos())) then
    raise exception 'No tenés permiso para consultar el stock de los depósitos';
  end if;

  with skus as (
    select distinct s as sku from unnest(coalesce(p_skus, '{}'::text[])) as s
  ),
  stk as (
    select k.sku,
           greatest(coalesce(
             case p_deposito when 155 then y.stock_local when 157 then y.stock_central end, 0), 0) as stock
    from skus k
    left join public.stock_yiqi y on y.sku = k.sku
  ),
  res as (
    select l.sku,
           sum(case when l.estado_linea = 'reservada' then coalesce(l.cantidad_solicitada, 0)
                    when l.estado_linea in ('declarada', 'con_diferencia') then coalesce(l.cantidad_enviada, 0)
                    else 0 end) as reservado
    from public.solicitudes_reposicion_lineas l
    join public.solicitudes_reposicion r on r.id = l.solicitud_id
    where r.deposito_origen_id = p_deposito
      and r.estado in ('solicitada', 'en_preparacion')
      and l.sku in (select sku from skus)
    group by l.sku
  )
  select coalesce(jsonb_object_agg(s.sku, jsonb_build_object(
           'stock', s.stock,
           'reservado', coalesce(r.reservado, 0),
           'disponible', greatest(s.stock - coalesce(r.reservado, 0), 0))), '{}'::jsonb)
    into v_res
  from stk s
  left join res r on r.sku = s.sku;

  return v_res;
end;
$function$;

revoke execute on function public.stock_disponible_deposito(integer, text[]) from public, anon;
grant execute on function public.stock_disponible_deposito(integer, text[]) to authenticated;

-- c. Pedido manual con tope y número legible -------------------------------
create or replace function public.crear_remito_reposicion_manual(p_origen integer, p_destino integer, p_lineas jsonb)
 returns bigint
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_id bigint;
  v_disp jsonb;
  v_skus text[];
  v_l record;
  v_max numeric;
begin
  -- El pedido manual lo arma el depósito que va a RECIBIR (destino).
  if auth.uid() is not null and not (public.es_admin() or p_destino in (select public.mis_depositos())) then
    raise exception 'Solo el depósito que pide (destino) o un admin puede crear este pedido';
  end if;

  -- 18/11/2026 — tope: lo pedido no puede superar el disponible real del origen.
  select array_agg(distinct l->>'sku') into v_skus from jsonb_array_elements(p_lineas) as l;
  v_disp := public.stock_disponible_deposito(p_origen, v_skus);
  for v_l in
    select (l->>'sku') as sku, coalesce(max(l->>'mate_nombre'), '') as nombre,
           sum((l->>'cantidad')::numeric) as cantidad
    from jsonb_array_elements(p_lineas) as l
    group by (l->>'sku')
  loop
    v_max := coalesce((v_disp -> v_l.sku ->> 'disponible')::numeric, 0);
    if v_l.cantidad > v_max then
      raise exception 'No hay más en stock de %: máximo disponible real %', v_l.sku, v_max;
    end if;
  end loop;

  insert into public.solicitudes_reposicion
    (deposito_origen_id, deposito_destino_id, estado, generada_por, procesada_en, remito_numero)
  values (
    p_origen, p_destino, 'en_preparacion', 'manual', now(),
    'REP-tmp-' || clock_timestamp()::text || '-' || random()::text
  )
  returning id into v_id;

  -- 18/11/2026 — mismo formato que los automáticos: REP-AAAA-NNNN.
  update public.solicitudes_reposicion
     set remito_numero = 'REP-' || to_char(now(), 'YYYY') || '-' || lpad(v_id::text, 4, '0')
   where id = v_id;

  insert into public.solicitudes_reposicion_lineas
    (solicitud_id, sku, mate_nombre, cantidad_solicitada, estado_linea)
  select v_id, (l->>'sku'), (l->>'mate_nombre'), (l->>'cantidad')::numeric, 'reservada'
  from jsonb_array_elements(p_lineas) as l;

  return v_id;
end;
$function$;

revoke execute on function public.crear_remito_reposicion_manual(integer, integer, jsonb) from public, anon;
grant execute on function public.crear_remito_reposicion_manual(integer, integer, jsonb) to authenticated;

-- ------------------------------------------------------------
-- Verificación (solo lectura; SQL Editor, corre como postgres):
--   select public.stock_disponible_deposito(155, array['60016','60016-100']) as local,
--          public.stock_disponible_deposito(157, array['60016','60016-100']) as central;
--   -- Esperado (según el stock del 18/11): 60016 -> local.stock = 1; 60016-100 -> central.stock = 2;
--   -- reservado = 0 salvo que haya pedidos abiertos de esos SKU; disponible = stock - reservado.
--   select polname from pg_policy where polrelid = 'public.stock_yiqi'::regclass;
--   -- Esperado: aparece "stock para cuentas de deposito" además de la policy por proveedores.
-- ------------------------------------------------------------
