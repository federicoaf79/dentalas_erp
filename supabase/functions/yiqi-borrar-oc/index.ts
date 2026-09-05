// ============================================================
// supabase/functions/yiqi-borrar-oc/index.ts
// Dentalab-Compras — borrado manual de UNA orden de compra en YiQi
// ============================================================
//
// Por qué existe (5/9/2026): se encontraron ~2000+ órdenes de compra
// duplicadas reales en YiQi (ORDEN_DE_COMPRA), generadas por un bug ya
// corregido en enviar-oc-yiqi (ver ese archivo, sección "Red de
// seguridad contra duplicados"). Antes de armar una limpieza masiva
// hace falta confirmar que la API de YiQi soporta borrado -- nunca se
// probó, el repo solo tiene GET (lectura) y POST (creación) contra
// YiQi. Esta función prueba/ejecuta el borrado DE A UNO, nunca en
// lote, a propósito: es una herramienta de diagnóstico y limpieza
// manual controlada, no un endpoint para automatizar borrados en
// masa.
//
// SOLO ADMIN. Requiere { yiqi_id } en el body (el id interno de YiQi
// de la OC a borrar -- NO el nro_oc visible, ver columna yiqi_id_creado
// de ordenes_propias o yiqi_id de ordenes_yiqi). Devuelve el status y
// el cuerpo crudo de la respuesta de YiQi para poder ver exactamente
// qué contestó, sea éxito o error.
//
// NO toca ordenes_propias ni ordenes_yiqi -- el borrado del espejo
// local (si el borrado en YiQi salió bien) se hace aparte, a mano,
// una vez confirmado.
//
// Convención de URL probada: mismo patrón que el GET por id que ya
// usa el resto del repo (GET /api/public/{ENTIDAD}/{id}?schemaId=...),
// con method: 'DELETE'. Es una prueba -- si YiQi responde 404/405 acá
// es la respuesta útil (significa que hay que buscar otra convención
// o que YiQi no permite borrar por API).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verificarLlamador, respuestaAuthError } from '../_shared/auth.ts';
import { getYiqiConfig } from '../_shared/yiqiConfig.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://dentalab-compras.vercel.app';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ENTIDAD_DEFAULT = 'ORDEN_DE_COMPRA';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // soloAdmin: true -- esto borra datos reales en YiQi, no es para
    // cualquier usuario logueado. El camino de service_role (cron,
    // pruebas manuales con la key de servicio) también pasa.
    const chequeo = await verificarLlamador(req, supabaseAdmin, { soloAdmin: true });
    if (!chequeo.ok) return respuestaAuthError(chequeo, CORS_HEADERS);

    let body: { yiqi_id?: number | string; entidad?: string; metodo?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'Body inválido: se espera JSON con { yiqi_id }' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const yiqiId = body.yiqi_id;
    if (yiqiId == null || yiqiId === '') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta "yiqi_id" en el body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const entidad = body.entidad || ENTIDAD_DEFAULT;
    // metodo: 'GET' para solo probar si el id resuelve a un registro real
    // (diagnóstico, no toca nada), 'DELETE' (default) para borrar de verdad.
    const metodo = (body.metodo || 'DELETE').toUpperCase();
    const config = await getYiqiConfig(supabaseAdmin, 'yiqi-borrar-oc');

    const url = `${config.base_url}/api/public/${entidad}/${yiqiId}?schemaId=${config.schema_id}`;
    const respYiqi = await fetch(url, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${config.bearer_token}`,
        'Content-Type': 'application/json',
      },
    });

    const textoRespuesta = await respYiqi.text().catch(() => '');
    let cuerpoParsed: unknown = null;
    try {
      cuerpoParsed = textoRespuesta ? JSON.parse(textoRespuesta) : null;
    } catch {
      cuerpoParsed = textoRespuesta;
    }

    console.log(
      `yiqi-borrar-oc: ${metodo} ${url} -> ${respYiqi.status}. Respuesta: ${textoRespuesta.slice(0, 500)}`
    );

    return new Response(
      JSON.stringify({
        ok: respYiqi.ok,
        status: respYiqi.status,
        metodo,
        url,
        yiqi_id: yiqiId,
        entidad,
        respuesta: cuerpoParsed,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error en yiqi-borrar-oc:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================
// COMO PROBARLA (PowerShell, con la service_role key del proyecto
// -- Project Settings -> API Keys en el dashboard de Supabase):
//
//   $body = @{ yiqi_id = 9999 } | ConvertTo-Json
//   Invoke-RestMethod `
//     -Uri "https://hsfudsnmooaesrzdwecg.supabase.co/functions/v1/yiqi-borrar-oc" `
//     -Method Post `
//     -Headers @{ Authorization = "Bearer TU_SERVICE_ROLE_KEY_ACA" } `
//     -ContentType "application/json" `
//     -Body $body
// ============================================================
