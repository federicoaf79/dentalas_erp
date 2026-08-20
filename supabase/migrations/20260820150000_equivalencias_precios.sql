-- ============================================================
-- 20260820150000_equivalencias_precios.sql
-- Dentalab-Compras — Comparación de precios, v2: confirmación humana
-- ============================================================
--
-- CONTEXTO (20/8/2026): la v1 de "Comparación de precios" mostraba
-- "posibles equivalentes" entre proveedores calculados por similitud
-- de texto en el navegador (sin guardar nada). Federico corrigió el
-- enfoque:
--
--   1. El match automático NUNCA debe declarar un "ganador" — solo
--      puede sugerir candidatos. La igualdad real ("¿es el mismo
--      producto, aunque cambie el proveedor?") la confirman las
--      personas que USAN el sistema (Aris e Ivana), revisando en
--      tandas de a 30 pares.
--   2. El criterio de "mismo producto" ignora la presentación
--      COMERCIAL (suelto, caja, bolsa) -- lo que importa es la unidad
--      de medida BASE del producto (ej.: "100gr de X", sin importar si
--      un proveedor lo vende suelto y otro en caja de 1kg o bolsa de
--      100gr). Por eso NO se intenta parsear/normalizar cantidades del
--      texto libre (demasiado poco confiable) -- se deja el juicio a
--      la persona que revisa el par.
--
-- Esta migración agrega:
--   a) pg_trgm + un índice GIN por nombre, para que el matcheo por
--      similitud de texto corra en el servidor (barrer ~6.939 filas al
--      cuadrado en el navegador no es viable -- se probó a mano y el
--      cálculo de a pares para TODO el catálogo escala mal en JS puro;
--      pg_trgm con índice GIN está hecho exactamente para esto).
--   b) equivalencias_precios: la tabla donde queda la confirmación
--      humana (confirmado/rechazado) de cada par.
--   c) candidatos_equivalencia_precios(): trae hasta N pares sin
--      revisar todavía, ordenados por similitud, para armar la
--      pantalla de revisión en tandas.
-- ============================================================

-- pg_trgm es una extensión estándar de Postgres (contrib), disponible
-- en Supabase sin configuración adicional.
create extension if not exists pg_trgm;

-- Índice por expresión (no hace falta agregar una columna nueva a
-- precios_proveedor_yiqi): acelera tanto `lower(mate_nombre) % '...'`
-- como el self-join que usa candidatos_equivalencia_precios() abajo.
create index if not exists precios_proveedor_yiqi_nombre_trgm_idx
  on public.precios_proveedor_yiqi
  using gin (lower(mate_nombre) gin_trgm_ops);

-- ============================================================
-- Tabla de confirmaciones
-- ============================================================
create table if not exists public.equivalencias_precios (
  id bigint generated always as identity primary key,
  -- Siempre yiqi_id_menor < yiqi_id_mayor (se normaliza antes de
  -- insertar): así el mismo par no puede quedar cargado dos veces en
  -- orden distinto, sin importar desde qué artículo se lo haya
  -- encontrado primero.
  yiqi_id_menor bigint not null,
  yiqi_id_mayor bigint not null,
  estado text not null check (estado in ('confirmado', 'rechazado')),
  -- Similitud de texto en el momento en que se sugirió el par (0-1).
  -- Es solo referencia/auditoría -- la decisión real es `estado`.
  similitud_texto numeric,
  confirmado_por uuid not null default auth.uid(),
  confirmado_en timestamptz not null default now(),
  observacion text,
  constraint equivalencias_precios_orden check (yiqi_id_menor < yiqi_id_mayor),
  constraint equivalencias_precios_par_unico unique (yiqi_id_menor, yiqi_id_mayor)
);

comment on table public.equivalencias_precios is
  'Confirmación humana de "es el mismo producto, en la misma unidad de medida base, aunque cambie el proveedor y la presentación comercial" entre dos filas de precios_proveedor_yiqi. El match automático por similitud de nombre (ver candidatos_equivalencia_precios) solo sugiere candidatos -- la igualdad real la confirman o rechazan Aris/Ivana desde la pantalla de revisión, en tandas de a 30. Decisión de Federico, 20/8/2026.';
comment on column public.equivalencias_precios.confirmado_por is
  'uuid de auth.users -- quién tomó la decisión (confirmar o rechazar), no solo quién confirmó. Default auth.uid() para no depender de que el cliente lo mande bien; el RLS de INSERT igual lo valida.';

-- Es tabla de referencia/curaduría (como composicion_articulos), no de
-- datos sensibles por proveedor -- lectura abierta a cualquier usuario
-- logueado. A diferencia de composicion_articulos (donde la escritura
-- es solo admin porque son reglas de negocio que definió Aris por
-- WhatsApp), acá la escritura de ALTA (confirmar/rechazar un par) se
-- abre a cualquier usuario autenticado a propósito: es exactamente el
-- pedido de Federico -- "las confirmaciones nos las van a dar los
-- mismos que usan el sistema" (Aris e Ivana). Corregir/deshacer una
-- confirmación ya cargada (UPDATE/DELETE) sí queda admin-only, como
-- red de seguridad ante un error de carga.
alter table public.equivalencias_precios enable row level security;

grant select, insert on public.equivalencias_precios to authenticated;
grant update, delete on public.equivalencias_precios to authenticated;

drop policy if exists "equivalencias_precios_select_authenticated" on public.equivalencias_precios;
create policy "equivalencias_precios_select_authenticated"
  on public.equivalencias_precios
  for select
  to authenticated
  using (true);

drop policy if exists "equivalencias_precios_insert_authenticated" on public.equivalencias_precios;
create policy "equivalencias_precios_insert_authenticated"
  on public.equivalencias_precios
  for insert
  to authenticated
  with check (confirmado_por = auth.uid());

drop policy if exists "equivalencias_precios_update_admin" on public.equivalencias_precios;
create policy "equivalencias_precios_update_admin"
  on public.equivalencias_precios
  for update
  to authenticated
  using (es_admin())
  with check (es_admin());

drop policy if exists "equivalencias_precios_delete_admin" on public.equivalencias_precios;
create policy "equivalencias_precios_delete_admin"
  on public.equivalencias_precios
  for delete
  to authenticated
  using (es_admin());

-- ============================================================
-- Candidatos para revisar -- trae hasta p_limite pares SIN decidir
-- todavía, entre proveedores distintos, ordenados por similitud.
--
-- NO es SECURITY DEFINER a propósito (mismo criterio que
-- marcar_reposicion_sugerida/sugerencias_compra): corre con el RLS del
-- usuario que llama, así que a Ivana solo le aparecen pares donde
-- ambos artículos son de sus proveedores asignados -- no tiene sentido
-- pedirle que confirme una equivalencia sobre un proveedor que ni
-- siquiera puede ver.
-- ============================================================
create or replace function public.candidatos_equivalencia_precios(p_limite integer default 30)
returns table (
  yiqi_id_a bigint,
  sku_a text,
  proveedor_a text,
  mate_nombre_a text,
  precio_final_a numeric,
  precio_neto_a numeric,
  yiqi_id_b bigint,
  sku_b text,
  proveedor_b text,
  mate_nombre_b text,
  precio_final_b numeric,
  precio_neto_b numeric,
  similitud numeric
)
language plpgsql
as $$
begin
  if p_limite is null or p_limite <= 0 or p_limite > 200 then
    p_limite := 30;
  end if;

  -- Umbral más permisivo que el 0.28 que usa el cálculo rápido del
  -- lado del cliente (ComparacionPrecios.jsx): acá el costo de mostrar
  -- un candidato de más es bajo (la persona lo rechaza con un clic),
  -- mientras que no sugerirlo nunca significa que ese par jamás se
  -- revisa. `true` = local a esta transacción, no queda pisado a nivel
  -- de conexión/pool.
  perform set_config('pg_trgm.similarity_threshold', '0.22', true);

  return query
  select
    a.yiqi_id, a.sku, a.proveedor, a.mate_nombre, a.precio_final, a.precio_neto,
    b.yiqi_id, b.sku, b.proveedor, b.mate_nombre, b.precio_final, b.precio_neto,
    similarity(lower(a.mate_nombre), lower(b.mate_nombre))::numeric as similitud
  from public.precios_proveedor_yiqi a
  join public.precios_proveedor_yiqi b
    on b.yiqi_id > a.yiqi_id
    and b.proveedor <> a.proveedor
    and lower(b.mate_nombre) % lower(a.mate_nombre)
  where a.mate_nombre is not null
    and b.mate_nombre is not null
    and not exists (
      select 1 from public.equivalencias_precios e
      where e.yiqi_id_menor = a.yiqi_id
        and e.yiqi_id_mayor = b.yiqi_id
    )
  order by similitud desc
  limit p_limite;
end;
$$;

comment on function public.candidatos_equivalencia_precios(integer) is
  'Trae hasta p_limite pares de precios_proveedor_yiqi (proveedores distintos) con nombre parecido y todavía sin confirmar/rechazar en equivalencias_precios, para la pantalla de revisión en tandas. No es SECURITY DEFINER: respeta el RLS de precios_proveedor_yiqi, así que un operador solo revisa pares entre sus proveedores asignados. El umbral de similitud (0.22) es deliberadamente más bajo que el 0.28 del cálculo rápido en el cliente -- acá el costo de un falso positivo es un clic en "No es el mismo", no una decisión de compra.';
