# boeing-747

Sitio scrollytelling 3D de presentación de un Airbus A380-800. El nombre del
repositorio es histórico/cosmético — ver la decisión de producto en
[`PLAN.md`](./PLAN.md) §0.

**Documentación completa y estado real, fase por fase:** [`PLAN.md`](./PLAN.md)
(arquitectura y decisiones) y [`PROGRESS.md`](./PROGRESS.md) (checklist y
registro de sesiones).

## Estado actual

Fases 0–2 completas y núcleo de Fase 3 implementado, incluyendo el
exterior real (ya no hay bloqueo: el binario fuente está en `blender/source/`,
ver más abajo). Fase 3 conserva dos condiciones explícitas: HDRI reales para
S1/S3 y KTX2/Basis en el artefacto exterior final. Fase 4 (umbral) y un
adelanto de Fase 5 (interior) funcionan con geometría real de ambos lados —
exterior e interior — recorrida con la cámara, no placeholders.

## Desarrollo

```
npm install
npm run dev       # servidor de desarrollo
npm run build     # build de producción (tsc + vite build)
npm run process-glb -- <in.glb> <out.glb>   # pipeline de assets: prune/dedup/weld/instance/Draco/KTX2
```

Modo de autoría de keyframes de cámara: tecla **D** dentro del sitio en
desarrollo, con `OrbitControls` y volcado de posición/target a consola y
portapapeles.

## Blender — assets fuente

El interior de v1 es geometría propia y procedural (cockpit, economy,
escalera, upper deck). El exterior es un asset CC BY de terceros — “Airbus
A380” por **Brout** ([modelo original](https://sketchfab.com/3d-models/airbus-a380-98d21f9c8104445f814cef47ef992889),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), auditado en
`ASSET_AUDIT.md` — cuyo binario fuente **sí se redistribuye en este
repositorio** en `blender/source/` (ver `blender/source/ATTRIBUTION.md`),
junto con los scripts que lo transforman, para que el pipeline completo sea
reproducible desde un clon limpio sin depender de un archivo externo.

Fuentes reproducibles del interior (no dependen de ningún archivo externo):

- `blender/interior_blockout.py` — genera el BLEND y un GLB opcional.
- `blender/verify_blockout.py` — valida colecciones, bounds, asientos enlazados y metadatos de escena.
- `blender/render_preview.py` — genera una vista de QA (necesita libEGL/mesa para renderizar).

Fuentes reproducibles del exterior (input: `blender/source/A380.blend` + `blender/source/A380.JPG`, ya en el repo):

- `blender/audit_exterior.py` — inspecciona fuente, jerarquía, UVs, materiales, imágenes y bounds.
- `blender/prepare_exterior.py` — crea una copia de trabajo, separa el tren, empaqueta la imagen y exporta GLB.
- `blender/verify_exterior.py` — reabre el BLEND y reimporta el GLB.
- `blender/register_interior.py` — registra el interior bajo una transformación única.
- `blender/verify_registration.py` — reabre la escena combinada y comprueba el envelope.
- `blender/render_exterior.py` — genera la vista exterior de QA.

Ejecución básica del exterior, desde la raíz del repo:

```
blender --background --factory-startup blender/source/A380.blend --python blender/audit_exterior.py -- --output /tmp/exterior_audit.json
blender --background --factory-startup blender/source/A380.blend --python blender/prepare_exterior.py -- --blend /tmp/exterior_working.blend --glb /tmp/exterior_working.glb
blender --background --factory-startup --python blender/verify_exterior.py -- --blend /tmp/exterior_working.blend --glb /tmp/exterior_working.glb --output /tmp/exterior_verification.json
```

El GLB resultante se procesa con `npm run process-glb` antes de usarse en la
app (así se generó el `public/models/exterior.glb` ya presente en el repo).
