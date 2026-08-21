import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos, filtrarMaterial } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'
import { traerStockPorDeposito, textoDesgloseStock } from '../lib/stockPorDeposito'

// ============================================================
// MonitorStock.jsx — v4
// v3: leia de la tabla propia material_yiqi (sincronizada cada 15 min
//     por el cron sync-material-cada-15-min) en vez de YiQi en vivo.
// v4: aplica el filtro de proveedores asignados al usuario logueado.
//     Admin (Aris) ve todo; operador (Ivana) ve solo lo suyo.
// ============================================================

const COLOR_CLASSES = {
  red: 'bg-[var(--red-bg)] text-[var(--red)]',
  yel: 'bg-[var(--yel-bg)] text-[#92400e]',
  grn: 'bg-[var(--grn-bg)] text-[var(--grn)]',
  gray: 'bg-gray-100 text-gray-500',
}

const TAMANIO_LOTE = 1000 // limite por request de Supabase/PostgREST

// IMPORTANTE: el filtro se aplica tanto a la consulta inicial (la que
// trae el count exacto) como a las paginas restantes. Filtrar solo la
// primera daria un total filtrado pero paginas con el catalogo entero.
async function traerMaterialLocal(permisos) {
  let consultaInicial = supabase
    .from('material_yiqi')
    .select('*', { count: 'exact' })
    .range(0, TAMANIO_LOTE - 1)
  consultaInicial = filtrarMaterial(consultaInicial, permisos)

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
        .from('material_yiqi')
        .select('*')
        .range(desde, desde + TAMANIO_LOTE - 1)
      consultaPagina = filtrarMaterial(consultaPagina, permisos)
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

// Mismo criterio que Alertas.jsx (ítem 19, 21/8/2026): un artículo no
// entra en el conteo de "Alertas activas" si es un SKU administrativo
// (889/890/99999), una publicación de Mercado Libre, un discontinuado o
// producción propia (proveedor Dentalab). Antes de este fix, Monitor de
// stock calculaba sus propias alertas sin ningún filtro — mostraba un
// número más alto todavía que el badge viejo del sidebar (2595/443 vs.
// 2401/440 reales), justo en la primera pantalla que ve el usuario al
// entrar. Se copia la función tal cual en vez de importarla porque
// Alertas.jsx no expone nada compartido todavía — si se vuelve a tocar
// este criterio, hay que actualizar los dos lugares (o extraer un
// helper común más adelante).
function esExcluidoDeAlertas(articulo) {
  const sku = articulo.mate_codigo ?? ''
  const nombre = articulo.mate_nombre ?? ''
  const proveedor = articulo.clie_nombre ?? ''
  if (['889', '890', '99999'].includes(sku)) return true
  if (nombre.startsWith('###')) return true
  if (nombre.toLowerCase().includes('discontinuad')) return true
  if (proveedor === 'Dentalab') return true
  return false
}

function calcularAlerta(articulo) {
  const stock = articulo.mate_stock_disponible ?? 0
  const puntoPedidoManual = articulo.mate_punto_de_pedido
  const stockSeguridad = articulo.mate_stock_seguridad

  const hayPuntoPedidoManual = puntoPedidoManual != null && puntoPedidoManual > 0
  const umbral = hayPuntoPedidoManual ? puntoPedidoManual : stockSeguridad

  if (umbral == null) return { nivel: 'sin-config', label: '—', color: 'gray' }
  if (stock <= 0) return { nivel: 'critica', label: 'Crítica', color: 'red' }
  if (stock <= umbral) return { nivel: 'preventiva', label: 'Preventiva', color: 'yel' }
  return { nivel: 'ok', label: 'OK', color: 'grn' }
}

function formatoFechaHora(fechaStr) {
  if (!fechaStr) return '—'
  try {
    return new Date(fechaStr).toLocaleString('es-AR')
  } catch {
    return fechaStr
  }
}

export default function MonitorStock() {
  const permisos = usePermisos()

  const [articulos, setArticulos] = useState([])
  const [stockPorSku, setStockPorSku] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [verTodos, setVerTodos] = useState(false)
  const [paginaActual, setPaginaActual] = useState(1)
  const [filasPorPagina, setFilasPorPagina] = useState(50)

  async function cargarDatos() {
    if (permisos.cargando || permisos.error) return
    setLoading(true)
    setError(null)
    try {
      // En paralelo: el desglose por deposito no bloquea el resto de
      // la pantalla si por lo que sea tarda -- si falla, se loguea y
      // sigue mostrando el stock combinado igual (no es critico).
      const [data, stock] = await Promise.all([
        traerMaterialLocal(permisos),
        traerStockPorDeposito().catch((err) => {
          console.warn('No se pudo cargar el desglose de stock por deposito:', err.message)
          return {}
        }),
      ])
      setArticulos(data)
      setStockPorSku(stock)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Clave derivada de los permisos reales. Si el objeto `permisos` se
  // regenera pero el contenido es el mismo (ej. refresh de token de
  // Supabase), la clave no cambia y no se recargan los 7.171 articulos.
  const claveFiltro =
    permisos.cargando || permisos.error
      ? null
      : `${permisos.esAdmin}|${permisos.codigos.join(',')}|${permisos.nombres.join(',')}`

  useEffect(() => {
    if (claveFiltro === null) return
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltro])

  useEffect(() => {
    setPaginaActual(1)
  }, [busqueda, verTodos, filasPorPagina])

  const ultimaSync = useMemo(() => {
    if (articulos.length === 0) return null
    const fechas = articulos.map((a) => new Date(a.sincronizado_en).getTime()).filter((t) => !isNaN(t))
    if (fechas.length === 0) return null
    return new Date(Math.max(...fechas))
  }, [articulos])

  const articulosFiltrados = useMemo(() => {
    return articulos.filter((a) => {
      if (!busqueda) return true
      const texto = busqueda.toLowerCase()
      return (
        a.mate_nombre?.toLowerCase().includes(texto) ||
        a.mate_codigo?.toLowerCase().includes(texto) ||
        a.clie_nombre?.toLowerCase().includes(texto)
      )
    })
  }, [articulos, busqueda])

  const conAlerta = useMemo(() => {
    return articulosFiltrados.filter((a) => {
      if (esExcluidoDeAlertas(a)) return false
      const { nivel } = calcularAlerta(a)
      return nivel === 'critica' || nivel === 'preventiva'
    })
  }, [articulosFiltrados])

  const criticas = useMemo(
    () => conAlerta.filter((a) => calcularAlerta(a).nivel === 'critica').length,
    [conAlerta]
  )
  const preventivas = useMemo(
    () => conAlerta.filter((a) => calcularAlerta(a).nivel === 'preventiva').length,
    [conAlerta]
  )

  const filasAMostrar = verTodos ? articulosFiltrados : conAlerta

  const totalFilas = filasAMostrar.length
  const totalPaginasTabla = Math.max(1, Math.ceil(totalFilas / filasPorPagina))
  const paginaSegura = Math.min(paginaActual, totalPaginasTabla)
  const inicioSlice = (paginaSegura - 1) * filasPorPagina
  const filasPaginadas = filasAMostrar.slice(inicioSlice, inicioSlice + filasPorPagina)

  const cargandoAlgo = loading || permisos.cargando
  const vistaFiltrada = !permisos.cargando && !permisos.error && !permisos.esAdmin

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Monitor de stock</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            {cargandoAlgo
              ? 'Cargando…'
              : `Datos sincronizados · última actualización de YiQi: ${formatoFechaHora(ultimaSync)}`}
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
          <p className="font-semibold">No se pudo cargar Monitor de Stock</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={cargarDatos} className="mt-2 text-sm underline">
            Reintentar
          </button>
        </div>
      )}

      {/* Nota de arquitectura (transparencia) */}
      <Aviso tipo="info" id="monitor-arquitectura" className="mx-4 mt-4">
        Estos datos vienen de nuestra propia base, sincronizada automáticamente desde YiQi cada 15 minutos —
        no es en vivo al 100%, pero sí prácticamente actualizado.
      </Aviso>

      {/* Aviso de vista filtrada (solo operadores) */}
      {vistaFiltrada && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mx-4 mt-2">
          Vista filtrada: estás viendo únicamente los {permisos.nombres.length} proveedores asignados a tu
          usuario. Si falta alguno, pedile a Aris que te lo asigne en “Usuarios y accesos”.
        </Aviso>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-4 gap-2.5 p-4">
        <div className="bg-white rounded-xl p-4 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Alertas activas</div>
          <div className="flex items-center gap-2 text-[18px]">
            <span className="text-[var(--red)] font-extrabold">{criticas}</span>
            <span className="text-gray-400 text-xs">crít.</span>
            <span className="text-[#92400e] font-extrabold">{preventivas}</span>
            <span className="text-gray-400 text-xs">prev.</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">
            {vistaFiltrada ? 'Artículos visibles' : 'Artículos totales'}
          </div>
          <div className="text-2xl font-bold">{articulos.length}</div>
          <div className="text-[11px] text-gray-400 mt-1">
            {cargandoAlgo
              ? 'cargando…'
              : vistaFiltrada
              ? 'de tus proveedores asignados'
              : 'catálogo completo (base propia)'}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Origen de datos</div>
          <div className="text-2xl font-bold text-[var(--grn)]">
            {error ? '⚠ Error' : cargandoAlgo ? '…' : '✓ Sincronizado'}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Criterio de alerta</div>
          <div className="text-[12px] text-gray-500 leading-tight mt-1">
            Punto de pedido manual si existe, o Stock Seguridad como respaldo (provisorio)
          </div>
        </div>
      </div>

      {/* Buscador y toggle ver todos */}
      <div className="px-4 pb-2 flex items-center justify-between gap-3 flex-wrap">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por SKU, nombre o proveedor…"
          className="flex-1 max-w-sm border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
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
          <button
            onClick={() => setVerTodos((v) => !v)}
            className="text-sm text-[var(--indigo,#4338ca)] hover:underline whitespace-nowrap"
          >
            {verTodos ? 'Ver solo con alerta' : `Ver todos (${articulosFiltrados.length})`}
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="mx-4 mb-2 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        {cargandoAlgo && articulos.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">Cargando artículos…</div>
        ) : filasAMostrar.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">
            {verTodos
              ? 'No hay artículos que coincidan con la búsqueda.'
              : 'No hay artículos con alerta en este momento (o no coinciden con la búsqueda).'}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                {['SKU', 'Producto', 'Proveedor', 'Stock', 'Punto de pedido', 'Stock Seguridad', 'Estado'].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left px-3.5 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filasPaginadas.map((a) => {
                const alerta = calcularAlerta(a)
                return (
                  <tr key={a.yiqi_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3.5 py-2.5 font-mono text-xs">{a.mate_codigo}</td>
                    <td className="px-3.5 py-2.5 font-semibold">{a.mate_nombre}</td>
                    <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{a.clie_nombre ?? '—'}</td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-bold">{a.mate_stock_disponible ?? 0}</div>
                      {(() => {
                        const desglose = textoDesgloseStock(stockPorSku[a.mate_codigo])
                        if (!desglose) return null
                        return (
                          <div
                            className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap"
                            title={desglose.tooltip}
                          >
                            {desglose.principal}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-3.5 py-2.5 text-gray-400">
                      {a.mate_punto_de_pedido > 0 ? a.mate_punto_de_pedido : '— (sin config.)'}
                    </td>
                    <td className="px-3.5 py-2.5 text-gray-400">{a.mate_stock_seguridad ?? '—'}</td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${COLOR_CLASSES[alerta.color]}`}
                      >
                        {alerta.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginador */}
      {filasAMostrar.length > 0 && (
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
