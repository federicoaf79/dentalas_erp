import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'

// ============================================================
// PredictorDemanda.jsx — v1
// Historial real de ventas por SKU y por mes, desde la tabla propia
// ventas_mensual_yiqi (espejo de la smartie 2353 de YiQi).
//
// El calculo vive en Postgres (funcion historial_ventas), que NO es
// SECURITY DEFINER: corre con los permisos del usuario logueado, asi
// que el RLS filtra solo y cada uno ve los articulos de sus
// proveedores asignados.
//
// DOS COSAS IMPORTANTES SOBRE LOS NUMEROS:
//  - El promedio es SUM / N_meses, NO AVG(). Las celdas vacias no
//    generan fila en la tabla, asi que AVG dividiria solo por los
//    meses con venta y sobreestimaria la demanda.
//  - El mes en curso se EXCLUYE (esta incompleto hasta que termine).
// ============================================================

const CANT_MESES = 12

// Ultimos 12 meses COMPLETOS (sin el actual), en el mismo formato
// 'YYYY-MM' que devuelve la funcion de Postgres.
function construirMeses() {
  const hoy = new Date()
  const cols = []
  for (let i = CANT_MESES; i >= 1; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
    cols.push({ clave, label })
  }
  return cols
}

function formatoNumero(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return num % 1 === 0 ? String(num) : num.toFixed(1)
}

// Meses de cobertura = stock actual / consumo mensual promedio.
// Es una division simple sobre datos historicos, no un pronostico.
function calcularCobertura(stock, promedio) {
  const s = Number(stock)
  const p = Number(promedio)
  if (!Number.isFinite(s) || !Number.isFinite(p) || p <= 0) return null
  return s / p
}

// H-9 (auditoría UX 6/9/2026): esta columna mezclaba meses ("22,4 meses")
// y días ("11 días") según el valor, sin ninguna marca que avisara el
// cambio de unidad -- comparar dos filas de un vistazo era engañoso. Se
// unifica todo a "meses"; para los casos urgentes (<1 mes) el equivalente
// en días queda como tooltip, sin agregar una segunda unidad visible.
function ColorCobertura({ meses }) {
  if (meses == null) {
    return <span className="text-gray-300 text-xs">—</span>
  }
  let clase = 'pill-verde'
  const texto = meses <= 0 ? 'Sin stock' : `${meses.toFixed(1)} meses`
  const tooltip = meses > 0 && meses < 1 ? `≈ ${Math.round(meses * 30)} días de cobertura` : undefined

  if (meses < 1) {
    clase = 'pill-rojo'
  } else if (meses < 2) {
    clase = 'pill-amarillo'
  }

  return (
    <span title={tooltip} className={`pill ${clase}`}>
      {texto}
    </span>
  )
}

export default function PredictorDemanda() {
  const permisos = usePermisos()

  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [paginaActual, setPaginaActual] = useState(1)
  const [filasPorPagina, setFilasPorPagina] = useState(50)

  const meses = useMemo(construirMeses, [])

  async function cargarDatos() {
    if (permisos.cargando || permisos.error) return
    setLoading(true)
    setError(null)
    try {
      // OJO: PostgREST corta las respuestas de tipo tabla en 1.000 filas
      // y ese tope es del servidor — no se puede levantar con .range()
      // desde el frontend. Por eso llamamos a historial_ventas_json(),
      // que devuelve UNA fila con un array adentro: al ser un unico
      // valor jsonb, el limite de filas no aplica.
      const { data, error } = await supabase.rpc('historial_ventas_json', {
        p_meses: CANT_MESES,
      })
      if (error) throw new Error(error.message)
      setFilas(data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const claveFiltro =
    permisos.cargando || permisos.error
      ? null
      : `${permisos.esAdmin}|${permisos.nombres.join(',')}`

  useEffect(() => {
    if (claveFiltro === null) return
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltro])

  useEffect(() => {
    setPaginaActual(1)
  }, [busqueda, filasPorPagina])

  const filtradas = useMemo(() => {
    if (!busqueda) return filas
    const texto = busqueda.toLowerCase()
    return filas.filter(
      (f) =>
        f.mate_codigo?.toLowerCase().includes(texto) ||
        f.mate_nombre?.toLowerCase().includes(texto) ||
        f.proveedor?.toLowerCase().includes(texto)
    )
  }, [filas, busqueda])

  const totales = useMemo(() => {
    const unidades = filtradas.reduce((acc, f) => acc + Number(f.total ?? 0), 0)
    const criticos = filtradas.filter((f) => {
      const c = calcularCobertura(f.stock_actual, f.promedio)
      return c != null && c < 1
    }).length
    return { unidades, criticos, skus: filtradas.length }
  }, [filtradas])

  const totalFilas = filtradas.length
  const totalPaginas = Math.max(1, Math.ceil(totalFilas / filasPorPagina))
  const paginaSegura = Math.min(paginaActual, totalPaginas)
  const inicio = (paginaSegura - 1) * filasPorPagina
  const paginadas = filtradas.slice(inicio, inicio + filasPorPagina)

  const cargandoAlgo = loading || permisos.cargando
  const vistaFiltrada = !permisos.cargando && !permisos.error && !permisos.esAdmin

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      <EncabezadoPagina
        titulo="Predictor de demanda"
        bajada={
          cargandoAlgo
            ? 'Cargando…'
            : `${totales.skus} artículos con ventas en los últimos ${CANT_MESES} meses`
        }
        info={
          <>
            Historial real de ventas sincronizado desde YiQi. El promedio mensual se calcula sobre los últimos{' '}
            {CANT_MESES} meses completos —el mes en curso se excluye porque todavía está abierto— y contempla
            devoluciones y notas de crédito (venta neta). La cobertura es el stock actual dividido ese promedio.
          </>
        }
      >
        <button onClick={cargarDatos} disabled={cargandoAlgo} className="btn btn-sm">
          <i className="ti ti-refresh" aria-hidden="true" />
          {cargandoAlgo ? 'Actualizando…' : 'Actualizar'}
        </button>
      </EncabezadoPagina>

      <div className="pagina">
        {permisos.error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
            <p className="font-semibold">No se pudieron determinar tus permisos</p>
            <p className="text-sm mt-1">{permisos.error}</p>
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
            <p className="font-semibold">No se pudo cargar el historial de ventas</p>
            <p className="text-sm mt-1">{error}</p>
            <button onClick={cargarDatos} className="mt-2 text-sm underline">Reintentar</button>
          </div>
        )}

        {vistaFiltrada && (
          <Aviso tipo="filtro" autoCerrarEn={15} className="mb-4">
            Vista filtrada: solo se muestran los artículos de tus {permisos.nombres.length} proveedores asignados.
          </Aviso>
        )}

        {/* Métricas */}
        <div className="metricas mb-5">
          <div className="metrica">
            <div className="metrica-rot">Artículos con movimiento</div>
            <div className="metrica-val">{totales.skus}</div>
            <div className="metrica-sub">últimos {CANT_MESES} meses</div>
          </div>
          <div className="metrica">
            <div className="metrica-rot">Unidades vendidas</div>
            <div className="metrica-val">{formatoNumero(totales.unidades)}</div>
            <div className="metrica-sub">neto de devoluciones</div>
          </div>
          <div className="metrica">
            <div className="metrica-rot">Cobertura menor a 1 mes</div>
            <div className="metrica-val text-[var(--red)]">{totales.criticos}</div>
            <div className="metrica-sub">según consumo histórico</div>
          </div>
        </div>

        {/* Buscador */}
        <div className="mb-3.5 flex items-center justify-between gap-3 flex-wrap">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por SKU, nombre o proveedor…"
            className="w-[320px] max-w-full px-3 py-[7px] border border-[#d1d5db] rounded-lg text-[13px] bg-[#f9fafb] outline-none focus:border-[var(--ind)] focus:bg-white"
          />
          <label className="flex items-center gap-2 text-[12px] text-[var(--sub)]">
            Filas por página
            <select
              value={filasPorPagina}
              onChange={(e) => setFilasPorPagina(Number(e.target.value))}
              className="border border-[#d1d5db] rounded-lg px-2 py-1.5 text-[13px] bg-white"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Tabla */}
        <div className="tw overflow-x-auto!">
          {cargandoAlgo && filas.length === 0 ? (
            <div className="p-8 text-center text-[var(--sub)] text-[13px]">Cargando historial de ventas…</div>
          ) : paginadas.length === 0 ? (
            <div className="p-8 text-center text-[var(--sub)] text-[13px]">
              No hay artículos con ventas que coincidan con la búsqueda.
            </div>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[1]">SKU</th>
                  <th>Producto</th>
                  <th>Proveedor</th>
                  {/* Lo accionable va ANTES del detalle mensual: en una pantalla
                      normal se ve sin scrollear, y los meses quedan de respaldo. */}
                  <th className="text-right!">Stock</th>
                  <th className="text-right!">Prom./mes</th>
                  <th>Cobertura</th>
                  {meses.map((m) => (
                    <th key={m.clave} className="text-right! px-2.5! text-gray-400!">
                      {m.label}
                    </th>
                  ))}
                  <th className="text-right!">Total</th>
                </tr>
              </thead>
              <tbody>
                {paginadas.map((f) => {
                  const cobertura = calcularCobertura(f.stock_actual, f.promedio)
                  return (
                    <tr key={f.mate_codigo}>
                      <td className="sku sticky left-0 bg-white">{f.mate_codigo}</td>
                      <td className="font-semibold max-w-[280px] truncate" title={f.mate_nombre ?? ''}>
                        {f.mate_nombre ?? '—'}
                      </td>
                      <td className="text-[var(--sub)] text-[12px]! whitespace-nowrap">{f.proveedor ?? '—'}</td>
                      <td className="text-right tabular-nums font-semibold">{formatoNumero(f.stock_actual)}</td>
                      <td className="text-right font-semibold tabular-nums text-[var(--ind,#4338ca)]">
                        {formatoNumero(f.promedio)}
                      </td>
                      <td><ColorCobertura meses={cobertura} /></td>
                      {meses.map((m) => {
                        const valor = f.meses?.[m.clave]
                        return (
                          <td
                            key={m.clave}
                            className={`px-2.5! text-right text-[12px]! tabular-nums ${
                              valor == null ? 'text-gray-200' : Number(valor) < 0 ? 'text-[var(--red)]' : 'text-gray-600'
                            }`}
                          >
                            {valor == null ? '·' : formatoNumero(valor)}
                          </td>
                        )
                      })}
                      <td className="text-right font-bold tabular-nums">{formatoNumero(f.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginador */}
        {filtradas.length > 0 && (
          <div className="mt-3 flex items-center justify-between text-[12px] text-[var(--sub)] px-1">
            <span>
              Mostrando {inicio + 1}–{Math.min(inicio + filasPorPagina, totalFilas)} de {totalFilas}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                disabled={paginaSegura <= 1}
                className="btn btn-sm"
              >
                ‹ Anterior
              </button>
              <span className="text-[11px] text-gray-400">Página {paginaSegura} de {totalPaginas}</span>
              <button
                onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaSegura >= totalPaginas}
                className="btn btn-sm"
              >
                Siguiente ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
