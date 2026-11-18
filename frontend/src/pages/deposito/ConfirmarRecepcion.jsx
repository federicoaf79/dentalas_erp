import { formatoNumero } from '../../lib/formato'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../hooks/usePermisos'
import Aviso from '../../components/Aviso'
import { deDeposito, nombreDeposito } from '../../lib/depositos'
import { generarRemitoImprimible } from '../../lib/pdfRemito'
import RemitoFirmado from '../../components/RemitoFirmado'
// 23/10/2026 — modo prueba YiQi (no autorizado Live)
import AvisoModoPrueba from '../../components/ui/AvisoModoPrueba'
import { useModoPruebaYiqi } from '../../hooks/useModoPruebaYiqi'

// ============================================================
// pages/deposito/ConfirmarRecepcion.jsx — 7/9/2026, v2 10/9/2026
// ============================================================
// Pantalla del circuito de reposición automática Central<->Local
// (ver DISENO_TECNICO_Reposicion_CentralLocal_7-9-2026.md, §12, y
// DISENO_TECNICO_Unificacion_Eje1_10-9-2026.md) para la cuenta de
// depósito que ES DESTINO de una línea ya declarada ("en tránsito",
// con cantidad > 0 — antes decía "declarada" en pantalla; renombrado
// el 10/9/2026 a pedido de Aris, el estado en la base sigue siendo
// `estado_linea = 'declarada'`, sin cambios). Confirmar acá es lo que
// ejecuta el movimiento de stock real en YiQi (vía
// mover-stock-reposicion) — no antes, ni cuando el otro lado declaró
// "envía".
//
// Decisión de Federico, 10/9/2026: "el encargado del local confirma lo
// enviado y con el remito impreso. Ya nadie más valida ese punto" — se
// suma acá el botón para imprimir el mismo remito que armó el origen,
// para confirmar contra ese documento físico, no solo contra pantalla.
// ============================================================

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

// 17/11/2026 — diferencias en la recepción (Parte B, regla de Aris):
// si lo recibido no coincide con lo enviado, ese artículo queda FRENADO
// (estado 'con_diferencia'): se pide el motivo, no se mueve stock y el
// pedido no se cierra hasta que quien recibe lo marca "Revisado".
// Los artículos que coinciden se cierran OK y mueven stock como siempre.
const MOTIVOS_DIFERENCIA = [
  'Faltó en la caja o el bulto',
  'Llegó roto o dañado',
  'Llegó de más',
  'Error de conteo al enviar',
  // 18/11/2026 — llegó un artículo distinto del que decía el remito (caso de Aris: "decía vasos y llegaron platos").
  'Llegó otro artículo',
  'Otro',
]
const MOTIVO_OTRO_ARTICULO = 'Llegó otro artículo'

// 18/11/2026 — buscador de artículos para registrar lo que llegó y no estaba en el remito.
// Misma RPC que "Pedir al otro depósito" (buscar_articulos_deposito); si falla, cae a material_yiqi.
function BuscadorArticulo({ elegido, onElegir, onLimpiar }) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [buscado, setBuscado] = useState('')
  const [error, setError] = useState(null)

  async function buscar() {
    const t = texto.trim().replace(/,/g, ' ')
    if (!t) return
    setBuscando(true)
    setError(null)
    try {
      const { data, error: errRpc } = await supabase.rpc('buscar_articulos_deposito', { p_texto: t, p_limite: 12 })
      if (!errRpc && data && Array.isArray(data.items)) {
        setResultados(data.items)
      } else {
        const { data: d2, error: e2 } = await supabase
          .from('material_yiqi')
          .select('mate_codigo, mate_nombre')
          .or(`mate_codigo.ilike.%${t}%,mate_nombre.ilike.%${t}%`)
          .limit(12)
        if (e2) throw e2
        setResultados(d2 ?? [])
      }
      setBuscado(t)
    } catch (e) {
      setError(e.message)
    } finally {
      setBuscando(false)
    }
  }

  if (elegido) {
    return (
      <div className="flex items-center gap-2 text-[12px] bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1">
        <span className="font-mono text-[11px]">{elegido.mate_codigo}</span>
        <span className="flex-1">{elegido.mate_nombre}</span>
        <button type="button" onClick={onLimpiar} className="text-[11px] font-semibold text-[var(--ind,#4338ca)]">
          Cambiar
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar() } }}
          placeholder="Buscá el artículo que llegó (código o nombre)"
          aria-label="Buscar el artículo que llegó"
          className="flex-1 border border-[var(--border)] rounded-lg px-2 py-1 text-[12px]"
        />
        <button
          type="button"
          onClick={buscar}
          disabled={buscando || !texto.trim()}
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-[var(--border)] bg-white disabled:opacity-50"
        >
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </div>
      {error && <div className="text-[11px] text-[var(--red)]">{error}</div>}
      {buscado && !buscando && resultados.length === 0 && (
        <div className="text-[11px] text-[var(--sub)]">No encontré artículos para &quot;{buscado}&quot;.</div>
      )}
      {resultados.length > 0 && (
        <ul className="max-h-40 overflow-y-auto border border-[var(--border)] rounded-lg bg-white divide-y divide-gray-100">
          {resultados.map((r) => (
            <li key={r.mate_codigo}>
              <button
                type="button"
                onClick={() => onElegir(r)}
                className="w-full text-left px-2 py-1 text-[12px] hover:bg-gray-50"
              >
                <span className="font-mono text-[11px]">{r.mate_codigo}</span> {r.mate_nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// 18/11/2026 — "+ Llegó algo que no está en el remito": el artículo queda frenado y lo acepta
// o rechaza el depósito que envió (resolver_no_previsto). No se mueve stock hasta que lo acepta.
function AgregarNoPrevisto({ solicitudId, onRegistrar }) {
  const [abierto, setAbierto] = useState(false)
  const [articulo, setArticulo] = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cantNum = cantidad === '' ? null : Number(cantidad)
  const valida = articulo && cantNum != null && !Number.isNaN(cantNum) && cantNum > 0

  async function guardar() {
    setGuardando(true)
    const ok = await onRegistrar({ solicitudId, articulo, cantidad: cantNum, nota })
    setGuardando(false)
    if (ok) {
      setAbierto(false)
      setArticulo(null)
      setCantidad('')
      setNota('')
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        title="Si llegó un artículo que no figura en este remito, asentalo acá: queda frenado hasta que el otro depósito lo acepte o lo rechace"
        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50"
      >
        + Llegó algo que no está en el remito
      </button>
    )
  }
  return (
    <div className="w-full mt-1 space-y-1.5 bg-white border border-amber-200 rounded-lg p-2.5">
      <div className="text-[12px] font-semibold text-amber-800">Llegó algo que no estaba en el remito</div>
      <BuscadorArticulo elegido={articulo} onElegir={setArticulo} onLimpiar={() => setArticulo(null)} />
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          min="0"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          placeholder="Cantidad"
          aria-label="Cantidad que llegó del artículo no previsto"
          className="w-24 border border-[var(--border)] rounded-lg px-2 py-1 text-[12px]"
        />
        <input
          type="text"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (opcional)"
          className="flex-1 min-w-[160px] border border-[var(--border)] rounded-lg px-2 py-1 text-[12px]"
        />
      </div>
      <div className="text-[10px] text-[var(--sub)]">
        Queda frenado: no se mueve stock hasta que el depósito que envió lo acepte. Si lo rechaza, hay que devolverlo.
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={guardar}
          disabled={guardando || !valida}
          className="px-2.5 py-1 rounded text-[11px] font-semibold text-white bg-amber-600 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Registrar'}
        </button>
        <button onClick={() => setAbierto(false)} className="px-2.5 py-1 rounded text-[11px] border border-[var(--border)]">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function FilaLineaDeclarada({ linea, onConfirmar, guardando, correccion }) {
  const [cantidad, setCantidad] = useState(numInput(linea.cantidad_enviada))
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  // 18/11/2026 — "Llegó otro artículo": cuál llegó y cuántas unidades.
  const [otroArticulo, setOtroArticulo] = useState(null)
  const [otraCantidad, setOtraCantidad] = useState('')
  const cantNum = cantidad === '' ? null : Number(cantidad)
  const valida = cantNum != null && !Number.isNaN(cantNum) && cantNum >= 0
  const difiere = valida && Math.abs(cantNum - Number(linea.cantidad_enviada)) > 1e-9
  const dif = valida ? cantNum - Number(linea.cantidad_enviada) : 0
  const esOtroArticulo = difiere && motivo === MOTIVO_OTRO_ARTICULO
  const otraNum = otraCantidad === '' ? null : Number(otraCantidad)
  const faltaOtro = esOtroArticulo && (!otroArticulo || otraNum == null || Number.isNaN(otraNum) || otraNum <= 0)
  const faltaMotivo = difiere && (!motivo || (motivo === 'Otro' && !nota.trim()))
  const deshabilitado = guardando || !valida || (!difiere && cantNum <= 0) || faltaMotivo || faltaOtro
  return (
    <tr className={`border-b border-gray-100 last:border-0 align-top ${difiere ? 'bg-amber-50/60' : ''}`}>
      <td className="px-3.5 py-1.5 font-mono text-xs">{linea.sku}</td>
      <td className="px-3.5 py-1.5 text-sm">{linea.mate_nombre}</td>
      <td className="px-3.5 py-1.5 text-sm text-[var(--sub)]">
        {num(linea.cantidad_enviada)} en tránsito
        {/* 17/11/2026 — el depósito que envió corrigió la cantidad después de una diferencia. */}
        {correccion && (
          <div className="text-[11px] text-[var(--ind,#4338ca)] font-semibold mt-0.5">
            Corregido por el otro depósito: figuraba {num(correccion.cantidad_anterior)}
            {correccion.motivo ? ` (${correccion.motivo})` : ''}
          </div>
        )}
      </td>
      <td className="px-3.5 py-1.5">
        <input
          type="number"
          min="0"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          aria-label={`Cantidad recibida de ${linea.sku}`}
          className="w-24 border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
        />
        {difiere ? (
          <div className="mt-1.5 space-y-1 max-w-[230px]">
            <div className="text-[11px] font-semibold text-amber-700">
              {dif < 0 ? `Faltan ${num(-dif)} u` : `Sobran ${num(dif)} u`} contra lo enviado
            </div>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              aria-label="Motivo de la diferencia"
              className="w-full border border-[var(--border)] rounded-lg px-2 py-1 text-[12px] bg-white"
            >
              <option value="">Elegí el motivo…</option>
              {MOTIVOS_DIFERENCIA.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={motivo === 'Otro' ? 'Contá qué pasó (obligatorio)' : 'Nota (opcional)'}
              className="w-full border border-[var(--border)] rounded-lg px-2 py-1 text-[12px]"
            />
            {esOtroArticulo && (
              <div className="space-y-1 border-t border-amber-200 pt-1.5">
                <div className="text-[11px] font-semibold text-amber-800">¿Qué llegó en lugar de {linea.sku}?</div>
                <BuscadorArticulo
                  elegido={otroArticulo}
                  onElegir={setOtroArticulo}
                  onLimpiar={() => setOtroArticulo(null)}
                />
                <input
                  type="number"
                  min="0"
                  value={otraCantidad}
                  onChange={(e) => setOtraCantidad(e.target.value)}
                  placeholder="Cuántas llegaron"
                  aria-label="Cantidad del artículo que llegó"
                  className="w-28 border border-[var(--border)] rounded-lg px-2 py-1 text-[12px]"
                />
                <div className="text-[10px] text-[var(--sub)]">
                  Arriba dejá la cantidad que llegó de {linea.sku} (0 si no llegó nada). El artículo que llegó queda
                  frenado hasta que el otro depósito lo acepte.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-[10px] text-gray-400 mt-0.5">Corregí si no coincide contra lo físico</div>
        )}
      </td>
      <td className="px-3.5 py-1.5">
        <button
          onClick={() =>
            onConfirmar(
              linea,
              cantNum,
              difiere ? { motivo, nota } : null,
              esOtroArticulo ? { articulo: otroArticulo, cantidad: otraNum } : null
            )
          }
          disabled={deshabilitado}
          title={
            difiere
              ? 'Queda frenado: no se mueve stock ni se cierra el pedido hasta que lo marques "Revisado"'
              : 'Coincide con lo enviado: se cierra OK y se registra el movimiento de stock'
          }
          className={`px-2.5 py-1 rounded text-[11px] font-semibold text-white disabled:opacity-50 ${
            difiere ? 'bg-amber-600' : 'bg-[var(--grn,#059669)]'
          }`}
        >
          {guardando ? 'Guardando…' : difiere ? '⚠ Confirmar con diferencia' : '✓ Confirmar recibido'}
        </button>
        {difiere && faltaMotivo && (
          <div className="text-[10px] text-amber-700 mt-1">Falta el motivo</div>
        )}
        {faltaOtro && !faltaMotivo && (
          <div className="text-[10px] text-amber-700 mt-1">Falta indicar qué llegó y cuántas</div>
        )}
      </td>
    </tr>
  )
}

// Artículo frenado por diferencia: lo resuelve quien recibe con "Revisado".
function FilaConDiferencia({ linea, onRevisar, guardando, solicitud }) {
  const [cantidad, setCantidad] = useState(numInput(linea.cantidad_recibida))
  const [nota, setNota] = useState('')
  const cantNum = cantidad === '' ? null : Number(cantidad)
  const valida = cantNum != null && !Number.isNaN(cantNum) && cantNum >= 0
  const dif = Number(linea.cantidad_recibida) - Number(linea.cantidad_enviada)
  const origenNombre = solicitud ? nombreDeposito(solicitud.deposito_origen_id) : null
  // 18/11/2026 — de qué pedido es y quién lo envió (antes no se veía).
  const infoPedido = (
    <div className="text-[10px] text-[var(--sub)] mt-0.5">
      Remito {solicitud?.remito_numero ?? `#${linea.solicitud_id}`}
      {origenNombre ? ` · lo envió ${origenNombre}` : ''}
    </div>
  )
  // 18/11/2026 — artículo que no estaba en el remito: lo acepta o rechaza el depósito que envió.
  if (linea.no_previsto) {
    return (
      <tr className="border-b border-gray-100 last:border-0 align-top bg-amber-50/40">
        <td className="px-3.5 py-1.5 font-mono text-xs">{linea.sku}</td>
        <td className="px-3.5 py-1.5 text-sm">
          {linea.mate_nombre}
          {infoPedido}
        </td>
        <td className="px-3.5 py-1.5 text-sm">
          <div>Recibido {num(linea.cantidad_recibida)}</div>
          <div className="text-[11px] font-semibold text-amber-700">
            No estaba en el remito — lo acepta o rechaza {origenNombre ?? 'el depósito que envió'}
          </div>
          <div className="text-[11px] text-[var(--sub)] mt-0.5">
            {linea.motivo_diferencia}
            {linea.nota_diferencia ? ` — ${linea.nota_diferencia}` : ''}
          </div>
          <div className="text-[10px] text-gray-400">{formatoFechaHora(linea.recibida_en)}</div>
        </td>
        <td className="px-3.5 py-1.5 text-[11px] text-[var(--sub)]" colSpan={2}>
          Pendiente de que el otro depósito lo acepte. No se movió stock.
        </td>
      </tr>
    )
  }
  return (
    <tr className="border-b border-gray-100 last:border-0 align-top">
      <td className="px-3.5 py-1.5 font-mono text-xs">{linea.sku}</td>
      <td className="px-3.5 py-1.5 text-sm">
        {linea.mate_nombre}
        {infoPedido}
      </td>
      <td className="px-3.5 py-1.5 text-sm">
        <div>Enviado {num(linea.cantidad_enviada)} · recibido {num(linea.cantidad_recibida)}</div>
        <div className="text-[11px] font-semibold text-amber-700">
          {dif < 0 ? `Faltan ${num(-dif)} u` : `Sobran ${num(dif)} u`}
        </div>
        <div className="text-[11px] text-[var(--sub)] mt-0.5">
          {linea.motivo_diferencia}
          {linea.nota_diferencia ? ` — ${linea.nota_diferencia}` : ''}
        </div>
        <div className="text-[10px] text-gray-400">{formatoFechaHora(linea.recibida_en)}</div>
      </td>
      <td className="px-3.5 py-1.5">
        <input
          type="number"
          min="0"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          aria-label={`Cantidad final recibida de ${linea.sku}`}
          className="w-24 border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
        />
        <div className="text-[10px] text-gray-400 mt-0.5">Cantidad final (corregí si recontaste)</div>
        <input
          type="text"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Qué se resolvió (opcional)"
          className="mt-1 w-full max-w-[230px] border border-[var(--border)] rounded-lg px-2 py-1 text-[12px]"
        />
      </td>
      <td className="px-3.5 py-1.5">
        <button
          onClick={() => onRevisar(linea, cantNum, nota)}
          disabled={guardando || !valida}
          title="Cierra el artículo con esta cantidad y registra el movimiento de stock"
          className="px-2.5 py-1 rounded text-[11px] font-semibold text-white bg-[var(--grn,#059669)] disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : '✓ Revisado'}
        </button>
      </td>
    </tr>
  )
}

export default function ConfirmarRecepcion() {
  const permisos = usePermisos()
  // 23/10/2026 — modo prueba YiQi (no autorizado Live)
  const { modoPrueba } = useModoPruebaYiqi()
  const [lineas, setLineas] = useState([])
  // 17/11/2026 — artículos frenados por diferencia (estado 'con_diferencia').
  const [conDiferencia, setConDiferencia] = useState([])
  // 17/11/2026 — linea_id -> última corrección de lo enviado (reposicion_lineas_eventos).
  const [correcciones, setCorrecciones] = useState({})
  const [solicitudesPorId, setSolicitudesPorId] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  // SKU -> clase_abc real (Aris) — solo para el remito impreso, mismo
  // criterio que SolicitudesParaPreparar.jsx (10/9/2026, v3).
  const [claseAbcPorSku, setClaseAbcPorSku] = useState({})

  const misDepositos = permisos.misDepositos ?? []
  const claveFiltro = permisos.cargando || permisos.error ? null : misDepositos.join(',')

  useEffect(() => {
    // Membrete para el remito imprimible — igual que en SolicitudesParaPreparar.jsx.
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
      setLineas([])
      setConDiferencia([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: solicitudes, error: errSol } = await supabase
        .from('solicitudes_reposicion')
        .select('id, remito_numero, deposito_origen_id, deposito_destino_id, creada_en')
        .in('deposito_destino_id', misDepositos)
        .eq('estado', 'en_preparacion')
      if (errSol) throw errSol

      const mapaSol = {}
      for (const s of solicitudes ?? []) mapaSol[s.id] = s
      setSolicitudesPorId(mapaSol)

      const idsSolicitud = (solicitudes ?? []).map((s) => s.id)
      if (!idsSolicitud.length) {
        setLineas([])
        setConDiferencia([])
        return
      }

      const { data: filasLineas, error: errLin } = await supabase
        .from('solicitudes_reposicion_lineas')
        .select('*')
        .in('solicitud_id', idsSolicitud)
        .in('estado_linea', ['declarada', 'con_diferencia'])
        // 18/11/2026 — los no previstos tienen cantidad_enviada 0: se ven igual si están frenados.
        .or('cantidad_enviada.gt.0,estado_linea.eq.con_diferencia')
        .order('sku')
      if (errLin) throw errLin
      setLineas((filasLineas ?? []).filter((l) => l.estado_linea === 'declarada'))
      setConDiferencia((filasLineas ?? []).filter((l) => l.estado_linea === 'con_diferencia'))

      // Correcciones de lo enviado (si la tabla de historial no existe, se ignora).
      const idsDeclaradas = (filasLineas ?? []).filter((l) => l.estado_linea === 'declarada').map((l) => l.id)
      if (idsDeclaradas.length) {
        const { data: evs } = await supabase
          .from('reposicion_lineas_eventos')
          .select('linea_id, cantidad_anterior, motivo, creado_en')
          .eq('evento', 'envio_corregido')
          .in('linea_id', idsDeclaradas)
          .order('creado_en')
        const mapaCorr = {}
        for (const e of evs ?? []) mapaCorr[e.linea_id] = e
        setCorrecciones(mapaCorr)
      } else {
        setCorrecciones({})
      }

      // Clase ABC congelada en la línea al generarse el remito
      // (migración 20260930100000). El depósito no llama más a
      // reposicion_interna(): no necesita ver ventas.
      const mapaAbc = {}
      for (const l of filasLineas ?? []) if (l.clase_abc) mapaAbc[l.sku] = l.clase_abc
      setClaseAbcPorSku(mapaAbc)
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

  function moverStock(linea) {
    // Fire-and-forget: dispara el movimiento real en YiQi. Un error
    // acá nunca deshace el "recibido" ya confirmado (regla de oro,
    // igual que mover-stock-yiqi).
    // 23/10/2026 — modo prueba YiQi (no autorizado Live): si la función
    // responde modo_prueba no es un error; la recepción quedó solo en la app.
    supabase.functions
      .invoke('mover-stock-reposicion', { body: { linea_id: linea.id } })
      .then(({ data }) => {
        if (data?.modo_prueba) {
          setAviso(`${linea.sku} confirmado como recibido. Modo prueba: no se movió stock en YiQi.`)
          setTimeout(() => setAviso(null), 4000)
        }
      })
      .catch((e) => console.error('[mover-stock-reposicion]', e))
  }

  function avisar(texto) {
    setAviso(texto)
    setTimeout(() => setAviso(null), 5000)
  }

  async function confirmarRecepcion(linea, cantidadRecibida, diferencia, otro = null) {
    setConfirmando(linea.id)
    setError(null)
    try {
      const { data: estado, error: errRpc } = await supabase.rpc('confirmar_recepcion_linea', {
        p_linea_id: linea.id,
        p_cantidad_recibida: cantidadRecibida,
        p_motivo_diferencia: diferencia?.motivo ?? null,
        p_nota_diferencia: diferencia?.nota ?? null,
      })
      if (errRpc) throw errRpc

      // 18/11/2026 — "Llegó otro artículo": además de confirmar este, se asienta el que llegó.
      if (otro?.articulo) {
        const { error: errNo } = await supabase.rpc('registrar_no_previsto', {
          p_solicitud_id: linea.solicitud_id,
          p_sku: otro.articulo.mate_codigo,
          p_cantidad: otro.cantidad,
          p_motivo: diferencia?.motivo ?? MOTIVO_OTRO_ARTICULO,
          p_nota: `En lugar de ${linea.sku}${diferencia?.nota ? ` — ${diferencia.nota}` : ''}`,
          p_reemplaza_linea_id: linea.id,
        })
        if (errNo) {
          await cargar()
          throw new Error(
            `Se confirmó ${linea.sku} con diferencia, pero no se pudo registrar el artículo que llegó: ${errNo.message}. ` +
              'Registralo con "+ Llegó algo que no está en el remito".'
          )
        }
        // Si del artículo del remito no llegó nada, no queda nada que revisar: se cierra con 0 (no mueve stock).
        if (estado === 'con_diferencia' && Number(cantidadRecibida) === 0) {
          await supabase.rpc('revisar_diferencia_linea', {
            p_linea_id: linea.id,
            p_cantidad_final: 0,
            p_nota: `Llegó ${otro.articulo.mate_codigo} en su lugar`,
          })
        }
        await cargar()
        avisar(
          `${linea.sku} confirmado con diferencia y ${otro.articulo.mate_codigo} registrado como "no estaba en el remito". ` +
            'No se movió stock: el depósito que envió tiene que aceptarlo.'
        )
        return
      }

      setLineas((prev) => prev.filter((l) => l.id !== linea.id))
      if (estado === 'con_diferencia') {
        // 17/11/2026 — frenado: no se mueve stock hasta "Revisado".
        setConDiferencia((prev) => [
          ...prev,
          {
            ...linea,
            estado_linea: 'con_diferencia',
            cantidad_recibida: cantidadRecibida,
            motivo_diferencia: diferencia?.motivo,
            nota_diferencia: diferencia?.nota,
            recibida_en: new Date().toISOString(),
          },
        ])
        avisar(`${linea.sku} quedó frenado por diferencia. No se movió stock: revisalo arriba y marcalo "Revisado".`)
        return
      }

      moverStock(linea)
      avisar(
        modoPrueba
          ? `${linea.sku} confirmado como recibido. Modo prueba: no se movió stock en YiQi.`
          : `${linea.sku} confirmado como recibido.`
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setConfirmando(null)
    }
  }

  // 18/11/2026 — artículo que llegó y no estaba en el remito (desde el encabezado del pedido).
  async function registrarNoPrevisto({ solicitudId, articulo, cantidad, nota }) {
    setError(null)
    try {
      const { error: errRpc } = await supabase.rpc('registrar_no_previsto', {
        p_solicitud_id: Number(solicitudId),
        p_sku: articulo.mate_codigo,
        p_cantidad: cantidad,
        p_motivo: 'Llegó algo que no estaba en el remito',
        p_nota: nota?.trim() || null,
        p_reemplaza_linea_id: null,
      })
      if (errRpc) throw errRpc
      await cargar()
      avisar(`${articulo.mate_codigo} registrado como "no estaba en el remito". No se movió stock: el depósito que envió tiene que aceptarlo.`)
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  async function revisarDiferencia(linea, cantidadFinal, nota) {
    setConfirmando(linea.id)
    setError(null)
    try {
      const { error: errRpc } = await supabase.rpc('revisar_diferencia_linea', {
        p_linea_id: linea.id,
        p_cantidad_final: cantidadFinal,
        p_nota: nota || null,
      })
      if (errRpc) throw errRpc
      // Con cantidad final 0 no hay nada que mover (no se manda un movimiento vacío a YiQi).
      if (Number(cantidadFinal) > 0) moverStock(linea)
      setConDiferencia((prev) => prev.filter((l) => l.id !== linea.id))
      avisar(
        modoPrueba
          ? `${linea.sku} revisado y cerrado con ${num(cantidadFinal)} u. Modo prueba: no se movió stock en YiQi.`
          : `${linea.sku} revisado y cerrado con ${num(cantidadFinal)} u.`
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setConfirmando(null)
    }
  }

  const cargandoAlgo = loading || permisos.cargando

  const grupos = {}
  for (const l of lineas) {
    if (!grupos[l.solicitud_id]) grupos[l.solicitud_id] = []
    grupos[l.solicitud_id].push(l)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white">
        <div className="text-[17px] font-bold">Confirmar recepción</div>
        <div className="text-[12px] text-[var(--sub)] mt-0.5">
          {cargandoAlgo
            ? 'Cargando…'
            : `${lineas.length} artículo${lineas.length === 1 ? '' : 's'} esperando confirmación` +
              (conDiferencia.length
                ? ` · ${conDiferencia.length} frenado${conDiferencia.length === 1 ? '' : 's'} por diferencia`
                : '')}
        </div>
      </div>

      <Aviso tipo="info" id="deposito-recepcion-criterio" className="mx-4 mt-4">
        Confirmá contra lo que realmente llegó. Si coincide con lo enviado, el artículo se cierra OK. Si no coincide,
        corregí la cantidad y elegí el motivo: ese artículo queda frenado (no se mueve su stock y el pedido sigue
        abierto) hasta que lo marques &quot;Revisado&quot;. Los demás se cierran igual —{' '}
        {/* 10/11/2026 — radiografía UX (ítem 12): en modo prueba no se mueve stock en YiQi. */}
        {modoPrueba
          ? 'el movimiento se registra en la app recién con esta confirmación (no en YiQi), no antes.'
          : 'el movimiento de stock real se registra recién con esta confirmación, no antes.'}
      </Aviso>

      {/* 23/10/2026 — modo prueba YiQi (no autorizado Live) */}
      {modoPrueba && (
        <AvisoModoPrueba className="mx-4 mt-4">
          Modo prueba: confirmar recepción registra lo recibido en la app, pero no mueve stock en YiQi.
        </AvisoModoPrueba>
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
        {/* 17/11/2026 — Parte B: artículos frenados por diferencia, los resuelve quien recibe. */}
        {conDiferencia.length > 0 && (
          <div className="bg-white rounded-xl border border-amber-300 overflow-hidden">
            <div className="px-3.5 py-2.5 bg-amber-50 border-b border-amber-200">
              <div className="font-bold text-sm text-amber-800">
                ⚠ Recibido con diferencia — pendiente de revisar ({conDiferencia.length})
              </div>
              <div className="text-[11px] text-amber-800/80 mt-0.5">
                Estos artículos están frenados: no se movió su stock y el pedido no se cierra. Si en el otro depósito
                no tenían esa cantidad, la corrigen ellos desde su panel (&quot;Corregir lo enviado&quot;) y el artículo te
                vuelve abajo para confirmar. Los artículos &quot;No estaba en el remito&quot; los acepta o rechaza el otro depósito. Si se perdió o se rompió en el camino, poné la cantidad final y marcá
                &quot;Revisado&quot;.
              </div>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  {['SKU', 'Producto', 'Diferencia', 'Cantidad final', ''].map((h) => (
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
                {conDiferencia.map((l) => (
                  <FilaConDiferencia
                    key={l.id}
                    linea={l}
                    onRevisar={revisarDiferencia}
                    guardando={confirmando === l.id}
                    solicitud={solicitudesPorId[l.solicitud_id]}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cargandoAlgo && lineas.length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            Cargando…
          </div>
        ) : Object.keys(grupos).length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center text-[var(--sub)] text-sm">
            {conDiferencia.length ? 'No hay más envíos para confirmar.' : 'No tenés nada pendiente de confirmar. 🎉'}
          </div>
        ) : (
          Object.entries(grupos).map(([solicitudId, filasLineas]) => {
            const s = solicitudesPorId[solicitudId]
            return (
              <div key={solicitudId} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="px-3.5 py-2.5 bg-gray-50 border-b border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <span className="font-bold text-sm">{s?.remito_numero ?? `Solicitud #${solicitudId}`}</span>
                    <span className="text-[11px] text-[var(--sub)] ml-2">
                      {deDeposito(s?.deposito_origen_id)} · {formatoFechaHora(s?.creada_en)}
                    </span>
                    {/* 18/11/2026 — copia firmada del remito (la sube quien recibe). */}
                    <div className="mt-1">
                      <RemitoFirmado solicitudId={Number(solicitudId)} puedeSubir compacto />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                  <AgregarNoPrevisto solicitudId={solicitudId} onRegistrar={registrarNoPrevisto} />
                  <button
                    onClick={() =>
                      generarRemitoImprimible({
                        solicitud: s ?? { id: solicitudId },
                        lineas: filasLineas,
                        empresa,
                        claseAbcPorSku,
                      })
                    }
                    title="Confirmá contra este remito impreso, no solo contra la pantalla"
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50"
                  >
                    🖨️ Ver / imprimir remito
                  </button>
                  </div>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['SKU', 'Producto', 'En tránsito', 'Cantidad recibida', ''].map((h) => (
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
                    {filasLineas.map((l) => (
                      <FilaLineaDeclarada
                        key={l.id}
                        linea={l}
                        onConfirmar={confirmarRecepcion}
                        guardando={confirmando === l.id}
                        correccion={correcciones[l.id]}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
