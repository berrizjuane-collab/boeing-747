# PLAN 3 — Fidelidad de Entorno y Dirección de Arte

> **Estado de los documentos previos.** `PLAN.md` / `PROGRESS.md` (ronda 1) y `plan2.md` / `progress2.md` (ronda 2) quedan **cerrados**: sus ítems fueron completados y así están marcados. Este documento, `plan3.md`, es el **documento activo** de aquí en adelante, junto con su checklist espejo `progress3.md`. No se vuelve a marcar nada en `PROGRESS.md` ni en `progress2.md`.
>
> **Sesión de planificación.** Ni una línea de este documento es código de implementación. Los únicos entregables de la sesión que lo produjo son `plan3.md` y `progress3.md` (más el movimiento de punteros en `README.md` y `plan2.md`).

---

## 0. Por qué existe esta ronda

La ronda 2 hizo exactamente lo que se propuso: encontró seis causas raíz con evidencia numérica dura y las corrigió. La cámara dejó de teletransportarse, el estado de sección dejó de mentir, las tres HDRI dejaron de diferir en 2718×, el interior dejó de ser un blockout de cajas, el exterior recuperó su librea y sus mapas de superficie. Todo eso es verificable y sigue siendo cierto. El salto respecto de la ronda 1 fue real.

**Lo que queda por debajo del brief ya no es corrección de defectos: es fidelidad de entorno y dirección de arte.** El avión está bien resuelto. El mundo alrededor del avión no. Concretamente, y en las palabras con las que se reportó:

> *"faltan detalles de renderizado y buenas visualizaciones: los árboles (son puntas en el suelo), la grama (genérica verde), los edificios del aeropuerto, la naturaleza de fondo, el sunset, la pista vista desde arriba (en las secciones más avanzadas), entre otras cosas."*

Cada uno de esos puntos se auditó contra el código antes de escribir este plan, y cada uno tiene una causa concreta identificada — no son impresiones. La §1 las documenta con archivo y línea. Algunas son más baratas de lo que parecen (el pasto se ve negro por una normal mal orientada y por la ausencia de una luz ambiental, no por falta de arte). Otras son estructurales (el mundo terrestre se apaga de golpe a 30.5 % de scroll, y por eso la pista no se ve desde arriba en ninguna sección avanzada).

**La vara de aceptación no cambia respecto de la ronda 2, y es la correcta:** el criterio de cada ítem es una afirmación sobre la imagen renderizada, no sobre el estado del código. Se mantiene íntegro el contrato anti-cosmético (§7).

---

## 1. Auditoría del estado actual

Auditoría ejecutada leyendo el árbol completo en `2ac3573`, corriendo el sitio en un navegador real y midiendo `window.__MERIDIAN_PERF__` en siete puntos de scroll. Lo que sigue es lo que el código **hace hoy**.

### 1.1 Vegetación — no hay árboles, y el pasto se ve negro por una razón concreta

**No existe ningún árbol en el proyecto.** No hay `coneGeometry`, ni componente de árbol, ni asset de vegetación. Lo que se lee como "puntas en el suelo" es `VegetationBands` (`src/components/RunwayEnvironment.tsx:138-211`): 720 instancias de una geometría de **3 triángulos verticales cruzados** a 0°, 60° y 120°, con base 0.48 y ápice en `y=1` — es decir, literalmente una púa.

Se ven casi negras por **cinco** factores multiplicativos, todos verificables:

1. **Las normales son horizontales.** `computeVertexNormals()` sobre un triángulo *vertical* produce una normal perpendicular a su plano, con `N.y == 0`. La key light está en `[80, 100, 40]`, dirección normalizada ≈ `(0.59, 0.74, 0.29)`: el 74 % de la energía viene de arriba, y las matas no tienen ninguna componente hacia arriba con la que capturarla. Se iluminan como paredes, no como pasto.
2. **La rotación Y aleatoria por instancia** (`dummy.rotation.set(0, random()*2π, 0)`) hace que `N·L` varíe entre ~0 y ~0.66 según la instancia — de ahí el moteado, y de ahí que buena parte quede en casi cero.
3. **No hay `ambientLight` ni `hemisphereLight` en el exterior.** El rig son tres direccionales y nada más (§1.6). Cualquier superficie que no mire hacia `[80,100,40]` cae a casi negro. Esto no afecta sólo al pasto: es la misma causa por la que las paredes de los hangares se ven como bloques negros (§1.4).
4. **El único piso de luminancia es un `emissive`** `#314431 × 0.42`, un verde muy oscuro. Y `vertexColors` no multiplica el `emissive` en three.js, así que la variación de color por instancia (`#52664c`→`#96a269`) sólo afecta al difuso, que casi no recibe luz.
5. `receiveShadow` está puesto pero es no-op: ninguna luz exterior castea sombras.

Además: distribución uniforme en `|x| ∈ [18, 90]`, `z ∈ [-255, 255]`, **sin clustering ni ruido de densidad**, sin variación de especie, sin viento, sin LOD por distancia. `VEGETATION_COUNT = { high: 720, mid: 360, low: 144 }`, pero en `low` el mesh se oculta entero (`visible={tier !== 'low'}`), así que el `144` es valor muerto.

### 1.2 Terreno y grama — un solo quad de 4000×4000, color plano

Hay dos superficies de suelo, ninguna con textura:

- **`Environment · Ground`** (`src/components/EnvironmentPlaceholder.tsx:226-235`): `planeGeometry(4000, 4000)` — **un único quad, dos triángulos**, sin subdivisión. `meshStandardMaterial roughness={1}` con color plano actualizado por frame desde el tema de sección (S1 `#59664d`, S2 `#526154`, S3 `#46545d`…). Sin mapa de color, ni normal, ni roughness, ni AO, ni detail tiling, ni variación de ningún tipo.
- **Apron** (`RunwayEnvironment.tsx:283-288`): `planeGeometry(162, 112)` gris plano `#454b4c`.

El borde del plano de 4000×4000 se lee como un **corte recto en el horizonte**. No hay relieve, no hay línea de árboles, no hay nada más allá. El "horizonte" es fog + domo de cielo.

### 1.3 Pista — geometría correcta, superficie sin desgaste

El asfalto es **una caja** `boxGeometry(32, 0.13, 520)` con color plano `#394043` (`RunwayEnvironment.tsx:45-68`). Las marcas viven en `src/lib/runwayGeometry.ts` y están bien resueltas técnicamente: 59 quads construidos directamente en XZ y fusionados en **una sola geometría / un draw call**, con `RUNWAY_SURFACE_Y = 0.025` y `polygonOffset` contra z-fighting. Incluyen centerline (27 dashes), bordes, umbrales (11 barras por cabecera) y puntos de toma.

**Lo que falta:** `PLAN.md §135` pedía explícitamente *"asfalto con marcas de pista **y desgaste**"* y el desgaste nunca se hizo. No hay manchas de goma en la zona de toma, ni variación de tono del asfalto, ni marcas envejecidas, ni **numeración de cabecera** (no existe un "27L"/"09R"), ni calles de rodaje, ni luces de borde, ni PAPI, ni señalética. Color único `#e9e5d8` uniforme en todas las marcas.

### 1.4 Edificios — cajas y cilindros de 10 lados

- **Hangares** (`RunwayEnvironment.tsx:215-292`): exactamente **3**, todos al oeste (x negativa), nada del lado +x. Paredes = `InstancedMesh` de 3 instancias de `boxGeometry(1,1,1)` escaladas. **Cajas lisas: sin puertas, sin ventanas, sin bandas, sin estructura, sin logos.** Techos = prisma triangular hecho a mano de 8 triángulos, instanciado.
- **Torre de control** (`RunwayEnvironment.tsx:303-328`): grupo de **5 meshes separados = 5 draw calls, no instanciados** (shaft, cab, banda de ventanas, techo, beacon). Todos los cilindros con **10 segmentos radiales** → silueta claramente facetada. El beacon es una esfera estática que no parpadea.
- Todo el grupo se oculta entero en tier `low`.

Las paredes se ven negras por la misma causa que el pasto: ausencia de luz ambiental/hemisférica (§1.1, punto 3). Es el defecto que produce los bloques oscuros bajo el avión en las capturas de S2/S3.

### 1.5 Cielo, nubes y atardecer

**Domo de cielo**: dos esferas `sphereGeometry(1200, **32, 32**)` con `BackSide`. Para una textura equirectangular de 2048×1024, 32×32 segmentos es muy poco — los UVs se interpolan linealmente sobre triángulos enormes, con distorsión visible del gradiente y facetado en el sol. `RGBELoader` deja `minFilter = LinearFilter` **sin mipmaps** → shimmering al mover cámara.

**Nubes** (`RunwayEnvironment.tsx:379-514`): 6 billboards por capa, `InstancedMesh` de `planeGeometry(1,1)` = 1 draw call por capa. El shader dibuja **4 elipses con smoothstep** y una modulación senoidal de ±8 % como única "textura". Color plano, `opacity 0.3`, **sin recibir luz alguna**, sin volumen, sin gradiente vertical, sin borde iluminado. Y sólo existen en dos ventanas: `0.24–0.49` (S3) y `0.805–1.0` (S6/S7). **En S1 y S2 el cielo está completamente vacío.**

**El atardecer de S6** usa una HDRI real (`public/hdri/sunset.hdr`, 2048×1024, Nishita con sol a 2.5° de elevación), pero llega a pantalla degradado por cinco causas acumuladas:

1. El tone mapping efectivo es **AgX, no ACES** (bug #1 de §2) — AgX está diseñada para desaturar agresivamente los highlights saturados, que es exactamente de lo que está hecho un atardecer.
2. **Subexposición estructural**: `exposureMultiplier × exposureCompensation` da **0.651 al inicio de S6, 0.757 a mitad y 0.820 al final**. Todo S6 corre por debajo de exposición 1.0, y nunca llega a neutro.
3. **El fog va hacia negro, no hacia el atardecer**: `#27344e → #080a0e` con densidad subiendo `0.00125 → 0.0018`. Un atardecer real tiene *aerial perspective cálida* creciente con la distancia; acá pasa lo contrario.
4. **No hay disco solar ni glare ni god rays en S6.** `SunMesh` está en `[0, 56, 188]`, posición elegida a mano para los dos keyframes de S4, y `GodRays` sólo monta con `activeIndex === 3`.
5. **La key light no está alineada con el sol de la HDRI.** Las posiciones de las tres luces son estáticas en toda la página; `sunset.hdr` tiene el sol a `sun_rotation = 250°`, y la key sigue viniendo de `[80,100,40]` igual que en S1. Contradicción física directa entre el rim y el cielo.

### 1.6 Iluminación, grading y post-proceso

**Rig exterior**: exactamente 3 `directionalLight` (key/fill/rim), **ninguna castea sombra** (`castsShadow: false` en las tres). El reemplazo es una proyección analítica de una draw call (3 elipses en un quad, `opacity` tope 0.26) — decisión correcta y bien documentada: el A380 son 100+ mallas y el pase de sombra rompía el presupuesto. **No hay `ambientLight` ni `hemisphereLight`.** El `temperatureKelvin` de cada luz es metadata documental: nunca se convierte a color.

**Post-proceso** (`src/components/PostFX.tsx`), tier `high`:
`ExposurePass → Bloom(0.8/0.25/0.6) → [DoF sólo S5] → [GodRays sólo S4] → SectionGrade → Vignette(0.15/0.6) → Noise(0.035) → ToneMapping`.
**No hay AO, ni SSR, ni SMAA/FXAA, ni LUT, ni aberración cromática.** `multisampling={0}` y `gl={{antialias:true}}` es inefectivo bajo el composer: **el sitio no tiene antialiasing de ningún tipo**, y una silueta blanca contra el cielo es el peor caso posible para eso.

**El grading no llega.** `SectionGradeEffect` es un split-tone aditivo de seis líneas que corre **antes** del tone mapping, sobre un buffer HDR (`HalfFloatType`), con umbrales calibrados para LDR (`smoothstep(0.45, 1.0, lum)`). Cualquier píxel con `lum > 1` — cielo, sol, highlights del fuselaje — satura el peso y recibe un offset aditivo constante que sobre una luminancia de 8.0 es invisible. En la práctica **el grading sólo se ve en las sombras profundas**. Su uniform `strength` está congelado en `0.5` y nunca se actualiza.

### 1.7 El overlay de S3 no tiene tarjeta de fondo — y es la aserción que va a romperse primero

`src/index.css:197-206` da tarjeta oscura (`rgba(5,8,13,0.82)` + `backdrop-filter`) sólo a `--hero`, `--exit` y `--interior-zone`. **No existe ninguna regla `.overlay__panel--climb` ni `--takeoff`**, pese a que el comentario de las líneas 193-196 afirma que *"Data-heavy S2/S3 already use their own darker cards"*. Ese comentario describe una regla que no está en la hoja de estilos.

El panel de S3 se apoya sólo en `text-shadow` sobre el 3D. Y `scripts/visual-qa.mjs:408-413` exige `panelContrastEstimate >= 4.5` medido con p97/p50 **de los píxeles dentro del panel**. Hoy el fondo de esos píxeles es cielo; en cuanto la Fase E ponga terreno debajo, será terreno. **Esta es la aserción de CI que va a romperse primero**, y es reparable de forma estructural con tres líneas de CSS antes de tocar nada del entorno. Registrado como bug #12 (§2).

### 1.8 El hallazgo estructural — el mundo terrestre se apaga a 30.5 %

Es la causa exacta de *"la pista vista desde arriba (en las secciones más avanzadas)"*, y es un corte duro, no un problema de encuadre:

- `RunwayEnvironment.tsx:520` — `HeroAirportEnvironment`, que contiene pista, sombra de contacto, vegetación, hangares, torre y polvo, hace `groupRef.current.visible = progress < 0.305`.
- `EnvironmentPlaceholder.tsx:126-131` — el plano de suelo se desvanece entre `0.28` y `0.305` y luego `visible = false`.

**Entre 30.5 % y 100 % lo único que hay bajo el horizonte es el hemisferio inferior del domo de cielo y el fog.** Todo S3 tardío, S4, S5, S6 y S7 vuelan sobre la nada.

Y la cámara **sí mira hacia abajo** en esas secciones — medido ejecutando `sampleCamera`:

| Sección | scroll | cámara Y | pitch de mirada | FOV |
|---|---|---|---|---|
| S3 ascenso | 28–42 % | 70 → 60 | −19° → −8° | 42 → 38 |
| S6 salida | 82–95 % | 41 → 90 | −4° → −11° | 45 → 35 |
| S7 footer | 95–100 % | 90 → 92 | −11° | 35 |

En S3, a `y=70` con pitch −19° y FOV 42 (mitad 21°), el borde inferior del frame apunta a −40° e intersecta `y=0` a ~203 unidades por delante: **habría pista visible si el grupo no estuviera oculto.**

Dato relacionado que conviene tener presente: **el avión nunca sube de `y=40`** (`FLYING_POSE = [0, 40, -80]`, fijo desde 28 % hasta el final). Todo el "ascenso" narrativo es movimiento de cámara + cambio de HDRI/fog/nubes, no altitud real. Eso no es un defecto —es una decisión de escenografía que funciona— pero significa que el terreno lejano no necesita simular altitud de crucero, sólo sostener un suelo creíble a media distancia.

**Por qué probablemente existe el corte.** Proyectando las cuatro esquinas del frustum sobre `y=0` en cada punto de S3/S6/S7, la unión de huellas de suelo es `x ∈ [−2.102, 2.083]`, `z ∈ [−1.934, 2.013]` — y el plano actual mide exactamente ±2.000. **Entre 32 % y 34 % el horizonte cae fuera de cuadro** (ángulo superior −1,4° / −0,6°): el frame es 100 % suelo hasta 2.868 y 6.956 unidades. Con `fogDensity ≈ 0,0005`, la transmitancia a 2.000 es `exp(−1,0) = 0,37`, así que **el borde recto del plano sería visible al 37 %**. El corte no fue arbitrario: tapa un artefacto real. Cualquier solución de la Fase E tiene que resolver ese borde, no sólo levantar la puerta.

**La pista existente ya tiene resolución de sobra.** A 36 % el suelo se muestrea a **5,3 px/unidad**: la pista de 32 u mide 170 px y las barras de umbral de 1,44×8 u miden 7,6×42 px. A 100 %, 3,0 px/u → pista de 97 px. **No hace falta un asset de pista nuevo para verla desde arriba** — hace falta dejar de ocultarla.

### 1.9 El presupuesto está tenso sólo en el hero

Medición propia sobre el sitio corriendo, leyendo `window.__MERIDIAN_PERF__`:

| scroll | 0.00 | 0.16 | 0.22 | 0.26 | 0.30 | 0.84 | 0.90 |
|---|---|---|---|---|---|---|---|
| **draw calls** | 148 | 148 | 148 | **34** | **34** | **21** | **20** |
| triángulos | 71.080 | 71.080 | 71.080 | 45.140 | 45.140 | 44.104 | 43.624 |

**De S3 en adelante el sitio corre con 20–34 draw calls contra un techo de 250.** El presupuesto sólo está tenso en dos lugares: el hero de High (148/250) y **el hero de Mobile Low, que mide 99 contra un techo de `<100`** — a un solo draw call de romper el CI.

**Y de dónde salen esos 99 está medido**, cargando `public/models/exterior.glb` y corriendo el test de frustum de three.js con la cámara real de S1:

| viewport | casco `A380` | `LandingGear_Part_*` visibles | total exterior | no-exterior |
|---|---|---|---|---|
| 390×844 (Mobile Low) | 1 | **92** | 93 | **6** |
| 1440×900 (Desktop High) | 1 | **115** | 116 | **32** |

**El 94 % del presupuesto de Mobile Low se lo come el tren de aterrizaje**, que son 115 mallas hermanas bajo un único nodo `LandingGear` con **un solo material compartido**. Todo el entorno del hero —suelo, asfalto, marcas, sombra, domo— cabe en 6 draw calls.

Además, el tren se oculta en **24,5 % de scroll** (`GEAR_RETRACT_END = 0.78` es progreso *local* de S2, o sea global `0.12 + 0.78·0.16`), y a partir de ahí el exterior pasa de 93 a 1 draw call. **El techo de 99/100 es un problema exclusivo de S1/S2**; en S3–S7 el tier low corre a ~5 draw calls.

Esto cambia por completo el cálculo de riesgo: **agregar terreno lejano en S3/S6/S7 es prácticamente gratis**, y la recuperación de presupuesto del hero tiene una palanca única del orden de magnitud correcto (§3.1).

---

## 2. Bugs reales encontrados durante la auditoría

Ninguno fue reportado por el usuario; todos salieron de leer el código y medir. Se corrigen en esta ronda porque varios gobiernan directamente la calidad de imagen que la ronda busca.

| # | Sev. | Bug | Criterio de cierre |
|---|---|---|---|
| **1** | **Alta** | **El tone mapping es AgX, no ACES.** `<ToneMapping />` se monta sin prop `mode` (`PostFX.tsx:45,59,107`). El wrapper de R3F es `wrapEffect(ToneMappingEffect)` sin defaults propios, y el constructor de `postprocessing` usa `mode = ToneMappingMode.AGX`. Los comentarios del código (`PostFX.tsx:14-19`), `SceneCanvas.tsx:69` y `PLAN.md §7.4` afirman ACES. AgX desatura agresivamente los highlights saturados — es causa directa de "el grading se siente plano" y de buena parte de "el atardecer se ve pobre". | La curva aplicada es la declarada, verificado por lectura del uniform/modo efectivo en runtime, y comparativa antes/después en el mismo encuadre de S6. |
| **2** | **Alta** | **`scene.environment` queda en `null` desde S7.** `activeHdriSectionSlot` devuelve `'sunset'` para `sectionIndex >= 5`, así que drei `<Environment>` no re-monta en el boundary 0.95; pero `InteriorLighting` sí se desmonta ahí y su cleanup restaura el valor que capturó en S4 (`null`). La IBL PBR muere de 0.95 en adelante. | `scene.environment` no es `null` en ningún punto de `[0,1]`, verificado por barrido, y sin pop de iluminación en el boundary. |
| **3** | **Alta** | **La calibración de HDRI por media aritmética está dominada por el disco solar** (luminancia ~142.000–202.000). Las medianas reales son **0,2337 / 0,0705 / 0,1157**: el cuerpo de cielo de `high-altitude` es **3,3× más oscuro** que el de `golden-hour`, y su p95 es 4,3× más bajo — mientras `PLAN.md §10.1` declara S3 como *"máxima luminancia del sitio"*. `qa:hdri` no lo detecta porque sólo asserta el ratio de **medias** (1,922× ✅). | La métrica de calibración pasa a mediana (o media excluyendo el disco solar), `qa:hdri` asserta también un ratio de medianas, y S3 deja de ser la más oscura de las tres. |
| **4** | Media | **El grading corre pre-tone-mapping con umbrales LDR sobre un buffer HDR.** Ver §1.6. El grading sólo es perceptible en sombras profundas. | El key de grading de una sección es medible en los highlights de esa sección, no sólo en sus sombras. |
| **5** | Media | **`SectionGradeEffect.strength` está congelado en `0.5`** y nunca se actualiza — uniform muerto cableado al shader. | O bien se modula de verdad por sección, o bien se elimina y se documenta por qué. |
| **6** | Media | **No hay antialiasing de ningún tipo.** `multisampling={0}`, sin SMAA/FXAA, y `gl={{antialias:true}}` inefectivo bajo el composer. | Bordes de la silueta del A380 contra el cielo sin escalera visible, en comparativa antes/después al mismo encuadre y resolución. |
| **7** | Baja | `castShadow`/`receiveShadow` marcados en las 115+ mallas del exterior son **código muerto**: ninguna luz exterior tiene `castShadow`. | Se elimina, o se documenta explícitamente por qué se conserva. |
| **8** | Baja | `gl.toneMapping` / `gl.toneMappingExposure` en `SceneCanvas.tsx:69-70` son **no-ops** (el composer fuerza `NoToneMapping`). Engañan al lector — de hecho son la razón por la que el proyecto creía tener ACES. | Se eliminan o se anotan como no-op con su porqué. |
| **9** | Baja | `skyDomeMaterial.ts` no incluye `<tonemapping_fragment>` / `<colorspace_fragment>`, a diferencia de los otros dos shaders custom del repo, que sí. Hoy inofensivo, frágil si se desmonta el composer. | Consistente con los otros shaders custom, o documentado por qué difiere. |
| **10** | Baja | `qualityStore.ts:22` referencia `SHADOW_SECTION_END`, constante que ya no existe. | Doc corregida. |
| **11** | Baja | `VEGETATION_COUNT.low = 144` es valor muerto: el mesh se oculta entero en `low`. | Coherente con lo que el tier realmente hace. |
| **12** | **Alta** | **El panel de S3 no tiene tarjeta de fondo.** `index.css:197-206` da tarjeta sólo a `--hero`, `--exit` y `--interior-zone`; no existe `.overlay__panel--climb` pese al comentario de las líneas 193-196 que afirma que S2/S3 *"already use their own darker cards"*. La aserción `panelContrastEstimate >= 4.5` de `visual-qa.mjs:408-413` mide p97/p50 dentro del panel, cuyo fondo pasa de cielo a terreno en cuanto entre la Fase E. **Es la aserción de CI que se rompe primero.** | `.overlay__panel--climb` con el mismo tratamiento de tarjeta que las otras tres, de modo que el contraste sea **estructuralmente independiente** del fondo 3D. Se corrige **antes** de tocar el entorno, no después. |
| **13** | Baja | **`loadingWeights.ts` declara pesos de HDRI obsoletos** pese a afirmar *"Sizes are measured, not estimated"*: golden-hour +9,2 %, **high-altitude +43,0 %**, sunset +3,2 % respecto del disco. Se renormalizaron las HDRI y no se actualizaron los pesos. Payload S0 real: **5,20 MB** de 15. | Pesos medidos de nuevo contra el disco, y revalidados tras la Fase B4 (que cambia los tres archivos). |

---

## 3. Decisiones tomadas

Confirmadas por el usuario antes de escribir las fases.

### 3.1 Mobile Low — recuperar presupuesto, no rebajar el techo

Mobile Low mide **99 draw calls contra un techo de `<100`**. La decisión es **recuperar presupuesto antes de agregar nada**, y que Mobile Low suba de calidad igual que los demás tiers. **No se sube el techo.**

Subir el límite sería rebajar un criterio para poder cumplirlo, que es exactamente lo que el contrato anti-cosmético prohíbe (§7.6). Pero hay una razón más fuerte: **el presupuesto de draw calls es el único artefacto del repo que codifica "esto tiene que correr en un teléfono flojo".** `progress2.md` es explícito en que la matriz de FPS en hardware físico es lo único que quedó sin verificar, porque SwiftShader no da evidencia de rendimiento. Subir el techo convertiría la única garantía medida en una afirmación.

**Corrección importante sobre de dónde recuperar.** La intuición inicial —consolidar la torre de control, que usa 5 meshes sueltos— **no sirve para este problema**: `RunwayEnvironment.tsx:282` ya oculta todo el grupo `Airport · Terminal silhouettes` en tier `low`, así que hoy la torre aporta **0 draw calls en low**. Fusionarla recupera 4 en *high* y permite *mostrarla* en low por 1 — es una ganancia visual, no presupuestaria.

**La fuente real es fusionar las 115 mallas de `LandingGear`** (§1.9). Los 115 primitivos comparten atributos idénticos y un único material, así que son fusionables sin pérdida. Recupera **92 draw calls en Mobile Low y 114 en Desktop High**, y es lo que habilita toda la ronda:

| estado del hero móvil (scroll 0,01) | casco | tren | entorno + composer | total |
|---|---|---|---|---|
| hoy | 1 | 92 | 6 | **99** / 100 |
| tras fusionar el tren | 1 | 1 | 6 | **8** |
| + torre fusionada, ahora visible en low | 1 | 1 | 7 | **9** |
| + vegetación instanciada en low | 1 | 1 | 8 | **10** |
| + bosque | 1 | 1 | 9 | **11** |
| + plano de aeropuerto | 1 | 1 | 10 | **12** |

Margen final: **88 draw calls libres, el 88 % del presupuesto.** El problema no se resuelve por decreto sino por ingeniería, y de paso Mobile Low deja de ser el tier mutilado.

**La fusión va en runtime, no en el pipeline de assets**, y esto es una decisión con motivo: `process-glb.mjs --join-draw-calls` usa `join --keepNamed false`, que colapsaría el casco `A380` junto al tren porque comparten el único material del archivo — rompiendo a la vez el swap de `createDissolveHullMaterial` y la retracción del tren. Peor: re-procesar `exterior.glb` en un entorno sin el CLI `ktx` hace que `process-glb.mjs:169-185` **degrade silenciosamente a JPEG**, perdiendo el KTX2/Basis que el commit `368c62e` arregló específicamente. El merge en runtime con `mergeGeometries` dentro del `useEffect` que ya existe en `ExteriorAsset.tsx:71-97` no toca el binario, no cambia bytes de descarga y no requiere apt.

### 3.2 Pipeline de assets — híbrido Blender + textura procedural en TypeScript

**Geometría** (árboles, edificios, terreno) en Blender, extendiendo el patrón ya probado de `blender/interior_blockout.py`: constantes de contrato arriba, fábrica de materiales que estampa metadata auditable, primitivas reutilizables, `linked_copy()` para que `gltf-transform instance` lo convierta en `EXT_mesh_gpu_instancing`, un script `verify_*.py` que lo asserta, y un `verify-*.mjs` que audita el GLB publicado.

**Texturas** proceduralmente en TypeScript, extendiendo `src/lib/aircraftSurfaceMaps.ts` — que ya tiene su test (`C1`) exigiendo ≥20 niveles distintos y rango de roughness ≥0.2. No hay directorio `public/textures/` y no hace falta crearlo.

**Nota de entorno, no negociable:** el contenedor donde se planificó **no tiene Blender, `ktx` ni `ffmpeg` instalados**. La sesión de implementación tiene que instalarlos como primer paso, y el CI ya sabe hacerlo vía apt. Los scripts de Blender existentes son reproducibles y verificados por checksum, así que esto es fricción, no bloqueo.

#### Evidencia medida que acota cuánto de esto necesita Blender realmente

Se midió el tamaño en pantalla de cada asset propuesto, y el resultado obliga a acotar la decisión en vez de aplicarla en bloque:

- **Árboles**: a 36 % de scroll, un árbol de 12 u a 300 u de distancia mide **51 px de alto**; a 1.000 u, 15 px. Un cross-billboard de 2 quads con copa procedural y alpha-test es indistinguible de un árbol modelado a ese tamaño. 400 instancias = 1 draw call, 1.600 triángulos.
- **Hangares**: a 36 % están a 200–400 u; uno de 14 u de alto a 300 u mide **~60 px**. Alcanza para leer una silueta de techo a dos aguas y bahías de puerta; no alcanza para un marco de puerta ni una pasarela.

Y hay tres criterios donde el camino TypeScript gana de forma clara:

1. **Fuente única de verdad.** El terreno tiene que vivir en el mismo contrato de coordenadas que `runwayGeometry.ts` (`RUNWAY_SURFACE_Y`, rango z ±255) y que la tabla `HANGARS`. Un GLB bifurca eso en una segunda fuente que el CI no puede cruzar; un módulo TS `import`a las constantes.
2. **Verificabilidad.** Geometría y textura en TS se verifican con `node --test` en menos de un segundo usando el patrón `ssrLoadModule` que ya usan los tests existentes. Un asset de Blender exige re-ejecutar Blender más un inspector de GLB: minutos de CI y una dependencia apt.
3. **Peso y riesgo.** TS cuesta 0 bytes; la vía Blender costaría 0,5–2 MB y obliga a pasar por `process-glb.mjs`, que en un entorno sin `ktx` degrada KTX2 a JPEG en silencio.

**Resolución:** se mantiene el híbrido como decisión, pero con el reparto acotado por la medición — **texturas y geometría de bajo relieve (terreno, plano de aeropuerto, bosque, pasto) en TypeScript**, y **Blender reservado como escotilla de escape** para la silueta concreta que el QA visual demuestre que el código procedural no alcanza. Dados los tamaños en píxeles de arriba, esa escotilla probablemente se use poco o nada. Si la implementación encuentra que hangares o torre sí la necesitan, se usa y se documenta el porqué con la captura que lo justifica.

**Costo real de lo procedural, y su mitigación.** Una textura de terreno de 1024² RGBA son 4,2 MB y ~1M de iteraciones de ruido: escalando el perfil de `aircraftSurfaceMaps.ts` (64²) por 256×, hay que esperar **80–200 ms de hitch** en un teléfono medio. Se genera **dentro de la puerta de carga S0**, antes de fijar `loadingState.revealStartSeconds`, donde la pantalla de carga ya está cubriendo ese tiempo — y `loadingWeights.ts` ya tiene el mecanismo para contabilizarla. Recomendado: base 1024² en S0 + tile de detalle 64² con `RepeatWrapping`.

**Trampa conocida a no repetir:** el `ShaderMaterial` del terreno necesita `UniformsUtils.merge([UniformsLib.fog, ...])` antes de declarar `fog: true`, o `WebGLRenderer` desreferencia un `fogDensity` ausente. Está documentado en `RunwayEnvironment.tsx:391-393` y le pasó a este proyecto exactamente en S3/S6.

### 3.3 Alcance del aeropuerto — pulir y poblar lo existente

Hangares y torre reconstruidos con detalle real (puertas, ventanas, estructura), pista con desgaste y numeración de cabecera, luces de borde y PAPI, calles de rodaje, vegetación y terreno creíbles.

**Fuera de alcance explícito:** terminal con mangas, aviones estacionados, vehículos de tierra, señalética de calle. Se descartaron por multiplicar el riesgo de presupuesto y el tiempo de implementación sin ser lo que el usuario señaló como faltante.

---

## 4. Fases

Regla de verificación heredada: **cada ítem declara acá cómo se va a verificar, antes de implementarse.** Nada se marca en `progress3.md` sin la evidencia que esta columna exige.

### Orden de ejecución y contención de regresión

Esto es parte del plan, no una nota al pie.

**Clasificación de cada cambio por su radio de impacto:**

- **Seguros** — aislados, no invalidan evidencia de otras secciones: fusión de `LandingGear` (no cambia *ni un píxel*: misma geometría, mismos vértices, opaca con depth test — y esa propiedad es justamente lo que lo hace el primer paso perfecto, porque *cualquier* diferencia de píxeles es un bug); tarjeta del panel de S3; `airportGroundPlan.ts`; capa de bosque instanciada; fusión de la torre.
- **Semi-sistémicos** — cambian qué hay en cuadro en S3/S6/S7 pero no cómo se ilumina nada: quitar la puerta de 30.5 % y el fade de suelo. Invalida la evidencia de `03-spec-sheet`, `06a–d`, `07`, `09-mobile` y `11-mobile`; **no** invalida `01`, `02`, `04`, `05a–d`. Reversible en una línea.
- **Sistémicos** — invalidan la evidencia visual de **todas** las secciones: cualquier cosa que toque `SECTION_ENVIRONMENT`, `thresholdLighting.ts`, `ExposurePass`, `SectionGrade` o los pesos de HDRI, porque la exposición es una multiplicación global en un pase de post. Hay **dos aserciones duras de luminancia** en juego (`clippedWhitePct < 2 %` en el hero y `panelContrastEstimate >= 4.5` en S3) más el criterio cola–cielo de la ronda 2.

**Secuencia:**

| Paso | Qué | Por qué en ese lugar |
|---|---|---|
| **0** | Instrumentar: agregar sondas móviles a `visual-qa.mjs` en **0,13 · 0,24 · 0,30** | Hoy low sólo se muestrea en 0,01/0,36/0,60/0,91 y **el pico real de S1/S2 no está medido**. Sin esto ningún paso posterior es falsable. Único cambio al arnés |
| **1** | Fusión de `LandingGear` | Habilita todo el presupuesto de la ronda. Puerta: `01-hero.png` y `08-mobile-hero.png` **idénticos píxel a píxel** a los artefactos de la ronda 2 |
| **1b** | Tarjeta del panel de S3 (bug #12) | **Desactiva la bomba antes de encenderla.** Sin esto, cada iteración de terreno es una tirada de dados contra la aserción de contraste |
| **2** | Fase A completa (base de imagen) + recaptura de línea base | Sistémica. Todo lo posterior se compara contra la línea base nueva |
| **3** | Fase B (luz y atmósfera) + recaptura | Sistémica |
| **4** | Fase E pasos 2 y 3 — **sólo geometría, sin materiales nuevos** | Semi-sistémico. Puerta: `qa:d3` sobre 0,26–0,44 y 0,80–1,00 en high y low; re-verificar el criterio cola–cielo a 0,88, porque el terreno ahora ocupa área de cuadro que antes era cielo |
| **5** | Fase E paso 1 — material y textura de terreno | El paso de mayor riesgo, y por eso va **después** de que el terreno ya esté en cuadro: si el material llega primero, ante un fallo de luminancia no se puede distinguir "ahora hay suelo" de "el suelo es de otro color" |
| **6** | Fases C, D y F | Aisladas por sistema, verificables de a una |
| **7** | Re-basar toda la evidencia en una sola pasada | Hacerlo antes desperdicia ~47 min de SwiftShader por corrida |

**Dos reglas duras de secuenciación:**
1. **Nunca el material de terreno antes de la geometría de terreno** (paso 5 después del 4), por la razón de arriba.
2. **Nunca combinar un cambio sistémico con uno seguro en el mismo commit.** El historial del repo muestra batching (`6634708 feat: complete visual correction round`) y `progress2.md` registra que un error ahí costó un ciclo entero de re-verificación.

**Tentación explícita a resistir:** bajar `fogDensity` de S7 (0,0018) para que la pista se vea mejor en el outro. A 471 u la transmitancia es 0,49 — la pista se ve a media niebla, y eso puede estar bien. Es un cambio sistémico; si se quiere, va al final y solo.

---

### Fase 0 · Instrumentación y presupuesto — antes de cambiar nada visual

| # | Ítem | Verificación requerida |
|---|---|---|
| 01 | Sondas móviles nuevas en `visual-qa.mjs` a **0,13 · 0,24 · 0,30** (ventana de tren desplegado + primer frame con terreno) | El reporte incluye las tres capturas nuevas con su `performance`, y el pico real de draw calls de S1/S2 en Mobile Low queda medido y registrado |
| 02 | **Fusión de las 115 mallas de `LandingGear` en runtime** (§3.1) | Mobile Low hero de **99 → ≤10** y Desktop High hero de **148 → ≤36**, medidos. Y `01-hero.png` / `08-mobile-hero.png` **idénticos píxel a píxel** a los artefactos de la ronda 2 — cualquier diferencia es un bug, no una mejora |
| 03 | Tarjeta de fondo para el panel de S3 (bug #12) | `panelContrastEstimate` de `03-spec-sheet` medido **con el fondo 3D deliberadamente alterado**, para probar que el contraste ya no depende de él |
| 04 | Pesos de carga corregidos (bug #13) | Los cuatro pesos coinciden byte a byte con el disco; payload S0 declarado |

### Fase A · Base de imagen — sistémica

| # | Ítem | Verificación requerida |
|---|---|---|
| A1 | Tone mapping: aplicar la curva que el proyecto declara (bug #1). Decidir explícitamente entre ACES Filmic —lo que `PLAN.md §7.4` especifica— o AgX asumido a propósito con saturación compensada aguas arriba; lo que no puede seguir pasando es que el código diga una cosa y haga otra | Lectura en runtime del modo efectivo del `ToneMappingEffect`, más comparativa antes/después en el **mismo** encuadre de S1 y de S6, con medición de saturación y contraste |
| A2 | Grading: mover a espacio display o recalibrar sus umbrales para HDR, y resolver `strength` (bugs #4 y #5) | El key de grading de S6 (`#E89B6C`) es **medible en los highlights** de S6, no sólo en sus sombras. Medición numérica antes/después sobre la misma captura |
| A3 | Antialiasing (bug #6) | Comparativa al mismo encuadre y resolución de la silueta del A380 contra el cielo, con medición de gradiente de borde. Costo en ms declarado, y presupuesto de §7.2 respetado |
| A4 | `scene.environment` nunca nulo (bug #2) | Barrido de los 101 puntos de scroll: `scene.environment !== null` en todos. Captura a 0.94 y 0.96 sin pop de iluminación entre ambas |
| A5 | Limpieza del código muerto y de la documentación que engaña (bugs #7, #8, #9, #10, #11) | `grep` sin resultados de cada símbolo eliminado; los que se conserven, con su porqué escrito en el propio archivo |
| A6 | **Recaptura de línea base completa** tras cerrar A1–A5 | Las 17 capturas de `qa:visual` regeneradas y archivadas como la nueva referencia contra la que se comparan C, D, E y F |

### Fase B · Luz y atmósfera — sistémica

| # | Ítem | Verificación requerida |
|---|---|---|
| B1 | Luz ambiental/hemisférica en el exterior, para que ninguna superficie iluminada lea negro puro (causa raíz compartida de §1.1 y §1.4) | Captura de S2 donde las paredes de los hangares y las matas tienen valor y color legibles. Assert numérico: la luminancia mínima de una superficie iluminada supera un piso declarado. **Sin apagar el contraste** — el ratio de contraste de la escena se mide y se declara antes/después |
| B2 | Acoplar la dirección de key/fill/rim al azimut y elevación reales del sol de la HDRI activa en cada sección | Tabla que declare, por sección, el azimut/elevación de la HDRI y el de la key, y su coincidencia. Captura de S6 donde la luz del avión y el sol del cielo vienen del mismo lado |
| B3 | Recalibrar las HDRI por mediana (o media excluyendo el disco solar) y asertar el nuevo criterio en `qa:hdri` (bug #3) | `qa:hdri` asserta ratio de **medianas** además del de medias. S3 deja de ser la más oscura de las tres en cuerpo de cielo. Números antes/después de las tres |
| B4 | Subir las tres HDRI a 4096×2048 | Regeneradas con `generate_hdri.py`, medidas, y payload S0 total declarado contra el techo de 15 MB de `PLAN.md §6.4` (hoy ~5 MB) |
| B5 | Domo de cielo: de 32×32 segmentos a ≥96×48, con mipmaps | Captura del cielo sin facetado ni banding en el gradiente, y sin shimmering al mover cámara (serie `qa:d3`, no captura suelta). Costo en triángulos declarado |
| B6 | Aerial perspective: el fog de S6 tiñe cálido con la distancia en vez de ir a negro (§1.5, causa 3) | Captura de S6 donde lo distante se lee como atardecer y no como oscuridad. Medición de la luminancia y crominancia del fondo a tres distancias |
| B7 | Corregir la subexposición estructural de S6 (§1.5, causa 2) | La exposición efectiva a lo largo de S6 declarada punto por punto, alcanzando neutro donde corresponde, sin quemar: `clippedWhitePct < 2 %` |

### Fase C · Terreno y naturaleza

| # | Ítem | Verificación requerida |
|---|---|---|
| C1 | Árboles reales, instanciados, con normales correctas — no púas | Captura de S1/S2 donde los árboles se identifican **sin ambigüedad** como árboles. Assert de que las normales tienen componente `+Y` dominante. Draw calls sin cambio neto (instanciados) |
| C2 | Grama rehecha: normales hacia arriba, clustering y falloff de densidad, variación, viento respetando `prefers-reduced-motion` | Captura donde el pasto lee como pasto iluminado y no como púas negras. Assert de distribución no uniforme. Verificación del bypass de reduced-motion |
| C3 | Terreno: subdividido, con textura procedural y variación de color/roughness, sin el color plano de hoy | Comparativa antes/después del mismo encuadre de S1. Assert de que el color del suelo deja de ser un valor único |
| C4 | Naturaleza de fondo: línea de árboles y relieve lejano; eliminar el corte recto del plano de 4000×4000 en el horizonte | Captura de S1 y S2 donde el horizonte no tiene un borde recto artificial y hay masa vegetal a media distancia |

### Fase D · Aeropuerto

| # | Ítem | Verificación requerida |
|---|---|---|
| D1 | Hangares con puertas, ventanas y estructura reconocibles | Captura de S2 donde se identifican como hangares y no como cajas. Draw calls declarados (deben seguir instanciados) |
| D2 | Torre de control reconstruida **y consolidada a 1–2 draw calls** (hoy 5), y **visible también en Mobile Low**, que hoy la oculta entera | Silueta sin facetado a la distancia de S1/S2. Nota de implementación: el beacon usa `MeshBasicMaterial` con `toneMapped:false`, así que o se deja aparte (5→2) o se pasa a emisivo por vértice (5→1) aceptando perder esa propiedad — la decisión se documenta |
| D3 | Pista con desgaste: goma en la zona de toma, variación de tono del asfalto, marcas envejecidas, y **numeración de cabecera** | Captura cenital de depuración y captura de S1. **El test B4 debe seguir pasando sin tocarlo**: todo vértice de marca con `y = RUNWAY_SURFACE_Y` y normal `(0,1,0)` |
| D4 | Luces de borde de pista y PAPI | Captura de S1/S2 donde se identifican. Coherentes con la hora del día de cada sección; sin romper el presupuesto ni introducir bloom espurio |
| D5 | Calles de rodaje conectando pista y apron | Captura donde la topología del aeropuerto se lee como un aeropuerto y no como una pista suelta |

### Fase E · El mundo persiste en altura

**Es el ítem que responde literalmente al pedido de "la pista vista desde arriba".**

El diseño **no agrega un aeropuerto nuevo y lejano**: la pista, el apron y los hangares ya están en el sitio correcto y con resolución de sobra (§1.8, 5,3 px/unidad a 36 %). Lo que hay que hacer es **dejar de ocultarlos y resolver el borde del mundo**. Tres piezas:

**1 · Disco de terreno que sigue a la cámara — 1 draw call, 2 triángulos.** Reemplaza al `planeGeometry(4000,4000)` de `EnvironmentPlaceholder.tsx:233`. Un quad grande cuya posición XZ se copia de la cámara cada frame, con **UV en espacio-mundo** (`uv = worldXZ / tileSize`, `RepeatWrapping`) para que la textura no se deslice. El borde recto se resuelve **sin tocar `far`** —subirlo de 3.000 a 12.000 degradaría la precisión de profundidad 4× y las marcas de pista viven a 5 mm del asfalto con `polygonOffset`— sino con un lerp del albedo hacia el color de niebla en función del radio, opaco, sin `transparent: true` y por lo tanto sin problemas de ordenamiento contra la pista. **El terreno se disuelve en la niebla en vez de terminar en una línea recta.**

**2 · Plano de aeropuerto fusionado — 1 draw call, ~200 triángulos.** Nuevo `src/lib/airportGroundPlan.ts`, calcado del patrón de `runwayGeometry.ts`: quads XZ construidos directamente en el plano, una sola `BufferGeometry` fusionada, con calles de rodaje, bordes de apron, puntos de espera y límites de parcelas. Importa `RUNWAY_SURFACE_Y` y las constantes de pista del mismo módulo, así el CI puede cross-checkear que la calle de rodaje conecta con el umbral en coordenadas exactas. **Test espejo de B4**, que hace estructuralmente imposible inclinarlo o hacerlo z-fightear.

**3 · Quitar la puerta binaria, no agregar objetos.** `RunwayEnvironment.tsx:520` deja de ser `visible = progress < 0.305` y pasa a **visibilidad por subsistema**. Lo único que se apaga por distancia es lo que a esa escala es sub-píxel: el pasto (hojas de 1,6 u a 200+ u) se queda en S1/S2, y el polvo ya se desvanece solo en S2. **La sombra de contacto analítica no se reactiva**: la aeronave está a `y=40` y una sombra de contacto en S3 delataría que la altitud es falsa.

**Balance**: Low **+4** (de ~5 a ~9 de 100) · High **+9** (de ~22 a ~31 de 250) · **~2.200 triángulos**, el 0,44 % del presupuesto low. **El riesgo real de esta fase es de composición y de fog, no de performance**, y así debe verificarse.

| # | Ítem | Verificación requerida |
|---|---|---|
| E1 | Retirar el corte duro de 30.5 % y el fade de suelo; visibilidad por subsistema | Capturas a 0.30, 0.32, 0.36, 0.40 con terreno continuo y **sin ningún salto perceptible** donde hoy está el corte |
| E2 | **La pista se ve desde arriba en las secciones avanzadas** | Capturas de S3 (≈0.36) y S6 (≈0.88) donde la pista se identifica sin ambigüedad desde altura. **Este ítem no se marca sin esas dos capturas** |
| E3 | El borde del mundo se disuelve en niebla, sin línea recta — en particular en la ventana 32–34 % donde el horizonte cae fuera de cuadro | Serie `qa:d3` sobre `0.28–0.44` cuadro a cuadro (no capturas sueltas), sin borde recto ni popping ni doble geometría |
| E4 | `src/lib/airportGroundPlan.ts` con calles de rodaje conectadas a la pista en coordenadas compartidas | Test espejo de B4: cada vértice con `\|y − RUNWAY_SURFACE_Y\| ≤ 1e-9` y normal exactamente `(0,1,0)`; más assert de que la calle de rodaje toca el umbral |
| E5 | Presupuesto sostenido en todas las secciones con terreno nuevo | Draw calls y triángulos medidos en S3, S6 y S7 para los tres tiers, dentro de `PLAN.md §7.1` |
| E6 | El tinte de suelo por sección (`theme.ground`) sobrevive al material nuevo | Capturas de S5 (`#151311`) y S7 (`#090b0e`): el suelo sigue casi negro y **no** se convierte en un campo verde iluminado |

### Fase F · Cielo y nubes

| # | Ítem | Verificación requerida |
|---|---|---|
| F1 | Nubes con volumen y sombreado real, no 4 elipses de color plano | Captura de S3 y S6 donde las nubes tienen forma y luz propias. Draw calls sin cambio neto (siguen instanciadas por capa) |
| F2 | Nubes presentes en S1 y S2 — hoy el cielo está vacío ahí | Captura de S1 y S2 con cielo poblado y coherente con la hora del día |
| F3 | Disco solar y glare visibles en S6 (§1.5, causa 4) | Captura de S6 con el sol legible y separado del fondo, sin quemar (`clippedWhitePct < 2 %`) |
| F4 | Composición final del atardecer: cierre de todo lo que S6 arrastra de A1, B6, B7 y F3 | Captura de S6 evaluada contra el criterio del brief — cautivadora, no sólo correcta — con las mediciones de contraste y separación cola–cielo ya establecidas en la ronda 2 (ΔY ≥ 0,05; contraste ≥ 1,5:1) sostenidas o mejoradas |

---

## 5. Checklist de aceptación visual

Se completa al cierre de la ronda, no antes. Espejo exacto en `progress3.md`.

**Transversales:**
- [ ] Ninguna superficie iluminada de la escena lee como negro puro, en ningún punto del recorrido
- [ ] Cero elementos geométricos no identificables en el frame
- [ ] Antialiasing activo y verificado; sin escalera en la silueta del A380 contra el cielo
- [ ] La curva de tone mapping aplicada es la que el proyecto declara, verificada en runtime
- [ ] `scene.environment` no es nulo en ninguno de los 101 puntos de scroll muestreados
- [ ] Ratio de **medianas** de luminancia entre cualquier par de HDRI dentro del umbral declarado, además del ratio de medias `< 4×`
- [ ] Draw calls y triángulos dentro de `PLAN.md §7.1` en los tres tiers y en las siete secciones
- [ ] **Mobile Low con margen amplio de draw calls** (≤20 de 100, recuperado de los 99 actuales), no al borde del techo
- [ ] El pico real de Mobile Low en S1/S2 está **medido**, no inferido de una sonda en 0,01
- [ ] El contraste del panel de S3 es independiente del fondo 3D, probado alterando el fondo
- [ ] Los máximos de continuidad de cámara del test B2 siguen dentro de sus umbrales
- [ ] FPS queda explícitamente para hardware físico: SwiftShader no es una medición válida de GPU

**Por sección:**
- [ ] **S1** — árboles identificables como árboles; pasto iluminado con variación; terreno con textura; horizonte sin corte recto; pista con desgaste y numeración; torre y hangares con detalle; sin zonas quemadas (`< 2 %`)
- [ ] **S2** — hangares con puertas/ventanas legibles y **sin paredes negras**; luces de pista coherentes; calles de rodaje visibles; sombra de contacto sostenida
- [ ] **S3** — **la pista se ve desde arriba**; terreno continuo sin salto en 30.5 %; nubes con volumen; cielo sin facetado ni banding; contraste de overlay ≥ 4,5:1
- [ ] **S4** — el cruce sigue leyéndose como umbral, sin regresión respecto de la ronda 2
- [ ] **S5** — interior sin regresión respecto de la ronda 2 (esta ronda no lo toca; se verifica que no se rompió)
- [ ] **S6** — atardecer cautivador: disco solar legible, aerial perspective cálida, exposición neutra donde corresponde, nubes con luz, avión separado del fondo (ΔY ≥ 0,05; contraste ≥ 1,5:1)
- [ ] **S7** — cierre coherente; `scene.environment` vivo; atribución y enlace CC BY 4.0 visibles

---

## 6. Restricciones duras — qué rompe el CI antes de tocar nada

Esta sección existe para que quien implemente no descubra estos límites por accidente. **Todos están asertados hoy y todos pasan.**

| Restricción | Valor | Dónde se asserta | Margen actual |
|---|---|---|---|
| Draw calls por tier | high `<250` · mid `<150` · low `<100` (comparación estricta) | `scripts/visual-qa.mjs` | High hero **148**. **Mobile Low hero 99 — a 1 del límite**, de los cuales **92 son el tren de aterrizaje** (§1.9) |
| Cobertura de la medición | Mobile Low sólo se muestrea en 0,01 / 0,36 / 0,60 / 0,91 | `scripts/visual-qa.mjs:261-268` | **El pico real de S1/S2 no está medido** — lo cubre la Fase 0 |
| Triángulos por tier | `<1.5M` / `<800k` / `<500k` | `scripts/visual-qa.mjs` | 72.160 en el hero: amplísimo |
| Continuidad de cámara | Δpos ≤3 · Δtarget ≤3 · Δorient ≤3° · ΔFOV ≤0,25° · Δroll ≤0,35°, sobre 1001 muestras | `tests/b1-b2.test.mjs` | **2,652 / 2,837 / 2,815° / 0,204° / 0,306° — ~6 % de headroom.** Tocar keyframes casi seguro lo rompe |
| Travesía de cámara válida | Cubre `[0,1]`, sin huecos, sin saltarse keyframes | `assertValidTraversal()`, **corre al importar el módulo** | Rompe el build, no sólo el test |
| Estado sección/zona | 101 puntos consistentes; 0 paneles S5 fuera de S5 | `tests/b1-b2.test.mjs` (B1) | Pasa |
| Marcas de pista horizontales | Cada vértice con `\|y − RUNWAY_SURFACE_Y\| ≤ 1e-9`, normal exactamente `(0,1,0)` | `tests/environment.test.mjs` (B4) | **D3 debe respetarlo sin tocar el test** |
| Marco del umbral | Visibilidad ≥0,75 a 0,83 y **exactamente 0** a 0,86/0,88/0,92 | `tests/environment.test.mjs` (B3) | Pasa |
| Mapas de superficie del exterior | ≥20 niveles distintos, rango roughness ≥0,2 | `tests/b1-b2.test.mjs` (C1) | Pasa |
| GLB del interior | 240 asientos exactos · ≤350k tris · ≤45 batches · ≤256 KB | `scripts/verify-interior-glb.mjs` | 280.312 tris / 112.724 B |
| Ratio de HDRI | Medias `< 4×` | `scripts/measure-hdri.mjs` | 1,922× — **pero las medianas están descalibradas 3,3×, ver bug #3** |
| Contraste de overlay | ≥ 4,5:1 en `03-spec-sheet` | `scripts/visual-qa.mjs` | 17,5:1 |
| Clipping del hero | `clippedWhitePct < 2 %` | `scripts/visual-qa.mjs` | 0,42 % |
| Errores de consola/página/red/HTTP | **Cero**, o el arnés falla | `scripts/visual-qa.mjs` | 0/0/0/0 |
| Payload bloqueante S0 | ≤ 15 MB | `PLAN.md §6.4` | ~5 MB — margen amplio para B4 |

**Entorno:** el contenedor de planificación **no tiene Blender, `ktx` ni `ffmpeg`**. Instalarlos es el primer paso de la implementación; el CI ya lo hace vía apt. Sin `ktx`, `process-glb.mjs` degrada a JPEG con un log explícito — reduce descarga pero **no** VRAM, así que no es equivalente y no debe aceptarse como tal.

**Herramientas de inspección ya disponibles y que conviene usar:** `npm run qa:d3` captura series cuadro a cuadro de **cualquier** ventana de scroll vía `D3_QA_START` / `D3_QA_END` / `D3_QA_STEP` — es la herramienta correcta para verificar transiciones (E3) en vez de capturas sueltas.

---

## 7. Contrato anti-cosmético

Heredado de `plan2.md §6` sin rebajarlo, porque funcionó: la ronda 2 no marcó nada que no se pudiera ver.

1. **Nada se marca en `progress3.md` sin evidencia adjunta.** Captura a un % de scroll específico, medición numérica, o assert automatizado. No existe "debería estar arreglado".
2. **Cada ítem declara su verificación antes de implementarse** — ya está declarada en §4, ítem por ítem.
3. **Un ítem marcado debe ser verificable por el usuario mirando la pantalla**, sin leer código ni confiar en la palabra del implementador.
4. **Los spikes producen hallazgo escrito antes de cualquier fix.** Prohibido proponer solución sin causa confirmada. Un hallazgo de "no hay bug" es un resultado válido y convierte el ítem en decisión de alcance.
5. **"Sin errores de consola" no es criterio de aceptación de nada visual.** Es condición necesaria, nunca suficiente.
6. **Si un fix no alcanza el criterio, el ítem queda sin marcar y se registra por qué**, en vez de rebajar el criterio para poder marcarlo. Esto aplica en particular al techo de draw calls de Mobile Low (§3.1).
7. **Nuevo en esta ronda — no mezclar causas en una misma tanda de evidencia.** Las fases A y B son sistémicas y obligan a recapturar la línea base completa antes de continuar. Una captura que cambió por dos motivos a la vez no prueba ninguno de los dos.
8. **Nuevo en esta ronda — el tracking es parte del entregable.** `progress3.md` se actualiza en la misma sesión en que se hace el trabajo, con su tabla de sesiones al día. Un cambio implementado y no documentado se trata como no hecho.
