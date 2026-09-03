import { useMemo, useState } from 'react'

// ============================================================
// Ayuda.jsx — manual de uso in-app, pantalla por pantalla.
//
// Contenido derivado del código real de cada pantalla (no inventado),
// revisado el 24/8/2026. Si una pantalla cambia, este archivo puede
// quedar desactualizado — no hay ninguna sincronización automática
// entre el código de una pantalla y su texto acá.
//
// [27/8/2026] Actualizado: exclusión de la línea Acritone/NewcryL
// (26/8/2026, a pedido de Aris — "SON PRODUCTOS, NO PROVEEDORES,
// TODAVÍA NO LOS VAMOS A INCLUIR EN EL SISTEMA"). Afecta Alertas,
// Monitor de stock y Reposición interna, ver sus secciones de reglas.
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
        icon: '📦',
        label: 'Monitor de stock',
        queEs: [
          'Foto general de todo el catálogo (o del catálogo de tus proveedores asignados, si no sos admin) con el estado de cada artículo: Crítica, Preventiva u OK.',
          { tip: 'No lee YiQi en vivo: lee una copia propia que se actualiza sola cada 15 minutos. Arriba de la pantalla siempre dice a qué hora fue la última sincronización.' },
        ],
        necesitas: [
          'Tener sesión iniciada y estar dado de alta en "Usuarios y accesos".',
          'Si no sos Aris, necesitás tener al menos un proveedor asignado en "Usuarios y accesos" — si no tenés ninguno, esta pantalla te va a aparecer vacía.',
        ],
        comoSeUsa: [
          'Por defecto la tabla solo muestra los artículos con alguna alerta. El link "Ver todos" arriba de la tabla la cambia para mostrar el catálogo completo; "Ver solo con alerta" vuelve atrás.',
          'Buscador de texto libre por SKU, nombre o proveedor, y selector de cuántas filas ver por página.',
          'La columna Stock trae, debajo del número total, el desglose por depósito (Local / Central, y Jorge / ML Full en el tooltip si tienen algo).',
          'Botón "↻ Actualizar" arriba a la derecha: vuelve a leer la copia propia — no fuerza una sincronización nueva con YiQi, esa corre sola cada 15 minutos.',
        ],
        reglas: [
          { warn: 'Es de solo lectura. No hay forma de cambiar Punto de Pedido ni Stock de Seguridad desde acá — eso se carga directamente en YiQi.' },
          'Una fila queda "sin config." (y no genera ninguna alerta) si el artículo no tiene ni Punto de Pedido ni Stock de Seguridad cargado en YiQi.',
          'Igual que en Alertas: un artículo nunca cuenta para las alertas de esta pantalla si es código administrativo, publicación de Mercado Libre, está marcado discontinuado, es de producción propia (proveedor "Dentalab"), o es de la línea Acritone/NewcryL (excluida del sistema el 26/8/2026, a pedido de Aris).',
        ],
        noHace: ['No exporta a Excel ni PDF.', 'No permite editar nada — para eso están Reposición interna (mover stock) o Nueva OC (comprar).'],
      },
      {
        key: 'reposicion',
        icon: '🔁',
        label: 'Reposición interna',
        queEs: [
          'La pantalla de trabajo diario para mover mercadería del Depósito Central al local sin comprarle a nadie — y, cuando Central tampoco alcanza, el puente directo a armar una orden de compra.',
        ],
        necesitas: [
          'Sesión iniciada con permisos (mismo criterio que Monitor de stock).',
          'El cálculo se genera solo una vez por día con un cron. Si querés la foto más actualizada, usá "↻ Actualizar" arriba, que lo vuelve a calcular al instante.',
        ],
        comoSeUsa: [
          'Hay dos vistas, con un selector arriba: "Lista" (para trabajar artículo por artículo) y "Remitos" (para el picking físico, de solo lectura).',
          {
            ol: [
              'En "Lista": filtrá por prioridad con los chips de arriba (cada uno con su nombre y contador), o buscá por SKU/nombre/proveedor.',
              'Por defecto las prioridades 8 y 9 ("No considerados" y "Sin necesidad") están ocultas — son la mayoría del catálogo y no requieren ninguna acción. Se muestran con el checkbox de arriba si hace falta revisarlas.',
              'Las prioridades 1 a 5 (las que sí requieren acción) tienen dos botones en la columna Acción: "✓ Movido" (abre un modal con la cantidad sugerida, editable, para confirmar cuánto se movió realmente) y "✗ Descartar" (abre un modal que exige escribir un motivo — no se puede confirmar vacío).',
              'La prioridad 6 ("Artículos a pedir", Central tampoco alcanza) tiene el botón "🛒 Pedir a proveedor": te lleva directo a Nueva OC con ese proveedor y ese SKU ya buscados, listo para que decidas si lo agregás a una orden. Si el artículo no tiene proveedor cargado en YiQi, en vez del botón aparece "Sin proveedor".',
              'Las prioridades 7, 8 y 9 son informativas — no tienen botón de acción, solo el texto "Informativo".',
            ],
          },
          'En "Remitos": las sugerencias pendientes (prioridad 1 a 5) se reparten solas en tandas de hasta 30 artículos, para llevar de referencia al hacer el picking. "↻ Generar remitos" las vuelve a repartir todas (lo ya movido/descartado no vuelve a aparecer). Cada remito se exporta a Excel individualmente o todos juntos con "⬇ Descargar todos".',
        ],
        reglas: [
          { warn: 'Marcar "Movido" o "Descartar" es definitivo desde esta pantalla — no hay botón para deshacerlo después. Si te equivocaste, avisale a Federico.' },
          'El objetivo de cobertura local es 1 mes de venta promedio de los últimos 12 meses, y nunca se sugiere mover más de lo que hay disponible en Central.',
          'La vista "Remitos" es de solo lectura: marcar algo como movido o descartado se hace siempre desde "Lista", nunca desde ahí.',
          'Mismo filtro que en Alertas: los artículos administrativos, de Mercado Libre, discontinuados, de producción propia, o de la línea Acritone/NewcryL (excluida el 26/8/2026) nunca aparecen acá, en ninguna prioridad.',
        ],
        noHace: [
          'No permite editar la cantidad sugerida antes de moverla (solo se puede corregir la cantidad real al confirmar "Movido").',
          'No arma la orden de compra sola desde "Pedir a proveedor" — solo te deja parado en Nueva OC con los datos ya cargados en el buscador.',
        ],
      },
    ],
  },
  {
    titulo: 'Compras',
    tabs: [
      {
        key: 'alertas',
        icon: '🔔',
        label: 'Alertas',
        queEs: ['Listado filtrable de todo lo que está Crítico o Preventivo, con la posibilidad de dejar registrada la causa de cada situación.'],
        necesitas: ['Mismo criterio de sesión/permisos que Monitor de stock. No requiere nada más — el sync es automático.'],
        comoSeUsa: [
          'Chips arriba para filtrar: "Todas", "Críticas", "Preventivas". Buscador por SKU/nombre/proveedor.',
          'La columna Causa muestra la última causa declarada para ese artículo (o "—" si no hay ninguna) con un link "Declarar causa" (o "Ver / declarar" si ya hay una).',
          {
            ol: [
              'Click en "Declarar causa" abre un modal: elegís una causa del desplegable, opcionalmente escribís una nota, y "Guardar declaración".',
              'Debajo del formulario se ve el historial completo de declaraciones anteriores para ese artículo, la más reciente marcada "Vigente".',
            ],
          },
        ],
        reglas: [
          { tip: 'Declarar una causa es solo para dejar registro — no cambia el estado de la alerta ni la saca de la lista. Cada declaración se agrega al historial, nunca se edita ni se borra una anterior.' },
          'Un artículo se excluye siempre de las alertas si es código administrativo, publicación de Mercado Libre, está marcado discontinuado, el proveedor es "Dentalab" (producción propia), o es de la línea Acritone/NewcryL (excluida del sistema el 26/8/2026, a pedido de Aris — son productos, no proveedores, y todavía no se van a incluir).',
        ],
        noHace: ['No tiene botón para "resolver" o cerrar una alerta a mano — desaparecen solas cuando el stock deja de estar bajo el umbral.', 'No exporta a Excel/PDF.'],
      },
      {
        key: 'ocs',
        icon: '📋',
        label: 'Órdenes de compra',
        queEs: [
          'La pantalla central de gestión del día a día. Combina dos bloques: arriba, las órdenes que arma el propio sistema ("Órdenes generadas desde el sistema", con su circuito de aprobación); abajo, las órdenes ya cargadas en YiQi que todavía están activas (de solo lectura).',
        ],
        necesitas: [
          'Sesión iniciada. Si no sos admin, ves solo las OC de YiQi de tus proveedores asignados (aviso "Vista filtrada" arriba de la tabla).',
          'Para aprobar o rechazar una orden propia hace falta ser Aris.',
        ],
        comoSeUsa: [
          '**Bloque de órdenes propias** — dos pestañas: "Órdenes" (activas) y "🗑 Papelera" (solo visible para Aris). Cada fila tiene botones según su estado y tu rol: Ver detalle, PDF, Declarar causa, 💬 WhatsApp / Reenviar (solo si está aprobada), Aprobar / Rechazar (solo Aris, solo si está pendiente), Enviar / Eliminar (si armaste vos un borrador), Reintentar envío (solo Aris, si quedó con error de YiQi), 🗑 archivar.',
          {
            ol: [
              'Crear una orden se hace desde "Nueva OC" (ver esa pestaña) — acá se gestiona lo que ya existe.',
              'Si sos Ivana (operador) y armaste un borrador: "Enviar" lo pasa a pendiente de aprobación de Aris; "Eliminar" lo borra (no se puede deshacer).',
              'Si sos Aris y hay una pendiente: "Aprobar" o "Rechazar", con un comentario opcional. Al aprobar, el sistema manda la orden a YiQi automáticamente en el momento.',
              'Archivar (🗑) manda una orden a la papelera — es reversible, tiene botón "Restaurar". "Eliminar definitivamente" desde la papelera sí es irreversible.',
            ],
          },
          {
            tip: '**Agregar mercadería a una orden ya aprobada y vinculada a YiQi**: abrí el detalle de la orden y usá el botón "+ Agregar mercadería". Se abre un formulario con filas de SKU / Nombre (opcional) / Cantidad / Costo unitario neto — se pueden agregar varias líneas con "+ otra línea". Al confirmar "Agregar a la orden", los ítems se mandan directo a YiQi; si YiQi los rechaza, tampoco queda nada guardado acá. Sirve para sumar mercadería en cualquier momento del circuito, incluso después de aprobada.',
          },
          'El bloque de abajo (OC de YiQi) tiene su propio buscador por Nro OC / proveedor / asunto, y "↻ Actualizar". Click en una fila expande el detalle de líneas, con lo pendiente resaltado.',
        ],
        reglas: [
          { warn: 'Si una orden pendiente tiene algún ítem sin costo cargado, "Aprobar" no abre el modal normal: abre un aviso explicando que YiQi rechaza cualquier OC con un ítem sin precio, y sugiere rechazarla y volver a cargarla con el costo completo. No hay forma de forzar la aprobación mientras falte ese dato.' },
          'Si la orden se aprueba pero el envío a YiQi falla, la aprobación NO se deshace: queda aprobada acá con el badge "⚠ Error de vinculación a YiQi" visible, y Aris puede reintentarlo con "Reintentar envío" cuando quiera (no duplica nada en YiQi si ya se había mandado bien).',
          'El bloque de YiQi solo muestra OC activas (no completadas) — para ver el historial completo están "Historial de OC" y "Seguimiento de OC".',
        ],
        noHace: [
          'No permite editar ni cancelar una orden ya enviada a YiQi (solo agregar mercadería nueva, como se explicó arriba).',
          'No permite editar cantidades de líneas ya existentes de una orden aprobada, ni el caso de una orden que ya tiene remitos cargados en YiQi (mercadería parcialmente recibida) — ese caso está bloqueado a propósito.',
        ],
      },
      {
        key: 'seguimiento',
        icon: '🔄',
        label: 'Seguimiento de OC',
        queEs: ['Pensada para el día a día de "qué falta que llegue": separa lo activo de lo ya completado, y agrupa lo completado en carpetas por mes y día.'],
        necesitas: ['Mismo criterio de permisos que las demás pantallas de OC (vista filtrada a tus proveedores si no sos admin).'],
        comoSeUsa: [
          'Chips de estado arriba: Todas / Enviadas / Ingreso parcial / Completadas, cada uno con contador. Filtro de fechas Desde/Hasta.',
          'Arriba, en tarjetas, las órdenes activas (no completadas). Cada tarjeta muestra proveedor, asunto, fecha, total, estado, la causa vigente si se declaró una, y el botón "Declarar causa" / "Ver / declarar" (mismo modal que en Alertas y Órdenes de compra, con historial acumulado).',
          'Abajo, "Historial de completadas": carpetas colapsables por mes (▸/▾), y dentro de cada mes, agrupado por día.',
          'Click en cualquier tarjeta expande el detalle de líneas.',
        ],
        reglas: ['Acá la "causa" declarada es de ámbito Entregas (por ejemplo, demora del proveedor), distinta de la que se declara sobre un artículo en Alertas.'],
        noHace: ['No tiene paginado (a diferencia de Historial de OC) — todo lo activo se lista entero.', 'No permite exportar ni imprimir desde acá.'],
      },
      {
        key: 'historial',
        icon: '🕐',
        label: 'Historial de OC',
        queEs: ['El archivo completo y buscable de todas las órdenes de YiQi, incluidas las ya completadas — con filtros más finos que "Órdenes de compra".'],
        necesitas: ['Mismo criterio de permisos que las demás pantallas de OC.'],
        comoSeUsa: [
          'Filtros: Buscar (Nro OC / proveedor / asunto), Proveedor (desplegable, limitado a lo que podés ver), Estado (Todas / Enviada / Ingreso parcial / Completada), fechas Desde/Hasta, y "Limpiar filtros".',
          'Selector de filas por página (25/50/100/200). Click en una fila expande el detalle de líneas. "↻ Actualizar" para releer.',
        ],
        reglas: ['A diferencia de "Órdenes de compra", acá sí aparecen las órdenes ya completadas.'],
        noHace: ['No permite ninguna acción sobre las órdenes (ni PDF, ni declarar causa) — es puramente de consulta.', 'No exporta a Excel/CSV.'],
      },
      {
        key: 'precios',
        icon: '💲',
        label: 'Comparar precios',
        queEs: ['Buscás un artículo y ves su precio junto con "candidatos" de artículos parecidos en otros proveedores, para decidir con criterio antes de armar la próxima orden.'],
        necesitas: [
          'No requiere rol especial para consultar (vista filtrada a tus proveedores si no sos admin).',
          'Depende de los precios sincronizados desde YiQi (una vez por día) y de que alguien haya revisado pares en "Revisar equivalencias" para que aparezcan como confirmados.',
        ],
        comoSeUsa: [
          'Escribí al menos 2 caracteres en el buscador (SKU o nombre). Por cada resultado se arma una tarjeta con el artículo buscado y dos grupos: "✓ Equivalencias confirmadas" (fondo verde, ya revisadas por una persona — acá sí se marca "Más barato") y "Posibles equivalentes (sin confirmar)" (sugeridos por parecido de nombre, con un % de coincidencia — nunca se marcan como más baratos, son solo una pista).',
          'Botón "🔗 Revisar equivalencias" arriba a la derecha te lleva directo a esa pantalla.',
        ],
        reglas: [
          { tip: 'En YiQi cada SKU es único de un proveedor — nunca se repite entre dos proveedores. Por eso la comparación se hace por parecido de nombre, no por código. Un "posible equivalente" puede ser el mismo producto en otra presentación (uno lo vende suelto y otro en caja) o puede no tener nada que ver — el sistema solo sugiere, no lo sabe con certeza.' },
          'Lo que se confirma en "Revisar equivalencias" aparece acá automáticamente como equivalencia confirmada — son dos pantallas conectadas.',
        ],
        noHace: ['No permite confirmar o rechazar una equivalencia desde acá mismo — eso se hace en "Revisar equivalencias".', 'No arma ni exporta una orden desde esta pantalla.'],
      },
      {
        key: 'equivalencias',
        icon: '🔗',
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
      {
        key: 'nueva-oc',
        icon: '📝',
        label: 'Nueva OC',
        queEs: ['La pantalla de CREACIÓN de una orden de compra nueva, proveedor por proveedor, a partir de las alertas de stock (o de cualquier artículo del catálogo del proveedor, buscándolo a mano).'],
        necesitas: [
          'Sesión iniciada — cualquier usuario puede armar una orden. Lo que cambia según quién la arma es qué pasa al guardarla (ver más abajo).',
        ],
        comoSeUsa: [
          {
            ol: [
              'Pantalla inicial "¿Por dónde empezar?": lista de proveedores ordenados por cuánto se pierde de vender si no se repone, con columnas "Sin stock" y "Bajo mínimo". Buscador de proveedor y botón "Armar orden" por fila.',
              'Al entrar a armar la orden: buscador "Agregar otro artículo del proveedor" (busca en todo su catálogo, no solo lo que está en alerta), tabla de artículos con checkbox por fila, cantidad editable, y el total en pesos.',
              'Ningún artículo viene tildado por defecto — el sistema sugiere, vos decidís qué entra en la orden. Las cantidades sí vienen precargadas con la sugerencia calculada.',
              'Campo "Notas" para dejar algo escrito (para el proveedor o para Aris).',
              'Botón "💬 Enviar por WhatsApp" (si el proveedor tiene WhatsApp cargado en Condiciones comerciales): abre WhatsApp con el texto ya armado — funciona incluso antes de guardar la orden.',
              'Para guardar: "Guardar borrador" (queda a medio armar, para retomar después) o "Enviar a aprobación" / "Confirmar orden" (el texto cambia solo según si requiere aprobación o no).',
            ],
          },
        ],
        reglas: [
          { warn: 'Quién arma la orden importa mucho: si la arma Aris, queda confirmada directo, sin pasar por ningún control. Si la arma Ivana, la orden queda pendiente de que Aris la apruebe cuando pasa cualquiera de estas tres cosas: el total supera el límite de aprobación (propio del proveedor o el general), algún artículo quedó sin costo cargado, o el proveedor está marcado "siempre requiere mi aprobación".' },
          'El checkbox "Seleccionar todo" de la cabecera solo tilda lo que se ve en la página actual, no todo lo filtrado — importante con proveedores de catálogo grande.',
          'El aviso de "no llega al mínimo de compra" es solo informativo: no bloquea guardar ni enviar la orden.',
        ],
        noHace: [
          'No permite editar una orden ya guardada desde esta misma pantalla (para eso está "Órdenes de compra").',
          'No adjunta el PDF al mensaje de WhatsApp automáticamente — hay que arrastrarlo a mano (limitación de WhatsApp, no del sistema).',
        ],
      },
    ],
  },
  {
    titulo: 'Inteligencia',
    tabs: [
      {
        key: 'predictor',
        icon: '📈',
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
        icon: '🏢',
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
        icon: '🏬',
        label: 'Proveedores',
        queEs: ['Lista de los proveedores que hoy tienen artículos activos en el catálogo, con sus datos de contacto y un resumen de alertas por proveedor.'],
        necesitas: ['Sesión iniciada (vista filtrada a tus proveedores si no sos admin).'],
        comoSeUsa: [
          'Buscador por nombre, código o CUIT. Click en una fila expande el detalle: SKU, artículo, stock y estado de cada artículo de ese proveedor.',
          '"↻ Actualizar" arriba a la derecha.',
        ],
        reglas: ['La lista se arma sola a partir del catálogo sincronizado desde YiQi — un proveedor solo aparece acá si tiene al menos un artículo activo hoy.'],
        noHace: ['No permite dar de alta ni editar un proveedor manualmente — eso vive en YiQi.', 'No exporta la lista.'],
      },
      {
        key: 'condiciones',
        icon: '🤝',
        label: 'Condiciones comerciales',
        queEs: ['Acá se cargan a mano los datos que no vienen de YiQi: mínimo de compra, plazo de pago, WhatsApp/mail de pedidos, descuento por volumen, días de entrega, y el límite de aprobación propio de ese proveedor.'],
        necesitas: ['Cualquiera puede consultarlas. Editar: solo Aris.'],
        comoSeUsa: [
          'La tabla lista todos los proveedores con lo ya cargado. Checkbox "Ver solo los que faltan completar" y buscador por nombre.',
          'Click en "Completar" (Aris) despliega el formulario de esa fila: mínimo de compra (+ si es en pesos o en unidades), plazo de pago, descuento, WhatsApp de pedidos, mail de pedidos, contacto, días de entrega, límite de aprobación propio, checkbox "Siempre requiere mi aprobación", y notas.',
          '"Guardar" confirma los cambios de esa fila y cierra el formulario; "Cancelar" descarta.',
        ],
        reglas: [
          'No hace falta completar todos los proveedores: el que queda en blanco usa los valores generales del sistema (el límite general de "Reglas y alertas").',
          { tip: 'Cargar el WhatsApp de pedidos acá es justamente lo que habilita el botón "💬 Enviar por WhatsApp" en Nueva OC y en Órdenes de compra para ese proveedor.' },
        ],
        noHace: ['No valida que el mínimo de compra tenga sentido contra compras reales.', 'No muestra un historial visible de cambios en pantalla.'],
      },
      {
        key: 'usuarios',
        icon: '👥',
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
        icon: '🏷️',
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
        icon: '⚙️',
        label: 'Reglas y alertas',
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
        icon: '💬',
        label: 'Templates de mensajes',
        queEs: ['Edita las plantillas de texto (mail y WhatsApp) que se usan para armar el mensaje al proveedor.'],
        necesitas: ['Cualquiera puede consultarlas. Editar: solo Aris.'],
        comoSeUsa: [
          'Chips arriba para elegir la plantilla (✉️ email o 💬 WhatsApp).',
          'Editor (Aris): Nombre de la plantilla, Asunto (si es email), y Mensaje. Debajo, botones de variables (ej. {{proveedor}}, {{total}}, {{items}}) que se insertan con un click al final del texto.',
          'A la derecha, vista previa en vivo con datos de ejemplo. "Copiar texto" copia al portapapeles el mensaje ya armado con esos ejemplos.',
          '"Guardar cambios" (Aris, solo si hubo cambios).',
        ],
        reglas: [{ warn: 'El envío automático por email o WhatsApp todavía no existe. Esta pantalla solo prepara el texto — el envío real (botón "💬 Enviar por WhatsApp" en Nueva OC / Órdenes de compra) arma el mensaje con estas plantillas y lo abre en WhatsApp para mandarlo a mano.' }],
        noHace: ['No envía nada automáticamente.'],
      },
      {
        key: 'yiqi',
        icon: '🔌',
        label: 'Conector YiQi',
        queEs: ['Pantalla de diagnóstico de la conexión con YiQi: si está viva, cuándo sincronizó por última vez, qué está habilitado. No es operativa, es para chequear que todo esté bien.'],
        necesitas: ['Sesión iniciada.'],
        comoSeUsa: [
          '"↻ Verificar ahora" fuerza un chequeo en vivo del estado de conexión.',
          'Punto verde "Conectado a YiQi" o rojo "Sin conexión" (con el motivo si lo hay). Si hubo fallas de renovación en las últimas 24 horas aunque hoy diga "Conectado", aparece un aviso ámbar de alerta temprana.',
          'Si está conectado: tarjetas de última sincronización, schema y base URL, más la lista de entidades habilitadas.',
        ],
        reglas: [
          { tip: 'Este es el primer lugar para mirar si algo "dejó de actualizarse" en cualquier otra pantalla del sistema — acá se ve si el corte es de YiQi o de otra cosa.' },
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
        <span className="text-[17px] flex-shrink-0">{tab.icon}</span>
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
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white">
        <div className="text-[17px] font-bold">❓ Ayuda</div>
        <div className="text-[12px] text-[var(--sub)] mt-0.5">
          Qué hace cada pantalla del menú, cómo se usa, y qué reglas conviene tener presentes
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4 max-w-3xl">
        {/* Roles, en una tarjeta fija arriba de todo — es la base para entender
            por qué varias pantallas se ven distinto según quién entra. */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-4">
          <div className="text-[13px] font-bold mb-2">Antes de nada: los dos roles</div>
          <Bloques
            items={[
              {
                ul: [
                  '**Aris (administrador)**: ve y edita todo, sin ningún filtro de proveedores. Es el único que puede aprobar/rechazar órdenes pendientes, configurar Reglas y alertas, Templates, Catálogo de causas, Condiciones comerciales, Datos de la empresa, y entrar a Usuarios y accesos.',
                  '**Ivana / cualquier otro operador**: ve solo los proveedores que Aris le asignó en "Usuarios y accesos". Puede armar órdenes (Nueva OC), pero si superan el límite de aprobación, tienen algún ítem sin costo, o el proveedor exige aprobación siempre, la orden queda pendiente de que Aris la confirme.',
                ],
              },
              { tip: 'Si un usuario operador no tiene ningún proveedor asignado, ve el catálogo completo — no queda bloqueado. Y si el sistema no puede determinar los permisos de alguien (por un error), esa persona no ve ningún dato en ninguna pantalla: ante la duda, el sistema prefiere no mostrar nada antes que mostrar de más.' },
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
                        className="text-[12px] px-2.5 py-1 rounded-full bg-[var(--ind-bg)] text-[var(--ind-d)] hover:bg-[var(--ind-lt)] no-underline"
                      >
                        {t.icon} {t.label}
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
                  'No hay ninguna pantalla que edite cantidades de una orden ya aprobada — solo se puede sumar mercadería nueva a una orden ya vinculada a YiQi (desde "Órdenes de compra").',
                  'No hay estadísticas ni reportes (aparte de Predictor de demanda, que es historial, no proyección).',
                  'Ninguna pantalla exporta a Excel salvo Reposición interna (remitos).',
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
