import { formatoNumero } from '../lib/formato'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'
import { nombreDeposito } from '../lib/depositos'
// 23/10/2026 — feedback Ivana: barra de pasos (como el detalle de una OC) y encabezado v7.
import BarraPasos from '../components/ui/BarraPasos'
import { useEstadoAutomatismos } from '../hooks/useEstadoAutomatismos'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'
import NuevoPedidoEntreDepositos from '../components/NuevoPedidoEntreDepositos'
import Pastilla from '../components/ui/Pastilla'
import HistorialReposicion from '../components/HistorialReposicion'
import RemitoFirmado from '../components/RemitoFirmado'
// 18/11/2026 — interruptor de la reposición automática Central→Local (pedido de Aris) y modo prueba YiQi.
import ConfigReposicionAutomatica from '../components/ConfigReposicionAutomatica'
import { useModoPruebaYiqi } from '../hooks/useModoPruebaYiqi'

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
// 18/11/2026: la configuración de reglas_reposicion_central (interruptor
// Activada/Pausada, frecuencia, máximo por remito, umbral) vive arriba de la
// lista, en ConfigReposicionAutomatica (pedido de Aris).
// ============================================================

function formatoFechaHora(fechaStr) {
  if (!fechaStr) return '—'
  try {
    return new Date(fechaStr).toLocaleString('es-AR', { hourCycle: 'h23' })
  } catch {
    return fechaStr
  }
}

// 10/11/2026 — radiografía UX (ítem 4): formato de números es-AR único (lib/formato.js).
// 17/11/2026 — sin ",00" en cantidades enteras (500, no 500,00); hasta 2 decimales solo si los tiene.
function num(v, decimales = 2) {
  return formatoNumero(v, { decimales, minDecimales: 0 })
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
  // 17/11/2026 — Parte B: un artículo frenado por diferencia tiene el pedido abierto.
  if (lineas.some((l) => l.estado_linea === 'con_diferencia')) return { texto: 'Frenado por diferencia', clase: 'text-[#b45309] font-semibold' }
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
const ESTADOS_LINEA_EN_CAMINO = ['declarada', 'enviada', 'con_diferencia', 'recibida']

function fechaPaso(valor) {
  if (!valor) return null
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('es-AR', { hourCycle: 'h23', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
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
  const anulada = solicitud.estado === 'anulada'
  const reemplazada = solicitud.estado === 'reemplazada'
  // 18/11/2026 — "En preparación" sigue siendo el paso actual hasta que el origen declara
  // lo que envía (antes, con el remito generado y sin declarar, decía "Paso 3 · En tránsito").
  // En anuladas/reemplazadas se mantiene el criterio anterior (remito generado = preparación hecha).
  const preparacionHecha = anulada || reemplazada ? enPreparacion : enTransito
  const sinDeclarar = lineas.filter((l) => l.estado_linea === 'reservada').length
  const hechos = [true, preparacionHecha, enTransito, recibida]
  const idxActual = hechos.indexOf(false) // primer paso no hecho (-1 = circuito cerrado)

  const fechas = [
    fechaPaso(solicitud.creada_en),
    enPreparacion ? fechaPaso(solicitud.procesada_en) : null, // 18/11/2026: fecha del remito aunque falte declarar
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
  else if (idxActual === 1) sigue = solicitud.estado === 'solicitada'
    ? `Esperando que ${origen} genere el remito.`
    : `Remito generado. Falta que ${origen} declare lo que envía.`
  else if (idxActual === 2) sigue = `${origen} está preparando el pedido; todavía no declaró el envío.`
  else sigue = `Mercadería en camino. Esperando que ${destino} confirme la recepción.${sinDeclarar > 0 ? ` Quedan ${sinDeclarar} artículos sin declarar en ${origen}.` : ''}`

  // Mini indicación para la fila contraída (no aplica a anuladas/reemplazadas).
  const resumen = anulada || reemplazada
    ? null
    : idxActual === -1
      ? `Paso 4 de 4 · ${PASOS_REPOSICION[3]}`
      : idxActual === 1 && enPreparacion
        ? `Paso 2 de 4 · ${PASOS_REPOSICION[1]} — falta declarar`
        : idxActual === 3 && sinDeclarar > 0
          ? `Paso 3 de 4 · ${PASOS_REPOSICION[2]} parcial — quedan ${sinDeclarar} sin declarar`
          : `Paso ${idxActual + 1} de 4 · ${PASOS_REPOSICION[idxActual]}`

  return { pasos, sigue, resumen }
}

// 17/11/2026 — diferencias de recepción: lo recibido al confirmar distinto de lo enviado.
// dif = recibida − enviada (negativa = faltan, positiva = sobran).
// Parte B: también las frenadas ('con_diferencia'); en las revisadas se usa la
// cantidad del primer conteo (cantidad_recibida_inicial).
function difLinea(l) {
  if (!['recibida', 'con_diferencia'].includes(l.estado_linea)) return 0
  const recibida = l.cantidad_recibida_inicial ?? l.cantidad_recibida
  if (l.cantidad_enviada == null || recibida == null) return 0
  return Number(recibida) - Number(l.cantidad_enviada)
}
const ETIQUETA_ESTADO_LINEA = {
  reservada: 'reservada',
  declarada: 'en tránsito',
  con_diferencia: 'frenada por diferencia',
  recibida: 'recibida',
}
// Resumen por pedido: { faltan, sobran } en unidades (0 si no hay).
function resumenDiferencias(lineas) {
  let faltan = 0
  let sobran = 0
  for (const l of lineas) {
    const d = difLinea(l)
    if (d < 0) faltan += -d
    else if (d > 0) sobran += d
  }
  const pendientes = lineas.filter((l) => l.estado_linea === 'con_diferencia').length
  return { faltan, sobran, pendientes, hay: faltan > 0 || sobran > 0 || pendientes > 0 }
}

const FILTROS = [
  { key: 'activas', label: 'Activas' },
  { key: 'completas', label: 'Completas' },
  { key: 'diferencias', label: 'Con diferencias' },
  { key: 'todas', label: 'Todas' },
]

function FilaLinea({ linea, modoPrueba }) {
  const tieneError = !!linea.yiqi_error
  const dif = difLinea(linea)
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="px-3.5 py-1.5 font-mono text-xs">{linea.sku}</td>
      <td className="px-3.5 py-1.5 text-sm">{linea.mate_nombre}</td>
      <td className="px-3.5 py-1.5 text-sm text-[var(--sub)]">{num(linea.cantidad_solicitada)}</td>
      <td className={`px-3.5 py-1.5 text-sm ${linea.estado_linea === 'con_diferencia' ? 'text-[#b45309] font-semibold' : ''}`}>
        {ETIQUETA_ESTADO_LINEA[linea.estado_linea] ?? linea.estado_linea}
      </td>
      <td className="px-3.5 py-1.5 text-sm">{linea.cantidad_enviada != null ? num(linea.cantidad_enviada) : '—'}</td>
      <td className="px-3.5 py-1.5 text-sm text-[var(--red)]">
        {linea.cantidad_faltante > 0 ? `${num(linea.cantidad_faltante)} — ${linea.motivo_sin_stock || 'sin motivo'}` : '—'}
      </td>
      <td className="px-3.5 py-1.5 text-sm">{linea.cantidad_recibida != null ? num(linea.cantidad_recibida) : '—'}</td>
      {/* 17/11/2026 — diferencias de recepción: −N faltante (rojo), +N sobrante (ámbar). */}
      <td className="px-3.5 py-1.5 text-sm font-semibold">
        {dif < 0 ? <span className="text-[var(--red)]">−{num(-dif)}</span>
          : dif > 0 ? <span className="text-[#b45309]">+{num(dif)}</span>
          : <span className="text-[var(--sub)] font-normal">—</span>}
        {linea.motivo_diferencia && (
          <div className="text-[10px] font-normal text-[var(--sub)]">
            {linea.motivo_diferencia}{linea.nota_diferencia ? ` — ${linea.nota_diferencia}` : ''}
          </div>
        )}
        {linea.diferencia_revisada_en && (
          <div className="text-[10px] font-normal text-green-700">
            Revisada · final {num(linea.cantidad_recibida)}{linea.nota_revision ? ` — ${linea.nota_revision}` : ''}
          </div>
        )}
      </td>
      <td className="px-3.5 py-1.5 text-xs">
        {linea.estado_linea === 'recibida' ? (
          tieneError ? (
            <span className="text-[var(--red)]" title={linea.yiqi_error}>⚠️ error YiQi</span>
          ) : linea.yiqi_movimiento_id ? (
            <span className="text-[var(--grn,#059669)]">✓ {linea.yiqi_movimiento_id}</span>
          ) : modoPrueba ? (
            // 18/11/2026 — en modo prueba la app no escribe en YiQi: no es un "pendiente" real.
            <span className="text-[var(--sub)]" title="El modo prueba no escribe movimientos en YiQi">modo prueba</span>
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

function FilaSolicitud({ solicitud, lineas, expandida, onToggle, modoPrueba, tuvoDiferencia }) {
  const estado = estadoDetallado(solicitud, lineas)
  const { pasos, sigue, resumen } = pasosDeSolicitud(solicitud, lineas)
  const difs = resumenDiferencias(lineas)
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
          {/* 18/11/2026 — antes "Origen / Regla automática": se confundía con el depósito origen. */}
          {solicitud.generada_por === 'manual' ? 'Manual' : 'Automático'}
        </td>
        <td className="px-3.5 py-2 text-xs text-[var(--sub)]">{formatoFechaHora(solicitud.creada_en)}</td>
        <td className={`px-3.5 py-2 text-sm ${estado.clase}`}>
          {estado.texto}
          {/* 23/10/2026 — feedback Ivana: paso actual del circuito, sin tocar las columnas. */}
          {resumen && <div className="text-[10px] font-normal text-[var(--sub)] mt-0.5">{resumen}</div>}
          {/* 18/11/2026 — un pedido que tuvo diferencia y se corrigió termina "✓ Completa" sin señal: la marcamos. */}
          {!difs.hay && tuvoDiferencia && (
            <div className="mt-1">
              <Pastilla tono="gris" title="Al recibir hubo una diferencia con lo enviado; ya se resolvió (ver el historial del pedido)">
                Tuvo diferencia (resuelta)
              </Pastilla>
            </div>
          )}
          {/* 17/11/2026 — diferencias de recepción */}
          {difs.hay && (
            <div className="mt-1">
              <Pastilla tono="rojo" title="El destino confirmó una cantidad distinta de la enviada">
                Recibido con diferencia · {difs.faltan > 0 ? `faltan ${num(difs.faltan)} u` : ''}
                {difs.faltan > 0 && difs.sobran > 0 ? ' · ' : ''}
                {difs.sobran > 0 ? `sobran ${num(difs.sobran)} u` : ''}
                {difs.pendientes > 0 ? ` · ${difs.pendientes} sin revisar` : ''}
              </Pastilla>
            </div>
          )}
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
                    {['SKU', 'Producto', 'Pedido', 'Estado', 'Envía', 'Faltante / motivo', 'Recibido', 'Diferencia', 'YiQi'].map((h) => (
                      <th key={h} className="text-left px-3.5 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => (
                    <FilaLinea key={l.id} linea={l} modoPrueba={modoPrueba} />
                  ))}
                </tbody>
              </table>
            )}
            {/* 18/11/2026 — copia firmada del remito (solo ver). */}
            <div className="bg-white rounded-lg border border-[var(--border)] px-3.5 py-2 mt-2">
              <RemitoFirmado solicitudId={solicitud.id} puedeSubir={false} />
            </div>
            {/* 17/11/2026 — historial de cada artículo (declaró, recibió, corrigió, revisó). */}
            <HistorialReposicion
              solicitudId={solicitud.id}
              plegable="Historial del pedido"
              className="bg-white rounded-lg border border-[var(--border)] px-3.5 py-2 mt-2"
            />
          </td>
        </tr>
      )}
    </>
  )
}

export default function ReposicionCentralLocal() {
  const permisos = usePermisos()
  // 10/11/2026 — radiografía UX (ítem 18): null = no se sabe (no se muestra nada).
  // 18/11/2026 — `versionAuto` se incrementa al activar/pausar desde la tarjeta para refrescar el aviso.
  const [versionAuto, setVersionAuto] = useState(0)
  const automatismos = useEstadoAutomatismos(versionAuto)
  const { modoPrueba } = useModoPruebaYiqi()
  // 18/11/2026 — ids de pedidos que tuvieron una diferencia de recepción (aunque ya esté resuelta).
  const [conDiferenciaHistorica, setConDiferenciaHistorica] = useState(() => new Set())
  const [solicitudes, setSolicitudes] = useState([])
  const [lineasPorSolicitud, setLineasPorSolicitud] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('activas')
  const [expandidas, setExpandidas] = useState({})
  // 17/11/2026 — pedido de Aris: crear pedidos entre depósitos desde acá (solo admin).
  const [nuevoPedidoAbierto, setNuevoPedidoAbierto] = useState(false)
  const [avisoCreado, setAvisoCreado] = useState(null)
  // 18/11/2026 — pedido de Aris: botón "Recalcular remitos" (fuerza la actualización del armado).
  const [recalculando, setRecalculando] = useState(false)
  const [errorRecalculo, setErrorRecalculo] = useState(null)

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
        setConDiferenciaHistorica(new Set())
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

      // 18/11/2026 — historial: ¿qué pedidos tuvieron una recepción con diferencia? Si la tabla
      // no existe o falla, se ignora (la pantalla sigue como antes).
      try {
        const { data: evs, error: errEv } = await supabase
          .from('reposicion_lineas_eventos')
          .select('solicitud_id')
          .eq('evento', 'recibida_con_diferencia')
          .in('solicitud_id', ids)
        setConDiferenciaHistorica(errEv ? new Set() : new Set((evs ?? []).map((e) => e.solicitud_id)))
      } catch {
        setConDiferenciaHistorica(new Set())
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // 18/11/2026 — llama a forzar_actualizacion_reposicion(): reformula los pedidos en espera con el
  // stock de ahora y, si el automático está activo y hay lugar, crea los que falten.
  async function recalcularRemitos() {
    setRecalculando(true)
    setErrorRecalculo(null)
    setAvisoCreado(null)
    try {
      const { data, error: errRpc } = await supabase.rpc('forzar_actualizacion_reposicion')
      if (errRpc) throw errRpc
      const rec = Number(data?.recalculados ?? 0)
      const anu = Number(data?.anulados ?? 0)
      const cre = Number(data?.creados ?? 0)
      const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
      const partes = []
      if (rec > 0) partes.push(`se actualizaron ${plural(rec, 'pedido en espera', 'pedidos en espera')}`)
      if (anu > 0) partes.push(`${plural(anu, 'pedido en espera quedó anulado', 'pedidos en espera quedaron anulados')} porque ya no había nada para mandar`)
      if (cre > 0) partes.push(`se creó ${cre === 1 ? '1 pedido nuevo' : `${cre} pedidos nuevos`}`)
      let texto
      if (data?.activa === false) {
        texto = rec + anu > 0
          ? 'El automático está pausado: solo se actualizaron los pedidos en espera.'
          : 'El automático está pausado y no había pedidos en espera para actualizar.'
      } else if (partes.length === 0) {
        texto = Number(data?.abiertos ?? 0) >= Number(data?.maximo ?? 0)
          ? `No hubo cambios. Hay ${data?.abiertos} pedidos automáticos abiertos (máximo ${data?.maximo}): hasta que no se preparen y se entreguen, no se generan pedidos nuevos.`
          : 'No hubo cambios: no había pedidos en espera ni artículos para pedir.'
      } else {
        const t = partes.join(' y ')
        texto = t.charAt(0).toUpperCase() + t.slice(1) + '.'
      }
      setAvisoCreado(texto)
      setVersionAuto((v) => v + 1)
      await cargar()
    } catch (err) {
      setErrorRecalculo(err?.message || 'No se pudo recalcular los remitos.')
    } finally {
      setRecalculando(false)
    }
  }

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
    if (filtro === 'diferencias') return resumenDiferencias(lineas).hay || conDiferenciaHistorica.has(s.id)
    if (filtro === 'completas') return estado.texto === '✓ Completa'
    // activas: todo lo que no es completa ni reemplazada
    return estado.texto !== '✓ Completa' && s.estado !== 'reemplazada' && s.estado !== 'anulada'
  })

  const cantConDiferencias = solicitudes.filter(
    (s) => resumenDiferencias(lineasPorSolicitud[s.id] ?? []).hay || conDiferenciaHistorica.has(s.id)
  ).length

  function toggle(id) {
    setExpandidas((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* 23/10/2026 — feedback Ivana: encabezado v7 (EncabezadoPagina) y contenedor .pagina, mismo patrón que Reglas de compra. */}
      <EncabezadoPagina
        titulo="Reposición Central-Local"
        bajada="Supervisión de los dos circuitos (Central→Local y Local→Central) — supervisión y alta de pedidos"
      >
        {!permisos.cargando && permisos.esAdmin && (
          <button onClick={() => setNuevoPedidoAbierto(true)} className="btn btn-sm">
            <i className="ti ti-plus" /> Nuevo pedido entre depósitos
          </button>
        )}
        <button onClick={cargar} className="btn btn-sm">
          ↻ Actualizar
        </button>
        {/* 18/11/2026 — pedido de Aris: forzar la actualización del armado de remitos (solo admin). */}
        {!permisos.cargando && permisos.esAdmin && (
          <button
            onClick={recalcularRemitos}
            disabled={recalculando}
            className="btn btn-sm"
            title="Vuelve a armar con el stock de ahora los pedidos automáticos que Central todavía no empezó a preparar (si apareció un artículo A con necesidad, entra por prioridad). Si el automático está activo y hay lugar, también crea los pedidos que falten, sin esperar la frecuencia. Los que Central ya empezó a armar no se tocan."
          >
            {recalculando ? 'Recalculando…' : '⟳ Recalcular remitos'}
          </button>
        )}
      </EncabezadoPagina>

      <div className="pagina flex flex-col gap-3.5">
      {/* 18/11/2026 — pedido de Aris: interruptor de la reposición automática (solo admin). */}
      {!permisos.cargando && permisos.esAdmin && (
        <ConfigReposicionAutomatica onCambio={() => { setVersionAuto((v) => v + 1); cargar() }} />
      )}
      <Aviso tipo="info" id="reposicion-central-local-criterio">
        Desde acá se puede crear un pedido entre depósitos, pero preparar, declarar envía/no hay y confirmar
        recibido se sigue haciendo desde las cuentas de depósito — esta pantalla es para ver el estado y el
        historial completo, incluido lo que ya se resolvió.
      </Aviso>

      {avisoCreado && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2.5 text-[13px]">
          {avisoCreado}
        </div>
      )}
      {errorRecalculo && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-[13px]">
          {errorRecalculo}
        </div>
      )}

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
            {f.label}{f.key === 'diferencias' ? ` (${cantConDiferencias})` : ''}
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
              {automatismos?.reposicion_central_activa === false && (
                <div className="mt-2 text-[12px] text-[#92400e]">
                  La reposición automática Central→Local está pausada: solo aparecen pedidos manuales.
                </div>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['', 'Remito', 'Circuito', 'Generado', 'Creada', 'Estado', 'Líneas'].map((h) => (
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
                    modoPrueba={modoPrueba}
                    tuvoDiferencia={conDiferenciaHistorica.has(s.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </div>
      {nuevoPedidoAbierto && (
        <NuevoPedidoEntreDepositos
          onCerrar={() => setNuevoPedidoAbierto(false)}
          onCreado={(msg) => {
            setAvisoCreado(msg)
            setTimeout(() => setAvisoCreado(null), 6000)
            cargar()
          }}
        />
      )}
    </div>
  )
}
