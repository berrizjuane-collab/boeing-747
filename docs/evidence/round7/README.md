# Evidencia — ronda 6, fases 3, 4 y 5

Base: `9837b273e040ec82822bc1f93e6f4e0eb5be7052`.
Registro: [`progress6.md`](../../../progress6.md), sección «fases 3, 4 y 5».

Esta carpeta contiene **sólo** archivos realmente producidos en esta sesión.
Nada aquí es una aceptación visual: son mediciones numéricas y salidas de
ejecución. La revisión de imagen a resolución nativa y en movimiento sigue
pendiente, igual que las fases 6–8 del plan.

## Qué hay

| Archivo | Qué es | Cómo se reproduce |
|---|---|---|
| `exterior-surface.json` | Auditoría de UV y normales del `exterior.glb` publicado (plan6 5.2 / A19). | `node scripts/audit-exterior-surface.mjs` |
| `runtime-smoke/report.json` | Diez ciclos S1→S5→S7→S5→S1 con recuento de recursos por ciclo. | `QA_CAPTURES=none QA_CYCLES=1 node scripts/runtime-qa.mjs` |
| `low/` | Pasada de capturas Low 960×640 con su informe. | `node scripts/runtime-qa.mjs` |
| `tests.txt` | Salida completa de `npm test`. | `npm test` |

Chromium 141.0.7390.37 con SwiftShader. Playwright necesita que se le
indique el ejecutable preinstalado:

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

## Lo que dicen los números

**Auditoría del exterior.** 11.040 de 67.580 triángulos del casco (16,3 %)
tienen UV de área cero, y la densidad de téxel varía ×8,36 entre los
percentiles 5 y 95. Las normales están todas normalizadas: esa parte de A19
está limpia. La consecuencia es que cualquier mapa ligado a `TEXCOORD_0`
queda plano sobre una sexta parte del avión, que es por lo que la rugosidad
procedural pasa a proyectarse desde espacio de objeto. **Reparar las UV es
una decisión aparte**, con licencia y coste, como contempla el propio plan.

La cifra de solapamiento del informe es una **cota superior**, no una
medición: los triángulos se estampan por su caja envolvente en UV, lo que
sobrecuenta. Se publica etiquetada como tal en vez de omitirla.

**Ciclos de recursos.** Recuentos idénticos en los diez ciclos, sin errores de
consola, red ni shader: es la propiedad que importa, porque lo que se está
comprobando es que no haya fuga al volver a entrar en la cabina. Medido: 120 geometrías, 41 texturas y 88
programas, frente a los 119/41/99 de la fase 2. La diferencia no se atribuye
pieza por pieza y no se presenta como una mejora: lo verificado es que no
crece entre ciclos.

## Lo que estas capturas no son

Las imágenes de `low/` se toman a 960×640; las que conservó la fase 2 en
`docs/evidence/round6/` son de 800×600. **No** constituyen una comparación
antes/después a nivel de píxel, y no se presentan como tal. La comparación
que pide el plan 5.x — misma cámara, mismo tier, misma exposición base y
mismo tiempo — exige rehacer ambos lados con el mismo viewport y sigue
pendiente, igual que la revisión visual a resolución nativa.

Lo que sí prueban es el contrato: cada captura lleva el progreso realmente
renderizado, la zona del store, la zona del DOM, el tier real, el FOV
efectivo y los contadores del renderer, y las siete coinciden con la zona que
les corresponde. Ese era el defecto A02.
