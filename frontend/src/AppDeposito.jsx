import { useState } from 'react'
import SolicitudesParaPreparar from './pages/deposito/SolicitudesParaPreparar'
import ConfirmarRecepcion from './pages/deposito/ConfirmarRecepcion'
import PedirAlOtroDeposito from './pages/deposito/PedirAlOtroDeposito'

// ============================================================
// AppDeposito.jsx — 7/9/2026
// ============================================================
// Shell separado para las cuentas de depósito (Depósito Central /
// encargado del Local) del circuito de reposición automática
// Central<->Local. Ver DISENO_TECNICO_Reposicion_CentralLocal_
// 7-9-2026.md, sección 12.
//
// A propósito NO reusa <Sidebar> ni el array de currentPage de
// App.jsx: estas cuentas solo ven 3 pantallas acotadas a su propio
// depósito (la RLS ya lo garantiza del lado de datos; acá además no
// se les muestra ni un ítem de menú de Compras/OC/Alertas/Usuarios).
//
// Las 3 pantallas son las mismas para las dos cuentas: cada depósito
// es "origen" en un circuito y "destino" en el otro (Central: origen
// en el principal, destino en el inverso; el Local: al revés) — no
// hace falta duplicar lógica por rol, la RLS + los filtros por
// misDepositos ya resuelven qué ve cada uno.
// ============================================================

const NAV = [
  { key: 'preparar', label: 'Solicitudes para preparar', icon: '📋' },
  { key: 'recepcion', label: 'Confirmar recepción', icon: '✓' },
  { key: 'pedir', label: 'Pedir al otro depósito', icon: '📤' },
]

export default function AppDeposito({ nombreUsuario, onLogout }) {
  const [pagina, setPagina] = useState('preparar')

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-[220px] bg-white border-r border-[var(--border)] flex flex-col flex-shrink-0 h-screen">
        <div className="px-3.5 pt-3.5 pb-3 border-b border-[var(--border)]">
          <div className="text-[15px] font-bold">🦷 Dentalab</div>
          <div className="text-[10px] text-[var(--sub)] mt-0.5">Circuito de reposición</div>
        </div>

        <nav className="px-1.5 py-1.5 flex-1 overflow-y-auto">
          {NAV.map((item) => (
            <div
              key={item.key}
              onClick={() => setPagina(item.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-[13px] mb-0.5 select-none transition-colors
                ${
                  pagina === item.key
                    ? 'bg-[var(--ind-bg)] text-[var(--ind)] font-bold'
                    : 'text-gray-700 hover:bg-[var(--ind-bg)]'
                }`}
            >
              <span className="text-[15px] flex-shrink-0">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-[var(--border)] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[var(--ind-bg)] flex items-center justify-center text-[11px] font-bold text-[var(--ind)] flex-shrink-0 uppercase">
            {nombreUsuario.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold truncate capitalize">{nombreUsuario}</div>
            <div className="text-[10px] text-[var(--sub)]">Sesión activa</div>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              title="Cerrar sesión"
              className="text-[11px] text-gray-400 hover:text-[var(--red)] flex-shrink-0"
            >
              Salir
            </button>
          )}
        </div>
      </aside>

      {pagina === 'preparar' && <SolicitudesParaPreparar />}
      {pagina === 'recepcion' && <ConfirmarRecepcion />}
      {pagina === 'pedir' && <PedirAlOtroDeposito />}
    </div>
  )
}
