import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login({ onLoginExitoso }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (loginError) {
      setError('Email o contraseña incorrectos')
      return
    }

    onLoginExitoso(data.user)
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[#f7f8fa]">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[var(--border)] p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🦷</div>
          <div className="text-lg font-bold">Dentalab Compras</div>
          <div className="text-[12px] text-[var(--sub)] mt-1">Gestión de compras conectada a YiQi</div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <label className="text-[11px] text-[var(--sub)] uppercase tracking-wide font-semibold block mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm outline-none focus:border-[var(--ind)]"
              placeholder="tu@dentalab.com.ar"
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--sub)] uppercase tracking-wide font-semibold block mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm outline-none focus:border-[var(--ind)]"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-[var(--red-bg)] border border-[var(--red-bd)] text-[var(--red)] rounded-lg px-3 py-2 text-[12px]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[var(--ind)] text-white font-semibold text-sm hover:bg-[var(--ind-d)] disabled:opacity-50 mt-1"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
