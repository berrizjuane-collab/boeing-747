# Evidencia F7–F8 — rendimiento, regresión y publicación

Preparado el 2026-09-24 sobre `main` en `736cce46223535fc0ef97d3dabeee3d7d829be0f`.
La corrida final de GitHub Actions se añadirá aquí cuando termine; este
documento separa lo ejecutado localmente de los gates que todavía requieren
CI o hardware.

## F7 — rendimiento y tiers

- La generación de mapas de terreno corre en un worker y transfiere sus
  buffers. El caché usa la resolución real: High/Mid comparten 1024² y Low
  mantiene 512². Se publican resolución, tiempo, generaciones y hits para QA.
- La preparación del interior registra subida de texturas y espera de
  `compileAsync`. El QA recoge arranque frío, primera entrada al interior,
  repetición caliente, FPS/frame-time p50/p95/p99, memoria de WebGL, draw
  calls, triángulos enviados/visibles y tareas largas.
- Auto-tier descarta el arranque, pestañas ocultas y deltas anómalos; decide
  con p95 sostenido y deja intacta una selección manual. Low usa FXAA en la
  pasada combinada; partículas, haces, sombras y resolución siguen los tiers.
- GitHub Actions barre 0–100 % y 100–0 % a pasos de 0,01 en Low/Mid/High,
  comprobando presupuestos en cada estado. Low añade diez ciclos de vida y el
  cambio Low→High→Mid→Low para demostrar generación/reutilización de mapas.

Los tests específicos cubren caché por resolución, FXAA en Low, selección
manual y auto-tier. La corrida local del 2026-09-24 pasó `npm test` (82/82),
`npm run lint`, `npm run build`, `npm run qa:hdri` y `npm run qa:interior`.
El build advierte que el bundle principal mide 1.593,35 kB minificado
(485,50 kB gzip); queda como coste conocido. El GLB conserva 266 asientos,
69.129 triángulos y 46 batches.

## F8 — regresión y cierre

- Las 16 paradas editoriales incluyen planos exteriores, umbral, cabina,
  salida y créditos. El arnés verifica progreso/frame real, zona DOM, datos
  completos, contraste, recorte, métricas obligatorias y presupuesto por tier.
- El tour dinámico calentado registra avance 0→100→0, ambos sentidos,
  frame pacing, saltos de progreso y tareas largas. El workflow conserva el
  reporte y vídeo WebM del recorrido por 30 días.
- La métrica de horizonte usa bandas laterales fuera del avión/terminal y
  máscaras medidas para overlays DOM; pruebas sintéticas comprueban que
  contenido central y paneles no contaminen el indicador.
- Pages solo inicia después de que `Final visual QA` termine verde para un
  `push` a `main`, y construye exactamente el `head_sha` de esa corrida.
  Capturas High y vídeo también se guardan como artefactos por 30 días.

## Límites abiertos

El entorno local restaurado no incluye Chromium, así que esta revisión no
atribuye al código nuevo una corrida de navegador local. La matriz de runtime,
capturas y vídeo debe pasar en GitHub Actions antes de cerrar ese gate. El
workflow fuerza SwiftShader: valida funcionalidad y presupuestos de escena,
pero **no certifica 60 FPS en escritorio ni 30 FPS en móvil físico**. Tampoco
se declara revisión visual final de artefactos hasta inspeccionar las
capturas/vídeo nativos de la corrida final. No se cambió el GLB ni se borró
ningún repositorio.

### Reproducción local

```bash
npm ci
npm run lint && npm test && npm run qa:hdri && npm run qa:interior && npm run build
npx playwright install --with-deps chromium
QA_TIER=low QA_SWEEP=1 QA_SWEEP_STEP=0.01 QA_CYCLES=1 QA_TIER_CACHE=1 npm run qa:runtime
QA_TIER=mid QA_SWEEP=1 QA_SWEEP_STEP=0.01 npm run qa:runtime
QA_TIER=high QA_SWEEP=1 QA_SWEEP_STEP=0.01 npm run qa:runtime
QA_TIER=low QA_VIDEO=1 QA_RECORD_VIDEO=1 npm run qa:runtime
```
