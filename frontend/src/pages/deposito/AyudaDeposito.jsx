import { useState } from 'react'
import Aviso from '../../components/Aviso'
import { DEPOSITO_OTRO, nombreDeposito } from '../../lib/depositos'
import { usePermisos } from '../../hooks/usePermisos'

// ============================================================
// pages/deposito/AyudaDeposito.jsx — 14/9/2026
// ============================================================
// Ayuda in-app PARA las cuentas de depósito (Depósito Central /
// encargado del Local), a diferencia de Ayuda.jsx (que es solo para
// Aris/Ivana y estas cuentas no ven). Vive dentro del mismo shell
// separado que las otras 3 pantallas — ver AppDeposito.jsx.
//
// Contenido derivado del código real de las 3 pantallas de depósito
// (SolicitudesParaPreparar.jsx, ConfirmarRecepcion.jsx,
// PedirAlOtroDeposito.jsx) — mismo principio que Ayuda.jsx: nada
// inventado, sin sincronización automática con el código.
// ============================================================

function Tarjeta({ icon, titulo, children }) {
  return (
    <div className="bg-white rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[17px]">{icon}</span>
        <span className="text-[14px] font-bold">{titulo}</span>
      </div>
      <div className="flex flex-col gap-2 text-[13px] text-gray-700 leading-relaxed">{children}</div>
    </div>
  )
}

export default function AyudaDeposito() {
  const permisos = usePermisos()
  const miDeposito = permisos.misDepositos?.[0] ?? null
  const otroDeposito = miDeposito ? DEPOSITO_OTRO[miDeposito] : null
  const [abierto, setAbierto] = useState('circuito')

  function toggle(key) {
    setAbierto((prev) => (prev === key ? null : key))
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
      <div className="px-6 py-4 border-b border-[var(--border)] bg-white">
        <div className="text-[17px] font-bold">❓ Ayuda</div>
        <div className="text-[12px] text-[var(--sub)] mt-0.5">
          Cómo funciona el circuito de reposición entre {nombreDeposito(miDeposito) || 'tu depósito'} y{' '}
          {nombreDeposito(otroDeposito) || 'el otro depósito'}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3 max-w-2xl">
        <Tarjeta icon="🔄" titulo="El circuito, en resumen">
          <p>
            Vos tenés 3 pantallas en el menú de la izquierda. Las mismas 3 sirven tanto para Depósito Central como
            para el encargado del Local — lo que ves en cada una depende de si tu depósito es el que{' '}
            <strong>prepara y envía</strong> o el que <strong>recibe</strong> en ese remito puntual, no de qué cuenta
            sos.
          </p>
          <ul className="list-disc list-outside pl-5 space-y-1">
            <li>
              <strong>Solicitudes para preparar</strong>: cuando a vos te toca armar y enviar mercadería al otro
              depósito.
            </li>
            <li>
              <strong>Confirmar recepción</strong>: cuando el otro depósito ya te declaró que te envía algo, y tenés
              que controlarlo contra lo que llegó físicamente.
            </li>
            <li>
              <strong>Pedir al otro depósito</strong>: cuando necesitás algo puntual que no llegó solo por el cálculo
              automático, y lo pedís vos a mano.
            </li>
          </ul>
          <Aviso tipo="info" id="deposito-ayuda-sin-aprobacion" className="mt-1">
            Este circuito no tiene un paso de "aprobación" como sí tienen las órdenes de compra — no hay nadie que
            tenga que autorizar un remito. El único control real es el que hacés vos al confirmar la recepción
            contra el remito impreso.
          </Aviso>
        </Tarjeta>

        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => toggle('preparar')}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50"
          >
            <span className="text-[17px] flex-shrink-0">📋</span>
            <span className="flex-1 text-[14px] font-bold">Solicitudes para preparar</span>
            <span className="text-gray-400 text-[12px]">{abierto === 'preparar' ? '▾ ocultar' : '▸ ver'}</span>
          </button>
          {abierto === 'preparar' && (
            <div className="px-4 pb-4 pt-1 border-t border-[var(--border)] flex flex-col gap-2 text-[13px] text-gray-700 leading-relaxed">
              <p>Acá aparece lo que vos tenés que armar y mandar al otro depósito.</p>
              <ul className="list-disc list-outside pl-5 space-y-1">
                <li>
                  Si sos <strong>Depósito Central</strong>, la mayoría de las veces esto ya te va a aparecer resuelto
                  solo: el sistema genera y declara el remito automáticamente apenas se crea la solicitud, sin que
                  tengas que tocar nada. El botón "📋 Generar remito de mercadería" sigue estando por si algún día
                  hace falta rehacerlo a mano.
                </li>
                <li>
                  Cuando el remito está "En preparación", ves una tabla con cada artículo, su clase (A/B/C, solo de
                  referencia), la cantidad pedida, y un campo para declarar cuánto mandás vos. Un solo campo por
                  línea: lo que no llegues a mandar queda automáticamente como "no hay", con un motivo obligatorio —
                  eso dispara una compra al proveedor del lado de Aris, no hace falta que hagas nada más.
                </li>
                <li>
                  Botón "🖨️ Imprimir remito" para llevarte el papel al picking físico — es el mismo documento que
                  después se controla en "Confirmar recepción" del otro lado.
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => toggle('recepcion')}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50"
          >
            <span className="text-[17px] flex-shrink-0">✓</span>
            <span className="flex-1 text-[14px] font-bold">Confirmar recepción</span>
            <span className="text-gray-400 text-[12px]">{abierto === 'recepcion' ? '▾ ocultar' : '▸ ver'}</span>
          </button>
          {abierto === 'recepcion' && (
            <div className="px-4 pb-4 pt-1 border-t border-[var(--border)] flex flex-col gap-2 text-[13px] text-gray-700 leading-relaxed">
              <p>Acá aparece lo que el otro depósito ya te declaró que te envía ("en tránsito").</p>
              <ul className="list-disc list-outside pl-5 space-y-1">
                <li>
                  Este es el punto de control real: confirmá siempre contra el remito impreso, no solo mirando la
                  pantalla — hay un botón "🖨️ Ver / imprimir remito" arriba de cada tarjeta para eso. Es decisión de
                  Federico (10/9/2026): el encargado confirma con el papel en la mano, y ya nadie más valida ese
                  punto después.
                </li>
                <li>
                  El campo de cantidad recibida viene precargado con lo declarado, pero es editable — corregilo si lo
                  que llegó no coincide con lo físico antes de confirmar.
                </li>
                <li>
                  "✓ Confirmar recibido" es lo que efectivamente mueve el stock real en YiQi. Si esa parte le falla
                  al sistema por algún motivo, tu confirmación acá ya quedó guardada igual — no se pierde ni se
                  deshace.
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => toggle('pedir')}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50"
          >
            <span className="text-[17px] flex-shrink-0">📤</span>
            <span className="flex-1 text-[14px] font-bold">Pedir al otro depósito</span>
            <span className="text-gray-400 text-[12px]">{abierto === 'pedir' ? '▾ ocultar' : '▸ ver'}</span>
          </button>
          {abierto === 'pedir' && (
            <div className="px-4 pb-4 pt-1 border-t border-[var(--border)] flex flex-col gap-2 text-[13px] text-gray-700 leading-relaxed">
              <p>Usala cuando necesitás algo puntual que no te llegó por el cálculo automático.</p>
              <ul className="list-disc list-outside pl-5 space-y-1">
                <li>Buscá el artículo por SKU o nombre, agregalo con "+ Agregar" y poné la cantidad que necesitás.</li>
                <li>
                  "📤 Enviar pedido" manda todo de una — a diferencia de "Solicitudes para preparar", acá no hay
                  ningún recálculo: es exactamente lo que vos cargaste, ni más ni menos.
                </li>
                <li>
                  Le aparece de inmediato al otro depósito en su "Solicitudes para preparar", ya listo para que lo
                  arme y te lo mande — y vos lo vas a recibir y controlar en tu "Confirmar recepción", igual que
                  cualquier otro remito.
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
