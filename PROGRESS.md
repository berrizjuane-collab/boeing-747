# PROGRESS — Sitio Scrollytelling 3D de Presentación de Aeronave

Checklist de seguimiento espejado a las fases de [`PLAN.md`](./PLAN.md).
Sirve para retomar contexto entre sesiones: **antes de trabajar, leer las notas de la fase activa.**

**Estado global: Fase 0 — decisión de asset resuelta, resto de §12 pendiente. `PLAN.md` en revisión.**

Convención: `[ ]` pendiente · `[~]` en curso · `[x]` completo · `[!]` bloqueado

---

## Fase 0 — Decisiones y adquisición de assets

> **Contexto:** la fuente del modelo 3D ya está resuelta (ver abajo) — deja de bloquear el inicio de las Fases 1–2. Lo que sí conviene arrancar ya, en paralelo, es el modelado del interior: es la tarea de mayor duración de todo el proyecto.

### Decisión de asset — RESUELTA

- [x] **Fuente del modelo 3D** — **Opción A confirmada.** Exterior: modelo CC-BY gratuito existente (no comprado, no encargado). Interior: modelado a medida en Blender, íntegramente desde cero, sin buscar fidelidad exacta al A380 real. Ver §11.1 y §12.2 de PLAN.md.

### Decisiones pendientes (§12 de PLAN.md)

- [ ] **Stack final** — R3F + drei (recomendado) vs. Three.js vanilla
- [ ] **Alcance del interior** — 6 zonas vs. 3 para v1 (recomendado: 3 — la razón es más fuerte ahora que todo el interior es modelado propio)
- [ ] **Librea** — ficticia/neutra (recomendada) vs. aerolínea real
- [ ] **Audio** — ¿lleva? Afecta el diseño del nav
- [ ] **Longitud total de scroll** — ¿se sostiene ~800vh?

### Auditoría del asset exterior

- [ ] Relevar candidatos a modelo exterior de A380 CC-BY
- [ ] **Auditar licencia de cada candidato individualmente** — no confiar en lo que declara un listado de búsqueda
- [ ] Descartar CC-BY-NC si el proyecto tiene cualquier connotación comercial
- [ ] Verificar criterios de aceptación por candidato:
  - [ ] Tren de aterrizaje como nodos separados y jerarquizados (lo requiere S2)
  - [ ] UVs limpias, sin solapamientos
  - [ ] Texturas PBR reales, no materiales horneados de un renderer específico
  - [ ] Escala y orientación correctas o corregibles sin romper la jerarquía
- [ ] Definir el texto de atribución CC-BY y **diseñarlo dentro del footer** (no pegarlo al final)

### Modelado del interior en Blender — puede arrancar ya, en paralelo

- [ ] Definir el layout base del interior propio (pasillo, disposición de zonas) — no una réplica exacta
- [ ] Modelar el asiento base para `InstancedMesh` (ver Fase 5)
- [ ] Modelar pasillo y paneles de al menos las 3 zonas de la v1 recomendada (§12.3)
- [ ] Alinear el modelado con las dimensiones del exterior CC-BY elegido, para minimizar el trabajo de registración de la Fase 4

---

## Fase 1 — Esqueleto

- [ ] Proyecto Vite + TypeScript
- [ ] Canvas WebGL a pantalla completa, renderer configurado (ACES Filmic, color space correcto)
- [ ] Lenis integrado
- [ ] GSAP + ScrollTrigger integrados con Lenis (`lenis.on('scroll', ScrollTrigger.update)` + `gsap.ticker`, `lagSmoothing(0)`)
- [ ] Escalar de progreso de scroll en store mutable — **verificar que NO dispara re-renders de React**
- [ ] HUD de debug: progreso, sección activa, fps, draw calls, triángulos
- [ ] Estructura de secciones definiendo las alturas de scroll

---

## Fase 2 — Rig de cámara con placeholder · **HITO DE VALIDACIÓN**

> **Contexto:** el objetivo es validar el recorrido narrativo completo con una caja como avión. Si el arco no funciona, hay que descubrirlo acá, antes de gastar en assets.

- [ ] Estructura de keyframes `{ camPos, camTarget, fov, roll }`
- [ ] Doble `CatmullRomCurve3` — una de posiciones, otra de targets
- [ ] **Usar `getPointAt`, no `getPoint`** (reparametrización por longitud de arco) — dejarlo comentado en el código
- [ ] Override de roll / cuaternión por sección, aplicado después del `lookAt`
- [ ] `scrub` numérico calibrado (arranque en `1`)
- [ ] Verificar que hay **un solo** mecanismo de suavizado (scrub, sin damping encima)
- [ ] **Herramienta de autoría de keyframes**: OrbitControls + volcado de posición/target actuales
- [ ] Geometría placeholder para avión y entorno
- [ ] Recorrido completo de las 8 secciones navegable de punta a punta
- [ ] **Revisión del arco narrativo con placeholder — GATE antes de Fase 3**

---

## Fase 3 — Pipeline exterior y secciones 1–3

**Depende de: Fase 0 (asset), Fase 2 (rig validado)**

### Pipeline

- [ ] Pipeline `gltf-transform` scriptado y reproducible (prune, dedup, weld → Draco → KTX2/BasisU)
- [ ] `exterior.glb` procesado dentro de presupuesto (~150–400k tris)
- [ ] Verificar VRAM de textura tras compresión KTX2

### Sección 1 — Hero pista

- [ ] Entorno de pista: asfalto con marcas, césped, hangares/torre a distancia
- [ ] HDRI golden hour
- [ ] Niebla exponencial para aplanar el fondo lejano
- [ ] Partículas de polvo suspendido
- [ ] Deriva lenta de cámara + parallax de mouse

### Sección 2 — Rodaje y despegue

- [ ] Traslación acelerando del avión
- [ ] Vibración/cabeceo de alta frecuencia y amplitud decreciente
- [ ] Rotación (morro ~10°)
- [ ] Separación y **retracción del tren** — *si el asset lo soporta; si no, aplicar plan B (§3 S2 de PLAN.md)*
- [ ] Sombra proyectada desplazándose sobre el asfalto
- [ ] Tracking shot lateral

### Sección 3 — Ascenso

- [ ] Órbita de cámara hasta vista frontal
- [ ] Transición al HDRI de gran altitud
- [ ] Capa de nubes (planos con billboarding + parallax, no volumétrico)
- [ ] Verificar que S3 es el punto de máxima luminancia del sitio

---

## Fase 4 — Spike del umbral (S4) · **MAYOR RIESGO TÉCNICO**

> **Contexto:** pieza bespoke sin receta estándar. Si no funciona, hay que saberlo ahora, con margen para replantear. No pasar a Fase 5 sin resolverla.

- [ ] **Registración espacial exterior/interior en Blender** — tubo interior dentro del fuselaje, puerta alineada, escalas consistentes
- [ ] Definición del plano de umbral y del escalar `t`
- [ ] Shader de disolución radial del fuselaje
- [ ] Cross-fade de env map exterior → luces de interior
- [ ] Rampa de `toneMappingExposure` (−1 stop)
- [ ] Lerp del color de fog (azul frío → ámbar cálido)
- [ ] Realce de bloom motivado en el cruce
- [ ] Montaje del interior en el grafo **sólo** en la ventana S4–S6
- [ ] Medir el pico de memoria y de draw calls durante el cruce
- [ ] **Revisión: ¿se lee como cruzar un umbral o como un corte? — GATE**

---

## Fase 5 — Interior (S5)

**Alcance sujeto a la decisión §12.3 — marcadas con ★ las 3 zonas de la v1 recomendada**

- [ ] Assets de interior procesados por el pipeline
- [ ] **Asientos como `InstancedMesh`** con variación por atributos de instancia
- [ ] Iluminación de cabina: luces analíticas + env map pequeño irradiado
- [ ] Shadow map de interior con resolución acotada
- [ ] LOD de corredor: fade-out de filas lejanas
- [ ] Cámara de walkthrough a ~1.6m con micro-oscilación sutil
- [ ] Mesetas de easing en cada zona para lectura de overlays

### Zonas

- [ ] ★ Cabina de mando
- [ ] Primera clase
- [ ] Business / Economy Plus *(candidata a recorte)*
- [ ] ★ Economy
- [ ] ★ Escalera al piso superior
- [ ] ★ Piso superior

---

## Fase 6 — Cierre, overlays y hotspots

### Secciones 6 y 7

- [ ] Umbral inverso de salida
- [ ] Retroceso largo a vista general en vuelo
- [ ] Grading de atardecer — **verificar que NO repite la luz de S3** (el cierre no debe leerse como loop)
- [ ] Outro con marca y créditos
- [ ] Footer con atribuciones de licencia

### Sistema de overlays

- [ ] Grilla compartida: **tercio central reservado al avión**, overlays en los tercios exteriores
- [ ] Fuentes variables cargadas (display + mono)
- [ ] **Verificar cifras tabulares en el mono** — sin ellas los números bailan al animarse
- [ ] Escala tipográfica con `clamp()`
- [ ] Fade + desplazamiento sincronizados a scroll

### Hotspots

- [ ] `<Html occlude="blending" distanceFactor>` de drei
- [ ] Punto 12px + anillo, pulso 1×→2.2× / opacidad 0.6→0 en 2.4s
- [ ] **Pulso escalonado entre hotspots** (no al unísono)
- [ ] Hover: anillo se detiene, línea guía, tarjeta DOM
- [ ] **Banda de dwell: `pointer-events: none` fuera de ella** — evita que compitan con el scroll en touch
- [ ] Navegación por teclado con foco visible

### Pantalla de carga y nav

- [ ] Loader con `useProgress`
- [ ] **Ponderar el progreso por peso esperado de asset** — si no, la barra pega saltos
- [ ] Secuencia de salida: regla se expande → wordmark sube → exposición 0→objetivo en ~1.2s
- [ ] Nav fijo 64px con **scrim en degradado** (`mix-blend-mode: difference` fue descartado: se rompe sobre las nubes de S3)
- [ ] Indicador de 7 marcas con la activa alargada
- [ ] "Saltar a sección"

---

## Fase 7 — Post-proceso y dirección de arte

- [ ] `postprocessing` (fusiona efectos en un shader; **no** el `EffectComposer` nativo)
- [ ] ACES Filmic tone mapping — todos los tiers
- [ ] Bloom con umbral — presupuesto ~1.5–3 ms
- [ ] DoF — **sólo S5, sólo desktop** (3–5 ms+, no es gratis)
- [ ] Viñeta + grano fusionados en un pass
- [ ] Godrays en el umbral — *sólo desktop high; si no entra en presupuesto, se cae*
- [ ] Grading por sección según la tabla de paletas de §10.1
- [ ] **Medir el frame time después de cada efecto agregado, no al final**

---

## Fase 8 — Performance, mobile, fallback, accesibilidad

### Tiering

- [ ] Tres tiers implementados según la tabla de §7.1
- [ ] Detección automática: mediana de frame time > 20 ms en los primeros ~2s → bajar tier
- [ ] Override manual en el nav
- [ ] Verificar techos por tier: DPR, triángulos, draw calls, VRAM, partículas, sombras

### Presupuesto

- [ ] Payload de S1 ≤ 15 MB comprimido
- [ ] Carga progresiva del interior durante S1–S3
- [ ] **Guardarraíl si el usuario llega a S4 antes de que cargue el interior**
- [ ] Reparto del frame verificado en desktop (~8 render / ~3 post / ~2 JS / ~3 headroom)

### Dispositivos

- [ ] **Pruebas en iOS real, no en simulador** — techo de memoria ~250–400 MB por pestaña
- [ ] Verificar transcoder KTX2 en workers en Safari
- [ ] Verificar render targets float (bloom) en Safari
- [ ] Android gama media — **objetivo 30fps, no 60**

### Accesibilidad y fallback

- [ ] `prefers-reduced-motion`: Lenis off, snapping discreto, sin parallax/partículas/vibración
- [ ] Detección de WebGL2 con `failIfMajorPerformanceCaveat`
- [ ] Fallback estático con stills por sección — misma copy y tipografía
- [ ] Todo el contenido técnico como **DOM real**, no dibujado en canvas
- [ ] Jerarquía semántica de headings, legible en orden lineal
- [ ] `aria-hidden` en el canvas
- [ ] Contraste AA — **S3 es el caso difícil** (fondo más claro del sitio)

---

## Fase 9 — Verificación de datos y copy final · *paralelizable*

> **Contexto crítico:** en la sesión de planificación el acceso a fuentes primarias falló (HTTP 403 en airbus.com, wikipedia.org, sketchfab.com). **Todas las cifras de §9 de PLAN.md son de fuentes secundarias y ninguna está verificada.** No publicar copy con esos números sin completar esta fase.

- [ ] Verificar cada cifra de la tabla de §9 contra fuente primaria (Airbus / Rolls-Royce / Engine Alliance)
- [ ] 🔴 **Resolver el conflicto de empuje** — la cifra de "1,208 kN" parece ser el total de los 4 motores, incompatible con las cifras por-motor de 311–356 kN. Determinar cuál es y ser explícito en la copy sobre si es por motor o total
- [ ] 🟡 Redactar velocidad de rotación y distancia de pista **siempre como condicionales** ("típico", o con condiciones declaradas). Nunca como dato absoluto — dependen de peso, altitud de presión, temperatura y viento
- [ ] Elegir **una** opción de motor (Trent 900 **o** GP7200) y ser consistente en todo el sitio
- [ ] Marcar qué cifras son específicas de aerolínea y decidir si se usan
- [ ] Redactar copy final por sección
- [ ] Revisión de IP: confirmar librea ficticia o despejar el uso de marcas reales
- [ ] Créditos y atribuciones de licencia completos en el footer

---

## Registro de sesiones

| Fecha | Sesión | Qué se hizo | Qué quedó abierto |
|---|---|---|---|
| 2026-08-04 | Planificación | `PLAN.md` y `PROGRESS.md` creados. Investigación de specs y de disponibilidad de assets (fuentes primarias inaccesibles — 403). | Las 6 decisiones de Fase 0. La fuente del modelo 3D bloquea de Fase 3 en adelante. |
| 2026-08-04 | Planificación (continuación) | **Decisión de asset resuelta:** exterior CC-BY existente, interior modelado a medida en Blender desde cero (sin fidelidad exacta), nada comprado ni encargado a terceros. Actualizados §0, §11.1, §11.7, §12.2, §12.3, §13 de PLAN.md y Fase 0 de PROGRESS.md en consecuencia. | Las otras 5 decisiones de §12 (stack, alcance de zonas, librea, audio, longitud de scroll). El modelado del interior en Blender puede arrancar ya, en paralelo con Fases 1–2. |
