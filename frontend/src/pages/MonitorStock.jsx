import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos, filtrarMaterial } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'
import { traerStockPorDeposito, textoDesgloseStock } from '../lib/stockPorDeposito'
import { traerRotacionPorSku, calcularCobertura } from '../lib/rotacionPorSku'
import { traerEstadoOCPorSku } from '../lib/estadoOCPorSku'
import { aplicarFiltroProveedor, FILTRO_PROVEEDOR_INICIAL } from '../lib/filtroProveedor'
import { TONO_DE_COLOR } from '../lib/estados'
import FiltroProveedor from '../components/FiltroProveedor'
import BarraMinStockMax from '../components/BarraMinStockMax'

// ============================================================
// MonitorStock.jsx — v7
// v3: leia de la tabla propia material_yiqi (sincronizada cada 15 min
//     por el cron sync-material-cada-15-min) en vez de YiQi en vivo.
// v4: aplica el filtro de proveedores asignados al usuario logueado.
//     Admin (Aris) ve todo; operador (Ivana) ve solo lo suyo.
// v5 (6/9/2026, auditoría UX, residual de H-1): esta pantalla nunca
//     había incorporado el mecanismo de exclusión/pausa manual de
//     alertas (articulos_excluidos_alertas / alertas_pausadas,
//     reactivado en Alertas.jsx el 4/9/2026 -- ver v5 de ese archivo).
//     Por eso el header de acá mostraba 3 alertas más que Alertas.jsx
//     y el sidebar (2781 vs. 2778): eran justo 3 artículos excluidos a
//     mano desde la pantalla de Alertas, que acá seguían contando. Se
//     agrega la misma lectura + el mismo filtro (sin la resolución de
//     nombres de usuario, que ahí es solo para mostrar en las
//     pestañas "Excluidos"/"Pausadas" -- esta pantalla no tiene esas
//     pestañas, solo necesita el número correcto).
// v6 (10/9/2026, a pedido de Federico): se agregan 3 cosas que faltaban
//     para poder actuar sin salir de esta pantalla --
//       - Rotación (Prom./mes y Cobertura), reusando historial_ventas_
//         json() -- el mismo RPC que ya usa Predictor de Demanda, sin
//         SQL nuevo. Es solo informativo, NO cambia calcularAlerta()
//         (eso cambió recién en v7, ver abajo).
//       - Estado de OC por SKU (Preparada/Solicitada/Entrega parcial),
//         cruzando ordenes_propias y ordenes_yiqi -- ver
//         lib/estadoOCPorSku.js para el criterio completo.
//       - Orden por columna (asc/desc), clickeando el header. Sin
//         columna elegida, queda el orden de siempre (el que trae la
//         consulta).
// v7 (16/9/2026, Sprint punto 4 -- hallazgo de Ivana): "cantidad en
//     camino" -- lib/estadoOCPorSku.js ahora también suma cuánto de
//     un SKU está en una OC aprobada/enviada aún no recibida, y
//     calcularAlerta() SÍ la resta del déficit acá (a diferencia de lo
//     que decía la v6 de arriba) para no marcar Crítica/Preventiva
//     algo que ya se pidió. El badge de Estado de OC muestra la
//     cantidad (ej. "Solicitada (+40)") para que quede claro por qué
//     bajó la alerta. Reemplaza el workaround manual de Ivana (escribir
//     "Listo- dsps borrar contenido" en el Asunto de la OC en YiQi).
// ============================================================

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

// 6/9/2026 (v5) — mismo par de tablas que traerExclusionesYPausas() en
// Alertas.jsx, pero sin resolver nombres de usuario (esta pantalla no
// los muestra en ningún lado, solo necesita los mate_codigo para
// restarlos del conteo de alertas).
async function traerExclusionesYPausas() {
  const [resExcl, resPaus] = await Promise.all([
    supabase.from('articulos_excluidos_alertas').select('mate_codigo'),
    supabase.from('alertas_pausadas').select('mate_codigo, reactivar_en'),
  ])
  if (resExcl.error) throw new Error(resExcl.error.message)
  if (resPaus.error) throw new Error(resPaus.error.message)
  return { excluidos: resExcl.data ?? [], pausadas: resPaus.data ?? [] }
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
  const nombreMin = nombre.toLowerCase()
  if (['889', '890', '99999'].includes(sku)) return true
  if (nombre.startsWith('###')) return true
  if (nombreMin.includes('discontinuad')) return true
  if (proveedor === 'Dentalab') return true
  // 26/8/2026 — misma regla que Alertas.jsx: línea ACRITONE/NewcryL completa
  // (Aris pidió excluirla, "todavía no la vamos a incluir en el sistema").
  // Recordatorio del comentario de arriba: si se toca este criterio hay que
  // actualizar los dos lugares (más es_comprable() en SQL).
  if (nombreMin.includes('acritone')) return true
  if (nombreMin.includes('newcryl')) return true
  return false
}

// 16/9/2026 (Sprint punto 4 -- hallazgo de Ivana, ver
// lib/estadoOCPorSku.js para el detalle completo): el stock que decide
// el nivel de alerta ahora suma la "cantidad en camino" (OC
// aprobada/enviada, aún no recibida) que cargarDatos() ya dejó en
// articulo._cantidadEnCamino -- lo que se MUESTRA en la columna
// "Stock" sigue siendo el stock real (mate_stock_disponible), esto
// solo cambia qué tan crítico se ve.
function calcularAlerta(articulo) {
  const cantidadEnCamino = articulo._cantidadEnCamino ?? 0
  const stock = (articulo.mate_stock_disponible ?? 0) + cantidadEnCamino
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

function formatoNumero(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return num % 1 === 0 ? String(num) : num.toFixed(1)
}

// Mismo componente que ColorCobertura en PredictorDemanda.jsx (H-9,
// auditoría UX 6/9/2026): todo en meses, con el equivalente en días
// como tooltip para los casos urgentes (<1 mes) en vez de una segunda
// unidad visible.
function Cobertura({ meses }) {
  if (meses == null) return <span className="text-gray-300 text-xs">—</span>
  let clase = 'bg-[var(--grn-bg)] text-[var(--grn)]'
  const texto = meses <= 0 ? 'Sin stock' : `${meses.toFixed(1)} m.`
  const tooltip = meses > 0 && meses < 1 ? `≈ ${Math.round(meses * 30)} días de cobertura` : undefined
  if (meses < 1) clase = 'bg-[var(--red-bg)] text-[var(--red)]'
  else if (meses < 2) clase = 'bg-[var(--yel-bg)] text-[#92400e]'
  return (
    <span title={tooltip} className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${clase}`}>
      {texto}
    </span>
  )
}

// v6 (10/9/2026) — orden por columna. Cada entrada sabe cómo sacarle
// un valor comparable a una fila; el resto (asc/desc, nulls al final)
// es genérico. Sin columna elegida no se toca el orden de siempre.
const NIVEL_ALERTA_ORDEN = { critica: 3, preventiva: 2, ok: 1, 'sin-config': 0 }
const NIVEL_OC_ORDEN = { entrega_parcial: 3, solicitada: 2, preparada: 1 }

function valorParaOrdenar(columna, fila, contexto) {
  switch (columna) {
    case 'sku': return fila.mate_codigo ?? ''
    case 'producto': return fila.mate_nombre ?? ''
    case 'proveedor': return fila.clie_nombre ?? ''
    case 'stock': return fila.mate_stock_disponible ?? 0
    case 'puntoPedido': return fila.mate_punto_de_pedido ?? null
    case 'stockSeguridad': return fila.mate_stock_seguridad ?? null
    case 'rotacion': return contexto.rotacionPorSku[fila.mate_codigo]?.promedio ?? null
    case 'cobertura': {
      const promedio = contexto.rotacionPorSku[fila.mate_codigo]?.promedio
      return calcularCobertura(fila.mate_stock_disponible, promedio)
    }
    case 'estadoOC': return NIVEL_OC_ORDEN[contexto.estadoOCPorSku[fila.mate_codigo]?.nivel] ?? -1
    case 'estado': return NIVEL_ALERTA_ORDEN[calcularAlerta(fila).nivel] ?? -1
    default: return null
  }
}

function ordenarFilas(filas, sort, contexto) {
  if (!sort.columna) return filas
  const factor = sort.dir === 'desc' ? -1 : 1
  return [...filas].sort((a, b) => {
    const va = valorParaOrdenar(sort.columna, a, contexto)
    const vb = valorParaOrdenar(sort.columna, b, contexto)
    // nulls siempre al final, sin importar la dirección
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'string') return factor * va.localeCompare(vb, 'es')
    return factor * (va - vb)
  })
}

function FlechaOrden({ activa, dir }) {
  if (!activa) return <span className="text-gray-300 ml-0.5">↕</span>
  return <span className="text-[var(--ind,#4338ca)] ml-0.5">{dir === 'asc' ? '↑' : '↓'}</span>
}

// 2/10/2026 (feedback Ivana 17, prototipo v7): KPIs accionables arriba,
// "Nueva OC" en el encabezado y "+ OC" / "OC urgente" por fila.
// contadores = los mismos del sidebar (App.jsx); onArmarOC / onIrA vienen de App.
export default function MonitorStock({ contadores = {}, onArmarOC, onIrA }) {
  const permisos = usePermisos()

  const [articulos, setArticulos] = useState([])
  const [stockPorSku, setStockPorSku] = useState({})
  // v5 (6/9/2026): exclusiones/pausas manuales, mismo criterio que Alertas.jsx
  const [excluidos, setExcluidos] = useState([])
  const [pausadas, setPausadas] = useState([])
  // v6 (10/9/2026): rotación (Prom./mes, Cobertura) y estado de OC por SKU.
  // Las 2 son "no críticas" igual que el desglose por depósito -- si
  // fallan, se loguean y la pantalla sigue mostrando todo lo demás,
  // solo esas columnas quedan en "—".
  const [rotacionPorSku, setRotacionPorSku] = useState({})
  const [estadoOCPorSku, setEstadoOCPorSku] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [verTodos, setVerTodos] = useState(false)
  const [ocultarSinSeguridad, setOcultarSinSeguridad] = useState(false)
  // Filtro de proveedores estilo YiQi (feedback del cliente, punto 1,
  // 28/9/2026) -- ver lib/filtroProveedor.js para el criterio completo.
  const [filtroProveedor, setFiltroProveedor] = useState(FILTRO_PROVEEDOR_INICIAL)
  const [paginaActual, setPaginaActual] = useState(1)
  const [filasPorPagina, setFilasPorPagina] = useState(50)
  // v6 (10/9/2026): orden por columna, clickeando el header.
  const [sort, setSort] = useState({ columna: null, dir: 'asc' })
  function alHacerClickColumna(columna) {
    setSort((actual) => {
      if (actual.columna !== columna) return { columna, dir: 'asc' }
      if (actual.dir === 'asc') return { columna, dir: 'desc' }
      return { columna: null, dir: 'asc' } // 3er click: vuelve al orden de siempre
    })
  }

  async function cargarDatos() {
    if (permisos.cargando || permisos.error) return
    setLoading(true)
    setError(null)
    try {
      // En paralelo: el desglose por deposito no bloquea el resto de
      // la pantalla si por lo que sea tarda -- si falla, se loguea y
      // sigue mostrando el stock combinado igual (no es critico).
      const [data, stock, exclusiones, rotacion, estadoOC] = await Promise.all([
        traerMaterialLocal(permisos),
        traerStockPorDeposito().catch((err) => {
          console.warn('No se pudo cargar el desglose de stock por deposito:', err.message)
          return {}
        }),
        traerExclusionesYPausas(),
        traerRotacionPorSku().catch((err) => {
          console.warn('No se pudo cargar la rotación por SKU:', err.message)
          return {}
        }),
        traerEstadoOCPorSku(permisos).catch((err) => {
          console.warn('No se pudo cargar el estado de OC por SKU:', err.message)
          return {}
        }),
      ])
      // 16/9/2026: cada artículo lleva pegada su "cantidad en camino"
      // (ver estadoOCPorSku.js) para que calcularAlerta() la use sin
      // tener que enganchar estadoOCPorSku como dependencia en cada
      // useMemo que hoy llama a calcularAlerta().
      setArticulos(
        data.map((a) => ({ ...a, _cantidadEnCamino: estadoOC[a.mate_codigo]?.cantidadEnCamino ?? 0 }))
      )
      setStockPorSku(stock)
      setExcluidos(exclusiones.excluidos)
      setPausadas(exclusiones.pausadas)
      setRotacionPorSku(rotacion)
      setEstadoOCPorSku(estadoOC)
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
  }, [busqueda, verTodos, ocultarSinSeguridad, filtroProveedor, filasPorPagina])

  // Lista de proveedores para el selector del filtro (punto 1) -- sobre
  // `articulos` (ya pasó el filtro de permisos).
  const proveedoresDisponibles = useMemo(() => {
    const set = new Set(articulos.map((a) => a.clie_nombre).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [articulos])

  const ultimaSync = useMemo(() => {
    if (articulos.length === 0) return null
    const fechas = articulos.map((a) => new Date(a.sincronizado_en).getTime()).filter((t) => !isNaN(t))
    if (fechas.length === 0) return null
    return new Date(Math.max(...fechas))
  }, [articulos])

  const articulosBusqueda = useMemo(() => {
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

  // Pedido del cliente (feedback 3/9/2026): con "Stock Seguridad" en 0
  // (sin cargar en YiQi) hay artículos que no dicen nada útil acá -- se
  // pueden ocultar para reducir el ruido. Es un filtro más, se combina
  // con la búsqueda de texto y afecta tanto "Ver todos" como el conteo
  // de Alertas activas (si estaba en 0, igual solo entra en Alertas
  // cuando el stock también está en 0 -- ver calcularAlerta más arriba).
  const sinStockSeguridadTotal = useMemo(
    () => articulosBusqueda.filter((a) => (a.mate_stock_seguridad ?? null) === 0).length,
    [articulosBusqueda]
  )

  const articulosFiltrados = useMemo(() => {
    if (!ocultarSinSeguridad) return articulosBusqueda
    return articulosBusqueda.filter((a) => (a.mate_stock_seguridad ?? null) !== 0)
  }, [articulosBusqueda, ocultarSinSeguridad])

  // Filtro de proveedores (punto 1) -- se aplica después de búsqueda y
  // "ocultar sin seguridad", y afecta tanto "Ver todos" como el
  // conteo de Alertas activas (conAlerta más abajo).
  const articulosConProveedor = useMemo(
    () => aplicarFiltroProveedor(articulosFiltrados, filtroProveedor),
    [articulosFiltrados, filtroProveedor]
  )

  // v5 (6/9/2026): mismo criterio que codigosExcluidos/codigosPausadosVigentes
  // en Alertas.jsx -- una pausa vencida vuelve a contar sola, sin acción de nadie.
  const codigosExcluidos = useMemo(() => new Set(excluidos.map((e) => e.mate_codigo)), [excluidos])
  const codigosPausadosVigentes = useMemo(
    () => new Set(pausadas.filter((p) => new Date(p.reactivar_en).getTime() > Date.now()).map((p) => p.mate_codigo)),
    [pausadas]
  )

  const conAlerta = useMemo(() => {
    return articulosConProveedor.filter((a) => {
      if (esExcluidoDeAlertas(a)) return false
      if (codigosExcluidos.has(a.mate_codigo) || codigosPausadosVigentes.has(a.mate_codigo)) return false
      const { nivel } = calcularAlerta(a)
      return nivel === 'critica' || nivel === 'preventiva'
    })
  }, [articulosConProveedor, codigosExcluidos, codigosPausadosVigentes])

  const criticas = useMemo(
    () => conAlerta.filter((a) => calcularAlerta(a).nivel === 'critica').length,
    [conAlerta]
  )
  const preventivas = useMemo(
    () => conAlerta.filter((a) => calcularAlerta(a).nivel === 'preventiva').length,
    [conAlerta]
  )

  const filasSinOrdenar = verTodos ? articulosConProveedor : conAlerta
  const filasAMostrar = useMemo(
    () => ordenarFilas(filasSinOrdenar, sort, { rotacionPorSku, estadoOCPorSku }),
    [filasSinOrdenar, sort, rotacionPorSku, estadoOCPorSku]
  )

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
        <div className="flex items-center gap-2">
          <button onClick={cargarDatos} disabled={cargandoAlgo} className="btn btn-sm">
            {cargandoAlgo ? 'Actualizando…' : '↻ Actualizar'}
          </button>
          {onIrA && (
            <button onClick={() => onIrA('nueva-oc')} className="btn btn-sm btn-pri">+ Nueva OC</button>
          )}
        </div>
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

      {/* Métricas (prototipo v7): lo que pide acción, no texto de contexto */}
      <div className="metricas px-4 pt-4 pb-3">
        <div className="metrica" title="Punto de pedido manual si existe; si no, Stock Seguridad como respaldo (provisorio).">
          <div className="metrica-rot">Alertas activas</div>
          <div className="flex items-baseline gap-2">
            <span className="metrica-val text-[var(--red)]">{criticas}</span>
            <span className="text-gray-400 text-xs">crít.</span>
            <span className="metrica-val text-[#b8860b]">{preventivas}</span>
            <span className="text-gray-400 text-xs">prev.</span>
          </div>
          <div className="metrica-sub">productos bajo nivel de alerta</div>
        </div>
        <button type="button" className="metrica text-left hover:border-[var(--ind)]" onClick={() => onIrA?.('ocs')}>
          <div className="metrica-rot">OC en curso</div>
          <div className="metrica-val text-[var(--ind)]">{contadores.ocsActivas ?? '—'}</div>
          <div className="metrica-sub">enviadas, todavía sin recibir completas</div>
        </button>
        <div className="metrica">
          <div className="metrica-rot">{vistaFiltrada ? 'Artículos visibles' : 'Artículos'}</div>
          <div className="metrica-val">{articulos.length}</div>
          <div className="metrica-sub">
            {error ? '⚠ error al sincronizar' : cargandoAlgo ? 'cargando…' : vistaFiltrada ? 'de tus proveedores asignados' : 'sincronizados con YiQi'}
          </div>
        </div>
        <button type="button" className="metrica text-left hover:border-[var(--ind)]" onClick={() => onIrA?.('ocs')}>
          <div className="metrica-rot">Requieren aprobación</div>
          <div className={`metrica-val ${contadores.aprobacionPendiente ? 'text-[var(--blu)]' : 'text-gray-400'}`}>
            {contadores.aprobacionPendiente ?? 0}
          </div>
          <div className="metrica-sub">órdenes esperando a Aris</div>
        </button>
      </div>

      {/* Buscador, filtro de proveedor y toggle ver todos */}
      <div className="px-4 pb-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por SKU, nombre o proveedor…"
            className="flex-1 max-w-sm border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
          />
          <FiltroProveedor
            proveedoresDisponibles={proveedoresDisponibles}
            valor={filtroProveedor}
            onChange={setFiltroProveedor}
          />
        </div>
        <div className="flex items-center gap-3">
          {sinStockSeguridadTotal > 0 && (
            <label className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={ocultarSinSeguridad}
                onChange={(e) => setOcultarSinSeguridad(e.target.checked)}
              />
              Ocultar Stock Seguridad = 0 ({sinStockSeguridadTotal})
            </label>
          )}
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
            className="text-sm text-[var(--ind)] hover:underline whitespace-nowrap"
          >
            {verTodos ? 'Ver solo con alerta' : `Ver todos (${articulosConProveedor.length})`}
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
          <table className="tabla">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                {[
                  { label: 'SKU', columna: 'sku' },
                  { label: 'Producto', columna: 'producto' },
                  { label: 'Proveedor', columna: 'proveedor' },
                  { label: 'Stock', columna: 'stock' },
                  { label: 'Punto de pedido', columna: 'puntoPedido' },
                  { label: 'Stock Seguridad', columna: 'stockSeguridad' },
                  { label: 'Prom./mes', columna: 'rotacion' },
                  { label: 'Cobertura', columna: 'cobertura' },
                  { label: 'Estado OC', columna: 'estadoOC' },
                  { label: 'Notas', columna: null },
                  { label: 'Estado', columna: 'estado' },
                  ...(onArmarOC ? [{ label: '', columna: null }] : []),
                ].map(({ label, columna }) => (
                  <th
                    key={label}
                    onClick={columna ? () => alHacerClickColumna(columna) : undefined}
                    className={`text-left px-3.5 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide whitespace-nowrap ${
                      columna ? 'cursor-pointer select-none hover:text-gray-700' : ''
                    }`}
                    title={columna ? 'Ordenar por esta columna' : undefined}
                  >
                    {label}
                    {columna && <FlechaOrden activa={sort.columna === columna} dir={sort.dir} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasPaginadas.map((a) => {
                const alerta = calcularAlerta(a)
                return (
                  <tr key={a.yiqi_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3.5 py-1.5 font-mono text-xs">{a.mate_codigo}</td>
                    <td className="px-3.5 py-1.5 font-semibold"><div className="min-w-[240px]">{a.mate_nombre}</div></td>
                    <td className="px-3.5 py-1.5 text-[var(--sub)] text-xs">{a.clie_nombre ?? '—'}</td>
                    <td className="px-3.5 py-1.5">
                      {/* 2/10/2026 (feedback Ivana 17/20): barra Stock vs Mín./Máx., igual que Alertas */}
                      <BarraMinStockMax
                        stock={a.mate_stock_disponible}
                        min={a.mate_punto_de_pedido > 0 ? a.mate_punto_de_pedido : a.mate_stock_seguridad}
                        max={a.mate_punto_pedido_max}
                      />
                      {(() => {
                        const desglose = textoDesgloseStock(stockPorSku[a.mate_codigo])
                        if (!desglose) return null
                        return (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <span className="text-[10px] text-gray-400 whitespace-nowrap">
                              {desglose.principal}
                            </span>
                            {desglose.extras.map((e) => (
                              <span
                                key={e.label}
                                className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap ${
                                  e.label === 'Jorge' ? 'bg-amber-50 text-[#92400e]' : 'bg-violet-50 text-[#5b21b6]'
                                }`}
                              >
                                {e.label}: {e.valor}
                              </span>
                            ))}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-3.5 py-1.5 text-gray-400">
                      {a.mate_punto_de_pedido > 0 ? (
                        a.mate_punto_de_pedido
                      ) : (
                        <span
                          className="text-gray-300 cursor-help"
                          title="No hay Punto de pedido cargado para este artículo: la alerta usa Stock Seguridad como respaldo (columna de al lado, marcada con ●)."
                        >
                          —
                        </span>
                      )}
                    </td>
                    {/* 7/9/2026 (auditoría de usabilidad, U-1/U-5): cuando no hay
                        Punto de pedido cargado, Stock Seguridad pasa a ser el
                        criterio real de la alerta (ver calcularAlerta más arriba)
                        pero antes se veía igual de gris/apagado que cualquier
                        otro dato — nada distinguía "este valor decide la alerta"
                        de "este valor es solo informativo". Se resalta y se marca
                        con un punto cuando está activo. */}
                    <td
                      className={`px-3.5 py-1.5 ${
                        a.mate_punto_de_pedido > 0 ? 'text-gray-400' : 'text-gray-700 font-semibold'
                      }`}
                    >
                      {a.mate_stock_seguridad ?? '—'}
                      {!(a.mate_punto_de_pedido > 0) && a.mate_stock_seguridad != null && (
                        <span
                          className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[var(--ind,#4338ca)] align-middle"
                          title="Este es el valor que decide la alerta: no hay Punto de pedido cargado para este artículo."
                        />
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[var(--ind,#4338ca)] font-semibold">
                      {formatoNumero(rotacionPorSku[a.mate_codigo]?.promedio)}
                    </td>
                    <td className="px-3 py-1.5">
                      <Cobertura meses={calcularCobertura(a.mate_stock_disponible, rotacionPorSku[a.mate_codigo]?.promedio)} />
                    </td>
                    <td className="px-3.5 py-1.5">
                      {estadoOCPorSku[a.mate_codigo] ? (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${estadoOCPorSku[a.mate_codigo].clase}`}
                          title={
                            estadoOCPorSku[a.mate_codigo].cantidadEnCamino > 0
                              ? `${formatoNumero(estadoOCPorSku[a.mate_codigo].cantidadEnCamino)} unidades ya pedidas, descontadas del cálculo de la alerta`
                              : undefined
                          }
                        >
                          {estadoOCPorSku[a.mate_codigo].label}
                          {estadoOCPorSku[a.mate_codigo].cantidadEnCamino > 0 &&
                            ` (+${formatoNumero(estadoOCPorSku[a.mate_codigo].cantidadEnCamino)})`}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td
                      className="px-3.5 py-2.5 text-gray-400 text-xs max-w-[180px] truncate"
                      title={a.mate_notas_sobre_punto_de ?? ''}
                    >
                      {a.mate_notas_sobre_punto_de ?? '—'}
                    </td>
                    <td className="px-3.5 py-1.5">
                      <span
                        className={`pill pill-${TONO_DE_COLOR[alerta.color] ?? 'gris'}`}
                      >
                        {alerta.label}
                      </span>
                    </td>
                    {onArmarOC && (
                      <td className="text-right whitespace-nowrap">
                        {a.clie_nombre && (alerta.color === 'red' || alerta.color === 'yel') && (
                          <button
                            onClick={() => onArmarOC(a)}
                            title={`Armar OC a ${a.clie_nombre} con este artículo`}
                            className="btn btn-sm"
                          >
                            + OC
                          </button>
                        )}
                      </td>
                    )}
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
