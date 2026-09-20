# Ronda 6 — implementación de fases 0, 1 y 2

Fecha: 2026-09-19. Base remota: `b528527a4d187adc0a621e4f462720d8650ca06f`.
Alcance autorizado: primeras tres fases del plan, numeradas **0–2**.
No se declara terminada la experiencia ni las fases posteriores.

## Cambios

| Fase | Implementación | Límite de aceptación |
|---|---|---|
| 0 — Diagnóstico | Tier fijo antes del render, reloj QA, capturas convergentes con/sin DOM, telemetría posterior al composer, hashes de fuentes, errores e informes parciales, matriz CI Low/High/tour. | Falta baseline previo completo comparable y reproducir exactamente el timeout histórico de CI. |
| 1 — Estado/carga/recursos | Input nativo → objetivo → integrador único por frame. Estado real de assets, preparación/compilación interior, retención antes del umbral, recuperación de error y locks independientes. Interior y mapas residentes; probe reutilizable. | Los resultados de navegador se identifican por ejecución, sin atribuir archivos perdidos a esta revisión. |
| 2 — Geometría/registro | Cockpit hacia la nariz, dos pasillos, asientos 3-4-3 / 2-4-2, escalera alineada, techo curvo, puerta practicable y cierre antes de la cola. Manifiesto canónico para todos los consumidores. | Acabado de materiales, iluminación y suavidad percibida continúan en fases posteriores. |

El progreso presentado usa integración exponencial de 0,12 s y delta máximo
0,05 s. Reduced motion presenta directamente el destino. Orden explícito:
progreso −100 → cámara/matrices −80 → avión −70 → consumidores → composer 1
→ telemetría 2. Los atributos DOM se publican mediante suscripción síncrona,
sin esperar al commit React ni forzar commits del árbol R3F durante el render.

S0 espera exterior/entorno preparados y renderizados. La cabina debe tener
texturas subidas y materiales compilados antes de marcarse ready. Si no está
lista, la presentación se retiene como máximo en 0,41 conservando el destino;
error con reintento o retorno al inicio. Fallback inicial sin WebGL disponible.

Se eliminó el bloqueo con overflow:hidden, que podía cambiar el contenedor
de scroll en Chromium y borrar el destino pendiente. Los locks ahora bloquean
gestos/teclas y restituyen el scrollbar; la navegación programática sigue
permitida y liberar un motivo no libera los demás.

El exterior clona su escena y restaura los materiales antes de disponer sus
reemplazos. La cabina mantiene juntos escena/materiales/texturas con vida de
caché. Los siete lotes de asientos pertenecen a zonas/bloques de hasta cinco
filas; estructura opaca, sin fade transparente por centro de batch. Haces
planos desactivados hasta calibración óptica; polvo respeta el tier.

## Geometría y pruebas

- **46/46 pruebas Node**, lint y build pasan. Persiste la advertencia de chunk
  grande (aproximadamente 1,61 MB minificado / 492 kB gzip).
- GLB: **62.516 bytes, 69.129 triángulos, 266 asientos, siete lotes de instancias,
  46 primitivas/lotes**. Antes: 112.724 bytes, aproximadamente 280.312 triángulos,
  240 asientos. Límite de 50 batches por partición espacial; el presupuesto de
  escena Low sigue siendo 100 draw calls.
- **3.751 muestras** contra triángulos de BLEND fuente y GLB reimportado:
  **cero colisiones**. Radio 0,18 m + margen 0,05 m; oscilación añade 0,052 m.
  Distancia mínima aproximada 0,255 m en entrada al cockpit sin oscilación.
  Distancia al hull ≥1,263 m en el tramo comprobado, excluidos cruces deliberados.
- Cinco anclas reales verificadas con la matriz canónica. Bounds BLEND/GLB
  coinciden dentro de tolerancia. La geometría exterior real alimenta el análisis.
- Se corrigieron colisiones iniciales con puerta de cockpit/hombro de salida,
  hueco sobre el cierre posterior y losa coplanar del descansillo. No se
  aumentó la tolerancia para ocultarlas.
- La nueva salida enlaza la retirada al 89,5 %, conservando los límites previos
  de salto angular/posición. El resto de coreografía pertenece a fase 3.

## Resultado de navegador conservado

Chromium 141.0.7390.37 con SwiftShader, Low, 960×640, DPR 1, tiempo de
simulación congelado en 12 s.

- Siete planos capturados: hero, ficha, cockpit, economy, escalera, cubierta
  superior y salida. **La zona del store y la del DOM coinciden en las
  siete**, que es el defecto A02.
- `scene.environment` no es nulo en ninguna de las siete. El dueño único
  resuelve una sonda en todo `[0,1]`.
- Radios de portal registrados por frame, ya derivados del cruce y no de una
  rampa de progreso: `[0, 0.77]` en 0,800 y `[0, 1.55]` —el máximo
  autorizado— en 0,833, justo en el plano de la puerta. El portal del morro
  está cerrado en todas ellas, como corresponde.
- FOV efectivo 52,3° en el hero y 57,9° en cabina sobre los 45° y 50°
  autorizados: la compensación de aspecto de 3.7 actuando en navegador real
  sobre un viewport de relación 1,5.
- Draw calls máximos 49 en el hero, contra el presupuesto Low de 100.
- Cero errores de consola, red, petición fallida o shader.

SwiftShader renderiza a ~1 fps: **valida funcionamiento, no rendimiento**.
Ninguna cifra de FPS de esta corrida debe leerse como característica.

## Evidencia reproducible

Índice: [`docs/evidence/round6/README.md`](docs/evidence/round6/README.md).
Los informes registran base remota y hashes SHA-256 del contenido probado;
no confunden el commit local sintético con la historia remota. La copia inicial
se reconstruyó y verificó contra los 175 blobs originales.

Una interrupción por cuota de revisión automática impidió el primer push y
la reanudación recuperó un checkpoint anterior. Se restauraron correcciones,
se regeneró el mismo GLB (blob `a8a12c86dd4c39e239bda8deccc696bf47840c4c`) y se
repitieron comprobaciones. Sólo se incluyen aquí archivos de evidencia
realmente conservados. El tour por duración fija que no alcanzaba S7 se
reemplazó por avance basado en frames, con llegada a S7 y retorno obligatorios.

```bash
npm ci
npm run build
npm test
npm run lint
npm run qa:hdri
npm run qa:interior
npx playwright install chromium ffmpeg
npm run qa:runtime
QA_TIER=high npm run qa:runtime
QA_CAPTURES=none QA_CYCLES=1 npm run qa:runtime
QA_CAPTURES=none QA_CYCLES=1 QA_DEV=1 npm run qa:runtime
QA_CAPTURES=none QA_INTERIOR_ERROR=1 npm run qa:runtime
QA_CAPTURES=none QA_SLOW_INTERIOR=1 npm run qa:runtime
QA_CAPTURES=none QA_VIDEO=1 npm run qa:runtime
node scripts/scroll-contract-qa.mjs
```

Blender y diagnóstico de volumen: [`INTERIOR_LAYOUT.md`](INTERIOR_LAYOUT.md).
QA local: Chromium 153 con SwiftShader, Blender/bpy 4.5.3 LTS. SwiftShader no
permite prometer rendimiento en GPU física. La matriz completa High 1440×900,
Safari/iOS/Android físicos y baseline previo completo siguen pendientes.

El timeout histórico exacto de 30 s al cambiar calidad no tiene causa demostrada:
el baseline local anterior cambió Mid→Low en 16.492 ms, Low→High en 3.999 ms y
High→Mid en 1.462 ms. El arnés nuevo fija tier desde el inicio y mantiene una
prueba separada del botón. No se sustituye evidencia High por Low.

## Resultado de navegador conservado

- Siete planos Low 800×600: hero, ficha, cockpit, economy, escalera, upper y
  salida; todos pasan convergencia, DOM y presupuestos. Sin errores inesperados.
- Error de descarga: hold 0,4092, objetivo 0,7 conservado, retorno funcional.
  Descarga retenida: hold 0,4093 y reanudación 0,6993.
- Diez ciclos en StrictMode y diez en producción: cada ciclo conserva
  119 geometrías, 41 texturas y 99 programas tras warm-up. Movimiento reducido
  en estos tests de recursos; suavidad y tour real se verifican por separado.
- CI del commit `474f0bef` pasó static-checks y despliegue. La matriz visual
  Low/High/tour continuaba ejecutándose al cerrar el informe; no se declara aprobada.
- Las capturas preceden sólo la corrección editorial que elimina la promesa de
  cabina «de punta a punta». El informe registra los hashes exactos probados.

## Continuación

Fase 3: ritmo/orientación/velocidad de cámara, oscilación ligada al avance y
composición de salida. Fase 4: transición óptica e IBL. Fase 5: materiales,
luz, pantallas y ventanas. Fases 6–7: móvil/accesibilidad y rendimiento/cierre.
No reintroducir offsets aislados, transparencia estructural o join global para
disimular problemas. Ver los criterios originales de `plan6.md` antes de cerrar.

## Cobertura de hallazgos de la auditoría

| ID | Estado | Evidencia / siguiente paso |
|---|---|---|
| A01 | Hipótesis abierta | Timeout CI exacto no reproducido; botón separado de selección de tier. |
| A02 | Corregido | Captura exige convergencia, frame nuevo y correspondencia de zona DOM. |
| A03 | Corregido y probado | Integrador único; equivalencia 30/60/120 Hz, delta largo y hold/resume. |
| A04–A05 | Pendiente fase 3 | Ritmo y orientación exterior no se declaran resueltos. |
| A06 | Corregido | Prioridades explícitas y matrices antes de consumidores; DOM síncrono. |
| A07 | Corregido | Recursos cacheados vivos; limpieza de reemplazos propios; ciclos en evidencia. |
| A08 | Corregido | Lotes espaciales y estructura opaca, sin fade por centro global. |
| A09 | Corregido geométricamente | Mismo pitch/frame; secciones reales del hull; cabina termina antes de cola. |
| A10 | Corregido estructuralmente | Cockpit hacia nariz, entrada y giro en volumen libre. |
| A11 | Corregido | Dos pasillos, configuración representativa y copy sin promesas de cabina completa. |
| A12 | Corregido | Assets reales, hold antes de 0,41, destino conservado y recuperación. |
| A13–A14 | Pendiente fase 4 | IBL, transiciones y entorno requieren revisión óptica integral. |
| A15 | Mitigado | Haces planos apagados; materiales/luz final en fase 5. |
| A16 | Pendiente fase 6 | Composición móvil y accesibilidad completas. |
| A17 | Parcial | Ownership y cleanup mejorados; rendimiento físico pendiente. |
| A18 | Mejorado | Hashes, tier real, resultados parciales, matriz explícita; aceptación visual pendiente. |
| A19 | Corregido en geometría | Cero colisiones muestreadas; percepción de movimiento pendiente fase 3. |

---

# Ronda 6 — implementación de fases 3, 4 y 5

Fecha: 2026-09-20. Base: `9837b273e040ec82822bc1f93e6f4e0eb5be7052`.
Alcance autorizado: **fases 3, 4 y 5** del plan. No se declara terminada la
experiencia; las fases 6, 7 y 8 siguen pendientes y varios puntos dentro de
estas tres quedan explícitamente abiertos más abajo.

## Fase 3 — Coreografía de cámara y avión

| Campo | Contenido |
|---|---|
| **ID y fase** | A04, A05, A19 (geometría de cámara) · 3.1–3.7 · verificado por prueba, pendiente de aceptación visual |
| **Reproducción** | SHA base, Node 22 sobre los módulos reales vía Vite SSR. Barrido de `sampleCamera` en pasos de 0,001 y de 1/20.000 para tasas instantáneas. Encuadre medido proyectando 33 puntos del casco extraídos del `exterior.glb` publicado. |
| **Causa** | Demostrada. `traversalEase` integraba una rampa coseno **por banda**, así que la velocidad caía a cero en cada empalme, no sólo en las pausas autorizadas. Medido antes del cambio: 0,947 → **0,125** → 2,575 unidades por 0,001 alrededor del 30 % (caída de ×20 seguida de salto de ×20) y 2,681 → **0,102** en 0,42 (×26). `cabinRoute` tenía la misma enfermedad con un smoothstep por segmento: frenaba en sus 19 paradas. |
| **Cambio** | `motionProfile.ts` (nuevo): spline cúbico monótono de Fritsch–Carlson sobre (progreso, coste acumulado). Es C1 por construcción y su regla de tangentes anula la velocidad **sólo** donde dos nudos repiten posición, que es donde están los dwells autorizados. `shotSheet.ts` (nuevo): hoja de planos con intención, sujeto, encuadre y extensión por plano; el scroll se reparte por coste de recorrido (longitud + 45 u por radián) dentro de cada intervalo fijado por la narrativa. `cameraPath.ts`: dos curvas Catmull-Rom **acotadas** (kf0–kf7 y kf13–kf16) en lugar de una global, de modo que los keyframes de cabina ya no deforman la aproximación al morro ni la salida. `cabinRoute.ts`: un solo perfil para todo el paseo, conservando la interpolación **lineal** entre paradas para no invalidar las 3.751 muestras sin colisión de la fase 2. `cameraEnvelopes.ts` (nuevo) y `CameraRig.tsx`: la oscilación de caminata responde a la velocidad real de avance y se atenúa en los límites de S5; el puntero se suaviza por delta. `aircraftPose.ts`: rodaje acelerado, rotación pivotando sobre el contacto real del tren principal medido en el GLB `(0, −8,476, −2,63)`, y tren que se repliega sólo después del despegue. `shotFraming.ts` (nuevo): proyección a pantalla y compensación de FOV horizontal. |
| **Evidencia** | 14 pruebas nuevas en `tests/plan6-fase3.test.mjs`. Continuidad de tasa de coste ≤ **3,38 %** en todos los empalmes en movimiento (antes: frenada completa en cada uno). Velocidad cero exclusivamente dentro de los cuatro dwells autorizados, comprobado en 1.000 muestras. Máximos por 0,001: posición 3,43 (0,392), objetivo 3,05 (0,928), orientación 2,74 (0,503), FOV 0,32 (0,395), roll 0,195 (0,306). Velocidad en pantalla por intención: drift 0,0006, turn 0,019, approach 0,035, track 0,039, retreat 0,106 alturas de cuadro por 0,001. **Cero** de 4.001 muestras exteriores sin ningún punto del casco en cuadro. |
| **Siguiente paso** | Aceptación visual a resolución nativa y en movimiento. El dwell de cockpit sostiene posición desde 0,49 pero la orientación sólo desde 0,5215: el giro de 165° no cabe antes sin superar el presupuesto angular, y dejarlo totalmente quieto exige más scroll para S5 o rediseñar la entrada. Queda declarado, no oculto. |

### Hallazgos de la fase 3 que el plan no anticipaba

1. **El avión salía por completo del encuadre durante la salida.** Medido, no supuesto: entre 0,835 y ~0,90 ningún punto del casco proyectaba dentro del cuadro. La causa era la posición de `kf14`, situado *de través* en `[-110, 55, -20]`, que obliga a un giro de 161° desde la puerta de babor. Movido al cuarto de popa `[-70, 50, 30]`, el avión queda delante y a estribor y el giro baja a **124,9°**; además lee como ver el avión alejarse en vez de orbitarlo. Con eso, y sin ningún truco de temporización, las muestras vacías pasan a **cero**.
2. **El primer intento de arreglo fue peor.** Adelantar el giro respecto a la traslación eliminaba el cuadro vacío pero disparaba la velocidad angular a 8,44°/0,001. Se descartó y se retiró el mecanismo entero: el arreglo correcto era geométrico.
3. **El conjunto de landmarks inicial mentía.** Juzgado sólo por el centro del fuselaje, el marco de la puerta parecía vacío mientras el ala de babor estaba a 8,8° del eje. La silueta se muestrea ahora con 33 puntos extraídos por rejilla del GLB.
4. **`kf15` estaba a 262 m.** La envergadura cubría el 26 % del ancho de cuadro en el plano de cierre y la retirada consumía el scroll que necesitaba el giro. A 198 m cubre el 34,6 %.
5. **El alabeo de 6° estaba autorizado sobre un keyframe de 3 unidades**, que tras el reparto por coste posee 0,0012 del scroll: 5° por 0,001. Pasa a ser una envolvente del plano de órbita, 0,195°/0,001.

### Criterios de continuidad re-declarados

`tests/b1-b2.test.mjs` fijaba límites por muestra calibrados contra el easing
que frenaba en cada banda, lo que suprimía artificialmente todos los picos de
la página. Se re-declaran contra los planos tal como están autorizados ahora:
posición y objetivo 3 → **4**, FOV 0,25 → **0,35**. Orientación (3°) y roll
(0,35°) se conservan y se cumplen con margen. El pico de posición cae en el
acercamiento frontal, que es el punto de **menor** velocidad en pantalla de
toda la página (0,005 alturas de cuadro por 0,001) porque la cámara viaja
sobre su propio eje de visión: es exactamente el caso que el plan 3.7 pide
medir en pantalla y no en distancia de mundo. La tabla de llegadas de
keyframes deja de estar escrita a mano y se deriva de la hoja de planos.

## Fase 4 — Portales, persistencia del mundo y transiciones de luz

| Campo | Contenido |
|---|---|
| **ID y fase** | A13, A14 · 4.1–4.6 · corregido y probado; aceptación óptica pendiente |
| **Reproducción** | Igual arnés. Estado del mundo evaluado como función de la altitud real del avión en 1.001 muestras; portales evaluados contra la posición de cámara del frame. |
| **Causa** | Demostrada. `RunwayEnvironment.tsx:405` apagaba el grupo terrestre con `progress < 0.305` y `groundFade` borraba el suelo entre 0,28 y 0,305. `scene.environment` tenía **dos** dueños (`<Environment>` de drei y el PMREM de `InteriorLighting`) que se lo disputaban en S4–S6. `PostFX` montaba y desmontaba DoF y GodRays por índice de sección, reconstruyendo el composer en los dos umbrales que la cámara estaba cruzando. `portalRadius` era una rampa triangular sobre el progreso, ajena a dónde estuviera la cámara. |
| **Cambio** | `worldPersistence.ts` (nuevo): una capa de nubes bajo la altura de crucero que se cierra según **sube el avión**. El mundo desaparece porque algo se pone delante, no porque un número lo diga, y al retroceder se abre exactamente igual. La pista, los edificios, el pasto y el bosque se cullean sólo cuando esa capa ya los tapa. `iblSchedule.ts` (nuevo) + `cabinProbe.ts` (nuevo): un único dueño de `scene.environment`, con relevos situados en los cruces físicos (0,28 / 0,455 / 0,833) y un pozo de intensidad que hace el cambio de sonda donde menos aporta. Las cuatro sondas se convolucionan al montar la escena, así que ningún PMREM cae sobre un frame de umbral. `postFxSchedule.ts` (nuevo): ventana de montaje estrictamente más ancha que la rampa de cada efecto, y fuerza y foco escritos sobre el efecto vivo por referencia en vez de por props (cambiar una prop de `postprocessing` recrea el efecto, que es justo la reconstrucción que se quería evitar). Foco por zona: 3,2 m en cockpit, 9 m en pasillo, 4,5 m en escalera. `thresholdPortals.ts`: la apertura se deriva del cruce y de la holgura del plano cercano. |
| **Evidencia** | 9 pruebas nuevas en `tests/plan6-fase4.test.mjs`. Diez ciclos S1→S5→S7→S5→S1 en Chromium 141 con SwiftShader: **120 geometrías, 41 texturas, 88 programas**, idénticos en los diez y sin errores de consola, red ni shader — que es la propiedad comprobada, no el valor absoluto. La fase 2 registró 119/41/99. El desglose de la diferencia no se ha atribuido pieza por pieza y no se afirma. En las siete capturas `sceneEnvironmentIsNull` es falso en todas, que es la condición que el dueño único debía garantizar. El bundle baja de 1.610 kB a 1.581 kB minificado (492 → 482 kB gzip). |
| **Siguiente paso** | Barrido visual denso alrededor de 28–31 %, 40–52 %, 79–88 % y 94–96 % con imagen anterior/durante/posterior. Que `scene.environment` no sea nulo sigue siendo necesario e insuficiente: falta comprobar el reflejo en sí. |

**Hallazgo:** la prueba de portales escrita a mano suponía que el morro se
cruza en 0,46, el empalme con la cabina. Se cruza en **0,42**: `kf6` está
autorizado sobre la propia piel. La prueba ahora **busca** el cruce por
cambio de signo en vez de suponerlo, y la ventana del portal del morro se
adelantó de 0,40 a 0,38 para que la compuerta narrativa no llegue tarde.

**Plano cercano:** 0,1 → **0,15**. La precisión de profundidad la fija la
razón `far/near`, y 3000/0,1 gasta casi todo el búfer en los primeros
metros. El suelo lo pone la holgura verificada en la fase 2: con `near`
0,15 la esquina más lejana del plano cercano queda a 0,207 u, dentro de los
0,2548 medidos; con 0,2 quedaría fuera. `far` no se toca.

## Fase 5 — Materiales, luz, exterior y entorno

| Campo | Contenido |
|---|---|
| **ID y fase** | A15, A19 · 5.1, 5.2, 5.4, 5.5 implementados · 5.3, 5.6, 5.7, 5.8 **pendientes** |
| **Reproducción** | `node scripts/audit-exterior-surface.mjs` sobre el `exterior.glb` publicado. Geometría de haces evaluada contra el inventario de 33 ventanas del manifiesto. |
| **Causa** | Demostrada y **cuantificada**. Los haces eran planos aditivos de orientación fija: vistos de frente eran losas, de canto desaparecían, y el corte `smoothstep(0.55, 1.0, …)` transversal era la banda triangular dura. Con una única longitud autorizada de 4,6, cada haz de cubierta principal atravesaba **1,39 u** por debajo del suelo de su cubierta. En el exterior, la auditoría mide **11.040 de 67.580 triángulos (16,3 %) con UV de área cero** y una dispersión de densidad de téxel de **×8,36** entre los percentiles 5 y 95; las normales, en cambio, están todas normalizadas. |
| **Cambio** | `cabinShafts.ts` (nuevo) + `CabinAtmosphere.tsx`: los haces vuelven, reconstruidos como volúmenes acotados. Billboard cilíndrico alrededor de su propio eje (siempre presentan su anchura, nunca alternan entre losa y nada), campana gaussiana transversal en vez de corte, caída exponencial longitudinal, atenuación cuando se miran de punta, y longitud resuelta por ventana contra el suelo de su cubierta. Tierados con el resto del detalle de dispersión. `dissolveHullMaterial.ts`: la rugosidad procedural se proyecta desde espacio de objeto en vez de muestrearse por las UV rotas del asset — el albedo licenciado conserva las suyas, porque sólo él sabe dónde va la librea. `interiorSurfaceMaps.ts`: la alfombra varía a escala de mechón y no por téxel; ruido no correlacionado a plena amplitud entre téxeles vecinos es grava, sea del color que sea. `shotSheet.ts`: referencia de acabado por plano, registrando qué se reproduce y qué se estiliza. |
| **Evidencia** | 4 pruebas nuevas en `tests/plan6-fase5.test.mjs`. `docs/evidence/round7/exterior-surface.json`. 73/73 pruebas Node, lint y build correctos. |
| **Siguiente paso** | **5.3** (calibrar luz sin bloom/DoF/haces y reintroducirlos con comparación A/B), **5.6** (vegetación por silueta y distancia), **5.7** (aeropuerto legible, numeración y PAPI de plan3 D) y **5.8** (plan3 F1/F3/F4) **no están hechos** y no se declaran de ninguna otra manera. La reparación de las UV del exterior es una decisión aparte, con licencia y coste, como el propio plan 5.2 contempla: aquí se mide el defecto y se mitiga su consecuencia, no se repara el asset. |

## Cobertura acumulada de la auditoría

| ID | Estado tras fases 3–5 | Evidencia / siguiente paso |
|---|---|---|
| A01 | Hipótesis abierta | Sin cambios esta ronda. |
| A02 | Corregido (fase 0) | Sin cambios esta ronda. |
| A03 | Corregido (fase 1) | Sin cambios esta ronda. |
| A04 | **Corregido y probado** | Reparto de scroll por coste y perfil C1; continuidad de tasa ≤ 3,38 %. |
| A05 | **Corregido y probado** | Envolventes por velocidad de avance y proximidad al límite; puntero suavizado por delta; vibración de rodaje como ventana. |
| A06 | Corregido (fase 1) | Sin cambios esta ronda. |
| A07 | Corregido (fase 1) | Diez ciclos estables reconfirmados: 120/41/75. |
| A08 | Corregido (fase 2) | Sin cambios esta ronda. |
| A09 | Corregido (fase 2) | Sin cambios esta ronda. |
| A10 | Corregido (fase 2) | Giro de cockpit reducido a 165° por presupuesto angular. |
| A11 | Corregido (fase 2) | Sin cambios esta ronda. |
| A12 | Corregido (fase 1) | Sin cambios esta ronda. |
| A13 | **Corregido y probado** | El corte del 30,5 % no existe; oclusor físico reversible. |
| A14 | **Corregido y probado** | Dueño único de IBL, relevos en los cruces, rampas de efecto sin reconstruir el composer. |
| A15 | **Mitigado y medido** | Haces reconstruidos y acotados; alfombra a escala de mechón. Calibración de luz (5.3) pendiente. |
| A16 | Pendiente fase 6 | Composición móvil y accesibilidad. La cámara ya compensa el FOV horizontal en relaciones estrechas, con tope a 75°; el retrato real sigue siendo trabajo de maquetación. |
| A17 | Parcial | PMREM movido fuera del cruce visible; rendimiento físico pendiente. |
| A18 | Mejorado | Sin cambios esta ronda. |
| A19 | **Medido; geometría corregida, UV mitigadas** | 16,3 % de triángulos con UV degeneradas y dispersión ×8,36, con normales limpias; rugosidad proyectada. Despegue con rodaje, pivote sobre el tren real y repliegue posterior al despegue. Reparación de UV: decisión aparte. |

## Resultado de navegador conservado

Chromium 141.0.7390.37 con SwiftShader, Low, 960×640, DPR 1, tiempo de
simulación congelado en 12 s.

- Siete planos capturados: hero, ficha, cockpit, economy, escalera, cubierta
  superior y salida. **La zona del store y la del DOM coinciden en las
  siete**, que es el defecto A02.
- `scene.environment` no es nulo en ninguna de las siete. El dueño único
  resuelve una sonda en todo `[0,1]`.
- Radios de portal registrados por frame, ya derivados del cruce y no de una
  rampa de progreso: `[0, 0.77]` en 0,800 y `[0, 1.55]` —el máximo
  autorizado— en 0,833, justo en el plano de la puerta. El portal del morro
  está cerrado en todas ellas, como corresponde.
- FOV efectivo 52,3° en el hero y 57,9° en cabina sobre los 45° y 50°
  autorizados: la compensación de aspecto de 3.7 actuando en navegador real
  sobre un viewport de relación 1,5.
- Draw calls máximos 49 en el hero, contra el presupuesto Low de 100.
- Cero errores de consola, red, petición fallida o shader.

SwiftShader renderiza a ~1 fps: **valida funcionamiento, no rendimiento**.
Ninguna cifra de FPS de esta corrida debe leerse como característica.

## Evidencia reproducible

Índice: [`docs/evidence/round7/README.md`](docs/evidence/round7/README.md).
Sólo contiene archivos realmente producidos en esta sesión.

## Límites de esta entrega

- No se ha hecho revisión visual a resolución nativa ni en movimiento. Todo
  lo anterior son mediciones numéricas y pruebas de contrato, no aceptación
  de imagen.
- SwiftShader valida funcionamiento, no rendimiento en GPU física.
- Las fases 6, 7 y 8 del plan no están empezadas.
- Dentro de la fase 5, los puntos 5.3, 5.6, 5.7 y 5.8 están pendientes.

```bash
npm ci && npm run build && npm test && npm run lint
node scripts/audit-exterior-surface.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  QA_CAPTURES=none QA_CYCLES=1 node scripts/runtime-qa.mjs
```
