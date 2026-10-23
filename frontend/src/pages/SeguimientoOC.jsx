import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos, filtrarOrdenes } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'
import DeclararCausaModal from '../components/DeclararCausaModal'
import { ultimasCausasPorReferencia } from '../lib/causas'
import { ESTADO_OC_YIQI } from '../lib/estados'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'
import Pastilla from '../components/ui/Pastilla'
import BloqueAccion from '../components/ui/BloqueAccion'
import BarraPasos from '../components/ui/BarraPasos'

// ============================================================
// SeguimientoOC.jsx — v6
// v6 (23/10/2026, punto 3 "Recibida confiable"): estado "Cerrada en YiQi" para las OC que
// dejaron de venir en el reporte de YiQi (ordenes_yiqi.cerrada_en_yiqi). Ya no cuentan como
// Demoradas ni en curso; se listan abajo junto con las recibidas completas.
// v5 (2/10/2026, feedback Ivana 17/19/21): estilo prototipo v7 —
// encabezado blanco, tarjetas con borde de color por estado, barra de
// pasos al desplegar y código de color único (lib/estados.js).
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
  // 23/10/2026: una fecha sola 'AAAA-MM-DD' se arma en hora local. new Date() la toma
  // como UTC y en Argentina mostraba el día anterior (OC 2681: 06/10 se veía 5/10).
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaStr))
  if (soloFecha) return `${Number(soloFecha[3])}/${Number(soloFecha[2])}/${soloFecha[1]}`
  try {
    return new Date(fechaStr).toLocaleDateString('es-AR')
  } catch {
    return fechaStr
  }
}

// 23/10/2026 — feedback Ivana: fecha estimada de llegada = fecha de la OC + dias_entrega
// (días corridos). Se arma con año/mes/día locales (sin pasar por UTC) para no correr un día.
function sumarDias(fechaStr, dias) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaStr ?? ''))
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias)
}

function formatoDiaMes(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 23/10/2026 — feedback Ivana: devuelve null si la OC está completada o si todavía no
// sabemos el plazo (consulta fallida). Si el proveedor no tiene dias_entrega: { sinPlazo: true }.
// Estados terminales: no esperan mercadería (sin fecha estimada, abajo en la lista).
const TERMINALES = new Set(['completada', 'cerrada'])

function calcularLlegada(orden, estado, plazos) {
  if (TERMINALES.has(estado.key) || plazos == null) return null
  const dias = plazos[orden.proveedor]
  if (dias == null) return { sinPlazo: true, demorada: false }
  const est = sumarDias(orden.fecha, dias)
  if (!est) return { sinPlazo: true, demorada: false }
  const hoy = new Date()
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return { sinPlazo: false, demorada: est < hoy0, texto: formatoDiaMes(est) }
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
        cerradaEnYiqi: true,
        vistoHasta: null,
      })
    }
    const orden = porNroOC.get(nro)
    // 23/10/2026 — punto 3: cerrada en YiQi = dejó de venir en el reporte de OC pendientes
    // (Ivana la vació al recibirla, o se eliminó). Ver migración 20261023180000.
    orden.cerradaEnYiqi = orden.cerradaEnYiqi && fila.cerrada_en_yiqi === true
    if (fila.sincronizado_en && (!orden.vistoHasta || fila.sincronizado_en > orden.vistoHasta)) {
      orden.vistoHasta = fila.sincronizado_en
    }
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
  const base = { totalCantidad, totalEntregado, totalPendiente }

  if (orden.cerradaEnYiqi) {
    return { key: 'cerrada', ...ESTADO_OC_YIQI.cerrada, ...base }
  }

  if (totalCantidad > 0 && totalPendiente === 0) {
    return { key: 'completada', ...ESTADO_OC_YIQI.completada, ...base }
  }
  if (totalEntregado > 0) {
    return { key: 'parcial', ...ESTADO_OC_YIQI.parcial, ...base }
  }
  return { key: 'enviada', ...ESTADO_OC_YIQI.enviada, ...base }
}

function etiquetaEstado(e) {
  if (e.key === 'parcial') {
    // YiQi puede registrar más de lo pedido (pendiente negativo): no mostrar "-3 u pendientes".
    if (e.totalPendiente < 0) return `Ingreso con exceso · +${-e.totalPendiente} u`
    return `Ingreso parcial · ${e.totalPendiente} u pendientes`
  }
  return e.label
}

function pasosDeOrden(orden) {
  const e = orden._estado
  const fecha = formatoFecha(orden.fecha)
  // 23/10/2026 — feedback Ivana: "est. dd/mm" en el paso de recepción (solo si hay plazo).
  const estLlegada = orden._llegada && !orden._llegada.sinPlazo ? `est. ${orden._llegada.texto}` : undefined
  if (e.key === 'cerrada') {
    const visto = orden.vistoHasta ? formatoFecha(orden.vistoHasta) : null
    return {
      pasos: [
        { rotulo: 'Enviada al proveedor', fecha, estado: 'hecho' },
        { rotulo: 'Cerrada en YiQi', fecha: visto ? `después del ${visto}` : undefined, estado: 'hecho' },
      ],
      sigue: 'Ya no tiene nada pendiente en YiQi: se vació al recibirla o se eliminó.',
    }
  }
  if (e.key === 'completada') {
    return {
      pasos: [
        { rotulo: 'Enviada al proveedor', fecha, estado: 'hecho' },
        { rotulo: 'Ingreso de mercadería', estado: 'hecho' },
        { rotulo: 'Recibida completa', estado: 'hecho' },
      ],
      sigue: 'Recibida completa. No queda nada pendiente.',
    }
  }
  if (e.key === 'parcial') {
    return {
      pasos: [
        { rotulo: 'Enviada al proveedor', fecha, estado: 'hecho' },
        { rotulo: `Ingreso parcial (${e.totalEntregado} de ${e.totalCantidad} u)`, estado: 'actual' },
        { rotulo: 'Recibida completa', fecha: estLlegada, estado: 'pend' },
      ],
      sigue: e.totalPendiente < 0
        ? `Se recibieron ${-e.totalPendiente} u más de lo pedido.`
        : `Faltan ${e.totalPendiente} u por recibir.`,
    }
  }
  return {
    pasos: [
      { rotulo: 'Enviada al proveedor', fecha, estado: 'hecho' },
      { rotulo: 'Ingreso de mercadería', estado: 'espera' },
      { rotulo: 'Recibida completa', fecha: estLlegada, estado: 'pend' },
    ],
    sigue: 'Esperando que llegue la mercadería.',
  }
}

function DetalleOrden({ orden }) {
  const { pasos, sigue } = pasosDeOrden(orden)
  return (
    <div className="border-t border-[#f3f4f6] px-7 py-6 bg-white">
      {/* Barra de pasos con las medidas del prototipo (.pipeline): punto 36 px, línea a 18 px. */}
      <div className="pb-2 [&_.paso-punto]:w-9! [&_.paso-punto]:h-9! [&_.paso-punto]:text-[15px]! [&_.paso]:gap-2! [&_.paso:not(:last-child)]:after:top-[18px]! [&_.paso:not(:last-child)]:after:left-[calc(50%+20px)]! [&_.paso:not(:last-child)]:after:right-[calc(-50%+20px)]!">
        <BarraPasos pasos={pasos} sigue={sigue} />
      </div>
      {/* 23/10/2026 — feedback Ivana: aviso cuando el proveedor no tiene plazo cargado. */}
      {orden._llegada?.sinPlazo && (
        <div className="mt-2 text-[11px] text-[#9ca3af]">
          Sin plazo de entrega cargado en Condiciones comerciales
        </div>
      )}
      {orden._estado.key === 'cerrada' && (
        <div className="mt-2 text-[11px] text-[#9ca3af]">
          El detalle muestra cómo figuraba la OC la última vez que tenía pendientes en YiQi
          {orden.vistoHasta ? ` (${formatoFecha(orden.vistoHasta)})` : ''}. Hoy ya no tiene nada pendiente.
        </div>
      )}
      <div className="mt-4 text-[12px] font-bold text-[#374151] mb-2">Detalle por artículo</div>
      <div className="tw">
        <table className="tabla">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Artículo</th>
              <th className="text-right!">Pedido</th>
              <th className="text-right!">Entregado</th>
              <th className="text-right!">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {orden.lineas.map((l, i) => {
              const pend = l.pendiente ?? 0
              return (
                <tr key={i}>
                  <td className="sku">{l.sku ?? '—'}</td>
                  <td className="font-semibold text-gray-800">{l.nombreArticulo ?? '—'}</td>
                  <td className="text-right tabular-nums">{l.cantidad} u</td>
                  <td className="text-right tabular-nums text-[var(--grn)] font-bold">{l.entregada} u</td>
                  <td className="text-right tabular-nums">
                    {pend > 0 && orden._estado.key !== 'cerrada'
                      ? <Pastilla tono="amarillo">{pend} u</Pastilla>
                      : <span className="text-[#9ca3af]">{pend > 0 ? `${pend} u` : '—'}</span>}
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

function TarjetaOrden({ o, abierta, onToggle, causa, onCausa, compacta = false }) {
  const e = o._estado
  const articulos = o.lineas.length
  return (
    <div className={`card card-${e.tono}`}>
      <div
        className={`flex items-center gap-4 cursor-pointer select-none hover:bg-[#fafafa] ${compacta ? 'px-4 py-3' : 'px-5 py-4'}`}
        onClick={onToggle}
      >
        <div className="flex flex-col gap-[3px] min-w-[110px]">
          <span className="text-[14px] font-bold text-[var(--ind)]">OC #{o.nroOC}</span>
          <span className="text-[11px] text-[var(--sub)]">{formatoFecha(o.fecha)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-[var(--text)] truncate">{o.proveedor || '—'}</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5 truncate">
            {articulos} {articulos === 1 ? 'artículo' : 'artículos'}
            {/* El asunto es la nota manual de Ivana en YiQi (U-2, 7/9/2026). */}
            {o.asunto && <> · <span className="text-gray-400">Asunto:</span> {o.asunto}</>}
          </div>
        </div>
        {causa && (
          <span className="text-[11px] text-gray-500 max-w-[160px] truncate" title={causa.nota ?? ''}>
            {causa.causa_rotulo}
          </span>
        )}
        <button
          onClick={(ev) => { ev.stopPropagation(); onCausa() }}
          className="btn btn-sm"
          title="Registrar por qué se demora o qué pasó con esta OC"
        >
          <i className="ti ti-message" /> {causa ? 'Ver causa' : 'Causa'}
        </button>
        <div className="text-[14px] font-bold text-[var(--text)] min-w-[90px] text-right tabular-nums">
          {formatoMoneda(o.total)}
        </div>
        <div className="min-w-[220px] flex flex-wrap items-center justify-end gap-1.5">
          {/* 23/10/2026 — feedback Ivana: "Llega el dd/mm" / "Demorada desde el dd/mm" (sin plazo: nada). */}
          {o._llegada && !o._llegada.sinPlazo && (
            <Pastilla tono={o._llegada.demorada ? 'rojo' : 'gris'}>
              <i className={`ti ${o._llegada.demorada ? 'ti-clock' : 'ti-truck-delivery'}`} />
              {o._llegada.demorada ? `Demorada desde el ${o._llegada.texto}` : `Llega el ${o._llegada.texto}`}
            </Pastilla>
          )}
          <Pastilla tono={e.tono}>
            {e.key === 'parcial' && <i className="ti ti-alert-triangle" />}
            {etiquetaEstado(e)}
          </Pastilla>
        </div>
        <i className={`ti ti-chevron-down inline-block text-[var(--sub)] transition-transform ${abierta ? 'rotate-180' : ''}`} />
      </div>
      {abierta && <DetalleOrden orden={o} />}
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
  // 23/10/2026 — feedback Ivana: { [clie_nombre]: dias_entrega|null }. null = la consulta falló
  // (la pantalla sigue andando sin fechas estimadas).
  const [plazos, setPlazos] = useState(null)

  // Ítem 7 (22/8/2026) — causa vigente declarada por OC (ámbito
  // 'entrega', referencia = nro_oc). Ver frontend/src/lib/causas.js.
  const [causasPorOC, setCausasPorOC] = useState({})
  const [modalCausa, setModalCausa] = useState(null) // { referenciaId, referenciaTexto } | null

  async function cargar() {
    if (permisos.cargando || permisos.error) return
    setLoading(true)
    setError(null)
    try {
      const filas = await traerOrdenesLocal(permisos)
      const agrupadas = agruparPorOrden(filas)
      setOrdenes(agrupadas)
      // 23/10/2026 — feedback Ivana: UNA sola consulta de dias_entrega para los proveedores
      // de las OC no completadas. Si falla, se ignora y no se muestran fechas.
      try {
        const nombres = [...new Set(
          agrupadas.filter((o) => !TERMINALES.has(calcularEstado(o).key) && o.proveedor).map((o) => o.proveedor)
        )]
        if (nombres.length === 0) {
          setPlazos({})
        } else {
          const { data, error: errPlazos } = await supabase
            .from('proveedores')
            .select('clie_nombre, dias_entrega')
            .in('clie_nombre', nombres)
          if (errPlazos) throw errPlazos
          const mapa = {}
          for (const p of data ?? []) {
            const n = p.dias_entrega == null || p.dias_entrega === '' ? NaN : Number(p.dias_entrega)
            mapa[p.clie_nombre] = Number.isFinite(n) && n >= 0 ? Math.round(n) : null
          }
          setPlazos(mapa)
        }
      } catch {
        setPlazos(null)
      }
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
    () => ordenes.map((o) => {
      const _estado = calcularEstado(o)
      return { ...o, _estado, _llegada: calcularLlegada(o, _estado, plazos) }
    }),
    [ordenes, plazos]
  )

  const ordenesFiltradas = useMemo(() => {
    return ordenesConEstado.filter((o) => {
      // 23/10/2026 — feedback Ivana: filtro "Demoradas" (cruza estados; no toca los demás).
      if (filtroEstado === 'demorada') {
        if (!o._llegada?.demorada) return false
      } else if (filtroEstado !== 'todas' && o._estado.key !== filtroEstado) return false
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
    cerrada: ordenesConEstado.filter((o) => o._estado.key === 'cerrada').length, // 23/10/2026 — punto 3
    demorada: ordenesConEstado.filter((o) => o._llegada?.demorada).length, // 23/10/2026 — feedback Ivana
  }), [ordenesConEstado])

  // 23/10/2026: meses y días del más reciente al más viejo (antes salían en el orden de
  // llegada de la base: Agosto, Septiembre, Julio…). La fecha se arma en hora local.
  const completadasAgrupadas = useMemo(() => {
    const completadas = ordenesFiltradas
      .filter((o) => TERMINALES.has(o._estado.key) && /^\d{4}-\d{2}-\d{2}/.test(String(o.fecha ?? '')))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.nroOC).localeCompare(String(a.nroOC), undefined, { numeric: true }))
    const porMes = {}
    for (const oc of completadas) {
      const [anio, mes] = String(oc.fecha).slice(0, 10).split('-').map(Number)
      const claveMes = `${MESES[mes - 1]} ${anio}`
      const claveDia = formatoFecha(String(oc.fecha).slice(0, 10))
      porMes[claveMes] ??= {}
      porMes[claveMes][claveDia] ??= []
      porMes[claveMes][claveDia].push(oc)
    }
    return porMes
  }, [ordenesFiltradas])

  // Más recientes primero (antes salían en el orden en que venían de la base).
  const noCompletadas = useMemo(
    () =>
      ordenesFiltradas
        .filter((o) => !TERMINALES.has(o._estado.key))
        .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || String(b.nroOC).localeCompare(String(a.nroOC), undefined, { numeric: true })),
    [ordenesFiltradas]
  )

  // Clave por VALOR (no por referencia de array) para no recargar en loop.
  const claveIdsCausas = ordenesFiltradas.map((o) => o.nroOC).join('|')
  useEffect(() => {
    const ids = claveIdsCausas ? claveIdsCausas.split('|') : []
    if (ids.length === 0) return
    let cancelado = false
    ultimasCausasPorReferencia('entrega', ids).then((res) => {
      if (!cancelado) setCausasPorOC((prev) => ({ ...prev, ...res }))
    })
    return () => { cancelado = true }
  }, [claveIdsCausas])

  function toggleCarpeta(clave) {
    setCarpetasAbiertas((prev) => ({ ...prev, [clave]: !prev[clave] }))
  }

  const vistaFiltrada = !permisos.cargando && !permisos.error && !permisos.esAdmin

  // El error de permisos va ANTES del return de loading: si no, cargar()
  // sale sin apagar el loading y la pantalla queda colgada en "Cargando…".
  if (permisos.error) {
    return (
      <div className="flex-1 overflow-y-auto pad">
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
    return <div className="flex-1 overflow-y-auto pad text-[13px] text-[var(--sub)]">Cargando órdenes de compra...</div>
  }

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto pad">
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

  const parciales = noCompletadas.filter((o) => o._estado.key === 'parcial')
  const abrirCausa = (o) =>
    setModalCausa({ referenciaId: o.nroOC, referenciaTexto: `OC #${o.nroOC} — ${o.proveedor}` })
  const toggle = (nro) => setFilaExpandida(filaExpandida === nro ? null : nro)

  return (
    <div className="flex-1 overflow-y-auto">
      <EncabezadoPagina
        titulo="Seguimiento de OC"
        bajada={`OC enviadas a proveedores, según YiQi · ${contadores.enviada + contadores.parcial} en curso`}
      >
        <button onClick={cargar} className="btn btn-sm"><i className="ti ti-refresh" /> Actualizar</button>
      </EncabezadoPagina>

      <div className="pad">
        {/* Aviso de vista filtrada (solo operadores) */}
        {vistaFiltrada && (
          <Aviso tipo="filtro" autoCerrarEn={15} className="mb-4">
            Vista filtrada: solo se muestran las OC de tus {permisos.nombres.length} proveedores asignados. Si un
            proveedor tuyo no tiene ninguna OC cargada, simplemente no aparece acá.
          </Aviso>
        )}

        {/* Banner de ingreso parcial (prototipo v7) */}
        {parciales.length > 0 && filtroEstado !== 'parcial' && (
          <BloqueAccion
            tono="amarillo"
            className="mb-4"
            titulo={
              parciales.length === 1
                ? `Ingreso parcial — OC #${parciales[0].nroOC} · ${parciales[0].proveedor}`
                : `Ingreso parcial en ${parciales.length} OC`
            }
            acciones={
              <button className="btn btn-sm" onClick={() => setFiltroEstado('parcial')}><i className="ti ti-eye" /> Ver</button>
            }
          >
            {parciales.length === 1
              ? `Ingresaron ${parciales[0]._estado.totalEntregado} de ${parciales[0]._estado.totalCantidad} u. ${
                  parciales[0]._estado.totalPendiente < 0
                    ? `Se recibieron ${-parciales[0]._estado.totalPendiente} u más de lo pedido.`
                    : `Quedan ${parciales[0]._estado.totalPendiente} u pendientes de entrega.`
                }`
              : 'Llegó parte de la mercadería y todavía faltan unidades por recibir.'}
          </BloqueAccion>
        )}

        {/* Filtros por estado + fechas */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {[
            { key: 'todas', label: `Todas (${contadores.todas})` },
            { key: 'enviada', label: `Enviadas (${contadores.enviada})` },
            { key: 'parcial', label: `Ingreso parcial (${contadores.parcial})` },
            { key: 'completada', label: `Completadas (${contadores.completada})` },
            { key: 'cerrada', label: `Cerradas en YiQi (${contadores.cerrada})` }, // 23/10/2026 — punto 3
            { key: 'demorada', label: `Demoradas (${contadores.demorada})` }, // 23/10/2026 — feedback Ivana
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltroEstado(f.key)}
              className={`chip ${filtroEstado === f.key ? 'chip-on' : ''}`}
            >
              {f.label}
            </button>
          ))}
          <div className="flex gap-3 text-[13px] ml-auto">
            <label className="flex items-center gap-2 text-gray-500">
              Desde
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="border border-[var(--border)] rounded-lg px-2 py-1 bg-white"
              />
            </label>
            <label className="flex items-center gap-2 text-gray-500">
              Hasta
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="border border-[var(--border)] rounded-lg px-2 py-1 bg-white"
              />
            </label>
          </div>
        </div>

        {/* OC en curso: enviadas y parciales */}
        <div className="space-y-3.5 mb-8">
          {noCompletadas.map((o) => (
            <TarjetaOrden
              key={o.nroOC}
              o={o}
              abierta={filaExpandida === o.nroOC}
              onToggle={() => toggle(o.nroOC)}
              causa={causasPorOC[o.nroOC]}
              onCausa={() => abrirCausa(o)}
            />
          ))}
          {noCompletadas.length === 0 && (
            <p className="text-[13px] text-gray-400">No hay órdenes enviadas o con ingreso parcial en este filtro.</p>
          )}
        </div>

        {/* OC completadas: agrupadas por mes > día (colapsables) */}
        {Object.keys(completadasAgrupadas).length > 0 && (
          <div>
            <div className="text-[12px] font-bold text-[var(--sub)] uppercase tracking-wide mb-2">Recibidas completas y cerradas en YiQi</div>
            {Object.entries(completadasAgrupadas).map(([mes, dias]) => (
              <div key={mes} className="mb-2">
                <button
                  onClick={() => toggleCarpeta(mes)}
                  className="w-full flex items-center gap-2 text-left px-5 py-3 bg-white border border-[var(--border)] rounded-xl text-[13px] font-semibold text-[var(--text)] hover:bg-[#fafafa]"
                >
                  <i className={`ti ti-chevron-down inline-block text-[var(--sub)] transition-transform ${carpetasAbiertas[mes] ? '' : '-rotate-90'}`} />
                  {mes}{' '}
                  <span className="text-[var(--sub)] font-normal">({Object.values(dias).flat().length})</span>
                </button>
                {carpetasAbiertas[mes] &&
                  Object.entries(dias).map(([dia, ocs]) => (
                    <div key={dia} className="ml-4 mt-2.5 space-y-2.5">
                      <p className="text-[11px] text-gray-400">{dia}</p>
                      {ocs.map((o) => (
                        <TarjetaOrden
                          key={o.nroOC}
                          o={o}
                          compacta
                          abierta={filaExpandida === o.nroOC}
                          onToggle={() => toggle(o.nroOC)}
                          causa={causasPorOC[o.nroOC]}
                          onCausa={() => abrirCausa(o)}
                        />
                      ))}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {modalCausa && (
        <DeclararCausaModal
          ambito="entrega"
          referenciaId={modalCausa.referenciaId}
          referenciaTexto={modalCausa.referenciaTexto}
          onCerrar={() => setModalCausa(null)}
          onGuardado={() => {
            ultimasCausasPorReferencia('entrega', [modalCausa.referenciaId]).then((res) => {
              setCausasPorOC((prev) => ({ ...prev, ...res }))
            })
          }}
        />
      )}
    </div>
  )
}
