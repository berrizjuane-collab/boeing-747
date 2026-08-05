# boeing-747

Sitio scrollytelling 3D de presentación de un Airbus A380-800. El nombre del
repositorio es histórico/cosmético — ver la decisión de producto en
[`PLAN.md`](./PLAN.md) §0.

**Documentación completa y estado real, fase por fase:** [`PLAN.md`](./PLAN.md)
(arquitectura y decisiones) y [`PROGRESS.md`](./PROGRESS.md) (checklist y
registro de sesiones — **leer el bloqueo 🔴 al principio de `PROGRESS.md`
antes de tocar Fase 3 o Fase 4**).

## Estado actual

Fases 0–2 completas. Fases 3–4 avanzadas hasta el límite de lo que se podía
hacer sin el binario del exterior (bloqueado — ver `PROGRESS.md`), con un
adelanto real de Fase 5: el interior ya es geometría real recorrida con la
cámara, no un placeholder.

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
escalera, upper deck). El exterior es un asset CC BY de terceros (Brout,
auditado en `ASSET_AUDIT.md`) que **no se redistribuye en este
repositorio** — sólo los scripts reproducibles.

Fuentes reproducibles del interior (no dependen de ningún archivo externo):

- `blender/interior_blockout.py` — genera el BLEND y un GLB opcional.
- `blender/verify_blockout.py` — valida colecciones, bounds, asientos enlazados y metadatos de escena.
- `blender/render_preview.py` — genera una vista de QA (necesita libEGL/mesa para renderizar).

Fuentes reproducibles del exterior (**requieren un `A380.blend` autorizado
como input** — ver el bloqueo en `PROGRESS.md` si no está disponible):

- `blender/audit_exterior.py` — inspecciona fuente, jerarquía, UVs, materiales, imágenes y bounds.
- `blender/prepare_exterior.py` — crea una copia de trabajo, separa el tren, empaqueta la imagen y exporta GLB.
- `blender/verify_exterior.py` — reabre el BLEND y reimporta el GLB.
- `blender/register_interior.py` — registra el interior bajo una transformación única.
- `blender/verify_registration.py` — reabre la escena combinada y comprueba el envelope.
- `blender/render_exterior.py` — genera la vista exterior de QA.

Ejecución básica del exterior, con un archivo `A380.blend` autorizado ya disponible:

```
blender --background --factory-startup /absolute/path/A380.blend --python blender/audit_exterior.py -- --output /absolute/path/exterior_audit.json
blender --background --factory-startup /absolute/path/A380.blend --python blender/prepare_exterior.py -- --blend /absolute/path/exterior_working.blend --glb /absolute/path/exterior_working.glb
blender --background --factory-startup --python blender/verify_exterior.py -- --blend /absolute/path/exterior_working.blend --glb /absolute/path/exterior_working.glb --output /absolute/path/exterior_verification.json
```

El GLB resultante se procesa con `npm run process-glb` antes de usarse en la app.
