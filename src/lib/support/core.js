import { analyze, fromManifold, toManifold } from '../split/core.js';

const EPS = 1e-4;
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || a));

function disposeAll(items) {
  for (const item of items) try { item?.delete?.(); } catch { /* WASM ya liberado */ }
}

function crossSectionRegions(section, minArea, bridgeWidth) {
  const pieces = section.decompose();
  let count = 0, area = 0;
  for (const piece of pieces) {
    const a = piece.area(), b = piece.bounds(), narrow = Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1]);
    // Una isla de una sola línea puede comportarse como puente/perímetro;
    // se informa implícitamente en el mapa, pero no exige agregar material.
    if (a >= minArea && narrow > bridgeWidth + EPS) { count++; area += a; }
    piece.delete();
  }
  return { count, area };
}

export function supportSettings(input = {}) {
  const angle = clamp(input.angle ?? 50, 35, 90);
  const layerHeight = clamp(input.layerHeight ?? .2, .08, .4);
  const extrusionWidth = clamp(input.extrusionWidth ?? .42, .2, 1.2);
  return {
    angle,
    layerHeight,
    extrusionWidth,
    minRegionArea: clamp(input.minRegionArea ?? 1, .05, 500),
    maxAddedPercent: clamp(input.maxAddedPercent ?? 35, 1, 200),
    preserveHoles: input.preserveHoles !== false,
    // Convención Orca: 90° no admite desplazamiento; valores menores
    // permiten una pendiente más extendida por capa.
    lateralStep: angle >= 89.999 ? 0 : layerHeight / Math.tan(angle * Math.PI / 180),
  };
}

export function analyzeLayers(M, part, input = {}) {
  const settings = supportSettings(input);
  const info = analyze(part);
  if (info.open) throw new Error(`La pieza tiene ${info.open} aristas abiertas. Cerrá o repará la malla antes de optimizarla.`);
  if (info.nonManifold) throw new Error(`La pieza tiene ${info.nonManifold} aristas no-manifold. Repará esas uniones antes de optimizarla.`);
  if (info.flipped) throw new Error(`La pieza tiene ${info.flipped} aristas con orientación inconsistente. Reorientá las caras antes de optimizarla.`);
  if (info.components !== 1) throw new Error(`La pieza todavía contiene ${info.components} componentes conectados. Separalos antes de optimizarla.`);
  if (!(info.volume > EPS)) throw new Error('La pieza está invertida o no encierra un volumen positivo. Reorientá sus caras antes de optimizarla.');
  const height = info.max[2] - info.min[2];
  const layers = Math.ceil(height / settings.layerHeight);
  if (layers > 500) throw new Error(`El modelo requiere ${layers} capas de análisis. Esta primera versión admite hasta 500; aumentá la altura de capa o usá una pieza más baja.`);
  if (layers < 2) throw new Error('El modelo es demasiado bajo para analizarlo con la altura de capa elegida.');

  const man = toManifold(M, part), sections = [], bands = [];
  try {
    const step = height / layers;
    for (let i = 0; i < layers; i++) sections.push(man.slice(info.min[2] + (i + .5) * step));
    let regions = 0, unsupportedArea = 0;
    for (let i = 1; i < sections.length; i++) {
      // El offset inverso usado al reconstruir puede volver con unas micras de
      // diferencia por Clipper/WASM. Esta tolerancia (2 % del paso, nunca una
      // línea de extrusión completa) evita contar esa costura como voladizo.
      // Media línea puede apoyarse sobre el perímetro inferior; por eso el
      // ancho de extrusión participa del criterio, sin convertirse en soporte.
      const allowance = settings.lateralStep + settings.extrusionWidth / 2 + Math.max(EPS * 20, settings.lateralStep * .02);
      const reachable = allowance > EPS ? sections[i - 1].offset(allowance, 'Miter') : sections[i - 1];
      const unsupported = sections[i].subtract(reachable);
      const critical = crossSectionRegions(unsupported, settings.minRegionArea, settings.extrusionWidth);
      if (critical.count) {
        regions += critical.count; unsupportedArea += critical.area;
        bands.push({ z: info.min[2] + i * step, area: critical.area, regions: critical.count });
      }
      unsupported.delete();
      if (reachable !== sections[i - 1]) reachable.delete();
    }
    return { settings: { ...settings, layerHeight: step }, info, layers, regions, unsupportedArea, bands };
  } finally { disposeAll(sections); man.delete(); }
}

export function optimizeSupport(M, part, input = {}) {
  const analysis = analyzeLayers(M, part, input), { info } = analysis;
  const settings = analysis.settings;
  if (settings.angle >= 89.999 || analysis.regions === 0) {
    return { part: { ...part }, added: null, analysis, stats: { originalVolume: info.volume, optimizedVolume: info.volume, addedVolume: 0, modifiedPercent: 0, corrected: 0, unresolved: analysis.regions, valid: analysis.regions === 0 } };
  }

  const original = toManifold(M, part), originalID = original.originalID();
  const sections = [], targets = [], additions = [], slabs = [];
  try {
    for (let i = 0; i < analysis.layers; i++) sections.push(original.slice(info.min[2] + (i + .5) * settings.layerHeight));
    targets[analysis.layers - 1] = new M.CrossSection(sections[analysis.layers - 1].toPolygons());
    for (let i = analysis.layers - 2; i >= 0; i--) {
      const propagated = targets[i + 1].offset(-settings.lateralStep, 'Miter').simplify(Math.max(EPS, settings.lateralStep * .02));
      targets[i] = sections[i].add(propagated);
      propagated.delete();
    }

    for (let i = 0; i < analysis.layers; i++) {
      const extra = targets[i].subtract(sections[i]);
      if (extra.area() >= settings.minRegionArea) {
        additions.push(extra);
        const z = info.min[2] + i * settings.layerHeight;
        slabs.push(extra.extrude(settings.layerHeight + EPS).translate([0, 0, z - EPS / 2]));
      } else extra.delete();
    }
    if (!slabs.length) throw new Error('Se detectaron voladizos, pero no existe una corrección que supere el tamaño mínimo configurado.');

    let addedMan = slabs[0];
    for (let i = 1; i < slabs.length; i++) addedMan = addedMan.add(slabs[i]);
    const addedVolume = addedMan.volume();
    const modifiedPercent = addedVolume / info.volume * 100;
    if (modifiedPercent > settings.maxAddedPercent) {
      throw new Error(`La corrección agregaría ${modifiedPercent.toFixed(1)} % de volumen, por encima del límite de ${settings.maxAddedPercent.toFixed(0)} %. No se generó un resultado engañoso.`);
    }
    const result = original.add(addedMan);
    const out = fromManifold(result, originalID);
    const outInfo = analyze(out);
    if (!outInfo.closed || outInfo.nonManifold || outInfo.open || !(outInfo.volume > info.volume + EPS)) {
      throw new Error('La reconstrucción no produjo una malla cerrada y modificada; se conservó el original.');
    }
    const added = fromManifold(addedMan, addedMan.originalID());
    const post = analyzeLayers(M, out, settings);
    const unresolved = post.regions;
    result.delete();
    return {
      part: { ...out, name: `${part.name || 'modelo'}_BATSUPPORT` }, added,
      analysis,
      stats: {
        originalVolume: info.volume, optimizedVolume: outInfo.volume,
        addedVolume: outInfo.volume - info.volume,
        modifiedPercent: (outInfo.volume - info.volume) / info.volume * 100,
        corrected: Math.max(0, analysis.regions - unresolved), unresolved,
        valid: unresolved === 0 && outInfo.closed && !outInfo.nonManifold && !outInfo.open,
      },
    };
  } finally {
    disposeAll(sections); disposeAll(targets); disposeAll(additions);
    // Los slabs forman una expresión diferida compartida; liberar cada hoja al final.
    disposeAll(slabs); original.delete();
  }
}
