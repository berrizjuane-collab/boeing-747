# PROGRESS 2 — Corrección y Finalización Visual

> **`PLAN.md` y `PROGRESS.md` (los `plan1`/`progress1` del pedido) fueron completados en la ronda anterior** — sus 10 fases (0–9) están cerradas y así quedan. **Este documento cubre exclusivamente la ronda de corrección y finalización que sigue**, y es el checklist activo de aquí en adelante, espejado a [`plan2.md`](./plan2.md). No se vuelve a marcar nada en `PROGRESS.md`.

Convención: `[ ]` pendiente · `[~]` en curso · `[x]` completo **con evidencia adjunta** · `[!]` bloqueado

**Estado global: nada empezado.** Este documento se crea vacío a propósito, en una sesión que fue exclusivamente de planificación y auditoría.

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

- [ ] **F0-1 · Decisión mayor sobre el interior (`plan2.md` §3).** Elegir entre A (corrección sin re-modelado), B (A + re-modelado real del interior) o C (A + recorte de alcance de S5). Recomendación del plan: **B si hay presupuesto de tiempo, C si no**. Ninguna fase posterior que toque S5 arranca antes de esta decisión.
  - Evidencia requerida: decisión registrada por escrito acá, con su razón.
  - **Decisión:** _(pendiente)_

---

## Fase A — Fundaciones visuales

> Va primero porque hasta que la exposición y la luz sean correctas no se puede juzgar visualmente nada de lo demás.

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| A1 | Regenerar `sunset.hdr` (sol sobre el horizonte) y normalizar las tres HDRI | Re-medición de luminancia media de los 3 `.hdr`; ratio máximo entre cualquier par < 4×. Más captura de S1/S3/S6 con cielo legible | [ ] | — |
| A2 | Rediseño del esquema de luces exterior (key / fill / rim por sección) | Inventario donde **toda** luz tiene nombre, temperatura e intensidad declaradas; cero luces sin justificar. Captura S1/S2/S3 con silueta separada del fondo, sin quemarse | [ ] | — |
| A3 | Recalibrar exposición y niebla contra las HDRI normalizadas | Captura de S1 con < 2% de píxeles saturados a 255 y torre de control visible | [ ] | — |
| A4 | Iluminación interior: cobertura real del corredor + relleno ambiental usable | Captura en las 4 zonas (cockpit / economy / escalera / upper deck) donde se distinguen asientos, pasillo y techo. Luminancia media del frame dentro de rango objetivo | [ ] | — |

**Línea base medida en la auditoría** (para comparar después): `golden-hour` 1.05 · `high-altitude` 42.91 · `sunset` 0.0158 — ratio máximo actual **≈2718×**.

---

## Fase B — Corrección estructural

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| B1 | Fuente única de verdad de sección/zona; `zoneForLocalProgress` deja de devolver `cockpit` fuera de S5; `Hotspots.tsx` alineado; guard defensivo de `InteriorOverlay.tsx` eliminado | Barrido de 101 puntos (0–100%, paso 1%): en cada uno, consistencia entre `activeIndex` y paneles con `data-active="true"`. **Cero excepciones** | [ ] | — |
| B2 | Cámara: travesía única y monótona de la curva; mesetas como reparametrización de velocidad | Muestreo cada 0.001 en [0,1]; ninguna muestra consecutiva supera el umbral de distancia. **Los 6 límites deben pasar** | [ ] | — |
| B3 | Visibilidad del marco del umbral ligada a la relación cámara↔portal | Capturas a 0.86 / 0.88 / 0.92 **sin** ningún elemento del marco; y captura a ≈0.83 **con** el marco presente (no vale apagarlo siempre) | [ ] | — |
| B4 | Marcas de pista acostadas sobre el suelo | Captura cenital de depuración con eje y bordes sobre el asfalto + captura de S1 sin ninguna línea vertical | [ ] | — |

**Línea base medida en la auditoría** (saltos de cámara a corregir): S1→S2 **44.1** · S2→S3 3.0 · S3→S4 **107.7** · S4→S5 8.0 · S5→S6 **32.5** · S6→S7 11.8 unidades.

---

## Fase C — Materiales y entorno

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| C1 | Set PBR del exterior: roughness + normal; diferenciar vidrio / metal / pintura | Comparativa antes/después en el mismo encuadre de S1, con micro-detalle y reflejos visibles; assert de que roughness deja de ser uniforme | [ ] | — |
| C2 | Entorno del hero: vegetación, torre reencuadrada, escala de pista legible | Captura de S1 donde se identifican sin ambigüedad pista con marcas, vegetación, hangares y torre. Draw calls dentro del presupuesto de `PLAN.md` §7.1 | [ ] | — |
| C3 | Escena de salida S6 reencuadrada como vista cinematográfica | Captura a 88% con cielo de atardecer legible, avión iluminado y separado del fondo, **cero elementos no identificables** | [ ] | — |

---

## Fase D — Spikes (hallazgo escrito antes de cualquier fix)

> Regla dura: cada spike produce un hallazgo registrado **antes** de que se proponga ninguna solución. Si el hallazgo es "no hay bug", eso es un resultado válido y convierte el ítem en decisión de alcance.

| # | Spike | Método | Estado | Hallazgo |
|---|---|---|---|---|
| D1 | Línea roja diagonal en S6 (`plan2.md` §2.3c) | Ocultar `LandingGear`, luego `A380`, aislar cuál la contiene; después inspeccionar ese subconjunto. Hipótesis abiertas: polígonos degenerados (708 / 2.699 documentados en `ASSET_AUDIT.md`) o tren mal escalado | [ ] | — |
| D2 | Geometría "peine" del tren (`plan2.md` §2.3d) | Inspección aislada a cámara cercana, en Blender y en navegador, con el resto oculto. Decidir entre: corregir transform · reemplazar por geometría propia · mantener fuera de encuadre cercano | [ ] | — |
| D3 | Transición de escalera (`plan2.md` §2.7) | Grabación cuadro a cuadro entre 70% y 85% de scroll (no capturas sueltas). Separar cuánto es discontinuidad de cámara, cuánto geometría faltante (`Stair_Wall` no existe) y cuánto ritmo de mesetas | [ ] | — |

**Fixes derivados de los spikes** — se agregan acá una vez que cada hallazgo exista:

- [ ] D1-fix _(a definir tras D1)_
- [ ] D2-fix _(a definir tras D2)_
- [ ] D3-fix _(a definir tras D3)_

---

## Fase E — Overlays y naming

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| E1 | Disposición, jerarquía y timing de overlays sobre los fondos recalibrados; reevaluar contraste de S3 | Captura por sección con texto legible sin competir con la aeronave; medición de contraste en S1 y S3 | [ ] | — |
| E2 | Unificar naming (`package.json`, `<title>`, metadata, documentación) | `grep` sin resultados de "747" fuera del nombre del repo y de notas históricas explícitas | [ ] | — |
| E3 | **Decisión del usuario:** ¿se renombra el repositorio? | Impacta la URL de GitHub Pages y el `base` de `vite.config.ts`. No se ejecuta unilateralmente | [ ] | **Decisión:** _(pendiente)_ |

---

## Checklist de aceptación visual final

> Se completa al cierre de la ronda, no antes. Espejo de `plan2.md` §5.

**Transversales:**
- [ ] Cero texto de una sección visible mientras otra está activa (101 puntos muestreados)
- [ ] Cero elementos geométricos no identificables en el frame, en todo el recorrido
- [ ] Cero discontinuidades de cámara (paso 0.001, umbral fijo)
- [ ] Toda luz de escena con nombre, temperatura e intensidad declaradas
- [ ] FPS y draw calls dentro del presupuesto de `PLAN.md` §7.1
- [ ] Ratio de luminancia media entre cualquier par de HDRI < 4×

**Por sección:**
- [ ] **S1** — pista con marcas horizontales; vegetación; torre identificable; sin zonas quemadas (< 2% saturado); cero líneas verticales
- [ ] **S2** — sombra proyectada desplazándose; tren retrayéndose de forma reconocible; sin corte al entrar desde S1
- [ ] **S3** — cielo sin quemarse; nubes legibles; contraste de overlay medido y suficiente
- [ ] **S4** — el cruce se lee como umbral; marco presente durante el cruce; sin salto al entrar desde S3
- [ ] **S5** — las 4 zonas con asientos, pasillo y techo distinguibles; escalera sin hueco al fondo plano; transición fluida
- [ ] **S6** — cielo de atardecer con nubes; avión iluminado y separado del fondo; cero restos del marco
- [ ] **S7** — cierre en negro coherente con S0; atribución CC BY visible

---

## Registro de sesiones

| Fecha | Sesión | Qué se hizo | Qué quedó abierto |
|---|---|---|---|
| 2026-08-11 | Planificación de la ronda 2 (auditoría + `plan2.md` + `progress2.md`) | Sesión exclusivamente de planificación, sin código de implementación. Auditoría real del árbol en `21aeae6`: se leyeron los sistemas de estado de scroll, cámara, iluminación, materiales y entorno, y se corrieron diagnósticos numéricos sobre los datos del proyecto (script descartado tras usarse, no quedó en el repo). **Seis causas raíz confirmadas con evidencia dura**, no supuestas desde capturas: (1) `zoneForLocalProgress` devuelve `cockpit` para todo scroll previo a S5 porque `localProgress` clampea a 0 — reproduce exactamente el defecto reportado a 9%; (2) `sampleCamera` salta los tramos de curva entre secciones, con teletransportes medidos de hasta **107.7 unidades** en S3→S4; (3) las marcas de pista usan `planeGeometry` sin rotación y quedan **verticales**, lo que causa a la vez el artefacto de líneas y la ausencia de pista legible; (4) el marco del umbral sigue visible al 67% a scroll 0.88, y sus tres piezas coinciden una a una con el anillo cian y la barra naranja reportados; (5) las tres HDRI tienen luminancias medias de **1.05 / 42.91 / 0.0158** — hasta **2718×** de diferencia, causa numérica única del hero lavado, el S3 quemado y el outro negro; (6) el interior es oscuro por tres factores multiplicativos (cobertura de spots insuficiente, env map de relleno en valores 18–80/255, exposición a 0.62). Dos defectos quedaron **explícitamente sin diagnosticar** y registrados como spikes (línea roja en S6, geometría del tren), más un tercero (transición de escalera) que necesita grabación antes de proponer fix. Se documentó como decisión mayor, con todas las letras, que el pipeline de render **no** es el problema pero los assets **sí**: el interior es un blockout de cajas y no se vuelve profesional iluminándolo mejor. | **F0-1 bloquea la implementación**: falta que el usuario elija entre las opciones A / B / C de `plan2.md` §3. También pendiente E3 (¿se renombra el repo?). Ningún ítem de A–E empezado — esta sesión no escribió código de implementación por diseño. |
