# PLAN 6 — Reparación de continuidad, geometría y calidad visual

**Actualización 2026-09-19:** implementación de fases 0–2 y evidencia en
[`progress6.md`](./progress6.md). La planificación original sigue abajo; sus
criterios de aceptación no se dan por cumplidos sólo por implementar código.

**Fecha:** 2026-09-18. **Estado:** planificación; ninguna corrección implementada en esta ronda.

**Repositorio:** `berrizjuane-collab/boeing-747`. **Base auditada:** `52725ba2225351ecf350f06e06be564c65cb6ddd` (`main`).

**Encargo:** auditar el proyecto, entender su documentación y preparar un plan detallado para corregir fallos visuales, saltos entre frames y malos modelados. La ejecución comienza en un prompt posterior. Este commit añade únicamente este documento.

Este plan es el punto de entrada para la próxima ronda. Los planes y registros anteriores se conservan como historial, no como prueba de que el producto actual esté visualmente terminado. Al comenzar la implementación, crear `progress6.md` y actualizar los enlaces de documentos activos del README. No marcar una fase como completa por escribir su código o por pasar pruebas unitarias.

## 1. Diagnóstico ejecutivo

El proyecto tiene una base funcional aprovechable: React, Three.js/R3F, un recorrido continuo parametrizado, assets reproducibles, materiales procedurales, tiers y herramientas de QA. No necesita una reescritura indiscriminada. Necesita corregir contratos que hoy no coinciden entre sí: progreso real y captura, cámara y espacio habitable, asset fusionado y LOD, recursos cacheados y desmontaje, geometría y relato, y aprobación visual y despliegue.

Los problemas no se reducen a falta de detalle. Añadir más árboles, brillos o texturas antes de corregir esas relaciones aumenta el coste y conserva los defectos. El orden será: evidencia fiable → estado y recursos → geometría/registro → movimiento → transiciones → acabado → rendimiento y cierre.

El nombre del repo es histórico. El producto vigente es **MERIDIAN — Airbus A380-800**; README y ASSET_AUDIT lo explican expresamente. Se conserva esa identidad. No convertir el avión en un 747 ni cambiar la URL de Pages durante esta reparación.

### 1.1 Qué se comprobó en esta auditoría

- Inventario del árbol de `main`, documentación de rondas 1–5, código de cámara, scroll, render, assets, iluminación, materiales, UI, pruebas y workflows. No se encontró `AGENTS.md` en el árbol auditado.
- Inspección visual directa de seis imágenes versionadas de la ronda 5: hero, cockpit, economy, escalera, cubierta superior y salida. Son capturas históricas del repo, **no renders nuevos de esta sesión**; su correspondencia exacta con el progreso declarado no está garantizada.
- Descarga y decodificación del `public/models/interior.glb` publicado, con Draco y glTF Transform. Confirmadas las agrupaciones grandes por material y un lote de 240 asientos instanciados.
- Ejecución local sobre los fuentes recuperados del SHA base: `npm test` **41/41**, `npm run lint` correcto y `npm run build` correcto. El build advierte un chunk JS de aproximadamente 1,74 MB minificado / 539 kB gzip. La copia local de auditoría no contiene todo `public/`: compilar así comprueba TS/bundling, **no la disponibilidad de assets ni el funcionamiento visual del sitio**.
- Muestreo numérico adicional de `sampleCamera`, sin editar el código, y lectura de las implementaciones instaladas de GSAP y drei para contrastar las suposiciones de scroll y carga.
- Consulta de Actions del mismo SHA: `Final visual QA` falló; `static-checks` y vídeo pasaron, capturas fallaron. El log identifica un timeout de 30 s en `setQuality`, al pulsar `.site-nav__quality`, antes de completar las capturas. El artefacto de screenshots contiene únicamente el log del preview (ZIP de 269 bytes), no una batería visual válida.

**Límites:** no se ejecutó un nuevo recorrido WebGL completo, Blender ni una prueba en teléfonos físicos en esta sesión. No se atribuyen FPS reales ni causas geométricas exactas a partir de imágenes aisladas. Las causas pendientes están señaladas como hipótesis verificables.

Evidencia CI: [ejecución de QA](https://github.com/berrizjuane-collab/boeing-747/actions/runs/33666697588), [job de screenshots](https://github.com/berrizjuane-collab/boeing-747/actions/runs/33666697588/job/100370498936), [workflow de Pages](https://github.com/berrizjuane-collab/boeing-747/actions/runs/33666697616).

### 1.2 Arquitectura que debe conservarse y corregirse

| Sistema | Implementación actual | Consecuencia para esta ronda |
|---|---|---|
| Narrativa | S1 0–12 %, S2 12–28 %, S3 28–42 %, S4 42–50 %, S5 50–82 %, S6 82–95 %, S7 95–100 % | Los límites viven en `sections.ts`; sus duraciones pueden revisarse justificadamente si la coreografía lo exige. |
| Entrada | Lenis → ScrollTrigger → Zustand | Hay un estado derivado común, pero no un contrato explícito de frame renderizado ni suavizado efectivo del progreso. |
| Cámara | `cameraPath.ts`: Catmull-Rom global, arco precalculado, bandas y pausas; `CameraRig`: parallax y oscilación temporal | Continuidad de posición no equivale a velocidad confortable, ausencia de colisiones ni sincronización con DOM. |
| Avión | Exterior animado hasta S2; inmóvil en pose de vuelo desde S3 | El movimiento aparente posterior lo produce la cámara. No introducir simulación física completa para arreglar el recorrido. |
| Interior | GLB propio fijo en mundo, montado en S4–S6, materiales parcheados al montar | Registro, ownership de recursos y granularidad de culling requieren revisión conjunta. |
| Ambiente | HDRI visibles mezclados, IBL seleccionada por sección, luces/exposición/grading por progreso | Varias curvas y cambios discretos pueden producir discontinuidades aunque la cámara sea continua. |
| Entorno terrestre | Terreno con fade 28–30,5 %; aeropuerto/bosque/pasto bajo corte de grupo al 30,5 % | El mundo desaparece por guion, no por distancia o una transición ambiental completa. |
| QA | Pruebas de funciones, capturas con esperas fijas, vídeo Low por saltos de scroll | Falta relacionar input, estado, frame GPU y DOM; la cobertura dinámica y de retorno es insuficiente. |

## 2. Registro de hallazgos

Etiquetas: **C** = confirmado en código/binario/log; **V** = visible en captura versionada; **H** = hipótesis cuya causa exacta debe reproducirse. P0 bloquea una validación fiable; P1 afecta el recorrido o la geometría; P2 afecta acabado/rendimiento/usabilidad. Los IDs se usarán en `progress6.md`, commits y evidencia.

| ID | Prioridad / certeza | Hallazgo y evidencia | Acción principal |
|---|---|---|---|
| A01 | P0 / C | El QA de capturas del SHA base falla en `setQuality`. `visual-qa.mjs` usa esperas de 55 s y 10 s, cambia tiers recorriendo estados y sólo escribe el informe al final. Un fallo temprano pierde diagnóstico. | Instrumentar readiness, selección de tier y captura atómica; informes parciales en `finally`. Separar bloqueo de runner y defecto del producto. |
| A02 | P0 / V+C | Los nombres de screenshots no prueban su estado. `after-05a-cockpit.jpg` aún dice «Cruzando el umbral»; `after-05c-stair.jpg` dice Economy; `after-05d-upper.jpg` dice Escalera; `after-06b-exit.jpg` muestra Piso superior sobre cielo sin avión. El store puro sí pasa sus pruebas. | Reproducir y distinguir desincronización real, captura anticipada y procedencia incorrecta. No cambiar la lógica de zonas a ciegas ni aceptar estas imágenes como cierre. |
| A03 | P1 / C | `scrollController.ts` entrega `self.progress` desde `ScrollTrigger.create` sin animación asociada. En GSAP instalado, el scrub suaviza la animación asociada, no esa lectura. Los comentarios prometen un retraso de 1 s que este mecanismo no garantiza; Lenis aporta suavizado propio sólo en el camino normal. | Definir un único progreso presentado, con comportamiento explícito ante rueda, touch, scrollbar, navegación y reduced motion. |
| A04 | P1 / C+H | Bandas cortas con grandes desplazamientos/giros; el easing frena en cada banda con rampas de sólo 2 %. Las pruebas muestrean Δprogress=0,001, no input/tiempo reales. Véase §2.1. | Rediseñar ritmo y orientación, comprobar velocidades/aceleraciones y excursiones de la spline; mantener pausas sólo donde tienen intención narrativa. |
| A05 | P1 / C | `CameraRig.tsx:80–89` activa/desactiva la oscilación con un booleano al 50/82 %, sin envolvente. Oscila también cuando el usuario está quieto. `ExteriorAsset` introduce jitter al entrar en S2; el parallax recibe pointer crudo. | Atenuar por velocidad y proximidad al límite, suavizar pointer con delta y hacer reproducible el tiempo de QA. |
| A06 | P1 / C+H | `SceneCanvas.tsx` registra varios consumidores de cámara antes de `CameraRig`, todos con prioridad por defecto; LOD, luces y terreno pueden leer la pose anterior. DOM y WebGL se actualizan por vías distintas. | Orden explícito de actualización: progreso → pose/cámara → dependientes → render → medición. Confirmar desfase con contador de frame. |
| A07 | P1 / C+H | El interior cacheado conserva `surfaceUpgraded`; su kit de texturas se destruye al desmontar y el siguiente montaje crea otro kit, pero no lo vuelve a asignar a los materiales ya marcados (`InteriorAsset.tsx:55–62,83–92`). | Hacer coherente la vida de escena/materiales/texturas. Verificar retorno S7→S5 y S3→S5, StrictMode y memoria; no asumir que `dispose()` siempre causa una imagen negra, pues puede haber reupload. |
| A08 | P1 / C | El LOD desvanece todos los meshes por distancia al centro de su Box3, incluidos suelo, techo y lotes de 240 asientos; además fuerza `transparent=true` a toda la cabina. El GLB une materiales de zonas distintas: `Cockpit_Ceiling` abarca 58 m longitudinales, no sólo cockpit. | Culling por zona/lote espacial; carcasa opaca persistente; fade sólo de detalle apropiado. No tratar un lote completo como una fila lejana. |
| A09 | P1 / V+H | `after-05d-upper.jpg` presenta grandes superficies cortando la cabina, vacíos y caras superpuestas. El exterior se inclina con FLYING_POSE (−3°) y el interior usa una traslación independiente fija. El registro histórico por bounds no demuestra contención en el fuselaje real. | Aislar hull/interior/LOD, localizar las caras invasoras y corregir registro/topología. Causa exacta pendiente; no tapar con niebla ni ocultar el hull completo. |
| A10 | P1 / V+C | Cockpit construido mirando hacia +Z (cola): panel en z=6,38 y ventanas en z=6,62, con el pasillo de pasajeros detrás, visible en `after-05a-cockpit.jpg`. La cámara entra por nariz mirando hacia cola. | Rediseñar el pequeño recorrido de cockpit y su orientación; controles hacia nariz y acceso a pasajeros separado. Conservar el cruce narrativo sin convertirlo en una cabina de mando invertida. |
| A11 | P1 / C+V | `interior_blockout.py` genera economy 3+3 y upper 2+2, un pasillo; `content.ts` anuncia 3-4-3 y 2-4-2 y «anchura real». El layout histórico se declara recreación, no réplica. | Alinear geometría y relato. Objetivo preferido: doble pasillo legible en ambas cubiertas y ruta por un pasillo real; si se mantiene simplificación, declararla y retirar la promesa visual incompatible. |
| A12 | P1 / C+H | `InteriorLoadGuardrail` considera cargado el interior si `useProgress.item` tiene su URL; drei actualiza `item` tanto en `onStart` como en `onProgress`. No certifica parseo, materiales o primer render. `stop()` después de cruzar el límite tampoco recorta el progreso ya aplicado. | Estado explícito requested/decoded/prepared/ready/error; hold antes del punto seguro y reanudación al objetivo pendiente; error recuperable. |
| A13 | P1 / C | `RunwayEnvironment.tsx:405` apaga el grupo terrestre al 30,5 %; `groundFade` elimina el suelo entre 28–30,5 %. Es trabajo pendiente de plan3 E, intacto en plan5. | Persistencia del mundo por escala/distancia y transición de altitud; conservar pista y referencia espacial cuando el encuadre las muestra. |
| A14 | P1 / C+H | `PostFX` monta/desmonta DoF y GodRays por índice, sin rampa. `hdriTheme` conmuta IBL discretamente aunque el cielo mezcle texturas. `InteriorLighting` también escribe `scene.environment`. | Curvas continuas de efecto y propietario único de IBL; comprobar reflejos y retorno entre secciones, no sólo valor no nulo. |
| A15 | P2 / V+C | Haces de cabina son planos aditivos DoubleSide, visibles como bandas triangulares duras en economy/stair/upper. El hero y la cabina tienen zonas lavadas por luz/bruma/bloom. | Iluminación base primero; shafts suaves con límites espaciales y menor contribución. Calibrar highlight/contraste por región. |
| A16 | P2 / V+C | Paneles muy altos, títulos con una palabra por línea y «transició/n» partido en la captura upper. `overflow-wrap:anywhere` y título hasta 3,5rem dentro de un tercio con padding grande explican el problema de composición. | Tamaño según ancho disponible, textos más breves, paneles compactos y pruebas de viewport/zoom. |
| A17 | P2 / C+H | Generación procedural síncrona dentro de `useMemo` al cambiar tier; terreno high/mid tiene igual resolución y se vuelve a generar igualmente. `progress4` midió 738 ms para terreno; es evidencia histórica, no tiempo medido ahora. Cabina crea 900 motas sin consultar `particlesPct` y no declara limpieza de sus recursos propios. | Cachear por resolución/configuración, preparar antes de revelar, medir tareas largas y revisar disposición/tiers. |
| A18 | P1 / C | El workflow de Pages sólo depende de build, no de QA; el mismo SHA tiene Pages workflow verde y QA rojo. Éxito del workflow no prueba por sí solo que el job deploy privado se ejecutara. | Hacer que una publicación dependa de validación del mismo SHA y dejar explícitas las condiciones del repo privado. |
| A19 | P2 / C+H | Exterior usa fuente con UV solapadas/degeneradas documentadas; añadir roughness/normal procedural no demuestra corrección de UV. Tren se mueve con `gear.position.y` en una jerarquía con conversiones de ejes, luego desaparece; no hay rig articulado. | Auditar ejes/pivotes del GLB final, seams, normals y detalle de primer plano; animación mecánicamente plausible y test de contorno al ocultar tren. |

### 2.1 Medición de cámara: continuidad no implica suavidad perceptual

Medido ejecutando `sampleCamera` del SHA base. Distancia = cuerda entre extremos, no longitud total de la spline. Giro = ángulo entre direcciones de mirada, no trayectoria angular acumulada. Píxeles = estimación geométrica para viewport de 900 px y pista de scroll de 800vh, aproximadamente 6300 px desplazables; no es telemetría de usuario.

| Intervalo global | Distancia mínima entre extremos | Giro entre miradas | Scroll aproximado |
|---|---:|---:|---:|
| 30–37,8 % | 194,91 u | 97,40° | 491,4 px |
| 37,8–42 % | 107,69 u | 1,33° | 264,6 px |
| 83–83,5 % | 7,71 u | 13,79° | 31,5 px |
| 83,5–88 % | 113,31 u | 114,88° | 283,5 px |

La suite actual permite hasta 3 u de posición y 3° de dirección por paso de 0,001. Pasó con máximos de 2,652 u y 2,815°. Esto no mide Δtiempo, aceleración, jerk, desplazamiento en pantalla, colisión, frames omitidos ni cuánto scroll consume realmente una rueda/gesto. Tampoco incluye parallax, oscilación, efectos o montaje de assets.

### 2.2 Evidencia visual que debe rehacerse

Las siguientes rutas ya existen en `docs/evidence/round5/` y son comparadores de partida, no ejemplos aprobados:

- `after-01-hero.jpg`: avión con pérdida de contraste en superficies claras, pasto de siluetas repetidas y paisaje muy lavado.
- `after-05a-cockpit.jpg`: panel orientado hacia pasajeros y etiqueta de umbral persistente.
- `after-05b-economy.jpg`: haces geométricos invasivos, panel enorme y discrepancia 3+3 frente a 3-4-3.
- `after-05c-stair.jpg`: imagen de escalera con panel Economy.
- `after-05d-upper.jpg`: geometría que atraviesa el espacio habitable, panel Escalera y palabra partida.
- `after-06b-exit.jpg`: cielo sin sujeto, panel Piso superior; no satisface una prueba de salida limpia.

No se da por probado que todas las etiquetas incorrectas sean un bug del store: podría existir retraso del DOM, del render o de la captura. El arnés debe resolver esa ambigüedad antes de reparar el subsistema equivocado.

## 3. Decisiones de implementación

1. **Conservar la arquitectura útil.** React/R3F, assets locales, secciones, tiers, semilla determinista y pipeline Blender/glTF siguen siendo la base.
2. **Un estado presentado por frame.** Input objetivo y progreso mostrado serán conceptos explícitos. Cámara, avión, ambiente, puertas y zonas derivarán del mismo progreso presentado. El DOM puede actualizar sólo cambios discretos, pero se verificará contra el frame correspondiente.
3. **Un marco espacial del avión.** Definir transformación canónica y matrices local→mundo para exterior, interior, portales, anclas y luces. Exportar anclas/zonas desde Blender en metadata o un manifiesto; eliminar coordenadas duplicadas a mano conforme se migren. No corregir pieza por pieza con offsets arbitrarios.
4. **Conservar opacidad de la estructura.** Suelo, techo, paredes y marcos que delimitan el interior no se desvanecerán por distancia al centro de un batch. Instancing/fusión por material debe respetar zonas espaciales y necesidades del recorrido.
5. **Coreografiar antes de decorar.** Resolver cockpit, pasillos, escalera, salida y distancia al hull en una vista de diagnóstico neutra. Después ajustar materiales, haze, DoF y bloom.
6. **Evidencia ligada al SHA.** Capturas, vídeo, trazas y mediciones llevarán commit, versiones, viewport, DPR, tier real, tiempo de simulación y progreso realmente renderizado. Nunca etiquetar una imagen por el porcentaje solicitado sin comprobarlo.
7. **Cambiar criterios sólo con motivo.** Se pueden reemplazar tests que codifican una decisión incorrecta (por ejemplo apagar el suelo al 30,5 %); registrar el requisito que sustituye esa expectativa. No aumentar presupuestos o tolerancias sólo para obtener verde.
8. **Reabrir lo necesario.** Las exclusiones de alcance de plan5 («no tocar cámara/iluminación/puerta 30,5 %») eran de esa ronda y no impiden esta reparación solicitada por el usuario.

## 4. Fases, tareas y condiciones de salida

Todas las casillas están pendientes. Un tamaño S/M/L indica alcance relativo, no una promesa de duración. Un commit debe resolver un grupo coherente de problemas y aportar su evidencia; no mezclar ajustes sistémicos con decoración sin relación.

### Fase 0 — Baseline reproducible y diagnóstico temporal (P0, M)

**Depende de:** nada. **Cubre:** A01, A02 y base de A04/A06/A18.

- [ ] 0.1 Obtener clon completo del SHA actual, comprobar si difiere de la base auditada y anotar diferencias relevantes. Instalar con lockfile; verificar Chromium, Blender, Draco/KTX y ffmpeg cuando corresponda. No confundir la copia textual de esta auditoría con un checkout completo.
- [ ] 0.2 Reproducir el fallo CI de `setQuality`: registrar duración de eventos, tareas largas, tier anterior/nuevo, compilación y frames presentados. Separar test funcional del botón de la selección determinista de tier para capturas. No solventarlo únicamente con `force:true` o aumentando timeout.
- [ ] 0.3 Añadir un snapshot de diagnóstico: `frameId`, timestamp/delta, progreso objetivo/presentado, sección/zona, cámara (posición/quaternion/FOV), pose del avión, tier/DPR, recursos listos, portales, LOD relevante, exposición/IBL/efectos y contadores de recursos. Publicarlo después del render; asociar por separado el estado DOM observado al mismo ciclo.
- [ ] 0.4 Sustituir readiness basado sólo en segundos por estado verificable: assets resueltos, preparación de materiales terminada, primer frame completo, tier estabilizado y convergencia de progreso. Mantener timeout superior con informe explicativo.
- [ ] 0.5 Guardar resultado parcial incluso ante excepción, con error, última acción, screenshot diagnóstico si es posible y eventos previos. Exigir cantidad esperada de capturas; un archivo de log no cuenta como evidencia visual.
- [ ] 0.6 Crear baseline nuevo: imágenes compuestas y canvas sin overlays, clips continuos en ambas direcciones y trazas. Congelar semilla/pointer/reloj en capturas estáticas; ejecutar pruebas dinámicas independientes con reloj real.
- [ ] 0.7 Crear `progress6.md`, índice de evidencias por Axx y matriz de cobertura con estados reproducido/hipótesis/corregido/verificado/bloqueado.

**Salida:** capturas solicitadas y estado renderizado coinciden; cockpit/economy/stair/upper/exit tienen su panel correcto o ausencia intencional durante tránsito. Se conoce por qué fallaba CI. Queda una lista reproducible de defectos antes de modificar el look. Si el runner no permite High, dejar ese gate bloqueado y continuar tareas independientes; no reemplazar silenciosamente High por Low.

### Fase 1 — Estado, carga y ciclo de vida (P1, M)

**Depende de:** F0. **Cubre:** A03, A06, A07, A12, parte A17.

Archivos principales: `scrollController.ts`, `scrollStore.ts`, `SceneCanvas.tsx`, `CameraRig.tsx`, `InteriorAsset.tsx`, `InteriorLoadGuardrail.tsx`, `LoadingScreen.tsx`, `interiorLoadState.ts`, `interiorMaterials.ts`.

- [ ] 1.1 Elegir una sola etapa de suavizado narrativo explícito: tween asociado a progreso o integrador basado en delta. Evitar duplicar filtros que retrasen toda interacción. Documentar rueda, gesto rápido, scrollbar, salto programático y scroll inverso. El delta largo al volver de otra pestaña no debe producir un avance descontrolado.
- [ ] 1.2 Aplicar orden de frame mediante prioridades compatibles con el render del composer; actualizar matrices antes de consumidores geométricos. No usar una prioridad positiva de R3F accidentalmente para desactivar el render automático.
- [ ] 1.3 Resolver ownership del interior: o caché estable de escena+materiales+kit con vida conjunta, o escena/materiales propios de cada instancia con limpieza simétrica. En cualquier opción, el remount debe reusar recursos vivos o reasignar los nuevos; `surfaceUpgraded` no puede impedirlo.
- [ ] 1.4 Separar descarga de preparación. Marcar ready desde la resolución y preparación reales, no desde la última URL de LoadingManager. Diseñar error/reintento o fallback coherente. Coordinar locks de S0 y cabina para que un `start()` no libere el bloqueo de otro motivo.
- [ ] 1.5 Hacer que el guardarraíl preserve el objetivo pendiente pero limite el progreso presentado antes del umbral seguro. Cubrir navegación directa a S5/S6 con red lenta, recarga con scroll restaurado y error de interior.
- [ ] 1.6 Limpiar materiales/geometrías/texturas propios de `CabinAtmosphere`, sin destruir los compartidos por caché. Probar StrictMode de desarrollo y build de producción por separado.

**Salida:** diez ciclos S1→S5→S7→S5→S1 no provocan pérdida de materiales, nuevos parones reiterados de preparación ni crecimiento continuo de recursos tras warm-up. Se conserva la misma escena a igual progreso/tiempo de simulación independientemente del sentido de llegada. Red lenta/error no revela una cabina vacía ni deja scroll bloqueado sin salida.

### Fase 2 — Registro y reconstrucción del interior (P1, L)

**Depende de:** F0–F1. **Cubre:** A08–A11 y geometría de A19.

Archivos principales: `blender/interior_blockout.py`, `register_interior.py`, `verify_registration.py`, `verify_blockout.py`, `scripts/process-glb.mjs`, `verify-interior-glb.mjs`, `sceneLayout.ts`, `InteriorAsset.tsx`, `thresholdPortals.ts`, `INTERIOR_LAYOUT.md`.

- [ ] 2.1 Crear vistas de diagnóstico con hull solo/interior solo/ambos, wireframe y materiales por zona. Inspeccionar upper en el GLB final, no sólo en el BLEND. Identificar los triángulos que invaden el pasillo antes de decidir entre registro, topología, normal, transparencia o LOD.
- [ ] 2.2 Unificar ejes, escala, pivote y transformación de vuelo. Exportar anclas de piso, puerta, pasillos, escalera y ventanas. Validar contención mediante secciones transversales del fuselaje y volúmenes habitables; una caja envolvente global no basta.
- [ ] 2.3 Reconstruir cockpit orientado hacia nariz: posición del instrumental, parabrisas, asientos/pedestal y puerta posterior. Autorizar un giro suave de cámara dentro de un volumen libre para mostrar controles y luego salir al pasillo. No colocar ventanas de cielo delante de la cabina de pasajeros para simular el parabrisas.
- [ ] 2.4 Resolver disposición de asientos y dos pasillos. Para el objetivo 3-4-3 / 2-4-2, recalcular anchos de asiento, bloques, pasillos, laterales y separación de decks desde referencias verificadas al ejecutar. El número total de instancias puede cambiar; actualizar presupuesto y pruebas semánticas con motivo, no mantener 240 por costumbre.
- [ ] 2.5 Modelar secciones curvas de paredes/techo, compartimientos, juntas y marcos con escala consistente. Revisar normales, caras internas, duplicados, superficies coplanares, cierre de escaleras y unión de descansos. Priorizar silueta y volumen antes de microdetalle.
- [ ] 2.6 Corregir upper y salida: puerta practicable alineada con el portal exterior, headroom suficiente y ningún techo/ala/casco atravesando la zona recorrida. Mantener el shell exterior visible donde corresponde.
- [ ] 2.7 Cambiar batching a lotes por zona/material o bloques de filas; preservar IDs/anchors útiles como datos reales del runtime. Un listado de nombres originales en extras no sustituye la separación espacial que necesita el LOD.
- [ ] 2.8 Mantener estructura opaca. Para filas/detalles lejanos elegir culling por bloque o fade compatible con profundidad (por ejemplo dither) con transición probada. Calcular distancia al volumen/lote pertinente, no al centro de una malla de 58 m.
- [ ] 2.9 Reexportar, comprimir y reimportar GLB; comparar bounds, matrices, normals, instancing, materiales, nombres/IDs, colisiones y vistas con el BLEND. Conservar fuente y comandos reproducibles.

**Salida:** vistas de cockpit, economy, escalera, upper y puertas coherentes; cero intrusiones estructurales en el volumen de cámara. Se propone cápsula de cámara con radio 0,18 m y margen 0,05 m para la validación inicial, ajustable antes de aceptar la ruta por la escala final. No atraviesa paredes, peldaños o asientos; ojo y near plane tienen espacio. La geometría mostrada y sus datos narrativos coinciden. Las capturas upper no contienen los grandes polígonos invasores de round5.

### Fase 3 — Coreografía de cámara y avión (P1, L)

**Depende de:** F1–F2. **Cubre:** A04–A06, A10 y A19.

Archivos principales: `cameraPath.ts`, `CameraRig.tsx`, `aircraftPose.ts`, `ExteriorAsset.tsx`, `sections.ts`, `thresholdPortals.ts`, tests de continuidad.

- [ ] 3.1 Definir una hoja de planos con intención, sujeto, encuadre, ruta física, velocidad y duración en scroll. Distinguir avance normal, pausa editorial, giro y retirada. No fijar primero keyframes numéricos y adaptar después el espacio a ellos.
- [ ] 3.2 Reautorizar S2/S3 y S6: evitar orbitas/cambios de sentido apresurados y dejar al avión visible durante la retirada. Revisar especialmente 30–42 % y 82–88 %. Distribuir scroll por longitud/rotación/dificultad del tramo, no sólo por número de keyframes.
- [ ] 3.3 Elegir tramos de spline acotados en el interior, con tangentes controladas y rutas dentro del volumen libre. Evitar que keyframes exteriores lejanos deformen el tramo de puerta por Catmull-Rom global. Medir la curva completa, no sólo las anclas.
- [ ] 3.4 Continuidad C0 y C1 en empalmes de movimiento; controlar aceleración donde sea visible. La velocidad cero será deliberada en pausas, no una consecuencia obligatoria de cada banda. Orientación por quaternion/camino de mirada estable, sin flips ni inversión inesperada al retroceder.
- [ ] 3.5 Añadir envolventes a caminar/vibración/parallax, dependientes de avance y delta. Quieto en una pausa no debe parecer que el usuario camina. Reduced motion anula estas capas y mantiene un recorrido alternativo coherente.
- [ ] 3.6 Revisar despegue y tren en coordenadas reales del asset: rodaje, elevación y pitch coherentes, contacto inicial, pivotes, retracción y contorno final. Si el modelo no permite articulación, documentar una simplificación discreta y plausible, sin trasladar ruedas por el eje incorrecto o esconderlas aún expuestas.
- [ ] 3.7 Verificar cámara final con landmarks proyectados en pantalla (puerta, fila, nariz/alas), no sólo distancia mundial. Conservar composición al cambiar aspect ratio sin estirar el avión ni cortar el sujeto de forma involuntaria.

**Salida:** recorridos completos adelante/atrás a 30/60/120 Hz simulados y entradas lentas/rápidas; mismos resultados finales al mismo progreso. Trazas de posición/quaternion/FOV y sus derivadas en todos los empalmes, sin discontinuidad no autorada. Umbrales iniciales: error C0 de posición ≤1e-4 u y orientación/FOV ≤0,01° evaluado por límites del interpolador; comparar velocidades laterales con tolerancia relativa declarada antes del ajuste. Esas comprobaciones se complementan con vídeo: no bastan para declarar fluidez. Navegación rápida puede necesitar una transición específica, pero no atravesar de golpe el interior mostrando geometría rota.

### Fase 4 — Portales, persistencia del mundo y transiciones de luz (P1, L)

**Depende de:** F2–F3. **Cubre:** A09, A13, A14 y A15.

Archivos principales: `RunwayEnvironment.tsx`, `TerrainGround.tsx`, `terrainGroundCurves.ts`, `EnvironmentPlaceholder.tsx`, `hdriTheme.ts`, `InteriorLighting.tsx`, `PostFX.tsx`, `ThresholdFrame.tsx`, `dissolveHullMaterial.ts`, `thresholdLighting.ts`.

- [ ] 4.1 Eliminar el corte global del aeropuerto al 30,5 %. Definir visibilidad para pista, edificios, vegetación, sombra, polvo y terreno por escala/distancia y fase. No reactivar sombra de contacto cuando el avión está en vuelo.
- [ ] 4.2 Recuperar plan3 E: pista identificable desde altura en S3/S6 cuando el encuadre lo permite, horizonte continuo y transición a nubes que explique la desaparición del suelo. No agregar un segundo aeropuerto que no coincida con el primero.
- [ ] 4.3 Unificar control de IBL para golden/high/cabin/sunset y su retorno. Elegir blend de probes compatible con presupuesto o transición visual deliberada de intensidad/materiales; evitar cambio de reflejo instantáneo mientras el cielo se mezcla lentamente. Probar S6→S5 y S4→S3 además del avance.
- [ ] 4.4 Preparar efectos antes de que sean visibles y rampas para DoF/GodRays. Foco según distancia del sujeto de cada plano; un foco fijo de 6 u no es automáticamente correcto en cada escalera/puerta. Evitar reconstruir el composer durante un cruce crítico si causa hitch.
- [ ] 4.5 Derivar apertura/cierre de portal del cruce físico y holgura del frustum. Abrir antes del contacto, cerrar cuando cámara y near plane estén libres; simetría al retroceder. Eliminar anillos suspendidos y huecos que exponen geometría incompleta.
- [ ] 4.6 Revisar near/far y profundidad sin agrandar far para esconder el borde del mundo; resolver z-fighting en geometría y offsets controlados. Comprobar recentrado del terreno sin saltos visibles de malla.

**Salida:** barrido denso alrededor de 28–31 %, 40–52 %, 79–88 % y 94–96 %, con imágenes del frame anterior/durante/posterior y película continua. Sin desaparición instantánea del mundo, fog/exposición/reflectancia que salten, interior incompleto ni fotograma de cielo sin sujeto en una salida que debe mostrar el avión. Tener `scene.environment !== null` sigue siendo necesario pero insuficiente.

### Fase 5 — Materiales, luz, exterior y entorno (P2, L)

**Depende de:** F2–F4. **Cubre:** A15, A19 y calidad visual general.

- [ ] 5.1 Fijar referencias de acabado por plano: exterior de avión a golden hour, cockpit, doble pasillo, escalera y sunset. Registrar qué se reproduce y qué se estiliza; respetar atribución del asset existente.
- [ ] 5.2 Inspeccionar exterior en primer plano: contorno de nariz, motores, alas, estabilizadores, tren, seams de albedo, normales y UV. Reparar/retopologizar/bakear sólo las zonas necesarias; si el asset limita irremediablemente los planos requeridos, evaluar sustitución como decisión separada con licencia y coste documentados.
- [ ] 5.3 Calibrar luz sin bloom/DoF/shafts primero. Mantener contraste entre avión y fondo y detalle de pintura clara. Reintroducir efectos uno por uno con comparación A/B; el humo/brillo no debe ocultar errores de modelado.
- [ ] 5.4 Sustituir haces triangulares evidentes por aproximación suave y espacialmente limitada: borde/final atenuados, respuesta a ángulo y profundidad, o eliminarlos en planos donde el recurso no se sostiene. Ventanas con vista coherente con altura/hora y dirección; evitar el mismo «cuadro de cielo» pegado en todas.
- [ ] 5.5 Materiales a escala: tela fina, alfombra sin apariencia de grava, plásticos con roughness apropiada, metal sin brillo uniforme, pantallas legibles y orientadas correctamente. Validar UV del GLB optimizado; atlas por bounding box del batch no equivale a una textura por pantalla.
- [ ] 5.6 Afinar vegetación por silueta/distancia: el primer plano necesita más credibilidad que los árboles lejanos. Reducir repetición, revisar grosor/altura/color del pasto y relación con suelo. Mantener exclusiones del aeropuerto y correspondencia de máscara.
- [ ] 5.7 Aeropuerto: arquitectura legible, mangas/terminal/hangares coherentes en planta, marcas y luces bien situadas. Reconciliar numeración/PAPI/consolidación pendientes de plan3 D; no declararlos resueltos sólo por existir luces y hangares nuevos.
- [ ] 5.8 Cerrar plan3 F1/F3/F4 con nubes de volumen aparente suficiente, sol/glare controlado y composición de salida. Priorizar una imagen estable y legible frente a cantidad de efectos.

**Salida:** comparación antes/después con igual cámara, tier, exposición base documentada y tiempo. Hero: mantener gate existente de blancos recortados <2 %, pero añadir regiones de fuselaje/cielo separadas. No «aprobar» una imagen lavada sólo porque ningún píxel llegue a blanco puro. Revisar visualmente bordes de haces, reflejos, repetición, ventanas y acabados a resolución nativa.

### Fase 6 — Narrativa, composición adaptable y accesibilidad (P2, M)

**Depende de:** F3; acabado final después de F5. **Cubre:** A02, A11, A16.

Archivos: `content.ts`, `NarrativeOverlay.tsx`, `InteriorOverlay.tsx`, `index.css`, `Hotspots.tsx`, `SiteNav.tsx`, `ReducedMotionCrossfade.tsx`, `StaticFallback.tsx`.

- [ ] 6.1 Sincronizar zonas visibles con el progreso presentado. Diseñar fade de paneles para que el texto anterior no permanezca legible encima del siguiente plano; no inferir visibilidad de `data-active` sin mirar opacity/captura real.
- [ ] 6.2 Reducir títulos a frases útiles al visitante, sin texto que describa cómo está construido el plano. Ajustar tipografía al ancho del panel, no sólo al viewport. Eliminar cortes arbitrarios dentro de palabras ordinarias.
- [ ] 6.3 Evitar tarjetas que oculten pasillo, cockpit o avión; asignar áreas seguras por plano y adaptar en vertical/landscape. Validar 390×844, 844×390, 768×1024, 1440×900 y zoom de texto 200 % sin recorte inaccesible.
- [ ] 6.4 Actualizar cifras/etiquetas al modelo final, distinguir datos del A380 de la simplificación visual y conservar fuentes/créditos. Retirar «anchura real» si no está representada.
- [ ] 6.5 Hotspots registrados al asset, sin aparecer detrás de paredes ni pertenecer a la zona anterior. Teclado/foco predecibles; contenido invisible no recibe interacción accidental. Mantener narrativa accesible completa mediante una solución explícita, no sólo opacidad cero.
- [ ] 6.6 Reduced motion real: secciones legibles y transiciones discretas controladas, sin largos vuelos de cámara ocultos parcialmente por un crossfade de duración fija. Probar cambios de preferencia durante la sesión y fallback sin WebGL.

**Salida:** texto completo legible y acorde a la escena, una narrativa activa intencional por estado, sin mezcla de capas durante pausas, foco perdido ni paneles que bloqueen el contenido principal. Contraste medido sobre texto/fondo apropiados, no sólo percentiles del panel completo.

### Fase 7 — Rendimiento y estabilidad del recorrido (P1/P2, M–L)

**Depende de:** F1 y una versión visual estable de F2–F6. **Cubre:** A01, A07, A17.

- [ ] 7.1 Medir CPU, frame time p50/p95/p99, tareas largas, compilación, texturas/targets y draw calls en recorrido completo. Separar cold start, primera entrada y navegación caliente; SwiftShader valida funcionamiento, no FPS en GPU física.
- [ ] 7.2 Cachear texturas por resolución/parámetros (high→mid con igual tamaño no regenera), preparar conjuntos durante carga, y mover trabajo pesado a bake/worker/tareas repartidas cuando la medición lo justifique. No cambiar algoritmos de textura sin comprobar determinismo y costuras.
- [ ] 7.3 Evitar preparación PMREM, geometría o shaders durante un cruce visible; mantener memoria bajo control con ownership explícito. Reducir asignaciones por frame de `sampleCamera`/luces sólo si el perfil muestra presión real de GC.
- [ ] 7.4 Aplicar tiers a polvo/shafts/vegetación/luces y antialiasing. Low conserva las formas y continuidad esenciales. Investigar una solución de AA barata si el contorno parpadea; no asumir que `Canvas antialias` funciona en el framebuffer del composer.
- [ ] 7.5 Autoría de LOD espacial y draw calls tras reconstrucción; medir worst case, especialmente coexistencia exterior+interior y sombras, no únicamente hero/economy.
- [ ] 7.6 Auto-tier con muestras representativas después del warm-up; respetar siempre selección manual. Cambio de tier no regenera la escena entera ni ocasiona blackout; guardar comparación en el mismo plano.

**Presupuestos que se conservan:** High <250 draw calls y <1,5 M tris visibles; Mid <150 / <800 k; Low <100 / <500 k. Conservar métricas de triángulos enviados aparte. Presupuestos históricos de VRAM 350/200/120 MB necesitan inventario estimado de recursos con mipmaps/targets; no presentar contadores de texturas como bytes reales de VRAM.

**Salida:** presupuesto cumplido en todo el recorrido y retorno; sin crecimiento sostenido tras diez ciclos; ninguna tarea propia >50 ms durante recorrido caliente en el equipo de referencia elegido (si se incumple, identificar causa y reparar o dejar gate abierto). Objetivo de fluidez: 60 FPS en escritorio objetivo y ≥30 FPS en móvil objetivo con frame pacing estable; reportar equipo, navegador, tier y p95/p99 reales. No certificar teléfonos con UA móvil sobre Chromium de escritorio.

### Fase 8 — Regresión, CI y cierre verificable (P0/P1, M)

**Depende de:** F0–F7. **Cubre:** A18 y aceptación de todos los IDs.

- [ ] 8.1 Integrar pruebas significativas: estado, trayectoria con tiempo/input, colisiones del asset final, round trips de recursos y cambios de tier. Conservar tests útiles actuales y sustituir expectativas obsoletas con trazabilidad.
- [ ] 8.2 Automatizar captura densa en intervalos críticos y escaneo completo adelante/atrás, además de imágenes editoriales fijas. Separar comparación determinista y prueba interactiva real. El vídeo debe cubrir 0–100 % sin omitir tramos y también retorno; hoy salta de 30 a 38 % y de 56 a 58 %, y se ejecuta sólo en Low.
- [ ] 8.3 Corregir métricas de horizonte: ROI/máscaras excluyen DOM, avión y edificios; `progress5` ya admite que la medición antigua tomaba el borde del panel. No usar aumento indiscriminado de energía de bordes como sinónimo de realismo.
- [ ] 8.4 Hacer fallar QA si faltan datos de performance/tier/frame o archivos esperados, no sólo cuando un contador presente supera su límite. Conservar reportes de fallos y errores de red/shader.
- [ ] 8.5 Conectar despliegue y QA del mismo SHA mediante jobs dependientes/workflow reutilizable o mecanismo equivalente que no publique una revisión diferente de la validada. Mantener las condiciones privadas de Pages; los commits exclusivamente documentales pueden omitir publicación sin cambiar el sitio.
- [ ] 8.6 Guardar evidencia selecta y un manifiesto de procedencia en `docs/evidence/round6/`; vídeo/trazas extensas en artefactos CI con política de conservación explícita. No enlazar sólo rutas temporales expirables como única prueba de cierre.
- [ ] 8.7 Revisar el resultado a resolución nativa y en movimiento. Actualizar README, `INTERIOR_LAYOUT.md`, `ASSET_AUDIT.md` cuando cambie el asset y `progress6.md` con lo realmente verificado. No reescribir el historial para hacerlo parecer coherente retrospectivamente.

**Salida:** QA completo verde en el SHA final, matriz de hardware marcada con sus límites, todas las incidencias P0/P1 cerradas con reproducción antes/después, y revisión visual sin los defectos de §2.2. Un vídeo que alcanza los créditos no es una aprobación del recorrido.

## 5. Matriz mínima de reproducción

| Prueba | Recorrido/estado | Qué debe registrar |
|---|---|---|
| Capturas editoriales | 0,01; 0,13; 0,19; 0,27; 0,30; 0,36; 0,47; 0,515; 0,60; 0,715; 0,795; 0,83; 0,86; 0,88; 0,92; 0,97 | Tier real, progreso/frame reales, cámara, zona, DOM, canvas, imagen compuesta. Actualizar puntos si cambia la coreografía; conservar equivalencias semánticas. |
| Límites | Todos los límites de sección, dwell, portal, LOD y efecto; muestras a ambos lados y en el punto | Posición/orientación, velocidad, visibilidad, luz, pixel diff con máscaras y ruido controlado. |
| Scroll continuo | 0→1 y 1→0 lento/normal/rápido | Vídeo sin saltos introducidos por el capturador; input y frame time correlacionados. |
| Saltos de navegación | S1→S5, S5→S2, S7→S4/S5, ir a S6 directamente | Preparación, locks, recursos, transición deliberada y panel correcto. |
| Remontaje | Diez vueltas S1→S5→S7→S5→S1 | Materiales, texturas, programas y geometrías tras warm-up; igualdad visual de estados equivalentes. |
| Input real | Wheel, trackpad, touch, teclado, scrollbar | Comparar objetivo/presentado; ningún dispositivo depende de un scrub inexistente. |
| Calidad | High/Mid/Low en cada zona y cambio manual allí mismo | Ausencia de blackout, regeneración innecesaria y popping estructural; coste de efectos. |
| Red/errores | Caché fría/caliente, interior retrasado, request fallido | Readiness veraz, retry/fallback y scroll recuperable. |
| Layout | Viewports de F6, resize durante S4/S5/S6, zoom 200 % | Encaje de cámara y texto, foco, ausencia de cortes de palabra y contenido inaccesible. |
| Accesibilidad | Reduced motion al iniciar y cambiarlo; sin WebGL; teclado | Contenido completo y navegación coherente sin vuelo de cámara impuesto. |
| Hardware | Chromium escritorio, Safari/iOS físico, Android físico; Firefox/WebKit cuando disponibles | Bugs de shader/compresión/input, frame pacing y límites explícitos de evidencia. |

## 6. Conciliación con planes anteriores

| Antecedente | Tratamiento en ronda 6 |
|---|---|
| PLAN/PROGRESS, ronda inicial | Conservar arco narrativo, stack, atribución, accesibilidad y presupuestos; las marcas de «final» no prevalecen sobre defectos observados. |
| plan2 B1/B2 | Mantener sus pruebas de estado y continuidad como suelo mínimo; ampliar a render, input real, retorno, colisiones y derivados temporales. |
| plan3 C y plan4 G/H | Ya sustituidas/extendidas por terreno/bosque de rondas 4–5. Afinar sobre esa base, no rehacer un sistema paralelo. |
| plan3 D | Implementación amplia en ronda 5, pero numeración/PAPI y consolidación exacta no quedan automáticamente cerradas. Revisarlas en F5 con evidencia. |
| plan3 E | El corte 30,5 % sigue presente. F4 asume persistencia y continuidad de mundo; reutilizar `airportLayout.ts`/geometrías actuales en vez de crear duplicados por seguir literalmente un nombre de archivo antiguo. |
| plan3 F | F2 adelantada en plan5; F1/F3/F4 necesitan evaluación actual y cierre visual en F5. |
| plan4 I y métricas | La corrección de horizonte existe, pero el indicador original estuvo contaminado por overlays. Recuperar medición válida en F0/F8. |
| plan5/progress5 | Reutilizar mejoras PBR, bosque y aeropuerto. Reabrir ciclo de vida, cabina, composición y cierre; las imágenes inspeccionadas y QA fallido no respaldan un cierre general. |
| ASSET_AUDIT/INTERIOR_LAYOUT | Son documentación histórica de fuente/registro/blockout; actualizar contratos al reconstruir, sin confundir bounds con fidelidad geométrica. |

## 7. Orden de trabajo y política de progreso

Secuencia principal: **F0 → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8**. La revisión editorial de F6 puede prepararse después de F3; los perfiles de rendimiento se toman desde F0, aunque la optimización final ocurre en F7. Si una fase descubre una dependencia geométrica anterior, volver a ella de forma explícita y repetir sólo los gates afectados.

Primer lote de implementación recomendado: F0 completa y F1, con commits separados para arnés y reparaciones de runtime. Segundo lote: F2/F3, cerrando primero el recorrido espacial del interior. Tercero: mundo/luz y acabado F4–F6. Cuarto: rendimiento, regresión y cierre F7/F8. No declarar el proyecto reparado al terminar sólo el primer lote.

Formato mínimo por entrada de `progress6.md`:

| Campo | Contenido obligatorio |
|---|---|
| ID y fase | Axx y tarea concreta; pendiente/reproducido/en curso/verificado/bloqueado. |
| Reproducción | SHA, dispositivo/renderer, tier, input, intervalo o frame, resultado esperado/actual. |
| Causa | Demostrada o hipótesis; separar defecto de producto y de captura. |
| Cambio | Archivos y por qué resuelve la causa; riesgos de regresión. |
| Evidencia | Comparación antes/después, trazas/tests pertinentes y limitaciones. |
| Siguiente paso | Tarea restante exacta y gate pendiente, sin «todo listo» si falta validación. |

Trabajar y guardar commits en `main` conforme a la preferencia del propietario, sin force push y sin sobrescribir cambios concurrentes. Antes de cada escritura remota revisar el HEAD. El próximo prompt autorizará las correcciones; **este documento no ejecuta ninguna de ellas**.

## 8. Definición de terminado

- [ ] No hay saltos no intencionales de cámara, geometría, luz, efectos o overlays en ida, vuelta y navegación directa.
- [ ] Cockpit, pasillos, escalera, cubierta superior y portales forman un espacio coherente; no hay caras invadiendo el recorrido ni discrepancias engañosas con la información mostrada.
- [ ] El aeropuerto y el terreno no desaparecen por un corte arbitrario visible; el avión sigue siendo un sujeto legible durante la salida.
- [ ] La cabina conserva materiales, estructura y recursos al remontar; el LOD no disuelve el avión por batches enormes.
- [ ] No hay haces poligonales invasivos, tipografía partida o exposición que esconda defectos.
- [ ] Capturas y clips prueban el SHA final y el estado realmente renderizado, con cobertura High/Mid/Low y límites de hardware honestos.
- [ ] Presupuestos y frame pacing verificados; CI no publica un estado que no haya pasado sus gates.
- [ ] README y registro de progreso describen el resultado real y cualquier limitación restante.

**No son criterios de terminado:** «compila», «41 tests pasan», «no hay errores de consola», «está dentro del frustum», «llega al footer» o «añadimos más detalle». Son verificaciones parciales. La aceptación exige que el recorrido completo se vea coherente y que la evidencia lo demuestre.
