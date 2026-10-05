import InfoAyuda from './InfoAyuda'

// Encabezado blanco de página (prototipo v7 .ph): título 18 px, bajada 12 px,
// acciones a la derecha. `info` = texto de ayuda que antes era un cartel azul.
export default function EncabezadoPagina({ titulo, bajada, info, children }) {
  return (
    <div className="ph">
      <div className="min-w-0">
        <div className="ph-title">{titulo}</div>
        {(bajada || info) && (
          <div className="ph-sub">
            {bajada}
            {info && <InfoAyuda>{info}</InfoAyuda>}
          </div>
        )}
      </div>
      {children && <div className="ph-actions">{children}</div>}
    </div>
  )
}
