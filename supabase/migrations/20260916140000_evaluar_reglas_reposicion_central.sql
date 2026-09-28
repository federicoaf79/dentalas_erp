-- ============================================================
-- 20260916140000_evaluar_reglas_reposicion_central.sql
-- Dentalab-Compras — Sprint punto 3: job periódico de re-chequeo
-- ============================================================
--
-- Contexto (Federico, 16/9/2026): "arrancá el punto 3 vos solo" —
-- construir el job periódico que evalúa reglas_reposicion_central()
-- y dispara crear_solicitud_reposicion() para el circuito principal
-- (Central=157 → Local=155), sin esperar a que Aris defina los
-- parámetros exactos (pedido desde el 7/9/2026, sin respuesta el
-- 10/9/2026 — ver DISENO_TECNICO_Reposicion_CentralLocal_7-9-2026.md
-- §11 punto 3 y DISENO_TECNICO_Unificacion_Eje1_10-9-2026.md §4
-- punto 4). Se usa un default razonable y editable después por
-- Aris/Federico desde la propia tabla — no bloquea el resto del
-- circuito, que ya funciona de punta a punta (§16.3 del diseño).
--
-- Qué hace:
-- 1) Carga una regla activa por defecto en reglas_reposicion_central
--    (la tabla existe desde el 7/9/2026 pero seguía vacía).
--    Default elegido (editable después, sin volver a migrar):
--      frecuencia_minutos = 240 (re-evalúa cada 4hs, hasta 6
--        solicitudes/día si el déficit persiste -- no satura a
--        Depósito Central, que también atiende venta/despacho)
--      umbral_deficit = 0 (dispara con cualquier déficit real,
--        mismo criterio "Crítica" que ya usan Alertas/Monitor de
--        stock -- no se inventa un umbral nuevo sin input de Aris)
--      excluir_sin_stock = true (default de la propia tabla,
--        7/9/2026 -- no vuelve a pedir SKU ya declarados "no hay")
-- 2) Crea evaluar_reglas_reposicion_central(): por cada regla activa,
--    respeta su frecuencia_minutos (mirando la última solicitud
--    automática creada para esa regla), no duplica si ya hay una
--    solicitud sin resolver (solicitada/en_preparacion) para el par
--    Central→Local, y solo dispara crear_solicitud_reposicion() si
--    hay déficit real: mismo criterio "Crítica" que ya usan
--    Alertas/Monitor de stock (stock_yiqi.stock_local <= punto de
--    pedido manual o Stock Seguridad de material_yiqi — confirmado
--    en vivo en DISENO_TECNICO_Reposicion_CentralLocal_7-9-2026.md
--    §16.2/§17.1), sobre SKU no excluidos en punto_equilibrio_local
--    y (si excluir_sin_stock=true) sin una alerta ya suspendida sin
--    reactivar.
-- 3) Registra un cron job nuevo, evaluar-reglas-reposicion-central,
--    cada 15 minutos — la función internamente decide si es momento
--    de generar una solicitud real, según frecuencia_minutos. Como
--    es una función SQL pura (no llama a la API de YiQi), no
--    necesita pg_net/Vault como los jobs de sync — solo
--    "select evaluar_reglas_reposicion_central();" directo.
--
-- Nota importante: esta función solo decide SI conviene avisarle a
-- Depósito Central (crear la "solicitada"). El cálculo real de qué
-- SKU y cuánto va en el remito lo sigue haciendo
-- generar_remito_reposicion_central() recién cuando alguien hace
-- clic en "Generar remito" (mismo comportamiento que ya tenía el
-- circuito para las solicitudes manuales) -- si el déficit se
-- resolvió solo entre que se creó la solicitud y se generó el
-- remito, el remito puede salir con menos líneas o vacío, sin
-- ningún efecto colateral.
--
-- El envío de mail (Resend) sigue bloqueado por el dominio -- ver
-- ESPERA A OTRA PERSONA en el diseño -- así que por ahora esto solo
-- hace que la solicitud ya esté esperando en el portal de Depósito
-- Central cuando entren, en vez de necesitar que alguien la cree a
-- mano por SQL como se hizo en las pruebas del 8/9.
--
-- OJO — columnas usadas, con su fuente documentada (no se pudo
-- verificar en vivo desde acá, solo contra lo ya confirmado antes
-- en el Project "Módulo Compras Dentalab"):
--   stock_yiqi.stock_local        — citado textual en §16.2 del
--                                    diseño técnico
--   material_yiqi.mate_punto_de_pedido / mate_stock_seguridad
--                                  — citados en calcularAlerta(),
--                                    Alertas.jsx/MonitorStock.jsx (§17.1)
--   material_yiqi.mate_codigo     — código estándar del catálogo,
--                                    usado en todo el resto del sistema
--   punto_equilibrio_local.sku / .excluido — schema real, §16.1
--   alertas_suspendidas.sku / .reactivada_en — schema real, §3.5
--   solicitudes_reposicion.*      — schema real, §3.1
--   crear_solicitud_reposicion(p_origen, p_destino, p_generada_por,
--     p_regla_id) — firma real, confirmada en uso en §16.3 punto 1
--
-- Si algo de esto no matchea 1:1 (ej. el nombre exacto de la columna
-- de código en stock_yiqi), la migración va a fallar con un error de
-- columna inexistente ANTES de tocar ningún dato -- no hay riesgo de
-- corromper nada, solo pegar el error de vuelta para ajustarlo.
-- ============================================================

-- 1) Regla por defecto (tabla vacía desde que se creó el 7/9/2026)
insert into public.reglas_reposicion_central
  (activa, frecuencia_minutos, umbral_deficit, excluir_sin_stock)
select true, 240, 0, true
where not exists (select 1 from public.reglas_reposicion_central);

-- 2) Función de evaluación periódica
create or replace function public.evaluar_reglas_reposicion_central()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_ultima timestamptz;
  v_ya_pendiente boolean;
  v_hay_deficit boolean;
begin
  for r in select * from reglas_reposicion_central where activa = true loop

    -- Respeta la frecuencia configurada: no re-evalúa antes de tiempo,
    -- mirando la última solicitud automática que generó esta regla.
    select max(creada_en) into v_ultima
    from solicitudes_reposicion
    where regla_id = r.id and generada_por = 'regla_automatica';

    if v_ultima is not null
       and v_ultima > now() - (r.frecuencia_minutos || ' minutes')::interval then
      continue;
    end if;

    -- No duplica si ya hay una solicitud sin resolver para el circuito
    -- principal (Central=157 → Local=155).
    select exists (
      select 1 from solicitudes_reposicion
      where deposito_origen_id = 157
        and deposito_destino_id = 155
        and estado in ('solicitada', 'en_preparacion')
    ) into v_ya_pendiente;

    if v_ya_pendiente then
      continue;
    end if;

    -- ¿Hay déficit real? Mismo criterio "Crítica" que ya usan
    -- Alertas/Monitor de stock, sobre SKU no excluidos por rotación
    -- (punto_equilibrio_local.excluido) y, si la regla lo pide, sin
    -- una alerta ya suspendida en este mismo circuito sin reactivar.
    select exists (
      select 1
      from material_yiqi m
      join stock_yiqi s on s.mate_codigo = m.mate_codigo
      left join punto_equilibrio_local pe on pe.sku = m.mate_codigo
      where coalesce(pe.excluido, false) = false
        and s.stock_local <= coalesce(
              nullif(m.mate_punto_de_pedido, 0),
              m.mate_stock_seguridad
            )
        and (
          r.excluir_sin_stock = false
          or m.mate_codigo not in (
            select sku from alertas_suspendidas where reactivada_en is null
          )
        )
    ) into v_hay_deficit;

    if v_hay_deficit then
      perform crear_solicitud_reposicion(157, 155, 'regla_automatica', r.id);
    end if;

  end loop;
end;
$function$;

comment on function public.evaluar_reglas_reposicion_central() is
  'Job periódico (Sprint punto 3, 16/9/2026): evalúa reglas_reposicion_central activas y crea una solicitud automática (crear_solicitud_reposicion) para el circuito Central→Local cuando hay déficit real y no hay ya una solicitud sin resolver. Respeta frecuencia_minutos por regla.';

-- 3) Cron cada 15 minutos — la función decide internamente cuándo
--    actuar de verdad, según frecuencia_minutos de cada regla.
select cron.schedule(
  'evaluar-reglas-reposicion-central',
  '*/15 * * * *',
  $$select public.evaluar_reglas_reposicion_central();$$
);
