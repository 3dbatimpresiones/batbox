import { faceData } from './regions.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

export function baryPosition(part, node) {
  const f = node.face * 3, b = node.bary, out = [0, 0, 0];
  if (f < 0 || f + 2 >= part.tri.length || !b || b.length !== 3) throw new Error('Nodo fuera de la malla.');
  for (let k = 0; k < 3; k++) { const v = part.tri[f + k] * 3; out[0] += part.vert[v] * b[k]; out[1] += part.vert[v + 1] * b[k]; out[2] += part.vert[v + 2] * b[k]; }
  return out;
}

export function anchorNode(face, bary) {
  const sum = bary.reduce((a, v) => a + v, 0);
  if (!bary.every((v) => v >= -1e-5) || Math.abs(sum - 1) > 1e-4) throw new Error('Coordenadas baricéntricas inválidas.');
  return { face, bary: bary.map((v) => clamp(v, 0, 1)) };
}

export function boundaryLoops(part, mask) {
  const data = faceData(part), edges = [];
  for (let f = 0; f < mask.length; f++) if (mask[f]) for (let e = 0; e < 3; e++) {
    const other = data.adjacent[f * 3 + e];
    if (other < 0 || !mask[other]) edges.push([part.tri[f * 3 + e], part.tri[f * 3 + (e + 1) % 3], f]);
  }
  const byStart = new Map(); edges.forEach((e) => { const a = byStart.get(e[0]) || []; a.push(e); byStart.set(e[0], a); });
  const unused = new Set(edges.map((_, i) => i)), ids = new Map(edges.map((e, i) => [e, i])), loops = [];
  while (unused.size) {
    const first = edges[unused.values().next().value], loop = [first], start = first[0]; unused.delete(ids.get(first));
    let at = first[1], guard = edges.length + 1;
    while (at !== start && guard-- > 0) { const next = (byStart.get(at) || []).find((e) => unused.has(ids.get(e))); if (!next) break; loop.push(next); unused.delete(ids.get(next)); at = next[1]; }
    if (at === start && loop.length >= 3) loops.push(loop);
  }
  return loops.sort((a, b) => b.length - a.length);
}

export function nodesFromRegion(part, mask, wanted = 8) {
  const loop = boundaryLoops(part, mask)[0]; if (!loop) throw new Error('La región no tiene un contorno cerrado utilizable.');
  const lengths = [], cumulative = [0]; let total = 0;
  for (const [a, b] of loop) { const ia = a * 3, ib = b * 3, len = Math.hypot(part.vert[ib] - part.vert[ia], part.vert[ib + 1] - part.vert[ia + 1], part.vert[ib + 2] - part.vert[ia + 2]); lengths.push(len); total += len; cumulative.push(total); }
  const count = clamp(Math.round(wanted), 3, Math.min(12, loop.length)), nodes = [];
  for (let n = 0; n < count; n++) {
    const d = total * n / count; let e = 0; while (e + 1 < cumulative.length && cumulative[e + 1] <= d) e++;
    const [a, b, face] = loop[e], t = lengths[e] ? (d - cumulative[e]) / lengths[e] : 0, tri = Array.from(part.tri.subarray(face * 3, face * 3 + 3));
    const bary = tri.map((v) => v === a ? 1 - t : v === b ? t : 0); nodes.push(anchorNode(face, bary));
  }
  return nodes;
}

export function meshGraph(part) {
  const nv = part.vert.length / 3, adj = Array.from({ length: nv }, () => []), faces = new Map(), normals = faceData(part).normal;
  for (let f = 0; f < part.tri.length / 3; f++) for (let e = 0; e < 3; e++) { const a = part.tri[f * 3 + e], b = part.tri[f * 3 + (e + 1) % 3], key = edgeKey(a, b), list = faces.get(key) || []; list.push(f); faces.set(key, list); }
  for (const [key, fs] of faces) { const [a, b] = key.split(':').map(Number), ia = a * 3, ib = b * 3, length = Math.hypot(part.vert[ib] - part.vert[ia], part.vert[ib + 1] - part.vert[ia + 1], part.vert[ib + 2] - part.vert[ia + 2]); let crease = 1; if (fs.length === 2) { const x = fs[0] * 3, y = fs[1] * 3; crease = clamp((1 - (normals[x] * normals[y] + normals[x + 1] * normals[y + 1] + normals[x + 2] * normals[y + 2])) / .7, 0, 1); } const edge = { a, b, length, crease, faces: fs }; adj[a].push({ to: b, ...edge }); adj[b].push({ to: a, ...edge }); }
  return { adj, faces };
}

function nearestFaceVertex(part, node) { const p = baryPosition(part, node), f = node.face * 3; let best = part.tri[f], dist = Infinity; for (let k = 0; k < 3; k++) { const v = part.tri[f + k], i = v * 3, d = (part.vert[i] - p[0]) ** 2 + (part.vert[i + 1] - p[1]) ** 2 + (part.vert[i + 2] - p[2]) ** 2; if (d < dist) { dist = d; best = v; } } return best; }

class Heap { constructor() { this.a = []; } push(x) { let i = this.a.push(x) - 1; while (i) { const p = (i - 1) >> 1; if (this.a[p][0] <= x[0]) break; this.a[i] = this.a[p]; i = p; } this.a[i] = x; } pop() { const root = this.a[0], x = this.a.pop(); if (this.a.length) { let i = 0; while (true) { let c = i * 2 + 1; if (c >= this.a.length) break; if (c + 1 < this.a.length && this.a[c + 1][0] < this.a[c][0]) c++; if (this.a[c][0] >= x[0]) break; this.a[i] = this.a[c]; i = c; } this.a[i] = x; } return root; } }

export function shortestPath(graph, start, end, magnet = 60, smooth = 0, part = null) {
  const pull = clamp(magnet, 0, 100) / 100, relax = clamp(smooth, 0, 100) / 100, heap = new Heap(), dist = new Map([[`-1:${start}`, 0]]), parent = new Map(); heap.push([0, -1, start]); let finalKey = null;
  while (heap.a.length) {
    const [cost, before, at] = heap.pop(), key = `${before}:${at}`; if (cost !== dist.get(key)) continue; if (at === end) { finalKey = key; break; }
    for (const edge of graph.adj[at]) {
      if (edge.to === before) continue; let turn = 0;
      if (part && before >= 0) { const ax = part.vert[at * 3] - part.vert[before * 3], ay = part.vert[at * 3 + 1] - part.vert[before * 3 + 1], az = part.vert[at * 3 + 2] - part.vert[before * 3 + 2], bx = part.vert[edge.to * 3] - part.vert[at * 3], by = part.vert[edge.to * 3 + 1] - part.vert[at * 3 + 1], bz = part.vert[edge.to * 3 + 2] - part.vert[at * 3 + 2], den = Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz) || 1; turn = 1 - clamp((ax * bx + ay * by + az * bz) / den, -1, 1); }
      const nc = cost + edge.length * (1 + pull * (1 - edge.crease) * 2.4 + relax * turn * 1.2), nk = `${at}:${edge.to}`;
      if (nc < (dist.get(nk) ?? Infinity)) { dist.set(nk, nc); parent.set(nk, key); heap.push([nc, at, edge.to]); }
    }
  }
  if (!finalKey) return null; const out = []; for (let key = finalKey; key; key = parent.get(key)) out.push(Number(key.split(':')[1])); return out.reverse();
}

export function traceLoop(part, nodes, magnet = 60, smooth = 35, graph = null) {
  if (nodes.length < 3) throw new Error('El contorno necesita al menos tres nodos.'); const g = graph || meshGraph(part), anchors = nodes.map((n) => nearestFaceVertex(part, n)), segments = [], route = [];
  for (let i = 0; i < nodes.length; i++) { const seg = shortestPath(g, anchors[i], anchors[(i + 1) % nodes.length], magnet, smooth, part); if (!seg) throw new Error(`No se pudo resolver el tramo ${i + 1}.`); segments.push(seg); route.push(...(i ? seg.slice(1) : seg)); }
  if (route[0] !== route[route.length - 1]) route.push(route[0]); const seen = new Set(); let selfCross = false; for (let i = 0; i < route.length - 1; i++) { if (seen.has(route[i]) && route[i] !== route[i - 1]) selfCross = true; seen.add(route[i]); }
  const positions = segments.map((seg, i) => { const data = []; data.push(...baryPosition(part, nodes[i])); for (const v of seg.slice(1, -1)) data.push(part.vert[v * 3], part.vert[v * 3 + 1], part.vert[v * 3 + 2]); data.push(...baryPosition(part, nodes[(i + 1) % nodes.length])); return Float32Array.from(data); });
  return { nodes, anchors, route, segments, positions, valid: !selfCross, problems: selfCross ? ['El recorrido se cruza o vuelve sobre un vértice.'] : [] };
}

export function maskInsideLoop(part, route, seedFace) {
  const data = faceData(part), barrier = new Set(); for (let i = 0; i + 1 < route.length; i++) barrier.add(edgeKey(route[i], route[i + 1]));
  const mask = new Uint8Array(part.tri.length / 3), queue = new Uint32Array(mask.length); let head = 0, tail = 1; queue[0] = seedFace; mask[seedFace] = 1;
  while (head < tail) { const f = queue[head++]; for (let e = 0; e < 3; e++) { const a = part.tri[f * 3 + e], b = part.tri[f * 3 + (e + 1) % 3]; if (barrier.has(edgeKey(a, b))) continue; const n = data.adjacent[f * 3 + e]; if (n >= 0 && !mask[n]) { mask[n] = 1; queue[tail++] = n; } } }
  if (tail === mask.length) throw new Error('El contorno no separa la superficie. Ajustá los nodos.'); return mask;
}
