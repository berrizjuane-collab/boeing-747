# PROGRESS — Sitio Scrollytelling 3D de Presentación de Aeronave

Checklist de seguimiento espejado a las fases de [`PLAN.md`](./PLAN.md).
Sirve para retomar contexto entre sesiones: **antes de trabajar, leer las notas de la fase activa.**

**Estado global: Fase 0 — blockout interior ejecutado y verificado; la aprobación estructural del exterior sigue bloqueada por la descarga autenticada de Sketchfab y la alineación final queda abierta.**

Convención: `[ ]` pendiente · `[~]` en curso · `[x]` completo · `[!]` bloqueado

---

## Fase 0 — Decisiones y adquisición de assets

> **Salida de sesión:** las 6 decisiones de §12 siguen cerradas. El blockout propio ya está ejecutado y verificado en Blender; las Fases 1–2 no quedan bloqueadas. Fase 3 y la alineación exterior esperan el archivo fuente autorizado del candidato.

### Decisiones de §12 — TODAS RESUELTAS

- [x] **Fuente del modelo 3D** — Exterior: CC-BY gratuito existente (no comprado, no encargado). Interior: modelado a medida en Blender, íntegramente desde cero, sin buscar fidelidad exacta al A380 real. Ver §11.1 y §12.2 de PLAN.md.
- [x] **Stack final** — R3F + drei, confirmado sobre Three.js vanilla. Ver §12.1 de PLAN.md.
- [x] **Alcance del interior** — v1 con 3 zonas (cabina de mando, economy, escalera + piso superior); las otras 3 quedan diferidas. Ver §12.3 de PLAN.md.
- [x] **Librea** — Ficticia y neutra, confirmada. Ver §12.4 de PLAN.md.
- [x] **Audio** — Sin audio en v1, confirmado. Ver §12.5 de PLAN.md.
- [x] **Longitud total de scroll** — ~800vh, confirmado. Ver §12.6 de PLAN.md.

### Auditoría del asset exterior

- [x] Relevar candidatos a modelo exterior de A380 CC-BY — 9 candidatos documentados en [`ASSET_AUDIT.md`](./ASSET_AUDIT.md); Brout queda como shortlist principal
- [x] **Auditar licencia de cada candidato individualmente** — API/página individual revisada; ver [`ASSET_AUDIT.md`](./ASSET_AUDIT.md)
- [x] Descartar CC-BY-NC si el proyecto tiene cualquier connotación comercial — OUTPISTON queda excluido por CC BY-NC-SA; no se acepta NC para este proyecto
- [!] Verificar criterios de aceptación por candidato — **bloqueado**: la ruta oficial de descarga de Sketchfab responde HTTP 401 sin credenciales; no se aprobará el asset por inferencia desde la miniatura.
  - [!] Tren de aterrizaje como nodos separados y jerarquizados (lo requiere S2) — la miniatura confirma presencia visual, no la jerarquía.
  - [!] UVs limpias, sin solapamientos — requiere abrir el archivo fuente.
  - [!] Texturas PBR reales, no materiales horneados de un renderer específico — los metadatos declaran 1 textura y 1 material, pero no prueban PBR utilizable.
  - [!] Escala y orientación correctas o corregibles sin romper la jerarquía — requiere inspección de transforms en Blender.
- [x] Definir el texto de atribución CC-BY y **diseñarlo dentro del footer** (no pegarlo al final) — texto y ubicación definidos en [`ASSET_AUDIT.md`](./ASSET_AUDIT.md)

### Modelado del interior en Blender — puede arrancar ya, en paralelo

- [x] Definir el layout base del interior propio (pasillo, disposición de zonas) — contrato paramétrico en [`INTERIOR_LAYOUT.md`](./INTERIOR_LAYOUT.md)
- [x] Modelar el asiento base para `InstancedMesh` (ver Fase 5) — `Seat_Base` y 250 copias enlazadas a la misma malla; verificador Blender en [`blender/verify_blockout.py`](./blender/verify_blockout.py)
- [x] Modelar pasillo y paneles de las 3 zonas de la v1 confirmada (§12.3) — cockpit, economy, escalera y upper deck en colecciones separadas; 353 mallas verificadas
- [!] Alinear el modelado con las dimensiones del exterior CC-BY elegido, para minimizar el trabajo de registración de la Fase 4 — bloqueado hasta obtener e inspeccionar el archivo exterior autorizado.

**Evidencia de la ejecución 2026-08-04:** Blender 5.2.0 LTS arrancó en modo headless con checksum verificado. El `.blend` se guardó y reabrió con 353 mallas, colecciones `Zone_Cockpit` (15), `Zone_Economy` (220), `Zone_Stair` (20), `Zone_UpperDeck` (98) y `Technical` (4); hay 250 asientos enlazados y 251 usuarios de la malla maestra. El GLB se reimportó con 354 mallas, 11 materiales y 750,952 bytes. La vista QA fue renderizada e inspeccionada visualmente. Scripts: [`blender/interior_blockout.py`](./blender/interior_blockout.py), [`blender/verify_blockout.py`](./blender/verify_blockout.py) y [`blender/render_preview.py`](./blender/render_preview.py).

---

### Registro de sesiones

| Fecha | Sesión | Qué se hizo | Qué quedó abierto |
|---|---|---|---|
| 2026-08-04 | Fase 0 — auditoría inicial | Se relevaron 9 candidatos de A380, se auditaron individualmente sus licencias y se excluyó CC BY-NC-SA. Brout quedó como shortlist principal por CC BY, descargabilidad, etiqueta game-ready y presupuesto preliminar (~4.41 MB GLB; 67.6k triángulos). Se definió el texto/ubicación de atribución y el layout base del interior en [`ASSET_AUDIT.md`](./ASSET_AUDIT.md) e [`INTERIOR_LAYOUT.md`](./INTERIOR_LAYOUT.md). Se añadió [`blender/interior_blockout.py`](./blender/interior_blockout.py) como fuente procedural reproducible y se verificó estáticamente su sintaxis y contrato de nombres; no se ejecutó porque Blender no está instalado. | Pendientes: descargar e inspeccionar el archivo Brout en Blender (nodos del tren, UVs, PBR y escala/orientación); modelar asiento, pasillo/paneles y alinear interior con el exterior. Blender no está instalado en el entorno actual. |

| 2026-08-04 | Fase 0 — ejecución Blender y cierre del blockout | Se instaló Blender 5.2.0 LTS en el entorno de trabajo, se verificó el checksum, se ejecutó el blockout, se reabrieron el BLEND y el GLB, y se inspeccionó una vista QA. Se subieron los verificadores reproducibles al repositorio. | Asset Brout aún no aprobado: la descarga oficial exige autenticación y deja sin evidencia la jerarquía del tren, UVs limpias, PBR y escala/orientación. La alineación exterior queda bloqueada. |

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

**Alcance confirmado (§12.3 de PLAN.md): v1 con 3 zonas, marcadas ★. Las otras 3 quedan diferidas — documentadas, no eliminadas.**

- [ ] Assets de interior procesados por el pipeline
- [ ] **Asientos como `InstancedMesh`** con variación por atributos de instancia
- [ ] Iluminación de cabina: luces analíticas + env map pequeño irradiado
- [ ] Shadow map de interior con resolución acotada
- [ ] LOD de corredor: fade-out de filas lejanas
- [ ] Cámara de walkthrough a ~1.6m con micro-oscilación sutil
- [ ] Mesetas de easing en cada zona para lectura de overlays

### Zonas v1 (alcance confirmado)

- [ ] ★ Cabina de mando
- [ ] ★ Economy
- [ ] ★ Escalera al piso superior
- [ ] ★ Piso superior

### Zonas diferidas — incremento posterior, fuera de v1

- [ ] Primera clase
- [ ] Business / Economy Plus

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
| 2026-08-04 | Planificación (cierre de §12) | **Las 5 preguntas abiertas restantes quedaron cerradas vía cuestionario**, todas en la opción recomendada: stack → R3F + drei; alcance interior → v1 con 3 zonas (cabina de mando, economy, escalera + piso superior); librea → ficticia/neutra; audio → sin audio en v1; longitud de scroll → ~800vh. §12 de PLAN.md reescrito de "Preguntas abiertas" a "Decisiones confirmadas" (6/6 resueltas), con ajustes de consistencia en §2.1, §3 (Sección 5), §9.1, §10.5, §11.6 y §13. PROGRESS.md Fase 0 y Fase 5 actualizadas en consecuencia. | Ninguna decisión fundacional pendiente. Sigue abierta la verificación de datos técnicos de §9 (Fase 9) y toda la ejecución de las Fases 1–9. |
