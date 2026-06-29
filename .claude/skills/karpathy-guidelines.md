---
name: karpathy-guidelines
description: >
  Guías de comportamiento para reducir errores comunes en código.
  Activar siempre cuando escribas, revisés o refactorices código.
  Priorizá caución sobre velocidad.
license: MIT
source: https://prompts.chat / Andrej Karpathy
---

# Karpathy Guidelines — TulkasOS

## 1. Pensá antes de codificar

No asumir. No esconder confusión. Mostrar los tradeoffs.

Antes de implementar:
- Enunciá tus suposiciones explícitamente. Si no estás seguro, preguntá.
- Si hay múltiples interpretaciones, presentalas — no elijas en silencio.
- Si existe un approach más simple, decilo. Push back cuando corresponda.
- Si algo no está claro, pará. Nombrá qué te confunde. Preguntá.

## 2. Simplicidad primero

Mínimo código que resuelve el problema. Nada especulativo.

- Sin features más allá de lo pedido.
- Sin abstracciones para código de uso único.
- Sin "flexibilidad" o "configurabilidad" no solicitada.
- Sin manejo de errores para escenarios imposibles.
- Si escribiste 200 líneas y podían ser 50, reescribilo.

Preguntate: "¿Un senior engineer diría que esto está sobrecomplicado?"
Si la respuesta es sí, simplificá.

## 3. Cambios quirúrgicos

Tocá solo lo que debés. Limpiá solo tu propio desorden.

Al editar código existente:
- No "mejores" código adyacente, comentarios o formateo.
- No refactorices lo que no está roto.
- Mantené el estilo existente, aunque lo harías diferente.
- Si notás código muerto no relacionado, mencionalo — no lo borres.

Cuando tus cambios crean huérfanos:
- Remové imports/variables/funciones que TUS cambios dejaron sin usar.
- No removas código muerto preexistente a menos que te lo pidan.

El test: cada línea cambiada debe trazarse directamente al pedido del usuario.

## 4. Ejecución orientada a objetivos

Definí criterios de éxito. Iterá hasta verificarlos.

Transformá las tareas en objetivos verificables:
- "Agregar validación" → "Escribir tests para inputs inválidos, luego hacerlos pasar"
- "Fixear el bug" → "Escribir un test que lo reproduzca, luego hacerlo pasar"
- "Refactorizar X" → "Asegurar que los tests pasen antes y después"

Para tareas de múltiples pasos, enunciá un plan breve antes de ejecutar.
Criterios de éxito fuertes te permiten iterar de forma independiente.
Criterios débiles ("que funcione") requieren clarificación constante.

## 5. Aplicación a TulkasOS

Estos principios aplican a todos los agentes Dev en todos los repos:
- oohplanner-app
- ai-audit-web (Tolrank)
- comunas-app
- curex-alpha
- plan-b-backend
- urban-tales
- dentalab-compras

El stack base es siempre React + Vite + Supabase + Vercel.
Las reglas del proyecto específico están en CLAUDE.md del repo.
