// "ⓘ" con la explicación al pasar el mouse (o con foco de teclado).
// 5/10/2026: reemplaza los carteles azules de texto que el prototipo v7 no
// tiene. El texto se conserva completo; solo deja de ocupar lugar fijo.
export default function InfoAyuda({ children, titulo = 'Más información' }) {
  return (
    <span className="info-ayuda" tabIndex={0} aria-label={titulo}>
      <i className="ti ti-info-circle text-[15px]" aria-hidden="true" />
      <span className="info-pop" role="tooltip">{children}</span>
    </span>
  )
}
