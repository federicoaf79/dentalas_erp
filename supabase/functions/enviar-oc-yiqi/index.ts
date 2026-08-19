// ============================================================
// supabase/functions/enviar-oc-yiqi/index.ts
// Dentalab-Compras — Escritura de OC propia hacia YiQi
// ============================================================
//
// Se llama justo después de que una orden de ordenes_propias pasa a
// estado='aprobada' (desde los dos puntos del frontend que hacen eso:
// OrdenesPropias.jsx -> confirmarDecision(), y NuevaOC.jsx ->
// guardarOrden() cuando queda aprobada directo). Ver
// PROMPT_CONTINUIDAD_Dentalab-Compras.md, sesión 18/8/2026, para el
// diseño completo y por qué se decidió así.
//
// REGLA DE ORO: un error acá NUNCA deshace ni bloquea la aprobación
// local. Esta función no toca la columna `estado` de ordenes_propias
// en ningún caso -- solo lee el estado para decidir si corresponde
// enviar, y escribe en yiqi_enviada_en / yiqi_id_creado / yiqi_error.
//
// IDEMPOTENCIA: si la orden ya tiene yiqi_id_creado, no se vuelve a
// mandar nada -- protege contra doble click o un reintento que pisa
// un envío previo exitoso.
//
// RED DE SEGURIDAD: esta función también la llama el sweep de
// pg_cron (ver migración de cron pendiente) que busca periódicamente
// órdenes aprobadas sin yiqi_id_creado, para cubrir el caso de que el
// llamado desde el navegador nunca haya llegado a hacerse (pestaña
// cerrada, red cortada justo al aprobar).
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

// Constantes confirmadas en vivo (ver sesión 18/8/2026, puntos 5 y 7
// de la doc de continuidad):
//  - MONE_ID_MONE=171 (ARS): constante en el 100% de ~500 órdenes reales.
//  - TIUN_ID_TIUN=2 y ALIV_ID_ALIV=3: constantes en las líneas de
//    DETALLE de artículos de catálogo real (única excepción vista fue
//    un ítem "comodín" sin nombre que este sistema nunca genera).
const MONE_ID_MONE_ARS = 171;
const TIUN_ID_TIUN_UNIDAD = 2;
const ALIV_ID_ALIV_21 = 3;
const ALICUOTA_IVA = 0.21;

// ------------------------------------------------------------
// Normaliza un nombre para comparar sin que importen mayúsculas,
// acentos ni espacios de más. clie_nombre / proveedor_nombre son
// texto libre (mismo patrón que ya usa el resto de la app para
// matchear proveedor), así que esta comparación no puede ser un
// "=" estricto.
// ------------------------------------------------------------
function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita los acentos (marcas diacriticas combinantes)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// ------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Camino de confianza 1 (service_role, para el sweep de pg_cron) o
    // camino 2 (usuario real logueado). No hace falta soloAdmin: el
    // caso de aprobación directa de Ivana (dentro del límite) también
    // dispara esta función.
    const chequeo = await verificarLlamador(req, supabaseAdmin);
    if (!chequeo.ok) return respuestaAuthError(chequeo, CORS_HEADERS);

    let body: { orden_id?: number };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'Body inválido: se espera JSON con { orden_id }' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const ordenId = body.orden_id;
    if (!ordenId || typeof ordenId !== 'number') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta "orden_id" (numérico) en el body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { data: orden, error: errOrden } = await supabaseAdmin
      .from('ordenes_propias')
      .select('*')
      .eq('id', ordenId)
      .maybeSingle();

    if (errOrden) throw new Error(`Error leyendo la orden: ${errOrden.message}`);
    if (!orden) {
      return new Response(
        JSON.stringify({ ok: false, error: `No existe la orden #${ordenId}` }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Solo se escribe en YiQi si la orden está aprobada. No es un
    // error del llamador poco frecuente (podría pasar si dos pestañas
    // aprueban casi juntas), así que se responde ok:true sin hacer nada.
    if (orden.estado !== 'aprobada') {
      return new Response(
        JSON.stringify({ ok: true, enviada: false, motivo: `La orden está en estado "${orden.estado}", no "aprobada"` }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotencia: si ya se mandó con éxito, no se vuelve a mandar.
    if (orden.yiqi_id_creado) {
      return new Response(
        JSON.stringify({ ok: true, enviada: false, motivo: 'Ya estaba enviada', yiqi_id: orden.yiqi_id_creado }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // A partir de acá, cualquier error se guarda en yiqi_error y se
    // responde ok:false, pero NUNCA se toca `estado`.
    try {
      const { data: items, error: errItems } = await supabaseAdmin
        .from('ordenes_propias_items')
        .select('*')
        .eq('orden_id', ordenId)
        .order('id');
      if (errItems) throw new Error(`Error leyendo los ítems: ${errItems.message}`);
      if (!items || items.length === 0) {
        throw new Error('La orden no tiene ítems -- no se puede enviar a YiQi.');
      }

      // ---- Resolver proveedor (CLIE_ID_CLIE) ----
      const nombreBuscado = normalizar(orden.proveedor_nombre);
      const { data: clientes, error: errClientes } = await supabaseAdmin
        .from('clientes_yiqi')
        .select('yiqi_id, clie_nombre');
      if (errClientes) throw new Error(`Error leyendo clientes_yiqi: ${errClientes.message}`);

      const clienteMatch = (clientes ?? []).find((c) => normalizar(c.clie_nombre) === nombreBuscado);
      if (!clienteMatch) {
        throw new Error(`No se encontró el proveedor "${orden.proveedor_nombre}" en YiQi (clientes_yiqi).`);
      }

      // ---- Resolver artículos (MATE_ID_MATE por línea) ----
      const codigos = [...new Set(items.map((i) => i.mate_codigo).filter(Boolean))];
      const { data: materiales, error: errMateriales } = await supabaseAdmin
        .from('material_yiqi')
        .select('mate_codigo, yiqi_id')
        .in('mate_codigo', codigos);
      if (errMateriales) throw new Error(`Error leyendo material_yiqi: ${errMateriales.message}`);

      const mapaMateriales = new Map((materiales ?? []).map((m) => [m.mate_codigo, m.yiqi_id]));
      const codigosFaltantes = codigos.filter((c) => !mapaMateriales.has(c));
      if (codigosFaltantes.length > 0) {
        throw new Error(
          `No se encontraron en YiQi los siguientes artículos (mate_codigo): ${codigosFaltantes.join(', ')}`
        );
      }

      // ---- Armar DETALLE ----
      const detalle = items.map((item) => {
        const precioUnitarioNeto = Number(item.costo_unitario) || 0;
        const cantidad = Number(item.cantidad) || 0;
        const subtotalNeto = precioUnitarioNeto * cantidad;
        const iva = subtotalNeto * ALICUOTA_IVA;
        return {
          MATE_ID_MATE: mapaMateriales.get(item.mate_codigo),
          DEDO_NOMBRE_MATE: item.mate_nombre ?? null,
          DEDO_CANTIDAD: cantidad,
          TIUN_ID_TIUN: TIUN_ID_TIUN_UNIDAD,
          ALIV_ID_ALIV: ALIV_ID_ALIV_21,
          DEDO_PRECIO_UNITARIO_ACOR: precioUnitarioNeto,
          DEDO_PRECIO_ACORDADO: Number((precioUnitarioNeto * (1 + ALICUOTA_IVA)).toFixed(4)),
          DEDO_SUBTOTAL_NETO: Number(subtotalNeto.toFixed(2)),
          DEDO_SUBTOTAL: Number((subtotalNeto + iva).toFixed(2)),
          DEDO_DESCUENTO: 0,
          DEDO_IVA: Number(iva.toFixed(2)),
          DEDO_TOTAL: Number((subtotalNeto + iva).toFixed(2)),
        };
      });

      // ---- Armar header + POST a YiQi ----
      const hoy = new Date().toISOString().slice(0, 10) + 'T00:00:00';
      const config = await getYiqiConfig(supabaseAdmin);
      // Datos reales del registro a crear.
      const datosRegistro = {
        CLIE_ID_CLIE: clienteMatch.yiqi_id,
        MONE_ID_MONE: MONE_ID_MONE_ARS,
        ORDC_FECHA: hoy,
        ORDC_ASUNTO: `Dentalab-Compras #${orden.id}`,
        ORDC_OBSERVACIONES: orden.notas ?? null,
        DETALLE: detalle,
      };
      // Primer intento (orden #9, 18/8/2026) mandaba estos campos sueltos
      // en la raíz del body -> "data cannot be empty". Esta API espera
      // el registro envuelto en "data" (con schemaId como hermano), no
      // los campos sueltos -- mismo patrón que devolvió el error anterior
      // de "schemaId cannot be empty" cuando solo iba en la query string.
      const payload = {
        schemaId: config.schema_id,
        data: datosRegistro,
      };

      const url = `${config.base_url}/api/public/ORDEN_DE_COMPRA?schemaId=${config.schema_id}`;
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
        throw new Error(`YiQi respondió ${respYiqi.status} al crear la OC: ${textoError.slice(0, 400)}`);
      }

      const dataYiqi = await respYiqi.json().catch(() => null);
      // La respuesta de creacion puede traer la clave como "id" o "ID"
      // (mismo problema de casing confirmado el 19/8/2026 en la lectura
      // de REPORTE_DE_OC via sync-yiqi -- YiQi no es consistente entre
      // endpoints/smarties), y puede venir en la raiz o envuelta en
      // "data". Se prueban las 4 combinaciones antes de rendirse.
      const yiqiIdCreado =
        dataYiqi?.id ?? dataYiqi?.ID ?? dataYiqi?.data?.id ?? dataYiqi?.data?.ID ?? null;
      if (yiqiIdCreado == null) {
        console.warn(
          `enviar-oc-yiqi: no se pudo extraer el id creado de la respuesta de YiQi para la orden #${ordenId}. Respuesta cruda: ${JSON.stringify(dataYiqi).slice(0, 500)}`
        );
      }

      const { error: errUpdate } = await supabaseAdmin
        .from('ordenes_propias')
        .update({
          yiqi_enviada_en: new Date().toISOString(),
          yiqi_id_creado: yiqiIdCreado,
          yiqi_error: null,
        })
        .eq('id', ordenId);
      if (errUpdate) throw new Error(`Se creó en YiQi (id ${yiqiIdCreado}) pero no se pudo guardar localmente: ${errUpdate.message}`);

      return new Response(
        JSON.stringify({ ok: true, enviada: true, yiqi_id: yiqiIdCreado }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    } catch (errEnvio) {
      const mensaje = errEnvio instanceof Error ? errEnvio.message : 'Error desconocido al enviar a YiQi';
      // Guardamos el error SIN tocar `estado` -- la aprobación local
      // queda firme pase lo que pase acá.
      await supabaseAdmin
        .from('ordenes_propias')
        .update({ yiqi_error: mensaje.slice(0, 1000) })
        .eq('id', ordenId);

      console.error(`Error enviando orden #${ordenId} a YiQi:`, mensaje);
      return new Response(
        JSON.stringify({ ok: false, enviada: false, error: mensaje }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    // Errores fuera del bloque de envío (auth, body inválido, lectura
    // de la orden): acá sí no hay nada que guardar en la orden.
    console.error('Error en enviar-oc-yiqi:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================
// COMO SE LLAMA DESDE EL FRONTEND (fire-and-forget, nunca bloquea
// la UI de aprobación ya exitosa):
//
// try {
//   await supabase.functions.invoke('enviar-oc-yiqi', { body: { orden_id: cab.id } })
// } catch (e) {
//   console.error('[enviar-oc-yiqi]', e) // no se muestra como error bloqueante
// }
// ============================================================
