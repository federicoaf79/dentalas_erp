import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { traerStockPorDeposito } from '../lib/stockPorDeposito'
import { useModoPruebaYiqi } from '../hooks/useModoPruebaYiqi'
import { DEPOSITO_LOCAL, DEPOSITO_CENTRAL, DEPOSITO_OTRO, nombreDeposito, aDeposito } from '../lib/depositos'
import { formatoNumero } from '../lib/formato'

// ============================================================
// components/NuevoPedidoEntreDepositos.jsx — 17/11/2026
// ============================================================
// 17/11/2026 — pedido de Aris: crear desde su app (admin) un pedido de
// mercadería entre depósitos, igual que se hace en la app de depósito
// (pages/deposito/PedirAlOtroDeposito.jsx). Llama al mismo RPC
// crear_remito_reposicion_manual, que ya acepta admin. El pedido queda
// 'en_preparacion' en el depósito de origen.
// ============================================================

const COLUMNA_STOCK = { [DEPOSITO_LOCAL]: 'stock_local', [DEPOSITO_CENTRAL]: 'stock_central' }

export default function NuevoPedidoEntreDepositos({ onCerrar, onCreado }) {
  const { modoPrueba } = useModoPruebaYiqi()
  // origen = quien prepara y envía; destino = quien recibe
  const [origen, setOrigen] = useState(DEPOSITO_CENTRAL)
  const destino = DEPOSITO_OTRO[origen]

  const [busqueda, setBusqueda] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState([])
  // 17/11/2026 — buscador por palabras: total de coincidencias (null = fallback sin RPC) y texto buscado
  const [total, setTotal] = useState(null)
  const [buscado, setBuscado] = useState('')
  const [carrito, setCarrito] = useState([]) // [{sku, mate_nombre, cantidad}]
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [stock, setStock] = useState(null) // null = no cargado / no disponible

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

  // Al cambiar la dirección, el disponible cambia de depósito: se vuelve a leer para lo ya visible.
  useEffect(() => {
    setDisp({})
    cargarDisp([...resultados.map((r) => r.mate_codigo), ...carrito.map((c) => c.sku)], origen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origen])

  // Stock por depósito: si falla, simplemente no se muestra.
  useEffect(() => {
    let vivo = true
    traerStockPorDeposito()
      .then((s) => vivo && setStock(s))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  // 17/11/2026 — buscador por palabras: si el RPC trajo stock_local/stock_central, se usa ese
  // (r = resultado); si no (fallback), el traerStockPorDeposito de siempre.
  function stockOrigen(sku, r) {
    if (r && r[COLUMNA_STOCK[origen]] !== undefined) return Number(r[COLUMNA_STOCK[origen]] ?? 0)
    if (!stock) return null
    const fila = stock[sku]
    if (!fila) return 0
    return Number(fila[COLUMNA_STOCK[origen]] ?? 0)
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
        cargarDisp(rpcData.items.map((i) => i.mate_codigo), origen)
      } else {
        const { data, error: errBusq } = await supabase
          .from('material_yiqi')
          .select('mate_codigo, mate_nombre')
          .or(`mate_codigo.ilike.%${texto}%,mate_nombre.ilike.%${texto}%`)
          .limit(20)
        if (errBusq) throw errBusq
        setResultados(data ?? [])
        setTotal(null)
        cargarDisp((data ?? []).map((i) => i.mate_codigo), origen)
      }
      setBuscado(texto)
    } catch (err) {
      setError(err.message)
    } finally {
      setBuscando(false)
    }
  }

  function agregar(item) {
    setCarrito((prev) =>
      prev.some((p) => p.sku === item.mate_codigo)
        ? prev
        : [...prev, { sku: item.mate_codigo, mate_nombre: item.mate_nombre, cantidad: 1 }]
    )
  }
  const actualizarCantidad = (sku, cantidad) =>
    setCarrito((prev) => prev.map((p) => (p.sku === sku ? { ...p, cantidad } : p)))
  const quitar = (sku) => setCarrito((prev) => prev.filter((p) => p.sku !== sku))

  // 18/11/2026 — una línea "pasada" supera el disponible real del origen (sin dato = sin tope).
  const pasada = (p) => {
    const d = disponibleDe(p.sku)
    return d !== null && Number(p.cantidad) > d
  }
  const carritoValido =
    carrito.length > 0 && carrito.every((p) => Number(p.cantidad) > 0) && !carrito.some(pasada)

  async function enviar() {
    if (!carritoValido || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const lineas = carrito.map((p) => ({
        sku: p.sku,
        mate_nombre: p.mate_nombre,
        cantidad: Number(p.cantidad),
      }))
      const { error: errRpc } = await supabase.rpc('crear_remito_reposicion_manual', {
        p_origen: origen,
        p_destino: destino,
        p_lineas: lineas,
      })
      if (errRpc) throw errRpc
      if (typeof onCreado === 'function') {
        onCreado(`Pedido enviado: ${nombreDeposito(origen)} lo va a ver en Solicitudes para preparar.`)
      }
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onCerrar}>
      <div
        className="bg-white rounded-xl border border-[var(--border)] shadow-xl w-full max-w-xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="text-[15px] font-bold">Nuevo pedido entre depósitos</div>
          <button onClick={onCerrar} title="Cerrar" className="text-gray-400 hover:text-gray-600 leading-none">
            <i className="ti ti-x text-lg" />
          </button>
        </div>

        <label className="block text-[11px] uppercase text-gray-400 font-semibold mb-1">Dirección</label>
        <select
          value={origen}
          onChange={(e) => setOrigen(Number(e.target.value))}
          disabled={enviando}
          className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] mb-1"
        >
          <option value={DEPOSITO_CENTRAL}>Central → Local</option>
          <option value={DEPOSITO_LOCAL}>Local → Central</option>
        </select>
        <div className="text-[12px] text-[var(--sub)] mb-3">
          El origen ({nombreDeposito(origen)}) prepara y envía; el destino ({nombreDeposito(destino)}) recibe y
          confirma.
        </div>

        <div className="bg-blue-50 border border-blue-100 text-[#1d4ed8] rounded-lg px-3.5 py-2.5 text-[12px] mb-3">
          El depósito de origen tiene que prepararlo y el de destino confirmarlo en la app de depósito.
          {modoPrueba && ' Mientras esté el modo prueba, el traspaso no mueve stock en YiQi.'}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-[var(--red)] rounded-lg px-3.5 py-2.5 text-[13px] mb-3">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="Buscar por código o palabras (ej.: acrilico auto)"
            className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
          />
          <button onClick={buscar} disabled={buscando} className="btn btn-sm">
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>

        <div className="mt-1.5 text-[11px] text-[var(--sub)] flex gap-1.5 items-start">
          <i className="ti ti-bulb mt-px" />
          <span>
            Buscá por palabras sueltas: «acrilico auto» encuentra todo lo que tenga las dos palabras, en cualquier
            orden y con o sin tilde. También podés poner el código. Si salen demasiados, sumá otra palabra (marca,
            color o tamaño).
          </span>
        </div>

        {buscado && !buscando && resultados.length === 0 && !error && (
          <div className="mt-2 text-[13px] text-[var(--sub)]">
            No encontramos artículos con «{buscado}». Probá con menos palabras, otra forma de escribirla o el código.
          </div>
        )}

        {total !== null && total > resultados.length && (
          <div className="mt-2 text-[12px] text-[var(--sub)]">
            Mostrando {resultados.length} de {total} — sumá otra palabra (marca, color, tamaño) para afinar
          </div>
        )}

        {dispFalla && (
          <div className="mt-2 text-[12px] text-amber-700">No se pudo leer el stock: el pedido se envía sin tope de cantidad.</div>
        )}

        {resultados.length > 0 && (
          <div className="mt-2 border border-[var(--border)] rounded-xl overflow-hidden max-h-56 overflow-y-auto">
            {resultados.map((r) => {
              const s = stockOrigen(r.mate_codigo, r)
              return (
                <div
                  key={r.mate_codigo}
                  className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs">{r.mate_codigo}</div>
                    <div className="text-sm truncate">{r.mate_nombre}</div>
                    {/* 18/11/2026 — disponible real (stock menos lo ya comprometido en pedidos abiertos) */}
                    {disponibleDe(r.mate_codigo) !== null ? (
                      <div className="text-[11px] text-[var(--sub)]">
                        Disponible en {nombreDeposito(origen)}: {formatoNumero(disponibleDe(r.mate_codigo), { decimales: 2, minDecimales: 0 })}
                      </div>
                    ) : (
                      s !== null && (
                        <div className="text-[11px] text-[var(--sub)]">
                          Stock en {nombreDeposito(origen)}: {formatoNumero(s)}
                        </div>
                      )
                    )}
                  </div>
                  <button
                    onClick={() => agregar(r)}
                    disabled={disponibleDe(r.mate_codigo) === 0}
                    className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[var(--ind-bg)] text-[var(--ind)] hover:opacity-80 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {disponibleDe(r.mate_codigo) === 0 ? `Sin stock en ${nombreDeposito(origen)}` : '+ Agregar'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-4">
          <div className="text-[13px] font-semibold mb-2">Pedido ({carrito.length})</div>
          {carrito.length === 0 ? (
            <div className="border border-[var(--border)] rounded-xl p-5 text-center text-[var(--sub)] text-sm">
              Todavía no agregaste artículos.
            </div>
          ) : (
            <div className="border border-[var(--border)] rounded-xl overflow-hidden">
              {carrito.map((p) => {
                const s = stockOrigen(p.sku)
                const d = disponibleDe(p.sku)
                return (
                  <div key={p.sku} className="px-3.5 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs">{p.sku}</div>
                      <div className="text-sm truncate">{p.mate_nombre}</div>
                      {d !== null ? (
                        <div className="text-[11px] text-[var(--sub)]">
                          Disponible en {nombreDeposito(origen)}: {formatoNumero(d, { decimales: 2, minDecimales: 0 })}
                        </div>
                      ) : (
                        s !== null && (
                          <div className="text-[11px] text-[var(--sub)]">
                            Stock en {nombreDeposito(origen)}: {formatoNumero(s)}
                          </div>
                        )
                      )}
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={p.cantidad}
                      onChange={(e) => actualizarCantidad(p.sku, e.target.value)}
                      className="w-20 border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => quitar(p.sku)}
                      title="Quitar"
                      className="text-gray-400 hover:text-[var(--red)] px-1"
                    >
                      <i className="ti ti-x" />
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
        </div>

        <button
          onClick={enviar}
          disabled={!carritoValido || enviando}
          className="mt-4 w-full px-3 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--ind,#4338ca)] disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : `Enviar pedido ${aDeposito(origen)}`}
        </button>
      </div>
    </div>
  )
}
