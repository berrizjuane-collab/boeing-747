# Fase 0 — Layout base del interior propio

**Estado:** layout narrativo y paramétrico definido; geometría Blender todavía no modelada.  
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
- El exterior elegido se alineará posteriormente con una transformación única de escena: traslación, rotación y escala. No se ajustarán zonas individuales a ojo.
- La transformación final sólo se puede cerrar después de inspeccionar el archivo exterior aprobado; por eso la alineación sigue pendiente.

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

## Verificación prevista en Blender

La geometría sólo podrá marcarse como completada cuando se cumpla todo esto:

- el archivo abre sin dependencias externas rotas;
- existen los cuatro módulos y el asiento base con los nombres del contrato;
- la cámara atraviesa las zonas sin colisiones evidentes;
- el asiento base puede repetirse sin duplicar geometría;
- se puede exportar una prueba GLB y volver a abrirla;
- la escena queda dentro del presupuesto de geometría de Fase 5;
- el origen, escala y orientación se registran después de la auditoría estructural del exterior.

## Bloqueo actual

Este entorno no tiene Blender instalado y el repositorio todavía no contiene un asset exterior aprobado. Por tanto, en esta sesión se completa la **definición del layout base**, pero no se marcan como terminados el asiento, los paneles ni la alineación. Esos puntos requieren producir y verificar geometría real.
