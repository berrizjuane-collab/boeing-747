# Ronda 6 — implementación de fases 0, 1 y 2

Fecha: 2026-09-19. Base remota: `b528527a4d187adc0a621e4f462720d8650ca06f`.
Alcance autorizado: primeras tres fases del plan, numeradas **0–2**.
No se declara terminada la experiencia ni las fases posteriores.

## Cambios

| Fase | Implementación | Límite de aceptación |
|---|---|---|
| 0 — Diagnóstico | Tier fijo antes del render, reloj QA, capturas convergentes con/sin DOM, telemetría posterior al composer, hashes de fuentes, errores e informes parciales, matriz CI Low/High/tour. | Falta baseline previo completo comparable y reproducir exactamente el timeout histórico de CI. |
| 1 — Estado/carga/recursos | Input nativo → objetivo → integrador único por frame. Estado real de assets, preparación/compilación interior, retención antes del umbral, recuperación de error y locks independientes. Interior y mapas residentes; probe reutilizable. | Los resultados de navegador se identifican por ejecución, sin atribuir archivos perdidos a esta revisión. |
| 2 — Geometría/registro | Cockpit hacia la nariz, dos pasillos, asientos 3-4-3 / 2-4-2, escalera alineada, techo curvo, puerta practicable y cierre antes de la cola. Manifiesto canónico para todos los consumidores. | Acabado de materiales, iluminación y suavidad percibida continúan en fases posteriores. |

El progreso presentado usa integración exponencial de 0,12 s y delta máximo
0,05 s. Reduced motion presenta directamente el destino. Orden explícito:
progreso −100 → cámara/matrices −80 → avión −70 → consumidores → composer 1
→ telemetría 2. Los atributos DOM se publican mediante suscripción síncrona,
sin esperar al commit React ni forzar commits del árbol R3F durante el render.

S0 espera exterior/entorno preparados y renderizados. La cabina debe tener
texturas subidas y materiales compilados antes de marcarse ready. Si no está
lista, la presentación se retiene como máximo en 0,41 conservando el destino;
error con reintento o retorno al inicio. Fallback inicial sin WebGL disponible.

Se eliminó el bloqueo con overflow:hidden, que podía cambiar el contenedor
de scroll en Chromium y borrar el destino pendiente. Los locks ahora bloquean
gestos/teclas y restituyen el scrollbar; la navegación programática sigue
permitida y liberar un motivo no libera los demás.

El exterior clona su escena y restaura los materiales antes de disponer sus
reemplazos. La cabina mantiene juntos escena/materiales/texturas con vida de
caché. Los siete lotes de asientos pertenecen a zonas/bloques de hasta cinco
filas; estructura opaca, sin fade transparente por centro de batch. Haces
planos desactivados hasta calibración óptica; polvo respeta el tier.

## Geometría y pruebas

- **46/46 pruebas Node**, lint y build pasan. Persiste la advertencia de chunk
  grande (aproximadamente 1,61 MB minificado / 492 kB gzip).
- GLB: **62.516 bytes, 69.129 triángulos, 266 asientos, siete lotes de instancias,
  46 primitivas/lotes**. Antes: 112.724 bytes, aproximadamente 280.312 triángulos,
  240 asientos. Límite de 50 batches por partición espacial; el presupuesto de
  escena Low sigue siendo 100 draw calls.
- **3.751 muestras** contra triángulos de BLEND fuente y GLB reimportado:
  **cero colisiones**. Radio 0,18 m + margen 0,05 m; oscilación añade 0,052 m.
  Distancia mínima aproximada 0,255 m en entrada al cockpit sin oscilación.
  Distancia al hull ≥1,263 m en el tramo comprobado, excluidos cruces deliberados.
- Cinco anclas reales verificadas con la matriz canónica. Bounds BLEND/GLB
  coinciden dentro de tolerancia. La geometría exterior real alimenta el análisis.
- Se corrigieron colisiones iniciales con puerta de cockpit/hombro de salida,
  hueco sobre el cierre posterior y losa coplanar del descansillo. No se
  aumentó la tolerancia para ocultarlas.
- La nueva salida enlaza la retirada al 89,5 %, conservando los límites previos
  de salto angular/posición. El resto de coreografía pertenece a fase 3.

## Evidencia reproducible

Índice: [`docs/evidence/round6/README.md`](docs/evidence/round6/README.md).
Los informes registran base remota y hashes SHA-256 del contenido probado;
no confunden el commit local sintético con la historia remota. La copia inicial
se reconstruyó y verificó contra los 175 blobs originales.

Una interrupción por cuota de revisión automática impidió el primer push y
la reanudación recuperó un checkpoint anterior. Se restauraron correcciones,
se regeneró el mismo GLB (blob `a8a12c86dd4c39e239bda8deccc696bf47840c4c`) y se
repitieron comprobaciones. Sólo se incluyen aquí archivos de evidencia
realmente conservados. El tour por duración fija que no alcanzaba S7 se
reemplazó por avance basado en frames, con llegada a S7 y retorno obligatorios.

```bash
npm ci
npm run build
npm test
npm run lint
npm run qa:hdri
npm run qa:interior
npx playwright install chromium ffmpeg
npm run qa:runtime
QA_TIER=high npm run qa:runtime
QA_CAPTURES=none QA_CYCLES=1 npm run qa:runtime
QA_CAPTURES=none QA_CYCLES=1 QA_DEV=1 npm run qa:runtime
QA_CAPTURES=none QA_INTERIOR_ERROR=1 npm run qa:runtime
QA_CAPTURES=none QA_SLOW_INTERIOR=1 npm run qa:runtime
QA_CAPTURES=none QA_VIDEO=1 npm run qa:runtime
node scripts/scroll-contract-qa.mjs
```

Blender y diagnóstico de volumen: [`INTERIOR_LAYOUT.md`](INTERIOR_LAYOUT.md).
QA local: Chromium 153 con SwiftShader, Blender/bpy 4.5.3 LTS. SwiftShader no
permite prometer rendimiento en GPU física. La matriz completa High 1440×900,
Safari/iOS/Android físicos y baseline previo completo siguen pendientes.

El timeout histórico exacto de 30 s al cambiar calidad no tiene causa demostrada:
el baseline local anterior cambió Mid→Low en 16.492 ms, Low→High en 3.999 ms y
High→Mid en 1.462 ms. El arnés nuevo fija tier desde el inicio y mantiene una
prueba separada del botón. No se sustituye evidencia High por Low.

## Continuación

Fase 3: ritmo/orientación/velocidad de cámara, oscilación ligada al avance y
composición de salida. Fase 4: transición óptica e IBL. Fase 5: materiales,
luz, pantallas y ventanas. Fases 6–7: móvil/accesibilidad y rendimiento/cierre.
No reintroducir offsets aislados, transparencia estructural o join global para
disimular problemas. Ver los criterios originales de `plan6.md` antes de cerrar.
