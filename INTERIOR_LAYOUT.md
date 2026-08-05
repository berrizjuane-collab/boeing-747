# Fase 0 — Layout base del interior propio

**Estado:** layout narrativo y paramétrico definido; blockout Blender ejecutado, reabierto y verificado. La registración gruesa con el exterior ya está ejecutada y verificada; el ajuste fino del umbral y las puertas queda para la Fase 4.  
**Fuentes reproducibles:** [`blender/interior_blockout.py`](./blender/interior_blockout.py), [`blender/verify_blockout.py`](./blender/verify_blockout.py) y [`blender/render_preview.py`](./blender/render_preview.py).  
**Alcance:** v1 con tres zonas narrativas: cabina de mando, economy y escalera + piso superior. La última se divide en dos módulos geométricos porque necesita una transición vertical.

## Principio de diseño

El interior no será una réplica certificada del A380. Será una recreación propia, controlada y optimizada para la cámara de walkthrough de la Sección 5. Las medidas de este documento son **parámetros de diseño del proyecto**, no afirmaciones sobre la configuración de una aerolínea real.

La geometría debe privilegiar lo que verá la cámara:

- lectura clara del pasillo y de la anchura de la cabina;
- repetición de asientos mediante instancing;
- siluetas fuertes para paneles, puertas, ventanillas y escaleras;
- iluminación integrada en cornisas y paneles;
- ausencia de detalle invisible desde el recorrido.

## Sistema de coordenadas

- Unidades Blender: metros.
- Eje Y: arriba.
- Eje X: izquierda/derecha de la cabina.
- Eje Z: longitudinal; nariz en Z = 0 y parte trasera hacia Z positivo.
- Origen del interior: centro del piso de la cabina de mando.
- El exterior elegido se registró con una transformación única de escena en Exterior_Root: rotación X = −90° y traslación (0, 0, 28,9781) m; no se ajustaron zonas individuales a ojo.
- El blockout se registró con Interior_Registration_Root = (0, 3,2, 0,3) m. Los bounds visibles resultantes son 6,32 × 4,58 × 58,00 m y quedan dentro del envelope exterior.
- Esta es una registración gruesa de Fase 0; el plano de umbral, puertas, decks y recorrido de cámara se validan en el spike de la Fase 4.

## Recorrido de cámara y módulos

La v1 conserva el arco completo con cuatro módulos geométricos:

| Orden | Zona narrativa | Módulo | Rango de diseño Z | Función visual |
|---:|---|---|---:|---|
| 1 | Cabina de mando | Cockpit | 0–8 m | Entrada al interior; panel frontal, ventanas y consola |
| 2 | Economy | Main cabin | 8–34 m | Repetición de asientos, pasillo central y lectura de anchura |
| 3 | Escalera + piso superior | Stair transition | 34–40 m | Cambio vertical y umbral narrativo |
| 3 | Escalera + piso superior | Upper deck | 40–58 m | Clímax del doble piso; pasillo más contenido y vista hacia adelante |

La cámara debe entrar a aproximadamente 1.60 m de altura. Cada módulo termina con una meseta espacial para que el overlay de esa zona pueda leerse sin frenar artificialmente todo el recorrido.

## Parámetros de blockout

Estos valores son el contrato inicial del blockout y pueden cambiar sólo mediante una anotación de auditoría:

- Cubierta principal: ancho interior de diseño 6.20 m; altura útil 2.20 m.
- Cubierta superior: ancho interior de diseño 5.50 m; altura útil 2.05 m.
- Pasillo principal: ancho libre 1.20 m.
- Separación lateral entre bloque de asientos y pared: 0.12 m mínimo.
- Paso longitudinal inicial de filas: 0.79 m.
- Escalera: ancho libre 1.05 m; 15–17 peldaños; descanso intermedio visible desde el pasillo.
- Paneles: módulos de 2.40 m longitudinales para repetir materiales y mantener draw calls controladas.
- Ventanillas: instancias por fila; se conserva una guía de luz fría exterior para la iluminación de S5.

No se añadirá una sexta o séptima zona en Fase 0: primera clase y business/economy plus permanecen fuera de la v1, como establece PLAN.md.

## Contrato del asiento base

El asiento será un único mesh base preparado para InstancedMesh:

- origen en el centro de la huella del asiento, apoyado en Y = 0;
- ancho de diseño: 0.48 m;
- profundidad de diseño: 0.52 m;
- altura total de diseño: 1.15 m;
- piezas visuales mínimas: cojín, respaldo, reposabrazos y carcasa;
- variaciones por instancia: color de tapizado, estado de pantalla, posición de mesa y fila;
- no modelar mecanismos internos ni superficies ocultas desde el pasillo.

El contrato de nombres previsto para la escena es:

- Interior_Root
- Zone_Cockpit
- Zone_Economy
- Zone_Stair
- Zone_UpperDeck
- Seat_Base
- Seat_Screen
- Panel_Ceiling_Module
- Panel_Window_Module
- Stair_Main
- Stair_Railing

La lista de nombres sirve para que el pipeline pueda encontrar módulos sin depender de índices de malla.

## Contrato de paneles e iluminación

Cada zona tendrá paneles modulares con tres niveles:

1. silueta estructural: techo, costados, piso y puertas;
2. lectura de cámara: ventanillas, compartimientos, galley simplificada, luminarias;
3. acentos: señalética ficticia, líneas de luz y materiales de la marca neutral.

La iluminación se resolverá en la implementación con luces de cabina y emisivos ligeros. Las texturas y la marca de una aerolínea real no forman parte de este layout.

## Verificación ejecutada en Blender — 2026-08-04

- Blender 5.2.0 LTS arrancó en modo headless y `bpy` cargó correctamente.
- El archivo BLEND se guardó, se reabrió y pasó [`blender/verify_blockout.py`](./blender/verify_blockout.py): 353 mallas; colecciones `Zone_Cockpit` (15), `Zone_Economy` (220), `Zone_Stair` (20), `Zone_UpperDeck` (98) y `Technical` (4); 250 asientos enlazados a `Seat_Base`, con 251 usuarios de la malla maestra; bounds mundiales de 6.32 × 4.58 × 58.26 m.
- El GLB se exportó y volvió a abrir en Blender: 360 objetos, 354 mallas, 11 materiales y 750,952 bytes.
- Se generó una vista QA en Workbench y se inspeccionó visualmente: el pasillo, las filas, los paneles, las ventanillas y la escalera son legibles en el blockout.
- El recorrido de cámara narrativo completo sigue siendo trabajo de la Fase 2; no se marca aquí como terminado.

## Estado al cierre de Fase 0

El blockout propio está terminado y verificado. La escena registrada con el exterior se guardó, se reabrió y pasó los checks de conteo, jerarquía, transformación y envelope. La evidencia reproducible está en blender/register_interior.py y blender/verify_registration.py.

El asset exterior conserva dos limitaciones explícitas: la UV original no es limpia/no solapada según select_overlap y el material sólo aporta albedo conectado a un Principled BSDF. Ninguna de las dos se marca como completa por inferencia. El ajuste final de umbral/puertas y la decisión sobre limpieza UV/PBR quedan trazados para las fases posteriores.
El blockout propio de Fase 0 está terminado y verificado. La alineación final requiere el exterior CC-BY aprobado, pero Sketchfab exige autenticación para descargar el candidato Brout y no se recibió un archivo fuente autorizado. Por eso no se marcan como cerrados los checks de jerarquía del tren, UVs limpias, PBR, escala/orientación ni registración exterior/interior.
