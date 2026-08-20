import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos, filtrarPrecios } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'

// ============================================================
// ComparacionPrecios.jsx — 20/8/2026
//
// A diferencia de Monitor de Stock (que carga el catálogo completo
// para calcular alertas), acá NO se trae precios_proveedor_yiqi
// entera de entrada: son ~6.939 filas y lo único que importa es
// comparar UN artículo concreto entre proveedores. Se busca por SKU
// o nombre y se trae solo lo que matchea (limit 500, agrupado por
// SKU en el cliente).
//
// Fuente: smartie Z.API_Precios_Comp_NO_BORRAR de YiQi (smartieId
// 2367), espejada por sync-yiqi?entidad=precios. A diferencia de
// material/stock (cada 15 min), esta sincroniza UNA VEZ POR DÍA
// (6:15 UTC) -- los precios de lista no cambian con la urgencia del
// stock físico, así que no vale la pena pagar el costo de un sync
// más frecuente.
// ============================================================

const TAMANIO_LIMITE_BUSQUEDA = 500
const MAX_ARTICULOS_MOSTRADOS = 40

function formatoMoneda(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatoFechaHora(fechaStr) {
  if (!fechaStr) return '—'
  try {
    return new Date(fechaStr).toLocaleString('es-AR')
  } catch {
    return fechaStr
  }
}

// PostgREST recibe el .or() como un string plano -- comas y paréntesis
// en el texto de búsqueda romperían el parser (mismo problema que
// usePermisos.js documenta para nombres de proveedor). Como acá el
// usuario escribe libremente, se sanean en vez de encomillar.
function sanearBusqueda(texto) {
  return texto.replace(/[,()%]/g, ' ').trim()
}

async function buscarPrecios(termino, permisos) {
  const limpio = sanearBusqueda(termino)
  if (!limpio) return []

  let query = supabase
    .from('precios_proveedor_yiqi')
    .select('yiqi_id, sku, mate_nombre, proveedor, precio_neto, precio_final, precio_minimo, estado, fecha_alta, sincronizado_en')
    .or(`sku.ilike.%${limpio}%,mate_nombre.ilike.%${limpio}%`)
    .order('sku', { ascending: true })
    .limit(TAMANIO_LIMITE_BUSQUEDA)

  query = filtrarPrecios(query, permisos)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export default function ComparacionPrecios() {
  const permisos = usePermisos()

  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [buscoAlgunaVez, setBuscoAlgunaVez] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (permisos.cargando || permisos.error) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const termino = busqueda.trim()
    if (termino.length < 2) {
      setResultados([])
      setError(null)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      setBuscoAlgunaVez(true)
      try {
        const data = await buscarPrecios(termino, permisos)
        setResultados(data)
      } catch (err) {
        setError(err.message)
        setResultados([])
      } finally {
        setLoading(false)
      }
    }, 350)

    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, permisos.cargando, permisos.error])

  const grupos = useMemo(() => {
    const mapa = new Map()
    for (const fila of resultados) {
      if (!mapa.has(fila.sku)) {
        mapa.set(fila.sku, { sku: fila.sku, nombre: fila.mate_nombre, filas: [] })
      }
      mapa.get(fila.sku).filas.push(fila)
    }
    return [...mapa.values()]
      .map((g) => ({
        ...g,
        filas: [...g.filas].sort((a, b) => {
          const pa = a.precio_final ?? Infinity
          const pb = b.precio_final ?? Infinity
          return pa - pb
        }),
      }))
      .sort((a, b) => a.sku.localeCompare(b.sku))
  }, [resultados])

  const gruposMostrados = grupos.slice(0, MAX_ARTICULOS_MOSTRADOS)
  const hayMasArticulos = grupos.length > MAX_ARTICULOS_MOSTRADOS

  const ultimaSync = useMemo(() => {
    if (resultados.length === 0) return null
    const fechas = resultados
      .map((r) => new Date(r.sincronizado_en).getTime())
      .filter((t) => !isNaN(t))
    if (fechas.length === 0) return null
    return new Date(Math.max(...fechas))
  }, [resultados])

  const cargandoAlgo = loading || permisos.cargando
  const vistaFiltrada = !permisos.cargando && !permisos.error && !permisos.esAdmin

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Comparación de precios</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            {ultimaSync
              ? `Datos sincronizados · última actualización de YiQi: ${formatoFechaHora(ultimaSync)}`
              : 'Buscá un artículo para comparar precios entre proveedores'}
          </div>
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

      {/* Error de busqueda */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudo completar la búsqueda</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Nota de arquitectura (transparencia) */}
      <Aviso tipo="info" id="precios-arquitectura" className="mx-4 mt-4">
        Estos datos vienen de nuestra propia base, sincronizada desde YiQi una vez por día — a diferencia del
        Monitor de Stock (cada 15 min), el precio de lista no cambia con la misma urgencia.
      </Aviso>

      {/* Aviso de vista filtrada (solo operadores) */}
      {vistaFiltrada && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mx-4 mt-2">
          Vista filtrada: estás viendo únicamente precios de los {permisos.nombres.length} proveedores asignados a
          tu usuario. Si falta alguno, pedile a Aris que te lo asigne en “Usuarios y accesos”.
        </Aviso>
      )}

      {/* Buscador */}
      <div className="px-4 pt-2 pb-2">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por SKU o nombre de artículo… (mín. 2 caracteres)"
          disabled={permisos.cargando || !!permisos.error}
          className="w-full max-w-md border border-[var(--border)] rounded-lg px-3 py-2 text-sm disabled:opacity-50"
          autoFocus
        />
      </div>

      {/* Resultados */}
      <div className="px-4 pb-6">
        {!permisos.error && busqueda.trim().length < 2 && !buscoAlgunaVez && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            Escribí un SKU o parte del nombre de un artículo para ver, lado a lado, el precio que cada proveedor
            tiene cargado — y cuál conviene para armar la próxima OC.
          </div>
        )}

        {cargandoAlgo && busqueda.trim().length >= 2 && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            Buscando…
          </div>
        )}

        {!cargandoAlgo && buscoAlgunaVez && busqueda.trim().length >= 2 && grupos.length === 0 && !error && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            No se encontraron artículos que coincidan con “{busqueda.trim()}”
            {vistaFiltrada ? ' entre tus proveedores asignados' : ''}.
          </div>
        )}

        {!cargandoAlgo && gruposMostrados.length > 0 && (
          <div className="space-y-4">
            {gruposMostrados.map((grupo) => {
              const tieneComparacion = grupo.filas.filter((f) => f.precio_final != null).length > 1
              const idPrecioMasBarato =
                grupo.filas.find((f) => f.precio_final != null)?.yiqi_id ?? null

              return (
                <div key={grupo.sku} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                  <div className="px-3.5 py-2.5 border-b border-[var(--border)] bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <span className="font-mono text-xs text-[var(--sub)] mr-2">{grupo.sku}</span>
                      <span className="font-semibold">{grupo.nombre ?? '—'}</span>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {grupo.filas.length} proveedor{grupo.filas.length === 1 ? '' : 'es'} con precio cargado
                    </span>
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        {['Proveedor', 'Precio neto', 'Precio final', 'Precio mínimo', 'Estado', 'Fecha de alta'].map(
                          (h) => (
                            <th
                              key={h}
                              className="text-left px-3.5 py-2 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide"
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.filas.map((f) => {
                        const esElMasBarato = tieneComparacion && f.yiqi_id === idPrecioMasBarato
                        return (
                          <tr
                            key={f.yiqi_id}
                            className={`border-b border-gray-100 last:border-0 ${
                              esElMasBarato ? 'bg-[var(--grn-bg)]' : 'hover:bg-gray-50'
                            }`}
                          >
                            <td className="px-3.5 py-2.5">
                              {f.proveedor}
                              {esElMasBarato && (
                                <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--grn)] text-white">
                                  Más barato
                                </span>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5 text-gray-500">{formatoMoneda(f.precio_neto)}</td>
                            <td className={`px-3.5 py-2.5 font-bold ${esElMasBarato ? 'text-[var(--grn)]' : ''}`}>
                              {formatoMoneda(f.precio_final)}
                            </td>
                            <td className="px-3.5 py-2.5 text-gray-400">{formatoMoneda(f.precio_minimo)}</td>
                            <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{f.estado ?? '—'}</td>
                            <td className="px-3.5 py-2.5 text-gray-400 text-xs">{formatoFechaHora(f.fecha_alta)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}

            {hayMasArticulos && (
              <div className="text-center text-xs text-gray-400 py-2">
                Se encontraron {grupos.length} artículos distintos — mostrando los primeros {MAX_ARTICULOS_MOSTRADOS}.
                Afiná la búsqueda para acotar.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
