-- ============================================================
-- 20261023160000_interruptor_escritura_yiqi.sql — 23/10/2026
-- ============================================================
-- Federico, 23/10/2026: "No autorizamos a pasar a Live la herramienta de
-- momento". Interruptor general de escritura a YiQi, APAGADO.
--
-- Lo leen:
--   - Edge Functions enviar-oc-yiqi, editar-oc-yiqi,
--     mover-stock-reposicion, mover-stock-yiqi y los modos que escriben
--     de yiqi-borrar-oc (functions/_shared/escrituraYiqi.ts). Si no es
--     exactamente true, responden {ok:false, modo_prueba:true} sin tocar
--     la base ni llamar a YiQi. Fail-closed: si esta columna no existe,
--     también quedan en modo prueba.
--   - El frontend (hooks/useModoPruebaYiqi.js) para mostrar el aviso
--     "Modo prueba" y no pintar en rojo las órdenes aprobadas sin YiQi.
--
-- Para habilitar la escritura (cuando Federico autorice Live):
--   update public.reglas_compra set escritura_yiqi_habilitada = true where id = 1;
-- ============================================================

alter table public.reglas_compra
  add column if not exists escritura_yiqi_habilitada boolean not null default false;

comment on column public.reglas_compra.escritura_yiqi_habilitada is
  'Interruptor general de escritura a YiQi (OC, mercadería agregada, movimientos de stock). false = modo prueba: la app no escribe nada en YiQi. Creado 23/10/2026 (no autorizado Live).';
