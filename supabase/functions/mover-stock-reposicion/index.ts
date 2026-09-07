// ============================================================
// supabase/functions/mover-stock-reposicion/index.ts
// Dentalab-Compras — Circuito de reposición automática Central↔Local
// ============================================================
//
// Por qué existe (7/9/2026): generaliza a mover-stock-yiqi (que solo
// sabe mover Central->Local, con CEDI_ID_LOCAL/CEDI_ID_CENTRAL fijos)
// para el circuito nuevo — ver DISENO_TECNICO_Reposicion_CentralLocal_
// 7-9-2026.md. Acá origen/destino salen de la fila de
// solicitudes_reposicion (pueden ser Central->Local o Local->Central,
// según el circuito), en vez de estar hardcodeados.
//
// Se llama desde el frontend JUSTO DESPUÉS de que
// confirmar_recepcion_linea() ya se confirmó con éxito — mismo patrón
// fire-and-forget que mover-stock-yiqi y enviar-oc-yiqi.
//
// REGLA DE ORO (igual que mover-stock-yiqi): un error acá NUNCA
// deshace ni bloquea el "recibido" local. Quien recibió ya confirmó
// la mercadería físicamente — revertir el registro porque YiQi no
// respondió sería peor que dejarlo desincronizado. Esta función solo
// LEE estado_linea, nunca lo escribe — únicamente escribe
// yiqi_movimiento_id / yiqi_enviado_en / yiqi_error sobre la línea.
//
// IDEMPOTENCIA: si la línea ya tiene yiqi_movimiento_id, no se vuelve
// a mandar nada — mismo criterio que mover-stock-yiqi.
//
// mover-stock-yiqi (Central->Local fijo, tabla reposiciones_sugeridas)
// queda sin tocar por ahora — sigue siendo la que usa la pantalla
// actual de Reposición interna hasta que se apague ese flujo. Esta es
// la función nueva para solicitudes_reposicion_lineas.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // No soloAdmin: cualquier cuenta de depósito con la línea asignada
    // (RLS de solicitudes_reposicion_lineas) puede confirmar recepción,
    // así que también puede disparar esto.
    const chequeo = await verificarLlamador(req, supabaseAdmin);
    if (!chequeo.ok) return respuestaAuthError(chequeo, CORS_HEADERS);

    let body: { linea_id?: number };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'Body inválido: se espera JSON con { linea_id }' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const lineaId = body.linea_id;
    if (!lineaId || typeof lineaId !== 'number') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta "linea_id" (numérico) en el body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Trae la línea junto con origen/destino de la solicitud (join
    // manual porque supabase-js no hace join anidado con !inner acá
    // de forma directa contra el schema cache sin configurarlo).
    const { data: linea, error: errLinea } = await supabaseAdmin
      .from('solicitudes_reposicion_lineas')
      .select('*, solicitudes_reposicion:solicitud_id (deposito_origen_id, deposito_destino_id)')
      .eq('id', lineaId)
      .maybeSingle();

    if (errLinea) throw new Error(`Error leyendo la línea: ${errLinea.message}`);
    if (!linea) {
      return new Response(
        JSON.stringify({ ok: false, error: `No existe la línea #${lineaId}` }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Solo corresponde escribir en YiQi si ya está "recibida". No es un
    // error del llamador (podría pasar por una carrera entre pestañas)
    // — se responde ok:true sin hacer nada.
    if (linea.estado_linea !== 'recibida') {
      return new Response(
        JSON.stringify({ ok: true, enviada: false, motivo: `La línea está en estado "${linea.estado_linea}", no "recibida"` }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotencia: si ya se mandó con éxito, no se vuelve a mandar.
    if (linea.yiqi_movimiento_id) {
      return new Response(
        JSON.stringify({ ok: true, enviada: false, motivo: 'Ya estaba enviada', yiqi_movimiento_id: linea.yiqi_movimiento_id }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const origenId = linea.solicitudes_reposicion?.deposito_origen_id;
    const destinoId = linea.solicitudes_reposicion?.deposito_destino_id;
    if (!origenId || !destinoId) {
      throw new Error(`No se pudo determinar origen/destino de la solicitud para la línea #${lineaId}`);
    }

    // A partir de acá, cualquier error se guarda en yiqi_error y se
    // responde ok:false, pero NUNCA se toca estado_linea (regla de oro).
    try {
      const { data: material, error: errMaterial } = await supabaseAdmin
        .from('material_yiqi')
        .select('yiqi_id')
        .eq('mate_codigo', linea.sku)
        .maybeSingle();
      if (errMaterial) throw new Error(`Error leyendo material_yiqi: ${errMaterial.message}`);
      if (!material?.yiqi_id) {
        throw new Error(`No se encontró en YiQi el artículo (mate_codigo): ${linea.sku}`);
      }

      // Se mueve lo efectivamente recibido y confirmado contra lo
      // físico, no lo solicitado ni lo declarado como "envía" —
      // cantidad_recibida es la fuente de verdad de este paso.
      const cantidad = Number(linea.cantidad_recibida ?? linea.cantidad_enviada) || 0;
      if (cantidad <= 0) {
        throw new Error(`Cantidad inválida para mover (${cantidad}) -- revisar cantidad_recibida de la línea.`);
      }

      const observaciones = `Reposición #${linea.solicitud_id} línea ${linea.id} - ${linea.mate_nombre ?? linea.sku}`.slice(0, 250);

      const config = await getYiqiConfig(supabaseAdmin, 'mover-stock-reposicion');
      const payload = {
        schemaId: config.schema_id,
        data: {
          MATE_ID_MATE: material.yiqi_id,
          MOST_CANTIDAD: cantidad,
          CEDI_ID_CED1: destinoId, // destino: el que confirmó "recibido"
          CEDI_ID_CEDI: origenId,  // origen: el que declaró "envía"
          MOST_OBSERVACIONES: observaciones,
        },
      };

      const url = `${config.base_url}/api/public/MOVIMIENTO_STOCK?schemaId=${config.schema_id}`;
      const respYiqi = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.bearer_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!respYiqi.ok) {
        const textoError = await respYiqi.text().catch(() => '');
        throw new Error(`YiQi respondió ${respYiqi.status} al crear el movimiento: ${textoError.slice(0, 400)}`);
      }

      const dataYiqi = await respYiqi.json().catch(() => null);
      const movimientoId =
        dataYiqi?.newId ?? dataYiqi?.id ?? dataYiqi?.ID ?? dataYiqi?.parameter?.id ?? null;

      const { error: errUpdate } = await supabaseAdmin
        .from('solicitudes_reposicion_lineas')
        .update({
          yiqi_movimiento_id: movimientoId,
          yiqi_enviado_en: new Date().toISOString(),
          yiqi_error: null,
        })
        .eq('id', lineaId);
      if (errUpdate) throw new Error(`Se creó en YiQi (id ${movimientoId}) pero no se pudo guardar localmente: ${errUpdate.message}`);

      return new Response(
        JSON.stringify({ ok: true, enviada: true, yiqi_movimiento_id: movimientoId }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    } catch (errEnvio) {
      const mensaje = errEnvio instanceof Error ? errEnvio.message : 'Error desconocido al enviar a YiQi';
      await supabaseAdmin
        .from('solicitudes_reposicion_lineas')
        .update({ yiqi_error: mensaje.slice(0, 1000) })
        .eq('id', lineaId);

      console.error(`Error enviando movimiento de la línea #${lineaId} a YiQi:`, mensaje);
      return new Response(
        JSON.stringify({ ok: false, enviada: false, error: mensaje }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('Error en mover-stock-reposicion:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================
// COMO SE LLAMA DESDE EL FRONTEND (fire-and-forget, justo después de
// que confirmar_recepcion_linea() ya se confirmó con éxito):
//
// try {
//   await supabase.functions.invoke('mover-stock-reposicion', { body: { linea_id: linea.id } })
// } catch (e) {
//   console.error('[mover-stock-reposicion]', e) // no se muestra como error bloqueante
// }
// ============================================================
