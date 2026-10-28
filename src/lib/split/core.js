// =====================================================================
// BATSplit 3D · núcleo geométrico (sirve en el worker y en las pruebas de Node).
// Pieza = { vert: Float32Array (x,y,z), tri: Uint32Array, col: Uint16Array|null }
//   col[t] = color (índice de paleta) del triángulo t, NO_COLOR = sin color.
// Las operaciones nunca modifican la pieza recibida: devuelven piezas nuevas.
// =====================================================================
import { NO_COLOR } from './io.js';

// ---------- Medidas ----------
export function bounds(vert) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vert.length; i += 3) for (let k = 0; k < 3; k++) {
    const v = vert[i + k];
    if (v < b[k]) b[k] = v;
    if (v > b[k + 3]) b[k + 3] = v;
  }
  return { min: b.slice(0, 3), max: b.slice(3), size: [b[3] - b[0], b[4] - b[1], b[5] - b[2]] };
}

export function signedVolume(vert, tri) {
  let v = 0;
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t] * 3, b = tri[t + 1] * 3, c = tri[t + 2] * 3;
    v += vert[a] * (vert[b + 1] * vert[c + 2] - vert[b + 2] * vert[c + 1])
      - vert[a + 1] * (vert[b] * vert[c + 2] - vert[b + 2] * vert[c])
      + vert[a + 2] * (vert[b] * vert[c + 1] - vert[b + 1] * vert[c]);
  }
  return v / 6;
}

// ---------- Topología: aristas abiertas, no-manifold, orientación ----------
// Cada arista dirigida a→b debería aparecer una vez y su gemela b→a otra vez.
export function topology(tri, nVert) {
  const key = (a, b) => a * nVert + b; // nVert² entra holgado en un double para mallas reales
  const dir = new Map();
  for (let t = 0; t < tri.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = tri[t + k], b = tri[t + ((k + 1) % 3)];
      const kk = key(a, b);
      dir.set(kk, (dir.get(kk) || 0) + 1);
    }
  }
  let open = 0, nonManifold = 0, flipped = 0, degenerate = 0;
  const seen = new Set();
  for (const [kk, n] of dir) {
    const a = Math.floor(kk / nVert), b = kk % nVert;
    if (a === b) { degenerate += n; continue; }
    const lo = Math.min(a, b), hi = Math.max(a, b), uk = key(lo, hi);
    if (seen.has(uk)) continue;
    seen.add(uk);
    const f = dir.get(key(lo, hi)) || 0, r = dir.get(key(hi, lo)) || 0;
    const total = f + r;
    if (total === 1) open++;
    else if (total > 2) nonManifold++;
    else if (f === 2 || r === 2) flipped++;
  }
  for (let t = 0; t < tri.length; t += 3) if (tri[t] === tri[t + 1] || tri[t + 1] === tri[t + 2] || tri[t] === tri[t + 2]) degenerate++;
  return { open, nonManifold, flipped, degenerate, edges: seen.size };
}

// ---------- Cuerpos sueltos (componentes conectados por vértices) ----------
function find(p, x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
export function componentLabels(tri, nVert) {
  const p = new Int32Array(nVert);
  for (let i = 0; i < nVert; i++) p[i] = i;
  for (let t = 0; t < tri.length; t += 3) {
    const a = find(p, tri[t]);
    for (let k = 1; k < 3; k++) { const b = find(p, tri[t + k]); if (a !== b) p[b] = a; }
  }
  const label = new Int32Array(tri.length / 3), ids = new Map();
  for (let t = 0; t < tri.length; t += 3) {
    const r = find(p, tri[t]);
    let id = ids.get(r);
    if (id === undefined) { id = ids.size; ids.set(r, id); }
    label[t / 3] = id;
  }
  return { label, count: ids.size };
}

// Extrae los triángulos marcados (mask[t] = true) como una pieza nueva con vértices compactados.
export function extract(part, mask) {
  const { vert, tri, col } = part;
  const remap = new Int32Array(vert.length / 3).fill(-1);
  const nv = [], nt = [], nc = [];
  for (let t = 0; t < tri.length / 3; t++) {
    if (!mask[t]) continue;
    for (let k = 0; k < 3; k++) {
      const v = tri[t * 3 + k];
      if (remap[v] < 0) { remap[v] = nv.length / 3; nv.push(vert[v * 3], vert[v * 3 + 1], vert[v * 3 + 2]); }
      nt.push(remap[v]);
    }
    if (col) nc.push(col[t]);
  }
  return { vert: new Float32Array(nv), tri: Uint32Array.from(nt), col: col ? Uint16Array.from(nc) : null };
}

// Punto dentro de una malla cerrada (rayo +X, cuenta cruces). Para ubicar cavidades.
function inside(part, x, y, z) {
  const { vert, tri } = part;
  let hits = 0;
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t] * 3, b = tri[t + 1] * 3, c = tri[t + 2] * 3;
    const ay = vert[a + 1] - y, az = vert[a + 2] - z, by = vert[b + 1] - y, bz = vert[b + 2] - z, cy = vert[c + 1] - y, cz = vert[c + 2] - z;
    // ¿El punto (y,z) cae dentro del triángulo proyectado en YZ?
    const d1 = ay * bz - az * by, d2 = by * cz - bz * cy, d3 = cy * az - cz * ay;
    if (!((d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0))) continue;
    const s = d1 + d2 + d3;
    const xi = (vert[a] * d2 + vert[b] * d3 + vert[c] * d1) / s;
    if (xi > x) hits++;
  }
  return hits % 2 === 1;
}

// Separa por cuerpos. Las cáscaras con volumen negativo (cavidades interiores)
// se quedan con el cuerpo que las contiene: un objeto hueco sigue siendo una pieza.
export function splitBodies(part) {
  const { label, count } = componentLabels(part.tri, part.vert.length / 3);
  if (count <= 1) return [part];
  const shells = [];
  for (let c = 0; c < count; c++) {
    const mask = new Uint8Array(label.length);
    for (let t = 0; t < label.length; t++) mask[t] = label[t] === c ? 1 : 0;
    const p = extract(part, mask);
    shells.push({ part: p, vol: signedVolume(p.vert, p.tri), box: bounds(p.vert) });
  }
  const solids = shells.filter((s) => s.vol >= 0), cavities = shells.filter((s) => s.vol < 0);
  if (!solids.length) return shells.map((s) => s.part);
  const groups = solids.map((s) => [s]);
  for (const cav of cavities) {
    const v0 = cav.part.tri[0] * 3;
    const px = cav.part.vert[v0] + 1e-4, py = cav.part.vert[v0 + 1] + 1.3e-4, pz = cav.part.vert[v0 + 2] + 0.7e-4;
    // El cuerpo más chico que la contiene.
    let best = -1, bestVol = Infinity;
    solids.forEach((s, i) => {
      const inBox = [0, 1, 2].every((k) => cav.box.min[k] >= s.box.min[k] - 1e-3 && cav.box.max[k] <= s.box.max[k] + 1e-3);
      if (inBox && s.vol < bestVol && inside(s.part, px, py, pz)) { best = i; bestVol = s.vol; }
    });
    if (best >= 0) groups[best].push(cav); else groups.push([cav]);
  }
  return groups.map((g) => (g.length === 1 ? g[0].part : merge(g.map((s) => s.part))));
}

export function merge(parts) {
  let nv = 0, nt = 0;
  for (const p of parts) { nv += p.vert.length; nt += p.tri.length; }
  const anyCol = parts.some((p) => p.col);
  const vert = new Float32Array(nv), tri = new Uint32Array(nt), col = anyCol ? new Uint16Array(nt / 3).fill(NO_COLOR) : null;
  let ov = 0, ot = 0;
  for (const p of parts) {
    vert.set(p.vert, ov);
    for (let i = 0; i < p.tri.length; i++) tri[ot + i] = p.tri[i] + ov / 3;
    if (col && p.col) col.set(p.col, ot / 3);
    ov += p.vert.length; ot += p.tri.length;
  }
  return { vert, tri, col };
}

// Resumen para mostrar y validar (sin manifold).
export function analyze(part) {
  const nVert = part.vert.length / 3;
  const topo = topology(part.tri, nVert);
  const comp = componentLabels(part.tri, nVert).count;
  const b = bounds(part.vert);
  const volume = signedVolume(part.vert, part.tri);
  const closed = topo.open === 0 && topo.nonManifold === 0 && topo.flipped === 0;
  return { tris: part.tri.length / 3, verts: nVert, size: b.size, min: b.min, max: b.max, volume, components: comp, ...topo, closed };
}

// ---------- Manifold ----------
// faceID lleva el color de cada triángulo a través de las operaciones booleanas.
export function toManifold(M, part) {
  const nt = part.tri.length / 3;
  const faceID = new Uint32Array(nt);
  if (part.col) for (let t = 0; t < nt; t++) faceID[t] = part.col[t];
  else faceID.fill(NO_COLOR);
  const mesh = new M.Mesh({ numProp: 3, vertProperties: part.vert, triVerts: part.tri, faceID });
  mesh.merge();
  let man;
  try { man = new M.Manifold(mesh); } catch (e) {
    throw new Error('La pieza no es un sólido cerrado (tiene agujeros o aristas compartidas de más). Separala por cuerpos o reparala antes de cortar.');
  }
  return man;
}

// capColor: color de las caras nuevas (tapas del corte); NO_COLOR = el de la pieza.
export function fromManifold(man, originalID, capColor = NO_COLOR) {
  const mesh = man.getMesh();
  const np = mesh.numProp, src = mesh.vertProperties, nv = src.length / np;
  const vert = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) { vert[i * 3] = src[i * np]; vert[i * 3 + 1] = src[i * np + 1]; vert[i * 3 + 2] = src[i * np + 2]; }
  const tri = new Uint32Array(mesh.triVerts);
  const nt = tri.length / 3;
  const col = new Uint16Array(nt).fill(capColor);
  const runs = mesh.runIndex, ids = mesh.runOriginalID, face = mesh.faceID;
  for (let r = 0; r < ids.length; r++) {
    if (ids[r] !== originalID) continue;
    for (let t = runs[r] / 3; t < runs[r + 1] / 3; t++) col[t] = face[t];
  }
  return { vert, tri, col: col.some((c) => c !== NO_COLOR) ? col : null };
}

// Plano: normal (cualquier largo) y punto por donde pasa. Devuelve [lado de la normal, lado opuesto].
export function cutByPlane(M, part, normal, point) {
  const l = Math.hypot(...normal);
  const n = normal.map((x) => x / l);
  const offset = n[0] * point[0] + n[1] * point[1] + n[2] * point[2];
  const man = toManifold(M, part);
  const id = man.originalID();
  // Las tapas toman el color más usado de la pieza (si tiene colores).
  const cap = dominantColor(part.col);
  try {
    const [a, b] = man.splitByPlane(n, offset);
    const out = [a, b].map((m) => (m.isEmpty() ? null : fromManifold(m, id, cap)));
    a.delete(); b.delete();
    return out;
  } finally { man.delete(); }
}

export function dominantColor(col) {
  if (!col) return NO_COLOR;
  const count = new Map();
  for (const c of col) if (c !== NO_COLOR) count.set(c, (count.get(c) || 0) + 1);
  let best = NO_COLOR, n = 0;
  for (const [c, k] of count) if (k > n) { best = c; n = k; }
  return best;
}

// Validación con el motor sólido además de la topológica.
export function validate(M, part) {
  const info = analyze(part);
  let solid = false, volume = info.volume, genus = null;
  if (info.closed) {
    try {
      const man = toManifold(M, part);
      solid = man.status() === 'NoError' || man.status() === 0 || !man.isEmpty();
      volume = man.volume(); genus = man.genus();
      man.delete();
    } catch { solid = false; }
  }
  const problems = [];
  if (info.open) problems.push(`${info.open} aristas abiertas (agujeros)`);
  if (info.nonManifold) problems.push(`${info.nonManifold} aristas compartidas por más de dos caras`);
  if (info.flipped) problems.push(`${info.flipped} aristas con normales invertidas`);
  if (info.degenerate) problems.push(`${info.degenerate} triángulos degenerados`);
  if (!(volume > 1e-6)) problems.push('volumen nulo o negativo');
  const printable = info.closed && solid && volume > 1e-6;
  return { ...info, volume, genus, solid, printable, problems };
}
