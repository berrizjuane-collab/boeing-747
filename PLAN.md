# PLAN — Sitio Scrollytelling 3D de Presentación de Aeronave

> Documento de planificación. Ninguna línea de este plan es código de implementación.
> Estado: **todas las decisiones fundacionales de [§12](#12-decisiones-confirmadas) están cerradas y confirmadas por el usuario.** No quedan preguntas abiertas ni bloqueos de decisión — lo que resta es investigación de verificación (§9, Fase 9) y ejecución (§13).

---

## 0. Asunción confirmada: la aeronave es un Airbus A380-800

El pedido original decía "Airbus 747 de dos pisos". Eso mezcla dos aeronaves distintas:

| | Boeing 747 | Airbus A380 |
|---|---|---|
| Fabricante | Boeing | Airbus |
| Segundo piso | Joroba parcial, sólo zona delantera | Doble piso corrido, nariz a cola |
| Encaja con "de estos de dos pisos" | No del todo | Sí |

**Decisión: el proyecto se construye sobre el Airbus A380-800.** Es la única de las dos que tiene dos cabinas de pasajeros completas, que es lo que describe el pedido.

**Contención del riesgo de cambio.** El plan está estructurado para que un eventual cambio a 747 impacte casi enteramente la **Sección 5 (recorrido interior)** y no la arquitectura general:

- El rig de cámara (§4) es agnóstico del modelo: opera sobre keyframes en coordenadas de mundo, no sobre nombres de nodos del glTF.
- Las secciones 1–3 y 6 sólo necesitan silueta exterior y proporciones; cambiar el `.glb` exterior y reajustar la escala de los keyframes es trabajo de horas.
- La Sección 5 sí cambiaría de fondo: el 747 no tiene piso superior corrido, así que el sub-tramo "escalera + piso superior" se reduciría a la joroba delantera, y el recorrido perdería ~1 zona. Con la decisión de §12.2 de modelar el interior a medida en Blender, este cambio es incluso más contenido de lo que parecía originalmente: no hay un asset comprado con forma fija que reconvertir, es geometría propia — ajustar proporciones y perder una zona es trabajo de modelado normal, no una migración de asset.

> Nota menor: el repositorio se llama `boeing-747`. Es un desajuste cosmético que no vale la pena arreglar renombrando; queda anotado para que nadie lo lea como una decisión de producto.

---

## 1. Visión y objetivos

Single-page donde el **scroll del usuario conduce directamente el estado de una escena WebGL persistente**. No hay navegación entre páginas ni cortes de sección clásicos: un mismo canvas, un mismo avión, un mismo viaje continuo desde la pista hasta el interior de la cabina y de vuelta al cielo.

**Criterio de éxito** (en orden de prioridad):

1. Que la transición exterior→interior (§3, Sección 4) se lea como *cruzar un umbral*, no como un corte de escena. Es la pieza que define si el sitio funciona o no.
2. Que la calidad de render no se lea como demo de Three.js. Eso se juega en materiales PBR correctos, tone mapping, y grading por sección — no en cantidad de efectos.
3. Que el recorrido completo sostenga 60fps en desktop dentro del presupuesto de §7.

**Explícitamente fuera de alcance:** e-commerce, CMS, i18n, backend, analytics, formularios. Es un proyecto de exploración técnica de scroll-driven 3D storytelling. Ante cualquier disyuntiva entre una feature accesoria y calidad visual del recorrido, gana la calidad visual.

---

## 2. Stack técnico — evaluación y decisión

### 2.1 Motor de render: React Three Fiber + drei

**Decisión confirmada por el usuario: R3F + `@react-three/drei` + `@react-three/postprocessing`.**

La justificación no es "React es más cómodo". Es un reparto concreto de dónde está la complejidad real de este sitio:

- **El grafo de escena 3D es casi estático tras la carga.** Se cargan unos pocos modelos, se posicionan, y a partir de ahí lo único que cambia por frame es la cámara y unos uniforms. La reconciliación declarativa de R3F — su principal ventaja — aporta poco *acá*.
- **La capa DOM es donde está el estado real**: pantalla de carga, nav, overlays sincronizados a scroll, tooltips de hotspots, footer, fallbacks. Eso sí es un problema con forma de React.
- **drei ahorra trabajo concreto y no trivial**, no azúcar sintáctica:
  - `<Html occlude="blending">` — hotspots anclados a coordenadas 3D reales con oclusión por profundidad. Escribir esto a mano (proyección + test de oclusión + escalado por perspectiva) es varios días y es exactamente el requisito 6 del brief.
  - `<Environment>` — carga y aplicación de HDRIs con transiciones.
  - Cableado de `GLTFLoader` + `DRACOLoader` + `KTX2Loader`, que es tedioso y fácil de hacer mal.
  - `useProgress` — progreso real de carga para la Sección 0.
- **`@react-three/postprocessing`** envuelve la librería `postprocessing` de pmndrs, que **fusiona múltiples efectos en un solo shader**. El `EffectComposer` nativo de Three encadena passes de pantalla completa, cada uno con su round-trip de textura. Con bloom + DoF + viñeta + grano, la diferencia es material, no cosmética.

**El costo de R3F, y cómo se paga.** El riesgo real no es el overhead del reconciler; es provocar re-renders de React por frame. Se mitiga con una regla que es parte de la decisión, no una recomendación suelta:

> **Regla dura:** el progreso de scroll vive en un ref/store mutable (Zustand con actualizaciones transientes vía `subscribe`, o un objeto a nivel de módulo). **Nunca** en `useState`. Todo lo que se anima por frame se lee dentro de `useFrame` a través de refs. React re-renderiza sólo ante cambios discretos de sección: ~8 renders en toda la página.

Sin esa regla, R3F es una trampa de performance en un sitio como este. Con ella, el costo por frame es despreciable.

**Alternativa considerada: Three.js vanilla.** Es defendible, y no la descarto con desdén: menos dependencias, control total del render loop, y el argumento de "la cámara es la protagonista absoluta" es cierto. Pero el código del rig de cámara (§4) es **idéntico** en ambos casos — es matemática sobre `THREE.CatmullRomCurve3`, no tiene nada de React. Lo que se perdería yendo a vanilla es la capa DOM y los helpers de drei, que es donde vanilla obliga a reimplementar. El ahorro de overhead no compensa.

**Decisión cerrada ([§12.1](#121-stack-final--resuelto)):** el usuario confirmó R3F sobre la alternativa vanilla.

### 2.2 Scroll: Lenis + GSAP ScrollTrigger

**Decisión: ambos, con roles separados.**

- **Lenis** — suavizado inercial del scroll físico. Sin esto el scroll se siente "crudo" y ninguna cantidad de easing en la cámara lo arregla, porque el problema está aguas arriba.
- **GSAP ScrollTrigger** — timeline de keyframes de cámara. Integración estándar: `lenis.on('scroll', ScrollTrigger.update)` + `gsap.ticker.add(t => lenis.raf(t * 1000))`, con `gsap.ticker.lagSmoothing(0)`.

Dos detalles que definen si esto se siente cinematográfico o nervioso:

- **Usar `scrub` numérico, no `scrub: true`.** `scrub: 1` hace que la cámara *arrastre* ~1s detrás del scroll. Es la diferencia entre "cinematográfico" y "atado al mouse wheel". Valor inicial sugerido: `1`, a calibrar.
- **Un solo mecanismo de suavizado.** El `scrub` ya provee el lag; no sumar damping por frame encima de él. Doble suavizado da papilla — la cámara se siente flotante y con retardo impredecible.

**Alternativa considerada y descartada:** `IntersectionObserver` + lerp manual de un escalar en `requestAnimationFrame`. Es más barato (~50KB menos) y suficiente para 2-3 secciones. Con 8 secciones de keyframes, se pierde la ergonomía de autoría de un timeline etiquetado, más pinning y snapping. A esta escala GSAP se paga.

**Con `prefers-reduced-motion`:** Lenis se desactiva por completo (el suavizado *es* un efecto de movimiento) y el scrub baja a 0. Ver §8.

### 2.3 Resto del stack

| Pieza | Elección | Por qué |
|---|---|---|
| Build | Vite | HMR rápido; el ciclo de iteración visual en 3D es constante y el tiempo de rebuild se nota. |
| Lenguaje | TypeScript | Los tipos de Three (`Vector3`, `Quaternion`, `Euler`) se confunden con facilidad; el compilador atrapa una clase entera de bugs de rig de cámara. |
| Estado | Zustand | Soporta actualizaciones transientes (`subscribe` sin re-render), que es exactamente lo que pide la regla dura de §2.1. |
| Estilos | CSS Modules + custom properties | El grading por sección se expresa naturalmente como variables CSS interpoladas. Sin runtime CSS-in-JS: es costo por frame a cambio de nada acá. |
| Tooling glTF | `gltf-transform` CLI | Draco, KTX2, pruning y deduplicación en un pipeline scriptable y reproducible. |

---

## 3. Estructura narrativa — desglose sección por sección

Cada sección especifica **cámara / entorno / contenido / interactividad**.

Los porcentajes son fracciones del scroll total y son un punto de partida a calibrar dentro de la implementación. Presupuesto total de scroll: **~800vh, confirmado por el usuario** ([§12.6](#126-longitud-total-de-scroll--resuelto)).

---

### Sección 0 — Loading / Splash

| | |
|---|---|
| **Scroll** | 0% — bloquea el scroll hasta completar |
| **Cámara** | Estática en el keyframe de S1. La escena ya está renderizando detrás del overlay, con `toneMappingExposure = 0`. |
| **Entorno** | Escena de S1 ya montada, invisible por exposición cero. |

**Contenido:** wordmark del proyecto centrado. Una regla de 1px que se llena de izquierda a derecha. Porcentaje en mono con cifras tabulares.

**Progreso real, no simulado.** Vía `useProgress` de drei, que envuelve el `LoadingManager` de Three.

> **Salvedad honesta:** `useProgress` reporta *ítems cargados / ítems totales*, no bytes. Con assets de tamaños muy dispares (un HDRI de 8MB y un JSON de 2KB cuentan igual) la barra pega saltos. Mitigación: mapa de pesos esperados por asset y ponderación manual del progreso. Si no se hace, la barra salta y se nota.

**Transición de salida:** la regla se expande a ancho completo → el wordmark sube y desaparece (~400ms) → `toneMappingExposure` rampa de 0 a su valor objetivo en ~1.2s. La escena "se revela" como una foto que aparece, en vez de aparecer de golpe.

**Interactividad:** ninguna. El scroll está bloqueado (`lenis.stop()`).

---

### Sección 1 — Hero: pista de despegue

| | |
|---|---|
| **Scroll** | 0–12% |
| **Cámara** | Casi estática, a ~80m del avión, en un 3/4 delantero bajo (altura ~4m, por debajo de la línea de alas para dar escala). Deriva lateral muy lenta y un parallax sutil ligado al mouse (desactivado en `reduced-motion`). |
| **Entorno** | HDRI de golden hour, sol bajo. Asfalto con marcas de pista y desgaste, césped a los lados, hangares y torre de control a distancia como geometría simple con niebla. Niebla exponencial para aplanar el fondo lejano y evitar tener que modelar detalle a distancia. Partículas: polvo suspendido en los rayos de sol, con densidad baja. |

**Contenido:** nombre del proyecto en display grande, subtítulo con designación de la aeronave, indicador de "scroll para comenzar" con una animación de rebote suave.

**Interactividad:** ninguna más allá del parallax de mouse. El hero se mira, no se toca.

---

### Sección 2 — Rodaje y despegue

| | |
|---|---|
| **Scroll** | 12–28% |
| **Cámara** | Lateral, siguiendo (*tracking shot*). La cámara se traslada paralela al avión, conservando encuadre. Sobre el final, retrocede y sube ligeramente para acompañar la rotación. |
| **Entorno** | El mismo de S1, con el sol subiendo levemente. Al arrancar el rodaje aparecen partículas de polvo/calor tras los motores. Sombra proyectada del avión desplazándose sobre el asfalto — es la señal de movimiento más barata y más legible que hay. |

**Animación del avión** (no es sólo cámara, y por eso esta sección es más cara de lo que aparenta):

1. Traslación acelerando a lo largo de la pista.
2. Vibración/cabeceo de amplitud pequeña y alta frecuencia — sensación de velocidad y peso. Amplitud decreciente a medida que el tren se descarga.
3. Rotación: el morro sube ~10°.
4. Separación del tren; retracción del tren de aterrizaje.

> **Nota de asset:** la retracción del tren requiere que el modelo tenga el tren como nodos separados y jerarquizados. **La mayoría de los modelos gratuitos no lo tienen**, o lo tienen fusionado a la malla del fuselaje. Esto entra en los criterios de aceptación de asset ([§11.1](#111-adquisición-del-modelo-3d--riesgo-bloqueante)). Si el modelo no lo soporta, el plan B es mantener el tren extendido durante todo el vuelo — visualmente incorrecto pero no catastrófico — o cortar la separación del tren fuera de encuadre.

**Contenido:** datos técnicos disparados progresivamente conforme avanza el scroll — potencia de motores, velocidad típica de rotación, distancia de pista requerida. Ver [§9](#9-contenido-informativo) para el estado de verificación de cada cifra.

**Interactividad:** ninguna. Es la sección de mayor velocidad percibida; interrumpirla con hotspots la mataría.

---

### Sección 3 — Ascenso y giro de cámara

| | |
|---|---|
| **Scroll** | 28–42% |
| **Cámara** | Órbita. Parte de la posición trasera-lateral de S2 y describe un arco hasta quedar de frente al avión, algo por encima de la línea del morro. Este es el reposicionamiento que prepara la entrada de S4. Es también donde el override de roll (§4) gana su lugar: una inclinación leve durante la órbita agrega dinámica sin marear. |
| **Entorno** | Transición a HDRI de gran altitud. Capa de nubes por debajo (cielo volumétrico caro → recomendación: planos de nubes con billboarding y parallax, mucho más barato y suficientemente convincente en movimiento). Cielo azul profundo arriba. **Punto de máxima luminancia de todo el sitio** — es lo que hace que el interior cálido de S5 se sienta contenido por contraste. |

**Contenido:** especificaciones generales — envergadura, longitud, altura, techo de servicio, alcance, capacidad de pasajeros. Es la "ficha técnica" del sitio.

**Interactividad:** primer conjunto de hotspots sobre el exterior — motores, punta de ala/winglet, empenaje. Sólo activos dentro de la banda de dwell (ver §10.3).

---

### Sección 4 — Umbral: entrada al fuselaje

**La pieza técnica de mayor riesgo del proyecto.** Análoga al cruce de la superficie del agua en el sitio de referencia.

| | |
|---|---|
| **Scroll** | 42–50% — tramo corto y denso |
| **Cámara** | Aproximación frontal al fuselaje, sobre una puerta de la cubierta principal. Movimiento continuo, sin cortes, atravesando la piel del avión. |

**Técnica recomendada — cruce continuo con disolución de material:**

1. La cámara se acerca a una puerta definida como punto de entrada.
2. Al cruzar un **plano de umbral** definido, un escalar `t ∈ [0,1]` conduce simultáneamente:
   - Disolución radial del material del fuselaje alrededor de la cámara (shader de dissolve con máscara por distancia).
   - Cross-fade de HDRI exterior → iluminación interior (intensidad del env map exterior → 0, luces de cabina → 1).
   - Rampa de `toneMappingExposure`, bajando ~1 stop.
   - Lerp del color de fog: azul frío → ámbar cálido.
3. Un realce breve de bloom en el instante del cruce. **Motivado** — es el deslumbre de pasar de luz exterior brillante a interior — no un corte disfrazado.

**Alternativas evaluadas:**

| Opción | Veredicto |
|---|---|
| Volar por una puerta abierta con registración espacial exacta | Lo más auténtico, pero exige que el interior esté físicamente alineado dentro del fuselaje. Es la opción recomendada *combinada* con la disolución, no en lugar de ella. |
| Corte enmascarado por un flash a blanco | Barato y confiable. **Descartado**: el brief pide explícitamente "nunca cortes abruptos", y la referencia hace un cruce genuino. |
| Sólo disolución sin registración | Funciona, pero si el interior no coincide con la posición real del fuselaje, se nota en el momento del cruce. |

**Dos salvedades honestas:**

1. **Exterior e interior serán casi con certeza assets distintos** ([§6](#6-pipeline-de-assets)). Hacerlos coincidir espacialmente — tubo interior dentro del fuselaje, puerta alineada con la puerta del exterior, escalas consistentes — es **trabajo manual de alineación en Blender**, no algo que salga solo. Está presupuestado como tarea de la Fase 4.
2. **En el instante del cruce ambas escenas están residentes en memoria**: pico de draw calls y de VRAM. Mitigación: el interior se monta en el grafo de escena sólo en una ventana de scroll alrededor de S4–S6, y el exterior se descarga a una versión reducida una vez adentro. El frustum culling ayuda con los draw calls pero **no** con la memoria.

**Contenido:** mínimo o nulo. El momento debe respirar. A lo sumo una línea que marque la transición.

**Interactividad:** ninguna.

---

### Sección 5 — Recorrido interior por secciones

**Es la sección más cara del proyecto.** Ver [§11.7](#117-alcance-del-interior) y la decisión de alcance en [§12.3](#123-alcance-del-interior--resuelto).

| | |
|---|---|
| **Scroll** | 50–82% — el tramo más largo |
| **Cámara** | Walkthrough: avance por el pasillo a la altura de los ojos (~1.6m), con micro-oscilación lateral y vertical muy sutil para dar sensación de caminata. Pausas (mesetas en la curva de easing) en cada zona para que el overlay se lea. |
| **Entorno** | Cálido y contenido. Luz de cabina como fuente principal, más pequeñas piscinas de luz fría entrando por las ventanillas. Aquí es donde el DoF se justifica: profundidad de campo corta vendiendo la escala del pasillo. |

**Zonas — decisión confirmada: v1 con 3 zonas**, marcadas ★. Las otras 3 quedan documentadas como incremento posterior, no descartadas:

1. ★ Cabina de mando — hotspots sobre instrumentos
2. Primera clase — suites, hotspot sobre configuración de asiento *(diferida)*
3. Business / Economy Plus *(diferida)*
4. ★ Economy — el plano que muestra la anchura real de la cabina
5. ★ Escalera al piso superior — la transición vertical, visualmente el momento más distintivo de la sección
6. ★ Piso superior — la carga narrativa del "doble piso completo"

Nótese que las 3 zonas de v1 preservan el arco narrativo íntegro, incluido el momento que justifica haber elegido el A380 (piso superior corrido). Lo que se difiere es densidad de clases de cabina, no el clímax de la sección.

**Contenido:** overlay por zona con datos de configuración de esa cabina — asientos por clase, disposición, dimensiones.

**Interactividad:** la mayor densidad de hotspots del sitio, concentrada en las 3 zonas de v1. Asiento, pantalla de entretenimiento, galley, ventanilla, compartimiento superior.

---

### Sección 6 — Salida y vista final en vuelo

| | |
|---|---|
| **Scroll** | 82–95% |
| **Cámara** | Umbral inverso al de S4 — sale por una ventanilla o puerta — y luego un retroceso largo y continuo hasta una vista general del avión en vuelo. |
| **Entorno** | **No vuelve a la luz de S3.** Vuelve al frío pero en clave de atardecer: el arco cierra con "pasó el tiempo", no con un loop. Es lo que da sensación de viaje completado en vez de repetición. |

**Contenido:** outro — marca, créditos, atribuciones de licencia de los assets ([§11.1](#111-adquisición-del-modelo-3d--riesgo-bloqueante) — la atribución CC-BY se diseña acá, no se pega al final).

**Interactividad:** ninguna.

---

### Sección 7 — Footer

| | |
|---|---|
| **Scroll** | 95–100% |
| **Cámara** | Detenida. El canvas se oscurece hasta casi negro. |

**Contenido:** footer minimalista sobre el negro de S0. Bookend: la página termina donde empezó. Links, créditos, atribuciones de licencia, colofón técnico.

---

## 4. Rig de cámara

El corazón técnico del sitio. Especificación concreta:

**Keyframes por sección:** `{ camPos: Vector3, camTarget: Vector3, fov: number, roll: number }`.

**Dos splines, no una:**

- `CatmullRomCurve3` a través de todas las posiciones de cámara.
- Una segunda `CatmullRomCurve3` a través de todos los puntos de target.
- Por frame: `camera.position.copy(posCurve.getPointAt(t))` y `camera.lookAt(targetCurve.getPointAt(t))`.

**Por qué dos curvas y no keyframes de cuaternión:** interpolar un punto de mira y hacer `lookAt` sobre él garantiza que el avión permanezca encuadrado con coherencia, y es muchísimo más fácil de autorear y de ajustar. Los cuaterniones dan más control pero se vuelven inmanejables a mano.

**Override por sección:** roll y un offset de cuaternión opcional se aplican **después** del `lookAt`, para casos como la órbita de S3, donde la inclinación es intencional.

> **Gotcha que hay que documentar en el código:** usar **`getPointAt(t)`**, no `getPoint(t)`. `getPointAt` está reparametrizado por longitud de arco. Con `getPoint`, la cámara acelera y frena sola donde los puntos de control se agrupan — y el bug se lee como "el easing está mal", que manda a debuggear el lugar equivocado durante horas.

**Herramienta de autoría (Fase 2):** un modo debug con `OrbitControls` y un botón que vuelca la posición y target actuales de la cámara como un keyframe. Colocar keyframes a mano editando números es inviable; esta herramienta se paga sola en el primer día.

---

## 5. Materiales e iluminación

- **PBR en todo**, `MeshStandardMaterial` por defecto; `MeshPhysicalMaterial` sólo donde se justifique (vidrio de ventanillas con transmisión).
- **Tres HDRIs** — exterior golden hour (S1–S2), gran altitud (S3), atardecer (S6). El interior **no** usa HDRI: usa luces analíticas más un env map pequeño e irradiado para el relleno.
- **Transición entre HDRIs**: cross-fade de dos env maps mediante interpolación de `envMapIntensity` sobre dos escenas de fondo superpuestas. Costo: dos texturas de entorno residentes durante la transición.
- **Sombras:** shadow maps en tiempo real para todo es caro y en este sitio aporta poco. Recomendación: sombra proyectada de alta calidad, horneada, para el avión sobre la pista (S1–S2), y shadow map real sólo en el interior, con resolución acotada.
- **Reflejos:** sin reflejos en tiempo real. Env map + roughness map bien autoreado hace el trabajo a una fracción del costo.

---

## 6. Pipeline de assets

### 6.1 LOD: dos sets de assets, no un modelo con niveles

**El problema real no es LOD clásico.** No es "la misma malla a distintas distancias". Es que el mismo objeto necesita:

- silueta y panel lines legibles a **100 m** (S1),
- calidad de walkthrough a **0.5 m** (S5).

Son dos presupuestos de asset **incompatibles en un solo modelo**. Ningún `.glb` de A380 satisface ambos. Por eso:

| Asset | Contenido | Presupuesto orientativo |
|---|---|---|
| `exterior.glb` | Fuselaje, alas, motores, tren. **Sin geometría interior.** Panel lines y remaches por normal map, no por geometría. | ~150–400k tris, 2–4 sets de textura a 2K–4K |
| `cabin-*.glb` | Una por zona. Sólo el corredor que la cámara efectivamente recorre — no la cabina completa. | Variable; el techo lo pone la memoria de textura |
| `cockpit.glb` | Separado, alta densidad de detalle en un volumen pequeño | — |

**Los asientos van como `InstancedMesh`.** No es una optimización opcional: 400 asientos modelados individualmente no es shippable; 400 instancias de un asiento de 8k tris es trivial. Variación por instancia (color, ángulo de reclinado) vía atributos de instancia.

**LOD real dentro del interior:** limitar la longitud visible del corredor y hacer fade-out de las filas lejanas. Con una sola aeronave en pantalla, el exterior a ~300k tris está bien en desktop sin niveles de LOD.

### 6.2 El presupuesto lo mata la textura, no el triángulo

Es la parte del pipeline que más se subestima. Un albedo de 4K sin comprimir ocupa **~64 MB de VRAM**. El mismo en BasisU/ETC1S: **~5 MB**.

**KTX2/Basis es no negociable.** Con 8–12 sets de textura, la diferencia decide si el sitio corre o si el navegador mata la pestaña en iOS.

### 6.3 Pipeline

```
fuente (.blend / .fbx / .max)
  → export glTF
  → gltf-transform: prune, dedup, weld
  → Draco (geometría)
  → KTX2/BasisU (texturas)
  → .glb final
```

Scriptado y reproducible. Un asset reprocesado a mano seis semanas después nunca sale igual.

### 6.4 Carga progresiva

**No hace falta la cabina cargada para mostrar el hero.**

- **Bloqueante para S0:** sólo los assets de S1 — exterior, HDRI de golden hour, entorno de pista. **Objetivo: ≤ 15 MB comprimido.**
- **En streaming durante S1–S3:** assets de interior, mientras el usuario mira el despegue.
- **Guardarraíl:** si el interior no terminó de cargar al llegar a S4, se sostiene el scroll con una transición elegante en vez de mostrar una cabina a medio cargar.

---

## 7. Presupuesto de performance

Umbrales concretos, no "que ande fluido".

### 7.1 Tiers

| | Desktop High | Desktop Low / Mobile High | Mobile Low |
|---|---|---|---|
| **fps objetivo** | 60 | 45–60 | **30** |
| DPR máximo | 2.0 | 1.5 | 1.0 |
| Triángulos en pantalla | < 1.5M | < 800k | < 500k |
| Draw calls | < 250 | < 150 | < 100 |
| VRAM de textura | < 350 MB | < 200 MB | < 120 MB |
| Post-proceso | Bloom + DoF + viñeta + grano | Bloom + viñeta | Sólo tone mapping |
| Partículas | 100% | 40% | 0% |
| Sombras | Interior en tiempo real | Sólo horneadas | Sólo horneadas |

### 7.2 Reparto del frame (16.6 ms, desktop)

| Render de escena | Post-proceso | JS / scroll / lógica | Headroom |
|---|---|---|---|
| ~8 ms | ~3 ms | ~2 ms | ~3 ms |

El headroom no es opcional: es lo que absorbe los picos de GC y las transiciones de sección.

### 7.3 Detección automática de tier

Medir el frame time durante ~2s tras el primer render del hero. Si la mediana supera 20 ms, bajar un tier. Además, un override manual en el nav — la detección automática se equivoca, y un usuario con una buena máquina que cayó al tier bajo debe poder corregirlo.

### 7.4 Costo real de cada efecto de post-proceso

Sin optimismo:

| Efecto | Costo @1080p | Veredicto |
|---|---|---|
| **ACES Filmic tone mapping** | ~0 ms | Sí, en todos los tiers. Es una operación de shader en el pass de salida. |
| **Bloom** (con umbral) | ~1.5–3 ms | Sí en desktop. Aceptable en mobile high con menos niveles de mipmap. |
| **Depth of Field** | **3–5 ms+** | **No es gratis.** Sólo en el interior (S5), sólo desktop. "DoF sutil en todo el sitio" es un pedido caro y hay que decirlo. |
| **Viñeta + grano** | < 0.5 ms | Sí. Fusionados en un solo pass junto al resto (por eso `postprocessing` y no `EffectComposer`). |
| **Godrays volumétricos** en el umbral | 4–8 ms | **Sólo desktop high**, como enhancement. No es baseline. Si no entra en presupuesto, se cae — el cruce de S4 no depende de esto. |

---

## 8. Accesibilidad y fallback

### 8.1 `prefers-reduced-motion`

**No mata la experiencia.** Mantiene la escena 3D, pero:

- Lenis desactivado por completo; scroll nativo.
- Scrub continuo → snapping discreto por sección con cross-fade.
- Sin parallax de mouse, sin drift de partículas, sin vibración de cámara en S2.
- Micro-oscilación de caminata en S5 desactivada.

### 8.2 Sin WebGL2

Detección al boot (incluyendo `failIfMajorPerformanceCaveat` para descartar renderers por software). Sin soporte → página estática narrativa: **misma copy, misma tipografía, misma estructura**, con stills de alta calidad por sección.

> **Salvedad honesta sobre el video:** el video scrubbeado por scroll (buscar frames según el scroll) funciona razonablemente en desktop Chrome/Safari con un archivo de keyframes densos, pero es **poco confiable en Android** — el seeking se atasca o se saltea. Por eso el fallback real son los **stills**, y el video scrubbeado queda como enhancement opcional, no como el plan.

### 8.3 Accesibilidad más allá del movimiento

Fácil de arruinar en un sitio así, y es un marcador genuino de calidad:

- **Todo el contenido técnico es DOM real**, no texto dibujado en canvas. Seleccionable, buscable, traducible.
- Jerarquía semántica de headings, legible en orden lineal por lector de pantalla independientemente de la posición de scroll.
- El canvas lleva `aria-hidden`, con la narrativa disponible como texto.
- Hotspots navegables por teclado, con foco visible.
- Contraste AA sobre los fondos más claros — S3 es el caso difícil (§10.5).

---

## 9. Contenido informativo

> ⚠️ **Estado de verificación — leer antes de usar cualquier cifra.**
> En esta sesión el acceso a fuentes primarias falló: `WebFetch` devolvió **HTTP 403** en `airbus.com`, `en.wikipedia.org` y `sketchfab.com`. Todas las cifras de abajo provienen de **resúmenes de búsqueda de fuentes secundarias** y **ninguna está verificada contra fuente primaria**. No se debe redactar copy final con estos números sin la pasada de verificación de la Fase 9.

| Dato | Valor (sin verificar) | Sección | Estado |
|---|---|---|---|
| Envergadura | 79.8 m / 261 ft 10 in | S3 | ⚠️ Verificar |
| Longitud | 72.7 m / 238 ft 8 in | S3 | ⚠️ Verificar |
| Altura | 24.1 m / 79 ft | S3 | ⚠️ Verificar |
| Motores | 4 × RR Trent 900 **o** Engine Alliance GP7200 | S2 | ⚠️ Verificar — **son dos opciones; elegir una y ser consistente** |
| Empuje por motor | ~311–356 kN | S2 | 🔴 **Conflicto de fuentes** — ver nota |
| Velocidad de crucero | Mach 0.85 | S3 | ⚠️ Verificar |
| Velocidad máxima | Mach 0.89 / ~945 km/h | S3 | ⚠️ Verificar |
| Velocidad de rotación | ~150–180 kt | S2 | 🟡 **Condicional** — ver nota |
| Distancia de pista | ~2,900–3,000 m a MTOW | S2 | 🟡 **Condicional** — ver nota |
| Alcance | ~15,200–15,400 km | S3 | ⚠️ Verificar — varía por fuente y variante |
| Techo de servicio | 43,100 ft / 13,136 m | S3 | ⚠️ Verificar |
| MTOW | 575,000 kg | S2 | ⚠️ Verificar |
| Capacidad de combustible | ~320,000 L | S2/S3 | ⚠️ Verificar |
| Pasajeros (3 clases) | 525 | S3/S5 | ⚠️ Verificar |
| Pasajeros (máximo certificado) | 853 | S3 | ⚠️ Verificar |
| Config. típica alta densidad | 615 (2 clases) | S5 | ⚠️ Verificar — cifra específica de aerolínea |
| Disposición cubierta principal | 3-4-3 en economy | S5 | ⚠️ Verificar |
| Disposición cubierta superior | 2-4-2 en economy | S5 | ⚠️ Verificar |
| Longitud útil cubierta superior | 44.93 m / 147.4 ft | S5 | ⚠️ Verificar |
| Ancho de fuselaje | 7.14 m | S5 | ⚠️ Verificar |

**Notas sobre las marcas especiales:**

🔴 **Conflicto de empuje.** Una fuente reporta "1,208 kN" para el Trent 900. Eso es del orden del **empuje total de los cuatro motores** (4 × ~302 kN), no por motor, e **incompatible** con las cifras por-motor del rango 311–356 kN. No se promedia ni se elige uno en silencio: hay que resolverlo contra Airbus o Rolls-Royce directamente, y ser explícito en la copy sobre si la cifra es por motor o total.

🟡 **Cifras intrínsecamente condicionales.** La velocidad de rotación y la distancia de pista **dependen del peso, la altitud de presión, la temperatura y el viento**. No admiten un número absoluto. Deben redactarse siempre como "típico" o con condiciones declaradas ("a MTOW, nivel del mar, día ISA"), nunca como dato duro. Presentarlas como absolutas es incorrecto, no una simplificación.

### 9.1 Punto no planteado en el brief: propiedad intelectual

Las libreas y las configuraciones de cabina de aerolíneas reales (Emirates, Singapore Airlines, etc.) son **marcas registradas y diseños protegidos**. Varias de las cifras de configuración de arriba son específicas de una aerolínea.

**Decisión confirmada por el usuario: librea ficticia y neutra**, con un nombre de marca inventado para el proyecto. Elimina la cuestión de IP, y además le da al sitio una identidad propia en vez de parecer material de marketing de un tercero. Ver [§12.4](#124-librea--resuelto).

---

## 10. Dirección de arte

### 10.1 Arco de grading

No es una lista de adjetivos: es un arco de temperatura y luminancia diseñado para que **cada umbral narrativo sea un salto real**, que es exactamente lo que hace legible el cruce en el sitio de referencia.

```
S0 negro → S1/S2 cálido → S3 frío brillante → S5 cálido contenido → S6 frío atardecer → S7 negro
```

| Sección | Base | Key / acento | Sombra | Carácter |
|---|---|---|---|---|
| **S0** Loading | `#0A0C10` | `#E8B87A` | — | Negro, un solo acento cálido. Sin ornamento. |
| **S1** Pista | `#2A2C30` asfalto | `#F0A860` sol | `#1E3A44` teal | Golden hour, sol bajo, sombras largas |
| **S2** Despegue | S1 + exposición subiendo | `#F0A860` | `#1E3A44` | Igual que S1, desaturando al ascender |
| **S3** Ascenso | `#7FB3D5` cielo | `#FFFFFF` nube | `#4A7BA0` | **Máxima luminancia del sitio.** Limpio, alto contraste |
| **S4** Umbral | transición | frío → cálido, −1 stop | — | El salto |
| **S5** Interior | `#1A1410` | `#D9A566` luz de cabina | `#B8D4E8` ventanilla | Clave baja, alto contraste local |
| **S6** Salida | `#2B3A55` | `#E89B6C` | `#16203A` | Frío al atardecer — "pasó el tiempo", no un loop |
| **S7** Footer | `#0A0C10` | `#E8B87A` | — | Bookend de S0 |

**Por qué S6 no vuelve a S3:** si el cierre repitiera la luz del ascenso, el recorrido se leería como un bucle. Al atardecer, se lee como un viaje terminado.

### 10.2 Sistema tipográfico

**Dos familias:**

- **Display** — grotesque variable, tracking cerrado, alto contraste de peso. Títulos de sección y hero.
- **Mono** — para todos los datos técnicos. Los números deben leerse como instrumentación, no como texto corrido.

> **Requisito no obvio:** el mono debe tener **cifras tabulares**. Si los datos se animan con conteo ascendente, sin cifras tabulares los números *bailan* horizontalmente mientras cuentan. Se ve barato y es exactamente el tipo de detalle que separa un sitio de estudio de una demo.

Variable fonts en ambos casos, para no pagar cuatro pesos en payload.

**Escala:**

| Rol | Tamaño | Tratamiento |
|---|---|---|
| Hero | `clamp(3rem, 8vw, 7rem)` | Display, tracking `-0.03em` |
| Título de sección | `clamp(2rem, 4vw, 3.5rem)` | Display, tracking `-0.02em` |
| Valor de dato | `clamp(2.5rem, 5vw, 4rem)` | Mono, cifras tabulares |
| Etiqueta de dato | `0.75rem` | Mono, mayúsculas, tracking `0.16em` |
| Cuerpo | `1rem / 1.6` | Máximo `38ch` de ancho |

**Regla de layout, transversal a todas las secciones:**

> Los overlays ocupan **los tercios exteriores** de la pantalla. **El tercio central queda reservado al avión.** Se implementa con una grilla compartida, no ajustando posiciones a ojo sección por sección.

### 10.3 Hotspots

**Forma:** punto sólido de 12px + anillo de 1px. Un segundo anillo animado escala de 1× a 2.2× mientras su opacidad va de 0.6 a 0, en 2.4s con `ease-out`, en loop.

**Detalle:** el pulso va **escalonado por hotspot** (delay aleatorio o incremental). Si todos pulsan al unísono se lee como una UI parpadeando; escalonados se leen como puntos de interés vivos.

**Implementación:** drei `<Html occlude="blending" distanceFactor={n}>`. `distanceFactor` los escala con la perspectiva; `occlude="blending"` da oclusión real por profundidad **sin** el costo de raycast de `occlude={[refs]}`.

**Hover:** el anillo se detiene, el punto se expande, una línea guía fina se dibuja hasta una tarjeta. La tarjeta es **DOM**, no canvas — el texto queda seleccionable y accesible.

> **Detalle de interacción crítico, fácil de pasar por alto:** los hotspots interactivos dentro de una página conducida por scroll **compiten con el gesto de scroll en touch**. Un tap que empieza sobre un hotspot puede comerse el scroll.
>
> **Solución:** `pointer-events: none` por defecto; se habilitan sólo cuando el progreso de scroll de su sección está dentro de una **banda de dwell**. Fuera de esa banda son puramente decorativos y el scroll pasa a través.

### 10.4 Pantalla de carga

Negro. Wordmark centrado. Una regla hairline que se llena de izquierda a derecha. Porcentaje en mono con cifras tabulares. Nada más — el contraste con la riqueza de la escena que sigue es el efecto.

Salida: la regla se expande a ancho completo → wordmark sube y se desvanece → la exposición del canvas rampa de 0 al objetivo en ~1.2s. La escena **se revela**, no aparece.

### 10.5 Nav fijo

64px de alto, fijo, transparente sobre el canvas. Izquierda: wordmark. Derecha: indicador de progreso con 7 marcas (la activa alargada) + toggle de calidad.

> **Sin audio en v1 ([§12.5](#125-audio--resuelto)):** el nav no lleva toggle de mute. Si el audio se agrega en una iteración futura, el toggle entra acá, junto al de calidad — no antes.

> **Decisión de legibilidad, con su razón:** `mix-blend-mode: difference` es la solución tentadora para texto legible sobre escenas de luminancia variable. **Se descarta**: sobre las nubes brillantes de S3 se rompe y produce un resultado sucio e impredecible. En su lugar, un **scrim** sutil en degradado desde el borde superior. Menos elegante como truco, confiable en las 8 secciones.

---

## 11. Riesgos

### 11.1 Adquisición del modelo 3D

**Decisión confirmada ([§12.2](#122-fuente-y-presupuesto-del-modelo-3d--resuelto)): exterior CC-BY existente, interior modelado a medida en Blender. Nada comprado, nada encargado a terceros.**

Con esto resuelto, el riesgo **cambia de naturaleza**: ya no es "conseguir el asset", es **el tiempo de modelado del interior**, que ahora es trabajo propio de principio a fin.

Lo que arrojó la investigación sobre el exterior:

- **Modelos gratuitos CC-BY en Sketchfab: existen varios A380.** Son *game-ready* / low-poly, construidos para leerse en silueta a distancia — que es exactamente el uso que tienen en este plan (S1–S3, S6). No necesitan aguantar el rango de cámara de S5, porque el interior ya no sale de ahí.

**Salvedad sobre la investigación misma:** las páginas de producto no se pudieron abrir (403 en sketchfab.com). Los conteos de polígonos, formatos disponibles y términos exactos de licencia de cada modelo **no están verificados**. La auditoría modelo por modelo sigue siendo tarea pendiente de Fase 0.

**Sobre el interior modelado a medida — lo que esto implica en la práctica:**

- **Costo:** cero en licencias, pero el ítem de mayor tiempo del proyecto entero. Modelar pasillo, asientos (base para instancing), paneles, iluminación embebida y detalle de cada zona desde cero en Blender no es un fin de semana por zona.
- **Ventaja real, no sólo ausencia de costo:** al ser un modelo propio, se puede diseñar **ya optimizado** para el walkthrough (topología pensada para la cámara que efectivamente pasa por ahí, sin geometría de más) y ya alineado con el exterior desde el modelado mismo — mitiga parte del riesgo de registración espacial de [§11.2](#112-registración-espacial-exteriorinterior), porque la alineación se decide al modelar, no se ajusta después a la fuerza.
- **Contrapartida honesta:** no va a tener la fidelidad de un interior de referencia real (materiales, mecanismos, cantidad de detalle de un asiento de primera clase real). Es una recreación estilizada, no un gemelo digital. Eso es aceptado explícitamente como parte de la decisión, no un defecto a ocultar.

**Criterios de aceptación para el asset exterior CC-BY:**

- [ ] Licencia auditada y compatible con el uso previsto
- [ ] Tren de aterrizaje como nodos separados y jerarquizados (lo requiere S2 — ver la nota de asset de la Sección 2)
- [ ] UVs limpias y sin solapamientos
- [ ] Texturas PBR disponibles, no materiales horneados de un renderer específico
- [ ] Escala y orientación correctas, o corregibles sin romper la jerarquía

> **Sobre la licencia:** CC-BY exige **atribución visible**. Eso se **diseña dentro del footer desde el principio** (§ Sección 6/7), no se pega al final como un parche. Y **CC-BY-NC sería inutilizable** si esto llega a funcionar como pieza de portfolio con cualquier connotación comercial. Cada candidato se audita individualmente — la licencia declarada en un listado de búsqueda no es suficiente.

### 11.2 Registración espacial exterior/interior

Si el exterior y el interior son assets distintos (lo más probable), tienen que **coincidir físicamente**: el tubo interior dentro del fuselaje, la puerta de entrada alineada con la puerta del exterior, escalas consistentes. Es alineación manual en Blender y está presupuestada en Fase 4. Si no coincide, el cruce de S4 se rompe justo en el momento que más importa.

### 11.3 Performance en mobile

**Afirmación honesta, sin optimismo:** una experiencia full-3D conducida por scroll **no alcanza 60fps en Android de gama media**, y frecuentemente tampoco 30 sin recortes agresivos.

**El objetivo declarado para mobile es 30fps en tier reducido, no 60.** Por debajo de eso, corresponde el fallback estático de §8.2. Prometer 60fps en mobile sería falso.

### 11.4 Cross-browser / iOS

El techo real no es desktop. Es **iOS Safari**:

- Mata pestañas por encima de aproximadamente **250–400 MB** de memoria. Es el límite duro que gobierna el presupuesto de VRAM.
- Debilidades históricas con el **transcoder KTX2 en web workers**.
- Debilidades históricas con **render targets de punto flotante**, que es lo que usa el bloom.

Cada una de estas tiene workaround, pero deben probarse en dispositivo real temprano — no en el simulador, y no en Fase 8.

### 11.5 Complejidad del cruce de umbral

S4 es la pieza **bespoke** de mayor riesgo: no hay una receta estándar. Por eso tiene su propia fase de spike (Fase 4), **antes** de cualquier trabajo de pulido. Si el efecto no funciona, hay que saberlo temprano, cuando todavía hay margen para replantear.

### 11.6 Longitud de scroll vs. fatiga

Ocho secciones scrubbeadas implican un scroll muy largo. Demasiado largo produce fatiga y abandono. El riesgo sigue vigente aun con la decisión tomada — **~800vh confirmado** ([§12.6](#126-longitud-total-de-scroll--resuelto)) — porque es una cifra de partida, no una garantía: si en la implementación se siente pesado, corresponde acortar, no forzar el número.

**Mitigación no negociable:** un "saltar a sección" en el nav para quien prefiera navegar en vez de recorrer completo.

### 11.7 Alcance del interior

Las seis zonas de S5 son fácilmente el **60% del trabajo total** del proyecto — y con la decisión de §12.2 de modelar todo a medida en Blender, esa proporción **sube, no baja**: antes al menos existía la posibilidad de comprar geometría ya hecha; ahora cada zona es modelado propio de punta a punta (pasillo, asientos base para instancing, paneles, iluminación embebida). Es, con diferencia, la parte más subestimable del plan. Ver [§12.3](#123-alcance-del-interior) — con modelado 100% propio, la razón para arrancar con 3 zonas en vez de 6 es todavía más fuerte que antes.

### 11.8 Payload total

Incluso bien optimizado, esto probablemente pesa **20–40 MB** en total. En conexiones lentas es una espera larga. La carga progresiva (§6.4) es la mitigación, pero **agrega complejidad**: hay que manejar el caso de "el usuario llegó a S4 antes de que cargara el interior".

---

## 12. Decisiones confirmadas

Las 6 decisiones fundacionales del proyecto. Todas fueron presentadas al usuario con opciones explicadas y una recomendación, vía cuestionario, y **todas quedaron confirmadas en la opción recomendada.** No queda ninguna pregunta abierta de esta lista.

### 12.1 Stack final — **RESUELTO**

**Decisión confirmada: R3F + drei**, sobre la alternativa de Three.js vanilla.

Razón (desarrollada en [§2.1](#21-motor-de-render-react-three-fiber--drei)): el código del rig de cámara es idéntico en ambos casos, así que la diferencia real está en la capa DOM — loader, nav, overlays, hotspots — que sí tiene estado genuino y donde drei ahorra trabajo concreto (`<Html occlude>` para oclusión por profundidad, carga de GLTF+Draco+KTX2 resuelta, `useProgress`). Con la regla dura de que el scroll vive en un ref mutable y nunca en `useState`, el costo de reconciliación de React es despreciable.

### 12.2 Fuente y presupuesto del modelo 3D — **RESUELTO**

**Decisión confirmada: Opción A, sin nada comprado ni encargado a terceros.**

- **Exterior:** modelo gratuito CC-BY existente (Sketchfab u otro repositorio equivalente), auditado por licencia y por los criterios de aceptación de [§11.1](#111-adquisición-del-modelo-3d). No es una compra ni un encargo — es un asset ya publicado y disponible.
- **Interior:** **modelado a medida en Blender**, íntegramente desde cero. Se acepta explícitamente que **no sea una réplica exacta del A380 real** — el objetivo es un interior propio, controlado, optimizado para el recorrido de S5, no un gemelo digital certificado.
- **Descartado sin ambigüedad:** compra de sets de interior (TurboSquid/CGTrader, ~USD 129–149) y encargo de modelado a un tercero. Las opciones B y C quedan fuera del plan.

Esto **destraba la Fase 3 en adelante** en lo referido a la fuente del asset. Lo que queda pendiente no es *de dónde sale* el modelo sino *el trabajo de modelarlo* — ver el cronograma en [§13](#13-fases) y el riesgo en [§11.7](#117-alcance-del-interior).

### 12.3 Alcance del interior — **RESUELTO**

**Decisión confirmada: v1 con 3 zonas** — cabina de mando, economy, escalera + piso superior. Las otras 3 (primera clase, business/economy plus) quedan como incremento posterior, documentadas, no descartadas.

Razón: preserva el arco narrativo completo, incluido el piso superior corrido — el punto central de haber elegido el A380 sobre el 747 — a una fracción del tiempo de modelado. Con la decisión de §12.2 de modelar todo a mano en Blender, cada zona es tiempo de trabajo real y no hay atajo de comprar geometría, así que el argumento para empezar acotado es más fuerte que si se hubiera podido comprar el interior.

### 12.4 Librea — **RESUELTO**

**Decisión confirmada: librea ficticia y neutra**, con nombre de marca inventado para el proyecto.

Razón (desarrollada en [§9.1](#91-punto-no-planteado-en-el-brief-propiedad-intelectual)): las libreas y configuraciones de cabina de aerolíneas reales son marca registrada y diseño protegido. Una marca propia elimina la cuestión de IP por completo y le da al sitio identidad propia, en vez de leerse como material de marketing no autorizado de un tercero.

### 12.5 Audio — **RESUELTO**

**Decisión confirmada: sin audio en la v1.**

Razón: el brief prioriza explícitamente calidad visual por encima de features accesorias, y el audio trae complejidad real y no gratuita — política de autoplay de los navegadores (tiene que arrancar muteado sí o sí), un toggle más que diseñar en un nav ya acotado, y diseño/mezcla de sonido de varios estados (motor, ambiente de cabina, acento en el umbral). Queda como enhancement de una iteración futura, sin que la arquitectura actual lo bloquee: el nav no reserva espacio para un toggle de mute en v1 (§10.5).

### 12.6 Longitud total de scroll — **RESUELTO**

**Decisión confirmada: se sostiene el presupuesto de ~800vh**, sobre la alternativa más compacta de ~500–600vh.

Razón: da respiro real a las dos secciones que más lo necesitan — el walkthrough interior (S5, el tramo más largo, con 3 zonas tras §12.3) y el cruce del umbral (S4, que el propio plan marca que "debe respirar", no puede resolverse apurado). El riesgo de fatiga de [§11.6](#116-longitud-de-scroll-vs-fatiga) sigue vigente como algo a monitorear en implementación, mitigado con "saltar a sección" en el nav — la cifra es el punto de partida confirmado, no una garantía cerrada en piedra si en la práctica se siente pesado.

---

## 13. Fases

> **La recomendación de proceso más valiosa de este plan:** validar el **arco narrativo completo con geometría placeholder** — literalmente una caja como avión — **antes** de cualquier trabajo de asset real. Si el recorrido de cámara no funciona, hay que descubrirlo con una caja, no después de gastar días modelando.
>
> **Ajuste tras la decisión de §12.2:** como el interior se modela a medida y es la tarea más larga del proyecto, **conviene arrancarla ya, en paralelo con las Fases 1–2**, en vez de esperar a que el rig de cámara esté validado. El riesgo de "modelar algo que después no encaja con la cámara" se mitiga con la herramienta de autoría de keyframes de la Fase 2 (permite ajustar el recorrido a la geometría real, no sólo al revés) y con el criterio de registración espacial de [§11.2](#112-registración-espacial-exteriorinterior) aplicado desde el modelado mismo.

| Fase | Contenido | Dependencias |
|---|---|---|
| **0** | Todas las decisiones de §12 ya están cerradas. Queda: auditoría de licencia del exterior CC-BY y **arranque del modelado del interior en Blender** — es la tarea de mayor duración del proyecto, conviene iniciarla en paralelo con las Fases 1–2, no esperar a que terminen | No bloquea el inicio de 1–2 |
| **1** | Esqueleto: Vite + TS, canvas, Lenis + ScrollTrigger, escalar de progreso, HUD de debug | — |
| **2** | **Rig de cámara con placeholder a través de las 8 secciones.** Herramienta de autoría de keyframes. Validación del arco completo | 1 |
| **3** | Pipeline de assets exterior. Secciones 1–3 con el modelo real | 0 (exterior auditado), 2 |
| **4** | **Spike del umbral (S4).** Registración espacial exterior/interior | 3 |
| **5** | Interior (S5): **3 zonas de v1** (cabina de mando, economy, escalera + piso superior — §12.3), instancing de asientos, iluminación de cabina | 4 |
| **6** | S6, S7. Sistema de overlays, tipografía, hotspots | 5 |
| **7** | Post-proceso y pasada de dirección de arte: grading por sección, tone mapping, bloom, DoF | 6 |
| **8** | Tiering de performance, mobile, fallback estático, accesibilidad | 7 |
| **9** | **Verificación de datos (§9)** y redacción de copy final | — (paralelizable) |

El seguimiento vive en [`PROGRESS.md`](./PROGRESS.md).
