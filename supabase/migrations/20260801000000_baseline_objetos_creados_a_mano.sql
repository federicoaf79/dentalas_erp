-- ============================================================
-- BASELINE — objetos de producción creados a mano, sin migración.
-- Generada el 30/9/2026 desde el catálogo de producción
-- (scripts/radiografia_esquema_30_9.sql y radiografia_funciones_30_9.sql).
--
-- Qué es: el registro versionado de 25 tablas, 16 funciones y 1 vista que
-- existían en producción sin CREATE en el repo. Timestamp 20260801 para
-- que ordene antes que todas las migraciones que las usan.
--
-- Idempotente y NO pisa nada en producción:
--   * tablas: create table if not exists
--   * índices: create index if not exists
--   * funciones / vista: se crean SOLO si no existen (bloques DO);
--     las versiones vigentes de confirmar_recepcion_linea,
--     crear_remito_reposicion_manual y declarar_linea_reposicion son las
--     de la migración 20260930130000 (con control de permisos).
--   * policies y triggers: solo si no existen.
--
-- Límite conocido: refleja el estado del 30/9/2026. Reconstruir una base
-- vacía corriendo todas las migraciones en orden no está garantizado
-- (algunas migraciones posteriores alteran estas tablas sin "if not
-- exists"). El proyecto no usa `supabase db push`; se aplica a mano.
-- ============================================================

set check_function_bodies = off;
create extension if not exists "uuid-ossp" with schema extensions;

-- ------------------------------------------------------------
-- 1. Tablas
-- ------------------------------------------------------------
create table if not exists public.catalogo_causas (
  id bigint generated always as identity not null,
  codigo text not null,
  ambito text not null,
  rotulo text not null,
  descripcion text,
  activa boolean default true not null,
  orden integer default 0 not null,
  creada_en timestamp with time zone default now() not null,
  constraint catalogo_causas_codigo_key UNIQUE (codigo),
  constraint catalogo_causas_pkey PRIMARY KEY (id),
  constraint catalogo_causas_ambito_check CHECK ((ambito = ANY (ARRAY['stock'::text, 'entrega'::text, 'compra'::text])))
);

create table if not exists public.clientes_yiqi (
  yiqi_id bigint not null,
  clie_codigo text,
  clie_nombre text,
  clie_razon_social text,
  clie_cuit text,
  condicion_iva text,
  cuenta_gastos text,
  mail text,
  telefono text,
  hash_datos text,
  actualizado_en timestamp with time zone default now() not null,
  sincronizado_en timestamp with time zone default now() not null,
  constraint clientes_yiqi_pkey PRIMARY KEY (yiqi_id)
);

create table if not exists public.empresa_config (
  id integer default 1 not null,
  nombre text default 'Dentalab'::text not null,
  razon_social text,
  cuit text,
  direccion text,
  localidad text,
  telefono text,
  email text,
  web text,
  logo_url text,
  pie_pagina text,
  actualizado_por uuid,
  actualizado_en timestamp with time zone default now() not null,
  constraint empresa_config_pkey PRIMARY KEY (id),
  constraint empresa_config_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES auth.users(id),
  constraint empresa_fila_unica CHECK ((id = 1))
);

create table if not exists public.material_yiqi (
  yiqi_id bigint not null,
  mate_codigo text,
  mate_nombre text,
  clie_codigo text,
  clie_nombre text,
  mate_stock_disponible numeric,
  mate_stock_seguridad numeric,
  mate_punto_de_pedido numeric,
  mate_punto_pedido_max numeric,
  mate_lead_time numeric,
  mate_codigo_en_el_proveed text,
  mate_notas_sobre_punto_de text,
  hash_datos text,
  actualizado_en timestamp with time zone default now() not null,
  sincronizado_en timestamp with time zone default now() not null,
  unit_cantidad_de_unidades numeric,
  mate_cantidad_de_unidades numeric,
  mate_caja text,
  mate_crm numeric,
  mate_crm_final numeric,
  constraint material_yiqi_pkey PRIMARY KEY (yiqi_id)
);

create table if not exists public.ordenes_yiqi (
  yiqi_id bigint not null,
  nro_oc text,
  proveedor text,
  fecha date,
  sku text,
  nombre_art text,
  cantidad numeric,
  cantidad_entregada numeric,
  cantidad_pendiente numeric,
  asunto text,
  condicion_de_pago text,
  subtotal numeric,
  total numeric,
  hash_datos text,
  actualizado_en timestamp with time zone default now() not null,
  sincronizado_en timestamp with time zone default now() not null,
  id bigint generated always as identity not null,
  constraint ordenes_yiqi_pkey PRIMARY KEY (id)
);

create table if not exists public.ventas_mensual_yiqi (
  id bigint generated always as identity not null,
  mate_codigo text not null,
  proveedor text,
  periodo date not null,
  cantidad numeric not null,
  sincronizado_en timestamp with time zone default now() not null,
  constraint ventas_mensual_unica UNIQUE (mate_codigo, periodo),
  constraint ventas_mensual_yiqi_pkey PRIMARY KEY (id)
);

create table if not exists public.proveedores (
  id bigint generated always as identity not null,
  clie_codigo text,
  clie_nombre text not null,
  minimo_compra numeric,
  minimo_es_unidades boolean default false not null,
  plazo_pago text,
  descuento_volumen text,
  dias_entrega integer,
  mail_pedidos text,
  whatsapp_pedidos text,
  contacto text,
  limite_aprobacion numeric,
  siempre_requiere_aprobacion boolean default false not null,
  notas text,
  actualizado_por uuid,
  actualizado_en timestamp with time zone default now() not null,
  vende_en_cajas_cerradas boolean default false not null,
  constraint proveedores_clie_nombre_key UNIQUE (clie_nombre),
  constraint proveedores_pkey PRIMARY KEY (id),
  constraint proveedores_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES auth.users(id)
);

create table if not exists public.reglas_compra (
  id integer default 1 not null,
  limite_aprobacion numeric default 1000000 not null,
  max_cajas_por_producto numeric default 2 not null,
  meses_cobertura numeric default 2 not null,
  actualizado_por uuid,
  actualizado_en timestamp with time zone default now() not null,
  constraint reglas_compra_pkey PRIMARY KEY (id),
  constraint reglas_compra_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES auth.users(id),
  constraint reglas_fila_unica CHECK ((id = 1))
);

create table if not exists public.reglas_reposicion_central (
  id bigint generated always as identity not null,
  activa boolean default true not null,
  frecuencia_minutos integer default 180 not null,
  umbral_deficit numeric default 0 not null,
  excluir_sin_stock boolean default true not null,
  actualizada_por uuid,
  actualizada_en timestamp with time zone default now() not null,
  constraint reglas_reposicion_central_pkey PRIMARY KEY (id),
  constraint reglas_reposicion_central_actualizada_por_fkey FOREIGN KEY (actualizada_por) REFERENCES auth.users(id)
);

create table if not exists public.templates_mensaje (
  id bigint generated always as identity not null,
  codigo text not null,
  canal text not null,
  nombre text not null,
  asunto text,
  cuerpo text not null,
  activo boolean default true not null,
  actualizado_por uuid,
  actualizado_en timestamp with time zone default now() not null,
  constraint templates_mensaje_codigo_key UNIQUE (codigo),
  constraint templates_mensaje_pkey PRIMARY KEY (id),
  constraint templates_mensaje_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES auth.users(id),
  constraint templates_mensaje_canal_check CHECK ((canal = ANY (ARRAY['email'::text, 'whatsapp'::text])))
);

create table if not exists public.usuarios_config (
  user_id uuid not null,
  nombre text,
  rol text not null,
  activo boolean default true not null,
  creado_en timestamp with time zone default now() not null,
  constraint usuarios_config_pkey PRIMARY KEY (user_id),
  constraint usuarios_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint usuarios_config_rol_check CHECK ((rol = ANY (ARRAY['admin'::text, 'operador'::text, 'deposito'::text])))
);

create table if not exists public.usuario_proveedor (
  id bigint generated always as identity not null,
  user_id uuid,
  proveedor_codigo text not null,
  proveedor_nombre text not null,
  created_at timestamp with time zone default now(),
  constraint usuario_proveedor_unico UNIQUE (user_id, proveedor_codigo),
  constraint usuario_proveedor_pkey PRIMARY KEY (id),
  constraint usuario_proveedor_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

create table if not exists public.usuario_deposito (
  usuario_id uuid not null,
  deposito_id integer not null,
  creado_en timestamp with time zone default now() not null,
  constraint usuario_deposito_pkey PRIMARY KEY (usuario_id, deposito_id),
  constraint usuario_deposito_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint usuario_deposito_deposito_id_check CHECK ((deposito_id = ANY (ARRAY[155, 157])))
);

create table if not exists public.yiqi_config (
  id uuid default uuid_generate_v4() not null,
  schema_id integer not null,
  schema_name text,
  bearer_token text not null,
  base_url text default 'https://api.yiqi.com.ar'::text not null,
  ultima_sync timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  refresh_token text,
  token_expira_en timestamp with time zone,
  refresh_lock_hasta timestamp with time zone,
  movimientos_stock_pagina_cursor integer default 0 not null,
  movimientos_stock_backfill_completo boolean default false not null,
  constraint yiqi_config_pkey PRIMARY KEY (id)
);

create table if not exists public.articulos_cache (
  id uuid default uuid_generate_v4() not null,
  mate_id integer,
  mate_codigo text not null,
  mate_nombre text,
  mate_descripcion text,
  mate_stock_disponible numeric default 0,
  mate_stock_seguridad numeric,
  mate_punto_de_pedido numeric,
  mate_punto_pedido_max numeric,
  mate_cant_para_reposicion numeric,
  mate_cantidad_pedida numeric,
  mate_uso_mensual numeric,
  mate_lead_time numeric,
  mate_codigo_en_el_proveed text,
  mate_crm numeric,
  clie_id_clie integer,
  proveedor_nombre text,
  familia text,
  marca text,
  sincronizado_at timestamp with time zone default now() not null,
  constraint articulos_cache_mate_id_key UNIQUE (mate_id),
  constraint articulos_cache_pkey PRIMARY KEY (id)
);

create table if not exists public.ordenes_compra_cache (
  id uuid default uuid_generate_v4() not null,
  ordc_id integer,
  ordc_nro_oc text,
  ordc_asunto text,
  clie_id_clie integer,
  proveedor_nombre text,
  ordc_fecha timestamp with time zone,
  ordc_total_neto numeric,
  ordc_importe_total numeric,
  ordc_total_cantidades numeric,
  ordc_total_entregado numeric,
  ordc_total_pendiente numeric,
  esta_nombre text,
  esta_codigo text,
  cedi_id_cedi integer,
  sincronizado_at timestamp with time zone default now() not null,
  constraint ordenes_compra_cache_ordc_id_key UNIQUE (ordc_id),
  constraint ordenes_compra_cache_pkey PRIMARY KEY (id)
);

create table if not exists public.ordenes_compra_detalle_cache (
  id uuid default uuid_generate_v4() not null,
  orden_compra_cache_id uuid not null,
  mate_id_mate integer,
  dedo_nombre_mate text,
  dedo_cantidad numeric,
  dedo_cantidad_entregada numeric,
  dedo_cantidad_pendiente numeric,
  dedo_precio_unitario_acor numeric,
  dedo_subtotal_neto numeric,
  dedo_total numeric,
  esta_nombre text,
  constraint ordenes_compra_detalle_cache_pkey PRIMARY KEY (id),
  constraint ordenes_compra_detalle_cache_orden_compra_cache_id_fkey FOREIGN KEY (orden_compra_cache_id) REFERENCES ordenes_compra_cache(id) ON DELETE CASCADE
);

create table if not exists public.ordenes_propias (
  id bigint generated always as identity not null,
  proveedor_codigo text,
  proveedor_nombre text not null,
  estado text default 'borrador'::text not null,
  notas text,
  creada_por uuid not null,
  creada_en timestamp with time zone default now() not null,
  enviada_en timestamp with time zone,
  decidida_por uuid,
  decidida_en timestamp with time zone,
  comentario_decision text,
  total_estimado numeric,
  items_sin_costo integer default 0 not null,
  limite_al_crear numeric,
  archivada_en timestamp with time zone,
  archivada_por uuid,
  yiqi_enviada_en timestamp with time zone,
  yiqi_id_creado bigint,
  yiqi_error text,
  whatsapp_enviada_en timestamp with time zone,
  whatsapp_enviada_por uuid,
  constraint ordenes_propias_pkey PRIMARY KEY (id),
  constraint ordenes_propias_archivada_por_fkey FOREIGN KEY (archivada_por) REFERENCES auth.users(id),
  constraint ordenes_propias_creada_por_fkey FOREIGN KEY (creada_por) REFERENCES auth.users(id),
  constraint ordenes_propias_decidida_por_fkey FOREIGN KEY (decidida_por) REFERENCES auth.users(id),
  constraint ordenes_propias_whatsapp_enviada_por_fkey FOREIGN KEY (whatsapp_enviada_por) REFERENCES auth.users(id),
  constraint ordenes_propias_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'pendiente'::text, 'aprobada'::text, 'rechazada'::text])))
);

create table if not exists public.ordenes_propias_items (
  id bigint generated always as identity not null,
  orden_id bigint not null,
  mate_codigo text not null,
  mate_nombre text,
  cantidad numeric not null,
  stock_al_momento numeric,
  promedio_mensual numeric,
  unidades_por_bulto numeric,
  costo_unitario numeric,
  constraint ordenes_propias_items_orden_id_mate_codigo_key UNIQUE (orden_id, mate_codigo),
  constraint ordenes_propias_items_pkey PRIMARY KEY (id),
  constraint ordenes_propias_items_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes_propias(id) ON DELETE CASCADE,
  constraint ordenes_propias_items_cantidad_check CHECK ((cantidad > (0)::numeric))
);

create table if not exists public.punto_equilibrio_local (
  sku text not null,
  mate_nombre text,
  venta_mensual_prom numeric default 0 not null,
  meses_considerados integer default 6 not null,
  periodo_desde date,
  periodo_hasta date,
  calculado_en timestamp with time zone default now() not null,
  excluido boolean default false not null,
  motivo_exclusion text,
  constraint punto_equilibrio_local_pkey PRIMARY KEY (sku)
);

create table if not exists public.solicitudes_reposicion (
  id bigint generated always as identity not null,
  deposito_origen_id integer not null,
  deposito_destino_id integer not null,
  estado text default 'solicitada'::text not null,
  generada_por text not null,
  regla_id bigint,
  creada_en timestamp with time zone default now() not null,
  procesada_en timestamp with time zone,
  reemplazada_por_id bigint,
  remito_numero text,
  constraint solicitudes_reposicion_pkey PRIMARY KEY (id),
  constraint solicitudes_reposicion_reemplazada_por_id_fkey FOREIGN KEY (reemplazada_por_id) REFERENCES solicitudes_reposicion(id),
  constraint solicitudes_reposicion_estado_check CHECK ((estado = ANY (ARRAY['solicitada'::text, 'en_preparacion'::text, 'reemplazada'::text]))),
  constraint solicitudes_reposicion_generada_por_check CHECK ((generada_por = ANY (ARRAY['regla_automatica'::text, 'manual'::text])))
);

create table if not exists public.solicitudes_reposicion_lineas (
  id bigint generated always as identity not null,
  solicitud_id bigint not null,
  sku text not null,
  mate_nombre text,
  cantidad_solicitada numeric not null,
  estado_linea text default 'reservada'::text not null,
  cantidad_enviada numeric,
  cantidad_faltante numeric,
  motivo_sin_stock text,
  declarada_en timestamp with time zone,
  cantidad_recibida numeric,
  recibida_en timestamp with time zone,
  yiqi_movimiento_id text,
  yiqi_enviado_en timestamp with time zone,
  yiqi_error text,
  oc_generada_id bigint,
  clase_abc text,
  constraint solicitudes_reposicion_lineas_pkey PRIMARY KEY (id),
  constraint solicitudes_reposicion_lineas_solicitud_id_fkey FOREIGN KEY (solicitud_id) REFERENCES solicitudes_reposicion(id) ON DELETE CASCADE,
  constraint solicitudes_reposicion_lineas_estado_linea_check CHECK ((estado_linea = ANY (ARRAY['reservada'::text, 'declarada'::text, 'recibida'::text])))
);

create table if not exists public.alertas_suspendidas (
  sku text not null,
  motivo text not null,
  suspendida_en timestamp with time zone default now() not null,
  solicitud_linea_id bigint,
  reactivada_en timestamp with time zone,
  constraint alertas_suspendidas_pkey PRIMARY KEY (sku),
  constraint alertas_suspendidas_solicitud_linea_id_fkey FOREIGN KEY (solicitud_linea_id) REFERENCES solicitudes_reposicion_lineas(id)
);

create table if not exists public.alertas_pausadas (
  mate_codigo text not null,
  motivo text,
  pausada_por uuid,
  pausada_en timestamp with time zone default now() not null,
  reactivar_en timestamp with time zone default now() not null,
  constraint alertas_pausadas_pkey PRIMARY KEY (mate_codigo),
  constraint alertas_pausadas_pausada_por_fkey FOREIGN KEY (pausada_por) REFERENCES auth.users(id)
);

create table if not exists public.articulos_excluidos_alertas (
  mate_codigo text not null,
  motivo text not null,
  excluido_por uuid,
  excluido_en timestamp with time zone default now() not null,
  constraint articulos_excluidos_alertas_pkey PRIMARY KEY (mate_codigo),
  constraint articulos_excluidos_alertas_excluido_por_fkey FOREIGN KEY (excluido_por) REFERENCES auth.users(id)
);

-- ------------------------------------------------------------
-- 2. Índices
-- ------------------------------------------------------------
create index if not exists idx_clientes_yiqi_codigo ON public.clientes_yiqi USING btree (clie_codigo);
create index if not exists idx_material_yiqi_codigo ON public.material_yiqi USING btree (mate_codigo);
create index if not exists idx_material_yiqi_proveedor ON public.material_yiqi USING btree (clie_codigo);
create index if not exists idx_ordenes_yiqi_nro_oc ON public.ordenes_yiqi USING btree (nro_oc);
create index if not exists idx_ordenes_yiqi_yiqi_id ON public.ordenes_yiqi USING btree (yiqi_id);
create unique index if not exists ordenes_yiqi_yiqi_id_sku_key ON public.ordenes_yiqi USING btree (yiqi_id, COALESCE(sku, ''::text));
create index if not exists ix_ventas_mensual_codigo ON public.ventas_mensual_yiqi USING btree (mate_codigo);
create index if not exists ix_ventas_mensual_periodo ON public.ventas_mensual_yiqi USING btree (periodo);
create index if not exists ix_proveedores_nombre ON public.proveedores USING btree (clie_nombre);
create index if not exists idx_articulos_stock_bajo ON public.articulos_cache USING btree (mate_stock_disponible, mate_punto_de_pedido);
create index if not exists idx_articulos_codigo ON public.articulos_cache USING btree (mate_codigo);
create index if not exists idx_detalle_orden ON public.ordenes_compra_detalle_cache USING btree (orden_compra_cache_id);
create index if not exists ix_ordenes_propias_estado ON public.ordenes_propias USING btree (estado);
create index if not exists ix_ordenes_propias_items_orden ON public.ordenes_propias_items USING btree (orden_id);

-- ------------------------------------------------------------
-- 3. Funciones (solo si no existen)
-- ------------------------------------------------------------
do $b$ begin
  if to_regprocedure('public.es_admin()') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.es_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.usuarios_config
    where user_id = auth.uid() and rol = 'admin' and activo = true
  );
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.es_usuario_deposito()') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.es_usuario_deposito()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1 from public.usuarios_config
    where user_id = auth.uid() and rol = 'deposito' and activo = true
  );
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.mis_codigos_proveedor()') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.mis_codigos_proveedor()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select proveedor_codigo::text from public.usuario_proveedor
  where user_id = auth.uid();
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.mis_nombres_proveedor()') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.mis_nombres_proveedor()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select proveedor_nombre::text from public.usuario_proveedor
  where user_id = auth.uid();
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.mis_depositos()') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.mis_depositos()
 RETURNS SETOF integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select deposito_id from public.usuario_deposito where usuario_id = auth.uid();
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.condiciones_proveedor(text)') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.condiciones_proveedor(p_proveedor text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
    'limite',            coalesce(p.limite_aprobacion, r.limite_aprobacion),
    'limite_es_propio',  (p.limite_aprobacion is not null),
    'siempre_aprueba',   coalesce(p.siempre_requiere_aprobacion, false),
    'minimo_compra',     p.minimo_compra,
    'minimo_es_unidades', coalesce(p.minimo_es_unidades, false),
    'plazo_pago',        p.plazo_pago,
    'whatsapp',          p.whatsapp_pedidos,
    'mail',              p.mail_pedidos,
    'contacto',          p.contacto,
    'notas',             p.notas
  )
  from public.reglas_compra r
  left join public.proveedores p on p.clie_nombre = p_proveedor
  where r.id = 1;
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.historial_ventas_json(integer)') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.historial_ventas_json(p_meses integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(jsonb_agg(t), '[]'::jsonb)
  from public.historial_ventas(p_meses) t;
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.proveedores_con_alertas()') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.proveedores_con_alertas()
 RETURNS TABLE(proveedor text, criticas bigint, preventivas bigint, demanda_riesgo numeric, sin_historial bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with prom as (
    select v.mate_codigo, sum(v.cantidad) / 12.0 as promedio
    from public.ventas_mensual_yiqi v
    where v.periodo >= (date_trunc('month', current_date) - interval '12 months')::date
      and v.periodo <  date_trunc('month', current_date)::date
    group by v.mate_codigo
  ),
  mat as (
    select m.clie_nombre,
           coalesce(m.mate_stock_disponible, 0) as stock,
           case when m.mate_punto_de_pedido > 0 then m.mate_punto_de_pedido
                else m.mate_stock_seguridad end as umbral,
           greatest(coalesce(p.promedio, 0), 0) as promedio
    from public.material_yiqi m
    left join prom p on p.mate_codigo = m.mate_codigo
    where m.clie_nombre is not null
      and public.es_comprable(m.mate_nombre, m.clie_nombre)
  ),
  enAlerta as (select * from mat where umbral is not null and stock <= umbral)
  select clie_nombre,
         count(*) filter (where stock <= 0),
         count(*) filter (where stock > 0),
         round(sum(promedio), 1),
         count(*) filter (where promedio <= 0)
  from enAlerta
  group by clie_nombre
  order by sum(promedio) desc, count(*) filter (where stock <= 0) desc;
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.upsert_clientes_yiqi(jsonb)') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.upsert_clientes_yiqi(p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  insert into clientes_yiqi (
    yiqi_id, clie_codigo, clie_nombre, clie_razon_social, clie_cuit,
    condicion_iva, cuenta_gastos, mail, telefono, hash_datos,
    actualizado_en, sincronizado_en
  )
  select
    x.yiqi_id, x.clie_codigo, x.clie_nombre, x.clie_razon_social, x.clie_cuit,
    x.condicion_iva, x.cuenta_gastos, x.mail, x.telefono, x.hash_datos,
    now(), now()
  from jsonb_to_recordset(p_rows) as x(
    yiqi_id bigint, clie_codigo text, clie_nombre text, clie_razon_social text,
    clie_cuit text, condicion_iva text, cuenta_gastos text, mail text,
    telefono text, hash_datos text
  )
  on conflict (yiqi_id) do update set
    clie_codigo = excluded.clie_codigo,
    clie_nombre = excluded.clie_nombre,
    clie_razon_social = excluded.clie_razon_social,
    clie_cuit = excluded.clie_cuit,
    condicion_iva = excluded.condicion_iva,
    cuenta_gastos = excluded.cuenta_gastos,
    mail = excluded.mail,
    telefono = excluded.telefono,
    actualizado_en = case
      when clientes_yiqi.hash_datos is distinct from excluded.hash_datos
      then now()
      else clientes_yiqi.actualizado_en
    end,
    hash_datos = excluded.hash_datos,
    sincronizado_en = now();
end;
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.upsert_material_yiqi(jsonb)') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.upsert_material_yiqi(p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  insert into material_yiqi (
    yiqi_id, mate_codigo, mate_nombre, clie_codigo, clie_nombre,
    mate_stock_disponible, mate_stock_seguridad, mate_punto_de_pedido,
    mate_punto_pedido_max, mate_lead_time, mate_codigo_en_el_proveed,
    mate_notas_sobre_punto_de, unit_cantidad_de_unidades,
    mate_cantidad_de_unidades, mate_caja, mate_crm, mate_crm_final,
    hash_datos, actualizado_en, sincronizado_en
  )
  select
    x.yiqi_id, x.mate_codigo, x.mate_nombre, x.clie_codigo, x.clie_nombre,
    x.mate_stock_disponible, x.mate_stock_seguridad, x.mate_punto_de_pedido,
    x.mate_punto_pedido_max, x.mate_lead_time, x.mate_codigo_en_el_proveed,
    x.mate_notas_sobre_punto_de, x.unit_cantidad_de_unidades,
    x.mate_cantidad_de_unidades, x.mate_caja, x.mate_crm, x.mate_crm_final,
    x.hash_datos, now(), now()
  from jsonb_to_recordset(p_rows) as x(
    yiqi_id bigint, mate_codigo text, mate_nombre text, clie_codigo text,
    clie_nombre text, mate_stock_disponible numeric, mate_stock_seguridad numeric,
    mate_punto_de_pedido numeric, mate_punto_pedido_max numeric, mate_lead_time numeric,
    mate_codigo_en_el_proveed text, mate_notas_sobre_punto_de text,
    unit_cantidad_de_unidades numeric, mate_cantidad_de_unidades numeric,
    mate_caja text, mate_crm numeric, mate_crm_final numeric, hash_datos text
  )
  on conflict (yiqi_id) do update set
    mate_codigo = excluded.mate_codigo,
    mate_nombre = excluded.mate_nombre,
    clie_codigo = excluded.clie_codigo,
    clie_nombre = excluded.clie_nombre,
    mate_stock_disponible = excluded.mate_stock_disponible,
    mate_stock_seguridad = excluded.mate_stock_seguridad,
    mate_punto_de_pedido = excluded.mate_punto_de_pedido,
    mate_punto_pedido_max = excluded.mate_punto_pedido_max,
    mate_lead_time = excluded.mate_lead_time,
    mate_codigo_en_el_proveed = excluded.mate_codigo_en_el_proveed,
    mate_notas_sobre_punto_de = excluded.mate_notas_sobre_punto_de,
    unit_cantidad_de_unidades = excluded.unit_cantidad_de_unidades,
    mate_cantidad_de_unidades = excluded.mate_cantidad_de_unidades,
    mate_caja = excluded.mate_caja,
    mate_crm = excluded.mate_crm,
    mate_crm_final = excluded.mate_crm_final,
    actualizado_en = case
      when material_yiqi.hash_datos is distinct from excluded.hash_datos
      then now()
      else material_yiqi.actualizado_en
    end,
    hash_datos = excluded.hash_datos,
    sincronizado_en = now();
end;
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.upsert_ventas_mensual_yiqi(jsonb)') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.upsert_ventas_mensual_yiqi(p_filas jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_filas integer;
begin
  with crudas as (
    select
      f->>'mate_codigo'          as mate_codigo,
      nullif(f->>'proveedor','') as proveedor,
      (f->>'periodo')::date      as periodo,
      (f->>'cantidad')::numeric  as cantidad
    from jsonb_array_elements(p_filas) as f
  ),
  -- Agrupamos por la clave real para que no lleguen duplicados al
  -- ON CONFLICT: si el mismo SKU viniera dos veces (dos proveedores),
  -- Postgres rechazaria el lote entero.
  agrupadas as (
    select mate_codigo,
           periodo,
           min(proveedor) as proveedor,
           sum(cantidad)  as cantidad
    from crudas
    where mate_codigo is not null
      and periodo     is not null
      and cantidad    is not null
    group by mate_codigo, periodo
  )
  insert into public.ventas_mensual_yiqi
        (mate_codigo, proveedor, periodo, cantidad, sincronizado_en)
  select mate_codigo, proveedor, periodo, cantidad, now()
  from agrupadas
  on conflict (mate_codigo, periodo) do update
    set proveedor       = excluded.proveedor,
        cantidad        = excluded.cantidad,
        sincronizado_en = now();

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.crear_solicitud_reposicion(integer,integer,text,bigint)') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.crear_solicitud_reposicion(p_origen integer, p_destino integer, p_generada_por text DEFAULT 'regla_automatica'::text, p_regla_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_nueva_id bigint;
begin
  insert into public.solicitudes_reposicion
    (deposito_origen_id, deposito_destino_id, estado, generada_por, regla_id)
  values (p_origen, p_destino, 'solicitada', p_generada_por, p_regla_id)
  returning id into v_nueva_id;

  update public.solicitudes_reposicion
     set estado = 'reemplazada',
         reemplazada_por_id = v_nueva_id
   where deposito_origen_id = p_origen
     and deposito_destino_id = p_destino
     and estado = 'solicitada'
     and id <> v_nueva_id;

  return v_nueva_id;
end;
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.confirmar_recepcion_linea(bigint,numeric)') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.confirmar_recepcion_linea(p_linea_id bigint, p_cantidad_recibida numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_linea record;
begin
  select * into v_linea from public.solicitudes_reposicion_lineas where id = p_linea_id for update;
  if not found then
    raise exception 'Línea % no existe', p_linea_id;
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
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.crear_remito_reposicion_manual(integer,integer,jsonb)') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.crear_remito_reposicion_manual(p_origen integer, p_destino integer, p_lineas jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_id bigint;
begin
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
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.declarar_linea_reposicion(bigint,numeric,text)') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.declarar_linea_reposicion(p_linea_id bigint, p_cantidad_enviada numeric, p_motivo_sin_stock text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_linea record;
  v_faltante numeric;
begin
  select * into v_linea from public.solicitudes_reposicion_lineas where id = p_linea_id for update;
  if not found then
    raise exception 'Línea % no existe', p_linea_id;
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
    -- Falta enganchar acá la creación de la OC vía reglas_compra —
    -- necesito ver esa función antes de completarlo (queda para el
    -- próximo bloque, junto con el cálculo en vivo).
  end if;
end;
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.fijar_reactivar_en_alertas_pausadas()') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.fijar_reactivar_en_alertas_pausadas()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.reactivar_en := new.pausada_en + interval '15 days';
  return new;
end;
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.reactivar_alertas_por_stock()') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.reactivar_alertas_por_stock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  update public.alertas_suspendidas
     set reactivada_en = now()
   where sku = new.sku
     and reactivada_en is null
     and (
       (new.stock_central is distinct from old.stock_central and coalesce(new.stock_central,0) > 0)
       or (new.stock_local is distinct from old.stock_local and coalesce(new.stock_local,0) > 0)
     );
  return new;
end;
$function$
$f$;
  end if;
end $b$;

do $b$ begin
  if to_regprocedure('public.trg_recalcular_punto_equilibrio()') is null then
    execute $f$
CREATE OR REPLACE FUNCTION public.trg_recalcular_punto_equilibrio()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  perform calcular_punto_equilibrio();
  return null;
end;
$function$
$f$;
  end if;
end $b$;

-- ------------------------------------------------------------
-- 4. Vistas (solo si no existen)
-- ------------------------------------------------------------
do $b$ begin
  if to_regclass('public.v_alertas_stock') is null then
    execute $f$ create view public.v_alertas_stock as
 SELECT id,
    mate_codigo,
    mate_nombre,
    mate_stock_disponible,
    mate_punto_de_pedido,
    mate_cant_para_reposicion,
    proveedor_nombre,
    familia,
        CASE
            WHEN mate_stock_disponible <= 0::numeric THEN 'critica'::text
            WHEN mate_stock_disponible <= mate_punto_de_pedido THEN 'preventiva'::text
            ELSE 'ok'::text
        END AS nivel_alerta
   FROM articulos_cache
  WHERE mate_punto_de_pedido IS NOT NULL AND mate_stock_disponible <= mate_punto_de_pedido
  ORDER BY mate_stock_disponible
$f$;
  end if;
end $b$;

-- ------------------------------------------------------------
-- 5. RLS
-- ------------------------------------------------------------
alter table public.catalogo_causas enable row level security;
alter table public.clientes_yiqi enable row level security;
alter table public.empresa_config enable row level security;
alter table public.material_yiqi enable row level security;
alter table public.ordenes_yiqi enable row level security;
alter table public.ventas_mensual_yiqi enable row level security;
alter table public.proveedores enable row level security;
alter table public.reglas_compra enable row level security;
alter table public.reglas_reposicion_central enable row level security;
alter table public.templates_mensaje enable row level security;
alter table public.usuarios_config enable row level security;
alter table public.usuario_proveedor enable row level security;
alter table public.usuario_deposito enable row level security;
alter table public.yiqi_config enable row level security;
alter table public.articulos_cache enable row level security;
alter table public.ordenes_compra_cache enable row level security;
alter table public.ordenes_compra_detalle_cache enable row level security;
alter table public.ordenes_propias enable row level security;
alter table public.ordenes_propias_items enable row level security;
alter table public.punto_equilibrio_local enable row level security;
alter table public.solicitudes_reposicion enable row level security;
alter table public.solicitudes_reposicion_lineas enable row level security;
alter table public.alertas_suspendidas enable row level security;
alter table public.alertas_pausadas enable row level security;
alter table public.articulos_excluidos_alertas enable row level security;

-- ------------------------------------------------------------
-- 6. Policies (solo si no existen)
-- ------------------------------------------------------------
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'catalogo_causas' and policyname = 'solo admin administra el catalogo') then
    create policy "solo admin administra el catalogo" on public.catalogo_causas as PERMISSIVE for ALL to public using (es_admin()) with check (es_admin());
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'catalogo_causas' and policyname = 'todos leen el catalogo') then
    create policy "todos leen el catalogo" on public.catalogo_causas as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clientes_yiqi' and policyname = 'Lectura publica clientes_yiqi') then
    create policy "Lectura publica clientes_yiqi" on public.clientes_yiqi as PERMISSIVE for SELECT to public using (true);
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'empresa_config' and policyname = 'solo admin edita empresa') then
    create policy "solo admin edita empresa" on public.empresa_config as PERMISSIVE for UPDATE to public using (es_admin()) with check (es_admin());
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'empresa_config' and policyname = 'todos leen los datos de empresa') then
    create policy "todos leen los datos de empresa" on public.empresa_config as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'material_yiqi' and policyname = 'depositos ven todo el material para buscar articulos') then
    create policy "depositos ven todo el material para buscar articulos" on public.material_yiqi as PERMISSIVE for SELECT to public using (es_usuario_deposito());
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'material_yiqi' and policyname = 'material segun proveedores asignados') then
    create policy "material segun proveedores asignados" on public.material_yiqi as PERMISSIVE for SELECT to public using ((es_admin() OR (clie_codigo IN ( SELECT mis_codigos_proveedor() AS mis_codigos_proveedor)) OR (clie_nombre IN ( SELECT mis_nombres_proveedor() AS mis_nombres_proveedor))));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ordenes_yiqi' and policyname = 'ordenes segun proveedores asignados') then
    create policy "ordenes segun proveedores asignados" on public.ordenes_yiqi as PERMISSIVE for SELECT to public using ((es_admin() OR (proveedor IN ( SELECT mis_nombres_proveedor() AS mis_nombres_proveedor))));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ventas_mensual_yiqi' and policyname = 'ventas segun proveedores asignados') then
    create policy "ventas segun proveedores asignados" on public.ventas_mensual_yiqi as PERMISSIVE for SELECT to public using ((es_admin() OR (proveedor IN ( SELECT mis_nombres_proveedor() AS mis_nombres_proveedor))));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'proveedores' and policyname = 'solo admin edita proveedores') then
    create policy "solo admin edita proveedores" on public.proveedores as PERMISSIVE for ALL to public using (es_admin()) with check (es_admin());
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'proveedores' and policyname = 'todos leen proveedores') then
    create policy "todos leen proveedores" on public.proveedores as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglas_compra' and policyname = 'solo el admin edita las reglas') then
    create policy "solo el admin edita las reglas" on public.reglas_compra as PERMISSIVE for UPDATE to public using (es_admin()) with check (es_admin());
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglas_compra' and policyname = 'todos leen las reglas') then
    create policy "todos leen las reglas" on public.reglas_compra as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglas_reposicion_central' and policyname = 'solo admin administra reglas de reposicion') then
    create policy "solo admin administra reglas de reposicion" on public.reglas_reposicion_central as PERMISSIVE for ALL to public using (es_admin()) with check (es_admin());
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'templates_mensaje' and policyname = 'solo admin administra templates') then
    create policy "solo admin administra templates" on public.templates_mensaje as PERMISSIVE for ALL to public using (es_admin()) with check (es_admin());
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'templates_mensaje' and policyname = 'todos leen templates') then
    create policy "todos leen templates" on public.templates_mensaje as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'usuarios_config' and policyname = 'cada usuario lee su propia config') then
    create policy "cada usuario lee su propia config" on public.usuarios_config as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'usuario_proveedor' and policyname = 'cada usuario lee sus asignaciones') then
    create policy "cada usuario lee sus asignaciones" on public.usuario_proveedor as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'usuario_deposito' and policyname = 'cada usuario lee sus asignaciones de deposito') then
    create policy "cada usuario lee sus asignaciones de deposito" on public.usuario_deposito as PERMISSIVE for SELECT to public using ((auth.uid() = usuario_id));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'articulos_cache' and policyname = 'demo_lectura_autenticados') then
    create policy demo_lectura_autenticados on public.articulos_cache as PERMISSIVE for SELECT to authenticated using (true);
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ordenes_compra_cache' and policyname = 'demo_lectura_autenticados_oc') then
    create policy demo_lectura_autenticados_oc on public.ordenes_compra_cache as PERMISSIVE for SELECT to authenticated using (true);
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ordenes_compra_detalle_cache' and policyname = 'demo_lectura_autenticados_detalle') then
    create policy demo_lectura_autenticados_detalle on public.ordenes_compra_detalle_cache as PERMISSIVE for SELECT to authenticated using (true);
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ordenes_propias' and policyname = 'borrar ordenes propias') then
    create policy "borrar ordenes propias" on public.ordenes_propias as PERMISSIVE for DELETE to public using (((creada_por = auth.uid()) AND (estado = 'borrador'::text)));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ordenes_propias' and policyname = 'crear ordenes propias') then
    create policy "crear ordenes propias" on public.ordenes_propias as PERMISSIVE for INSERT to public with check ((creada_por = auth.uid()));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ordenes_propias' and policyname = 'editar ordenes propias') then
    create policy "editar ordenes propias" on public.ordenes_propias as PERMISSIVE for UPDATE to public using ((es_admin() OR ((creada_por = auth.uid()) AND (estado = 'borrador'::text)))) with check ((es_admin() OR ((creada_por = auth.uid()) AND (estado = ANY (ARRAY['borrador'::text, 'pendiente'::text])))));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ordenes_propias' and policyname = 'ver ordenes propias') then
    create policy "ver ordenes propias" on public.ordenes_propias as PERMISSIVE for SELECT to public using ((es_admin() OR (creada_por = auth.uid())));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ordenes_propias_items' and policyname = 'borrar items') then
    create policy "borrar items" on public.ordenes_propias_items as PERMISSIVE for DELETE to public using ((orden_id IN ( SELECT ordenes_propias.id
   FROM ordenes_propias
  WHERE ((ordenes_propias.creada_por = auth.uid()) AND (ordenes_propias.estado = 'borrador'::text)))));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ordenes_propias_items' and policyname = 'crear items') then
    create policy "crear items" on public.ordenes_propias_items as PERMISSIVE for INSERT to public with check ((orden_id IN ( SELECT ordenes_propias.id
   FROM ordenes_propias
  WHERE ((ordenes_propias.creada_por = auth.uid()) AND (ordenes_propias.estado = 'borrador'::text)))));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ordenes_propias_items' and policyname = 'editar items') then
    create policy "editar items" on public.ordenes_propias_items as PERMISSIVE for UPDATE to public using ((orden_id IN ( SELECT ordenes_propias.id
   FROM ordenes_propias
  WHERE ((ordenes_propias.creada_por = auth.uid()) AND (ordenes_propias.estado = 'borrador'::text)))));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ordenes_propias_items' and policyname = 'ver items') then
    create policy "ver items" on public.ordenes_propias_items as PERMISSIVE for SELECT to public using ((orden_id IN ( SELECT ordenes_propias.id
   FROM ordenes_propias)));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitudes_reposicion' and policyname = 'actualizar reposicion segun depositos asignados') then
    create policy "actualizar reposicion segun depositos asignados" on public.solicitudes_reposicion as PERMISSIVE for UPDATE to public using ((es_admin() OR (deposito_origen_id IN ( SELECT mis_depositos() AS mis_depositos)) OR (deposito_destino_id IN ( SELECT mis_depositos() AS mis_depositos))));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitudes_reposicion' and policyname = 'reposicion segun depositos asignados') then
    create policy "reposicion segun depositos asignados" on public.solicitudes_reposicion as PERMISSIVE for SELECT to public using ((es_admin() OR (deposito_origen_id IN ( SELECT mis_depositos() AS mis_depositos)) OR (deposito_destino_id IN ( SELECT mis_depositos() AS mis_depositos))));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitudes_reposicion_lineas' and policyname = 'actualizar lineas segun depositos asignados') then
    create policy "actualizar lineas segun depositos asignados" on public.solicitudes_reposicion_lineas as PERMISSIVE for UPDATE to public using ((EXISTS ( SELECT 1
   FROM solicitudes_reposicion s
  WHERE ((s.id = solicitudes_reposicion_lineas.solicitud_id) AND (es_admin() OR (s.deposito_origen_id IN ( SELECT mis_depositos() AS mis_depositos)) OR (s.deposito_destino_id IN ( SELECT mis_depositos() AS mis_depositos)))))));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitudes_reposicion_lineas' and policyname = 'lineas segun depositos asignados') then
    create policy "lineas segun depositos asignados" on public.solicitudes_reposicion_lineas as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM solicitudes_reposicion s
  WHERE ((s.id = solicitudes_reposicion_lineas.solicitud_id) AND (es_admin() OR (s.deposito_origen_id IN ( SELECT mis_depositos() AS mis_depositos)) OR (s.deposito_destino_id IN ( SELECT mis_depositos() AS mis_depositos)))))));
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alertas_suspendidas' and policyname = 'usuarios logueados leen alertas suspendidas') then
    create policy "usuarios logueados leen alertas suspendidas" on public.alertas_suspendidas as PERMISSIVE for SELECT to public using (true);
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alertas_pausadas' and policyname = 'alertas_pausadas_select_authenticated') then
    create policy alertas_pausadas_select_authenticated on public.alertas_pausadas as PERMISSIVE for SELECT to authenticated using (true);
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alertas_pausadas' and policyname = 'alertas_pausadas_write_authenticated') then
    create policy alertas_pausadas_write_authenticated on public.alertas_pausadas as PERMISSIVE for ALL to authenticated using (true) with check (true);
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'articulos_excluidos_alertas' and policyname = 'excluidos_alertas_select_authenticated') then
    create policy excluidos_alertas_select_authenticated on public.articulos_excluidos_alertas as PERMISSIVE for SELECT to authenticated using (true);
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'articulos_excluidos_alertas' and policyname = 'excluidos_alertas_write_admin') then
    create policy excluidos_alertas_write_admin on public.articulos_excluidos_alertas as PERMISSIVE for ALL to authenticated using (es_admin()) with check (es_admin());
  end if;
end $b$;

-- ------------------------------------------------------------
-- 7. Triggers (solo si no existen). trg_auto_preparar_central y
--    trg_lineas_remito_clase_abc viven en sus migraciones (20260910120000 y
--    20260930100000); trg_reactivar_alertas de stock_yiqi en 20260930131000.
-- ------------------------------------------------------------
do $b$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_ventas_mensual_yiqi_punto_equilibrio' and tgrelid = 'public.ventas_mensual_yiqi'::regclass) then
    CREATE TRIGGER trg_ventas_mensual_yiqi_punto_equilibrio AFTER INSERT OR UPDATE ON public.ventas_mensual_yiqi FOR EACH STATEMENT EXECUTE FUNCTION trg_recalcular_punto_equilibrio();
  end if;
end $b$;
do $b$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_fijar_reactivar_en' and tgrelid = 'public.alertas_pausadas'::regclass) then
    CREATE TRIGGER trg_fijar_reactivar_en BEFORE INSERT OR UPDATE ON public.alertas_pausadas FOR EACH ROW EXECUTE FUNCTION fijar_reactivar_en_alertas_pausadas();
  end if;
end $b$;

reset check_function_bodies;
