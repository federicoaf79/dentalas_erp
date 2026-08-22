import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos, filtrarMaterial } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'
import DeclararCausaModal from '../components/DeclararCausaModal'
import { ultimasCausasPorReferencia } from '../lib/causas'

// ============================================================
// Alertas.jsx — v3
// v2: leia de la tabla propia material_yiqi (en vez de YiQi en vivo).
// v3: aplica el filtro de proveedores asignados al usuario logueado.
//     Admin (Aris) ve todo; operador (Ivana) ve solo lo suyo.
//     Mismo criterio de alerta y mismas columnas que v2.
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

// ============================================================
// 21/8/2026 — reglas de exclusión de Aris (ver migration
// 20260821140000_exclusiones_aris.sql). Alertas nunca había aplicado
// NINGÚN filtro (a diferencia de sugerencias_compra(), que ya excluía
// ML/discontinuados/producción propia hace rato) -- los SKU
// administrativos, publicaciones de ML, discontinuados y producción
// propia podían estar generando alertas sin sentido. Espejo en JS de
// es_comprable()+es_administrativo() (funciones SQL) porque esta
// pantalla calcula todo client-side sobre material_yiqi crudo.
// A propósito NO excluye "PARA FRACCIONAR": esos artículos sí pueden
// necesitar compra externa como materia prima (ver comentario de
// es_para_fraccionar() en la migration) -- esa regla es solo para
// "no enviar al local", no para "no comprar".
// ============================================================
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

export default function Alertas() {
  const permisos = usePermisos()

  const [articulos, setArticulos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [filtroNivel, setFiltroNivel] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [paginaActual, setPaginaActual] = useState(1)
  const [filasPorPagina, setFilasPorPagina] = useState(50)

  // Ítem 7 (22/8/2026) — causa vigente declarada por SKU. Se carga solo
  // para la página visible (no las ~2400 en alerta enteras) para no
  // mandar un IN() gigante; se re-carga cada vez que cambia la página o
  // el filtro. Ver frontend/src/lib/causas.js.
  const [causasPorSku, setCausasPorSku] = useState({})
  const [modalCausa, setModalCausa] = useState(null) // { referenciaId, referenciaTexto } | null

  async function cargarDatos() {
    if (permisos.cargando || permisos.error) return
    setLoading(true)
    setError(null)
    try {
      const data = await traerMaterialLocal(permisos)
      setArticulos(data)
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
  }, [busqueda, filtroNivel, filasPorPagina])

  const ultimaSync = useMemo(() => {
    if (articulos.length === 0) return null
    const fechas = articulos.map((a) => new Date(a.sincronizado_en).getTime()).filter((t) => !isNaN(t))
    if (fechas.length === 0) return null
    return new Date(Math.max(...fechas))
  }, [articulos])

  const conAlertaTodas = useMemo(() => {
    return articulos
      .filter((a) => !esExcluidoDeAlertas(a))
      .map((a) => ({ ...a, _alerta: calcularAlerta(a) }))
      .filter((a) => a._alerta.nivel === 'critica' || a._alerta.nivel === 'preventiva')
  }, [articulos])

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

  // Clave de dependencia por VALOR (no por referencia de array, que
  // cambia en cada render) — evita recargar en un loop innecesario.
  const claveIdsCausas = filasPaginadas.map((a) => a.mate_codigo).join('|')
  useEffect(() => {
    const ids = claveIdsCausas ? claveIdsCausas.split('|') : []
    if (ids.length === 0) return
    let cancelado = false
    ultimasCausasPorReferencia('stock', ids).then((res) => {
      if (!cancelado) setCausasPorSku((prev) => ({ ...prev, ...res }))
    })
    return () => { cancelado = true }
  }, [claveIdsCausas])

  const cargandoAlgo = loading || permisos.cargando

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

      {/* Nota de criterio */}
      <Aviso tipo="info" id="alertas-criterio" className="mx-4 mt-4">
        Criterio de alerta: se respeta el Punto de pedido cuando Dentalab lo cargó manualmente; si no, se usa
        Stock Seguridad como umbral temporal. Datos sincronizados desde YiQi cada 15 minutos. No se muestran
        alertas de SKU administrativos, publicaciones de Mercado Libre, artículos discontinuados ni producción
        propia.
      </Aviso>

      {/* Aviso de vista filtrada (solo operadores) */}
      {!permisos.cargando && !permisos.error && !permisos.esAdmin && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mx-4 mt-2">
          Vista filtrada: estás viendo únicamente los {permisos.nombres.length} proveedores asignados a tu
          usuario. Si falta alguno, pedile a Aris que te lo asigne en “Usuarios y accesos”.
        </Aviso>
      )}

      {/* Filtros por nivel */}
      <div className="px-4 pt-4 flex items-center gap-2">
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
                {['SKU', 'Producto', 'Proveedor', 'Stock', 'Mín.', 'Máx.', 'Stock Seguridad', 'Notas', 'Estado', 'Causa'].map(
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
                  <td className="px-3.5 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={causasPorSku[a.mate_codigo] ? 'text-gray-600 text-xs' : 'text-gray-300 text-xs'}
                        title={causasPorSku[a.mate_codigo]?.nota ?? ''}
                      >
                        {causasPorSku[a.mate_codigo]?.causa_rotulo ?? '—'}
                      </span>
                      <button
                        onClick={() =>
                          setModalCausa({
                            referenciaId: a.mate_codigo,
                            referenciaTexto: `${a.mate_codigo} — ${a.mate_nombre}`,
                          })
                        }
                        className="text-[11px] text-[var(--indigo,#4338ca)] hover:underline text-left"
                      >
                        {causasPorSku[a.mate_codigo] ? 'Ver / declarar' : 'Declarar causa'}
                      </button>
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

      {modalCausa && (
        <DeclararCausaModal
          ambito="stock"
          referenciaId={modalCausa.referenciaId}
          referenciaTexto={modalCausa.referenciaTexto}
          onCerrar={() => setModalCausa(null)}
          onGuardado={() => {
            // Refresca solo la causa de este SKU, sin recargar toda la
            // pantalla (que dispararía una relectura de ~7000 artículos).
            ultimasCausasPorReferencia('stock', [modalCausa.referenciaId]).then((res) => {
              setCausasPorSku((prev) => ({ ...prev, ...res }))
            })
          }}
        />
      )}
    </div>
  )
}
