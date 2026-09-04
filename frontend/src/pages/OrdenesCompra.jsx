import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos, filtrarOrdenes } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'
import OrdenesPropias from '../components/OrdenesPropias'
// ============================================================
// OrdenesCompra.jsx — v3
// v2: leia de la tabla propia ordenes_yiqi en vez de YiQi en vivo.
// v3: aplica el filtro de proveedores asignados al usuario logueado.
//
// OJO: ordenes_yiqi NO tiene columna de codigo de proveedor, solo
// `proveedor` (el nombre). El filtro es por nombre si o si. Ademas,
// las lineas con proveedor NULL quedan fuera de la vista del operador
// (solo las ve el admin) — hoy hay 1 linea en esa condicion.
// ============================================================
const TAMANIO_LOTE = 1000
async function traerOrdenesLocal(permisos) {
  let consultaInicial = supabase
    .from('ordenes_yiqi')
    .select('*', { count: 'exact' })
    .range(0, TAMANIO_LOTE - 1)
  consultaInicial = filtrarOrdenes(consultaInicial, permisos)
  const primera = await consultaInicial
  if (primera.error) throw new Error(primera.error.message)
  const total = primera.count ?? primera.data.length
  let acumulado = [...primera.data]
  if (total > TAMANIO_LOTE) {
    const paginasRestantes = Math.ceil((total - TAMANIO_LOTE) / TAMANIO_LOTE)
    const promesas = []
    for (let i = 1; i <= paginasRestantes; i++) {
      const desde = i * TAMANIO_LOTE
      let consultaPagina = supabase
        .from('ordenes_yiqi')
        .select('*')
        .range(desde, desde + TAMANIO_LOTE - 1)
      consultaPagina = filtrarOrdenes(consultaPagina, permisos)
      promesas.push(consultaPagina)
    }
    const resultados = await Promise.all(promesas)
    for (const r of resultados) {
      if (r.error) throw new Error(r.error.message)
      acumulado = acumulado.concat(r.data)
    }
  }
  return acumulado
}
function formatoMoneda(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
}
function formatoFecha(fechaStr) {
  if (!fechaStr) return '—'
  try {
    return new Date(fechaStr).toLocaleDateString('es-AR')
  } catch {
    return fechaStr
  }
}
function agruparPorOrden(filas) {
  const porNroOC = new Map()
  for (const fila of filas) {
    const nro = fila.nro_oc
    if (!porNroOC.has(nro)) {
      porNroOC.set(nro, {
        nroOC: nro,
        proveedor: fila.proveedor,
        fecha: fila.fecha,
        asunto: fila.asunto,
        condicionPago: fila.condicion_de_pago,
        subtotal: 0,
        total: 0,
        lineas: [],
      })
    }
    const orden = porNroOC.get(nro)
    orden.subtotal += fila.subtotal ?? 0
    orden.total += fila.total ?? 0
    orden.lineas.push({
      sku: fila.sku,
      nombreArticulo: fila.nombre_art,
      cantidad: fila.cantidad ?? 0,
      entregada: fila.cantidad_entregada ?? 0,
      pendiente: fila.cantidad_pendiente ?? 0,
    })
  }
  return Array.from(porNroOC.values())
}
function calcularEstado(orden) {
  const totalCantidad = orden.lineas.reduce((acc, l) => acc + l.cantidad, 0)
  const totalEntregado = orden.lineas.reduce((acc, l) => acc + l.entregada, 0)
  const totalPendiente = orden.lineas.reduce((acc, l) => acc + l.pendiente, 0)
  if (totalCantidad > 0 && totalPendiente === 0) {
    return { key: 'completada', label: 'Completada', clase: 'bg-[var(--grn-bg)] text-[var(--grn)]' }
  }
  if (totalEntregado > 0) {
    return { key: 'parcial', label: 'Ingreso parcial', clase: 'bg-[var(--yel-bg)] text-[#92400e]' }
  }
  return { key: 'enviada', label: 'Enviada', clase: 'bg-gray-100 text-gray-600' }
}
function DetalleOrden({ orden }) {
  return (
    <div className="px-4 py-3 bg-gray-50">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-gray-400 text-[11px] uppercase">
            <th className="py-1.5 px-2">SKU</th>
            <th className="py-1.5 px-2">Artículo</th>
            <th className="py-1.5 px-2">Cantidad</th>
            <th className="py-1.5 px-2">Entregado</th>
            <th className="py-1.5 px-2">Pendiente</th>
          </tr>
        </thead>
        <tbody>
          {orden.lineas.map((l, i) => {
            const pend = l.pendiente ?? 0
            return (
              <tr key={i} className={pend > 0 ? 'bg-yellow-50' : ''}>
                <td className="py-1.5 px-2 font-mono text-xs">{l.sku ?? '—'}</td>
                <td className="py-1.5 px-2 font-medium">{l.nombreArticulo ?? '—'}</td>
                <td className="py-1.5 px-2">{l.cantidad}</td>
                <td className="py-1.5 px-2 text-[var(--grn)] font-semibold">{l.entregada}</td>
                <td className={`py-1.5 px-2 font-semibold ${pend > 0 ? 'text-[var(--red)]' : 'text-gray-300'}`}>
                  {pend > 0 ? pend : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-3 text-[11px] text-amber-600">
        ⚠ "Editar OC" y "Enviar OC" todavía no están disponibles — el sistema es solo lectura contra YiQi (Sprint 2 pendiente).
      </div>
    </div>
  )
}
export default function OrdenesCompra({ onCambioOrdenes }) {
  const permisos = usePermisos()
  const [ordenes, setOrdenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [ordenExpandida, setOrdenExpandida] = useState(null)
  async function cargarDatos() {
    if (permisos.cargando || permisos.error) return
    setLoading(true)
    setError(null)
    try {
      const filas = await traerOrdenesLocal(permisos)
      const agrupadas = agruparPorOrden(filas)
        .map((o) => ({ ...o, _estado: calcularEstado(o) }))
        .filter((o) => o._estado.key !== 'completada')
      agrupadas.sort((a, b) => new Date(b.fecha ?? 0) - new Date(a.fecha ?? 0))
      setOrdenes(agrupadas)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  const claveFiltro =
    permisos.cargando || permisos.error
      ? null
      : `${permisos.esAdmin}|${permisos.nombres.join(',')}`
  useEffect(() => {
    if (claveFiltro === null) return
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltro])
  const ordenesFiltradas = useMemo(() => {
    if (!busqueda) return ordenes
    const texto = busqueda.toLowerCase()
    return ordenes.filter(
      (o) =>
        String(o.nroOC).toLowerCase().includes(texto) ||
        o.proveedor?.toLowerCase().includes(texto) ||
        o.asunto?.toLowerCase().includes(texto)
    )
  }, [ordenes, busqueda])
  function toggleOrden(nroOC) {
    setOrdenExpandida((actual) => (actual === nroOC ? null : nroOC))
  }
  const totalPendienteGeneral = useMemo(
    () => ordenesFiltradas.reduce((acc, o) => acc + o.lineas.reduce((a, l) => a + (l.pendiente ?? 0), 0), 0),
    [ordenesFiltradas]
  )
  const cargandoAlgo = loading || permisos.cargando
  const vistaFiltrada = !permisos.cargando && !permisos.error && !permisos.esAdmin
  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Órdenes de compra</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            {cargandoAlgo
              ? 'Cargando…'
              : `${ordenes.length} OC activas (no completadas) · ${totalPendienteGeneral} unidades pendientes en total`}
          </div>
        </div>
        <button
          onClick={cargarDatos}
          disabled={cargandoAlgo}
          className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {cargandoAlgo ? 'Actualizando…' : '↻ Actualizar'}
        </button>
      </div>
      {/* Error de permisos: falla cerrado, no se muestra ningun dato */}
      {permisos.error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudieron determinar tus permisos</p>
          <p className="text-sm mt-1">{permisos.error}</p>
          <p className="text-xs mt-2 text-gray-500">
            Por seguridad no se muestra ningún dato hasta resolverlo.
          </p>
        </div>
      )}
      {/* Error de datos */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudo cargar Órdenes de compra</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={cargarDatos} className="mt-2 text-sm underline">
            Reintentar
          </button>
        </div>
      )}
      {/* Órdenes generadas desde el sistema, con su circuito de aprobación.
          Va antes de las OC de YiQi porque son las que requieren acción.
          onCambioOrdenes se pasa hacia abajo para que el badge del
          sidebar se refresque en cuanto se aprueba/rechaza/envia/borra. */}
      <OrdenesPropias onCambio={onCambioOrdenes} />
      {/* Aviso de vista filtrada (solo operadores) */}
      {vistaFiltrada && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mx-4 mt-4">
          Vista filtrada: solo se muestran las OC de tus {permisos.nombres.length} proveedores asignados. Si un
          proveedor tuyo no tiene ninguna OC cargada, simplemente no aparece acá.
        </Aviso>
      )}
      {/* Buscador */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-3">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por Nro OC, proveedor o asunto…"
          className="flex-1 max-w-sm border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
        />
        <span className="text-[11px] text-gray-400">💡 Click en una OC para ver el detalle (Ver detalle).</span>
      </div>
      {/* Tabla */}
      <div className="mx-4 mt-2 mb-6 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        {cargandoAlgo && ordenes.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">Cargando órdenes activas…</div>
        ) : ordenesFiltradas.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">
            No hay órdenes activas que coincidan con la búsqueda. 🎉
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                {['Nro OC', 'Proveedor', 'Fecha', 'Asunto', 'Total', 'Estado', ''].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3.5 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenesFiltradas.map((o) => (
                <Fragment key={o.nroOC}>
                  <tr
                    onClick={() => toggleOrden(o.nroOC)}
                    className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer ${
                      ordenExpandida === o.nroOC ? 'bg-indigo-50/50' : ''
                    }`}
                  >
                    <td className="px-3.5 py-1.5 font-mono text-xs">#{o.nroOC}</td>
                    <td className="px-3.5 py-1.5 font-semibold">{o.proveedor}</td>
                    <td className="px-3.5 py-1.5 text-[var(--sub)] text-xs">{formatoFecha(o.fecha)}</td>
                    <td className="px-3.5 py-1.5 text-[var(--sub)] text-xs">{o.asunto ?? '—'}</td>
                    <td className="px-3.5 py-1.5 font-semibold">{formatoMoneda(o.total)}</td>
                    <td className="px-3.5 py-1.5">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${o._estado.clase}`}
                      >
                        {o._estado.label}
                      </span>
                    </td>
                    <td className="px-3.5 py-1.5 text-sm text-[var(--indigo,#4338ca)]">Ver detalle</td>
                  </tr>
                  {ordenExpandida === o.nroOC && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <DetalleOrden orden={o} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
