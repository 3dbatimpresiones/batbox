// =====================================================================
// Creador de Llaveros: acomodar en la cama y exportar (STL y 3MF).
// El 3MF sigue el formato de proyecto de Bambu Studio / OrcaSlicer:
// cada llavero es UN objeto con DOS piezas (Base y Letras) y cada cama es una
// placa del proyecto, así en el slicer se mueve como una sola pieza y se le
// puede cambiar el color a la base o a las letras por separado.
// =====================================================================
import { strToU8, zipSync } from 'fflate';

// Camas de impresión (mm).
export const BEDS = [
  { id: 'a1', label: 'Bambu Lab A1', w: 256, h: 256, bambu: { model: 'Bambu Lab A1', printer: 'Bambu Lab A1 0.4 nozzle', process: '0.20mm Standard @BBL A1', filament: 'Generic PLA @BBL A1' } },
  { id: 'a1mini', label: 'Bambu Lab A1 mini', w: 180, h: 180, bambu: { model: 'Bambu Lab A1 mini', printer: 'Bambu Lab A1 mini 0.4 nozzle', process: '0.20mm Standard @BBL A1M', filament: 'Generic PLA @BBL A1M' } },
  { id: 'p1s', label: 'Bambu Lab P1S', w: 256, h: 256, bambu: { model: 'Bambu Lab P1S', printer: 'Bambu Lab P1S 0.4 nozzle', process: '0.20mm Standard @BBL X1C' } },
  { id: 'p1p', label: 'Bambu Lab P1P', w: 256, h: 256, bambu: { model: 'Bambu Lab P1P', printer: 'Bambu Lab P1P 0.4 nozzle', process: '0.20mm Standard @BBL X1C' } },
  { id: 'x1c', label: 'Bambu Lab X1 Carbon', w: 256, h: 256, bambu: { model: 'Bambu Lab X1 Carbon', printer: 'Bambu Lab X1 Carbon 0.4 nozzle', process: '0.20mm Standard @BBL X1C' } },
  { id: 'h2d', label: 'Bambu Lab H2D', w: 325, h: 320, bambu: { model: 'Bambu Lab H2D', printer: 'Bambu Lab H2D 0.4 nozzle', process: '0.20mm Standard @BBL H2D' } },
  { id: 'k1', label: 'Creality K1 / K1C', w: 220, h: 220 },
  { id: 'k1max', label: 'Creality K1 Max', w: 300, h: 300 },
  { id: 'ender3', label: 'Creality Ender 3 (V2/V3)', w: 220, h: 220 },
  { id: 'mk4', label: 'Prusa MK4 / MK3', w: 250, h: 210 },
  { id: 'custom', label: 'Otra (elegís la medida)', w: 220, h: 220 },
];

// ---------- Lista de nombres ----------
// Renglones, comas o punto y coma separan nombres ("Ana Paula" queda junto).
// Si todo vino en un solo renglón sin comas, separa por espacios.
export function parseNames(raw = '') {
  const text = String(raw).replace(/\r/g, '').trim();
  if (!text) return [];
  const hasSep = /[\n,;]/.test(text);
  const parts = hasSep ? text.split(/[\n,;]+/) : text.split(/\s+/);
  return parts.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 300);
}

// ---------- Acomodar en camas ----------
// Grilla uniforme (todas las celdas del tamaño del llavero más grande), centrada
// en la cama. Prueba girar 90° si así entran más. La última cama también queda
// centrada, con la última fila centrada.
export function arrange(items, bed, gap = 4, margin = 3) {
  if (!items.length) return [];
  const fit = (cw, ch) => ({
    cols: Math.max(0, Math.floor((bed.w - 2 * margin + gap) / (cw + gap))),
    rows: Math.max(0, Math.floor((bed.h - 2 * margin + gap) / (ch + gap))),
  });
  const cw0 = Math.max(...items.map((i) => i.w)), ch0 = Math.max(...items.map((i) => i.h));
  const a = fit(cw0, ch0), b = fit(ch0, cw0);
  const rot = b.cols * b.rows > a.cols * a.rows;
  const { cols, rows } = rot ? b : a;
  const cw = rot ? ch0 : cw0, ch = rot ? cw0 : ch0;
  if (!cols || !rows) return [{ tooBig: true, items: [] }];
  // Reparte parejo entre las camas necesarias (20 en 2 camas → 10 y 10, no 18 y 2).
  const nPlates = Math.ceil(items.length / (cols * rows));
  const per = Math.ceil(items.length / nPlates);
  const plates = [];
  for (let start = 0; start < items.length; start += per) {
    const chunk = items.slice(start, start + per);
    const c = Math.min(cols, chunk.length);
    const r = Math.ceil(chunk.length / c);
    const gridH = r * ch + (r - 1) * gap;
    const top = (bed.h + gridH) / 2;
    const placed = chunk.map((it, k) => {
      const row = Math.floor(k / c);
      const inRow = Math.min(c, chunk.length - row * c);              // la última fila se centra
      const rowW = inRow * cw + (inRow - 1) * gap;
      const col = k % c;
      const x = (bed.w - rowW) / 2 + col * (cw + gap) + cw / 2;
      const y = top - row * (ch + gap) - ch / 2;
      return { ...it, x, y, rot, w: rot ? it.h : it.w, h: rot ? it.w : it.h };
    });
    plates.push({ items: placed });
  }
  return plates;
}

// ---------- Mallas ----------
// Malla de manifold → posiciones (Float32) + triángulos (Uint32), ya movida a su lugar.
// Acepta un Manifold o una malla ya extraída { vertProperties, numProp, triVerts } (la del worker).
function meshData(manifold, place) {
  const m = manifold.getMesh ? manifold.getMesh() : manifold;
  const np = m.numProp, src = m.vertProperties, n = src.length / np;
  const pos = new Float32Array(n * 3);
  const { cx = 0, cy = 0, x = 0, y = 0, rot = false } = place || {};
  for (let i = 0; i < n; i++) {
    let px = src[i * np] - cx, py = src[i * np + 1] - cy;
    if (rot) { const t = px; px = -py; py = t; }                      // 90° antihorario
    pos[i * 3] = px + x; pos[i * 3 + 1] = py + y; pos[i * 3 + 2] = src[i * np + 2];
  }
  return { pos, tri: m.triVerts };
}

// STL binario de una o varias piezas (cada una: Manifold o {manifold, place}).
export function toBinarySTL(parts) {
  // Cada pieza: Manifold, malla { vertProperties… } o { manifold: (cualquiera de los dos), place }.
  const meshes = parts.map((p) => (p.manifold ? meshData(p.manifold, p.place) : meshData(p)));
  const nTri = meshes.reduce((a, m) => a + m.tri.length / 3, 0);
  const buf = new ArrayBuffer(84 + nTri * 50);
  const dv = new DataView(buf);
  const head = 'STL 3DBAT Creador de Llaveros';
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, nTri, true);
  let o = 84;
  for (const { pos, tri } of meshes) {
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t] * 3, b = tri[t + 1] * 3, c = tri[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true); o += 12;
      for (const v of [a, b, c]) { dv.setFloat32(o, pos[v], true); dv.setFloat32(o + 4, pos[v + 1], true); dv.setFloat32(o + 8, pos[v + 2], true); o += 12; }
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

// Dónde queda una pieza: su contorno se centra en (x, y) de la cama.
export const placeOf = (it, dx = 0, dy = 0) => ({
  cx: (it.bounds.minX + it.bounds.maxX) / 2, cy: (it.bounds.minY + it.bounds.maxY) / 2,
  x: it.x + dx, y: it.y + dy, rot: it.rot,
});

// ---------- 3MF (proyecto Bambu Studio / OrcaSlicer) ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : '00000000-0000-4000-8000-' + String(Date.now() % 1e12).padStart(12, '0'));
const f = (v) => (Math.round(v * 1e5) / 1e5).toString();

function meshXML(id, { pos, tri }) {
  const out = [`  <object id="${id}" p:UUID="${uuid()}" type="model">\n   <mesh>\n    <vertices>\n`];
  for (let i = 0; i < pos.length; i += 3) out.push(`     <vertex x="${f(pos[i])}" y="${f(pos[i + 1])}" z="${f(pos[i + 2])}"/>\n`);
  out.push('    </vertices>\n    <triangles>\n');
  for (let t = 0; t < tri.length; t += 3) out.push(`     <triangle v1="${tri[t]}" v2="${tri[t + 1]}" v3="${tri[t + 2]}"/>\n`);
  out.push('    </triangles>\n   </mesh>\n  </object>\n');
  return out.join('');
}

// Origen de cada placa en el proyecto de Bambu: grilla de columnas = ⌈√n⌉,
// separadas 1/5 del ancho de la cama (igual que Bambu Studio).
function plateOrigin(index, count, bed) {
  const v = Math.sqrt(count), r = Math.round(v);
  const cols = v > r ? r + 1 : r;
  const col = index % cols, row = Math.floor(index / cols);
  return [col * bed.w * 1.2, -row * bed.h * 1.2];
}

// plates: resultado de arrange() con cada item { name, base, letters, bounds, ... }.
export function build3MF(plates, bed, colors = {}) {
  const files = {};       // un archivo de mallas por llavero (3D/Objects/object_N.model), como Bambu
  const objects = [];     // objetos padre (dos componentes cada uno)
  const settings = [];    // Metadata/model_settings.config
  const build = [];
  const platesXML = [];
  const rels = [];
  let nextId = 1, nObj = 0;
  const NS0 = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"';
  plates.forEach((pl, pi) => {
    const [ox, oy] = plateOrigin(pi, plates.length, bed);
    const instances = [];
    pl.items.forEach((it) => {
      const local = { ...placeOf(it), x: 0, y: 0 };                 // malla centrada en el objeto
      const baseId = nextId++, lettersId = nextId++, objId = nextId++;
      const SUB = `/3D/Objects/object_${++nObj}.model`;
      files[SUB.slice(1)] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" ${NS0} requiredextensions="p">\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n`
        + meshXML(baseId, meshData(it.base, local)) + meshXML(lettersId, meshData(it.letters, local)) + ' </resources>\n <build/>\n</model>\n');
      rels.push(` <Relationship Target="${SUB}" Id="rel-${nObj}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n`);
      objects.push(`  <object id="${objId}" p:UUID="${uuid()}" type="model">\n   <components>\n`
        + `    <component p:path="${SUB}" objectid="${baseId}" p:UUID="${uuid()}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n`
        + `    <component p:path="${SUB}" objectid="${lettersId}" p:UUID="${uuid()}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n`
        + '   </components>\n  </object>\n');
      settings.push(`  <object id="${objId}">\n    <metadata key="name" value="${esc(it.name)}"/>\n    <metadata key="extruder" value="1"/>\n`
        + `    <part id="${baseId}" subtype="normal_part">\n      <metadata key="name" value="Base"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n      <metadata key="extruder" value="1"/>\n    </part>\n`
        + `    <part id="${lettersId}" subtype="normal_part">\n      <metadata key="name" value="Letras"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n      <metadata key="extruder" value="2"/>\n    </part>\n  </object>\n`);
      build.push(`  <item objectid="${objId}" p:UUID="${uuid()}" transform="1 0 0 0 1 0 0 0 1 ${f(ox + it.x)} ${f(oy + it.y)} 0" printable="1"/>\n`);
      instances.push(`    <model_instance>\n      <metadata key="object_id" value="${objId}"/>\n      <metadata key="instance_id" value="0"/>\n      <metadata key="identify_id" value="${objId * 10}"/>\n    </model_instance>\n`);
    });
    platesXML.push(`  <plate>\n    <metadata key="plater_id" value="${pi + 1}"/>\n    <metadata key="plater_name" value=""/>\n    <metadata key="locked" value="false"/>\n${instances.join('')}  </plate>\n`);
  });

  const today = new Date().toISOString().slice(0, 10);
  const mainModel = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" ${NS0} requiredextensions="p">\n`
    + ' <metadata name="Application">BambuStudio-02.05.00.66</metadata>\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n'
    + ` <metadata name="CreationDate">${today}</metadata>\n <metadata name="Designer">3DBAT IMPRESIONES</metadata>\n <metadata name="ModificationDate">${today}</metadata>\n <metadata name="Title">Llaveros 3DBAT</metadata>\n`
    + ` <resources>\n${objects.join('')} </resources>\n <build p:UUID="${uuid()}">\n${build.join('')} </build>\n</model>\n`;
  const config = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${settings.join('')}${platesXML.join('')}</config>\n`;
  Object.assign(files, {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n <Default Extension="png" ContentType="image/png"/>\n <Default Extension="gcode" ContentType="text/x.gcode"/>\n</Types>\n'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n'),
    '3D/_rels/3dmodel.model.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n${rels.join('')}</Relationships>\n`),
    '3D/3dmodel.model': strToU8(mainModel),
    'Metadata/model_settings.config': strToU8(config),
  });
  // Bambu Studio necesita project_settings.config (sin él se cierra). Va lo mínimo:
  // impresora y perfiles estándar si es una Bambu, y los dos filamentos con sus colores.
  const b = bed.bambu;
  const ps = { from: 'project', name: 'project_settings', version: '02.05.00.66',
    filament_colour: [colors.base || '#FFFFFF', colors.letters || '#F78EB6'], filament_type: ['PLA', 'PLA'] };
  if (b) {
    Object.assign(ps, { printer_model: b.model, printer_settings_id: b.printer, print_settings_id: b.process });
    if (b.filament) ps.filament_settings_id = [b.filament, b.filament];
  }
  files['Metadata/project_settings.config'] = strToU8(JSON.stringify(ps, null, 4));
  return zipSync(files, { level: 6 });
}

// ZIP de varios archivos { 'nombre.stl': Uint8Array }.
export const zipFiles = (files) => zipSync(files, { level: 6 });

// Nombre de archivo seguro ("Sofía González" → "Sofia_Gonzalez").
export const fileSafe = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'llavero';
