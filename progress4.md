# PROGRESS 4 — Ambientación Natural del Hero

> Checklist espejo de [`plan4.md`](./plan4.md). **Documento activo de tracking.** `PROGRESS.md` (ronda 1) y `progress2.md` (ronda 2) quedan cerrados. `progress3.md` (ronda 3) queda **parcialmente cerrado**: sus Fases 0, A y B están completas con evidencia y no se vuelven a marcar; sus Fases C, D, E y F siguen sin comenzar y su destino se decide en `plan4.md §3.4` — lo que esta ronda no absorbe se remite desde la Fase K y **sigue vivo en `progress3.md`**.
>
> **Convención de estados:** `[ ]` pendiente · `[~]` en curso / condicionado · `[x]` completo · `[!]` bloqueado
>
> **Regla de marcado (contrato anti-cosmético, `plan4.md §7`):** ningún ítem se marca sin evidencia adjunta en su propia fila — captura a un % de scroll específico, medición numérica, o assert automatizado. "Debería estar arreglado" no es evidencia. Si un fix no alcanza el criterio, el ítem **queda sin marcar** y se registra por qué, en vez de rebajar el criterio.

---

## Estado global

**Ninguna fase comenzada.** La sesión que produjo este documento fue **exclusivamente de planificación**, sin código de implementación — mismo patrón que la primera sesión de la ronda 3. La implementación arranca por la **Fase 0₄**, que es instrumentación y línea base y no cambia un solo píxel; sin ella los umbrales de las Fases H e I no son falsables, porque están expresados como múltiplos de una línea base que todavía nadie midió.

Las **carencias #14–#19** de `plan4.md §2` están todas abiertas.

---

## Línea base — heredada, pendiente de re-medición

> **Advertencia, y es la razón por la que existe la Fase 0₄.** La sesión de planificación de esta ronda **no pudo correr el sitio en un navegador**: el contenedor viene sin `node_modules` y una sesión de planificación no instala ni construye. Todo lo de abajo es **heredado** de las corridas reales archivadas en `progress3.md` (Fases 0/A/B) o **derivado** a mano desde constantes del código. **Nada de esto cuenta como evidencia de cierre de ningún ítem de esta ronda** (`plan4.md §7`, punto 9).

Draw calls y triángulos vigentes tras las Fases 0/A/B `[heredado de progress3.md]`:

| | hero desktop-high (0.01) | hero mobile-low (0.01) |
|---|---|---|
| draw calls | **37** / 250 | **8** / 100 |
| triángulos | 86.304 / 1.500.000 | 83.842 / 500.000 |
| margen libre de draw calls | 213 | 92 |

Otras cifras vigentes `[heredado de progress3.md]`:

| Métrica | Valor | Origen |
|---|---|---|
| `clippedWhitePct` de `01-hero.png` | 0,496 % (`<2 %`) | Fase A6 |
| `panelContrastEstimate` de `03-spec-sheet.png` | 19,81 (`≥4,5`), probado independiente del fondo 3D | Fase 0 · ítem 03 |
| Ratio de medias / medianas de HDRI | 1,923× / 2,34× (ambos `<4×`) | Fase B3 |
| Payload bloqueante S0 | 9,79 MB de 15 MB | Fase B4 |
| Tone mapping efectivo en runtime | `ACES_FILMIC`, 20/20 capturas | Fase A1 |
| `scene.environment` nulo | 0 de 103 puntos de scroll | Fase A4 |
| Piso de ruido de SwiftShader entre dos corridas idénticas | 0,029 % de píxeles (umbral >5/255) | Fase 0 · ítem 02 |

Derivaciones de la auditoría de esta ronda, **todas pendientes de confirmación en el navegador** `[derivado]`:

| Métrica | Valor derivado | Dónde se usa |
|---|---|---|
| Niebla de S1 (`ρ=0.0015`): `F(d) = 1 − exp(−(ρd)²)` | 0,086 a 200 u · 0,555 a 600 · 0,895 a 1000 · 0,988 a 1400 | `plan4.md §1.3`, §1.6 |
| Píxeles por unidad en S1 (1440×900, fov 45) | `1086,5 / d` | `plan4.md §1.4` |
| Alto en pantalla de un pino de 12 u | 326 px a 40 u · 130 a 100 · 52 a 250 · 13 a 1000 | `plan4.md §1.4`, §3.2 |
| Alto en pantalla de una mata de pasto (0,55–1,6 u) | 15–43 px a 40 u · 4–12 px a 150 u | `plan4.md §1.5` |
| `n.y` de la normal lateral de un cono `r=1,6 h=4` | 0,37 | `plan4.md §3.2`, §3.4 |

Métricas **que todavía no existen** y que la Fase 0₄ crea y mide antes de tocar nada:

| Métrica | Estado |
|---|---|
| `horizonStepEstimate` (línea base) | **Sin medir** — ítem 04-01 |
| `groundDetailEnergy` (línea base) | **Sin medir** — ítem 04-01 |
| VRAM de textura por tier | **Sin medir, sin asertar por ningún script** — ítem 04-04 |

---

## Carencias encontradas en la auditoría de la ronda 4

Ninguna reportada por el usuario; todas salieron de leer el código y calcular. Detalle y criterio de cierre en `plan4.md §2`.

| # | Sev. | Carencia | Estado | Evidencia |
|---|---|---|---|---|
| 14 | Alta | **El domo de cielo no participa de la niebla** (`skyDomeMaterial.ts:30`, `EnvironmentPlaceholder.tsx:113`) — el "borde recto" es un salto de **color**, y no lo arregla ninguna cantidad de terreno nuevo | [ ] | Fase I1/I2/I4 |
| 15 | Media | **El plano de suelo está centrado en el origen, no en la cámara** (`EnvironmentPlaceholder.tsx:272`) | [ ] | Fase G1 |
| 16 | Media | **`seededRandom` privado en `RunwayEnvironment.tsx:34-43`**; terreno, pasto y bosque necesitan el mismo campo de densidad o el suelo miente sobre dónde hay pasto | [ ] | Fase 0₄ · 04-02 |
| 17 | Baja | **`VEGETATION_COUNT.low = 0` y `visible={tier !== 'low'}`** quedaron incoherentes con los 92 draw calls recuperados | [ ] | Fase H4 |
| 18 | Baja | **La textura procedural entra en el presupuesto de VRAM de `PLAN.md §7.1`** y ningún script lo contabiliza | [ ] | Fase 0₄ · 04-04 |
| 19 | Baja | **`emissive #314431 × 0.42` del pasto** era el piso de luminancia antes de B1 y ahora es un velo verde sucio | [ ] | Fase H3 |

---

## Fase 0₄ — Instrumentación y línea base del hero

> Va antes que cualquier cambio visual. Sin esto ningún paso posterior es falsable.

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| 04-01 | Métricas nuevas en `visual-qa.mjs`: `horizonStepEstimate` y `groundDetailEnergy` | Ambas en `visual-qa-report.json` para `01-hero`, `02-takeoff`, `08-mobile-hero` y `08b-mobile-taxi-13`, **medidas sobre el árbol actual antes de tocar nada** y registradas acá como línea base | [ ] | |
| 04-02 | `src/lib/seededRandom.ts` extraído + `src/lib/terrainField.ts` con el campo compartido | Dos llamadas producen buffers **idénticos byte a byte**; el `seededRandom` extraído produce la misma secuencia que el privado para la misma semilla; capturas del hero sin diferencia por encima del piso de ruido de SwiftShader (0,03 %) | [ ] | |
| 04-03 | Keep-out del aeródromo declarado importando `RUNWAY_SURFACE_Y` y las constantes de pista de `runwayGeometry.ts` y la tabla `HANGARS` — no re-tipeadas | Test: el keep-out contiene pista (±16 × ±260), apron y los tres hangares, verificado contra esas constantes importadas; ninguna instancia de vegetación cae dentro | [ ] | |
| 04-04 | Presupuesto de textura declarado **antes** de gastarlo (bug #18): tamaño por tier, VRAM, peso S0 previsto | Cifras escritas acá antes de que exista la textura, y comparadas con lo medido al cierre de G2, contra 350 / 200 / 120 MB de `PLAN.md §7.1` | [ ] | |

---

## Fase G — Sustrato de terreno (semi-sistémica)

> Reemplaza `Environment · Ground`. Visible sólo hasta 30,5 %, pero cambia el fondo 3D del panel de S3 en su cola — que la Fase 0 de la ronda 3 ya blindó y probó con fondos adversariales.
> Orden interno obligatorio: **geometría (G1) antes que material (G2)**. Si el material llega primero, ante un fallo de luminancia no se puede distinguir "ahora hay suelo" de "el suelo es de otro color".

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| G1 | Disco de terreno que sigue a la cámara, UV en espacio-mundo con `RepeatWrapping`, subdividido, con relieve de baja amplitud, **sin tocar `far`**, opaco | Test espejo del B4 (`tests/environment.test.mjs:48`): todo vértice dentro del keep-out con `\|y − 0\| ≤ 1e-9` y normal exactamente `(0,1,0)`. Capturas a 0,01 · 0,10 · 0,19 · 0,27 **sin borde del mundo en cuadro en ninguna** | [ ] | |
| G2 | Textura procedural (albedo tierra terracota + parches de pasto, normal, roughness) desde el campo compartido, generada dentro de la puerta de carga S0 con su peso en `loadingWeights.ts` | **Determinismo byte a byte** entre dos llamadas. Espejo del test C1: ≥20 niveles distintos y rango de roughness ≥0,2. Conteo de colores distintos cuantizados en la banda cercana de `01-hero.png` ≥ piso declarado, contra el valor único de hoy. VRAM y hitch medidos contra 04-04 | [ ] | |
| G3 | El tinte de suelo por sección sobrevive: `w(progress) = 0` hasta el final de S2, rampa a 1 a través de S3, `GROUND_TINT_GAIN` calibrado. **Sin tocar `SECTION_ENVIRONMENT`** | Capturas de 0,60 (S5) y 0,97 (S7): luminancia media del suelo **dentro de ±5 %** de la línea base de la Fase A6. El suelo sigue casi negro y no se vuelve un campo de tierra iluminada | [ ] | |
| G4 | Disolución radial hacia la bruma: material con `fog: false` y bruma propia en shader, densidad copiada de `scene.fog.density`, color cálido y **más luminoso** que el fondo | Perfil radial medido en tres bandas: la luminancia del suelo **sube** monótonamente con la distancia. `horizonStepEstimate` baja respecto de la línea base de 04-01 (el criterio duro de cierre es I4) | [ ] | |

---

## Fase H — Bosque y pasto (segura)

> Vive entera dentro del grupo `Environment · Hero airport`, ya oculto desde 30,5 %: **S3 a S7 no se enteran.**
> Regla de secuenciación nueva: **el bosque no se afina antes de que la bruma esté puesta.** H se implementa con los parámetros de partida de `plan4.md §3.2` y se afina en I3.

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| H1 | Conífera cercana instanciada: tronco prismático + 3 conos apilados, ~36 tris, una sola `InstancedMesh` | Captura de `01-hero.png` con un árbol cercano de ≥200 px de alto que **se lee como conífera**, tronco y copa escalonada distinguibles. Assert de normales: **`n.y ≥ 0,3` en toda la fronda, `n.y` medio ≥ 0,35**. Draw calls declarados. **Disparador de escotilla**: si no se cumple, se escala a Blender y se documenta con la captura que lo justifica | [ ] | |
| H2 | Bandas media y lejana con clustering desde el campo compartido: manchones de bordes irregulares, borde superior dentado, sin claros grandes | **`groundDetailEnergy` de la banda media ≥ 4× la línea base de 04-01** en `01-hero` y `02-takeoff`. Assert de distribución **no uniforme** (varianza de distancia al vecino más cercano vs. Poisson uniforme de la misma densidad). Captura donde la masa de árboles **cierra el horizonte** con silueta dentada | [ ] | |
| H3 | Pasto rehecho: normales dobladas explícitamente hacia +Y, radio de corte ~150 u, densidad ligada a la máscara compartida, viento con bypass de `prefers-reduced-motion`. Cierra el bug #19 | Captura donde el pasto lee como pasto iluminado con variación y **la tierra asoma entre los parches**. Assert de que cada instancia cae en máscara > umbral. Assert de `n.y > 0` en todos los vértices, contra el `n.y == 0` de hoy. Verificación del bypass de reduced-motion | [ ] | |
| H4 | Vegetación visible también en Mobile Low (bug #17) | Captura `08-mobile-hero.png` con vegetación. Draw calls de Mobile Low medidos y **declarados con su margen** contra el techo de 100, no sólo "pasa" | [ ] | |
| H5 | El avión no queda ocluido por el bosque | Conteo de píxeles de silueta del A380 en `01-hero.png` **dentro del 2 %** de la línea base de A6. Criterio cola–cielo de la ronda 2 (ΔY ≥ 0,05; contraste ≥ 1,5:1) sostenido o mejor | [ ] | |

---

## Fase I — Horizonte y profundidad atmosférica (semi-sistémica)

> Única fase de esta ronda que alcanza a S3, S4 y S6. Su regresión se verifica en J3.

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| I1 | Banda de horizonte en el domo de S1–S3 (`skyDomeMaterial.ts`): mezcla hacia el color de bruma entre ~+2° y −2° de elevación | Captura del cielo de S1/S2/S3 sin banding ni artefacto en la banda. **El domo de 128×64 con mipmaps que dejó B5 no puede volver a facetarse** — verificado en la misma serie `qa:d3` | [ ] | |
| I2 | Lo mismo en el domo de atardecer (`EnvironmentPlaceholder.tsx:106-118`, S6) | En `06c-sunset-clean-88.png`: la aerial perspective cálida de B6 (crominancia de la banda más lejana −21,0 → +97,8) **sostenida o mejor**, y el horizonte sin borde nuevo | [ ] | |
| I3 | Tres capas de profundidad legibles | Luminancia y crominancia medidas en las bandas cercana / media / lejana: **convergencia monótona** hacia el color de bruma en ambas, y separación entre bandas por encima de un delta declarado. Es acá donde se afinan los parámetros de densidad de H | [ ] | |
| I4 | **No hay borde recto en el horizonte** (criterio de cierre del bug #14) | **`horizonStepEstimate` ≤ 2× la mediana de \|ΔY\| de las 100 filas circundantes** en `01-hero`, `02-takeoff`, `08-mobile-hero` y `08b-mobile-taxi-13`. Y **serie `qa:d3` sobre 0,00–0,28 cuadro a cuadro** (`D3_QA_START=0 D3_QA_END=0.28`), no capturas sueltas: sin borde, sin popping, sin doble geometría en ningún cuadro | [ ] | |

---

## Fase J — Presupuesto, regresión y cierre

| # | Ítem | Verificación requerida | Estado | Evidencia |
|---|---|---|---|---|
| J1 | Presupuesto sostenido | Draw calls y triángulos en los tres tiers y las siete secciones, dentro de `PLAN.md §7.1`. Predicción declarada del plan: **+6 draw calls y ~110k triángulos**; la diferencia contra lo medido se **explica**, no se acepta | [ ] | |
| J2 | Mobile Low con margen amplio | ≤20 draw calls de 100 en el hero, con vegetación activa. Si no se llega, el ítem **queda sin marcar** y se registra por qué — el techo no se sube | [ ] | |
| J3 | Regresión en lo que la Fase I sí toca | `qa:visual` completo (20/20, 0 errores) y comparación contra la línea base de A6 en **S3, S4, S6 y S7**. `panelContrastEstimate` ≥ 4,5 y `clippedWhitePct` < 2 % sostenidos | [ ] | |
| J4 | Checklist de aceptación visual completo | Cada casilla de abajo con su evidencia. Una casilla sin evidencia queda sin marcar | [ ] | |

---

## Fase K — Heredadas de `plan3.md`, no re-planificadas

> Sin ítems propios. Existe para que lo diferido no se pierda ni se duplique. **Se siguen marcando en `progress3.md`**, no acá.

| Origen | Ítems | Estado | Decisión de esta ronda |
|---|---|---|---|
| `plan3.md` Fase D · Aeropuerto | D1–D5 | No comenzada | **Diferida entera** (`plan4.md §3.4`) |
| `plan3.md` Fase E · piezas 2 y 3 | E1–E5 | No comenzada | **Diferidas.** La pieza 1 se absorbió en G1/G4 y E6 en G3. **La puerta de 30,5 % no se toca en esta ronda** |
| `plan3.md` Fase F · Cielo y nubes | F1–F4 | No comenzada | **Diferida**, con orden obligatorio: la banda de horizonte (I1/I2) va **antes** que F2 |

---

## Checklist de aceptación visual final

> Se completa al cierre de la ronda, no antes. Espejo de `plan4.md §5`.

**Transversales:**
- [ ] El bosque cierra el horizonte: no hay una fila de árboles con cielo vacío detrás
- [ ] La distribución de vegetación es **no uniforme**, verificado numéricamente, y se lee como manchones
- [ ] La tierra rojiza asoma entre los parches de pasto; el suelo no es un verde continuo ni un color plano
- [ ] Las tres capas de profundidad se distinguen a simple vista y su convergencia hacia la bruma es monótona y medida
- [ ] **No hay ninguna línea recta en el horizonte** en ninguna captura del hero, escritorio y móvil
- [ ] La bruma **sube** la luminancia con la distancia, no la baja
- [ ] El A380 no queda ocluido: silueta dentro del 2 % de la línea base de A6
- [ ] Draw calls y triángulos dentro de `PLAN.md §7.1` en los tres tiers y las siete secciones
- [ ] **Mobile Low con vegetación** y con margen amplio (≤20 de 100)
- [ ] VRAM de textura declarada y dentro del techo de cada tier
- [ ] Determinismo del campo compartido asertado: dos corridas producen la misma imagen
- [ ] Ninguna regresión respecto de la línea base de A6 en S3–S7
- [ ] `prefers-reduced-motion` respetado por el viento del pasto
- [ ] FPS queda explícitamente para hardware físico: SwiftShader no es una medición válida de GPU

**Por sección:**
- [ ] **S1** — bosque denso que cierra el horizonte; tierra rojiza entre parches de pasto; terreno con textura y relieve; horizonte disuelto en bruma; árboles cercanos con volumen legible; avión sin ocluir; sin zonas quemadas (`< 2 %`)
- [ ] **S2** — misma ambientación sostenida desde la cámara alta y retrocediendo; sombra de contacto sostenida; sin borde de mundo en cuadro
- [ ] **S3** — sin regresión: contraste de overlay ≥ 4,5:1; cielo sin facetado ni banding tras la banda de horizonte
- [ ] **S4** — sin regresión respecto de la ronda 3
- [ ] **S5** — interior sin regresión; el suelo sigue casi negro donde su sección lo declara
- [ ] **S6** — sin regresión: aerial perspective cálida de B6 sostenida o mejor; exposición de B7 intacta
- [ ] **S7** — sin regresión; `scene.environment` vivo; atribución y enlace CC BY 4.0 visibles

---

## Registro de sesiones

| Fecha | Sesión | Qué se hizo | Qué quedó abierto |
|---|---|---|---|
| 2026-08-17 | Planificación de la ronda 4 (auditoría + `plan4.md` + `progress4.md`) | **Sesión exclusivamente de planificación, sin código de implementación.** Se leyeron `plan3.md` y `progress3.md` completos y se **verificó contra el árbol** (no sólo contra el documento) que las Fases 0/A/B están dentro y que **C, D, E y F siguen sin implementar**: `RunwayEnvironment.tsx:145-164` sigue siendo el clump de 3 triángulos verticales, `:184-186` la distribución uniforme en un rectángulo de 180×510 pegado a la pista, `EnvironmentPlaceholder.tsx:275` el quad único de 4000×4000, y `:524` la puerta binaria de 30,5 %. **Hallazgos nuevos que cambian el diseño respecto de lo que `plan3.md` había planificado**: (1) el corte del horizonte tiene causa de **color**, no de geometría — el suelo converge al color de niebla con la distancia (`F(2000) ≈ 1`) pero `skyDomeMaterial.ts:30` declara `fog: false` y el domo de atardecer también, así que el cielo no converge a nada y el salto persiste por más terreno que se agregue (bug #14); (2) la escala en pantalla del hero es **5–6× mayor** que la que midió `plan3.md §3.2` para justificar cross-billboards (un pino de 12 u mide 326 px a 40 u y 130 px a 100 u en S1, contra los 51 px que se midieron con la cámara de S3), así que la decisión de representación se invierte a **geometría sólida instanciada en las tres bandas, sin billboards** — y además el alpha-test es el peor caso de entrada para el SMAA que la Fase A3 acaba de introducir, algo que no existía cuando se tomó la decisión anterior; (3) el criterio de `plan3.md` C1 (*"normales con componente +Y dominante"*) es **geométricamente incorrecto para una conífera** — la normal lateral de un cono `r=1,6 h=4` tiene `n.y = 0,37`, mayormente horizontal — y cumplirlo obligaría a construir el árbol mal, así que se sustituye por `n.y ≥ 0,3` en toda la fronda y `n.y` medio ≥ 0,35 contra el `n.y == 0` exacto de hoy; (4) tras la Fase B el pasto **ya no lee negro** (4,04 %→0,11 % de negro puro en S2), así que lo que queda es un defecto de **forma y densidad**, no de luz, y un plan que lo trate como iluminación gasta el trabajo en el lugar equivocado; (5) la fusión del tren de la Fase 0 dejó **213 y 92 draw calls libres**, lo que hace que Mobile Low pueda mostrar vegetación por primera vez y que el riesgo de esta ronda sea de composición y niebla, no de presupuesto. Se documentaron **seis carencias nuevas** (#14–#19) con criterio de cierre. Decisiones de alcance tomadas y escritas: la Fase C de `plan3.md` queda **reemplazada** por las Fases G y H con criterios numéricos; la Fase E se **parte** (la pieza 1, el disco que sigue a la cámara, se absorbe como sustrato del hero; las piezas 2 y 3 se difieren sin duplicarse, y **la puerta de 30,5 % no se toca en esta ronda**); las Fases D y F se **difieren enteras**, con la nota de orden de que la banda de horizonte va antes que F2. Un único campo de densidad determinístico alimenta terreno, pasto y bosque, para que la tierra asome exactamente donde no hay pasto. El tinte de suelo por sección se preserva con una curva local **sin tocar `SECTION_ENVIRONMENT`**, y la bruma cálida se resuelve con `fog: false` y niebla propia en shader porque three.js reescribe `fogColor` cada frame en cualquier material con `fog: true`. | **Ningún ítem de las fases 0₄/G/H/I/J comenzado** — por diseño, esta sesión no escribió código de implementación. **Limitación honesta de esta sesión, y la razón de que exista la Fase 0₄**: no se pudo correr el sitio en un navegador (el contenedor viene sin `node_modules`, y una sesión de planificación no instala ni construye), así que la auditoría se apoya en lectura del árbol con archivo y línea, en las mediciones ya archivadas de `progress3.md`, en las capturas del estado actual aportadas por el usuario, y en derivaciones geométricas y fotométricas reproducibles a mano — cada número etiquetado por su procedencia. **Ninguno de esos números cuenta como evidencia de cierre**; 0₄ los vuelve a medir en el navegador antes de que ningún umbral se dé por bueno, y un `[derivado]` que la medición contradiga es un hallazgo que se registra, no un número que se ajusta en silencio. La implementación arranca por `npm install` y luego la Fase 0₄. Blender y ffmpeg ya están instalados desde la Fase B4; **`ktx` sigue sin instalar** y sólo hace falta si se dispara la escotilla de Blender de `plan4.md §3.2`. Sigue vigente de rondas anteriores el único límite no cubrible acá: la matriz de FPS y cross-browser en Safari/iOS y Android **físicos**, no sustituible por SwiftShader ni por emulación. |
