# Cabina MERIDIAN — contrato de geometría, ronda 6

El producto representa un Airbus A380 aunque el repositorio se llame
`boeing-747`. La cabina es un tramo original representativo, no un plano
certificado ni la configuración completa de una aerolínea.

## Fuente de verdad

`blender/interior_cabin.py` construye la cabina; `interior_blockout.py` conserva
sus helpers históricos y delega al nuevo constructor. El constructor exporta
`src/lib/interior-manifest.json`; `sceneLayout.ts` utiliza ese manifiesto para
anclas, portales, cámara, iluminación y registro. Evitar offsets independientes.

| Parámetro | Contrato |
|---|---|
| Coordenadas fuente | X lateral, Y arriba, Z hacia la cola; metros |
| Frame en vuelo | posición [0,40,-80], pitch −3° |
| Interior / exterior local | [0,−3,−30] / [0,−8.5,−35] |
| Corrección glTF en runtime | +90° sobre X, antes del frame compartido |
| Zonas | cockpit 0–8; economy 8–26; escalera 26–32; superior 32–41.5 |
| Piso superior | Y=2.45 |
| Semiancho main / upper | 3.2 / 2.78 |
| Distribución | main 3-4-3, 20 filas; upper 2-4-2, 8 filas; 2 pilotos |
| Asientos / ancho | 266 / 0.46 |
| Pasillos | centros X=±1.32; dos pasillos transitables |
| Puerta superior port | centro [−2.78,4.05,40.5], hueco Z=39.8–41.2 |

La disposición 3-4-3 puede contrastarse con el [mapa oficial A380 de ANA](https://www.ana.co.jp/en/jp/guide/prepare/seatmap/international/a380/).
El 2-4-2 superior es una elección representativa del proyecto: no se atribuye
al mapa ANA ni se afirma fidelidad dimensional de ingeniería. El copy dice
«configuración representada», sin prometer toda la longitud real de cabina.

## Construcción y registro

Cockpit orientado hacia −Z, paneles/parabrisas delante y puerta posterior.
Dos pasillos, bins fuera de ellos, techo curvo, escalera de 16 peldaños sobre
el pasillo port. El piso superior sirve de descansillo, sin losas coplanares.
Cierre posterior siguiendo la curva del techo, antes de la intrusión de cola.

Asientos enlazados y agrupados por zona/bloques de hasta cinco filas: siete
batches de instancias. Estructura opaca y con escritura de profundidad.
No usar el antiguo join global ni transparencias para ocultar problemas de LOD.
`process-glb.mjs` redirige los assets interior al procesador espacial.

```bash
# Blender 4.5 LTS; o Python con bpy 4.5.3
blender --background --python blender/interior_blockout.py
node scripts/process-interior.mjs
npm run qa:interior
node scripts/extract-hull.mjs
node scripts/export-cabin-route.mjs
blender --background --python blender/verify_cabin.py
blender --background --python blender/register_interior.py
blender --background --python blender/verify_registration.py
```

Los artefactos intermedios se escriben en `artifacts/phase6/`. El extractor
aplica matrices de nodos reales del exterior y produce sus triángulos en
coordenadas de la cabina. También genera una copia sin KTX2 para inspección en
Blender; no altera el GLB exterior publicado.

El verificador muestrea 3.751 posiciones del recorrido, contra los triángulos
del BLEND fuente y del GLB reimportado. Radio 0.18 m + margen 0.05 m, con
envolvente adicional 0.052 m para oscilación durante S5. Los cruces deliberados
de nariz/puerta se excluyen sólo del chequeo contra hull, no contra estructura
interior. Se verifican bounds y cinco anclas bajo la matriz canónica.

## Inspección

`?qa=1&quality=low&time=12` fija tier y reloj antes del primer render.
Añadir `view=hull|interior|both`, `wireframe=1` o `zones=1` para diagnóstico.
El arnés `npm run qa:runtime` espera frames convergentes, registra hashes de
fuentes y guarda capturas con y sin overlays. Ver `progress6.md` para resultados
reales y pendientes. Las fases 3–7 siguen cubriendo coreografía, materiales,
iluminación, móvil y rendimiento final.
