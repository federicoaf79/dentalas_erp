import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../hooks/usePermisos'
import Aviso from '../../components/Aviso'
import { nombreDeposito, DEPOSITO_CENTRAL } from '../../lib/depositos'
import { generarRemitoImprimible } from '../../lib/pdfRemito'

// ============================================================
// pages/deposito/SolicitudesParaPreparar.jsx — 7/9/2026, v3 10/9/2026
// ============================================================
// Pantalla del circuito de reposición automática Central<->Local
// (ver DISENO_TECNICO_Reposicion_CentralLocal_7-9-2026.md, §12, y
// DISENO_TECNICO_Unificacion_Eje1_10-9-2026.md) para la cuenta de
// depósito que ES ORIGEN de una solicitud — es decir, quien tiene que
// prepararla. Sirve para las dos direcciones sin distinguir rol:
// Depósito Central es origen en el circuito principal, el Local es
// origen en el circuito inverso.
//
// Dos estados posibles por solicitud:
//   'solicitada'     -> todavía nadie calculó las líneas. Para el
//                        Local (circuito inverso) acá aparece el botón
//                        "Generar remito de mercadería". Para Depósito
//                        Central, esto ya no debería verse — desde el
//                        10/9/2026 el trigger `trg_auto_preparar_central`
//                        genera y declara automáticamente en cuanto se
//                        crea la solicitud (Aris, 10/9: "ahorrar el paso
//                        de que Depósito Central valide las cantidades,
//                        ya que las mismas se ven desde Yiqi"). El botón
//                        queda igual acá por si algún día hace falta
//                        reprocesar una a mano.
//   'en_preparacion' -> ya tiene líneas armadas (reservadas o ya
//                        declaradas "en tránsito"). Por cada reservada
//                        se declara "envía" (cantidad) / lo que falta
//                        queda como "no hay" automático con motivo --
//                        decisión de Federico, 7/9/2026. "Declarada" se
//                        muestra como "En tránsito" desde el 10/9/2026
//                        (pedido de Aris) — mismo dato, solo rótulo.
//
// Columna "Clase" (10/9/2026, v3): Federico notó en vivo que la lista
// no distinguía qué línea es A/B/C, aunque el orden en que se armó el
// remito ya respeta esa prioridad (ver generar_remito_reposicion_central
// en la migración 20260910140000). Se agrega acá SOLO para mostrarla —
// se trae la clasificación real con reposicion_interna() filtrada a los
// SKU de la pantalla (no se reimplementa el cálculo).
// ============================================================

const CLASE_ABC_ESTILO = {
  A: 'bg-[var(--red-bg,#fef2f2)] text-[var(--red,#b91c1c)]',
  B: 'bg-[var(--yel-bg,#fffbeb)] text-[#92400e]',
  C: 'bg-gray-100 text-gray-600',
}

function BadgeClaseAbc({ clase }) {
  if (!clase) return <span className="text-[var(--sub)]">—</span>
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${CLASE_ABC_ESTILO[clase] ?? CLASE_ABC_ESTILO.C}`}
      title="Clasificación ABC real (Aris) — A = mayor rotación, prioridad más alta"
    >
      {clase}
    </span>
  )
}

function num(v, decimales = 2) {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

function numInput(v) {
  if (v == null) return ''
  const n = Number(v)
  if (Number.isNaN(n)) return ''
  return n.toFixed(2)
}

function formatoFechaHora(fechaStr) {
  if (!fechaStr) return '—'
  try {
    return new Date(fechaStr).toLocaleString('es-AR')
  } catch {
    return fechaStr
  }
}

// Un solo campo de cantidad enviada — lo que falta queda como "no hay"
// automático, con el motivo que se escriba acá al lado.
function FilaLineaReservada({ linea, claseAbc, onDeclarar, guardando }) {
  const [cantidad, setCantidad] = useState(numInput(linea.cantidad_solicitada))
  const [motivo, setMotivo] = useState('')

  const faltante = Math.max(Number(linea.cantidad_solicitada) - (Number(cantidad) || 0), 0)
  const necesitaMotivo = faltante > 0

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-3.5 py-1.5 font-mono text-xs">{linea.sku}</td>
      <td className="px-3.5 py-1.5">
        <BadgeClaseAbc clase={claseAbc} />
      </td>
      <td className="px-3.5 py-1.5 text-sm">{linea.mate_nombre}</td>
      <td className="px-3.5 py-1.5 text-sm text-[var(--sub)]">{num(linea.cantidad_solicitada)}</td>
      <td className="px-3.5 py-1.5">
        <input
          type="number"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className="w-24 border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3.5 py-1.5">
        {necesitaMotivo ? (
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={`Motivo por qué faltan ${num(faltante)}`}
            className="w-56 border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
          />
        ) : (
          <span className="text-[11px] text-green-700">Envía todo lo pedido</span>
        )}
      </td>
      <td className="px-3.5 py-1.5">
        <button
          onClick={() => onDeclarar(linea, Number(cantidad) || 0, motivo.trim() || null)}
          disabled={guardando || (necesitaMotivo && motivo.trim() === '')}
          title={
            necesitaMotivo
              ? 'Lo que falta se registra como "no hay" con este motivo — dispara la OC al proveedor y suspende la alerta de este artículo'
              : 'Declara que se envía todo lo pedido'
          }
          className="px-2.5 py-1 rounded text-[11px] font-semibold text-white bg-[var(--ind,#4338ca)] disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Declarar'}
        </button>
      </td>
    </tr>
  )
}

export default function SolicitudesParaPreparar() {
  const permisos = usePermisos()
  const [solicitudes, setSolicitudes] = useState([])
  const [lineasPorSolicitud, setLineasPorSolicitud] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [generando, setGenerando] = useState(null)
  const [declarando, setDeclarando] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  // SKU -> stock_yiqi.en_transito, para el chequeo de consistencia contra
  // lo que YiQi ya calcula por su cuenta (Aris, 10/9: formalizar "En
  // tránsito" cruzando contra ese dato).
  const [enTransitoYiqi, setEnTransitoYiqi] = useState({})
  // SKU -> clase_abc real (Aris), traída de reposicion_interna() filtrada
  // a los SKU en pantalla — no se reimplementa el cálculo (10/9/2026, v3).
  const [claseAbcPorSku, setClaseAbcPorSku] = useState({})

  const misDepositos = permisos.misDepositos ?? []
  const claveFiltro = permisos.cargando || permisos.error ? null : misDepositos.join(',')

  useEffect(() => {
    // Membrete para el remito imprimible — mismos campos que usa
    // pdfOrden.js. No es crítico: si falla, el remito sale sin membrete.
    supabase
      .from('empresa_config')
      .select('*')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setEmpresa(data ?? null))
      .catch(() => setEmpresa(null))
  }, [])

  const cargar = useCallback(async () => {
    if (!misDepositos.length) {
      setSolicitudes([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: errSol } = await supabase
        .from('solicitudes_reposicion')
        .select('*')
        .in('deposito_origen_id', misDepositos)
        .in('estado', ['solicitada', 'en_preparacion'])
        .order('creada_en', { ascending: false })
      if (errSol) throw errSol
      setSolicitudes(data ?? [])

      const idsEnPreparacion = (data ?? []).filter((s) => s.estado === 'en_preparacion').map((s) => s.id)
      if (idsEnPreparacion.length) {
        const { data: filasLineas, error: errLin } = await supabase
          .from('solicitudes_reposicion_lineas')
          .select('*')
          .in('solicitud_id', idsEnPreparacion)
          .order('sku')
        if (errLin) throw errLin
        const mapa = {}
        for (const l of filasLineas ?? []) {
          if (!mapa[l.solicitud_id]) mapa[l.solicitud_id] = []
          mapa[l.solicitud_id].push(l)
        }
        setLineasPorSolicitud(mapa)

        // Cruce de consistencia contra stock_yiqi.en_transito — no bloquea
        // nada, es solo informativo (badge junto a "En tránsito").
        const skus = [...new Set((filasLineas ?? []).map((l) => l.sku))]
        if (skus.length) {
          const { data: filasStock } = await supabase
            .from('stock_yiqi')
            .select('sku, en_transito')
            .in('sku', skus)
          const mapaStock = {}
          for (const f of filasStock ?? []) mapaStock[f.sku] = f.en_transito
          setEnTransitoYiqi(mapaStock)

          // Clasificación ABC real — misma que usa el remito para
          // priorizar, solo para mostrarla acá.
          const { data: filasAbc, error: errAbc } = await supabase
            .rpc('reposicion_interna')
            .select('sku, clase_abc')
            .in('sku', skus)
          if (errAbc) {
            console.error('[claseAbcPorSku]', errAbc)
          } else {
            const mapaAbc = {}
            for (const f of filasAbc ?? []) mapaAbc[f.sku] = f.clase_abc
            setClaseAbcPorSku(mapaAbc)
          }
        }
      } else {
        setLineasPorSolicitud({})
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltro])

  useEffect(() => {
    if (claveFiltro === null) return
    cargar()
  }, [claveFiltro, cargar])

  async function generarRemito(solicitud) {
    setGenerando(solicitud.id)
    setError(null)
    try {
      const { error: errRpc } = await supabase.rpc('generar_remito_reposicion_central', {
        p_solicitud_id: solicitud.id,
      })
      if (errRpc) throw errRpc
      await cargar()
      setAviso('Remito generado con la necesidad actualizada al momento del clic.')
      setTimeout(() => setAviso(null), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerando(null)
    }
  }

  async function declararLinea(linea, cantidadEnviada, motivo) {
    setDeclarando(linea.id)
    setError(null)
    try {
      const { error: errRpc } = await supabase.rpc('declarar_linea_reposicion', {
        p_linea_id: linea.id,
        p_cantidad_enviada: cantidadEnviada,
        p_motivo_sin_stock: motivo,
      })
      if (errRpc) throw errRpc
      await cargar()
      setAviso(`${linea.sku} declarado.`)
      setTimeout(() => setAviso(null), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeclarando(null)
    }
  }

  const cargandoAlgo = loading || permisos.cargando

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white">
        <div className="text-[17px] font-bold">Solicitudes para preparar</div>
        <div className="text-[12px] text-[var(--sub)] mt-0.5">
          {cargandoAlgo ? 'Cargando…' : `${solicitudes.length} solicitud${solicitudes.length === 1 ? '' : 'es'}`}
        </div>
      </div>

      <Aviso tipo="info" id="deposito-preparar-criterio" className="mx-4 mt-4">
        "Generar remito de mercadería" trae la necesidad actualizada al momento exacto del clic — si lo hacés dos
        veces, la segunda ya descuenta lo que quedó reservado en la primera. Por cada artículo declarás cuánto
        enviás: lo que falte queda como "no hay" automático con el motivo que escribas — eso dispara la orden de
        compra al proveedor y suspende la alerta de ese artículo hasta que vuelva a haber stock.
      </Aviso>

      {permisos.error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudieron determinar tus permisos</p>
          <p className="text-sm mt-1">{permisos.error}</p>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-[var(--red)] rounded-lg p-4">
          <p className="font-semibold">No se pudo completar la acción</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {aviso && (
        <div className="mx-4 mt-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2.5 text-[13px]">
          {aviso}
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        {cargandoAlgo && solicitudes.length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            Cargando…
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            No tenés solicitudes pendientes de preparar. 🎉
          </div>
        ) : (
          solicitudes.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="px-3.5 py-2.5 bg-gray-50 border-b border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <span className="font-bold text-sm">{s.remito_numero ?? `Solicitud #${s.id}`}</span>
                  <span className="text-[11px] text-[var(--sub)] ml-2">
                    → {nombreDeposito(s.deposito_destino_id)} · {formatoFechaHora(s.creada_en)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {s.estado === 'en_preparacion' && (
                    <button
                      onClick={() =>
                        generarRemitoImprimible({
                          solicitud: s,
                          lineas: lineasPorSolicitud[s.id] ?? [],
                          empresa,
                          claseAbcPorSku,
                        })
                      }
                      title="Imprimir o guardar como PDF — el destino confirma la recepción contra este remito"
                      className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50"
                    >
                      🖨️ Imprimir remito
                    </button>
                  )}
                  {s.estado === 'solicitada' ? (
                    <button
                      onClick={() => generarRemito(s)}
                      disabled={generando === s.id}
                      title={
                        s.deposito_origen_id === DEPOSITO_CENTRAL
                          ? 'Depósito Central se procesa solo automáticamente — usá esto solo si quedó sin procesar'
                          : undefined
                      }
                      className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--ind,#4338ca)] disabled:opacity-50"
                    >
                      {generando === s.id ? 'Generando…' : '📋 Generar remito de mercadería'}
                    </button>
                  ) : (
                    <span className="text-[11px] font-semibold text-[var(--ind)] bg-[var(--ind-bg)] px-2.5 py-1 rounded-full">
                      En preparación
                    </span>
                  )}
                </div>
              </div>

              {s.estado === 'en_preparacion' && (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['SKU', 'Clase', 'Producto', 'Pedido', 'Envía', 'Motivo si falta', ''].map((h) => (
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
                    {(lineasPorSolicitud[s.id] ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3.5 py-4 text-center text-[var(--sub)] text-sm">
                          No hay artículos con necesidad neta en este momento.
                        </td>
                      </tr>
                    ) : (
                      (lineasPorSolicitud[s.id] ?? []).map((l) =>
                        l.estado_linea === 'reservada' ? (
                          <FilaLineaReservada
                            key={l.id}
                            linea={l}
                            claseAbc={claseAbcPorSku[l.sku]}
                            onDeclarar={declararLinea}
                            guardando={declarando === l.id}
                          />
                        ) : (
                          <tr key={l.id} className="border-b border-gray-50 last:border-0 bg-gray-50/50">
                            <td className="px-3.5 py-1.5 font-mono text-xs">{l.sku}</td>
                            <td className="px-3.5 py-1.5">
                              <BadgeClaseAbc clase={claseAbcPorSku[l.sku]} />
                            </td>
                            <td className="px-3.5 py-1.5 text-sm">{l.mate_nombre}</td>
                            <td className="px-3.5 py-1.5 text-sm text-[var(--sub)]">{num(l.cantidad_solicitada)}</td>
                            <td className="px-3.5 py-1.5 text-sm font-semibold">
                              {num(l.cantidad_enviada)}
                              {enTransitoYiqi[l.sku] != null && l.estado_linea !== 'recibida' && (
                                <span
                                  className="ml-1.5 text-[10px] text-[var(--sub)] font-normal"
                                  title="Lo que YiQi tiene registrado como en tránsito para este SKU (todos los movimientos, no solo este remito) — chequeo de consistencia, no se usa para calcular nada"
                                >
                                  (YiQi: {num(enTransitoYiqi[l.sku])} en tránsito)
                                </span>
                              )}
                            </td>
                            <td className="px-3.5 py-1.5 text-sm text-[var(--sub)]">{l.motivo_sin_stock ?? '—'}</td>
                            <td className="px-3.5 py-1.5 text-[11px] text-green-700 font-semibold">
                              {l.estado_linea === 'recibida' ? '✓ Recibido' : 'En tránsito — esperando recepción'}
                            </td>
                          </tr>
                        )
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
