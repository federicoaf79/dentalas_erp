-- ============================================================
-- 20261109120000_composicion_fraccionados_ivana.sql — 9/11/2026
-- ============================================================
-- Carga en composicion_articulos los factores de conversión de los
-- fraccionados ("-F") que completó Ivana en la planilla
-- "Fraccionados_para_completar_Ivana_26-10-2026" (devuelta el 9/11).
--   - 130 confirmados con "sí" sobre la sugerencia del sistema.
--   - 14 completados por ella (blisters, láminas, gramos, hilos, sobres).
--   cantidad = 1 / (fraccionados por caja): cuánto de la caja cerrada
--   consume cada unidad fraccionada (mismo criterio que las filas del 10/8).
--
-- Efecto (radio de explosión):
--   - maximos_calculados(): el máximo de la caja cerrada pasa a sumar lo
--     vendido en fraccionado.
--   - sugerencias_compra() y el Predictor ya usan composicion_articulos
--     desde el 10/8: la CANTIDAD SUGERIDA de esas cajas en Nueva OC también
--     sube, y el "-F" deja de tener promedio propio (no se compra, se fracciona).
--
-- Solo se inserta si el código de caja cerrada existe en material_yiqi y
-- si el par no estaba cargado (idempotente).
--
-- NO se cargan (Ivana: no son fraccionados, el "-F" es otra cosa o no
-- tienen caja cerrada):
--   6530-F: Desestimalo. No se piden y únicamente utilizamos el código 6530-F
--   66696-F: va con -F en este caso para indicar "Flameador"
--   21934-F: no tiene caja cerrada. Directamente se venden sueltos
--   21931-F: no tiene caja cerrada. Directamente se venden sueltos
--   5942-F: En este caso, el "-F" indica el color y no fraccionamiento
--   21937-F: no tiene caja cerrada. Directamente se venden sueltos
--   5946-F1: desestimalo. Los modelos se llaman F1, F2 y F3
--   5946-F2: desestimalo. Los modelos se llaman F1, F2 y F3
--   5946-F3: desestimalo. Los modelos se llaman F1, F2 y F3
--   623-F: "-F" en este caso es de "Fino" y no de fraccionado
--   6610-F: Es el -F de "frutilla". Desestimalo
--   33296-F3: desestimalo. Los modelos se llaman F1, F2 y F3
--   33296-F1: desestimalo. Los modelos se llaman F1, F2 y F3
--   33281-F1: desestimalo. Los modelos se llaman F1, F2 y F3
-- Quedan en pregunta (respuesta ambigua):
--   9150-F: Son surtidas y los códigos son "9150-" y con el N°
--   31822-F: se compran los que son 33066-500 y, si los quieren fraccionados, primero se fraccionan en 33066-100. Si el cliente quiere  individualmente, se usa el -F y seria
-- ============================================================

begin;

with v(codigo_padre, codigo_componente, por_caja, nota) as (values
  ('750-F', '750', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('32791-F', '32791', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('66679-F', '66679', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('32806-F', '32806', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('32798-F', '32798', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('6068-F', '6068', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('66678-F', '66678', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('6122-F', '6122', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('794-F', '794', 1000, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 1000, el fraccionado se vende de a 1'),
  ('32792-F', '32792', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('32784-F', '32784', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('6123-F', '6123', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('6067-F', '6067-50', 50, 'Caja 6067-50, la más usada (Ivana): 50 pares [confirmar]'),
  ('1072-F', '1072', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('32797-F', '32797', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('5998-F', '5998', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('6121-F', '6121', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('33058-F', '33058', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('32790-F', '32790', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('33234-F', '33234', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('6000-F', '6000', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('61322-F', '61322', 24, 'Cajas de entre 23 y 25 láminas (Ivana): se usa 24'),
  ('4960-F', '4960', 120, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 120, el fraccionado se vende de a 1'),
  ('33085-F', '33085', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('33084-F', '33084', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('61315-F', '61315', 45, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 45, el fraccionado se vende de a 1'),
  ('32794-F', '32794', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('760-F', '760', 150, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 150, el fraccionado se vende de a 1'),
  ('1190-F', '1190', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('6027-F', '6027', 36, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 36, el fraccionado se vende de a 1'),
  ('33105-F', '33105', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('33056-F', '33056', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('33057-F', '33057', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('5999-F', '5999', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('32809-F', '32809', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('6505-F', '6505', 5, '5 blisters de 10 u por caja (Ivana)'),
  ('6003-F', '6003', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('33070-F', '33070', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('33088-F', '33088', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('32799-F', '32799', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('33086-F', '33086', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('770-F', '770', 12, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 12, el fraccionado se vende de a 1'),
  ('31820-F', '31820', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('33061-F', '33061', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('587-F', '587', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('33110-F', '33110', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('33111-F', '33111', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('1195-F', '1195', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('52-F', '52', 4, '4 blisters de 10 u por caja (Ivana)'),
  ('758-F', '758', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('5997-F', '5997', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('34945-F', '34945', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja 1000g ÷ fraccionado 100g'),
  ('6502-F', '6502', 5, '5 blisters de 10 u por caja (Ivana)'),
  ('6001-F', '6001', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('1193-F', '1193', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('6569-F', '6569', 4, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 4, el fraccionado se vende de a 1'),
  ('748-F', '748', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('31029-F', '31029', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja 100m ÷ fraccionado 10m'),
  ('286-F', '286', 8, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 8, el fraccionado se vende de a 1'),
  ('33230-F', '33230', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('32785-F', '32785', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('34258-F', '34258', 32, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 32, el fraccionado se vende de a 1'),
  ('749-F', '749', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('33109-F', '33109', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('34925-F', '34925', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja 1000g ÷ fraccionado 100g'),
  ('33236-F', '33236', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('34257-F', '34257', 32, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 32, el fraccionado se vende de a 1'),
  ('1192-F', '1192', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('31028-F', '31028', 12.5, 'Confirmado por Ivana (planilla 9/11/2026): Caja 125m ÷ fraccionado 10m'),
  ('1078-F', '1078', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100 ÷ fraccionado x 10'),
  ('33068-F', '33068', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('28900-F', '28900', 12, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 12, el fraccionado se vende de a 1'),
  ('586-F', '586', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('6004-F', '6004', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('6002-F', '6002', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('34920-F', '34920', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja 1000g ÷ fraccionado 100g'),
  ('34917-F', '34917', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja 1000g ÷ fraccionado 100g'),
  ('31337-F', '31337', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 1000 ÷ fraccionado x 100'),
  ('571-F', '571', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('31027-F', '31027', 16, 'Confirmado por Ivana (planilla 9/11/2026): Caja 160m ÷ fraccionado 10m'),
  ('33080-F', '33080', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('31026-F', '31026', 20, 'Confirmado por Ivana (planilla 9/11/2026): Caja 200m ÷ fraccionado 10m'),
  ('6124-F', '6124', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('31030-F', '31030', 8, 'Confirmado por Ivana (planilla 9/11/2026): Caja 80m ÷ fraccionado 10m'),
  ('28899-F', '28899', 12, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 12, el fraccionado se vende de a 1'),
  ('242-F', '242', 12, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 12, el fraccionado se vende de a 1'),
  ('31336-F', '31336', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 1000 ÷ fraccionado x 100'),
  ('6507-F', '6507', 5, '5 blisters de 10 u por caja (Ivana)'),
  ('6503-F', '6503', 5, '5 blisters de 10 u por caja (Ivana)'),
  ('31828-F', '31828', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('33071-F', '33071', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('34580-F', '34580', 50, 'El avío trae 50 sobres de 100 g (Ivana)'),
  ('33220-F', '33220', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('32796-F', '32796', 12, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 12, el fraccionado se vende de a 1'),
  ('68102-F', '68102', 12, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 12, el fraccionado se vende de a 1'),
  ('33235-F', '33235', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('21007-F', '21007', 2, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 2, el fraccionado se vende de a 1'),
  ('34016-F', '34016', 18, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 18, el fraccionado se vende de a 1'),
  ('31032-F', '31032', 5.5, 'Confirmado por Ivana (planilla 9/11/2026): Caja 55m ÷ fraccionado 10m'),
  ('33069-F', '33069', 25, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 25, el fraccionado se vende de a 1'),
  ('33067-F', '33067', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('61334-F', '61334', 15, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 15, el fraccionado se vende de a 1'),
  ('33232-F', '33232', 50, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 50, el fraccionado se vende de a 1'),
  ('28898-F', '28898', 12, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 12, el fraccionado se vende de a 1'),
  ('34017-F', '34017', 20, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 20, el fraccionado se vende de a 1'),
  ('61332-F', '61332', 15, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 15, el fraccionado se vende de a 1'),
  ('32786-F', '32786', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('61329-F', '61329', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('34924-F', '34924', 5, '5 g = 5 u de 1 g (Ivana)'),
  ('6562-F', '6562', 12, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 12, el fraccionado se vende de a 1'),
  ('33078-F', '33078', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('61326-F', '61326', 30, '30 hilos (Ivana)'),
  ('34912-F', '34912', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja 1000g ÷ fraccionado 100g'),
  ('34921-F', '34921', 5, '5 g = 5 u de 1 g (Ivana)'),
  ('34904-F', '34904', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja 1000g ÷ fraccionado 100g'),
  ('34916-F', '34916', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja 1000g ÷ fraccionado 100g'),
  ('21267-F', '21267', 2, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 2, el fraccionado se vende de a 1'),
  ('61331-F', '61331', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('61302-F', '61302', 8, 'Confirmado por Ivana (planilla 9/11/2026): Caja 80g ÷ fraccionado 10g'),
  ('33066-F', '33066', 12, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 12, el fraccionado se vende de a 1'),
  ('61333-F', '61333', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('33073-F', '33073', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('61328-F', '61328', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('61330-F', '61330', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('33081-F', '33081', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('33072-F', '33072', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('6537-F', '6537', 3, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 3, el fraccionado se vende de a 1'),
  ('61313-F', '61313', 25, 'La caja trae 25 láminas (Ivana)'),
  ('34915-F', '34915', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja 1000g ÷ fraccionado 100g'),
  ('34906-F', '34906', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja 1000g ÷ fraccionado 100g'),
  ('6028-F', '6028', 36, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 36, el fraccionado se vende de a 1'),
  ('32783-F', '32783', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('61327-F', '61327', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('61335-F', '61335', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 10, el fraccionado se vende de a 1'),
  ('1142-F', '1142', 3, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 3, el fraccionado se vende de a 1'),
  ('31603-F', '31603', 2, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 2, el fraccionado se vende de a 1'),
  ('61325-F', '61325', 30, '30 hilos (Ivana)'),
  ('33083-F', '33083', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('34901-F', '34901', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja 1000g ÷ fraccionado 100g'),
  ('34907-F', '34907', 10, 'Confirmado por Ivana (planilla 9/11/2026): Caja 1000g ÷ fraccionado 100g'),
  ('33074-F', '33074', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('6506-F', '6506', 5, '5 blisters de 10 u por caja (Ivana)'),
  ('583-F', '583', 100, 'Confirmado por Ivana (planilla 9/11/2026): Caja x 100, el fraccionado se vende de a 1'),
  ('34249-F', '34249', 6, 'Confirmado por Ivana (planilla 9/11/2026): Caja 300g ÷ fraccionado 50g')
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
  'filas_composicion', (select count(*) from public.composicion_articulos),
  'cargadas_9_11', (select count(*) from public.composicion_articulos where nota like '%Ivana%'),
  'ejemplo_750', public.maximos_calculados() -> '750',
  'ejemplo_32791', public.maximos_calculados() -> '32791',
  'ejemplo_66679', public.maximos_calculados() -> '66679',
  'ejemplo_6505', public.maximos_calculados() -> '6505'
) as verificacion;
