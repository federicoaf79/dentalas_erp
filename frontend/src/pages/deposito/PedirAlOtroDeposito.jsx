import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../hooks/usePermisos'
import Aviso from '../../components/Aviso'
import { DEPOSITO_OTRO, nombreDeposito, aDeposito } from '../../lib/depositos'
import { formatoNumero } from '../../lib/formato'
// 18/11/2026 — camino B: el pedido manual también se crea en YiQi como Remito interno (si el módulo está prendido).
import { publicarPedidoEnYiqi } from '../../components/AvisoRemitoYiqi'

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
  // 17/11/2026 — buscador por palabras: total de coincidencias (null = fallback sin RPC) y texto buscado
  const [total, setTotal] = useState(null)
  const [buscado, setBuscado] = useState('')
  const [carrito, setCarrito] = useState([]) // [{sku, mate_nombre, cantidad}]
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  // 18/11/2026 — tope por stock real del depósito origen (RPC stock_disponible_deposito).
  const [disp, setDisp] = useState({}) // sku -> {stock, reservado, disponible}
  const [dispFalla, setDispFalla] = useState(false)

  async function cargarDisp(skus, deposito) {
    const lista = [...new Set((skus ?? []).filter(Boolean))]
    if (!lista.length || !deposito) return
    const { data, error: errDisp } = await supabase.rpc('stock_disponible_deposito', {
      p_deposito: deposito,
      p_skus: lista,
    })
    if (errDisp || !data || typeof data !== 'object') {
      setDispFalla(true)
      return
    }
    setDispFalla(false)
    setDisp((prev) => ({ ...prev, ...data }))
  }

  // null = no se pudo leer (sin tope)
  function disponibleDe(sku) {
    const f = disp[sku]
    if (!f) return null
    return Number(f.disponible ?? 0)
  }

  async function buscar() {
    if (busqueda.trim().length < 2) {
      setResultados([])
      setTotal(null)
      setBuscado('')
      return
    }
    setBuscando(true)
    setError(null)
    try {
      const texto = busqueda.trim().replace(/,/g, ' ')
      // 17/11/2026 — buscador por palabras: RPC buscar_articulos_deposito (palabras sueltas,
      // cualquier orden, sin tildes, por relevancia). Si todavía no existe en producción
      // (o falla), cae al query viejo de la frase entera con .limit(20), sin total.
      const { data: rpcData, error: errRpc } = await supabase.rpc('buscar_articulos_deposito', {
        p_texto: texto,
        p_limite: 50,
      })
      if (!errRpc && rpcData && Array.isArray(rpcData.items)) {
        setResultados(rpcData.items)
        setTotal(Number(rpcData.total ?? rpcData.items.length))
        // 18/11/2026 — disponible real del origen para los resultados.
        cargarDisp(rpcData.items.map((i) => i.mate_codigo), otroDeposito)
      } else {
        const { data, error: errBusq } = await supabase
          .from('material_yiqi')
          .select('mate_codigo, mate_nombre')
          .or(`mate_codigo.ilike.%${texto}%,mate_nombre.ilike.%${texto}%`)
          .limit(20)
        if (errBusq) throw errBusq
        setResultados(data ?? [])
        setTotal(null)
        cargarDisp((data ?? []).map((i) => i.mate_codigo), otroDeposito)
      }
      setBuscado(texto)
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

  // 18/11/2026 — una línea "pasada" supera el disponible real del origen (sin dato = sin tope).
  const pasada = (p) => {
    const d = disponibleDe(p.sku)
    return d !== null && Number(p.cantidad) > d
  }
  const hayPasadas = carrito.some(pasada)
  const carritoValido = carrito.length > 0 && carrito.every((p) => Number(p.cantidad) > 0) && !hayPasadas

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
      const { data: rpcData, error: errRpc } = await supabase.rpc('crear_remito_reposicion_manual', {
        p_origen: otroDeposito,
        p_destino: miDeposito,
        p_lineas: lineas,
      })
      if (errRpc) throw errRpc
      setCarrito([])
      // 18/11/2026 — publicar en YiQi (fire-and-forget con espera corta; con modo prueba no dice nada extra).
      const enYiqi = await publicarPedidoEnYiqi(supabase, rpcData)
      setAviso(
        `Pedido enviado ${aDeposito(otroDeposito)} — ${lineas.length} artículo${lineas.length === 1 ? '' : 's'}.` +
          (enYiqi === 'creado' ? ' Se creó en YiQi como Remito interno.' : '')
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
        <div className="text-[17px] font-bold">Pedir {otroDeposito ? aDeposito(otroDeposito) : 'al otro depósito'}</div>
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
          placeholder="Buscar por código o palabras (ej.: acrilico auto)"
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

      <div className="px-4 mt-1.5 max-w-xl text-[11px] text-[var(--sub)] flex gap-1.5 items-start">
        <i className="ti ti-bulb mt-px" />
        <span>
          Buscá por palabras sueltas: «acrilico auto» encuentra todo lo que tenga las dos palabras, en cualquier
          orden y con o sin tilde. También podés poner el código. Si salen demasiados, sumá otra palabra (marca,
          color o tamaño).
        </span>
      </div>

      {buscado && !buscando && resultados.length === 0 && !error && (
        <div className="mx-4 mt-2 max-w-xl text-[13px] text-[var(--sub)]">
          No encontramos artículos con «{buscado}». Probá con menos palabras, otra forma de escribirla o el código.
        </div>
      )}

      {total !== null && total > resultados.length && (
        <div className="px-4 mt-2 max-w-xl text-[12px] text-[var(--sub)]">
          Mostrando {resultados.length} de {total} — sumá otra palabra (marca, color, tamaño) para afinar
        </div>
      )}

      {dispFalla && (
        <div className="mx-4 mt-2 max-w-xl text-[12px] text-amber-700">No se pudo leer el stock: el pedido se envía sin tope de cantidad.</div>
      )}

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
                {/* 18/11/2026 — disponible real en el depósito al que se le pide */}
                {disponibleDe(r.mate_codigo) !== null && (
                  <div className="text-[11px] text-[var(--sub)]">
                    Disponible {otroDeposito ? `en ${nombreDeposito(otroDeposito)}` : ''}: {formatoNumero(disponibleDe(r.mate_codigo), { decimales: 2, minDecimales: 0 })}
                  </div>
                )}
              </div>
              <button
                onClick={() => agregarAlCarrito(r)}
                disabled={disponibleDe(r.mate_codigo) === 0}
                className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[var(--ind-bg)] text-[var(--ind)] hover:opacity-80 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {disponibleDe(r.mate_codigo) === 0 ? `Sin stock en ${nombreDeposito(otroDeposito)}` : '+ Agregar'}
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
            {carrito.map((p) => {
              const d = disponibleDe(p.sku)
              return (
                <div key={p.sku} className="px-3.5 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs">{p.sku}</div>
                      <div className="text-sm truncate">{p.mate_nombre}</div>
                      {d !== null && (
                        <div className="text-[11px] text-[var(--sub)]">
                          Disponible en {nombreDeposito(otroDeposito)}: {formatoNumero(d, { decimales: 2, minDecimales: 0 })}
                        </div>
                      )}
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
                  {pasada(p) && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1.5 text-[12px]">
                      <span>No hay más en stock: máximo disponible real {formatoNumero(d, { decimales: 2, minDecimales: 0 })}</span>
                      {d > 0 && (
                        <button
                          onClick={() => actualizarCantidad(p.sku, String(d))}
                          className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white border border-amber-300 hover:bg-amber-100 flex-shrink-0"
                        >
                          Usar {formatoNumero(d, { decimales: 2, minDecimales: 0 })}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={enviarPedido}
          disabled={!carritoValido || enviando}
          className="mt-3 w-full px-3 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--ind,#4338ca)] disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : `📤 Enviar pedido ${otroDeposito ? aDeposito(otroDeposito) : ''}`}
        </button>
      </div>
    </div>
  )
}
