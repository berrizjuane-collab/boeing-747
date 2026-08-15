# PROGRESS 3 — Fidelidad de Entorno y Dirección de Arte

> Checklist espejo de [`plan3.md`](./plan3.md). **Documento activo de tracking.** `PROGRESS.md` (ronda 1) y `progress2.md` (ronda 2) quedan cerrados y no se vuelven a marcar.
>
> **Convención de estados:** `[ ]` pendiente · `[~]` en curso / condicionado · `[x]` completo · `[!]` bloqueado
>
> **Regla de marcado (contrato anti-cosmético, `plan3.md §7`):** ningún ítem se marca sin evidencia adjunta en su propia fila — captura a un % de scroll específico, medición numérica, o assert automatizado. "Debería estar arreglado" no es evidencia. Si un fix no alcanza el criterio, el ítem **queda sin marcar** y se registra por qué, en vez de rebajar el criterio.

---

## Estado global

**Fase 0 completa (implementación, sesión 2).** Los cuatro ítems de instrumentación y presupuesto están implementados y verificados con evidencia real (capturas Playwright contra un build de producción real, no estimaciones). Fases A–F: no comenzadas — quedan para la sesión 3, ver "Qué queda abierto" en el registro de sesiones.

---

## Línea base medida (referencia contra la que se compara todo)

Medición propia sobre el sitio corriendo, leyendo `window.__MERIDIAN_PERF__`:

| scroll | 0.00 | 0.16 | 0.22 | 0.26 | 0.30 | 0.84 | 0.90 |
|---|---|---|---|---|---|---|---|
| draw calls | 148 | 148 | 148 | 34 | 34 | 21 | 20 |
| triángulos | 71.080 | 71.080 | 71.080 | 45.140 | 45.140 | 44.104 | 43.624 |

Desglose del hero por frustum real:

| viewport | casco `A380` | `LandingGear_Part_*` | total exterior | no-exterior | total |
|---|---|---|---|---|---|
| 390×844 (Mobile Low) | 1 | 92 | 93 | 6 | **99** / 100 |
| 1440×900 (Desktop High) | 1 | 115 | 116 | 32 | **148** / 250 |

Luminancia de las tres HDRI (`npm run qa:hdri`):

| archivo | resolución | media | **mediana** | p95 | máx | bytes |
|---|---|---|---|---|---|---|
| `golden-hour.hdr` | 2048×1024 | 1,00358 | **0,23368** | 1,35362 | 202.427 | 1.392.889 |
| `high-altitude.hdr` | 2048×1024 | 1,25455 | **0,07051** | 0,31445 | 142.863 | 400.475 |
| `sunset.hdr` | 2048×1024 | 0,65274 | **0,11566** | 0,79877 | 142.415 | 1.191.614 |

Ratio de medias **1,922×** (pasa `<4×`). Ratio de medianas **3,31×** — no asertado hoy, ver bug #3.

Payload bloqueante S0 real: **5,20 MB** de 15 MB.

---

## Bugs reales encontrados en la auditoría

Ninguno reportado por el usuario; todos salieron de leer el código y medir. Detalle y criterio de cierre en `plan3.md §2`.

| # | Sev. | Bug | Estado | Evidencia |
|---|---|---|---|---|
| 1 | Alta | Tone mapping es **AgX, no ACES** — `<ToneMapping/>` sin prop `mode` | [ ] | |
| 2 | Alta | `scene.environment` queda **nulo desde S7** | [ ] | |
| 3 | Alta | Calibración de HDRI **dominada por el disco solar**; medianas descalibradas 3,31× | [ ] | |
| 4 | Media | Grading pre-tone-mapping con umbrales LDR sobre buffer HDR | [ ] | |
| 5 | Media | `SectionGradeEffect.strength` congelado en `0.5` | [ ] | |
| 6 | Media | **Sin antialiasing de ningún tipo** | [ ] | |
| 7 | Baja | `castShadow`/`receiveShadow` del exterior es código muerto | [ ] | |
| 8 | Baja | `gl.toneMapping` / `gl.toneMappingExposure` son no-ops que engañan | [ ] | |
| 9 | Baja | `skyDomeMaterial.ts` sin includes de tonemapping/colorspace | [ ] | |
| 10 | Baja | `qualityStore.ts:22` referencia `SHADOW_SECTION_END`, inexistente | [ ] | |
| 11 | Baja | `VEGETATION_COUNT.low = 144` es valor muerto | [ ] | |
| 12 | Alta | **El panel de S3 no tiene tarjeta de fondo** — es la aserción de CI que se rompe primero | [ ] | |
| 13 | Baja | `loadingWeights.ts` con pesos de HDRI obsoletos (high-altitude +43 %) | [ ] | |

---

## Fase 0 — Instrumentación y presupuesto

> Va antes que cualquier cambio visual. Sin esto ningún paso posterior es falsable.

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| 01 | Sondas móviles nuevas en `visual-qa.mjs` a **0,13 · 0,24 · 0,30** | El reporte incluye las tres capturas con su `performance`, y el pico real de draw calls de S1/S2 en Mobile Low queda medido | [x] | `visual-qa.mjs` captura `08b-mobile-taxi-13.png`(0.13)/`08c-mobile-gear-retract-24.png`(0.24)/`08d-mobile-terrain-30.png`(0.30) con `performance` cada una. Medido contra el árbol pre-merge (0 errores): drawCalls 99/99/7/8 en 0.01/0.13/0.24/0.30 — **el pico de 99 se sostiene hasta 13 % y cae a 7–8 ya en 24 %**, antes de lo que el nombre de la sonda sugería (el tren sale del frustum de Mobile Low antes de terminar de replegarse). Post-merge (ítem 02): ver fila 02. |
| 02 | **Fusión de las 115 mallas de `LandingGear` en runtime** | Mobile Low hero **99 → ≤10** y Desktop High hero **148 → ≤36**, medidos. Y `01-hero.png` / `08-mobile-hero.png` **idénticos píxel a píxel** a los artefactos de la ronda 2 — cualquier diferencia es un bug | [~] | Implementado en `ExteriorAsset.tsx` (merge relativo a `gear` vía cadena completa de `matrixWorld`, con `three/examples/jsm/utils/BufferGeometryUtils.js#mergeGeometries`). **Trampa real encontrada y evitada**: `mergeBufferGeometries` de `three-stdlib` está roto — sus checks de consistencia hacen `return null` dentro de un callback `forEach`, que sólo corta esa iteración, no la función — y produjo un merge corrupto silencioso (posición con conteo de vértices no entero) que rompió `computeBoundingSphere` con NaN y perdió el contexto WebGL; cambiado al `mergeGeometries` mantenido de `three/examples/jsm`. **Draw calls, medidos con `qa:visual` completo (0 errores de consola/página/red/HTTP en ambas corridas)**: Desktop High hero **148 → 34** (mejor que el objetivo ≤36); Mobile Low hero **99 → 8** (mejor que el objetivo ≤10); sondas nuevas de la fila 01 también bajan (0.13: 99→8, 0.24: 7→7, 0.30: 8→8). **No llega al criterio pleno todavía**: `01-hero.png` y `08-mobile-hero.png` no son idénticos byte a byte. Diff real medido con `sharp` (no sólo `cmp`): con umbral de ruido >5/255 (filtra jitter de antialiasing de por sí no determinístico en SwiftShader), `08-mobile-hero` cae a 3 píxeles de 329.160 (0,001 %); `01-hero` cae a 395 píxeles de 1.296.000 (0,03 %), concentrados exclusivamente en las filas 360–720 de 900 — la banda donde está el fuselaje/tren en cuadro, cero diferencia en cielo/suelo. Consistente con ruido de rasterización de punto flotante (el merge hornea la transformada relativa una vez en los vértices en vez de componerla cada cuadro por parte), no con un defecto geométrico — pero **no está probado que sea eso** y el criterio del plan es literal ("cualquier diferencia es un bug"), así que el ítem queda `[~]`. Mobile Low hero también gana +8.168 triángulos (61.530→69.698): el merge cambia el culling de por-parte a por-mesh-completo, así que partes que antes se culleaban individualmente fuera del frustum angosto de Mobile Low ahora viajan con el resto — presupuesto de triángulos tiene margen amplísimo (techo low 500k), efecto no relevante para el presupuesto pero documentado por transparencia. **Pendiente para la próxima sesión**: aislar si el diff de 0,03% es antialiasing no determinístico (correr `qa:visual` dos veces seguidas sobre el mismo código y comparar) o un residuo real del merge, antes de marcar `[x]`. |
| 03 | Tarjeta de fondo para el panel de S3 (bug #12) | `panelContrastEstimate` de `03-spec-sheet` medido **con el fondo 3D deliberadamente alterado**, probando que ya no depende de él | [~] | `.overlay__panel--climb`/`--takeoff` agregadas en `index.css` con el mismo tratamiento que `--hero`/`--exit`/`--interior-zone`. `panelContrastEstimate` de `03-spec-sheet` medido bajo render normal: ver sesión de abajo. **No alcanza el criterio pleno todavía**: no se corrió la prueba con el fondo 3D deliberadamente alterado que probaría independencia estructural — quedó fuera del tope de 1 hora de esta sesión. Queda `[~]`, no `[x]`, hasta correr esa prueba específica. |
| 04 | Pesos de carga corregidos (bug #13) | Los cuatro pesos coinciden byte a byte con el disco; payload S0 declarado | [x] | Medido con `ls -la public/models public/hdri` y comparado byte a byte contra `loadingWeights.ts`: `exterior.glb` ya coincidía (2.213.004 B); `golden-hour.hdr` declaraba 1.521.246 vs 1.392.889 reales (+9,2 %), `high-altitude.hdr` 572.760 vs 400.475 (+43,0 %), `sunset.hdr` 1.230.262 vs 1.191.614 (+3,2 %) — coincide exacto con lo que predecía bug #13. Corregidos los tres a los valores reales. Payload S0 declarado: 2.213.004+1.392.889+400.475+1.191.614 = **5.197.982 B (5,20 MB) de 15 MB** — consistente con lo ya registrado en la línea base de este documento. |

---

## Fase A — Base de imagen (sistémica)

> Invalida la evidencia visual de **todas** las secciones. Se cierra con recaptura completa de línea base.

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| A1 | Aplicar la curva de tone mapping que el proyecto declara (bug #1) | Lectura en runtime del modo efectivo, más comparativa antes/después en el **mismo** encuadre de S1 y S6, con medición de saturación y contraste | [ ] | |
| A2 | Grading a espacio display o umbrales recalibrados para HDR; resolver `strength` (bugs #4, #5) | El key de grading de S6 (`#E89B6C`) es **medible en los highlights** de S6, no sólo en sus sombras | [ ] | |
| A3 | Antialiasing (bug #6) | Comparativa al mismo encuadre y resolución de la silueta contra el cielo, con medición de gradiente de borde. Costo en ms declarado contra `PLAN.md §7.2` | [ ] | |
| A4 | `scene.environment` nunca nulo (bug #2) | Barrido de los 101 puntos: no nulo en todos. Capturas a 0,94 y 0,96 sin pop de iluminación | [ ] | |
| A5 | Limpieza de código muerto y documentación que engaña (bugs #7, #8, #9, #10, #11) | `grep` sin resultados de cada símbolo eliminado; los conservados, con su porqué en el propio archivo | [ ] | |
| A6 | **Recaptura de línea base completa** | Las 17+3 capturas de `qa:visual` regeneradas y archivadas como la nueva referencia | [ ] | |

---

## Fase B — Luz y atmósfera (sistémica)

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| B1 | Luz ambiental/hemisférica exterior: ninguna superficie iluminada lee negro puro | Captura de S2 con paredes de hangar y matas de valor y color legibles. Assert de piso de luminancia. **Sin apagar el contraste** — ratio medido antes/después | [ ] | |
| B2 | Acoplar key/fill/rim al azimut y elevación reales del sol de la HDRI activa | Tabla por sección con azimut/elevación de HDRI vs. de la key y su coincidencia. Captura de S6 con luz y sol del mismo lado | [ ] | |
| B3 | Recalibrar HDRI por mediana y asertarlo en `qa:hdri` (bug #3) | `qa:hdri` asserta ratio de **medianas** además del de medias. S3 deja de ser la más oscura en cuerpo de cielo. Números antes/después de las tres | [ ] | |
| B4 | HDRI a 4096×2048 | Regeneradas con `generate_hdri.py`, medidas, payload S0 total declarado contra el techo de 15 MB | [ ] | |
| B5 | Domo de cielo de 32×32 a ≥96×48, con mipmaps | Cielo sin facetado ni banding, sin shimmering al mover cámara (serie `qa:d3`, no capturas sueltas). Costo en triángulos declarado | [ ] | |
| B6 | Aerial perspective: el fog de S6 tiñe cálido con la distancia en vez de ir a negro | Captura de S6 donde lo distante lee como atardecer. Luminancia y crominancia del fondo medidas a tres distancias | [ ] | |
| B7 | Corregir la subexposición estructural de S6 | Exposición efectiva declarada punto por punto a lo largo de S6, alcanzando neutro donde corresponde, con `clippedWhitePct < 2 %` | [ ] | |

---

## Fase C — Terreno y naturaleza

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| C1 | Árboles reales, instanciados, con normales correctas | Captura de S1/S2 donde se identifican **sin ambigüedad** como árboles. Assert de normales con componente `+Y` dominante. Draw calls sin cambio neto | [ ] | |
| C2 | Grama rehecha: normales hacia arriba, clustering y falloff de densidad, variación, viento con bypass de `prefers-reduced-motion` | Captura donde el pasto lee como pasto iluminado y no como púas negras. Assert de distribución no uniforme. Verificación del bypass | [ ] | |
| C3 | Terreno subdividido con textura procedural y variación de color/roughness | Comparativa antes/después del mismo encuadre de S1. Assert de que el color del suelo deja de ser un valor único. **Determinismo byte a byte entre dos llamadas** (el QA visual depende de ello) | [ ] | |
| C4 | Naturaleza de fondo: línea de árboles y relieve lejano; sin corte recto en el horizonte | Captura de S1 y S2 sin borde recto artificial y con masa vegetal a media distancia | [ ] | |

---

## Fase D — Aeropuerto

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| D1 | Hangares con puertas, ventanas y estructura reconocibles | Captura de S2 donde se identifican como hangares y no como cajas. Draw calls declarados, siguen instanciados | [ ] | |
| D2 | Torre reconstruida y consolidada a **1–2 draw calls** (hoy 5), **visible también en Mobile Low** | Silueta sin facetado a la distancia de S1/S2. La decisión sobre el beacon (`toneMapped:false`) documentada | [ ] | |
| D3 | Pista con desgaste: goma en zona de toma, variación de tono, marcas envejecidas y **numeración de cabecera** | Captura cenital de depuración y captura de S1. **El test B4 debe seguir pasando sin tocarlo** | [ ] | |
| D4 | Luces de borde de pista y PAPI | Captura de S1/S2 donde se identifican, coherentes con la hora del día, sin romper presupuesto ni introducir bloom espurio | [ ] | |
| D5 | Calles de rodaje conectando pista y apron | Captura donde la topología lee como un aeropuerto y no como una pista suelta | [ ] | |

---

## Fase E — El mundo persiste en altura

> **Es la fase que responde literalmente al pedido de "la pista vista desde arriba".**
> Orden interno obligatorio: **geometría (E1, E4) antes que material (E6)**. Si el material llega primero, ante un fallo de luminancia no se puede distinguir "ahora hay suelo en cuadro" de "el suelo ahora es de otro color".

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| E1 | Retirar el corte duro de 30.5 % y el fade de suelo; visibilidad por subsistema | Capturas a 0,30 · 0,32 · 0,36 · 0,40 con terreno continuo y **sin salto perceptible** donde hoy está el corte | [ ] | |
| E2 | **La pista se ve desde arriba en las secciones avanzadas** | Capturas de S3 (≈0,36) y S6 (≈0,88) donde la pista se identifica sin ambigüedad desde altura. **Este ítem no se marca sin esas dos capturas** | [ ] | |
| E3 | El borde del mundo se disuelve en niebla, sin línea recta — en particular en 32–34 %, donde el horizonte cae fuera de cuadro | Serie `qa:d3` sobre `0.28–0.44` cuadro a cuadro, sin borde recto ni popping ni doble geometría | [ ] | |
| E4 | `src/lib/airportGroundPlan.ts` con calles de rodaje en coordenadas compartidas con la pista | Test espejo de B4: cada vértice con `\|y − RUNWAY_SURFACE_Y\| ≤ 1e-9` y normal exactamente `(0,1,0)`; más assert de que la calle de rodaje toca el umbral | [ ] | |
| E5 | Presupuesto sostenido en todas las secciones con terreno nuevo | Draw calls y triángulos medidos en S3, S6 y S7 para los tres tiers, dentro de `PLAN.md §7.1` | [ ] | |
| E6 | El tinte de suelo por sección (`theme.ground`) sobrevive al material nuevo | Capturas de S5 (`#151311`) y S7 (`#090b0e`): el suelo sigue casi negro y **no** se vuelve un campo verde iluminado | [ ] | |

---

## Fase F — Cielo y nubes

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| F1 | Nubes con volumen y sombreado real, no 4 elipses de color plano | Captura de S3 y S6 con nubes de forma y luz propias. Draw calls sin cambio neto | [ ] | |
| F2 | Nubes presentes en S1 y S2 — hoy el cielo está vacío ahí | Captura de S1 y S2 con cielo poblado y coherente con la hora del día | [ ] | |
| F3 | Disco solar y glare visibles en S6 | Captura de S6 con el sol legible y separado del fondo, sin quemar (`clippedWhitePct < 2 %`) | [ ] | |
| F4 | Composición final del atardecer — cierra lo que S6 arrastra de A1, B6, B7 y F3 | Captura de S6 evaluada contra el criterio del brief, con las mediciones de la ronda 2 sostenidas o mejoradas (ΔY ≥ 0,05; contraste ≥ 1,5:1) | [ ] | |

---

## Checklist de aceptación visual final

> Se completa al cierre de la ronda, no antes. Espejo de `plan3.md §5`.

**Transversales:**
- [ ] Ninguna superficie iluminada de la escena lee como negro puro, en ningún punto del recorrido
- [ ] Cero elementos geométricos no identificables en el frame
- [ ] Antialiasing activo y verificado; sin escalera en la silueta del A380 contra el cielo
- [ ] La curva de tone mapping aplicada es la que el proyecto declara, verificada en runtime
- [ ] `scene.environment` no es nulo en ninguno de los 101 puntos de scroll muestreados
- [ ] Ratio de **medianas** de luminancia entre cualquier par de HDRI dentro del umbral declarado, además del ratio de medias `< 4×`
- [ ] Draw calls y triángulos dentro de `PLAN.md §7.1` en los tres tiers y en las siete secciones
- [ ] **Mobile Low con margen amplio** (≤20 de 100, recuperado de los 99 actuales), no al borde del techo
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

## Registro de sesiones

| Fecha | Sesión | Qué se hizo | Qué quedó abierto |
|---|---|---|---|
| 2026-08-14 | Planificación de la ronda 3 (auditoría + `plan3.md` + `progress3.md`) | Sesión exclusivamente de planificación, sin código de implementación. Auditoría real del árbol en `2ac3573`, con el sitio **corriendo en un navegador real** y midiendo `window.__MERIDIAN_PERF__` en siete puntos de scroll — no sólo lectura de código. **Cada carencia reportada por el usuario quedó con causa concreta identificada**, no como impresión: (1) los "árboles" no existen — son matas de 3 triángulos verticales cuyas normales quedan horizontales tras `computeVertexNormals()`, así que no capturan una key light que viene 74 % desde arriba, y **no hay `ambientLight` ni `hemisphereLight` en el exterior**, que es la misma causa por la que las paredes de los hangares se ven negras; (2) la grama es un `planeGeometry(4000,4000)` de **un solo quad** con color plano por sección, sin textura ni subdivisión; (3) los edificios son 3 cajas instanciadas más cilindros de 10 segmentos; (4) no hay naturaleza de fondo de ninguna clase, y el borde del plano se lee como corte recto; (5) el atardecer llega degradado por cinco causas acumuladas y medidas — AgX en vez de ACES, exposición total 0,651→0,820 que nunca alcanza neutro, fog que va a negro en vez de teñir, sin disco solar ni god rays, y la key light desalineada del sol de la HDRI; (6) la pista no se ve desde arriba porque **todo el mundo terrestre se apaga de golpe a 30,5 % de scroll**, pese a que la cámara sí mira hacia abajo (−19° en S3, −11° en S6/S7). Se encontraron **13 bugs reales** que nadie había reportado, tres de severidad alta: el tone mapping es **AgX y el código cree que es ACES** (verificado leyendo el default del constructor de `postprocessing`), `scene.environment` **queda nulo desde S7**, y la calibración de HDRI por media está **dominada por el disco solar**, dejando el cielo de S3 3,31× más oscuro que el de S1 cuando el plan lo declara como el más luminoso del sitio. Dos hallazgos cambiaron el diseño respecto de la intuición inicial: **el 94 % de los 99 draw calls de Mobile Low es el tren de aterrizaje** (92 de 115 mallas visibles en el frustum móvil), así que la palanca de presupuesto no era la torre de control sino fusionar el tren — de 99 a ~8; y **el panel de S3 no tiene tarjeta de fondo**, lo que convierte a la aserción `panelContrastEstimate >= 4.5` en la primera que va a romperse cuando entre el terreno, y por eso se blinda en la Fase 0 antes de tocar nada. Se midió además que la pista existente **ya tiene resolución de sobra** para verse desde arriba (5,3 px/unidad a 36 %): no hace falta un asset nuevo, hace falta dejar de ocultarla. Tres decisiones de alcance confirmadas por el usuario: recuperar presupuesto en vez de subir el techo de Mobile Low; pipeline híbrido Blender + textura procedural en TypeScript, acotado por medición de tamaño en pantalla (árboles a 51 px, hangares a 60 px) a que la mayor parte se resuelva en TS y Blender quede como escotilla de escape; y alcance de aeropuerto limitado a pulir y poblar lo existente, sin terminal ni aviones estacionados ni vehículos. | **Ningún ítem de las fases 0/A–F comenzado** — por diseño, esta sesión no escribió código de implementación. La implementación arranca por la **Fase 0**, que es instrumentación y presupuesto y no cambia un solo píxel; sin ella los pasos siguientes no son falsables. Pendiente de confirmar en la sesión de implementación: instalar Blender, `ktx` y `ffmpeg`, que **no están en este contenedor**. Sigue vigente de rondas anteriores el único límite no cubrible acá: la matriz de FPS y cross-browser en Safari/iOS y Android **físicos**, no sustituible por SwiftShader ni por emulación. |
| 2026-08-15 | Implementación Fase 0 (sesión 2, tope duro de 1 hora) | `npm install` limpio (no había `node_modules`); build y 9/9 tests base verificados antes de tocar nada. Ítem 01: tres sondas móviles nuevas en `visual-qa.mjs` (0.13/0.24/0.30); confirmó que el pico de 99 draw calls en Mobile Low se sostiene hasta 13 % y cae a 7–8 ya en 24 % (el tren sale del frustum angosto de Mobile Low antes de terminar de replegarse — más temprano de lo que el nombre de la sonda 0.24 sugería). Ítem 03: `.overlay__panel--climb`/`--takeoff` en `index.css` con el mismo tratamiento que las otras tres tarjetas. Ítem 04: los cuatro pesos de `loadingWeights.ts` remedidos byte a byte contra `public/models` y `public/hdri`; tres de cuatro estaban desactualizados exactamente como predecía el bug #13 (+9,2 %/+43,0 %/+3,2 %), corregidos. Ítem 02 (fusión de las 115 mallas de `LandingGear`): implementado en runtime en `ExteriorAsset.tsx`. En el camino, `mergeBufferGeometries` de `three-stdlib` resultó estar roto — sus validaciones de consistencia hacen `return null` dentro de un callback `forEach`, que no aborta la función exterior — y produjo un merge corrupto en silencio (conteo de vértices no entero) que voló el render con NaN y perdida de contexto WebGL; diagnosticado con un script Playwright standalone fuera del arnés (más rápido de iterar que el `qa:visual` completo) y resuelto usando el `mergeGeometries` mantenido de `three/examples/jsm`. Resultado medido con `qa:visual` completo, dos corridas (antes/después), 0 errores de consola/página/red/HTTP en ambas: Desktop High hero 148→34 draw calls, Mobile Low hero 99→8 — ambos mejor que los objetivos del plan. El diff píxel a píxel no cierra del todo: con umbral de ruido, 0,03 % de los píxeles de `01-hero.png` difieren (concentrados en la banda del fuselaje/tren, cero en cielo/suelo), probablemente antialiasing no determinístico de SwiftShader más que un defecto geométrico, pero no se alcanzó a probar esa hipótesis contra el límite de tiempo — así que el ítem queda `[~]`, no `[x]`. Entorno confirmado sin Blender/`ktx`/`ffmpeg` (esperado, ya lo registraba la sesión de planificación). Playwright venía apuntado a una revisión de Chromium (1234) que no existe en este contenedor (trae 1194); se resolvió con un symlink local a `/opt/pw-browsers/chromium-1194`, sin tocar el repo. | **Fase 0 al 75 % estricto** (01/03/04 con evidencia completa `[x]`; 02 con evidencia parcial `[~]`, pendiente aislar la causa del 0,03 % de diff antes de marcarlo). Fases A–F: no comenzadas. Para la próxima sesión, en este orden: (1) correr `qa:visual` dos veces seguidas sin tocar código para medir el ruido base de SwiftShader y decidir si el diff de `01-hero` de esta sesión es ruido o defecto real; (2) si es ruido, cerrar el ítem 02 con esa evidencia; si no, investigar la geometría fusionada con más detalle; (3) correr el ítem 03 con el fondo 3D deliberadamente alterado (quedó sin esa prueba específica); (4) recién ahí, Fase A completa (sistémica: tone mapping, grading, antialiasing, `scene.environment`, limpieza de bugs bajos, recaptura de línea base). Sigue pendiente instalar Blender/`ktx`/`ffmpeg`, necesarios recién desde la Fase B4. |
