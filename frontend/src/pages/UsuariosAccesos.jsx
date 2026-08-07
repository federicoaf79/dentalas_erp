import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// ============================================================
// UsuariosAccesos.jsx — v2, la lista de proveedores reales ahora
// sale de material_yiqi (tabla propia, sincronizada cada 15 min)
// en vez de pegarle a YiQi en vivo. La gestión de usuarios sigue
// igual, vía la Edge Function admin-usuarios (necesita
// service_role para listar Supabase Auth, no cambia).
// ============================================================

const TAMANIO_LOTE = 1000

async function traerMaterialLocal() {
  const primera = await supabase
    .from('material_yiqi')
    .select('*', { count: 'exact' })
    .range(0, TAMANIO_LOTE - 1)

  if (primera.error) throw new Error(primera.error.message)

  const total = primera.count ?? primera.data.length
  let acumulado = [...primera.data]

  if (total > TAMANIO_LOTE) {
    const paginasRestantes = Math.ceil((total - TAMANIO_LOTE) / TAMANIO_LOTE)
    const promesas = []
    for (let i = 1; i <= paginasRestantes; i++) {
      const desde = i * TAMANIO_LOTE
      promesas.push(supabase.from('material_yiqi').select('*').range(desde, desde + TAMANIO_LOTE - 1))
    }
    const resultados = await Promise.all(promesas)
    for (const r of resultados) {
      if (r.error) throw new Error(r.error.message)
      acumulado = acumulado.concat(r.data)
    }
  }

  return acumulado
}

function derivarProveedoresReales(articulos) {
  const porCodigo = new Map()
  for (const art of articulos) {
    if (!art.clie_nombre) continue
    const clave = art.clie_codigo ?? `sin-codigo:${art.clie_nombre}`
    if (!porCodigo.has(clave)) {
      porCodigo.set(clave, { clave, codigo: art.clie_codigo, nombre: art.clie_nombre })
    }
  }
  return Array.from(porCodigo.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
}

async function traerUsuarios() {
  const { data, error } = await supabase.functions.invoke('admin-usuarios?accion=listar')
  if (error) throw new Error(error.message || 'Error llamando a admin-usuarios')
  if (!data?.ok) throw new Error(data?.error || 'Respuesta inválida de admin-usuarios')
  return data.usuarios ?? []
}

async function actualizarAsignacion(userId, proveedorCodigo, proveedorNombre, accion) {
  const { data, error } = await supabase.functions.invoke('admin-usuarios?accion=asignar', {
    body: { userId, proveedorCodigo, proveedorNombre, accion },
  })
  if (error) throw new Error(error.message || 'Error asignando proveedor')
  if (!data?.ok) throw new Error(data?.error || 'No se pudo actualizar la asignación')
  return data
}

function formatoFecha(fechaStr) {
  if (!fechaStr) return '—'
  try {
    return new Date(fechaStr).toLocaleDateString('es-AR')
  } catch {
    return fechaStr
  }
}

function PanelAsignacion({ usuario, proveedores, onCambioOptimista }) {
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(null)

  const codigosAsignados = useMemo(
    () => new Set(usuario.proveedores.map((p) => String(p.codigo))),
    [usuario.proveedores]
  )

  const proveedoresFiltrados = useMemo(() => {
    if (!busqueda) return proveedores
    const texto = busqueda.toLowerCase()
    return proveedores.filter((p) => p.nombre.toLowerCase().includes(texto))
  }, [proveedores, busqueda])

  async function toggleProveedor(prov) {
    const claveGuardado = String(prov.codigo ?? prov.nombre)
    const yaAsignado = codigosAsignados.has(claveGuardado)
    setGuardando(prov.clave)
    try {
      await actualizarAsignacion(usuario.id, claveGuardado, prov.nombre, yaAsignado ? 'quitar' : 'agregar')
      // Actualizamos el estado local al toque, sin volver a pedir la
      // lista completa de usuarios (eso hacia esperar la API de Auth
      // de nuevo en cada click, mucho mas lento).
      onCambioOptimista(usuario.id, { codigo: prov.codigo, nombre: prov.nombre }, yaAsignado ? 'quitar' : 'agregar')
    } catch (err) {
      alert(`Error: ${err.message}`)
    } finally {
      setGuardando(null)
    }
  }

  return (
    <div className="px-4 py-4 bg-gray-50">
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar proveedor…"
          className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm w-64"
        />
        <span className="text-xs text-gray-400">
          {usuario.proveedores.length} proveedor(es) asignado(s)
        </span>
      </div>

      {usuario.proveedores.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {usuario.proveedores.map((p) => (
            <span
              key={p.codigo ?? p.nombre}
              className="inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full"
            >
              {p.nombre}
              <button
                onClick={() => toggleProveedor({ codigo: p.codigo, nombre: p.nombre, clave: p.codigo ?? p.nombre })}
                className="text-indigo-400 hover:text-indigo-700 font-bold leading-none"
                title="Quitar"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-2">
        {proveedoresFiltrados.map((p) => {
          const asignado = codigosAsignados.has(String(p.codigo ?? p.nombre))
          return (
            <label
              key={p.clave}
              className={`flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                asignado ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'
              }`}
            >
              <input
                type="checkbox"
                checked={asignado}
                disabled={guardando === p.clave}
                onChange={() => toggleProveedor(p)}
              />
              <span className="truncate">{p.nombre}</span>
              {guardando === p.clave && <span className="text-xs text-gray-400">…</span>}
            </label>
          )
        })}
      </div>
    </div>
  )
}

export default function UsuariosAccesos() {
  const [usuarios, setUsuarios] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [usuarioExpandido, setUsuarioExpandido] = useState(null)

  async function cargarTodo() {
    setLoading(true)
    setError(null)
    try {
      const [usuariosData, articulos] = await Promise.all([traerUsuarios(), traerMaterialLocal()])
      setUsuarios(usuariosData)
      setProveedores(derivarProveedoresReales(articulos))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarTodo()
  }, [])

  async function refrescarSoloUsuarios() {
    try {
      const usuariosData = await traerUsuarios()
      setUsuarios(usuariosData)
    } catch (err) {
      setError(err.message)
    }
  }

  function actualizarUsuarioLocal(userId, prov, accion) {
    setUsuarios((actuales) =>
      actuales.map((u) => {
        if (u.id !== userId) return u
        if (accion === 'agregar') {
          const yaEsta = u.proveedores.some((p) => String(p.codigo) === String(prov.codigo))
          if (yaEsta) return u
          return { ...u, proveedores: [...u.proveedores, prov] }
        }
        // quitar
        return { ...u, proveedores: u.proveedores.filter((p) => String(p.codigo) !== String(prov.codigo)) }
      })
    )
  }

  function toggleUsuario(id) {
    setUsuarioExpandido((actual) => (actual === id ? null : id))
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Usuarios y accesos</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            {loading
              ? 'Cargando usuarios y proveedores…'
              : `${usuarios.length} usuarios · ${proveedores.length} proveedores disponibles para asignar`}
          </div>
        </div>
        <button
          onClick={cargarTodo}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Actualizando…' : '↻ Actualizar'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudo cargar Usuarios y accesos</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={cargarTodo} className="mt-2 text-sm underline">
            Reintentar
          </button>
        </div>
      )}

      {/* Nota de alcance */}
      <div className="mx-4 mt-4 bg-blue-50 border border-blue-100 text-[#1d4ed8] rounded-lg px-4 py-2.5 text-[12px]">
        Acá se define qué proveedores puede ver cada usuario. Esta asignación todavía no se aplica como filtro
        real en Monitor de Stock, Seguimiento de OC ni Proveedores — es el primer paso antes de activar esa
        restricción.
      </div>

      {/* Lista de usuarios */}
      <div className="mx-4 mt-4 mb-6 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        {loading && usuarios.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">Cargando usuarios…</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                {['Email', 'Creado', 'Último login', 'Proveedores asignados', ''].map((h) => (
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
              {usuarios.map((u) => (
                <Fragment key={u.id}>
                  <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3.5 py-2.5 font-semibold">{u.email}</td>
                    <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{formatoFecha(u.creadoEl)}</td>
                    <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{formatoFecha(u.ultimoLogin)}</td>
                    <td className="px-3.5 py-2.5">
                      {u.proveedores.length === 0 ? (
                        <span className="text-gray-300 text-xs">Ninguno (ve el catálogo completo)</span>
                      ) : (
                        <span className="text-xs text-gray-600">{u.proveedores.length} asignado(s)</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <button
                        onClick={() => toggleUsuario(u.id)}
                        className="text-sm text-[var(--indigo,#4338ca)] hover:underline"
                      >
                        {usuarioExpandido === u.id ? 'Cerrar' : 'Gestionar accesos'}
                      </button>
                    </td>
                  </tr>
                  {usuarioExpandido === u.id && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <PanelAsignacion usuario={u} proveedores={proveedores} onCambioOptimista={actualizarUsuarioLocal} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
