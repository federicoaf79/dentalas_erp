import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// ============================================================
// maximos.js — 26/10/2026
// Máximo calculado por la app (decisión de Federico, opción A, 26/10).
// Lo calcula maximos_calculados() en Postgres (migración 20261026120000):
// promedio de ventas de los últimos 3 meses cerrados, con fraccionados y
// combos sumados al código que se compra, redondeado al bulto. Es solo
// para mostrar: no cambia la cantidad sugerida ni las alertas.
// ============================================================

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Una sola lectura por sesión del catálogo completo (las ventas se
// sincronizan una vez por día). Nueva OC pide por proveedor.
let cacheCompleto = null
const cachePorProveedor = {}

export async function traerMaximosCalculados(proveedor = null) {
  if (proveedor == null && cacheCompleto) return cacheCompleto
  if (proveedor != null && cachePorProveedor[proveedor]) return cachePorProveedor[proveedor]
  const { data, error } = await supabase.rpc('maximos_calculados', proveedor == null ? {} : { p_proveedor: proveedor })
  if (error) throw new Error(error.message)
  const res = data ?? {}
  if (proveedor == null) cacheCompleto = res
  else cachePorProveedor[proveedor] = res
  return res
}

// Devuelve { [sku]: { max, prom, bulto, pico, meses } }, {} si falla, null mientras carga.
export function useMaximosCalculados(proveedor = null, activo = true) {
  const [maximos, setMaximos] = useState(null)
  useEffect(() => {
    if (!activo) return
    let vivo = true
    traerMaximosCalculados(proveedor)
      .then((d) => { if (vivo) setMaximos(d) })
      .catch((e) => {
        console.error('[maximos_calculados]', e)
        if (vivo) setMaximos({})
      })
    return () => { vivo = false }
  }, [proveedor, activo])
  return maximos
}

// Texto para el tooltip de la barra: de dónde sale el número.
export function textoMaximoCalculado(info, maxYiqi) {
  if (!info) {
    return `Máx. calculado: sin ventas en los últimos 3 meses cerrados.${maxYiqi > 0 ? ` (Máx. de YiQi: ${maxYiqi})` : ''}`
  }
  const detalle = Object.entries(info.meses ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${MESES_CORTOS[Number(k.slice(5, 7)) - 1]} ${Number(v)}`)
    .join(' · ')
  const bulto = info.bulto ? `, redondeado al bulto de ${info.bulto}` : ''
  const pico = info.pico ? '\n⚠ Un mes vendió mucho más que los otros (pico): revisar si corresponde.' : ''
  const yiqi = maxYiqi > 0 ? `\n(Máx. que calcula YiQi: ${maxYiqi})` : ''
  return `Máx. calculado = promedio de los últimos 3 meses cerrados (${detalle}) = ${Number(info.prom)}${bulto}.${pico}${yiqi}`
}
