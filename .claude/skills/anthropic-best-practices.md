---
name: anthropic-best-practices
description: >
  Best practices oficiales de Anthropic para prompting con Claude Sonnet 4.6.
  Aplicar cuando diseñes prompts para agentes o interactúes con el CEO.
  Basado en la documentación oficial de platform.claude.com.
source: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
---

# Anthropic Prompting Best Practices — TulkasOS

## Principios generales

### Ser claro y directo
Claude responde bien a instrucciones explícitas.
- Especificá el formato de output y las restricciones.
- Usá listas numeradas cuando el orden importa.
- Mostrá el prompt a alguien sin contexto — si se confundiría, Claude también.

### Agregar contexto
Explicar el POR QUÉ de las instrucciones mejora los resultados.
Malo: "No uses markdown"
Bueno: "Respondé en prosa fluida porque este output va a un sistema de texto plano"

### Usar ejemplos (few-shot)
3-5 ejemplos bien construidos son más efectivos que instrucciones largas.
Envolvé los ejemplos en tags `<example>` para que Claude los distinga de instrucciones.

### Estructurar con XML tags
Usá XML para separar tipos de contenido en prompts complejos:
- `<instrucciones>` — qué hacer
- `<contexto>` — información de fondo
- `<ejemplos>` — casos de referencia
- `<formato>` — cómo estructurar el output

### Dar un rol
Una sola línea de rol enfoca el comportamiento:
"Sos el agente Dev de TulkasOS especializado en React + Supabase."

## Tool use y paralelismo

### Tool use explícito
Con Claude Sonnet 4.6, ser explícito sobre cuándo usar herramientas:
- "Implementá los cambios" → toma acción
- "¿Podrías sugerir cambios?" → puede solo sugerir

Para acción por defecto:
```
Por defecto, implementá cambios en lugar de solo sugerirlos.
Si la intención no está clara, inferí la acción más útil y procedé.
```

### Paralelismo
Claude corre tool calls independientes en paralelo.
Para maximizarlo, agregar al prompt:
```
Si necesitás llamar múltiples herramientas independientes,
hacelas todas en paralelo. Priorizá llamadas simultáneas
cuando las acciones no dependen entre sí.
```

## Agentes y sistemas agentic

### Balancear autonomía y seguridad
Para agentes que pueden afectar sistemas reales:
```
Podés tomar acciones locales y reversibles libremente.
Para acciones que afectan sistemas compartidos o son difíciles
de revertir, pedí confirmación antes de proceder.
```

### Minimizar alucinaciones en código
```
Nunca especules sobre código que no abriste.
Si el usuario referencia un archivo específico, DEBÉS leerlo
antes de responder. Investigá antes de afirmar.
```

### Evitar sobreingeniería
```
Evitá sobre-ingenierizar. Solo hacé cambios directamente
pedidos o claramente necesarios. Mantené soluciones simples.
No agregues features, no refactorices sin pedido, no creés
abstracciones para operaciones de uso único.
```

### State tracking en sesiones largas
Para auditorías de repos grandes:
- Usá git para trackear estado entre sesiones
- Guardá progreso en archivos estructurados (JSON para estado, texto para notas)
- Al empezar una sesión nueva: `git log`, revisar progress.txt, correr tests básicos

## Aplicación específica a TulkasOS

### CEO (esta conversación)
- Sonnet 4.6 con web search habilitado
- Contexto completo del proyecto cargado via MCP
- Rol: "Sos el CEO de Tulkas Media, coordinás el desarrollo de 7+ proyectos SaaS"

### Agente Dev
- Sonnet 4.6 via Claude Code (OAuth Max)
- Contexto: CLAUDE.md del repo + skills del proyecto
- Rol explícito + reglas de seguridad + criterios de éxito verificables

### Agente Auditor
- Sonnet 4.6 via Claude Code
- Modo solo-lectura con output estructurado
- Formato de reporte fijo para parseo por el MCP

### Agente QA
- Sonnet 4.6 via Claude Code
- Foco en reproducción de bugs y casos borde
- Veredicto binario: APROBADO / RECHAZADO

### Agente Soporte
- Haiku 4.5 (más barato, suficiente para monitoreo)
- Cron nocturno via Vercel
- Output directo a Supabase
