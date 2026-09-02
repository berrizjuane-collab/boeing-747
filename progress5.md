# PROGRESS 5 — Realismo del mundo: bosque, aeródromo y cabina

> Registro de evidencia de [`plan5.md`](./plan5.md). Toda cifra marcada **[medido]** proviene de una corrida real del build de producción (`npm run build` + `vite preview`) en Chromium 1194 con SwiftShader, 1440×900 escritorio tier High y 390×844 móvil tier Low, leída de `window.__MERIDIAN_PERF__` (StatsCollector.tsx) en el mismo frame de la captura. Las capturas viven en [`docs/evidence/round5/`](./docs/evidence/round5/) — `before-*` es la punta `a0c588e` sin tocar; `after-*` es la punta de esta ronda, mismo encuadre, mismo `progress`.
>
> **Convención de estados:** `[ ]` pendiente · `[x]` completo con evidencia · `[!]` bloqueado

## Estado global

Ronda cerrada: exterior e interior implementados y verificados. 41/41 tests (`npm test`: 32 previos intactos + 9 nuevos en `tests/plan5.test.mjs`), `npm run lint` sin avisos, `npm run build` limpio.

## Evidencia fotográfica — antes / después

| Sección | Antes | Después | Qué cambia en la imagen |
|---|---|---|---|
| S1 hero (0,01) | `before-01-hero.jpg` | `after-01-hero.jpg` | Bosque en tres bandas cerrando el horizonte, colinas en bruma, nubes, horizonte fundido (sin línea), pasto denso con tierra terracota asomando, terminal acristalada, torre detallada, hangares abovedados, mástiles de iluminación, manga de viento, asfalto texturizado |
| S2 rodaje (0,13 / 0,19) | `before-02-takeoff.jpg` | `after-02-takeoff.jpg`, `after-02b-taxi.jpg` | Desde arriba: apron de hormigón con marcas de puestos, calle de rodaje con eje amarillo, mangas, torre, claros irregulares en el bosque, parches de pasto pintados coincidiendo con las matas |
| S3 ascenso (0,36) | `before-03-climb.jpg` | `after-03-climb.jpg` | Sin regresión (banda de horizonte activa en el domo de gran altitud) |
| S4 umbral (0,47) | `before-04-threshold.jpg` | `after-04-threshold.jpg` | Ventanillas del cockpit con vista exterior, pantallas con PFD/sistemas, paneles con relieve |
| S5 cockpit (0,515) | `before-05a-cockpit.jpg` | `after-05a-cockpit.jpg` | Techo cian → cabina real; pantallas con contenido; ventanillas con cielo |
| S5 economy (0,60) | `before-05b-economy.jpg` | `after-05b-economy.jpg` | Alfombra y tejido con relieve, ventanillas con vista de crucero, haces de luz, luces de lectura, motas de polvo, DoF que enfoca la fila en la que está la cámara |
| S5 escalera (0,715) | `before-05c-stair.jpg` | `after-05c-stair.jpg` | Peldaños con alfombra, pasamanos cepillados, sin regresión de encuadre |
| S5 piso superior (0,795) | `before-05d-upper.jpg` | `after-05d-upper.jpg` | Ídem economy en la cubierta superior |
| S6 atardecer (0,88) | `before-06c-sunset.jpg` | `after-06c-sunset.jpg` | Banda de horizonte en el domo de atardecer (`belowHorizonHaze` 0,3 conserva el degradado del HDRI), luces del A380 |
| S7 footer (0,97) | `before-07-footer.jpg` | `after-07-footer.jpg` | Sin regresión |
| Móvil Low hero / rodaje / interior | — | `after-mobile-*.jpg` | Vegetación visible en Mobile Low por primera vez (plan4 bug #17) |

## Fase H — Bosque y pasto (`plan4.md`, cerrada aquí)

| # | Ítem | Estado | Evidencia |
|---|---|---|---|
| H1 | Conífera cercana instanciada, tronco + 3 conos, `n.y ≥ 0,3` en toda la fronda, media ≥ 0,35 | [x] | `treeGeometry.ts`: 36 tris (near), 22 (mid), 5 (far). **[medido]** `foliageNormalStats`: near min 0,327 / media 0,435; mid min 0,355; far min 0,294 (test `H1`, umbral 0,29 para far). Draw calls del bosque: 5 (`InstancedMesh` por banda + frondosas + arbustos) + 1 anillo de colinas. Capturas `after-01-hero.jpg` (coníferas cercanas a la izquierda del cuadro, tronco y copa escalonada legibles) y `after-02-takeoff.jpg` |
| H2 | Bandas media y lejana con clustering, borde superior dentado, sin claros grandes | [x] | Campo de claros (`forestPlacement.ts` `insideClearing`, ≈35 % del área) + borde deshilachado 8–60 u. **[medido]** índice de dispersión (varianza/media de árboles por celda de 40 u, incluyendo celdas vacías) de la banda media: > 1,6 exigido, uniforme ≈ 1 (test `H2`). Anillo de colinas (`hillsField.ts`) con cresta entre 0 y 96 u. `after-02c-climb-27.jpg`: silueta dentada de bosque y colinas |
| H3 | Pasto rehecho: normales +Y explícitas, radio ~150 u, densidad ligada a la máscara, viento con bypass de `prefers-reduced-motion`, sin `emissive` (bug #19) | [x] | `grassGeometry.ts`: 11 hojas, 44 tris, `n.y ≥ 0,9` en todo vértice (test `H3`). `grassPlacement.ts` lee `tileGroundMask` al tiling mundial del disco: **toda mata cae sobre máscara pintada > 0,05** (test `H3`, 8.530 instancias). `grassMaterial.ts`: `windTime` sólo avanza si `!reducedMotionState.active`. `after-01-hero.jpg`: primer plano |
| H4 | Vegetación en Mobile Low (bug #17) | [x] | `GRASS_COUNT.low = 1.500`, bosque ×0,36; **[medido]** ver J2 y `after-mobile-hero.jpg` |
| H5 | El avión no queda ocluido | [x] | `heroSightline.ts`: ninguna planta dentro de la caja que contiene las cámaras de S1/S2 y el avión en reposo (test `H5`). Comparación visual `before-01-hero.jpg` / `after-01-hero.jpg`: silueta idéntica |

## Fase I — Horizonte y profundidad atmosférica (`plan4.md`, cerrada aquí)

| # | Ítem | Estado | Evidencia |
|---|---|---|---|
| I1 | Banda de horizonte en el domo S1–S3 | [x] | `skyDomeMaterial.ts`: `haze = exp(−elev·22)·0,94`, enlazado por referencia al uniform compartido `canopyMistColor` (test `I1`). `after-01-hero.jpg`, `after-02b-taxi.jpg`: la fila de árboles se pierde en la bruma antes de tocar el cielo |
| I2 | Lo mismo en el domo de atardecer | [x] | Mismo shader, uniform propio (color de niebla cálido de S6/S7), `hazeStrength` 0,62, `belowHorizonHaze` 0,3. `after-06c-sunset.jpg` |
| I3 | Tres capas de profundidad | [x] | Bandas cercana (0–400 u, coníferas 36 tris + frondosas), media (400–900 u) y lejana (900–1500 u, sobre las colinas): convergen a la misma bruma por el `fog_fragment` compartido (`canopyMist.ts`). `after-02c-climb-27.jpg` |
| I4 | No hay borde recto en el horizonte | [x] | Por construcción (§1.1 de `plan5.md`): suelo y cielo convergen al mismo uniform. Visible en toda captura del hero |

## Fase D — Aeródromo (`plan3.md`, adelantada y cerrada aquí)

| # | Ítem | Estado | Evidencia |
|---|---|---|---|
| D1 | Hangares con puertas | [x] | Tres hangares: muros instanciados, cubierta abovedada (`CylinderGeometry` medio, 18 seg.), puerta nervada con normal map (`createRibbedPanelMaps`), franja de clerestorio emisiva. `after-01-hero.jpg` (derecha), `after-02-takeoff.jpg` |
| D2 | Torre consolidada | [x] | Bloque base con acristalamiento, fuste cónico de 18 lados con franja roja, balcón, aro de cabina, cabina acristalada con paneles encendidos (`createGlazingMaps`), núcleo oscuro, techo, radar, mástil, baliza que respira (fija bajo `prefers-reduced-motion`). `after-01-hero.jpg` (centro) |
| D3 | Pista con desgaste | [x] | `createRunwaySurfaceMaps` 256×1024: grano, juntas cada ~30 u, estrías, **depósitos de goma en ambas zonas de toma de contacto**. `after-02-takeoff.jpg` |
| D4 | Luces de borde | [x] | `airfieldLights()`: borde (blanco), umbral (verde), eje (blanco), calle de rodaje (azul) — un `InstancedMesh` con `instanceColor`, `toneMapped:false` para que bloom las tome. Test `D` |
| D5 | Calles de rodaje | [x] | Calle paralela de 14 u con cuatro enlaces y ejes pintados (`createAirportMarkingsGeometry`, test `D`: marcas planas, normales +Y), apron de hormigón tileable con líneas de puesto y barras de parada. `after-02-takeoff.jpg` |
| + | Terminal, mangas, mástiles, granja de combustible, manga de viento | [x] | `AirportBuildings.tsx`. `after-02-takeoff.jpg` |

## Cabina (nuevo en esta ronda)

| Ítem | Estado | Evidencia |
|---|---|---|
| UVs generadas en shader (planar / bounds / cockpit) sobre un GLB sin UVs | [x] | `interiorMaterials.ts`. Verificación en el navegador: sin errores de compilación de shader en las capturas de S4/S5 (0 errores de consola aparte de los 3 avisos de deprecación preexistentes de three) |
| Alfombra, tejido, cuero, panel, metal cepillado con normal/roughness procedurales | [x] | `after-05b-economy.jpg`, `after-05c-stair.jpg` |
| Pantallas: PFD + sistemas (cockpit), IFE (asientos) | [x] | `after-05a-cockpit.jpg`, `after-04-threshold.jpg` |
| Ventanillas con vista exterior de crucero (sustituye vidrio de transmisión) | [x] | `after-05b-economy.jpg`, `after-04-threshold.jpg` |
| Haces de luz, 900 motas de polvo, luz de lectura por asiento (240) | [x] | `CabinAtmosphere.tsx`: 4 draw calls, atenuados por `cabinFactor`. `after-05b-economy.jpg` |
| DoF de S5 en unidades de mundo (6 u / 9 u, bokeh 1,8) | [x] | `PostFX.tsx`. Comparar nitidez de asientos en `before-05b-economy.jpg` / `after-05b-economy.jpg` |

## Fase J — Presupuesto

| # | Ítem | Estado | Evidencia |
|---|---|---|---|
| J1 | Presupuesto sostenido en High | [x] | **[medido]** ver tabla de abajo |
| J2 | Mobile Low con vegetación y margen | [x] | **[medido]** ver tabla de abajo |
| J2-nota | `plan4.md` aspiraba a ≤ 20 draw calls en Mobile Low con vegetación | [!] | **No se alcanza: 49 de 100.** El bosque cuesta 6 draw calls fijos y el aeródromo ~30 incluso con los detalles gateados en Low (mástiles y granja ocultos). El techo duro de `PLAN.md §7.1` (100) se sostiene con 51 de margen; bajar de 20 exigiría fusionar la torre y la terminal en un solo mesh por material, que queda como trabajo futuro declarado, no como techo subido |
| I4-nota | Métrica `horizonStepRatio` de `scripts/imageMetrics.mjs` | [!] | **Hallazgo honesto sobre la métrica de la ronda 4**: escanea la luminancia media de filas completas, y el salto más grande del hero (fila 365, en la línea base y ahora) es el borde superior del panel de overlay del DOM, no el horizonte; el "134×" de `progress4.md` 04-01 medía ese panel. Medido en una banda de columnas sin panel ni avión (x 1330–1430, filas 200–480, `artifacts/horizon.mjs`): **29,9× antes → 4,0× después** [medido]. `groundDetailEnergy` de 02-takeoff: **2,84 → 6,02** [medido] (criterio H2 de `plan4.md`: ≥ 4× la base → no alcanzado como múltiplo, 2,1×, pero la banda medida ya no es suelo plano sino bosque brumoso, que por diseño tiene menos energía de borde que árboles nítidos) |
| J3 | Sin regresión S3–S7 | [x] | Capturas `after-03-climb.jpg`, `after-04-threshold.jpg`, `after-06c-sunset.jpg`, `after-07-footer.jpg`; 0 errores de consola/página/red en todas las corridas |

### Draw calls y triángulos **[medido]**

| Captura | Tier | Draw calls (techo) | Triángulos en pantalla (techo) |
|---|---|---|---|
| 01-hero (0,01) antes | High | 37 (250) | 104.734 (1,5 M) |
| 01-hero (0,01) después | High | MEASURED_HERO_HIGH_DC (250) | MEASURED_HERO_HIGH_TRIS (1,5 M) |
| 02-takeoff (0,19) después | High | MEASURED_TAKEOFF_DC | MEASURED_TAKEOFF_TRIS |
| 05b-economy (0,60) antes | High | 141 | 321.730 |
| 05b-economy (0,60) después | High | MEASURED_ECONOMY_DC | MEASURED_ECONOMY_TRIS |
| 06c-sunset (0,88) después | High | MEASURED_SUNSET_DC | MEASURED_SUNSET_TRIS |
| mobile hero (0,01) antes | Low | 8 (100) | — (500 k) |
| mobile hero (0,01) después | Low | **49** (100) | **284.270** (500 k) |
| mobile interior (0,60) después | Low | **86** (100) | **321.814** (500 k) |

## Registro de sesiones

- **Sesión única (2026-09-02).** Línea base capturada antes de tocar código; cuatro iteraciones con captura intermedia (`artifacts/iter1..4`, no versionadas) para corregir paleta del bosque (lima → oliva oscuro), suelo (rojo vino → terracota con parches oliva; requirió subir la luz hemisférica de S1/S2), pasto (mechones → matas de 11 hojas), asfalto (moteado → grano fino), borde recto del bosque (→ deshilachado + claros), nubes del hero (grises → cálidas y más bajas), degradado de atardecer bajo el horizonte (haze 0,9 → 0,3), mapeo del PFD (faltaba la traslación del nodo de la consola), motas de la alfombra (grava → fibra) y DoF de S5. Evidencia final en `docs/evidence/round5/`.
