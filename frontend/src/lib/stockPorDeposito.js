import { supabase } from '../lib/supabase'

// ============================================================
// stockPorDeposito.js — 21/8/2026
// ============================================================
//
// `stock_yiqi` (Fase 1 del módulo de Stock, 19/8/2026) trae el
// desglose real por depósito (Local / Central / Jorge / ML Full),
// pero hasta el 21/8/2026 solo se usaba para Reposición interna,
// nunca se mostraba en Monitor de Stock ni en Nueva OC — ahí seguía
// mostrándose solo `mate_stock_disponible` (Local+Central combinado,
// sin discriminar). Este helper trae el desglose completo, paginado
// (mismo patrón que `traerMaterialLocal` en MonitorStock.jsx, porque
// PostgREST tope a 1.000 filas por request), para usarlo en
// cualquier pantalla.
//
// SIN filtro de permisos propio a propósito: la RLS de `stock_yiqi`
// ya resuelve la visibilidad por usuario (join contra
// `material_yiqi.mate_codigo = sku`), igual que hace Postgres para
// `material_yiqi` — no hay que repetir esa lógica acá.
// ============================================================

const TAMANIO_LOTE = 1000
const COLUMNAS = 'sku, stock_local, stock_central, stock_jorge, stock_ml_full'

export async function traerStockPorDeposito() {
  const primera = await supabase
    .from('stock_yiqi')
    .select(COLUMNAS, { count: 'exact' })
    .range(0, TAMANIO_LOTE - 1)
  if (primera.error) throw new Error(primera.error.message)

  const total = primera.count ?? primera.data.length
  let acumulado = [...primera.data]

  if (total > TAMANIO_LOTE) {
    const paginasRestantes = Math.ceil((total - TAMANIO_LOTE) / TAMANIO_LOTE)
    const promesas = []
    for (let i = 1; i <= paginasRestantes; i++) {
      const desde = i * TAMANIO_LOTE
      promesas.push(
        supabase.from('stock_yiqi').select(COLUMNAS).range(desde, desde + TAMANIO_LOTE - 1)
      )
    }
    const resultados = await Promise.all(promesas)
    for (const r of resultados) {
      if (r.error) throw new Error(r.error.message)
      acumulado = acumulado.concat(r.data)
    }
  }

  const porSku = {}
  for (const fila of acumulado) {
    porSku[fila.sku] = fila
  }
  return porSku
}

// Texto chico "Local: X · Central: Y" para usar debajo del stock
// combinado. Jorge/ML Full (cuando tienen algo) se devuelven en
// `extras` para pintarse como badges chicos al lado -- antes vivían
// solo en el `title` (tooltip nativo del navegador), que no se ve
// hasta pasar el mouse y además no se dibuja nunca si en algún
// momento el valor es 0 -- fácil de no ver que existen. Con "0" en
// vez de vacío no se agrega nada a `extras` a propósito: no tiene
// sentido resaltar un depósito que no tiene stock.
export function textoDesgloseStock(fila) {
  if (!fila) return null
  const extras = [
    fila.stock_jorge ? { label: 'Jorge', valor: fila.stock_jorge } : null,
    fila.stock_ml_full ? { label: 'ML Full', valor: fila.stock_ml_full } : null,
  ].filter(Boolean)
  return {
    principal: `Local: ${fila.stock_local ?? 0} · Central: ${fila.stock_central ?? 0}`,
    extras,
  }
}
