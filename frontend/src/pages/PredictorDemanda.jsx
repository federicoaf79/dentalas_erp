import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import Aviso from '../components/Aviso'

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

function ColorCobertura({ meses }) {
  if (meses == null) {
    return <span className="text-gray-300 text-xs">—</span>
  }
  let clase = 'bg-[var(--grn-bg)] text-[var(--grn)]'
  let texto = `${meses.toFixed(1)} meses`

  if (meses < 1) {
    clase = 'bg-[var(--red-bg)] text-[var(--red)]'
    texto = meses <= 0 ? 'Sin stock' : `${Math.round(meses * 30)} días`
  } else if (meses < 2) {
    clase = 'bg-[var(--yel-bg)] text-[#92400e]'
  }

  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${clase}`}>
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
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">Predictor de demanda</div>
          <div className="text-[12px] text-[var(--sub)] mt-0.5">
            {cargandoAlgo
              ? 'Cargando…'
              : `${totales.skus} artículos con ventas en los últimos ${CANT_MESES} meses`}
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

      {permisos.error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudieron determinar tus permisos</p>
          <p className="text-sm mt-1">{permisos.error}</p>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudo cargar el historial de ventas</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={cargarDatos} className="mt-2 text-sm underline">Reintentar</button>
        </div>
      )}

      {/* Nota metodologica — honestidad sobre como se calcula */}
      <Aviso tipo="info" id="predictor-metodologia" className="mx-4 mt-4">
        Historial real de ventas sincronizado desde YiQi. El promedio mensual se calcula sobre los últimos{' '}
        {CANT_MESES} meses completos —el mes en curso se excluye porque todavía está abierto— y contempla
        devoluciones y notas de crédito (venta neta). La cobertura es el stock actual dividido ese promedio.
      </Aviso>

      {vistaFiltrada && (
        <Aviso tipo="filtro" autoCerrarEn={15} className="mx-4 mt-2">
          Vista filtrada: solo se muestran los artículos de tus {permisos.nombres.length} proveedores asignados.
        </Aviso>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2.5 p-4">
        <div className="bg-white rounded-xl p-4 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Artículos con movimiento</div>
          <div className="text-2xl font-bold">{totales.skus}</div>
          <div className="text-[11px] text-gray-400 mt-1">últimos {CANT_MESES} meses</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Unidades vendidas</div>
          <div className="text-2xl font-bold">{formatoNumero(totales.unidades)}</div>
          <div className="text-[11px] text-gray-400 mt-1">neto de devoluciones</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--sub)] uppercase tracking-wide mb-1">Cobertura menor a 1 mes</div>
          <div className="text-2xl font-bold text-[var(--red)]">{totales.criticos}</div>
          <div className="text-[11px] text-gray-400 mt-1">según consumo histórico</div>
        </div>
      </div>

      {/* Buscador */}
      <div className="px-4 pb-2 flex items-center justify-between gap-3 flex-wrap">
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
      <div className="mx-4 mb-2 bg-white rounded-xl border border-[var(--border)] overflow-x-auto">
        {cargandoAlgo && filas.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">Cargando historial de ventas…</div>
        ) : paginadas.length === 0 ? (
          <div className="p-8 text-center text-[var(--sub)] text-sm">
            No hay artículos con ventas que coincidan con la búsqueda.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                <th className="text-left px-3.5 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide sticky left-0 bg-gray-50">SKU</th>
                <th className="text-left px-3.5 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">Producto</th>
                <th className="text-left px-3.5 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">Proveedor</th>
                {/* Lo accionable va ANTES del detalle mensual: en una pantalla
                    normal se ve sin scrollear, y los meses quedan de respaldo. */}
                <th className="text-right px-3 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">Stock</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide whitespace-nowrap">Prom./mes</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">Cobertura</th>
                {meses.map((m) => (
                  <th key={m.clave} className="text-right px-2 py-2.5 text-[10px] font-bold text-gray-400 tracking-wide whitespace-nowrap">
                    {m.label}
                  </th>
                ))}
                <th className="text-right px-3 py-2.5 text-[10px] font-bold text-[var(--sub)] uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {paginadas.map((f) => {
                const cobertura = calcularCobertura(f.stock_actual, f.promedio)
                return (
                  <tr key={f.mate_codigo} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3.5 py-2.5 font-mono text-xs sticky left-0 bg-white">{f.mate_codigo}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-[13px] max-w-[280px] truncate" title={f.mate_nombre ?? ''}>
                      {f.mate_nombre ?? '—'}
                    </td>
                    <td className="px-3.5 py-2.5 text-[var(--sub)] text-xs whitespace-nowrap">{f.proveedor ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{formatoNumero(f.stock_actual)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--ind,#4338ca)]">
                      {formatoNumero(f.promedio)}
                    </td>
                    <td className="px-3 py-2.5"><ColorCobertura meses={cobertura} /></td>
                    {meses.map((m) => {
                      const valor = f.meses?.[m.clave]
                      return (
                        <td
                          key={m.clave}
                          className={`px-2 py-2.5 text-right text-xs tabular-nums ${
                            valor == null ? 'text-gray-200' : Number(valor) < 0 ? 'text-[var(--red)]' : 'text-gray-600'
                          }`}
                        >
                          {valor == null ? '·' : formatoNumero(valor)}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{formatoNumero(f.total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginador */}
      {filtradas.length > 0 && (
        <div className="mx-4 mb-6 flex items-center justify-between text-sm text-gray-500 px-1">
          <span>
            Mostrando {inicio + 1}–{Math.min(inicio + filasPorPagina, totalFilas)} de {totalFilas}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
              disabled={paginaSegura <= 1}
              className="px-2.5 py-1 rounded border border-[var(--border)] disabled:opacity-40"
            >
              ‹ Anterior
            </button>
            <span className="text-xs text-gray-400">Página {paginaSegura} de {totalPaginas}</span>
            <button
              onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaSegura >= totalPaginas}
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
