-- ============================================================
-- Renovacion automatica del access_token de YiQi
-- ============================================================
-- Contexto completo en supabase/functions/_shared/yiqiConfig.ts.
-- Resumen: el access_token de YiQi vence cada ~24hs (expires_in),
-- no cada ~4 anios como se habia asumido desde julio (comentario
-- viejo en yiqi-connector/index.ts, nunca confirmado). Confirmado
-- en vivo el 17/8/2026 generando un token real contra la cuenta de
-- integracion: expires_in = 86399 segundos.
--
-- Se agregan las columnas necesarias para guardar el refresh_token
-- (dura 14 dias, rota en cada uso segun la documentacion oficial de
-- YiQi) y la fecha de vencimiento del access_token actual, asi el
-- sistema se renueva solo sin que nadie tenga que volver a loguear
-- con usuario/contraseña cada vez que se corta el sync.
-- ============================================================

ALTER TABLE public.yiqi_config
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS token_expira_en timestamptz;

COMMENT ON COLUMN public.yiqi_config.refresh_token IS
  'Refresh token de YiQi (POST /token, grant_type=refresh_token). Rota en cada uso -- YiQi solo acepta un refresh_token vivo por usuario a la vez.';

COMMENT ON COLUMN public.yiqi_config.token_expira_en IS
  'Momento en que vence bearer_token, calculado desde expires_in al generarlo/renovarlo. NULL = desconocido, fuerza a asumir que hay que renovar antes de usarlo.';
