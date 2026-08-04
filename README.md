# boeing-747

## Fase 0 — blockout interior

El repositorio usa un Airbus A380-800 como referencia de producto. El interior de v1 es geometría propia y procedural, preparada para cockpit, economy, escalera y upper deck.

Fuentes reproducibles:

- [`blender/interior_blockout.py`](./blender/interior_blockout.py) — genera el BLEND y un GLB opcional.
- [`blender/verify_blockout.py`](./blender/verify_blockout.py) — valida colecciones, bounds, asientos enlazados y metadatos de escena.
- [`blender/render_preview.py`](./blender/render_preview.py) — genera una vista de QA.

Ejecución básica:

```sh
A380_BLOCKOUT_OUTPUT=/absolute/path/interior_blockout.blend \
A380_EXPORT_GLB=/absolute/path/interior_blockout.glb \
blender --background --factory-startup --python blender/interior_blockout.py

blender --background /absolute/path/interior_blockout.blend --python blender/verify_blockout.py
```

Resultado verificado el 2026-08-04: 353 mallas en el BLEND, 250 asientos enlazados a `Seat_Base` y exportación GLB reimportable. La aprobación estructural del exterior CC-BY y la alineación final siguen documentadas como bloqueadas en [`PROGRESS.md`](./PROGRESS.md) y [`ASSET_AUDIT.md`](./ASSET_AUDIT.md).
