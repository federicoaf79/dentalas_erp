// ============================================================
// estados.js — 2/10/2026 (feedback Ivana, punto 21)
// Código de color ÚNICO para toda la app. Cada estado de negocio se
// traduce a un "tono" y el tono decide pastilla, borde de tarjeta y
// bloque. Si un estado nuevo aparece, se agrega acá y no en cada
// pantalla.
//   verde    = listo / resuelto
//   amarillo = falta algo que hago yo
//   azul     = esperando a otra persona
//   rojo     = problema
//   gris     = neutro / informativo
// ============================================================

export const TONOS = ['verde', 'amarillo', 'azul', 'rojo', 'gris']

// OC sincronizadas desde YiQi (Seguimiento / Historial)
export const ESTADO_OC_YIQI = {
  enviada:    { tono: 'gris',     label: 'Enviada al proveedor' },
  parcial:    { tono: 'amarillo', label: 'Ingreso parcial' },
  completada: { tono: 'verde',    label: 'Recibida completa' },
}

// OC generadas desde el sistema (ordenes_propias)
export const ESTADO_OC_PROPIA = {
  borrador:  { tono: 'gris',  label: 'Borrador' },
  pendiente: { tono: 'azul',  label: 'Esperando aprobación' },
  aprobada:  { tono: 'verde', label: 'Aprobada' },
  rechazada: { tono: 'rojo',  label: 'Rechazada' },
}

export function tonoSeguro(tono) {
  return TONOS.includes(tono) ? tono : 'gris'
}
