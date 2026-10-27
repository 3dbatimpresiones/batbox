// Prueba del motor del Personalizador de chops en Node (no se publica).
// Uso: node scripts/test-chop.mjs <carpeta-salida>
import { mkdirSync, writeFileSync } from 'node:fs';
import Module from 'manifold-3d';
import { buildReliefs, chopFromMesh, combineAll, designSection, unionAll, wallIndex, wallRadius } from '../src/lib/chop/core.js';
import { computeLayout, rAt } from '../src/lib/chop/layout.js';
import { toBinarySTL } from '../src/lib/keychain/exporters.js';
import { detectWallZone, orient, guessAxis, radiusAt, weld } from '../src/lib/chop/files.js';
import { detectHandle } from '../src/lib/chop/handle.js';

const out = process.argv[2] || 'test-out';
mkdirSync(out, { recursive: true });
const M = await Module(); M.setup();
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'OK  ' : 'FALLA'} ${n}${x ? ' — ' + x : ''}`); };

// Chop de prueba: vaso (cilindro o cono) hueco con base, + asa en +X (ángulo 0°)
function makeChop(r0, r1, h, handle, rings = false) {
  const outer = M.Manifold.cylinder(h, r0, r1, 96);
  const inner = M.Manifold.cylinder(h, r0 - 3, r1 - 3, 96).translate([0, 0, 4]);
  let body = M.Manifold.difference(outer, inner);
  if (handle) {
    const ring = M.Manifold.difference(M.Manifold.cylinder(8, 28, 28, 48), M.Manifold.cylinder(8, 20, 20, 48)).translate([0, 0, -4])
      .rotate([90, 0, 0]).translate([(r0 + r1) / 2 + 14, 0, h / 2]);
    const cut = M.Manifold.cube([30, 30, h], true).translate([(r0 + r1) / 2 - 15 - 2, 0, h / 2]); // deja el asa metida 2 mm en la pared
    body = M.Manifold.union(body, M.Manifold.difference(ring, cut));
  }
  if (rings) {
    const lower = M.Manifold.difference(M.Manifold.cylinder(8, r0 + 4, r0 + 4, 96), M.Manifold.cylinder(8, r0 - 0.5, r0 - 0.5, 96)).translate([0, 0, 4]);
    const upper = M.Manifold.difference(M.Manifold.cylinder(8, r1 + 4, r1 + 4, 96), M.Manifold.cylinder(8, r1 - 0.5, r1 - 0.5, 96)).translate([0, 0, h - 12]);
    body = M.Manifold.union([body, lower, upper]);
  }
  const mesh = body.getMesh(); body.delete();
  // Como si viniera de un STL: triángulos sueltos → soldar → Manifold
  const soup = new Float32Array(mesh.triVerts.length * 3);
  for (let t = 0; t < mesh.triVerts.length; t++) for (let k = 0; k < 3; k++) soup[t * 3 + k] = mesh.vertProperties[mesh.triVerts[t] * mesh.numProp + k];
  return soup;
}
// Diseño: escudo cuadrado con un agujero en el medio (prueba de huecos), 20×24 "unidades SVG"
const shapes = [{ outer: [[-10, -12], [10, -12], [10, 12], [-10, 12]], holes: [[[-4, -4], [-4, 4], [4, 4], [4, -4]]] }];
const design = { w0: 20, h0: 24 };
const cs = designSection(M, shapes);
ok('el diseño conserva el hueco (área = 480 - 64)', Math.abs(cs.area() - (480 - 64)) < 0.5, cs.area().toFixed(1));

const base = { rows: 2, cols: 6, width: 20, gapV: 6, startH: 4, startAngle: 0, coverage: 360, stagger: false,
  exclude: false, exclCenter: 0, exclWidth: 60, depth: 0.6, relief: 1.2 };

// Detector de pared útil: dos aros salientes no deben formar parte de la zona decorable.
{
  const ringSoup = makeChop(40, 40, 120, true, true);
  const ringAxis = guessAxis(ringSoup);
  const ringPos = orient(ringSoup, { cx: ringAxis.cx, cy: ringAxis.cy });
  const zone = detectWallZone(ringPos);
  ok('detector: la zona cilíndrica principal queda entre los aros',
    zone.z0 > 10 && zone.z0 < 25 && zone.z1 > 95 && zone.z1 < 110 && zone.z1 - zone.z0 > 70,
    `z ${zone.z0.toFixed(1)}…${zone.z1.toFixed(1)}, r ${zone.r0.toFixed(1)}…${zone.r1.toFixed(1)}`);
}

for (const [name, r0, r1] of [['cilindro', 40, 40], ['cono', 34, 44]]) {
  const soup = makeChop(r0, r1, 120, true);
  // Detección de eje y radios con el asa puesta
  const ax = guessAxis(soup);
  ok(`${name}: eje detectado en el centro (no corrido por el asa)`, Math.hypot(ax.cx, ax.cy) < 0.5, `${ax.cx.toFixed(2)}, ${ax.cy.toFixed(2)}`);
  const pos = orient(soup, { cx: ax.cx, cy: ax.cy });
  const rz0 = radiusAt(pos, 15), rz1 = radiusAt(pos, 105);
  ok(`${name}: radios detectados sin contar el asa`, Math.abs(rz0 - (r0 + (r1 - r0) * 15 / 120)) < 0.6 && Math.abs(rz1 - (r0 + (r1 - r0) * 105 / 120)) < 0.6, `${rz0.toFixed(2)} / ${rz1.toFixed(2)}`);
  const { vert, tri } = weld(pos);
  const chop = chopFromMesh(M, vert, tri);
  const axis = { z0: 15, z1: 105, r0: rz0, r1: rz1 };

  // 1. Distribución básica
  let { reliefs, layout } = buildReliefs(M, cs, design, base, axis);
  ok(`${name}: 2 filas × 6 columnas = 12 diseños`, reliefs.length === 12 && layout.items.length === 12);
  ok(`${name}: separación horizontal = 360/6 = 60°`, Math.abs(layout.step - 60) < 1e-9);
  // Medidas reales de un relieve: ancho en mm sobre la pared y espesor hacia afuera
  const one = reliefs[0];
  const mesh = one.getMesh();
  let rMax = 0, rMin = Infinity, zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
    const x = mesh.vertProperties[i], y = mesh.vertProperties[i + 1], z = mesh.vertProperties[i + 2];
    const r = Math.hypot(x, y); rMax = Math.max(rMax, r); rMin = Math.min(rMin, r); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
  }
  const it = layout.items[0], rc = rAt(axis, it.h), cosP = Math.cos(Math.atan2(r1 - r0, 120));
  ok(`${name}: el relieve sobresale ${base.relief} mm y entra ${base.depth} mm en la pared`,
    Math.abs((rMax - rc) - (base.relief * cosP + 12 * Math.abs(Math.sin(Math.atan2(r1 - r0, 120))))) < 1.2 && rMin < rc - 0.3, `r ${rMin.toFixed(2)}…${rMax.toFixed(2)} (pared ${rc.toFixed(2)})`);
  ok(`${name}: alto del diseño = 24 mm a lo largo de la pared`, Math.abs((zMax - zMin) / cosP - 24) < 0.8 + (r0 !== r1 ? 1 : 0), ((zMax - zMin) / cosP).toFixed(2));

  // 2. Unión sólida y verificación
  const { result, check } = unionAll(M, chop, reliefs);
  reliefs.forEach((r) => r.delete());
  ok(`${name}: la unión es un sólido válido`, check.status === 'NoError');
  ok(`${name}: todo quedó en UNA sola pieza (ningún diseño flotando)`, check.pieces === 1, String(check.pieces));
  ok(`${name}: el volumen creció (se sumó el relieve)`, check.volume > check.chopVolume + 12 * 300, `${check.chopVolume.toFixed(0)} → ${check.volume.toFixed(0)}`);
  writeFileSync(`${out}/chop-${name}.stl`, toBinarySTL([result]));
  result.delete();

  // 2b. Grabado (hacia adentro): resta, una pieza, sin perforar (pared de 3 mm, grabado 1 mm)
  {
    const g = buildReliefs(M, cs, design, { ...base, mode: 'engrave', engrave: 1 }, axis);
    const { result: gr, check: gc } = combineAll(M, chop, g.reliefs, 'engrave');
    g.reliefs.forEach((r) => r.delete());
    ok(`${name}: grabado → sólido válido en una pieza`, gc.status === 'NoError' && gc.pieces === 1, `${gc.pieces} piezas`);
    ok(`${name}: grabado → el volumen bajó (se restó material)`, gc.volume < gc.chopVolume - 12 * 200, `${gc.chopVolume.toFixed(0)} → ${gc.volume.toFixed(0)}`);
    ok(`${name}: grabado de 1 mm no perfora la pared (genus igual)`, gc.genus === gc.chopGenus, `${gc.chopGenus} → ${gc.genus}`);
    writeFileSync(`${out}/chop-${name}-grabado.stl`, toBinarySTL([gr]));
    gr.delete();
    // Grabado más profundo que la pared (4 mm > 3 mm): se tiene que detectar
    const d = buildReliefs(M, cs, design, { ...base, mode: 'engrave', engrave: 4 }, axis);
    const { result: dr, check: dc } = combineAll(M, chop, d.reliefs, 'engrave');
    d.reliefs.forEach((r) => r.delete()); dr.delete();
    ok(`${name}: grabado que atraviesa la pared → se detecta`, dc.genus > dc.chopGenus || dc.pieces > dc.chopPieces, `genus ${dc.chopGenus} → ${dc.genus}, ${dc.pieces} piezas`);

    // Un STL puede traer adornos o partes cerradas separadas: no son un error nuevo del grabado.
    if (name === 'cilindro') {
      const ornament = M.Manifold.cube([4, 4, 4]).translate([100, 100, 0]);
      const multi = M.Manifold.union([chop, ornament]);
      ornament.delete();
      const mg = buildReliefs(M, cs, design, { ...base, mode: 'engrave', engrave: 1 }, axis);
      const mr = combineAll(M, multi, mg.reliefs, 'engrave');
      mg.reliefs.forEach((r) => r.delete());
      ok('grabado conserva las piezas que ya tenía el STL sin dar falso error',
        mr.check.chopPieces === 2 && mr.check.pieces === 2 && mr.check.genus === mr.check.chopGenus,
        `${mr.check.chopPieces} → ${mr.check.pieces} piezas`);
      mr.result.delete(); multi.delete();
    }
  }

  // 2c. Pared real: radios mal cargados (+5 mm) → sin ajuste los logos flotan; con ajuste quedan pegados
  {
    const wall = wallIndex(vert, tri);
    const expectedAtHandle = r0 + (r1 - r0) * 0.5;
    const measuredAtHandle = wallRadius(wall, 60, 0, expectedAtHandle);
    ok(`${name}: la pared real ignora el asa`, Math.abs(measuredAtHandle - expectedAtHandle) < 0.7,
      `${measuredAtHandle.toFixed(2)} mm (esperado ${expectedAtHandle.toFixed(2)})`);
    const bad = { ...axis, r0: axis.r0 + 5, r1: axis.r1 + 5 };
    const a = buildReliefs(M, cs, design, { ...base, snap: false }, bad, wall);
    const ra = combineAll(M, chop, a.reliefs, 'relief'); a.reliefs.forEach((r) => r.delete());
    ok(`${name}: con radios mal cargados y SIN ajuste, los logos flotan (se detecta)`, ra.check.pieces > 1, `${ra.check.pieces} piezas`);
    ra.result.delete();
    const b = buildReliefs(M, cs, design, { ...base, snap: true }, bad, wall);
    const rb = combineAll(M, chop, b.reliefs, 'relief'); b.reliefs.forEach((r) => r.delete());
    ok(`${name}: CON "ajustar a la pared" quedan todos pegados (1 pieza)`, rb.check.pieces === 1 && b.layout.snapped === 12, `${rb.check.pieces} piezas, ${b.layout.snapped} ajustados`);
    rb.result.delete();
    // Acercar / alejar: alejar 3 mm despega los logos (y se detecta)
    const c = buildReliefs(M, cs, design, { ...base, snap: true, radial: 3 }, axis, wall);
    const rc = combineAll(M, chop, c.reliefs, 'relief'); c.reliefs.forEach((r) => r.delete());
    ok(`${name}: alejar 3 mm los despega (control de acercamiento)`, rc.check.pieces > 1);
    rc.result.delete();
    // Un diseño suelto (Shift): se mueve solo ese
    const L = computeLayout({ ...base, overrides: { '0-0': { da: 10, dh: 5, spin: 30, s: 0.5 } } }, axis, 1.2);
    const moved = L.items.find((i) => i.key === '0-0'), other = L.items.find((i) => i.key === '0-1');
    const L0 = computeLayout(base, axis, 1.2);
    ok(`${name}: un diseño suelto se mueve/gira/escala solo`, Math.abs(moved.angle - L0.items[0].angle - 10) < 1e-9 && moved.spin === 30 && moved.s === 0.5
      && other.angle === L0.items[1].angle && other.s === 1);
  }

  // 3. Filas alternadas
  const alt = computeLayout({ ...base, stagger: true }, axis, 1.2);
  const a0 = alt.items.filter((i) => i.row === 0).map((i) => i.angle), a1 = alt.items.filter((i) => i.row === 1).map((i) => i.angle);
  ok(`${name}: alternadas → la 2.ª fila corrida media columna (30°)`, Math.abs(((a1[0] - a0[0]) + 360) % 360 - 30) < 1e-6, `${a0[0]}° / ${a1[0]}°`);
  // 4. Exclusión del asa (asa en 0°, 60° de ancho)
  const ex = computeLayout({ ...base, startAngle: -30, exclude: true, exclCenter: 0, exclWidth: 60 }, axis, 1.2);
  const near = ex.items.filter((i) => Math.min(Math.abs(i.angle), 360 - i.angle) < 30 + 15);
  ok(`${name}: con exclusión no hay diseños sobre el asa`, near.length === 0 && ex.items.length < 12, `${ex.items.length} diseños`);
  // 5. Cobertura parcial: 180° y 4 columnas → 45° entre centros, todos dentro de 0..180
  const half = computeLayout({ ...base, coverage: 180, cols: 4 }, axis, 1.2);
  ok(`${name}: cobertura 180° / 4 columnas = 45° y todo dentro del arco`, half.step === 45 && half.items.every((i) => i.angle > 0 && i.angle < 180), half.items.map((i) => i.angle).join(','));
  // 6. Filas que no entran en la zona → se ajustan automáticamente sin perder diseños
  const tall = computeLayout({ ...base, rows: 10 }, axis, 1.2);
  ok(`${name}: las filas se achican y quedan dentro de la pared útil`,
    tall.items.length === 60 && tall.items.every((i) => !i.out) && tall.W < base.width && tall.fitScale < 1,
    `${tall.W.toFixed(2)} mm, escala ${tall.fitScale.toFixed(3)}`);
  // 7. Manija: detección automática y regla dura (nunca un diseño sobre la manija)
  {
    const arcs = detectHandle(pos);
    const fmt = JSON.stringify(arcs.map((a) => [+a.center.toFixed(1), +a.width.toFixed(1), Math.round(a.z0), Math.round(a.z1)]));
    ok(`${name}: manija detectada sola en 0°, con su altura`, arcs.length === 1 && Math.min(arcs[0].center, 360 - arcs[0].center) < 3
      && arcs[0].z0 < 32 && arcs[0].z1 > 88 && arcs[0].z0 > 15 && arcs[0].z1 < 105, fmt);
    const on = computeLayout({ ...base, startAngle: -30 }, axis, 1.2, arcs);      // columna 0 justo sobre la manija
    const touching = on.items.filter((i) => Math.min(i.angle, 360 - i.angle) < 25);
    ok(`${name}: los diseños que caen sobre la manija se sacan (10 de 12) y avisa`,
      on.items.length === 10 && touching.length === 0 && on.onHandle === 2 && on.warnings.some((w) => w.includes('manija')), `${on.items.length} diseños`);
    const dragged = computeLayout({ ...base, overrides: { '0-0': { da: -30 } } }, axis, 1.2, arcs);   // arrastrado a mano encima
    ok(`${name}: un diseño arrastrado encima de la manija también se saca`, dragged.items.length === 11 && !dragged.items.some((i) => i.key === '0-0'));
    const spun = computeLayout({ ...base, startAngle: -30 + 26, spin: 90 }, axis, 1.2, arcs);   // girado: se mide su caja real
    ok(`${name}: girado 90° cuenta su ancho real (no se cuela por el costado)`, !spun.items.some((i) => Math.min(i.angle, 360 - i.angle) < 26));
    // Geometría real: ningún relieve ni grabado toca el volumen de la manija.
    const rm = (r0 + r1) / 2, hh = 120 / 2;
    const ringH = M.Manifold.difference(M.Manifold.cylinder(8, 28, 28, 48), M.Manifold.cylinder(8, 20, 20, 48)).translate([0, 0, -4]).rotate([90, 0, 0]).translate([rm + 14, 0, hh]);
    const wallCone = M.Manifold.cylinder(120, r0, r1, 96);
    const handleOnly = M.Manifold.difference(ringH, wallCone);
    const wall = wallIndex(vert, tri);
    for (const mode of ['relief', 'engrave']) {
      const pp = { ...base, startAngle: -30, mode, engrave: 0.8 };
      const touch = (reliefs) => { const u = M.Manifold.union(reliefs); const x = M.Manifold.intersection(u, handleOnly); const v = x.volume(); u.delete(); x.delete(); reliefs.forEach((r) => r.delete()); return v; };
      const without = touch(buildReliefs(M, cs, design, pp, axis, null, null).reliefs);   // pared ideal: así sin la regla seguro la toca
      const withSnap = touch(buildReliefs(M, cs, design, pp, axis, wall, arcs).reliefs);   // y con ajuste a la pared real
      const withH = touch(buildReliefs(M, cs, design, pp, axis, null, arcs).reliefs);
      ok(`${name} (${mode === 'engrave' ? 'grabado' : 'relieve'}): sin la regla tocaría la manija; con la regla, 0 mm³`, without > 1 && withH < 1e-6 && withSnap < 1e-6,
        `${without.toFixed(1)} mm³ → ${withH.toFixed(3)} mm³`);
    }
    ringH.delete(); wallCone.delete(); handleOnly.delete();
  }
  chop.delete();
}
// Sin manija → no inventa una (ni con aros)
for (const [label, soup] of [['vaso liso', makeChop(40, 40, 120, false)], ['vaso con aros', makeChop(40, 40, 120, false, true)]]) {
  const ax = guessAxis(soup);
  const arcs = detectHandle(orient(soup, { cx: ax.cx, cy: ax.cy }));
  ok(`${label}: no detecta manija donde no hay`, arcs.length === 0, JSON.stringify(arcs));
}
console.log(`\nResultado: ${pass} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
