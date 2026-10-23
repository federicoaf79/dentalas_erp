// 23/10/2026 — modo prueba YiQi (no autorizado Live)
// Aviso neutro (no es un error) para cuando la app no escribe en YiQi.
// Solo se muestra si el hook useModoPruebaYiqi dice modo prueba; el padre decide.
export const TEXTO_MODO_PRUEBA =
  'Modo prueba: la app no envía nada a YiQi. Las órdenes aprobadas, la mercadería agregada y las recepciones de depósito quedan solo en la app.'

export default function AvisoModoPrueba({ children = TEXTO_MODO_PRUEBA, tono = 'gris', className = '' }) {
  return (
    <div
      role="status"
      className={`bloque ${tono === 'azul' ? 'bloque-azul' : 'bloque-gris'} ${className}`}
    >
      <div className="bloque-texto">{children}</div>
    </div>
  )
}
