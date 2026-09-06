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
//
// Extendida 5/9/2026: el modo de búsqueda (asunto/sin_filtro/desde-hasta)
// ahora acepta { entidad, columns, pageSize } en el body -- antes estaba
// fijo a ORDEN_DE_COMPRA. Se usó primero para resolver los id reales de
// UBICACION_STOCK (depósitos) antes de escribir en MOVIMIENTO_STOCK, sin
// tener que crear una función nueva por cada entidad de solo-lectura que
// haga falta consultar. Sigue siendo SOLO ADMIN y de solo lectura en este
// modo (el POST /query de YiQi es una consulta, no crea ni modifica nada).
//
// Extendida 6/9/2026: modo { crear: true, entidad, data } -- POST crudo
// de creación contra CUALQUIER entidad (ej. MOVIMIENTO_STOCK), mismo
// wrapper { schemaId, data } que ya usa enviar-oc-yiqi para ORDEN_DE_COMPRA.
// Existe SOLO para probar a mano, con datos mínimos, antes de construir
// una integración real (mismo criterio ya usado con editar-oc-yiqi y
// enviar-oc-yiqi) -- una vez confirmado el comportamiento real de la API
// para una entidad nueva, la integración de producción va en su propia
// función dedicada, no queda viviendo acá. SOLO ADMIN, como el resto de
// este archivo -- este modo SÍ escribe datos reales en YiQi.
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

    let body: {
      yiqi_id?: number | string;
      entidad?: string;
      metodo?: string;
      asunto?: string;
      operador?: string;
      sin_filtro?: boolean;
      desde?: string;
      hasta?: string;
      // columns/pageSize (5/9/2026): el modo de búsqueda estaba fijo a
      // ORDEN_DE_COMPRA con sus propias columnas. Se generaliza para poder
      // usar el mismo /query contra CUALQUIER entidad (ej. UBICACION_STOCK
      // para resolver los id reales de los depósitos antes de escribir en
      // MOVIMIENTO_STOCK) sin tener que crear una función nueva por entidad.
      columns?: Array<string | { field: string }>;
      pageSize?: number;
      // crear/data (6/9/2026): modo de creación cruda contra cualquier
      // entidad -- ver comentario del encabezado.
      crear?: boolean;
      data?: Record<string, unknown>;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'Body inválido: se espera JSON con { yiqi_id }' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Modo creación cruda (6/9/2026): { crear: true, entidad, data }.
    // Mismo wrapper { schemaId, data } que enviar-oc-yiqi/editar-oc-yiqi ya
    // usan contra ORDEN_DE_COMPRA -- acá es genérico, para poder probar
    // CUALQUIER entidad con datos mínimos antes de construir la integración
    // real. Devuelve el status y cuerpo crudo de YiQi, éxito o error.
    if (body.crear === true) {
      if (!body.entidad) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Falta "entidad" en el body (modo crear)' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      if (!body.data || typeof body.data !== 'object') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Falta "data" (objeto) en el body (modo crear)' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      const config = await getYiqiConfig(supabaseAdmin, 'yiqi-borrar-oc');
      const url = `${config.base_url}/api/public/${body.entidad}?schemaId=${config.schema_id}`;
      const payload = { schemaId: config.schema_id, data: body.data };
      const respYiqi = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.bearer_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const textoRespuesta = await respYiqi.text().catch(() => '');
      let cuerpoParsed: unknown = null;
      try {
        cuerpoParsed = textoRespuesta ? JSON.parse(textoRespuesta) : null;
      } catch {
        cuerpoParsed = textoRespuesta;
      }
      console.log(
        `yiqi-borrar-oc (crear): POST ${url} -> ${respYiqi.status}. Body enviado: ${JSON.stringify(payload)}. Respuesta: ${textoRespuesta.slice(0, 500)}`
      );
      return new Response(
        JSON.stringify({ ok: respYiqi.ok, status: respYiqi.status, url, enviado: payload, respuesta: cuerpoParsed }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Modo diagnóstico/búsqueda: { asunto: "Dentalab-Compras #8" } -- en vez
    // de REPORTE_DE_OC (entidad de reporte, con su PROPIO id, sin ninguna FK
    // hacia ORDEN_DE_COMPRA -- confirmado contra el spec real de la API),
    // consulta la entidad ORDEN_DE_COMPRA directamente vía POST /query,
    // filtrando por ORDC_ASUNTO. El "id" que devuelve acá SÍ es el id real
    // de la entidad, usable directo en GET/DELETE /ORDEN_DE_COMPRA/{id}.
    if (body.asunto || body.sin_filtro || (body.desde && body.hasta)) {
      const config = await getYiqiConfig(supabaseAdmin, 'yiqi-borrar-oc');
      // entidadConsulta (5/9/2026): antes fijo a ORDEN_DE_COMPRA. Ahora
      // configurable por body.entidad -- default ORDEN_DE_COMPRA para no
      // romper las pruebas ya usadas contra esa entidad.
      const entidadConsulta = body.entidad || ENTIDAD_DEFAULT;
      const url = `${config.base_url}/api/public/${entidadConsulta}/query?schemaId=${config.schema_id}`;
      // Por default LIKE (no "=") para no fallar por un espacio de más u
      // otra diferencia sutil de string. body.sin_filtro:true -- sin ningún
      // filtro (sanity check, sirve para CUALQUIER entidad). body.desde/
      // body.hasta -- filtra por AUDI_FECHA_ALTA (fecha real de creación
      // del registro en YiQi). body.asunto -- filtra por ORDC_ASUNTO,
      // específico de ORDEN_DE_COMPRA (no tiene sentido en otra entidad).
      let filters: Array<{ columnName: string; operator: string; value: string }> = [];
      if (body.desde && body.hasta) {
        filters = [
          { columnName: 'AUDI_FECHA_ALTA', operator: '>=', value: body.desde },
          { columnName: 'AUDI_FECHA_ALTA', operator: '<=', value: body.hasta },
        ];
      } else if (body.asunto) {
        const operador = body.operador || 'LIKE';
        const valorFiltro = operador === 'LIKE' ? `%${body.asunto}%` : body.asunto;
        filters = [{ columnName: 'ORDC_ASUNTO', operator: operador, value: valorFiltro }];
      }
      // columnas (5/9/2026): configurable por body.columns (string simple
      // o {field} ya armado) -- default son las columnas de ORDEN_DE_COMPRA
      // de siempre, para no romper las pruebas ya usadas.
      const columnasDefault = [
        { field: 'id' },
        { field: 'ORDC_NRO_OC' },
        { field: 'ORDC_ASUNTO' },
        { field: 'ORDC_FECHA' },
        { field: 'ORDC_TOTAL_NETO' },
        { field: 'ORDC_IMPORTE_TOTAL' },
        { field: 'AUDI_FECHA_ALTA' },
      ];
      const columnas = Array.isArray(body.columns) && body.columns.length > 0
        ? body.columns.map((c) => (typeof c === 'string' ? { field: c } : c))
        : columnasDefault;
      const respYiqi = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.bearer_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: 1,
          pageSize: body.pageSize || 20,
          columns: columnas,
          filters,
        }),
      });
      const json = await respYiqi.json().catch(() => null);
      return new Response(
        JSON.stringify({ ok: respYiqi.ok, status: respYiqi.status, url, filters, respuesta: json }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
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
//
// Ejemplo con la extensión del 5/9/2026 (consultar OTRA entidad, ej.
// UBICACION_STOCK, sin ningún filtro):
//
//   $body = @{
//     sin_filtro = $true
//     entidad    = "UBICACION_STOCK"
//     columns    = @("id", "CEDI_NOMBRE", "CEDI_CODIGO")
//     pageSize   = 100
//   } | ConvertTo-Json
//   Invoke-RestMethod `
//     -Uri "https://hsfudsnmooaesrzdwecg.supabase.co/functions/v1/yiqi-borrar-oc" `
//     -Method Post `
//     -Headers @{ Authorization = "Bearer TU_SERVICE_ROLE_KEY_ACA" } `
//     -ContentType "application/json" `
//     -Body $body
//
// Ejemplo con la extensión del 6/9/2026 (crear un registro crudo contra
// CUALQUIER entidad, ej. MOVIMIENTO_STOCK -- probar con datos mínimos
// antes de construir la integración real):
//
//   $body = @{
//     crear   = $true
//     entidad = "MOVIMIENTO_STOCK"
//     data    = @{
//       MATE_ID_MATE = 12345      # yiqi_id de material_yiqi para el SKU
//       MOST_CANTIDAD = 1
//       CEDI_ID_CED1 = 155        # destino (Local)
//       CEDI_ID_CEDI = 157        # origen (Central)
//       MOST_OBSERVACIONES = "Prueba minima 6/9/2026"
//     }
//   } | ConvertTo-Json
//   Invoke-RestMethod `
//     -Uri "https://hsfudsnmooaesrzdwecg.supabase.co/functions/v1/yiqi-borrar-oc" `
//     -Method Post `
//     -Headers @{ Authorization = "Bearer TU_SERVICE_ROLE_KEY_ACA" } `
//     -ContentType "application/json" `
//     -Body $body
// ============================================================
