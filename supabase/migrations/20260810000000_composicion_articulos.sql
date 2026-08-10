-- ============================================================
-- composicion_articulos
-- ============================================================
-- Resuelve el gap documentado en el doc de continuidad ("LO QUE SIGUE"
-- #6, "Composición de combos y conversión de fraccionados"): el
-- consumo se registra sobre el código que aparece en la venta (un
-- artículo fraccionado tipo "245-F", o una publicación de Mercado
-- Libre tipo "251"), pero lo que hay que comprar es otro código
-- distinto, en otra proporción. Sin esta tabla, el Predictor de
-- demanda y el cálculo de "cuánto comprar" en Nueva OC subestiman la
-- demanda real de los componentes.
--
-- Semántica: por cada 1 unidad de codigo_padre vendida, se consumen
-- `cantidad` unidades de codigo_componente. Sirve tanto para
-- fraccionados (cantidad < 1, ej. 245-F consume 1/20 de un 245) como
-- para combos (cantidad >= 1, ej. el combo 251 consume 2 unidades de
-- cada color).
--
-- cantidad NULL = sin proporción fija conocida. No debe participar
-- del cálculo automático; el artículo queda marcado como "sin dato".
--
-- Fuente de los datos cargados: respuestas de Aris por WhatsApp
-- (8-10/8/2026, ver PEDIDO_Aris_combos_y_presentaciones.docx) +
-- verificación en vivo contra material_yiqi el 10/8/2026 (todos los
-- códigos usados abajo existen en producción a esa fecha).
-- ============================================================

create table if not exists composicion_articulos (
  id bigint generated always as identity primary key,
  codigo_padre text not null,
  codigo_componente text not null,
  cantidad numeric,
  tipo text not null check (tipo in ('fraccionado', 'combo')),
  nota text,
  creado_en timestamptz not null default now()
);

create index if not exists idx_composicion_padre on composicion_articulos (codigo_padre);

comment on table composicion_articulos is
  'Mapea artículos que se venden bajo un código (fraccionado o combo de ML) a los códigos que realmente hay que comprar, con la proporción de consumo. Usado por el Predictor y por el cálculo de "cuánto comprar" de Nueva OC.';

-- ============================================================
-- FRACCIONADOS (Lista 1 — respuesta de Aris, 8/8/2026)
-- ============================================================
insert into composicion_articulos (codigo_padre, codigo_componente, cantidad, tipo, nota) values
  ('244-F',  '244',  null,      'fraccionado', 'Se fracciona según necesidad — sin proporción fija, no participa del cálculo automático'),
  ('6528-F', '6528', 0.5,       'fraccionado', 'Se compra de a 2, se vende por unidad'),
  ('6529-F', '6529', 0.5,       'fraccionado', 'Se compra de a 2, se vende por unidad'),
  ('6538-F', '6538', 0.5,       'fraccionado', 'Se compra de a 2, se vende por unidad'),
  ('245-F',  '245',  0.05,      'fraccionado', 'Se compra de a 20, se vende por unidad'),
  ('246-F',  '246',  0.0833333, 'fraccionado', 'Se compra el 246 en pack x12, se vende por unidad'),
  ('792-F',  '792',  0.002,     'fraccionado', 'Se compra caja cerrada x500, se vende fraccionado')
on conflict do nothing;

-- Nota: 30000 (Dientes Acritone) y 33700 (Dientes NewcryL) quedan
-- EXCLUIDOS a pedido explícito de Aris ("no les des bola") pese a ser
-- el 93% del movimiento de ML — decisión de negocio, no un olvido.
-- 65401 y 33094 no llevan fila: se venden tal cual se compran (1:1).

-- ============================================================
-- COMBOS confirmados (Lista 2 — WhatsApp Aris + verificación en vivo, 10/8/2026)
-- ============================================================

-- Cajas Ortodoncia Evo Den x14 (publicación ML "251") = 2 u. de cada uno de los 7 colores
insert into composicion_articulos (codigo_padre, codigo_componente, cantidad, tipo, nota) values
  ('251', '251-BLA', 2, 'combo', 'Blanco'),
  ('251', '251-CEL', 2, 'combo', 'Celeste'),
  ('251', '251-LIL', 2, 'combo', 'Lila'),
  ('251', '251-NAR', 2, 'combo', 'Naranja'),
  ('251', '251-NEG', 2, 'combo', 'Negro'),
  ('251', '251-ROS', 2, 'combo', 'Rosa — sin stock al 10/8/2026'),
  ('251', '251-VEA', 2, 'combo', 'Verde Agua')
on conflict do nothing;

-- Kits de silicona Densell. Aris dio los códigos de los componentes
-- pero no las cantidades — se asume 1 unidad de cada uno. CONFIRMAR.
insert into composicion_articulos (codigo_padre, codigo_componente, cantidad, tipo, nota) values
  ('1081',  '1082',  1, 'combo', 'Kit Densell C+ — activador. Cantidad ASUMIDA, no confirmada por Aris'),
  ('1081',  '1084',  1, 'combo', 'Kit Densell C+ — light. Cantidad ASUMIDA, no confirmada por Aris'),
  ('1081',  '1086',  1, 'combo', 'Kit Densell C+ — masa x1kg. Cantidad ASUMIDA, no confirmada por Aris'),
  ('32744', '32745', 1, 'combo', 'Kit Densell laboratorio — labor. Cantidad ASUMIDA, no confirmada por Aris'),
  ('32744', '1082',  1, 'combo', 'Kit Densell laboratorio — activador. Cantidad ASUMIDA, no confirmada por Aris')
on conflict do nothing;

-- Muflas con brida para estudiante
insert into composicion_articulos (codigo_padre, codigo_componente, cantidad, tipo, nota) values
  ('65401-KIT',  '65401',   1, 'combo', 'Mufla de bronce grande'),
  ('65401-KIT',  '60649-1', 1, 'combo', 'Brida de hierro cuadrada (estudiante)'),
  ('65401-MKIT', '65401-M', 1, 'combo', 'Mufla de bronce mediana'),
  ('65401-MKIT', '60649-1', 1, 'combo', 'Brida de hierro cuadrada (estudiante)')
on conflict do nothing;

-- Tubo nylon vacío x10, dos medidas
insert into composicion_articulos (codigo_padre, codigo_componente, cantidad, tipo, nota) values
  ('43800-Fx10', '43800-FIN', 10, 'combo', 'Diám. 22 x 12,5cm — stock bajo (3) al 10/8/2026'),
  ('43800-Gx10', '43800-GRU', 10, 'combo', 'Diám. 25 x 9cm')
on conflict do nothing;

-- Blanqueamientos Opalescence x4 y x2, con cubeta.
-- OJO: la cubeta real es "la que tenga stock" (574 o 575), según Aris
-- — no es una regla fija. Se carga 574 porque tiene 809 en stock al
-- 10/8/2026 (575 tiene 0), pero esto puede quedar desactualizado.
-- PENDIENTE DECIDIR: ¿el cálculo consulta stock en vivo, o se revisa
-- esta tabla a mano cuando cambie la disponibilidad?
insert into composicion_articulos (codigo_padre, codigo_componente, cantidad, tipo, nota) values
  ('6552',   '6528-F', 4, 'combo', 'Opalescence 10% x4'),
  ('6552',   '574',    2, 'combo', 'Cubeta — asumida 574 por stock actual, revisar si cambia'),
  ('6553',   '6529-F', 4, 'combo', 'Opalescence 15% x4'),
  ('6553',   '574',    2, 'combo', 'Cubeta — asumida 574 por stock actual, revisar si cambia'),
  ('6554',   '6530-F', 4, 'combo', 'Opalescence 20% x4'),
  ('6554',   '574',    2, 'combo', 'Cubeta — asumida 574 por stock actual, revisar si cambia'),
  ('6557',   '6538-F', 4, 'combo', 'Opalescence 35% x4'),
  ('6557',   '574',    2, 'combo', 'Cubeta — asumida 574 por stock actual, revisar si cambia'),
  ('6552-2', '6528-F', 2, 'combo', 'Opalescence 10% x2'),
  ('6552-2', '574',    1, 'combo', 'Cubeta — asumida 574 por stock actual, revisar si cambia'),
  ('6553-2', '6529-F', 2, 'combo', 'Opalescence 15% x2'),
  ('6553-2', '574',    1, 'combo', 'Cubeta — asumida 574 por stock actual, revisar si cambia'),
  ('6554-2', '6530-F', 2, 'combo', 'Opalescence 20% x2'),
  ('6554-2', '574',    1, 'combo', 'Cubeta — asumida 574 por stock actual, revisar si cambia'),
  ('6557-2', '6538-F', 2, 'combo', 'Opalescence 35% x2'),
  ('6557-2', '574',    1, 'combo', 'Cubeta — asumida 574 por stock actual, revisar si cambia')
on conflict do nothing;

-- ============================================================
-- TODAVÍA PENDIENTE — no cargar hasta tener respuesta de Aris:
--   - Kit Speedex (publicación "21087"): masa 362g + light 60ml +
--     activador 40ml — sin códigos, pregunta reenviada por WhatsApp.
--   - BM4 Power Bleaching (6527-2, 6539-2) y Abreboca (40-2, 41-2):
--     Aris contestó "no lo trabajamos más" a los dos juntos, falta
--     saber cuál de los dos se descontinuó.
--   - 30000-10 (publicación ML de Dientes Acritone): excluido junto
--     con el resto de Acritone/NewcryL, no cargar.
-- ============================================================
