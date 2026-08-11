# PLAN 2 — Corrección y Finalización Visual

> **Estado de los documentos previos.** `PLAN.md` y `PROGRESS.md` (los archivos que en el pedido se nombran como `plan1`/`progress1`) corresponden a la ronda anterior y quedan **cerrados**: sus 10 fases (0–9) fueron completadas y así están marcadas. Este documento, `plan2.md`, es el **documento activo** de aquí en adelante, junto con su checklist espejo `progress2.md`. No se vuelve a marcar nada en `PROGRESS.md`.
>
> **Sesión de planificación.** Ni una línea de este documento es código de implementación. Los únicos entregables de esta sesión son `plan2.md` y `progress2.md`.

---

## 0. Por qué existe esta ronda

La ronda anterior entregó un sitio **estructuralmente completo y funcionalmente correcto**: el scroll conduce la escena, las 7 secciones existen, no hay errores de consola, no hay requests fallidos, el build y el typecheck pasan limpios, y el deploy funciona. Todo eso es verificable y sigue siendo cierto.

Lo que **no** entregó es lo que se pidió desde el brief original: *"calidad de renderizado, gráficamente cautivadora, genuinamente bien hecho y bonito, profesional."* El resultado se lee como un boceto estructural sobre el que todavía hay que construir.

**La causa de fondo no es técnica, es de método de verificación.** Cada fase de la ronda anterior se cerró contra criterios de *ausencia de fallas* — cero errores de consola, cero requests fallidos, draw calls dentro de presupuesto, el elemento existe en el DOM, la geometría está en el frustum — y nunca contra un criterio de *presencia de calidad*: ¿esta imagen se ve como el brief pidió? Un sitio puede pasar los primeros al 100% y verse como un wireframe, que es exactamente lo que pasó.

Esta ronda invierte esa vara. El criterio de aceptación de cada ítem de `progress2.md` es una afirmación sobre **la imagen renderizada**, no sobre el estado del código.

---

## 1. Paso 0 — Auditoría del código actual

Auditoría real ejecutada sobre el árbol en `21aeae6`, leyendo los componentes y corriendo diagnósticos numéricos sobre los datos del proyecto (script de auditoría descartado tras usarse; no quedó en el repo). Lo que sigue es lo que el código **hace hoy**, no lo que se planeó que hiciera.

### 1.1 Estado de sección activa — ¿una o dos fuentes de verdad?

Hay **una** fuente de verdad nominal (`scrollStore.ts`: `progress` + `activeIndex` derivado vía `getActiveSectionIndex`), y tanto el HUD (`DebugHud.tsx`) como los overlays narrativos (`NarrativeOverlay.tsx`) leen de ahí. Hasta ahí, correcto.

**Pero hay un segundo camino de derivación que no pasa por ese estado.** `InteriorOverlay.tsx` y `Hotspots.tsx` no usan `activeIndex`: computan la zona de S5 con `zoneForLocalProgress(localProgress(progress, SECTIONS[4]))` dentro de un loop de `rAF`. Y `localProgress` **clampea a [0,1]**, así que fuera de S5 devuelve 0 — y `zoneForLocalProgress(0)` devuelve `'cockpit'`, no `null`.

Diagnóstico numérico ejecutado:

```
scroll 0     -> localProgress=0.000 -> zone=cockpit
scroll 0.09  -> localProgress=0.000 -> zone=cockpit   ← el caso exacto reportado
scroll 0.25  -> localProgress=0.000 -> zone=cockpit
scroll 0.45  -> localProgress=0.000 -> zone=cockpit
scroll 0.62  -> localProgress=0.375 -> zone=null
scroll 0.90  -> localProgress=1.000 -> zone=upperDeck
```

Esto reproduce **exactamente** el defecto reportado: a scroll 9% (S1), la función de zona dice `cockpit`, que es el panel "S5 — Cabina de mando / El puesto de pilotaje". La función es estructuralmente incapaz de expresar "estoy fuera de S5".

Hay un guard defensivo agregado al cierre de la ronda anterior (`if (!inInterior) { reset; return }` en `InteriorOverlay.tsx`) que tapa el camino más común, pero es un parche sobre una función insegura, y **`Hotspots.tsx` usa la misma función sin ese guard**. La conclusión de diseño es que el guard no alcanza: la función tiene que dejar de mentir.

### 1.2 Sistema de cámara — ¿interpola o salta?

La cámara usa dos `CatmullRomCurve3` (posición y target) con tablas de arc-length independientes — una arquitectura correcta y bien razonada. **Pero el remapeo por sección introduce discontinuidades reales.**

`sampleCamera()` mapea el progreso local de cada sección al tramo `[POS_U[primerKeyframe], POS_U[últimoKeyframe]]` **de esa sección**. El tramo de curva **entre** el último keyframe de una sección y el primero de la siguiente **nunca se recorre**. En el límite, la cámara teletransporta.

Distancia del salto en cada límite de sección, medida sobre los keyframes reales:

| Límite | Scroll | Salto |
|---|---|---|
| S1→S2 | 0.12 | **44.1 unidades** |
| S2→S3 | 0.28 | 3.0 unidades |
| S3→S4 | 0.42 | **107.7 unidades** |
| S4→S5 | 0.50 | 8.0 unidades |
| S5→S6 | 0.82 | **32.5 unidades** |
| S6→S7 | 0.95 | 11.8 unidades |

S2→S3 es casi continuo **sólo porque alguien duplicó el keyframe a mano** (`(100,70,-50)` → `(100,70,-53)`, con un comentario que lo dice explícitamente). Es decir: el único límite que se siente bien está parcheado a mano, y el mecanismo general no garantiza continuidad en ningún lado.

**S3→S4 salta 107.7 unidades de golpe.** Ese es el corte más violento del recorrido y cae justo en la entrada al umbral — la pieza que el plan original declaraba como la más importante del sitio.

### 1.3 Iluminación por escena

Existen luces reales, pero el setup es mínimo y plano:

- **Exterior (`EnvironmentPlaceholder.tsx`)**: un `hemisphereLight` (intensidad 1.2) + un `directionalLight` (intensidad 2). Eso es todo. Sin luz de relleno, sin rim/back light, sin variación por sección más allá de intensidad y un lerp de color hacia el atardecer.
- **Interior (`InteriorLighting.tsx`)**: dos `spotLight` (2.6 y 1.69 de intensidad) con `distance: 32` y `decay: 1.5`, más un env map procedural PMREM.
- **Fondo**: `scene.background` es un **color plano** por sección (`environmentTheme.ts`), cuyo propio comentario dice *"Placeholder-legible, not final grading"*. Nunca se reemplazó.
- **Niebla**: `FogExp2` con densidad 0.0035 sobre un plano de suelo de 4000×4000 unidades — a 190 unidades (donde están los hangares) la niebla ya come ~36% del contraste, y hacia el horizonte lava todo al color de niebla.

### 1.4 Materiales del avión

**Corregido parcialmente en `21aeae6`** (esta misma sesión, antes de esta ronda): hasta ese commit, `dissolveHullMaterial` reemplazaba el material real del fuselaje por un `ShaderMaterial` **sin textura y sin iluminación** (`gl_FragColor = mix(color, edgeGlow, glow)`), en todo momento y no sólo durante el cruce del umbral. Por eso el avión era una silueta gris plana. Hoy el material extiende el `MeshStandardMaterial` real vía `onBeforeCompile` y la librea se ve.

**Lo que sigue faltando** (documentado desde `ASSET_AUDIT.md` de la ronda anterior, nunca resuelto): el asset tiene **una sola textura de albedo**. No hay mapa de normales, ni de roughness, ni de metalness, ni AO. `roughnessFactor: 0.5` y `metallicFactor: 0` uniformes en toda la aeronave. Sin normal map no hay panel lines en relieve; sin roughness map el fuselaje, las ventanas, las turbinas y el tren responden todos igual a la luz. Esa es la diferencia que queda entre "tiene textura" y "se ve renderizado".

### 1.5 Assets de entorno realmente presentes

| Elemento pedido | Estado real |
|---|---|
| Marcas de pista | Presentes en `RunwayMarkings`, **pero con bug de orientación** (ver §2.3) |
| Hangares / torre de control | Presentes: 3 cajas + cilindro con cabezal, en x=±140–190 |
| Vegetación | **No existe.** Ningún componente la implementa. El suelo es un único plano `#3c4a3a` |
| HDRI cielo | Las 3 existen y cargan, **pero con luminancias incompatibles** (ver §2.5) |
| Polvo suspendido | Presente (`DustParticles`, 400 puntos) |
| Nubes | Presentes (`CloudLayer`, 6 billboards) |

### 1.6 Hallazgo transversal no reportado por el usuario — luminancia de las HDRI

Medición directa de luminancia media sobre los tres archivos `.hdr` del proyecto (decodificando RGBE):

| HDRI | Luminancia media | Relativo |
|---|---|---|
| `golden-hour.hdr` | 1.05 | 1× |
| `high-altitude.hdr` | 42.91 | **41×** |
| `sunset.hdr` | 0.0158 | **0.015×** |

Las tres skies difieren hasta en un factor de **~2700×**. Ninguna exposición única puede servirlas: con la exposición calibrada para golden-hour, S3 se quema a blanco y S6 cae a negro. Esto no es un ajuste de gusto — es la causa raíz **numérica** de que el arco de grading del sitio no funcione, y explica simultáneamente el hero lavado, el S3 blanco y el outro negro.

`sunset.hdr` en particular, con luminancia media 0.0158, es **inutilizable**: el preset que lo generó puso el sol *por debajo* del horizonte, produciendo efectivamente un cielo nocturno, no un atardecer.

---

## 2. Los 9 defectos — causa raíz

Cada defecto lleva: causa raíz confirmada (con archivo), o marca explícita de **SPIKE** si no se pudo confirmar sin más investigación.

### 2.1 — Superposición de textos entre secciones · **CAUSA RAÍZ CONFIRMADA**

**Archivo:** `src/lib/cameraPath.ts` → `zoneForLocalProgress()`, consumido por `src/components/InteriorOverlay.tsx` y `src/components/Hotspots.tsx`.

**Causa:** la función devuelve `'cockpit'` para `t = 0`, y `localProgress()` clampea a 0 en todo el scroll anterior a S5. La zona de S5 se deriva por un camino paralelo (`rAF` + progreso continuo) que no pasa por `activeIndex`, así que puede contradecir al HUD. Ver el diagnóstico numérico en §1.1 — reproduce el caso reportado a 9% exactamente.

**No es** un problema de timing de desmontaje ni de CSS: los paneles están montados a propósito (por accesibilidad) y se ocultan por `data-active`. El bug es que `data-active` se pone en `true` para la zona equivocada.

**Fix de diseño (no parche):** `zoneForLocalProgress` debe recibir progreso **global** y devolver `null` fuera de S5, o bien desaparecer como API pública y ser reemplazada por un selector derivado del store. Objetivo estructural: **que sea imposible por construcción** que un panel de S5 esté activo cuando `activeIndex !== 4`. El guard actual en `InteriorOverlay.tsx` se elimina como parte del fix — deja de hacer falta.

**Verificación:** barrido automatizado de scroll en pasos de 1% de 0 a 100%; en cada paso, assert de que el conjunto de paneles con `data-active="true"` es consistente con `activeIndex`. Cero excepciones en 101 muestras.

### 2.2 — Transiciones bruscas de cámara · **CAUSA RAÍZ CONFIRMADA**

**Archivo:** `src/lib/cameraPath.ts` → `sampleCamera()`.

**Causa:** el remapeo piecewise por sección salta los tramos de curva entre secciones. Mediciones en §1.2: hasta **107.7 unidades de teletransporte** en S3→S4.

**Fix de diseño:** el recorrido de la cámara tiene que ser **una sola travesía continua de la curva**, con el progreso de scroll mapeado monótonamente a `u ∈ [0,1]` sin huecos. Las mesetas de dwell (que son deseables) se expresan como **reparametrización de velocidad** sobre esa travesía única — no como saltos de rango. Requisito: `u(progress)` continua, monótona, sin discontinuidades en los 6 límites.

**Verificación:** muestreo de `sampleCamera` en pasos de 0.001 en todo el rango; assert de que la distancia entre muestras consecutivas nunca supera un umbral (p. ej. 3 unidades). Hoy fallaría en 3 de los 6 límites.

### 2.3 — Artefactos de render

#### 2.3a Líneas verticales brillantes · **CAUSA RAÍZ CONFIRMADA**

**Archivo:** `src/components/RunwayEnvironment.tsx` → `RunwayMarkings()`.

**Causa:** las marcas de pista usan `planeGeometry`, que en three.js nace en el plano **XY (vertical)**. El grupo contenedor tiene `position={[0, 0.02, 0]}` pero **no tiene `rotation`**. El plano de suelo de `EnvironmentPlaceholder.tsx` sí la tiene (`rotation={[-Math.PI/2, 0, 0]}`); estas marcas no.

Resultado: las dos líneas de borde (`0.35 × 400`) quedan **paradas como muros de 400 unidades de largo**, y las 13 rayas de eje (`0.5 × 6`) como láminas verticales. Eso es exactamente lo que se ve como "líneas verticales delgadas y brillantes atravesando el frame".

Este único bug causa **dos** defectos reportados: el artefacto (2.3a) y la ausencia de pista reconocible (2.5).

#### 2.3b Barra naranja y anillo flotando en la salida · **CAUSA RAÍZ CONFIRMADA**

**Archivos:** `src/components/ThresholdFrame.tsx` + `src/lib/thresholdPortals.ts` → `frameVisibility()`.

**Causa:** el marco de puerta del `EXIT_PORTAL` sigue visible cuando la cámara ya salió y está haciendo el retroceso amplio. `frameVisibility(0.88, EXIT_PORTAL)` = **0.67** (con `end: 0.87` y `FRAME_FADE: 0.03`), así que a 88% de scroll el marco todavía se dibuja al 67%.

Los tres elementos del marco corresponden uno a uno con lo reportado:
- **anillo cian** = `torusGeometry(TRIM_RADIUS 14.5)` con emissive `#8fd8ff`
- **barra naranja** = el "sill" (`boxGeometry(8, 0.7, 1.3)`, color `#d9a566`, emissive `#c98a4a`) en `SILL_Y = -14.4`
- ambos anclados a `EXIT_PORTAL.center = (0, 44, -52)`, en el aire, sin relación visual con el avión una vez que la cámara se aleja

El marco fue diseñado para verse **desde cerca, atravesándolo**. Nunca se validó cómo se ve **desde lejos**, que es exactamente el encuadre de S6 tardío.

**Fix de diseño:** la visibilidad del marco tiene que estar ligada a la proximidad/encuadre de la cámara respecto del portal, no sólo a una ventana de scroll. Fuera del cruce, invisible — sin excepción.

#### 2.3c Línea roja diagonal en la salida · **SPIKE — causa no confirmada**

Visible en la captura de S6 como una línea roja fina que cruza el anillo. **No se pudo atribuir a un componente con la evidencia actual.** Dos hipótesis, ninguna confirmada:

1. Polígonos degenerados del asset exterior. `ASSET_AUDIT.md` documentó **708 y 2.699 polígonos con área UV degenerada** en los meshes `A380` y `Wheels`. Un triángulo degenerado que muestrea un texel rojo del atlas (el atlas tiene zonas rojas) produciría exactamente una astilla fina de color plano.
2. Geometría del tren de aterrizaje mal escalada tras la retracción (comparte sospecha con 2.3d).

**Tarea de spike, antes de proponer fix:** aislar en el navegador con el modelo cargado — ocultar `LandingGear`, luego ocultar `A380`, y determinar cuál de los dos contiene la línea; después inspeccionar ese subconjunto. **No proponer solución hasta tener el culpable identificado.**

#### 2.3d Geometría "peine"/zigzag en el tren de aterrizaje · **SPIKE — causa parcialmente acotada**

El tren son **115 nodos separados** (`LandingGear_Part_###`), separados en Blender por `prepare_exterior.py` a partir de un mesh `Wheels` con 115 componentes desconectados. La retracción los mueve **como grupo** (`gear.position.y = t * 3`), lo cual es correcto.

Lo que se ve como "peine" es consistente con que el modelo fuente simplemente **no tiene un tren bien modelado** (es un asset game-ready de bajo poly), no con un bug de transformación — pero eso **no está confirmado**. `Wheels` tiene 13.032 caras marcadas como UV-solapadas, sobre 2.699 polígonos degenerados.

**Tarea de spike:** inspeccionar el tren aislado en Blender y en el navegador, a cámara cercana, con el resto oculto. Decidir entonces entre: (a) es un bug de escala/transform → corregir, (b) el asset es así → reemplazar el tren por geometría propia simple, o (c) mantenerlo fuera de encuadre cercano. **La decisión depende del hallazgo, no al revés.**

### 2.4 — Ausencia de shading real · **CAUSA RAÍZ CONFIRMADA (parcialmente ya corregida)**

**Estado:** la causa principal — `dissolveHullMaterial` reemplazando el material PBR real por un shader sin luz — **ya está corregida** en `21aeae6`, y la librea real ahora se ve.

**Lo que queda,** y es lo que separa "tiene textura" de "se ve profesional":

1. **Material albedo-only.** Sin normal / roughness / metalness / AO (§1.4). Superficie uniforme, sin micro-detalle, sin diferenciación entre vidrio, metal pulido y pintura.
2. **Setup de luz plano.** Dos luces en total para el exterior (§1.3), sin relleno ni rim. Un avión blanco bajo luz difusa uniforme se lee como plastilina.
3. **Sin oclusión ambiental.** Ni horneada ni en pantalla.

**Este es el defecto de mayor impacto visual y debe atacarse primero.** Ver §3 para la decisión de fondo que conlleva.

### 2.5 — Entorno del hero incompleto · **CAUSA RAÍZ CONFIRMADA (múltiple)**

Tres causas independientes que se suman:

1. **La pista no se lee** porque sus marcas están verticales (§2.3a). No es que falten: están mal orientadas.
2. **No hay vegetación** porque nunca se implementó (§1.5). No es un bug, es alcance no ejecutado.
3. **El golden hour se lava** por la combinación de: exposición calibrada contra una HDRI de luminancia 1.05 (§1.6), niebla exponencial comiendo el fondo desde ~150 unidades (§1.3), y sólo dos luces sin control de rango dinámico. La torre de control existe en x=190 pero queda diluida en niebla y fuera del encuadre útil.

### 2.6 — Interior de cabina oscuro · **CAUSA RAÍZ CONFIRMADA (múltiple)**

1. **Cobertura de luz insuficiente.** Dos `spotLight` con `distance: 32` y `decay: 1.5` para un corredor de ~75 unidades de largo. Más allá del radio de cada foco, la geometría queda sin iluminación directa.
2. **El env map de relleno es casi negro.** `createCabinFillTexture()` genera valores RGB en el rango **18–80 sobre 255**. Ese es el único relleno ambiental del interior, y aporta casi nada.
3. **Exposición reducida encima.** `exposureMultiplier` vale **0.62** en todo S5, y `sunIntensityMultiplier` baja el sol a **0.04**.

Los tres efectos se multiplican. El resultado no es "cálido y contenido" (lo pedido) sino "casi negro".

**Nota de alcance importante:** aunque se corrija toda la iluminación, el interior seguirá siendo un **blockout de cajas** — ver §3.

### 2.7 — Transición a la escalera "desastrosa" · **SPIKE — comparte causa con 2.2, requiere confirmación propia**

Comparte la causa raíz de 2.2 (discontinuidad de cámara), pero tiene además dos factores propios que la hacen el peor tramo del recorrido:

1. **La escalera no tiene paredes ni cielorraso.** Documentado y nunca corregido en la ronda anterior: `interior.glb` sólo trae `Stair_Floor`, `Stair_Main` y dos `Stair_Railing`, ningún `Stair_Wall`. Se ve el hueco lateral hacia el fondo plano.
2. **El único cambio de altura del recorrido.** El keyframe de la escalera es el único con componente vertical real (`y: 39.5` → `40.95`) y con offset lateral (`x: 0.6`), y `walkthroughProgress` le da una meseta de dwell en `[0.76, 0.88]` seguida de un tramo final comprimido — el upper deck no tiene meseta propia (comentado en el código).

**Tarea de spike:** grabar el tramo S5 completo cuadro a cuadro (no capturas sueltas) entre 70% y 85% de scroll, y determinar cuánto del problema es discontinuidad de cámara, cuánto es geometría faltante y cuánto es el ritmo de las mesetas. **Se planifica el fix después de ver esa grabación.**

### 2.8 — Escena de salida oscura · **CAUSA RAÍZ CONFIRMADA**

**Archivo:** el asset `public/hdri/sunset.hdr` y el preset que lo generó (`blender/generate_hdri.py --preset sunset`).

**Causa:** la HDRI de atardecer tiene **luminancia media 0.0158** — 67× más oscura que golden-hour y 2700× más que high-altitude (§1.6). El preset puso el sol por debajo del horizonte, generando un cielo de noche cerrada, no un atardecer.

Confirmación de que la lógica de mezcla **no** es la culpable: a scroll 0.88, `sunsetWeight` = **1.0** (plena) y `exposureMultiplier` = **0.795**. El sistema está pidiendo el cielo correctamente y con exposición razonable — el archivo que recibe es negro.

**Fix:** regenerar `sunset.hdr` con el sol **apenas por encima** del horizonte, y normalizar la luminancia de las tres HDRI a un rango común (§4.2). Es trabajo de asset, no de código de escena.

### 2.9 — Inconsistencia de naming · **CONFIRMADO, menor**

Estado real hoy:

| Lugar | Valor |
|---|---|
| Nombre del repo | `boeing-747` |
| `package.json` → `name` | `boeing-747` |
| `index.html` → `<title>` | `A380 — Recorrido` |
| `content.ts` → `BRAND_NAME` | `MERIDIAN` |
| Copy del sitio | Airbus A380-800 (correcto) |

No hay ninguna referencia a "747" en la copy visible — sólo en el nombre del repo y del paquete. `PLAN.md` §0 ya lo había registrado como desajuste cosmético aceptado. Se cierra formalmente en esta ronda: `MERIDIAN` es la marca de producto, A380-800 la aeronave, y el nombre del repo se documenta como histórico o se renombra — **decisión del usuario**, no unilateral, porque renombrar el repo cambia la URL de GitHub Pages y el `base` de Vite.

---

## 3. Decisión mayor a tomar — dicha con todas las letras

El pedido exige explicitar si el problema de fondo es el pipeline o el modelo, en vez de disimularlo entre fixes menores. La respuesta honesta tiene dos partes.

### 3.1 El pipeline de render NO es el problema

R3F + `postprocessing` + PBR + KTX2/Draco es un stack correcto y bien implementado. El composer, el tiering, el sistema de exposición y el grading por sección están bien construidos. **No hay que rehacer la arquitectura de render.** Los defectos 1, 2, 3a, 3b, 5, 6 y 8 son bugs concretos y acotados, con causa raíz identificada, sobre una base sana.

### 3.2 Los assets SÍ son el problema, y no es un ajuste puntual

Hay tres límites de asset que **ningún ajuste de iluminación o post-proceso puede superar**:

**(a) El interior es un blockout, no un interior.** `interior.glb` es geometría procedural generada por script: cajas para asientos, planos para paredes, sin paredes en la escalera, materiales de color sólido, sin texturas. Nunca fue arte final — `PLAN.md` §11.7 ya lo decía ("las 6 zonas de S5 son el 60% del trabajo total"), y la ronda anterior cerró la Fase 5 sobre esa base de todos modos. **Iluminar bien un blockout da un blockout bien iluminado.** Si S5 tiene que verse profesional, hay que modelar el interior de verdad — y ese es, con diferencia, el ítem más caro de esta ronda.

**(b) El exterior es albedo-only.** Sin normal/roughness/metalness/AO (§1.4, ya documentado en `ASSET_AUDIT.md` y nunca resuelto). Se puede mitigar mucho — generando mapas derivados y autoreando roughness por zona — pero no igualará a un asset con set PBR completo.

**(c) `sunset.hdr` es inutilizable** y hay que regenerarlo (§2.8).

### 3.3 Las tres alternativas, con su costo

| Opción | Qué implica | Costo | Resultado esperable |
|---|---|---|---|
| **A — Corrección sin re-modelado** | Todos los bugs de §2, iluminación redesignada, HDRI regeneradas/normalizadas, mapas PBR derivados para el exterior, vegetación y pista reales. El interior queda blockout, mejor iluminado. | Medio | Exterior (S1–S4, S6–S7) de calidad profesional. **S5 sigue leyéndose como blockout.** |
| **B — A + re-modelado del interior** | Todo lo de A, más modelar de verdad las 3 zonas de v1 (asientos, paneles, techo, escalera con paredes, materiales texturados). | **Alto** — es el ítem más grande de la ronda | Sitio completo al estándar pedido |
| **C — A + recorte de alcance de S5** | Todo lo de A, y S5 se reencuadra: menos tomas amplias del corredor, más planos cerrados y atmosféricos donde el blockout no se delata (DoF fuerte, luz baja, siluetas). | Medio-bajo | Honesto y coherente, pero S5 pierde la ambición de "recorrido por la cabina" |

**Recomendación: B si hay presupuesto de tiempo, C si no.** Lo que **no** hay que hacer es A y presentarla como terminada — eso repetiría exactamente el error de la ronda anterior, porque S5 seguiría viéndose como boceto y el sitio entero se juzgaría por su tramo más débil.

**Esta decisión se toma antes de empezar a implementar**, y queda registrada en `progress2.md` como F0-1.

---

## 4. Plan de corrección

Orden deliberado: primero lo que desbloquea la evaluación visual del resto (exposición y luz), después lo estructural, después el detalle.

### Fase A — Fundaciones visuales (desbloquea juzgar todo lo demás)

**A1. Normalización de las tres HDRI.**
Regenerar `sunset.hdr` con el sol apenas sobre el horizonte. Normalizar las tres a una luminancia media comparable (objetivo: mismo orden de magnitud, ~1–3), aplicando el rango dinámico real vía intensidad de luz y exposición, no vía archivos con 2700× de diferencia entre sí.
*Verificación:* re-medir luminancia media de los tres archivos; assert de que el ratio máximo entre cualquier par es < 4×. Más captura de S1/S3/S6 mostrando cielo legible en las tres.

**A2. Rediseño del esquema de iluminación exterior.**
Pasar de 2 luces a un esquema deliberado por sección: key (sol direccional con temperatura por sección), fill (hemisférica o área, fría en exterior), y rim/back para separar la silueta del fondo. Cada luz con **temperatura de color e intensidad declaradas explícitamente** como constantes nombradas, no números sueltos.
*Verificación:* inventario de luces por sección en el que toda luz tiene nombre, temperatura (K o hex) e intensidad documentadas; cero luces sin justificar. Captura de S1/S2/S3 con la silueta del avión separándose del fondo sin quemarse.

**A3. Recalibración de exposición y niebla.**
Recalibrar `exposureMultiplier` contra las HDRI ya normalizadas. Bajar la densidad de niebla o pasar a niebla lineal con rango explícito, para que hangares y torre se lean como siluetas y no como manchas.
*Verificación:* captura de S1 sin zonas quemadas (assert de que < 2% de píxeles están en 255 saturado) y con la torre de control visible.

**A4. Iluminación interior (defecto 6).**
Reemplazar los 2 spots por una tira de luces de cabina a lo largo del corredor (o luces de área) con cobertura real del tramo recorrido; subir sustancialmente los valores del env map de relleno; recalibrar la exposición de S5 contra el nuevo nivel.
*Verificación:* captura en cockpit / economy / escalera / upper deck donde en cada una se distinguen asientos, pasillo y techo. Assert de luminancia media del frame en un rango objetivo (ni negro ni lavado).

### Fase B — Corrección estructural

**B1. Fuente única de verdad de sección/zona (defecto 1).**
Rediseñar la derivación de zona para que sea imposible por construcción que una zona de S5 esté activa fuera de S5. Eliminar el guard defensivo de `InteriorOverlay.tsx` una vez que la API deje de mentir. Alinear `Hotspots.tsx` al mismo mecanismo.
*Verificación:* barrido de 101 puntos de scroll (0–100% en pasos de 1%); en cada uno, assert de consistencia entre `activeIndex` y el conjunto de paneles activos. Cero excepciones.

**B2. Continuidad de cámara (defecto 2).**
Reemplazar el remapeo piecewise por una travesía única y monótona de la curva, con las mesetas de dwell expresadas como reparametrización de velocidad.
*Verificación:* muestreo de `sampleCamera` cada 0.001 en [0,1]; assert de que ninguna muestra consecutiva dista más de un umbral fijo. Los 6 límites deben pasar (hoy fallan 3).

**B3. Marco del umbral fuera de encuadre (defecto 3b).**
Ligar la visibilidad del marco a la relación cámara↔portal, no sólo a la ventana de scroll.
*Verificación:* capturas en 0.86 / 0.88 / 0.92 sin ningún elemento del marco visible; y captura durante el cruce (≈0.83) con el marco sí presente — no vale arreglarlo apagándolo siempre.

**B4. Orientación de las marcas de pista (defectos 3a + 5).**
Acostar las marcas sobre el plano del suelo.
*Verificación:* captura cenital de depuración mostrando eje y bordes de pista sobre el asfalto, más captura de S1 sin ninguna línea vertical en el frame.

### Fase C — Materiales y entorno

**C1. Set PBR del exterior (defecto 4).**
Derivar/autorear roughness y normal para el fuselaje; diferenciar vidrio, metal y pintura. Evaluar AO horneada.
*Verificación:* comparativa antes/después en el mismo encuadre de S1, con reflejos y micro-detalle visibles en el fuselaje; assert de que el material ya no tiene roughness uniforme.

**C2. Entorno del hero (defecto 5).**
Vegetación (césped instanciado / bandas de textura, dentro del presupuesto de draw calls ya definido), acercar o reencuadrar la torre de control, y ajustar la escala de la pista para que se lea como aeropuerto.
*Verificación:* captura de S1 donde se identifican, sin ambigüedad: pista con marcas, vegetación, hangares y torre. Draw calls dentro del presupuesto de la ronda anterior.

**C3. Escena de salida (defecto 8).**
Con `sunset.hdr` ya corregida en A1, reencuadrar S6 como la vista cinematográfica pedida: cielo visible, nubes, aeronave iluminada.
*Verificación:* captura a 88% con cielo de atardecer legible, avión iluminado y separado del fondo, y **cero elementos geométricos no identificables** en el frame.

### Fase D — Spikes (investigación antes de fix)

**D1.** Línea roja en S6 (2.3c) — aislar por ocultamiento selectivo.
**D2.** Geometría del tren (2.3d) — inspección cercana aislada; decidir entre corregir, reemplazar o reencuadrar.
**D3.** Transición de escalera (2.7) — grabación cuadro a cuadro 70–85%; separar contribución de cámara, geometría y ritmo.

Cada spike produce **un hallazgo escrito antes de cualquier propuesta de fix**. Si un spike concluye que no hay bug (p. ej. el tren simplemente es low-poly), eso se registra como hallazgo válido y pasa a ser una decisión de alcance, no un fix.

### Fase E — Overlays y naming

**E1. Disposición y jerarquía de overlays.**
Revisar legibilidad sobre los fondos ya recalibrados, jerarquía tipográfica, y timing de entrada/salida. Mantener la regla del tercio central reservado. Reevaluar el contraste de S3 con la exposición nueva (la ronda anterior lo dejó documentado como límite físico bajo la exposición vieja — con A3 puede dejar de serlo).
*Verificación:* captura por sección con el texto legible y sin competir con la aeronave; medición de contraste en S1/S3.

**E2. Naming (defecto 9).**
Unificar `package.json`, `<title>`, metadata y documentación. El renombre del repo queda a decisión del usuario por su impacto en la URL de Pages y en `base`.
*Verificación:* grep sin resultados de "747" fuera del nombre del repo y de notas históricas explícitas.

---

## 5. Checklist de aceptación visual

Criterios objetivos, verificables mirando la pantalla o con una medición concreta. Ninguno se marca sin evidencia.

**Transversales (todas las secciones):**
- [ ] Cero texto de una sección visible mientras otra está activa, en los 101 puntos de scroll muestreados
- [ ] Cero elementos geométricos no identificables en el frame — todo lo visible es reconocible como parte de la escena
- [ ] Cero discontinuidades de cámara: ninguna muestra consecutiva (paso 0.001) supera el umbral de distancia
- [ ] Toda luz de escena tiene nombre, temperatura de color e intensidad explícitamente declaradas
- [ ] FPS y draw calls dentro del presupuesto de `PLAN.md` §7.1 tras todos los cambios
- [ ] Ratio de luminancia media entre cualquier par de HDRI < 4×

**Por sección:**
- [ ] **S1** — pista con marcas horizontales legibles; vegetación presente; torre de control identificable; golden hour sin zonas quemadas (< 2% de píxeles saturados); cero líneas verticales
- [ ] **S2** — sombra proyectada visible desplazándose; tren retrayéndose de forma reconocible; sin corte perceptible al entrar desde S1
- [ ] **S3** — cielo de altitud sin quemarse a blanco; nubes legibles; overlay con contraste medido y suficiente
- [ ] **S4** — el cruce se lee como atravesar un umbral; marco visible durante el cruce; sin salto perceptible al entrar desde S3
- [ ] **S5** — en cada una de las 4 zonas se distinguen asientos, pasillo y techo; la escalera se recorre sin hueco visible al fondo plano; transición de escalera fluida
- [ ] **S6** — cielo de atardecer legible con nubes; aeronave iluminada y separada del fondo; cero restos del marco del umbral
- [ ] **S7** — cierre en negro coherente con S0; atribución CC BY visible

---

## 6. Contrato anti-cosmético

Reforzado respecto de la ronda anterior, donde marcar fases como completas sin respaldo visual fue precisamente lo que falló.

1. **Nada se marca en `progress2.md` sin evidencia adjunta.** Captura a un % de scroll específico, medición numérica, o assert automatizado. No existe "debería estar arreglado".
2. **Cada ítem declara su verificación antes de implementarse** — ya está declarada arriba, ítem por ítem.
3. **Un ítem marcado debe ser verificable por el usuario mirando la pantalla**, sin leer código ni confiar en la palabra del implementador.
4. **Los spikes producen hallazgo escrito antes de cualquier fix.** Prohibido proponer solución sin causa confirmada.
5. **"Sin errores de consola" no es criterio de aceptación de nada visual.** Es condición necesaria, nunca suficiente. Ese fue el error de método de la ronda anterior y no se repite.
6. **Si un fix no alcanza el criterio, el ítem queda sin marcar y se registra por qué**, en vez de rebajar el criterio para poder marcarlo.
