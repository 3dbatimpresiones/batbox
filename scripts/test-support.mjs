import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { analyze, fromManifold, merge, splitBodies, toManifold } from '../src/lib/split/core.js';
import { parseSTL } from '../src/lib/split/io.js';
import { binarySTL } from '../src/lib/split/export.js';
import { analyzeLayers, optimizeSupport, supportSettings } from '../src/lib/support/core.js';

const M = await Module(); M.setup(); let passed = 0;
const ok = (name, value) => { assert.ok(value, name); passed++; console.log(`OK   ${name}`); };
const partFrom = (man, name) => { const p = fromManifold(man, man.originalID()); man.delete(); return { ...p, name }; };
const settings = { angle: 50, layerHeight: .25, extrusionWidth: .42, minRegionArea: .2, maxAddedPercent: 150, preserveHoles: true };

const s = supportSettings(settings);
ok('la convención angular deja cero desplazamiento a 90 grados', supportSettings({ ...settings, angle: 90 }).lateralStep === 0);
ok('el paso lateral depende de altura y ángulo reales', s.lateralStep > 0 && s.lateralStep < settings.layerHeight);

const cube = partFrom(M.Manifold.cube([20, 20, 20]).translate([-10, -10, 0]), 'cubo');
const cubeAnalysis = analyzeLayers(M, cube, settings);
ok('un cubo vertical no presenta regiones críticas', cubeAnalysis.regions === 0);
const cubeResult = optimizeSupport(M, cube, settings);
ok('una pieza sin voladizos conserva exactamente su volumen', Math.abs(cubeResult.stats.optimizedVolume - analyze(cube).volume) < 1e-5 && !cubeResult.added);
const secondCube = partFrom(M.Manifold.cube([6, 6, 6]).translate([30, 0, 0]), 'segundo');
const separated = splitBodies(merge([cube, secondCube]));
ok('un STL con varios cuerpos se separa antes del análisis', separated.length === 2 && separated.every((p) => analyzeLayers(M, p, settings).regions === 0));

const pillar = M.Manifold.cube([10, 20, 12]).translate([-5, -10, 0]);
const arm = M.Manifold.cube([32, 20, 5]).translate([-5, -10, 12]);
const overhang = partFrom(pillar.add(arm), 'voladizo-horizontal'); pillar.delete(); arm.delete();
const before = analyzeLayers(M, overhang, settings);
ok('detecta un voladizo horizontal mediante secciones consecutivas', before.regions > 0 && before.unsupportedArea > 0);
const fixed = optimizeSupport(M, overhang, settings);
ok('genera volumen geométrico real debajo del voladizo', fixed.added && fixed.stats.addedVolume > 1);
ok('la corrección queda unida en una malla cerrada', analyze(fixed.part).closed && analyze(fixed.part).components === 1);
ok('el análisis posterior confirma que cambiaron los voladizos', fixed.stats.corrected > 0 && fixed.stats.unresolved === 0);

const block = M.Manifold.cube([24, 24, 20]).translate([-12, -12, 0]);
const bore = M.Manifold.cylinder(20, 4, 4, 48).translate([0, 0, 0]);
const holed = partFrom(block.subtract(bore), 'agujero-pasante'); block.delete(); bore.delete();
const holeSource = toManifold(M, holed), holeBefore = holeSource.genus(); holeSource.delete();
const holeResult = optimizeSupport(M, holed, settings);
const holeMan = toManifold(M, holeResult.part), holeAfter = holeMan.genus(); holeMan.delete();
ok('un agujero pasante permanece abierto y con el mismo género', holeBefore === holeAfter && holeAfter >= 1);

const bytes = binarySTL(fixed.part, fixed.part.name);
const roundTrip = parseSTL(bytes.buffer, 'roundtrip').objects[0];
ok('el STL exportado se reimporta con la modificación presente', analyze(roundTrip).closed && analyze(roundTrip).volume > analyze(overhang).volume + 1);
assert.throws(() => optimizeSupport(M, overhang, { ...settings, maxAddedPercent: 1 }), /por encima del límite/);
passed++; console.log('OK   rechaza una corrección que excede la tolerancia');

console.log(`BATSUPPORT: ${passed} pruebas OK.`);
