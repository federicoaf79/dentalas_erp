import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../hooks/usePermisos'
import Aviso from '../../components/Aviso'
import { nombreDeposito } from '../../lib/depositos'

// ============================================================
// pages/deposito/ConfirmarRecepcion.jsx — 7/9/2026
// ============================================================
// Pantalla del circuito de reposición automática Central<->Local
// (ver DISENO_TECNICO_Reposicion_CentralLocal_7-9-2026.md, §12) para
// la cuenta de depósito que ES DESTINO de una línea ya declarada
// ("envía", con cantidad > 0). Confirmar acá es lo que ejecuta el
// movimiento de stock real en YiQi (vía mover-stock-reposicion) — no
// antes, ni cuando el otro lado declaró "envía".
// ============================================================

function num(v, decimales = 2) {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

function numInput(v) {
  if (v == null) return ''
  const n = Number(v)
  if (Number.isNaN(n)) return ''
  return n.toFixed(2)
}

function formatoFechaHora(fechaStr) {
  if (!fechaStr) return '—'
  try {
    return new Date(fechaStr).toLocaleString('es-AR')
  } catch {
    return fechaStr
  }
}

function FilaLineaDeclarada({ linea, onConfirmar, guardando }) {
  const [cantidad, setCantidad] = useState(numInput(linea.cantidad_enviada))
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-3.5 py-1.5 font-mono text-xs">{linea.sku}</td>
      <td className="px-3.5 py-1.5 text-sm">{linea.mate_nombre}</td>
      <td className="px-3.5 py-1.5 text-sm text-[var(--sub)]">{num(linea.cantidad_enviada)} declaradas</td>
      <td className="px-3.5 py-1.5">
        <input
          type="number"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className="w-24 border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
        />
        <div className="text-[10px] text-gray-400 mt-0.5">Corregí si no coincide contra lo físico</div>
      </td>
      <td className="px-3.5 py-1.5">
        <button
          onClick={() => onConfirmar(linea, Number(cantidad) || 0)}
          disabled={guardando || Number(cantidad) <= 0}
          title="Registra el movimiento de stock real — recién acá queda hecho"
          className="px-2.5 py-1 rounded text-[11px] font-semibold text-white bg-[var(--grn,#059669)] disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : '✓ Confirmar recibido'}
        </button>
      </td>
    </tr>
  )
}

export default function ConfirmarRecepcion() {
  const permisos = usePermisos()
  const [lineas, setLineas] = useState([])
  const [solicitudesPorId, setSolicitudesPorId] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [confirmando, setConfirmando] = useState(null)

  const misDepositos = permisos.misDepositos ?? []
  const claveFiltro = permisos.cargando || permisos.error ? null : misDepositos.join(',')

  const cargar = useCallback(async () => {
    if (!misDepositos.length) {
      setLineas([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: solicitudes, error: errSol } = await supabase
        .from('solicitudes_reposicion')
        .select('id, remito_numero, deposito_origen_id, deposito_destino_id, creada_en')
        .in('deposito_destino_id', misDepositos)
        .eq('estado', 'en_preparacion')
      if (errSol) throw errSol

      const mapaSol = {}
      for (const s of solicitudes ?? []) mapaSol[s.id] = s
      setSolicitudesPorId(mapaSol)

      const idsSolicitud = (solicitudes ?? []).map((s) => s.id)
      if (!idsSolicitud.length) {
        setLineas([])
        return
      }

      const { data: filasLineas, error: errLin } = await supabase
        .from('solicitudes_reposicion_lineas')
        .select('*')
        .in('solicitud_id', idsSolicitud)
        .eq('estado_linea', 'declarada')
        .gt('cantidad_enviada', 0)
        .order('sku')
      if (errLin) throw errLin
      setLineas(filasLineas ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltro])

  useEffect(() => {
    if (claveFiltro === null) return
    cargar()
  }, [claveFiltro, cargar])

  async function confirmarRecepcion(linea, cantidadRecibida) {
    setConfirmando(linea.id)
    setError(null)
    try {
      const { error: errRpc } = await supabase.rpc('confirmar_recepcion_linea', {
        p_linea_id: linea.id,
        p_cantidad_recibida: cantidadRecibida,
      })
      if (errRpc) throw errRpc

      // Fire-and-forget: dispara el movimiento real en YiQi. Un error
      // acá nunca deshace el "recibido" ya confirmado (regla de oro,
      // igual que mover-stock-yiqi).
      supabase.functions
        .invoke('mover-stock-reposicion', { body: { linea_id: linea.id } })
        .catch((e) => console.error('[mover-stock-reposicion]', e))

      setLineas((prev) => prev.filter((l) => l.id !== linea.id))
      setAviso(`${linea.sku} confirmado como recibido.`)
      setTimeout(() => setAviso(null), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setConfirmando(null)
    }
  }

  const cargandoAlgo = loading || permisos.cargando

  const grupos = {}
  for (const l of lineas) {
    if (!grupos[l.solicitud_id]) grupos[l.solicitud_id] = []
    grupos[l.solicitud_id].push(l)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white">
        <div className="text-[17px] font-bold">Confirmar recepción</div>
        <div className="text-[12px] text-[var(--sub)] mt-0.5">
          {cargandoAlgo
            ? 'Cargando…'
            : `${lineas.length} artículo${lineas.length === 1 ? '' : 's'} esperando confirmación`}
        </div>
      </div>

      <Aviso tipo="info" id="deposito-recepcion-criterio" className="mx-4 mt-4">
        Confirmá contra lo que realmente llegó. Si la cantidad no coincide, corregila acá antes de confirmar — el
        movimiento de stock real se registra recién con esta confirmación, no antes.
      </Aviso>

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudo completar la acción</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {aviso && (
        <div className="mx-4 mt-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2.5 text-[13px]">
          {aviso}
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        {cargandoAlgo && lineas.length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            Cargando…
          </div>
        ) : Object.keys(grupos).length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            No tenés nada pendiente de confirmar. 🎉
          </div>
        ) : (
          Object.entries(grupos).map(([solicitudId, filasLineas]) => {
            const s = solicitudesPorId[solicitudId]
            return (
              <div key={solicitudId} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="px-3.5 py-2.5 bg-gray-50 border-b border-[var(--border)]">
                  <span className="font-bold text-sm">{s?.remito_numero ?? `Solicitud #${solicitudId}`}</span>
                  <span className="text-[11px] text-[var(--sub)] ml-2">
                    de {nombreDeposito(s?.deposito_origen_id)} · {formatoFechaHora(s?.creada_en)}
                  </span>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['SKU', 'Producto', 'Declarado', 'Cantidad recibida', ''].map((h) => (
                        <th
                          key={h}
                          className="text-left px-3.5 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filasLineas.map((l) => (
                      <FilaLineaDeclarada
                        key={l.id}
                        linea={l}
                        onConfirmar={confirmarRecepcion}
                        guardando={confirmando === l.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
