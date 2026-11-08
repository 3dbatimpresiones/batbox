// BATTEXTURE 3D - nucleo geometrico determinista y reutilizable en Node/Worker.
// Las texturas se evaluan matematicamente y terminan como vertices desplazados.

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (v) => { const x = clamp(v); return x * x * (3 - 2 * x); };
const fract = (v) => v - Math.floor(v);
const hash2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);

function faceNormal(part, face) {
  const t = face * 3, ia = part.tri[t] * 3, ib = part.tri[t + 1] * 3, ic = part.tri[t + 2] * 3;
  const ux = part.vert[ib] - part.vert[ia], uy = part.vert[ib + 1] - part.vert[ia + 1], uz = part.vert[ib + 2] - part.vert[ia + 2];
  const vx = part.vert[ic] - part.vert[ia], vy = part.vert[ic + 1] - part.vert[ia + 1], vz = part.vert[ic + 2] - part.vert[ia + 2];
  let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

export function faceNormals(part) {
  const out = new Float32Array(part.tri.length);
  for (let f = 0; f < part.tri.length / 3; f++) out.set(faceNormal(part, f), f * 3);
  return out;
}

function edgeMap(part) {
  const map = new Map();
  for (let f = 0; f < part.tri.length / 3; f++) for (let k = 0; k < 3; k++) {
    const a = part.tri[f * 3 + k], b = part.tri[f * 3 + (k + 1) % 3];
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const list = map.get(key) || []; list.push(f); map.set(key, list);
  }
  return map;
}

export function selectConnected(part, seed, angleDeg = 25) {
  const count = part.tri.length / 3;
  if (!(seed >= 0 && seed < count)) throw new Error('La cara seleccionada no existe.');
  const normals = faceNormals(part), adjacency = Array.from({ length: count }, () => []);
  for (const faces of edgeMap(part).values()) if (faces.length === 2) { adjacency[faces[0]].push(faces[1]); adjacency[faces[1]].push(faces[0]); }
  const cos = Math.cos(clamp(angleDeg, 0, 180) * Math.PI / 180);
  const mask = new Uint8Array(count), queue = [seed]; mask[seed] = 1;
  for (let q = 0; q < queue.length; q++) for (const next of adjacency[queue[q]]) {
    if (mask[next]) continue;
    const current = queue[q], dot = normals[current * 3] * normals[next * 3] + normals[current * 3 + 1] * normals[next * 3 + 1] + normals[current * 3 + 2] * normals[next * 3 + 2];
    if (dot >= cos) { mask[next] = 1; queue.push(next); }
  }
  return mask;
}

export function selectAll(part) { return new Uint8Array(part.tri.length / 3).fill(1); }

function faceAdjacency(part) {
  const out = Array.from({ length: part.tri.length / 3 }, () => []);
  for (const faces of edgeMap(part).values()) if (faces.length === 2) { out[faces[0]].push(faces[1]); out[faces[1]].push(faces[0]); }
  return out;
}

function faceCentroids(part) {
  const out = new Float32Array(part.tri.length);
  for (let f = 0; f < part.tri.length / 3; f++) for (let k = 0; k < 3; k++) {
    const vi = part.tri[f * 3 + k] * 3;
    out[f * 3] += part.vert[vi] / 3; out[f * 3 + 1] += part.vert[vi + 1] / 3; out[f * 3 + 2] += part.vert[vi + 2] / 3;
  }
  return out;
}

function pointTriangleDistance(part, face, p) {
  const at = (k) => { const i = part.tri[face * 3 + k] * 3; return [part.vert[i], part.vert[i + 1], part.vert[i + 2]]; }, a = at(0), b = at(1), c = at(2);
  const sub = (x, y) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]], dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2], ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return Math.hypot(...ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return Math.hypot(...bp);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3), q = [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return Math.hypot(...cp);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6), q = [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)), bc = sub(c, b), q = [b[0] + bc[0] * w, b[1] + bc[1] * w, b[2] + bc[2] * w]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }
  const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom, q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

export function brushSelection(part, seed, point, radius, current = null, erase = false) {
  const faces = part.tri.length / 3;
  if (!(seed >= 0 && seed < faces) || !point?.every(Number.isFinite)) throw new Error('El pincel no intersecto una cara valida.');
  const mask = current ? new Uint8Array(current) : new Uint8Array(faces), adjacency = faceAdjacency(part), seen = new Uint8Array(faces), queue = [seed], r = Math.max(.05, Number(radius) || 1);
  for (let q = 0; q < queue.length; q++) {
    const f = queue[q]; if (seen[f]) continue; seen[f] = 1;
    if (f !== seed && pointTriangleDistance(part, f, point) > r) continue;
    mask[f] = erase ? 0 : 1;
    for (const n of adjacency[f]) if (!seen[n]) queue.push(n);
  }
  return mask;
}

export function invertSelection(part, current) {
  const out = new Uint8Array(part.tri.length / 3);
  for (let i = 0; i < out.length; i++) out[i] = current?.[i] ? 0 : 1;
  return out;
}

export const PATTERNS = [
  { id: 'hex', name: 'Hexagonos', category: 'Industrial' },
  { id: 'knurl', name: 'Moleteado', category: 'Industrial' },
  { id: 'waves', name: 'Ondas', category: 'Geometrica' },
  { id: 'dots', name: 'Puntos', category: 'Decorativa' },
  { id: 'voronoi', name: 'Voronoi', category: 'Organica' },
];

export function patternHeight(kind, u, v, separation = 0, smoothing = .25) {
  const gap = clamp(separation, 0, .8), soft = .04 + clamp(smoothing) * .24;
  if (kind === 'hex') {
    const a = Math.cos(u * Math.PI * 2), b = Math.cos((u * .5 + v * .8660254) * Math.PI * 2), c = Math.cos((-u * .5 + v * .8660254) * Math.PI * 2);
    const ridge = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
    return smooth((ridge - (.58 + gap * .28)) / soft) * 2 - 1;
  }
  if (kind === 'knurl') {
    const ridge = Math.abs(Math.sin((u + v) * Math.PI * 2) * Math.sin((u - v) * Math.PI * 2));
    return Math.pow(ridge, .55 + gap * 2) * 2 - 1;
  }
  if (kind === 'waves') return Math.sin(u * Math.PI * 2 + Math.sin(v * Math.PI * 2) * .35);
  if (kind === 'dots') {
    const x = fract(u) - .5, y = fract(v) - .5, radius = .38 * (1 - gap * .65);
    return (1 - smooth((Math.hypot(x, y) - radius + soft) / soft)) * 2 - 1;
  }
  if (kind === 'voronoi') {
    const ix = Math.floor(u), iy = Math.floor(v), fx = fract(u), fy = fract(v); let d1 = 9, d2 = 9;
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      const px = x + hash2(ix + x, iy + y), py = y + hash2(ix + x + 19, iy + y - 7), d = Math.hypot(px - fx, py - fy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return (1 - smooth(((d2 - d1) - (.055 + gap * .08)) / soft)) * 2 - 1;
  }
  return 0;
}

function rotate2(u, v, degrees) { const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [u * c - v * s, u * s + v * c]; }

function projectedHeight(point, normal, settings) {
  const scale = Math.max(.2, Number(settings.scale) || 4), density = clamp(Number(settings.density) || 1, .1, 10), inv = 1 / scale * density;
  const sampleMap = (u, v) => {
    const map = settings.customMap, w = map?.width, h = map?.height, data = map?.data;
    if (!w || !h || !data?.length) return 0;
    const x = fract(u) * (w - 1), y = (1 - fract(v)) * (h - 1), x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = x - x0, ty = y - y0;
    const a = data[y0 * w + x0] * (1 - tx) + data[y0 * w + x1] * tx, b = data[y1 * w + x0] * (1 - tx) + data[y1 * w + x1] * tx;
    const contrast = clamp(Number(settings.mapContrast) || 1, .1, 4), brightness = clamp(Number(settings.mapBrightness) || 0, -.5, .5), value = clamp(((a * (1 - ty) + b * ty) - .5) * contrast + .5 + brightness);
    return value * 2 - 1;
  };
  const raw = (u, v) => settings.pattern === 'custom' ? sampleMap(u, v) : patternHeight(settings.pattern, u, v, Number(settings.separation) || 0, Number(settings.smoothing) || 0);
  const eval2 = (u, v) => { const r = rotate2(u * inv, v * inv, Number(settings.rotation) || 0); return raw(r[0], r[1]); };
  let h;
  if (settings.projection === 'cylindrical') {
    const angle = Math.atan2(point[1], point[0]), radius = Math.hypot(point[0], point[1]), repeats = Math.max(1, Math.round(Math.PI * 2 * radius * inv));
    const r = rotate2((angle + Math.PI) / (Math.PI * 2) * repeats, point[2] * inv, Number(settings.rotation) || 0); h = raw(r[0], r[1]);
  } else if (settings.projection === 'triplanar') {
    const ax = Math.abs(normal[0]), ay = Math.abs(normal[1]), az = Math.abs(normal[2]), sum = ax + ay + az || 1;
    h = (eval2(point[1], point[2]) * ax + eval2(point[0], point[2]) * ay + eval2(point[0], point[1]) * az) / sum;
  } else {
    const ax = Math.abs(normal[0]), ay = Math.abs(normal[1]), az = Math.abs(normal[2]);
    h = ax >= ay && ax >= az ? eval2(point[1], point[2]) : ay >= az ? eval2(point[0], point[2]) : eval2(point[0], point[1]);
  }
  if (settings.invert) h = -h;
  if (settings.direction === 'positive') return (h + 1) * .5;
  if (settings.direction === 'negative') return -(h + 1) * .5;
  return h;
}

function selectedBoundary(part, mask) {
  const boundaryEdges = new Set(), boundaryVertices = new Uint8Array(part.vert.length / 3);
  for (const [key, faces] of edgeMap(part)) {
    const selected = faces.reduce((n, f) => n + (mask[f] ? 1 : 0), 0);
    if (selected && selected !== faces.length || (selected && faces.length === 1)) {
      boundaryEdges.add(key); const [a, b] = key.split(',').map(Number); boundaryVertices[a] = boundaryVertices[b] = 1;
    }
  }
  return { boundaryEdges, boundaryVertices };
}

function baryFade(bary, boundaryLocal, transition) {
  if (!transition) return 1;
  let fade = 1; const width = clamp(transition, .02, .48);
  // bary[2] es distancia al borde local 0 (vertices 0-1), etc.
  if (boundaryLocal[0]) fade *= smooth(bary[2] / width);
  if (boundaryLocal[1]) fade *= smooth(bary[0] / width);
  if (boundaryLocal[2]) fade *= smooth(bary[1] / width);
  return fade;
}

function protectedWithMargin(part, protectedMask, margin = 0) {
  const faces = part.tri.length / 3, blocked = new Uint8Array(faces);
  if (!protectedMask?.some((v) => v)) return blocked;
  blocked.set(protectedMask); if (!(margin > 0)) return blocked;
  const centers = faceCentroids(part), adjacency = faceAdjacency(part), dist = new Float64Array(faces).fill(Infinity), queue = [];
  for (let f = 0; f < faces; f++) if (protectedMask[f]) { dist[f] = 0; queue.push(f); }
  for (let q = 0; q < queue.length; q++) {
    let best = q; for (let i = q + 1; i < queue.length; i++) if (dist[queue[i]] < dist[queue[best]]) best = i;
    [queue[q], queue[best]] = [queue[best], queue[q]]; const f = queue[q];
    for (const n of adjacency[f]) {
      const d = dist[f] + Math.hypot(centers[f * 3] - centers[n * 3], centers[f * 3 + 1] - centers[n * 3 + 1], centers[f * 3 + 2] - centers[n * 3 + 2]);
      if (d <= margin && d < dist[n]) { dist[n] = d; blocked[n] = 1; queue.push(n); }
    }
  }
  return blocked;
}

export function applyTextureLayers(part, layerInput, options = {}, onProgress = null) {
  const baseSettings = { pattern: 'hex', depth: .4, scale: 4, density: 1, rotation: 0, separation: 0, smoothing: .25, invert: false, direction: 'positive', projection: 'planar', transition: .16, detail: 2, maxTriangles: 500000 };
  const faces = part.tri.length / 3, blocked = protectedWithMargin(part, options.protected, Number(options.protectionMargin) || 0);
  const enabledInput = (layerInput || []).filter((l) => l.enabled !== false && l.mask?.length === faces);
  const layers = enabledInput.map((l) => ({ ...l, settings: { ...baseSettings, ...(l.settings || {}) }, mask: Uint8Array.from(l.mask, (v, i) => v && !blocked[i] ? 1 : 0) })).filter((l) => l.mask.some((v) => v));
  if (!layers.length) throw new Error('No hay capas habilitadas con superficies modificables.');
  const union = new Uint8Array(faces); layers.forEach((l) => l.mask.forEach((v, i) => { if (v) union[i] = 1; }));
  const selected = union.reduce((n, v) => n + v, 0), excluded = blocked.reduce((n, v, i) => n + (v && enabledInput.some((l) => l.mask?.[i]) ? 1 : 0), 0);
  const maxTriangles = Math.max(faces, Math.min(...layers.map((l) => Number(l.settings.maxTriangles) || 500000))), requested = Math.max(...layers.map((l) => clamp(Math.round(l.settings.detail), 0, 3)));
  if (faces > maxTriangles) throw new Error('El modelo ya supera el presupuesto de triangulos configurado.');
  const normals = faceNormals(part), adjacency = faceAdjacency(part), faceLevels = new Uint8Array(faces);
  for (let f = 0; f < faces; f++) if (union[f]) {
    const active = layers.filter((l) => l.mask[f]), requestedFace = Math.max(...active.map((l) => clamp(Math.round(l.settings.detail), 0, 3)));
    const ids = [part.tri[f * 3], part.tri[f * 3 + 1], part.tri[f * 3 + 2]], edge = (a, b) => Math.hypot(part.vert[a * 3] - part.vert[b * 3], part.vert[a * 3 + 1] - part.vert[b * 3 + 1], part.vert[a * 3 + 2] - part.vert[b * 3 + 2]);
    const longest = Math.max(edge(ids[0], ids[1]), edge(ids[1], ids[2]), edge(ids[2], ids[0]));
    const feature = Math.max(.05, Math.min(...active.map((l) => Number(l.settings.scale || 4) / Math.max(.25, Number(l.settings.density || 1)))));
    const depthRatio = Math.max(...active.map((l) => Math.abs(Number(l.settings.depth || 0)))) / feature;
    let bend = 0; for (const n of adjacency[f]) bend = Math.max(bend, Math.acos(clamp(normals[f * 3] * normals[n * 3] + normals[f * 3 + 1] * normals[n * 3 + 1] + normals[f * 3 + 2] * normals[n * 3 + 2], -1, 1)));
    const demand = longest / feature * (1 + Math.min(1, depthRatio * 2)) * (1 + bend / Math.PI);
    const useful = demand >= 10 ? 3 : demand >= 2.5 ? 2 : 1;
    faceLevels[f] = Math.min(requestedFace, useful);
  }
  const triangleCount = () => faces - selected + faceLevels.reduce((n, level, f) => n + (union[f] ? 3 ** level : 0), 0);
  let predicted = triangleCount(), budgetLimited = false;
  while (predicted > maxTriangles) {
    let candidate = -1, bestSaving = 0;
    for (let f = 0; f < faces; f++) if (union[f] && faceLevels[f] > 0) { const saving = 3 ** faceLevels[f] - 3 ** (faceLevels[f] - 1); if (saving > bestSaving) { candidate = f; bestSaving = saving; } }
    if (candidate < 0) break; faceLevels[candidate]--; predicted -= bestSaving; budgetLimited = true;
  }
  const level = faceLevels.reduce((n, v) => Math.max(n, v), 0), minLevel = faceLevels.reduce((n, v, f) => union[f] ? Math.min(n, v) : n, 3);
  const unionBoundary = selectedBoundary(part, union), boundaries = layers.map((l) => selectedBoundary(part, l.mask));
  const vertexNormal = new Float64Array(part.vert.length), normalCount = new Uint32Array(part.vert.length / 3), vertexLayers = Array.from({ length: part.vert.length / 3 }, () => new Set());
  for (let f = 0; f < faces; f++) if (union[f]) for (let k = 0; k < 3; k++) { const vi = part.tri[f * 3 + k], o = vi * 3; vertexNormal[o] += normals[f * 3]; vertexNormal[o + 1] += normals[f * 3 + 1]; vertexNormal[o + 2] += normals[f * 3 + 2]; normalCount[vi]++; layers.forEach((l, li) => { if (l.mask[f]) vertexLayers[vi].add(li); }); }
  const outVert = Array.from(part.vert);
  for (let vi = 0; vi < normalCount.length; vi++) if (normalCount[vi] && !unionBoundary.boundaryVertices[vi]) {
    const o = vi * 3, len = Math.hypot(vertexNormal[o], vertexNormal[o + 1], vertexNormal[o + 2]) || 1, n = [vertexNormal[o] / len, vertexNormal[o + 1] / len, vertexNormal[o + 2] / len], p = [part.vert[o], part.vert[o + 1], part.vert[o + 2]];
    let d = 0; vertexLayers[vi].forEach((li) => { if (!boundaries[li].boundaryVertices[vi]) d += projectedHeight(p, n, layers[li].settings) * Number(layers[li].settings.depth || 0); });
    outVert[o] += n[0] * d; outVert[o + 1] += n[1] * d; outVert[o + 2] += n[2] * d;
  }
  const outTri = [], outCol = part.col ? [] : null;
  const addPoint = (base, bary, n, face, ids) => {
    let d = 0;
    layers.forEach((l, li) => { if (!l.mask[face]) return; const keys = [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[0]]].map(([a, b]) => a < b ? `${a},${b}` : `${b},${a}`), local = keys.map((k) => boundaries[li].boundaryEdges.has(k)); d += projectedHeight(base, n, l.settings) * Number(l.settings.depth || 0) * baryFade(bary, local, l.settings.transition); });
    const index = outVert.length / 3; outVert.push(base[0] + n[0] * d, base[1] + n[1] * d, base[2] + n[2] * d); return { index, base, bary };
  };
  const subdivide = (a, b, c, depth, n, face, ids, color) => {
    if (!depth) { outTri.push(a.index, b.index, c.index); if (outCol) outCol.push(color); return; }
    const base = [(a.base[0] + b.base[0] + c.base[0]) / 3, (a.base[1] + b.base[1] + c.base[1]) / 3, (a.base[2] + b.base[2] + c.base[2]) / 3], bary = [(a.bary[0] + b.bary[0] + c.bary[0]) / 3, (a.bary[1] + b.bary[1] + c.bary[1]) / 3, (a.bary[2] + b.bary[2] + c.bary[2]) / 3], m = addPoint(base, bary, n, face, ids);
    subdivide(a, b, m, depth - 1, n, face, ids, color); subdivide(b, c, m, depth - 1, n, face, ids, color); subdivide(c, a, m, depth - 1, n, face, ids, color);
  };
  for (let f = 0; f < faces; f++) {
    const ids = [part.tri[f * 3], part.tri[f * 3 + 1], part.tri[f * 3 + 2]], color = part.col ? part.col[f] : 0;
    if (!union[f]) { outTri.push(...ids); if (outCol) outCol.push(color); continue; }
    const points = ids.map((id, k) => ({ index: id, base: [part.vert[id * 3], part.vert[id * 3 + 1], part.vert[id * 3 + 2]], bary: [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0] })), n = [normals[f * 3], normals[f * 3 + 1], normals[f * 3 + 2]];
    subdivide(points[0], points[1], points[2], faceLevels[f], n, f, ids, color);
    if (onProgress && (f % 1000 === 0 || f === faces - 1)) onProgress({ done: f + 1, total: faces });
  }
  const distribution = [0, 1, 2, 3].map((value) => faceLevels.reduce((n, level, f) => n + (union[f] && level === value ? 1 : 0), 0));
  return { part: { ...part, vert: Float32Array.from(outVert), tri: Uint32Array.from(outTri), col: outCol ? Uint16Array.from(outCol) : null }, stats: { selected, excluded, layers: layers.length, protected: blocked.reduce((n, v) => n + v, 0), level, minLevel, requestedLevel: requested, adaptive: true, distribution, trianglesBefore: faces, trianglesAfter: outTri.length / 3, budgetLimited: budgetLimited || level < requested } };
}

export function applyTexture(part, mask, input = {}, onProgress = null) { return applyTextureLayers(part, [{ mask, settings: input, enabled: true }], {}, onProgress); }

