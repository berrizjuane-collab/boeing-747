# PROGRESS — Sitio Scrollytelling 3D de Presentación de Aeronave

Checklist de seguimiento espejado a las fases de [`PLAN.md`](./PLAN.md).
Sirve para retomar contexto entre sesiones: **antes de trabajar, leer las notas de la fase activa.**

**Estado global: Fases 0–6 completas y verificadas visualmente en navegador real.** El bloqueo del exterior (más abajo, RESUELTO) se destrabó el 2026-08-05. **Fase 3 se cerró el 2026-08-06**: las tres condiciones que quedaban explícitas (verificación visual, HDRI reales, KTX2/Basis genuino) eran limitaciones de contenedor, no de código, y se resolvieron con evidencia. **Fase 4 se cerró el mismo día** con la geometría de detalle del umbral. **Fase 5 se cerró el mismo día**: sus gates técnicos (iluminación irradiada vía PMREM, sombras interiores, LOD de corredor, mesetas de easing) los implementó una sesión concurrente sobre `main` — mergeados acá y revisados con la misma vara que Fase 3/4, lo que encontró y corrigió dos bugs reales (doble iluminación de cabina, fade de salida con smoothstep degenerado) y una brecha frente al plan (LOD de culling duro en vez de *fade-out*), todo verificado visualmente. **Fase 6 se cerró el mismo día**: capa DOM completa (overlays narrativos, overlays de interior por zona, hotspots, pantalla de carga, nav) más el tercer HDRI (atardecer) que Fase 6 tenía pendiente desde que Fase 3 lo dejó fuera de alcance a propósito. Cinco bugs reales encontrados y corregidos durante la verificación — ver la sección de Fase 6 más abajo y el registro de sesión para el detalle de cada uno.

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

## Fase 3 — Pipeline exterior y secciones 1–3 · ✅ COMPLETA

> El bloqueo ✅ RESUELTO al principio de este archivo cubre el contexto completo. Todo lo que dependía del binario exterior — procesar `exterior.glb`, cargarlo real en la app, tren de aterrizaje real — se completó el 2026-08-05. Las tres condiciones de cierre que quedaban (verificación visual, HDRI reales, KTX2/Basis genuino) se cerraron el 2026-08-06 — ver "Cierre real — 2026-08-06" más abajo.

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
- [x] **KTX2/Basis genuino en `exterior.glb` — resuelto 2026-08-06.** El binario `ktx` (KTX-Software) no era instalable en la sesión del 2026-08-05 (sin paquete apt/pip, descarga de GitHub releases bloqueada por el scoping de red de esa sesión — 403 explícito). Una sesión posterior corrió en un contenedor distinto donde `apt-get install ktx-software` no existe pero la descarga directa del `.deb` desde GitHub Releases sí resolvió (200, no 403) — la restricción era del scoping de red de cada sesión, no del binario en sí. Con `ktx` instalado, `scripts/process-glb.mjs` produce KTX2/ETC1S real: `image/ktx2`, sin fallback. Se encontró y corrigió además un bug real en el propio pipeline: el cap de resize a 2048px sólo se aplicaba en la rama de fallback JPEG, así que un KTX2 exitoso servía la textura fuente completa (7324×4680) — **22.85 MB de gpuSize estimado, más que el JPEG de fallback que se suponía debía mejorar**. Con el cap aplicado también en la rama KTX2: **1.79 MB de gpuSize a la misma resolución 2048px que ya usaba el fallback** (antes 14.29 MB) — 8×, no una regresión. Ver detalle en "Cierre real — 2026-08-06".

### Verificación de cierre de esta pasada — 2026-08-06 (parcial, código)

- [x] Parallax y sombras compilados contra el árbol TypeScript actual reconstruido desde main: tsc -b completo, PASS.
- [x] Build de producción Vite con las dependencias declaradas, PASS (597 módulos transformados).
- [x] Relectura remota posterior a los commits confirma los cuatro archivos de runtime actualizados: CameraRig.tsx, EnvironmentPlaceholder.tsx, SceneCanvas.tsx y ExteriorAsset.tsx.
- [x] Verificación visual post-cambio con Playwright en el exterior real — **completada en la sesión siguiente, mismo día** (ver "Cierre real — 2026-08-06"). No era ejecutable en *este* contenedor porque el binario/modelos y un navegador no estaban montados localmente; el contenedor siguiente sí tenía Chromium de Playwright preinstalado.
- [x] HDRI golden hour de S1 y HDRI de gran altitud de S3 — **resuelto en la sesión siguiente**, generados proceduralmente (no descargados) por bloqueo de red a polyhaven.com. Ver "Cierre real — 2026-08-06".
- [x] KTX2/Basis del exterior final — **resuelto en la sesión siguiente**, `ktx` instalable en ese contenedor. Ver el ítem de arriba y "Cierre real — 2026-08-06".

### Cierre real — 2026-08-06 (verificación visual + HDRI + KTX2 + Fase 4)

**Contexto:** esta sesión corrió en un contenedor distinto al de la pasada anterior — con Blender instalable, `ktx` (KTX-Software) instalable vía descarga directa de GitHub Releases, y Chromium de Playwright preinstalado (`/opt/pw-browsers/chromium-1194`, versión distinta a la que el `playwright` de npm espera por defecto — hay que pasar `executablePath` explícito). Las tres condiciones que la pasada anterior dejó explícitamente abiertas eran limitaciones de *ese* contenedor, no del código, y las tres se confirmaron resueltas en este.

**Verificación visual real, de punta a punta:**
- [x] `npm install` limpio, `npm run dev` / `vite preview` servidos y verificados con Playwright (Chromium real, renderizado por software vía SwiftShader — confirmado `WEBGL2_OK true`) en 19 puntos de scroll cubriendo las 7 secciones, más un chequeo de paralaje de mouse en S1.
- [x] **Cero errores de consola, cero page errors, cero request failures** en el recorrido completo (sólo warnings esperables: deprecaciones de `THREE.Clock`/`RGBELoader`, y "GPU stall" del software renderer al hacer muchos screenshots seguidos).
- [x] Conteos de triángulos por sección verificados como coherentes con la arquitectura documentada (no adivinados): 2K→70K al cargar el exterior en S1, ~122–137K en S2 con el tren extendido, cae a ~44–85K al entrar a S3 (tren ya retraído y oculto), sube a ~162K en S4–S6 con el interior montado (coincide con los ~118K del interior + ~44K del exterior ya documentados), vuelve a ~42K en S7 al desmontar el interior.

**Bug real encontrado y corregido — exterior no cargaba en absoluto:** el primer intento de correr la app en este contenedor tiró `THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures` — al reprocesar `exterior.glb` con KTX2 real (ver abajo), la app dejó de poder cargarlo, porque `ExteriorAsset.tsx` nunca configuraba un `KTX2Loader`. Corregido: `KTX2Loader` de `three-stdlib` (mismo paquete de tipos que usa `GLTFLoader` internamente — un `KTX2Loader` de `three/examples/jsm` directo no tipa contra el `setKTX2Loader` de `three-stdlib`), transcoder Basis self-hosted en `public/basis/` (mismo criterio que `/draco/`: sin dependencia de CDN en runtime), inyectado vía el 4º parámetro `extendLoader` de `useGLTF`. Se retiró `useGLTF.preload('/models/exterior.glb')`: el preload corre a nivel de módulo, antes de que exista un `<Canvas>`/renderer, y `KTX2Loader.detectSupport(renderer)` necesita uno — mantenerlo habría reproducido el mismo error. El `<Suspense>` de `SceneCanvas.tsx` sigue cubriendo la carga.

**HDRI reales — generados, no descargados:** `polyhaven.com`/`dl.polyharon.org` están bloqueados por el gateway de red de esta sesión (403). En vez de buscar otra fuente bajo esa restricción — con la cuestión de licencia de terceros que eso reabriría, dado lo estricto que este proyecto ya es al respecto (`ASSET_AUDIT.md`) — se generaron proceduralmente con el modelo de cielo físico Nishita de Cycles (`blender/generate_hdri.py`, reproducible como el resto del pipeline de Blender): `public/hdri/golden-hour.hdr` (sol bajo ~6°, altitud 200m) y `public/hdri/high-altitude.hdr` (sol alto ~68°, altitud 10.700m, dentro del techo de servicio de PLAN.md §9). Integrados vía un domo de cielo de shader único (`skyDomeMaterial.ts`) que mezcla ambas texturas por píxel — no dos esferas superpuestas con blending estándar, que no reduce a un crossfade lineal salvo que una de las dos sea opaca — con los pesos de crossfade en `hdriTheme.ts` centrados en los límites S2/S3 y S3/S4, y `scene.environment` (reflejos PBR) cambiando de forma discreta en los mismos límites vía `<Environment map>` de drei. Verificado visualmente: horizonte cálido con resplandor de sol en S1, azul profundo con resplandor de sol en S3, sin cortes duros en la transición.

**Bug real encontrado y corregido — sombra de pista no se veía, con toda la configuración aparentando estar bien:** verificado visualmente que la sombra proyectada de S1/S2 (implementada e "verificada por compilación" en la sesión anterior, nunca en navegador) no aparecía en absoluto — confirmado con lectura de píxeles y una cámara cenital de depuración, no a simple vista. Dos bugs reales, ambos en la configuración de sombra de `EnvironmentPlaceholder.tsx`:
1. `sun.shadow.camera.left/right/top/bottom` se fijaban a ±220 imperativamente en un `useEffect`, pero nunca se llamaba `updateProjectionMatrix()` después — `OrthographicCamera` no recalcula su matriz de proyección sola al cambiar esas propiedades, así que la cámara de sombra seguía usando su frustum diminuto por defecto.
2. Incluso corrigiendo eso, `sun.shadow.mapSize.set(2048, 2048)` tampoco tenía efecto: `THREE.WebGLShadowMap` crea el render target de sombra la primera vez que la luz necesita proyectar un frame, que puede ocurrir antes de que un `useEffect` sobre el ref corra — confirmado con `readRenderTargetPixels` contra un build de producción limpio (no sólo el dev server con HMR, para descartar estado obsoleto): el render target quedaba fijo en 512×512 (el default), pese a que `sun.shadow.mapSize` reportaba 2048×2048 correctamente.

Corregido moviendo toda la configuración de sombra a props JSX del propio `<directionalLight>` (`castShadow`, `shadow-mapSize`, `shadow-camera-*`, `shadow-bias`, `shadow-normalBias`) en vez de mutación imperativa en un `useEffect` — los props JSX se aplican en la fase de commit de React, antes del primer `gl.render()` de R3F, así que el render target se crea del tamaño correcto desde el primer frame. Verificado tras el fix: render target confirmado en 2048×2048, y la sombra visible a simple vista en las capturas de Playwright bajo la iluminación normal de la escena (no hizo falta forzar contraste artificial para confirmarlo). Ninguno de los dos bugs es de esta sesión — son de la sesión que implementó la sombra (2026-08-06 anterior) y sólo la verificación visual real los pudo encontrar.

**Fase 4 — geometría de detalle del umbral, adicional a lo pedido:** ver la sección de Fase 4 más abajo.

### Interior (adelanto real, no estaba planeado para Fase 3)

- [x] **Blockout del interior regenerado y verificado en este contenedor** — `blender/interior_blockout.py` es 100% procedural, sin dependencia externa; se instaló Blender 4.0.2 vía apt, se corrió headless, y `blender/verify_blockout.py` pasó con los mismos conteos que documentó la sesión anterior (353 meshes, 250 asientos enlazados, bounds 6.32×4.58×58.26m) — confirma que el script es genuinamente reproducible, no sólo en el papel
- [x] Procesado por el pipeline: 733 KB → 29.4 KB (25×), 6 lotes de instancing (329 instancias) — `public/models/interior.glb`
- [x] Decoder Draco self-hosted en `public/draco/` (copiado de `three/examples/jsm/libs/draco`) — sin dependencia de un CDN externo en runtime
- [x] Cargado en la app real (`InteriorAsset.tsx`, vía `useGLTF`) y verificado visualmente con Playwright — ver capturas del recorrido de S5 en las notas de Fase 4/5 más abajo

### Sección 1 — Hero pista

- [x] Entorno de pista: asfalto con marcas de pista (`RunwayEnvironment.tsx`), césped (plano de suelo de Fase 2), hangares + torre de control a distancia
- [x] HDRI golden hour — **resuelto 2026-08-06.** `public/hdri/golden-hour.hdr`, generado proceduralmente con Cycles/Nishita (`blender/generate_hdri.py`, ver "Cierre real — 2026-08-06"), domo de cielo con crossfade real hacia el HDRI de S3. El gradiente procedural de `environmentTheme.ts` sigue vigente como color de fondo/niebla plano para S4 en adelante (donde no hay HDRI por diseño), no como sustituto del cielo visible en S1
- [x] Niebla exponencial (`FogExp2`, ya de Fase 2, reutilizada)
- [x] Partículas de polvo suspendido — `DustParticles`, visibles S1–S2, fade-out después. Primer intento se veía como "nieve" (tamaño de punto demasiado grande, esparcidas muy alto); corregido tras revisión visual
- [x] Deriva lenta de cámara (ya de Fase 2) — parallax de mouse implementado en CameraRig.tsx, limitado al hero, con fade-out en el borde S1/S2 y desactivado para prefers-reduced-motion

### Sección 2 — Rodaje y despegue

- [x] Traslación acelerando del avión (Fase 2)
- [x] Vibración/cabeceo de alta frecuencia y amplitud decreciente (Fase 2)
- [x] Rotación (Fase 2)
- [x] Separación y retracción del tren — el asset real trae 115 nodos `LandingGear_Part_###` bajo un grupo `LandingGear` (Fase 0). `ExteriorAsset.tsx` los sube y oculta sobre la mitad final del progreso local de S2. **Bug real encontrado y corregido**: el primer intento comparaba el umbral de retracción contra el progreso *global* de scroll en vez del progreso *local* de S2 — con S2 en el rango global [0.12, 0.28], el tren no empezaba a subir hasta el 50% global (bien entrado en el interior) en vez del ~20%. Detectado instrumentando `gear.visible`/`gear.position.y` directamente vía Playwright (no a simple vista); corregido envolviendo el umbral con `localProgress(progress, TAXI_SECTION)`. Verificado tras el fix: sube y desaparece entre global 20%–26%, se mantiene oculto el resto del recorrido.
- [x] Sombra proyectada desplazándose sobre el asfalto — Canvas shadows, shadow map ortográfico de la luz direccional (2048², bias/normalBias acotados), aeronave marcada castShadow y pista receiveShadow; el shadow map se desactiva después de S2 para no pagar ese coste en vuelo. **Confirmado visible en navegador real 2026-08-06** — la implementación original sólo se había verificado por compilación; tenía dos bugs reales (proyección de la cámara de sombra sin actualizar, render target de sombra atascado en 512² pese a pedir 2048²) que dejaban la sombra invisible en todo momento, ver "Cierre real — 2026-08-06"
- [x] Tracking shot lateral (Fase 2, keyframes reajustados en esta sesión — ver nota de bug abajo)

### Sección 3 — Ascenso

- [x] Órbita de cámara hasta vista frontal (Fase 2)
- [x] Transición al HDRI de gran altitud — **resuelto 2026-08-06.** `public/hdri/high-altitude.hdr`, mismo mecanismo que S1; se mantiene de S3 en adelante hasta que el crossfade lo apaga antes de S4 (ver `hdriTheme.ts`)
- [x] Capa de nubes — discos billboard (`CloudLayer`) con shader de caída radial suave (no volumétrico, tal como recomienda PLAN.md §3 S3)
- [x] Verificado que S3 es el punto de máxima luminancia (gradiente `#7fb3d5`, `environmentTheme.ts`, ya de Fase 2)

### Bugs reales encontrados y corregidos en la verificación de esta sesión

1. **Nubes con borde duro**: un disco plano con opacidad uniforme se ve como una placa de hielo/vidrio a poca distancia, no como una nube — sin textura de nube no hay suavidad "gratis". Corregido con un shader propio de caída radial (`createSoftDiscMaterial`).
2. **Nubes posicionadas sobre el corredor de vuelo de S2→S3**: la cámara pasaba muy cerca, y a esa distancia cualquier disco (aunque fuera suave) dominaba el cuadro. Corregidas alejándolas del corredor real de la cámara.
3. **Nubes con fade-in pero sin fade-out**: sólo subían de opacidad en S3 y se quedaban ahí — visibles hasta el footer. Encontrado recién al *scrollear la página completa* durante la verificación, no sólo la sección para la que fueron pensadas; corregido con fade-out simétrico hacia el final de S4. Vale la pena recordar este patrón: cualquier efecto "fade in" necesita su "fade out" verificado explícitamente, no asumido.
4. Partículas de polvo con puntos demasiado grandes y esparcidas demasiado alto — se leían como nieve, no polvo. Tamaño y rango de altura reducidos.

---

## Fase 4 — Spike del umbral (S4) · ✅ COMPLETA

> **Contexto:** pieza bespoke sin receta estándar. La pregunta que esta fase existe para responder — *¿el cruce se lee como atravesar un umbral, o como un corte?* — se validó primero con geometría placeholder (igual que la Fase 2 validó el arco de cámara con una caja) y se re-verificó el 2026-08-05 con el exterior real. La geometría de detalle del umbral (marco de puerta) se cerró el 2026-08-06 — ver más abajo. Lo único que sigue diferido a propósito es bloom real (Fase 7, necesita el pipeline de post-procesado que todavía no existe), que nunca fue alcance de esta fase.

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
- [x] **Geometría de detalle del umbral (marco de puerta) — resuelto 2026-08-06.** `ThresholdFrame.tsx`: anillo metálico + trim emisivo (se intensifica con `portalRadius`, el mismo escalar que abre el hueco) + umbral inferior iluminado ("umbral" también en sentido literal), en ambos portales (`NOSE_PORTAL`, `EXIT_PORTAL`). Geometría procedural en tres primitivas de Three.js, no un asset de Blender — la máscara del shader de disolución es una distancia euclídea 3D a un punto (`portalMask` en `dissolveHullMaterial.ts`), así que el hueco real es redondo, no rectangular; una puerta de avión literal (rectangular) quedaría flotando fuera del hueco que en teoría enmarca. Colocado en los centros de mundo fijos de los portales sin transformación de pose propia — válido porque ambas ventanas (`start`/`end` de `NOSE_PORTAL`/`EXIT_PORTAL`) caen enteramente dentro del rango donde `getAircraftPose` mantiene el avión inmóvil en `FLYING_POSE` (ver `aircraftPose.ts`), la misma asunción que ya usan los propios centros de los portales. Verificado visualmente en Playwright: el anillo se ve con nitidez durante la aproximación (S3 tardío, ~40% de scroll) enmarcando el avión antes de que el hueco se abra, y de nuevo en la salida (S6, ~86%) con el exterior visible a través — la cámara lo deja de ver una vez lo atraviesa porque queda detrás suyo, que es exactamente el comportamiento esperable al volar a través de un aro físico, no un bug.

### Bugs reales encontrados y corregidos en la verificación de esta sesión

1. **Radio de portal demasiado chico** (6 unidades) relativo a la sección transversal del fuselaje (7×8): el hueco apenas dejaba pasar la cámara, así que cualquier dirección de vista topaba con superficie sólida cercana — se leía como estar "atrapado contra una pared", no cruzando un umbral. Corregido subiendo el radio máximo a 14.
2. **Coordenadas del interior con signo invertido**: los primeros keyframes de S5 apuntaban el target hacia -Z (hacia la nariz) en vez de +Z (hacia la cola), por un error de signo al derivar las posiciones desde los anchors reales. Corregido y reverificado con capturas del pasillo — ver Fase 5.

### Bugs reales encontrados y corregidos al integrar el exterior real (2026-08-05)

1. **Retracción del tren contra el progreso global en vez del local de S2** — ver el ítem de tren en Fase 3 arriba; detectado instrumentando el estado real (`gear.visible`/`gear.position.y`) vía Playwright, no a simple vista, porque el síntoma (tren visible más allá de donde debía) era sutil en capturas aisladas.
2. **Primer intento de colocación del exterior ignoró la rotación real de `Exterior_Root`**: sumar sólo las traslaciones de la cadena de nodos (sin componer la rotación -90°X que el archivo trae horneada) daba bounds que no cuadraban con las specs reales del A380 ni con los anchors del interior ya verificados. Detectado por sentido común numérico (una altura de "73m" para un fuselaje no tiene sentido) antes de escribir ningún componente, no después — se rehizo el cálculo componiendo matrices completas (traslación + rotación) con `three.js`, y se verificó contra los bounds reales del archivo antes de escribir `ExteriorAsset.tsx`.

---

## Fase 5 — Interior (S5) · ✅ Completa

**Alcance confirmado (§12.3 de PLAN.md): v1 con 3 zonas, marcadas ★. Las otras 3 quedan diferidas — documentadas, no eliminadas.**

> Los gates técnicos (iluminación de relleno irradiada, sombras interiores, LOD, mesetas de recorrido) se implementaron en una sesión concurrente sobre `main`. Al mergearla acá (2026-08-06) se revisó ese código con la misma vara que Fase 3/4 — no alcanza con que compile — y aparecieron dos bugs reales más una brecha frente al plan, los tres corregidos y verificados visualmente con navegador real (Playwright + Chromium headless contra un build de producción, `interior.glb` montado):
>
> 1. **Doble iluminación de cabina.** `EnvironmentPlaceholder.tsx` todavía traía el `PointLight` placeholder de Fase 4 (previo a que existiera `InteriorLighting.tsx`), activo en la misma ventana S4 que los dos spots nuevos — la cabina quedaba iluminada por ambos sistemas a la vez. Se quitó el point light; los spots de `InteriorLighting` (mejor posicionados, con sombra, con fill PMREM) lo reemplazan sin pérdida.
> 2. **Smoothstep degenerado en el fade de salida.** `cabinFactor()` calculaba la rampa de salida con `smoothstep(SECTIONS[4].end, SECTIONS[5].start, progress)` — dos límites de sección que valen exactamente lo mismo (0.82, porque S5 termina donde empieza S6), un rango de ancho cero. El propio *fallback* de `smoothstep` para rangos degenerados (`valor < edge0 ? 0 : 1`) convertía eso en un corte duro: la luz de cabina se apagaba de golpe al cruzar 82% en vez de atenuarse. Se corrigió para usar todo el ancho de S6 (0.82→0.95) como ventana de salida, espejando la rampa de entrada (que sí usa todo S4) y el propio fade de vuelta del sol en `thresholdLighting.ts`. Verificado matemáticamente (`cabinFactor(0.88) ≈ 0.56`, no 0) y visualmente (capturas en 80/81.5/82/83/88% muestran una atenuación continua, no un salto).
> 3. **LOD de corredor con culling duro, no *fade-out*.** El requisito de PLAN.md §6.1 pide explícitamente un *fade-out* de opacidad para las filas lejanas; la implementación mergeada hacía un corte binario de visibilidad a 42 unidades. Se reemplazó por una rampa `smoothstep` de opacidad (30→42 unidades) con `castShadow` cortando un poco antes (opacidad > 0.5) para que no quede una sombra flotando sobre geometría ya invisible. Los materiales se clonan una única vez por mesh (marcado en `userData`, no en cada montaje) porque varios nodos comparten mesh/material — las dos consolas de cabina, las cuatro ventanillas, los dos compartimientos superiores — y escribir opacidad por nodo sin clonar pisaría el valor del par espejado en el mismo frame.
>
> La verificación visual barrió 10 puntos de scroll entre 42% y 95% (entrada a S4, mitad de corredor, el límite antiguo de 82% con muestras cada 0.5-1pp alrededor, y la salida a S6) contra un build de producción servido con `vite preview`, sin errores de consola ni de página en ningún punto.

- [x] Assets de interior procesados por el pipeline (ver Fase 3)
- [x] **Asientos como instancias de GPU** — no vía `InstancedMesh` construido a mano en Three.js como proponía el plan original, sino vía `EXT_mesh_gpu_instancing` aplicado en el pipeline de glTF (`gltf-transform instance`), que three.js's `GLTFLoader` lee de forma nativa. Mismo resultado (250 asientos, pocos draw calls), mecanismo distinto — más simple porque vive en el pipeline de assets, no en código de la app
- [x] **Iluminación de cabina con env map irradiado** — `InteriorLighting.tsx` genera un fill equirectangular procedural de 64×32 y lo prefiltra mediante `PMREMGenerator`; se suman dos spots analíticos (cálido/frío) con entrada y salida suaves en S4/S6 (fade de salida corregido, ver arriba). Es un env map irradiado de bajo coste, no un HDRI externo. Un único sistema de iluminación de cabina, no dos (ver bug #1 arriba)
- [x] **Shadow map de interior** — ambos spots tienen shadow map de 1024×1024, bias/normalBias y distancia acotada; la geometría interior hace cast y receive shadow. La iluminación se monta sólo en la ventana S4–S6
- [x] **LOD de corredor** — *fade-out* real de opacidad (rampa `smoothstep` 30→42 unidades desde la cámara), no culling duro — cierra la brecha frente a PLAN.md §6.1 (ver bug #3 arriba). `castShadow` se corta un poco antes que la visibilidad para evitar sombras flotantes sobre geometría ya invisible
- [x] Cámara de walkthrough — ya existía desde Fase 2, keyframes recalculados para pasar por los anchors reales del interior (ver Fase 4, bug #2)
- [x] **Mesetas de easing por zona** — `walkthroughProgress` mantiene la cámara en los anchors de cockpit, economy y escalera, y suaviza la llegada al piso superior; posición, target, FOV y roll usan el mismo progreso, sin desincronización

### Zonas v1 — recorridas con geometría real, no sólo cámara sobre una caja

- [x] ★ Cabina de mando — geometría real, cámara pasa por el anchor real
- [x] ★ Economy — geometría real con asientos instanciados; **la mejor captura visual de toda la sesión**, corredor legible con asientos a ambos lados y la escalera visible al fondo
- [x] ★ Escalera al piso superior — geometría real, cámara pasa por el anchor real
- [x] ★ Piso superior — geometría real, cámara pasa por el anchor real

### Zonas diferidas — incremento posterior, fuera de v1 (sin cambios)

- [ ] Primera clase
- [ ] Business / Economy Plus

### Verificación de Fase 5 — 2026-08-06

- [x] `npm run build` — `tsc -b` + Vite, 603 módulos transformados, salida de producción generada
- [x] `oxlint src` — sin diagnósticos
- [x] Invariantes estáticas — PMREM y shadow maps 1024 configurados; meshes interiores con cast/receive; LOD y montaje dentro de `InteriorGate`; posición, target, FOV y roll comparten `pathT`
- [x] Prueba de anchors de easing — muestras `0, 0, 1/3, 1/3, 2/3, 2/3, 1` en los límites de las mesetas
- [x] **Verificación visual post-cambio** — Playwright + Chromium headless contra `vite preview` (build de producción), 10 puntos de scroll entre 42% y 95%. Confirmado: una sola fuente de luz de cabina (no doble), fade de salida continuo alrededor de 82% (no corte duro), fade de opacidad del LOD sin *pop* visible en el corredor, mesetas de la cámara aterrizando en cockpit/economy/escalera/piso superior en el orden correcto. Cero errores de consola o de página en los 10 puntos
- [x] **Aislar si el costo de render (fps bajo bajo SwiftShader, 2 spots con sombra simultáneos) era una regresión de esta pasada** — se comparó el mismo barrido con y sin los tres fixes (stash + rebuild) contra los mismos puntos de scroll: el fps ya estaba en 0 en el corredor de S5 *antes* de los fixes (renderizado por software sin GPU real, no algo introducido hoy). El único costo adicional real y esperado es que el fix del smoothstep extiende la ventana de sombra de los spots a todo S6 en vez de cortarla en 82% — es la consecuencia correcta del bug corregido, no un problema nuevo

**Limitación confirmada (no introducida hoy, no corregida — alcance de modelado, no de código):** el hueco de la escalera no tiene paredes ni cielorraso modelados en el blockout (`interior.glb` sólo trae `Stair_Floor`, `Stair_Main` y los dos `Stair_Railing`, ningún `Stair_Wall`) — visible como un hueco lateral que deja ver el color de fondo plano en ciertos ángulos cerca de la escalera. Es una instancia concreta de "cierre de arte pendiente", ya reconocido más arriba; cerrarlo requiere modelado en Blender, fuera del alcance de esta pasada de bugs.

## Fase 6 — Cierre, overlays y hotspots · ✅ Completa

> Cerrada 2026-08-06. Todo lo de abajo está implementado y verificado con Playwright + Chromium headless contra un build de producción (`vite preview`), en varias pasadas — no una sola al final: cada pieza nueva (overlay, HDRI de atardecer, hotspots, loading screen, nav) se verificó al agregarla, lo que encontró bugs reales que compilar nunca iba a atrapar. Detalle completo, con causa raíz de cada uno, en el registro de sesiones más abajo. Un ítem queda con caveat explícito, no oculto: la posición 3D exacta de los 4 hotspots de economy (asiento/pantalla/ventanilla/compartimiento) todavía necesita una pasada visual más — ver la nota al final de la sección de Hotspots.

### Secciones 6 y 7

- [x] Umbral inverso de salida — ya existía desde Fase 4/5 (`cameraPath.ts`, keyframes de S6), reverificado
- [x] Retroceso largo a vista general en vuelo — confirmado visualmente (S6 80-95%: de la puerta al avión completo en silueta contra el cielo de atardecer)
- [x] **Grading de atardecer — verificado que NO repite la luz de S3.** Tercer HDRI real (`blender/generate_hdri.py --preset sunset`, Nishita con el sol un poco *debajo* del horizonte — no bajo como en golden-hour, directamente ausente — para que el cielo lea azul profundo con sólo un resplandor cálido en el horizonte, no una réplica del key cálido de S1/S3) más un bug real corregido: el "sol" direccional volvía a intensidad y **color** de S1 sin cambios hacia el final de S6 (`thresholdLighting.ts` ya rampeaba la intensidad de vuelta, pero nunca tocaba el color) — se agregó `duskColorMix` para virar el color del sol hacia el acento frío de §10.1 (`#E89B6C`) en ese mismo tramo
- [x] Outro con marca y créditos — panel de salida en `NarrativeOverlay.tsx`
- [x] Footer con atribuciones de licencia — bloque colapsable con el texto de atribución de `ASSET_AUDIT.md` reproducido literal, según el diseño que esa auditoría ya había dejado definido

### Sistema de overlays

- [x] Grilla compartida: tercio central reservado al avión — grid de 3 columnas, contenido sólo en columnas 1 y 3
- [x] Fuentes cargadas (display + mono) — pila de fuentes de sistema, no una variable descargada (ver nota de decisión en `index.css`: sin ruta confiable para traer web fonts en este contenedor, y cero bytes de fuente cumple el objetivo de payload del plan mejor que una variable)
- [x] Cifras tabulares en el mono — `font-variant-numeric: tabular-nums` en los valores de dato y en el porcentaje de carga
- [x] Escala tipográfica con `clamp()` — implementada; dos valores del plan (hero, valor de dato) se recalibraron hacia abajo tras encontrar overflow real en Playwright, con la razón documentada en el CSS
- [x] Fade + desplazamiento sincronizados a scroll — paneles con `data-active` alternado por `activeIndex` (React, ~6 renders en toda la página) o por progreso local vía loop de rAF (S2 y la escalera de datos de S5), nunca por el hook reactivo de progreso continuo

### Hotspots

- [~] `<Html distanceFactor>` de drei — **sin** `occlude="blending"`: se probó primero como pide el plan, pero renderizaba cuadrados negros sólidos de ~75px en el punto de anclaje en vez de quedar invisible (confirmado con una captura que no incluía al avión en cuadro, así que no era un problema de sombreado del modelo — el proxy de oclusión mismo se estaba pintando). Entre eso y no tener oclusión, gana la calidad visual (§1 del plan lo dice explícitamente para este tipo de disyuntiva)
- [x] Punto 12px + anillo, pulso 1×→2.2× / opacidad 0.6→0 en 2.4s — implementado literal
- [x] Pulso escalonado entre hotspots — delay distinto por hotspot
- [x] Hover: anillo se detiene, línea guía, tarjeta DOM
- [x] Banda de dwell: `pointer-events: none` fuera de ella — loop de rAF por hotspot, mismo patrón que el resto de lo continuo
- [x] Navegación por teclado con foco visible — `<button>` nativo + `:focus-visible`

**Nota abierta, no bug de sistema:** los 3 hotspots exteriores (S3) y el de galley (S5) quedaron confirmados en cuadro con capturas reales. Los 4 de economy (asiento/pantalla/ventanilla/compartimiento) pasaron por dos rondas de ajuste — la primera corrigió que cayeran *detrás* de la cámara (confirmado con `getBoundingClientRect` en 0×0 — `<Html>` de drei oculta anclas que proyectan detrás), la segunda achicó el offset lateral/vertical que los mandaba fuera de cuadro — y sólo uno (ventanilla) quedó confirmado dentro del viewport al cierre de esta pasada. Mismo problema de fondo que ya reconoce `cameraPath.ts` para sus propios keyframes ("colocar a mano editando números es inviable"): sin una herramienta de autoría visual para hotspots — que no existe, y construirla es alcance nuevo, no un bug de esta fase — más rondas de ajuste a ciegas tienen rendimientos decrecientes. El sistema en sí (gating, pulso, hover, ausencia de artefactos) está verificado y funcionando; lo que falta es afinar 4 coordenadas específicas.

### Pantalla de carga y nav

- [x] Loader con `useProgress`
- [x] Progreso ponderado por peso esperado de asset — mapa de pesos medidos (`ls -la`, no estimados) sobre los 4 assets que bloquean S0 (exterior + 3 HDRI), excluyendo a propósito `interior.glb` (precargado pero no bloqueante, §6.4)
- [x] Secuencia de salida: regla al 100% → wordmark sube y se desvanece → exposición 0→objetivo en 1.2s — la rampa de exposición arranca en simultáneo con el fade de la pantalla de carga en vez de esperar a que termine, para que se lean como una sola revelación continua en vez de un hueco negro entre medio
- [x] Nav fijo 64px con scrim en degradado — confirmado legible incluso sobre el cielo brillante de S1/S3
- [x] Indicador de 7 marcas con la activa alargada
- [x] "Saltar a sección" — `lenis.scrollTo` al inicio de la sección elegida

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
| 2026-08-06 | Cierre real de Fase 3 (verificación visual + HDRI + KTX2) y Fase 4 (marco del umbral) | Sesión con Blender instalable, `ktx` (KTX-Software) instalable vía GitHub Releases (200, no 403) y Chromium de Playwright preinstalado — las tres condiciones que la pasada anterior dejó abiertas eran limitaciones de *ese* contenedor, no del código. Instalado `python3-numpy` (faltaba para el addon glTF I/O del Blender de apt — bug de entorno encontrado y resuelto, no reportado antes). Reprocesado `exterior.glb` con KTX2/Basis genuino; encontrado y corregido un bug real en `scripts/process-glb.mjs` (el cap de resize sólo se aplicaba en el fallback JPEG, así que un KTX2 exitoso pesaba más VRAM que el fallback que debía mejorar — 22.85MB vs. 1.79MB tras el fix, misma resolución). Generadas ambas HDRI (`golden-hour.hdr`, `high-altitude.hdr`) proceduralmente con Cycles/Nishita (`blender/generate_hdri.py`) por bloqueo de red a polyhaven.com, integradas con crossfade real de un solo shader (`skyDomeMaterial.ts`, `hdriTheme.ts`). Al cargar la app con el exterior KTX2 nuevo, encontrado y corregido un bug real que rompía la carga por completo (`GLTFLoader: setKTX2Loader must be called`) — faltaba configurar `KTX2Loader` en `ExteriorAsset.tsx`, transcoder Basis self-hosted en `public/basis/`. Verificación visual completa en Playwright (19 puntos de scroll, 0 errores de consola/red) encontró que la sombra de pista —"verificada" sólo por compilación en la sesión anterior— no se veía en absoluto; dos bugs reales en la configuración de sombra (`updateProjectionMatrix()` nunca llamado tras cambiar los bounds de la cámara ortográfica; el render target de sombra quedaba fijo en 512² pese a pedir 2048² por timing de cuándo Three.js lo crea) corregidos moviendo la configuración a props JSX. Agregada la geometría de detalle del umbral que Fase 4 tenía pendiente (`ThresholdFrame.tsx`): anillo + trim + umbral iluminado en ambos portales, procedural en vez de un asset de Blender porque la máscara de disolución es una esfera 3D (hueco redondo, no rectangular). `tsc -b`, `vite build` y `oxlint` limpios en todo momento; verificado contra un build de producción limpio, no sólo el dev server con HMR. | Ninguna condición abierta en Fase 3 ni Fase 4. Sigue pendiente todo lo de Fase 6 en adelante (overlays, hotspots, pantalla de carga, post-proceso, performance/mobile, verificación de datos de §9) — sin cambios de alcance respecto de lo ya documentado. |
| 2026-08-06 | Implementación Fase 5 (sesión concurrente sobre `main`, mergeada acá) | Se añadieron fill irradiado procedural mediante PMREM, dos spots interiores con shadow map 1024², cast/receive de sombras del interior, culling LOD por distancia y mesetas de easing sincronizadas para posición/target/FOV/roll; build, lint e invariantes verificados. | El LOD todavía es culling duro, no fade de opacidad; la verificación visual post-cambio requiere navegador y `interior.glb` montados — esta sesión no los tenía. Primera clase y Business/Economy Plus siguen diferidas por decisión v1. |
| 2026-08-06 | Cierre real de Fase 5 (revisión de lo mergeado + verificación visual) | Revisado el código de Fase 5 mergeado con la misma vara que Fase 3/4 — no alcanza con que compile. Encontrados y corregidos 2 bugs reales (point light placeholder de Fase 4 compitiendo con los spots nuevos de `InteriorLighting`, doble-iluminando la cabina en S4–S5; `smoothstep` de rango degenerado en el fade de salida que cortaba la luz de golpe en 82% en vez de atenuarla) y cerrada la brecha frente a PLAN.md §6.1 (LOD de culling duro → *fade-out* real de opacidad, con clonado de material por mesh para no pisar pares espejados). Verificación visual con Playwright + Chromium headless contra un build de producción (`vite preview`), 10 puntos de scroll entre 42% y 95%, 0 errores de consola/página. Se aisló mediante stash+rebuild que el fps bajo bajo software-rendering en el corredor de S5 ya existía *antes* de estos fixes — no es una regresión de esta pasada, es SwiftShader sin GPU real. | Confirmada (no corregida — es modelado, no código) una brecha del blockout: el hueco de la escalera no tiene paredes/cielorraso modelados. Primera clase y Business/Economy Plus siguen diferidas por decisión v1. |
| 2026-08-06 | Implementación y cierre de Fase 6 (overlays, hotspots, loading screen, nav, HDRI de atardecer) | Construida la capa DOM completa: sistema de overlay compartido (grilla de tercios, tipografía con pilas de fuentes de sistema, transiciones por `data-active`); contenido narrativo S1/S2/S3/S6/S7 (`NarrativeOverlay.tsx`) con dato progresivo en S2 vía loop de rAF; overlay por zona de S5 sincronizado a las mismas mesetas de dwell de la cámara (`InteriorOverlay.tsx`, reexportando la detección de zona desde `cameraPath.ts` para no duplicarla); tercer HDRI real de atardecer generado con Nishita (`blender/generate_hdri.py --preset sunset`, sol bajo el horizonte para un cielo frío con sólo un resplandor cálido, no una réplica de S1/S3) y su propio domo de cielo (material simple de una textura, no el shader de 2 texturas existente, porque nunca se superponen en el tiempo); sistema de hotspots (`Hotspots.tsx`/`Hotspot.tsx`) con pulso escalonado, tarjeta de hover y gating por banda de dwell vía rAF; pantalla de carga con progreso ponderado por peso real de asset y secuencia de revelación con rampa de exposición; nav fijo con scrim e indicador de 7 marcas navegable. Verificado con Playwright en múltiples pasadas — no una sola al final — lo que encontró y corrigió 5 bugs reales: (1) columnas de grilla CSS deformadas por contenido invisible sin punto de corte (`minmax(0,1fr)` + ancho definido); (2) todos los paneles de un mismo lado cayendo en filas separadas del grid en vez de superponerse (`grid-row: 1` explícito — el mismo error que `InteriorOverlay` sí había evitado con su propio stack de zonas); (3) título del hero ilegible contra el cielo brillante de S1 — no era overflow como parecía a primera vista, era texto blanco sobre cielo casi blanco (agregado `text-shadow` a todo el overlay); (4) el HUD de debug, siempre fijo arriba-a-la-derecha desde Fase 1, quedó tapando contenido real por primera vez (movido a abajo-a-la-derecha); (5) `occlude="blending"` de los hotspots pintando cuadrados negros sólidos en vez de quedar invisible (deshabilitado, con la razón documentada). El sol de S6 también volvía al color exacto de S1 al re-intensificarse — corregido con `duskColorMix` para virar su color hacia el acento frío de §10.1. `tsc -b`, `oxlint` y `vite build` limpios en todo momento. | Las coordenadas 3D de los 4 hotspots de economy (asiento/pantalla/ventanilla/compartimiento) necesitan otra pasada visual — sólo ventanilla quedó confirmada en cuadro tras dos rondas de ajuste; ver la nota en la sección de Fase 6. Post-proceso (Fase 7), tiering/mobile (Fase 8) y verificación de datos primarios (Fase 9) quedan como siempre estuvieron planeados, sin cambios de alcance. |
