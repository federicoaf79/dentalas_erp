// ============================================================
// supabase/functions/yiqi-connector/index.ts
// Dentalab-Compras — Conector real a YiQi (v3, agrega /smartie)
// ============================================================
//
// CAMBIOS EN ESTA VERSION (13 julio 2026):
//   - Se agrega soporte para /smartie con RANGO DE PAGINAS
//     (smartieId + pageDesde + pageHasta), para poder traer
//     reportes completos (que superan el limite de 50/100 de /search)
//     en una o pocas invocaciones de la funcion.
//   - Se agrega REPORTE_DE_OC a la whitelist (entidad real de la
//     smartie API_OC_Recientes, distinta de ORDEN_DE_COMPRA).
//   - /search y /{id} quedan EXACTAMENTE IGUAL que antes, sin tocar.
//
// FLUJO REAL VALIDADO (12-13 julio 2026):
//   1. POST https://api.yiqi.com.ar/token
//      Body x-www-form-urlencoded: username, password, grant_type=password
//      -> access_token (JWT, expira en ~4 anios, sin refresh token)
//   2. GET https://api.yiqi.com.ar/api/accountapi/GetLoginInformation
//      Header: Authorization: Bearer {token}
//      -> devuelve schemaId (OBLIGATORIO en todas las demas llamadas)
//   3. GET https://api.yiqi.com.ar/api/public/{ENTIDAD}/search?schemaId={id}
//      -> maximo 50-100 registros, SIN paginacion real
//   4. GET https://api.yiqi.com.ar/api/public/{ENTIDAD}/{id}?schemaId={id}
//      -> registro puntual CON arrays anidados (DETALLE, REMITOS, etc)
//   5. GET https://api.yiqi.com.ar/api/public/{ENTIDAD}/smartie?smartieId={id}&schemaId={id}&page={n}
//      -> reporte pre-armado en YiQi, SI pagina de verdad.
//         Respuesta: { data: [...], total: N, columns: [...] }
//         Tamaño de pagina configurado en YiQi (hoy: 100 filas/pagina
//         en las 3 smarties core del proyecto).
//
// SEGURIDAD:
//   - El Bearer token de YiQi vive SOLO en la tabla yiqi_config,
//     protegida por RLS para que solo el service_role la lea.
//   - Esta funcion corre con el service_role key de Supabase
//     (nunca expuesta al browser), por eso puede leer yiqi_config.
//   - El browser llama a ESTA funcion, nunca a YiQi directamente.
//
// ENTIDADES WHITELISTED:
//   MATERIAL, ORDEN_DE_COMPRA, FACTURA_COMPRA, DET_FACT_COMPRA, CLIENTE,
//   CONSULTA_DE_STOCK, CONSUL_MOV_DE_STOCK, LISTA_DE_PRECIO_COMP,
//   PRECIO_ARTICULO_COMP, REPORTE_DE_OC
//
// SMARTIES CORE DEL PROYECTO (13 julio 2026):
//   API_OC_Recientes        -> entidad REPORTE_DE_OC   -> smartieId 2340
//   API_Articulos_Stock     -> entidad MATERIAL        -> smartieId 2341
//   API_Proveedores_Activos -> entidad CLIENTE         -> smartieId 2343
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verificarLlamador, respuestaAuthError } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ENTIDADES_PERMITIDAS = [
  'MATERIAL',
  'ORDEN_DE_COMPRA',
  'FACTURA_COMPRA',
  'DET_FACT_COMPRA',
  'CLIENTE',
  'CONSULTA_DE_STOCK',
  'CONSUL_MOV_DE_STOCK',
  'LISTA_DE_PRECIO_COMP',
  'PRECIO_ARTICULO_COMP',
  'REPORTE_DE_OC',
];

// Maximo de paginas de smartie a traer en UNA sola invocacion de la
// funcion. Proteccion contra el timeout de Edge Functions (~150s).
// Con este tope, en el peor caso (llamadas lentas a YiQi de ~2s c/u),
// una invocacion tarda como maximo ~80s, dejando margen de sobra.
const MAX_PAGINAS_POR_INVOCACION = 40;

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://dentalab-compras.vercel.app';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// ------------------------------------------------------------
// Helper: leer la config de YiQi desde la tabla protegida
// ------------------------------------------------------------
async function getYiqiConfig(supabaseAdmin: ReturnType<typeof createClient>) {
  const { data, error } = await supabaseAdmin
    .from('yiqi_config')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error('No hay configuracion de YiQi cargada en yiqi_config: ' + (error?.message ?? 'sin datos'));
  }
  return data;
}

// ------------------------------------------------------------
// Helper: llamar a una entidad de YiQi via /search
// ------------------------------------------------------------
async function llamarYiqiSearch(baseUrl: string, entidad: string, schemaId: number, token: string) {
  const url = `${baseUrl}/api/public/${entidad}/search?schemaId=${schemaId}`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => '');
    throw new Error(`YiQi respondio ${resp.status} en ${entidad}/search: ${bodyText.slice(0, 300)}`);
  }

  return await resp.json();
}

// ------------------------------------------------------------
// Helper: llamar a una entidad de YiQi por ID puntual
// (trae arrays anidados como DETALLE, REMITOS, etc)
// ------------------------------------------------------------
async function llamarYiqiPorId(baseUrl: string, entidad: string, id: string, schemaId: number, token: string) {
  const url = `${baseUrl}/api/public/${entidad}/${id}?schemaId=${schemaId}`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => '');
    throw new Error(`YiQi respondio ${resp.status} en ${entidad}/${id}: ${bodyText.slice(0, 300)}`);
  }

  return await resp.json();
}

// ------------------------------------------------------------
// Helper: llamar a UNA pagina puntual de una smartie
// ------------------------------------------------------------
async function llamarYiqiSmartiePagina(
  baseUrl: string,
  entidad: string,
  smartieId: string,
  page: number,
  schemaId: number,
  token: string,
) {
  const url = `${baseUrl}/api/public/${entidad}/smartie?smartieId=${smartieId}&schemaId=${schemaId}&page=${page}`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => '');
    throw new Error(`YiQi respondio ${resp.status} en ${entidad}/smartie (page ${page}): ${bodyText.slice(0, 300)}`);
  }

  return await resp.json();
}

// ------------------------------------------------------------
// Helper: traer un RANGO de paginas de una smartie y combinarlas
// en un solo resultado. Corta antes si ya se cubrio el "total".
// ------------------------------------------------------------
async function llamarYiqiSmartieRango(
  baseUrl: string,
  entidad: string,
  smartieId: string,
  pageDesde: number,
  pageHasta: number,
  schemaId: number,
  token: string,
) {
  let dataAcumulada: unknown[] = [];
  let total = 0;
  let columns: unknown[] = [];
  let ultimaPaginaTraida = pageDesde - 1;

  for (let page = pageDesde; page <= pageHasta; page++) {
    const resultado = await llamarYiqiSmartiePagina(baseUrl, entidad, smartieId, page, schemaId, token);

    const dataPagina = Array.isArray(resultado?.data) ? resultado.data : [];
    total = typeof resultado?.total === 'number' ? resultado.total : total;
    columns = resultado?.columns ?? columns;

    dataAcumulada = dataAcumulada.concat(dataPagina);
    ultimaPaginaTraida = page;

    // Si ya cubrimos el total real, no hace falta seguir pidiendo paginas vacias
    if (total > 0 && dataAcumulada.length >= total) {
      break;
    }

    // Si YiQi devolvio una pagina vacia antes de llegar a pageHasta,
    // tambien cortamos (evita loops innecesarios)
    if (dataPagina.length === 0) {
      break;
    }
  }

  const hayMasPaginas = total > 0 && dataAcumulada.length < total;

  return {
    data: dataAcumulada,
    total,
    columns,
    pageDesde,
    pageHasta: ultimaPaginaTraida,
    hayMasPaginas,
    proximaPagina: hayMasPaginas ? ultimaPaginaTraida + 1 : null,
  };
}

// ------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cualquier usuario activo (admin u operador) puede usar el
    // conector -- no es admin-only, Ivana tambien lo necesita.
    // Antes del 7/8/2026 corría sin ningún chequeo de sesión.
    const chequeo = await verificarLlamador(req, supabaseAdmin);
    if (!chequeo.ok) return respuestaAuthError(chequeo, CORS_HEADERS);

    const url = new URL(req.url);
    const accion = url.searchParams.get('accion');
    const entidad = url.searchParams.get('entidad');
    const id = url.searchParams.get('id'); // opcional, para traer por ID puntual
    const smartieId = url.searchParams.get('smartieId'); // opcional, activa modo smartie
    const pageDesdeParam = url.searchParams.get('pageDesde');
    const pageHastaParam = url.searchParams.get('pageHasta');

    // ------------------------------------------------------
    // MODO ESTADO: diagnóstico seguro para la pantalla "Conector
    // YiQi" del frontend. NUNCA devuelve el bearer_token.
    // ------------------------------------------------------
    if (accion === 'estado') {
      try {
        const config = await getYiqiConfig(supabaseAdmin);
        return new Response(
          JSON.stringify({
            ok: true,
            conectado: true,
            baseUrl: config.base_url,
            schemaId: config.schema_id,
            ultimaSync: config.ultima_sync,
            entidadesPermitidas: ENTIDADES_PERMITIDAS,
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            ok: true,
            conectado: false,
            error: err instanceof Error ? err.message : 'Error desconocido',
            entidadesPermitidas: ENTIDADES_PERMITIDAS,
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!entidad) {
      return new Response(
        JSON.stringify({ error: 'Falta el parametro "entidad" en la query string' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!ENTIDADES_PERMITIDAS.includes(entidad)) {
      return new Response(
        JSON.stringify({
          error: `Entidad "${entidad}" no esta permitida`,
          entidades_permitidas: ENTIDADES_PERMITIDAS,
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const config = await getYiqiConfig(supabaseAdmin);

    // ------------------------------------------------------
    // MODO SMARTIE: si vino smartieId, ignoramos /search y /{id}
    // ------------------------------------------------------
    if (smartieId) {
      const pageDesde = pageDesdeParam ? parseInt(pageDesdeParam, 10) : 1;
      const pageHasta = pageHastaParam ? parseInt(pageHastaParam, 10) : pageDesde;

      if (isNaN(pageDesde) || isNaN(pageHasta) || pageDesde < 1 || pageHasta < pageDesde) {
        return new Response(
          JSON.stringify({ error: 'pageDesde/pageHasta invalidos. Deben ser numeros, pageHasta >= pageDesde.' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const cantidadPaginas = pageHasta - pageDesde + 1;
      if (cantidadPaginas > MAX_PAGINAS_POR_INVOCACION) {
        return new Response(
          JSON.stringify({
            error: `Rango de paginas demasiado grande (${cantidadPaginas}). Maximo permitido por invocacion: ${MAX_PAGINAS_POR_INVOCACION}. Dividir el pedido en mas invocaciones.`,
          }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const resultado = await llamarYiqiSmartieRango(
        config.base_url,
        entidad,
        smartieId,
        pageDesde,
        pageHasta,
        config.schema_id,
        config.bearer_token,
      );

      await supabaseAdmin
        .from('yiqi_config')
        .update({ ultima_sync: new Date().toISOString() })
        .eq('id', config.id);

      return new Response(
        JSON.stringify({
          ok: true,
          entidad,
          smartieId,
          ...resultado,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // ------------------------------------------------------
    // MODO CLASICO: /search o /{id} (sin cambios respecto a v2)
    // ------------------------------------------------------
    const data = id
      ? await llamarYiqiPorId(config.base_url, entidad, id, config.schema_id, config.bearer_token)
      : await llamarYiqiSearch(config.base_url, entidad, config.schema_id, config.bearer_token);

    await supabaseAdmin
      .from('yiqi_config')
      .update({ ultima_sync: new Date().toISOString() })
      .eq('id', config.id);

    return new Response(
      JSON.stringify({ ok: true, entidad, data }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Error en yiqi-connector:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================
// COMO SE LLAMA ESTA FUNCION DESDE EL FRONTEND:
//
// Modo clasico, lista (max 50-100, como antes):
// const { data, error } = await supabase.functions.invoke(
//   'yiqi-connector?entidad=MATERIAL'
// );
//
// Modo clasico, registro puntual con detalle anidado:
// const { data, error } = await supabase.functions.invoke(
//   'yiqi-connector?entidad=ORDEN_DE_COMPRA&id=22'
// );
//
// Modo smartie, UNA pagina:
// const { data, error } = await supabase.functions.invoke(
//   'yiqi-connector?entidad=MATERIAL&smartieId=2341&pageDesde=1&pageHasta=1'
// );
//
// Modo smartie, RANGO de paginas (ej: paginas 1 a 36 de Articulos_Stock):
// const { data, error } = await supabase.functions.invoke(
//   'yiqi-connector?entidad=MATERIAL&smartieId=2341&pageDesde=1&pageHasta=36'
// );
// // La respuesta trae: { ok, entidad, smartieId, data, total, columns,
// //                      pageDesde, pageHasta, hayMasPaginas, proximaPagina }
// // Si hayMasPaginas=true, el frontend hace una segunda invocacion con
// // pageDesde=proximaPagina y pageHasta=72 (o el limite que corresponda).
// ============================================================
