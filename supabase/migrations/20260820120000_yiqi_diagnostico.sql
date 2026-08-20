-- ============================================================
-- 20260820120000_yiqi_diagnostico.sql
-- Diagnóstico persistente de la renovación del token de YiQi
-- ============================================================
-- Contexto (20/8/2026): el sync se cortó por 3ra vez en una semana
-- (14/8, 18/8, 19-20/8) por el mismo tipo de error -- el refresh_token
-- de YiQi queda invalidado (401 invalid_grant) y nadie se entera hasta
-- que alguien entra por casualidad a "Conector YiQi". Hoy cada intento
-- de renovación (éxito o fracaso) solo queda en los logs efímeros de
-- la Edge Function -- nadie los mira proactivamente.
--
-- Esta migración:
--   1. Rescata la columna refresh_lock_hasta: se agregó en producción
--      el 18/8/2026 (migration 20260818210000_yiqi_refresh_lock.sql,
--      documentada en el continuity doc) pero ese archivo nunca quedó
--      en el repo -- si algún día hay que reconstruir la base desde
--      las migraciones, ese fix desaparecía sin que nadie lo note.
--      IF NOT EXISTS la hace segura de correr aunque la columna ya
--      exista en producción.
--   2. Crea yiqi_token_eventos: un registro persistente de cada
--      intento de renovación, para poder diagnosticar la PRÓXIMA vez
--      con evidencia real en vez de reconstruir la historia a mano
--      leyendo continuity docs.
--   3. Crea yiqi_estado_actual(): función liviana que el frontend
--      puede consultar en cualquier pantalla para mostrar un aviso
--      apenas la conexión se corte -- sin llamar a la Edge Function
--      en vivo (que dispararía un intento de renovación real en cada
--      poll, sumando más superficies de colisión de las que ya hay).
-- ============================================================

-- 1. Rescate de la columna del lock (18/8/2026, sin migración en repo)
ALTER TABLE public.yiqi_config
  ADD COLUMN IF NOT EXISTS refresh_lock_hasta timestamptz;

COMMENT ON COLUMN public.yiqi_config.refresh_lock_hasta IS
  'Lock corto (30s) para que _shared/yiqiConfig.ts nunca dispare dos renovaciones de token en simultáneo -- YiQi solo acepta un refresh_token vivo por usuario. Agregado 18/8/2026, columna rescatada en el repo el 20/8/2026 (la migración original nunca se había guardado acá).';

-- 2. Registro persistente de cada intento de renovación
CREATE TABLE IF NOT EXISTS public.yiqi_token_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ocurrido_en timestamptz NOT NULL DEFAULT now(),
  resultado text NOT NULL CHECK (resultado IN ('renovado', 'fallo_recuperable', 'fallo_critico')),
  origen text,
  mensaje text,
  token_expiraba_en timestamptz,
  token_expira_en timestamptz
);

COMMENT ON TABLE public.yiqi_token_eventos IS
  'Historial de cada intento de renovación del token de YiQi (_shared/yiqiConfig.ts). resultado: renovado = éxito; fallo_recuperable = la renovación falló pero el token guardado todavía era válido, se siguió usando ese sin cortar nada; fallo_critico = la renovación falló y el token guardado ya había vencido -- esto es la caída visible en "Conector YiQi". origen identifica qué Edge Function/acción disparó el intento (sync-yiqi, yiqi-connector:estado, yiqi-connector:lectura, enviar-oc-yiqi), útil para saber si el patrón es "siempre el cron" o "cualquiera que abre una pantalla".';

CREATE INDEX IF NOT EXISTS yiqi_token_eventos_ocurrido_en_idx
  ON public.yiqi_token_eventos (ocurrido_en DESC);

ALTER TABLE public.yiqi_token_eventos ENABLE ROW LEVEL SECURITY;

-- GRANT a nivel tabla + policy que filtra: mismo patrón de 2 pasos que
-- el resto del proyecto (ver composicion_articulos_rls.sql) -- sin el
-- GRANT, Postgres deniega el acceso ANTES de llegar a evaluar la RLS,
-- así sea admin.
GRANT SELECT ON public.yiqi_token_eventos TO authenticated;

-- Solo admin puede leer el detalle crudo (mismo criterio que el resto
-- de las tablas de configuración interna del sistema). El estado
-- resumido para el resto de los usuarios sale de yiqi_estado_actual(),
-- que es SECURITY DEFINER y no expone esta tabla directamente.
DROP POLICY IF EXISTS yiqi_token_eventos_admin_select ON public.yiqi_token_eventos;
CREATE POLICY yiqi_token_eventos_admin_select
  ON public.yiqi_token_eventos
  FOR SELECT
  TO authenticated
  USING (es_admin());

-- Solo lo escribe el service_role desde las Edge Functions -- ningún
-- INSERT/UPDATE/DELETE para authenticated.

-- 3. Estado resumido, liviano, para mostrar en toda la app
CREATE OR REPLACE FUNCTION public.yiqi_estado_actual()
RETURNS TABLE (
  conectado boolean,
  token_expira_en timestamptz,
  ultimo_evento_tipo text,
  ultimo_evento_en timestamptz,
  ultimo_evento_mensaje text,
  fallos_recuperables_24h bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (c.token_expira_en IS NOT NULL AND c.token_expira_en > now()) AS conectado,
    c.token_expira_en,
    ultimo.resultado AS ultimo_evento_tipo,
    ultimo.ocurrido_en AS ultimo_evento_en,
    ultimo.mensaje AS ultimo_evento_mensaje,
    (
      SELECT count(*)
      FROM public.yiqi_token_eventos e
      WHERE e.resultado = 'fallo_recuperable'
        AND e.ocurrido_en > now() - interval '24 hours'
    ) AS fallos_recuperables_24h
  FROM public.yiqi_config c
  LEFT JOIN LATERAL (
    SELECT resultado, ocurrido_en, mensaje
    FROM public.yiqi_token_eventos
    ORDER BY ocurrido_en DESC
    LIMIT 1
  ) ultimo ON true
  ORDER BY c.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.yiqi_estado_actual() IS
  'Estado de la conexión con YiQi para mostrar en toda la app (banner en el sidebar), sin llamar en vivo a la Edge Function -- solo lee lo que ya quedó guardado. fallos_recuperables_24h > 0 es una señal de alerta temprana: la renovación viene fallando en silencio aunque el token viejo todavía alcance, y sin este aviso nadie se entera hasta que también se corte.';

GRANT EXECUTE ON FUNCTION public.yiqi_estado_actual() TO authenticated;
