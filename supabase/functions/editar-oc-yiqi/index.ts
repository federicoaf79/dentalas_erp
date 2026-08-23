// ============================================================
// supabase/functions/editar-oc-yiqi/index.ts
// Dentalab-Compras — Agregar mercadería a una OC YA vinculada a YiQi
// ============================================================
//
// Agregado 23/8/2026, a pedido de Federico: "que se permita editar las
// OC una vez creadas y aprobadas, para que Aris o Ivana puedan sumar
// mercadería por arriba de lo solicitado."
//
// Alcance de HOY: solo agregar líneas NUEVAS a una orden que ya tiene
// yiqi_id_creado. No permite tocar cantidades/precios de líneas que ya
// estaban (eso es una decisión de negocio distinta, no pedida hoy) ni
// borrar líneas.
//
// Por qué es seguro (probado en vivo el 23/8/2026 contra la OC de
// prueba real #9, yiqi_id=1689, ver PROMPT_CONTINUIDAD_Dentalab-Compras.md
// sesión 23/8/2026):
//   - PUT /ORDEN_DE_COMPRA/{id} con { DETALLE: [...] } SIN "id" en cada
//     línea hace que YiQi cree líneas nuevas (no pisa las que ya
//     estaban) y recalcula TODOS los totales de la orden solo.
//   - Si a una línea nueva no se le manda precio + ALIV_ID_ALIV, YiQi
//     la acepta pero la deja en $0 -- por eso acá se arma el DETALLE
//     exactamente como enviar-oc-yiqi arma una OC nueva (mismas
//     constantes TIUN_ID_TIUN/ALIV_ID_ALIV, mismo cálculo de IVA).
//
// LO QUE TODAVÍA NO SE PROBÓ, y por eso esta función se niega a tocar
// una orden así: si la OC ya tiene REMITOS (mercadería parcialmente
// recibida en YiQi). No se sabe cómo reacciona YiQi a sumar líneas ahí
// -- se corta acá con un error claro en vez de arriesgar un
// desajuste en el ERP real del cliente.
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

// Mismas constantes ya confirmadas y usadas en enviar-oc-yiqi (ver ese
// archivo para el detalle de cómo se confirmaron el 18/8/2026).
const TIUN_ID_TIUN_UNIDAD = 2;
const ALIV_ID_ALIV_21 = 3;
const ALICUOTA_IVA = 0.21;

type ItemNuevo = {
  mate_codigo: string;
  mate_nombre?: string | null;
  cantidad: number;
  costo_unitario: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Cualquier usuario activo (admin u operador) -- Aris e Ivana
    // pueden los dos sumar mercadería, mismo criterio que enviar-oc-yiqi.
    const chequeo = await verificarLlamador(req, supabaseAdmin);
    if (!chequeo.ok) return respuestaAuthError(chequeo, CORS_HEADERS);

    let body: { orden_id?: number; items?: ItemNuevo[] };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'Body inválido: se espera JSON con { orden_id, items }' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const ordenId = body.orden_id;
    const itemsNuevos = body.items;
    if (!ordenId || typeof ordenId !== 'number') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta "orden_id" (numérico) en el body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    if (!Array.isArray(itemsNuevos) || itemsNuevos.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta "items" (array no vacío) en el body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    for (const it of itemsNuevos) {
      if (!it.mate_codigo || typeof it.mate_codigo !== 'string') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Cada ítem necesita "mate_codigo" (el SKU).' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      if (!(Number(it.cantidad) > 0)) {
        return new Response(
          JSON.stringify({ ok: false, error: `Cantidad inválida para ${it.mate_codigo} -- tiene que ser mayor a 0.` }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      if (!(Number(it.costo_unitario) > 0)) {
        return new Response(
          JSON.stringify({ ok: false, error: `Falta el costo unitario de ${it.mate_codigo} -- no se puede agregar sin costo (YiQi lo rechazaría o lo dejaría en $0).` }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
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
    if (orden.estado !== 'aprobada') {
      return new Response(
        JSON.stringify({ ok: false, error: `La orden está en estado "${orden.estado}", no "aprobada" -- no se le puede sumar mercadería.` }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    if (!orden.yiqi_id_creado) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Esta orden todavía no está vinculada a YiQi -- corregí y usá "Reintentar envío" en vez de esto.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const config = await getYiqiConfig(supabaseAdmin, 'editar-oc-yiqi');

    // ---- Chequeo de seguridad EN VIVO: nunca tocar una OC con remitos ----
    // Ver nota completa arriba -- no está probado y no se arriesga hoy.
    const urlLectura = `${config.base_url}/api/public/ORDEN_DE_COMPRA/${orden.yiqi_id_creado}?schemaId=${config.schema_id}`;
    const respLectura = await fetch(urlLectura, {
      headers: { Authorization: `Bearer ${config.bearer_token}`, 'Content-Type': 'application/json' },
    });
    if (!respLectura.ok) {
      const textoError = await respLectura.text().catch(() => '');
      throw new Error(`No se pudo leer el estado actual de la orden en YiQi antes de editarla (${respLectura.status}): ${textoError.slice(0, 300)}`);
    }
    const dataLectura = await respLectura.json();
    const remitos = dataLectura?.data?.REMITOS ?? dataLectura?.REMITOS ?? [];
    if (Array.isArray(remitos) && remitos.length > 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Esta orden ya tiene remitos cargados en YiQi (mercadería parcialmente recibida). Agregar mercadería en ese caso todavía no está probado -- no se puede hacer desde acá por ahora.',
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // ---- Resolver MATE_ID_MATE por línea (mismo patrón que enviar-oc-yiqi) ----
    const codigos = [...new Set(itemsNuevos.map((i) => i.mate_codigo))];
    const { data: materiales, error: errMateriales } = await supabaseAdmin
      .from('material_yiqi')
      .select('mate_codigo, mate_nombre, yiqi_id')
      .in('mate_codigo', codigos);
    if (errMateriales) throw new Error(`Error leyendo material_yiqi: ${errMateriales.message}`);

    const mapaMateriales = new Map((materiales ?? []).map((m) => [m.mate_codigo, m]));
    const codigosFaltantes = codigos.filter((c) => !mapaMateriales.has(c));
    if (codigosFaltantes.length > 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `No se encontraron en YiQi los siguientes SKU: ${codigosFaltantes.join(', ')}. Revisá que estén bien escritos.`,
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // ---- Armar DETALLE (líneas nuevas, sin "id" -- YiQi las crea) ----
    const detalleNuevo = itemsNuevos.map((item) => {
      const material = mapaMateriales.get(item.mate_codigo)!;
      const precioUnitarioNeto = Number(item.costo_unitario);
      const cantidad = Number(item.cantidad);
      const subtotalNeto = precioUnitarioNeto * cantidad;
      const iva = subtotalNeto * ALICUOTA_IVA;
      return {
        MATE_ID_MATE: material.yiqi_id,
        DEDO_NOMBRE_MATE: item.mate_nombre ?? material.mate_nombre ?? null,
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

    // ---- PUT a YiQi (probado en vivo el 23/8/2026, ver nota arriba) ----
    const urlPut = `${config.base_url}/api/public/ORDEN_DE_COMPRA/${orden.yiqi_id_creado}?schemaId=${config.schema_id}`;
    const respPut = await fetch(urlPut, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${config.bearer_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaId: config.schema_id, data: { DETALLE: detalleNuevo } }),
    });
    if (!respPut.ok) {
      const textoError = await respPut.text().catch(() => '');
      throw new Error(`YiQi respondió ${respPut.status} al agregar mercadería: ${textoError.slice(0, 400)}`);
    }
    const dataPut = await respPut.json().catch(() => null);
    if (dataPut?.ok === false) {
      throw new Error(`YiQi rechazó el agregado: ${dataPut?.error ?? 'sin detalle'}`);
    }

    // ---- Solo si YiQi confirmó: reflejarlo localmente ----
    // A diferencia de enviar-oc-yiqi (que guarda local primero y YiQi
    // es best-effort con reintento automático), acá se hace al revés a
    // propósito: esto es una ADICIÓN opcional, no la aprobación en sí,
    // así que es más simple y más seguro no dejar nada a medio guardar
    // localmente si YiQi lo rechazó.
    const filasNuevas = itemsNuevos.map((item) => {
      const material = mapaMateriales.get(item.mate_codigo)!;
      return {
        orden_id: ordenId,
        mate_codigo: item.mate_codigo,
        mate_nombre: item.mate_nombre ?? material.mate_nombre ?? null,
        cantidad: Number(item.cantidad),
        costo_unitario: Number(item.costo_unitario),
        stock_al_momento: null,
        promedio_mensual: null,
      };
    });
    const { error: errInsert } = await supabaseAdmin.from('ordenes_propias_items').insert(filasNuevas);
    if (errInsert) {
      // YiQi ya tiene el agregado -- esto es grave (van a estar
      // desincronizados). Se corta con un mensaje bien explícito en
      // vez de fallar silenciosamente.
      throw new Error(
        `YiQi confirmó el agregado, pero no se pudo guardar acá adentro: ${errInsert.message}. ` +
        `IMPORTANTE: la orden en YiQi (OC ${orden.yiqi_id_creado}) YA tiene esta mercadería sumada -- avisar a Federico, no reintentar el agregado.`
      );
    }

    // Actualiza el total local (suma lo nuevo al total ya guardado).
    const totalAgregado = filasNuevas.reduce((acc, f) => acc + f.costo_unitario * f.cantidad, 0);
    const nuevoTotal = Number(orden.total_estimado ?? 0) + totalAgregado;
    const { error: errUpdateTotal } = await supabaseAdmin
      .from('ordenes_propias')
      .update({ total_estimado: nuevoTotal })
      .eq('id', ordenId);
    if (errUpdateTotal) {
      console.warn(`editar-oc-yiqi: agregado ok pero no se pudo actualizar total_estimado de la orden #${ordenId}: ${errUpdateTotal.message}`);
    }

    return new Response(
      JSON.stringify({ ok: true, itemsAgregados: filasNuevas.length, nuevoTotal }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error en editar-oc-yiqi:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================
// COMO SE LLAMA DESDE EL FRONTEND:
//
// const { data, error } = await supabase.functions.invoke('editar-oc-yiqi', {
//   body: {
//     orden_id: abierta.id,
//     items: [
//       { mate_codigo: '1234', mate_nombre: 'Nombre opcional', cantidad: 2, costo_unitario: 500 },
//     ],
//   },
// })
// ============================================================
