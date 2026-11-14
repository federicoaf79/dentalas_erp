-- ============================================================
-- 20261114120000_composicion_31822.sql — 14/11/2026
-- ============================================================
-- Respuesta de Ivana (14/11, vía Federico) a la pregunta de 31822-F: en
-- la planilla había escrito 33066 por error; los códigos son 31822-100 y
-- 31822-500. Lo que explicó el 9/11: "se compran los -500; si los quieren
-- fraccionados, primero se fraccionan en -100; si el cliente quiere
-- individualmente, se usa el -F".
--
-- Como lo que se compra es la caja 31822-500, las ventas de las dos
-- presentaciones fraccionadas se suman a esa caja:
--   31822-F   → 1/500 de 31822-500
--   31822-100 → 1/5   de 31822-500
-- [confirmar] que la caja -500 trae 500 unidades y la -100, 100 (sale del código).
--
-- Se carga directo contra la -500 (no -F → -100 → -500) porque
-- maximos_calculados() y sugerencias_compra() aplican un solo nivel de
-- composición. Mismo patrón que 20261109120000: solo inserta si la caja
-- existe en material_yiqi y el par no estaba. Idempotente.
--
-- 9150-F (hojas de bisturí surtidas x unidad) NO se carga: Ivana confirmó
-- que sale de varias cajas (9150-10, -11, -12, -15, -15C, -20, -22, -23,
-- -24) y que tiene su propio ranking de ventas.
-- ============================================================

begin;

with v(codigo_padre, codigo_componente, por_caja, nota) as (values
  ('31822-F',   '31822-500', 500, 'Ivana (14/11/2026): se compra la -500; el -F se vende de a 1 [confirmar 500 u por caja]'),
  ('31822-100', '31822-500', 5,   'Ivana (14/11/2026): la -500 se fracciona en -100 [confirmar 5 por caja]')
),
ok as (
  select v.* from v
  where exists (select 1 from public.material_yiqi m where m.mate_codigo = v.codigo_componente)
    and not exists (select 1 from public.composicion_articulos c
                    where c.codigo_padre = v.codigo_padre and c.codigo_componente = v.codigo_componente)
)
insert into public.composicion_articulos (codigo_padre, codigo_componente, cantidad, tipo, nota)
select codigo_padre, codigo_componente, round(1.0 / por_caja, 7), 'fraccionado', nota
from ok;

commit;

-- Verificación (una fila)
select jsonb_build_object(
  'materiales', (select jsonb_agg(jsonb_build_object('codigo', mate_codigo, 'nombre', mate_nombre, 'unidades', mate_cantidad_de_unidades) order by mate_codigo)
                 from public.material_yiqi where mate_codigo in ('31822-F', '31822-100', '31822-500')),
  'composicion_31822', (select jsonb_agg(jsonb_build_object('padre', codigo_padre, 'caja', codigo_componente, 'cantidad', cantidad))
                        from public.composicion_articulos where codigo_componente = '31822-500'),
  'maximo_31822_500', public.maximos_calculados() -> '31822-500',
  'composicion_6067', (select jsonb_agg(jsonb_build_object('padre', c.codigo_padre, 'caja', c.codigo_componente, 'cantidad', c.cantidad))
                       from public.composicion_articulos c where c.codigo_padre = '6067-F'),
  'materiales_6067', (select jsonb_agg(jsonb_build_object('codigo', mate_codigo, 'nombre', mate_nombre) order by mate_codigo)
                      from public.material_yiqi where mate_codigo like '6067%')
) as verificacion;
