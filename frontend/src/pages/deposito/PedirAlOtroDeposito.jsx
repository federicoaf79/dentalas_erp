import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../hooks/usePermisos'
import Aviso from '../../components/Aviso'
import { DEPOSITO_OTRO, nombreDeposito } from '../../lib/depositos'

// ============================================================
// pages/deposito/PedirAlOtroDeposito.jsx — 7/9/2026
// ============================================================
// Circuito inverso manual: la cuenta de depósito arma un pedido
// puntual (SKU + cantidad elegidos por ella, sin cálculo en vivo —
// a diferencia de la reposición automática) para que lo prepare el
// otro depósito. Llama a crear_remito_reposicion_manual(), que crea
// la solicitud directo en 'en_preparacion' -- aparece de inmediato
// en "Solicitudes para preparar" del otro lado.
//
// Requiere que material_yiqi/stock_yiqi tengan una política RLS que
// deje ver a las cuentas de depósito TODO el catálogo (no están
// acotadas por proveedor, a diferencia de Ivana) — ver §14 del
// documento de diseño, paso pendiente antes de que esta búsqueda
// devuelva resultados.
// ============================================================

export default function PedirAlOtroDeposito() {
  const permisos = usePermisos()
  const miDeposito = permisos.misDepositos?.[0] ?? null
  const otroDeposito = miDeposito ? DEPOSITO_OTRO[miDeposito] : null

  const [busqueda, setBusqueda] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState([])
  const [carrito, setCarrito] = useState([]) // [{sku, mate_nombre, cantidad}]
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  async function buscar() {
    if (busqueda.trim().length < 2) {
      setResultados([])
      return
    }
    setBuscando(true)
    setError(null)
    try {
      const texto = busqueda.trim().replace(/,/g, ' ')
      const { data, error: errBusq } = await supabase
        .from('material_yiqi')
        .select('mate_codigo, mate_nombre')
        .or(`mate_codigo.ilike.%${texto}%,mate_nombre.ilike.%${texto}%`)
        .limit(20)
      if (errBusq) throw errBusq
      setResultados(data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setBuscando(false)
    }
  }

  function agregarAlCarrito(item) {
    setCarrito((prev) => {
      if (prev.some((p) => p.sku === item.mate_codigo)) return prev
      return [...prev, { sku: item.mate_codigo, mate_nombre: item.mate_nombre, cantidad: 1 }]
    })
  }

  function actualizarCantidad(sku, cantidad) {
    setCarrito((prev) => prev.map((p) => (p.sku === sku ? { ...p, cantidad } : p)))
  }

  function quitarDelCarrito(sku) {
    setCarrito((prev) => prev.filter((p) => p.sku !== sku))
  }

  const carritoValido = carrito.length > 0 && carrito.every((p) => Number(p.cantidad) > 0)

  async function enviarPedido() {
    if (!miDeposito || !otroDeposito || !carritoValido) return
    setEnviando(true)
    setError(null)
    try {
      const lineas = carrito.map((p) => ({
        sku: p.sku,
        mate_nombre: p.mate_nombre,
        cantidad: Number(p.cantidad),
      }))
      const { error: errRpc } = await supabase.rpc('crear_remito_reposicion_manual', {
        p_origen: otroDeposito,
        p_destino: miDeposito,
        p_lineas: lineas,
      })
      if (errRpc) throw errRpc
      setCarrito([])
      setAviso(
        `Pedido enviado a ${nombreDeposito(otroDeposito)} — ${lineas.length} artículo${lineas.length === 1 ? '' : 's'}.`
      )
      setTimeout(() => setAviso(null), 5000)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white">
        <div className="text-[17px] font-bold">Pedir a {otroDeposito ? nombreDeposito(otroDeposito) : '…'}</div>
        <div className="text-[12px] text-[var(--sub)] mt-0.5">
          Armá el pedido puntual de artículos que necesitás — {otroDeposito ? nombreDeposito(otroDeposito) : 'el otro depósito'}{' '}
          lo va a ver en "Solicitudes para preparar".
        </div>
      </div>

      <Aviso tipo="info" id="deposito-pedir-criterio" className="mx-4 mt-4">
        Este pedido queda listo para preparar del otro lado apenas lo enviás — no hay recálculo en vivo acá (a
        diferencia de la reposición automática), porque vos elegís exactamente qué necesitás.
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

      <div className="px-4 pt-4 flex gap-2 max-w-xl">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && buscar()}
          placeholder="Buscar por SKU o nombre…"
          className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={buscar}
          disabled={buscando}
          className="px-3 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {resultados.length > 0 && (
        <div className="mx-4 mt-2 max-w-xl bg-white rounded-xl border border-[var(--border)] overflow-hidden max-h-64 overflow-y-auto">
          {resultados.map((r) => (
            <div
              key={r.mate_codigo}
              className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <div className="font-mono text-xs">{r.mate_codigo}</div>
                <div className="text-sm truncate">{r.mate_nombre}</div>
              </div>
              <button
                onClick={() => agregarAlCarrito(r)}
                className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[var(--ind-bg)] text-[var(--ind)] hover:opacity-80 flex-shrink-0"
              >
                + Agregar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-4 max-w-xl">
        <div className="text-[13px] font-semibold mb-2">Pedido ({carrito.length})</div>
        {carrito.length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--border)] p-6 text-center text-[var(--sub)] text-sm">
            Todavía no agregaste artículos.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
            {carrito.map((p) => (
              <div key={p.sku} className="flex items-center gap-2 px-3.5 py-2 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs">{p.sku}</div>
                  <div className="text-sm truncate">{p.mate_nombre}</div>
                </div>
                <input
                  type="number"
                  value={p.cantidad}
                  onChange={(e) => actualizarCantidad(p.sku, e.target.value)}
                  className="w-20 border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
                />
                <button
                  onClick={() => quitarDelCarrito(p.sku)}
                  title="Quitar"
                  className="text-gray-400 hover:text-[var(--red)] text-sm px-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={enviarPedido}
          disabled={!carritoValido || enviando}
          className="mt-3 w-full px-3 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--ind,#4338ca)] disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : `📤 Enviar pedido a ${otroDeposito ? nombreDeposito(otroDeposito) : ''}`}
        </button>
      </div>
    </div>
  )
}
