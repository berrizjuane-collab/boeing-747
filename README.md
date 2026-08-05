# boeing-747

## Fase 0 — blockout interior y exterior auditado

El repositorio usa un Airbus A380-800 como referencia de producto. El interior de v1 es geometría propia y procedural, preparada para cockpit, economy, escalera y upper deck. El exterior CC BY de Brout se recibió por una ruta autorizada, se auditó en Blender y se dejó como copia de trabajo fuera del repositorio; el binario de terceros no se redistribuye aquí.

Fuentes reproducibles del interior:

- blender/interior_blockout.py — genera el BLEND y un GLB opcional.
- blender/verify_blockout.py — valida colecciones, bounds, asientos enlazados y metadatos de escena.
- blender/render_preview.py — genera una vista de QA.

Fuentes reproducibles del exterior:

- blender/audit_exterior.py — inspecciona fuente, jerarquía, UVs, materiales, imágenes y bounds.
- blender/prepare_exterior.py — crea una copia de trabajo, separa el tren, empaqueta la imagen y exporta GLB.
- blender/verify_exterior.py — reabre el BLEND y reimporta el GLB.
- blender/register_interior.py — registra el interior bajo una transformación única.
- blender/verify_registration.py — reabre la escena combinada y comprueba el envelope.
- blender/render_exterior.py — genera la vista exterior de QA.

Ejecución básica del exterior, con un archivo A380.blend autorizado ya abierto como entrada:

    blender --background --factory-startup /absolute/path/A380.blend --python blender/audit_exterior.py -- --output /absolute/path/exterior_audit.json
    blender --background --factory-startup /absolute/path/A380.blend --python blender/prepare_exterior.py -- --blend /absolute/path/exterior_working.blend --glb /absolute/path/exterior_working.glb
    blender --background --factory-startup --python blender/verify_exterior.py -- --blend /absolute/path/exterior_working.blend --glb /absolute/path/exterior_working.glb --output /absolute/path/exterior_verification.json

Cierre verificado el 2026-08-04: el BLEND de trabajo reabrió con 119 objetos, 116 meshes y 115 piezas jerarquizadas del tren; el GLB reimportó con 119 objetos, 116 meshes y un material Principled con albedo. La escena registrada con el interior reabrió con 357 objetos de interior y 353 meshes. La Fase 0 está cerrada a nivel operativo, con dos limitaciones registradas en ASSET_AUDIT.md y PROGRESS.md: UV original solapada y material albedo-only. El umbral/puertas y la limpieza UV/PBR no se declaran terminados.
