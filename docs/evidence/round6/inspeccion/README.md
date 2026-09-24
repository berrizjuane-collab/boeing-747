# Inspección visual independiente — SHA `3117af2`

Fecha: 2026-09-24. Alcance: sólo inspección; no se modificó código.

## Método

- `npm run lint`, `npm test` (82/82), `npm run qa:hdri`, `npm run qa:interior` y `npm run build`: pasan.
- Barrido 0→1 en pasos de 0,005 (201 fotogramas, High, 960×600) y barridos finos de 0,001–0,002
  en 0,24–0,30, 0,40–0,54 y 0,78–0,90. Cada captura espera a que el frame presentado
  (`window.__MERIDIAN_FRAME__`) coincida con el progreso pedido.
- Métrica de continuidad: diferencia media de luminancia e histograma de color entre fotogramas
  consecutivos, enmascarando panel y navegación.
- Chromium 141 + SwiftShader con `prefers-reduced-motion` (progreso presentado instantáneo).
  Valida imagen, no FPS en GPU física.

## Hallazgos (por gravedad)

| # | Progreso | Hallazgo | Causa localizada |
|---|---|---|---|
| 1 | 0,42 → 0,50 | Telón opaco a pantalla completa durante ~8 % del scroll; la cabina aparece de golpe en 0,50 | `src/index.css:1281` añade `background:#101923` a `.overlay__threshold-line`, que es `position:fixed; inset:0` (`src/index.css:397`) |
| 2 | 0,402–0,498 (oculto por #1) | Arco granate flotante delante del morro; cabina "casa de muñecas" azul; corte cromático azul→marrón en 0,454→0,456; pared vacía durante el giro | `ThresholdFrame`, `PROBE_CROSSOVERS` 0,455 en `src/lib/iblSchedule.ts`, giro en `src/lib/cabinRoute.ts` |
| 3 | 0,245 → 0,265 | Aeropuerto → mar de nubes en ~125 px; tejados/torre atraviesan la capa | Capa a `UNDERCAST_Y = 14` por debajo de edificios |
| 3b | 0,261 → 0,262 | Bosque, terminal y torre desaparecen en un fotograma | `DETAIL_CULL_OPACITY = 0.98` en `src/lib/worldPersistence.ts` |
| 4 | 0,279 → 0,280 | Cola dorada→azul y fuselaje cálido→frío en un fotograma | Cambio de sonda `golden → highAltitude` en 0,28, coincidente con la sección y el grading |
| 5 | ~0,845 → 0,90 | Tras la puerta sólo se ve el ala y luego cielo vacío; a 960 px el avión queda tras el panel, en móvil fuera de cuadro | Encuadre kf14/kf15 (`src/lib/cameraPath.ts`); la métrica de fase 3 ignora el panel DOM |
| 6 | — | Terreno rojo óxido con manchas verdes; panel tapa el morro (0,27); marcas de navegación invisibles sobre cielo claro (`src/index.css:536`); 0–0,115 casi sin cambio; oscurecimiento brusco del cielo en el último 1,5 % | Acabado |

## QA de Codex

- `scripts/runtime-qa.mjs:138` busca `'Envergadura'` en `innerText`; `text-transform: uppercase`
  lo devuelve como `ENVERGADURA`, así que la parada `spec` falla siempre aunque el panel está correcto
  (verificado en navegador: sección `climb`, 6 filas).
- Los tres últimos runs de *Final visual QA* en `main` (incluido `3117af2`) terminaron cancelados por
  el timeout de 60 min; el job High no guardó ninguna captura. Pages, condicionado a ese QA, no desplegó.

## Lo que funciona

Planos sobre nubes, cabina económica 3-4-3, escalera, salida física por la puerta, atardecer final y
maquetación móvil sin desbordes. La cámara es continua en posición; los saltos son de luz, visibilidad,
overlay y encuadre.

## Archivos

`01`–`07`: láminas comparativas (recuadro rojo = defecto). `08_recorrido_completo.mp4`: 201 fotogramas
del barrido 0→100 % a 12 fps.
