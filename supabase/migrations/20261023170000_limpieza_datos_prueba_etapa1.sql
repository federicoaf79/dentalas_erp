-- ============================================================
-- 20261023170000_limpieza_datos_prueba_etapa1.sql — 23/10/2026
-- ============================================================
-- Limpieza de datos de prueba, ETAPA 1: solo acciones reversibles.
-- No borra ninguna fila. Contexto: la herramienta no está autorizada
-- para Live (Federico, 23/10) y está en modo prueba (20261023160000).
-- Inventario de solo lectura corrido por Federico el 23/10 (ver
-- claude/LIMPIEZA_datos_prueba_23-10-2026.md en el proyecto).
--
-- 1) Pausa el cron evaluar-reglas-reposicion-central (jobid 15, cada
--    15 min). Si no, al anular los pedidos automáticos vuelve a crear
--    uno nuevo (su gate solo mira si hay uno 'solicitada' o
--    'en_preparacion' para Central→Local). Reversible:
--    select cron.alter_job(jobid, active := true) from cron.job where jobname = 'evaluar-reglas-reposicion-central';
-- 2) Anula los 8 pedidos automáticos del 30/9 que quedaron
--    'en_preparacion' con 422 líneas "declaradas" que ninguna cuenta de
--    depósito (las dos son demo) va a confirmar. No movieron stock en
--    YiQi (movidas_en_yiqi = 0). El trigger de cierre (20260930140000)
--    solo actúa al pasar a 'en_preparacion', así que no interfiere.
--    Las líneas quedan como están (historial).
-- 3) Manda a la papelera (archivada_en) la #2 (BUDA PABLO, aprobada el
--    31/7, nunca llegó a YiQi por falta de costos) y la #12 (PREMIUM
--    DENTAL, Ivana pidió "borrar" el 23/10). Se pueden restaurar desde
--    la Papelera de la app.
-- ============================================================

select cron.alter_job(jobid, active := false)
from cron.job
where jobname = 'evaluar-reglas-reposicion-central';

update public.solicitudes_reposicion
set estado = 'anulada',
    cerrada_en = now()
where generada_por = 'regla_automatica'
  and estado = 'en_preparacion'
  and creada_en::date = date '2026-09-30';

update public.ordenes_propias
set archivada_en = now(),
    archivada_por = (select id from auth.users where email = 'federico@tulkasmedia.com')
where id in (2, 12)
  and archivada_en is null;
