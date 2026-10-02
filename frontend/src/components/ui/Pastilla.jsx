import { tonoSeguro } from '../../lib/estados'

// Pastilla de estado con el código de color único (lib/estados.js).
export default function Pastilla({ tono = 'gris', children, title, className = '' }) {
  return (
    <span title={title} className={`pill pill-${tonoSeguro(tono)} ${className}`}>
      {children}
    </span>
  )
}
