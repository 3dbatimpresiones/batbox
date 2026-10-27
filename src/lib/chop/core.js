// =====================================================================
// Personalizador de chops · geometría sólida con manifold-3d (la misma
// librería del Creador de Llaveros). Se usa desde el worker y en las pruebas.
// =====================================================================
import { computeLayout, slantOf } from './layout.js';

// Chop: malla indexada → Manifold. Si no es un sólido cerrado, avisa.
export function chopFromMesh(M, vert, tri) {
  const mesh = new M.Mesh({ numProp: 3, vertProperties: vert, triVerts: tri });
  mesh.merge();
  let m;
  try { m = new M.Manifold(mesh); } catch {
    throw new Error('El modelo no es un sólido cerrado (tiene agujeros o caras sueltas). Repará el STL (por ejemplo con el slicer) y volvé a cargarlo.');
  }
  const st = m.status();
  if (st !== 'NoError' || m.isEmpty()) { m.delete(); throw new Error('El modelo no es un sólido cerrado (' + st + '). Repará el STL y volvé a cargarlo.'); }
  return m;
}

// Diseño (contornos del SVG, ya centrados en 0,0, en unidades del SVG) → CrossSection.
// Cada forma: contorno exterior + agujeros (los huecos se conservan).
export function designSection(M, shapes) {
  let cs = null;
  for (const s of shapes) {
    const part = new M.CrossSection([s.outer, ...s.holes], 'EvenOdd');
    cs = cs ? M.CrossSection.union(cs, part) : part;
  }
  if (!cs || cs.isEmpty()) throw new Error('El SVG no tiene formas rellenas para extruir.');
  return cs;
}

// ---------- Pared real ----------
// Índice de triángulos por franjas de altura (1 mm) para medir rápido dónde está la pared.
export function wallIndex(vert, tri) {
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 2; i < vert.length; i += 3) { zMin = Math.min(zMin, vert[i]); zMax = Math.max(zMax, vert[i]); }
  const n = Math.max(1, Math.ceil(zMax - zMin) + 1), bins = Array.from({ length: n }, () => []);
  for (let t = 0; t < tri.length; t += 3) {
    const za = vert[tri[t] * 3 + 2], zb = vert[tri[t + 1] * 3 + 2], zc = vert[tri[t + 2] * 3 + 2];
    const lo = Math.floor(Math.min(za, zb, zc) - zMin), hi = Math.floor(Math.max(za, zb, zc) - zMin);
    for (let k = Math.max(0, lo); k <= Math.min(n - 1, hi); k++) bins[k].push(t);
  }
  return { vert, tri, zMin, bins };
}
// Radio de la pared exterior a la altura z y ángulo a (rad): corta la malla con un plano
// y busca el punto más lejano del eje en esa dirección. null si no hay pared ahí.
export function wallRadius(idx, z, a) {
  const k = Math.floor(z - idx.zMin), list = idx.bins[k];
  if (!list) return null;
  const dx = Math.cos(a), dy = Math.sin(a), V = idx.vert, T = idx.tri;
  let best = null;
  for (const t of list) {
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const p = T[t + e] * 3, q = T[t + ((e + 1) % 3)] * 3;
      const zp = V[p + 2], zq = V[q + 2];
      if ((zp - z) * (zq - z) > 0 || zp === zq) continue;
      const u = (z - zp) / (zq - zp);
      pts.push(V[p] + (V[q] - V[p]) * u, V[p + 1] + (V[q + 1] - V[p + 1]) * u);
    }
    if (pts.length < 4) continue;
    // Rayo desde el eje (0,0) en dirección (dx,dy) contra el segmento del corte
    const ex = pts[2] - pts[0], ey = pts[3] - pts[1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const r = (pts[0] * ey - pts[1] * ex) / den, s = (pts[0] * dy - pts[1] * dx) / den;
    if (r > 0 && s >= -1e-9 && s <= 1 + 1e-9 && (best === null || r > best)) best = r;
  }
  return best;
}
// Radio donde apoyar un diseño: mide la pared en el centro y cerca de los 4 bordes.
// Relieve: el más chico (así toca la pared en todo su contorno y se hunde un poco donde sobresale).
// Grabado: el más grande (así corta la pared en todo el diseño).
export function snapRadius(idx, it, W, H, cosP, engrave) {
  const rs = [];
  const a0 = (it.angle * Math.PI) / 180;
  for (const [fu, fw] of [[0, 0], [-0.4, 0], [0.4, 0], [0, -0.4], [0, 0.4]]) {
    const r = wallRadius(idx, it.h + fw * H * cosP, a0 + (fu * W) / it.r);
    if (r) rs.push(r);
  }
  if (!rs.length) return null;
  return engrave ? Math.max(...rs) : Math.min(...rs);
}

// Un relieve por cada posición del patrón, ya curvado sobre la superficie.
// Plano del diseño: x = a lo ancho (arco), y = a lo alto (sobre la pared),
// z = hacia afuera (de -profundidad a +espesor). Después se dobla (warp).
export function buildReliefs(M, cs0, design, p, axis, wall) {
  const lay = computeLayout(p, axis, design.h0 / design.w0);
  const s = p.width / design.w0;
  // Un perfil extruido por cada combinación de giro y escala (los diseños sueltos pueden tener los suyos).
  const shapes = new Map();
  const profile = (spin, k) => {
    const id = spin.toFixed(2) + '|' + k.toFixed(4);
    if (!shapes.has(id)) {
      const c = cs0.rotate(spin).scale([s * k, s * k]);
      shapes.set(id, M.Manifold.extrude(c, below + above).translate([0, 0, -below]).refineToLength(seg));
      c.delete();
    }
    return shapes.get(id);
  };
  // Relieve (hacia afuera): de -profundidad (dentro de la pared, para que pegue) a +espesor.
  // Grabado (hacia adentro): de -profundidad del grabado a +0,4 mm (sale un poco afuera para cortar limpio).
  const engrave = p.mode === 'engrave';
  const below = engrave ? p.engrave : p.depth, above = engrave ? 0.4 : p.relief;
  const seg = Math.max(0.35, Math.min(1.2, p.width / 60));          // malla fina para que se curve parejo
  const phi = slantOf(axis), cosP = Math.cos(phi), sinP = Math.sin(phi);
  const out = [];
  let snapped = 0;
  for (const it of lay.items) {
    const a0 = (it.angle * Math.PI) / 180;
    // Pared real: el diseño se apoya donde está la pared de verdad (no en el cono ideal).
    if (wall && p.snap !== false) {
      const r = snapRadius(wall, it, lay.W * it.s, lay.H * it.s, cosP, engrave);
      if (r) { it.r = r; snapped++; }
    }
    it.r += it.dr || 0;
    const flat = profile(it.spin || 0, it.s || 1);
    const m = flat.warpBatch((v, n) => {
      for (let k = 0; k < n; k++) {
        const u = v[k * 3], w = v[k * 3 + 1], dz = v[k * 3 + 2];
        // Punto sobre la pared (cono): sube por la generatriz, y el radio crece con la inclinación.
        const hs = it.h + w * cosP, rs = it.r + w * sinP;
        const R = rs + dz * cosP, Z = hs - dz * sinP;            // hacia afuera, perpendicular a la pared
        const a = a0 + u / rs;                                   // el ancho se mantiene en mm sobre la pared
        v[k * 3] = R * Math.cos(a); v[k * 3 + 1] = R * Math.sin(a); v[k * 3 + 2] = Z;
      }
    });
    out.push(m);
  }
  for (const f of shapes.values()) f.delete();
  lay.snapped = snapped;
  return { reliefs: out, layout: lay };
}

// Operación booleana final y verificación del resultado.
//   relieve: chop ∪ diseños   ·   grabado: chop − diseños
export function combineAll(M, chop, tools, mode, onProgress) {
  const engrave = mode === 'engrave';
  let acc = chop;
  const B = 8;
  for (let i = 0; i < tools.length; i += B) {
    const batch = tools.slice(i, i + B);
    let next;
    if (engrave) { const cut = M.Manifold.union(batch); next = M.Manifold.difference(acc, cut); cut.delete(); }
    else next = M.Manifold.union([acc, ...batch]);
    if (acc !== chop) acc.delete();
    acc = next;
    onProgress?.(Math.min(tools.length, i + B), tools.length);
  }
  if (acc === chop) acc = M.Manifold.union([chop]);
  const status = acc.status();
  const parts = acc.decompose();
  const pieces = parts.length;
  parts.forEach((x) => x.delete());
  return { result: acc, check: { mode: engrave ? 'engrave' : 'relief', status, pieces, volume: acc.volume(), chopVolume: chop.volume(),
    genus: acc.genus(), chopGenus: chop.genus() } };
}
export const unionAll = (M, chop, reliefs, onProgress) => combineAll(M, chop, reliefs, 'relief', onProgress);
