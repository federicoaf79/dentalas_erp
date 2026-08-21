-- ============================================================
-- 20260820180000_cache_candidatos_equivalencia_precios.sql
-- Fix #3 (el real) del timeout en "Revisar equivalencias" — probado en
-- vivo, Aris, 20/8/2026: ni la reescritura con LATERAL (20260820160000)
-- ni subir el umbral a 0.45 (20260820170000) alcanzaron.
-- ============================================================
--
-- POR QUÉ LOS FIX #1 Y #2 NO ALCANZARON: aunque cada LATERAL individual
-- (el top-5 de UN artículo) sea rápido con el índice GIN, la función
-- igual recorre las ~6.939 filas de precios_proveedor_yiqi como "a" en
-- cada llamada -- el `limit p_limite` final (30) no evita ese barrido,
-- porque Postgres no puede saber cuáles de las 6.939 van a terminar
-- entre los 30 más parecidos sin evaluar el LATERAL de todas. Resultado:
-- 6.939 × (costo de un top-5 con índice) sigue siendo demasiado para
-- una request interactiva de la API, sin importar cuánto se suba el
-- umbral -- el umbral acota el costo POR fila, no la CANTIDAD de filas.
--
-- FIX REAL: separar cálculo caro de lectura barata (mismo principio
-- que ya usa todo el proyecto para YiQi: sync-yiqi hace el trabajo
-- pesado en background por cron, yiqi-connector solo lee lo ya
-- sincronizado). Acá:
--
--   1. candidatos_equivalencia_precios_cache: tabla chica con los
--      pares ya calculados (se llena una vez por día, después del
--      sync de precios).
--   2. recalcular_candidatos_equivalencia_precios(): hace el barrido
--      completo UNA VEZ, sin restricción de tiempo (corre por cron o a
--      mano desde el SQL Editor -- ninguno de los dos está sujeto al
--      statement_timeout del rol `authenticated` que sí frena a la API).
--   3. candidatos_equivalencia_precios(): ahora es un SELECT simple
--      sobre la tabla ya calculada -- instantáneo, es lo único que la
--      pantalla de revisión llama en vivo.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabla de candidatos precalculados
-- ------------------------------------------------------------
create table if not exists public.candidatos_equivalencia_precios_cache (
  yiqi_id_menor bigint not null,
  yiqi_id_mayor bigint not null,
  similitud numeric not null,
  calculado_en timestamptz not null default now(),
  primary key (yiqi_id_menor, yiqi_id_mayor)
);

comment on table public.candidatos_equivalencia_precios_cache is
  'Pares candidatos por similitud de nombre (proveedores distintos, sin decidir todavía en equivalencias_precios), precalculados por recalcular_candidatos_equivalencia_precios(). Se recalcula por cron una vez al día -- NO se calcula en vivo dentro de una request de la API (ver migraciones 20260820160000/170000, insuficientes).';

alter table public.candidatos_equivalencia_precios_cache enable row level security;

grant select on public.candidatos_equivalencia_precios_cache to authenticated;

drop policy if exists "candidatos_cache_select_authenticated" on public.candidatos_equivalencia_precios_cache;
create policy "candidatos_cache_select_authenticated"
  on public.candidatos_equivalencia_precios_cache
  for select
  to authenticated
  using (true);

-- Sin política de insert/update/delete para `authenticated`: la tabla
-- solo se escribe desde recalcular_candidatos_equivalencia_precios()
-- (SECURITY DEFINER), nunca a mano desde el cliente.

-- ------------------------------------------------------------
-- 2) Recálculo completo (caro, sin límite de tiempo a propósito)
-- ------------------------------------------------------------
create or replace function public.recalcular_candidatos_equivalencia_precios()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  -- Sin límite de tiempo: esta función SOLO debe llamarse desde cron o
  -- a mano desde el SQL Editor -- nunca desde la API/el frontend (por
  -- eso no tiene sentido exponerla vía PostgREST con más permisos).
  perform set_config('statement_timeout', '0', true);
  perform set_config('pg_trgm.similarity_threshold', '0.4', true);

  delete from public.candidatos_equivalencia_precios_cache;

  insert into public.candidatos_equivalencia_precios_cache (yiqi_id_menor, yiqi_id_mayor, similitud)
  select a.yiqi_id, cand.yiqi_id, cand.similitud
  from public.precios_proveedor_yiqi a
  cross join lateral (
    select
      b.yiqi_id,
      similarity(lower(a.mate_nombre), lower(b.mate_nombre))::numeric as similitud
    from public.precios_proveedor_yiqi b
    where b.yiqi_id > a.yiqi_id
      and b.proveedor <> a.proveedor
      and b.mate_nombre is not null
      and lower(b.mate_nombre) % lower(a.mate_nombre)
    order by similitud desc
    limit 5
  ) as cand
  where a.mate_nombre is not null
    -- no vale la pena cachear un par que ya tiene respuesta humana
    and not exists (
      select 1 from public.equivalencias_precios e
      where e.yiqi_id_menor = a.yiqi_id
        and e.yiqi_id_mayor = cand.yiqi_id
    );

  get diagnostics filas = row_count;
  return filas;
end;
$$;

comment on function public.recalcular_candidatos_equivalencia_precios() is
  'Recalcula candidatos_equivalencia_precios_cache desde cero (delete + insert). Cara: barre las ~6.939 filas de precios_proveedor_yiqi. Diseñada para correr SOLO por cron o a mano desde el SQL Editor -- statement_timeout local en 0 (sin límite) a propósito, porque ninguno de los dos contextos está sujeto al timeout del rol `authenticated` que frena a la API. NUNCA llamarla desde el frontend.';

-- ------------------------------------------------------------
-- 3) Lectura rápida (esto sí lo llama la pantalla de revisión)
-- ------------------------------------------------------------
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
language sql
stable
as $$
  select
    a.yiqi_id, a.sku, a.proveedor, a.mate_nombre, a.precio_final, a.precio_neto,
    b.yiqi_id, b.sku, b.proveedor, b.mate_nombre, b.precio_final, b.precio_neto,
    c.similitud
  from public.candidatos_equivalencia_precios_cache c
  join public.precios_proveedor_yiqi a on a.yiqi_id = c.yiqi_id_menor
  join public.precios_proveedor_yiqi b on b.yiqi_id = c.yiqi_id_mayor
  where not exists (
    select 1 from public.equivalencias_precios e
    where e.yiqi_id_menor = c.yiqi_id_menor
      and e.yiqi_id_mayor = c.yiqi_id_mayor
  )
  order by c.similitud desc
  limit greatest(1, least(coalesce(p_limite, 30), 200));
$$;

comment on function public.candidatos_equivalencia_precios(integer) is
  'Lee hasta p_limite pares desde candidatos_equivalencia_precios_cache (ya precalculada, ver recalcular_candidatos_equivalencia_precios) que todavía no tengan respuesta en equivalencias_precios. NO es SECURITY DEFINER: el join contra precios_proveedor_yiqi respeta su RLS, así que un operador solo ve pares entre sus proveedores asignados, igual que antes. Rápida a propósito -- es la única que llama la pantalla de revisión en vivo.';

-- ------------------------------------------------------------
-- Cron: recalcula 15 min después del sync diario de precios (6:15
-- UTC), mismo criterio de espaciado que el resto de los cron jobs del
-- proyecto (no sumar corridas pesadas en el mismo minuto).
-- ------------------------------------------------------------
select cron.schedule(
  'recalcular-candidatos-equivalencia-precios-diario',
  '30 6 * * *',
  $$select public.recalcular_candidatos_equivalencia_precios();$$
);
