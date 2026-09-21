# Evidencia F5–F6 — 2026-09-21

Base remota: `6a8ef56bbaece739876b052025b9958f41e79ba8`.
Chromium 153.0.8010.0, SwiftShader, DPR 1. No datos de FPS de GPU física.
Las métricas se calculan sobre PNG a tamaño nativo. Las capturas permanecen
locales: la revisión automática rechazó publicar imágenes sin autorización
explícita. Este directorio conserva informes y comandos reproducibles.

## Narrativa y accesibilidad

[`narrative-report.json`](narrative-report.json) registra 15 estados,
cinco viewports, foco, Tab, movimiento reducido y texto al 200 %. Guarda
hashes de fuentes y bundle servido. Después de esa corrida cambiaron
`RunwayEnvironment.tsx` (relieve de nubes) y `PostFX.tsx` (calibración de bloom)
en código de producto; la UI probada es la final. Ambos cambios se verifican
en las capturas High finales.
También cambió el arnés de acabado para guardar checkpoints y concentrar
las adiciones intermedias en economy.

- Capturas locales: `artifacts/f5-f6/narrative-final/`, con cinco resoluciones.
- Texto 200 % (`text-200.png`): panel desplazado al final para demostrar acceso
  a los datos inferiores; el título queda por encima del scroll del panel,
  no perdido fuera de un contenedor inaccesible.
- [Sin WebGL](no-webgl.json): arranque con `--disable-webgl --disable-webgl2`,
  sin `?static`, cuatro zonas y tres fuentes técnicas disponibles.
- Panel opaco `#101923`; texto principal/datos `#e0e7ef`: contraste calculado
  **14,21:1**, calculado con luminancia sRGB, no con percentiles de una captura completa. Las
  superficies de tarjetas ya no dependen del color de fondo del canvas.

## Acabado

[`calibration-report.json`](calibration-report.json) registra once imágenes
High 960×640, `time=12`, iguales cámaras y exposición en todos los escalones:
hero/cockpit/economy/sunset sin efectos decorativos y completos; bloom, DoF y
haces se añaden por separado en economy. El modo base conserva tone mapping
y grading y no cambia el tier. Esa primera calibración (bloom 0,32/1,1)
se **descartó visualmente**: elevaba el fuselaje de luminancia media 199 a 220,
aunque tanto su ROI como la del cielo tenían 0 % de blancos recortados.

[`finish-report.json`](finish-report.json) verifica los cuatro planos con la
calibración final (bloom 0,10/umbral 2,5). Cada entrada guarda frame presentado,
tier, cámara, recursos y draw calls. Las ROI de hero separan fuselaje
(incluye marcas y borde inferior) y cielo; no son una segmentación semántica
automática de cada píxel del avión. Ambos informes conservan el hash del
bundle realmente servido para distinguir la iteración descartada de la final.

El antes remoto Low se conserva localmente en `artifacts/f5-f6/before/`;
no se compara Low antes con High después como si fuera una prueba aislada de
efectos. La comparación de efectos es la matriz High, dentro de la misma
revisión. `artifacts/f5-f6/finish/base-sunset.png` es la iteración anterior al
relieve; `verified-finish/` contiene la calibración intermedia y `final-finish/` la definitiva.

## Reproducción

```bash
npm ci
npm test
npm run lint
npm run qa:hdri
npm run qa:interior
npm run build
npx playwright install chromium
node scripts/narrative-qa.mjs
node scripts/finish-qa.mjs
```

Para un Chromium ya instalado se admite `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
Los PNG completos y estados de cada captura se guardan bajo `artifacts/f5-f6/`.
El arnés de acabado guarda el reporte después de cada imagen para conservar
resultados parciales si se interrumpe. `qa-source.mjs` registra el hash del
bundle construido además de los archivos fuente; un build anterior no se
atribuye silenciosamente al código actual.

## Límites

- Las capturas son planos deterministas; no certifican frame pacing, vídeo
  completo ni dispositivos Safari/iOS/Android físicos (F7–F8).
- La cabina/aeropuerto conservan su escala y simplificación artística. La
  capa de nubes es geometría y shading procedural, no un volumen físico.
- Las UV degeneradas del modelo exterior siguen mitigadas por proyección
  de rugosidad; no se sustituyó el asset.
- El build mantiene el aviso de chunk grande. No se marca F7/F8 como cerradas.
