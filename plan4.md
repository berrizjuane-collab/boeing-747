# PLAN 4 — Ambientación Natural del Hero

> **Estado de los documentos previos.** `PLAN.md` / `PROGRESS.md` (ronda 1), `plan2.md` / `progress2.md` (ronda 2) quedan **cerrados**. `plan3.md` / `progress3.md` (ronda 3) quedan **parcialmente cerrados**: sus Fases 0, A y B están implementadas y verificadas con evidencia; sus Fases C, D, E y F **no se comenzaron**. Este documento, `plan4.md`, es el **documento activo** de aquí en adelante, junto con su checklist espejo `progress4.md`. Lo que `plan4.md` no absorbe explícitamente de `plan3.md` sigue vivo en `plan3.md` y se remite desde la §4 · Fase K — no se re-planifica ni se duplica.
>
> **Sesión de planificación.** Ni una línea de este documento es código de implementación. Los únicos entregables de la sesión que lo produjo son `plan4.md` y `progress4.md` (más el movimiento de punteros en `README.md`, `plan3.md` y `progress3.md`).
>
> **Honestidad sobre la procedencia de los números.** Esta sesión de planificación **no pudo correr el sitio en un navegador**: el contenedor viene sin `node_modules`, y `npm install` + `build` + `preview` queda fuera de lo que una sesión de planificación puede hacer. Por eso cada número de la §1 está etiquetado como **[medido]** (tomado de las corridas reales archivadas en `progress3.md`), **[derivado]** (calculado a mano desde constantes del código, reproducible con una calculadora) o **[observado]** (leído de las capturas del estado actual que aportó el usuario). **Ningún número de este documento sirve como evidencia de cierre de nada** — la Fase 0₄ existe precisamente para volver a medirlos en el navegador antes de que ningún umbral se dé por bueno. Ver §7, punto 9.

---

## 0. Por qué existe esta ronda

Las Fases A y B de la ronda 3 arreglaron **cómo se ilumina** el mundo: tone mapping real, grading que llega a los highlights, antialiasing, `scene.environment` vivo, luz hemisférica, key alineada al sol de cada HDRI, HDRI recalibradas y a 4096×2048, cielo sin facetado, aerial perspective cálida en S6, exposición de S6 que alcanza neutro. Todo eso está medido y sigue siendo cierto.

**Lo que falta ahora no es cómo se ilumina el mundo, sino qué hay en él.** El hero (S1/S2) es lo que se ve primero y es lo que más lejos está de la vara. En las palabras del pedido:

> *"los 'árboles' son puntas verdes sin volumen, el césped es de un solo verde sin textura, y el plano de 4000×4000 que hace de suelo termina en un borde recto artificial contra el cielo."*

Las tres cosas son literalmente ciertas y las tres tienen causa en el código, con archivo y línea (§1). Ninguna es un bug de iluminación: la Fase B ya sacó el pasto del negro (`progress3.md` B1: negro puro 4,04 % → 0,11 % en S2). **Lo que queda es un problema de forma, densidad y composición de profundidad.**

La ronda 4 tiene una imagen de referencia como ancla de dirección de arte, descrita en palabras medibles en §3.1. El objetivo se puede enunciar en una línea: **llevar la vegetación, el terreno y el fondo natural del nivel de "identificable sin ambigüedad" —que es todo lo que pedía `plan3.md` C1— a un bosque denso y creíble con tierra rojiza asomando entre el pasto y capas de profundidad atmosférica que disuelven el horizonte.**

**La vara de aceptación no cambia y no se rebaja:** el criterio de cada ítem es una afirmación sobre la imagen renderizada, no sobre el estado del código. El contrato anti-cosmético (§7) se mantiene íntegro y se le agregan dos cláusulas.

---

## 1. Auditoría del estado actual

Auditoría ejecutada leyendo el árbol completo en `8696479` (la punta de la ronda 3, con Fases 0/A/B ya dentro), cruzada contra las mediciones archivadas en `progress3.md` y contra las capturas del estado actual aportadas por el usuario. **No repite la auditoría de `plan3.md §1`** — parte de ella y documenta qué sigue igual, qué cambió, y qué es nuevo.

### 1.1 Qué sigue exactamente igual que en la auditoría de la ronda 3

Verificado línea por línea en el árbol de hoy, no asumido desde el documento:

| Carencia (auditada en `plan3.md §1`) | Archivo:línea hoy | Estado |
|---|---|---|
| Los "árboles" son matas de 3 triángulos verticales cruzados a 0°/60°/120°, base 0.48, ápice en `y=1` | `src/components/RunwayEnvironment.tsx:145-164` | **Sin cambios** |
| Normales horizontales: `computeVertexNormals()` sobre triángulos verticales da `N.y == 0` | `RunwayEnvironment.tsx:161` | **Sin cambios** |
| Distribución uniforme sin clustering ni ruido de densidad | `RunwayEnvironment.tsx:183-188` | **Sin cambios** |
| El pasto sólo existe en `\|x\| ∈ [18, 90]`, `z ∈ [-255, 255]` | `RunwayEnvironment.tsx:184-186` | **Sin cambios** |
| Suelo = un único quad `planeGeometry(4000, 4000)`, dos triángulos, sin subdivisión ni mapa de ningún tipo | `src/components/EnvironmentPlaceholder.tsx:275-276` | **Sin cambios** |
| Apron = `planeGeometry(162, 112)` gris plano | `RunwayEnvironment.tsx:288-291` | **Sin cambios** |
| Hangares = 3 cajas instanciadas, torre = 5 meshes sueltos con cilindros de 10 lados | `RunwayEnvironment.tsx:219-335` | **Sin cambios** |
| Todo el mundo terrestre se apaga de golpe en `progress < 0.305` | `RunwayEnvironment.tsx:524` | **Sin cambios** |
| El plano de suelo se desvanece entre 0.28 y 0.305 y luego `visible = false` | `EnvironmentPlaceholder.tsx:33-34, 152-157` | **Sin cambios** |

**Conclusión formal, que este documento necesita dejar por escrito: las Fases C, D, E y F de `plan3.md` siguen sin implementar, ni parcial ni tentativamente.** `progress3.md` las tiene con los 15 ítems en `[ ]` y sin una sola celda de evidencia, y el árbol lo confirma. Su destino en esta ronda se decide en §3.4.

**El dato que explica el fondo vacío**, y que no estaba enunciado así en la ronda 3: el rectángulo de vegetación mide **180 × 510 unidades pegado a la pista** y **no hay una sola instancia más allá de `\|x\| = 90`** `[derivado de RunwayEnvironment.tsx:184-186]`. Todo lo que la cámara del hero ve más allá de esa franja es plano de suelo desnudo hasta el horizonte. No es que la naturaleza de fondo esté mal resuelta: **no existe**.

### 1.2 Qué cambió con la Fase B y modifica el diagnóstico de la ronda 3

`plan3.md §1.1` atribuía el aspecto del pasto a **cinco** factores multiplicativos. La Fase B cerró dos de ellos, y eso cambia qué hay que arreglar ahora:

| Factor de `plan3.md §1.1` | Estado tras la Fase B |
|---|---|
| 3 · No hay `ambientLight` ni `hemisphereLight` en el exterior | **Cerrado (B1)**. `hemisphereLight` en `EnvironmentPlaceholder.tsx:267`, con sky/ground por sección desde `environmentTheme.ts`. Negro puro en S2: **4,04 % → 0,11 %**, piso p5 de luminancia **0,21 → 6,02** `[medido, progress3.md B1]` |
| 4 · El único piso de luminancia era un `emissive` verde muy oscuro | **Mitigado por B1**, pero el `emissive #314431 × 0.42` sigue en `RunwayEnvironment.tsx:209-210` y ahora sólo aporta un velo verde sucio sobre una superficie que ya recibe luz |
| 1 · Normales horizontales | **Abierto.** `N.y == 0` sigue |
| 2 · Rotación Y aleatoria que hace variar `N·L` entre ~0 y ~0,66 | **Abierto** |
| 5 · `receiveShadow` no-op | **Cerrado (A5, bug #7)** en el exterior |

**Esto reencuadra el problema.** Antes de la Fase B, el pasto se veía negro. Después de la Fase B, el pasto **se ve** — y lo que se ve son matas planas con el sombreado equivocado. El defecto pasó de ser de luz a ser de **forma, volumen y densidad**, que es exactamente lo que reporta el pedido de esta ronda. Cualquier plan que siga tratando esto como un problema de iluminación va a gastar el trabajo en el lugar equivocado.

### 1.3 El corte del horizonte tiene una causa de **color**, no sólo de geometría

Hallazgo nuevo de esta auditoría, y el que más cambia el diseño del fix.

`FogExp2` en three.js calcula `F(d) = 1 − exp(−(ρ·d)²)`. Con la densidad declarada de S1 (`ρ = 0.0015`, `environmentTheme.ts:174`) `[derivado]`:

| distancia (u) | 200 | 400 | 600 | 800 | 1000 | 1400 | 2000 |
|---|---|---|---|---|---|---|---|
| **F (fracción de niebla)** | 0,086 | 0,302 | 0,555 | 0,763 | 0,895 | 0,988 | 0,99988 |

El borde del plano de suelo está a ±2000 u del origen, o sea llega a cuadro con **F ≈ 1: es niebla pura, del color exacto de la niebla**. Agrandar el plano no cambia nada; subir `far` tampoco (y `plan3.md §4 Fase E` ya explicó por qué subir `far` de 3.000 a 12.000 degradaría 4× la precisión de profundidad, con las marcas de pista viviendo a 5 mm del asfalto con `polygonOffset`).

**El problema es que el cielo no participa de la niebla.** `src/lib/skyDomeMaterial.ts:30` declara `fog: false`, y el material del domo de atardecer también (`EnvironmentPlaceholder.tsx:113`). El domo pinta la HDRI cruda hasta el horizonte. Entonces lo que se ve es:

- **debajo de la línea de horizonte**: suelo al 100 % del color de niebla (`#9f6246` en S1, mezclado por `duskColorMix` sólo en S6/S7)
- **encima**: HDRI de golden-hour sin atenuar, mucho más luminosa cerca del sol

**El "borde recto" es ese salto de color, y va a seguir ahí por más terreno que se agregue.** No se cierra sin hacer converger las dos superficies (§3.7).

Geometría del encuadre `[derivado]`, cámara de S1 (`cameraPath.ts:21`, `[60, 8, 55] → [0, 6, 0]`, fov 45 vertical, 1440×900): la línea de horizonte cae ~26,5 px **por encima** del centro del cuadro, y el borde del plano a 2.060 u de la cámara cae 4,3 px por debajo de esa línea. La banda de suelo ocupa aproximadamente **la mitad inferior del cuadro**, desde 18 u de distancia en el borde inferior hasta el horizonte. Es mucha superficie para que sea un color plano.

### 1.4 Escala en pantalla del hero — corrige un supuesto de `plan3.md §3.2`

`plan3.md §3.2` midió que *"a 36 % de scroll, un árbol de 12 u a 300 u de distancia mide 51 px de alto"* y concluyó, con razón para ese caso, que *"un cross-billboard de 2 quads con copa procedural y alpha-test es indistinguible de un árbol modelado a ese tamaño"*.

**Esa medición es de la cámara de S3, no de la del hero.** En S1 (fov 45 vertical, alto 900 px) los píxeles por unidad a distancia *d* son `900 / (2·tan(22,5°)·d) = 1086,5 / d` `[derivado]`:

| distancia (u) | 40 | 100 | 250 | 400 | 600 | 1000 | 1400 |
|---|---|---|---|---|---|---|---|
| **alto en px de un pino de 12 u** | **326** | **130** | 52 | 33 | 22 | 13 | 9 |

**Un árbol cercano en el hero es 5–6× más grande en pantalla que el árbol que `plan3.md §3.2` midió.** El supuesto de que un billboard alcanza es correcto a la distancia de S3 y **falso en el hero**. La decisión de representación se revisa en §3.2 por esta razón concreta y medida, no por preferencia.

### 1.5 Por qué el pasto se lee como "puntas", en números

Altura real de una mata: `scale.y = 0.55 + random()·1.05` sobre una geometría cuyo ápice está en `y = 1` (`RunwayEnvironment.tsx:153, 187-188`) → **0,55 a 1,6 unidades** `[derivado]`. Con la escala de §1.4:

| distancia (u) | 40 | 100 | 150 | 250 |
|---|---|---|---|---|
| **alto en px de una mata de 0,55–1,6 u** | 15–43 | 6–17 | 4–12 | 2–7 |

Por encima de ~150 u una mata individual es sub-10 px: no aporta forma, aporta ruido de alta frecuencia — que es exactamente lo que hoy pelea con SMAA. **Esto fija dos cosas del diseño**: un radio de corte del pasto instanciado (~150 u), y la obligación de que el detalle del suelo a media distancia venga de la **textura del terreno**, no de más instancias. Es la misma conclusión a la que llega cualquier pipeline de vegetación, pero acá está anclada al fov y al viewport reales de este sitio.

### 1.6 Bandas de profundidad disponibles en el hero

Combinando §1.3 y §1.4, el hero tiene exactamente este presupuesto de escenografía `[derivado]`:

| banda | distancia | niebla | qué puede sostener |
|---|---|---|---|
| **cercana** | 0–250 u | F < 0,13 | Forma, color y contraste plenos. Tronco y copa legibles (52–326 px). Es donde la tierra rojiza tiene que verse como tierra |
| **media** | 250–700 u | F 0,13–0,63 | Masa y silueta. El color empieza a aplanarse hacia la bruma. Árboles de 22–52 px: se leen como bosque, no como árboles |
| **lejana** | 700–1400 u | F 0,63–0,99 | Casi monocroma. Sólo sirve para valor y silueta (9–22 px) |
| **más allá** | > 1400 u | F ≈ 1 | Bruma pura. Poner geometría acá es gastar triángulos en píxeles de un solo color |

**Todo lo que la imagen de referencia consigue por capas tiene que caber en esos 1.400 unidades.** Esto también acota el radio del bosque: no hace falta poblar hasta el borde del mundo.

### 1.7 Presupuesto vigente — el que dejó la ronda 3, no el de su auditoría

Éste es el cambio de contexto más importante respecto de `plan3.md §1.9`, y hay que enunciarlo porque invita a decisiones opuestas:

| | Desktop High hero (0.01) | Mobile Low hero (0.01) |
|---|---|---|
| Draw calls en la auditoría de la ronda 3 | 148 / 250 | **99 / 100** |
| **Draw calls hoy, tras Fases 0/A/B** | **37 / 250** | **8 / 100** `[medido, progress3.md]` |
| Triángulos hoy | 86.304 / 1.500.000 | 83.842 / 500.000 |
| **Margen libre** | **213 draw calls** | **92 draw calls** |

La fusión de las 115 mallas de `LandingGear` (Fase 0, ítem 02) es lo que hace posible esta ronda entera. Dos consecuencias directas:

1. **Mobile Low puede mostrar vegetación por primera vez.** Hoy `RunwayEnvironment.tsx:204` la oculta entera en ese tier y `VEGETATION_COUNT.low = 0` (`:143`). Eso era correcto cuando quedaba 1 draw call de margen; con 92 libres es una mutilación sin motivo.
2. **El costo de esta ronda no es el problema.** El diseño de §3 gasta ~6 draw calls y ~110k triángulos; el riesgo real está en **composición, color y niebla**, y así debe verificarse. Es la misma conclusión que `plan3.md §4 Fase E` sacó para su propio caso.

### 1.8 Estado de las fases heredadas de `plan3.md`

| Fase de `plan3.md` | Ítems | Estado real | Destino en esta ronda (§3.4) |
|---|---|---|---|
| **0** · Instrumentación y presupuesto | 4 | **Completa, con evidencia** | — |
| **A** · Base de imagen | 6 | **Completa, con evidencia** | Su recaptura (A6) es la línea base contra la que compara esta ronda |
| **B** · Luz y atmósfera | 7 | **Completa, con evidencia** | Intocable. §3 no propone tocar nada de lo que B cerró |
| **C** · Terreno y naturaleza | 4 | **No comenzada** | **Reemplazada** por las Fases G y H |
| **D** · Aeropuerto | 5 | **No comenzada** | **Diferida** entera, sin duplicar |
| **E** · El mundo persiste en altura | 6 | **No comenzada** | **Partida**: la pieza 1 se absorbe, las piezas 2 y 3 se difieren sin duplicar |
| **F** · Cielo y nubes | 4 | **No comenzada** | **Diferida**, con una nota de orden respecto de la Fase I |

---

## 2. Carencias y bugs encontrados en esta auditoría

Numeración continuada desde el #13 de `plan3.md §2` para que las referencias cruzadas no colisionen. Ninguno fue reportado por el usuario; todos salieron de leer el código y calcular.

| # | Sev. | Carencia | Criterio de cierre |
|---|---|---|---|
| **14** | **Alta** | **El domo de cielo no participa de la niebla.** `skyDomeMaterial.ts:30` declara `fog: false`, y el material del domo de atardecer también (`EnvironmentPlaceholder.tsx:113`). El suelo converge al color de niebla con la distancia y el cielo no converge a nada: el horizonte es un salto de color por construcción (§1.3). Es la causa estructural del "borde recto", y **no la resuelve ninguna cantidad de terreno nuevo** | Paso de luminancia fila a fila a través de la línea de horizonte ≤ **2× la mediana** de los pasos fila a fila de las 100 filas circundantes, medido con `sharp` en las capturas del hero de escritorio y móvil |
| **15** | Media | **El plano de suelo está centrado en el origen, no en la cámara** (`EnvironmentPlaceholder.tsx:272`). Su borde entra y sale de cuadro según dónde esté la cámara, así que la distancia a la que el mundo se termina cambia con el scroll — y ninguna calibración de niebla puede ser correcta para todas las posiciones a la vez | Sustituido por el disco que sigue a la cámara (diseño heredado de `plan3.md §4 Fase E`, pieza 1; ver §3.4 y G1). El borde no aparece en ninguna captura de la ventana 0,00–0,28 |
| **16** | Media | **`seededRandom` vive privado dentro de `RunwayEnvironment.tsx:34-43`.** Terreno, pasto y bosque tienen que compartir la misma fuente de aleatoriedad **y el mismo campo de densidad**, o la textura del suelo va a decir "acá hay pasto" en lugares donde no hay ni una mata, y los árboles se van a agrupar donde el suelo dice tierra pelada. Es la diferencia entre un ecosistema y tres capas de ruido superpuestas | Módulo compartido con test de determinismo (`node --test`), y assert de que cada instancia de vegetación cae donde la máscara compartida lo permite |
| **17** | Baja | **`VEGETATION_COUNT.low = 0` y `visible={tier !== 'low'}` quedaron incoherentes con el presupuesto recuperado** (`RunwayEnvironment.tsx:143, 204`). Eran correctos con 1 draw call de margen; con 92 libres (§1.7) dejan a Mobile Low sin vegetación por una restricción que ya no existe | Mobile Low renderiza vegetación, con su conteo y sus draw calls declarados y medidos |
| **18** | Baja | **La textura procedural de terreno entra en el presupuesto de VRAM de `PLAN.md §7.1`** (high `<350 MB`, mid `<200 MB`, low `<120 MB`) y hoy no hay ninguna fila del repo que lo contabilice. Un juego albedo+normal+roughness de 1024² RGBA son ~12,6 MB, ~17 MB con mipmaps | Cifra declarada por tier **antes** de generar la textura, y el tamaño por tier elegido en consecuencia (§3.9) |
| **19** | Baja | **El `emissive #314431 × 0.42` del pasto** (`RunwayEnvironment.tsx:209-210`) era el único piso de luminancia antes de B1 y ahora es un velo verde sucio sobre una superficie que ya recibe luz hemisférica. `vertexColors` además no multiplica el `emissive` en three.js, así que la variación por instancia no lo alcanza | Eliminado o re-justificado por escrito en el propio archivo, con captura antes/después del mismo encuadre |

---

## 3. Decisiones tomadas

### 3.1 Dirección de arte, descrita en palabras medibles

Esta subsección existe para que **quien implemente no necesite volver a ver la imagen de referencia** para entender el objetivo. Las cinco propiedades:

**1 · Densidad — el bosque cierra el horizonte.** No hay claros grandes, no hay una fila de árboles con cielo detrás. La masa de coníferas es continua a media distancia y su borde superior es irregular: las copas suben y bajan varios metros entre vecinos, así que la silueta contra el cielo es dentada, nunca una línea. Los árboles **no** están distribuidos uniformemente: se agrupan en manchones de bordes deshilachados, con huecos de suelo desnudo entre grupos. Un patrón regular lee inmediatamente como generado y es el defecto más caro de corregir tarde.

**2 · Suelo — tierra rojiza asomando entre parches de pasto.** El suelo dominante es tierra terracota/rojiza, seca. El pasto **no** es una capa continua: son parches de bordes irregulares sobre esa tierra, y en los claros la tierra desnuda es lo que domina. Un verde continuo es exactamente el defecto que hay hoy. La tierra tiene además variación propia: zonas más claras y más oscuras a escala de decenas de metros, no un color plano teñido de niebla.

**3 · Tres capas de profundidad legibles.** Al frente, copas con detalle, contraste interno y color propio — verde oliva contra tierra rojiza. A media distancia, la masa se aplana: el contraste interno cae, el color se calienta y se desatura hacia la bruma. Al fondo, una banda casi monocroma donde sólo queda el valor: formas de bosque sin color propio. **Las tres bandas se distinguen a simple vista en la imagen de referencia**, y esa separación es la que produce la sensación de escala.

**4 · El horizonte no existe como línea.** La última fila de árboles se pierde en la bruma **antes** de tocar el cielo. No hay un punto donde se pueda decir "acá termina el suelo y empieza el cielo": hay una transición de varias decenas de píxeles donde ambos son el mismo color. Éste es el criterio que #14 y la Fase I persiguen.

**5 · La bruma es cálida y aditiva: sube la luminancia con la distancia, no la baja.** La luz llega rasante y dorada, y lo lejano es **más claro** que lo cercano, no más oscuro. Es la diferencia entre atmósfera y penumbra. La Fase B ya estableció exactamente este comportamiento para S6 (B6, `duskColorMix` hacia `#E89B6C`); esta ronda lo lleva al hero, sin tocar la niebla de escena (§3.6).

**Lo que la referencia NO pide y no se va a hacer:** fotorrealismo de corteza y aguja, sombras proyectadas de árboles (el rig exterior no castea sombras por decisión de presupuesto ya cerrada y documentada en `EnvironmentPlaceholder.tsx:218-221`), ni hojas individuales. La referencia funciona por **masa, color de suelo y capas de profundidad**, y ésos son los tres ejes de esta ronda.

### 3.2 Representación de los árboles — se corrige el supuesto de `plan3.md §3.2`

**Decisión: geometría sólida instanciada en los tres niveles de distancia. Sin billboards.**

`plan3.md §3.2` decidió cross-billboards a partir de una medición correcta pero de la cámara equivocada (§1.4). Con la escala real del hero, tres razones concretas:

1. **Tamaño.** A 130–326 px un cross-billboard con alpha-test se lee como dos planos cruzados. La medición que respaldaba la decisión anterior (51 px) es de S3.
2. **Interacción con SMAA.** La Fase A3 introdujo antialiasing (`PostFX.tsx:129`, preset `HIGH`). El alpha-test produce bordes binarios que SMAA trata como bordes geométricos: miles de instancias con alpha-test son el peor caso de entrada para ese filtro, y no había AA en el sitio cuando `plan3.md` tomó la decisión.
3. **Presupuesto.** El ahorro que justificaba el billboard ya no hace falta: quedan 213 y 92 draw calls libres (§1.7).

**Diseño concreto** (parámetros de partida, a afinar contra la referencia en la implementación):

| banda | distancia | geometría | tris/árbol | instancias | tris |
|---|---|---|---|---|---|
| cercana | keep-out → 400 u | tronco prismático (6 lados) + 3 conos apilados (8 segmentos) | ~36 | ~1.000 | ~36k |
| media | 400–900 u | 2 conos (6 segmentos) | ~14 | ~800 | ~11k |
| lejana | 900–1500 u | 1 cono (5 segmentos) | ~5 | ~600 | ~3k |

**~2.400 instancias, ~50k triángulos, 3 draw calls.** Contra 500k triángulos de techo en el tier más bajo, es el 10 %.

**Normales.** La normal lateral de un cono de radio *r* y altura *h* tiene `n.y = r / √(r²+h²)`. Con `r = 1,6` y `h = 4` da **`n.y = 0,37`** `[derivado]` — mayormente horizontal, pero con componente vertical real y constante, contra el `n.y == 0` exacto de hoy. Esto obliga a corregir el criterio de `plan3.md` C1 (ver §3.4).

**Blender sigue siendo escotilla de escape, ahora con disparador declarado.** Si la captura de H1 a 0.01 no lee como conífera con la copa a ≥200 px, se escala a un asset modelado en Blender siguiendo el patrón de `blender/interior_blockout.py` (constantes de contrato, fábrica de materiales con metadata, `linked_copy()` para que `gltf-transform instance` produzca `EXT_mesh_gpu_instancing`, `verify_*.py` que lo asserta) **y se documenta con la captura que lo justifica**. Blender y ffmpeg ya están instalados en el entorno desde la Fase B4; `ktx` sigue sin instalar y `process-glb.mjs:169-185` degrada a JPEG en silencio sin él — si se usa la escotilla, instalar `ktx` es prerequisito, no detalle.

### 3.3 Un solo campo de densidad como fuente de verdad

**Decisión: un único módulo determinístico alimenta terreno, pasto y bosque.**

Nuevo `src/lib/terrainField.ts`, más `src/lib/seededRandom.ts` extraído tal cual de `RunwayEnvironment.tsx:34-43` (mismo algoritmo, misma semilla fija, para que las matas existentes no cambien de lugar por el refactor). El campo produce, desde una sola función de ruido de valor con semilla fija:

- **(a)** la máscara pasto/tierra que pinta la textura de albedo del terreno
- **(b)** la colocación de las matas de pasto
- **(c)** la colocación y el clustering de los árboles
- **(d)** el relieve de altura del terreno

**Por qué importa que sea uno solo:** con tres ruidos independientes, la textura dice "pasto" donde no hay ni una mata y los árboles se agrupan sobre tierra pelada — el ojo lo detecta antes de poder nombrarlo, y es la diferencia entre un ecosistema y tres capas superpuestas. Con un campo compartido, **la tierra asoma exactamente donde no hay pasto**, que es la propiedad 2 de §3.1.

Y es verificable sin mirar: assert de que cada instancia de pasto cae en un punto donde la máscara supera su umbral, y de que la fracción de puntos por encima del umbral en la banda cercana coincide con la fracción de píxeles "pasto" de la textura dentro de una tolerancia declarada.

**Determinismo**, heredado de `plan3.md §7` y ya anotado en `progress3.md` C3: dos llamadas producen buffers idénticos byte a byte, o la QA visual deja de ser reproducible.

### 3.4 Qué pasa con las Fases C, D, E y F de `plan3.md`

Decisión explícita fase por fase. **Nada se duplica: lo que no se absorbe se remite desde la Fase K con su numeración original intacta.**

**Fase C (terreno y naturaleza) → REEMPLAZADA por las Fases G y H.**
Misma intención, vara distinta. C1 pedía *"árboles que se identifiquen sin ambigüedad como árboles"*; ésta pide **densidad, capas de profundidad y color de suelo medidos**. C2/C3/C4 quedan absorbidos en G y H con criterios numéricos en vez de "lee como pasto". Además **se corrige un criterio equivocado de C1**: exigir *"normales con componente +Y dominante"* es geométricamente incorrecto para una conífera — la normal lateral de un cono es mayormente **horizontal** (§3.2), y cumplir ese assert obligaría a construir un árbol con la geometría mal. Se sustituye por: **`n.y ≥ 0,3` en toda la fronda y `n.y` medio ≥ 0,35**, contra el `n.y == 0` exacto de hoy. Es una corrección de un ítem no implementado, no un rebajamiento de un criterio cumplido — el contrato anti-cosmético prohíbe lo segundo, no lo primero, y ésta es la clase de hallazgo que §7.4 llama "un hallazgo de 'no hay bug' es un resultado válido".

**Fase E (el mundo persiste en altura) → PARTIDA.**
- **Pieza 1 (disco de terreno que sigue a la cámara, con disolución radial hacia la niebla): ABSORBIDA** en G1/G4. No es una mejora de altura: es el **sustrato del hero**, y es lo que cierra el bug #15. El diseño de `plan3.md §4 Fase E` se toma tal cual — 1 draw call, UV en espacio-mundo con `RepeatWrapping`, opaco, sin `transparent: true` y por lo tanto sin problemas de ordenamiento contra la pista, sin tocar `far`.
- **Piezas 2 (`airportGroundPlan.ts`, calles de rodaje) y 3 (quitar la puerta binaria de 30,5 %): DIFERIDAS sin duplicar.** Siguen vivas en `plan3.md` con sus ítems E1–E6 y se remiten desde la Fase K. Motivo: el brief de esta ronda es el hero, y quitar la puerta de 30,5 % es semi-sistémico — invalida la evidencia de S3/S6/S7 (`03-spec-sheet`, `06a–d`, `07`, `09-mobile`, `11-mobile`) sin servir al objetivo de esta ronda. Es trabajo de una ronda 5, y llega **mejor preparado** después de ésta: cuando E se implemente, el terreno que va a quedar visible en altura ya será el terreno bueno.

**Fase D (aeropuerto) → DIFERIDA ENTERA, sin duplicar.**
El brief de esta ronda es naturaleza. Hangares con puertas, torre consolidada, desgaste de pista, luces de borde y calles de rodaje no la sirven, y meterlos multiplica la superficie de regresión de una ronda que ya toca el suelo y el cielo. Se registra como **diferida, no descartada**, y se remite desde la Fase K con sus cinco ítems intactos.

**Fase F (cielo y nubes) → DIFERIDA, con una nota de orden que hay que respetar.**
F2 pide *"nubes presentes en S1 y S2 — hoy el cielo está vacío ahí"*, y toca el mismo cielo que la Fase I de esta ronda. **La banda de horizonte (I1/I2) va primero**; F2 se implementa después, encima de ella. Si se hace al revés, las nubes de S1/S2 se autoran contra un horizonte que después cambia, y hay que rehacerlas. Queda escrito acá para que la ronda que tome F no lo descubra tarde.

### 3.5 Cómo sobrevive el tinte de suelo por sección sin tocar `SECTION_ENVIRONMENT`

`EnvironmentPlaceholder.tsx:151` copia `theme.ground` al color del material del suelo cada frame. Es lo que hace que el suelo sea casi negro en S5 (`#151311`) y S7 (`#090b0e`), y `plan3.md` E6 lo protege explícitamente. Pero el hero necesita un albedo autorado (tierra terracota + parches de pasto) que **no** puede salir de multiplicar una textura por `#59664d`.

**Decisión:** el albedo procedural se modula por

```
finalAlbedo = albedo · mix(vec3(1.0), theme.ground · GROUND_TINT_GAIN, w(progress))
```

con `w = 0` hasta el final de S2 y rampa a 1 a través de S3. El hero queda **enteramente autorado por la textura**; de S4 en adelante el suelo colapsa al casi-negro que su sección declara. `GROUND_TINT_GAIN` se calibra una vez para que la luminancia del suelo en S5/S7 quede donde está hoy.

**`SECTION_ENVIRONMENT` no se toca, `thresholdLighting.ts` no se toca, `ExposurePass` no se toca, los pesos de HDRI no se tocan.** Se agrega una curva nueva y local, en el módulo del terreno, del mismo tipo que `duskColorMix` ya es para el fog. Criterio de cierre en G3.

**Alternativa descartada y por qué:** multiplicar el albedo por `theme.ground` sin la mezcla satisface E6 gratis, pero baja la luminancia del hero un factor ~0,35 y distorsiona las relaciones de brillo entre secciones que la Fase B acaba de calibrar. No vale la pena para ahorrar una curva de diez líneas.

### 3.6 Bruma propia para terreno y bosque, sin tocar la niebla de escena

**Trampa que hay que conocer antes de escribir el shader:** three.js reescribe `fogColor` y `fogDensity` desde `scene.fog` en **cada** material con `fog: true`, cada frame. Un color de niebla distinto por material **no sobrevive** por esa vía, por más que se declare en los uniforms.

**Decisión:** los materiales nuevos de terreno y bosque van con **`fog: false`** e implementan su propia bruma en el shader — densidad copiada de `scene.fog.density` (para que la profundidad case exactamente con el resto de la escena y no haya dos leyes de niebla) y **color propio de "bruma de dosel"**, más cálido y **más luminoso** que el fondo, que es la propiedad 5 de §3.1.

**Anotación deliberada para que no se copie por inercia:** el patrón `UniformsUtils.merge([UniformsLib.fog, …])` de `RunwayEnvironment.tsx:395-397` —con su comentario de que omitirlo hace que `WebGLRenderer` desreferencie un `fogDensity` ausente en S3/S6— es necesario **sólo si el material declara `fog: true`**. En este camino no aplica. Es una trampa que ya le costó a este proyecto una vez, y la mitad de la lección se puede aplicar mal.

### 3.7 Cierre del horizonte

**Decisión:** banda de horizonte en el domo de cielo — mezcla del color del domo hacia el color de bruma entre aproximadamente +2° y −2° de elevación, con una curva suave. En `skyDomeMaterial.ts` (domo de golden-hour/high-altitude, activo en S1–S3) y en el material del domo de atardecer (`EnvironmentPlaceholder.tsx:106-118`, activo en S6).

**Por qué no alcanza con hacer coincidir el color de bruma del terreno con el cielo:** el color del cielo en el horizonte **varía con el azimut** (la HDRI de golden-hour tiene el sol a 6,06° de elevación y 70,05° de azimut, `environmentTheme.ts:80`), así que un color de bruma único no puede coincidir en todas las direcciones a la vez. En la dirección del sol el salto quedaría. La banda en el domo es el único fix robusto.

**Es correcto también en términos de dirección de arte:** en la imagen de referencia el horizonte es exactamente eso, una banda luminosa lavada donde el cielo y la masa de árboles son el mismo valor.

**Es la única pieza semi-sistémica de la ronda**, porque toca el cielo de S1, S2, S3 y S6. Se clasifica como tal en §4 y arrastra la re-verificación del criterio cola–cielo de la ronda 2 (ΔY ≥ 0,05; contraste ≥ 1,5:1), que es la aserción que más se le parece.

### 3.8 El avión no se ocluye

Con la cámara del hero a 81 u del origen y el borde inferior del cuadro tocando el suelo a 18 u (§1.3), un árbol de 12 u colocado entre la cámara y el avión mide hasta 326 px y **tapa el sujeto**. La referencia tiene bosque en primer plano porque su cámara está más alta y más lejos; la nuestra no.

**Decisión:** el bosque vive **fuera de un rectángulo de keep-out del aeródromo** declarado en el módulo compartido, que contiene la pista completa (±16 × ±260, de `runwayGeometry.ts:31-44`), el apron (`RunwayEnvironment.tsx:288`) y los hangares (`RunwayEnvironment.tsx:219-223`). En S1 eso pone las coníferas más cercanas a ~60–120 u de la cámara (108–217 px de alto) y en los tercios laterales del cuadro, no cruzando el sujeto.

**Criterio duro, y es de los mejores de esta ronda porque es binario:** el conteo de píxeles de silueta del A380 en `01-hero.png` no cambia más de **2 %** respecto de la línea base archivada de A6. Protege de paso el criterio cola–cielo de la ronda 2.

### 3.9 Costo de generación y VRAM

Heredado de `plan3.md §3.2` sin cambios de fondo: la textura procedural se genera **dentro de la puerta de carga S0**, antes de fijar `loadingState.revealStartSeconds`, donde la pantalla de carga ya cubre el hitch de 80–200 ms que cuesta un 1024², y con su peso declarado en `loadingWeights.ts` (que la Fase 0 · ítem 04 ya dejó exacto byte a byte contra el disco).

**Lo nuevo (bug #18):** tamaño por tier y VRAM declarados **antes** de generar. Punto de partida: **1024² en high/mid, 512² en low**, para albedo + normal + roughness → ~12,6 MB (high/mid) y ~3,1 MB (low), ~17 MB y ~4,2 MB con mipmaps, contra techos de 350 / 200 / 120 MB de `PLAN.md §7.1`. Más un tile de detalle de 64² con `RepeatWrapping` para la banda cercana, siguiendo el perfil exacto de `aircraftSurfaceMaps.ts` (que ya tiene su test C1 exigiendo ≥20 niveles distintos y rango de roughness ≥0,2 — el mismo patrón de test se replica acá).

### 3.10 Fuera de alcance explícito de esta ronda

Se hereda lo que `plan3.md §3.3` ya descartó (**terminal con mangas, aviones estacionados, vehículos de tierra, señalética de calle**) y se agrega, por decisión de esta ronda:

- Toda la Fase D de `plan3.md` (§3.4)
- Las piezas 2 y 3 de la Fase E de `plan3.md` (§3.4) — en particular, **la puerta binaria de 30,5 % no se toca en esta ronda**
- Toda la Fase F de `plan3.md` (§3.4)
- Sombras proyectadas de vegetación (el rig exterior no castea sombras, decisión ya cerrada y documentada)
- Cualquier cambio a `SECTION_ENVIRONMENT`, `thresholdLighting.ts`, `ExposurePass`, `SectionGrade` o los pesos de HDRI

---

## 4. Fases

Regla de verificación heredada de `plan3.md §4`, que sigue siendo la razón por la que este proceso funciona: **cada ítem declara acá cómo se va a verificar, antes de que exista el código que lo cumpla.** Nada se marca en `progress4.md` sin la evidencia que su columna exige.

### Clasificación de cada cambio por su radio de impacto

- **Seguros** — aislados, no invalidan evidencia de otras secciones: los módulos compartidos y sus tests (0₄-02, 0₄-03), el bosque entero (H1, H2), el pasto (H3, H4). Todo eso vive dentro del grupo `Environment · Hero airport`, que ya está oculto desde 30,5 % (`RunwayEnvironment.tsx:524`) — **S3 a S7 no se enteran de que existe.**
- **Semi-sistémicos** — cambian qué hay en cuadro sin cambiar cómo se ilumina nada:
  - **el terreno (G1–G4)**, que reemplaza `Environment · Ground`. Visible sólo hasta 0,305 (el fade de `EnvironmentPlaceholder.tsx:152-157`), pero **cambia el fondo 3D del panel de S3 en su cola** — y por eso importa que la Fase 0 de la ronda 3 ya haya blindado ese panel con `.overlay__panel--climb` y lo haya probado con fondos adversariales (contraste 19,81/19,09/19,81/19,81, variación máxima 3,6 %). **Esa bomba ya está desactivada**; esta ronda no tiene que volver a hacerlo, sólo no confiarse.
  - **la banda de horizonte del domo (I1, I2)**, que toca el cielo de S1, S2, S3 y S6.
- **Sistémicos** — **ninguno.** Esta ronda no toca `SECTION_ENVIRONMENT`, `thresholdLighting.ts`, `ExposurePass`, `SectionGrade` ni los pesos de HDRI. La Fase B de la ronda 3 cerró y verificó esa parte, y volver a abrirla invalidaría las siete secciones para conseguir algo que se puede conseguir localmente (§3.5, §3.6).

### Secuencia y por qué cada paso está donde está

| Paso | Qué | Por qué en ese lugar |
|---|---|---|
| **0₄** | Instrumentación: métricas nuevas de horizonte y de detalle de suelo, módulos compartidos, keep-out | **Sin esto ningún paso posterior es falsable.** Los umbrales de H e I se expresan como múltiplos de una línea base que hoy nadie midió. Es también la única oportunidad de medir el estado actual antes de destruirlo |
| **G** | Sustrato de terreno: geometría, textura, tinte, disolución | El bosque se planta **sobre** el terreno. Si el terreno llega después, cada ajuste de densidad de bosque se hace contra un suelo que va a cambiar |
| **H** | Bosque y pasto | Seguro y aislado. Es el grueso del trabajo visual y el que más iteraciones va a necesitar; conviene que llegue con el sustrato ya fijo |
| **I** | Horizonte y profundidad atmosférica | Va **después** de que haya bosque: la banda de horizonte hay que calibrarla contra la masa de árboles que efectivamente va a estar ahí, no contra un plano vacío |
| **J** | Presupuesto, regresión y cierre | Recapturar antes desperdicia ~47 min de SwiftShader por corrida |

**Tres reglas duras de secuenciación**, dos heredadas y una nueva:

1. **Nunca el material de terreno antes de la geometría de terreno** (`plan3.md §4`). Si el material llega primero, ante un fallo de luminancia no se puede distinguir "ahora hay suelo" de "el suelo es de otro color". Por eso G1 va antes que G2.
2. **Nunca combinar un cambio semi-sistémico con uno seguro en el mismo commit** (`plan3.md §4`). El historial ya registra lo que cuesta (`6634708`, y `progress2.md` documenta el ciclo de re-verificación que costó un error de ese tipo).
3. **Nueva: el bosque no se afina antes de que la bruma esté puesta.** La densidad que parece correcta sin bruma es la equivocada con bruma — la banda media a F=0,3–0,6 pide bastante más masa de la que el ojo pide sin niebla. H se implementa con parámetros de partida y **se afina en I3**, no antes.

**Tentaciones explícitas a resistir**, en el espíritu de la nota de `plan3.md §4` sobre `fogDensity`:

- **Subir `fogDensity` de S1/S2 para "conseguir más atmósfera".** Está en `SECTION_ENVIRONMENT` (`environmentTheme.ts:174, 189`), es sistémico, y §3.6 consigue el efecto localmente sin tocarlo. Si aun así se quiere, va al final, solo, y con recaptura completa.
- **Quitar la puerta de 30,5 % "ya que estamos".** Es `plan3.md` E1, es semi-sistémico, invalida cinco capturas y no sirve al objetivo de esta ronda (§3.4).
- **Agregar sombras de vegetación.** Ninguna luz exterior castea sombras, por una decisión de presupuesto ya cerrada. Activarlas por los árboles reabre el problema que la sombra analítica de una draw call existe para evitar.

---

### Fase 0₄ · Instrumentación y línea base del hero — antes de cambiar nada visual

| # | Ítem | Verificación requerida |
|---|---|---|
| 04-01 | **Métricas nuevas en `scripts/visual-qa.mjs`**: `horizonStepEstimate` (máximo \|ΔY\| entre filas adyacentes dentro de una banda de ±20 px alrededor de la línea de horizonte, y la mediana de \|ΔY\| de las 100 filas circundantes como referencia) y `groundDetailEnergy` (media de \|ΔY\| entre píxeles vecinos dentro de la banda de suelo medio) | Ambas métricas presentes en `visual-qa-report.json` para `01-hero`, `02-takeoff`, `08-mobile-hero` y `08b-mobile-taxi-13`, **medidas sobre el árbol actual antes de tocar nada**, y registradas en `progress4.md` como línea base. Los umbrales de H e I quedan expresados en este documento como múltiplos de esa línea base — la fórmula se fija acá, el valor lo aporta esta medición |
| 04-02 | **`src/lib/seededRandom.ts`** extraído tal cual de `RunwayEnvironment.tsx:34-43` y **`src/lib/terrainField.ts`** con el campo compartido de §3.3 | Test `node --test` (patrón `ssrLoadModule` de `tests/environment.test.mjs`): dos llamadas producen buffers **idénticos byte a byte**; el `seededRandom` extraído produce **exactamente la misma secuencia** que el privado para la misma semilla. Y `01-hero.png` / `08-mobile-hero.png` sin diferencia por encima del piso de ruido de SwiftShader ya medido en la ronda 3 (0,03 % de píxeles a umbral >5/255) |
| 04-03 | **Keep-out del aeródromo** declarado en el mismo módulo compartido, importando `RUNWAY_SURFACE_Y` y las constantes de pista de `runwayGeometry.ts` y la tabla `HANGARS` de `RunwayEnvironment.tsx` — no re-tipeadas | Test: el keep-out contiene la pista completa (±16 × ±260), el apron y los tres hangares, verificado contra esas constantes importadas; y ninguna instancia de vegetación de H cae dentro de él |
| 04-04 | **Presupuesto declarado antes de gastarlo** (bug #18): tamaño de textura por tier, VRAM resultante, y peso S0 previsto | Cifras escritas en `progress4.md` **antes** de que exista la textura, y comparadas con lo medido al cierre de G2. Techos de `PLAN.md §7.1`: 350 / 200 / 120 MB |

### Fase G · Sustrato de terreno — semi-sistémica

| # | Ítem | Verificación requerida |
|---|---|---|
| G1 | **Disco de terreno que sigue a la cámara**, reemplazando el `planeGeometry(4000,4000)` de `EnvironmentPlaceholder.tsx:275`: posición XZ copiada de la cámara cada frame, UV en espacio-mundo con `RepeatWrapping`, subdividido, con relieve de baja amplitud desde el campo de §3.3, **sin tocar `far`**, opaco (bug #15, pieza 1 de `plan3.md` Fase E) | Test espejo del B4 de `tests/environment.test.mjs:48`: **todo vértice dentro del keep-out con `\|y − 0\| ≤ 1e-9`** (la pista no puede quedar sobre una loma) y con normal exactamente `(0,1,0)`. Más capturas a 0.01 / 0.10 / 0.19 / 0.27 donde **el borde del mundo no aparece en cuadro en ninguna** |
| G2 | **Textura procedural de terreno** (albedo tierra terracota + parches de pasto, normal, roughness) desde el campo compartido, generada dentro de la puerta de carga S0 con su peso en `loadingWeights.ts` | Determinismo byte a byte entre dos llamadas (assert automatizado). Espejo del test C1 de `aircraftSurfaceMaps.ts`: ≥20 niveles distintos y rango de roughness ≥0,2. **El color del suelo deja de ser un valor único**: conteo de colores distintos cuantizados en la banda cercana de `01-hero.png` ≥ un piso declarado, contra el valor único de hoy. VRAM y hitch de generación medidos y declarados contra 04-04 |
| G3 | **El tinte de suelo por sección sobrevive** (§3.5): curva `w(progress)` con `w = 0` hasta el final de S2 y rampa a 1 a través de S3, `GROUND_TINT_GAIN` calibrado | Capturas de S5 (0.60) y S7 (0.97): **luminancia media del suelo dentro de ±5 % de la línea base archivada de la Fase A6**. El suelo sigue casi negro y **no** se convierte en un campo de tierra iluminada. Es el ítem E6 de `plan3.md`, absorbido y con criterio numérico |
| G4 | **Disolución radial hacia la bruma** (§3.6): material con `fog: false` y bruma propia en shader, densidad copiada de `scene.fog.density`, color de bruma cálido y **más luminoso** que el fondo | Perfil radial medido: la luminancia del suelo **sube** monótonamente con la distancia en las capturas del hero (propiedad 5 de §3.1), medido en tres bandas. Y `horizonStepEstimate` **baja** respecto de la línea base de 04-01 — aunque el criterio duro de cierre del horizonte es I4, no éste |

### Fase H · Bosque y pasto — segura

| # | Ítem | Verificación requerida |
|---|---|---|
| H1 | **Conífera cercana instanciada** (§3.2): tronco prismático + 3 conos apilados, ~36 tris, una sola `InstancedMesh` | Captura de `01-hero.png` donde un árbol cercano ocupa ≥200 px de alto y **se lee como conífera, con tronco y copa escalonada distinguibles**. Assert de normales: **`n.y ≥ 0,3` en toda la fronda, `n.y` medio ≥ 0,35** (corrige el criterio de `plan3.md` C1, ver §3.4). Draw calls declarados. **Disparador de escotilla**: si la captura no lo cumple, se escala a Blender y se documenta con la captura que lo justifica |
| H2 | **Bandas media y lejana con clustering** desde el campo compartido (§3.3): manchones de bordes irregulares, borde superior dentado, sin claros grandes | **`groundDetailEnergy` de la banda media ≥ 4× la línea base de 04-01** en `01-hero` y `02-takeoff`. Assert de distribución **no uniforme**: la varianza de la distancia al vecino más cercano supera en un factor declarado la de un Poisson uniforme de la misma densidad. Captura donde **la masa de árboles cierra el horizonte** y su silueta contra el cielo es dentada, no una línea |
| H3 | **Pasto rehecho**: matas con normales dobladas explícitamente hacia +Y (no `computeVertexNormals()` sobre triángulos verticales), radio de corte ~150 u (§1.5), densidad ligada a la máscara compartida, viento respetando `prefers-reduced-motion`. Se resuelve de paso el bug #19 (`emissive` residual) | Captura donde el pasto lee como pasto iluminado con variación y **la tierra asoma entre los parches** (propiedad 2 de §3.1). Assert de que cada instancia cae en máscara > umbral (§3.3). Assert de `n.y > 0` en todos los vértices, contra el `n.y == 0` de hoy. Verificación del bypass de `prefers-reduced-motion`, igual que el resto del sitio |
| H4 | **Vegetación visible también en Mobile Low** (bug #17): `RunwayEnvironment.tsx:143, 204` coherentes con el presupuesto recuperado | Captura `08-mobile-hero.png` con vegetación. Draw calls de Mobile Low medidos y **declarados con su margen contra el techo de 100**, no sólo "pasa" |
| H5 | **El avión no queda ocluido** (§3.8) | Conteo de píxeles de silueta del A380 en `01-hero.png` **dentro del 2 %** de la línea base de A6. El criterio cola–cielo de la ronda 2 (ΔY ≥ 0,05; contraste ≥ 1,5:1) sostenido o mejor |

### Fase I · Horizonte y profundidad atmosférica — semi-sistémica

| # | Ítem | Verificación requerida |
|---|---|---|
| I1 | **Banda de horizonte en el domo de S1–S3** (`skyDomeMaterial.ts`, bug #14, §3.7): mezcla hacia el color de bruma entre ~+2° y −2° de elevación | Captura del cielo de S1/S2/S3 sin banding ni artefacto en la banda. **La Fase B5 dejó el domo en 128×64 segmentos y con mipmaps** — la banda no puede reintroducir el facetado que B5 sacó, y eso se verifica en la misma serie `qa:d3` |
| I2 | **Lo mismo en el domo de atardecer** (`EnvironmentPlaceholder.tsx:106-118`, activo en S6) | Captura de `06c-sunset-clean-88.png`: la aerial perspective cálida que B6 estableció (crominancia de la banda más lejana −21,0 → +97,8) **se sostiene o mejora**, y el horizonte no gana un borde nuevo |
| I3 | **Tres capas de profundidad legibles** (propiedad 3 de §3.1) | Luminancia y crominancia medidas en las bandas cercana / media / lejana del bosque: **convergencia monótona** hacia el color de bruma en ambas, y separación entre bandas por encima de un delta declarado. Es acá donde se afinan los parámetros de densidad de H (regla 3 de secuenciación) |
| I4 | **No hay borde recto en el horizonte** (criterio de cierre de #14) | **`horizonStepEstimate` ≤ 2× la mediana de \|ΔY\| de las 100 filas circundantes**, en `01-hero`, `02-takeoff`, `08-mobile-hero` y `08b-mobile-taxi-13`. Y **serie `qa:d3` sobre 0,00–0,28 cuadro a cuadro** (`D3_QA_START=0 D3_QA_END=0.28`), no capturas sueltas: sin borde, sin popping, sin doble geometría en ningún cuadro |

### Fase J · Presupuesto, regresión y cierre

| # | Ítem | Verificación requerida |
|---|---|---|
| J1 | **Presupuesto sostenido** | Draw calls y triángulos medidos en los tres tiers y las siete secciones, dentro de `PLAN.md §7.1`. Partida declarada de este plan: **+6 draw calls y ~110k triángulos**; lo medido se compara contra esa predicción y la diferencia se explica, no se acepta |
| J2 | **Mobile Low con margen amplio** | ≤ 20 draw calls de 100 en el hero, con vegetación activa. Si no se llega, el ítem **queda sin marcar** y se registra por qué — no se sube el techo (§7.6, heredado) |
| J3 | **Regresión en lo que la Fase I sí toca** | Recaptura completa de `qa:visual` (20/20, 0 errores) y comparación contra la línea base de A6 en **S3, S4, S6 y S7**, que son las secciones que la banda de horizonte alcanza. `panelContrastEstimate` ≥ 4,5 y `clippedWhitePct` < 2 % sostenidos |
| J4 | **Checklist de aceptación visual de §5 completo** | Cada casilla con su evidencia en `progress4.md`. Una casilla sin evidencia queda sin marcar |

### Fase K · Heredadas de `plan3.md` — no se re-planifican acá

Esta fase no tiene ítems propios. Existe para que lo diferido no se pierda ni se duplique.

| Origen | Ítems | Estado | Decisión de esta ronda |
|---|---|---|---|
| `plan3.md` Fase D · Aeropuerto | D1–D5 | No comenzada | **Diferida entera** (§3.4). Vive en `plan3.md` y `progress3.md`; no se copia acá |
| `plan3.md` Fase E · piezas 2 y 3 | E1, E2, E3, E4, E5 | No comenzada | **Diferidas** (§3.4). La pieza 1 se absorbió en G1/G4; E6 se absorbió en G3. **La puerta de 30,5 % no se toca en esta ronda** |
| `plan3.md` Fase F · Cielo y nubes | F1–F4 | No comenzada | **Diferida**, con orden obligatorio: la banda de horizonte (I1/I2) va **antes** que F2 (§3.4) |

---

## 5. Checklist de aceptación visual

Se completa al cierre de la ronda, no antes. Espejo exacto en `progress4.md`.

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
- [ ] **S3** — sin regresión: contraste de overlay ≥ 4,5:1, cielo sin facetado ni banding tras la banda de horizonte
- [ ] **S4** — sin regresión respecto de la ronda 3
- [ ] **S5** — interior sin regresión; el suelo sigue casi negro donde su sección lo declara
- [ ] **S6** — sin regresión: la aerial perspective cálida de B6 sostenida o mejor; exposición de B7 intacta
- [ ] **S7** — sin regresión; `scene.environment` vivo; atribución y enlace CC BY 4.0 visibles

---

## 6. Restricciones duras — qué rompe el CI antes de tocar nada

**Todos están asertados hoy y todos pasan.** Los márgenes son los **vigentes tras las Fases 0/A/B**, no los de la auditoría de la ronda 3.

| Restricción | Valor | Dónde se asserta | Margen actual |
|---|---|---|---|
| Draw calls por tier | high `<250` · mid `<150` · low `<100` (comparación estricta) | `scripts/visual-qa.mjs:378-408` | **High hero 37 · Mobile Low hero 8** `[medido]`. 213 y 92 libres |
| Triángulos por tier | `<1.5M` / `<800k` / `<500k` | `scripts/visual-qa.mjs:378-382` | 86.304 / 83.842 `[medido]` |
| **VRAM de textura por tier** | `<350 MB` / `<200 MB` / `<120 MB` | `PLAN.md §7.1` — **no asertado por ningún script hoy** | Sin medir. Lo declara 04-04 (bug #18) |
| Continuidad de cámara | Δpos ≤3 · Δtarget ≤3 · Δorient ≤3° · ΔFOV ≤0,25° · Δroll ≤0,35°, sobre 1001 muestras | `tests/b1-b2.test.mjs` | ~6 % de headroom. **Esta ronda no toca keyframes** |
| Travesía de cámara válida | Cubre `[0,1]`, sin huecos | `assertValidTraversal()`, `cameraPath.ts:212` — **corre al importar el módulo** | **Rompe el build, no sólo el test** |
| Marcas de pista horizontales | Cada vértice con `\|y − RUNWAY_SURFACE_Y\| ≤ 1e-9`, normal exactamente `(0,1,0)` | `tests/environment.test.mjs:48` (B4) | **G1 debe respetarlo sin tocar el test**, y su propio test lo replica para el terreno |
| Marco del umbral | Visibilidad ≥0,75 a 0,83 y exactamente 0 a 0,86/0,88/0,92 | `tests/environment.test.mjs:38` (B3) | Pasa |
| Mapas de superficie del exterior | ≥20 niveles distintos, rango roughness ≥0,2 | `tests/b1-b2.test.mjs` (C1) | Pasa. **G2 replica el patrón para el terreno** |
| Ratio de HDRI | Medias `<4×` **y medianas `<4×`** | `scripts/measure-hdri.mjs` (`qa:hdri`) | 1,923× y 2,34× `[medido, B3]`. Esta ronda no toca HDRI |
| Contraste de overlay | ≥ 4,5:1 en `03-spec-sheet` | `scripts/visual-qa.mjs:419-424` | 19,81 `[medido]`, y probado **estructuralmente independiente del fondo 3D** con fondos adversariales en la Fase 0 |
| Clipping del hero | `clippedWhitePct < 2 %` | `scripts/visual-qa.mjs:412-417` | 0,496 % `[medido, A6]` |
| Errores de consola/página/red/HTTP | **Cero**, o el arnés falla | `scripts/visual-qa.mjs:440-452` | 0/0/0/0 |
| Payload bloqueante S0 | ≤ 15 MB | `PLAN.md §6.4` | **9,79 MB** `[medido, B4]` — margen de 5,2 MB. La textura procedural **no** pesa bytes de descarga, pero sí tiempo de generación (§3.9) |
| Tone mapping efectivo | `ACES_FILMIC`, leído en runtime | `window.__MERIDIAN_PERF__.toneMappingMode` | Verificado en 20 capturas `[medido, A1]` |
| `scene.environment` no nulo | En los 101+ puntos de scroll | `window.__MERIDIAN_PERF__.sceneEnvironmentIsNull` | 0 nulos en 103 puntos `[medido, A4]` |

**Entorno:** Blender 4.0.2 y ffmpeg **ya están instalados** (Fase B4 los instaló vía apt, junto con `python3-numpy` para el intérprete embebido). **`ktx` sigue sin instalar** — sólo hace falta si se dispara la escotilla de Blender de §3.2, y sin él `process-glb.mjs:169-185` degrada a JPEG con un log explícito, que reduce descarga pero **no** VRAM y por lo tanto no es equivalente. **`node_modules` no está instalado** en el contenedor de planificación: la sesión de implementación arranca con `npm install`.

**Herramientas de inspección ya disponibles:** `npm run qa:d3` captura series cuadro a cuadro de cualquier ventana vía `D3_QA_START` / `D3_QA_END` / `D3_QA_STEP` / `D3_QA_POINTS`, con viewport y tier configurables (`D3_QA_WIDTH`, `D3_QA_HEIGHT`, `D3_QA_QUALITY`) — es la herramienta correcta para I4, no capturas sueltas. `npm run qa:visual` corre el arnés completo con sus aserciones. Y `progress3.md` deja registrada una trampa de entorno que se va a repetir: **Playwright apunta a una revisión de Chromium que no existe en el contenedor** (trae 1194), resuelta con un symlink local sin tocar el repo.

---

## 7. Contrato anti-cosmético

Heredado íntegro de `plan3.md §7`, que a su vez lo heredó de `plan2.md §6`, porque funcionó: ninguna de las dos rondas marcó nada que no se pudiera ver.

1. **Nada se marca en `progress4.md` sin evidencia adjunta.** Captura a un % de scroll específico, medición numérica, o assert automatizado. No existe "debería estar arreglado".
2. **Cada ítem declara su verificación antes de implementarse** — ya está declarada en §4, ítem por ítem.
3. **Un ítem marcado debe ser verificable por el usuario mirando la pantalla**, sin leer código ni confiar en la palabra del implementador.
4. **Los spikes producen hallazgo escrito antes de cualquier fix.** Prohibido proponer solución sin causa confirmada. Un hallazgo de "no hay bug" es un resultado válido y convierte el ítem en decisión de alcance.
5. **"Sin errores de consola" no es criterio de aceptación de nada visual.** Es condición necesaria, nunca suficiente.
6. **Si un fix no alcanza el criterio, el ítem queda sin marcar y se registra por qué**, en vez de rebajar el criterio para poder marcarlo. Aplica en particular a J2 y al techo de draw calls.
7. **No mezclar causas en una misma tanda de evidencia.** Una captura que cambió por dos motivos a la vez no prueba ninguno de los dos.
8. **El tracking es parte del entregable.** `progress4.md` se actualiza en la misma sesión en que se hace el trabajo, con su tabla de sesiones al día. Un cambio implementado y no documentado se trata como no hecho.
9. **Nuevo en esta ronda — ningún número de este plan se usa como evidencia de cierre.** Los de la §1 están etiquetados `[medido]` (heredados de las corridas de `progress3.md`), `[derivado]` (calculados a mano desde constantes del código) u `[observado]` (leídos de las capturas aportadas). La sesión que produjo este documento **no pudo correr el sitio en un navegador**, y por eso existe la Fase 0₄: vuelve a medir en el navegador antes de que ningún umbral se dé por bueno. Un `[derivado]` que la medición contradiga es un hallazgo que se registra, no un número que se ajusta en silencio.
10. **Nuevo en esta ronda — la imagen de referencia se cita por sus propiedades medibles, no por parecido subjetivo.** Densidad de dosel, tierra expuesta entre parches, separación de las tres bandas de profundidad, y ausencia de paso de luminancia en el horizonte (§3.1, §5). **Un ítem no se marca porque "se parece"**, y tampoco se rechaza porque "no se parece": se marca o no contra el criterio que su fila declara.
