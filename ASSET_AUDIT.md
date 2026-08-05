# Fase 0 — Auditoría del asset exterior

**Fecha de auditoría:** 2026-08-04  
**Repositorio:** berrizjuane-collab/boeing-747  
**Decisión de producto vigente:** el proyecto usa un Airbus A380-800; el nombre del repositorio es histórico/cosmético. El exterior debe ser un asset existente con licencia CC BY; el interior será geometría propia.

## Resultado ejecutivo

- Se relevaron **9 candidatos** desde el catálogo descargable de Sketchfab.
- Se consultó la página individual y/o la respuesta individual de la API de cada candidato; no se tomó la licencia de un listado como prueba suficiente.
- Se excluyó explícitamente el modelo CC BY-NC-SA porque el proyecto puede publicarse como portfolio/producto.
- **Candidato preliminar recomendado:** [Airbus A380 — Brout](https://sketchfab.com/3d-models/airbus-a380-98d21f9c8104445f814cef47ef992889).
- **Estado de aprobación:** operativo para una copia de trabajo de Fase 0. La licencia, autoría, descargabilidad declarada, conteos y el archivo fuente autorizado ya están verificados. El gate de asset final queda condicionado por la UV original solapada y por el material albedo-only; ambas limitaciones están registradas explícitamente.
- **El binario de terceros no se ha incorporado al repositorio.** Sólo se subieron scripts reproducibles; la copia de trabajo y los reportes permanecen como artefactos de sesión con atribución CC BY.

## Criterio de aceptación

Convención de esta auditoría: [x] evidencia suficiente para el uso de Fase 0 · [~] usable pero con una limitación que debe quedar visible · [!] bloqueado.

1. **Tren de aterrizaje:** [x] la fuente contiene un mesh separado llamado Wheels, con 115 componentes geométricos desconectados y parentado bajo A380_low. La copia de trabajo separa esos componentes en 115 nodos LandingGear_Part_### bajo LandingGear, conservando A380_low → A380 y dejando un grupo animable para S2.
2. **UVs:** [~] ambos meshes tienen una capa UV dentro de 0–1 y la textura se visualiza correctamente, pero bpy.ops.uv.select_overlap selecciona las 20.990 caras de A380 y las 13.032 caras de Wheels. La fuente también presenta 708 y 2.699 polígonos con área UV degenerada, respectivamente. No se declara una UV limpia/no solapada; requiere limpieza o bake en el pipeline.
3. **Materiales:** [~] existe un grafo nativo Principled BSDF → Material Output con A380.JPG conectado a Base Color. Es PBR-compatible y no depende de un renderer exclusivo, pero sólo hay una textura de albedo de 7.321 × 4.677 px; no hay mapas conectados a Roughness, Metallic o Normal.
4. **Transformación:** [x] la copia de trabajo usa un único Exterior_Root: rotación X = −90°, traslación = (0, 0, 28,9781) m, unidades métricas. La conversión deja x lateral, y arriba y z longitudinal, con bounds 79,6807 × 24,6860 × 72,9999 m, sin romper la jerarquía.

La condición operativa para continuar es [x] en tren y transformación, [~] documentado en UV/PBR. La limpieza de UV y la ampliación del material quedan como trabajo explícito de pipeline, no como supuestos ocultos.

La vista previa sólo permite comprobar la silueta y la presencia visual del tren. **No sustituye** la inspección del archivo fuente.

## Registro de verificación de esta sesión

- Archivo adjunto recibido: airbus-a380.zip; SHA-256: 3fe2fad103db2ead487e0ed6b6d3f400a9173eeef8b2aa368cec848192e3c72b.
- La extracción se hizo en una ruta aislada después de validar que el ZIP principal y el ZIP anidado no contenían rutas absolutas ni segmentos .. . El contenido fue source/A380.zip + textures/A380.jpeg; el ZIP anidado contiene A380.blend + A380.JPG.
- A380.blend fuente: Blender 3.5, SHA-256 7b7dfe3d2931329f13a8f512c2f40112abc96c4e2f4b3b46cfd27a97c8e49273.
- A380.JPG fuente: 7.321 × 4.677 px, SHA-256 edbcd9540c8ac89c5c62fc035d2c98f8410779a8116c74ceb6859f3048d77c83.
- Blender 5.2.0 LTS reabrió la fuente: 3 objetos, 2 meshes, 1 material, 1 imagen, unidades NONE en origen.
- Jerarquía fuente observada: A380_low (EMPTY) → A380 (mesh) y Wheels (mesh). Wheels contiene 115 componentes conectados por separado; no era una sola pieza topológica continua.
- Material fuente observado: A380 → Principled BSDF, Material Output e Image Texture; la única conexión de textura es A380.JPG → Base Color.
- La copia de trabajo se guardó como phase0_exterior_working.blend y se exportó como phase0_exterior_working.glb después de separar el tren, empaquetar A380.JPG y aplicar Exterior_Root. El BLEND reabierto pasó 10/10 checks; reportó 119 objetos, 116 meshes y 115 piezas del tren. El GLB reimportado reportó 119 objetos, 116 meshes, 1 material, 1 imagen y UVs presentes.
- El GLB de trabajo tiene SHA-256 4fa54b950f20e580f9dac9c0248338f7bb99074bcec91b10ce7d96d6ee1717b6. El BLEND de trabajo tiene SHA-256 e8ee85c660e7448c263f48ef29844d2d358aa428d3e1c4f369bdd5646a3fd807.
- La escena combinada con el interior se guardó como phase0_registered_scene.blend. La copia de interior se registró con Interior_Registration_Root = (0, 3,2, 0,3) m; al reabrirla pasó todos los checks: 357 objetos de interior, 353 meshes, bounds visibles 6,32 × 4,58 × 58,00 m dentro de los bounds exteriores. El Seat_Base oculto se excluye sólo de bounds visibles.
- Se renderizó e inspeccionó visualmente la copia de trabajo: silueta, librea, ventanillas, motores y tren son legibles. El render no prueba por sí solo la limpieza de UV ni un set PBR completo; por eso esos checks permanecen [~].

## Candidatos auditados

| Candidato individual | Licencia declarada | Geometría publicada | Evidencia adicional | Decisión |
|---|---|---:|---|---|
| [Brout — Airbus A380](https://sketchfab.com/3d-models/airbus-a380-98d21f9c8104445f814cef47ef992889) · UID 98d21f9c8104445f814cef47ef992889 | CC BY 4.0; comercial permitido; atribución requerida | 67.6k triángulos, 36.2k vértices | Descargable; descripción “game ready”; API de búsqueda lista GLB de ~4.41 MB, 1 textura; vista previa muestra tren | **Shortlist principal**. Estructura, UV/PBR y transformación: pendientes |
| [Nobilis 2 — Airbus A380-800](https://sketchfab.com/3d-models/airbus-a380-800-cfd1092a207b4085a32fbb89c6b32f25) · UID cfd1092a207b4085a32fbb89c6b32f25 | CC BY 4.0; comercial permitido; atribución requerida | 6.8k triángulos, 4.8k vértices | Descargable; API de búsqueda lista GLB de ~2.28 MB, 4 texturas; muy barato para S1–S3; vista previa no basta para confirmar nodos del tren | **Fallback de rendimiento**. La geometría puede ser demasiado simple para el plano hero |
| [JUSTGAME — Airbus A380](https://sketchfab.com/3d-models/airbus-a380-21a5de23596945c8b2f6ddc7c6dc41e0) · UID 21a5de23596945c8b2f6ddc7c6dc41e0 | CC BY 4.0; comercial permitido; atribución requerida | 127.6k triángulos, 78.3k vértices | Descargable; 20 texturas y 24 materiales; API lista GLB de ~17.07 MB; vista previa muestra tren | **Fallback visual**, pero supera el presupuesto inicial de 15 MB para S1 antes de optimizar |
| [AirBuilds — Airbus A380 Model (Free)](https://sketchfab.com/3d-models/airbus-a380-model-free-705b26ed9bb1418294d03706083dec7f) · UID 705b26ed9bb1418294d03706083dec7f | CC BY 4.0; comercial permitido; atribución requerida | 462.6k triángulos, 334.1k vértices | Descargable; el autor declara texturas y alta definición; 14 texturas; API lista GLB de ~20.45 MB | **Descartado para v1** por presupuesto de geometría/payload; podría requerir una reducción agresiva |
| [KOG_THORNS — Airbus A380](https://sketchfab.com/3d-models/airbus-a380-2370a0adb0a140fe962972effcd08cbb) · UID 2370a0adb0a140fe962972effcd08cbb | CC BY 4.0; comercial permitido; atribución requerida | 642.5k triángulos, 273.6k vértices | Descargable; 32 texturas en GLB, ~43.78 MB; vista previa muestra tren | **Descartado** por presupuesto de geometría/payload |
| [CreditFreeStudio — AIRBUS A380-800 Blank](https://sketchfab.com/3d-models/airbus-a380-800-blank-b2aecb11968044f8a7e712d1fe9a0417) · UID b2aecb11968044f8a7e712d1fe9a0417 | **CC BY-SA 4.0**; exige compartir derivados bajo la misma licencia | 745.2k triángulos, 427.5k vértices | Descargable; sin texturas declaradas en la API; descripción indica que no está animado | **Descartado**: no es la licencia CC BY solicitada y excede el presupuesto |
| [hakai315 — Airbus A380-800 Model (Without Landing Gear)](https://sketchfab.com/3d-models/airbus-a380-800-model-without-landing-gear-15bf2a45aa2c4676b658ac43c8a1137b) · UID 15bf2a45aa2c4676b658ac43c8a1137b | CC BY 4.0; comercial permitido; atribución requerida | 302.6k triángulos, 171.6k vértices | El título individual confirma que no tiene tren de aterrizaje; 0 texturas declaradas | **Descartado**: falla un requisito explícito de S2 |
| [OUTPISTON — Airbus A380-800](https://sketchfab.com/3d-models/airbus-a380-800-9cc4aa572fa745f19d19ec8ee9826c21) · UID 9cc4aa572fa745f19d19ec8ee9826c21 | **CC BY-NC-SA 4.0**; no permite uso comercial y exige compartir derivados | 6.8k triángulos, 4.8k vértices | Descargable; licencia individual confirmada por la API | **Descartado explícitamente** por la restricción no comercial |
| [Raakesh.Madan — Airbus A380 (full interior HD)](https://sketchfab.com/3d-models/airbus-a380full-interior-hd-3155062bc0e545f897e8d766dbe7299e) · UID 3155062bc0e545f897e8d766dbe7299e | CC BY 4.0; comercial permitido; atribución requerida | 127.8k triángulos, 78.2k vértices | El propio título y descripción lo presentan como modelo con interior; 21 texturas; GLB listado de ~21.49 MB | **No se usa como exterior**: contradice la decisión de modelar el interior a medida |

## Licencia y atribución

La API individual de Sketchfab devuelve, para los candidatos CC BY, la licencia **Creative Commons Attribution 4.0** y la condición “Author must be credited. Commercial use is allowed.” La escritura final debe enlazar tanto al material como a la licencia y señalar cualquier modificación. La licencia oficial confirma que permite compartir y adaptar incluso comercialmente, sujeto a atribución y a indicar cambios:

- [Creative Commons — CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- [Creative Commons — CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- [Creative Commons — CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
- [Sketchfab Data API — modelo principal](https://api.sketchfab.com/v3/models/98d21f9c8104445f814cef47ef992889)

### Texto de atribución propuesto

> **Modelo exterior:** “Airbus A380” por **Brout** ([modelo original](https://sketchfab.com/3d-models/airbus-a380-98d21f9c8104445f814cef47ef992889)), utilizado bajo [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Adaptado para este proyecto: materiales, escala, optimización y/o jerarquía pueden modificarse durante el pipeline. La atribución no implica respaldo del autor.

### Diseño previsto dentro del footer

La atribución irá en un bloque colapsable o de baja jerarquía visual dentro del footer, con:

- encabezado visible: Créditos y licencias;
- enlace al modelo original y al autor;
- enlace a CC BY 4.0;
- nota “Adaptado para este proyecto” cuando se modifique el archivo;
- ninguna atribución pegada fuera del footer ni oculta sólo en comentarios del código.

La implementación visual real corresponde a la Fase 6; en Fase 0 queda definido el texto y su ubicación.

## Cierre y trabajo restante

La ruta autorizada ya desbloqueó la inspección estructural del candidato Brout y permite continuar con el exterior de Fase 0. No se redistribuye el ZIP ni el BLEND de terceros dentro del repositorio.

Quedan dos tareas declaradas, no ocultas:

- Limpiar o bakear la UV original antes de afirmar “sin solapamientos” en el pipeline de assets.
- Decidir si se conserva el material albedo-only con parámetros Principled o si se genera un set roughness/normal adicional; no se deben inventar mapas a partir de los metadatos.

La registración gruesa del interior está cerrada con una transformación única. El ajuste fino del plano de umbral, puertas, deck y cámara permanece como spike de la Fase 4.

La atribución prevista no cambia: el footer debe enlazar el modelo original de Brout, el autor, CC BY 4.0 y la nota de adaptación.

