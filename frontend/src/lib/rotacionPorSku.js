import { supabase } from './supabase'

// ============================================================
// rotacionPorSku.js — 10/9/2026
// Reusa la misma función historial_ventas_json() que ya usa Predictor
// de Demanda (RPC en Postgres, NO es SECURITY DEFINER: corre con los
// permisos del usuario logueado, así que el RLS filtra solo -- mismo
// criterio que PredictorDemanda.jsx). Acá solo se toma el promedio
// mensual (rotación) por SKU, no el desglose mes a mes -- eso se
// sigue viendo solo en Predictor de Demanda.
//
// Si un SKU no tuvo NINGUNA venta en los últimos p_meses, no aparece
// en el resultado del RPC (no genera fila) -- se trata como "sin
// datos de rotación" (promedio: null), no como "rotación cero": no es
// lo mismo no vender nunca que vender 0 unidades de forma constante.
// ============================================================

const MESES_DEFECTO = 12

export async function traerRotacionPorSku(meses = MESES_DEFECTO) {
  const { data, error } = await supabase.rpc('historial_ventas_json', { p_meses: meses })
  if (error) throw new Error(error.message)
  const porSku = {}
  for (const fila of data ?? []) {
    porSku[fila.mate_codigo] = { promedio: fila.promedio ?? null }
  }
  return porSku
}

// Meses de cobertura = stock actual / consumo mensual promedio. Mismo
// cálculo que calcularCobertura() en PredictorDemanda.jsx -- se
// duplica a propósito en vez de importar entre pantallas (mismo
// criterio que esExcluidoDeAlertas() en MonitorStock.jsx/Alertas.jsx:
// si se toca acá, tocar los 2-3 lugares).
export function calcularCobertura(stock, promedio) {
  const s = Number(stock)
  const p = Number(promedio)
  if (!Number.isFinite(s) || !Number.isFinite(p) || p <= 0) return null
  return s / p
}
