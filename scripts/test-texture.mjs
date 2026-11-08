import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { applyTexture, applyTextureLayers, brushSelection, PATTERNS, selectAll, selectConnected } from '../src/lib/texture/core.js';
import { analyze } from '../src/lib/split/core.js';
import { binarySTL } from '../src/lib/split/export.js';
import { parse3MF, parseSTL } from '../src/lib/split/io.js';
import { binary3MF } from '../src/lib/texture/export3mf.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`OK ${passed} - ${name}`); };

function cube(size = 20) {
  const s = size, vert = Float32Array.from([0,0,0,s,0,0,s,s,0,0,s,0,0,0,s,s,0,s,s,s,s,0,s,s]);
  const tri = Uint32Array.from([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);
  return { name: 'cubo', vert, tri, col: null };
}

function cylinder(segments = 24, radius = 10, height = 24) {
  const v = [], t = [];
  for (let i = 0; i < segments; i++) { const a = i / segments * Math.PI * 2; v.push(Math.cos(a) * radius, Math.sin(a) * radius, 0); }
  for (let i = 0; i < segments; i++) { const a = i / segments * Math.PI * 2; v.push(Math.cos(a) * radius, Math.sin(a) * radius, height); }
  const bottom = v.length / 3; v.push(0,0,0); const top = v.length / 3; v.push(0,0,height);
  for (let i = 0; i < segments; i++) { const n = (i + 1) % segments, a = i, b = n, c = segments + n, d = segments + i; t.push(a,b,c,a,c,d); }
  for (let i = 0; i < segments; i++) { const n = (i + 1) % segments; t.push(bottom,n,i,top,segments+i,segments+n); }
  return { name: 'cilindro', vert: Float32Array.from(v), tri: Uint32Array.from(t), col: null };
}

function ringHole(segments = 32, outer = 15, inner = 5, height = 8) {
  const v = [], t = [];
  for (let i = 0; i < segments; i++) { const a = i / segments * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); v.push(c*outer,s*outer,0,c*outer,s*outer,height,c*inner,s*inner,0,c*inner,s*inner,height); }
  for (let i = 0; i < segments; i++) { const n = (i + 1) % segments, ob=i*4, ot=ob+1, ib=ob+2, it=ob+3, nob=n*4, not=nob+1, nib=nob+2, nit=nob+3; t.push(ob,nob,not,ob,not,ot, ib,nit,nib,ib,it,nit, ot,not,nit,ot,nit,it, ob,nib,nob,ob,ib,nib); }
  return { name:'aro-con-agujero', vert:Float32Array.from(v), tri:Uint32Array.from(t), col:null };
}

function octaSphere(radius = 12) {
  const v = Float32Array.from([radius,0,0,-radius,0,0,0,radius,0,0,-radius,0,0,0,radius,0,0,-radius]);
  const t = Uint32Array.from([4,0,2,4,2,1,4,1,3,4,3,0,5,2,0,5,1,2,5,3,1,5,0,3]);
  return { name: 'esfera', vert:v, tri:t, col:null };
}

const base = cube(), baseInfo = analyze(base);
test('fixture cubo cerrado', () => { assert.equal(baseInfo.open, 0); assert.equal(baseInfo.volume, 8000); });
const top = selectConnected(base, 2, 12);
test('cubo: seleccion conectada toma solo una cara plana', () => assert.equal(top.reduce((a,b) => a+b, 0), 2));
const texturedCube = applyTexture(base, top, { pattern:'hex', depth:.8, scale:4, detail:2 }).part;
test('cubo: subdivide solo la cara seleccionada', () => assert.equal(texturedCube.tri.length / 3, 28));
test('cubo: relieve fisico supera la altura original', () => assert.ok(analyze(texturedCube).max[2] > 20.05));
test('cubo: no crea aristas abiertas o no-manifold', () => { const i = analyze(texturedCube); assert.equal(i.open, 0); assert.equal(i.nonManifold, 0); assert.equal(i.degenerate, 0); });
test('cubo: caras no seleccionadas conservan sus vertices', () => { for (let i = 0; i < base.vert.length; i++) assert.equal(texturedCube.vert[i], base.vert[i]); });

const cyl = cylinder(), lateral = selectConnected(cyl, 0, 20);
test('cilindro: la tolerancia recorre toda la pared lateral', () => assert.equal(lateral.reduce((a,b) => a+b, 0), 48));
const texturedCylinder = applyTexture(cyl, lateral, { pattern:'knurl', projection:'cylindrical', depth:.6, scale:5, detail:1 }).part;
test('cilindro: moleteado cilindrico conserva cierre y costura', () => { const i = analyze(texturedCylinder); assert.equal(i.open, 0); assert.equal(i.nonManifold, 0); assert.equal(i.flipped, 0); });

const sphere = octaSphere(), organic = applyTexture(sphere, selectAll(sphere), { pattern:'voronoi', projection:'triplanar', depth:.4, scale:3, detail:2 }).part;
test('esfera: textura organica conserva continuidad', () => { const i = analyze(organic); assert.equal(i.open, 0); assert.equal(i.nonManifold, 0); assert.equal(i.components, 1); });
test('cinco patrones generan geometria finita', () => { for (const p of PATTERNS) { const r = applyTexture(base, top, { pattern:p.id, depth:.4, scale:3, detail:1 }).part; assert.ok([...r.vert].every(Number.isFinite), p.id); } });
test('presupuesto reduce subdivision localizada', () => { const r = applyTexture(base, top, { detail:3, maxTriangles:30 }); assert.equal(r.stats.level, 2); assert.equal(r.stats.budgetLimited, true); });
const brushed = brushSelection(base, 2, [15, 5, 20], 2);
test('pincel selecciona geometria intersectada sin atravesar el cubo', () => { assert.equal(brushed[2], 1); assert.equal(brushed[0], 0); assert.ok(brushed.reduce((a,b) => a+b, 0) <= 2); });
const front = selectConnected(base, 4, 12), layered = applyTextureLayers(base, [{ mask: top, settings: { pattern:'hex', depth:.5, detail:1 }, enabled:true }, { mask: front, settings: { pattern:'waves', depth:.35, detail:1 }, enabled:true }]);
test('dos capas separadas se hornean en una sola malla', () => { assert.equal(layered.stats.layers, 2); assert.equal(layered.stats.selected, 4); const i = analyze(layered.part); assert.equal(i.open, 0); assert.equal(i.nonManifold, 0); });
const protectedBottom = new Uint8Array(base.tri.length / 3); protectedBottom[0] = protectedBottom[1] = 1;
const protectedResult = applyTextureLayers(base, [{ mask: selectAll(base), settings: { pattern:'dots', depth:.7, detail:1 }, enabled:true }], { protected: protectedBottom, protectionMargin:0 });
test('proteccion excluye las caras funcionales del desplazamiento', () => { assert.equal(protectedResult.stats.excluded, 2); for (const vi of [0,1,2,3]) for (let k=0;k<3;k++) assert.equal(protectedResult.part.vert[vi*3+k], base.vert[vi*3+k]); });
test('capas con proteccion conservan una malla cerrada', () => { const i = analyze(protectedResult.part); assert.equal(i.open, 0); assert.equal(i.nonManifold, 0); assert.equal(i.degenerate, 0); });
const hole = ringHole(), holeProtection = new Uint8Array(hole.tri.length / 3); for (let i = 0; i < 32; i++) holeProtection.fill(1, i * 8 + 2, i * 8 + 4);
const protectedHole = applyTextureLayers(hole, [{ mask:selectAll(hole), settings:{ pattern:'knurl', projection:'cylindrical', depth:.65, scale:4, detail:2 }, enabled:true }], { protected:holeProtection, protectionMargin:0 }).part;
test('agujero protegido conserva diámetro y topología', () => { for (let i = 0; i < 32; i++) for (const offset of [2,3]) { const vi=i*4+offset; assert.ok(Math.abs(Math.hypot(protectedHole.vert[vi*3], protectedHole.vert[vi*3+1]) - 5) < 1e-6); } const info=analyze(protectedHole); assert.equal(info.open, 0); assert.equal(info.nonManifold, 0); assert.equal(info.degenerate, 0); });
const custom = applyTexture(base, top, { pattern:'custom', customMap:{ width:2, height:2, data:Float32Array.from([0,1,1,0]) }, mapContrast:1.4, mapBrightness:.05, depth:.5, detail:1 }).part;
test('mapa de altura personalizado desplaza geometria real', () => { assert.ok([...custom.vert].every(Number.isFinite)); assert.ok(analyze(custom).max[2] > 20); });

const stl = binarySTL(texturedCube, 'cubo_BATTEXTURE'), reparsed = parseSTL(stl.buffer, 'reimportado').objects[0], reInfo = analyze(reparsed);
test('STL exportado se puede reimportar', () => assert.equal(reInfo.tris, analyze(texturedCube).tris));
test('STL reimportado conserva el relieve', () => assert.ok(reInfo.max[2] > 20.05));
const mf = binary3MF(texturedCube, 'cubo_BATTEXTURE'), mfBuffer = mf.buffer.slice(mf.byteOffset, mf.byteOffset + mf.byteLength), mfPart = parse3MF(mfBuffer, 'cubo_BATTEXTURE').objects[0];
test('3MF exportado es valido y se puede reimportar', () => { const i = analyze(mfPart); assert.equal(i.tris, analyze(texturedCube).tris); assert.ok(i.max[2] > 20.05); });
test('exportar sin modificaciones conserva triangulos y dimensiones', () => { const raw = parseSTL(binarySTL(base).buffer, 'original').objects[0], i = analyze(raw); assert.deepEqual(i.size.map((n) => Math.round(n)), [20,20,20]); assert.equal(i.tris, 12); });
const broken = { ...base, tri: base.tri.slice(3) };
test('malla defectuosa se detecta como abierta', () => assert.ok(analyze(broken).open > 0));

const out = new URL('../test-output/battexture/', import.meta.url); await mkdir(out, { recursive:true });
await Promise.all([writeFile(new URL('cubo-original.stl', out), binarySTL(base)), writeFile(new URL('cubo-texturizado.stl', out), stl), writeFile(new URL('cubo-texturizado.3mf', out), mf), writeFile(new URL('cilindro-moleteado.stl', out), binarySTL(texturedCylinder)), writeFile(new URL('esfera-voronoi.stl', out), binarySTL(organic)), writeFile(new URL('agujero-protegido.stl', out), binarySTL(protectedHole))]);
console.log(`\n${passed} pruebas OK. Fixtures escritos en test-output/battexture/.`);

