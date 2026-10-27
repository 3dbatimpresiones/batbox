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
export function orient(pos, { up = 'z', flip = false, scale = 1, cx = 0, cy = 0 }) {
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (up === 'y') { const t = y; y = -z; z = t; } else if (up === 'x') { const t = x; x = -z; z = t; }
    if (flip) { z = -z; y = -y; }
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

// Eje: centro de la base (el 5 % más bajo del modelo), donde el asa casi nunca llega.
export function guessAxis(pos) {
  const b = bounds(pos), lim = b.minZ + (b.maxZ - b.minZ) * 0.05;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.length; i += 3) if (pos[i + 2] <= lim) {
    minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]); minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
  }
  if (!Number.isFinite(minX)) return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 };
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
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
