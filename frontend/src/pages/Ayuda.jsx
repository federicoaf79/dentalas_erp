import { useMemo, useState } from 'react'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'

// ============================================================
// Ayuda.jsx — manual de uso in-app, pantalla por pantalla.
//
// Contenido derivado del código real de cada pantalla (no inventado),
// revisado por última vez el 7/10/2026. Si una pantalla cambia, este
// archivo puede quedar desactualizado — no hay ninguna sincronización
// automática entre el código de una pantalla y su texto acá.
//
// [27/8/2026] Actualizado: exclusión de la línea Acritone/NewcryL
// (26/8/2026, a pedido de Aris — "SON PRODUCTOS, NO PROVEEDORES,
// TODAVÍA NO LOS VAMOS A INCLUIR EN EL SISTEMA"). Afecta Alertas,
// Monitor de stock y el cálculo de reposición, ver sus secciones de
// reglas.
//
// [14/9/2026] Reescrito tras la unificación del Eje 1 (ver
// DISENO_TECNICO_Unificacion_Eje1_10-9-2026.md), que quedó sin
// reflejarse acá desde el 4/9/2026, antes de que el circuito nuevo
// existiera:
//   - "Reposición interna" (botones Movido/Descartar) sacada — la
//     pantalla ya no se rutea para Aris/Ivana desde el 10/9/2026.
//   - Agregada "Reposición Central-Local", la vista de supervisión
//     nueva que la reemplaza en el sidebar (solo lectura, solo admin).
//   - Agregado un módulo nuevo con las 3 pantallas de las cuentas de
//     depósito (un shell completamente aparte, sin Sidebar ni esta
//     misma pantalla de Ayuda — documentadas acá para que Aris/Ivana
//     sepan qué ve y qué hace cada cuenta al entrenarlas). Esas
//     cuentas tienen su propia Ayuda (AyudaDeposito.jsx) dentro de su
//     propio shell, con el mismo contenido en segunda persona.
// No se tocó nada del cálculo interno (exclusión de Patricia Bazan,
// cap de outliers, exclusión de administrativos del Pareto) — son
// reglas de cálculo, no cambian cómo se usa ninguna pantalla.
//
// [7/10/2026] Actualizado con todo lo que cambió desde el 14/9
// (feedback de Ivana 28/9 y 2/10, retoque del prototipo v7): filtro de
// proveedor, barra Stock/Mín./Máx., "+ OC" / "Armar OC", Pausar y
// Excluir en Alertas, órdenes en tarjetas con colores, detalle de una
// orden con barra de pasos, editar órdenes (vuelve a borrador),
// "Ya seleccionados", − / + por bulto, aviso de órdenes abiertas,
// KPIs de Monitor e Historial, Seguimiento con colores. Pestañas de
// Compras en el mismo orden que el menú; íconos Tabler como el menú;
// tarjeta nueva con el código de colores y el ⓘ.
//
// Estructura: un array de MODULOS (mismo agrupamiento que el Sidebar),
// cada uno con sus TABS (mismo orden que el menú). Cada tab tiene
// bloques de contenido (párrafos, listas, tips, avisos) que se arman
// con la función Bloques() de más abajo, para poder escribir el texto
// como datos en vez de repetir JSX a mano 18 veces.
// ============================================================

// Parser inline mínimo: solo entiende **negrita**, nada más. Alcanza
// para este archivo — no hace falta traer una librería de markdown
// para un puñado de frases en negrita dentro del texto de ayuda.
function conNegrita(texto) {
  const partes = String(texto).split(/\*\*(.+?)\*\*/g)
  return partes.map((parte, i) => (i % 2 === 1 ? <strong key={i}>{parte}</strong> : parte))
}

function Bloques({ items }) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((b, i) => {
        if (typeof b === 'string') {
          return (
            <p key={i} className="text-[13px] text-gray-700 leading-relaxed">
              {conNegrita(b)}
            </p>
          )
        }
        if (b.ul) {
          return (
            <ul key={i} className="text-[13px] text-gray-700 leading-relaxed list-disc list-outside pl-5 space-y-1">
              {b.ul.map((li, j) => (
                <li key={j}>{conNegrita(li)}</li>
              ))}
            </ul>
          )
        }
        if (b.ol) {
          return (
            <ol key={i} className="text-[13px] text-gray-700 leading-relaxed list-decimal list-outside pl-5 space-y-1.5">
              {b.ol.map((li, j) => (
                <li key={j}>{conNegrita(li)}</li>
              ))}
            </ol>
          )
        }
        if (b.tip) {
          return (
            <div
              key={i}
              className="text-[12.5px] leading-relaxed border-l-[3px] border-[var(--ind-lt)] bg-[var(--ind-bg)] text-[var(--ind-d)] rounded-r-lg px-3.5 py-2.5"
            >
              {conNegrita(b.tip)}
            </div>
          )
        }
        if (b.warn) {
          return (
            <div
              key={i}
              className="text-[12.5px] leading-relaxed border-l-[3px] border-amber-300 bg-[var(--yel-bg)] text-[#7a5b00] rounded-r-lg px-3.5 py-2.5"
            >
              {conNegrita(b.warn)}
            </div>
          )
        }
        return null
      })}
    </div>
  )
}

function Campo({ titulo, items, tono }) {
  if (!items || items.length === 0) return null
  const tonos = {
    ind: 'text-[var(--ind-d)]',
    default: 'text-gray-800',
  }
  return (
    <div>
      <div className={`text-[11px] font-bold uppercase tracking-wide mb-1.5 ${tonos[tono] || tonos.default}`}>
        {titulo}
      </div>
      <Bloques items={items} />
    </div>
  )
}

// ------------------------------------------------------------
// Contenido. Un objeto por tab del sidebar, en el mismo orden y
// agrupado en los mismos 4 módulos que Sidebar.jsx.
// ------------------------------------------------------------
const MODULOS = [
  {
    titulo: 'Stock',
    tabs: [
      {
        key: 'stock',
        icon: 'ti-package',
        label: 'Monitor de stock',
        queEs: [
          'Foto general de todo el catálogo (o del catálogo de tus proveedores asignados, si no sos admin) con el estado de cada artículo: Crítica, Preventiva u OK.',
          { tip: 'No lee YiQi en vivo: lee una copia propia que se actualiza sola cada 15 minutos. El menú de la izquierda, debajo del logo, dice a qué hora fue la última sincronización.' },
        ],
        necesitas: [
          'Tener sesión iniciada y estar dado de alta en "Usuarios y accesos".',
          'Si no sos Aris, necesitás tener al menos un proveedor asignado en "Usuarios y accesos" — si no tenés ninguno, esta pantalla te va a aparecer vacía.',
        ],
        comoSeUsa: [
          'Arriba, cuatro números: **Alertas activas** (críticas y preventivas), **OC en curso** (enviadas y todavía sin recibir completas), **Requieren aprobación** (órdenes esperando a Aris) y **Artículos**. Click en "OC en curso" o "Requieren aprobación" te lleva a "Órdenes de compra".',
          'Por defecto la tabla solo muestra los artículos con alguna alerta. "Ver todos" la cambia para mostrar el catálogo completo; "Ver solo con alerta" vuelve atrás.',
          'Buscador por SKU, nombre o proveedor, filtro **Proveedor ▾** y selector de filas por página. Click en el título de una columna ordena por esa columna (↕).',
          {
            ul: [
              '**Filtro Proveedor ▾**: "Es" (solo ese proveedor), "No es" (todos menos ese) o "Sin proveedor asignado" (artículos que no tienen proveedor en YiQi), más una lista para excluir proveedores puntuales. "✕ Limpiar" saca el filtro. No se guarda: al volver a entrar arranca limpio.',
              '**Columna Stock**: una barra con el número de stock arriba, una marca marrón en el mínimo y una gris en el máximo (si el máximo está cargado en YiQi). Roja si el stock está en o bajo el mínimo, verde entre mínimo y máximo, índigo si pasó el máximo. Debajo, el desglose por depósito (Local / Central).',
              '**Estado OC**: si el artículo ya está pedido ("Solicitada" o "Entrega parcial") y cuántas unidades vienen en camino, por ejemplo "Solicitada (+40)".',
              '**Notas**: la nota sobre el punto de pedido que se cargó en YiQi para ese artículo.',
            ],
          },
          'Botón **"+ Nueva OC"** arriba a la derecha, y **"+ OC"** en cada fila crítica o preventiva que tenga proveedor: abre Nueva OC con ese proveedor y ese artículo ya cargados.',
          'Botón "↻ Actualizar": vuelve a leer la copia propia — no fuerza una sincronización nueva con YiQi, esa corre sola cada 15 minutos.',
        ],
        reglas: [
          { warn: 'Es de solo lectura. No hay forma de cambiar Punto de Pedido ni Stock de Seguridad desde acá — eso se carga directamente en YiQi.' },
          'Una fila queda "sin config." (y no genera ninguna alerta) si el artículo no tiene ni Punto de Pedido ni Stock de Seguridad cargado en YiQi.',
          'Las unidades que ya vienen en una OC aprobada o enviada se descuentan del faltante: un artículo ya pedido deja de figurar como Crítico por lo que está en camino.',
          'Igual que en Alertas: un artículo nunca cuenta para las alertas de esta pantalla si es código administrativo, publicación de Mercado Libre, está marcado discontinuado, es de producción propia (proveedor "Dentalab"), o es de la línea Acritone/NewcryL (excluida del sistema el 26/8/2026, a pedido de Aris).',
        ],
        noHace: ['No exporta a Excel ni PDF.', 'No permite editar datos del artículo — eso se hace en YiQi.'],
      },
      {
        key: 'reposicion-central-local',
        icon: 'ti-building-warehouse',
        label: 'Reposición Central-Local',
        queEs: [
          'Vista de supervisión (solo lectura) del circuito de reposición automática entre Depósito Central y el Local — reemplaza a la vieja "Reposición interna" desde el 10/9/2026. Las acciones del circuito (generar remito, declarar qué se envía, confirmar recepción) ya no se hacen acá ni desde ninguna pantalla de Aris/Ivana: viven en las cuentas de depósito, un sistema aparte (ver el módulo "Depósito" más abajo). Acá se ve el estado y el historial completo de los dos circuitos, incluido lo ya resuelto.',
        ],
        necesitas: [{ warn: 'Es exclusiva de Aris/admin — un operador no la ve. El gate corre en la pantalla, mismo patrón que "Usuarios y accesos".' }],
        comoSeUsa: [
          'Chips arriba: Activas / Completas / Todas. Botón "↻ Actualizar".',
          'Tabla con una fila por solicitud (remito): circuito (origen → destino), si se generó por regla automática o a pedido manual del depósito, fecha, estado resumido y cantidad de líneas.',
          'Click en una fila la expande y muestra el detalle línea por línea: SKU, producto, cantidad pedida, estado, cuánto se declaró que se envía, faltante y motivo si no se mandó todo, cuánto se confirmó recibido, y si el movimiento ya quedó registrado en YiQi (o si dio error).',
        ],
        reglas: [
          'El estado resumido de cada solicitud se arma a partir de sus líneas, no de una columna única: "✓ Completa" (todas las líneas recibidas), "Esperando confirmación" (alguna línea en tránsito, todavía sin confirmar), "En preparación", "Solicitada, sin procesar" o "Reemplazada" (una solicitud nueva reemplazó a esta antes de que se procesara).',
        ],
        noHace: ['No permite generar remitos, declarar envíos ni confirmar recepciones desde acá — es puramente de consulta.'],
      },
    ],
  },
  {
    titulo: 'Depósito (cuentas aparte)',
    tabs: [
      {
        key: 'deposito-intro',
        icon: 'ti-info-circle',
        label: 'Cómo funcionan las cuentas de depósito',
        queEs: [
          'Las 2 cuentas de depósito (Depósito Central y el encargado del Local) NO entran a esta app como Aris/Ivana: tienen su propio login y su propio menú de 4 pantallas (3 operativas + su propia Ayuda), y no ven Compras, OC, Alertas ni nada de Configuración. Nunca vieron ni van a ver esta pantalla de Ayuda que estás leyendo ahora — tienen la suya propia, más simple, escrita en segunda persona para ellas (AyudaDeposito.jsx, agregada el 14/9/2026). Lo de acá es para que Aris/Ivana sepan qué hacen esas cuentas al entrenarlas, no para que ellas lo lean.',
          'Las mismas 3 pantallas operativas sirven para las dos cuentas: cada depósito es "origen" en un circuito y "destino" en el otro (Central es origen en el circuito principal hacia el Local; el Local es origen en el circuito inverso hacia Central) — no hay una versión distinta por cuenta, lo que cada una ve depende solo de qué solicitudes le tocan.',
        ],
        necesitas: [],
        comoSeUsa: [
          {
            ul: [
              '**Solicitudes para preparar** — lo que esa cuenta tiene que armar y enviar.',
              '**Confirmar recepción** — lo que le llegó del otro depósito, pendiente de confirmar contra lo físico.',
              '**Pedir al otro depósito** — pedido puntual manual, para cuando necesita algo fuera del cálculo automático.',
              '**Ayuda** — su propia guía del circuito, con las mismas reglas que acá pero explicadas para quien la opera, no para quien entrena.',
            ],
          },
          { tip: 'Este circuito no tiene ningún paso de "aprobación" como sí tiene Compras (nadie autoriza un remito) — el único control real es la confirmación de recepción contra el remito impreso. Vale para explicarle esto a una cuenta nueva: no va a encontrar ningún botón de "aprobar".' },
        ],
        reglas: [],
        noHace: [],
      },
      {
        key: 'deposito-preparar',
        icon: 'ti-clipboard-check',
        label: 'Solicitudes para preparar',
        queEs: [
          'Lo que ese depósito tiene que preparar y enviar al otro. Para Depósito Central, en el circuito principal esto normalmente ya llega resuelto solo: un trigger genera y declara el remito automáticamente apenas se crea la solicitud (10/9/2026, a pedido de Aris, para no hacerle validar a mano cantidades que ya se ven en YiQi). El botón para generarlo a mano sigue ahí por si algún día hace falta reprocesar una solicitud.',
        ],
        necesitas: [],
        comoSeUsa: [
          'Cada solicitud es una tarjeta con su remito, destino y fecha.',
          'Si está "Solicitada, sin procesar": botón "📋 Generar remito de mercadería" — recalcula en vivo la necesidad real al momento del clic (descontando lo ya reservado en otros remitos en preparación).',
          'Si ya está "En preparación": tabla con cada artículo, su Clase (A/B/C, la clasificación real de Aris, solo para referencia visual), cantidad pedida, y un campo para declarar cuánto se envía. Botón "Declarar" por línea.',
          'Botón "🖨️ Imprimir remito" (cuando está en preparación) — arma el PDF para llevar al picking físico.',
        ],
        reglas: [
          { warn: 'Un solo campo de cantidad enviada por línea: lo que falte del pedido queda automáticamente como "no hay" con el motivo que se escriba al lado — eso dispara la orden de compra al proveedor y suspende la alerta de ese artículo hasta que vuelva a haber stock. No hay un campo separado para "cantidad faltante".' },
          'Si se envía todo lo pedido, no hace falta escribir motivo — el campo se reemplaza por "Envía todo lo pedido".',
        ],
        noHace: ['No permite editar la cantidad pedida antes de declarar cuánto se envía.', 'No confirma la recepción del otro lado — eso lo hace el destino en "Confirmar recepción".'],
      },
      {
        key: 'deposito-recepcion',
        icon: 'ti-circle-check',
        label: 'Confirmar recepción',
        queEs: [
          'Lo que el otro depósito ya declaró que envía ("en tránsito") y está esperando que esta cuenta confirme contra lo que llegó físicamente. Confirmar acá es lo que efectivamente mueve el stock real en YiQi — no antes, ni cuando el otro lado declaró "envía".',
        ],
        necesitas: [],
        comoSeUsa: [
          'Una tarjeta por remito, con botón "🖨️ Ver / imprimir remito" para confirmar contra el documento impreso, no solo contra la pantalla.',
          'Por cada línea: SKU, producto, cantidad en tránsito, y un campo editable con esa misma cantidad precargada — se corrige ahí si no coincide contra lo físico. Botón "✓ Confirmar recibido".',
        ],
        reglas: [
          { warn: 'Decisión de Federico, 10/9/2026: el encargado del local confirma contra el remito impreso, y ya nadie más valida ese punto — por eso el botón de imprimir vive en esta misma pantalla.' },
          'Recién con "Confirmar recibido" se dispara el movimiento real de stock en YiQi. Si esa parte falla, la confirmación acá ya quedó guardada igual — no se deshace.',
        ],
        noHace: ['No permite rechazar o devolver una línea — solo confirmar la cantidad real recibida.'],
      },
      {
        key: 'deposito-pedir',
        icon: 'ti-send',
        label: 'Pedir al otro depósito',
        queEs: [
          'Circuito inverso manual: esta cuenta arma un pedido puntual (SKU y cantidad elegidos a mano, sin ningún cálculo automático) para que lo prepare el otro depósito. Aparece de inmediato en "Solicitudes para preparar" del otro lado, ya "en preparación".',
        ],
        necesitas: [],
        comoSeUsa: [
          'Buscador por SKU o nombre contra todo el catálogo. "+ Agregar" suma un artículo al pedido, con cantidad editable.',
          'Botón "📤 Enviar pedido" — manda todo el carrito de una vez.',
        ],
        reglas: [
          { tip: 'A diferencia de "Solicitudes para preparar" (que sí recalcula en vivo), acá no hay ningún cálculo — es exactamente lo que la persona eligió cargar.' },
        ],
        noHace: ['No sugiere cantidades ni artículos — es 100% manual.'],
      },
    ],
  },
  {
    titulo: 'Compras',
    tabs: [
      {
        key: 'alertas',
        icon: 'ti-bell',
        label: 'Alertas',
        queEs: ['Listado de todo lo que está Crítico o Preventivo, para decidir qué comprar, dejar registrada la causa de cada faltante, o pausar las alertas que ya están atendidas.'],
        necesitas: ['Mismo criterio de sesión/permisos que Monitor de stock. No requiere nada más — el sync es automático.'],
        comoSeUsa: [
          'Arriba, cuatro tarjetas: **Preventivas** (tiempo para actuar), **Críticas** (acción inmediata), **Pausadas** y **Excluidos** (permanentes, solo Aris).',
          'Pestañas: "Alertas" (la vista de siempre), "Pausadas" y "Excluidos" (esta última solo para Aris). Dentro de Alertas, chips "Todas" / "Críticas" / "Preventivas", buscador y filtro **Proveedor ▾** (Es / No es; acá no está "Sin proveedor asignado", porque un artículo sin proveedor nunca genera alerta).',
          'La columna **Stock / Mín. / Máx.** es la misma barra que en Monitor de stock. **Estado OC** muestra si ya está pedido y cuánto viene en camino.',
          {
            ul: [
              '**Causa**: botón "Causa" para declarar por qué falta el artículo (desplegable de causas + nota opcional). Si ya hay una causa declarada, se ve en una pastilla amarilla; click para ver el historial o declarar otra.',
              '**Armar OC**: abre Nueva OC con ese proveedor y ese artículo ya cargados. Deshabilitado si el artículo no tiene proveedor.',
              '**Pausar**: saca la alerta de la lista por 15 días (cualquier usuario). En la pestaña "Pausadas" se ve cuándo vuelve y está "Reactivar ahora".',
              '**Excluir** (solo Aris): la saca de las alertas en forma permanente, con un motivo obligatorio. Se puede volver atrás desde la pestaña "Excluidos" con "Restaurar en alertas".',
            ],
          },
        ],
        reglas: [
          { tip: 'Declarar una causa es solo para dejar registro — no cambia el estado de la alerta ni la saca de la lista. Cada declaración se agrega al historial, nunca se edita ni se borra una anterior.' },
          'Las unidades que ya vienen en una OC aprobada o enviada se descuentan del faltante, así que lo ya pedido no sigue figurando como Crítico.',
          'Cuando vence una pausa, la alerta vuelve a contar sola si el artículo sigue bajo el mínimo.',
          'Un artículo se excluye siempre de las alertas si es código administrativo, publicación de Mercado Libre, está marcado discontinuado, el proveedor es "Dentalab" (producción propia), o es de la línea Acritone/NewcryL (excluida del sistema el 26/8/2026, a pedido de Aris — son productos, no proveedores, y todavía no se van a incluir).',
        ],
        noHace: ['No tiene botón para "resolver" o cerrar una alerta a mano — desaparecen solas cuando el stock deja de estar bajo el umbral.', 'No exporta a Excel/PDF.'],
      },
      {
        key: 'nueva-oc',
        icon: 'ti-file-plus',
        label: 'Nueva OC',
        queEs: ['La pantalla de CREACIÓN de una orden de compra nueva, proveedor por proveedor, a partir de las alertas de stock (o de cualquier artículo del catálogo del proveedor, buscándolo a mano).'],
        necesitas: [
          'Sesión iniciada — cualquier usuario puede armar una orden. Lo que cambia según quién la arma es qué pasa al guardarla (ver más abajo).',
        ],
        comoSeUsa: [
          {
            ol: [
              'Pantalla inicial: lista de proveedores ordenados por cuánto se pierde de vender si no se repone, con columnas "Sin stock", "Bajo mín." y "Sin historial". Buscador de proveedor y botón "Armar orden" por fila. También se llega desde "+ OC" (Monitor) o "Armar OC" (Alertas), con el proveedor y el artículo ya cargados.',
              'Al elegir un proveedor que ya tiene órdenes abiertas (borrador o esperando aprobación), aparece un aviso amarillo "Ya hay N órdenes abiertas de…" con links a cada una — para no cargar dos veces la misma compra.',
              'Al armar la orden: buscador "Agregar otro artículo del proveedor" (busca en todo su catálogo, no solo lo que está en alerta), tabla de artículos con checkbox por fila, cantidad editable y el total en pesos.',
              'Ningún artículo viene tildado por defecto — el sistema sugiere, vos decidís qué entra en la orden. Las cantidades sí vienen precargadas con la sugerencia calculada.',
              'Los botones **− / +** al lado de "Cantidad a pedir" saltan de a bulto (o de a 1 si el artículo no tiene bulto). Sumar con "+" también tilda el artículo.',
              'Lo que ya tildaste queda fijo arriba, en el bloque **"Ya seleccionados (N)"**, aunque pases de página: ahí podés cambiar la cantidad o sacarlo con "×".',
              'Tildes "Ocultar sin historial" (artículos sin ventas para sugerir cantidad) y "Ocultar con mínimo en 0" (mínimo en 0 o sin cargar en YiQi).',
              'Campo "Notas" para dejar algo escrito (para el proveedor o para Aris).',
              'Botón "Enviar por WhatsApp" (si el proveedor tiene WhatsApp cargado en Condiciones comerciales): abre WhatsApp con el texto ya armado — funciona incluso antes de guardar la orden.',
              'Para guardar: "Guardar borrador" (para retomar después) o "Enviar a aprobación" / "Confirmar orden" (el texto cambia solo según si requiere aprobación o no). Al guardar aparece un aviso verde con "Ver orden #N" y la pantalla sube sola, para que se vea que quedó guardada.',
            ],
          },
          'La columna **Stock** muestra la misma barra que Monitor de stock y Alertas: stock, marca del mínimo y del máximo (si está cargado en YiQi). La columna **Mín.** sigue al lado, con el número.',
        ],
        reglas: [
          { warn: 'Quién arma la orden importa mucho: si la arma Aris, queda confirmada directo, sin pasar por ningún control. Si la arma Ivana, la orden queda esperando que Aris la apruebe cuando pasa cualquiera de estas tres cosas: el total supera el límite de aprobación (propio del proveedor o el general), algún artículo quedó sin costo cargado, o el proveedor está marcado "siempre requiere mi aprobación".' },
          'Mientras se está guardando una orden, el botón queda bloqueado: un segundo clic no crea una orden repetida.',
          'El checkbox "Seleccionar todo" de la cabecera solo tilda lo que se ve en la página actual, no todo lo filtrado — importante con proveedores de catálogo grande.',
          'El aviso de "no llega al mínimo de compra" es solo informativo: no bloquea guardar ni enviar la orden.',
          { warn: 'Si la "Cantidad a pedir" de un artículo no es 0 ni un múltiplo del "Bulto" de ese proveedor, aparece un aviso en rojo bajo el campo y no deja "Confirmar orden" / "Enviar a aprobación" hasta corregirla. "Guardar borrador" nunca bloquea por esto.' },
          'La columna "Mín." es el punto de pedido (o el stock de seguridad si no hay punto de pedido cargado) tal cual está en YiQi para ese artículo — no es un cálculo del sistema. Si aparece con decimales, es porque así está cargado en YiQi. Lo mismo con el máximo de la barra: solo aparece si está cargado en YiQi.',
          '"Prom./mes" siempre redondea para arriba (por ejemplo, 2.3 se muestra como 3): es una referencia de consumo. La cantidad sugerida se calcula con el promedio real, sin redondear.',
        ],
        noHace: [
          'No edita una orden ya guardada desde esta pantalla — para eso está "Editar orden" en el detalle de la orden ("Órdenes de compra").',
          'No adjunta el PDF al mensaje de WhatsApp automáticamente — hay que arrastrarlo a mano (limitación de WhatsApp, no del sistema).',
        ],
      },
      {
        key: 'ocs',
        icon: 'ti-clipboard-list',
        label: 'Órdenes de compra',
        queEs: [
          'La pantalla central de gestión del día a día. Arriba, las órdenes que arma el propio sistema, cada una en una tarjeta con su color de estado; abajo, las órdenes ya cargadas en YiQi que todavía están activas (solo lectura).',
        ],
        necesitas: [
          'Sesión iniciada. Si no sos admin, ves solo las OC de YiQi de tus proveedores asignados (aviso "Vista filtrada" arriba de la tabla).',
          'Para aprobar o rechazar una orden propia hace falta ser Aris.',
        ],
        comoSeUsa: [
          '**Tarjetas de órdenes propias**: proveedor, número de orden, quién la armó, fecha, cantidad de ítems, total y una pastilla con el estado. El color dice qué hay que hacer: **azul** = esperando que Aris la apruebe; **amarillo** = falta algo que hacés vos (completar o enviar); **rojo** = problema (rechazada o error al cargar en YiQi); **verde** = listo. Arriba hay una leyenda "Acción requerida" con el significado de cada color.',
          'Chips "Órdenes" (activas) y "Papelera" (solo visible para Aris).',
          'Botones al pie de cada tarjeta según su estado y tu rol: **Editar ↗** o **Ver ↗** (abre la orden sola en una pestaña nueva), PDF, Causa, WhatsApp / Reenviar (aprobadas), Aprobar / Rechazar (solo Aris, si está esperando aprobación), Enviar / Eliminar (tu borrador), Reintentar envío (solo Aris, si falló YiQi), y archivar.',
          {
            ol: [
              'Crear una orden se hace desde "Nueva OC" — acá se gestiona lo que ya existe.',
              'Si sos Ivana (operador) y armaste un borrador: "Enviar" lo pasa a esperando aprobación de Aris; "Eliminar" lo borra (no se puede deshacer).',
              'Si sos Aris y hay una esperando aprobación: "Aprobar" o "Rechazar", con un comentario opcional. Al aprobar, el sistema manda la orden a YiQi automáticamente en el momento.',
              'Archivar manda una orden a la papelera — es reversible, tiene botón "Restaurar". "Eliminar definitivamente" desde la papelera sí es irreversible.',
            ],
          },
          '**Detalle de una orden** (pestaña nueva): solo esa orden, con una **barra de pasos** (Borrador → Aprobación → Cargada en YiQi → Enviada al proveedor → Mercadería recibida), un bloque de color que dice qué sigue y con el botón para hacerlo, la tabla de artículos con costo unitario y **Subtotal**, y el total.',
          {
            tip: '**Editar una orden** (desde el detalle, "Editar orden"): cambiar cantidades con − / + (saltan de a bulto), quitar artículos, y agregar artículos nuevos del mismo proveedor con un buscador. Quien la armó puede editarla en Borrador o Esperando aprobación; si estaba esperando aprobación, al guardar **vuelve a Borrador** y hay que enviarla de nuevo. Aris puede editar cualquier orden que no esté aprobada.',
          },
          {
            tip: '**Agregar mercadería a una orden ya aprobada y vinculada a YiQi**: en el detalle, botón "+ Agregar mercadería". Se cargan filas de SKU / Nombre (opcional) / Cantidad / Costo unitario neto, con "+ otra línea" para sumar varias. Al confirmar, los ítems se mandan directo a YiQi; si YiQi los rechaza, tampoco queda nada guardado acá.',
          },
          'El bloque de abajo (OC de YiQi) tiene su propio buscador por Nro OC / proveedor / asunto, y "↻ Actualizar". Click en una fila expande el detalle de líneas, con lo pendiente resaltado.',
        ],
        reglas: [
          { warn: 'Si una orden esperando aprobación tiene algún ítem sin costo cargado, "Aprobar" no abre el modal normal: abre un aviso explicando que YiQi rechaza cualquier OC con un ítem sin precio, y sugiere rechazarla y volver a cargarla con el costo completo. No hay forma de forzar la aprobación mientras falte ese dato.' },
          'Si la orden se aprueba pero el envío a YiQi falla, la aprobación NO se deshace: queda aprobada en rojo con el error visible, y Aris puede reintentarlo con "Reintentar envío" (no duplica nada en YiQi si ya se había mandado bien).',
          'El paso "Mercadería recibida" se marca con lo que informa YiQi. Una orden recibida completa deja de venir en el reporte de YiQi, así que ese paso puede no marcarse aunque la mercadería haya llegado.',
          'El bloque de YiQi solo muestra OC activas (no completadas) — para ver el historial completo están "Historial de OC" y "Seguimiento de OC".',
        ],
        noHace: [
          'No permite editar ni cancelar una orden ya aprobada o enviada a YiQi (solo agregarle mercadería nueva, como se explicó arriba).',
        ],
      },
      {
        key: 'seguimiento',
        icon: 'ti-route',
        label: 'Seguimiento de OC',
        queEs: ['Pensada para el día a día de "qué falta que llegue": muestra las órdenes cargadas en YiQi, separa lo que todavía está en curso de lo ya recibido completo, y agrupa lo recibido por mes y día.'],
        necesitas: ['Mismo criterio de permisos que las demás pantallas de OC (vista filtrada a tus proveedores si no sos admin).'],
        comoSeUsa: [
          'Chips de estado arriba: Todas / Enviadas / Ingreso parcial / Completadas, cada uno con contador. Filtro de fechas Desde / Hasta. Botón "↻ Actualizar".',
          'Si hay órdenes con ingreso parcial, un aviso amarillo arriba lo resalta.',
          'Las órdenes en curso aparecen en tarjetas, las más recientes primero, con un borde de color: **gris** = enviada, todavía sin ingresos; **amarillo** = llegó una parte; **verde** = recibida completa. Cada tarjeta muestra proveedor, cantidad de artículos y asunto, fecha, total, la pastilla de estado (por ejemplo "Ingreso parcial · 12 u pendientes") y la causa declarada si hay una.',
          '"Ver" en una tarjeta despliega la **barra de pasos** (Enviada al proveedor → Ingreso de mercadería → Recibida completa) y el detalle por artículo: pedido, entregado y pendiente.',
          'Botón "Causa" / "Ver causa": mismo modal que en Alertas y Órdenes de compra, con historial acumulado.',
          'Abajo, "Recibidas completas": carpetas colapsables por mes y, dentro de cada mes, por día.',
        ],
        reglas: [
          'Acá la "causa" declarada es de ámbito Entregas (por ejemplo, demora del proveedor), distinta de la que se declara sobre un artículo en Alertas.',
          'Si llegaron más unidades de las pedidas, la tarjeta dice "Ingreso con exceso" con la diferencia.',
          'Solo muestra órdenes que ya están en YiQi. Las órdenes propias en borrador, esperando aprobación o listas para enviar se ven en "Órdenes de compra".',
        ],
        noHace: ['No tiene paginado (a diferencia de Historial de OC) — todo lo activo se lista entero.', 'No permite exportar ni imprimir desde acá.'],
      },
      {
        key: 'historial',
        icon: 'ti-history',
        label: 'Historial de OC',
        queEs: ['El archivo completo y buscable de todas las órdenes de YiQi, incluidas las ya completadas — con filtros más finos que "Órdenes de compra".'],
        necesitas: ['Mismo criterio de permisos que las demás pantallas de OC.'],
        comoSeUsa: [
          'Arriba, cuatro números del mes en curso: **Enviadas este mes** (OC con fecha de este mes), **Completadas este mes**, **Ingresos parciales** y **Gasto del mes** (suma de los totales de las OC del mes). Se calculan con las órdenes que ves, según tus permisos.',
          'Filtros: Buscar (Nro OC / proveedor / asunto), Proveedor (desplegable, limitado a lo que podés ver), Estado (Todas / Enviada / Ingreso parcial / Completada), fechas Desde / Hasta, y "Limpiar filtros".',
          'Selector de filas por página (25/50/100/200). Click en una orden expande el detalle por artículo (SKU, artículo, cantidad, entregado, pendiente). "↻ Actualizar" para releer.',
        ],
        reglas: ['A diferencia de "Órdenes de compra", acá sí aparecen las órdenes ya completadas.'],
        noHace: ['No permite ninguna acción sobre las órdenes (ni PDF, ni declarar causa) — es puramente de consulta.', 'No exporta a Excel/CSV.'],
      },
      {
        key: 'precios',
        icon: 'ti-currency-dollar',
        label: 'Comparar precios',
        queEs: ['Buscás un artículo y ves su precio junto con "candidatos" de artículos parecidos en otros proveedores, para decidir con criterio antes de armar la próxima orden.'],
        necesitas: [
          'No requiere rol especial para consultar (vista filtrada a tus proveedores si no sos admin).',
          'Depende de los precios sincronizados desde YiQi (una vez por día) y de que alguien haya revisado pares en "Revisar equivalencias" para que aparezcan como confirmados.',
        ],
        comoSeUsa: [
          'Escribí al menos 2 caracteres en el buscador (SKU o nombre). Por cada resultado se arma una tarjeta con el artículo buscado y dos grupos: "✓ Equivalencias confirmadas" (fondo verde, ya revisadas por una persona — acá sí se marca "Más barato") y "Posibles equivalentes (sin confirmar)" (sugeridos por parecido de nombre, con un % de coincidencia — nunca se marcan como más baratos, son solo una pista).',
          'Botón "Revisar equivalencias" arriba a la derecha te lleva directo a esa pantalla.',
        ],
        reglas: [
          { tip: 'En YiQi cada SKU es único de un proveedor — nunca se repite entre dos proveedores. Por eso la comparación se hace por parecido de nombre, no por código. Un "posible equivalente" puede ser el mismo producto en otra presentación (uno lo vende suelto y otro en caja) o puede no tener nada que ver — el sistema solo sugiere, no lo sabe con certeza.' },
          'Lo que se confirma en "Revisar equivalencias" aparece acá automáticamente como equivalencia confirmada — son dos pantallas conectadas.',
        ],
        noHace: ['No permite confirmar o rechazar una equivalencia desde acá mismo — eso se hace en "Revisar equivalencias".', 'No arma ni exporta una orden desde esta pantalla.'],
      },
      {
        key: 'equivalencias',
        icon: 'ti-link',
        label: 'Revisar equivalencias',
        queEs: ['Revisás en tandas de 30 los pares de artículos de distintos proveedores que el sistema sugiere como parecidos, y decidís si son o no el mismo producto. Esa decisión alimenta "Comparar precios".'],
        necesitas: ['Sesión iniciada (vista filtrada a tus proveedores si no sos admin).'],
        comoSeUsa: [
          'Al entrar se carga sola una tanda de hasta 30 pares. Por cada par se ve, lado a lado, proveedor A vs proveedor B (nombre, SKU, precio) y el % de coincidencia de nombre.',
          'Dos botones por par: "✕ No es el mismo" y "✓ Sí, mismo producto". Al decidir, el par desaparece al instante y se suma al contador de revisados.',
          'Al terminar la tanda aparece "¡Tanda completa!" con el botón "Cargar la siguiente tanda". "↻ Cargar tanda nueva" está disponible en cualquier momento.',
        ],
        reglas: [
          { tip: 'El criterio para decidir: ¿es el mismo producto, en la misma unidad de medida base, aunque cambie el proveedor? Ignorá la presentación comercial — si uno lo vende suelto y el otro en caja de 1kg, pero ambos son "1kg del mismo producto", contestá que sí.' },
        ],
        noHace: ['No permite deshacer una decisión ya guardada.', 'No muestra quién decidió cada par.'],
      },
    ],
  },
  {
    titulo: 'Inteligencia',
    tabs: [
      {
        key: 'predictor',
        icon: 'ti-chart-line',
        label: 'Predictor de demanda',
        queEs: ['Historial real de ventas mes a mes de cada artículo (últimos 12 meses completos), con el promedio mensual y cuántos meses de cobertura da el stock actual.'],
        necesitas: ['Sesión iniciada (vista filtrada a tus proveedores si no sos admin, aplicada automáticamente por el servidor).'],
        comoSeUsa: [
          'Tres tarjetas resumen arriba: artículos con movimiento, unidades vendidas (neto de devoluciones), y cuántos están con cobertura menor a 1 mes.',
          'Buscador por SKU/nombre/proveedor, selector de filas por página. La tabla trae, además de stock y cobertura, una columna por cada uno de los últimos 12 meses con el detalle real de venta.',
        ],
        reglas: [
          { tip: 'El nombre de la pantalla dice "Predictor", pero hoy es historial retrospectivo, no un pronóstico: la cobertura es una simple cuenta (stock actual dividido el promedio mensual histórico), sin proyectar tendencias.' },
          'El mes en curso se excluye siempre del cálculo, porque todavía está incompleto.',
        ],
        noHace: ['No hace ninguna proyección real de demanda futura.', 'No exporta a Excel.', 'No tiene ninguna acción disponible — es puramente de consulta.'],
      },
    ],
  },
  {
    titulo: 'Configuración',
    tabs: [
      {
        key: 'empresa',
        icon: 'ti-building',
        label: 'Datos de la empresa',
        queEs: ['Los datos de Dentalab (nombre, razón social, CUIT, dirección, teléfono, logo, pie de página) que encabezan las órdenes de compra en PDF y los mensajes al proveedor.'],
        necesitas: ['Cualquiera puede consultarla. Editar y guardar: solo Aris.'],
        comoSeUsa: [
          'Formulario con los campos de la empresa. El logo se carga pegando la URL de una imagen ya publicada en internet (no se sube un archivo) — clic derecho sobre el logo en el sitio de la empresa → "Copiar dirección de la imagen".',
          'A la derecha, "Así se va a ver": vista previa en vivo del membrete tal como va a salir en una orden de compra.',
          'Botón "Guardar cambios" arriba a la derecha (solo Aris, se habilita cuando hay cambios reales).',
        ],
        reglas: [
          { warn: 'Si un campo queda vacío, esa línea directamente no aparece en el PDF ni en el WhatsApp de la orden — el sistema nunca imprime un dato inventado, pero la orden puede salir incompleta. Cargá al menos Razón social, CUIT y Dirección antes de empezar a mandar órdenes en serio.' },
        ],
        noHace: ['No permite subir un archivo de logo, solo pegar una URL externa.', 'No valida el formato del CUIT ni de los demás campos.'],
      },
      {
        key: 'proveedores',
        icon: 'ti-building-store',
        label: 'Proveedores',
        queEs: ['Lista de los proveedores que hoy tienen artículos activos en el catálogo, con sus datos de contacto, sus condiciones comerciales cargadas y un resumen de alertas por proveedor.'],
        necesitas: ['Sesión iniciada (vista filtrada a tus proveedores si no sos admin).'],
        comoSeUsa: [
          'Tabla con Código, Proveedor, CUIT, Condición IVA, Teléfono, cantidad de Artículos, Alertas, WhatsApp de pedidos, Límite de aprobación y Mínimo de compra (estos últimos tres vienen de "Condiciones comerciales"; "general" quiere decir que usa el valor general del sistema).',
          'Buscador por nombre, código o CUIT y selector de filas por página. Click en un proveedor expande el detalle: SKU, artículo, stock y estado de cada artículo.',
          '"↻ Actualizar" arriba a la derecha.',
        ],
        reglas: ['La lista se arma sola a partir del catálogo sincronizado desde YiQi — un proveedor solo aparece acá si tiene al menos un artículo activo hoy.'],
        noHace: ['No permite dar de alta ni editar un proveedor manualmente — los datos vienen de YiQi, y las condiciones se cargan en "Condiciones comerciales".', 'No exporta la lista.'],
      },
      {
        key: 'condiciones',
        icon: 'ti-file-certificate',
        label: 'Condiciones comerciales',
        queEs: ['Acá se cargan a mano los datos que no vienen de YiQi: mínimo de compra, plazo de pago, WhatsApp/mail de pedidos, descuento por volumen, días de entrega, y el límite de aprobación propio de ese proveedor.'],
        necesitas: ['Cualquiera puede consultarlas. Editar: solo Aris.'],
        comoSeUsa: [
          'La tabla lista todos los proveedores con lo ya cargado. Checkbox "Ver solo los que faltan completar" y buscador por nombre.',
          'Click en "Completar" (Aris) despliega el formulario de esa fila: mínimo de compra (+ si es en pesos o en unidades), plazo de pago, descuento, WhatsApp de pedidos, mail de pedidos, contacto, días de entrega, límite de aprobación propio, checkbox "Siempre requiere mi aprobación", y notas.',
          '"Guardar" confirma los cambios de esa fila y cierra el formulario; "Cancelar" descarta.',
        ],
        reglas: [
          'No hace falta completar todos los proveedores: el que queda en blanco usa los valores generales del sistema (el límite general de "Reglas de compra y aprobación").',
          { tip: 'Cargar el WhatsApp de pedidos acá es justamente lo que habilita el botón "Enviar por WhatsApp" en Nueva OC y en Órdenes de compra para ese proveedor.' },
        ],
        noHace: ['No valida que el mínimo de compra tenga sentido contra compras reales.', 'No muestra un historial visible de cambios en pantalla.'],
      },
      {
        key: 'usuarios',
        icon: 'ti-users',
        label: 'Usuarios y accesos',
        queEs: ['Administra qué usuarios existen, qué proveedores puede ver cada uno, y permite restablecer contraseñas.'],
        necesitas: [{ warn: 'Es exclusiva de Aris — un operador ni siquiera puede consultarla (ve un aviso de que no tiene permiso). El límite corre tanto en la pantalla como en el servidor, no es solo visual.' }],
        comoSeUsa: [
          'Tabla con cada usuario: email, creado, último login, proveedores asignados ("Ninguno (ve el catálogo completo)" si no tiene ninguno).',
          {
            ol: [
              '"Gestionar accesos" despliega un panel con buscador de proveedores y una grilla de checkboxes para tildar/destildar cuáles ve ese usuario. Cada cambio se guarda al toque, no hay botón "Guardar" aparte.',
              '"🔑 Contraseña" abre un modal para poner una nueva contraseña (mínimo 8 caracteres) y confirmarla con "Restablecer". El sistema no le avisa a la persona por ningún lado — hay que avisarle la clave nueva por fuera.',
            ],
          },
        ],
        reglas: [
          { warn: 'Un usuario SIN ningún proveedor asignado ve el catálogo completo, no queda bloqueado. Ojo con dejar a alguien sin asignar por error de tipeo.' },
          'La asignación de proveedores se aplica como filtro real en Monitor de stock, Seguimiento de OC, Proveedores, Comparar precios y Revisar equivalencias — no es solo cosmético.',
        ],
        noHace: ['No permite crear usuarios nuevos desde acá (solo gestionar accesos y contraseña de los que ya existen).'],
      },
      {
        key: 'causas',
        icon: 'ti-tags',
        label: 'Catálogo de causas',
        queEs: ['La lista de motivos que se pueden declarar sobre un artículo (Stock), una compra (Compras) o una entrega (Entregas) — por ejemplo "no tienen stock", "solo por pedido", "lo pide Aris".'],
        necesitas: ['Cualquiera puede consultarlo. Agregar, renombrar o desactivar: solo Aris.'],
        comoSeUsa: [
          'Tres pestañas por ámbito: Stock / Compras / Entregas, cada una con su contador.',
          '"Renombrar" (Aris) abre los campos Causa y Descripción editables en la misma fila, con "Guardar" / "Cancelar".',
          '"Desactivar" / "Activar" (Aris) cambia el estado sin borrar nada.',
          'Al final de la tabla, "Agregar causa a [Ámbito]": campos Causa y Descripción (opcional), botón "Agregar".',
        ],
        reglas: [
          { tip: 'Las causas ya usadas no se borran, se desactivan — así ninguna declaración anterior queda "apuntando a la nada". El botón dice "Desactivar" a propósito, nunca "Eliminar".' },
        ],
        noHace: ['No permite reordenar causas manualmente.', 'No permite eliminar una causa definitivamente.'],
      },
      {
        key: 'reglas',
        icon: 'ti-adjustments',
        label: 'Reglas de compra y aprobación',
        queEs: ['Los tres parámetros globales que usa el sistema para armar sugerencias de compra y decidir qué requiere aprobación de Aris.'],
        necesitas: ['Cualquiera puede consultarlas. Editar: solo Aris.'],
        comoSeUsa: [
          'Tres campos numéricos, cada uno con su explicación abajo: "Límite de aprobación automática" (en pesos), "Máximo de bultos por producto" y "Meses de cobertura objetivo".',
          '"Guardar cambios" se habilita solo si sos Aris y hubo cambios reales respecto a lo ya guardado.',
          'Debajo, un resumen en 4 pasos de "Cómo se combinan" los tres valores, con tus números actuales insertados en el texto.',
        ],
        reglas: [
          { tip: 'Si dejás un campo vacío, el sistema NO lo guarda como 0 en silencio — te pide completar los tres con un número válido antes de dejarte guardar.' },
          'Los artículos de Mercado Libre, discontinuados y de producción propia quedan siempre fuera de las sugerencias, sin importar estos tres valores.',
        ],
        noHace: ['No guarda un historial de cambios de estas reglas (solo la última modificación).', 'No permite reglas distintas por proveedor o categoría — son tres valores únicos, globales.'],
      },
      {
        key: 'templates',
        icon: 'ti-message',
        label: 'Templates de mensajes',
        queEs: ['Edita las plantillas de texto (mail y WhatsApp) que se usan para armar el mensaje al proveedor.'],
        necesitas: ['Cualquiera puede consultarlas. Editar: solo Aris.'],
        comoSeUsa: [
          'Chips arriba para elegir la plantilla (email o WhatsApp).',
          'Editor (Aris): Nombre de la plantilla, Asunto (si es email), y Mensaje. Debajo, botones de variables (ej. {{proveedor}}, {{total}}, {{items}}) que se insertan con un click al final del texto.',
          'A la derecha, vista previa en vivo con datos de ejemplo. "Copiar texto" copia al portapapeles el mensaje ya armado con esos ejemplos.',
          '"Guardar cambios" (Aris, solo si hubo cambios).',
        ],
        reglas: [{ warn: 'El envío automático por email o WhatsApp todavía no existe. Esta pantalla solo prepara el texto — el envío real (botón "Enviar por WhatsApp" en Nueva OC / Órdenes de compra) arma el mensaje con estas plantillas y lo abre en WhatsApp para mandarlo a mano.' }],
        noHace: ['No envía nada automáticamente.'],
      },
      {
        key: 'yiqi',
        icon: 'ti-plug-connected',
        label: 'Conector YiQi',
        queEs: ['Pantalla de diagnóstico de la conexión con YiQi: si está viva, cuándo sincronizó por última vez y qué reportes de YiQi usa el sistema. No es operativa, es para chequear que todo esté bien.'],
        necesitas: ['Sesión iniciada.'],
        comoSeUsa: [
          '"↻ Verificar ahora" fuerza un chequeo en vivo del estado de conexión.',
          'Punto verde "Conectado a YiQi" o rojo "Sin conexión" (con el motivo si lo hay). Si hubo fallas de renovación en las últimas 24 horas aunque hoy diga "Conectado", aparece un aviso ámbar de alerta temprana.',
          'Si está conectado: última sincronización, schema y base URL, y una tabla con los reportes de YiQi que se leen (nombre en YiQi, entidad, número de reporte) y en qué pantallas se usa cada uno.',
        ],
        reglas: [
          { tip: 'Este es el primer lugar para mirar si algo "dejó de actualizarse" en cualquier otra pantalla del sistema — acá se ve si el corte es de YiQi o de otra cosa.' },
          { warn: 'Los reportes de YiQi que dicen "NO BORRAR" en el nombre son los que alimentan el sistema. Si alguien los borra o les cambia los filtros en YiQi, las pantallas que los usan dejan de actualizarse.' },
        ],
        noHace: ['No permite forzar una resincronización completa de datos, solo verificar el estado.', 'No permite cambiar la configuración de la integración desde acá.'],
      },
    ],
  },
]

// Índice plano de todos los tabs, para la búsqueda y para armar el
// índice de navegación sin repetir la estructura de MODULOS dos veces.
const TODOS_LOS_TABS = MODULOS.flatMap((m) => m.tabs.map((t) => ({ ...t, modulo: m.titulo })))

function textoPlano(tab) {
  const juntar = (arr) =>
    (arr || [])
      .map((b) => (typeof b === 'string' ? b : b.ul?.join(' ') || b.ol?.join(' ') || b.tip || b.warn || ''))
      .join(' ')
  return [tab.label, juntar(tab.queEs), juntar(tab.necesitas), juntar(tab.comoSeUsa), juntar(tab.reglas), juntar(tab.noHace)]
    .join(' ')
    .toLowerCase()
}

function TabCard({ tab, abierta, onToggle }) {
  return (
    <div id={`ayuda-${tab.key}`} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden scroll-mt-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50"
      >
        <i className={`ti ${tab.icon} text-[17px] text-[var(--ind)] flex-shrink-0`} />
        <span className="flex-1 text-[14px] font-bold">{tab.label}</span>
        <span className="text-gray-400 text-[12px]">{abierta ? '▾ ocultar' : '▸ ver'}</span>
      </button>
      {abierta && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--border)] flex flex-col gap-4">
          <Campo titulo="Qué es" items={tab.queEs} />
          <Campo titulo="Qué necesitás para usarla" items={tab.necesitas} />
          <Campo titulo="Cómo se usa" items={tab.comoSeUsa} tono="ind" />
          <Campo titulo="Reglas importantes" items={tab.reglas} />
          <Campo titulo="Qué no hace todavía" items={tab.noHace} />
        </div>
      )}
    </div>
  )
}

export default function Ayuda() {
  const [busqueda, setBusqueda] = useState('')
  const [abiertos, setAbiertos] = useState(() => new Set())

  function toggle(key) {
    setAbiertos((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const filtro = busqueda.trim().toLowerCase()
  const hayFiltro = filtro.length >= 2

  // Con búsqueda activa: se muestran solo los tabs que matchean, y se
  // fuerzan abiertos (para no tener que además clickear cada uno).
  const modulosFiltrados = useMemo(() => {
    if (!hayFiltro) return MODULOS
    return MODULOS.map((m) => ({
      ...m,
      tabs: m.tabs.filter((t) => textoPlano(t).includes(filtro)),
    })).filter((m) => m.tabs.length > 0)
  }, [hayFiltro, filtro])

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      <EncabezadoPagina
        titulo="Ayuda"
        bajada="Qué hace cada pantalla del menú, cómo se usa, y qué reglas conviene tener presentes"
      />

      <div className="pagina flex flex-col gap-4 max-w-3xl">
        {/* Roles, en una tarjeta fija arriba de todo — es la base para entender
            por qué varias pantallas se ven distinto según quién entra. */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-4">
          <div className="text-[13px] font-bold mb-2">Antes de nada: los tres tipos de cuenta</div>
          <Bloques
            items={[
              {
                ul: [
                  '**Aris (administrador)**: ve y edita todo, sin ningún filtro de proveedores. Es el único que puede aprobar/rechazar órdenes pendientes, configurar Reglas de compra y aprobación, Templates, Catálogo de causas, Condiciones comerciales, Datos de la empresa, entrar a Usuarios y accesos, y ver la supervisión de "Reposición Central-Local".',
                  '**Ivana / cualquier otro operador**: ve solo los proveedores que Aris le asignó en "Usuarios y accesos". Puede armar órdenes (Nueva OC), pero si superan el límite de aprobación, tienen algún ítem sin costo, o el proveedor exige aprobación siempre, la orden queda pendiente de que Aris la confirme.',
                  '**Cuentas de depósito** (Depósito Central / encargado del Local): un login y un menú completamente aparte, sin nada de lo de arriba. Tienen su propia Ayuda dentro de ese menú (distinta de esta pantalla, que ellas nunca ven) — acá, en el módulo "Depósito (cuentas aparte)" más abajo, está lo mismo pero pensado para que Aris/Ivana sepan qué hacen esas cuentas al entrenarlas.',
                ],
              },
              { tip: 'Si un usuario operador no tiene ningún proveedor asignado, ve el catálogo completo — no queda bloqueado. Y si el sistema no puede determinar los permisos de alguien (por un error), esa persona no ve ningún dato en ninguna pantalla: ante la duda, el sistema prefiere no mostrar nada antes que mostrar de más.' },
            ]}
          />
        </div>

        {/* 7/10/2026: código de colores único y el ⓘ, comunes a todas las pantallas. */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-4">
          <div className="text-[13px] font-bold mb-2">Cómo leer las pantallas: colores y ⓘ</div>
          <Bloques
            items={[
              'Todas las pantallas usan los mismos colores para los estados:',
              {
                ul: [
                  '**Verde**: listo o resuelto (aprobada, recibida, stock OK).',
                  '**Amarillo**: falta algo que hacés vos (completar el mínimo, enviar la orden, ingreso parcial).',
                  '**Azul**: esperando a otra persona (esperando aprobación de Aris).',
                  '**Rojo**: hay un problema (sin stock, rechazada, error al cargar en YiQi).',
                  '**Gris**: neutro o informativo (borrador, enviada).',
                ],
              },
              { tip: 'El ⓘ al lado del subtítulo de una pantalla tiene la explicación de cómo funciona: pasá el mouse por encima (o tocalo) para verla. Reemplaza a los carteles azules que había antes.' },
            ]}
          />
        </div>

        {/* Buscador */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-3">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en la ayuda (ej: WhatsApp, aprobar, causa, contraseña…)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm outline-none focus:border-[var(--ind)]"
          />
        </div>

        {/* Índice rápido — solo cuando no hay búsqueda activa, para no competir con los resultados */}
        {!hayFiltro && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-4">
            <div className="text-[13px] font-bold mb-2.5">Ir directo a una pantalla</div>
            <div className="flex flex-col gap-3">
              {MODULOS.map((m) => (
                <div key={m.titulo}>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{m.titulo}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {m.tabs.map((t) => (
                      <a
                        key={t.key}
                        href={`#ayuda-${t.key}`}
                        onClick={() => setAbiertos((prev) => new Set(prev).add(t.key))}
                        className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-full bg-[var(--ind-bg)] text-[var(--ind-d)] hover:bg-[var(--ind-lt)] no-underline"
                      >
                        <i className={`ti ${t.icon}`} /> {t.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hayFiltro && modulosFiltrados.length === 0 && (
          <div className="text-center text-[13px] text-gray-400 py-8">
            No encontré nada con "{busqueda}". Probá con otra palabra.
          </div>
        )}

        {(hayFiltro ? modulosFiltrados : MODULOS).map((m) => (
          <div key={m.titulo} className="flex flex-col gap-2.5">
            <div className="text-[11px] text-gray-400 uppercase tracking-wider px-1 mt-1">{m.titulo}</div>
            {m.tabs.map((t) => (
              <TabCard key={t.key} tab={t} abierta={hayFiltro || abiertos.has(t.key)} onToggle={() => toggle(t.key)} />
            ))}
          </div>
        ))}

        <div className="bg-white rounded-xl border border-[var(--border)] p-4 mb-2">
          <div className="text-[13px] font-bold mb-2">Cosas que el sistema, hoy, todavía no hace</div>
          <Bloques
            items={[
              {
                ul: [
                  'No manda mensajes (mail o WhatsApp) en forma automática — siempre arma el texto/PDF y sos vos quien lo envía.',
                  'Una orden ya aprobada no se puede editar — solo se le puede sumar mercadería nueva si ya está vinculada a YiQi (desde el detalle en "Órdenes de compra"). Las que todavía no están aprobadas sí se editan, con "Editar orden".',
                  'No muestra la fecha estimada de llegada de una orden: el plazo de entrega de cada proveedor todavía no está cargado.',
                  'No hay estadísticas ni reportes (aparte de Predictor de demanda, que es historial, no proyección).',
                  'Ninguna pantalla exporta a Excel. Los remitos del circuito de depósito se imprimen/guardan como PDF (botón "Imprimir remito"), no se exportan a Excel.',
                ],
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}

export { TODOS_LOS_TABS }
