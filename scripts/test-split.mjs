import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { strToU8, zipSync } from 'fflate';
import { analyze, cutByPlane, fromManifold, merge, splitBodies, validate } from '../src/lib/split/core.js';
import { binarySTL, piecesZip } from '../src/lib/split/export.js';
import { parse3MF, parseModel, parseOBJ, parseSTL } from '../src/lib/split/io.js';
import { cutRegion, faceData, regionShell, selectRegion } from '../src/lib/split/regions.js';
import { baryPosition, boundaryLoops, maskInsideLoop, meshGraph, nodesFromRegion, traceLoop } from '../src/lib/split/path.js';

const M = await Module(); M.setup(); let passed = 0;
const ok = (name, condition) => { assert.ok(condition, name); passed++; console.log(`OK   ${name}`); };
const partFrom = (man, name = 'Pieza') => { const id = man.originalID(); const p = fromManifold(man, id); man.delete(); return { ...p, name }; };

const cube = partFrom(M.Manifold.cube([40, 30, 20], true), 'Cubo');
const info = validate(M, cube);
ok('cubo cerrado y sólido', info.printable && info.open === 0 && info.nonManifold === 0);
ok('medidas conservadas', info.size.every((n, i) => Math.abs(n - [40, 30, 20][i]) < 1e-4));
ok('volumen correcto', Math.abs(info.volume - 24000) < .01);

const [a, b] = cutByPlane(M, cube, [1, 0, 0], [0, 0, 0]);
ok('el plano produce dos piezas', !!a && !!b);
const va = validate(M, a), vb = validate(M, b);
ok('ambas mitades son imprimibles', va.printable && vb.printable);
ok('el volumen A+B equivale al original', Math.abs(va.volume + vb.volume - info.volume) < .02);
ok('cada mitad mide 20 mm en X', Math.abs(va.size[0] - 20) < .01 && Math.abs(vb.size[0] - 20) < .01);

const otherMan = M.Manifold.cube([8, 8, 8], true).translate([70, 0, 0]); const other = partFrom(otherMan, 'Otro');
const bodies = splitBodies(merge([cube, other]));
ok('separa dos cuerpos desconectados', bodies.length === 2);
ok('los cuerpos separados siguen cerrados', bodies.every((p) => validate(M, p).printable));

const cubeTop = [];
for (let f = 0; f < cube.tri.length / 3; f++) if ([0, 1, 2].every((k) => Math.abs(cube.vert[cube.tri[f * 3 + k] * 3 + 2] - 10) < 1e-5)) cubeTop.push(f);
ok('la cara superior del cubo tiene dos triángulos', cubeTop.length === 2);
const angleRegion = selectRegion(cube, cubeTop[0], 'angle', 2, faceData(cube));
ok('inundación angular une caras coplanares sin doblar la esquina', angleRegion.count === 2 && cubeTop.every((f) => angleRegion.mask[f]));
const coloredCube = { ...cube, col: new Uint16Array(cube.tri.length / 3).fill(2) }; cubeTop.forEach((f) => { coloredCube.col[f] = 7; });
const colorRegion = selectRegion(coloredCube, cubeTop[0], 'color', 180);
ok('selección por color respeta conectividad y color de triángulo', colorRegion.count === 2 && colorRegion.color === 7);
const shell = regionShell(cube, angleRegion.mask, 4);
ok('la región genera una envolvente cerrada', analyze(shell).closed);
const [skin, rest] = cutRegion(M, cube, angleRegion.mask, 4);
const vs = validate(M, skin), vr = validate(M, rest);
const topLoops = boundaryLoops(cube, angleRegion.mask);
ok('el contorno regional forma un lazo cerrado', topLoops.length === 1 && topLoops[0].length === 4);
const topNodes = nodesFromRegion(cube, angleRegion.mask, 8);
ok('los nodos sugeridos usan cara y baricentricas', topNodes.length === 4 && topNodes.every((n) => Math.abs(n.bary.reduce((x, y) => x + y, 0) - 1) < 1e-6));
ok('los nodos permanecen exactamente sobre la superficie', topNodes.every((n) => Math.abs(baryPosition(cube, n)[2] - 10) < 1e-5));
const topTrace = traceLoop(cube, topNodes, 60, 35);
ok('el trazado natural produce un lazo cerrado', topTrace.valid && topTrace.segments.length === topNodes.length && topTrace.route[0] === topTrace.route.at(-1));
const changedTrace = traceLoop(cube, topNodes, 0, 100);
ok('iman y suavizado no desplazan las anclas', changedTrace.positions.every((p, i) => p.slice(0, 3).every((v, k) => Math.abs(v - baryPosition(cube, topNodes[i])[k]) < 1e-6)));
const topGraph = meshGraph(cube);
ok('cada tramo visible recorre aristas reales', topTrace.segments.every((seg) => seg.slice(1).every((v, i) => topGraph.faces.has([seg[i], v].sort((x, y) => x - y).join(':')))));
const tracedMask = maskInsideLoop(cube, topTrace.route, cubeTop[0]);
ok('el recorrido visible separa la region usada por el corte', cubeTop.every((f) => tracedMask[f]) && tracedMask.reduce((x, y) => x + y, 0) === 2);
ok('extraer región produce dos sólidos imprimibles', vs.printable && vr.printable);
ok('región y base conservan el volumen', Math.abs(vs.volume + vr.volume - info.volume) < .05);
ok('profundidad de región plana coincide con el volumen esperado', Math.abs(vs.volume - 40 * 30 * 4) < .1);

const stl = binarySTL(cube, cube.name); const parsedStl = parseSTL(stl.buffer, 'Vuelta');
ok('STL binario exporta y vuelve a importar', parsedStl.objects[0].tri.length === cube.tri.length);
ok('parseModel reconoce extensión sin distinguir mayúsculas', parseModel('pieza.STL', stl.buffer).objects.length === 1);

const obj = `o Prisma\nv 0 0 0 1 0 0\nv 10 0 0 1 0 0\nv 0 10 0 0 1 0\nv 0 0 10 0 0 1\nf 1 3 2\nf 1 2 4\nf 2 3 4\nf 3 1 4\n`;
const parsedObj = parseOBJ(obj, 'OBJ');
ok('OBJ triangulado y con color por vértice', parsedObj.objects[0].tri.length === 12 && parsedObj.palette.length >= 1);
ok('OBJ cerrado reconocido', analyze(parsedObj.objects[0]).closed);

const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><basematerials id="2"><base name="turquesa" displaycolor="#5DDADBFF"/></basematerials><object id="1" name="Tetra" type="model" pid="2" pindex="0"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="1" v2="2" v3="3"/><triangle v1="2" v2="0" v3="3"/></triangles></mesh></object></resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 5 6 7"/></build></model>`;
const zip = zipSync({ '[Content_Types].xml': strToU8(''), '3D/3dmodel.model': strToU8(model) });
const parsed3mf = parse3MF(zip.buffer, 'TresMF');
ok('3MF lee objeto y nombre', parsed3mf.objects.length === 1 && parsed3mf.objects[0].name === 'Tetra');
ok('3MF aplica transformación', Math.min(...parsed3mf.objects[0].vert.filter((_, i) => i % 3 === 0)) === 5);
ok('3MF conserva color base', parsed3mf.palette[parsed3mf.objects[0].col[0]] === '#5ddadb');

const zipOut = piecesZip([{ ...a, name: 'Lado A' }, { ...b, name: 'Lado B' }]);
ok('ZIP de piezas generado', zipOut.byteLength > binarySTL(a).byteLength + binarySTL(b).byteLength);
ok('análisis detecta una malla abierta', !analyze({ vert: cube.vert, tri: cube.tri.slice(0, -3), col: null }).closed);

console.log(`\nBATSplit 3D: ${passed} pruebas OK.`);
