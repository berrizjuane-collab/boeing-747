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

---

# Cierre del trabajo pendiente de F5 e implementación de F6

Fecha: 2026-09-21. Base remota auditada: `6a8ef56bbaece739876b052025b9958f41e79ba8`.
Alcance: **sexto objetivo = F5; séptimo objetivo = F6**. El repositorio se
llama `boeing-747`, pero la experiencia y los assets representan un A380.
Las entradas anteriores se conservan como historial, incluidos sus pendientes.

## F5 — Acabado pendiente

| Tarea | Causa comprobada y corrección |
|---|---|
| 5.3 Luz y efectos | Comparación a tier High fijo, cámara, reloj y exposición iguales: base → bloom → DoF → haces → completo. Bloom pasa de 0,6/umbral 0,8 a 0,10/umbral 2,5 tras descartar una primera calibración 0,32/1,1 que lavaba el fuselaje; haces de 0,34/0,18 a 0,16/0,08; viñeta 0,4 y grano 0,018. La base conserva exposición, tono y grading. `?qa=1&finish=base` permite inspeccionar el modelado sin esos efectos. |
| 5.6 Vegetación | El pasto tenía hojas de 11–17 cm y altura cercana a un metro. Se reduce anchura a 2,5–4,5 cm y escala vertical a 0,22–0,46, conservando máscara, raíces y exclusiones. Copas próximas asimétricas e instancias con proporciones variadas; sin aumentar sus triángulos ni draw calls. |
| 5.7 Aeropuerto | El primer hangar invadía dos metros del borde de pista; las posiciones se reorganizan al oeste del taxiway y una prueba exige separación de pista, taxiway, terminal y otros hangares. Designadores 36/18 integrados en la malla de pintura; se despeja el eje donde se pintan. Dos bancos PAPI direccionales, con rojo/blanco según elevación y caras posteriores oscuras, usan dos draw calls y exclusiones de vegetación propias. Sigue siendo un aeródromo de escala comprimida y ficticio, no una instalación operacional certificada. |
| 5.8 Nubes, sol y salida | Las nubes de tarjeta reciben espesor óptico, sombreado de lóbulos y variación por instancia. La revisión de imagen encontró además una plancha gris en la salida: la capa inferior ahora tiene relieve, sombreado a escala de 32 m y coordenadas mundiales, con color cálido al atardecer. Mantiene la opacidad/culling reversible de F4. El sol de efectos deja de ser una esfera de radio 18 situada para forzar glare; tiene tamaño angular pequeño y comparte dirección con la luz/HDRI. |

El relieve inferior añade 32.768 triángulos **sólo cuando la capa es visible**,
sin draw call adicional. Es una aproximación a estratos bajos, no raymarching
volumétrico. No se ha sustituido el exterior ni reparado sus UV degeneradas:
se conserva la mitigación de F5 anterior y su atribución. Las limitaciones del
asset no se convierten en una promesa de fidelidad fotográfica.

## F6 — Narrativa, composición y accesibilidad

| Tarea | Corrección |
|---|---|
| 6.1 | Un panel presentado visible; el saliente se oculta en el mismo cambio de estado y sólo el entrante hace fade. `inert` y `aria-hidden` retiran el contenido invisible del foco y del árbol accesible. Se corrigió también la captura de canvas: ocultar sólo el padre ya no basta cuando un hijo declara `visibility:visible`. |
| 6.2 | Títulos más cortos, tamaños ligados al contenedor, sin `overflow-wrap:anywhere` en palabras ordinarias. Copy para el visitante en vez de describir scroll, cortes de escena o implementación. |
| 6.3 | Panel inferior acotado en portrait; tercio lateral en landscape/escritorio; contenido excedente desplazable con foco de teclado. La primera prueba de texto al 200 % encontró etiquetas superpuestas aunque `scrollWidth` no aumentaba: tracks intrínsecos y navegación en dos filas corrigen esa causa. |
| 6.4 | Datos del A380 real distinguidos del interior/aeropuerto simplificados. Configuraciones representadas 3-4-3 y 2-4-2; fuentes y crédito del modelo conservados. Se retira la promesa «nariz a cola» y el colofón desactualizado sobre Lenis/ScrollTrigger. |
| 6.5 | Hotspots limitados a sección/zona, anclas de cabina ajustadas al registro, oclusión por raycast sin quads negros, foco recuperado al ocultarse, descripción y estado expandido, apertura por teclado/touch y cierre con Escape. Sólo el bitmap canvas es decorativo; su contenedor ya no oculta los controles Html del árbol accesible. Navegar a interior aterriza en el dwell de cockpit. |
| 6.6 | El modo reducido abre la narrativa completa sin canvas, tanto al inicio como al cambiar la preferencia. Existe «Leer contenido» siempre disponible y opt-in explícito al recorrido 3D. La misma narrativa funciona sin WebGL. Se retira del flujo el dip de 220 ms que no podía ocultar correctamente vuelos largos. |

## Verificación y alcance de aceptación

- **76/76 pruebas Node**; lint sin advertencias de código; build correcto.
  Permanece el aviso de bundle grande, trabajo de F7.
- HDRI dentro de gates existentes; GLB interior conserva 266 asientos,
  69.129 triángulos y 46 batches; registro, ownership y opacidad aprobados.
- F6: **15 estados** (cockpit/economy/ficha en 390×844, 844×390,
  768×1024, 1440×900 y 960×640), con exactamente un panel visible,
  paneles inactivos inert, sin overflow horizontal ni recorte fuera del viewport.
- Texto al **200 %**: sin superposición de datos ni overflow de página;
  contenido desplazable y enfocable. Doce avances Tab sin entrar en contenido
  invisible; recuperación de foco y cambios vivos de reduced motion aprobados.
- Chromium 153 / SwiftShader / DPR 1: las medidas de FPS en estos informes
  **no certifican rendimiento en GPU física ni Safari/iPhone/Android**.
- La aceptación de esta entrega cubre los cambios F5–F6 y los planos/matrices
  indicados. No equivale al barrido/vídeo completo, diez ciclos finales ni CI
  integral de F7–F8. Los pendientes históricos A01 y la reparación de UV no
  se declaran resueltos por estas capturas.

Evidencia, procedencia y reproducción:
[`docs/evidence/round6/f5-f6/README.md`](docs/evidence/round6/f5-f6/README.md).

Resultado High final: cuatro planos verificados, sin errores de consola/shader;
75/55/85/29 draw calls en hero/cockpit/economy/sunset y máximo 708.417
triángulos visibles. ROI de hero: fuselaje 199,38 frente a 199,16 sin efectos;
cielo 236,29; blancos recortados 0 % en ambas. La comparación intermedia de
once capturas queda registrada como calibración, no como imagen final aprobada.
Las capturas no se subieron: la revisión automática rechazó su publicación
sin autorización explícita; los informes y comandos quedan en el repositorio.

---

# Implementación de F7 y cierre de regresión F8

Fecha: 2026-09-24. Base de `main` revisada antes del cambio:
`736cce46223535fc0ef97d3dabeee3d7d829be0f`. El trabajo cubre la
instrumentación/rendimiento de F7 y la infraestructura de regresión/publicación
de F8. No se atribuye aquí resultado a una corrida CI todavía pendiente.

## F7 — rendimiento medible y adaptación por tier

- Los mapas del terreno se generan en un Web Worker y transfieren los tres
  buffers de píxeles. El caché se indexa por resolución efectiva, por lo que
  High y Mid comparten 1024²; Low conserva su conjunto 512². Las métricas
  exponen tiempo, tamaño, cantidad de generaciones y reutilizaciones.
- `StatsCollector` añade subida de texturas y espera real de `compileAsync` a
  la telemetría. El runtime QA conserva arranque frío, primera entrada,
  repetición caliente, frame time/FPS, draw calls, triángulos, memoria y tareas
  largas.
- Auto-tier espera el warm-up, ignora pestañas ocultas y frames anómalos, y
  decide a partir de p95 sostenido. Una selección manual desactiva cambios
  posteriores. FXAA da antialiasing también a Low sin sumar el coste de los
  pases SMAA; los tiers siguen gobernando partículas, haces, sombras y DPR.
- El QA de runtime verifica presupuestos Low/Mid/High en cada punto del
  recorrido. La matriz CI está configurada para escanear 0→1→0 cada 0,01;
  Low también verifica ciclos y transiciones Low→High→Mid→Low.

Pruebas locales: **82/82**, lint, build, HDRI y GLB interior pasan. HDRI máximo
mean/median ratio 1,923/2,339. El GLB conserva 266 asientos, 69.129 triángulos,
46 batches y ownership/anchors opacos aprobados. Sigue la advertencia de bundle
(1.593,35 kB minificado, 485,50 kB gzip). Esta copia no tenía Chromium: el
barrido visual/rendimiento debe quedar acreditado por CI. Su SwiftShader no
podrá certificar FPS de GPU física.

## F8 — regresión, evidencia y despliegue seguro

- Las 16 paradas editoriales comprueban el frame presentado, zona DOM, datos,
  contraste y recorte; el sweep mide progreso en ambos sentidos. El recorrido
  dinámico cubre 0–100–0, informa frame pacing, saltos y long tasks.
- La detección del horizonte y el detalle del suelo usan bandas laterales y
  máscaras DOM explícitas; las pruebas F8 comprueban exclusión de paneles,
  avión y edificios centrales.
- El arnés falla si faltan métricas de frame/memoria o exceden presupuestos.
  Actions conservará reportes, las capturas High y el vídeo WebM por 30 días.
- Pages se ejecuta mediante `workflow_run` de `Final visual QA`; exige
  conclusión verde de un evento `push` en `main` y construye exactamente el
  `head_sha` validado. Se respetan las condiciones de Pages para el repo
  privado.

Estado al registrar esta entrada: workflow configurado, verificación local
estática aprobada, runtime CI aún no completado. La revisión visual de los
artefactos CI y la matriz de GPU física/escritorio/móvil son gates distintos;
no se declaran aprobados por compilar ni por usar SwiftShader. No se modificó
el modelo exterior ni se borraron repositorios. Evidencia e instrucciones:
[`docs/evidence/round6/f7-f8/README.md`](docs/evidence/round6/f7-f8/README.md).
