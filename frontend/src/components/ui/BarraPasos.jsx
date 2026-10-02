// Barra de pasos estilo "seguimiento de pedido" (feedback Ivana, punto 19).
// pasos: [{ rotulo, fecha?, estado: 'hecho' | 'actual' | 'espera' | 'alerta' | 'pend' }]
// sigue: texto corto de "qué sigue" debajo de la barra.
const ICONO = { hecho: '✓', actual: '●', espera: '⏳', alerta: '!', pend: '' }

export default function BarraPasos({ pasos, sigue }) {
  return (
    <div>
      <div className="pasos">
        {pasos.map((p, i) => (
          <div key={i} className={`paso paso-${p.estado}`}>
            <div className="paso-punto">{ICONO[p.estado] ?? ''}</div>
            <div className="paso-rotulo">{p.rotulo}</div>
            {p.fecha && <div className="paso-fecha">{p.fecha}</div>}
          </div>
        ))}
      </div>
      {sigue && <div className="pasos-sigue">{sigue}</div>}
    </div>
  )
}
