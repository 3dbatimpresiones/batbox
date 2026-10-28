// BATSplit 3D · selección conectada de caras y separación de una región superficial.
// Los cálculos son independientes del visor para poder probarlos en Node y correrlos en el worker.
import { dominantColor, fromManifold, signedVolume, toManifold } from './core.js';

export function faceData(part) {
  const nf = part.tri.length / 3, nv = part.vert.length / 3;
  const normal = new Float32Array(nf * 3), area = new Float64Array(nf);
  const adjacent = new Int32Array(nf * 3).fill(-1), edges = new Map();
  const key = (a, b) => Math.min(a, b) * nv + Math.max(a, b);
  for (let f = 0; f < nf; f++) {
    const ia = part.tri[f * 3] * 3, ib = part.tri[f * 3 + 1] * 3, ic = part.tri[f * 3 + 2] * 3;
    const ux = part.vert[ib] - part.vert[ia], uy = part.vert[ib + 1] - part.vert[ia + 1], uz = part.vert[ib + 2] - part.vert[ia + 2];
    const vx = part.vert[ic] - part.vert[ia], vy = part.vert[ic + 1] - part.vert[ia + 1], vz = part.vert[ic + 2] - part.vert[ia + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz);
    area[f] = len / 2; if (len) { normal[f * 3] = nx / len; normal[f * 3 + 1] = ny / len; normal[f * 3 + 2] = nz / len; }
    for (let e = 0; e < 3; e++) {
      const a = part.tri[f * 3 + e], b = part.tri[f * 3 + (e + 1) % 3], k = key(a, b), prev = edges.get(k);
      if (prev === undefined) edges.set(k, f * 3 + e); else { adjacent[f * 3 + e] = Math.floor(prev / 3); adjacent[prev] = f; edges.delete(k); }
    }
  }
  return { normal, area, adjacent };
}

export function selectRegion(part, seed, mode = 'angle', angle = 35, cached = null) {
  const nf = part.tri.length / 3; if (!(seed >= 0 && seed < nf)) throw new Error('La cara elegida no existe.');
  const data = cached || faceData(part), mask = new Uint8Array(nf), queue = new Uint32Array(nf); let head = 0, tail = 1, totalArea = 0; queue[0] = seed; mask[seed] = 1;
  const color = part.col?.[seed], cos = Math.cos(Math.max(0, Math.min(180, angle)) * Math.PI / 180);
  while (head < tail) {
    const f = queue[head++]; totalArea += data.area[f];
    for (let e = 0; e < 3; e++) {
      const n = data.adjacent[f * 3 + e]; if (n < 0 || mask[n]) continue;
      let accept;
      if (mode === 'color' && part.col) accept = part.col[n] === color;
      else { const d = data.normal[f * 3] * data.normal[n * 3] + data.normal[f * 3 + 1] * data.normal[n * 3 + 1] + data.normal[f * 3 + 2] * data.normal[n * 3 + 2]; accept = d >= cos; }
      if (accept) { mask[n] = 1; queue[tail++] = n; }
    }
  }
  return { mask, count: tail, area: totalArea, color: mode === 'color' ? color : null };
}

export function regionShell(part, mask, depth) {
  if (!(depth > 0)) throw new Error('La profundidad debe ser mayor que 0 mm.');
  const nf = part.tri.length / 3, picked = mask.reduce((a, v) => a + (v ? 1 : 0), 0);
  if (!picked) throw new Error('Elegí una región primero.');
  if (picked === nf) throw new Error('La región ocupa toda la pieza. Elegí una zona más chica.');
  const remap = new Int32Array(part.vert.length / 3).fill(-1), source = [], outerTri = [], boundary = [];
  const data = faceData(part);
  for (let f = 0; f < nf; f++) if (mask[f]) {
    for (let e = 0; e < 3; e++) { const old = part.tri[f * 3 + e]; if (remap[old] < 0) { remap[old] = source.length; source.push(old); } }
    for (let e = 0; e < 3; e++) { const old = part.tri[f * 3 + e]; outerTri.push(remap[old]); const next = part.tri[f * 3 + (e + 1) % 3], adj = data.adjacent[f * 3 + e]; if (adj < 0 || !mask[adj]) boundary.push([remap[old], remap[next]]); }
  }
  const n = source.length, vert = new Float32Array(n * 6), vn = new Float64Array(n * 3);
  for (let f = 0; f < nf; f++) if (mask[f]) for (let e = 0; e < 3; e++) { const v = remap[part.tri[f * 3 + e]]; vn[v * 3] += data.normal[f * 3] * data.area[f]; vn[v * 3 + 1] += data.normal[f * 3 + 1] * data.area[f]; vn[v * 3 + 2] += data.normal[f * 3 + 2] * data.area[f]; }
  source.forEach((old, i) => { const o = old * 3, d = Math.hypot(vn[i * 3], vn[i * 3 + 1], vn[i * 3 + 2]) || 1; vert.set(part.vert.subarray(o, o + 3), i * 3); vert[(n + i) * 3] = part.vert[o] - depth * vn[i * 3] / d; vert[(n + i) * 3 + 1] = part.vert[o + 1] - depth * vn[i * 3 + 1] / d; vert[(n + i) * 3 + 2] = part.vert[o + 2] - depth * vn[i * 3 + 2] / d; });
  const tri = [];
  for (let i = 0; i < outerTri.length; i += 3) { const a = outerTri[i], b = outerTri[i + 1], c = outerTri[i + 2]; tri.push(a, b, c, n + a, n + c, n + b); }
  for (const [a, b] of boundary) tri.push(a, n + a, n + b, a, n + b, b);
  const out = { vert, tri: Uint32Array.from(tri), col: null };
  if (signedVolume(out.vert, out.tri) < 0) for (let i = 0; i < out.tri.length; i += 3) { const x = out.tri[i + 1]; out.tri[i + 1] = out.tri[i + 2]; out.tri[i + 2] = x; }
  return out;
}

export function cutRegion(M, part, mask, depth) {
  const shellPart = regionShell(part, mask, depth), original = toManifold(M, part), shell = toManifold(M, shellPart), originalID = original.originalID(), cap = dominantColor(part.col);
  try {
    const extracted = original.intersect(shell), remainder = original.subtract(extracted);
    if (extracted.isEmpty() || remainder.isEmpty()) { extracted.delete(); remainder.delete(); throw new Error('La región no produjo dos volúmenes. Probá otra profundidad o selección.'); }
    const a = fromManifold(extracted, originalID, cap), b = fromManifold(remainder, originalID, cap); extracted.delete(); remainder.delete(); return [a, b];
  } finally { shell.delete(); original.delete(); }
}
