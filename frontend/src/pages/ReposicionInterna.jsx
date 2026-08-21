import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'
import { exportarRemitoExcel, exportarTodosLosRemitosExcel } from '../lib/exportarExcel'

// ============================================================
// ReposicionInterna.jsx — Módulo de Stock, Fase 2b (19/8/2026) +
// Fase 2c: remitos/tandas de hasta 30 artículos (21/8/2026)
//
// Combina dos fuentes:
//   - reposiciones_sugeridas: prioridades 1 a 5 (mover Central->Local),
//     PERSISTENTE con estado (pendiente/movido/descartado/vencido).
//     Acá vive la acción "Marcar como movido" / "Descartar".
//   - reposicion_interna(): prioridades 6 a 9, calculado EN VIVO,
//     sólo informativo (6 = Artículos a pedir ya se gestiona por el
//     flujo de Sugerencias de compra / OC existente; 7, 8 y 9 son
//     exclusiones/sin necesidad de acción).
//
// "Sin necesidad" (9) y "No considerados" (8) están ocultos por
// defecto (decisión de Federico 19/8/2026): son ~5400 de los ~7150
// SKUs y no aportan nada operativo -- se pueden mostrar con el link
// "Mostrar todo" si hace falta auditar.
//
// La tabla reposiciones_sugeridas se actualiza sola una vez por día
// (cron generar-reposicion-interna-diario) y también con el botón
// "↻ Actualizar" de esta pantalla.
//
// Remitos (Fase 2c, sección 4.5 de Aris): vista separada ("Remitos")
// que agrupa las filas accionables (prioridades 1-5, pendientes) en
// tandas de hasta 30, ya numeradas por generar_remitos_reposicion()
// (columna `remito`). Solo lectura + exportar a Excel -- marcar
// movido/descartado se sigue haciendo desde la vista "Lista", para no
// duplicar esa lógica en dos lugares.
// ============================================================

const TAMANIO_LOTE = 1000

const PRIORIDAD_COLOR = {
  1: 'bg-[var(--red-bg)] text-[var(--red)]',
  2: 'bg-[var(--red-bg)] text-[var(--red)]',
  3: 'bg-[var(--yel-bg)] text-[#92400e]',
  4: 'bg-[var(--yel-bg)] text-[#92400e]',
  5: 'bg-blue-50 text-[#1d4ed8]',
  6: 'bg-purple-50 text-purple-700',
  7: 'bg-gray-100 text-gray-500',
  8: 'bg-gray-100 text-gray-400',
  9: 'bg-gray-50 text-gray-400',
}

// Prioridades que tienen acción persistente (mover desde Central).
const PRIORIDADES_ACCIONABLES = [1, 2, 3, 4, 5]
// Prioridades siempre visibles aunque no tengan acción (informativas de uso diario).
const PRIORIDADES_INFO_DEFAULT = [6, 7]
// Prioridades ocultas salvo "Mostrar todo".
const PRIORIDADES_OCULTAS_DEFAULT = [8, 9]

function formatoFechaHora(fechaStr) {
  if (!fechaStr) return '—'
  try {
    return new Date(fechaStr).toLocaleString('es-AR')
  } catch {
    return fechaStr
  }
}

// Default 2 decimales + separador de miles (es-AR: punto de miles, coma
// decimal) para cualquier cantidad — incluye stock, porque Aris confirmó
// que los decimales en stock son datos legítimos (fraccionados/producción),
// no hay que truncarlos a entero.
function num(v, decimales = 2) {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

// Para inputs numéricos nativos (type="number"): SIN separador de miles
// (el navegador lo rechaza) pero sí topeado a 2 decimales, para no mostrar
// el float crudo (ej. 230.41666666666666 -> "230.42").
function numInput(v) {
  if (v == null) return ''
  const n = Number(v)
  if (Number.isNaN(n)) return ''
  return n.toFixed(2)
}

// ------------------------------------------------------------
// Carga paginada genérica (mismo patrón que Alertas.jsx: la RLS ya
// filtra por proveedor del lado del servidor, no hace falta repetir
// el filtro acá).
// ------------------------------------------------------------
async function traerPaginado(builder) {
  let consultaInicial = builder().range(0, TAMANIO_LOTE - 1)
  const primera = await consultaInicial
  if (primera.error) throw new Error(primera.error.message)

  let acumulado = [...primera.data]
  const total = primera.count ?? primera.data.length

  if (total > TAMANIO_LOTE) {
    const paginasRestantes = Math.ceil((total - TAMANIO_LOTE) / TAMANIO_LOTE)
    const promesas = []
    for (let i = 1; i <= paginasRestantes; i++) {
      const desde = i * TAMANIO_LOTE
      promesas.push(builder().range(desde, desde + TAMANIO_LOTE - 1))
    }
    const resultados = await Promise.all(promesas)
    for (const r of resultados) {
      if (r.error) throw new Error(r.error.message)
      acumulado = acumulado.concat(r.data)
    }
  }

  return acumulado
}

// ------------------------------------------------------------
// Modal de acción: marcar como movido (con cantidad real opcional)
// o descartar (con motivo obligatorio). Mismo lenguaje visual que
// el resto de la app (rounded-xl, bordes suaves, sin window.prompt).
// ------------------------------------------------------------
function ModalAccion({ fila, variante, onCerrar, onConfirmar, guardando }) {
  const [cantidad, setCantidad] = useState(numInput(fila.cantidad))
  const [motivo, setMotivo] = useState('')
  const esMovido = variante === 'movido'
  const motivoInvalido = !esMovido && motivo.trim() === ''

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl border border-[var(--border)] shadow-lg w-full max-w-sm p-5">
        <div className="text-[15px] font-bold mb-1">
          {esMovido ? '✓ Marcar como movido' : '✗ Descartar sugerencia'}
        </div>
        <div className="text-[12px] text-[var(--sub)] mb-3">
          {fila.sku} — {fila.mate_nombre}
        </div>

        {esMovido ? (
          <>
            <label className="text-[12px] text-gray-600 font-semibold">
              Cantidad realmente movida
            </label>
            <input
              type="number"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="mt-1 w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            />
            <div className="text-[11px] text-gray-400 mt-1">
              Sugerido: {num(fila.cantidad, 2)}. Si moviste menos (no alcanzaba el stock, por ejemplo), corregí acá.
            </div>
          </>
        ) : (
          <>
            <label className="text-[12px] text-gray-600 font-semibold">
              Motivo (obligatorio)
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ej: se decidió no reponer, error de cálculo, producto discontinuado…"
              className="mt-1 w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            />
          </>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCerrar}
            disabled={guardando}
            className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() =>
              onConfirmar({
                cantidad_movida: esMovido ? (cantidad === '' ? null : Number(cantidad)) : null,
                observacion: esMovido ? (motivo.trim() === '' ? null : motivo.trim()) : motivo.trim(),
              })
            }
            disabled={guardando || motivoInvalido}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50 ${
              esMovido ? 'bg-[var(--grn,#059669)]' : 'bg-[var(--red,#dc2626)]'
            }`}
          >
            {guardando ? 'Guardando…' : esMovido ? 'Confirmar movimiento' : 'Confirmar descarte'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ReposicionInterna() {
  const permisos = usePermisos()

  const [accionables, setAccionables] = useState([]) // reposiciones_sugeridas, prioridades 1-5, pendiente
  const [informativas, setInformativas] = useState([]) // reposicion_interna(), prioridades 6-9
  const [loading, setLoading] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  const [filtroPrioridad, setFiltroPrioridad] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [mostrarTodo, setMostrarTodo] = useState(false)
  const [paginaActual, setPaginaActual] = useState(1)
  const [filasPorPagina, setFilasPorPagina] = useState(50)

  const [modal, setModal] = useState(null) // { fila, variante }
  const [guardandoAccion, setGuardandoAccion] = useState(false)

  const [vista, setVista] = useState('lista') // 'lista' | 'remitos'
  const [generandoRemitos, setGenerandoRemitos] = useState(false)

  async function cargarDatos() {
    if (permisos.cargando || permisos.error) return
    setLoading(true)
    setError(null)
    try {
      const [filasAccionables, filasInformativas] = await Promise.all([
        traerPaginado(() =>
          supabase
            .from('reposiciones_sugeridas')
            .select('*', { count: 'exact' })
            .eq('estado', 'pendiente')
        ),
        traerPaginado(() => {
          let q = supabase.rpc('reposicion_interna', {}, { count: 'exact' })
          q = mostrarTodo ? q.gte('prioridad_orden', 6) : q.in('prioridad_orden', PRIORIDADES_INFO_DEFAULT)
          return q
        }),
      ])
      setAccionables(filasAccionables)
      setInformativas(filasInformativas)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function actualizarSugerencias() {
    setActualizando(true)
    setError(null)
    try {
      const { error: errRpc } = await supabase.rpc('generar_reposicion_interna')
      if (errRpc) throw errRpc
      await cargarDatos()
      setAviso('Sugerencias actualizadas con el stock y las ventas más recientes.')
      setTimeout(() => setAviso(null), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setActualizando(false)
    }
  }

  async function generarRemitos() {
    setGenerandoRemitos(true)
    setError(null)
    try {
      const { error: errRpc } = await supabase.rpc('generar_remitos_reposicion')
      if (errRpc) throw errRpc
      await cargarDatos()
      setAviso('Remitos generados a partir de las sugerencias pendientes.')
      setTimeout(() => setAviso(null), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerandoRemitos(false)
    }
  }

  const claveFiltro =
    permisos.cargando || permisos.error
      ? null
      : `${permisos.esAdmin}|${permisos.codigos.join(',')}|${permisos.nombres.join(',')}`

  useEffect(() => {
    if (claveFiltro === null) return
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltro, mostrarTodo])

  useEffect(() => {
    setPaginaActual(1)
  }, [busqueda, filtroPrioridad, filasPorPagina, mostrarTodo])

  // ------------------------------------------------------------
  // Unificación: ambas fuentes se combinan en una sola lista de
  // filas con la misma forma, agregando `_accionable` para saber si
  // corresponde mostrar los botones o no.
  // ------------------------------------------------------------
  const filas = useMemo(() => {
    const a = accionables.map((f) => ({
      id: f.id,
      sku: f.sku,
      mate_nombre: f.mate_nombre,
      proveedor: f.proveedor,
      stock_local: f.stock_local,
      stock_central: f.stock_central,
      clase_abc: f.clase_abc,
      cantidad: f.cantidad,
      faltante_a_pedir: f.faltante_a_pedir,
      cobertura_dias_local: f.cobertura_dias_local,
      prioridad_orden: f.prioridad_orden,
      prioridad_label: f.prioridad_label,
      venta_12_meses: f.venta_12_meses,
      _accionable: true,
      _origen: f,
    }))
    const b = informativas.map((f) => ({
      id: `vivo-${f.sku}`,
      sku: f.sku,
      mate_nombre: f.mate_nombre,
      proveedor: f.proveedor,
      stock_local: f.stock_local,
      stock_central: f.stock_central,
      clase_abc: f.clase_abc,
      cantidad: f.mover_desde_central,
      faltante_a_pedir: f.faltante_a_pedir,
      cobertura_dias_local: f.cobertura_dias_local,
      prioridad_orden: f.prioridad_orden,
      prioridad_label: f.prioridad_label,
      venta_12_meses: f.venta_12_meses,
      _accionable: false,
      _origen: f,
    }))
    return [...a, ...b]
  }, [accionables, informativas])

  const contadoresPorPrioridad = useMemo(() => {
    const mapa = {}
    for (const f of filas) {
      mapa[f.prioridad_orden] = (mapa[f.prioridad_orden] ?? 0) + 1
    }
    return mapa
  }, [filas])

  const prioridadesDisponibles = useMemo(() => {
    return Object.keys(contadoresPorPrioridad)
      .map(Number)
      .sort((a, b) => a - b)
  }, [contadoresPorPrioridad])

  const filtradas = useMemo(() => {
    return filas.filter((f) => {
      if (filtroPrioridad !== 'todas' && String(f.prioridad_orden) !== filtroPrioridad) return false
      if (busqueda) {
        const texto = busqueda.toLowerCase()
        const coincide =
          f.sku?.toLowerCase().includes(texto) ||
          f.mate_nombre?.toLowerCase().includes(texto) ||
          f.proveedor?.toLowerCase().includes(texto)
        if (!coincide) return false
      }
      return true
    })
  }, [filas, filtroPrioridad, busqueda])

  const ordenadas = useMemo(() => {
    return [...filtradas].sort((a, b) => {
      if (a.prioridad_orden !== b.prioridad_orden) return a.prioridad_orden - b.prioridad_orden
      return (b.venta_12_meses ?? 0) - (a.venta_12_meses ?? 0)
    })
  }, [filtradas])

  const totalFilas = ordenadas.length
  const totalPaginasTabla = Math.max(1, Math.ceil(totalFilas / filasPorPagina))
  const paginaSegura = Math.min(paginaActual, totalPaginasTabla)
  const inicioSlice = (paginaSegura - 1) * filasPorPagina
  const filasPaginadas = ordenadas.slice(inicioSlice, inicioSlice + filasPorPagina)

  const totalAccionables = accionables.length
  const totalAMover = useMemo(
    () => accionables.reduce((acc, f) => acc + (Number(f.cantidad) || 0), 0),
    [accionables]
  )

  // ------------------------------------------------------------
  // Remitos (Fase 2c): agrupar por el campo `remito` que ya viene
  // asignado en `accionables` (ver generar_remitos_reposicion()).
  // Se calcula client-side a partir de los datos ya cargados -- no
  // hace falta una consulta aparte.
  // ------------------------------------------------------------
  const remitos = useMemo(() => {
    const mapa = new Map()
    for (const f of accionables) {
      if (!f.remito) continue
      if (!mapa.has(f.remito)) mapa.set(f.remito, [])
      mapa.get(f.remito).push(f)
    }
    return Array.from(mapa.entries())
      .map(([nombre, filas]) => ({
        nombre,
        filas,
        prioridad_orden: filas[0]?.prioridad_orden,
        prioridad_label: filas[0]?.prioridad_label,
        totalUnidades: filas.reduce((acc, f) => acc + (Number(f.cantidad) || 0), 0),
      }))
      .sort((a, b) => {
        const na = parseInt(a.nombre.match(/\d+/)?.[0] ?? '0', 10)
        const nb = parseInt(b.nombre.match(/\d+/)?.[0] ?? '0', 10)
        return na - nb
      })
  }, [accionables])

  const sinRemitoCount = useMemo(
    () => accionables.filter((f) => !f.remito).length,
    [accionables]
  )

  async function confirmarAccion({ cantidad_movida, observacion }) {
    if (!modal) return
    setGuardandoAccion(true)
    try {
      const { error: errRpc } = await supabase.rpc('marcar_reposicion_sugerida', {
        p_id: modal.fila.id,
        p_estado: modal.variante === 'movido' ? 'movido' : 'descartado',
        p_observacion: observacion,
        p_cantidad_movida: cantidad_movida,
      })
      if (errRpc) throw errRpc
      setAccionables((prev) => prev.filter((f) => f.id !== modal.fila.id))
      setModal(null)
      setAviso(
        modal.variante === 'movido'
          ? `${modal.fila.sku} marcado como movido.`
          : `${modal.fila.sku} descartado.`
      )
      setTimeout(() => setAviso(null), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardandoAccion(false)
    }
  }

  const cargandoAlgo = loading || permisos.cargando

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Reposición interna</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            {cargandoAlgo
              ? 'Cargando…'
              : `${num(totalAccionables, 0)} para mover · ${num(totalAMover, 2)} unidades totales`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-[var(--border)] overflow-hidden">
            <button
              onClick={() => setVista('lista')}
              className={`px-3 py-1.5 text-[13px] font-semibold ${
                vista === 'lista' ? 'bg-[var(--indigo,#4338ca)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setVista('remitos')}
              className={`px-3 py-1.5 text-[13px] font-semibold border-l border-[var(--border)] ${
                vista === 'remitos' ? 'bg-[var(--indigo,#4338ca)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Remitos {remitos.length > 0 ? `(${remitos.length})` : ''}
            </button>
          </div>
          <button
            onClick={actualizarSugerencias}
            disabled={actualizando || cargandoAlgo}
            className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {actualizando ? 'Actualizando…' : '↻ Actualizar'}
          </button>
        </div>
      </div>

      {permisos.error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudieron determinar tus permisos</p>
          <p className="text-sm mt-1">{permisos.error}</p>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudo cargar Reposición interna</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={cargarDatos} className="mt-2 text-sm underline">
            Reintentar
          </button>
        </div>
      )}

      {aviso && (
        <div className="mx-4 mt-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2.5 text-[13px]">
          {aviso}
        </div>
      )}

      <Aviso tipo="info" id="reposicion-criterio" className="mx-4 mt-4">
        Objetivo local: cobertura de 1 mes de venta promedio (últimos 12 meses). "Mover desde Central" nunca
        supera el stock disponible en Depósito Central. Prioridades 1 a 5 tienen acción — "Artículos a pedir" (6)
        y "No enviar al local" (7) son informativas: ya se gestionan por otros flujos del sistema. La lista de
        acción se actualiza sola una vez por día, o al instante con "Actualizar".
      </Aviso>

      {!permisos.cargando && !permisos.error && !permisos.esAdmin && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mx-4 mt-2">
          Vista filtrada: estás viendo únicamente los {permisos.nombres.length} proveedores asignados a tu
          usuario.
        </Aviso>
      )}

      {vista === 'lista' && (
      <>
      {/* Filtros por prioridad */}
      <div className="px-4 pt-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFiltroPrioridad('todas')}
          className={`px-3 py-1.5 rounded-full text-sm border ${
            filtroPrioridad === 'todas'
              ? 'bg-[var(--indigo,#4338ca)] text-white border-[var(--indigo,#4338ca)]'
              : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          Todas ({num(filas.length, 0)})
        </button>
        {prioridadesDisponibles.map((p) => {
          const etiqueta = filas.find((f) => f.prioridad_orden === p)?.prioridad_label ?? `Prioridad ${p}`
          return (
            <button
              key={p}
              onClick={() => setFiltroPrioridad(String(p))}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                filtroPrioridad === String(p)
                  ? 'bg-[var(--indigo,#4338ca)] text-white border-[var(--indigo,#4338ca)]'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {etiqueta} ({num(contadoresPorPrioridad[p], 0)})
            </button>
          )
        })}
      </div>

      {/* Buscador, filas por página, mostrar todo */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3 flex-wrap">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por SKU, nombre o proveedor…"
          className="flex-1 max-w-sm border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer select-none">
            <input type="checkbox" checked={mostrarTodo} onChange={(e) => setMostrarTodo(e.target.checked)} />
            Mostrar "No enviar al local" y "Sin necesidad" ({PRIORIDADES_OCULTAS_DEFAULT.join(', ')})
          </label>
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
      </div>

      {/* Tabla */}
      <div className="mx-4 mb-2 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        {cargandoAlgo && filas.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">Calculando reposición…</div>
        ) : filasPaginadas.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">
            No hay artículos que coincidan con los filtros. 🎉
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                {['Prioridad', 'SKU', 'Producto', 'Proveedor', 'Local', 'Central', 'ABC', 'Cantidad', 'Cobertura', 'Acción'].map(
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
              {filasPaginadas.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3.5 py-2.5">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        PRIORIDAD_COLOR[f.prioridad_orden] ?? 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {f.prioridad_label}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-xs">{f.sku}</td>
                  <td className="px-3.5 py-2.5 font-semibold">{f.mate_nombre}</td>
                  <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{f.proveedor ?? '—'}</td>
                  <td className="px-3.5 py-2.5">{num(f.stock_local)}</td>
                  <td className="px-3.5 py-2.5">{num(f.stock_central)}</td>
                  <td className="px-3.5 py-2.5 text-gray-400">{f.clase_abc ?? '—'}</td>
                  <td className="px-3.5 py-2.5 font-bold">
                    {f.cantidad > 0 ? num(f.cantidad, 2) : f.faltante_a_pedir > 0 ? `falta ${num(f.faltante_a_pedir, 2)}` : '—'}
                  </td>
                  <td className="px-3.5 py-2.5 text-gray-400">
                    {f.cobertura_dias_local != null ? `${num(f.cobertura_dias_local, 0)} d` : '—'}
                  </td>
                  <td className="px-3.5 py-2.5">
                    {f._accionable ? (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setModal({ fila: f, variante: 'movido' })}
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-green-50 text-green-700 hover:bg-green-100"
                        >
                          ✓ Movido
                        </button>
                        <button
                          onClick={() => setModal({ fila: f, variante: 'descartado' })}
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-red-50 text-[var(--red)] hover:bg-red-100"
                        >
                          ✗ Descartar
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-400">Informativo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginador */}
      {ordenadas.length > 0 && (
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
      </>
      )}

      {vista === 'remitos' && (
        <div className="px-4 pt-4 pb-6">
          <Aviso tipo="info" id="remitos-criterio" className="mb-3">
            Cada remito agrupa hasta 30 artículos de una misma prioridad, para facilitar el picking y el control —
            no es por capacidad de camioneta: si hace falta, se hacen varios viajes. "↻ Generar remitos" reparte de
            nuevo TODAS las sugerencias pendientes en tandas (los ítems ya marcados como movidos/descartados no
            vuelven a aparecer).
          </Aviso>

          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="text-[12px] text-[var(--sub)]">
              {cargandoAlgo
                ? 'Cargando…'
                : remitos.length === 0
                ? 'Todavía no se generaron remitos.'
                : `${remitos.length} remito${remitos.length === 1 ? '' : 's'} · ${num(
                    remitos.reduce((acc, r) => acc + r.filas.length, 0),
                    0
                  )} artículos`}
              {!cargandoAlgo && sinRemitoCount > 0 && (
                <span className="text-[var(--red)]">
                  {' '}
                  · {num(sinRemitoCount, 0)} sugerencia{sinRemitoCount === 1 ? '' : 's'} pendiente
                  {sinRemitoCount === 1 ? '' : 's'} sin remito todavía
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={generarRemitos}
                disabled={generandoRemitos || cargandoAlgo}
                className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                {generandoRemitos ? 'Generando…' : '↻ Generar remitos'}
              </button>
              {remitos.length > 0 && (
                <button
                  onClick={() => exportarTodosLosRemitosExcel(remitos)}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--grn,#059669)] hover:opacity-90"
                >
                  ⬇ Descargar todos (Excel)
                </button>
              )}
            </div>
          </div>

          {cargandoAlgo && remitos.length === 0 ? (
            <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
              Cargando…
            </div>
          ) : remitos.length === 0 ? (
            <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
              {totalAccionables === 0
                ? 'No hay sugerencias pendientes para agrupar en remitos.'
                : 'Hay sugerencias pendientes pero todavía no se generaron remitos — usá "↻ Generar remitos".'}
            </div>
          ) : (
            <div className="space-y-4">
              {remitos.map((r) => (
                <div key={r.nombre} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-gray-50 border-b border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{r.nombre}</span>
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          PRIORIDAD_COLOR[r.prioridad_orden] ?? 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {r.filas.length} artículo{r.filas.length === 1 ? '' : 's'}
                      </span>
                      <span className="text-[11px] text-[var(--sub)]">{num(r.totalUnidades, 2)} unidades</span>
                    </div>
                    <button
                      onClick={() => exportarRemitoExcel(r.nombre, r.filas)}
                      className="px-2.5 py-1 rounded text-[11px] font-semibold bg-green-50 text-green-700 hover:bg-green-100"
                    >
                      ⬇ Excel
                    </button>
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['SKU', 'Descripción', 'Cantidad'].map((h) => (
                          <th
                            key={h}
                            className="text-left px-3.5 py-1.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {r.filas.map((f) => (
                        <tr key={f.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-3.5 py-1.5 font-mono text-xs">{f.sku}</td>
                          <td className="px-3.5 py-1.5 text-sm">{f.mate_nombre}</td>
                          <td className="px-3.5 py-1.5 text-sm font-semibold">{num(f.cantidad, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modal && (
        <ModalAccion
          fila={modal.fila}
          variante={modal.variante}
          guardando={guardandoAccion}
          onCerrar={() => setModal(null)}
          onConfirmar={confirmarAccion}
        />
      )}
    </div>
  )
}
