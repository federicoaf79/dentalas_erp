import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos, filtrarOrdenes } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'

// ============================================================
// HistorialOC.jsx — v3
// v2: leia de la tabla propia ordenes_yiqi en vez de YiQi en vivo.
// v3: aplica el filtro de proveedores asignados al usuario logueado.
//
// OJO: ordenes_yiqi NO tiene columna de codigo de proveedor, solo
// `proveedor` (el nombre). El filtro es por nombre si o si.
// El desplegable "Proveedor" se arma con las ordenes ya traidas, asi
// que queda filtrado solo (un operador no ve proveedores ajenos ahi).
// ============================================================

const TAMANIO_LOTE = 1000

// El filtro va tanto en la consulta inicial (la del count exacto)
// como en las paginas restantes.
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
    </div>
  )
}

export default function HistorialOC() {
  const permisos = usePermisos()

  const [ordenes, setOrdenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [proveedorFiltro, setProveedorFiltro] = useState('todos')
  const [estadoFiltro, setEstadoFiltro] = useState('todas')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const [ordenExpandida, setOrdenExpandida] = useState(null)
  const [paginaActual, setPaginaActual] = useState(1)
  const [filasPorPagina, setFilasPorPagina] = useState(25)

  async function cargarDatos() {
    if (permisos.cargando || permisos.error) return
    setLoading(true)
    setError(null)
    try {
      const filas = await traerOrdenesLocal(permisos)
      const agrupadas = agruparPorOrden(filas).map((o) => ({ ...o, _estado: calcularEstado(o) }))
      agrupadas.sort((a, b) => new Date(b.fecha ?? 0) - new Date(a.fecha ?? 0))
      setOrdenes(agrupadas)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Clave derivada: evita recargar ante un simple refresh de token.
  const claveFiltro =
    permisos.cargando || permisos.error
      ? null
      : `${permisos.esAdmin}|${permisos.nombres.join(',')}`

  useEffect(() => {
    if (claveFiltro === null) return
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltro])

  useEffect(() => {
    setPaginaActual(1)
    setOrdenExpandida(null)
  }, [busqueda, proveedorFiltro, estadoFiltro, fechaDesde, fechaHasta, filasPorPagina])

  const proveedoresDisponibles = useMemo(() => {
    const nombres = new Set(ordenes.map((o) => o.proveedor).filter(Boolean))
    return Array.from(nombres).sort()
  }, [ordenes])

  const ordenesFiltradas = useMemo(() => {
    return ordenes.filter((o) => {
      if (proveedorFiltro !== 'todos' && o.proveedor !== proveedorFiltro) return false
      if (estadoFiltro !== 'todas' && o._estado.key !== estadoFiltro) return false
      if (fechaDesde && o.fecha && new Date(o.fecha) < new Date(fechaDesde)) return false
      if (fechaHasta && o.fecha && new Date(o.fecha) > new Date(fechaHasta)) return false
      if (busqueda) {
        const texto = busqueda.toLowerCase()
        const coincide =
          String(o.nroOC).toLowerCase().includes(texto) ||
          o.proveedor?.toLowerCase().includes(texto) ||
          o.asunto?.toLowerCase().includes(texto)
        if (!coincide) return false
      }
      return true
    })
  }, [ordenes, proveedorFiltro, estadoFiltro, fechaDesde, fechaHasta, busqueda])

  const totalFilas = ordenesFiltradas.length
  const totalPaginasTabla = Math.max(1, Math.ceil(totalFilas / filasPorPagina))
  const paginaSegura = Math.min(paginaActual, totalPaginasTabla)
  const inicioSlice = (paginaSegura - 1) * filasPorPagina
  const filasPaginadas = ordenesFiltradas.slice(inicioSlice, inicioSlice + filasPorPagina)

  function toggleOrden(nroOC) {
    setOrdenExpandida((actual) => (actual === nroOC ? null : nroOC))
  }

  function limpiarFiltros() {
    setBusqueda('')
    setProveedorFiltro('todos')
    setEstadoFiltro('todas')
    setFechaDesde('')
    setFechaHasta('')
  }

  const cargandoAlgo = loading || permisos.cargando
  const vistaFiltrada = !permisos.cargando && !permisos.error && !permisos.esAdmin

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Historial de OC</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            {cargandoAlgo
              ? 'Cargando…'
              : vistaFiltrada
              ? `${ordenes.length} órdenes de tus proveedores asignados · buscable`
              : `${ordenes.length} órdenes en total · archivo completo, buscable`}
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
          <p className="font-semibold">No se pudo cargar Historial de OC</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={cargarDatos} className="mt-2 text-sm underline">
            Reintentar
          </button>
        </div>
      )}

      {/* Aviso de vista filtrada (solo operadores) */}
      {vistaFiltrada && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mx-4 mt-4">
          Vista filtrada: el historial muestra únicamente las OC de tus {permisos.nombres.length} proveedores
          asignados. El desplegable “Proveedor” también queda limitado a ellos.
        </Aviso>
      )}

      {/* Filtros */}
      <div className="mx-4 mt-4 bg-white rounded-xl border border-[var(--border)] p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gray-400 uppercase">Buscar</label>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nro OC, proveedor o asunto…"
            className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-56"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gray-400 uppercase">Proveedor</label>
          <select
            value={proveedorFiltro}
            onChange={(e) => setProveedorFiltro(e.target.value)}
            className="border border-[var(--border)] rounded-lg px-2 py-2 text-sm max-w-[180px]"
          >
            <option value="todos">Todos</option>
            {proveedoresDisponibles.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gray-400 uppercase">Estado</label>
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            className="border border-[var(--border)] rounded-lg px-2 py-2 text-sm"
          >
            <option value="todas">Todas</option>
            <option value="enviada">Enviada</option>
            <option value="parcial">Ingreso parcial</option>
            <option value="completada">Completada</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gray-400 uppercase">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="border border-[var(--border)] rounded-lg px-2 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gray-400 uppercase">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="border border-[var(--border)] rounded-lg px-2 py-2 text-sm"
          />
        </div>

        <button
          onClick={limpiarFiltros}
          className="text-sm text-[var(--indigo,#4338ca)] hover:underline ml-auto"
        >
          Limpiar filtros
        </button>
      </div>

      {/* Selector de filas por página */}
      <div className="px-4 pt-3 flex items-center justify-between">
        <span className="text-[11px] text-gray-400">💡 Click en una OC para ver sus artículos.</span>
        <label className="flex items-center gap-2 text-sm text-gray-500">
          Filas por página
          <select
            value={filasPorPagina}
            onChange={(e) => setFilasPorPagina(Number(e.target.value))}
            className="border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm"
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Tabla */}
      <div className="mx-4 mt-2 mb-2 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        {cargandoAlgo && ordenes.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">Cargando historial de órdenes…</div>
        ) : filasPaginadas.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">
            No hay órdenes que coincidan con los filtros.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                {['Nro OC', 'Proveedor', 'Fecha', 'Asunto', 'Total', 'Estado'].map((h) => (
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
              {filasPaginadas.map((o) => (
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
                  </tr>
                  {ordenExpandida === o.nroOC && (
                    <tr>
                      <td colSpan={6} className="p-0">
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

      {/* Paginador */}
      {ordenesFiltradas.length > 0 && (
        <div className="mx-4 mb-6 flex items-center justify-between text-sm text-gray-500 px-1">
          <span>
            Mostrando {inicioSlice + 1}–{Math.min(inicioSlice + filasPorPagina, totalFilas)} de {totalFilas}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
              disabled={paginaSegura <= 1}
              className="px-2.5 py-1 rounded border border-[var(--border)] disabled:opacity-40"
            >
              ‹ Anterior
            </button>
            <span className="text-xs text-gray-400">
              Página {paginaSegura} de {totalPaginasTabla}
            </span>
            <button
              onClick={() => setPaginaActual((p) => Math.min(totalPaginasTabla, p + 1))}
              disabled={paginaSegura >= totalPaginasTabla}
              className="px-2.5 py-1 rounded border border-[var(--border)] disabled:opacity-40"
            >
              Siguiente ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
