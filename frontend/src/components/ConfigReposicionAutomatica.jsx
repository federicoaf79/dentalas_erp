import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatoNumero } from '../lib/formato'
import Pastilla from './ui/Pastilla'

// ============================================================
// components/ConfigReposicionAutomatica.jsx — 18/11/2026
// ============================================================
// Pedido de Aris: "lo que más me interesa es activar el automático".
// Tarjeta (solo admin) con el interruptor de la reposición automática
// Central → Local y sus parámetros. Habla con dos RPC de la migración
// 20261118130000: estado_reposicion_automatica() y
// configurar_reposicion_automatica(). Si todavía no están aplicadas
// (migración sin correr) muestra un aviso discreto y no rompe nada.
// El interruptor real es reglas_reposicion_central.activa: el cron
// queda siempre activo y la función decide por esa columna.
// ============================================================

function fechaHora(valor) {
  if (!valor) return '—'
  try {
    return new Date(valor).toLocaleString('es-AR', { hourCycle: 'h23' })
  } catch {
    return String(valor)
  }
}

// La RPC no existe todavía (migración sin aplicar): PostgREST devuelve PGRST202 / 42883.
function rpcNoExiste(error) {
  if (!error) return false
  const m = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  return m.includes('pgrst202') || m.includes('42883') || m.includes('could not find the function') || m.includes('does not exist')
}

export default function ConfigReposicionAutomatica({ onCambio }) {
  const [estado, setEstado] = useState(null)
  const [candidatos, setCandidatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [noDisponible, setNoDisponible] = useState(false)
  const [errorCarga, setErrorCarga] = useState(null)

  // Borrador del formulario (la frecuencia se edita en horas, se guarda en minutos).
  const [horas, setHoras] = useState('4')
  const [maximo, setMaximo] = useState('30')
  const [umbral, setUmbral] = useState('0')

  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState(null)
  const [mensaje, setMensaje] = useState(null)
  const [detalleAbierto, setDetalleAbierto] = useState(false)

  const aplicarRegla = useCallback((regla) => {
    if (!regla) return
    setHoras(String(Math.round((Number(regla.frecuencia_minutos) / 60) * 100) / 100))
    setMaximo(String(regla.maximo_lineas ?? 30))
    setUmbral(String(regla.umbral_deficit ?? 0))
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    setErrorCarga(null)
    try {
      const { data, error } = await supabase.rpc('estado_reposicion_automatica')
      if (error) {
        if (rpcNoExiste(error)) setNoDisponible(true)
        else setErrorCarga(error.message)
        setEstado(null)
        return
      }
      setNoDisponible(false)
      setEstado(data)
      aplicarRegla(data?.regla)
      // Lo más caro (recorre el universo) se pide aparte para no demorar la tarjeta.
      supabase
        .rpc('estado_reposicion_automatica', { p_incluir_candidatos: true })
        .then(({ data: d2, error: e2 }) => {
          if (!e2 && d2?.candidatos) setCandidatos(d2.candidatos)
        })
        .catch(() => {})
    } catch (err) {
      setErrorCarga(err.message)
    } finally {
      setCargando(false)
    }
  }, [aplicarRegla])

  useEffect(() => {
    cargar()
  }, [cargar])

  const regla = estado?.regla ?? null
  const activa = regla?.activa === true
  const cronActivo = estado?.cron_activo === true

  function leerFormulario() {
    const h = Number(String(horas).replace(',', '.'))
    const m = Number(maximo)
    const u = Number(String(umbral).replace(',', '.'))
    if (!Number.isFinite(h) || h < 1 || h > 24) return { error: 'La frecuencia tiene que estar entre 1 y 24 horas.' }
    if (!Number.isInteger(m) || m < 1 || m > 100) return { error: 'El máximo de artículos por remito tiene que ser un entero entre 1 y 100.' }
    if (!Number.isFinite(u) || u < 0) return { error: 'El umbral no puede ser negativo.' }
    return { minutos: Math.round(h * 60), maximo: m, umbral: u }
  }

  async function guardar(nuevaActiva) {
    setErrorGuardar(null)
    setMensaje(null)
    const f = leerFormulario()
    if (f.error) {
      setErrorGuardar(f.error)
      setConfirmando(false)
      return
    }
    setGuardando(true)
    try {
      const { error } = await supabase.rpc('configurar_reposicion_automatica', {
        p_activa: nuevaActiva,
        p_frecuencia_minutos: f.minutos,
        p_maximo_lineas: f.maximo,
        p_umbral_deficit: f.umbral,
      })
      if (error) throw error
      setMensaje(
        nuevaActiva === activa
          ? 'Cambios guardados.'
          : nuevaActiva
            ? 'Reposición automática activada.'
            : 'Reposición automática pausada.'
      )
      setConfirmando(false)
      setCandidatos(null)
      await cargar()
      onCambio?.()
    } catch (err) {
      setErrorGuardar(err.message || 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  function clicInterruptor() {
    setErrorGuardar(null)
    setMensaje(null)
    if (activa) guardar(false)
    else setConfirmando(true)
  }

  if (cargando && !estado && !noDisponible) {
    return (
      <div className="bg-white rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--sub)]">
        Cargando la reposición automática…
      </div>
    )
  }

  if (noDisponible) {
    return (
      <div className="bg-white rounded-xl border border-[var(--border)] px-4 py-3 text-[12px] text-[var(--sub)]">
        El interruptor de la reposición automática todavía no está disponible: falta aplicar la migración
        20261118130000 en la base.
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div className="bg-white rounded-xl border border-[var(--border)] px-4 py-3 text-[12px] text-[var(--sub)]">
        No se pudo leer el estado de la reposición automática: {errorCarga}
      </div>
    )
  }

  const horasTexto = formatoNumero(Number(regla?.frecuencia_minutos ?? 240) / 60, { decimales: 2, minDecimales: 0 })
  const hayCambiosSinGuardar =
    regla &&
    (Number(String(horas).replace(',', '.')) * 60 !== Number(regla.frecuencia_minutos) ||
      Number(maximo) !== Number(regla.maximo_lineas) ||
      Number(String(umbral).replace(',', '.')) !== Number(regla.umbral_deficit))

  return (
    <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3.5 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold">Reposición automática Central → Local</h2>
            <Pastilla tono={activa ? 'verde' : 'gris'}>{activa ? 'Activada' : 'Pausada'}</Pastilla>
          </div>
          <p className="text-[12px] text-[var(--sub)] mt-1">
            {activa
              ? `Cada ${horasTexto} h el sistema revisa el stock del Local y, si hay artículos en o por debajo del punto de pedido, crea un pedido a Central.`
              : 'Pausada: el sistema no crea pedidos solo. Los pedidos manuales siguen funcionando.'}
          </p>
        </div>

        {/* Interruptor grande */}
        <button
          type="button"
          role="switch"
          aria-checked={activa}
          aria-label="Reposición automática Central a Local"
          disabled={guardando || !regla}
          onClick={clicInterruptor}
          className={`relative inline-flex items-center h-10 w-[148px] rounded-full border transition-colors shrink-0 ${
            activa ? 'bg-[var(--grn,#059669)] border-[var(--grn,#059669)]' : 'bg-gray-200 border-gray-300'
          } ${guardando ? 'opacity-60' : ''}`}
        >
          <span
            className={`absolute top-1 h-8 w-8 rounded-full bg-white shadow transition-all ${activa ? 'left-[108px]' : 'left-1'}`}
          />
          <span
            className={`w-full text-[13px] font-bold ${activa ? 'text-white pr-10 text-left pl-4' : 'text-gray-600 pl-10 text-right pr-4'}`}
          >
            {activa ? 'Activada' : 'Pausada'}
          </span>
        </button>
      </div>

      {!regla && (
        <div className="px-4 pb-3 text-[12px] text-[#92400e]">
          Todavía no hay una regla cargada: al guardar se crea.
        </div>
      )}

      {activa && !cronActivo && (
        <div className="mx-4 mb-3 bg-[var(--yel-bg,#fef3c7)] border border-amber-200 text-[#92400e] rounded-lg px-3 py-2 text-[12px]">
          La regla está activada pero el proceso programado del servidor figura pausado, así que no va a
          generar pedidos. Avisale a Federico.
        </div>
      )}

      {confirmando && (
        <div className="mx-4 mb-3 bg-blue-50 border border-blue-100 text-[#1d4ed8] rounded-lg px-3.5 py-3 text-[13px]">
          <div className="font-semibold mb-1">¿Activar la reposición automática?</div>
          <div>
            Cada {formatoNumero(Number(String(horas).replace(',', '.')) || 0, { decimales: 2, minDecimales: 0 })} horas el
            sistema revisa el stock del Local y, si hay artículos en o por debajo del punto de pedido, crea un pedido a
            Central. Central tiene que declarar a mano lo que envía.
          </div>
          <div className="flex gap-2 mt-2.5">
            <button className="btn btn-sm" disabled={guardando} onClick={() => guardar(true)}>
              {guardando ? 'Activando…' : 'Sí, activar'}
            </button>
            <button className="btn btn-sm" disabled={guardando} onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Parámetros */}
      <div className="px-4 pb-3 grid gap-3 sm:grid-cols-3">
        <label className="text-[12px] text-[var(--sub)] flex flex-col gap-1">
          <span className="font-semibold text-[var(--tx,inherit)]">Frecuencia (en horas)</span>
          <input
            type="number" min="1" max="24" step="1" inputMode="decimal"
            value={horas} onChange={(e) => setHoras(e.target.value)}
            className="border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-sm w-full"
          />
          <span>Entre 1 y 24. Cada cuánto revisa si hay que pedir.</span>
        </label>
        <label className="text-[12px] text-[var(--sub)] flex flex-col gap-1">
          <span className="font-semibold text-[var(--tx,inherit)]">Máximo de artículos por remito</span>
          <input
            type="number" min="1" max="100" step="1" inputMode="numeric"
            value={maximo} onChange={(e) => setMaximo(e.target.value)}
            className="border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-sm w-full"
          />
          <span>Entre 1 y 100. Si hay más, arma el pedido siguiente.</span>
        </label>
        <label className="text-[12px] text-[var(--sub)] flex flex-col gap-1">
          <span className="font-semibold text-[var(--tx,inherit)]">Umbral (unidades)</span>
          <input
            type="number" min="0" step="any" inputMode="decimal"
            value={umbral} onChange={(e) => setUmbral(e.target.value)}
            className="border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-sm w-full"
          />
          <span>Un artículo solo se pide si le faltan al menos estas unidades. 0 = cualquier faltante.</span>
        </label>
      </div>

      <div className="px-4 pb-3 flex flex-wrap items-center gap-3">
        <button className="btn btn-sm" disabled={guardando || confirmando || (!!regla && !hayCambiosSinGuardar)} onClick={() => guardar(activa)}>
          {guardando && !confirmando ? 'Guardando…' : 'Guardar'}
        </button>
        {errorGuardar && <span className="text-[12px] text-[var(--red)]">{errorGuardar}</span>}
        {mensaje && <span className="text-[12px] text-green-700">{mensaje}</span>}
      </div>

      {/* Estado: último pedido, cuántos entrarían hoy, quién lo configuró */}
      <div className="border-t border-gray-100 bg-gray-50 px-4 py-2.5 text-[12px] text-[var(--sub)] flex flex-wrap gap-x-6 gap-y-1">
        <span>
          Último pedido automático:{' '}
          {estado?.ultimo_pedido_automatico ? (
            <strong className="text-[var(--tx,inherit)]">
              {estado.ultimo_pedido_automatico.remito_numero || `#${estado.ultimo_pedido_automatico.id}`} ·{' '}
              {fechaHora(estado.ultimo_pedido_automatico.creada_en)} · {estado.ultimo_pedido_automatico.estado}
            </strong>
          ) : (
            'todavía ninguno'
          )}
        </span>
        <span>
          Hoy entrarían:{' '}
          {candidatos ? (
            <strong className="text-[var(--tx,inherit)]">
              {formatoNumero(candidatos.total, { decimales: 0 })} artículos
              {candidatos.total > candidatos.primer_remito
                ? ` (${formatoNumero(candidatos.primer_remito, { decimales: 0 })} en el primer remito)`
                : ''}
            </strong>
          ) : (
            'calculando…'
          )}
        </span>
        {regla?.actualizada_en && (
          <span>
            Última configuración: {fechaHora(regla.actualizada_en)}
            {regla.actualizada_por_email ? ` · ${regla.actualizada_por_email}` : ''}
          </span>
        )}
      </div>

      {/* Cómo arma el remito */}
      <div className="border-t border-gray-100 px-4 py-2.5">
        <button
          type="button"
          className="text-[12px] font-semibold text-[var(--ind)]"
          onClick={() => setDetalleAbierto((v) => !v)}
        >
          {detalleAbierto ? '▾' : '▸'} Cómo arma el remito
        </button>
        {detalleAbierto && (
          <ul className="mt-2 text-[12px] text-[var(--sub)] list-disc pl-5 flex flex-col gap-1">
            <li>Entra lo que en el Local está en o por debajo del punto de pedido de YiQi.</li>
            <li>
              Cantidad = consumo mensual promedio del Local − stock del Local, con tope en el stock de Central y
              descontando lo que ya está reservado en otros remitos.
            </li>
            <li>Quedan afuera lo marcado «no hay», las publicaciones de Mercado Libre, los combos y los discontinuados.</li>
            <li>Prioridad: clase A sin stock, después B, después C sin stock, después poca cobertura y por último el resto.</li>
            <li>
              Si hay más artículos que el máximo por remito, el resto va en el pedido siguiente (solo mientras la
              reposición automática esté activada).
            </li>
            <li>Central declara a mano lo que envía: eso alimenta el control de diferencias al recibir.</li>
          </ul>
        )}
        <p className="mt-2 text-[12px] text-[var(--sub)]">
          Del Local hacia Central no hay reposición automática: a Central la repone Compras.
        </p>
      </div>
    </div>
  )
}
