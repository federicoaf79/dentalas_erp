import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos, filtrarMaterial } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'

// ============================================================
// Proveedores.jsx — v3
// v2: leia de material_yiqi y clientes_yiqi (tablas propias) en vez
//     de pegarle a YiQi en vivo.
// v3: aplica el filtro de proveedores asignados al usuario logueado.
//     Admin (Aris) ve todo; operador (Ivana) ve solo lo suyo.
//
// NOTA: solo se filtra material_yiqi. clientes_yiqi se trae entera
// porque es la fuente de datos de contacto (CUIT, telefono, IVA) y el
// cruce se hace contra proveedores YA filtrados — no puede colarse
// ninguno de mas por ese lado.
// ============================================================

const TAMANIO_LOTE = 1000

// ------------------------------------------------------------
// Trae TODAS las filas de una tabla propia, en paralelo por lotes.
// `aplicarFiltro` permite inyectar el filtro de permisos (o dejarlo
// pasar tal cual para las tablas que no se filtran).
// IMPORTANTE: el filtro va tanto en la consulta inicial (la del count
// exacto) como en las paginas restantes.
// ------------------------------------------------------------
async function traerTablaCompleta(nombreTabla, aplicarFiltro = (q) => q) {
  const primera = await aplicarFiltro(
    supabase.from(nombreTabla).select('*', { count: 'exact' }).range(0, TAMANIO_LOTE - 1)
  )

  if (primera.error) throw new Error(primera.error.message)

  const total = primera.count ?? primera.data.length
  let acumulado = [...primera.data]

  if (total > TAMANIO_LOTE) {
    const paginasRestantes = Math.ceil((total - TAMANIO_LOTE) / TAMANIO_LOTE)
    const promesas = []
    for (let i = 1; i <= paginasRestantes; i++) {
      const desde = i * TAMANIO_LOTE
      promesas.push(
        aplicarFiltro(
          supabase.from(nombreTabla).select('*').range(desde, desde + TAMANIO_LOTE - 1)
        )
      )
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
// Deriva proveedores reales desde material_yiqi (los que tienen
// articulos activos hoy) con conteos de artículos y alertas.
// ------------------------------------------------------------
function derivarProveedoresDeMaterial(articulos) {
  const porCodigo = new Map()

  for (const art of articulos) {
    if (!art.clie_nombre) continue

    const clave = art.clie_codigo ?? `sin-codigo:${art.clie_nombre}`
    if (!porCodigo.has(clave)) {
      porCodigo.set(clave, {
        clave,
        codigo: art.clie_codigo,
        nombre: art.clie_nombre,
        totalArticulos: 0,
        criticas: 0,
        preventivas: 0,
      })
    }
    const prov = porCodigo.get(clave)
    prov.totalArticulos += 1

    const stock = art.mate_stock_disponible ?? 0
    const puntoPedidoManual = art.mate_punto_de_pedido
    const stockSeguridad = art.mate_stock_seguridad
    const hayPuntoPedidoManual = puntoPedidoManual != null && puntoPedidoManual > 0
    const umbral = hayPuntoPedidoManual ? puntoPedidoManual : stockSeguridad

    if (umbral != null) {
      if (stock <= 0) prov.criticas += 1
      else if (stock <= umbral) prov.preventivas += 1
    }
  }

  return Array.from(porCodigo.values())
}

function enriquecerConDatosDeContacto(proveedores, filasCliente) {
  const porCodigo = new Map()
  for (const c of filasCliente) {
    if (c.clie_codigo != null) porCodigo.set(c.clie_codigo, c)
  }

  return proveedores.map((p) => {
    const contacto = p.codigo != null ? porCodigo.get(p.codigo) : null
    return {
      ...p,
      cuit: contacto?.clie_cuit ?? null,
      mail: contacto?.mail ?? null,
      telefono: contacto?.telefono ?? null,
      condicionIva: contacto?.condicion_iva ?? null,
    }
  })
}

function calcularAlertaArticulo(art) {
  const stock = art.mate_stock_disponible ?? 0
  const puntoPedidoManual = art.mate_punto_de_pedido
  const stockSeguridad = art.mate_stock_seguridad
  const hayPuntoPedidoManual = puntoPedidoManual != null && puntoPedidoManual > 0
  const umbral = hayPuntoPedidoManual ? puntoPedidoManual : stockSeguridad

  if (umbral == null) return { nivel: 'sin-config', label: '—', color: 'gray' }
  if (stock <= 0) return { nivel: 'critica', label: 'Crítica', color: 'red' }
  if (stock <= umbral) return { nivel: 'preventiva', label: 'Preventiva', color: 'yel' }
  return { nivel: 'ok', label: 'OK', color: 'grn' }
}

const COLOR_CLASSES = {
  red: 'bg-[var(--red-bg)] text-[var(--red)]',
  yel: 'bg-[var(--yel-bg)] text-[#92400e]',
  grn: 'bg-[var(--grn-bg)] text-[var(--grn)]',
  gray: 'bg-gray-100 text-gray-500',
}

function DetalleProveedor({ articulosDelProveedor }) {
  return (
    <div className="px-4 py-3 bg-gray-50">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-gray-400 text-[11px] uppercase">
            <th className="py-1.5 px-2">SKU</th>
            <th className="py-1.5 px-2">Artículo</th>
            <th className="py-1.5 px-2">Stock</th>
            <th className="py-1.5 px-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          {articulosDelProveedor.map((a) => {
            const alerta = calcularAlertaArticulo(a)
            return (
              <tr key={a.yiqi_id} className="border-t border-gray-100">
                <td className="py-1.5 px-2 font-mono text-xs">{a.mate_codigo}</td>
                <td className="py-1.5 px-2 font-medium">{a.mate_nombre}</td>
                <td className="py-1.5 px-2 font-semibold">{a.mate_stock_disponible ?? 0}</td>
                <td className="py-1.5 px-2">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${COLOR_CLASSES[alerta.color]}`}
                  >
                    {alerta.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Proveedores() {
  const permisos = usePermisos()

  const [proveedores, setProveedores] = useState([])
  const [articulos, setArticulos] = useState([])
  const [proveedorExpandido, setProveedorExpandido] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [paginaActual, setPaginaActual] = useState(1)
  const [filasPorPagina, setFilasPorPagina] = useState(50)

  async function cargarDatos() {
    if (permisos.cargando || permisos.error) return
    setLoading(true)
    setError(null)
    try {
      const [articulosTraidos, filasCliente] = await Promise.all([
        traerTablaCompleta('material_yiqi', (q) => filtrarMaterial(q, permisos)),
        traerTablaCompleta('clientes_yiqi'),
      ])

      const provDerivados = derivarProveedoresDeMaterial(articulosTraidos)
      setArticulos(articulosTraidos)

      const provCompletos = enriquecerConDatosDeContacto(provDerivados, filasCliente)
      provCompletos.sort((a, b) => b.totalArticulos - a.totalArticulos)

      setProveedores(provCompletos)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Clave derivada: evita recargar todo ante un simple refresh de token.
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
    setProveedorExpandido(null)
  }, [busqueda, filasPorPagina])

  const proveedoresFiltrados = useMemo(() => {
    if (!busqueda) return proveedores
    const texto = busqueda.toLowerCase()
    return proveedores.filter(
      (p) =>
        p.nombre?.toLowerCase().includes(texto) ||
        String(p.codigo ?? '').includes(texto) ||
        p.cuit?.toLowerCase?.().includes(texto)
    )
  }, [proveedores, busqueda])

  const totalFilas = proveedoresFiltrados.length
  const totalPaginasTabla = Math.max(1, Math.ceil(totalFilas / filasPorPagina))
  const paginaSegura = Math.min(paginaActual, totalPaginasTabla)
  const inicioSlice = (paginaSegura - 1) * filasPorPagina
  const filasPaginadas = proveedoresFiltrados.slice(inicioSlice, inicioSlice + filasPorPagina)

  const articulosDelExpandido = useMemo(() => {
    if (!proveedorExpandido) return []
    const prov = proveedores.find((p) => p.clave === proveedorExpandido)
    if (!prov) return []
    return articulos.filter((a) =>
      prov.codigo != null ? a.clie_codigo === prov.codigo : a.clie_nombre === prov.nombre
    )
  }, [proveedorExpandido, proveedores, articulos])

  function toggleProveedor(clave) {
    setProveedorExpandido((actual) => (actual === clave ? null : clave))
  }

  const cargandoAlgo = loading || permisos.cargando
  const vistaFiltrada = !permisos.cargando && !permisos.error && !permisos.esAdmin

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Proveedores</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            {cargandoAlgo
              ? 'Cargando…'
              : vistaFiltrada
              ? `${proveedores.length} de tus proveedores asignados · con artículos en el catálogo`
              : `${proveedores.length} proveedores reales · derivados de artículos activos`}
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
          <p className="font-semibold">No se pudo cargar Proveedores</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={cargarDatos} className="mt-2 text-sm underline">
            Reintentar
          </button>
        </div>
      )}

      {/* Nota de metodologia */}
      <Aviso tipo="info" id="proveedores-metodologia" className="mx-4 mt-4">
        Esta lista se arma a partir de los proveedores que tienen artículos reales hoy (no del flag "Activo" de
        YiQi, que no distingue bajas reales). Datos sincronizados desde YiQi cada 15 minutos.
      </Aviso>

      {/* Aviso de vista filtrada (solo operadores) */}
      {vistaFiltrada && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mx-4 mt-2">
          Vista filtrada: tenés {permisos.nombres.length} proveedores asignados. Acá aparecen únicamente los
          que además tienen artículos cargados en el catálogo, así que la cantidad de filas puede ser menor.
          Para cambiar tus asignaciones, pedile a Aris que las edite en “Usuarios y accesos”.
        </Aviso>
      )}

      {/* Buscador */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3 flex-wrap">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, código o CUIT…"
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

      <div className="px-4 pb-2 text-[11px] text-gray-400">
        💡 Click en un proveedor para ver sus artículos y el detalle de stock.
      </div>

      {/* Tabla */}
      <div className="mx-4 mb-2 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        {cargandoAlgo && proveedores.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">Cargando proveedores reales…</div>
        ) : filasPaginadas.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">
            No hay proveedores que coincidan con la búsqueda.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                {['Código', 'Proveedor', 'CUIT', 'Condición IVA', 'Teléfono', 'Artículos', 'Alertas'].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3.5 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasPaginadas.map((p) => (
                <Fragment key={p.clave}>
                  <tr
                    onClick={() => toggleProveedor(p.clave)}
                    className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer ${
                      proveedorExpandido === p.clave ? 'bg-indigo-50/50' : ''
                    }`}
                  >
                    <td className="px-3.5 py-2.5 font-mono text-xs">{p.codigo ?? '—'}</td>
                    <td className="px-3.5 py-2.5 font-semibold">{p.nombre}</td>
                    <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{p.cuit ?? '—'}</td>
                    <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{p.condicionIva ?? '—'}</td>
                    <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{p.telefono ?? '—'}</td>
                    <td className="px-3.5 py-2.5 font-bold">{p.totalArticulos}</td>
                    <td className="px-3.5 py-2.5">
                      {p.criticas === 0 && p.preventivas === 0 ? (
                        <span className="text-gray-300 text-xs">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
                          {p.criticas > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-[var(--red-bg)] text-[var(--red)]">
                              {p.criticas} crít.
                            </span>
                          )}
                          {p.preventivas > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-[var(--yel-bg)] text-[#92400e]">
                              {p.preventivas} prev.
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                  {proveedorExpandido === p.clave && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <DetalleProveedor articulosDelProveedor={articulosDelExpandido} />
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
      {proveedoresFiltrados.length > 0 && (
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
