// Encabezado blanco de página (prototipo v7): título, bajada y acciones.
export default function EncabezadoPagina({ titulo, bajada, children }) {
  return (
    <div className="ph">
      <div>
        <div className="ph-title">{titulo}</div>
        {bajada && <div className="ph-sub">{bajada}</div>}
      </div>
      {children && <div className="ph-actions">{children}</div>}
    </div>
  )
}
