// BATSplit 3D · selección conectada de caras y separación de una región superficial.
// Los cálculos son independientes del visor para poder probarlos en Node y correrlos en el worker.
import { analyze, dominantColor, extract, fromManifold, signedVolume, toManifold, validate } from './core.js';

export const MIN_FDM_BLOCK_DEPTH = 0.1;

export function faceData(part) {
  const nf = part.tri.length / 3, nv = part.vert.length / 3;
  const normal = new Float32Array(nf * 3), center = new Float32Array(nf * 3), area = new Float64Array(nf);
  const adjacent = new Int32Array(nf * 3).fill(-1), edges = new Map();
  const key = (a, b) => Math.min(a, b) * nv + Math.max(a, b);
  for (let f = 0; f < nf; f++) {
    const ia = part.tri[f * 3] * 3, ib = part.tri[f * 3 + 1] * 3, ic = part.tri[f * 3 + 2] * 3;
    center[f * 3] = (part.vert[ia] + part.vert[ib] + part.vert[ic]) / 3; center[f * 3 + 1] = (part.vert[ia + 1] + part.vert[ib + 1] + part.vert[ic + 1]) / 3; center[f * 3 + 2] = (part.vert[ia + 2] + part.vert[ib + 2] + part.vert[ic + 2]) / 3;
    const ux = part.vert[ib] - part.vert[ia], uy = part.vert[ib + 1] - part.vert[ia + 1], uz = part.vert[ib + 2] - part.vert[ia + 2];
    const vx = part.vert[ic] - part.vert[ia], vy = part.vert[ic + 1] - part.vert[ia + 1], vz = part.vert[ic + 2] - part.vert[ia + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz);
    area[f] = len / 2; if (len) { normal[f * 3] = nx / len; normal[f * 3 + 1] = ny / len; normal[f * 3 + 2] = nz / len; }
    for (let e = 0; e < 3; e++) {
      const a = part.tri[f * 3 + e], b = part.tri[f * 3 + (e + 1) % 3], k = key(a, b), prev = edges.get(k);
      if (prev === undefined) edges.set(k, f * 3 + e); else { adjacent[f * 3 + e] = Math.floor(prev / 3); adjacent[prev] = f; edges.delete(k); }
    }
  }
  return { normal, center, area, adjacent };
}

// Si la varita selecciona un aro, la tapa central queda como una isla no
// seleccionada rodeada por ese aro. Incorporamos la isla menor y conservamos
// la región exterior grande (por ejemplo, la cabeza).
function fillEnclosedIslands(mask, data) {
  const nf = mask.length, seen = new Uint8Array(nf), candidates = [];
  for (let seed = 0; seed < nf; seed++) {
    if (mask[seed] || seen[seed]) continue;
    const queue = [seed], faces = []; let head = 0, area = 0, touchesSelection = false;
    seen[seed] = 1;
    while (head < queue.length) {
      const f = queue[head++]; faces.push(f); area += data.area[f];
      for (let e = 0; e < 3; e++) {
        const n = data.adjacent[f * 3 + e];
        if (n < 0) continue;
        if (mask[n]) touchesSelection = true;
        else if (!seen[n]) { seen[n] = 1; queue.push(n); }
      }
    }
    if (touchesSelection) candidates.push({ faces, area });
  }
  if (candidates.length < 2) return;
  let outside = candidates[0]; for (const c of candidates) if (c.area > outside.area) outside = c;
  for (const c of candidates) if (c !== outside) for (const f of c.faces) mask[f] = 1;
}

export function selectRegion(part, seed, mode = 'angle', angle = 35, cached = null) {
  const nf = part.tri.length / 3; if (!(seed >= 0 && seed < nf)) throw new Error('La cara elegida no existe.');
  const data = cached || faceData(part), mask = new Uint8Array(nf), queue = new Uint32Array(nf); let head = 0, tail = 1, totalArea = 0; queue[0] = seed; mask[seed] = 1;
  const color = part.col?.[seed], cos = Math.cos(Math.max(0, Math.min(180, angle)) * Math.PI / 180);
  // Varita mágica: sigue el mismo color/material solamente mientras las caras
  // estén conectadas. Evita que tocar el murciélago negro seleccione también
  // el cuerpo negro u otros detalles separados. Shift permite sumar otra isla.
  if (mode === 'color' && part.col) {
    while (head < tail) {
      const f = queue[head++]; totalArea += data.area[f];
      for (let e = 0; e < 3; e++) {
        const n = data.adjacent[f * 3 + e];
        if (n < 0 || mask[n] || part.col[n] !== color) continue;
        // La continuidad local permite recorrer un detalle curvo, pero corta
        // la inundación en hendiduras, pliegues y bordes de otra forma.
        const dot = data.normal[f * 3] * data.normal[n * 3]
          + data.normal[f * 3 + 1] * data.normal[n * 3 + 1]
          + data.normal[f * 3 + 2] * data.normal[n * 3 + 2];
        if (dot >= cos) { mask[n] = 1; queue[tail++] = n; }
      }
    }
    fillEnclosedIslands(mask, data);
    let count = 0; totalArea = 0; for (let f = 0; f < nf; f++) if (mask[f]) { count++; totalArea += data.area[f]; }
    return { mask, count, area: totalArea, color };
  }
  const sx = data.normal[seed * 3], sy = data.normal[seed * 3 + 1], sz = data.normal[seed * 3 + 2];
  while (head < tail) {
    const f = queue[head++]; totalArea += data.area[f];
    for (let e = 0; e < 3; e++) {
      const n = data.adjacent[f * 3 + e]; if (n < 0 || mask[n]) continue;
      let accept;
      // Comparar siempre contra la cara inicial evita que pequeñas variaciones
      // acumuladas hagan que la selección "camine" por toda una superficie.
      const d = sx * data.normal[n * 3] + sy * data.normal[n * 3 + 1] + sz * data.normal[n * 3 + 2]; accept = d >= cos;
      if (accept) { mask[n] = 1; queue[tail++] = n; }
    }
  }
  fillEnclosedIslands(mask, data);
  let count = 0; totalArea = 0; for (let f = 0; f < nf; f++) if (mask[f]) { count++; totalArea += data.area[f]; }
  return { mask, count, area: totalArea, color: mode === 'color' ? color : null };
}

export function selectBrush(part, seed, radius = 3, cached = null) {
  const nf = part.tri.length / 3; if (!(seed >= 0 && seed < nf)) throw new Error('La cara elegida no existe.');
  const data = cached || faceData(part), center = data.center;
  const sx = center[seed * 3], sy = center[seed * 3 + 1], sz = center[seed * 3 + 2], r2 = radius * radius;
  const mask = new Uint8Array(nf), seen = new Uint8Array(nf), queue = [seed]; let head = 0, count = 0, area = 0; seen[seed] = 1;
  while (head < queue.length) {
    const f = queue[head++], dx = center[f * 3] - sx, dy = center[f * 3 + 1] - sy, dz = center[f * 3 + 2] - sz;
    if (dx * dx + dy * dy + dz * dz > r2) continue;
    mask[f] = 1; count++; area += data.area[f];
    for (let e = 0; e < 3; e++) { const n = data.adjacent[f * 3 + e]; if (n >= 0 && !seen[n]) { seen[n] = 1; queue.push(n); } }
  }
  fillEnclosedIslands(mask, data);
  count = 0; area = 0; for (let f = 0; f < nf; f++) if (mask[f]) { count++; area += data.area[f]; }
  return { mask, count, area, color: null };
}

export function regionShell(part, mask, depth) {
  if (!(depth >= MIN_FDM_BLOCK_DEPTH)) throw new Error(`El bloque debe tener al menos ${MIN_FDM_BLOCK_DEPTH} mm para impresión FDM.`);
  const nf = part.tri.length / 3, picked = mask.reduce((a, v) => a + (v ? 1 : 0), 0);
  if (!picked) throw new Error('Elegí una región primero.');
  if (picked === nf) throw new Error('La región ocupa toda la pieza. Elegí una zona más chica.');
  const remap = new Int32Array(part.vert.length / 3).fill(-1), source = [], outerTri = [], outerColor = [], boundary = [];
  const data = faceData(part);
  for (let f = 0; f < nf; f++) if (mask[f]) {
    for (let e = 0; e < 3; e++) { const old = part.tri[f * 3 + e]; if (remap[old] < 0) { remap[old] = source.length; source.push(old); } }
    for (let e = 0; e < 3; e++) { const old = part.tri[f * 3 + e]; outerTri.push(remap[old]); const next = part.tri[f * 3 + (e + 1) % 3], adj = data.adjacent[f * 3 + e]; if (adj < 0 || !mask[adj]) boundary.push([remap[old], remap[next]]); }
    if (part.col) outerColor.push(part.col[f]);
  }
  const n = source.length, vert = Array.from(new Float32Array(n * 6)); let nx = 0, ny = 0, nz = 0;
  // Una sola dirección para toda la zona: desplazar cada vértice por su normal
  // individual hacía converger las paredes y generaba picos. La traslación
  // rígida mantiene el espesor solicitado exacto, incluso sobre una tapa curva.
  for (let f = 0; f < nf; f++) if (mask[f]) { nx += data.normal[f * 3] * data.area[f]; ny += data.normal[f * 3 + 1] * data.area[f]; nz += data.normal[f * 3 + 2] * data.area[f]; }
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  source.forEach((old, i) => { const o = old * 3; vert[i * 3] = part.vert[o]; vert[i * 3 + 1] = part.vert[o + 1]; vert[i * 3 + 2] = part.vert[o + 2]; vert[(n + i) * 3] = part.vert[o] - depth * nx; vert[(n + i) * 3 + 1] = part.vert[o + 1] - depth * ny; vert[(n + i) * 3 + 2] = part.vert[o + 2] - depth * nz; });
  const tri = [], colors = [], sideColor = part.col ? dominantColor(Uint16Array.from(outerColor)) : dominantColor(null);
  for (let i = 0; i < outerTri.length; i += 3) { const a = outerTri[i], b = outerTri[i + 1], c = outerTri[i + 2]; tri.push(a, b, c, n + a, n + c, n + b); if (part.col) colors.push(outerColor[i / 3], outerColor[i / 3]); }
  for (const [a, b] of boundary) { tri.push(a, n + a, n + b, a, n + b, b); if (part.col) colors.push(sideColor, sideColor); }
  const out = { vert: Float32Array.from(vert), tri: Uint32Array.from(tri), col: part.col ? Uint16Array.from(colors) : null };
  if (signedVolume(out.vert, out.tri) < 0) for (let i = 0; i < out.tri.length; i += 3) { const x = out.tri[i + 1]; out.tri[i + 1] = out.tri[i + 2]; out.tri[i + 2] = x; }
  return out;
}

// Convierte el borde de la selección en un sacabocados rígido: una misma
// sección 2D extruida en dirección constante. A diferencia de desplazar cada
// vértice por su normal, sus paredes nunca convergen ni se cruzan.
function regionCutter(M, part, mask, depth) {
  const data = faceData(part), boundary = [], nf = part.tri.length / 3;
  let nx = 0, ny = 0, nz = 0, ox = 0, oy = 0, oz = 0, weight = 0;
  for (let f = 0; f < nf; f++) if (mask[f]) {
    const w = data.area[f]; nx += data.normal[f * 3] * w; ny += data.normal[f * 3 + 1] * w; nz += data.normal[f * 3 + 2] * w;
    for (let k = 0; k < 3; k++) { const vi = part.tri[f * 3 + k] * 3; ox += part.vert[vi] * w / 3; oy += part.vert[vi + 1] * w / 3; oz += part.vert[vi + 2] * w / 3; }
    weight += w;
    for (let e = 0; e < 3; e++) if (data.adjacent[f * 3 + e] < 0 || !mask[data.adjacent[f * 3 + e]]) boundary.push([part.tri[f * 3 + e], part.tri[f * 3 + (e + 1) % 3]]);
  }
  if (!boundary.length || !weight) throw new Error('La selección no forma un contorno cerrado para el sacabocados.');
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; ox /= weight; oy /= weight; oz /= weight;
  let ux, uy, uz;
  if (Math.abs(nz) < .9) { ux = -ny; uy = nx; uz = 0; } else { ux = 0; uy = -nz; uz = ny; }
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  const next = new Map(); boundary.forEach(([a, b]) => { if (!next.has(a)) next.set(a, []); next.get(a).push(b); });
  const unused = new Set(boundary.map(([a, b]) => `${a}:${b}`)), loops = [];
  while (unused.size) {
    const token = unused.values().next().value, start = +token.split(':')[0]; let current = start, guard = 0; const loop = [];
    do {
      const choices = next.get(current) || [], to = choices.find((b) => unused.has(`${current}:${b}`));
      if (to == null) break; unused.delete(`${current}:${to}`); loop.push(current); current = to;
    } while (current !== start && guard++ < boundary.length + 1);
    if (current === start && loop.length >= 3) loops.push(loop);
  }
  if (!loops.length) throw new Error('No se pudo cerrar el límite natural de la selección.');
  let minH = Infinity, maxH = -Infinity;
  const contours = loops.map((loop) => loop.map((vi) => { const i = vi * 3, x = part.vert[i] - ox, y = part.vert[i + 1] - oy, z = part.vert[i + 2] - oz; const h = x * nx + y * ny + z * nz; minH = Math.min(minH, h); maxH = Math.max(maxH, h); return [x * ux + y * uy + z * uz, x * vx + y * vy + z * vz]; }));
  const margin = Math.max(.15, depth * .08), z0 = minH - depth, height = maxH - minH + depth + margin;
  const section = new M.CrossSection(contours, 'EvenOdd');
  try {
    return section.extrude(height).translate([0, 0, z0]).transform([
      ux, uy, uz, 0, vx, vy, vz, 0, nx, ny, nz, 0, ox, oy, oz, 1,
    ]);
  } finally { section.delete(); }
}

export function cutRegion(M, part, mask, depth, options = {}) {
  // Última garantía antes de la booleana: cualquier isla encerrada por el
  // contorno pertenece al bloque. Evita placas con ranuras internas aunque la
  // selección venga de Forma, Pincel o Nodos.
  const filledMask = new Uint8Array(mask);
  // No refinamos la pieza completa: la malla original y sus caras lejanas se
  // conservan intactas. La densidad del corte se controla en la geometría
  // auxiliar del borde, evitando introducir ruido/z-fighting en el resultado.
  const shellPart = regionShell(part, filledMask, depth), shellInfo = analyze(shellPart), partInfo = analyze(part), original = toManifold(M, part), rawCutter = options.planar ? regionCutter(M, part, filledMask, depth) : toManifold(M, shellPart), originalID = original.originalID();
  // Si el contorno auxiliar aún tiene una concavidad abierta, la envolvente
  // convexa la convierte en un bloque realmente cerrado. El material del
  // bloque se suma al extraído y se resta de la base, evitando una ventana.
  // No convexamos ni rellenamos los límites internos: la boca/hendidura forma
  // parte del contorno seleccionado y debe conservarse tal cual.
  const solidify = !!options.solidify;
  const cutter = solidify ? rawCutter.hull() : rawCutter;
  const pickedColors = part.col ? Uint16Array.from(Array.from(part.col).filter((_, i) => filledMask[i])) : null;
  const selectedCap = dominantColor(pickedColors), baseCap = dominantColor(part.col);
  try {
    const extracted = solidify ? cutter : original.intersect(cutter), remainder = original.subtract(cutter);
    const validStatus = (m) => m.status() === 'NoError' || m.status() === 0;
    if (!validStatus(extracted) || !validStatus(remainder)) { if (!solidify) extracted.delete(); remainder.delete(); throw new Error('La booleana dejó vértices o polígonos separados; se canceló el corte.'); }
    if (extracted.isEmpty() || remainder.isEmpty()) { if (!solidify) extracted.delete(); remainder.delete(); throw new Error('La región no produjo dos volúmenes. Probá otra profundidad o selección.'); }
    const a = fromManifold(extracted, originalID, selectedCap), b = fromManifold(remainder, originalID, baseCap);
    // Una booleana puede conservar caras generadas por el shell con su ID
    // propio. Para que un ojo blanco no termine con paredes negras o sin color,
    // toda cara nueva/no asignada recibe explícitamente el color de su pieza.
    if (a.col && selectedCap !== 0xffff) for (let i = 0; i < a.col.length; i++) if (a.col[i] === 0xffff) a.col[i] = selectedCap;
    if (b.col && baseCap !== 0xffff) for (let i = 0; i < b.col.length; i++) if (b.col[i] === 0xffff) b.col[i] = baseCap;
    const va = validate(M, a), vb = validate(M, b), aa = analyze(a), ab = analyze(b);
    const strict = (v, info) => v.printable && info.closed && info.components === 1 && info.open === 0 && info.nonManifold === 0 && info.flipped === 0 && info.volume > 1e-6;
    if (!strict(va, aa) || !strict(vb, ab)) { if (!solidify) extracted.delete(); remainder.delete(); throw new Error(`La booleana no produjo dos sólidos completos y conectados (${[...va.problems, ...vb.problems, aa.components !== 1 ? 'más de un componente conectado' : '', ab.components !== 1 ? 'más de un componente conectado' : ''].filter(Boolean).join(', ')}). Se canceló el corte.`); }
    if (!solidify) extracted.delete(); remainder.delete(); return [a, b];
  } finally { if (cutter !== rawCutter) cutter.delete(); rawCutter.delete(); original.delete(); }
}

// Respaldo para una malla original que no forma un sólido manifold. La región
// sí recibe su profundidad visible; el resto conserva todas las caras no
// elegidas. Permite continuar el trabajo sin ocultar que la base requiere
// reparación antes de imprimir.
export function cutRegionLoose(part, mask, depth) {
  const selected = regionShell(part, mask, depth), inverse = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inverse[i] = mask[i] ? 0 : 1;
  const rest = extract(part, inverse);
  if (!rest.tri.length) throw new Error('La selección ocupa toda la pieza. Elegí una zona más chica.');
  return [selected, rest];
}
