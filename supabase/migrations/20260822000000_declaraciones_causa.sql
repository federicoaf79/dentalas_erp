-- ============================================================
-- 20260822000000_declaraciones_causa.sql
-- Ítem 7 de "LO QUE SIGUE": declarar causas desde las pantallas.
-- ============================================================
--
-- CORRECCIÓN 22/8/2026: la primera versión de esta migración asumía
-- que declaraciones_causa no existía y la intentaba crear entera. Al
-- correrla en Supabase falló: la tabla YA EXISTÍA en producción, sin
-- migración propia (mismo patrón que catalogo_causas, contadores_sidebar,
-- etc. -- objetos aplicados directo en el SQL Editor sin quedar
-- versionados). El "create table if not exists" no hizo nada, y el
-- "create index" siguiente explotó contra un esquema distinto.
--
-- ESTRUCTURA REAL YA EXISTENTE, verificada en vivo el 22/8/2026 vía
-- information_schema / pg_policies / pg_constraint (no se toca nada de
-- esto acá, se documenta para que quede versionado de una vez):
--
--   create table public.declaraciones_causa (
--     id bigint generated always as identity primary key,
--     ambito text not null check (ambito in ('stock','entrega','compra')),
--     causa_id bigint references public.catalogo_causas(id),
--     mate_codigo text,        -- referencia para ámbito 'stock' (SKU)
--     nro_oc text,             -- referencia para ámbito 'entrega'
--     orden_propia bigint references public.ordenes_propias(id) on delete cascade,  -- ámbito 'compra'
--     nota text,
--     declarada_por uuid not null references auth.users(id),  -- sin default
--     declarada_en timestamptz not null default now()
--   );
--
--   RLS ya habilitado, 4 políticas ya creadas:
--     "todos leen declaraciones"   select  using (auth.uid() is not null)
--     "todos declaran"             insert  with check (declarada_por = auth.uid())
--     "cada uno edita lo suyo"     update  using (declarada_por = auth.uid() OR es_admin())
--     "cada uno borra lo suyo"     delete  using (declarada_por = auth.uid() OR es_admin())
--   3 índices ya creados.
--
-- Diseño (acordado con Federico, 22/8/2026, sigue vigente): cada
-- declaración es un registro nuevo, nunca pisa la anterior -- las
-- pantallas muestran la ÚLTIMA (por declarada_en) como vigente, con
-- historial completo debajo. Ver frontend/src/lib/causas.js.
--
-- LO ÚNICO QUE AGREGA ESTA MIGRACIÓN: referencia_texto, que no existía
-- en la tabla original -- una copia legible de la referencia tomada AL
-- MOMENTO de declarar (ej. "1106 — Cemento Definitivo Fosfato de
-- Zinc", o "OC #48 — Proveedor SRL"), para que el historial se siga
-- leyendo bien aunque el artículo cambie de nombre o la orden se
-- archive más adelante. Additive y seguro: la tabla está vacía (0
-- filas) al momento de escribir esto.
-- ============================================================

alter table public.declaraciones_causa
  add column if not exists referencia_texto text;

comment on column public.declaraciones_causa.referencia_texto is
  'Copia legible de la referencia (SKU + nombre, o "OC #N — Proveedor") tomada al momento de declarar, para que el historial no dependa de que el artículo/orden original siga igual. Agregada 22/8/2026 -- la tabla en sí ya existía sin esta columna, ver comentario arriba.';
