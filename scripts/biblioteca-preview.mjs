// Vista previa 3D liviana de un modelo de la Biblioteca (para el visor de la ficha).
// Entrada: el ZIP del modelo (Buffer). Salida: un GLB con una malla por color, simplificada.
//   - Si el ZIP trae un .3mf, se usan sus colores (filamentos/pintura de Bambu/Orca).
//   - Si solo trae STL, cada pieza se pinta según su nombre (vidrios, neumáticos, llantas…)
//     y la carrocería con el color principal de la foto (si se pasa bodyColor).
// No usa dependencias nuevas: fflate (ya está en BATBOX) y el lector de src/lib/split/io.js.
import { unzipSync } from 'fflate';
import { isRar, rarExtract } from './biblioteca-rar.mjs';
import { parse3MF, parseSTL } from '../src/lib/split/io.js';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const TARGET_TRIS = 200000; // total aproximado de la vista previa (~1–2 MB)
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
// También acepta un RAR (se abre con biblioteca-rar.mjs) y ZIP dentro del RAR.
async function collect(zipBuf) {
  const out = [];
  const walk = (files, depth) => {
    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith('/') || /__MACOSX|\.DS_Store/i.test(name)) continue;
      const e = ext(name);
      if (e === 'zip' && depth < 2) { try { walk(unzipSync(data), depth + 1); } catch { /* ZIP dañado: se ignora */ } }
      else if (e === '3mf' || e === 'stl') out.push({ name: name.split('/').pop(), e, data });
    }
  };
  if (isRar(zipBuf)) walk(await rarExtract(zipBuf, (n) => /\.(3mf|stl|zip)$/i.test(n)), 0);
  else walk(unzipSync(new Uint8Array(zipBuf)), 0);
  return out;
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
  // Compresión: posiciones cuantizadas a 16 bits (paso < 0,02 mm, invisible) + códec meshopt sin pérdida.
  let rawOffset = 0;
  const pushC = (raw, count, stride, mode, target) => {
    const enc = mode === 'TRIANGLES' ? MeshoptEncoder.encodeIndexBuffer(raw, count, stride) : MeshoptEncoder.encodeVertexBuffer(raw, count, stride);
    const buf = Buffer.from(enc.buffer, enc.byteOffset, enc.byteLength), pad = (4 - (buf.length % 4)) % 4;
    const view = { buffer: 1, byteOffset: rawOffset, byteLength: raw.byteLength, target,
      extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: offset, byteLength: buf.length, byteStride: stride, count, mode } } };
    if (mode === 'ATTRIBUTES') view.byteStride = stride;
    views.push(view); chunks.push(buf, Buffer.alloc(pad)); offset += buf.length + pad;
    rawOffset += raw.byteLength + ((4 - (raw.byteLength % 4)) % 4);
    return views.length - 1;
  };
  for (const g of groups) {
    const n = g.vert.length / 3;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < g.vert.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], g.vert[i + k]); max[k] = Math.max(max[k], g.vert[i + k]); }
    const scale = min.map((m, k) => Math.max(max[k] - m, 1e-6) / 65535);
    const q = new Uint16Array(n * 4); // xyz + relleno (cada vértice debe ocupar múltiplo de 4 bytes)
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) q[i * 4 + k] = Math.round((g.vert[i * 3 + k] - min[k]) / scale[k]);
    const idx = n > 65535 ? new Uint32Array(g.tri) : new Uint16Array(g.tri);
    accessors.push({ bufferView: pushC(new Uint8Array(q.buffer), n, 8, 'ATTRIBUTES', 34962), componentType: 5123, count: n, type: 'VEC3', min: [0, 0, 0], max: [0, 1, 2].map((k) => { let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, q[i * 4 + k]); return mx; }) });
    accessors.push({ bufferView: pushC(new Uint8Array(idx.buffer), idx.length, idx.BYTES_PER_ELEMENT, 'TRIANGLES', 34963), componentType: idx instanceof Uint32Array ? 5125 : 5123, count: idx.length, type: 'SCALAR' });
    g.q = { translation: min, scale };
    const hex = g.color.replace('#', '');
    const lin = [0, 2, 4].map((o) => { const s = parseInt(hex.slice(o, o + 2), 16) / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    materials.push({ name: g.color, pbrMetallicRoughness: { baseColorFactor: [...lin, 1], metallicFactor: 0.05, roughnessFactor: 0.55 } });
    meshes.push({ name: g.name, primitives: [{ attributes: { POSITION: accessors.length - 2 }, indices: accessors.length - 1, material: materials.length - 1 }] });
    nodes.push({ mesh: meshes.length - 1, name: g.name, translation: g.q.translation, scale: g.q.scale });
  }
  const bin = Buffer.concat(chunks);
  const json = { asset: { version: '2.0', generator: 'BATBOX Biblioteca 3D' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }],
    extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'], extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
    nodes, meshes, materials, accessors, bufferViews: views,
    buffers: [{ byteLength: bin.length }, { byteLength: rawOffset, extensions: { EXT_meshopt_compression: { fallback: true } } }], extras };
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, bin]);
}

// Datos de impresión REALES que guarda Bambu/Orca en el 3MF laminado (Metadata/slice_info.config):
// tiempo (s) y filamento (g) por cama. Si el 3MF no fue laminado, no hay datos y no se inventan.
// Devuelve [{ file, time_s, grams, plates }] (uno por 3MF que los traiga).
export function printFrom(files) {
  const out = [];
  for (const f of files.filter((x) => x.e === '3mf')) {
    let inner; try { inner = unzipSync(f.data, { filter: (e) => /slice_info\.config$/i.test(e.name) }); } catch { continue; }
    const key = Object.keys(inner)[0]; if (!key) continue;
    const xml = new TextDecoder().decode(inner[key]);
    let time = 0, grams = 0, plates = 0;
    for (const plate of xml.split(/<plate>/i).slice(1)) {
      const t = Number(plate.match(/key="prediction"\s+value="([\d.]+)"/)?.[1] || 0), g = Number(plate.match(/key="weight"\s+value="([\d.]+)"/)?.[1] || 0);
      if (t > 0 || g > 0) { time += t; grams += g; plates++; }
    }
    if (plates) out.push({ file: f.name, time_s: Math.round(time), grams: Math.round(grams * 10) / 10, plates });
  }
  return out;
}
export async function printInfo(zipBuf) { return printFrom(await collect(zipBuf)); }

export async function buildPreview(zipBuf, { bodyColor = null } = {}) {
  const files = await collect(zipBuf);
  const print = printFrom(files);
  const { objects, palette, mode } = loadObjects(files, bodyColor);
  const est = estimate(objects), swatches = mode === '3mf' ? usedColors(objects, palette) : [];
  return { ...(await meshPreview(objects, palette, mode)), print, est, swatches };
}

// Datos livianos (sin armar la vista 3D): impresión real, estimación y colores del 3MF.
export async function modelData(zipBuf) {
  const files = await collect(zipBuf);
  const { objects, palette, mode } = loadObjects(files, null);
  return { print: printFrom(files), est: estimate(objects), swatches: mode === '3mf' ? usedColors(objects, palette) : [] };
}

// Colores del 3MF que de verdad usan las piezas, del más usado al menos usado.
function usedColors(objects, palette) {
  const n = new Map();
  for (const o of objects) if (o.col) for (const ci of o.col) if (ci >= 0 && palette[ci]) n.set(palette[ci], (n.get(palette[ci]) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c.toLowerCase()).slice(0, 12);
}

// Estimación de filamento y tiempo a partir de la geometría (cuando el 3MF no trae los datos del laminador).
// Perfil típico: 2 perímetros (0,8 mm) + capas sup./inf., 15 % de relleno, PLA 1,24 g/cm³.
// EST_TIME_S_PER_G se calibró con los modelos que sí traen tiempo y gramos reales.
const WALL_MM = 0.8, INFILL = 0.15, DENSITY = 1.24, EST_GRAMS_K = 1.1, EST_TIME_S_PER_G = 130; // calibrado 2026-11-09 con 11 modelos reales
function estimate(objects) {
  let vol = 0, area = 0;
  for (const o of objects) {
    const v = o.vert, t = o.tri; let ov = 0;
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
      const ax = v[a], ay = v[a + 1], az = v[a + 2], bx = v[b], by = v[b + 1], bz = v[b + 2], cx = v[c], cy = v[c + 1], cz = v[c + 2];
      ov += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
      area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
    }
    vol += Math.abs(ov);
  }
  if (!(vol > 0)) return null;
  const shell = Math.min(vol, area * WALL_MM), solid = shell + (vol - shell) * INFILL; // mm³ de plástico
  const grams = (solid / 1000) * DENSITY * EST_GRAMS_K;
  return { vol_cm3: Math.round(vol / 100) / 10, grams: Math.round(grams), time_s: Math.round(grams * EST_TIME_S_PER_G) };
}

function loadObjects(files, bodyColor) {
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
  return { objects, palette, mode };
}

async function meshPreview(objects, palette, mode) {
  // Simplificación de calidad (meshoptimizer) por pieza y por color, respetando bordes entre colores.
  await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
  let total = 0; const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const o of objects) {
    total += o.tri.length / 3;
    for (let i = 0; i < o.vert.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], o.vert[i + k]); max[k] = Math.max(max[k], o.vert[i + k]); }
  }
  const ratio = Math.min(1, TARGET_TRIS / Math.max(total, 1));
  const byColor = new Map(), boxes = [];
  const add = (color, name, v, t) => {
    if (!byColor.has(color)) byColor.set(color, { color, name, vert: [], tri: [] });
    const g = byColor.get(color), base = g.vert.length / 3;
    for (const x of v) g.vert.push(x);
    for (const x of t) g.tri.push(x + base);
  };
  let tris = 0;
  for (const [oi, o] of objects.entries()) {
    const ob = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < o.vert.length; i += 3) { ob[0] = Math.min(ob[0], o.vert[i]); ob[1] = Math.min(ob[1], o.vert[i + 1]); ob[2] = Math.max(ob[2], o.vert[i]); ob[3] = Math.max(ob[3], o.vert[i + 1]); }
    boxes.push(ob);
    // Triángulos de esta pieza agrupados por color.
    const groups = new Map();
    const nt = o.tri.length / 3;
    for (let i = 0; i < nt; i++) {
      const ci = o.col ? o.col[i] : -1;
      const color = ci != null && ci >= 0 && palette[ci] ? palette[ci] : FALLBACK[oi % FALLBACK.length];
      if (!groups.has(color)) groups.set(color, []);
      groups.get(color).push(o.tri[i * 3], o.tri[i * 3 + 1], o.tri[i * 3 + 2]);
    }
    const positions = o.vert instanceof Float32Array ? o.vert : new Float32Array(o.vert);
    for (const [color, idx] of groups) {
      let ind = new Uint32Array(idx);
      const want = Math.max(36, Math.floor((ind.length * ratio) / 3) * 3);
      if (ratio < 1 && ind.length > want) {
        const [out] = MeshoptSimplifier.simplify(ind, positions, 3, want, 0.02, ['LockBorder']);
        if (out.length >= 3) ind = out;
      }
      // Solo los vértices usados por este grupo.
      const used = new Map(), v = [], tt = [];
      for (const ix of ind) { let n = used.get(ix); if (n === undefined) { n = used.size; used.set(ix, n); v.push(positions[ix * 3], positions[ix * 3 + 1], positions[ix * 3 + 2]); } tt.push(n); }
      add(color, o.name, v, tt); tris += tt.length / 3;
    }
  }
  const plates = layoutPlates(boxes);
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((x) => Math.round(x * 10) / 10);
  return { glb: toGLB([...byColor.values()], { mode, size_mm: size, parts: objects.length, source_tris: total, plates }), tris, mode, size, parts: objects.length, colors: byColor.size, plates: plates.length };
}

// Camas de impresión: agrupa las piezas como estaban en el laminador (varias camas en un 3MF)
// y arma una cama de 256 × 256 mm por grupo (más grande si el grupo no entra).
const BED = 256;
function layoutPlates(boxes) {
  const groups = boxes.map((b) => [...b]);
  const fits = (a, b) => Math.max(a[2], b[2]) - Math.min(a[0], b[0]) <= BED && Math.max(a[3], b[3]) - Math.min(a[1], b[1]) <= BED;
  const near = (a, b, gap) => a[0] - gap <= b[2] && b[0] - gap <= a[2] && a[1] - gap <= b[3] && b[1] - gap <= a[3];
  // 1) junta las piezas que se tocan o están muy cerca; 2) junta grupos que entran juntos en una cama.
  for (const [gap, needFit] of [[12, false], [60, true], [400, true]]) {
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < groups.length && !merged; i++) for (let j = i + 1; j < groups.length && !merged; j++) {
        const a = groups[i], b = groups[j];
        if (near(a, b, gap) && (!needFit || fits(a, b))) {
          groups[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
          groups.splice(j, 1); merged = true;
        }
      }
    }
  }
  // 3) si dos camas se pisan, se juntan en una (más grande) para que no se superpongan.
  const bed = (g) => { const w = Math.max(BED, g[2] - g[0] + 10), d = Math.max(BED, g[3] - g[1] + 10), cx = (g[0] + g[2]) / 2, cy = (g[1] + g[3]) / 2; return [cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2]; };
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < groups.length && !again; i++) for (let j = i + 1; j < groups.length && !again; j++) {
      if (near(bed(groups[i]), bed(groups[j]), -4)) {
        const a = groups[i], b = groups[j];
        groups[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
        groups.splice(j, 1); again = true;
      }
    }
  }
  return groups.map((g) => {
    const w = Math.max(BED, g[2] - g[0] + 10), d = Math.max(BED, g[3] - g[1] + 10);
    return { x: Math.round((g[0] + g[2]) / 2 * 10) / 10, y: Math.round((g[1] + g[3]) / 2 * 10) / 10, w: Math.round(w), d: Math.round(d) };
  });
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
