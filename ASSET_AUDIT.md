# Fase 0 — Auditoría del asset exterior

**Fecha de auditoría:** 2026-08-04  
**Repositorio:** berrizjuane-collab/boeing-747  
**Decisión de producto vigente:** el proyecto usa un Airbus A380-800; el nombre del repositorio es histórico/cosmético. El exterior debe ser un asset existente con licencia CC BY; el interior será geometría propia.

## Resultado ejecutivo

- Se relevaron **9 candidatos** desde el catálogo descargable de Sketchfab.
- Se consultó la página individual y/o la respuesta individual de la API de cada candidato; no se tomó la licencia de un listado como prueba suficiente.
- Se excluyó explícitamente el modelo CC BY-NC-SA porque el proyecto puede publicarse como portfolio/producto.
- **Candidato preliminar recomendado:** [Airbus A380 — Brout](https://sketchfab.com/3d-models/airbus-a380-98d21f9c8104445f814cef47ef992889).
- **Estado de aprobación:** provisional. La licencia y el presupuesto inicial están verificados; la estructura interna del archivo todavía requiere descarga e inspección en Blender.
- **Ningún modelo se ha incorporado aún al repositorio.** No se redistribuye un archivo de terceros antes de cerrar la auditoría estructural.

## Criterio de aceptación

El candidato final sólo se aprueba cuando pasa las cuatro comprobaciones siguientes:

1. **Tren de aterrizaje:** existen ruedas/patas como nodos separados y jerarquizados, para permitir la retracción de S2.
2. **UVs:** no hay solapamientos accidentales ni UVs degeneradas en las superficies visibles.
3. **Materiales:** existen texturas/materiales PBR utilizables; no depende de un material horneado exclusivo de un renderer.
4. **Transformación:** escala y orientación se pueden corregir sin romper la jerarquía; la longitud final se puede registrar contra el interior propio.

La vista previa sólo permite comprobar la silueta y la presencia visual del tren. **No sustituye** la inspección del archivo fuente.

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

## Límites y siguiente verificación

La API y las páginas públicas permiten verificar licencia, descargabilidad, conteos, texturas/materiales declarados y metadatos del catálogo. No exponen aquí la jerarquía de nodos, la calidad de UVs ni la transformación exacta. El siguiente paso de asset debe ser:

1. descargar legalmente el candidato Brout desde Sketchfab;
2. abrirlo en Blender;
3. inspeccionar el árbol de nodos, UV Editor, materiales y dimensiones;
4. exportar una copia de prueba a GLB;
5. registrar en este documento los resultados y hashes del archivo de trabajo.

Hasta completar esos pasos, el candidato permanece **preseleccionado, no aprobado**.
