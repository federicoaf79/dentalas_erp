// ------------------------------------------------------------
// Estructura de navegación — copiada 1:1 del prototipo v8 aprobado
// por el cliente, reorganizada en MÓDULOS el 19/8/2026.
//
// Por qué el cambio: "Monitor de stock" y "Reposición interna"
// vivían sueltos bajo "Principal" junto con "Alertas", sin ninguna
// agrupación real por módulo. Con el proyecto creciendo hacia más
// módulos (decisión de Federico, 19/8/2026), se separó en dos
// secciones con sentido de negocio:
//   - STOCK: pantallas sobre el inventario físico en sí (cuánto hay,
//     dónde, y el movimiento interno Local<->Central).
//   - COMPRAS: todo lo que dispara o gestiona una compra a un
//     proveedor externo — Alertas incluida, porque es la que dice
//     "esto hay que comprarlo" (mismo criterio que Nueva OC).
// Agregar un módulo nuevo en el futuro = agregar un array + una
// sección, sin tocar el resto.
// ------------------------------------------------------------
// 10/9/2026 (Decisión A/B de la unificación del Eje 1, ver
// DISENO_TECNICO_Unificacion_Eje1_10-9-2026.md): "Reposición interna"
// se saca del sidebar de Aris/Ivana. Ya no es necesaria — Federico,
// 10/9: "los botones de movido y descartar no van a ser necesarios, es
// una tarea manual que entorpece la automatización que ya hace el
// sistema". Las acciones del circuito viven 100% en las cuentas de
// depósito (AppDeposito.jsx); Aris/Ivana quedan con la vista de
// supervisión de abajo, solo lectura.
const NAV_STOCK = [
  { key: 'stock', label: 'Monitor de stock', icon: '📦' },
  // 7/9/2026: vista de supervisión (solo lectura) del circuito nuevo
  // Central<->Local — las acciones viven en las cuentas de depósito
  // (AppDeposito.jsx), acá se ve el historial completo de los dos
  // circuitos. Gate real de admin adentro de la pantalla misma, mismo
  // patrón que "Usuarios y accesos".
  { key: 'reposicion-central-local', label: 'Reposición Central-Local', icon: '🏭' },
]

const NAV_COMPRAS = [
  { key: 'alertas', label: 'Alertas', icon: '🔔' },
  { key: 'nueva-oc', label: 'Nueva OC', icon: '📝' },
  { key: 'ocs', label: 'Órdenes de compra', icon: '📋' },
  { key: 'seguimiento', label: 'Seguimiento de OC', icon: '🔄' },
  { key: 'historial', label: 'Historial de OC', icon: '🕐' },
  { key: 'precios', label: 'Comparar precios', icon: '💲' },
  { key: 'equivalencias', label: 'Revisar equivalencias', icon: '🔗' },
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
  // 7/9/2026 (auditoría de usabilidad, U-3): se llamaba "Reglas y
  // alertas", nombre que se pisa con la pantalla "Alertas" de más
  // arriba sin ser lo mismo — acá se configuran límites de aprobación
  // y cobertura de reposición, no los umbrales de Mín./Máx./Stock
  // Seguridad que se ven en Alertas. La key ('reglas') y el archivo
  // (ReglasAlertas.jsx) no cambian, solo el rótulo visible.
  { key: 'reglas', label: 'Reglas de compra y aprobación', icon: '⚙️' },
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
  yiqiEstado = null,
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

  // Aviso de conexión con YiQi (agregado 20/8/2026). Antes esto solo se
  // veía entrando puntualmente a "Conector YiQi" -- se vio 3 veces en
  // una semana que nadie se enteraba de un corte real hasta que alguien
  // entraba ahí por casualidad. yiqiEstado.conectado en false es una
  // caída ya confirmada (el token guardado venció y no se pudo renovar);
  // fallosRecuperables24h > 0 con conectado=true es la señal temprana
  // de que viene fallando en silencio, todavía sin cortar nada.
  const yiqiConectado = yiqiEstado?.conectado ?? true // null/undefined = todavía no cargó, no mostrar alarma en falso
  const yiqiFallosRecuperables = yiqiEstado?.fallos_recuperables_24h ?? 0
  const yiqiHayAviso = yiqiEstado != null && (!yiqiConectado || yiqiFallosRecuperables > 0)

  // Badges por key, en vez de posición fija en el array — así agregar/
  // reordenar un item de un módulo no rompe qué badge le corresponde
  // a cuál (bug que ya pasó una vez, el 19/8/2026, al insertar
  // "Reposición interna" en el medio del array viejo).
  const badgesPorKey = {
    stock: <Badge valor={alertasStock} clase="nb-yel" />,
    alertas: (
      <>
        <Badge valor={alertasCriticas} clase="nb-red" />
        <Badge valor={alertasPreventivas} clase="nb-yel" />
        {/* Azul = pedidos que requieren aprobacion de Aris.
            El flujo es Sprint 2, hoy siempre 0 -> no se dibuja. */}
        <Badge valor={aprobacionPendiente} clase="nb-blu" />
      </>
    ),
    ocs: <Badge valor={ocsActivas} clase="nb-ind" />,
    seguimiento: <Badge valor={seguimientoPendiente} clase="nb-yel" />,
  }

  function renderGrupo(items) {
    return items.map((item) => (
      <NavItem
        key={item.key}
        item={item}
        active={currentPage === item.key}
        onClick={onNavigate}
        badges={badgesPorKey[item.key]}
      />
    ))
  }

  return (
    <aside className="w-[228px] bg-white border-r border-[var(--border)] flex flex-col flex-shrink-0 h-screen">
      <div className="px-3.5 pt-3.5 pb-3 border-b border-[var(--border)]">
        <div className="text-[15px] font-bold">🦷 Dentalab</div>
        {yiqiHayAviso ? (
          <div
            onClick={() => onNavigate('yiqi')}
            title="Ver detalle en Conector YiQi"
            className={`text-[10px] flex items-center gap-1 font-semibold mt-0.5 cursor-pointer hover:underline ${
              !yiqiConectado ? 'text-[var(--red)]' : 'text-amber-700'
            }`}
          >
            <span>●</span>
            {!yiqiConectado
              ? 'Sin conexión con YiQi — ver detalle'
              : `Renovación de YiQi con fallas (${yiqiFallosRecuperables} en 24h) — ver detalle`}
          </div>
        ) : (
          <div className="text-[10px] text-[var(--grn)] flex items-center gap-1 font-semibold mt-0.5">
            <span>●</span>
            {syncTexto ? `Sincronizado ${syncTexto}` : 'Sincronizando…'}
          </div>
        )}
      </div>

      <nav className="px-1.5 py-1.5 flex-1 overflow-y-auto">
        <NavSection title="Stock" />
        {renderGrupo(NAV_STOCK)}

        <NavSection title="Compras" />
        {renderGrupo(NAV_COMPRAS)}

        <NavSection title="Inteligencia" />
        {renderGrupo(NAV_INTELIGENCIA)}

        <NavSection title="Configuración" />
        {renderGrupo(NAV_CONFIG)}
      </nav>

      {/* Ayuda: fuera del <nav> que scrollea, para que quede siempre a la
          vista sin tener que bajar por los 4 módulos. Usa el mismo
          NavItem/onNavigate que el resto — abre la pantalla Ayuda.jsx
          como una página más, no un modal. */}
      <div className="px-1.5 pt-1.5 pb-1 border-t border-[var(--border)]">
        <NavItem item={{ key: 'ayuda', icon: '❓', label: 'Ayuda' }} active={currentPage === 'ayuda'} onClick={onNavigate} />
      </div>

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
