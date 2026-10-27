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

// Un relieve por cada posición del patrón, ya curvado sobre la superficie.
// Plano del diseño: x = a lo ancho (arco), y = a lo alto (sobre la pared),
// z = hacia afuera (de -profundidad a +espesor). Después se dobla (warp).
export function buildReliefs(M, cs0, design, p, axis) {
  const lay = computeLayout(p, axis, design.h0 / design.w0);
  const s = p.width / design.w0;
  const cs = cs0.scale([s, s]);
  // Relieve (hacia afuera): de -profundidad (dentro de la pared, para que pegue) a +espesor.
  // Grabado (hacia adentro): de -profundidad del grabado a +0,4 mm (sale un poco afuera para cortar limpio).
  const engrave = p.mode === 'engrave';
  const below = engrave ? p.engrave : p.depth, above = engrave ? 0.4 : p.relief;
  const seg = Math.max(0.35, Math.min(1.2, p.width / 60));          // malla fina para que se curve parejo
  const flat = M.Manifold.extrude(cs, below + above).translate([0, 0, -below]).refineToLength(seg);
  cs.delete();
  const phi = slantOf(axis), cosP = Math.cos(phi), sinP = Math.sin(phi);
  const out = [];
  for (const it of lay.items) {
    const a0 = (it.angle * Math.PI) / 180;
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
  flat.delete();
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
