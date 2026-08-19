// ------------------------------------------------------------
// Estructura de navegación — copiada 1:1 del prototipo v8
// aprobado por el cliente. No reordenar sin confirmar.
// ------------------------------------------------------------
const NAV_PRINCIPAL = [
  { key: 'stock', label: 'Monitor de stock', icon: '📦' },
  { key: 'reposicion', label: 'Reposición interna', icon: '🔁' },
  { key: 'alertas', label: 'Alertas', icon: '🔔' },
]

const NAV_COMPRAS = [
  { key: 'ocs', label: 'Órdenes de compra', icon: '📋' },
  { key: 'seguimiento', label: 'Seguimiento de OC', icon: '🔄' },
  { key: 'historial', label: 'Historial de OC', icon: '🕐' },
  { key: 'nueva-oc', label: 'Nueva OC', icon: '📝' },
]

const NAV_INTELIGENCIA = [
  { key: 'predictor', label: 'Predictor de demanda', icon: '📈' },
]

const NAV_CONFIG = [
  { key: 'empresa', label: 'Datos de la empresa', icon: '🏢' },
  { key: 'proveedores', label: 'Proveedores', icon: '🏬' },
  { key: 'condiciones', label: 'Condiciones comerciales', icon: '🤝' },
  { key: 'usuarios', label: 'Usuarios y accesos', icon: '👥' },
  { key: 'causas', label: 'Catálogo de causas', icon: '🏷️' },
  { key: 'reglas', label: 'Reglas y alertas', icon: '⚙️' },
  { key: 'templates', label: 'Templates de mensajes', icon: '💬' },
  { key: 'yiqi', label: 'Conector YiQi', icon: '🔌' },
]

// ------------------------------------------------------------
// Badge que NO se dibuja cuando el valor es 0 o no esta cargado.
//
// Por que importa: los contadores ahora son reales y respetan los
// permisos del usuario. Un operador puede tener legitimamente 0 OC
// activas, y el badge de "requiere aprobacion" esta en 0 porque el
// flujo de aprobacion es Sprint 2. Mostrar un "0" colgado al lado
// del item se lee como error; no mostrar nada se lee como "no hay
// nada pendiente", que es la verdad.
// ------------------------------------------------------------
function Badge({ valor, clase }) {
  if (valor == null || valor === 0) return null
  return <span className={`nb ${clase}`}>{valor}</span>
}

function NavItem({ item, active, onClick, badges }) {
  return (
    <div
      onClick={() => onClick(item.key)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-[13px] mb-0.5 select-none transition-colors
        ${active
          ? 'bg-[var(--ind-bg)] text-[var(--ind)] font-bold'
          : 'text-gray-700 hover:bg-[var(--ind-bg)]'
        }`}
    >
      <span className="text-[15px] flex-shrink-0">{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      {badges && <div className="flex gap-1 items-center">{badges}</div>}
    </div>
  )
}

function NavSection({ title }) {
  return (
    <div className="text-[10px] text-gray-400 uppercase tracking-wider px-2.5 pt-3 pb-1">
      {title}
    </div>
  )
}

// Fecha corta para el header. Antes decia "en vivo", que no era cierto:
// los datos se sincronizan desde YiQi cada 15 minutos. Mostrar la hora
// real es un dato verificable en vez de una afirmacion que no se sostiene.
function formatoSyncCorto(valor) {
  if (!valor) return null
  try {
    const d = new Date(valor)
    if (isNaN(d.getTime())) return null
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

export default function Sidebar({
  currentPage,
  onNavigate,
  contadores = {},
  ultimaSync = null,
  nombreUsuario = 'Usuario',
  onLogout,
}) {
  // Todos los defaults en 0: si algo no cargo todavia, no se dibuja
  // ningun badge (mejor que mostrar numeros de prototipo).
  const {
    alertasStock = 0,
    alertasCriticas = 0,
    alertasPreventivas = 0,
    aprobacionPendiente = 0,
    ocsActivas = 0,
    seguimientoPendiente = 0,
  } = contadores

  const syncTexto = formatoSyncCorto(ultimaSync)

  return (
    <aside className="w-[228px] bg-white border-r border-[var(--border)] flex flex-col flex-shrink-0 h-screen">
      <div className="px-3.5 pt-3.5 pb-3 border-b border-[var(--border)]">
        <div className="text-[15px] font-bold">🦷 Dentalab</div>
        <div className="text-[10px] text-[var(--grn)] flex items-center gap-1 font-semibold mt-0.5">
          <span>●</span>
          {syncTexto ? `Sincronizado ${syncTexto}` : 'Sincronizando…'}
        </div>
      </div>

      <nav className="px-1.5 py-1.5 flex-1 overflow-y-auto">
        <NavSection title="Principal" />
        <NavItem
          item={NAV_PRINCIPAL[0]}
          active={currentPage === 'stock'}
          onClick={onNavigate}
          badges={<Badge valor={alertasStock} clase="nb-yel" />}
        />
        <NavItem
          item={NAV_PRINCIPAL[1]}
          active={currentPage === 'reposicion'}
          onClick={onNavigate}
        />
        <NavItem
          item={NAV_PRINCIPAL[2]}
          active={currentPage === 'alertas'}
          onClick={onNavigate}
          badges={
            <>
              <Badge valor={alertasCriticas} clase="nb-red" />
              <Badge valor={alertasPreventivas} clase="nb-yel" />
              {/* Azul = pedidos que requieren aprobacion de Aris.
                  El flujo es Sprint 2, hoy siempre 0 -> no se dibuja. */}
              <Badge valor={aprobacionPendiente} clase="nb-blu" />
            </>
          }
        />

        <NavSection title="Compras" />
        <NavItem
          item={NAV_COMPRAS[0]}
          active={currentPage === 'ocs'}
          onClick={onNavigate}
          badges={<Badge valor={ocsActivas} clase="nb-ind" />}
        />
        <NavItem
          item={NAV_COMPRAS[1]}
          active={currentPage === 'seguimiento'}
          onClick={onNavigate}
          badges={<Badge valor={seguimientoPendiente} clase="nb-yel" />}
        />
        <NavItem item={NAV_COMPRAS[2]} active={currentPage === 'historial'} onClick={onNavigate} />
        <NavItem item={NAV_COMPRAS[3]} active={currentPage === 'nueva-oc'} onClick={onNavigate} />

        <NavSection title="Inteligencia" />
        <NavItem item={NAV_INTELIGENCIA[0]} active={currentPage === 'predictor'} onClick={onNavigate} />

        <NavSection title="Configuración" />
        {NAV_CONFIG.map((item) => (
          <NavItem key={item.key} item={item} active={currentPage === item.key} onClick={onNavigate} />
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
  )
}
