# BAT Color Engine — auditoría y hoja de ejecución

Fecha: 2026-10-30

## Alcance auditado

BATSplit vive en `src/pages/Split.jsx`, `src/components/SplitViewer.jsx` y `src/lib/split/`.
La carga STL/OBJ/3MF está en `io.js`; el worker es `worker.js`; la topología y
validación están repartidas entre `core.js`, `regions.js` y `path.js`; la salida
STL/ZIP está en `export.js`.

El motor usa `manifold-3d` en un Web Worker. La UI usa React y Three.js. Ya
existen importación, visor, corte por plano, selección por color/ángulo/pincel,
anclas baricéntricas, historial, validación básica y STL/ZIP.

## Caso de regresión obligatorio

`Batman+Echo+dot+Stand-U1.3mf`:

- 454.350 triángulos y 227.133 vértices.
- Cuatro componentes cerrados; cero aristas abiertas/no-manifold.
- Pintura fina por triángulo.

El archivo original es válido; los agujeros que aparecen después de separar son
una regresión de BATSplit, no un defecto que deba atribuirse al modelo.

## Causa confirmada

`path.js` recibe nodos como `{face, bary}` pero el trazado los reduce a
vértices de la triangulación antes de aplicar Dijkstra. `maskInsideLoop()` solo
puede bloquear aristas existentes. Por tanto, un segmento que atraviesa el
interior de una cara no crea una barrera topológica y la inundación puede elegir
caras fuera del contorno o la cara posterior. La máscara incorrecta llega a
`cutRegion()`, que intenta producir sólidos con una región que no representa la
selección visual.

## Arquitectura de implementación

1. **Mesh Analyzer**: cache único de cara/arista/vértice, componentes, normales,
   bordes abiertos, no-manifold y degeneradas. No modifica la malla.
2. **Surface Selection**: anclas cara+baricéntricas y edición no destructiva.
3. **Surface Perimeter**: rutas cara-a-cara y subdivisión de las caras cruzadas;
   el perímetro debe convertirse en barrera superficial explícita.
4. **Region Segmentation**: flood-fill bloqueado por esa barrera, selección de
   lado explícita, cavidades conservadas y varias regiones independientes.
5. **Solid Generation**: solo al confirmar; generar tapas/paredes y validar
   cada resultado antes de reemplazar la pieza original.
6. **Validation/Export**: comprobar cierre, manifold, volumen y reimportación
   STL/3MF. No presentar como imprimible una pieza que no valide.

## Orden de trabajo aprobado

- Fase 1: extraer el analizador topológico y fijar el 3MF real como prueba.
- Fase 2: sustituir la barrera solo-por-aristas por una barrera sobre caras.
- Fase 3: usar la máscara resultante para selección visual e inversión, sin
  booleanas.
- Fase 4: rehacer la generación de sólidos sobre esa máscara validada.
- Fase 5: validación y exportación, incluidos casos de regresión.

No se copiará código de referencias externas; sus conceptos se usan solo como
guía de arquitectura.
