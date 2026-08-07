import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos, filtrarOrdenes } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'

// ============================================================
// SeguimientoOC.jsx — v4
// v3: leia de la tabla propia ordenes_yiqi en vez de YiQi en vivo.
// v4: aplica el filtro de proveedores asignados al usuario logueado.
//
// OJO: ordenes_yiqi NO tiene columna de codigo de proveedor, solo
// `proveedor` (el nombre). El filtro es por nombre si o si.
// ============================================================

const TAMANIO_LOTE = 1000

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

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
    <div className="mt-3 border-t border-gray-100 pt-3">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-gray-400 text-[11px] uppercase">
            <th className="py-1.5">SKU</th>
            <th className="py-1.5">Artículo</th>
            <th className="py-1.5">Cantidad</th>
            <th className="py-1.5">Entregado</th>
            <th className="py-1.5">Pendiente</th>
          </tr>
        </thead>
        <tbody>
          {orden.lineas.map((l, i) => {
            const pend = l.pendiente ?? 0
            return (
              <tr key={i} className={pend > 0 ? 'bg-yellow-50' : ''}>
                <td className="py-1.5 font-mono text-xs">{l.sku ?? '—'}</td>
                <td className="py-1.5 font-medium text-gray-700">{l.nombreArticulo ?? '—'}</td>
                <td className="py-1.5">{l.cantidad}</td>
                <td className="py-1.5 text-[var(--grn)] font-semibold">{l.entregada}</td>
                <td className={`py-1.5 font-semibold ${pend > 0 ? 'text-[var(--red)]' : 'text-gray-300'}`}>
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

export default function SeguimientoOC() {
  const permisos = usePermisos()

  const [ordenes, setOrdenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [filaExpandida, setFilaExpandida] = useState(null)
  const [carpetasAbiertas, setCarpetasAbiertas] = useState({})

  async function cargar() {
    if (permisos.cargando || permisos.error) return
    setLoading(true)
    setError(null)
    try {
      const filas = await traerOrdenesLocal(permisos)
      setOrdenes(agruparPorOrden(filas))
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
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltro])

  const ordenesConEstado = useMemo(
    () => ordenes.map((o) => ({ ...o, _estado: calcularEstado(o) })),
    [ordenes]
  )

  const ordenesFiltradas = useMemo(() => {
    return ordenesConEstado.filter((o) => {
      if (filtroEstado !== 'todas' && o._estado.key !== filtroEstado) return false
      if (fechaDesde && o.fecha && new Date(o.fecha) < new Date(fechaDesde)) return false
      if (fechaHasta && o.fecha && new Date(o.fecha) > new Date(fechaHasta)) return false
      return true
    })
  }, [ordenesConEstado, filtroEstado, fechaDesde, fechaHasta])

  const contadores = useMemo(() => ({
    todas: ordenesConEstado.length,
    enviada: ordenesConEstado.filter((o) => o._estado.key === 'enviada').length,
    parcial: ordenesConEstado.filter((o) => o._estado.key === 'parcial').length,
    completada: ordenesConEstado.filter((o) => o._estado.key === 'completada').length,
  }), [ordenesConEstado])

  const completadasAgrupadas = useMemo(() => {
    const completadas = ordenesFiltradas.filter((o) => o._estado.key === 'completada' && o.fecha)
    const porMes = {}
    for (const oc of completadas) {
      const fecha = new Date(oc.fecha)
      const claveMes = `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`
      const claveDia = fecha.toLocaleDateString('es-AR')
      porMes[claveMes] ??= {}
      porMes[claveMes][claveDia] ??= []
      porMes[claveMes][claveDia].push(oc)
    }
    return porMes
  }, [ordenesFiltradas])

  const noCompletadas = useMemo(
    () => ordenesFiltradas.filter((o) => o._estado.key !== 'completada'),
    [ordenesFiltradas]
  )

  function toggleCarpeta(clave) {
    setCarpetasAbiertas((prev) => ({ ...prev, [clave]: !prev[clave] }))
  }

  const vistaFiltrada = !permisos.cargando && !permisos.error && !permisos.esAdmin

  // El error de permisos va ANTES del return de loading: si no, cargar()
  // sale sin apagar el loading y la pantalla queda colgada en "Cargando…".
  if (permisos.error) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudieron determinar tus permisos</p>
          <p className="text-sm mt-1">{permisos.error}</p>
          <p className="text-xs mt-2 text-gray-500">
            Por seguridad no se muestra ningún dato hasta resolverlo.
          </p>
        </div>
      </div>
    )
  }

  if (loading || permisos.cargando) {
    return <div className="flex-1 overflow-y-auto p-6 text-gray-500">Cargando órdenes de compra...</div>
  }

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudo cargar Seguimiento de OC</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={cargar} className="mt-3 text-sm underline">
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-800">Seguimiento de OC</h1>
        <button onClick={cargar} className="text-sm text-[var(--indigo)] hover:underline">
          Actualizar
        </button>
      </div>

      {/* Aviso de vista filtrada (solo operadores) */}
      {vistaFiltrada && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mb-4">
          Vista filtrada: solo se muestran las OC de tus {permisos.nombres.length} proveedores asignados. Si un
          proveedor tuyo no tiene ninguna OC cargada, simplemente no aparece acá.
        </Aviso>
      )}

      {/* Filtros por estado */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'todas', label: `Todas (${contadores.todas})` },
          { key: 'enviada', label: `Enviadas (${contadores.enviada})` },
          { key: 'parcial', label: `Ingreso parcial (${contadores.parcial})` },
          { key: 'completada', label: `Completadas (${contadores.completada})` },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltroEstado(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              filtroEstado === f.key
                ? 'bg-[var(--indigo)] text-white border-[var(--indigo)]'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Filtro de fechas */}
      <div className="flex gap-3 mb-6 text-sm">
        <label className="flex items-center gap-2 text-gray-500">
          Desde
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2 text-gray-500">
          Hasta
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1"
          />
        </label>
      </div>

      {/* OC no completadas: enviadas y parciales, sueltas */}
      <div className="space-y-3 mb-6">
        {noCompletadas.map((o) => (
          <div key={o.nroOC} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setFilaExpandida(filaExpandida === o.nroOC ? null : o.nroOC)}
            >
              <div>
                <p className="font-semibold text-gray-800">
                  OC #{o.nroOC} — {o.proveedor}
                </p>
                <p className="text-sm text-gray-500">
                  {o.asunto} · {formatoFecha(o.fecha)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-700">{formatoMoneda(o.total)}</span>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${o._estado.clase}`}>
                  {o._estado.label}
                </span>
              </div>
            </div>
            {filaExpandida === o.nroOC && <DetalleOrden orden={o} />}
          </div>
        ))}
        {noCompletadas.length === 0 && (
          <p className="text-sm text-gray-400">No hay órdenes enviadas o con ingreso parcial en este filtro.</p>
        )}
      </div>

      {/* OC completadas: agrupadas por mes > dia (colapsables) */}
      {Object.keys(completadasAgrupadas).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">Historial de completadas</h2>
          {Object.entries(completadasAgrupadas).map(([mes, dias]) => (
            <div key={mes} className="mb-2">
              <button
                onClick={() => toggleCarpeta(mes)}
                className="w-full text-left px-3 py-2 bg-gray-50 rounded-lg text-sm font-medium text-gray-600"
              >
                {carpetasAbiertas[mes] ? '▾' : '▸'} {mes} ({Object.values(dias).flat().length})
              </button>
              {carpetasAbiertas[mes] &&
                Object.entries(dias).map(([dia, ocs]) => (
                  <div key={dia} className="ml-4 mt-2 space-y-2">
                    <p className="text-xs text-gray-400">{dia}</p>
                    {ocs.map((o) => (
                      <div key={o.nroOC} className="bg-white border border-gray-100 rounded-lg p-3">
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setFilaExpandida(filaExpandida === o.nroOC ? null : o.nroOC)}
                        >
                          <div>
                            <p className="font-medium text-gray-700 text-sm">
                              OC #{o.nroOC} — {o.proveedor}
                            </p>
                            <p className="text-xs text-gray-400">{o.asunto}</p>
                          </div>
                          <span className="text-sm font-semibold text-gray-600">
                            {formatoMoneda(o.total)}
                          </span>
                        </div>
                        {filaExpandida === o.nroOC && <DetalleOrden orden={o} />}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
