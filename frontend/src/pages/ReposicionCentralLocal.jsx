import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'
import { nombreDeposito } from '../lib/depositos'
// 23/10/2026 — feedback Ivana: barra de pasos (como el detalle de una OC) y encabezado v7.
import BarraPasos from '../components/ui/BarraPasos'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'

// ============================================================
// pages/ReposicionCentralLocal.jsx — 7/9/2026
// ============================================================
// Vista de supervisión para Aris/admin del circuito de reposición
// automática Central<->Local (ver DISENO_TECNICO_Reposicion_
// CentralLocal_7-9-2026.md, §12.2 punto 5 y §14.4).
//
// Por qué existe: las 3 pantallas de depósito (SolicitudesParaPreparar,
// ConfirmarRecepcion, PedirAlOtroDeposito) solo muestran lo ACTIVO —
// apenas una línea llega a 'recibida' desaparece de esas 3 pantallas.
// Sin esta vista, nadie podía auditar el circuito desde la app una vez
// que algo se resolvía (hallazgo del 7/9/2026, verificación en vivo:
// hubo que confirmar el movimiento de stock real por SQL directo).
// Esta pantalla es de solo lectura — ninguna acción del circuito se
// hace acá, esas siguen siendo las 3 pantallas de depósito.
//
// A propósito NO incluye todavía la configuración de
// reglas_reposicion_central: los parámetros reales (frecuencia,
// umbral) los tiene que definir Aris (ver RELEVAMIENTO_impacto_
// equipo_deposito_7-9-2026.md) y ningún job los consume todavía —
// construir esa UI ahora sería resolver un problema que no existe
// aún. Se agrega en una tanda futura, cuando el job periódico exista.
// ============================================================

function formatoFechaHora(fechaStr) {
  if (!fechaStr) return '—'
  try {
    return new Date(fechaStr).toLocaleString('es-AR')
  } catch {
    return fechaStr
  }
}

function num(v, decimales = 2) {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

// Estado derivado: solicitudes_reposicion no tiene una columna
// "cerrada" — el cierre real vive a nivel de línea (estado_linea).
// Esta función lo resume en una sola etiqueta para la tabla.
function estadoDetallado(solicitud, lineas) {
  if (solicitud.estado === 'reemplazada') return { texto: 'Reemplazada', clase: 'text-gray-400' }
  // 30/9/2026: estados de cierre (migración 20260930140000).
  if (solicitud.estado === 'completada') return { texto: '✓ Completa', clase: 'text-[var(--grn,#059669)] font-semibold' }
  if (solicitud.estado === 'anulada') return { texto: 'Anulada', clase: 'text-gray-400' }
  if (solicitud.estado === 'solicitada') return { texto: 'Solicitada, sin procesar', clase: 'text-[var(--yel,#b45309)]' }
  // estado === 'en_preparacion'
  if (lineas.length === 0) return { texto: 'En preparación (sin líneas)', clase: 'text-[var(--sub)]' }
  if (lineas.every((l) => l.estado_linea === 'recibida')) return { texto: '✓ Completa', clase: 'text-[var(--grn,#059669)] font-semibold' }
  if (lineas.some((l) => l.estado_linea === 'declarada')) return { texto: 'Esperando confirmación', clase: 'text-[var(--blu,#2563eb)]' }
  return { texto: 'En preparación', clase: 'text-[var(--ind)]' }
}

// 23/10/2026 — feedback Ivana: barra de pasos de cada pedido interno
// (Solicitada → En preparación → En tránsito → Recibida), mismo criterio
// que estadoDetallado: lo "hecho" sale del estado de la solicitud y de
// estado_linea. Fechas: solo de columnas que existen — creada_en y
// procesada_en (remito generado) en la solicitud; en las líneas se leen
// declarada_en / recibida_en (líneas) y cerrada_en (solicitud) — columnas
// verificadas en las migraciones el 23/10/2026. Si no hay
// columna, el paso queda sin fecha (no se inventa nada).
const PASOS_REPOSICION = ['Solicitada', 'En preparación', 'En tránsito', 'Recibida']
const ESTADOS_LINEA_EN_CAMINO = ['declarada', 'enviada', 'recibida']

function fechaPaso(valor) {
  if (!valor) return null
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Fecha más temprana (modo 'min') o más tardía (modo 'max') de las columnas
// indicadas entre todas las filas; null si ninguna tiene valor válido.
function fechaExtrema(filas, columnas, modo) {
  let mejor = null
  for (const f of filas) {
    for (const c of columnas) {
      const t = f?.[c] ? new Date(f[c]).getTime() : NaN
      if (Number.isNaN(t)) continue
      if (mejor == null || (modo === 'min' ? t < mejor : t > mejor)) mejor = t
    }
  }
  return mejor == null ? null : new Date(mejor).toISOString()
}

function pasosDeSolicitud(solicitud, lineas) {
  const completada = solicitud.estado === 'completada'
  const todasRecibidas = lineas.length > 0 && lineas.every((l) => l.estado_linea === 'recibida')
  const recibida = completada || todasRecibidas
  const enPreparacion = solicitud.estado !== 'solicitada'
  const enTransito = recibida || lineas.some((l) => ESTADOS_LINEA_EN_CAMINO.includes(l.estado_linea))
  const hechos = [true, enPreparacion, enTransito, recibida]
  const idxActual = hechos.indexOf(false) // primer paso no hecho (-1 = circuito cerrado)
  const anulada = solicitud.estado === 'anulada'
  const reemplazada = solicitud.estado === 'reemplazada'

  const fechas = [
    fechaPaso(solicitud.creada_en),
    enPreparacion ? fechaPaso(solicitud.procesada_en) : null,
    enTransito ? fechaPaso(fechaExtrema(lineas, ['declarada_en'], 'min')) : null,
    recibida ? fechaPaso(fechaExtrema(lineas, ['recibida_en'], 'max') ?? solicitud.cerrada_en) : null,
  ]

  const pasos = PASOS_REPOSICION.map((rotulo, i) => {
    let estado = 'pend'
    if (hechos[i]) estado = 'hecho'
    else if (i === idxActual) estado = anulada ? 'alerta' : reemplazada ? 'pend' : 'actual'
    return { rotulo, fecha: fechas[i] ?? undefined, estado }
  })

  const origen = nombreDeposito(solicitud.deposito_origen_id)
  const destino = nombreDeposito(solicitud.deposito_destino_id)
  const corteEn = idxActual >= 0 ? PASOS_REPOSICION[idxActual] : null
  let sigue
  if (anulada) sigue = corteEn ? `Solicitud anulada: el pedido se cortó antes de «${corteEn}».` : 'Solicitud anulada.'
  else if (reemplazada) sigue = 'Solicitud reemplazada por otra: este pedido ya no sigue el circuito.'
  else if (idxActual === -1) sigue = 'Recibida completa. No queda nada pendiente.'
  else if (idxActual === 1) sigue = `Esperando que ${origen} genere el remito.`
  else if (idxActual === 2) sigue = `${origen} está preparando el pedido; todavía no declaró el envío.`
  else sigue = `Mercadería en camino. Esperando que ${destino} confirme la recepción.`

  // Mini indicación para la fila contraída (no aplica a anuladas/reemplazadas).
  const resumen = anulada || reemplazada
    ? null
    : idxActual === -1
      ? `Paso 4 de 4 · ${PASOS_REPOSICION[3]}`
      : `Paso ${idxActual + 1} de 4 · ${PASOS_REPOSICION[idxActual]}`

  return { pasos, sigue, resumen }
}

const FILTROS = [
  { key: 'activas', label: 'Activas' },
  { key: 'completas', label: 'Completas' },
  { key: 'todas', label: 'Todas' },
]

function FilaLinea({ linea }) {
  const tieneError = !!linea.yiqi_error
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="px-3.5 py-1.5 font-mono text-xs">{linea.sku}</td>
      <td className="px-3.5 py-1.5 text-sm">{linea.mate_nombre}</td>
      <td className="px-3.5 py-1.5 text-sm text-[var(--sub)]">{num(linea.cantidad_solicitada)}</td>
      <td className="px-3.5 py-1.5 text-sm">{linea.estado_linea}</td>
      <td className="px-3.5 py-1.5 text-sm">{linea.cantidad_enviada != null ? num(linea.cantidad_enviada) : '—'}</td>
      <td className="px-3.5 py-1.5 text-sm text-[var(--red)]">
        {linea.cantidad_faltante > 0 ? `${num(linea.cantidad_faltante)} — ${linea.motivo_sin_stock || 'sin motivo'}` : '—'}
      </td>
      <td className="px-3.5 py-1.5 text-sm">{linea.cantidad_recibida != null ? num(linea.cantidad_recibida) : '—'}</td>
      <td className="px-3.5 py-1.5 text-xs">
        {linea.estado_linea === 'recibida' ? (
          tieneError ? (
            <span className="text-[var(--red)]" title={linea.yiqi_error}>⚠️ error YiQi</span>
          ) : linea.yiqi_movimiento_id ? (
            <span className="text-[var(--grn,#059669)]">✓ {linea.yiqi_movimiento_id}</span>
          ) : (
            <span className="text-[var(--sub)]">pendiente</span>
          )
        ) : (
          '—'
        )}
      </td>
    </tr>
  )
}

function FilaSolicitud({ solicitud, lineas, expandida, onToggle }) {
  const estado = estadoDetallado(solicitud, lineas)
  const { pasos, sigue, resumen } = pasosDeSolicitud(solicitud, lineas)
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50"
      >
        <td className="px-3.5 py-2 text-xs text-gray-400">{expandida ? '▾' : '▸'}</td>
        <td className="px-3.5 py-2 font-semibold text-sm">{solicitud.remito_numero || `#${solicitud.id}`}</td>
        <td className="px-3.5 py-2 text-sm">
          {nombreDeposito(solicitud.deposito_origen_id)} → {nombreDeposito(solicitud.deposito_destino_id)}
        </td>
        <td className="px-3.5 py-2 text-xs text-[var(--sub)]">
          {solicitud.generada_por === 'manual' ? 'Manual' : 'Regla automática'}
        </td>
        <td className="px-3.5 py-2 text-xs text-[var(--sub)]">{formatoFechaHora(solicitud.creada_en)}</td>
        <td className={`px-3.5 py-2 text-sm ${estado.clase}`}>
          {estado.texto}
          {/* 23/10/2026 — feedback Ivana: paso actual del circuito, sin tocar las columnas. */}
          {resumen && <div className="text-[10px] font-normal text-[var(--sub)] mt-0.5">{resumen}</div>}
        </td>
        <td className="px-3.5 py-2 text-xs text-[var(--sub)]">{lineas.length}</td>
      </tr>
      {expandida && (
        <tr>
          <td colSpan={7} className="bg-gray-50 px-3.5 py-2">
            {/* 23/10/2026 — feedback Ivana: seguimiento del pedido con barra de pasos, arriba del detalle por línea. */}
            <div className="bg-white rounded-lg border border-[var(--border)] px-4 py-3 mb-2">
              <BarraPasos pasos={pasos} sigue={sigue} />
            </div>
            {lineas.length === 0 ? (
              <div className="text-xs text-[var(--sub)] py-2">Sin líneas todavía.</div>
            ) : (
              <table className="w-full border-collapse bg-white rounded-lg overflow-hidden border border-[var(--border)]">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['SKU', 'Producto', 'Pedido', 'Estado', 'Envía', 'Faltante / motivo', 'Recibido', 'YiQi'].map((h) => (
                      <th key={h} className="text-left px-3.5 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => (
                    <FilaLinea key={l.id} linea={l} />
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export default function ReposicionCentralLocal() {
  const permisos = usePermisos()
  const [solicitudes, setSolicitudes] = useState([])
  const [lineasPorSolicitud, setLineasPorSolicitud] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('activas')
  const [expandidas, setExpandidas] = useState({})

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: sols, error: errSol } = await supabase
        .from('solicitudes_reposicion')
        .select('*')
        .order('creada_en', { ascending: false })
        .limit(200)
      if (errSol) throw errSol
      setSolicitudes(sols ?? [])

      const ids = (sols ?? []).map((s) => s.id)
      if (!ids.length) {
        setLineasPorSolicitud({})
        return
      }
      const { data: lineas, error: errLin } = await supabase
        .from('solicitudes_reposicion_lineas')
        .select('*')
        .in('solicitud_id', ids)
        .order('sku')
      if (errLin) throw errLin

      const agrupadas = {}
      for (const l of lineas ?? []) {
        if (!agrupadas[l.solicitud_id]) agrupadas[l.solicitud_id] = []
        agrupadas[l.solicitud_id].push(l)
      }
      setLineasPorSolicitud(agrupadas)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (permisos.cargando || !permisos.esAdmin) return
    cargar()
  }, [permisos.cargando, permisos.esAdmin, cargar])

  // Gate real de contenido, no solo cosmético — mismo patrón que
  // Usuarios y accesos (10/8/2026): esto no es una pantalla operativa,
  // es supervisión de todo el circuito de los dos depósitos.
  if (!permisos.cargando && !permisos.esAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f7f8fa]">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-lg font-bold mb-1">Solo para administradores</div>
          <div className="text-sm text-gray-500">Esta vista supervisa el circuito completo de los dos depósitos.</div>
        </div>
      </div>
    )
  }

  const filtradas = solicitudes.filter((s) => {
    const lineas = lineasPorSolicitud[s.id] ?? []
    const estado = estadoDetallado(s, lineas)
    if (filtro === 'todas') return true
    if (filtro === 'completas') return estado.texto === '✓ Completa'
    // activas: todo lo que no es completa ni reemplazada
    return estado.texto !== '✓ Completa' && s.estado !== 'reemplazada' && s.estado !== 'anulada'
  })

  function toggle(id) {
    setExpandidas((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* 23/10/2026 — feedback Ivana: encabezado v7 (EncabezadoPagina) y contenedor .pagina, mismo patrón que Reglas de compra. */}
      <EncabezadoPagina
        titulo="Reposición Central-Local"
        bajada="Supervisión de los dos circuitos (Central→Local y Local→Central) — solo lectura"
      >
        <button onClick={cargar} className="btn btn-sm">
          ↻ Actualizar
        </button>
      </EncabezadoPagina>

      <div className="pagina flex flex-col gap-3.5">
      <Aviso tipo="info" id="reposicion-central-local-criterio">
        Las acciones del circuito (generar remito, declarar envía/no hay, confirmar recibido) se hacen desde las
        cuentas de depósito, no acá — esta pantalla es para ver el estado y el historial completo, incluido lo que
        ya se resolvió.
      </Aviso>

      {error && (
        <div className="bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudo cargar</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${
              filtro === f.key
                ? 'bg-[var(--ind-bg)] text-[var(--ind)] border-[var(--ind-bg)]'
                : 'bg-white text-gray-600 border-[var(--border)] hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div>
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[var(--sub)] text-sm">Cargando…</div>
          ) : filtradas.length === 0 ? (
            <div className="p-8 text-center text-[var(--sub)] text-sm">
              No hay solicitudes {filtro === 'todas' ? '' : filtro} para mostrar.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['', 'Remito', 'Circuito', 'Origen', 'Creada', 'Estado', 'Líneas'].map((h) => (
                    <th key={h} className="text-left px-3.5 py-2 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((s) => (
                  <FilaSolicitud
                    key={s.id}
                    solicitud={s}
                    lineas={lineasPorSolicitud[s.id] ?? []}
                    expandida={!!expandidas[s.id]}
                    onToggle={() => toggle(s.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
