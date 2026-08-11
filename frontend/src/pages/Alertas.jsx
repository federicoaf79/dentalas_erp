import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos, filtrarMaterial } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'

// ============================================================
// Alertas.jsx — v4
// v2: leia de la tabla propia material_yiqi (en vez de YiQi en vivo).
// v3: aplica el filtro de proveedores asignados al usuario logueado.
//     Admin (Aris) ve todo; operador (Ivana) ve solo lo suyo.
// v4 (11/8/2026): limpieza de alertas — pedido de Federico porque el
//     Monitor llegó a mostrar >3000 alertas sin ningún filtro, a
//     diferencia de sugerencias_compra() que ya excluye ML/discontinuados/
//     producción propia con es_comprable(). Se suman dos mecanismos,
//     ambos reversibles (mismo patrón que la papelera de OrdenesPropias):
//       - Exclusión PERMANENTE por SKU (articulos_excluidos_alertas):
//         admin-only, con motivo obligatorio. Para lo que ya no se
//         fabrica/compra, cambió de SKU, etc. No borra nada de
//         material_yiqi — solo saca el código del conteo de alertas.
//       - Pausa TEMPORAL de 15 días por SKU (alertas_pausadas): la
//         puede cargar cualquier usuario logueado (acción operativa
//         del día a día — "ya le pregunté al proveedor"). Al vencer
//         (columna reactivar_en, la fija un trigger en la base, no el
//         frontend) el artículo vuelve a contar solo, y aparece en el
//         banner + en la pestaña Pausadas como "aviso activo".
// ============================================================

const COLOR_CLASSES = {
  red: 'bg-[var(--red-bg)] text-[var(--red)]',
  yel: 'bg-[var(--yel-bg)] text-[#92400e]',
}

const TAMANIO_LOTE = 1000

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

// Trae articulos_excluidos_alertas y alertas_pausadas, y resuelve los
// nombres de quién excluyó/pausó cada uno con nombres_usuarios() —
// mismo patrón que la columna "Creada por" de Órdenes de compra:
// usuarios_config tiene RLS por usuario, un join directo no mostraría
// el nombre de nadie más que uno mismo.
async function traerExclusionesYPausas() {
  const [resExcl, resPaus] = await Promise.all([
    supabase.from('articulos_excluidos_alertas').select('*').order('excluido_en', { ascending: false }),
    supabase.from('alertas_pausadas').select('*').order('pausada_en', { ascending: false }),
  ])
  if (resExcl.error) throw new Error(resExcl.error.message)
  if (resPaus.error) throw new Error(resPaus.error.message)

  const idsUsuarios = [
    ...new Set([
      ...(resExcl.data ?? []).map((e) => e.excluido_por).filter(Boolean),
      ...(resPaus.data ?? []).map((p) => p.pausada_por).filter(Boolean),
    ]),
  ]
  let nombresPorId = {}
  if (idsUsuarios.length > 0) {
    const { data: nombresData, error: errNombres } = await supabase.rpc('nombres_usuarios', {
      p_ids: idsUsuarios,
    })
    if (errNombres) {
      // No es critico para el resto de la pantalla: si falla, esas
      // columnas quedan en blanco nomas.
      console.error('[nombres_usuarios]', errNombres)
    } else {
      nombresPorId = Object.fromEntries((nombresData ?? []).map((n) => [n.user_id, n.nombre]))
    }
  }

  const excluidos = (resExcl.data ?? []).map((e) => ({
    ...e,
    excluido_por_nombre: e.excluido_por ? nombresPorId[e.excluido_por] ?? null : null,
  }))
  const pausadas = (resPaus.data ?? []).map((p) => ({
    ...p,
    pausada_por_nombre: p.pausada_por ? nombresPorId[p.pausada_por] ?? null : null,
  }))
  return { excluidos, pausadas }
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

export default function Alertas() {
  const permisos = usePermisos()

  const [articulos, setArticulos] = useState([])
  const [excluidos, setExcluidos] = useState([])
  const [pausadas, setPausadas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 'alertas' = la vista de siempre. 'excluidos' (solo admin) y
  // 'pausadas' son las pestañas nuevas de la limpieza de alertas.
  const [vista, setVista] = useState('alertas')
  const [filtroNivel, setFiltroNivel] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [paginaActual, setPaginaActual] = useState(1)
  const [filasPorPagina, setFilasPorPagina] = useState(50)

  // Modal propio (reemplaza window.prompt/window.confirm), mismo patrón
  // que OrdenesPropias.jsx: { tipo: 'excluir'|'pausar'|'restaurar'|'reactivar', articulo|fila }
  const [modal, setModal] = useState(null)
  const [motivoModal, setMotivoModal] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState(null)

  async function cargarDatos() {
    if (permisos.cargando || permisos.error) return
    setLoading(true)
    setError(null)
    try {
      const [data, extra] = await Promise.all([traerMaterialLocal(permisos), traerExclusionesYPausas()])
      setArticulos(data)
      setExcluidos(extra.excluidos)
      setPausadas(extra.pausadas)
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
  }, [busqueda, filtroNivel, filasPorPagina, vista])

  const ultimaSync = useMemo(() => {
    if (articulos.length === 0) return null
    const fechas = articulos.map((a) => new Date(a.sincronizado_en).getTime()).filter((t) => !isNaN(t))
    if (fechas.length === 0) return null
    return new Date(Math.max(...fechas))
  }, [articulos])

  // Nombre/proveedor por código, para mostrar en las pestañas de
  // Excluidos y Pausadas (esas tablas no traen esos datos, solo el SKU).
  const infoPorCodigo = useMemo(() => {
    const m = {}
    for (const a of articulos) m[a.mate_codigo] = a
    return m
  }, [articulos])

  const codigosExcluidos = useMemo(() => new Set(excluidos.map((e) => e.mate_codigo)), [excluidos])
  const codigosPausadosVigentes = useMemo(
    () => new Set(pausadas.filter((p) => new Date(p.reactivar_en).getTime() > Date.now()).map((p) => p.mate_codigo)),
    [pausadas]
  )
  const pausasVencidas = useMemo(
    () => pausadas.filter((p) => new Date(p.reactivar_en).getTime() <= Date.now()),
    [pausadas]
  )

  const conAlertaTodas = useMemo(() => {
    return articulos
      .map((a) => ({ ...a, _alerta: calcularAlerta(a) }))
      .filter((a) => a._alerta.nivel === 'critica' || a._alerta.nivel === 'preventiva')
      // Excluidos permanentes y pausas VIGENTES no cuentan como alerta.
      // Una pausa vencida vuelve a contar sola, sin acción de nadie.
      .filter((a) => !codigosExcluidos.has(a.mate_codigo) && !codigosPausadosVigentes.has(a.mate_codigo))
  }, [articulos, codigosExcluidos, codigosPausadosVigentes])

  const criticas = useMemo(() => conAlertaTodas.filter((a) => a._alerta.nivel === 'critica').length, [conAlertaTodas])
  const preventivas = useMemo(
    () => conAlertaTodas.filter((a) => a._alerta.nivel === 'preventiva').length,
    [conAlertaTodas]
  )

  const filtradas = useMemo(() => {
    return conAlertaTodas.filter((a) => {
      if (filtroNivel !== 'todas' && a._alerta.nivel !== filtroNivel) return false
      if (busqueda) {
        const texto = busqueda.toLowerCase()
        const coincide =
          a.mate_nombre?.toLowerCase().includes(texto) ||
          a.mate_codigo?.toLowerCase().includes(texto) ||
          a.clie_nombre?.toLowerCase().includes(texto)
        if (!coincide) return false
      }
      return true
    })
  }, [conAlertaTodas, filtroNivel, busqueda])

  const ordenadas = useMemo(() => {
    return [...filtradas].sort((a, b) => {
      if (a._alerta.nivel !== b._alerta.nivel) return a._alerta.nivel === 'critica' ? -1 : 1
      return (a.mate_stock_disponible ?? 0) - (b.mate_stock_disponible ?? 0)
    })
  }, [filtradas])

  const totalFilas = ordenadas.length
  const totalPaginasTabla = Math.max(1, Math.ceil(totalFilas / filasPorPagina))
  const paginaSegura = Math.min(paginaActual, totalPaginasTabla)
  const inicioSlice = (paginaSegura - 1) * filasPorPagina
  const filasPaginadas = ordenadas.slice(inicioSlice, inicioSlice + filasPorPagina)

  const cargandoAlgo = loading || permisos.cargando

  function pedirExcluir(articulo) {
    setModal({ tipo: 'excluir', articulo })
    setMotivoModal('')
  }
  function pedirPausar(articulo) {
    setModal({ tipo: 'pausar', articulo })
    setMotivoModal('')
  }
  function pedirRestaurar(fila) {
    setModal({ tipo: 'restaurar', fila })
  }
  function pedirReactivar(fila) {
    setModal({ tipo: 'reactivar', fila })
  }
  function cerrarModal() {
    if (ocupado) return
    setModal(null)
    setMotivoModal('')
  }

  async function confirmarExcluir() {
    if (!modal) return
    const motivo = motivoModal.trim()
    if (!motivo) return
    setOcupado(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('articulos_excluidos_alertas').insert({
        mate_codigo: modal.articulo.mate_codigo,
        motivo,
        excluido_por: user?.id ?? null,
      })
      if (error) throw new Error(error.message)
      setAviso(`${modal.articulo.mate_codigo} excluido de las alertas.`)
      setModal(null)
      setMotivoModal('')
      await cargarDatos()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarPausar() {
    if (!modal) return
    setOcupado(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      // upsert: si por algun motivo ya habia una pausa vencida sin
      // reactivar para este codigo, pausar de nuevo reinicia los 15
      // dias (mismo comportamiento que pedirle al proveedor de nuevo).
      const { error } = await supabase.from('alertas_pausadas').upsert({
        mate_codigo: modal.articulo.mate_codigo,
        motivo: motivoModal.trim() || null,
        pausada_por: user?.id ?? null,
        pausada_en: new Date().toISOString(),
      })
      if (error) throw new Error(error.message)
      setAviso(`${modal.articulo.mate_codigo} pausado por 15 días.`)
      setModal(null)
      setMotivoModal('')
      await cargarDatos()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarRestaurar() {
    if (!modal) return
    setOcupado(true)
    try {
      const { error } = await supabase
        .from('articulos_excluidos_alertas')
        .delete()
        .eq('mate_codigo', modal.fila.mate_codigo)
      if (error) throw new Error(error.message)
      setAviso(`${modal.fila.mate_codigo} vuelve a contar en las alertas.`)
      setModal(null)
      await cargarDatos()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarReactivar() {
    if (!modal) return
    setOcupado(true)
    try {
      const { error } = await supabase.from('alertas_pausadas').delete().eq('mate_codigo', modal.fila.mate_codigo)
      if (error) throw new Error(error.message)
      setAviso(`${modal.fila.mate_codigo} vuelve a contar en las alertas.`)
      setModal(null)
      await cargarDatos()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Alertas</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            {cargandoAlgo
              ? 'Cargando…'
              : `${criticas} críticas · ${preventivas} preventivas · sincronizado ${formatoFechaHora(ultimaSync)}`}
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
          <p className="font-semibold">No se pudo cargar Alertas</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={cargarDatos} className="mt-2 text-sm underline">
            Reintentar
          </button>
        </div>
      )}

      {/* Confirmación de una acción (excluir/pausar/restaurar/reactivar) */}
      {aviso && (
        <div className="mx-4 mt-4 bg-[var(--grn-bg,#dcfce7)] border border-green-200 text-[var(--grn,#3d9970)] rounded-lg px-4 py-2.5 text-[13px] flex items-center justify-between">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100 px-1">×</button>
        </div>
      )}

      {/* Nota de criterio */}
      <Aviso tipo="info" id="alertas-criterio" className="mx-4 mt-4">
        Criterio de alerta: se respeta el Punto de pedido cuando Dentalab lo cargó manualmente; si no, se usa
        Stock Seguridad como umbral temporal. Datos sincronizados desde YiQi cada 15 minutos. Los artículos
        excluidos o pausados no se cuentan acá.
      </Aviso>

      {/* Aviso de vista filtrada (solo operadores) */}
      {!permisos.cargando && !permisos.error && !permisos.esAdmin && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mx-4 mt-2">
          Vista filtrada: estás viendo únicamente los {permisos.nombres.length} proveedores asignados a tu
          usuario. Si falta alguno, pedile a Aris que te lo asigne en “Usuarios y accesos”.
        </Aviso>
      )}

      {/* Aviso activo: pausas vencidas que necesitan revisión */}
      {vista !== 'pausadas' && pausasVencidas.length > 0 && (
        <Aviso tipo="filtro" className="mx-4 mt-2">
          {pausasVencidas.length === 1
            ? '1 alerta pausada venció'
            : `${pausasVencidas.length} alertas pausadas vencieron`}{' '}
          y ya vuelven a contar — revisá si el proveedor sigue igual.{' '}
          <button onClick={() => setVista('pausadas')} className="underline font-semibold">
            Ver en Pausadas
          </button>
        </Aviso>
      )}

      {/* Pestañas: Alertas / Excluidos (admin) / Pausadas */}
      <div className="px-4 pt-4 flex items-center gap-2">
        {[
          { key: 'alertas', label: `Alertas (${criticas + preventivas})` },
          ...(permisos.esAdmin ? [{ key: 'excluidos', label: `Excluidos (${excluidos.length})` }] : []),
          {
            key: 'pausadas',
            label:
              pausasVencidas.length > 0
                ? `Pausadas (${pausadas.length} · ${pausasVencidas.length} vencida${pausasVencidas.length === 1 ? '' : 's'})`
                : `Pausadas (${pausadas.length})`,
          },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setVista(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              vista === f.key
                ? 'bg-[var(--ind,#4338ca)] text-white border-[var(--ind,#4338ca)]'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {vista === 'alertas' && (
        <>
          {/* Filtros por nivel */}
          <div className="px-4 pt-3 flex items-center gap-2">
            {[
              { key: 'todas', label: `Todas (${criticas + preventivas})` },
              { key: 'critica', label: `Críticas (${criticas})` },
              { key: 'preventiva', label: `Preventivas (${preventivas})` },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltroNivel(f.key)}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  filtroNivel === f.key
                    ? 'bg-[var(--indigo,#4338ca)] text-white border-[var(--indigo,#4338ca)]'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Buscador y filas por página */}
          <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3 flex-wrap">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por SKU, nombre o proveedor…"
              className="flex-1 max-w-sm border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            />
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
          <div className="mx-4 mb-2 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
            {cargandoAlgo && articulos.length === 0 ? (
              <div className="p-8 text-center text-[var(--sub)] text-sm">Cargando artículos en alerta…</div>
            ) : filasPaginadas.length === 0 ? (
              <div className="p-8 text-center text-[var(--sub)] text-sm">
                No hay artículos en alerta que coincidan con los filtros. 🎉
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-[var(--border)]">
                    {['SKU', 'Producto', 'Proveedor', 'Stock', 'Mín.', 'Máx.', 'Stock Seguridad', 'Notas', 'Estado', ''].map(
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
                  {filasPaginadas.map((a) => (
                    <tr key={a.yiqi_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3.5 py-2.5 font-mono text-xs">{a.mate_codigo}</td>
                      <td className="px-3.5 py-2.5 font-semibold">{a.mate_nombre}</td>
                      <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{a.clie_nombre ?? '—'}</td>
                      <td className="px-3.5 py-2.5 font-bold">{a.mate_stock_disponible ?? 0}</td>
                      <td className="px-3.5 py-2.5 text-gray-400">
                        {a.mate_punto_de_pedido > 0 ? a.mate_punto_de_pedido : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-gray-400">
                        {a.mate_punto_pedido_max > 0 ? a.mate_punto_pedido_max : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-gray-400">{a.mate_stock_seguridad ?? '—'}</td>
                      <td
                        className="px-3.5 py-2.5 text-gray-400 text-xs max-w-[180px] truncate"
                        title={a.mate_notas_sobre_punto_de ?? ''}
                      >
                        {a.mate_notas_sobre_punto_de ?? '—'}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${COLOR_CLASSES[a._alerta.color]}`}
                        >
                          {a._alerta.label}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => pedirPausar(a)}
                            title="Pausar esta alerta por 15 días"
                            className="px-2 py-1 rounded text-[11px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50"
                          >
                            ⏸ Pausar
                          </button>
                          {permisos.esAdmin && (
                            <button
                              onClick={() => pedirExcluir(a)}
                              title="Excluir permanentemente de las alertas"
                              className="px-2 py-1 rounded text-[11px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50"
                            >
                              🚫 Excluir
                            </button>
                          )}
                        </div>
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

      {vista === 'excluidos' && permisos.esAdmin && (
        <div className="mx-4 mt-3 mb-6 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          {excluidos.length === 0 ? (
            <div className="p-8 text-center text-[var(--sub)] text-sm">
              No hay artículos excluidos permanentemente de las alertas.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-[var(--border)]">
                  {['SKU', 'Producto', 'Proveedor', 'Motivo', 'Excluido por', 'Excluido el', ''].map((h) => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {excluidos.map((e) => {
                  const info = infoPorCodigo[e.mate_codigo]
                  return (
                    <tr key={e.mate_codigo} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3.5 py-2.5 font-mono text-xs">{e.mate_codigo}</td>
                      <td className="px-3.5 py-2.5 font-semibold">{info?.mate_nombre ?? '—'}</td>
                      <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{info?.clie_nombre ?? '—'}</td>
                      <td className="px-3.5 py-2.5 text-gray-600 text-xs max-w-[240px] truncate" title={e.motivo}>
                        {e.motivo}
                      </td>
                      <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{e.excluido_por_nombre ?? '—'}</td>
                      <td className="px-3.5 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                        {formatoFechaHora(e.excluido_en)}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <button
                          onClick={() => pedirRestaurar(e)}
                          className="px-2 py-1 rounded text-[11px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50"
                        >
                          ♻ Restaurar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {vista === 'pausadas' && (
        <div className="mx-4 mt-3 mb-6 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          {pausadas.length === 0 ? (
            <div className="p-8 text-center text-[var(--sub)] text-sm">No hay alertas pausadas.</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-[var(--border)]">
                  {['SKU', 'Producto', 'Proveedor', 'Motivo', 'Pausada por', 'Pausada el', 'Reactiva el', ''].map((h) => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pausadas.map((p) => {
                  const info = infoPorCodigo[p.mate_codigo]
                  const vencida = new Date(p.reactivar_en).getTime() <= Date.now()
                  return (
                    <tr key={p.mate_codigo} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3.5 py-2.5 font-mono text-xs">{p.mate_codigo}</td>
                      <td className="px-3.5 py-2.5 font-semibold">{info?.mate_nombre ?? '—'}</td>
                      <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{info?.clie_nombre ?? '—'}</td>
                      <td className="px-3.5 py-2.5 text-gray-600 text-xs max-w-[200px] truncate" title={p.motivo ?? ''}>
                        {p.motivo ?? '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{p.pausada_por_nombre ?? '—'}</td>
                      <td className="px-3.5 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                        {formatoFechaHora(p.pausada_en)}
                      </td>
                      <td className="px-3.5 py-2.5 text-xs whitespace-nowrap">
                        {vencida ? (
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--yel-bg)] text-[#92400e]">
                            Vencida — volvió a contar
                          </span>
                        ) : (
                          formatoFechaHora(p.reactivar_en)
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <button
                          onClick={() => pedirReactivar(p)}
                          title="Sacar la pausa ahora (antes de que venza)"
                          className="px-2 py-1 rounded text-[11px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50"
                        >
                          ▶ Reactivar ahora
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: excluir / pausar / restaurar / reactivar — mismo patrón
          visual que OrdenesPropias.jsx (reemplaza window.prompt/confirm) */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={cerrarModal}>
          <div
            className="bg-white rounded-xl border border-[var(--border)] shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {modal.tipo === 'excluir' ? (
              <>
                <div className="text-[15px] font-bold mb-1.5">Excluir permanentemente</div>
                <div className="text-[13px] text-[var(--sub)] mb-3">
                  {modal.articulo.mate_codigo} — {modal.articulo.mate_nombre}
                  <br />
                  No vuelve a contar en las alertas hasta que alguien lo restaure. No borra ni modifica el
                  artículo en Monitor de Stock.
                </div>
                <label className="block text-[11px] uppercase text-gray-400 font-semibold mb-1">
                  Motivo (obligatorio)
                </label>
                <textarea
                  autoFocus
                  value={motivoModal}
                  onChange={(e) => setMotivoModal(e.target.value)}
                  rows={3}
                  disabled={ocupado}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--ind,#4338ca)]/30 focus:border-[var(--ind,#4338ca)] disabled:opacity-60"
                  placeholder="Ej: se dejó de fabricar, ahora se compra otro SKU, lo que hay en stock es saldo…"
                />
                <div className="flex justify-end gap-2">
                  <button
                    disabled={ocupado}
                    onClick={cerrarModal}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={ocupado || !motivoModal.trim()}
                    onClick={confirmarExcluir}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--red)] text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {ocupado ? 'Guardando…' : 'Excluir'}
                  </button>
                </div>
              </>
            ) : modal.tipo === 'pausar' ? (
              <>
                <div className="text-[15px] font-bold mb-1.5">Pausar alerta por 15 días</div>
                <div className="text-[13px] text-[var(--sub)] mb-3">
                  {modal.articulo.mate_codigo} — {modal.articulo.mate_nombre}
                  <br />
                  Deja de contar en las alertas por 15 días. Al vencer, vuelve a contar solo y avisa en el
                  sidebar para que se revise si el proveedor ya tiene stock.
                </div>
                <label className="block text-[11px] uppercase text-gray-400 font-semibold mb-1">
                  Motivo (opcional)
                </label>
                <textarea
                  autoFocus
                  value={motivoModal}
                  onChange={(e) => setMotivoModal(e.target.value)}
                  rows={3}
                  disabled={ocupado}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--ind,#4338ca)]/30 focus:border-[var(--ind,#4338ca)] disabled:opacity-60"
                  placeholder="Ej: ya le pregunté al proveedor, dice que repone en dos semanas…"
                />
                <div className="flex justify-end gap-2">
                  <button
                    disabled={ocupado}
                    onClick={cerrarModal}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={ocupado}
                    onClick={confirmarPausar}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--ind,#4338ca)] text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {ocupado ? 'Guardando…' : 'Pausar 15 días'}
                  </button>
                </div>
              </>
            ) : modal.tipo === 'restaurar' ? (
              <>
                <div className="text-[15px] font-bold mb-1.5">Restaurar en alertas</div>
                <div className="text-[13px] text-[var(--sub)] mb-4">
                  ¿Volver a contar {modal.fila.mate_codigo} en las alertas? Se saca de la lista de excluidos.
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    disabled={ocupado}
                    onClick={cerrarModal}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={ocupado}
                    onClick={confirmarRestaurar}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--ind,#4338ca)] text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {ocupado ? 'Guardando…' : 'Restaurar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-bold mb-1.5">Reactivar ahora</div>
                <div className="text-[13px] text-[var(--sub)] mb-4">
                  ¿Sacar la pausa de {modal.fila.mate_codigo} ahora? Vuelve a contar en las alertas de
                  inmediato, sin esperar a que venzan los 15 días.
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    disabled={ocupado}
                    onClick={cerrarModal}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={ocupado}
                    onClick={confirmarReactivar}
                    className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--ind,#4338ca)] text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {ocupado ? 'Guardando…' : 'Reactivar ahora'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
