import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos, filtrarPrecios } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'

// ============================================================
// ComparacionPrecios.jsx — 20/8/2026 (v2, corrige un supuesto falso de v1)
//
// ERROR DE v1: agrupaba filas por `sku` asumiendo que el mismo SKU podía
// aparecer repetido entre proveedores (como en material_yiqi). Federico
// corrigió esto en vivo: cada SKU en YiQi es propio de UN artículo/
// proveedor — no hay SKU compartido. Comparar "lo mismo" entre
// proveedores significa comparar POR NOMBRE Y DESCRIPCIÓN, no por SKU,
// y encima el mismo producto puede venderse en presentaciones distintas
// (ej. un proveedor a $10 la unidad suelta, otro a $7 pero en caja de
// 500) — dos SKU totalmente distintos en YiQi.
//
// DISEÑO v2 (decisión de Federico, 20/8/2026: "solo candidatos por
// nombre" — sin intentar parsear cantidades del texto libre, que es
// poco confiable): para el artículo que se busca, se listan los
// artículos de OTROS proveedores cuyo NOMBRE es textualmente parecido
// (similitud de trigramas, mismo principio que pg_trgm de Postgres,
// calculada acá en el cliente para no tener que agregar la extensión
// en Supabase todavía). Son CANDIDATOS a revisar, no una igualdad
// confirmada — nunca se declara "más barato" sobre un candidato: eso
// implicaría que el sistema ya confirmó que es el mismo producto en la
// misma presentación, y no lo confirmó. La persona compara a ojo.
//
// v3 (mismo día, misma conversación): Federico pidió agregar una
// revisión humana en tandas de a 30 (ver RevisarEquivalencias.jsx) —
// las confirmaciones/rechazos quedan en equivalencias_precios
// (migración 20260820150000). Acá se leen esas confirmaciones y se
// muestran en una sección aparte, "Equivalencias confirmadas": ahí SÍ
// corresponde resaltar "más barato", porque ya hay una persona que
// confirmó que es el mismo producto (misma unidad de medida base,
// aunque cambie la presentación comercial). Los candidatos por
// similitud que YA fueron decididos (confirmados o rechazados) se
// sacan de "posibles equivalentes" — ya tienen respuesta, no hace
// falta seguir mostrándolos como duda.
//
// Carga TODO precios_proveedor_yiqi una vez (paginado, mismo patrón que
// traerMaterialLocal en MonitorStock.jsx) porque la comparación por
// similitud necesita barrer el catálogo completo, no solo lo que
// matchea el término de búsqueda.
// ============================================================

const TAMANIO_LOTE = 1000 // limite por request de Supabase/PostgREST
const MAX_ARTICULOS_MOSTRADOS = 25
const MAX_EQUIVALENTES_POR_ARTICULO = 5
const UMBRAL_SIMILITUD = 0.28 // Jaccard sobre trigramas — ver normalizar()/trigramas() abajo

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

// ------------------------------------------------------------
// Similitud de texto por trigramas (mismo principio que la extensión
// pg_trgm de Postgres, calculado acá porque todavía no la agregamos a
// la base). Saca acentos/mayúsculas/puntuación antes de comparar, para
// que "Cápsulas" y "capsulas" no cuenten como distintos.
// ------------------------------------------------------------
function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    // saca acentos: tras NFD, cada tilde queda como marca combinante
    // separada (U+0300-U+036F) -- se usa el escape unicode explicito,
    // no el caracter literal, para que el archivo sea robusto ante
    // cualquier problema de encoding en el camino (git, editor, etc).
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function trigramas(textoNormalizado) {
  const t = `  ${textoNormalizado} `
  const set = new Set()
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3))
  return set
}

function similitudEntreSets(a, b) {
  if (!a || !b || a.size === 0 || b.size === 0) return 0
  let interseccion = 0
  for (const tri of a) if (b.has(tri)) interseccion++
  const union = a.size + b.size - interseccion
  return union === 0 ? 0 : interseccion / union
}

// IMPORTANTE: el filtro se aplica tanto a la consulta inicial (la que
// trae el count exacto) como a las paginas restantes. Mismo patrón que
// traerMaterialLocal en MonitorStock.jsx.
async function traerPreciosLocal(permisos) {
  const columnas = 'yiqi_id, sku, mate_nombre, proveedor, precio_neto, precio_final, precio_minimo, estado, fecha_alta, sincronizado_en'

  let consultaInicial = supabase
    .from('precios_proveedor_yiqi')
    .select(columnas, { count: 'exact' })
    .range(0, TAMANIO_LOTE - 1)
  consultaInicial = filtrarPrecios(consultaInicial, permisos)

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
        .from('precios_proveedor_yiqi')
        .select(columnas)
        .range(desde, desde + TAMANIO_LOTE - 1)
      consultaPagina = filtrarPrecios(consultaPagina, permisos)
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

export default function ComparacionPrecios({ onIrARevisar }) {
  const permisos = usePermisos()

  const [precios, setPrecios] = useState([])
  const [equivalencias, setEquivalencias] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [terminoDebounced, setTerminoDebounced] = useState('')

  async function cargarDatos() {
    if (permisos.cargando || permisos.error) return
    setLoading(true)
    setError(null)
    try {
      // equivalencias_precios es de lectura abierta a cualquier usuario
      // logueado (solo guarda yiqi_id + estado, sin datos de negocio),
      // así que no hace falta filtrarla por permisos como a precios.
      const [datosPrecios, resultadoEquiv] = await Promise.all([
        traerPreciosLocal(permisos),
        supabase.from('equivalencias_precios').select('yiqi_id_menor, yiqi_id_mayor, estado, similitud_texto'),
      ])
      if (resultadoEquiv.error) throw new Error(resultadoEquiv.error.message)
      setPrecios(datosPrecios)
      setEquivalencias(resultadoEquiv.data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Misma técnica que MonitorStock: clave derivada de los permisos
  // reales, para no recargar los ~6.939 precios en cada refresh de
  // token de Supabase.
  const claveFiltro =
    permisos.cargando || permisos.error
      ? null
      : `${permisos.esAdmin}|${permisos.codigos.join(',')}|${permisos.nombres.join(',')}`

  useEffect(() => {
    if (claveFiltro === null) return
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltro])

  // Debounce solo para no recalcular similitud en cada tecla — el
  // cálculo es local (sin red), pero barre miles de filas.
  useEffect(() => {
    const t = setTimeout(() => setTerminoDebounced(busqueda.trim()), 300)
    return () => clearTimeout(t)
  }, [busqueda])

  // Preprocesamiento: una sola vez por carga de datos, no por búsqueda.
  const filasProcesadas = useMemo(() => {
    return precios.map((f) => {
      const nombreNorm = normalizar(f.mate_nombre)
      return {
        ...f,
        _skuNorm: normalizar(f.sku),
        _nombreNorm: nombreNorm,
        _tri: trigramas(nombreNorm),
      }
    })
  }, [precios])

  const ultimaSync = useMemo(() => {
    if (precios.length === 0) return null
    const fechas = precios.map((r) => new Date(r.sincronizado_en).getTime()).filter((t) => !isNaN(t))
    if (fechas.length === 0) return null
    return new Date(Math.max(...fechas))
  }, [precios])

  // Estructuras derivadas de equivalencias_precios (confirmaciones
  // humanas, ver RevisarEquivalencias.jsx):
  //   - filaPorId: para resolver un yiqi_id confirmado a su fila real.
  //   - confirmadosPorId: adjacencia bidireccional (A confirma con B,
  //     entonces B también confirma con A).
  //   - decididosSet: pares YA resueltos (confirmados o rechazados),
  //     para sacarlos de "posibles equivalentes" sin decidir.
  const { filaPorId, confirmadosPorId, decididosSet } = useMemo(() => {
    const porId = new Map(filasProcesadas.map((f) => [f.yiqi_id, f]))
    const confirmados = new Map()
    const decididos = new Set()
    for (const eq of equivalencias) {
      decididos.add(`${eq.yiqi_id_menor}-${eq.yiqi_id_mayor}`)
      if (eq.estado !== 'confirmado') continue
      if (!confirmados.has(eq.yiqi_id_menor)) confirmados.set(eq.yiqi_id_menor, [])
      if (!confirmados.has(eq.yiqi_id_mayor)) confirmados.set(eq.yiqi_id_mayor, [])
      confirmados.get(eq.yiqi_id_menor).push(eq.yiqi_id_mayor)
      confirmados.get(eq.yiqi_id_mayor).push(eq.yiqi_id_menor)
    }
    return { filaPorId: porId, confirmadosPorId: confirmados, decididosSet: decididos }
  }, [filasProcesadas, equivalencias])

  function parDecidido(idA, idB) {
    const menor = Math.min(idA, idB)
    const mayor = Math.max(idA, idB)
    return decididosSet.has(`${menor}-${mayor}`)
  }

  // Resultado principal: para cada match directo del término buscado,
  // arma (a) sus equivalencias YA CONFIRMADAS por una persona y (b) sus
  // candidatos "posibles equivalentes" sin decidir todavía. Todo en
  // memoria, sin ir a la red (salvo la carga inicial).
  const { directos, totalDirectos } = useMemo(() => {
    if (terminoDebounced.length < 2 || filasProcesadas.length === 0) {
      return { directos: [], totalDirectos: 0 }
    }
    const terminoNorm = normalizar(terminoDebounced)

    const matches = filasProcesadas.filter(
      (f) => f._skuNorm.includes(terminoNorm) || f._nombreNorm.includes(terminoNorm)
    )
    matches.sort((a, b) => (a.mate_nombre ?? '').localeCompare(b.mate_nombre ?? ''))

    const mostrados = matches.slice(0, MAX_ARTICULOS_MOSTRADOS)

    const conEquivalentes = mostrados.map((anchor) => {
      const confirmados = (confirmadosPorId.get(anchor.yiqi_id) ?? [])
        .map((id) => filaPorId.get(id))
        .filter(Boolean)
        .sort((a, b) => (a.precio_final ?? Infinity) - (b.precio_final ?? Infinity))

      const candidatos = []
      for (const otro of filasProcesadas) {
        if (otro.yiqi_id === anchor.yiqi_id) continue
        if (otro.proveedor === anchor.proveedor) continue // comparar entre proveedores, no dentro del mismo
        if (parDecidido(anchor.yiqi_id, otro.yiqi_id)) continue // ya confirmado o rechazado: no es "sin decidir"
        const score = similitudEntreSets(anchor._tri, otro._tri)
        if (score >= UMBRAL_SIMILITUD) candidatos.push({ ...otro, _score: score })
      }
      candidatos.sort((a, b) => b._score - a._score)
      return {
        anchor,
        confirmados,
        equivalentes: candidatos.slice(0, MAX_EQUIVALENTES_POR_ARTICULO),
      }
    })

    return { directos: conEquivalentes, totalDirectos: matches.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminoDebounced, filasProcesadas, confirmadosPorId, filaPorId, decididosSet])

  const cargandoAlgo = loading || permisos.cargando
  const vistaFiltrada = !permisos.cargando && !permisos.error && !permisos.esAdmin
  const buscoAlgunaVez = terminoDebounced.length >= 2
  const hayMasArticulos = totalDirectos > MAX_ARTICULOS_MOSTRADOS

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Comparación de precios</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            {cargandoAlgo
              ? 'Cargando…'
              : `Datos sincronizados · última actualización de YiQi: ${formatoFechaHora(ultimaSync)}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onIrARevisar && (
            <button
              onClick={onIrARevisar}
              className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--ind,#4338ca)] hover:opacity-90"
            >
              🔗 Revisar equivalencias
            </button>
          )}
          <button
            onClick={cargarDatos}
            disabled={cargandoAlgo}
            className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {cargandoAlgo ? 'Actualizando…' : '↻ Actualizar'}
          </button>
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
          <p className="font-semibold">No se pudo cargar Comparación de precios</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={cargarDatos} className="mt-2 text-sm underline">
            Reintentar
          </button>
        </div>
      )}

      {/* Nota de arquitectura (transparencia) */}
      <Aviso tipo="info" id="precios-arquitectura" className="mx-4 mt-4">
        Estos datos vienen de nuestra propia base, sincronizada desde YiQi una vez por día — a diferencia del
        Monitor de Stock (cada 15 min), el precio de lista no cambia con la misma urgencia.
      </Aviso>

      {/* Nota de metodología (crítica: evita que se lea como una igualdad confirmada) */}
      <Aviso tipo="info" id="precios-metodologia-equivalentes" className="mx-4 mt-2">
        En YiQi cada SKU es propio de un proveedor — no hay SKU compartido entre proveedores. Las{' '}
        <strong>equivalencias confirmadas</strong> (✓ verde) ya fueron revisadas por una persona en{' '}
        {onIrARevisar ? '"Revisar equivalencias"' : 'la pantalla de revisión'} — ahí sí tiene sentido comparar por
        precio. Los <strong>posibles equivalentes sin confirmar</strong> son solo candidatos por parecido de
        nombre: pueden ser el mismo producto en otra presentación (suelto vs. caja) o pueden no tener nada que ver
        — todavía nadie los revisó.
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
          disabled={cargandoAlgo || !!permisos.error || !!error}
          className="w-full max-w-md border border-[var(--border)] rounded-lg px-3 py-2 text-sm disabled:opacity-50"
          autoFocus
        />
      </div>

      {/* Resultados */}
      <div className="px-4 pb-6">
        {cargandoAlgo && precios.length === 0 && !error && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            Cargando catálogo de precios…
          </div>
        )}

        {!cargandoAlgo && !permisos.error && !error && !buscoAlgunaVez && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            Escribí un SKU o parte del nombre de un artículo para ver su precio y los posibles equivalentes que
            tienen otros proveedores — como referencia para armar la próxima OC.
          </div>
        )}

        {!cargandoAlgo && buscoAlgunaVez && totalDirectos === 0 && !error && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            No se encontraron artículos que coincidan con “{terminoDebounced}”
            {vistaFiltrada ? ' entre tus proveedores asignados' : ''}.
          </div>
        )}

        {!cargandoAlgo && directos.length > 0 && (
          <div className="space-y-4">
            {directos.map(({ anchor, confirmados, equivalentes }) => {
              // "Más barato" solo tiene sentido dentro del grupo confirmado
              // (anchor + equivalencias que una persona ya validó como el
              // mismo producto) -- nunca sobre candidatos sin decidir.
              const grupoConfirmado = [anchor, ...confirmados]
              const idMasBarato =
                confirmados.length > 0
                  ? grupoConfirmado
                      .filter((f) => f.precio_final != null)
                      .sort((a, b) => a.precio_final - b.precio_final)[0]?.yiqi_id ?? null
                  : null

              return (
                <div key={anchor.yiqi_id} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                  {/* Artículo buscado */}
                  <div className="px-3.5 py-2.5 border-b border-[var(--border)] bg-gray-50">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <span className="font-mono text-xs text-[var(--sub)] mr-2">{anchor.sku}</span>
                        <span className="font-semibold">{anchor.mate_nombre ?? '—'}</span>
                        <span className="ml-2 text-[11px] text-gray-400">· {anchor.proveedor}</span>
                        {idMasBarato === anchor.yiqi_id && (
                          <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--grn)] text-white">
                            Más barato
                          </span>
                        )}
                      </div>
                      <span
                        className={`font-bold text-[15px] ${idMasBarato === anchor.yiqi_id ? 'text-[var(--grn)]' : ''}`}
                      >
                        {formatoMoneda(anchor.precio_final)}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      Precio neto {formatoMoneda(anchor.precio_neto)} · mínimo {formatoMoneda(anchor.precio_minimo)} ·
                      estado {anchor.estado ?? '—'} · alta {formatoFechaHora(anchor.fecha_alta)}
                    </div>
                  </div>

                  {/* Equivalencias confirmadas por una persona */}
                  {confirmados.length > 0 && (
                    <div>
                      <div className="px-3.5 py-1.5 bg-[var(--grn-bg)] text-[10px] font-bold text-[var(--grn)] uppercase tracking-wide">
                        ✓ Equivalencias confirmadas
                      </div>
                      <table className="w-full border-collapse">
                        <tbody>
                          {confirmados.map((eq) => (
                            <tr
                              key={eq.yiqi_id}
                              className={`border-b border-gray-100 last:border-0 ${
                                idMasBarato === eq.yiqi_id ? 'bg-[var(--grn-bg)]' : 'hover:bg-gray-50'
                              }`}
                            >
                              <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs w-32">{eq.proveedor}</td>
                              <td className="px-3.5 py-2.5">
                                {eq.mate_nombre ?? '—'}
                                {idMasBarato === eq.yiqi_id && (
                                  <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--grn)] text-white">
                                    Más barato
                                  </span>
                                )}
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-xs text-gray-400">{eq.sku}</td>
                              <td
                                className={`px-3.5 py-2.5 font-bold text-right ${
                                  idMasBarato === eq.yiqi_id ? 'text-[var(--grn)]' : ''
                                }`}
                              >
                                {formatoMoneda(eq.precio_final)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Posibles equivalentes en otros proveedores, sin confirmar */}
                  {equivalentes.length > 0 && (
                    <div>
                      <div className="px-3.5 py-1.5 bg-gray-50 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide border-t border-[var(--border)]">
                        Posibles equivalentes (sin confirmar)
                      </div>
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)]">
                            {['Coincidencia', 'Proveedor', 'Artículo', 'SKU', 'Precio final', 'Precio neto'].map((h) => (
                              <th
                                key={h}
                                className="text-left px-3.5 py-2 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {equivalentes.map((eq) => (
                            <tr key={eq.yiqi_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                              <td className="px-3.5 py-2.5">
                                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                                  {Math.round(eq._score * 100)}%
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs">{eq.proveedor}</td>
                              <td className="px-3.5 py-2.5">{eq.mate_nombre ?? '—'}</td>
                              <td className="px-3.5 py-2.5 font-mono text-xs text-gray-400">{eq.sku}</td>
                              <td className="px-3.5 py-2.5 font-semibold">{formatoMoneda(eq.precio_final)}</td>
                              <td className="px-3.5 py-2.5 text-gray-500">{formatoMoneda(eq.precio_neto)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {confirmados.length === 0 && equivalentes.length === 0 && (
                    <div className="px-3.5 py-3 text-[12px] text-gray-400">
                      No se encontraron artículos de nombre parecido en otros proveedores.
                    </div>
                  )}
                </div>
              )
            })}

            {hayMasArticulos && (
              <div className="text-center text-xs text-gray-400 py-2">
                Se encontraron {totalDirectos} artículos que coinciden — mostrando los primeros{' '}
                {MAX_ARTICULOS_MOSTRADOS}. Afiná la búsqueda para acotar.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
