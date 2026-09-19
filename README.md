# MERIDIAN — Airbus A380-800

Experiencia scrollytelling 3D de presentación de un Airbus A380-800. El slug
del repositorio, `boeing-747`, se conserva únicamente por compatibilidad con
la URL histórica de GitHub Pages; el producto, el paquete y toda la metadata
se denominan **MERIDIAN — Airbus A380-800**.

**Documentación activa:** [`plan6.md`](./plan6.md) y [`progress6.md`](./progress6.md).
Las rondas anteriores se conservan como historial. El producto aún requiere
correcciones visuales; sus declaraciones históricas de cierre no sustituyen
la validación actual.

## Estado actual

Implementación de las primeras tres fases del plan 6 (**0, 1 y 2**): diagnóstico
reproducible, progreso presentado único, preparación real y recuperación de
assets, propiedad estable de recursos y reconstrucción/registro de la cabina.
Consulta resultados y límites en `progress6.md` y el contrato geométrico en
[`INTERIOR_LAYOUT.md`](./INTERIOR_LAYOUT.md). Las fases 3–7 siguen pendientes:
coreografía, transiciones, materiales/iluminación, móvil y rendimiento final.

## Desarrollo

```
npm install
npm run dev       # servidor de desarrollo — abre en /boeing-747/, no en la raíz (ver "Deploy" más abajo)
npm run build     # build de producción (tsc + vite build)
npm run preview   # sirve dist/ localmente, mismo base path que producción
npm test          # estado/zonas, cámara, entorno, portal, pista, PBR, bosque/pasto/aeródromo (plan5)
npm run qa:hdri   # mide luminancia real y exige ratio máximo < 4x
npm run qa:interior # estructura/PBR/instancing/presupuesto del GLB publicado
npm run qa:d3     # serie cuadro a cuadro 70–85% contra un preview local
npm run qa:visual # capturas y recorrido grabado contra un preview local
# CI separa la evidencia sin rebajarla: VISUAL_QA_MODE=screenshots|video
npm run qa:clips  # deriva 3 clips MP4 usando el timeline real del recorrido
npm run process-glb -- <in.glb> <out.glb>   # pipeline: prune/dedup/weld/instance/Draco/KTX2
# Para interiores repetitivos: añade --join-draw-calls después de <out.glb>
```

Modo de autoría de keyframes de cámara: tecla **D** dentro del sitio en
desarrollo, con `OrbitControls` y volcado de posición/target a consola y
portapapeles.

## Deploy

El sitio se prepara para GitHub Pages vía `.github/workflows/deploy-pages.yml`:
cada push a `main` corre `npm ci && npm run build` y archiva `dist/`. Si el
repositorio es público, también lo publica automáticamente. Si permanece
privado, el deploy se habilita con la variable de repositorio
`PAGES_ENABLED=true` una vez que el plan de la cuenta admita Pages para
repositorios privados. No hace falta ningún token ni cuenta externa — usa el
permiso `pages: write` que GitHub Actions ya tiene sobre este repo.

**Antes del primer deploy, una sola vez:** en GitHub, `Settings → Pages →
Build and deployment → Source`, elegir **GitHub Actions** (no "Deploy from a
branch"). En un repo privado, además crear `Settings → Secrets and variables
→ Actions → Variables → PAGES_ENABLED` con valor `true`, pero sólo después de
que Pages esté disponible para la cuenta. Es configuración del repositorio,
no del código.

`vite.config.ts` fija `base: '/boeing-747/'` porque Pages sirve este
repositorio como *project site* en
`https://<usuario>.github.io/boeing-747/`, no en la raíz del dominio — todas
las rutas de asset en tiempo de ejecución (modelos `.glb`, HDRI, decoders
Draco/KTX2) están escritas con `import.meta.env.BASE_URL` en vez de rutas
absolutas por esto mismo. Si el repo cambia de nombre, o se sirve desde un
dominio propio (agregando un `CNAME`), ese valor de `base` hay que
actualizarlo para que coincida.

## Blender — assets fuente

El interior es geometría propia y procedural final (cockpit, economy,
escalera cerrada y upper deck): 240 asientos GPU-instanciados, 16 materiales
PBR, 40 lotes de render y 280.312 triángulos de asset antes del culling de
cámara, publicados en un GLB de 112.724 bytes. El exterior es un asset CC BY
de terceros — “Airbus
A380” por **Brout** ([modelo original](https://sketchfab.com/3d-models/airbus-a380-98d21f9c8104445f814cef47ef992889),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), auditado en
`ASSET_AUDIT.md` — cuyo binario fuente **sí se redistribuye en este
repositorio** en `blender/source/` (ver `blender/source/ATTRIBUTION.md`),
junto con los scripts que lo transforman, para que el pipeline completo sea
reproducible desde un clon limpio sin depender de un archivo externo.

Fuentes reproducibles del interior (no dependen de ningún archivo externo):

- `blender/interior_blockout.py` — genera el BLEND y un GLB opcional.
- `blender/verify_blockout.py` — valida colecciones, bounds, asientos enlazados y metadatos de escena.
- `blender/render_preview.py` — genera cuatro vistas PBR reproducibles con Cycles CPU.

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

`blender/generate_hdri.py` genera las HDRI de S1 (golden hour), S3 (gran
altitud) y S6 (atardecer) con el modelo físico Nishita, a 4096×2048, y las
calibra por luminancia media del cuerpo de cielo —excluyendo el disco solar,
que de otro modo domina cualquier media aritmética sin relación con qué tan
brillante se ve el cielo realmente (plan3.md bug #3)— en vez de depender de
una descarga externa:

```
blender --background --factory-startup --python blender/generate_hdri.py -- --preset golden-hour --output public/hdri/golden-hour.hdr
blender --background --factory-startup --python blender/generate_hdri.py -- --preset high-altitude --output public/hdri/high-altitude.hdr
blender --background --factory-startup --python blender/generate_hdri.py -- --preset sunset --output public/hdri/sunset.hdr
```
