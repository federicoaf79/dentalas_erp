import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos, filtrarOrdenes } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'
import Pastilla from '../components/ui/Pastilla'

// ============================================================
// HistorialOC.jsx — v3
// v2: leia de la tabla propia ordenes_yiqi en vez de YiQi en vivo.
// v3: aplica el filtro de proveedores asignados al usuario logueado.
// v4 (5/10/2026): estética prototipo v7 — encabezado blanco, métricas del
// mes calculadas con las mismas órdenes ya cargadas (sin consultas nuevas),
// filtros compactos en .seccion y tabla .tw/.tabla con Pastilla de estado.
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

// Monto compacto para la tarjeta de métricas ("$4,2 M").
function formatoMonedaCorto(n) {
  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  }
  return formatoMoneda(n)
}

// "AAAA-MM" de la fecha de la OC. Si viene como texto ISO se toma tal cual
// (evita el corrimiento de zona horaria de new Date('AAAA-MM-DD')).
function claveMes(fechaStr) {
  if (!fechaStr) return null
  const m = /^(\d{4})-(\d{2})/.exec(String(fechaStr))
  if (m) return `${m[1]}-${m[2]}`
  const d = new Date(fechaStr)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const TONO_ESTADO = { completada: 'verde', parcial: 'amarillo', enviada: 'gris' }
const ICONO_ESTADO = { completada: 'ti-check', parcial: 'ti-alert-triangle', enviada: null }

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
    <div className="px-7 py-4 bg-[#fafafa] border-t border-[#f3f4f6]">
      <div className="text-[12px] font-bold text-[#374151] mb-2">Detalle por artículo</div>
      <div className="tw">
        <table className="tabla">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Artículo</th>
              <th>Cantidad</th>
              <th>Entregado</th>
              <th>Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {orden.lineas.map((l, i) => {
              const pend = l.pendiente ?? 0
              return (
                <tr key={i} className={pend > 0 ? 'bg-[#fffbeb]' : ''}>
                  <td className="sku">{l.sku ?? '—'}</td>
                  <td className="font-semibold">{l.nombreArticulo ?? '—'}</td>
                  <td className="tabular-nums">{l.cantidad}</td>
                  <td className="tabular-nums text-[var(--grn)] font-bold">{l.entregada}</td>
                  <td className={`tabular-nums font-bold ${pend > 0 ? 'text-[var(--red)]' : 'text-[#9ca3af] font-normal'}`}>
                    {pend > 0 ? pend : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
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

  // Métricas del mes (prototipo v7). Se calculan sobre todas las órdenes ya
  // traídas (respetan el filtro de proveedores del usuario), no sobre los
  // filtros de la tabla. La única fecha disponible es la de la OC: "este mes"
  // = OC con fecha en el mes actual.
  const metricasMes = useMemo(() => {
    const hoy = new Date()
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
    const delMes = ordenes.filter((o) => claveMes(o.fecha) === mesActual)
    return {
      completadas: delMes.filter((o) => o._estado.key === 'completada').length,
      enviadas: delMes.length,
      gasto: delMes.reduce((acc, o) => acc + (o.total ?? 0), 0),
      parciales: delMes.filter((o) => o._estado.key === 'parcial').length,
    }
  }, [ordenes])

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
      <EncabezadoPagina
        titulo="Historial de OC"
        bajada={
          cargandoAlgo
            ? 'Cargando…'
            : vistaFiltrada
            ? `${ordenes.length} órdenes de tus proveedores asignados · buscable`
            : `${ordenes.length} órdenes en total · archivo completo, buscable`
        }
      >
        <button onClick={cargarDatos} disabled={cargandoAlgo} className="btn btn-sm">
          <i className="ti ti-refresh" /> {cargandoAlgo ? 'Actualizando…' : 'Actualizar'}
        </button>
      </EncabezadoPagina>

      <div className="pagina">
        {/* Error de permisos: falla cerrado, no se muestra ningun dato */}
        {permisos.error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
            <p className="font-semibold">No se pudieron determinar tus permisos</p>
            <p className="text-sm mt-1">{permisos.error}</p>
            <p className="text-xs mt-2 text-gray-500">
              Por seguridad no se muestra ningún dato hasta resolverlo.
            </p>
          </div>
        )}

        {/* Error de datos */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
            <p className="font-semibold">No se pudo cargar Historial de OC</p>
            <p className="text-sm mt-1">{error}</p>
            <button onClick={cargarDatos} className="mt-2 text-sm underline">
              Reintentar
            </button>
          </div>
        )}

        {/* Aviso de vista filtrada (solo operadores) */}
        {vistaFiltrada && (
          <Aviso tipo="filtro" autoCerrarEn={15} className="mb-4">
            Vista filtrada: el historial muestra únicamente las OC de tus {permisos.nombres.length} proveedores
            asignados. El desplegable “Proveedor” también queda limitado a ellos.
          </Aviso>
        )}

        {/* Métricas del mes (calculadas con las órdenes ya cargadas) */}
        {!cargandoAlgo && !permisos.error && !error && (
          <div className="metricas mb-4">
            <div className="metrica">
              <div className="metrica-rot">Completadas este mes</div>
              <div className="metrica-val text-[var(--grn)]">{metricasMes.completadas}</div>
              <div className="metrica-sub">OC del mes ya recibidas</div>
            </div>
            <div className="metrica">
              <div className="metrica-rot">Enviadas este mes</div>
              <div className="metrica-val text-[var(--text)]">{metricasMes.enviadas}</div>
              <div className="metrica-sub">OC con fecha de este mes</div>
            </div>
            <div className="metrica">
              <div className="metrica-rot">Gasto del mes</div>
              <div className="metrica-val text-[var(--text)] text-[20px]!" title={formatoMoneda(metricasMes.gasto)}>
                {formatoMonedaCorto(metricasMes.gasto)}
              </div>
              <div className="metrica-sub">suma de totales de las OC del mes</div>
            </div>
            <div className="metrica">
              <div className="metrica-rot">Ingresos parciales</div>
              <div className="metrica-val text-[#b8860b]">{metricasMes.parciales}</div>
              <div className="metrica-sub">este mes</div>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="seccion py-3! px-4! mb-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--sub)] uppercase tracking-wide">Buscar</label>
            <div className="relative">
              <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-[#9ca3af] pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nro OC, proveedor o asunto…"
                className="border border-[var(--border)] rounded-lg pl-8 pr-3 py-1.5 text-[13px] w-56"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--sub)] uppercase tracking-wide">Proveedor</label>
            <select
              value={proveedorFiltro}
              onChange={(e) => setProveedorFiltro(e.target.value)}
              className="border border-[var(--border)] rounded-lg px-2 py-1.5 text-[13px] max-w-[180px] bg-white"
            >
              <option value="todos">Todos</option>
              {proveedoresDisponibles.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--sub)] uppercase tracking-wide">Estado</label>
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className="border border-[var(--border)] rounded-lg px-2 py-1.5 text-[13px] bg-white"
            >
              <option value="todas">Todas</option>
              <option value="enviada">Enviada</option>
              <option value="parcial">Ingreso parcial</option>
              <option value="completada">Completada</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--sub)] uppercase tracking-wide">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="border border-[var(--border)] rounded-lg px-2 py-1.5 text-[13px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--sub)] uppercase tracking-wide">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="border border-[var(--border)] rounded-lg px-2 py-1.5 text-[13px]"
            />
          </div>

          <button onClick={limpiarFiltros} className="btn btn-sm ml-auto">
            <i className="ti ti-x" /> Limpiar filtros
          </button>
        </div>

        {/* Selector de filas por página */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-[#9ca3af]">Click en una OC para ver sus artículos.</span>
          <label className="flex items-center gap-2 text-[12px] text-[var(--sub)]">
            Filas por página
            <select
              value={filasPorPagina}
              onChange={(e) => setFilasPorPagina(Number(e.target.value))}
              className="border border-[var(--border)] rounded-lg px-2 py-1 text-[12px] bg-white"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Tabla */}
        <div className="tw">
          {cargandoAlgo && ordenes.length === 0 ? (
            <div className="p-8 text-center text-[var(--sub)] text-[13px]">Cargando historial de órdenes…</div>
          ) : filasPaginadas.length === 0 ? (
            <div className="p-8 text-center text-[var(--sub)] text-[13px]">
              No hay órdenes que coincidan con los filtros.
            </div>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  {['N° OC', 'Proveedor', 'Fecha', 'Asunto', 'Total', 'Estado'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasPaginadas.map((o) => (
                  <Fragment key={o.nroOC}>
                    <tr
                      onClick={() => toggleOrden(o.nroOC)}
                      className={`cursor-pointer ${
                        ordenExpandida === o.nroOC
                          ? 'bg-[#eef2ff]'
                          : o._estado.key === 'parcial'
                          ? 'bg-[#fffbeb]'
                          : ''
                      }`}
                    >
                      <td className="text-[13px] font-semibold text-[var(--ind)] whitespace-nowrap">#{o.nroOC}</td>
                      <td className="font-semibold">{o.proveedor}</td>
                      <td className="text-[12px]! text-[var(--sub)] whitespace-nowrap">{formatoFecha(o.fecha)}</td>
                      <td className="text-[12px]! text-[var(--sub)]">{o.asunto ?? '—'}</td>
                      <td className="font-bold tabular-nums whitespace-nowrap">{formatoMoneda(o.total)}</td>
                      <td>
                        <Pastilla tono={TONO_ESTADO[o._estado.key]}>
                          {ICONO_ESTADO[o._estado.key] && <i className={`ti ${ICONO_ESTADO[o._estado.key]}`} />}
                          {o._estado.label}
                        </Pastilla>
                      </td>
                    </tr>
                    {ordenExpandida === o.nroOC && (
                      <tr>
                        <td colSpan={6} className="p-0!">
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
          <div className="mt-3 flex items-center justify-between text-[12px] text-[var(--sub)] px-1">
            <span>
              Mostrando {inicioSlice + 1}–{Math.min(inicioSlice + filasPorPagina, totalFilas)} de {totalFilas}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                disabled={paginaSegura <= 1}
                className="btn btn-sm"
              >
                ‹ Anterior
              </button>
              <span className="text-[11px] text-[#9ca3af]">
                Página {paginaSegura} de {totalPaginasTabla}
              </span>
              <button
                onClick={() => setPaginaActual((p) => Math.min(totalPaginasTabla, p + 1))}
                disabled={paginaSegura >= totalPaginasTabla}
                className="btn btn-sm"
              >
                Siguiente ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
