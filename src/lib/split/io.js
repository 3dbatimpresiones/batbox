// =====================================================================
// BATSplit 3D · lectura de modelos (corre dentro del worker).
//   STL binario/ASCII, OBJ (con usemtl y colores por vértice) y 3MF
//   (objetos, componentes, transformaciones, materiales, grupos de color
//   y pintura simple de Bambu Studio / OrcaSlicer).
// Resultado: { objects: [{ name, vert, tri, col }], palette: ['#rrggbb'], warnings: [] }
//   col[t] = índice de palette del triángulo t, o NO_COLOR.
// Todo en milímetros y en la posición original del archivo.
// =====================================================================
import { unzipSync, strFromU8 } from 'fflate';

export const NO_COLOR = 0xffff;
export const MAX_TRIS = 1500000;

// ---------- Paleta compartida ----------
function makePalette() {
  const list = [], map = new Map();
  return {
    list,
    add(hex) {
      const h = normHex(hex);
      if (!h) return NO_COLOR;
      let i = map.get(h);
      if (i === undefined) { i = list.length; list.push(h); map.set(h, i); }
      return i;
    },
  };
}
function normHex(c) {
  if (!c) return null;
  let s = String(c).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((x) => x + x).join('');
  if (/^[0-9a-f]{8}$/i.test(s)) s = s.slice(0, 6); // #RRGGBBAA → sin alfa
  return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toLowerCase() : null;
}
const rgbHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');

// Colores de muestra para materiales sin color declarado (OBJ sin .mtl, extrusores sin dato).
const SAMPLE = ['#5ddadb', '#f78eb6', '#8b5cf6', '#fbbf24', '#34d399', '#3b82f6', '#f97316', '#e2e8f0', '#ef4444', '#a3e635'];

// ---------- Une vértices repetidos (triángulos sueltos → malla indexada) ----------
export function weldSoup(pos) {
  const map = new Map(), vert = [], tri = new Uint32Array(pos.length / 3);
  const q = (x) => Math.round(x * 1e5);
  for (let i = 0; i < pos.length; i += 3) {
    const key = q(pos[i]) + ',' + q(pos[i + 1]) + ',' + q(pos[i + 2]);
    let idx = map.get(key);
    if (idx === undefined) { idx = vert.length / 3; map.set(key, idx); vert.push(pos[i], pos[i + 1], pos[i + 2]); }
    tri[i / 3] = idx;
  }
  return { vert: new Float32Array(vert), tri };
}

// ---------- STL ----------
export function parseSTL(buf, name = 'Modelo') {
  const dv = new DataView(buf);
  let pos = null;
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buf.byteLength) {
      pos = new Float32Array(n * 9);
      for (let t = 0, o = 84; t < n; t++, o += 50) for (let k = 0; k < 9; k++) pos[t * 9 + k] = dv.getFloat32(o + 12 + k * 4, true);
    }
  }
  if (!pos) {
    const text = new TextDecoder().decode(buf);
    if (!/^\s*solid/i.test(text) || !/facet/i.test(text)) throw new Error('El STL no es válido (ni binario ni de texto).');
    const nums = [];
    const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
    let m;
    while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
    if (!nums.length || nums.length % 9) throw new Error('No se pudo leer el STL de texto.');
    pos = new Float32Array(nums);
  }
  if (pos.length / 9 > MAX_TRIS) throw new Error(`El modelo tiene más de ${MAX_TRIS.toLocaleString('es-AR')} triángulos.`);
  const { vert, tri } = weldSoup(pos);
  return { objects: [{ name, vert, tri, col: null }], palette: [], warnings: [] };
}

// ---------- OBJ ----------
// Objetos por "o"/"g"; colores por material (usemtl) o por vértice ("v x y z r g b").
// Sin el .mtl no se conoce el color real del material: se asigna uno de muestra y se avisa.
export function parseOBJ(text, name = 'Modelo') {
  const pal = makePalette();
  const v = [], vc = [];
  const objects = [];
  const matColor = new Map();
  let cur = null, mat = null, usedMtl = false, usedVC = false;
  const start = (n) => { cur = { name: n || `${name} ${objects.length + 1}`, pos: [], col: [] }; objects.push(cur); };
  const colorFor = (vi) => {
    if (vc[vi]) { usedVC = true; return pal.add(rgbHex(...vc[vi])); }
    if (mat) {
      if (!matColor.has(mat)) matColor.set(mat, pal.add(SAMPLE[matColor.size % SAMPLE.length]));
      usedMtl = true;
      return matColor.get(mat);
    }
    return NO_COLOR;
  };
  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line || line[0] === '#') continue;
    const parts = line.split(/\s+/);
    const k = parts[0];
    if (k === 'v') {
      v.push(+parts[1], +parts[2], +parts[3]);
      vc.push(parts.length >= 7 ? [+parts[4], +parts[5], +parts[6]].map((x) => (x > 1 ? x / 255 : x)) : null);
    } else if (k === 'o' || k === 'g') {
      if (!cur || cur.pos.length) start(parts.slice(1).join(' '));
      else cur.name = parts.slice(1).join(' ') || cur.name;
    } else if (k === 'usemtl') mat = parts.slice(1).join(' ');
    else if (k === 'f') {
      if (!cur) start(name);
      const n = v.length / 3;
      const idx = parts.slice(1).map((p) => { const i = parseInt(p.split('/')[0], 10); return i < 0 ? n + i : i - 1; });
      if (idx.some((i) => !(i >= 0 && i < n))) throw new Error(`Cara inválida en la línea ${li + 1} del OBJ.`);
      for (let j = 1; j + 1 < idx.length; j++) {
        const a = idx[0], b = idx[j], c = idx[j + 1];
        for (const q of [a, b, c]) cur.pos.push(v[q * 3], v[q * 3 + 1], v[q * 3 + 2]);
        cur.col.push(colorFor(a));
      }
    }
  }
  const out = objects.filter((o) => o.pos.length).map((o) => {
    const { vert, tri } = weldSoup(new Float32Array(o.pos));
    const hasCol = o.col.some((c) => c !== NO_COLOR);
    return { name: o.name, vert, tri, col: hasCol ? Uint16Array.from(o.col) : null };
  });
  if (!out.length) throw new Error('El OBJ no tiene caras.');
  const total = out.reduce((a, o) => a + o.tri.length / 3, 0);
  if (total > MAX_TRIS) throw new Error(`El modelo tiene más de ${MAX_TRIS.toLocaleString('es-AR')} triángulos.`);
  const warnings = [];
  if (usedMtl && !usedVC) warnings.push('El OBJ usa materiales (.mtl) que no vienen en el archivo: cada material se muestra con un color de muestra.');
  return { objects: out, palette: pal.list, warnings };
}

// ---------- 3MF ----------
const UNIT = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
const attr = (s, k) => { const m = s.match(new RegExp(`(?:^|\\s)${k}="([^"]*)"`)); return m ? m[1] : null; };
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
function parseTransform(s) {
  if (!s) return IDENT;
  const n = s.trim().split(/\s+/).map(Number);
  return n.length === 12 && n.every(Number.isFinite) ? n : IDENT;
}
// 3MF: fila-vector. p' = [x y z 1] · M, con M en orden m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32.
function mulT(a, b) { // primero a, después b
  const r = new Array(12);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j] + (i === 3 ? b[9 + j] : 0);
  }
  return r;
}
const isMirror = (m) => (m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])) < 0;

// Pintura de Bambu/Orca: "4" = extrusor 1, "8" = 2, "0C" = 3, "1C" = 4 … Cadenas más largas = triángulo subdividido.
function bambuPaint(code) {
  if (!code) return { ext: 0, sub: false };
  const c = code.toUpperCase();
  if (c === '4') return { ext: 1, sub: false };
  if (c === '8') return { ext: 2, sub: false };
  if (c.length === 2 && c[1] === 'C') return { ext: parseInt(c[0], 16) + 3, sub: false };
  return { ext: 0, sub: true };
}

export function parse3MF(buf, name = 'Modelo') {
  let files;
  try { files = unzipSync(new Uint8Array(buf)); } catch { throw new Error('El 3MF está dañado o no es un 3MF.'); }
  const modelPaths = Object.keys(files).filter((k) => /\.model$/i.test(k));
  if (!modelPaths.length) throw new Error('El 3MF no tiene modelos 3D adentro.');
  const warnings = [];
  const pal = makePalette();

  // Colores de los filamentos del proyecto (Bambu/Orca)
  let filament = [];
  const proj = Object.keys(files).find((k) => /project_settings\.config$/i.test(k));
  if (proj) { try { filament = JSON.parse(strFromU8(files[proj])).filament_colour || []; } catch { /* sin datos */ } }
  const extColor = (ext) => (ext >= 1 ? pal.add(normHex(filament[ext - 1]) || SAMPLE[(ext - 1) % SAMPLE.length]) : NO_COLOR);
  // Extrusor por objeto (y por parte) en model_settings.config
  const objExt = new Map();
  const cfg = Object.keys(files).find((k) => /model_settings\.config$/i.test(k));
  if (cfg) {
    const xml = strFromU8(files[cfg]);
    for (const m of xml.matchAll(/<object\s+id="(\d+)"[^>]*>([\s\S]*?)<\/object>/gi)) {
      const e = m[2].match(/<metadata\s+key="extruder"\s+value="(\d+)"/i);
      if (e) objExt.set(m[1], +e[1]);
      for (const p of m[2].matchAll(/<part\s+id="(\d+)"[^>]*>([\s\S]*?)<\/part>/gi)) {
        const pe = p[2].match(/<metadata\s+key="extruder"\s+value="(\d+)"/i);
        if (pe) objExt.set(p[1], +pe[1]);
      }
    }
  }

  // Recursos por archivo: objetos, materiales y grupos de color.
  const docs = new Map();
  for (const path of modelPaths) {
    const xml = strFromU8(files[path]);
    const unit = UNIT[(xml.match(/<model[^>]*\sunit="([a-z]+)"/i) || [])[1]] || 1;
    const props = new Map(); // id → [índices de paleta]
    for (const m of xml.matchAll(/<(?:m:)?basematerials\s+([^>]*)>([\s\S]*?)<\/(?:m:)?basematerials>/gi)) {
      props.set(attr(m[1], 'id'), [...m[2].matchAll(/<(?:m:)?base\s+([^>]*?)\/?>/gi)].map((b) => pal.add(attr(b[1], 'displaycolor'))));
    }
    for (const m of xml.matchAll(/<(?:m:)?colorgroup\s+([^>]*)>([\s\S]*?)<\/(?:m:)?colorgroup>/gi)) {
      props.set(attr(m[1], 'id'), [...m[2].matchAll(/<(?:m:)?color\s+([^>]*?)\/?>/gi)].map((b) => pal.add(attr(b[1], 'color'))));
    }
    const objects = new Map();
    for (const m of xml.matchAll(/<object\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/object>)/gi)) {
      objects.set(attr(m[1], 'id'), { head: m[1], body: m[2] || '' });
    }
    const build = [...(xml.match(/<build[^>]*>([\s\S]*?)<\/build>/i)?.[1] || '').matchAll(/<item\s+([^>]*?)\/?>/gi)].map((m) => m[1]);
    docs.set('/' + path.replace(/^\//, ''), { unit, props, objects, build });
  }
  const root = docs.get('/3D/3dmodel.model') || [...docs.values()].find((d) => d.build.length) || [...docs.values()][0];

  let subdivided = false;
  const out = [];
  // Resuelve un objeto (malla o componentes) aplicando la transformación acumulada.
  const emit = (doc, id, T, label, ext, depth, sink) => {
    if (depth > 16) throw new Error('El 3MF tiene componentes anidados en bucle.');
    const o = doc.objects.get(id);
    if (!o) return;
    const myExt = objExt.get(id) || ext;
    const comps = [...o.body.matchAll(/<component\s+([^>]*?)\/?>/gi)];
    if (comps.length) {
      for (const c of comps) {
        const path = attr(c[1], 'p:path');
        const d2 = path ? docs.get(path.startsWith('/') ? path : '/' + path) : doc;
        if (!d2) { warnings.push(`Falta el archivo ${path} dentro del 3MF.`); continue; }
        emit(d2, attr(c[1], 'objectid'), mulT(parseTransform(attr(c[1], 'transform')), T), label, myExt, depth + 1, sink);
      }
      return;
    }
    const mesh = o.body.match(/<mesh[\s>][\s\S]*?<\/mesh>/i)?.[0];
    if (!mesh) return;
    const u = doc.unit;
    const vRaw = [];
    for (const m of mesh.matchAll(/<vertex\s+([^>]*?)\/?>/gi)) vRaw.push(+attr(m[1], 'x') * u, +attr(m[1], 'y') * u, +attr(m[1], 'z') * u);
    const nv = vRaw.length / 3;
    const vert = new Float32Array(vRaw.length);
    for (let i = 0; i < nv; i++) {
      const x = vRaw[i * 3], y = vRaw[i * 3 + 1], z = vRaw[i * 3 + 2];
      vert[i * 3] = x * T[0] + y * T[3] + z * T[6] + T[9];
      vert[i * 3 + 1] = x * T[1] + y * T[4] + z * T[7] + T[10];
      vert[i * 3 + 2] = x * T[2] + y * T[5] + z * T[8] + T[11];
    }
    const flip = isMirror(T);
    const objPid = attr(o.head, 'pid'), objPi = +(attr(o.head, 'pindex') || 0);
    const objCol = objPid && doc.props.get(objPid) ? doc.props.get(objPid)[objPi] ?? NO_COLOR : extColor(myExt);
    const tri = [], col = [];
    for (const m of mesh.matchAll(/<triangle\s+([^>]*?)\/?>/gi)) {
      const a = +attr(m[1], 'v1'), b = +attr(m[1], 'v2'), c = +attr(m[1], 'v3');
      if (!(a < nv && b < nv && c < nv)) throw new Error('El 3MF tiene un triángulo con vértices inexistentes.');
      if (flip) tri.push(a, c, b); else tri.push(a, b, c);
      let ci = objCol;
      const pid = attr(m[1], 'pid'), p1 = attr(m[1], 'p1');
      if (p1 !== null && doc.props.get(pid || objPid)) ci = doc.props.get(pid || objPid)[+p1] ?? ci;
      const paint = attr(m[1], 'paint_color') || attr(m[1], 'slic3rpe:mmu_segmentation');
      if (paint) { const p = bambuPaint(paint); if (p.sub) subdivided = true; else if (p.ext) ci = extColor(p.ext); }
      col.push(ci);
    }
    sink.push({ vert, tri: Uint32Array.from(tri), col });
  };

  const items = root.build.length ? root.build : [...root.objects.keys()].map((id) => `objectid="${id}"`);
  for (const it of items) {
    const id = attr(it, 'objectid');
    const o = root.objects.get(id);
    if (!o) continue;
    const label = attr(o.head, 'name') || `${name} ${out.length + 1}`;
    const sink = [];
    emit(root, id, parseTransform(attr(it, 'transform')), label, 0, 0, sink);
    if (!sink.length) continue;
    // Las partes de un mismo objeto se juntan en una sola malla.
    let nv = 0, nt = 0;
    for (const s of sink) { nv += s.vert.length; nt += s.tri.length; }
    const vert = new Float32Array(nv), tri = new Uint32Array(nt), col = new Uint16Array(nt / 3);
    let ov = 0, ot = 0, oc = 0;
    for (const s of sink) {
      vert.set(s.vert, ov);
      for (let i = 0; i < s.tri.length; i++) tri[ot + i] = s.tri[i] + ov / 3;
      col.set(s.col, oc);
      ov += s.vert.length; ot += s.tri.length; oc += s.col.length;
    }
    out.push({ name: label, vert, tri, col: col.some((c) => c !== NO_COLOR) ? col : null });
  }
  if (!out.length) throw new Error('El 3MF no tiene triángulos.');
  const total = out.reduce((a, o) => a + o.tri.length / 3, 0);
  if (total > MAX_TRIS) throw new Error(`El modelo tiene más de ${MAX_TRIS.toLocaleString('es-AR')} triángulos.`);
  if (subdivided) warnings.push('El 3MF tiene pintura fina (triángulos subdivididos al pintar). En esta etapa esos triángulos toman el color base del objeto.');
  return { objects: out, palette: pal.list, warnings };
}

export function parseModel(name, buf) {
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const base = name.replace(/\.[^.]+$/, '');
  if (ext === 'stl') return parseSTL(buf, base);
  if (ext === 'obj') return parseOBJ(new TextDecoder().decode(buf), base);
  if (ext === '3mf') return parse3MF(buf, base);
  throw new Error('Formato no soportado. Usá STL, OBJ o 3MF.');
}
