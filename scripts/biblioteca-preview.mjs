// Vista previa 3D liviana de un modelo de la Biblioteca (para el visor de la ficha).
// Entrada: el ZIP del modelo (Buffer). Salida: un GLB con una malla por color, simplificada.
//   - Si el ZIP trae un .3mf, se usan sus colores (filamentos/pintura de Bambu/Orca).
//   - Si solo trae STL, cada pieza se pinta según su nombre (vidrios, neumáticos, llantas…)
//     y la carrocería con el color principal de la foto (si se pasa bodyColor).
// No usa dependencias nuevas: fflate (ya está en BATBOX) y el lector de src/lib/split/io.js.
import { unzipSync } from 'fflate';
import { parse3MF, parseSTL } from '../src/lib/split/io.js';

const TARGET_TRIS = 120000; // total aproximado de la vista previa (~1–2 MB)
globalThis.__BB_MAX_TRIS = 30000000; // modelos muy detallados: se leen igual y se simplifican

// Colores por nombre de pieza (español/inglés). El primero que coincide gana.
const NAME_COLORS = [
  [/vidrio|cristal|glass|window|luneta|parabris|windshield|ventan/i, '#1d2a3a'],
  [/neum|tire|tyre|goma|rubber|cubierta/i, '#1b1b1b'],
  [/llanta|rim|wheel|rueda|aro/i, '#a7adb5'],
  [/interior|asiento|seat|tablero|dash|volante|steering/i, '#3b3b3f'],
  [/chasis|chassis|piso|floor|base|bottom|bajo/i, '#2a2a2e'],
  [/faro|luz|light|optic|lamp|led/i, '#e9edf2'],
  [/placa|patente|plate|matricula/i, '#f2f2f2'],
  [/limpia|wiper|espejo|mirror|manija|handle|separador|spacer/i, '#202024'],
  [/freno|brake|caliper|pinza/i, '#d9a227'],
];
const DEFAULT_BODY = '#5ddadb';
const FALLBACK = ['#5ddadb', '#8b5cf6', '#f78eb6', '#3b82f6', '#fbbf24', '#34d399'];

const ext = (n) => n.toLowerCase().split('.').pop();
const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

// Junta todos los archivos del ZIP, abriendo también un ZIP interno (muy común en estos packs).
function collect(zipBuf) {
  const out = [];
  const walk = (files, depth) => {
    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith('/') || /__MACOSX|\.DS_Store/i.test(name)) continue;
      const e = ext(name);
      if (e === 'zip' && depth < 2) { try { walk(unzipSync(data), depth + 1); } catch { /* ZIP dañado: se ignora */ } }
      else if (e === '3mf' || e === 'stl') out.push({ name: name.split('/').pop(), e, data });
    }
  };
  walk(unzipSync(new Uint8Array(zipBuf)), 0);
  return out;
}

// Simplificación por agrupamiento de vértices en una grilla (rápida y sin dependencias).
function decimate(vert, tri, col, cell) {
  const map = new Map(), sum = [], cnt = [], remap = new Int32Array(vert.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const k = `${Math.floor(vert[i * 3] / cell)},${Math.floor(vert[i * 3 + 1] / cell)},${Math.floor(vert[i * 3 + 2] / cell)}`;
    let id = map.get(k);
    if (id === undefined) { id = cnt.length; map.set(k, id); sum.push(0, 0, 0); cnt.push(0); }
    sum[id * 3] += vert[i * 3]; sum[id * 3 + 1] += vert[i * 3 + 1]; sum[id * 3 + 2] += vert[i * 3 + 2]; cnt[id]++;
    remap[i] = id;
  }
  const v = new Float32Array(cnt.length * 3);
  for (let i = 0; i < cnt.length; i++) for (let k = 0; k < 3; k++) v[i * 3 + k] = sum[i * 3 + k] / cnt[i];
  const t = [], c = [], seen = new Set();
  for (let i = 0; i < tri.length / 3; i++) {
    const a = remap[tri[i * 3]], b = remap[tri[i * 3 + 1]], d = remap[tri[i * 3 + 2]];
    if (a === b || b === d || a === d) continue;
    const key = [a, b, d].sort((x, y) => x - y).join(',');
    if (seen.has(key)) continue;
    seen.add(key); t.push(a, b, d); c.push(col ? col[i] : 0);
  }
  return { vert: v, tri: t, col: c };
}

// GLB mínimo: una malla por color (posiciones + índices) con material de ese color.
function toGLB(groups, extras) {
  const views = [], accessors = [], meshes = [], materials = [], nodes = [], chunks = [];
  let offset = 0;
  const push = (arr, target) => {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (buf.length % 4)) % 4;
    views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
    chunks.push(buf, Buffer.alloc(pad)); offset += buf.length + pad;
    return views.length - 1;
  };
  for (const g of groups) {
    const pos = new Float32Array(g.vert), idx = g.vert.length / 3 > 65535 ? new Uint32Array(g.tri) : new Uint16Array(g.tri);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
    accessors.push({ bufferView: push(pos, 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
    accessors.push({ bufferView: push(idx, 34963), componentType: idx instanceof Uint32Array ? 5125 : 5123, count: idx.length, type: 'SCALAR' });
    const hex = g.color.replace('#', '');
    const lin = [0, 2, 4].map((o) => { const s = parseInt(hex.slice(o, o + 2), 16) / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    materials.push({ name: g.color, pbrMetallicRoughness: { baseColorFactor: [...lin, 1], metallicFactor: 0.05, roughnessFactor: 0.55 } });
    meshes.push({ name: g.name, primitives: [{ attributes: { POSITION: accessors.length - 2 }, indices: accessors.length - 1, material: materials.length - 1 }] });
    nodes.push({ mesh: meshes.length - 1, name: g.name });
  }
  const bin = Buffer.concat(chunks);
  const json = { asset: { version: '2.0', generator: 'BATBOX Biblioteca 3D' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes, meshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: bin.length }], extras };
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, bin]);
}

export function buildPreview(zipBuf, { bodyColor = null } = {}) {
  const files = collect(zipBuf);
  const mf = files.filter((f) => f.e === '3mf').sort((a, b) => b.data.length - a.data.length)[0];
  let objects, palette, mode;
  if (mf) {
    const r = parse3MF(ab(mf.data), mf.name);
    objects = r.objects; palette = r.palette; mode = '3mf';
  } else {
    const stls = files.filter((f) => f.e === 'stl');
    if (!stls.length) throw new Error('El ZIP no trae STL ni 3MF.');
    palette = []; objects = [];
    stls.forEach((f) => {
      const r = parseSTL(ab(f.data), f.name.replace(/\.stl$/i, ''));
      const named = NAME_COLORS.find(([re]) => re.test(f.name));
      const color = named ? named[1] : (bodyColor || DEFAULT_BODY); // lo que no es vidrio/rueda/etc. va del color de la carrocería
      let ci = palette.indexOf(color); if (ci < 0) { palette.push(color); ci = palette.length - 1; }
      for (const o of r.objects) objects.push({ ...o, col: new Int32Array(o.tri.length / 3).fill(ci) });
    });
    mode = 'stl';
  }
  // Tamaño de celda según el total de triángulos y el tamaño del conjunto.
  let total = 0; const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const o of objects) {
    total += o.tri.length / 3;
    for (let i = 0; i < o.vert.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], o.vert[i + k]); max[k] = Math.max(max[k], o.vert[i + k]); }
  }
  const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  let cell = total > TARGET_TRIS ? diag / (Math.sqrt(TARGET_TRIS) * 2.2) : 0;
  // Agrupa por color (las piezas sin color usan la paleta de muestra).
  const byColor = new Map();
  const add = (color, name, v, t) => {
    if (!byColor.has(color)) byColor.set(color, { color, name, vert: [], tri: [] });
    const g = byColor.get(color), base = g.vert.length / 3;
    for (const x of v) g.vert.push(x);
    for (const x of t) g.tri.push(x + base);
  };
  // Simplifica y, si quedó pesado, agranda la grilla y repite (hasta 8 intentos).
  let dec = null;
  for (let tries = 0; tries < 8; tries++) {
    dec = objects.map((o) => (cell ? decimate(o.vert, o.tri, o.col, cell) : { vert: o.vert, tri: [...o.tri], col: o.col ? [...o.col] : [] }));
    const n = dec.reduce((a, d) => a + d.tri.length / 3, 0);
    if (n <= TARGET_TRIS * 1.25) break;
    cell = cell ? cell * Math.max(1.25, Math.sqrt(n / TARGET_TRIS)) : diag / (Math.sqrt(TARGET_TRIS) * 2.2);
  }
  let tris = 0;
  for (const [oi, o] of objects.entries()) {
    const d = dec[oi];
    const groups = new Map();
    for (let i = 0; i < d.tri.length / 3; i++) {
      const ci = d.col[i];
      const color = ci != null && ci >= 0 && palette[ci] ? palette[ci] : FALLBACK[oi % FALLBACK.length];
      if (!groups.has(color)) groups.set(color, []);
      groups.get(color).push(d.tri[i * 3], d.tri[i * 3 + 1], d.tri[i * 3 + 2]);
    }
    for (const [color, t] of groups) {
      // Solo los vértices usados por este grupo.
      const used = new Map(), v = [], tt = [];
      for (const ix of t) { let n = used.get(ix); if (n === undefined) { n = used.size; used.set(ix, n); v.push(d.vert[ix * 3], d.vert[ix * 3 + 1], d.vert[ix * 3 + 2]); } tt.push(n); }
      add(color, o.name, v, tt); tris += tt.length / 3;
    }
  }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((x) => Math.round(x * 10) / 10);
  return { glb: toGLB([...byColor.values()], { mode, size_mm: size, parts: objects.length, source_tris: total }), tris, mode, size, parts: objects.length, colors: byColor.size };
}

// Color principal (más saturado) de una foto RGB cruda de w×h, para pintar la carrocería.
export function dominantColor(rgb) {
  const bins = new Map();
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 40 || mx - mn < 45) continue; // descarta grises, blancos y negros (fondo)
    const k = `${r >> 5},${g >> 5},${b >> 5}`;
    const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; bins.set(k, e);
  }
  const best = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  if (!best || best.n < rgb.length / 3 * 0.03) return null; // muy poco color: probablemente blanco/gris
  const h = (x) => Math.round(x / best.n).toString(16).padStart(2, '0');
  return `#${h(best.r)}${h(best.g)}${h(best.b)}`;
}
