import { useState } from 'react'
import { supabase } from '../lib/supabase'

// ============================================================
// CambiarMiPassword.jsx — 30/9/2026
// ============================================================
// Cada usuario cambia su propia contraseña (supabase.auth.updateUser),
// sin pasar por el admin. Pedido de Federico (30/9/2026): hoy todas
// las cuentas arrancan con la misma clave; cada persona tiene que
// poder poner la suya. El admin sigue pudiendo restablecer claves
// ajenas desde Usuarios y accesos.
//
// Se usa en el pie del Sidebar (app de compras) y de AppDeposito.
// ============================================================

const MINIMO = 8

function traducirError(err) {
  const code = err?.code || ''
  const msg = String(err?.message || '')
  if (code === 'same_password' || /different from the old/i.test(msg))
    return 'La contraseña nueva tiene que ser distinta de la actual.'
  if (code === 'weak_password' || /weak|at least/i.test(msg))
    return 'La contraseña es muy débil. Probá con una más larga, mezclando letras y números.'
  if (code === 'reauthentication_needed' || /reauthenticat/i.test(msg))
    return 'Por seguridad hay que volver a iniciar sesión antes de cambiarla. Cerrá sesión, entrá de nuevo y probá otra vez.'
  if (/session/i.test(msg)) return 'La sesión venció. Cerrá sesión, entrá de nuevo y probá otra vez.'
  return msg || 'No se pudo cambiar la contraseña.'
}

export default function CambiarMiPassword() {
  const [abierto, setAbierto] = useState(false)
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [listo, setListo] = useState(false)

  function cerrar() {
    setAbierto(false)
    setNueva('')
    setRepetir('')
    setError(null)
    setListo(false)
  }

  const corta = nueva.length > 0 && nueva.length < MINIMO
  const noCoinciden = repetir.length > 0 && nueva !== repetir
  const invalida = nueva.length < MINIMO || nueva !== repetir

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const { error: err } = await supabase.auth.updateUser({ password: nueva })
      if (err) throw err
      setListo(true)
      setNueva('')
      setRepetir('')
    } catch (err) {
      setError(traducirError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-[10px] text-[var(--sub)] hover:text-[var(--ind)] hover:underline text-left"
        title="Cambiar mi contraseña"
      >
        🔑 Cambiar mi contraseña
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl border border-[var(--border)] shadow-lg w-full max-w-sm p-5">
            <div className="text-[15px] font-bold mb-3">🔑 Cambiar mi contraseña</div>

            {listo ? (
              <>
                <div className="text-[13px] text-[var(--grn,#15803d)] font-semibold">
                  Listo, tu contraseña quedó cambiada.
                </div>
                <div className="text-[12px] text-[var(--sub)] mt-1">
                  La próxima vez que entres, usá la nueva.
                </div>
                <div className="flex justify-end mt-4">
                  <button
                    onClick={cerrar}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--ind)]"
                  >
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="text-[12px] text-gray-600 font-semibold">Contraseña nueva</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  className="mt-1 w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                />
                {corta && <div className="text-[11px] text-[var(--red)] mt-1">Mínimo {MINIMO} caracteres.</div>}

                <label className="text-[12px] text-gray-600 font-semibold mt-3 block">Repetila</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={repetir}
                  onChange={(e) => setRepetir(e.target.value)}
                  className="mt-1 w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                />
                {noCoinciden && <div className="text-[11px] text-[var(--red)] mt-1">No coinciden.</div>}

                {error && (
                  <div className="text-[12px] text-[var(--red)] bg-[var(--red-bg,#fef2f2)] rounded-lg px-3 py-2 mt-3">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={cerrar}
                    disabled={guardando}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--border)] bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={guardar}
                    disabled={guardando || invalida}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--ind)] disabled:opacity-50"
                  >
                    {guardando ? 'Guardando…' : 'Cambiar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
