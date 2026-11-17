import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatoNumero } from '../lib/formato'
import { nombreDeposito } from '../lib/depositos'
import Pastilla from './ui/Pastilla'

// 17/11/2026 — diferencias de recepción: bloque para el depósito que ENVIÓ.
// Muestra las líneas que el otro depósito confirmó con distinta cantidad que la enviada
// (últimos 30 días). Diferencia = cantidad_recibida − cantidad_enviada (negativa = faltante).
// Solo lectura; si la consulta falla no muestra nada.
function num(v) {
  return formatoNumero(v, { decimales: 2, minDecimales: 0 })
}

export default function DiferenciasRecepcion({ depositosOrigen = [], esAdmin = false }) {
  const [filas, setFilas] = useState([])
  const clave = depositosOrigen.join(',')

  useEffect(() => {
    let vivo = true
    async function cargar() {
      try {
        if (!esAdmin && !depositosOrigen.length) { setFilas([]); return }
        const desde = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
        const { data: lineas, error } = await supabase
          .from('solicitudes_reposicion_lineas')
          .select('id, solicitud_id, sku, mate_nombre, cantidad_enviada, cantidad_recibida, recibida_en')
          .eq('estado_linea', 'recibida')
          .gte('recibida_en', desde)
          .order('recibida_en', { ascending: false })
          .limit(500)
        if (error) throw error
        const conDif = (lineas ?? []).filter(
          (l) => l.cantidad_enviada != null && l.cantidad_recibida != null &&
            Number(l.cantidad_recibida) !== Number(l.cantidad_enviada)
        )
        if (!conDif.length) { if (vivo) setFilas([]); return }
        const ids = [...new Set(conDif.map((l) => l.solicitud_id))]
        let q = supabase
          .from('solicitudes_reposicion')
          .select('id, remito_numero, deposito_origen_id, deposito_destino_id')
          .in('id', ids)
        if (!esAdmin) q = q.in('deposito_origen_id', depositosOrigen)
        const { data: sols, error: e2 } = await q
        if (e2) throw e2
        const mapa = Object.fromEntries((sols ?? []).map((s) => [s.id, s]))
        const res = conDif.filter((l) => mapa[l.solicitud_id]).map((l) => ({ ...l, sol: mapa[l.solicitud_id] }))
        if (vivo) setFilas(res)
      } catch {
        if (vivo) setFilas([])
      }
    }
    cargar()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, esAdmin])

  if (!filas.length) return null

  return (
    <div className="mx-4 mt-4 bg-white rounded-xl border border-[var(--red,#b91c1c)]/30 overflow-hidden">
      <div className="px-3.5 py-2.5 bg-red-50 border-b border-red-100">
        <div className="text-sm font-bold text-[var(--red,#b91c1c)] flex items-center gap-1.5">
          <i className="ti ti-alert-triangle" /> Diferencias en recepción ({filas.length})
        </div>
        <div className="text-[12px] text-gray-700 mt-0.5">
          El otro depósito confirmó menos de lo que enviaste. Revisá si quedó mercadería sin despachar o si se perdió
          en el camino. (Últimos 30 días.)
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-100">
            {['Remito', 'Recibido el', 'Artículo', 'Enviado', 'Recibido', 'Diferencia'].map((h) => (
              <th key={h} className="text-left px-3.5 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((l) => {
            const dif = Number(l.cantidad_recibida) - Number(l.cantidad_enviada)
            return (
              <tr key={l.id} className="border-b border-gray-50 last:border-0">
                <td className="px-3.5 py-1.5 text-sm font-semibold">
                  {l.sol.remito_numero || `#${l.sol.id}`}
                  <div className="text-[10px] font-normal text-[var(--sub)]">→ {nombreDeposito(l.sol.deposito_destino_id)}</div>
                </td>
                <td className="px-3.5 py-1.5 text-xs text-[var(--sub)]">{new Date(l.recibida_en).toLocaleString('es-AR')}</td>
                <td className="px-3.5 py-1.5 text-sm"><span className="font-mono text-xs">{l.sku}</span> {l.mate_nombre}</td>
                <td className="px-3.5 py-1.5 text-sm">{num(l.cantidad_enviada)}</td>
                <td className="px-3.5 py-1.5 text-sm">{num(l.cantidad_recibida)}</td>
                <td className="px-3.5 py-1.5 text-sm">
                  {dif < 0
                    ? <Pastilla tono="rojo">faltan {num(-dif)}</Pastilla>
                    : <Pastilla tono="amarillo">sobran {num(dif)}</Pastilla>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
