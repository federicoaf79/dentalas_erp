// ============================================================
// supabase/functions/mover-stock-yiqi/index.ts
// Dentalab-Compras — Reposición interna: reflejar "Movido" en YiQi
// ============================================================
//
// Por qué existe (6/9/2026): Aris confirmó (pendiente #5, ver
// PROMPT_CONTINUIDAD_RESUMEN.md) que "Movido" en Reposición interna
// debe reflejarse también en YiQi. Hoy marcar_reposicion_sugerida()
// solo actualiza reposiciones_sugeridas -- esta función es el paso
// que faltaba: hace el POST /MOVIMIENTO_STOCK real contra YiQi.
//
// Se llama desde el frontend (ReposicionInterna.jsx -> confirmarAccion())
// JUSTO DESPUÉS de que marcar_reposicion_sugerida(p_estado='movido')
// ya se confirmó con éxito -- mismo patrón fire-and-forget que
// enviar-oc-yiqi después de aprobar una orden.
//
// REGLA DE ORO (igual que enviar-oc-yiqi): un error acá NUNCA
// deshace ni bloquea el "movido" local. El usuario ya movió la
// mercadería físicamente en el depósito -- revertir el registro local
// porque YiQi no respondió sería peor que dejarlo desincronizado
// (quedaría "pendiente" de nuevo mientras la mercadería ya está
// movida, generando una sugerencia duplicada). Esta función solo
// LEE estado, nunca lo escribe -- únicamente escribe yiqi_movimiento_id
// / yiqi_enviado_en / yiqi_error.
//
// IDEMPOTENCIA: si la fila ya tiene yiqi_movimiento_id, no se vuelve
// a mandar nada -- protege contra doble invocación o un reintento
// futuro (ej. un sweep de pg_cron, si hiciera falta más adelante,
// mismo criterio que el de enviar-oc-yiqi con pg_cron para OC).
//
// Probado en vivo antes de escribir esta función (6/9/2026): POST
// /MOVIMIENTO_STOCK con body mínimo { MATE_ID_MATE, MOST_CANTIDAD,
// CEDI_ID_CED1 (destino), CEDI_ID_CEDI (origen) } contra el SKU
// 70340-2 (yiqi_id 13175), 1 unidad Central->Local, y su reversión
// Local->Central -- ambos con status 200, YiQi devolvió el
// movimiento creado completo. Ver INCIDENTE_duplicados_ordenes_yiqi_5-9-2026.md.
//
// Ids reales de UBICACION_STOCK confirmados el 6/9/2026 (módulo
// Parámetros de YiQi, entidad separada de Stock -- ver mismo
// documento): Local=155, Central=157. Constantes acá abajo porque
// Reposición interna SOLO mueve Central<->Local (no hay otro par de
// depósitos en este flujo, a diferencia de MOVIMIENTO_STOCK que
// acepta cualquier par).
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

// Confirmados en vivo el 6/9/2026 contra UBICACION_STOCK (módulo
// Parámetros) -- ver INCIDENTE_duplicados_ordenes_yiqi_5-9-2026.md.
const CEDI_ID_LOCAL = 155;
const CEDI_ID_CENTRAL = 157;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // No soloAdmin: cualquier usuario con el proveedor asignado puede
    // marcar "movido" (misma RLS que marcar_reposicion_sugerida), así
    // que también puede disparar esto.
    const chequeo = await verificarLlamador(req, supabaseAdmin);
    if (!chequeo.ok) return respuestaAuthError(chequeo, CORS_HEADERS);

    let body: { reposicion_id?: number };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'Body inválido: se espera JSON con { reposicion_id }' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const reposicionId = body.reposicion_id;
    if (!reposicionId || typeof reposicionId !== 'number') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta "reposicion_id" (numérico) en el body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { data: fila, error: errFila } = await supabaseAdmin
      .from('reposiciones_sugeridas')
      .select('*')
      .eq('id', reposicionId)
      .maybeSingle();

    if (errFila) throw new Error(`Error leyendo la sugerencia: ${errFila.message}`);
    if (!fila) {
      return new Response(
        JSON.stringify({ ok: false, error: `No existe la sugerencia #${reposicionId}` }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Solo corresponde escribir en YiQi si ya está marcada "movido".
    // No es un error del llamador (podría pasar por una carrera entre
    // pestañas) -- se responde ok:true sin hacer nada.
    if (fila.estado !== 'movido') {
      return new Response(
        JSON.stringify({ ok: true, enviada: false, motivo: `La sugerencia está en estado "${fila.estado}", no "movido"` }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotencia: si ya se mandó con éxito, no se vuelve a mandar.
    if (fila.yiqi_movimiento_id) {
      return new Response(
        JSON.stringify({ ok: true, enviada: false, motivo: 'Ya estaba enviada', yiqi_movimiento_id: fila.yiqi_movimiento_id }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // A partir de acá, cualquier error se guarda en yiqi_error y se
    // responde ok:false, pero NUNCA se toca `estado` (regla de oro).
    try {
      const { data: material, error: errMaterial } = await supabaseAdmin
        .from('material_yiqi')
        .select('yiqi_id')
        .eq('mate_codigo', fila.sku)
        .maybeSingle();
      if (errMaterial) throw new Error(`Error leyendo material_yiqi: ${errMaterial.message}`);
      if (!material?.yiqi_id) {
        throw new Error(`No se encontró en YiQi el artículo (mate_codigo): ${fila.sku}`);
      }

      const cantidad = Number(fila.cantidad_movida ?? fila.cantidad) || 0;
      if (cantidad <= 0) {
        throw new Error(`Cantidad inválida para mover (${cantidad}) -- revisar cantidad/cantidad_movida de la fila.`);
      }

      const observaciones = `Reposición interna #${fila.id} - ${fila.mate_nombre ?? fila.sku}${fila.observacion ? ' - ' + fila.observacion : ''}`.slice(0, 250);

      const config = await getYiqiConfig(supabaseAdmin, 'mover-stock-yiqi');
      const payload = {
        schemaId: config.schema_id,
        data: {
          MATE_ID_MATE: material.yiqi_id,
          MOST_CANTIDAD: cantidad,
          CEDI_ID_CED1: CEDI_ID_LOCAL,   // destino: siempre Local en este flujo
          CEDI_ID_CEDI: CEDI_ID_CENTRAL, // origen: siempre Central en este flujo
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
      // Mismo problema de casing ya visto en enviar-oc-yiqi/sync-yiqi:
      // probar "newId"/"id"/"ID" antes de rendirse.
      const movimientoId =
        dataYiqi?.newId ?? dataYiqi?.id ?? dataYiqi?.ID ?? dataYiqi?.parameter?.id ?? null;

      const { error: errUpdate } = await supabaseAdmin
        .from('reposiciones_sugeridas')
        .update({
          yiqi_movimiento_id: movimientoId,
          yiqi_enviado_en: new Date().toISOString(),
          yiqi_error: null,
        })
        .eq('id', reposicionId);
      if (errUpdate) throw new Error(`Se creó en YiQi (id ${movimientoId}) pero no se pudo guardar localmente: ${errUpdate.message}`);

      return new Response(
        JSON.stringify({ ok: true, enviada: true, yiqi_movimiento_id: movimientoId }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    } catch (errEnvio) {
      const mensaje = errEnvio instanceof Error ? errEnvio.message : 'Error desconocido al enviar a YiQi';
      // Se guarda el error SIN tocar `estado` -- el "movido" local
      // queda firme pase lo que pase acá (regla de oro).
      await supabaseAdmin
        .from('reposiciones_sugeridas')
        .update({ yiqi_error: mensaje.slice(0, 1000) })
        .eq('id', reposicionId);

      console.error(`Error enviando movimiento de reposición #${reposicionId} a YiQi:`, mensaje);
      return new Response(
        JSON.stringify({ ok: false, enviada: false, error: mensaje }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('Error en mover-stock-yiqi:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================
// COMO SE LLAMA DESDE EL FRONTEND (fire-and-forget, nunca bloquea
// la UI ya exitosa de "marcado como movido"):
//
// try {
//   await supabase.functions.invoke('mover-stock-yiqi', { body: { reposicion_id: modal.fila.id } })
// } catch (e) {
//   console.error('[mover-stock-yiqi]', e) // no se muestra como error bloqueante
// }
// ============================================================
