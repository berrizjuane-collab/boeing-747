# boeing-747

Sitio scrollytelling 3D de presentación de un Airbus A380-800. El nombre del
repositorio es histórico/cosmético — ver la decisión de producto en
[`PLAN.md`](./PLAN.md) §0.

**Documentación completa y estado real, fase por fase:** [`PLAN.md`](./PLAN.md)
(arquitectura y decisiones) y [`PROGRESS.md`](./PROGRESS.md) (checklist y
registro de sesiones).

## Estado actual

Fases 0–9 implementadas. El recorrido integra exterior e interior reales,
tres HDRI procedurales, KTX2/Basis, cruce de umbral, postproceso por tier,
overlays narrativos, hotspots, fallback sin WebGL2, accesibilidad y copy
técnica verificada contra fuentes primarias de Airbus y Rolls-Royce.

La auditoría final añadió una pasada responsive específica para teléfono,
un fondo de contraste medido para las fichas de datos y un flujo de QA
reproducible que compila, ejecuta el build de producción y captura el
recorrido en escritorio y móvil.

**Caveats conocidos:** la validación en Safari/iOS y Android físicos sigue
requiriendo dispositivos reales; S1/S2 superan ligeramente el objetivo de
draw calls por la fragmentación del asset exterior; y cuatro anclas de
hotspots de economy merecen una futura pasada de autoría visual. Ninguno
impide ejecutar el producto, pero permanecen documentados en
[`PROGRESS.md`](./PROGRESS.md).

> **Ronda 2 en curso — leer antes de dar el sitio por terminado.** Las 10
> fases de la ronda 1 están cerradas, pero una auditoría posterior concluyó
> que el resultado visual todavía se lee como un boceto estructural, por
> debajo del estándar del brief. El diagnóstico de causa raíz y el plan de
> corrección viven en [`plan2.md`](./plan2.md), con su checklist en
> [`progress2.md`](./progress2.md) — **esos son los documentos activos**;
> `PLAN.md` y `PROGRESS.md` quedan como registro cerrado de la ronda 1.

## Desarrollo

```
npm install
npm run dev       # servidor de desarrollo — abre en /boeing-747/, no en la raíz (ver "Deploy" más abajo)
npm run build     # build de producción (tsc + vite build)
npm run preview   # sirve dist/ localmente, mismo base path que producción
npm run qa:visual # capturas y recorrido grabado contra un preview local
npm run process-glb -- <in.glb> <out.glb>   # pipeline de assets: prune/dedup/weld/instance/Draco/KTX2
```

Modo de autoría de keyframes de cámara: tecla **D** dentro del sitio en
desarrollo, con `OrbitControls` y volcado de posición/target a consola y
portapapeles.

## Deploy

El sitio se publica en GitHub Pages vía `.github/workflows/deploy-pages.yml`:
cada push a `main` corre `npm ci && npm run build` y publica `dist/`
automáticamente. No hace falta ningún token ni cuenta externa — usa el
permiso `pages: write` que GitHub Actions ya tiene sobre este repo.

**Antes del primer deploy, una sola vez:** en GitHub, `Settings → Pages →
Build and deployment → Source`, elegir **GitHub Actions** (no "Deploy from a
branch"). Eso no lo puede hacer el workflow por sí solo — es un ajuste de
configuración del repositorio, no del código.

`vite.config.ts` fija `base: '/boeing-747/'` porque Pages sirve este
repositorio como *project site* en
`https://<usuario>.github.io/boeing-747/`, no en la raíz del dominio — todas
las rutas de asset en tiempo de ejecución (modelos `.glb`, HDRI, decoders
Draco/KTX2) están escritas con `import.meta.env.BASE_URL` en vez de rutas
absolutas por esto mismo. Si el repo cambia de nombre, o se sirve desde un
dominio propio (agregando un `CNAME`), ese valor de `base` hay que
actualizarlo para que coincida.

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
Ese pipeline produce texturas KTX2/Basis reales cuando el binario externo
`ktx` (KTX-Software) está instalado — si no, degrada con gracia a JPEG (ver
comentarios en `scripts/process-glb.mjs`). El transcoder Basis en tiempo de
ejecución está self-hosted en `public/basis/`, igual que el decoder Draco en
`public/draco/` — sin dependencia de un CDN externo.

### HDRI

`blender/generate_hdri.py` genera las HDRI reales de S1 (golden hour) y S3
(gran altitud) proceduralmente con el modelo de cielo físico Nishita de
Cycles, en vez de depender de una descarga externa (p. ej. Poly Haven):

```
blender --background --factory-startup --python blender/generate_hdri.py -- --preset golden-hour --output public/hdri/golden-hour.hdr
blender --background --factory-startup --python blender/generate_hdri.py -- --preset high-altitude --output public/hdri/high-altitude.hdr
```
