import { tonoSeguro } from '../../lib/estados'

// Bloque de color con título, texto y acciones a la derecha.
// amarillo = acción pendiente mía · verde = listo · azul = esperando a otro · rojo = problema
export default function BloqueAccion({ tono = 'amarillo', titulo, children, acciones, className = '' }) {
  return (
    <div className={`bloque bloque-${tonoSeguro(tono)} flex items-center justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {titulo && <div className="bloque-titulo">{titulo}</div>}
        {children && <div className="bloque-texto">{children}</div>}
      </div>
      {acciones && <div className="flex gap-2 flex-shrink-0">{acciones}</div>}
    </div>
  )
}
