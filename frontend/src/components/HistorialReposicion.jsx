import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatoNumero } from '../lib/formato'

// 17/11/2026 — historial de cada artículo de un pedido entre depósitos
// (tabla reposicion_lineas_eventos, migración 20261117140000): quién declaró,
// recibió con diferencia, corrigió lo enviado o revisó, con cantidades y motivo.
// Solo lectura. Si la tabla todavía no existe o falla la consulta, no muestra nada.

function num(v) {
  return v == null ? '—' : formatoNumero(v, { decimales: 2, minDecimales: 0 })
}

const ETIQUETA_EVENTO = {
  declarada: 'Declarado el envío',
  recibida_ok: 'Recibido OK',
  recibida_con_diferencia: 'Recibido con diferencia (frenado)',
  envio_corregido: 'Corrigió lo enviado (depósito que envió)',
  diferencia_revisada: 'Diferencia revisada (depósito que recibió)',
  // 18/11/2026 — artículos que llegaron y no estaban en el remito.
  no_previsto_recibido: 'Llegó algo que no estaba en el remito (frenado)',
  no_previsto_aceptado: 'No previsto aceptado (depósito que envió)',
  no_previsto_rechazado: 'No previsto rechazado — hay que devolverlo (depósito que envió)',
}

const TONO_EVENTO = {
  recibida_con_diferencia: 'text-amber-700 font-semibold',
  envio_corregido: 'text-[var(--ind,#4338ca)] font-semibold',
  diferencia_revisada: 'text-green-700 font-semibold',
  recibida_ok: 'text-green-700',
  no_previsto_recibido: 'text-amber-700 font-semibold',
  no_previsto_aceptado: 'text-green-700 font-semibold',
  no_previsto_rechazado: 'text-[var(--red,#b91c1c)] font-semibold',
}

function detalle(e) {
  if (e.evento === 'declarada') return `pedido ${num(e.cantidad_anterior)} · envía ${num(e.cantidad_nueva)}`
  if (e.evento === 'envio_corregido') return `enviado ${num(e.cantidad_anterior)} → ${num(e.cantidad_nueva)}`
  if (e.evento === 'no_previsto_recibido') return `llegaron ${num(e.cantidad_nueva)}`
  if (e.evento === 'no_previsto_aceptado') return `suma ${num(e.cantidad_nueva)} a lo enviado`
  if (e.evento === 'no_previsto_rechazado') return `rechazadas ${num(e.cantidad_anterior)} (no se mueve stock)`
  if (e.evento === 'diferencia_revisada') return `recibido ${num(e.cantidad_anterior)} → final ${num(e.cantidad_nueva)}`
  return `enviado ${num(e.cantidad_anterior)} · recibido ${num(e.cantidad_nueva)}`
}

// Modos: solicitudId (todo el historial de un pedido) o soloDiferencias +
// diasAtras (eventos de diferencia de los pedidos que el usuario puede ver).
// 18/11/2026 — solicitudIds (array): limita el historial a esos pedidos (p. ej. solo los que el usuario
// envió). null = sin límite; [] = no muestra nada.
export default function HistorialReposicion({ solicitudId = null, solicitudIds = null, soloDiferencias = false, diasAtras = 30, recarga = 0, titulo = null, plegable = null, className = '' }) {
  const [eventos, setEventos] = useState([])
  const claveIds = Array.isArray(solicitudIds) ? solicitudIds.join(',') : null

  useEffect(() => {
    let vivo = true
    async function cargar() {
      try {
        if (Array.isArray(solicitudIds) && solicitudIds.length === 0) { if (vivo) setEventos([]); return }
        let q = supabase.from('reposicion_lineas_eventos').select('*').order('creado_en', { ascending: false }).limit(300)
        if (solicitudId != null) q = q.eq('solicitud_id', solicitudId)
        if (Array.isArray(solicitudIds)) q = q.in('solicitud_id', solicitudIds)
        if (soloDiferencias) {
          q = q
            .in('evento', [
              'recibida_con_diferencia', 'envio_corregido', 'diferencia_revisada',
              'no_previsto_recibido', 'no_previsto_aceptado', 'no_previsto_rechazado',
            ])
            .gte('creado_en', new Date(Date.now() - diasAtras * 24 * 3600 * 1000).toISOString())
        }
        const { data, error } = await q
        if (error) throw error
        if (vivo) setEventos(data ?? [])
      } catch {
        if (vivo) setEventos([])
      }
    }
    cargar()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitudId, claveIds, soloDiferencias, diasAtras, recarga])

  if (!eventos.length) return null

  const tabla = (
    <div className="mt-2">
      {titulo && <div className="text-[11px] font-bold text-[var(--sub)] uppercase tracking-wide mb-1">{titulo}</div>}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-100">
            {['Cuándo', 'Artículo', 'Qué pasó', 'Cantidades', 'Motivo / nota'].map((h) => (
              <th key={h} className="text-left px-3.5 py-1 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {eventos.map((e) => (
            <tr key={e.id} className="border-b border-gray-50 last:border-0">
              <td className="px-3.5 py-1 text-[11px] text-[var(--sub)] whitespace-nowrap">{new Date(e.creado_en).toLocaleString('es-AR', { hourCycle: 'h23' })}</td>
              <td className="px-3.5 py-1 text-[12px]"><span className="font-mono text-[11px]">{e.sku}</span> {e.mate_nombre}</td>
              <td className={`px-3.5 py-1 text-[12px] ${TONO_EVENTO[e.evento] ?? ''}`}>{ETIQUETA_EVENTO[e.evento] ?? e.evento}</td>
              <td className="px-3.5 py-1 text-[12px]">{detalle(e)}</td>
              <td className="px-3.5 py-1 text-[11px] text-[var(--sub)]">
                {e.motivo}
                {e.motivo && e.nota ? ' — ' : ''}
                {e.nota}
                {!e.motivo && !e.nota ? '—' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // plegable = título de un <details> cerrado (no ocupa lugar si no hay eventos).
  if (plegable) {
    return (
      <details className={className}>
        <summary className="text-[12px] font-semibold text-[var(--sub)] cursor-pointer">
          {plegable} ({eventos.length})
        </summary>
        {tabla}
      </details>
    )
  }
  return tabla
}
