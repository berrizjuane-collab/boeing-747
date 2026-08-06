# PROGRESS — Sitio Scrollytelling 3D de Presentación de Aeronave

Checklist de seguimiento espejado a las fases de [`PLAN.md`](./PLAN.md).
Sirve para retomar contexto entre sesiones: **antes de trabajar, leer las notas de la fase activa.**

**Estado global: Fases 0, 1 y 2 completas; el núcleo de Fase 3 está implementado y verificado. El bloqueo del exterior (más abajo, ahora marcado RESUELTO) se destrabó el 2026-08-05: el usuario adjuntó `A380.blend` de nuevo y autorizó subirlo al repo. Fase 4 (umbral) funciona con geometría real de ambos lados — exterior e interior —, con un adelanto real de Fase 5 (interior recorrido con geometría verdadera). Fase 3 conserva dos condiciones de cierre explícitas: HDRI reales para S1/S3 y KTX2/Basis en el artefacto exterior final; no se presentan como completadas.**

Convención: `[ ]` pendiente · `[~]` en curso · `[x]` completo · `[!]` bloqueado

---

## ✅ RESUELTO (2026-08-05) — bloqueo de la fuente del exterior

**Resolución en una frase:** el usuario volvió a adjuntar `airbus-a380.zip` en el chat de esta sesión y dio dos instrucciones explícitas — *"Termina lo que requeria el uso de este archivo, y probablemente te convenga subirlo directamente al repo"* — con lo que se ejecutó la opción 1 de las tres listadas más abajo (la de mayor preferencia) y además se resolvió de raíz el motivo estructural del bloqueo: el binario fuente (`A380.blend` + `A380.JPG`) ahora vive en `blender/source/` con atribución CC BY 4.0 en `blender/source/ATTRIBUTION.md`, así que ninguna sesión futura depende de que alguien vuelva a adjuntarlo. Checksums verificados idénticos a los de la auditoría de Fase 0 (`ASSET_AUDIT.md`).

Qué se hizo con el archivo, en orden: se corrió el pipeline completo de Blender (`audit_exterior.py` → `prepare_exterior.py` → `verify_exterior.py` → `register_interior.py` → `verify_registration.py`, los cinco con resultado idéntico al documentado por la sesión anterior); se procesó el GLB resultante con `scripts/process-glb.mjs` (4472.5 KB → 2184.9 KB); se construyó `ExteriorAsset.tsx` y se integró en `SceneCanvas.tsx` reemplazando `AircraftPlaceholder.tsx`; se derivó empíricamente (no a mano alzada) la transformación de colocación del modelo real contra las coordenadas de cámara/portales/interior ya afinadas en Fases 2–4; se verificó todo en Playwright, encontrando y corrigiendo un bug real de retracción del tren (ver Fase 3 más abajo). Detalle completo en el registro de sesiones, al final de este archivo.

El resto de esta sección queda como registro histórico de qué pasó y por qué — sigue siendo útil para entender la arquitectura de dependencias del pipeline de Blender, aunque ya no aplique como bloqueo activo.

### Qué pasó, en una frase (contexto histórico — sesión del bloqueo original)

El archivo fuente del exterior (`A380.blend`, de Brout, auditado y aprobado en la sesión de Fase 0) llegó a esa sesión **como adjunto de chat**, no como un archivo que quedara en el repositorio ni en un lugar accesible entre sesiones — y cada sesión de Claude Code corre en un contenedor nuevo y descartable. El resultado de esa sesión (`phase0_exterior_working.blend`, `phase0_exterior_working.glb`, `phase0_registered_scene.blend`) se guardó explícitamente como **"artefacto de sesión"** (`ASSET_AUDIT.md`, línea del "Resultado ejecutivo": *"El binario de terceros no se ha incorporado al repositorio... la copia de trabajo y los reportes permanecen como artefactos de sesión"*), una decisión correcta dado que es contenido de terceros que no se debe redistribuir — pero tiene como consecuencia que **ese trabajo no persiste**, ni en este contenedor ni en el próximo.

Verificado exhaustivamente al empezar esta sesión, no asumido:
- `find / -iname "*.blend" -o -iname "*.glb"` en todo el filesystem → ningún resultado fuera de `node_modules`.
- Blender no estaba instalado (`blender: command not found`).
- El directorio `blender/` del repo sólo tiene los scripts `.py` (correcto y esperado — son las "fuentes reproducibles" que si se documentaron para el repo), pero **ninguno de ellos funciona sin el `.blend` de origen como input**, y ese input no está en ningún lado accesible por esta sesión.

### Qué SÍ es reproducible, y qué no

| Script | Depende de un archivo externo no reproducible | Se pudo correr en esta sesión |
|---|---|---|
| `blender/interior_blockout.py` | **No** — es 100% procedural | ✅ Sí, y verificó exactamente igual que la sesión anterior (353 meshes, 250 asientos, mismos bounds) |
| `blender/verify_blockout.py` | No | ✅ Sí, PASS |
| `blender/render_preview.py` | No (pero necesita libEGL/mesa para renderizar, no instalado; no crítico, se usó Three.js/Playwright como verificación visual real en su lugar) | ⚠️ Corrido, falló en el render por falta de librerías gráficas — no bloqueante |
| `blender/audit_exterior.py` | **Sí** — necesita `A380.blend` como input | ❌ No se pudo correr |
| `blender/prepare_exterior.py` | **Sí** — ídem | ❌ No se pudo correr |
| `blender/verify_exterior.py` | **Sí** — necesita el `.blend`/`.glb` de trabajo que genera el anterior | ❌ No se pudo correr |
| `blender/register_interior.py` | **Sí** — su flag `--exterior` apunta por defecto a `/tmp/phase0_exterior_working.blend`, que no existe | ❌ No se pudo correr |
| `blender/verify_registration.py` | **Sí** — ídem | ❌ No se pudo correr |

### Qué se hizo en consecuencia (nada se dejó a medias en silencio)

- El **interior** se regeneró de cero en este contenedor (Blender 4.0.2 instalado vía `apt`, headless), se verificó estructuralmente, se procesó por el pipeline nuevo de Fase 3, y se integró como asset real en la app — ver Fase 3/Fase 5 más abajo.
- El **exterior** se mantiene como la caja placeholder de Fase 2 en toda la sesión. No se inventó geometría "aproximada" para simular un exterior real — habría sido peor que ser honesto sobre el placeholder.
- La **registración espacial** exterior/interior (Fase 4) se aproximó a mano en código (`sceneLayout.ts`), derivada de los mismos anchors que usa `register_interior.py`, pero **no es lo que ese checklist pide** — queda marcado `[ ]`, no `[x]`, precisamente para no maquillar el estado real.
- El **spike técnico de Fase 4** (la pregunta real que esa fase existe para responder: ¿el cruce se lee como un umbral?) se validó igual, contra el exterior placeholder + el interior real — es una respuesta válida a esa pregunta aunque la geometría final del exterior siga pendiente.

### Qué hacía falta para desbloquear esto (histórico — ya ejecutado)

De las tres opciones que se dejaron documentadas, en orden de preferencia, **se ejecutó la opción 1**: el usuario volvió a adjuntar el archivo en el chat de la sesión siguiente. Las otras dos (adjuntar sólo el GLB de trabajo ya procesado, o reabrir la decisión de comprar/encargar el modelo) no hicieron falta.

---

## Fase 0 — Decisiones y adquisición de assets

> **Salida de sesión:** Fase 0 queda cerrada a nivel de auditoría, copia de trabajo y registración gruesa. No se marcan como [x] las dos limitaciones que la evidencia contradice: UV sin solapamientos y set PBR multi-mapa. Fases 1–2 siguen libres para arrancar; el pipeline exterior debe atender esas limitaciones antes de publicarse como asset final.

Convención: [ ] pendiente · [~] en curso/condicionado · [x] completo · [!] bloqueado

### Decisiones de §12 — TODAS RESUELTAS

- [x] **Fuente del modelo 3D** — Exterior: CC-BY gratuito existente (no comprado, no encargado). Interior: modelado a medida en Blender, íntegramente desde cero, sin buscar fidelidad exacta al A380 real.
- [x] **Stack final** — R3F + drei, confirmado sobre Three.js vanilla.
- [x] **Alcance del interior** — v1 con 3 zonas (cabina de mando, economy, escalera + piso superior); las otras 3 quedan diferidas.
- [x] **Librea** — Ficticia y neutra, confirmada.
- [x] **Audio** — Sin audio en v1, confirmado.
- [x] **Longitud total de scroll** — ~800vh, confirmada.

### Auditoría del asset exterior

- [x] Relevar candidatos a modelo exterior de A380 CC-BY — 9 candidatos documentados en ASSET_AUDIT.md; Brout quedó como shortlist principal.
- [x] **Auditar licencia de cada candidato individualmente** — API/página individual revisada; ver ASSET_AUDIT.md.
- [x] Descartar CC-BY-NC si el proyecto tiene cualquier connotación comercial — OUTPISTON queda excluido por CC BY-NC-SA.
- [~] Verificar criterios de aceptación por candidato — el archivo fuente autorizado ya fue inspeccionado. Tren y transformación pasan; UV original y PBR multi-mapa quedan condicionados y documentados.
  - [x] Tren de aterrizaje como nodos separados y jerarquizados — la copia de trabajo contiene LandingGear → 115 piezas LandingGear_Part_###.
  - [~] UVs limpias, sin solapamientos — UVTex está en 0–1 y la textura funciona; select_overlap marca las 20.990 caras de A380 y 13.032 de Wheels, con 708/2.699 polígonos degenerados.
  - [~] Texturas PBR reales, no materiales horneados de un renderer específico — grafo Principled nativo y albedo JPG verificables; no hay mapas independientes Roughness/Metallic/Normal.
  - [x] Escala y orientación correctas o corregibles sin romper la jerarquía — Exterior_Root aplica una sola rotación/traslación; bounds de trabajo 79,6807 × 24,6860 × 72,9999 m.
- [x] Definir el texto de atribución CC-BY y diseñarlo dentro del footer — texto y ubicación definidos en ASSET_AUDIT.md.
- [x] **Binario fuente subido al repositorio** (2026-08-05) — `blender/source/A380.blend` + `A380.JPG`, decisión e instrucción explícita del usuario, amparada por CC BY 4.0. Atribución en `blender/source/ATTRIBUTION.md`; checksums verificados idénticos a los de esta auditoría. La atribución **visible en el sitio** (footer) sigue pendiente de Fase 6 — esto sólo cubre la redistribución del binario en el repo, no el crédito de cara al usuario final.

### Modelado del interior en Blender

- [x] Definir el layout base del interior propio — contrato paramétrico en INTERIOR_LAYOUT.md.
- [x] Modelar el asiento base para InstancedMesh — Seat_Base y 250 copias enlazadas a la misma malla.
- [x] Modelar pasillo y paneles de las 3 zonas de la v1 — cockpit, economy, escalera y upper deck en colecciones separadas; 353 meshes verificadas.
- [x] **Alinear el modelado con las dimensiones del exterior CC-BY elegido** — registración gruesa completada con una sola transformación Interior_Registration_Root = (0, 3,2, 0,3) m; 352 meshes visibles dentro del envelope exterior. El encaje final de umbral/puertas sigue en la Fase 4.

### Evidencia de cierre ejecutada en Blender — 2026-08-04

- [x] La fuente A380.blend se abrió con Blender 5.2.0 LTS y se registraron escena, jerarquía, UVs, material e imagen.
- [x] Se creó la copia phase0_exterior_working.blend, se empaquetó A380.JPG, se separó el tren en 115 nodos y se exportó phase0_exterior_working.glb.
- [x] El BLEND se reabrió y pasó 10/10 checks; el GLB se reimportó con 119 objetos, 116 meshes y UVs presentes.
- [x] La copia de trabajo se renderizó e inspeccionó visualmente.
- [x] La escena registrada con interior se reabrió y pasó todos los checks de jerarquía, counts, transform y envelope.
- [~] UV/PBR siguen condicionados y no se presentan como completos. Esta es una limitación de asset documentada, no un bloqueo de acceso.

### Registro de sesiones

| Fecha | Sesión | Qué se hizo | Qué quedó abierto |
|---|---|---|---|
| 2026-08-04 | Fase 0 — auditoría inicial | Se relevaron 9 candidatos, se auditaron licencias, se excluyó CC BY-NC-SA y Brout quedó como shortlist principal. Se definió atribución y layout del interior. | Faltaba el archivo fuente de Brout. |
| 2026-08-04 | Fase 0 — ejecución Blender y blockout | Se instaló Blender 5.2.0 LTS, se generó y verificó el blockout, y se reabrieron BLEND/GLB del interior. | Faltaba inspeccionar el exterior y registrarlo. |
| 2026-08-04 | Fase 0 — cierre de auditoría de fuente | Se validó y extrajo airbus-a380.zip, se abrió A380.blend, se verificaron jerarquía/UV/material/transforms, se creó la copia de trabajo con 115 piezas del tren, se exportó/reabrió GLB y se registró el interior con una transformación única. | Limpiar UV y decidir el tratamiento del material albedo-only antes del asset final; el umbral/puertas queda para Fase 4. |

## Fase 1 — Esqueleto ✅ COMPLETA

> **Dónde vive cada cosa** (para retomar sin releer todo el código): `src/App.tsx` monta todo. Store en `src/state/scrollStore.ts` (zustand) y `src/state/perfStats.ts` (objeto mutable plano). Scroll en `src/lib/scrollController.ts`. Secciones en `src/lib/sections.ts`. HUD en `src/components/DebugHud.tsx`. Track DOM en `src/components/ScrollTrack.tsx`.

- [x] Proyecto Vite + TypeScript — React 19 + TS, template oficial `react-ts` de `create-vite`
- [x] Canvas WebGL a pantalla completa, renderer configurado (ACES Filmic, color space correcto) — `SceneCanvas.tsx`. **Gotcha documentado en el código**: el wrapper que genera `<Canvas>` de R3F trae `position:relative` inline; hay que pisarlo vía el prop `style`, no `className` (una clase de hoja de estilos pierde contra un inline style) — costó un bug real (`.scroll-track` arrancaba a 1 viewport de altura del top) antes de encontrarlo
- [x] Lenis integrado
- [x] GSAP + ScrollTrigger integrados con Lenis (`lenis.on('scroll', ScrollTrigger.update)` + `gsap.ticker`, `lagSmoothing(0)`)
- [x] Escalar de progreso de scroll en store mutable — **verificado que NO dispara re-renders de React**: `progress` sólo se lee vía `getState()` dentro de `useFrame`/rAF; el hook de React (`useScrollStore(s => s.activeIndex)`) sólo se usa para `activeIndex`, que cambia 6 veces en toda la página. Verificado por revisión de código contra el patrón documentado de zustand (selector + `Object.is`), no con un profiler de React en vivo — si hace falta la certeza empírica, correrlo con el React DevTools Profiler es el próximo paso, no hecho en esta sesión
- [x] HUD de debug: progreso, sección activa, fps, draw calls, triángulos — visible en pantalla, valores leídos de `gl.info.render` vía `StatsCollector.tsx`
- [x] Estructura de secciones definiendo las alturas de scroll — 7 secciones (S1–S7; S0 es un gate previo al scroll, no ocupa altura), ~800vh total. Verificado con Playwright: `document.documentElement.scrollHeight` = 8100px a 900px de viewport = 900vh totales (800vh de track + 100vh de nav/gate implícito), sin errores de consola

## Fase 2 — Rig de cámara con placeholder · **HITO DE VALIDACIÓN** ✅ COMPLETA — GATE pasado

> **Dónde vive cada cosa:** curvas y sampleo en `src/lib/cameraPath.ts`. Pose del avión en `src/lib/aircraftPose.ts`. Geometría placeholder en `AircraftPlaceholder.tsx` (histórico — eliminado 2026-08-05 al integrar el exterior real, ver Fase 3; el equivalente hoy es `src/components/ExteriorAsset.tsx`) y `EnvironmentPlaceholder.tsx`, que sigue vigente. Herramienta de autoría en `src/dev/`.

- [x] Estructura de keyframes `{ camPos, camTarget, fov, roll }` — 15 keyframes ordenados, repartidos por sección
- [x] Doble `CatmullRomCurve3` — una de posiciones, otra de targets
- [x] **Usa `getPointAt`, no `getPoint`** — comentado en el código con la razón (aceleración/desaceleración espuria con `getPoint`)
- [x] Override de roll / cuaternión por sección, aplicado después del `lookAt` — `camera.rotateZ(rollRad)` tras `lookAt` en `CameraRig.tsx`, usado para el banco de S3
- [x] `scrub` numérico calibrado (arranque en `1`)
- [x] Verificado que hay **un solo** mecanismo de suavizado (scrub de GSAP; nada de damping adicional)
- [x] **Herramienta de autoría de keyframes**: `OrbitControls` + volcado de posición/target/fov a consola y portapapeles, con selector de sección — activada con la tecla `D`, smoke-testeada con Playwright (toggle, dump, sin errores)
- [x] Geometría placeholder para avión y entorno — caja de fuselaje + alas + estabilizador (silueta en cruz reconocible), suelo + color de fondo/niebla que cambia por sección siguiendo el arco de grading de §10.1
- [x] Recorrido completo de las 8 secciones navegable de punta a punta — verificado con capturas de Playwright en 14 puntos de scroll
- [x] **Revisión del arco narrativo con placeholder — GATE: PASADA.** Se lee de punta a punta: pista estática → tracking reconocible en despegue → giro a vista frontal en ascenso → entrada a túnel oscuro en el umbral → pasillo interior en perspectiva → salida con retroceso amplio → footer oscuro (bookend del loading)

### Bugs reales encontrados y corregidos durante la verificación (documentados en el código, no sólo acá)

1. **Wrapper de `<Canvas>` con `position:relative` inline** rompía la altura del documento — ver nota de Fase 1 arriba.
2. **Desincronización cámara/avión**: samplear la curva global con `u = scrollProgress` directo (mapeo identidad) hacía que la cámara, indexada por longitud de arco, y el avión, indexado por progreso local de sección, avanzaran a ritmos distintos — la cámara terminaba atravesando el fuselaje a mitad de S2, antes de tiempo. Corregido remapeando `scrollProgress` a un tramo de `u` propio por sección (arco calculado con `getLengths`).
3. **La corrección anterior reutilizaba el mismo `u` (derivado de `posCurve`) para samplear también `targetCurve`** — pero cada curva tiene su propia distribución de longitud de arco, así que ese `u` no caía sobre los keyframes de destino correctos (el target quedaba con Y≈24 en vez de 38 justo en el borde S2/S3). Corregido con una tabla de `u` independiente por curva (`POS_U` / `TARGET_U`).
4. **Framing roto en S2/S3/S6**: la cámara quedaba a una distancia/altura donde el ala placeholder (80 unidades de envergadura) la llenaba de canto, leyéndose como un muro plano en vez de un avión. Corregido alejando esas tomas y subiendo la cámara claramente por encima del plano del ala.
5. Un keyframe de S5 (economy) coincidía en Y exacto con el plano fino del ala — corregido con un offset menor.

**Por qué importa para Fase 3+:** las coordenadas de los 15 keyframes son de validación, no arte final — van a cambiar por completo al entrar el modelo real. Pero la **arquitectura del rig** (doble curva, tablas de `u` por curva, remapeo por sección) ya está probada y no debería tocarse; sólo los valores numéricos de `KEYFRAMES` en `cameraPath.ts` se reemplazan.

---

## Fase 3 — Pipeline exterior y secciones 1–3 · ✅ NÚCLEO IMPLEMENTADO / CONDICIONADA

> El bloqueo ✅ RESUELTO al principio de este archivo cubre el contexto completo. Todo lo que dependía del binario exterior — procesar `exterior.glb`, cargarlo real en la app, tren de aterrizaje real — se completó el 2026-08-05.

### Exterior real en la app (2026-08-05, ex-bloqueado)

- [x] `ExteriorAsset.tsx` carga `/models/exterior.glb` vía `useGLTF`, reemplaza `AircraftPlaceholder.tsx` (eliminado, ya no queda código de placeholder de fuselaje/alas en el árbol)
- [x] **Transformación de colocación derivada empíricamente**, no a ojo — bounds reales del GLB procesado leídos con `@gltf-transform/core` + composición de matrices de `three.js` (`Matrix4`/`Quaternion`), no aritmética a mano: un primer intento de "sólo sumar traslaciones" ignoró que `Exterior_Root` trae una rotación real (-90°X) horneada en el archivo, y dio números que no cuadraban con nada. Reintentado con composición correcta de matrices, verificado contra la escena real, documentado en el comentario de `EXTERIOR_LOCAL_OFFSET` (`sceneLayout.ts`)
- [x] Dirección nariz/cola confirmada de forma independiente **cuatro veces**: (1) bounds reales vs. specs A380 documentadas, (2) clustering de los 115 nodos `LandingGear_Part_###` por centroide en espacio mundo (23 piezas = tren de nariz, ~92 piezas = tren principal, coincide exactamente con lo documentado en `ASSET_AUDIT.md`), (3) mismo clustering repetido con la transformación candidata ya aplicada, (4) inspección visual en Playwright (ventanas de cabina, motores, timón, todo donde debe estar)
- [x] `RUNWAY_POSE`/`FLYING_POSE` (`sceneLayout.ts`) actualizados: `RUNWAY_POSE.position.y` pasa de `4` (mitad de altura de la caja placeholder) a `8.48` (bajo tren real hasta tocar el suelo en y=0); `FLYING_POSE` **sin cambios** — todo el trabajo ya afinado de cámara/portales/interior en Fases 2–4 sigue válido sin retocar
- [x] Shader de disolución (`dissolveHullMaterial.ts`) aplicado al mesh real `A380` (fuselaje/alas/timón, un único mesh en el asset) en vez de la caja placeholder — mismo material, mismo mecanismo de portales, geometría real debajo
- [x] Verificado en Playwright de punta a punta tras el reemplazo: sin errores de consola/network en todo el recorrido, silueta y proporciones correctas en S1–S3, ventanas de cabina visibles de frente en S4, ambos portales (nariz y salida) abriendo sobre geometría real, cabina de economy con luz cálida correcta en S5

### Pipeline

### Pipeline

- [x] **Pipeline `gltf-transform` scriptado y reproducible** — `scripts/process-glb.mjs` (`npm run process-glb -- <in> <out>`). Encadena prune → dedup → weld → **instance** (`EXT_mesh_gpu_instancing`, no estaba en la lista original de §6.3 pero resultó necesario — ver nota de Fase 5) → Draco → KTX2/Basis (auto-saltado con log explícito si el origen no tiene texturas, no falla en silencio). Probado de punta a punta contra un archivo real (el blockout del interior, no un archivo de juguete)
- [x] Verificado que el paso KTX2 se salta correctamente y con log visible cuando no hay texturas — no aplica al blockout del interior (materiales de color sólido)
- [~] `exterior.glb` procesado dentro de presupuesto de descarga — 4472.5 KB → 2184.9 KB (2×). **Limitación real y distinta del bloqueo ya resuelto**: la compresión KTX2/Basis (`gltf-transform etc1s`) necesita el binario externo `ktx` (KTX-Software), que no tiene paquete apt/pip en este contenedor y cuya descarga desde GitHub releases está bloqueada por el scoping de red de la sesión (403 explícito, no un fallback silencioso). `scripts/process-glb.mjs` degrada con gracia a resize (cap 2048px) + recompresión JPEG cuando esto pasa — reduce el peso de transmisión pero **no** el footprint en VRAM en runtime como sí lo haría KTX2 real (la textura se descomprime completa igual, ver PLAN.md §6.2). Queda documentado como limitación de infraestructura de esta sesión, no como algo a resolver en código — si una sesión futura corre en un contenedor con acceso a GitHub o con `ktx` instalable, el pipeline ya lo usa automáticamente sin cambios.

### Verificación de cierre de esta pasada — 2026-08-06

- [x] Parallax y sombras compilados contra el árbol TypeScript actual reconstruido desde main: tsc -b completo, PASS.
- [x] Build de producción Vite con las dependencias declaradas, PASS (597 módulos transformados).
- [x] Relectura remota posterior a los commits confirma los cuatro archivos de runtime actualizados: CameraRig.tsx, EnvironmentPlaceholder.tsx, SceneCanvas.tsx y ExteriorAsset.tsx.
- [ ] Verificación visual post-cambio con Playwright en el exterior real — no ejecutable en este contenedor porque el binario/modelos y un navegador no están montados localmente. La verificación visual integral anterior del exterior real sigue registrada arriba; esta pasada no la sobre-reclama.
- [ ] HDRI golden hour de S1 y HDRI de gran altitud de S3 — no hay archivos HDR/HDRI en el repositorio; se mantiene pendiente.
- [~] KTX2/Basis del exterior final — el pipeline lo intenta automáticamente, pero el artefacto verificado sigue siendo fallback JPEG por falta del binario externo ktx; el impacto de VRAM no se declara resuelto.

### Interior (adelanto real, no estaba planeado para Fase 3)

- [x] **Blockout del interior regenerado y verificado en este contenedor** — `blender/interior_blockout.py` es 100% procedural, sin dependencia externa; se instaló Blender 4.0.2 vía apt, se corrió headless, y `blender/verify_blockout.py` pasó con los mismos conteos que documentó la sesión anterior (353 meshes, 250 asientos enlazados, bounds 6.32×4.58×58.26m) — confirma que el script es genuinamente reproducible, no sólo en el papel
- [x] Procesado por el pipeline: 733 KB → 29.4 KB (25×), 6 lotes de instancing (329 instancias) — `public/models/interior.glb`
- [x] Decoder Draco self-hosted en `public/draco/` (copiado de `three/examples/jsm/libs/draco`) — sin dependencia de un CDN externo en runtime
- [x] Cargado en la app real (`InteriorAsset.tsx`, vía `useGLTF`) y verificado visualmente con Playwright — ver capturas del recorrido de S5 en las notas de Fase 4/5 más abajo

### Sección 1 — Hero pista

- [x] Entorno de pista: asfalto con marcas de pista (`RunwayEnvironment.tsx`), césped (plano de suelo de Fase 2), hangares + torre de control a distancia
- [ ] HDRI golden hour — **no implementado.** Se usa gradiente de color procedural (`environmentTheme.ts`, ya de Fase 2) en vez de un HDRI real; no hay archivo `.hdr` en el proyecto. Es una simplificación deliberada, no un olvido — un HDRI real no aporta nada sin el exterior real reflejándolo, y el bloqueo de assets ya está documentado en un solo lugar
- [x] Niebla exponencial (`FogExp2`, ya de Fase 2, reutilizada)
- [x] Partículas de polvo suspendido — `DustParticles`, visibles S1–S2, fade-out después. Primer intento se veía como "nieve" (tamaño de punto demasiado grande, esparcidas muy alto); corregido tras revisión visual
- [x] Deriva lenta de cámara (ya de Fase 2) — parallax de mouse implementado en CameraRig.tsx, limitado al hero, con fade-out en el borde S1/S2 y desactivado para prefers-reduced-motion

### Sección 2 — Rodaje y despegue

- [x] Traslación acelerando del avión (Fase 2)
- [x] Vibración/cabeceo de alta frecuencia y amplitud decreciente (Fase 2)
- [x] Rotación (Fase 2)
- [x] Separación y retracción del tren — el asset real trae 115 nodos `LandingGear_Part_###` bajo un grupo `LandingGear` (Fase 0). `ExteriorAsset.tsx` los sube y oculta sobre la mitad final del progreso local de S2. **Bug real encontrado y corregido**: el primer intento comparaba el umbral de retracción contra el progreso *global* de scroll en vez del progreso *local* de S2 — con S2 en el rango global [0.12, 0.28], el tren no empezaba a subir hasta el 50% global (bien entrado en el interior) en vez del ~20%. Detectado instrumentando `gear.visible`/`gear.position.y` directamente vía Playwright (no a simple vista); corregido envolviendo el umbral con `localProgress(progress, TAXI_SECTION)`. Verificado tras el fix: sube y desaparece entre global 20%–26%, se mantiene oculto el resto del recorrido.
- [x] Sombra proyectada desplazándose sobre el asfalto — Canvas shadows, shadow map ortográfico de la luz direccional (2048², bias/normalBias acotados), aeronave marcada castShadow y pista receiveShadow; el shadow map se desactiva después de S2 para no pagar ese coste en vuelo
- [x] Tracking shot lateral (Fase 2, keyframes reajustados en esta sesión — ver nota de bug abajo)

### Sección 3 — Ascenso

- [x] Órbita de cámara hasta vista frontal (Fase 2)
- [ ] Transición al HDRI de gran altitud — mismo motivo que S1, gradiente procedural en su lugar
- [x] Capa de nubes — discos billboard (`CloudLayer`) con shader de caída radial suave (no volumétrico, tal como recomienda PLAN.md §3 S3)
- [x] Verificado que S3 es el punto de máxima luminancia (gradiente `#7fb3d5`, `environmentTheme.ts`, ya de Fase 2)

### Bugs reales encontrados y corregidos en la verificación de esta sesión

1. **Nubes con borde duro**: un disco plano con opacidad uniforme se ve como una placa de hielo/vidrio a poca distancia, no como una nube — sin textura de nube no hay suavidad "gratis". Corregido con un shader propio de caída radial (`createSoftDiscMaterial`).
2. **Nubes posicionadas sobre el corredor de vuelo de S2→S3**: la cámara pasaba muy cerca, y a esa distancia cualquier disco (aunque fuera suave) dominaba el cuadro. Corregidas alejándolas del corredor real de la cámara.
3. **Nubes con fade-in pero sin fade-out**: sólo subían de opacidad en S3 y se quedaban ahí — visibles hasta el footer. Encontrado recién al *scrollear la página completa* durante la verificación, no sólo la sección para la que fueron pensadas; corregido con fade-out simétrico hacia el final de S4. Vale la pena recordar este patrón: cualquier efecto "fade in" necesita su "fade out" verificado explícitamente, no asumido.
4. Partículas de polvo con puntos demasiado grandes y esparcidas demasiado alto — se leían como nieve, no polvo. Tamaño y rango de altura reducidos.

---

## Fase 4 — Spike del umbral (S4) · **técnica validada con geometría placeholder Y real; geometría final del umbral (puertas, deck) sigue pendiente**

> **Contexto:** pieza bespoke sin receta estándar. La pregunta que esta fase existe para responder — *¿el cruce se lee como atravesar un umbral, o como un corte?* — se validó primero con geometría placeholder (igual que la Fase 2 validó el arco de cámara con una caja) y se re-verificó el 2026-08-05 con el exterior real. Lo que queda pendiente es geometría de detalle (puertas, marco del umbral) y bloom real (Fase 7), no la técnica en sí.

- [x] Registración espacial exterior/interior — **dos caminos independientes, consistentes entre sí, ninguno literalmente alimenta al otro.** (1) En Blender: `register_interior.py` corrió esta sesión contra el exterior real y el interior regenerado, `verify_registration.py` con `all_checks_pass: true`. (2) En la app: `EXTERIOR_LOCAL_OFFSET` (`sceneLayout.ts`) se derivó por separado, empíricamente, contra los bounds reales del GLB procesado — ver la entrada nueva en Fase 3 de arriba. Ambos caminos colocan exterior e interior en el mismo envelope coherente (verificado visualmente: la cabina de mando y economy quedan dentro del fuselaje real, no flotando fuera de él), pero la app no lee la transformación de `register_interior.py` en runtime — sería trabajo adicional de valor dudoso dado que ya está verificado por otra vía. Anotado explícitamente para no sobre-reclamar "un solo pipeline" cuando son dos
- [x] **Definición del plano de umbral y del escalar de progreso** — dos "portales" fijos en el espacio del mundo (entrada en la nariz, salida cerca del piso superior), cada uno con su propia ventana de progreso — `thresholdPortals.ts`
- [x] **Shader de disolución radial del fuselaje** — `dissolveHullMaterial.ts`, descarta fragmentos dentro del radio de cualquiera de los dos portales, con un borde con "glow" emisivo que compensa parcialmente la falta de bloom real (ver ítem de bloom abajo)
- [x] Cross-fade de luz exterior → luces de interior — la luz direccional ("sol") baja de intensidad y una luz puntual cálida de cabina sube, cruzadas en la misma ventana de progreso (`thresholdLighting.ts`, `EnvironmentPlaceholder.tsx`)
- [x] Rampa de `toneMappingExposure` (−1 stop aprox., `exposureMultiplier` en `thresholdLighting.ts`)
- [x] Lerp del color de fog — ya existía desde Fase 2 (`environmentTheme.ts`), confirmado que atraviesa el umbral correctamente
- [ ] Realce de bloom motivado en el cruce — **diferido a Fase 7 a propósito, no bloqueado.** El pipeline de post-procesado (`postprocessing`/`EffectComposer`) todavía no existe — construirlo es trabajo de Fase 7, no algo que falte por un bloqueo externo. El "glow" emisivo del shader de disolución cubre parte de la necesidad narrativa mientras tanto
- [x] Montaje del interior en el grafo **sólo** en la ventana S4–S6 — `InteriorGate` en `SceneCanvas.tsx`, gatilla por `activeIndex` (índices 3/4/5), usa `<Suspense>`
- [x] **Medido** el pico de draw calls durante el cruce: 606 con los 353 meshes del interior sin instanciar (primer intento) → **33–35 después de aplicar `instance` en el pipeline**. Este número quedó documentado porque *cambió una decisión real*: sin medirlo no se habría notado que la instanciación GPU faltaba
- [x] **Revisión: ¿se lee como cruzar un umbral o como un corte? — GATE: pasada**, primero contra geometría placeholder (exterior caja + interior real), **re-verificada 2026-08-05 contra exterior e interior reales** — el portal de nariz disuelve la geometría real del fuselaje, el de salida revela la cabina real de economy a través del hueco. Radio de portal insuficiente en el primer intento (la cámara quedaba "atrapada" cerca de superficies sólidas, ver bug abajo); corregido y reverificado

### Bugs reales encontrados y corregidos en la verificación de esta sesión

1. **Radio de portal demasiado chico** (6 unidades) relativo a la sección transversal del fuselaje (7×8): el hueco apenas dejaba pasar la cámara, así que cualquier dirección de vista topaba con superficie sólida cercana — se leía como estar "atrapado contra una pared", no cruzando un umbral. Corregido subiendo el radio máximo a 14.
2. **Coordenadas del interior con signo invertido**: los primeros keyframes de S5 apuntaban el target hacia -Z (hacia la nariz) en vez de +Z (hacia la cola), por un error de signo al derivar las posiciones desde los anchors reales. Corregido y reverificado con capturas del pasillo — ver Fase 5.

### Bugs reales encontrados y corregidos al integrar el exterior real (2026-08-05)

1. **Retracción del tren contra el progreso global en vez del local de S2** — ver el ítem de tren en Fase 3 arriba; detectado instrumentando el estado real (`gear.visible`/`gear.position.y`) vía Playwright, no a simple vista, porque el síntoma (tren visible más allá de donde debía) era sutil en capturas aisladas.
2. **Primer intento de colocación del exterior ignoró la rotación real de `Exterior_Root`**: sumar sólo las traslaciones de la cadena de nodos (sin componer la rotación -90°X que el archivo trae horneada) daba bounds que no cuadraban con las specs reales del A380 ni con los anchors del interior ya verificados. Detectado por sentido común numérico (una altura de "73m" para un fuselaje no tiene sentido) antes de escribir ningún componente, no después — se rehizo el cálculo componiendo matrices completas (traslación + rotación) con `three.js`, y se verificó contra los bounds reales del archivo antes de escribir `ExteriorAsset.tsx`.

---

## Fase 5 — Interior (S5) · **Adelantada parcialmente durante la Fase 3/4 de esta sesión**

**Alcance confirmado (§12.3 de PLAN.md): v1 con 3 zonas, marcadas ★. Las otras 3 quedan diferidas — documentadas, no eliminadas.**

> Esta fase no estaba en el alcance pedido para hoy (se pidieron Fases 3 y 4), pero construir el interior real resultó ser la forma más honesta de probar el spike de Fase 4 — un umbral no se puede validar en serio sin algo real del otro lado. Lo de abajo es lo que quedó hecho como consecuencia, no un intento deliberado de completar la Fase 5 entera.

- [x] Assets de interior procesados por el pipeline (ver Fase 3)
- [x] **Asientos como instancias de GPU** — no vía `InstancedMesh` construido a mano en Three.js como proponía el plan original, sino vía `EXT_mesh_gpu_instancing` aplicado en el pipeline de glTF (`gltf-transform instance`), que three.js's `GLTFLoader` lee de forma nativa. Mismo resultado (250 asientos, pocos draw calls), mecanismo distinto — más simple porque vive en el pipeline de assets, no en código de la app. Vale la pena anotar la desviación del plan explícitamente en vez de dejarla implícita
- [ ] Iluminación de cabina con env map irradiado — sólo la luz puntual cálida está implementada (ver Fase 4); no hay env map de interior
- [ ] Shadow map de interior — no implementado, ninguna luz de la escena proyecta sombras todavía (Fase 2 tampoco lo tenía)
- [ ] LOD de corredor (fade-out de filas lejanas) — no implementado; con sólo ~118k triángulos y GPU instancing ya aplicado, no hizo falta para que la Fase 4 GATE pasara, pero sigue pendiente para Fase 8
- [x] Cámara de walkthrough — ya existía desde Fase 2, keyframes recalculados para pasar por los anchors reales del interior (ver Fase 4, bug #2)
- [ ] Mesetas de easing en cada zona — no implementado, es trabajo de dirección de arte (Fase 6/7)

### Zonas v1 — recorridas con geometría real, no sólo cámara sobre una caja

- [x] ★ Cabina de mando — geometría real, cámara pasa por el anchor real
- [x] ★ Economy — geometría real con asientos instanciados; **la mejor captura visual de toda la sesión**, corredor legible con asientos a ambos lados y la escalera visible al fondo
- [x] ★ Escalera al piso superior — geometría real, cámara pasa por el anchor real
- [x] ★ Piso superior — geometría real, cámara pasa por el anchor real

### Zonas diferidas — incremento posterior, fuera de v1 (sin cambios)

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
| 2026-08-05 | Implementación Fase 1 + Fase 2 | Proyecto Vite+React+TS scaffoldeado en la raíz del repo (stack de §2: R3F+drei, zustand, gsap+ScrollTrigger, lenis). Esqueleto completo (canvas, scroll, store, HUD, 7 secciones DOM) y rig de cámara con geometría placeholder implementados y verificados en navegador real con Playwright (14 capturas a lo largo del scroll + smoke test de la herramienta de autoría). Se encontraron y corrigieron 5 bugs reales durante la verificación — el más importante: usar el mismo `u` derivado de una curva para samplear la otra curva las desincroniza, porque cada `CatmullRomCurve3` tiene su propia distribución de longitud de arco; hace falta una tabla de `u` por curva. Detalle completo en las notas de Fase 1/2 arriba. `npm run build` y chequeo de tipos limpios. GATE del arco narrativo: **pasada**. | La Fase 3 (pipeline de assets exterior) sigue bloqueada por la auditoría de modelo CC-BY de Fase 0, que no se hizo en esta sesión. Verificación de performance/re-renders quedó a nivel de revisión de código, no de profiler en vivo. |
| 2026-08-05 | Merge de dos sesiones concurrentes sobre `main` | Al pushear la Fase 1+2, `origin/main` ya tenía commits nuevos: otra sesión hizo exactamente el trabajo de auditoría/Blender de Fase 0 que esta sesión había dejado pendiente (`ASSET_AUDIT.md`, `INTERIOR_LAYOUT.md`, `blender/*.py`, con evidencia verificada de jerarquía, tren, UVs, material y registración gruesa exterior/interior). Los cambios no se pisaban salvo la línea de "Estado global" de `PROGRESS.md`, resuelta a mano combinando ambos estados; el resto mergeó limpio (`PLAN.md` incluido). Nada se descartó de ninguno de los dos lados. | Con el exterior auditado (aunque con UV/PBR condicionados) y el código del rig ya validado, la Fase 3 puede arrancar. Las limitaciones de UV solapada y material albedo-only quedan como trabajo de pipeline explícito, no oculto. |
| 2026-08-05 | Implementación Fase 3 + Fase 4 | **Bloqueo real encontrado y documentado de inmediato** (ver sección al principio del archivo): el `.blend` del exterior auditado en la sesión anterior llegó como adjunto de chat, no persiste entre contenedores, y no había forma legítima de recuperarlo en esta sesión. En vez de improvisar un sustituto o parar, se hizo todo lo que sí era alcanzable: se instaló Blender 4.0.2 y se confirmó que `interior_blockout.py` **sí** es reproducible (verificó idéntico a la sesión anterior); se construyó el pipeline `gltf-transform` de Fase 3 (`scripts/process-glb.mjs`, prune→dedup→weld→instance→Draco→KTX2, probado contra el interior real, 733KB→29KB); se integró el interior como asset real en la app (`InteriorAsset.tsx`, Draco self-hosted en `public/draco/`); se implementó el spike técnico completo de Fase 4 (shader de disolución radial con dos portales, cross-fade de luz sol→cabina, rampa de exposición, todo verificado contra el exterior placeholder + el interior real); se construyó el entorno de Secciones 1–3 (marcas de pista, hangares, polvo, nubes). Verificado en navegador real con Playwright en cada paso, no sólo al final — encontrados y corregidos 6 bugs reales en el proceso (radio de portal insuficiente, `u` de una curva reusado para samplear otra, 606→33 draw calls al notar que faltaba instancing, nubes con borde duro, nubes en el corredor de cámara, nubes sin fade-out). Build y typecheck limpios. | El exterior real seguía bloqueado (resuelto en la sesión siguiente). La registración espacial exterior/interior de Fase 4 era una aproximación en código. Bloom real diferido a Fase 7 a propósito. |
| 2026-08-05 | Exterior real: bloqueo resuelto, integrado y verificado | El usuario adjuntó de nuevo `airbus-a380.zip` y autorizó subirlo al repo. Se reprodujo el pipeline completo de Blender contra el archivo real (`audit_exterior.py` → `prepare_exterior.py` → `verify_exterior.py` → `register_interior.py` → `verify_registration.py`), confirmando en cada paso los mismos hallazgos que la auditoría original (checksums idénticos). Se procesó `exterior.glb` con el pipeline de Fase 3 (4472.5→2184.9 KB; KTX2 no disponible en este contenedor, degradó con gracia a resize+JPEG, ver Fase 3). Se construyó `ExteriorAsset.tsx`, reemplazando `AircraftPlaceholder.tsx`: colocación derivada empíricamente componiendo matrices reales del GLB (un primer intento con sólo traslaciones ignoró la rotación real de `Exterior_Root` y dio números sin sentido físico — corregido antes de escribir código, no después), dirección nariz/cola confirmada de forma independiente cuatro veces, shader de disolución aplicado al mesh real, tren de aterrizaje real (115 nodos) con retracción animada. Verificación en Playwright de punta a punta encontró y corrigió un bug real (retracción del tren comparaba progreso global contra un umbral pensado en progreso local de S2). Se subió el binario fuente al repo (`blender/source/`, CC BY 4.0, decisión explícita del usuario) con atribución propia. Build y typecheck limpios en todo momento. | Geometría de detalle del umbral (puertas, marco) y bloom real quedan para Fase 6/7, ya no por bloqueo de asset sino por alcance no cubierto todavía. Atribución visible en el sitio (footer) sigue pendiente de Fase 6. |
| 2026-08-06 | Cierre incremental de Fase 3 | Se implementaron y verificaron por compilación el parallax de hero respetuoso de movimiento reducido y la sombra proyectada real de pista; se revisó el árbol completo desde GitHub y pasó tsc -b + build Vite. | HDRI reales S1/S3 y KTX2/Basis del artefacto exterior siguen pendientes y explícitos; falta verificación visual post-cambio en navegador con binarios montados. |
