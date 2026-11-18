import { formatoNumero } from '../../lib/formato'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../hooks/usePermisos'
import Aviso from '../../components/Aviso'
import { useEstadoAutomatismos } from '../../hooks/useEstadoAutomatismos'
import { nombreDeposito, DEPOSITO_CENTRAL, DEPOSITO_LOCAL } from '../../lib/depositos'
import { generarRemitoImprimible } from '../../lib/pdfRemito'
// 17/11/2026 — diferencias de recepción: bloque para quien envió.
import DiferenciasRecepcion from '../../components/DiferenciasRecepcion'
import RemitoFirmado from '../../components/RemitoFirmado'

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
// se lee la clasificación congelada en la línea (clase_abc, desde 30/9/2026;
// migración 20260930100000) — no se llama más a reposicion_interna().
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

// 10/11/2026 — radiografía UX (ítem 4): formato de números es-AR único (lib/formato.js).
// 17/11/2026 — sin ",00" en cantidades enteras (500, no 500,00); hasta 2 decimales solo si los tiene.
function num(v, decimales = 2) {
  return formatoNumero(v, { decimales, minDecimales: 0 })
}

function numInput(v) {
  if (v == null) return ''
  const n = Number(v)
  if (Number.isNaN(n)) return ''
  // 17/11/2026 — entero sin decimales ("500"); si tiene decimales, hasta 2 ("0.08").
  return String(Math.round(n * 100) / 100)
}

function formatoFechaHora(fechaStr) {
  if (!fechaStr) return '—'
  try {
    return new Date(fechaStr).toLocaleString('es-AR', { hourCycle: 'h23' })
  } catch {
    return fechaStr
  }
}

// Un solo campo de cantidad enviada — lo que falta queda como "no hay"
// automático, con el motivo que se escriba acá al lado.
function FilaLineaReservada({ linea, claseAbc, onDeclarar, guardando, stockAca }) {
  const [cantidad, setCantidad] = useState(numInput(linea.cantidad_solicitada))
  const [motivo, setMotivo] = useState('')

  const faltante = Math.max(Number(linea.cantidad_solicitada) - (Number(cantidad) || 0), 0)
  // 17/11/2026 — Parte B (regla de Aris): si lo enviado difiere de lo pedido,
  // de menos o de más, se asienta el motivo.
  const sobrante = Math.max((Number(cantidad) || 0) - Number(linea.cantidad_solicitada), 0)
  const necesitaMotivo = faltante > 0 || sobrante > 0
  // 18/11/2026 — aviso (no bloquea): se declara enviar más de lo que figura en stock en YiQi.
  const pasaDelStock = stockAca != null && (Number(cantidad) || 0) > stockAca

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-3.5 py-1.5 font-mono text-xs">{linea.sku}</td>
      <td className="px-3.5 py-1.5">
        <BadgeClaseAbc clase={claseAbc} />
      </td>
      <td className="px-3.5 py-1.5 text-sm">{linea.mate_nombre}</td>
      <td className="px-3.5 py-1.5 text-sm text-[var(--sub)]">{num(linea.cantidad_solicitada)}</td>
      {/* 18/11/2026 — stock real de YiQi del propio depósito */}
      <td className="px-3.5 py-1.5 text-sm text-[var(--sub)]">{stockAca != null ? num(stockAca) : '—'}</td>
      <td className="px-3.5 py-1.5">
        <input
          type="number"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className="w-24 border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
        />
        {pasaDelStock && (
          <div className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
            Declarás más de lo que figura en stock ({num(stockAca)})
          </div>
        )}
      </td>
      <td className="px-3.5 py-1.5">
        {necesitaMotivo ? (
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={faltante > 0 ? `Motivo por qué faltan ${num(faltante)}` : `Motivo por qué se envían ${num(sobrante)} de más`}
            className="w-56 border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
          />
        ) : (
          <span className="text-[11px] text-gray-500" title="18/11/2026: en gris, porque en verde se leía como ya hecho">Sin faltante</span>
        )}
      </td>
      <td className="px-3.5 py-1.5">
        <button
          onClick={() => onDeclarar(linea, Number(cantidad) || 0, motivo.trim() || null)}
          disabled={guardando || (necesitaMotivo && motivo.trim() === '')}
          title={
            sobrante > 0
              ? 'Se envía más de lo pedido: queda asentado con este motivo'
              : necesitaMotivo
              // 10/11/2026 — radiografía UX (ítem 12): el "no hay" solo suspende la alerta; no crea ninguna OC.
              ? 'Lo que falta se registra como "no hay" con este motivo y suspende la alerta de este artículo hasta que vuelva a haber stock. No genera una orden de compra'
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
  // 10/11/2026 — radiografía UX (ítem 18): null = no se sabe (no se muestra nada).
  const automatismos = useEstadoAutomatismos()
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
  // SKU -> clase_abc real (Aris), leída de la línea del remito (30/9/2026;
  // migración 20260930100000) — el depósito no lee ventas.
  const [claseAbcPorSku, setClaseAbcPorSku] = useState({})
  // 18/11/2026 — SKU -> {stock_local, stock_central} de YiQi, para la columna "Stock acá".
  const [stockPorSku, setStockPorSku] = useState({})
  const stockAcaDe = (sku, origen) => {
    const f = stockPorSku[sku]
    if (!f) return null
    const v = origen === DEPOSITO_LOCAL ? f.stock_local : origen === DEPOSITO_CENTRAL ? f.stock_central : null
    return v == null ? null : Number(v)
  }

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
            .select('sku, en_transito, stock_local, stock_central')
            .in('sku', skus)
          const mapaStock = {}
          const mapaStockAca = {}
          for (const f of filasStock ?? []) {
            mapaStock[f.sku] = f.en_transito
            mapaStockAca[f.sku] = { stock_local: f.stock_local, stock_central: f.stock_central }
          }
          setEnTransitoYiqi(mapaStock)
          setStockPorSku(mapaStockAca)

          // Clase ABC congelada en la línea al generarse el remito
          // (migración 20260930100000). El depósito no llama más a
          // reposicion_interna(): no necesita ver ventas.
          const mapaAbc = {}
          for (const l of filasLineas ?? []) if (l.clase_abc) mapaAbc[l.sku] = l.clase_abc
          setClaseAbcPorSku(mapaAbc)
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
        enviás. Si enviás distinto de lo pedido (de menos o de más), escribí el motivo. Lo que falte queda como "no
        hay" automático — eso suspende la alerta de ese artículo hasta que vuelva a haber stock. No genera por sí solo
        una orden de compra: Compras la arma aparte.
      </Aviso>

      {/* 17/11/2026 — diferencias de recepción: líneas que el destino confirmó con distinta cantidad que la enviada. */}
      {claveFiltro !== null && (
        <DiferenciasRecepcion depositosOrigen={misDepositos} esAdmin={!!permisos.esAdmin} onCambio={cargar} />
      )}

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
            {automatismos?.reposicion_central_activa === false && (
              <div className="mt-2 text-[12px] text-[#92400e]">
                La reposición automática Central→Local está pausada: solo aparecen pedidos manuales.
              </div>
            )}
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
                  {/* 18/11/2026 — copia firmada del remito (también la puede subir el que envía). */}
                  {s.estado === 'en_preparacion' && (
                    <div className="mt-1">
                      <RemitoFirmado solicitudId={s.id} compacto />
                    </div>
                  )}
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
                      {['SKU', 'Clase', 'Producto', 'Pedido', 'Stock acá', 'Envía', 'Motivo si falta', ''].map((h) => (
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
                        <td colSpan={8} className="px-3.5 py-4 text-center text-[var(--sub)] text-sm">
                          No hay artículos con necesidad neta en este momento.
                        </td>
                      </tr>
                    ) : (
                      (lineasPorSolicitud[s.id] ?? []).map((l) =>
                        l.estado_linea === 'reservada' ? (
                          <FilaLineaReservada
                            key={l.id}
                            linea={l}
                            claseAbc={l.clase_abc ?? claseAbcPorSku[l.sku]}
                            onDeclarar={declararLinea}
                            guardando={declarando === l.id}
                            stockAca={stockAcaDe(l.sku, s.deposito_origen_id)}
                          />
                        ) : (
                          <tr key={l.id} className="border-b border-gray-50 last:border-0 bg-gray-50/50">
                            <td className="px-3.5 py-1.5 font-mono text-xs">{l.sku}</td>
                            <td className="px-3.5 py-1.5">
                              <BadgeClaseAbc clase={l.clase_abc ?? claseAbcPorSku[l.sku]} />
                            </td>
                            <td className="px-3.5 py-1.5 text-sm">{l.mate_nombre}</td>
                            <td className="px-3.5 py-1.5 text-sm text-[var(--sub)]">{num(l.cantidad_solicitada)}</td>
                            <td className="px-3.5 py-1.5 text-sm text-[var(--sub)]">—</td>
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
                            {/* 17/11/2026 — Parte B: 'con_diferencia' = frenado en destino hasta "Revisado". */}
                            <td
                              className={`px-3.5 py-1.5 text-[11px] font-semibold ${
                                l.estado_linea === 'con_diferencia' ? 'text-amber-700' : 'text-green-700'
                              }`}
                            >
                              {l.estado_linea === 'recibida'
                                ? '✓ Recibido'
                                : l.estado_linea === 'con_diferencia'
                                ? `⚠ Recibido con diferencia (${num(l.cantidad_recibida)} de ${num(l.cantidad_enviada)}) — si no estaba físico, corregilo arriba en "Diferencias en recepción"`
                                : 'En tránsito — esperando recepción'}
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
