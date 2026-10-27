// =====================================================================
// Personalizador de chops · lectura de archivos (en la página, no en el worker).
//   STL (binario o texto) y 3MF → triángulos en mm
//   SVG → contornos con huecos (usa el SVGLoader que ya trae three)
// =====================================================================
import { unzipSync, strFromU8 } from 'fflate';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

export const MAX_TRIS = 600000;

// ---------- STL ----------
export function parseSTL(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buf.byteLength) {
      const pos = new Float32Array(n * 9);
      for (let t = 0, o = 84; t < n; t++, o += 50) for (let k = 0; k < 9; k++) pos[t * 9 + k] = dv.getFloat32(o + 12 + k * 4, true);
      return pos;
    }
  }
  const text = new TextDecoder().decode(buf);
  const nums = [];
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  let m;
  while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
  if (!nums.length || nums.length % 9) throw new Error('No se pudo leer el STL.');
  return new Float32Array(nums);
}

// ---------- 3MF (todas las mallas del archivo; unidades del modelo → mm) ----------
const UNIT = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
export function parse3MF(buf) {
  const files = unzipSync(new Uint8Array(buf));
  const models = Object.keys(files).filter((k) => /\.model$/i.test(k));
  if (!models.length) throw new Error('El 3MF no tiene modelos 3D adentro.');
  const out = [];
  for (const k of models) {
    const xml = strFromU8(files[k]);
    const unit = UNIT[(xml.match(/<model[^>]*\sunit="([a-z]+)"/i) || [])[1]] || 1;
    for (const meshXml of xml.match(/<mesh[\s>][\s\S]*?<\/mesh>/gi) || []) {
      const v = [];
      for (const m of meshXml.matchAll(/<vertex\s+([^>]*?)\/?>/gi)) {
        const a = m[1];
        v.push(+(a.match(/\bx="([^"]+)"/) || [])[1] * unit, +(a.match(/\by="([^"]+)"/) || [])[1] * unit, +(a.match(/\bz="([^"]+)"/) || [])[1] * unit);
      }
      for (const m of meshXml.matchAll(/<triangle\s+([^>]*?)\/?>/gi)) {
        const a = m[1];
        for (const key of ['v1', 'v2', 'v3']) {
          const i = +(a.match(new RegExp(`\\b${key}="(\\d+)"`)) || [])[1];
          out.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
        }
      }
    }
  }
  if (!out.length) throw new Error('El 3MF no tiene triángulos.');
  return new Float32Array(out);
}

// ---------- Triángulos sueltos → malla indexada (une vértices repetidos) ----------
export function weld(pos) {
  const map = new Map(), vert = [], tri = new Uint32Array(pos.length / 3);
  const q = (x) => Math.round(x * 1e4);
  for (let i = 0; i < pos.length; i += 3) {
    const key = q(pos[i]) + ',' + q(pos[i + 1]) + ',' + q(pos[i + 2]);
    let idx = map.get(key);
    if (idx === undefined) { idx = vert.length / 3; map.set(key, idx); vert.push(pos[i], pos[i + 1], pos[i + 2]); }
    tri[i / 3] = idx;
  }
  return { vert: new Float32Array(vert), tri };
}

// ---------- Orientación, escala y eje (el chop queda con el eje en x=y=0 y la base en z=0) ----------
// q = giro libre del gizmo (cuaternión [x, y, z, w]), se aplica después de "hacia arriba".
export function orient(pos, { up = 'z', flip = false, scale = 1, cx = 0, cy = 0, q = null }) {
  const out = new Float32Array(pos.length);
  // Matriz del cuaternión (si hay giro)
  let R = null;
  if (q) {
    const [qx, qy, qz, qw] = q;
    R = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw),
      2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw),
      2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)];
  }
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (up === 'y') { const t = y; y = -z; z = t; } else if (up === 'x') { const t = x; x = -z; z = t; }
    if (flip) { z = -z; y = -y; }
    if (R) { const X = R[0] * x + R[1] * y + R[2] * z, Y = R[3] * x + R[4] * y + R[5] * z, Z = R[6] * x + R[7] * y + R[8] * z; x = X; y = Y; z = Z; }
    out[i] = x * scale; out[i + 1] = y * scale; out[i + 2] = z * scale;
  }
  let minZ = Infinity;
  for (let i = 2; i < out.length; i += 3) minZ = Math.min(minZ, out[i]);
  for (let i = 0; i < out.length; i += 3) { out[i] -= cx; out[i + 1] -= cy; out[i + 2] -= minZ; }
  // (Los giros de arriba son rotaciones, no espejos: las caras siguen bien orientadas.)
  return out;
}

export function bounds(pos) {
  const b = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  for (let i = 0; i < pos.length; i += 3) {
    b.minX = Math.min(b.minX, pos[i]); b.maxX = Math.max(b.maxX, pos[i]);
    b.minY = Math.min(b.minY, pos[i + 1]); b.maxY = Math.max(b.maxY, pos[i + 1]);
    b.minZ = Math.min(b.minZ, pos[i + 2]); b.maxZ = Math.max(b.maxZ, pos[i + 2]);
  }
  return b;
}

// Corte de la malla con un plano horizontal: puntos del contorno a la altura z.
export function slicePoints(pos, z) {
  const out = [];
  for (let i = 0; i < pos.length; i += 9) {
    for (let e = 0; e < 3; e++) {
      const a = i + e * 3, b = i + ((e + 1) % 3) * 3;
      const za = pos[a + 2], zb = pos[b + 2];
      if ((za - z) * (zb - z) > 0 || za === zb) continue;
      const t = (z - za) / (zb - za);
      out.push([pos[a] + (pos[b] - pos[a]) * t, pos[a + 1] + (pos[b + 1] - pos[a + 1]) * t]);
    }
  }
  return out;
}

// Círculo que mejor pasa por los puntos (mínimos cuadrados, método de Kåsa).
function fitCircle(pts) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
  const n = pts.length;
  // [sxx sxy sx][a]   [sxz]
  // [sxy syy sy][b] = [syz]   → centro (a/2, b/2)
  // [sx  sy  n ][c]   [sz ]
  const A = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]];
  for (let c = 0; c < 3; c++) {
    let piv = c; for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < 3; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; }
  }
  const a = A[0][3] / A[0][0], b = A[1][3] / A[1][1], c = A[2][3] / A[2][2];
  const cx = a / 2, cy = b / 2;
  return { cx, cy, r: Math.sqrt(Math.max(0, c + cx * cx + cy * cy)) };
}

// Eje del chop: el centro del CÍRCULO DE LA BASE. Corta el chop cerca de la base,
// se queda con el borde exterior (un punto por sector) y descarta los sectores
// que sobresalen (el asa) antes de ajustar el círculo.
export function guessAxis(pos) {
  const b = bounds(pos), H = b.maxZ - b.minZ;
  let c = { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 };
  for (const f of [0.03, 0.06, 0.1]) {
    const pts = slicePoints(pos, b.minZ + H * f);
    if (pts.length < 12) continue;
    // Punto de partida: el centro de los puntos del corte (no el de la caja, que el asa corre).
    c = { cx: pts.reduce((t, q) => t + q[0], 0) / pts.length, cy: pts.reduce((t, q) => t + q[1], 0) / pts.length };
    for (let it = 0; it < 4; it++) {
      const sec = new Array(72).fill(null);
      for (const [x, y] of pts) {
        const r = Math.hypot(x - c.cx, y - c.cy);
        const k = Math.floor(((Math.atan2(y - c.cy, x - c.cx) + Math.PI) / (2 * Math.PI)) * 72) % 72;
        if (!sec[k] || r > sec[k].r) sec[k] = { x, y, r };
      }
      const ring = sec.filter(Boolean);
      const med = ring.map((p) => p.r).sort((m, n) => m - n)[Math.floor(ring.length / 2)];
      // 1.ª vuelta: todo el borde; después, solo los sectores cerca del radio típico (sin el asa)
      const good = ring.filter((p) => it === 0 || Math.abs(p.r - med) < med * 0.08).map((p) => [p.x, p.y]);
      if (good.length < 8) break;
      const fit = fitCircle(good);
      if (!fit) break;
      c = { cx: fit.cx, cy: fit.cy, r: fit.r };
    }
    if (c.r) return c;
  }
  return c;
}

// Radio exterior a una altura: se corta la malla con un plano (como un slicer) y,
// en 72 sectores, se toma el punto más lejano; el radio es la mediana de esos
// máximos (así el asa, que ocupa pocos sectores, no lo agranda).
export function radiusAt(pos, z) {
  const bins = new Array(72).fill(0);
  const add = (x, y) => {
    const r = Math.hypot(x, y);
    const k = Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * 72) % 72;
    if (r > bins[k]) bins[k] = r;
  };
  for (let i = 0; i < pos.length; i += 9) {
    for (let e = 0; e < 3; e++) {
      const a = i + e * 3, b = i + ((e + 1) % 3) * 3;
      const za = pos[a + 2], zb = pos[b + 2];
      if ((za - z) * (zb - z) > 0 || za === zb) continue;
      const t = (z - za) / (zb - za);
      add(pos[a] + (pos[b] - pos[a]) * t, pos[a + 1] + (pos[b + 1] - pos[a + 1]) * t);
    }
  }
  const got = bins.filter((r) => r > 0).sort((a, b) => a - b);
  return got.length ? got[Math.floor(got.length / 2)] : 0;
}

// ---------- SVG → contornos (en mm del SVG, centrados en 0,0; Y hacia arriba) ----------
export function svgToShapes(text) {
  let data;
  try { data = new SVGLoader().parse(text); } catch { throw new Error('No se pudo leer el SVG.'); }
  const shapes = [];
  let pts = 0, strokeOnly = 0;
  for (const path of data.paths) {
    const fill = path.userData?.style?.fill;
    if (fill === 'none' || fill === 'transparent') { strokeOnly++; continue; }
    for (const sh of path.toShapes(true)) {
      const { shape, holes } = sh.extractPoints(16);
      if (shape.length < 3) continue;
      const outer = shape.map((p) => [p.x, -p.y]);
      const hs = holes.filter((h) => h.length >= 3).map((h) => h.map((p) => [p.x, -p.y]));
      pts += outer.length + hs.reduce((a, h) => a + h.length, 0);
      shapes.push({ outer, holes: hs });
    }
  }
  if (!shapes.length) {
    throw new Error(strokeOnly
      ? 'El SVG solo tiene líneas (trazos) sin relleno. En tu programa de diseño convertí los trazos en contornos/formas y exportalo de nuevo.'
      : 'El SVG no tiene formas para extruir.');
  }
  if (pts > 40000) throw new Error('El SVG es demasiado detallado (más de 40.000 puntos). Simplificalo antes de cargarlo.');
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of shapes) for (const [x, y] of s.outer) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const move = (c) => c.map(([x, y]) => [x - cx, y - cy]);
  return { shapes: shapes.map((s) => ({ outer: move(s.outer), holes: s.holes.map(move) })), w0: maxX - minX, h0: maxY - minY, points: pts };
}
