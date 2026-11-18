// ============================================================
// supabase/functions/remito-interno-yiqi/index.ts
// Dentalab-Compras — Remito Interno de YiQi (camino B, decisión 18/11/2026)
// ============================================================
//
// La app PLANIFICA los pedidos entre depósitos (reglas ABC, tope de pedidos
// abiertos, recálculo de los que están en espera, pedidos manuales) y los
// ESCRIBE en YiQi como "Remito Interno" Pendiente. Los depósitos los ejecutan
// en YiQi como hoy (Enviar -> cargan recibidos -> Procesado) y la app lee el
// estado de vuelta. YiQi mueve el stock solo al procesar ("Crea mov. de stock
// de los recibidos"): por eso esta función NO escribe MOVIMIENTO_STOCK y
// mover-stock-reposicion se saltea los pedidos con gestion_en_yiqi = true.
//
// POST con body { accion, solicitud_id? }:
//   publicar    (+ solicitud_id)  POST /REMITO_INTERNO. Escritura.
//   actualizar  (+ solicitud_id)  PUT  /REMITO_INTERNO/{id} si en YiQi sigue Pendiente. Escritura.
//   sincronizar (id opcional)     SOLO LECTURA (GET). Anda también en modo prueba.
//   ciclo                         lo llama el cron cada 10 min: publica, actualiza, sincroniza.
//
// ESCRITURA (publicar / actualizar / la parte de escritura del ciclo) exige las dos
// llaves: reglas_compra.escritura_yiqi_habilitada = true (modo prueba general) Y
// reglas_reposicion_central.escribir_remito_en_yiqi = true. Si falta cualquiera,
// responde modo_prueba sin tocar la base ni YiQi.
//
// El mapeo del estado de YiQi -> pedido de la app vive en SQL:
// public.aplicar_estado_remito_yiqi(solicitud_id, payload) (ver la migración
// 20261118180000_remito_interno_yiqi.sql).
//
// ⚠ A VALIDAR EN LA PRUEBA CONTROLADA EN YIQI (no hay forma de probarlo sin escribir):
//   - POST /api/public/REMITO_INTERNO?schemaId=328 con { schemaId, data: { ..., ITEMSENVIADOS: [...] } }
//     y que devuelva el id en `ID` (como ORDEN_DE_COMPRA / MOVIMIENTO_STOCK).
//   - PUT /api/public/REMITO_INTERNO/{id}?schemaId=328 con el mismo wrapper: que REEMPLACE
//     ITEMSENVIADOS (y no los duplique ni los ignore).
//   - REIN_FECHA con formato YYYY-MM-DD, y que los campos obligatorios alcancen.
//   - Forma de la respuesta del GET (se acepta el registro directo o dentro de `data`).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verificarLlamador, respuestaAuthError } from '../_shared/auth.ts';
import { getYiqiConfig } from '../_shared/yiqiConfig.ts';
import { escrituraYiqiHabilitada, respuestaModoPrueba } from '../_shared/escrituraYiqi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://dentalab-compras.vercel.app';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// TIUN_ID_TIUN = 2 -> "Unidades" (visto en el GET real del remito 6601, 18/11/2026).
const TIUN_ID_TIUN_UNIDAD = 2;

// Topes por corrida del ciclo (el cron corre cada 10 min; el resto sigue en la próxima).
const MAX_PUBLICAR_POR_CICLO = 20;
const MAX_ACTUALIZAR_POR_CICLO = 20;
const MAX_SINCRONIZAR_POR_CICLO = 100;

const FETCH_TIMEOUT_MS = 30_000;

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Fecha de hoy en Argentina (YYYY-MM-DD), no en UTC.
function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

async function fetchConTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function urlRemito(config: any, id?: number | string): string {
  const base = `${config.base_url}/api/public/REMITO_INTERNO`;
  return `${id != null ? `${base}/${id}` : base}?schemaId=${config.schema_id}`;
}

function headersYiqi(config: any): Record<string, string> {
  return { Authorization: `Bearer ${config.bearer_token}`, 'Content-Type': 'application/json' };
}

// ------------------------------------------------------------
// Lectura del remito en YiQi (GET) y normalización para aplicar_estado_remito_yiqi()
// ------------------------------------------------------------
type RemitoNormalizado = {
  existe: boolean;
  estado?: string;
  nro?: number | null;
  hay_diferencias?: boolean;
  items_enviados?: { mate_id: number; cantidad: number; estado: string | null }[];
  items_recibidos?: { mate_id: number; cantidad: number }[];
};

function normalizarRemito(reg: any): RemitoNormalizado {
  const enviados = Array.isArray(reg?.ITEMSENVIADOS) ? reg.ITEMSENVIADOS : [];
  const recibidos = Array.isArray(reg?.ITEMSRECIBIDOS) ? reg.ITEMSRECIBIDOS : [];
  return {
    existe: true,
    estado: reg?.ESTA_NOMBRE != null ? String(reg.ESTA_NOMBRE) : '',
    nro: reg?.REIN_NRO_REMITO_INTERNO != null ? Number(reg.REIN_NRO_REMITO_INTERNO) : null,
    hay_diferencias: reg?.REIN_HAY_DIFERENCIAS === 'S',
    items_enviados: enviados
      .filter((i: any) => i?.MATE_ID_MATE != null)
      .map((i: any) => ({
        mate_id: Number(i.MATE_ID_MATE),
        cantidad: Number(i.DERI_CANTIDAD) || 0,
        estado: i.ESTA_NOMBRE != null ? String(i.ESTA_NOMBRE) : null,
      })),
    items_recibidos: recibidos
      .filter((i: any) => i?.MATE_ID_MATE != null)
      .map((i: any) => ({
        mate_id: Number(i.MATE_ID_MATE),
        cantidad: Number(i.REIR_CANTIDAD) || 0,
      })),
  };
}

// GET /REMITO_INTERNO/{id}. 404 -> { existe: false }. Cualquier otro error HTTP o de red
// TIRA: no se interpreta como "no existe" (anularía el pedido por un 500 pasajero).
async function leerRemito(config: any, remitoId: number): Promise<RemitoNormalizado> {
  const resp = await fetchConTimeout(urlRemito(config, remitoId), { method: 'GET', headers: headersYiqi(config) });
  if (resp.status === 404) return { existe: false };
  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    throw new Error(`YiQi respondió ${resp.status} al leer el Remito Interno ${remitoId}: ${texto.slice(0, 300)}`);
  }
  const data = await resp.json().catch(() => null);
  let reg = data?.data ?? data;
  if (Array.isArray(reg)) reg = reg[0];
  if (!reg || typeof reg !== 'object') {
    throw new Error(`Respuesta vacía o inesperada de YiQi al leer el Remito Interno ${remitoId}`);
  }
  return normalizarRemito(reg);
}

// ------------------------------------------------------------
// Interruptores
// ------------------------------------------------------------
async function estadoEscritura(supabaseAdmin: any): Promise<{ compra: boolean; remito: boolean; usuario: number }> {
  const compra = await escrituraYiqiHabilitada(supabaseAdmin);
  let remito = false;
  let usuario = 156;
  try {
    const { data } = await supabaseAdmin
      .from('reglas_reposicion_central')
      .select('escribir_remito_en_yiqi, yiqi_usuario_responsable')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    remito = data?.escribir_remito_en_yiqi === true; // fail-closed
    if (Number.isInteger(data?.yiqi_usuario_responsable)) usuario = data.yiqi_usuario_responsable;
  } catch {
    remito = false;
  }
  return { compra, remito, usuario };
}

function respuestaApagado(est: { compra: boolean; remito: boolean }): Response {
  if (!est.compra) return respuestaModoPrueba(CORS_HEADERS);
  return respuestaModoPrueba(CORS_HEADERS, {
    error: 'La escritura de Remitos Internos en YiQi está apagada (reglas_reposicion_central.escribir_remito_en_yiqi = false). No se envió nada a YiQi.',
    remito_apagado: true,
  });
}

// ------------------------------------------------------------
// Armado de ítems desde las líneas del pedido
// ------------------------------------------------------------
async function armarItems(supabaseAdmin: any, solicitudId: number): Promise<
  { ok: true; items: any[]; skus: string[] } | { ok: false; sinLineas?: boolean; error?: string }
> {
  const { data: lineas, error: errL } = await supabaseAdmin
    .from('solicitudes_reposicion_lineas')
    .select('sku, cantidad_solicitada, no_previsto')
    .eq('solicitud_id', solicitudId)
    .order('id', { ascending: true });
  if (errL) throw new Error(`Error leyendo las líneas del pedido: ${errL.message}`);

  const validas = (lineas ?? []).filter((l: any) => !l.no_previsto && Number(l.cantidad_solicitada) > 0);
  if (validas.length === 0) return { ok: false, sinLineas: true };

  const skus = [...new Set(validas.map((l: any) => String(l.sku)))] as string[];
  const { data: mats, error: errM } = await supabaseAdmin
    .from('material_yiqi')
    .select('mate_codigo, yiqi_id')
    .in('mate_codigo', skus);
  if (errM) throw new Error(`Error leyendo material_yiqi: ${errM.message}`);
  const mapa = new Map<string, number>();
  for (const m of mats ?? []) if (m.yiqi_id != null) mapa.set(String(m.mate_codigo), Number(m.yiqi_id));

  const faltan = skus.filter((s) => !mapa.has(s));
  if (faltan.length > 0) {
    return {
      ok: false,
      error: `Faltan en el catálogo de YiQi (sin yiqi_id en material_yiqi), no se publicó: ${faltan.slice(0, 20).join(', ')}${faltan.length > 20 ? '…' : ''}`,
    };
  }

  // Un ítem por SKU (si hubiera líneas repetidas se suman).
  const acum = new Map<string, number>();
  for (const l of validas) acum.set(String(l.sku), (acum.get(String(l.sku)) ?? 0) + Number(l.cantidad_solicitada));
  const items = [...acum.entries()].map(([sku, cant]) => ({
    MATE_ID_MATE: mapa.get(sku),
    DERI_CANTIDAD: cant,
    TIUN_ID_TIUN: TIUN_ID_TIUN_UNIDAD,
  }));
  return { ok: true, items, skus };
}

// ------------------------------------------------------------
// publicar
// ------------------------------------------------------------
async function publicar(supabaseAdmin: any, solicitudId: number, usuarioResp: number): Promise<Record<string, unknown>> {
  const { data: sol, error: errS } = await supabaseAdmin
    .from('solicitudes_reposicion')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (errS) throw new Error(`Error leyendo el pedido: ${errS.message}`);
  if (!sol) return { ok: false, solicitud_id: solicitudId, error: `No existe el pedido #${solicitudId}` };

  // Idempotencia
  if (sol.yiqi_remito_id) {
    return { ok: true, solicitud_id: solicitudId, publicada: false, ya_publicado: true,
      yiqi_remito_id: sol.yiqi_remito_id, yiqi_remito_nro: sol.yiqi_remito_nro };
  }
  if (sol.estado !== 'en_preparacion') {
    return { ok: true, solicitud_id: solicitudId, publicada: false,
      motivo: `El pedido está "${sol.estado}": solo se publican los pedidos en preparación` };
  }

  const armado = await armarItems(supabaseAdmin, solicitudId);
  if (!armado.ok) {
    if (armado.sinLineas) {
      return { ok: true, solicitud_id: solicitudId, publicada: false, motivo: 'El pedido no tiene líneas' };
    }
    await supabaseAdmin.from('solicitudes_reposicion').update({ yiqi_error: armado.error!.slice(0, 1000) }).eq('id', solicitudId);
    return { ok: false, solicitud_id: solicitudId, error: armado.error };
  }

  // Candado anti-duplicados (click del usuario vs. cron).
  const { data: reclamado, error: errR } = await supabaseAdmin.rpc('reclamar_publicacion_yiqi', { p_solicitud_id: solicitudId });
  if (errR) throw new Error(`Error reclamando la publicación: ${errR.message}`);
  if (!reclamado) {
    return { ok: true, solicitud_id: solicitudId, publicada: false, motivo: 'Otro proceso lo está publicando (o hay un candado de seguridad): se reintenta en el próximo ciclo' };
  }

  let remitoId: number | null = null;
  try {
    const config = await getYiqiConfig(supabaseAdmin, 'remito-interno-yiqi:publicar');
    const manual = sol.generada_por === 'manual' ? 'manual' : 'automático';
    const observacion = `Dentalab-Compras ${sol.remito_numero ?? '#' + sol.id} (${manual})`.slice(0, 200);

    const payload = {
      schemaId: config.schema_id,
      data: {
        REIN_FECHA: hoyArgentina(),
        REIN_USUARIO_RESPONSABLE: usuarioResp,
        CEDI_ID_CEDI: sol.deposito_origen_id,   // origen
        CEDI_ID_CED1: sol.deposito_destino_id,  // destino
        REIN_OBSERVACION: observacion,
        ITEMSENVIADOS: armado.items,
      },
    };

    const resp = await fetchConTimeout(urlRemito(config), {
      method: 'POST',
      headers: headersYiqi(config),
      body: JSON.stringify(payload),
    });
    const texto = await resp.text().catch(() => '');
    if (!resp.ok) {
      throw new Error(`YiQi respondió ${resp.status} al crear el Remito Interno: ${texto.slice(0, 400)}`);
    }
    let dataYiqi: any = null;
    try { dataYiqi = JSON.parse(texto); } catch { /* sin JSON */ }
    const id = dataYiqi?.ID ?? dataYiqi?.id ?? dataYiqi?.newId ?? dataYiqi?.parameter?.id ?? null;
    if (id == null) {
      // YiQi pudo haberlo creado y no sabemos cuál es: bloquea los reintentos automáticos
      // (candado a futuro) para no repetir el incidente de los duplicados de OC (18-20/8).
      const lejos = new Date(Date.now() + 3650 * 86_400_000).toISOString();
      await supabaseAdmin.from('solicitudes_reposicion').update({
        yiqi_publicando_en: lejos,
        yiqi_error: ('ATENCIÓN: YiQi respondió OK pero sin id; puede haber creado el Remito Interno. Revisar en YiQi (Observación "' +
          observacion + '") antes de reintentar. Respuesta: ' + texto.slice(0, 300)).slice(0, 1000),
      }).eq('id', solicitudId);
      return { ok: false, solicitud_id: solicitudId, error: 'YiQi respondió OK pero sin id: revisar a mano en YiQi antes de reintentar', bloqueado: true };
    }
    remitoId = Number(id);

    // Se guarda el id YA, antes de cualquier otra cosa.
    const { error: errU } = await supabaseAdmin
      .from('solicitudes_reposicion')
      .update({
        yiqi_remito_id: remitoId,
        gestion_en_yiqi: true,
        yiqi_publicado_en: new Date().toISOString(),
        yiqi_requiere_actualizar: false,
        yiqi_publicando_en: null,
        yiqi_error: null,
      })
      .eq('id', solicitudId);
    if (errU) {
      console.error(`[remito-interno-yiqi] CREADO en YiQi (id ${remitoId}) pero no se pudo guardar localmente el pedido #${solicitudId}:`, errU.message);
      throw new Error(`Se creó en YiQi (id ${remitoId}) pero no se pudo guardar localmente: ${errU.message}`);
    }

    // GET para traer el número visible y el estado.
    try {
      const r = await leerRemito(config, remitoId);
      await supabaseAdmin
        .from('solicitudes_reposicion')
        .update({
          yiqi_remito_nro: r.nro ?? null,
          yiqi_remito_estado: r.estado || 'Pendiente',
          yiqi_hay_diferencias: r.hay_diferencias ?? false,
          yiqi_sincronizado_en: new Date().toISOString(),
        })
        .eq('id', solicitudId);
      console.log(`[remito-interno-yiqi] pedido #${solicitudId} publicado: id ${remitoId}, N° ${r.nro}`);
      return { ok: true, solicitud_id: solicitudId, publicada: true, yiqi_remito_id: remitoId, yiqi_remito_nro: r.nro ?? null };
    } catch (eGet) {
      await supabaseAdmin
        .from('solicitudes_reposicion')
        .update({ yiqi_error: ('Aviso: publicado (id ' + remitoId + ') pero no se pudo leer el número: ' + mensajeDe(eGet)).slice(0, 1000) })
        .eq('id', solicitudId);
      return { ok: true, solicitud_id: solicitudId, publicada: true, yiqi_remito_id: remitoId, yiqi_remito_nro: null,
        aviso: 'Publicado, pero no se pudo leer el número del remito (lo trae la próxima sincronización)' };
    }
  } catch (e) {
    const mensaje = mensajeDe(e);
    console.error(`[remito-interno-yiqi] error publicando el pedido #${solicitudId}:`, mensaje);
    // Libera el candado (si se creó el remito ya quedó guardado arriba y no se pisa el id).
    await supabaseAdmin
      .from('solicitudes_reposicion')
      .update({ yiqi_publicando_en: null, yiqi_error: mensaje.slice(0, 1000) })
      .eq('id', solicitudId);
    return { ok: false, solicitud_id: solicitudId, error: mensaje, yiqi_remito_id: remitoId };
  }
}

// ------------------------------------------------------------
// aplicar estado leído (RPC SQL) y sincronizar
// ------------------------------------------------------------
async function aplicarEstado(supabaseAdmin: any, solicitudId: number, remito: RemitoNormalizado) {
  const { data, error } = await supabaseAdmin.rpc('aplicar_estado_remito_yiqi', { p_solicitud_id: solicitudId, p_payload: remito });
  if (error) throw new Error(`Error aplicando el estado del remito: ${error.message}`);
  return data;
}

async function sincronizarUno(supabaseAdmin: any, config: any, sol: any): Promise<Record<string, unknown>> {
  try {
    const remito = await leerRemito(config, Number(sol.yiqi_remito_id));
    const r = await aplicarEstado(supabaseAdmin, sol.id, remito);
    return { solicitud_id: sol.id, ok: true, estado_yiqi: remito.existe ? remito.estado : 'No existe', ...r };
  } catch (e) {
    const mensaje = mensajeDe(e);
    console.error(`[remito-interno-yiqi] error sincronizando el pedido #${sol.id}:`, mensaje);
    // Prefijo "Aviso:" -> la próxima lectura exitosa lo limpia sola (ver aplicar_estado_remito_yiqi).
    await supabaseAdmin
      .from('solicitudes_reposicion')
      .update({ yiqi_error: ('Aviso: no se pudo leer el Remito Interno de YiQi: ' + mensaje).slice(0, 1000) })
      .eq('id', sol.id);
    return { solicitud_id: sol.id, ok: false, error: mensaje };
  }
}

async function sincronizar(supabaseAdmin: any, solicitudId: number | null, limite = MAX_SINCRONIZAR_POR_CICLO): Promise<Record<string, unknown>> {
  let q = supabaseAdmin
    .from('solicitudes_reposicion')
    .select('id, yiqi_remito_id, estado')
    .eq('gestion_en_yiqi', true)
    .not('yiqi_remito_id', 'is', null)
    .in('estado', ['solicitada', 'en_preparacion'])
    .order('yiqi_sincronizado_en', { ascending: true, nullsFirst: true })
    .limit(limite);
  if (solicitudId != null) q = q.eq('id', solicitudId);
  const { data: pedidos, error } = await q;
  if (error) throw new Error(`Error listando pedidos publicados: ${error.message}`);
  if (!pedidos || pedidos.length === 0) return { ok: true, sincronizados: 0, resultados: [] };

  const config = await getYiqiConfig(supabaseAdmin, 'remito-interno-yiqi:sincronizar');
  const resultados = [];
  for (const p of pedidos) resultados.push(await sincronizarUno(supabaseAdmin, config, p));
  return { ok: true, sincronizados: resultados.filter((r) => r.ok).length, resultados };
}

// ------------------------------------------------------------
// actualizar
// ------------------------------------------------------------
async function actualizar(supabaseAdmin: any, solicitudId: number): Promise<Record<string, unknown>> {
  const { data: sol, error: errS } = await supabaseAdmin
    .from('solicitudes_reposicion')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (errS) throw new Error(`Error leyendo el pedido: ${errS.message}`);
  if (!sol) return { ok: false, solicitud_id: solicitudId, error: `No existe el pedido #${solicitudId}` };
  if (!sol.yiqi_remito_id) {
    return { ok: true, solicitud_id: solicitudId, actualizada: false, motivo: 'El pedido todavía no está publicado en YiQi' };
  }
  if (!['solicitada', 'en_preparacion'].includes(sol.estado)) {
    return { ok: true, solicitud_id: solicitudId, actualizada: false, motivo: `El pedido está "${sol.estado}"` };
  }

  try {
    const config = await getYiqiConfig(supabaseAdmin, 'remito-interno-yiqi:actualizar');
    const remito = await leerRemito(config, Number(sol.yiqi_remito_id));

    const hayEnviados = (remito.items_enviados ?? []).some((i) => /enviad/i.test(i.estado ?? ''));
    const sigueNoIniciado = remito.existe && /^pendiente$/i.test((remito.estado ?? '').trim()) && !hayEnviados;

    if (!sigueNoIniciado) {
      // Ya no está Pendiente (o no existe): no se toca YiQi. El espejo marca armado_iniciado_en,
      // limpia yiqi_requiere_actualizar y refleja el estado.
      const r = await aplicarEstado(supabaseAdmin, solicitudId, remito);
      return { ok: true, solicitud_id: solicitudId, actualizada: false,
        motivo: remito.existe ? `En YiQi ya no está Pendiente (${remito.estado})` : 'El remito ya no existe en YiQi', ...r };
    }

    const armado = await armarItems(supabaseAdmin, solicitudId);
    if (!armado.ok) {
      const msg = armado.sinLineas ? 'El pedido quedó sin líneas: no se actualiza el remito de YiQi' : armado.error!;
      await supabaseAdmin.from('solicitudes_reposicion').update({ yiqi_error: msg.slice(0, 1000) }).eq('id', solicitudId);
      return { ok: false, solicitud_id: solicitudId, error: msg };
    }

    // ⚠ A validar: que el PUT reemplace ITEMSENVIADOS (no los duplique).
    const resp = await fetchConTimeout(urlRemito(config, sol.yiqi_remito_id), {
      method: 'PUT',
      headers: headersYiqi(config),
      body: JSON.stringify({ schemaId: config.schema_id, data: { ITEMSENVIADOS: armado.items } }),
    });
    if (!resp.ok) {
      const texto = await resp.text().catch(() => '');
      throw new Error(`YiQi respondió ${resp.status} al actualizar el Remito Interno ${sol.yiqi_remito_id}: ${texto.slice(0, 400)}`);
    }

    await supabaseAdmin
      .from('solicitudes_reposicion')
      .update({
        yiqi_requiere_actualizar: false,
        yiqi_error: null,
        yiqi_sincronizado_en: new Date().toISOString(),
      })
      .eq('id', solicitudId);
    console.log(`[remito-interno-yiqi] pedido #${solicitudId}: remito ${sol.yiqi_remito_id} actualizado (${armado.items.length} ítems)`);
    return { ok: true, solicitud_id: solicitudId, actualizada: true, items: armado.items.length };
  } catch (e) {
    const mensaje = mensajeDe(e);
    console.error(`[remito-interno-yiqi] error actualizando el pedido #${solicitudId}:`, mensaje);
    // yiqi_requiere_actualizar queda en true: el próximo ciclo reintenta.
    await supabaseAdmin
      .from('solicitudes_reposicion')
      .update({ yiqi_error: mensaje.slice(0, 1000) })
      .eq('id', solicitudId);
    return { ok: false, solicitud_id: solicitudId, error: mensaje };
  }
}

// ------------------------------------------------------------
// ciclo (cron)
// ------------------------------------------------------------
async function ciclo(supabaseAdmin: any): Promise<Record<string, unknown>> {
  const est = await estadoEscritura(supabaseAdmin);
  const escritura = est.compra && est.remito;
  const resumen: Record<string, any> = {
    ok: true,
    escritura_habilitada: escritura,
    publicados: [] as unknown[],
    actualizados: [] as unknown[],
    sincronizados: 0,
    errores: [] as unknown[],
  };

  if (escritura) {
    // 1) Publicar los en preparación que todavía no están en YiQi (automáticos y manuales).
    const { data: pend, error: errP } = await supabaseAdmin
      .from('solicitudes_reposicion')
      .select('id')
      .eq('estado', 'en_preparacion')
      .is('yiqi_remito_id', null)
      .order('id', { ascending: true })
      .limit(MAX_PUBLICAR_POR_CICLO);
    if (errP) throw new Error(`Error listando pedidos a publicar: ${errP.message}`);
    for (const p of pend ?? []) {
      const r = await publicar(supabaseAdmin, p.id, est.usuario);
      if (r.publicada) resumen.publicados.push({ solicitud_id: p.id, yiqi_remito_id: r.yiqi_remito_id, yiqi_remito_nro: r.yiqi_remito_nro });
      else if (r.ok === false) resumen.errores.push({ solicitud_id: p.id, accion: 'publicar', error: r.error });
    }

    // 2) Actualizar los publicados marcados.
    const { data: upd, error: errA } = await supabaseAdmin
      .from('solicitudes_reposicion')
      .select('id')
      .eq('yiqi_requiere_actualizar', true)
      .not('yiqi_remito_id', 'is', null)
      .in('estado', ['solicitada', 'en_preparacion'])
      .order('id', { ascending: true })
      .limit(MAX_ACTUALIZAR_POR_CICLO);
    if (errA) throw new Error(`Error listando pedidos a actualizar: ${errA.message}`);
    for (const p of upd ?? []) {
      const r = await actualizar(supabaseAdmin, p.id);
      if (r.actualizada) resumen.actualizados.push({ solicitud_id: p.id });
      else if (r.ok === false) resumen.errores.push({ solicitud_id: p.id, accion: 'actualizar', error: r.error });
    }
  }

  // 3) Sincronizar los publicados abiertos (solo lectura; anda siempre).
  const s: any = await sincronizar(supabaseAdmin, null);
  resumen.sincronizados = s.sincronizados ?? 0;
  for (const r of s.resultados ?? []) {
    if (r.ok === false) resumen.errores.push({ solicitud_id: r.solicitud_id, accion: 'sincronizar', error: r.error });
  }
  return resumen;
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Service role (cron) o usuario logueado. Los permisos finos van abajo.
    const chequeo = await verificarLlamador(req, supabaseAdmin);
    if (!chequeo.ok) return respuestaAuthError(chequeo, CORS_HEADERS);
    const esServicio = chequeo.esServiceRole;
    const esAdmin = !chequeo.esServiceRole && chequeo.rol === 'admin';

    let body: { accion?: string; solicitud_id?: number };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'Body inválido: se espera JSON con { accion, solicitud_id? }' }, 400);
    }

    const accion = body.accion;
    if (!['publicar', 'actualizar', 'sincronizar', 'ciclo'].includes(accion ?? '')) {
      return json({ ok: false, error: 'Falta "accion": publicar | actualizar | sincronizar | ciclo' }, 400);
    }

    const solicitudId = body.solicitud_id != null ? Number(body.solicitud_id) : null;
    if (solicitudId != null && !Number.isInteger(solicitudId)) {
      return json({ ok: false, error: '"solicitud_id" tiene que ser numérico' }, 400);
    }

    // Permisos
    if (accion === 'ciclo' || (accion === 'sincronizar' && solicitudId == null)) {
      if (!esServicio && !esAdmin) {
        return json({ ok: false, error: 'Esta acción requiere rol admin' }, 403);
      }
    } else {
      if (solicitudId == null) {
        return json({ ok: false, error: `La acción "${accion}" requiere "solicitud_id"` }, 400);
      }
      if (!esServicio && !esAdmin) {
        const { data: sol } = await supabaseAdmin
          .from('solicitudes_reposicion')
          .select('deposito_origen_id, deposito_destino_id')
          .eq('id', solicitudId)
          .maybeSingle();
        const { data: deps } = await supabaseAdmin
          .from('usuario_deposito')
          .select('deposito_id')
          .eq('usuario_id', (chequeo as { userId: string }).userId);
        const mis = new Set((deps ?? []).map((d: any) => Number(d.deposito_id)));
        if (!sol || !(mis.has(Number(sol.deposito_origen_id)) || mis.has(Number(sol.deposito_destino_id)))) {
          return json({ ok: false, error: 'No tenés acceso a este pedido' }, 403);
        }
      }
    }

    // Solo lectura: anda también en modo prueba.
    if (accion === 'sincronizar') {
      return json(await sincronizar(supabaseAdmin, solicitudId));
    }

    if (accion === 'ciclo') {
      return json(await ciclo(supabaseAdmin));
    }

    // Escritura: las dos llaves.
    const est = await estadoEscritura(supabaseAdmin);
    if (!(est.compra && est.remito)) return respuestaApagado(est);

    if (accion === 'publicar') {
      return json(await publicar(supabaseAdmin, solicitudId!, est.usuario));
    }
    return json(await actualizar(supabaseAdmin, solicitudId!));
  } catch (err) {
    console.error('Error en remito-interno-yiqi:', err);
    return json({ ok: false, error: mensajeDe(err) }, 500);
  }
});

// ============================================================
// COMO SE LLAMA DESDE EL FRONTEND (después de crear/editar un pedido):
//
// try {
//   await supabase.rpc('publicar_pedido_en_yiqi_pendiente', { p_solicitud_id: id }) // marca intención
//   const { data } = await supabase.functions.invoke('remito-interno-yiqi', {
//     body: { accion: 'publicar', solicitud_id: id },   // o 'actualizar' si ya estaba publicado
//   })
//   // data.modo_prueba === true -> nada se escribió (modo prueba).
// } catch (e) { console.error('[remito-interno-yiqi]', e) } // no bloqueante
// ============================================================
