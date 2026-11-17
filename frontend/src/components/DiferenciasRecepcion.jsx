import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatoNumero } from '../lib/formato'
import { nombreDeposito } from '../lib/depositos'
import Pastilla from './ui/Pastilla'
import HistorialReposicion from './HistorialReposicion'

// 17/11/2026 — diferencias de recepción: bloque para el depósito que ENVIÓ.
// Muestra las líneas que el otro depósito confirmó con distinta cantidad que la enviada
// (últimos 30 días). Diferencia = cantidad_recibida − cantidad_enviada (negativa = faltante).
// Solo lectura; si la consulta falla no muestra nada.
// 17/11/2026 — Parte B: incluye las frenadas ('con_diferencia', pendientes de que
// las revise quien recibe) y las ya revisadas (diferencia original en
// cantidad_recibida_inicial). select('*') para no romper si la migración
// 20261117130000 todavía no está aplicada.
function num(v) {
  return formatoNumero(v, { decimales: 2, minDecimales: 0 })
}

function numInput(v) {
  if (v == null) return ''
  const n = Number(v)
  return Number.isNaN(n) ? '' : String(Math.round(n * 100) / 100)
}

// 17/11/2026 — caso de Aris: Central declaró 8, al Local llegaron 6 y en Central
// esas 2 u no existían físicamente. Central corrige lo enviado (8 → 6) con motivo;
// la línea vuelve al Local "en tránsito" con 6 y recién ahí el Local la confirma.
function CorregirEnvio({ linea, onCorregido }) {
  const [abierto, setAbierto] = useState(false)
  const [cantidad, setCantidad] = useState(numInput(linea.cantidad_recibida))
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const cantNum = cantidad === '' ? null : Number(cantidad)
  const valida = cantNum != null && !Number.isNaN(cantNum) && cantNum >= 0 && cantNum !== Number(linea.cantidad_enviada)

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const { error: e } = await supabase.rpc('corregir_envio_linea', {
        p_linea_id: linea.id,
        p_cantidad_enviada: cantNum,
        p_motivo: motivo.trim(),
      })
      if (e) throw e
      onCorregido?.(linea, cantNum)
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        title="Si lo que figuraba enviado no estaba físicamente, corregí la cantidad: vuelve al otro depósito para que la confirme"
        className="mt-1 px-2 py-0.5 rounded text-[11px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50"
      >
        Corregir lo enviado
      </button>
    )
  }
  return (
    <div className="mt-1 space-y-1 max-w-[240px]">
      <div className="flex items-center gap-1.5 text-[11px]">
        <span>Enviado real:</span>
        <input
          type="number"
          min="0"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          aria-label={`Cantidad realmente enviada de ${linea.sku}`}
          className="w-20 border border-[var(--border)] rounded px-1.5 py-0.5 text-[12px]"
        />
        <span className="text-[var(--sub)]">(figuraba {num(linea.cantidad_enviada)})</span>
      </div>
      <input
        type="text"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (ej.: no estaban físicamente)"
        className="w-full border border-[var(--border)] rounded px-1.5 py-0.5 text-[12px]"
      />
      <div className="flex gap-1.5">
        <button
          onClick={guardar}
          disabled={guardando || !valida || !motivo.trim()}
          className="px-2 py-0.5 rounded text-[11px] font-semibold text-white bg-[var(--ind,#4338ca)] disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar corrección'}
        </button>
        <button onClick={() => setAbierto(false)} className="px-2 py-0.5 rounded text-[11px] border border-[var(--border)]">
          Cancelar
        </button>
      </div>
      {error && <div className="text-[11px] text-[var(--red)]">{error}</div>}
    </div>
  )
}

export default function DiferenciasRecepcion({ depositosOrigen = [], esAdmin = false }) {
  const [filas, setFilas] = useState([])
  const [recarga, setRecarga] = useState(0)
  const [aviso, setAviso] = useState(null)
  const clave = depositosOrigen.join(',')

  useEffect(() => {
    let vivo = true
    async function cargar() {
      try {
        if (!esAdmin && !depositosOrigen.length) { setFilas([]); return }
        const desde = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
        const { data: lineas, error } = await supabase
          .from('solicitudes_reposicion_lineas')
          .select('*')
          .in('estado_linea', ['recibida', 'con_diferencia'])
          .gte('recibida_en', desde)
          .order('recibida_en', { ascending: false })
          .limit(500)
        if (error) throw error
        const conDif = (lineas ?? []).filter((l) => {
          const recibidaInicial = l.cantidad_recibida_inicial ?? l.cantidad_recibida
          return l.estado_linea === 'con_diferencia' || (
            l.cantidad_enviada != null && recibidaInicial != null &&
            Number(recibidaInicial) !== Number(l.cantidad_enviada)
          )
        })
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
  }, [clave, esAdmin, recarga])

  function alCorregir(linea, cantidad) {
    setAviso(`${linea.sku}: corregido a ${num(cantidad)} u enviadas. Volvió al otro depósito para que lo confirme.`)
    setTimeout(() => setAviso(null), 6000)
    setRecarga((r) => r + 1)
  }

  if (!filas.length) {
    // Sin diferencias abiertas, igual se muestra lo que pasó en los últimos 30 días.
    return (
      <div className="mx-4 mt-4">
        {aviso && (
          <div className="mb-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2.5 text-[13px]">{aviso}</div>
        )}
        <HistorialReposicion
          soloDiferencias
          diasAtras={30}
          recarga={recarga}
          plegable="Historial de diferencias (últimos 30 días)"
          className="bg-white rounded-xl border border-[var(--border)] px-3.5 py-2"
        />
      </div>
    )
  }

  return (
    <div className="mx-4 mt-4 bg-white rounded-xl border border-[var(--red,#b91c1c)]/30 overflow-hidden">
      <div className="px-3.5 py-2.5 bg-red-50 border-b border-red-100">
        <div className="text-sm font-bold text-[var(--red,#b91c1c)] flex items-center gap-1.5">
          <i className="ti ti-alert-triangle" /> Diferencias en recepción ({filas.length})
        </div>
        <div className="text-[12px] text-gray-700 mt-0.5">
          El otro depósito recibió una cantidad distinta de la que enviaste. Mientras dice &quot;Pendiente de revisar&quot;,
          ese artículo está frenado: no se movió su stock. Revisá si quedó mercadería sin despachar o si se perdió en el
          camino. Si lo que figuraba enviado no estaba físicamente acá, usá &quot;Corregir lo enviado&quot;: vuelve al
          otro depósito con la cantidad real para que lo confirme. Si se perdió o se rompió en el camino, lo cierra
          quien recibió con &quot;Revisado&quot;. (Últimos 30 días.)
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-100">
            {['Remito', 'Recibido el', 'Artículo', 'Enviado', 'Recibido', 'Diferencia', 'Estado'].map((h) => (
              <th key={h} className="text-left px-3.5 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((l) => {
            const recibidaInicial = l.cantidad_recibida_inicial ?? l.cantidad_recibida
            const dif = Number(recibidaInicial) - Number(l.cantidad_enviada)
            const pendiente = l.estado_linea === 'con_diferencia'
            return (
              <tr key={l.id} className="border-b border-gray-50 last:border-0">
                <td className="px-3.5 py-1.5 text-sm font-semibold">
                  {l.sol.remito_numero || `#${l.sol.id}`}
                  <div className="text-[10px] font-normal text-[var(--sub)]">→ {nombreDeposito(l.sol.deposito_destino_id)}</div>
                </td>
                <td className="px-3.5 py-1.5 text-xs text-[var(--sub)]">{new Date(l.recibida_en).toLocaleString('es-AR')}</td>
                <td className="px-3.5 py-1.5 text-sm"><span className="font-mono text-xs">{l.sku}</span> {l.mate_nombre}</td>
                <td className="px-3.5 py-1.5 text-sm">{num(l.cantidad_enviada)}</td>
                <td className="px-3.5 py-1.5 text-sm">{num(recibidaInicial)}</td>
                <td className="px-3.5 py-1.5 text-sm">
                  {dif < 0
                    ? <Pastilla tono="rojo">faltan {num(-dif)}</Pastilla>
                    : <Pastilla tono="amarillo">sobran {num(dif)}</Pastilla>}
                  {l.motivo_diferencia && (
                    <div className="text-[10px] text-[var(--sub)] mt-0.5">
                      {l.motivo_diferencia}{l.nota_diferencia ? ` — ${l.nota_diferencia}` : ''}
                    </div>
                  )}
                </td>
                <td className="px-3.5 py-1.5 text-[11px]">
                  {pendiente ? (
                    <>
                      <span className="font-semibold text-amber-700">Pendiente de revisar</span>
                      {(esAdmin || depositosOrigen.map(Number).includes(Number(l.sol.deposito_origen_id))) && (
                        <CorregirEnvio linea={l} onCorregido={alCorregir} />
                      )}
                    </>
                  ) : l.diferencia_revisada_en ? (
                    <span className="text-green-700">
                      Revisada · final {num(l.cantidad_recibida)}
                      {l.nota_revision ? <span className="block text-[10px] text-[var(--sub)]">{l.nota_revision}</span> : null}
                    </span>
                  ) : (
                    <span className="text-[var(--sub)]">Cerrada</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {aviso && (
        <div className="mx-3.5 my-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2.5 text-[13px]">{aviso}</div>
      )}
      <HistorialReposicion
        soloDiferencias
        diasAtras={30}
        recarga={recarga}
        plegable="Historial de diferencias (últimos 30 días)"
        className="border-t border-gray-100 px-3.5 py-2"
      />
    </div>
  )
}
