-- ============================================================
-- 20260826150000_catalogo_causas_ivana.sql
-- Dentalab-Compras — Catálogo de causas: 2 pedidos de Ivana
-- (respondidos en el Word de pendientes del 24/8/2026, ítem #13).
--
-- Ya fue corrida a mano en el SQL Editor de Supabase el 26/8/2026 y
-- verificada en vivo (Federico pegó el SELECT final: los 4 registros
-- quedaron como se esperaba, nada se borró). Este archivo la
-- versiona en el repo — no había quedado ningún .sql para ella,
-- rompiendo la regla del README de esta carpeta ("ningún cambio de
-- esquema sin su archivo acá").
--
-- [27/8/2026] Corregido un bug de idempotencia real, encontrado al
-- volver a correr el archivo original como verificación: los 3
-- INSERT usaban "SELECT MAX(...) ... FROM catalogo_causas WHERE NOT
-- EXISTS (...)". Al ser una consulta agregada sin GROUP BY, cuando
-- el WHERE NOT EXISTS filtraba todas las filas (causa ya creada),
-- la consulta igual devolvía 1 fila (agregados en NULL -> COALESCE
-- a 0), generando "causa_01" y chocando con la unique constraint
-- (23505, ya existía). No afectó los datos ya aplicados el 26/8 —
-- era el primer statement del batch, sin nada confirmado antes de
-- fallar. Fix: se saca el "FROM catalogo_causas" del nivel de la
-- consulta y el cálculo del próximo código pasa a ser una subquery
-- escalar aparte, con el "WHERE NOT EXISTS" filtrando sobre una
-- consulta sin FROM (fila única sí/no, sin agregado de por medio) —
-- así una segunda corrida no inserta nada, en vez de insertar mal.
--
-- Qué hace:
--   1) Agrega causa "Mercadería reservada (licitación o vendedor)"
--      (ámbito 'entrega') — Ivana la describe como algo que se
--      declara cuando LLEGA la mercadería, no al comprarla.
--   2) Desactiva (no borra) la causa combinada vieja "Faltante o
--      error de entrega" y la separa en dos:
--        2a) causa "Faltante de mercadería"
--        2b) causa "Error de entrega"
--      Ambas ámbito 'entrega', activas. La vieja queda con
--      activa=false y una nota de reemplazo en la descripción, para
--      no perder el historial de declaraciones que ya la usaron.
-- ============================================================

-- 1) Nueva causa: mercadería reservada (licitación o vendedor puntual).
insert into catalogo_causas (codigo, ambito, rotulo, descripcion, orden, activa)
select
  'causa_' || lpad(((select coalesce(max(split_part(codigo, '_', 2)::int), 0) from catalogo_causas) + 1)::text, 2, '0'),
  'entrega',
  'Mercadería reservada (licitación o vendedor)',
  'La mercadería que llegó está apartada para una licitación o para un vendedor puntual (ej. Edu, Mary, Juan/Fede) — anotar el detalle en la nota al declarar.',
  (select coalesce(max(orden), 0) + 10 from catalogo_causas where ambito = 'entrega'),
  true
where not exists (
  select 1 from catalogo_causas
  where ambito = 'entrega' and rotulo = 'Mercadería reservada (licitación o vendedor)'
);

-- 2) Separar "Faltante o error de entrega" en dos causas.
--    Desactiva la vieja combinada (si existe con ese nombre exacto en
--    'entrega' o 'compra') -- no se borra, se desactiva, mismo
--    criterio que ya usa toda la pantalla. Naturalmente idempotente:
--    la segunda vez el WHERE activa=true ya no matchea nada.
update catalogo_causas
set activa = false,
    descripcion = coalesce(descripcion || ' ', '') || '[Reemplazada el 24/8/2026 por "Faltante de mercadería" y "Error de entrega", separadas a pedido de Ivana.]'
where activa = true
  and ambito in ('entrega', 'compra')
  and rotulo ilike '%falt%'
  and rotulo ilike '%entrega%';

-- 2a) Nueva causa: Faltante de mercadería
insert into catalogo_causas (codigo, ambito, rotulo, descripcion, orden, activa)
select
  'causa_' || lpad(((select coalesce(max(split_part(codigo, '_', 2)::int), 0) from catalogo_causas) + 1)::text, 2, '0'),
  'entrega',
  'Faltante de mercadería',
  'Llegó menos cantidad de la pedida, o directamente no llegó parte de lo pedido.',
  (select coalesce(max(orden), 0) + 10 from catalogo_causas where ambito = 'entrega'),
  true
where not exists (
  select 1 from catalogo_causas where ambito = 'entrega' and rotulo = 'Faltante de mercadería'
);

-- 2b) Nueva causa: Error de entrega
insert into catalogo_causas (codigo, ambito, rotulo, descripcion, orden, activa)
select
  'causa_' || lpad(((select coalesce(max(split_part(codigo, '_', 2)::int), 0) from catalogo_causas) + 1)::text, 2, '0'),
  'entrega',
  'Error de entrega',
  'Llegó lo que no era, mal etiquetado, artículo equivocado — la cantidad coincide pero el pedido está mal cumplido.',
  (select coalesce(max(orden), 0) + 20 from catalogo_causas where ambito = 'entrega'),
  true
where not exists (
  select 1 from catalogo_causas where ambito = 'entrega' and rotulo = 'Error de entrega'
);

-- ------------------------------------------------------------
-- Verificación: correr después de aplicar. Debería devolver las
-- filas de ámbito 'entrega'/'compra' con sentido — la causa vieja
-- combinada con activa=false y nota de reemplazo, más las 3 nuevas
-- (reservada, faltante, error) con activa=true. Correr este archivo
-- una segunda vez no debe cambiar nada ni tirar error.
-- ------------------------------------------------------------
select codigo, ambito, rotulo, descripcion, orden, activa
from catalogo_causas
where ambito in ('entrega', 'compra')
order by ambito, orden;
