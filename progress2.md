# PROGRESS 2 — Corrección y Finalización Visual

> **`PLAN.md` y `PROGRESS.md` (los `plan1`/`progress1` del pedido) fueron completados en la ronda anterior** — sus 10 fases (0–9) están cerradas y así quedan. **Este documento cubre exclusivamente la ronda de corrección y finalización que sigue**, y es el checklist activo de aquí en adelante, espejado a [`plan2.md`](./plan2.md). No se vuelve a marcar nada en `PROGRESS.md`.

Convención: `[ ]` pendiente · `[~]` en curso · `[x]` completo **con evidencia adjunta** · `[!]` bloqueado

**Estado global: ronda 2 completada y verificada.** La ejecución partió de `main` sincronizado en `428c513`, después de una auditoría local y tres revisiones independientes. La única limitación de laboratorio sigue siendo la medición de FPS en hardware físico: SwiftShader no representa una GPU; draw calls, triángulos, estados, imágenes y errores sí se verificaron.

---

## ⚠️ Trampa de verificación descubierta al mergear — leer antes de creerle a una captura

En este entorno no hay GPU: todo corre por **SwiftShader** (rasterizador por software). El shader del fuselaje (MeshStandardMaterial + textura KTX2 + los chunks inyectados del disolve) tarda **~45 segundos en compilar**. Hasta que compila, three.js **no dibuja ese objeto**, pero sí dibuja todo lo demás — cielo, suelo, marcas de pista, overlays.

El resultado es una captura que parece perfectamente válida (0 errores de consola, 0 fallos de red, escena renderizada) **pero sin el avión**. Durante el merge esto costó una investigación completa: se llegó a concluir que había una regresión que dejaba la aeronave invisible, se bisectó el material, se probó con un `MeshBasicMaterial` rojo, y sólo al instrumentar posición/visibilidad en runtime quedó claro que la geometría siempre estuvo ahí, visible y bien ubicada (`hullWorld=(0, 5.2, 4.7)`, `radius=42.8`, `camPos=(60, 8, 55)`) — lo que faltaba era **tiempo de compilación**, no código.

**Regla para toda captura de esta ronda:** esperar ≥55 s tras la carga antes del primer screenshot, y ≥10 s tras cada cambio de scroll. Una captura tomada antes de eso **no es evidencia de nada** y no puede usarse para marcar ni para descartar un ítem. Si `npm run qa:visual` (el harness heredado de la ronda 1) no respeta esos tiempos, corregirlo es prerequisito de la Fase A — de lo contrario todo el checklist de abajo se verifica contra imágenes falsas.

---

## Regla de marcado — leer antes de tocar una casilla

Un ítem sólo pasa a `[x]` si junto a él queda registrada la **evidencia concreta** que lo respalda: captura a un porcentaje de scroll específico, medición numérica, o resultado de un assert automatizado. La columna "Evidencia" no es opcional y no acepta "verificado" a secas.

Prohibido explícitamente, porque es lo que falló en la ronda anterior:
- marcar por compilación limpia (`tsc` / `oxlint` / `vite build` pasan → no dice nada sobre la imagen)
- marcar por ausencia de errores de consola o de red
- marcar por "el código ahora hace lo correcto" sin haber mirado el resultado
- rebajar un criterio de aceptación para poder marcar el ítem

---

## F0 — Decisión de alcance (bloquea todo lo demás)

- [x] **F0-1 · Decisión mayor sobre el interior (`plan2.md` §3).** Elegir entre A (corrección sin re-modelado), B (A + re-modelado real del interior) o C (A + recorte de alcance de S5). Recomendación del plan: **B si hay presupuesto de tiempo, C si no**. Ninguna fase posterior que toque S5 arranca antes de esta decisión.
  - Evidencia requerida: decisión registrada por escrito acá, con su razón.
  - **Decisión:** **B — corrección completa + re-modelado real del interior.** El usuario indicó expresamente que hay tiempo y delegó elegir las opciones recomendadas. Se mantienen las tres zonas narrativas de v1 (cuatro módulos geométricos); no se amplía el alcance a primera clase/business.
- [x] **F0-2 · Hacer confiable el arnés de evidencia visual.** Espera segura de SwiftShader (≥55 s iniciales y ≥10 s por scroll), captura de errores HTTP/requests y registro de paneles activos por imagen.
  - **Evidencia requerida:** ejecución completa sobre build de producción, con reporte sin errores y avión visible en la inspección de capturas.
  - **Evidencia:** `npm run qa:visual` produjo 17 capturas desktop/mobile y un recorrido WebM sobre `dist/`, con esperas conservadoras, presupuesto por tier, contraste/clipping, panel activo y errores de consola/página/request/HTTP incluidos en `visual-qa-report.json`. La revisión integral previa al último LOD registró 0/0/0/0 errores; la medición puntual posterior confirmó Mobile Low en **99 draw calls**. El workflow `Final visual QA` repite el arnés en cada push a `main`, separa capturas y vídeo en jobs paralelos con reportes/aserciones propios y archiva ambas evidencias.
- [x] **F0-3 · Re-modelado interior exigido por la opción B.** Sustituir el blockout por geometría final controlada para cockpit, economy, escalera cerrada y upper deck, conservando instancing y presupuesto.
  - **Evidencia requerida:** verificación estructural Blender/GLB y capturas de las cuatro zonas donde el resultado no se lea como cajas de blockout.
  - **Evidencia:** `verify_blockout.py` sobre `/tmp/a380-option-b-final.blend`: **PASS**, 402 objetos / 62 mallas únicas / 11.400 vértices únicos, 240 asientos enlazados, escalera cerrada de 16 peldaños, salida superior alineada y bounds `6,32 × 4,565 × 58 m`. GLB publicado: 112.724 bytes, 16 materiales PBR, 7 lotes instanciados, 40 lotes de render y 280.312 triángulos (`npm run qa:interior`: PASS). Capturas `05a`–`05d` muestran cockpit, economy, escalera cerrada y cubierta superior legibles.

---

## Fase A — Fundaciones visuales

> Va primero porque hasta que la exposición y la luz sean correctas no se puede juzgar visualmente nada de lo demás.

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| A1 | Regenerar `sunset.hdr` (sol sobre el horizonte) y normalizar las tres HDRI | Re-medición de luminancia media de los 3 `.hdr`; ratio máximo entre cualquier par < 4×. Más captura de S1/S3/S6 con cielo legible | [x] | `npm run qa:hdri`: medias **1,0036 / 1,2546 / 0,6527**, ratio máximo **1,922×**. `01-hero`, `03-spec-sheet` y `06c-sunset-clean-88` muestran los tres cielos legibles. |
| A2 | Rediseño del esquema de luces exterior (key / fill / rim por sección) | Inventario donde **toda** luz tiene nombre, temperatura e intensidad declaradas; cero luces sin justificar. Captura S1/S2/S3 con silueta separada del fondo, sin quemarse | [x] | `EXTERIOR_LIGHTS` contiene exactamente key/fill/rim con nombre, posición, rol y propósito; `SECTION_ENVIRONMENT` declara CCT/color/intensidad en las 7 secciones y el test A2/A3 pasa. Capturas `01`–`03`: volumen y silueta separados. |
| A3 | Recalibrar exposición y niebla contra las HDRI normalizadas | Captura de S1 con < 2% de píxeles saturados a 255 y torre de control visible | [x] | `01-hero.png`: **0,4222%** de blanco recortado (<2%); pista, hangares y torre visibles. Niebla por sección validada en `(0, 0,002)`. |
| A4 | Iluminación interior: cobertura real del corredor + relleno ambiental usable | Captura en las 4 zonas (cockpit / economy / escalera / upper deck) donde se distinguen asientos, pasillo y techo. Luminancia media del frame dentro de rango objetivo | [x] | Inventario: 5 prácticas solapadas + 2 spots con nombre/CCT/intensidad, PMREM de relleno y una sola sombra High cercana. Capturas `05a`–`05d`: medias de luminancia **117,4 / 90,2 / 133,1 / 63,3**, con asiento, pasillo y techo distinguibles. |

**Línea base medida en la auditoría** (para comparar después): `golden-hour` 1.05 · `high-altitude` 42.91 · `sunset` 0.0158 — ratio máximo actual **≈2718×**.

---

## Fase B — Corrección estructural

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| B1 | Fuente única de verdad de sección/zona; `zoneForLocalProgress` deja de devolver `cockpit` fuera de S5; `Hotspots.tsx` alineado; guard defensivo de `InteriorOverlay.tsx` eliminado | Barrido de 101 puntos (0–100%, paso 1%): en cada uno, consistencia entre `activeIndex` y paneles con `data-active="true"`. **Cero excepciones** | [x] | Test B1: **101/101** muestras consistentes; API global devuelve `null` a 0,09 y fuera de S5; store, overlay y hotspots leen la misma zona atómica. |
| B2 | Cámara: travesía única y monótona de la curva; mesetas como reparametrización de velocidad | Muestreo cada 0.001 en [0,1]; ninguna muestra consecutiva supera el umbral de distancia. **Los 6 límites deben pasar** | [x] | Test B2: 1.001 muestras y los 6 límites pasan. Máximos: posición **2,652**, target **2,837**, orientación **2,815°**, FOV **0,204°**, roll **0,306°** (límites 3/3/3°/0,25°/0,35°). |
| B3 | Visibilidad del marco del umbral ligada a la relación cámara↔portal | Capturas a 0.86 / 0.88 / 0.92 **sin** ningún elemento del marco; y captura a ≈0.83 **con** el marco presente (no vale apagarlo siempre) | [x] | Test B3: visibilidad ≥0,75 a 0,83 y exactamente 0 a 0,86/0,88/0,92. Capturas `06a` con umbral y `06b`–`06d` sin restos. |
| B4 | Marcas de pista acostadas sobre el suelo | Captura cenital de depuración con eje y bordes sobre el asfalto + captura de S1 sin ninguna línea vertical | [x] | Test B4 recorre todos los vértices/normales: Y constante en `RUNWAY_SURFACE_Y`, normal `(0,1,0)`. `01-hero` muestra eje/bordes horizontales, sin líneas verticales. |

**Línea base medida en la auditoría** (saltos de cámara a corregir): S1→S2 **44.1** · S2→S3 3.0 · S3→S4 **107.7** · S4→S5 8.0 · S5→S6 **32.5** · S6→S7 11.8 unidades.

---

## Fase C — Materiales y entorno

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| C1 | Set PBR del exterior: roughness + normal; diferenciar vidrio / metal / pintura | Comparativa antes/después en el mismo encuadre de S1, con micro-detalle y reflejos visibles; assert de que roughness deja de ser uniforme | [x] | Test C1: mapas normal/roughness deterministas con ≥20 valores, rango roughness ≥0,2; clasificación declarada para pintura, vidrio y metal. Comparativa baseline `428c513` vs `01-hero`: librea, panelado, brillo y volumen recuperados. |
| C2 | Entorno del hero: vegetación, torre reencuadrada, escala de pista legible | Captura de S1 donde se identifican sin ambigüedad pista con marcas, vegetación, hangares y torre. Draw calls dentro del presupuesto de `PLAN.md` §7.1 | [x] | `01-hero`: pista/marcas, 720 instancias High de vegetación, 3 hangares y torre. High: **148 draw calls / 72.160 triángulos** (<250 / <1,5M). LOD Low conserva el encuadre móvil en **99 draw calls**. |
| C3 | Escena de salida S6 reencuadrada como vista cinematográfica | Captura a 88% con cielo de atardecer legible, avión iluminado y separado del fondo, **cero elementos no identificables** | [x] | `06c-sunset-clean-88`: avión completo a la izquierda del panel, atardecer legible, marco ausente. Cola–cielo: **ΔY 0,4871; contraste 10,01:1**. |

---

## Fase D — Spikes (hallazgo escrito antes de cualquier fix)

> Regla dura: cada spike produce un hallazgo registrado **antes** de que se proponga ninguna solución. Si el hallazgo es "no hay bug", eso es un resultado válido y convierte el ítem en decisión de alcance.

| # | Spike | Método | Estado | Hallazgo |
|---|---|---|---|---|
| D1 | Línea roja diagonal en S6 (`plan2.md` §2.3c) | Ocultar `LandingGear`, luego `A380`, aislar cuál la contiene; después inspeccionar ese subconjunto. Hipótesis abiertas: polígonos degenerados (708 / 2.699 documentados en `ASSET_AUDIT.md`) o tren mal escalado | [x] | **Hallazgo previo al fix:** pertenece a `A380`, no al tren ni a UV degenerada: es la franja naranja real de la librea sobre la aleta vertical. Permanece sin `LandingGear`, desaparece sin `A380`; al retirar sólo el albedo desaparece el color pero queda la aleta completa. El cielo negro ocultaba la cola azul y dejaba la franja aislada. Decisión: corregir separación lumínica/composición de S6; no borrar geometría ni adulterar la librea. Criterio: cola–cielo `ΔY ≥ 0,05`, contraste ≥1,5:1 y marco ausente a 88%. |
| D2 | Geometría "peine" del tren (`plan2.md` §2.3d) | Inspección aislada a cámara cercana, en Blender y en navegador, con el resto oculto. Decidir entre: corregir transform · reemplazar por geometría propia · mantener fuera de encuadre cercano | [x] | **Hallazgo previo al fix:** el zigzag permanece sin `LandingGear` y pertenece a fairings/borde de fuga del mesh `A380`; no es una transformación del tren. El tren aislado es low-poly pero reconocible (23 piezas delanteras + 92 principales), con rotación identidad, escala 1 y relaciones constantes; `prepare_exterior.py` conserva matrices y runtime sólo traslada el grupo. Decisión: opción C, mantenerlo fuera de close-ups y validar retracción atómica; no aplicar un “transform fix” falso. |
| D3 | Transición de escalera (`plan2.md` §2.7) | Grabación cuadro a cuadro entre 70% y 85% de scroll (no capturas sueltas). Separar cuánto es discontinuidad de cámara, cuánto geometría faltante (`Stair_Wall` no existe) y cuánto ritmo de mesetas | [x] | **Hallazgo previo al fix:** `npm run qa:d3` capturó 16 frames 1440×900, 0,70–0,85 a paso 0,01, con 55 s iniciales + 10 s por punto y **0 errores** (`/tmp/boeing-747-d3-before/d3-frame-sequence.json`; hoja de contacto adjunta a la sesión). Se ejecutó después de B2 pero antes de sustituir `public/models/interior.glb`, aislando causas: (1) la cámara ya avanza continuamente, así que el vacío persiste sin teletransporte; (2) 0,70–0,73 muestra escalones/asientos flotando contra negro y 0,74–0,78 sólo piezas de shell desconectadas: el GLB publicado no tiene `Stair_Wall` ni `Stair_Ceiling`, causa primaria; (3) el panel de upper deck entra en 0,79 mientras la geometría todavía se arma y la versión anterior no tenía meseta propia, causa secundaria de ritmo. Decisión: mantener B2 y reemplazar el blockout por el remodelado B con escalera cerrada, no ocultar el tramo ni enmascararlo con overlays. |

**Fixes derivados de los spikes** — se agregan acá una vez que cada hallazgo exista:

- [x] D1-fix · Iluminar y componer la cola completa en S6 (`ΔY ≥ 0,05`, contraste ≥1,5:1), preservando geometría y librea; confirmar de nuevo con `LandingGear` oculto. **Evidencia:** `06c`, ΔY **0,4871**, contraste **10,01:1**; la franja naranja queda unida a la aleta completa.
- [x] D2-fix · Mantener el tren en plano medio, validar los cuatro conjuntos y su retracción/ocultamiento atómico; si los fairings siguen leyendo como “peine”, resolver encuadre/material antes de plantear remodelado puntual. **Evidencia:** `02-takeoff` muestra tren reconocible en plano medio; runtime aplica una sola `t` a todo `LandingGear` y lo oculta atómicamente en `t=1`; la cámara evita close-up del fairing.
- [x] D3-fix · Publicar el remodelado B con `Stair_Wall_Left/Right`, paneles interiores, techo, 16 escalones y rellano; conservar la travesía continua/meseta de B2 y repetir la misma serie 0,70–0,85 para confirmar que desaparecen el fondo plano y las piezas flotantes. **Evidencia:** Blender verifica cierre completo y 16 peldaños; `05c-interior-stair` y la serie posterior muestran paredes, techo, barandas y rellano sin vacío negro.

---

## Fase E — Overlays y naming

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| E1 | Disposición, jerarquía y timing de overlays sobre los fondos recalibrados; reevaluar contraste de S3 | Captura por sección con texto legible sin competir con la aeronave; medición de contraste en S1 y S3 | [x] | 13 capturas desktop + 4 mobile inspeccionadas; exactamente un panel narrativo activo por captura. Contraste estimado: S1 **16,15:1**, S3 **17,5:1** (mínimo 4,5:1). |
| E2 | Unificar naming (`package.json`, `<title>`, metadata, documentación) | `grep` sin resultados de "747" fuera del nombre del repo y de notas históricas explícitas | [x] | Paquete `meridian-a380-experience`; título/OG/description/copy: MERIDIAN — Airbus A380-800. `rg` sólo encuentra `boeing-747` en slug/base/URL y notas históricas expresamente permitidas. |
| E3 | **Decisión del usuario:** ¿se renombra el repositorio? | Impacta la URL de GitHub Pages y el `base` de `vite.config.ts`. No se ejecuta unilateralmente | [x] | **Decisión:** no renombrar. Se conserva `boeing-747` únicamente como slug histórico para no romper Pages; producto, metadata y paquete se unifican como MERIDIAN / Airbus A380-800. Decisión tomada bajo la delegación explícita del usuario de escoger las recomendaciones del plan. |

---

## Checklist de aceptación visual final

> Se completa al cierre de la ronda, no antes. Espejo de `plan2.md` §5.

**Transversales:**
- [x] Cero texto de una sección visible mientras otra está activa (101 puntos muestreados)
- [x] Cero elementos geométricos no identificables en el frame, en todo el recorrido
- [x] Cero discontinuidades de cámara (paso 0.001, umbral fijo)
- [x] Toda luz de escena con nombre, temperatura e intensidad declaradas
- [x] Draw calls y triángulos dentro de `PLAN.md` §7.1; FPS queda explícitamente para hardware físico, porque SwiftShader no es una medición válida de GPU
- [x] Ratio de luminancia media entre cualquier par de HDRI < 4× (**1,922×**)

**Por sección:**
- [x] **S1** — pista con marcas horizontales; vegetación; torre identificable; sin zonas quemadas (**0,422%** saturado); cero líneas verticales
- [x] **S2** — sombra analítica desplazándose; tren retrayéndose de forma reconocible; sin corte al entrar desde S1
- [x] **S3** — cielo sin quemarse; nubes legibles; contraste de overlay **17,5:1**
- [x] **S4** — el cruce se lee como umbral; marco presente durante el cruce; sin salto al entrar desde S3
- [x] **S5** — las 4 zonas con asientos, pasillo y techo distinguibles; escalera cerrada; transición continua
- [x] **S6** — cielo de atardecer con nubes; avión iluminado y separado del fondo; cero restos del marco
- [x] **S7** — cierre oscuro coherente; atribución y enlace **CC BY 4.0 visibles**

---

## Registro de sesiones

| Fecha | Sesión | Qué se hizo | Qué quedó abierto |
|---|---|---|---|
| 2026-08-11 | Planificación de la ronda 2 (auditoría + `plan2.md` + `progress2.md`) | Sesión exclusivamente de planificación, sin código de implementación. Auditoría real del árbol en `21aeae6`: se leyeron los sistemas de estado de scroll, cámara, iluminación, materiales y entorno, y se corrieron diagnósticos numéricos sobre los datos del proyecto (script descartado tras usarse, no quedó en el repo). **Seis causas raíz confirmadas con evidencia dura**, no supuestas desde capturas: (1) `zoneForLocalProgress` devuelve `cockpit` para todo scroll previo a S5 porque `localProgress` clampea a 0 — reproduce exactamente el defecto reportado a 9%; (2) `sampleCamera` salta los tramos de curva entre secciones, con teletransportes medidos de hasta **107.7 unidades** en S3→S4; (3) las marcas de pista usan `planeGeometry` sin rotación y quedan **verticales**, lo que causa a la vez el artefacto de líneas y la ausencia de pista legible; (4) el marco del umbral sigue visible al 67% a scroll 0.88, y sus tres piezas coinciden una a una con el anillo cian y la barra naranja reportados; (5) las tres HDRI tienen luminancias medias de **1.05 / 42.91 / 0.0158** — hasta **2718×** de diferencia, causa numérica única del hero lavado, el S3 quemado y el outro negro; (6) el interior es oscuro por tres factores multiplicativos (cobertura de spots insuficiente, env map de relleno en valores 18–80/255, exposición a 0.62). Dos defectos quedaron **explícitamente sin diagnosticar** y registrados como spikes (línea roja en S6, geometría del tren), más un tercero (transición de escalera) que necesita grabación antes de proponer fix. Se documentó como decisión mayor, con todas las letras, que el pipeline de render **no** es el problema pero los assets **sí**: el interior es un blockout de cajas y no se vuelve profesional iluminándolo mejor. | **F0-1 bloquea la implementación**: falta que el usuario elija entre las opciones A / B / C de `plan2.md` §3. También pendiente E3 (¿se renombra el repo?). Ningún ítem de A–E empezado — esta sesión no escribió código de implementación por diseño. |
| 2026-08-11/12 | Ejecución completa ronda 2 | Se eligió la opción recomendada B y se dividió la revisión entre cuatro líneas independientes (estado/cámara, interior Blender, artefactos/naming y entorno/portal). Se implementaron fuente única de zona, recorrido continuo de 17 keyframes, portal rectangular físico, tres HDRI normalizadas, rig exterior key/fill/rim, iluminación interior completa, roughness/normal exterior, pista/vegetación/torre/nubes, remodelado procedural de cuatro zonas y batching del GLB. Se reforzaron tests y arneses para SwiftShader, desktop/mobile y video. Cierre: tests/lint/build/HD­RI/GLB/Blender PASS; 17 capturas inspeccionadas; 0 errores consola/página/red/HTTP; High máx. 148 draw calls exterior y 139 interior, Low hero 99; ratio HDRI 1,922×; cámara dentro de todos sus umbrales; cola–cielo 10,01:1. | Sólo queda la matriz de FPS/cross-browser en Safari/iOS/Android físicos, explícitamente no sustituible por SwiftShader ni emulación. GitHub Actions repite todo lo automatizable en cada push. |
