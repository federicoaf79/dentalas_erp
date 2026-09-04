import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { usePermisos } from './hooks/usePermisos'
import Login from './pages/Login'
import Sidebar from './components/Sidebar'
import MonitorStock from './pages/MonitorStock'
import SeguimientoOC from './pages/SeguimientoOC'
import Proveedores from './pages/Proveedores'
import HistorialOC from './pages/HistorialOC'
import UsuariosAccesos from './pages/UsuariosAccesos'
import Alertas from './pages/Alertas'
import OrdenesCompra from './pages/OrdenesCompra'
import ConectorYiQi from './pages/ConectorYiQi'
import PredictorDemanda from './pages/PredictorDemanda'
import NuevaOC from './pages/NuevaOC'
import ReglasAlertas from './pages/ReglasAlertas'
import CatalogoCausas from './pages/CatalogoCausas'
import Empresa from './pages/Empresa'
import TemplatesMensajes from './pages/TemplatesMensajes'
import CondicionesProveedor from './pages/CondicionesProveedor'
import ReposicionInterna from './pages/ReposicionInterna'
import ComparacionPrecios from './pages/ComparacionPrecios'
import RevisarEquivalencias from './pages/RevisarEquivalencias'
import Ayuda from './pages/Ayuda'

// ------------------------------------------------------------
// Páginas que YA tienen datos reales conectados para la demo.
// El resto del sidebar es navegable (para mostrar la interfaz
// completa a Aris) pero muestra un aviso de "en construcción".
// ------------------------------------------------------------
const PAGINAS_CON_DATOS_REALES = [
  'stock',
  'seguimiento',
  'proveedores',
  'historial',
  'usuarios',
  'alertas',
  'ocs',
  'yiqi',
  'predictor',
  'nueva-oc',
  'reglas',
  'causas',
  'empresa',
  'templates',
  'condiciones',
  'reposicion',
  'precios',
  'equivalencias',
  'ayuda',
]

function PaginaEnConstruccion({ nombre }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#f7f8fa]">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-3">🚧</div>
        <div className="text-lg font-bold mb-1">{nombre}</div>
        <div className="text-sm text-gray-500">
          Esta sección está en desarrollo. El diseño completo ya está
          validado en el prototipo — falta conectar la lógica real.
        </div>
      </div>
    </div>
  )
}

const TITULOS = {
  alertas: 'Alertas',
  reposicion: 'Reposición interna',
  ocs: 'Órdenes de compra',
  historial: 'Historial de OC',
  'nueva-oc': 'Nueva OC',
  predictor: 'Predictor de demanda',
  proveedores: 'Proveedores',
  usuarios: 'Usuarios y accesos',
  causas: 'Catálogo de causas',
  empresa: 'Datos de la empresa',
  condiciones: 'Condiciones comerciales',
  reglas: 'Reglas y alertas',
  templates: 'Templates de mensajes',
  yiqi: 'Conector YiQi',
  precios: 'Comparación de precios',
  equivalencias: 'Revisar equivalencias',
  ayuda: 'Ayuda',
}

// ============================================================
// Parte logueada de la app.
//
// Se separa en su propio componente para poder usar usePermisos()
// SOLO cuando hay sesión. Si el hook viviera en App, correría también
// en la pantalla de login y fallaría con "No hay sesión activa" cada
// vez que alguien abre la app sin estar logueado.
// ============================================================
function AppLogueada({ session, onLogout }) {
  const permisos = usePermisos()
  const [currentPage, setCurrentPage] = useState('stock')
  const [contadores, setContadores] = useState({})
  const [ultimaSync, setUltimaSync] = useState(null)
  const [yiqiEstado, setYiqiEstado] = useState(null)

  // Puente Reposición interna -> Nueva OC (21/8/2026, ítem 5): "Artículos
  // a pedir" (prioridad 6 de reposicion_interna(), Central no alcanza)
  // ahora tiene un botón que salta directo a Nueva OC con el proveedor y
  // el SKU ya cargados, en vez de que Aris/Ivana tengan que acordarse y
  // volver a escribirlo. Vive acá (no en cada pantalla) porque las dos
  // pantallas se turnan por `currentPage`, sin router -- es el único
  // lugar donde ambas coexisten. Mismo patrón que `onIrARevisar` de
  // Comparación de precios -> Revisar equivalencias, unas líneas abajo.
  const [preseleccionOC, setPreseleccionOC] = useState(null)

  // Puente Proveedores -> Condiciones comerciales (4/9/2026, ítem 41):
  // el botón "Condiciones →" de cada fila salta a esta pantalla con el
  // nombre del proveedor ya cargado en la búsqueda (y abierto para editar,
  // si ya tiene una fila). Mismo patrón que preseleccionOC de arriba.
  const [preseleccionProveedor, setPreseleccionProveedor] = useState(null)

  // El nombre sale de usuarios_config, no de partir el mail: con las
  // cuentas reales, el mail comprasdentalab@gmail.com mostraría
  // "comprasdentalab" en el sidebar. Si por algún motivo no hay nombre
  // cargado, cae al mail como respaldo.
  const nombreUsuario =
    permisos.nombreUsuario || session.user.email?.split('@')[0] || 'Usuario'

  // Clave derivada de los permisos: misma técnica que en las pantallas.
  // Evita recalcular los contadores en cada refresh de token de Supabase.
  const claveFiltro =
    permisos.cargando || permisos.error
      ? null
      : `${permisos.esAdmin}|${permisos.codigos.join(',')}|${permisos.nombres.join(',')}`

  // Extraída con useCallback (y no declarada adentro del useEffect) para
  // poder pasarla como onCambioOrdenes a OrdenesCompra y NuevaOC: así el
  // badge del sidebar se refresca apenas se crea/aprueba/rechaza una OC,
  // sin esperar a un F5. `vivo` sigue el mismo patrón que usePermisos.js
  // (evita el setState después de desmontar).
  const vivoRef = useRef(true)
  useEffect(() => {
    vivoRef.current = true
    return () => {
      vivoRef.current = false
    }
  }, [])

  const cargarContadores = useCallback(async () => {
    if (claveFiltro === null) return
    // contadores_sidebar() NO es SECURITY DEFINER a propósito: corre
    // con los permisos del usuario logueado, así que el RLS filtra
    // solo y cada uno ve sus propios números sin duplicar la lógica
    // de permisos en el frontend.
    const { data, error } = await supabase.rpc('contadores_sidebar')
    if (!vivoRef.current) return
    if (error) {
      // Los badges no son crítica: si falla, simplemente no se dibujan.
      console.error('[contadores_sidebar]', error)
      return
    }
    setContadores(data ?? {})
    setUltimaSync(data?.ultimaSync ?? null)
  }, [claveFiltro])

  // Estado de conexión con YiQi (agregado 20/8/2026, tras el 3er corte
  // de sync en una semana pasar desapercibido hasta que alguien entraba
  // por casualidad a "Conector YiQi"). A propósito NO llama a la Edge
  // Function en vivo -- yiqi_estado_actual() solo lee lo que ya quedó
  // guardado, así este poll no suma una superficie más de colisión de
  // renovación del token. Mismo ciclo que cargarContadores: no hace
  // falta un intervalo aparte.
  const cargarYiqiEstado = useCallback(async () => {
    const { data, error } = await supabase.rpc('yiqi_estado_actual')
    if (!vivoRef.current) return
    if (error) {
      console.error('[yiqi_estado_actual]', error)
      return
    }
    setYiqiEstado(Array.isArray(data) ? data[0] : data)
  }, [])

  useEffect(() => {
    cargarContadores()
    cargarYiqiEstado()
  }, [cargarContadores, cargarYiqiEstado])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        contadores={contadores}
        ultimaSync={ultimaSync}
        yiqiEstado={yiqiEstado}
        nombreUsuario={nombreUsuario}
        onLogout={onLogout}
      />

      {currentPage === 'stock' && <MonitorStock />}
      {currentPage === 'reposicion' && (
        <ReposicionInterna
          onPedirAProveedor={(proveedor, sku) => {
            setPreseleccionOC({ proveedor, sku })
            setCurrentPage('nueva-oc')
          }}
        />
      )}
      {currentPage === 'seguimiento' && <SeguimientoOC />}
      {currentPage === 'proveedores' && (
        <Proveedores
          onIrACondiciones={(nombre) => {
            setPreseleccionProveedor(nombre)
            setCurrentPage('condiciones')
          }}
        />
      )}
      {currentPage === 'historial' && <HistorialOC />}
      {currentPage === 'usuarios' && <UsuariosAccesos />}
      {currentPage === 'alertas' && <Alertas />}
      {currentPage === 'ocs' && <OrdenesCompra onCambioOrdenes={cargarContadores} />}
      {currentPage === 'yiqi' && <ConectorYiQi />}
      {currentPage === 'predictor' && <PredictorDemanda />}
      {currentPage === 'nueva-oc' && (
        <NuevaOC
          onCambioOrdenes={cargarContadores}
          preseleccion={preseleccionOC}
          onConsumirPreseleccion={() => setPreseleccionOC(null)}
        />
      )}
      {currentPage === 'precios' && <ComparacionPrecios onIrARevisar={() => setCurrentPage('equivalencias')} />}
      {currentPage === 'equivalencias' && <RevisarEquivalencias />}
      {currentPage === 'ayuda' && <Ayuda />}
      {currentPage === 'reglas' && <ReglasAlertas />}
      {currentPage === 'causas' && <CatalogoCausas />}
      {currentPage === 'empresa' && <Empresa />}
      {currentPage === 'templates' && <TemplatesMensajes />}
      {currentPage === 'condiciones' && (
        <CondicionesProveedor
          preseleccion={preseleccionProveedor}
          onConsumirPreseleccion={() => setPreseleccionProveedor(null)}
        />
      )}
      {!PAGINAS_CON_DATOS_REALES.includes(currentPage) && (
        <PaginaEnConstruccion nombre={TITULOS[currentPage] ?? currentPage} />
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = todavía no sabemos, null = no logueado

  useEffect(() => {
    // Revisar si ya hay una sesión activa (por ejemplo, si recargaste la página)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Escuchar cambios de sesión (login / logout)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Todavía verificando si hay sesión guardada — evita parpadeo de la pantalla de login
  if (session === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f7f8fa] text-sm text-gray-400">
        Cargando…
      </div>
    )
  }

  // No hay sesión activa — mostrar login
  if (!session) {
    return <Login onLoginExitoso={() => {}} />
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  // `key` fuerza a remontar todo si cambia el usuario: así los permisos,
  // los contadores y el estado de las pantallas arrancan limpios y no
  // quedan datos del usuario anterior en pantalla.
  return <AppLogueada key={session.user.id} session={session} onLogout={handleLogout} />
}
