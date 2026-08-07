// ============================================================
// supabase/functions/sync-yiqi/index.ts
// Dentalab-Compras — Sincronización YiQi -> tablas espejo propias
// ============================================================
//
// Pensada para ser llamada por pg_cron (no por el frontend), pero
// también se puede invocar manualmente para forzar un sync.
//
// USO:
//   GET .../sync-yiqi?entidad=material   -> sincroniza MATERIAL (~7.173 filas)
//   GET .../sync-yiqi?entidad=oc         -> sincroniza REPORTE_DE_OC (~291 filas)
//   GET .../sync-yiqi?entidad=clientes   -> sincroniza CLIENTE (~1.151 filas)
//   GET .../sync-yiqi?entidad=ventas     -> sincroniza REPORTE_DE_VENTAS (pivoteado)
//   GET .../sync-yiqi?entidad=todos      -> las 4, en secuencia
//
// OJO CON "ventas": la smartie 2353 devuelve una tabla PIVOT (una fila
// por SKU+proveedor, una COLUMNA por mes). Esta funcion la APLANA a
// filas (mate_codigo, proveedor, periodo, cantidad) antes de guardarla.
// Los nombres de las columnas de mes son genericos (C2..C21) y vienen
// desordenados: el mes real se lee del mapeo field->title que YiQi manda
// en "columns". Por eso NO hay nada hardcodeado y los meses nuevos
// entran solos cuando pasa el tiempo.
//
// A diferencia de yiqi-connector (que responde al frontend y por
// eso tiene un tope de 40 páginas por invocación para no arriesgar
// el timeout de una request de browser), esta función corre en
// background disparada por cron, así que trae el conjunto COMPLETO
// de cada entidad en una sola invocación, sin tope de páginas.
//
// El upsert real vive en Postgres (funciones upsert_material_yiqi,
// upsert_ordenes_yiqi, upsert_clientes_yiqi — ver migracion-supabase.sql),
// que solo actualizan "actualizado_en" cuando el hash de los datos
// realmente cambió. Esta función solo arma el payload y llama a esas
// funciones.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// ------------------------------------------------------------
// Helper: leer la config de YiQi
// ------------------------------------------------------------
async function getYiqiConfig(supabaseAdmin: ReturnType<typeof createClient>) {
  const { data, error } = await supabaseAdmin
    .from('yiqi_config')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error('No hay configuracion de YiQi cargada: ' + (error?.message ?? 'sin datos'));
  }
  return data;
}

// ------------------------------------------------------------
// Helper: traer UNA pagina de una smartie
// ------------------------------------------------------------
async function traerPagina(
  baseUrl: string,
  entidad: string,
  smartieId: string,
  page: number,
  schemaId: number,
  token: string,
) {
  const url = `${baseUrl}/api/public/${entidad}/smartie?smartieId=${smartieId}&schemaId=${schemaId}&page=${page}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`YiQi respondio ${resp.status} en ${entidad}/smartie page ${page}: ${body.slice(0, 300)}`);
  }
  return await resp.json();
}

// ------------------------------------------------------------
// Helper: traer TODAS las paginas de una smartie (sin tope, esta
// funcion corre en background via cron, no responde a un browser)
// ------------------------------------------------------------
async function traerSmartieCompleta(
  baseUrl: string,
  entidad: string,
  smartieId: string,
  schemaId: number,
  token: string,
) {
  const primera = await traerPagina(baseUrl, entidad, smartieId, 1, schemaId, token);
  const total = primera.total ?? 0;
  const datosPagina1 = primera.data ?? [];

  // No asumimos un tamaño de pagina fijo (puede cambiar si alguien
  // renombra la smartie o ajusta "Registros por pagina" en YiQi).
  // Lo calculamos a partir de lo que YiQi realmente devolvio.
  const tamanioPaginaReal = datosPagina1.length;

  let acumulado = [...datosPagina1];

  if (tamanioPaginaReal > 0 && acumulado.length < total) {
    const totalPaginas = Math.ceil(total / tamanioPaginaReal);
    for (let page = 2; page <= totalPaginas; page++) {
      const resultado = await traerPagina(baseUrl, entidad, smartieId, page, schemaId, token);
      const datosPagina = resultado.data ?? [];
      if (datosPagina.length === 0) break; // proteccion contra loop infinito si YiQi devuelve vacio antes de tiempo
      acumulado = acumulado.concat(datosPagina);
    }
  }

  if (acumulado.length !== total) {
    console.warn(
      `Advertencia: se esperaban ${total} filas de ${entidad} pero se trajeron ${acumulado.length}. Revisar paginacion.`
    );
  }

  // Devolvemos tambien "columns": para las smarties pivoteadas (ventas)
  // ahi vive el mapeo field -> title que dice a que mes corresponde
  // cada columna generica C2..C21. Las entidades no pivoteadas lo ignoran.
  return { filas: acumulado, columnas: primera.columns ?? [] };
}

// ------------------------------------------------------------
// Helper: hash simple y estable de un objeto (para detectar
// cambios reales entre syncs, sin listar campo por campo en SQL)
// ------------------------------------------------------------
async function hashDeObjeto(obj: Record<string, unknown>): Promise<string> {
  const texto = JSON.stringify(obj, Object.keys(obj).sort());
  const data = new TextEncoder().encode(texto);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ------------------------------------------------------------
// Mapeo MATERIAL -> filas para upsert_material_yiqi
// ------------------------------------------------------------
async function mapearMaterial(filas: any[]) {
  const resultado = [];
  for (const f of filas) {
    const camposNegocio = {
      mate_codigo: f.MATE_CODIGO ?? null,
      mate_nombre: f.MATE_NOMBRE ?? null,
      clie_codigo: f.CLIE_CODIGO ?? null,
      clie_nombre: f.CLIE_NOMBRE ?? null,
      mate_stock_disponible: f.MATE_STOCK_DISPONIBLE ?? null,
      mate_stock_seguridad: f.MATE_STOCK_SEGURIDAD ?? null,
      mate_punto_de_pedido: f.MATE_PUNTO_DE_PEDIDO ?? null,
      mate_punto_pedido_max: f.MATE_PUNTO_PEDIDO_MAX ?? null,
      mate_lead_time: f.MATE_LEAD_TIME ?? f.MATE_LEAD_TIME_MAXIMO ?? null,
      mate_codigo_en_el_proveed: f.MATE_CODIGO_EN_EL_PROVEED ?? null,
      mate_notas_sobre_punto_de: f.MATE_NOTAS_SOBRE_PUNTO_DE ?? null,
      unit_cantidad_de_unidades: f.UNIT_CANTIDAD_DE_UNIDADES ?? null,
      mate_cantidad_de_unidades: f.MATE_CANTIDAD_DE_UNIDADES ?? null,
      mate_caja: f.MATE_CAJA ?? null,
      // Costo de reposicion. MATE_CRM ("CRM Neto") es SIN impuestos y es
      // el que hay que usar para valorizar una orden de compra.
      // MATE_CRM_FINAL trae el mismo costo con impuestos (~+21%).
      mate_crm: f.MATE_CRM ?? null,
      mate_crm_final: f.MATE_CRM_FINAL ?? null,
    };
    resultado.push({
      yiqi_id: f.id,
      ...camposNegocio,
      hash_datos: await hashDeObjeto(camposNegocio),
    });
  }
  return resultado;
}

// ------------------------------------------------------------
// Mapeo REPORTE_DE_OC -> filas para upsert_ordenes_yiqi
// ------------------------------------------------------------
async function mapearOrdenes(filas: any[]) {
  const resultado = [];
  for (const f of filas) {
    const camposNegocio = {
      nro_oc: f.NRO_OC != null ? String(f.NRO_OC) : null,
      proveedor: f.PROVEEDOR ?? null,
      fecha: f.FECHA ?? null,
      sku: f.SKU ?? null,
      nombre_art: f.NOMBRE_ART ?? null,
      cantidad: f.CANTIDAD ?? null,
      cantidad_entregada: f.CANTIDAD_ENTREGADA ?? null,
      cantidad_pendiente: f.CANTIDAD_PENDIENTE ?? null,
      asunto: f.ASUNTO ?? null,
      condicion_de_pago: f.CONDICION_DE_PAGO ?? null,
      subtotal: f.SUBTOTAL ?? null,
      total: f.TOTAL ?? null,
    };
    resultado.push({
      yiqi_id: f.id,
      ...camposNegocio,
      hash_datos: await hashDeObjeto(camposNegocio),
    });
  }
  return resultado;
}

// ------------------------------------------------------------
// Mapeo CLIENTE -> filas para upsert_clientes_yiqi
// ------------------------------------------------------------
async function mapearClientes(filas: any[]) {
  const resultado = [];
  for (const f of filas) {
    const camposNegocio = {
      clie_codigo: f.CLIE_CODIGO ?? null,
      clie_nombre: f.CLIE_NOMBRE ?? null,
      clie_razon_social: f.CLIE_RAZON_SOCIAL ?? null,
      clie_cuit: f.CLIE_CUIT ?? null,
      condicion_iva: f.COIV_DESCRIPCION ?? null,
      cuenta_gastos: f.CUGA_NOMBRE ?? null,
      mail: f.CLIE_MAIL ?? null,
      telefono: f.CLIE_TE1 ?? null,
    };
    resultado.push({
      yiqi_id: f.id,
      ...camposNegocio,
      hash_datos: await hashDeObjeto(camposNegocio),
    });
  }
  return resultado;
}

// ------------------------------------------------------------
// Mapeo REPORTE_DE_VENTAS (PIVOTEADO) -> filas planas
// ------------------------------------------------------------
// La smartie 2353 devuelve algo asi:
//   { CODIGO: "1000", PROVEEDOR: "DENTAL MEDRANO", C21: 5, C17: 40, ... }
// donde C21/C17/... son meses con nombre generico y DESORDENADO.
// El mes real solo se sabe leyendo "columns":
//   { field: "C17", title: "2025/01", PivotMode: 0, dataType: 11 }
//
// Estrategia: detectar como mes toda columna cuyo `title` tenga formato
// AAAA/MM. Asi, cuando YiQi agregue el mes que viene, entra solo.
// ------------------------------------------------------------

const REGEX_MES = /^(\d{4})\/(\d{2})$/;

function detectarColumnasDeMes(columnas: any[]) {
  const meses: { field: string; periodo: string }[] = [];
  for (const c of columnas ?? []) {
    const titulo = String(c?.title ?? '').trim();
    const m = REGEX_MES.exec(titulo);
    if (!m || !c?.field) continue;
    // periodo = primer dia del mes (la columna es DATE, no texto)
    meses.push({ field: String(c.field), periodo: `${m[1]}-${m[2]}-01` });
  }
  return meses;
}

function mapearVentas(filas: any[], columnas: any[]) {
  const meses = detectarColumnasDeMes(columnas);

  // Falla RUIDOSO a proposito: si el pivot cambio en YiQi, es mejor un
  // error visible que un sync "exitoso" que no guarda nada.
  if (meses.length === 0) {
    const titulos = (columnas ?? []).map((c: any) => c?.title).join(', ');
    throw new Error(
      'No se detecto ninguna columna de mes (formato AAAA/MM) en la smartie de ventas. ' +
      'Probablemente cambio la configuracion del pivot en YiQi. Titulos recibidos: ' + titulos
    );
  }

  const planas: Array<{
    mate_codigo: string;
    proveedor: string | null;
    periodo: string;
    cantidad: number;
  }> = [];

  let filasSinCodigo = 0;

  for (const f of filas) {
    const codigo = f?.CODIGO != null ? String(f.CODIGO).trim() : '';
    if (!codigo) {
      // Hay lineas historicas sin SKU (vistas en datos reales de 2019).
      // No sirven para calcular demanda por articulo.
      filasSinCodigo++;
      continue;
    }
    const proveedor = f?.PROVEEDOR != null && String(f.PROVEEDOR).trim() !== ''
      ? String(f.PROVEEDOR)
      : null;

    for (const mes of meses) {
      const valor = f[mes.field];
      // IMPORTANTE: 0 y los NEGATIVOS son datos VALIDOS (notas de credito,
      // devoluciones). La suma da la venta NETA, que es lo que hay que
      // reponer. Solo se descartan las celdas realmente vacias.
      if (valor === null || valor === undefined || valor === '') continue;
      const cantidad = Number(valor);
      if (!Number.isFinite(cantidad)) continue;

      planas.push({
        mate_codigo: codigo,
        proveedor,
        periodo: mes.periodo,
        cantidad,
      });
    }
  }

  return { planas, mesesDetectados: meses.length, filasSinCodigo };
}

// ------------------------------------------------------------
// Sincroniza VENTAS (caso especial: pivot + volumen + otro param)
// ------------------------------------------------------------
// Se separa de sincronizarEntidad por 3 diferencias reales:
//  1. hay que aplanar el pivot usando "columns"
//  2. el volumen aplanado es ~10x el de material -> se manda en tandas
//  3. upsert_ventas_mensual_yiqi recibe "p_filas", no "p_rows"
// ------------------------------------------------------------
const TAMANIO_TANDA_VENTAS = 5000;

async function sincronizarVentas(
  supabaseAdmin: ReturnType<typeof createClient>,
  config: any,
) {
  const { filas, columnas } = await traerSmartieCompleta(
    config.base_url,
    'REPORTE_DE_VENTAS',
    '2353', // API_Ventas_Mensual NO BORRAR
    config.schema_id,
    config.bearer_token,
  );

  const { planas, mesesDetectados, filasSinCodigo } = mapearVentas(filas, columnas);

  // El upsert es idempotente por (mate_codigo, periodo), asi que partir
  // en tandas es seguro: si una tanda se repitiera, no duplica nada.
  let filasEscritas = 0;
  for (let i = 0; i < planas.length; i += TAMANIO_TANDA_VENTAS) {
    const tanda = planas.slice(i, i + TAMANIO_TANDA_VENTAS);
    const { error } = await supabaseAdmin.rpc('upsert_ventas_mensual_yiqi', {
      p_filas: tanda,
    });
    if (error) {
      throw new Error(
        `Error en upsert_ventas_mensual_yiqi (tanda que empieza en ${i}): ${error.message}`
      );
    }
    filasEscritas += tanda.length;
  }

  return {
    entidad: 'ventas',
    filasSincronizadas: filasEscritas,
    filasPivotOrigen: filas.length,
    mesesDetectados,
    filasSinCodigo,
  };
}

// ------------------------------------------------------------
// Sincroniza una entidad puntual
// ------------------------------------------------------------
async function sincronizarEntidad(
  supabaseAdmin: ReturnType<typeof createClient>,
  config: any,
  entidad: 'material' | 'oc' | 'clientes',
) {
  const ENTIDAD_YIQI: Record<string, string> = {
    material: 'MATERIAL',
    oc: 'REPORTE_DE_OC',
    clientes: 'CLIENTE',
  };
  const SMARTIE_ID: Record<string, string> = {
    material: '2344', // API_Articulos_Stock NO BORRAR
    oc: '2345',       // API_OC_Recientes NO BORRAR
    clientes: '2346', // API_Proveedores_Activos NO BORRAR
  };

  const { filas } = await traerSmartieCompleta(
    config.base_url,
    ENTIDAD_YIQI[entidad],
    SMARTIE_ID[entidad],
    config.schema_id,
    config.bearer_token,
  );

  let filasMapeadas;
  let rpcNombre;
  if (entidad === 'material') {
    filasMapeadas = await mapearMaterial(filas);
    rpcNombre = 'upsert_material_yiqi';
  } else if (entidad === 'oc') {
    filasMapeadas = await mapearOrdenes(filas);
    rpcNombre = 'upsert_ordenes_yiqi';
  } else {
    filasMapeadas = await mapearClientes(filas);
    rpcNombre = 'upsert_clientes_yiqi';
  }

  const { error } = await supabaseAdmin.rpc(rpcNombre, { p_rows: filasMapeadas });
  if (error) {
    throw new Error(`Error en ${rpcNombre}: ${error.message}`);
  }

  return { entidad, filasSincronizadas: filasMapeadas.length };
}

// ------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const entidadParam = url.searchParams.get('entidad');

    const ENTIDADES_VALIDAS = ['material', 'oc', 'clientes', 'ventas', 'todos'];
    if (!entidadParam || !ENTIDADES_VALIDAS.includes(entidadParam)) {
      return new Response(
        JSON.stringify({
          error: 'Parametro "entidad" invalido. Usar: material | oc | clientes | ventas | todos',
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const config = await getYiqiConfig(supabaseAdmin);
    const resultados = [];

    const entidadesAProcesar =
      entidadParam === 'todos'
        ? (['material', 'oc', 'clientes', 'ventas'] as const)
        : ([entidadParam] as const);

    for (const entidad of entidadesAProcesar) {
      // ventas va por su propio camino: pivot + tandas + otro nombre de param
      const resultado =
        entidad === 'ventas'
          ? await sincronizarVentas(supabaseAdmin, config)
          : await sincronizarEntidad(supabaseAdmin, config, entidad as 'material' | 'oc' | 'clientes');
      resultados.push(resultado);
    }

    await supabaseAdmin
      .from('yiqi_config')
      .update({ ultima_sync: new Date().toISOString() })
      .eq('id', config.id);

    return new Response(
      JSON.stringify({ ok: true, resultados }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Error en sync-yiqi:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
