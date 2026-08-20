// ============================================================
// supabase/functions/_shared/yiqiConfig.ts
// Config de YiQi + renovacion automatica del access_token
// ============================================================
//
// CONTEXTO (17/8/2026): durante meses el sistema asumio que el
// access_token de YiQi vivia ~4 anios sin vencer (ver el comentario
// viejo que tenia yiqi-connector/index.ts -- nunca confirmado contra
// la documentacion real). Eso era incorrecto: la documentacion
// oficial de YiQi (apidoc.yiqi.com.ar) dice que el access_token es
// de VIDA CORTA, y confirmado en vivo el 17/8/2026 generando un
// token real: expires_in = 86399 segundos (~24hs).
//
// Reglas de YiQi que hay que respetar (documentadas, no supuestas):
//   - Para renovar sin volver a mandar usuario/contraseña se usa
//     POST /token con grant_type=refresh_token.
//   - El refresh_token dura 14 dias y ROTA: cada uso devuelve un
//     refresh_token nuevo y el anterior deja de servir.
//   - Hay UN SOLO refresh_token vivo por usuario. Si otro proceso
//     (o un login manual con usuario/contraseña) pide uno nuevo,
//     el que tenia guardado esta funcion deja de servir.
//
// Este modulo es el UNICO lugar del repo que debe leer/escribir
// yiqi_config. sync-yiqi y yiqi-connector lo llaman en vez de tener
// cada uno su propia copia de la logica de lectura -- asi no
// divergen si el dia de mañana hay que tocar algo mas.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Renovar cuando falten menos de 2 horas para el vencimiento. Con
// expires_in ~24hs y el cron corriendo cada 15 min, este margen deja
// de sobra varios reintentos si una renovacion puntual fallara por
// lo que sea (ver manejo de errores en getYiqiConfig).
const MARGEN_REFRESH_MS = 2 * 60 * 60 * 1000;

export interface YiqiConfig {
  id: string;
  base_url: string;
  schema_id: number;
  bearer_token: string;
  refresh_token: string | null;
  token_expira_en: string | null;
  ultima_sync: string | null;
  [key: string]: unknown;
}

// ------------------------------------------------------------
// Lee la fila de configuracion mas reciente de yiqi_config.
// ------------------------------------------------------------
async function leerConfig(supabaseAdmin: ReturnType<typeof createClient>): Promise<YiqiConfig> {
  const { data, error } = await supabaseAdmin
    .from('yiqi_config')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error('No hay configuracion de YiQi cargada en yiqi_config: ' + (error?.message ?? 'sin datos'));
  }
  return data as YiqiConfig;
}

// ------------------------------------------------------------
// Pide un access_token nuevo a YiQi usando el refresh_token
// guardado, SIN volver a mandar usuario/contraseña.
// ------------------------------------------------------------
async function refrescarToken(baseUrl: string, refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const resp = await fetch(`${baseUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    throw new Error(`YiQi rechazo el refresh del token (${resp.status}): ${texto.slice(0, 300)}`);
  }

  const json = await resp.json();
  if (!json?.access_token || !json?.refresh_token || !json?.expires_in) {
    throw new Error(
      'La respuesta de refresh de YiQi no tiene la forma esperada (faltan access_token/refresh_token/expires_in en el JSON). ' +
      'Puede haber cambiado el formato de la API -- revisar a mano antes de seguir confiando en el refresh automatico.'
    );
  }

  return {
    accessToken: String(json.access_token),
    refreshToken: String(json.refresh_token),
    expiraEn: new Date(Date.now() + Number(json.expires_in) * 1000),
  };
}

// ------------------------------------------------------------
// Devuelve la config de YiQi con un access_token GARANTIZADO
// valido: si el guardado esta por vencer (o ya vencio, o nunca se
// cargo la fecha de vencimiento), lo renueva primero y guarda el
// resultado en yiqi_config.
//
// Si el refresh falla, NO deja a yiqi_config en un estado a medias:
// o se guardan los 3 campos juntos (token + refresh + vencimiento)
// o no se toca nada. El error se propaga con un mensaje que lo
// distingue de un error de YiQi en la llamada de negocio, para que
// el proximo diagnostico no confunda "se vencio el refresh token"
// con "YiQi esta caido".
// ------------------------------------------------------------
// Cuanto dura el lock antes de considerarse abandonado (por si una
// invocación se cae a mitad de la renovación y nunca llega a liberarlo).
const LOCK_DURACION_MS = 30 * 1000;

// `origen` identifica qué función/acción llama (sync-yiqi,
// yiqi-connector:estado, yiqi-connector:lectura, enviar-oc-yiqi) --
// solo se usa para el registro en yiqi_token_eventos, no cambia el
// comportamiento. Los 4 call sites existentes se actualizaron para
// pasarlo (20/8/2026); si se agrega un 5to en el futuro, mandar un
// string corto y descriptivo acá evita que el diagnóstico quede en
// blanco para ese caso nuevo.
export async function getYiqiConfig(
  supabaseAdmin: ReturnType<typeof createClient>,
  origen: string = 'desconocido',
): Promise<YiqiConfig> {
  const config = await leerConfig(supabaseAdmin);

  const expiraEn = config.token_expira_en ? new Date(config.token_expira_en) : null;
  const faltaPoco = !expiraEn || expiraEn.getTime() - Date.now() < MARGEN_REFRESH_MS;

  if (!faltaPoco) {
    return config;
  }

  // Lock (agregado 18/8/2026): antes de intentar renovar, tratamos de
  // "tomar" el lock con un UPDATE condicional. Si otra invocación ya
  // lo tiene (o lo tomó hace instantes), NO competimos por el mismo
  // refresh_token -- YiQi solo permite uno vivo por usuario y la
  // segunda llamada perdería la carrera con un 401 invalid_grant que
  // deja todo roto. En vez de eso, esperamos un toque y releemos: lo
  // más probable es que el que ganó el lock ya haya guardado un token
  // fresco para cuando volvemos a mirar.
  const ahora = new Date();
  const { data: lockTomado } = await supabaseAdmin
    .from('yiqi_config')
    .update({ refresh_lock_hasta: new Date(ahora.getTime() + LOCK_DURACION_MS).toISOString() })
    .eq('id', config.id)
    .or(`refresh_lock_hasta.is.null,refresh_lock_hasta.lt.${ahora.toISOString()}`)
    .select('id')
    .maybeSingle();

  if (!lockTomado) {
    console.log('yiqi_config: otra invocación ya está renovando el token -- esperando y releyendo en vez de competir.');
    await new Promise((r) => setTimeout(r, 1500));
    const configReleida = await leerConfig(supabaseAdmin);
    // Si ya quedó renovado por la otra invocación, listo. Si todavía
    // no (venció el lock sin que nadie lo liberara, por ejemplo), se
    // usa tal cual -- mejor un token viejo-pero-quizás-vigente que
    // sumar una tercera renovación en danza.
    return configReleida;
  }

  try {
    return await renovarYGuardar(supabaseAdmin, config, expiraEn, origen);
  } finally {
    await supabaseAdmin.from('yiqi_config').update({ refresh_lock_hasta: null }).eq('id', config.id);
  }
}

// ------------------------------------------------------------
// Registro persistente de cada intento de renovación (agregado
// 20/8/2026, tabla yiqi_token_eventos). Nunca debe hacer caer la
// renovación en sí -- si el INSERT falla, se loguea y se sigue.
// ------------------------------------------------------------
async function registrarEvento(
  supabaseAdmin: ReturnType<typeof createClient>,
  datos: {
    resultado: 'renovado' | 'fallo_recuperable' | 'fallo_critico';
    origen: string;
    mensaje: string;
    tokenExpirabaEn: Date | null;
    tokenExpiraEn: Date | null;
  },
) {
  try {
    const { error } = await supabaseAdmin.from('yiqi_token_eventos').insert({
      resultado: datos.resultado,
      origen: datos.origen,
      mensaje: datos.mensaje,
      token_expiraba_en: datos.tokenExpirabaEn ? datos.tokenExpirabaEn.toISOString() : null,
      token_expira_en: datos.tokenExpiraEn ? datos.tokenExpiraEn.toISOString() : null,
    });
    if (error) {
      console.error('No se pudo registrar el evento en yiqi_token_eventos:', error.message);
    }
  } catch (err) {
    console.error('No se pudo registrar el evento en yiqi_token_eventos:', err);
  }
}

// ------------------------------------------------------------
// La renovación real, separada de getYiqiConfig para poder envolverla
// en el lock de arriba con un try/finally prolijo.
// ------------------------------------------------------------
async function renovarYGuardar(
  supabaseAdmin: ReturnType<typeof createClient>,
  config: YiqiConfig,
  expiraEn: Date | null,
  origen: string,
): Promise<YiqiConfig> {
  if (!config.refresh_token) {
    // Config vieja (cargada antes de este cambio) sin refresh_token
    // guardado. No hay forma de renovar solo -- hace falta un login
    // manual con usuario/contraseña una vez para que el refresh
    // automatico tenga de donde arrancar a rotar.
    console.warn(
      'yiqi_config no tiene refresh_token guardado -- no se puede renovar el access_token solo. ' +
      'Hace falta cargarlo a mano una vez (grant_type=password) para que el refresh automatico arranque.'
    );
    return config;
  }

  try {
    const nuevo = await refrescarToken(config.base_url, config.refresh_token);

    const { data, error } = await supabaseAdmin
      .from('yiqi_config')
      .update({
        bearer_token: nuevo.accessToken,
        refresh_token: nuevo.refreshToken,
        token_expira_en: nuevo.expiraEn.toISOString(),
      })
      .eq('id', config.id)
      .select('*')
      .single();

    if (error || !data) {
      // El refresh en si funciono, pero no se pudo guardar. Devolver
      // igual el token nuevo en memoria para ESTA invocacion (mejor
      // que fallar el sync entero), aunque quede sin guardar para la
      // proxima corrida. Se loguea fuerte porque es una situacion
      // rara que conviene mirar si se repite.
      console.error(
        'Se renovo el token de YiQi pero no se pudo guardar en yiqi_config: ' + (error?.message ?? 'sin dato'),
      );
      await registrarEvento(supabaseAdmin, {
        resultado: 'renovado',
        origen,
        mensaje: 'Renovado en YiQi pero no se pudo guardar en yiqi_config: ' + (error?.message ?? 'sin dato'),
        tokenExpirabaEn: expiraEn,
        tokenExpiraEn: nuevo.expiraEn,
      });
      return {
        ...config,
        bearer_token: nuevo.accessToken,
        refresh_token: nuevo.refreshToken,
        token_expira_en: nuevo.expiraEn.toISOString(),
      };
    }

    console.log(`Token de YiQi renovado. Vence: ${nuevo.expiraEn.toISOString()}`);
    await registrarEvento(supabaseAdmin, {
      resultado: 'renovado',
      origen,
      mensaje: `Renovado sin problemas.`,
      tokenExpirabaEn: expiraEn,
      tokenExpiraEn: nuevo.expiraEn,
    });
    return data as YiqiConfig;
  } catch (err) {
    // Carrera con otro cron corriendo al mismo tiempo (rarisimo, pero
    // el refresh_token rota: si dos llamadas lo usan casi juntas,
    // YiQi solo acepta la primera). No tocamos yiqi_config -- si otro
    // proceso gano la carrera, ya la dejo con un token valido y el
    // proximo intento (15 min despues) la va a leer bien. Si el token
    // actual TODAVIA no vencio (solo estaba en la ventana de margen),
    // lo usamos tal cual en vez de fallar el sync por una renovacion
    // que no hacia falta todavia.
    const mensajeError = err instanceof Error ? err.message : String(err);

    if (expiraEn && expiraEn.getTime() > Date.now()) {
      console.warn(
        `No se pudo renovar el token de YiQi (el guardado seguia vigente, se sigue usando ese): ${mensajeError}`,
      );
      // "fallo_recuperable": no corta nada hoy, pero es la señal
      // temprana de que algo invalidó el refresh_token -- si esto se
      // repite en las próximas horas, va a terminar en fallo_critico
      // apenas el token guardado también venza. Antes de esta tabla,
      // este warning se perdía en los logs efímeros de la función.
      await registrarEvento(supabaseAdmin, {
        resultado: 'fallo_recuperable',
        origen,
        mensaje: mensajeError,
        tokenExpirabaEn: expiraEn,
        tokenExpiraEn: expiraEn,
      });
      return config;
    }

    await registrarEvento(supabaseAdmin, {
      resultado: 'fallo_critico',
      origen,
      mensaje: mensajeError,
      tokenExpirabaEn: expiraEn,
      tokenExpiraEn: null,
    });
    throw new Error(
      `No se pudo renovar el token de YiQi y el guardado ya vencio: ${mensajeError}`,
    );
  }
}
