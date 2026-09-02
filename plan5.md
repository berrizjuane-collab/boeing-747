# PLAN 5 — Realismo del mundo: bosque, aeródromo y cabina

> **Estado de los documentos previos.** `PLAN.md`/`PROGRESS.md`, `plan2.md`/`progress2.md` y `plan3.md`/`progress3.md` quedan como estaban. `plan4.md`/`progress4.md` cierran con esta ronda: sus Fases 0₄ y G ya estaban implementadas; **las Fases H (bosque y pasto) e I (horizonte y profundidad atmosférica) se implementan aquí**, y las Fases D (aeropuerto) y F2 (nubes en S1/S2) de `plan3.md`, que `plan4.md` difería, se adelantan porque el brief de esta ronda las pide explícitamente. Este documento y `progress5.md` son los **documentos activos**.
>
> **Brief de la ronda** (texto del pedido): *"le hace falta muchísimas mejoras visuales. Realismo, mejoras en el césped, naturaleza, árboles, cielo, edificios y torres de control, detalles, colores, un montón […] mejoras drásticas y notables, con evidencias fotográficas, tanto en exterior (torres, edificio, naturaleza) como en interior de avión."* Control libre de planeo y ejecución.
>
> **Procedencia de los números.** Esta ronda **sí corrió el sitio en un navegador** (Chromium 1194 + SwiftShader, `vite preview` del build de producción) en cada iteración. Todo número de `progress5.md` está etiquetado **[medido]** con la captura que lo produjo. Las capturas de evidencia viven en `docs/evidence/round5/` (JPEG q82, 1440×900 escritorio High y 390×844 móvil Low).

---

## 0. Diagnóstico de partida (línea base, `docs/evidence/round5/before-*.jpg`)

Leído sobre las capturas de la punta `a0c588e` (Fase G cerrada) y sobre el código:

| Carencia | Dónde | Evidencia |
|---|---|---|
| El cielo termina en una **línea recta de color** contra el suelo; el domo no participa de la niebla (`plan4.md` bug #14) | `skyDomeMaterial.ts` `fog:false`, domo de atardecer `MeshBasicMaterial` | `before-01-hero.jpg`: salto de luminancia fila a fila 134× la mediana local (`progress4.md` 04-01) |
| Los "árboles" son **matas de 3 triángulos** (`n.y == 0`), pegadas a la pista, y **no existe nada** más allá de `\|x\| = 90` | `RunwayEnvironment.tsx` `VegetationBands` | `before-02-takeoff.jpg`: puntas negras sobre un plano rojo hasta el horizonte |
| El pasto es un velo verde `emissive` sin volumen (`plan4.md` bug #19) y Mobile Low no lo renderiza (bug #17) | ídem | ídem |
| El aeropuerto son **tres cajas y cinco cilindros de 10 lados** | `DistantAirport` | `before-01-hero.jpg`: hangar-caja negro, torre-tubo |
| La pista es **un color plano** (#394043) | `Runway()` | ídem |
| El cielo de S1/S2 está **vacío** (`plan3.md` F2, diferido dos rondas) | — | ídem |
| El interior son **16 colores planos sin una sola textura**; el GLB no trae UVs; las ventanillas son vidrio de transmisión que muestra el casco oscuro; las pantallas son rectángulos cian | `interior.glb`, `InteriorAsset.tsx` | `before-05a-cockpit.jpg`, `before-05b-economy.jpg`: techo cian, paneles lisos |
| El DoF de S5 enfoca a **45 u** (valores normalizados `0.015/0.03` contra near 0.1 / far 3000) en un pasillo de 30 u: **toda la cabina desenfocada** | `PostFX.tsx` | `before-05b-economy.jpg` |
| El avión no tiene **luces** de navegación ni anticolisión | `ExteriorAsset.tsx` | — |

---

## 1. Decisiones de diseño

### 1.1 Una sola bruma para todo lo que toca el suelo (cierra bug #14)

`plan4.md §3.6` estableció la "bruma de dosel" para el terreno (G4). Esta ronda la **saca a un módulo compartido** (`src/lib/canopyMist.ts`): un único uniform `canopyMistColor`, mutado una vez por frame por `TerrainGround`, y un parche de `fog_fragment` que **terreno, bosque, pasto, colinas, nubes del hero y los dos domos de cielo** enlazan por referencia. Consecuencia estructural: el suelo converge hacia ese color desde abajo y el cielo converge hacia el mismo color desde arriba (banda de horizonte `exp(−elevación·22)·0.94`), así que **no queda ningún salto de color en la línea de horizonte** por construcción, no por calibración. El domo de atardecer usa el mismo shader con su propio uniform (el color de niebla cálido de S6/S7 que `EnvironmentPlaceholder` ya derivaba) y una haze bajo el horizonte de 0,3 para conservar el degradado del HDRI.

### 1.2 Bosque sólido instanciado (plan4 H1/H2), con claros y borde deshilachado

Geometría sólida en tres bandas (`treeGeometry.ts`: tronco prismático + 3/2/1 conos abiertos, 36/22/5 tris), más frondosas (4 esferas de 6×4, 156 tris) y arbustos (60 tris) en la banda cercana, más un **anillo de colinas** (`hillsField.ts`, 520–1400 u, hasta 96 u de alto) que da al horizonte una silueta dentada y a la banda lejana laderas donde pararse. Colocación pura y testeable (`forestPlacement.ts`): campo de densidad compartido de `terrainField.ts` + **campo de claros** de mayor escala (≈35 % del área) + **borde deshilachado** (margen 8–60 u por ruido) contra el keep-out del aeródromo + **caja de línea de vista del hero** (`heroSightline.ts`) para que ningún árbol se interponga entre la cámara de S1/S2 y el avión (plan4 H5). El material (`forestMaterial.ts`) es `MeshStandardMaterial` con AO horneado por vértice, color por instancia, tronco por uniform y viento sutil en el vertex shader (congelado bajo `prefers-reduced-motion`).

**Corrección de criterio** (plan4 §3.4): `n.y ≥ 0,3` en toda la fronda de conífera y media ≥ 0,35 en la cercana — **medido 0,327 / 0,435** (near), 0,355 (mid), 0,294 (far, redondeado a 0,29 en el test).

### 1.3 Pasto que crece exactamente donde la textura lo pinta (plan4 H3/H4, bugs #17 y #19)

Matas de 11 hojas curvadas (`grassGeometry.ts`, 44 tris) con **normales dobladas hacia +Y explícitas** (`n.y ≥ 0,9` en todo vértice, contra el 0 exacto anterior), AO por vértice, viento por `aHeight²` y **sin emissive**. La densidad de colocación (`grassPlacement.ts`) se lee de **la misma máscara periódica que pinta el albedo del terreno** (`tileGroundMask`, muestreada al tiling mundial del disco), así que una mata sólo puede caer sobre un texel verde y la tierra asoma exactamente donde no hay mata — la propiedad 2 de `plan4.md §3.1` como hecho estructural. Densidad decreciente con la distancia al hero (sub-10 px pasados ~150 u, `plan4.md §1.5`), instancias ordenadas por cercanía para que cada tier conserve un prefijo. **Mobile Low renderiza 1.500 matas** en el mismo draw call.

### 1.4 Aeródromo (plan3 Fase D, adelantada)

Plano de planta en `airportLayout.ts` — **una sola fuente** para los meshes (`AirportBuildings.tsx`) y para el keep-out de vegetación (`aerodromeKeepOut.ts`), que ahora abarca pista, calle de rodaje paralela con cuatro enlaces, apron de hormigón, terminal, torre, hangares y granja de combustible. Composición autorada contra la cámara de S1 (azimut −137,5°, semi-FOV horizontal 34°): terminal acristalada con tres mangas en el tercio izquierdo tras la cola, torre (fuste cónico, balcón, cabina acristalada con paneles iluminados, radar, mástil y baliza que respira) justo a la derecha del centro tras la raíz alar, fila de tres hangares de cubierta abovedada y puerta nervada a la derecha tras la nariz, bosque cerrando detrás. Texturas procedurales (`airportSurfaceMaps.ts`): asfalto con grano, juntas y **depósitos de goma en ambas zonas de toma de contacto**; hormigón de losas tileable; acristalamiento con montantes y paneles encendidos; puerta nervada. Luces de pista (borde, umbral verde, eje), de calle de rodaje (azules), mástiles de iluminación del apron, manga de viento animada.

### 1.5 Cielo del hero (plan3 F2, adelantada) y luces del avión

Ocho nubes suaves derivadas del azimut de la cámara de S1, que se disuelven hacia la bruma de dosel (no hacia el color de niebla oscuro). Luces de navegación/anticolisión del A380 como un solo draw call de sprites aditivos (`AircraftNavLights.tsx`), con posiciones **medidas de los extremos reales del casco** (puntas alares, tope del estabilizador, cresta y vientre del fuselaje) y programas de parpadeo congelados bajo `prefers-reduced-motion`.

### 1.6 Cabina: PBR procedural sobre un GLB sin UVs

El GLB publicado trae sólo `POSITION` y `NORMAL`. En vez de re-exportarlo (Blender no está en el contenedor), cada material se parchea en tiempo de carga (`interiorMaterials.ts`) con **UVs generadas en el vertex shader**: proyección planar por eje dominante de la normal (alfombras, tejido, paneles, metal, cuero), caja envolvente del primitivo (pantallas de asiento y ventanillas: un contenido por pieza, sea cual sea su tamaño) y un modo específico para el panel de vuelo (las cuatro pantallas principales a x = ±1,08/±1,77 reciben cada una el PFD del atlas; cualquier otra cara de pantalla, la mitad "sistemas"). Contenido procedural (`interiorSurfaceMaps.ts`): PFD con esfera de actitud, cintas de velocidad/altitud y FMA; IFE con mapa en movimiento; **vista exterior de crucero por las ventanillas** (cénit azul → banda de bruma → cubierta de nubes → suelo brumoso, panorámica entre ventanillas contiguas) sustituyendo al vidrio de transmisión (un pase escena-a-textura por frame que sólo mostraba el casco oscuro). Atmósfera (`CabinAtmosphere.tsx`): haces de luz por las ventanillas de estribor (cálidos) y babor (fríos), 900 motas de polvo a la deriva y una luz de lectura por asiento, todo atenuado por el mismo `cabinFactor` de `InteriorLighting`. **DoF de S5 pasado a unidades de mundo** (foco 6 u, rango 9 u).

### 1.7 Lo que no se toca

`thresholdLighting.ts`, `ExposurePass`, `SectionGrade`, los pesos de HDRI, la puerta de 30,5 % (`plan3.md` E1) y el camino de cámara. `SECTION_ENVIRONMENT` recibe **un único cambio**: la luz hemisférica de S1/S2 sube de 0,4 a 0,72/0,70 con un cielo menos saturado (`#dcbba3`), porque con el sol a 6° el suelo nuevo se leía rojo vino y los parches de pasto pintados desaparecían bajo la luz cálida — documentado con captura antes/después en `progress5.md`.

---

## 2. Presupuesto

| | Desktop High hero | Desktop High S5 | Mobile Low hero |
|---|---|---|---|
| Techo `PLAN.md §7.1` | 250 dc / 1,5 M tris | 250 / 1,5 M | 100 / 500 k |
| Antes (línea base) | 37 / 104.734 | 141 / 321.730 | 8 / — |
| **Después [medido]** | ver `progress5.md` J1 | ver `progress5.md` J1 | ver `progress5.md` J2 |

Los draw calls no cambian con el tier; sólo el `count` de cada `InstancedMesh` (bosque ×1 / ×0,62 / ×0,36; pasto 8.000 / 3.600 / 1.500) y los detalles de aeropuerto marcados como opcionales en Low.

---

## 3. Verificación

- `tests/plan5.test.mjs` (9 tests): contrato de normales de fronda (H1), presupuesto de triángulos por instancia, determinismo y **sobredispersión** del bosque contra un Poisson uniforme (H2, índice de dispersión medido sobre celdas de 40 u incluyendo las vacías), exclusión de keep-out y línea de vista (H5), pasto sobre máscara pintada y `n.y > 0,5` (H3), colinas nulas en la cuenca y cresta dentada, huellas del aeródromo dentro del keep-out y marcas planas, determinismo/tileabilidad de las texturas nuevas, y el enlace por referencia de la bruma en ambos domos (I1/I2).
- La suite previa (32 tests) sigue en verde sin modificar ninguna aserción.
- Evidencia fotográfica antes/después por sección en `progress5.md`.
