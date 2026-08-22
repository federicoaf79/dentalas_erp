import { useEffect, useState } from 'react'
import { causasDelAmbito, historialCausas, declararCausa } from '../lib/causas'

// ============================================================
// DeclararCausaModal.jsx — ítem 7, 22/8/2026.
//
// Modal reutilizable para declarar POR QUÉ un artículo/orden está en
// tal estado (ej. "sin stock por demora del proveedor"). Un solo
// componente para las 3 pantallas que lo necesitan: Alertas (ámbito
// 'stock'), Órdenes de compra (ámbito 'compra') y Seguimiento de OC
// (ámbito 'entrega') -- evita repetir la lógica 3 veces.
//
// Append-only: "Guardar declaración" siempre INSERTA una fila nueva,
// nunca edita ni borra las anteriores (ver diseño en la migration
// 20260822000000_declaraciones_causa.sql). El historial completo se
// muestra abajo del formulario, más reciente primero con "Vigente",
// para que quede visualmente claro que se agrega, no se reemplaza.
// ============================================================

function formatoFecha(f) {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '—' }
}

export default function DeclararCausaModal({ ambito, referenciaId, referenciaTexto, onCerrar, onGuardado }) {
  const [causas, setCausas] = useState([])
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [causaId, setCausaId] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setCargando(true)
      setError(null)
      try {
        const [listaCausas, listaHistorial] = await Promise.all([
          causasDelAmbito(ambito),
          historialCausas(ambito, referenciaId),
        ])
        if (cancelado) return
        setCausas(listaCausas)
        setHistorial(listaHistorial)
      } catch (e) {
        if (!cancelado) setError(e.message)
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [ambito, referenciaId])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function guardar() {
    if (!causaId) {
      setError('Elegí una causa antes de guardar.')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await declararCausa({ ambito, causaId: Number(causaId), referenciaId, referenciaTexto, nota })
      setCausaId('')
      setNota('')
      const listaHistorial = await historialCausas(ambito, referenciaId)
      setHistorial(listaHistorial)
      if (typeof onGuardado === 'function') onGuardado()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onCerrar}>
      <div
        className="bg-white rounded-xl border border-[var(--border)] shadow-xl w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1.5">
          <div className="text-[15px] font-bold">Declarar causa</div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="text-[13px] text-[var(--sub)] mb-4">{referenciaTexto || referenciaId}</div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-[var(--red)] rounded-lg px-3.5 py-2.5 text-[13px] mb-3">
            {error}
          </div>
        )}

        {cargando ? (
          <div className="text-sm text-[var(--sub)] py-4 text-center">Cargando…</div>
        ) : (
          <>
            <label className="block text-[11px] uppercase text-gray-400 font-semibold mb-1">Causa</label>
            <select
              value={causaId}
              onChange={(e) => setCausaId(e.target.value)}
              disabled={guardando}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] mb-3 disabled:opacity-60"
            >
              <option value="">Elegir…</option>
              {causas.map((c) => (
                <option key={c.id} value={c.id}>{c.rotulo}</option>
              ))}
            </select>

            <label className="block text-[11px] uppercase text-gray-400 font-semibold mb-1">Nota (opcional)</label>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              disabled={guardando}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] mb-4 resize-none disabled:opacity-60"
              placeholder="Detalle adicional si hace falta…"
            />

            <div className="flex justify-end gap-2 mb-5">
              <button
                disabled={guardando}
                onClick={onCerrar}
                className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40"
              >
                Cerrar
              </button>
              <button
                disabled={guardando || !causaId}
                onClick={guardar}
                className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--ind,#4338ca)] text-white hover:opacity-90 disabled:opacity-40"
              >
                {guardando ? 'Guardando…' : 'Guardar declaración'}
              </button>
            </div>

            <div className="text-[11px] uppercase text-gray-400 font-semibold mb-2">
              Historial{historial.length > 0 ? ` (${historial.length})` : ''}
            </div>
            {historial.length === 0 ? (
              <div className="text-[13px] text-gray-400">Todavía no se declaró ninguna causa acá.</div>
            ) : (
              <div className="space-y-2">
                {historial.map((h, i) => (
                  <div
                    key={h.id}
                    className={`border rounded-lg px-3 py-2 text-[13px] ${
                      i === 0 ? 'border-[var(--ind,#4338ca)] bg-indigo-50/40' : 'border-[var(--border)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{h.causa_rotulo}</span>
                      {i === 0 && (
                        <span className="text-[10px] font-bold uppercase text-[var(--ind,#4338ca)]">Vigente</span>
                      )}
                    </div>
                    {h.nota && <div className="text-gray-600 mt-0.5">{h.nota}</div>}
                    <div className="text-[11px] text-gray-400 mt-1">
                      {h.declarante_nombre ?? 'Alguien'} · {formatoFecha(h.declarado_en)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
