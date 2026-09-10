import { supabase } from './supabase'
import { filtrarOrdenes } from '../hooks/usePermisos'

// ============================================================
// estadoOCPorSku.js — 10/9/2026
// Cruza los 2 sistemas de órdenes de compra que conviven en el
// proyecto (ver header de OrdenesPropias.jsx) para saber, por SKU, si
// ya hay un pedido en marcha y en qué etapa está -- pensado para
// Monitor de stock y Alertas, que hoy no muestran nada de esto (una
// alerta "Crítica" se ve igual si ya se pidió que si nadie hizo nada).
//
//  - "Preparada": orden interna (ordenes_propias) en borrador o
//    esperando aprobación, o ya aprobada pero todavía no vinculada a
//    YiQi (yiqi_id_creado null) -- no salió hacia el proveedor todavía.
//  - "Solicitada": aprobada Y vinculada a YiQi, o ya está en
//    ordenes_yiqi (sincronizada desde YiQi) sin ninguna entrega todavía.
//  - "Entrega parcial": ordenes_yiqi con algo ya entregado pero saldo
//    pendiente -- llegó parte, falta el resto.
//
// Si un SKU tiene más de un estado a la vez (ej. una OC vieja con
// entrega parcial y una interna recién declarada para lo que falta),
// se muestra el más avanzado: entrega parcial > solicitada > preparada.
//
// Fuera de esto: órdenes rechazadas y archivadas (papelera) no
// cuentan, y las líneas de ordenes_yiqi con saldo pendiente = 0
// (completadas) tampoco -- no hay nada más que rastrear para ese SKU
// en esa orden puntual.
// ============================================================

const TAMANIO_LOTE = 1000

const ORDEN_NIVEL = { preparada: 1, solicitada: 2, entrega_parcial: 3 }

export const NIVEL_OC = {
  preparada: { label: 'Preparada', clase: 'bg-gray-100 text-gray-600' },
  solicitada: { label: 'Solicitada', clase: 'bg-blue-50 text-[#1d4ed8]' },
  entrega_parcial: { label: 'Entrega parcial', clase: 'bg-[var(--yel-bg)] text-[#92400e]' },
}

async function traerOrdenesYiqiActivas(permisos) {
  // Mismo patrón de paginado que traerOrdenesLocal() en
  // OrdenesCompra.jsx, pero solo trayendo lo necesario para este
  // cálculo (saldo pendiente > 0).
  let acumulado = []
  let desde = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let consulta = supabase
      .from('ordenes_yiqi')
      .select('sku, cantidad_entregada, cantidad_pendiente')
      .gt('cantidad_pendiente', 0)
      .range(desde, desde + TAMANIO_LOTE - 1)
    consulta = filtrarOrdenes(consulta, permisos)
    const { data, error } = await consulta
    if (error) throw new Error(error.message)
    acumulado = acumulado.concat(data ?? [])
    if (!data || data.length < TAMANIO_LOTE) break
    desde += TAMANIO_LOTE
  }
  return acumulado
}

export async function traerEstadoOCPorSku(permisos) {
  const [resPropias, filasYiqi] = await Promise.all([
    supabase
      .from('ordenes_propias')
      .select('estado, archivada_en, yiqi_id_creado, ordenes_propias_items(mate_codigo)')
      .in('estado', ['borrador', 'pendiente', 'aprobada'])
      .is('archivada_en', null),
    traerOrdenesYiqiActivas(permisos),
  ])
  if (resPropias.error) throw new Error(resPropias.error.message)

  const nivelPorSku = {}
  function marcar(codigo, nivel) {
    if (!codigo) return
    const actual = nivelPorSku[codigo]
    if (!actual || ORDEN_NIVEL[nivel] > ORDEN_NIVEL[actual]) nivelPorSku[codigo] = nivel
  }

  for (const orden of resPropias.data ?? []) {
    const nivel = orden.estado === 'aprobada' && orden.yiqi_id_creado ? 'solicitada' : 'preparada'
    for (const item of orden.ordenes_propias_items ?? []) {
      marcar(item.mate_codigo, nivel)
    }
  }
  for (const linea of filasYiqi) {
    const nivel = (linea.cantidad_entregada ?? 0) > 0 ? 'entrega_parcial' : 'solicitada'
    marcar(linea.sku, nivel)
  }

  const resultado = {}
  for (const [codigo, nivel] of Object.entries(nivelPorSku)) {
    resultado[codigo] = { nivel, ...NIVEL_OC[nivel] }
  }
  return resultado
}
