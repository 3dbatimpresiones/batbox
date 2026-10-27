import { strict as assert } from 'node:assert';
import { calculateProduction, formatDuration, formatNumber } from '../src/lib/production/calculator.js';
import { mergePlateStats, parse3MFBuffer, parseGCodeText } from '../src/lib/production/parser.js';
import { strToU8, zipSync } from 'fflate';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`OK ${passed} · ${name}`); }
  catch (error) { console.error(`FALLÓ · ${name}\n${error.stack}`); process.exitCode = 1; }
}
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const base = (extra = {}) => ({
  quantity: 150, piecesPerBed: 6, bedSeconds: 2 * 3600 + 53 * 60, printers: 2, reservePct: 10, mode: 'full', partialKind: 'estimate', partialSeconds: 0, colorSystem: 'ams',
  filaments: [
    { id: 'r', position: '1', name: 'Rojo', gramsPerBed: 1.67, partialGrams: null, priceKg: null, stock: null },
    { id: 'b', position: '2', name: 'Blanco', gramsPerBed: .91, partialGrams: null, priceKg: null, stock: null },
    { id: 'n', position: '3', name: 'Negro', gramsPerBed: 69.53, partialGrams: null, priceKg: null, stock: null },
  ], ...extra,
});

test('caso obligatorio: tandas, unidades y tiempos', () => {
  const r = calculateProduction(base());
  assert.equal(r.ok, true); assert.equal(r.batches, 25); assert.equal(r.produced, 150); assert.equal(r.excess, 0);
  assert.equal(formatDuration(r.machineSeconds), '72 h 05 min');
  assert.equal(formatDuration(r.durationSeconds), '37 h 29 min');
  assert.deepEqual(r.printerLoads.map((p) => p.batches), [13, 12]);
});
test('caso obligatorio: consumos exactos y reserva 10 %', () => {
  const r = calculateProduction(base());
  close(r.filaments[0].baseGrams, 41.75); close(r.filaments[1].baseGrams, 22.75); close(r.filaments[2].baseGrams, 1738.25); close(r.baseGrams, 1802.75);
  assert.deepEqual(r.filaments.map((f) => formatNumber(f.reserveGrams)), ['45,93', '25,03', '1.912,08']);
  assert.equal(formatNumber(r.reserveGrams), '1.983,03');
  assert.equal(r.purchaseKg, 4);
});
test('152 unidades: 26 camas, 156 producidas y 4 excedentes', () => {
  const r = calculateProduction(base({ quantity: 152, printers: 1, reservePct: 0 }));
  assert.equal(r.batches, 26); assert.equal(r.produced, 156); assert.equal(r.excess, 4);
});
test('pedido menor que una cama', () => {
  const r = calculateProduction(base({ quantity: 2, printers: 1, reservePct: 0 }));
  assert.equal(r.batches, 1); assert.equal(r.produced, 6); assert.equal(r.excess, 4);
});
test('rechaza cantidades y tiempos inválidos', () => {
  const r = calculateProduction(base({ quantity: 0, piecesPerBed: -1, bedSeconds: 0, printers: 0 }));
  assert.equal(r.ok, false); assert.ok(r.errors.quantity && r.errors.piecesPerBed && r.errors.bedSeconds && r.errors.printers);
});
test('última cama parcial estimada queda marcada como aproximada', () => {
  const r = calculateProduction(base({ quantity: 8, printers: 1, reservePct: 0, mode: 'partial', filaments: [{ id: 'a', gramsPerBed: 60, partialGrams: null, priceKg: null, stock: null }] }));
  assert.equal(r.batches, 2); assert.equal(r.produced, 8); assert.equal(r.estimatedPartial, true); close(r.baseGrams, 80); close(r.machineSeconds, (2 * 3600 + 53 * 60) * 4 / 3);
});
test('AMS conserva como gasto fijo la purga detectada en una cama parcial', () => {
  const r = calculateProduction(base({ quantity: 3, piecesPerBed: 6, printers: 1, reservePct: 0, mode: 'partial', colorSystem: 'ams', filaments: [{ id: 'a', gramsPerBed: 60, modelGrams: 50, towerGrams: 10, partialGrams: null, priceKg: null, stock: null }] }));
  close(r.baseGrams, 35); assert.equal(r.filaments[0].partialBasis, 'ams-fixed-waste'); assert.equal(r.colorSystemLabel, 'AMS / cambiador · una boquilla');
});
test('multicabezal no inventa purga de AMS cuando no fue informada', () => {
  const r = calculateProduction(base({ quantity: 3, piecesPerBed: 6, printers: 1, reservePct: 0, mode: 'partial', colorSystem: 'multihead', filaments: [{ id: 'a', gramsPerBed: 60, modelGrams: 50, towerGrams: null, partialGrams: null, priceKg: null, stock: null }] }));
  close(r.baseGrams, 30); assert.equal(r.filaments[0].partialBasis, 'proportional'); assert.equal(r.colorSystemLabel, 'Multicabezal / toolchanger');
});
test('multicabezal conserva cebado fijo solo cuando está informado', () => {
  const r = calculateProduction(base({ quantity: 3, piecesPerBed: 6, printers: 1, reservePct: 0, mode: 'partial', colorSystem: 'multihead', filaments: [{ id: 'a', gramsPerBed: 60, modelGrams: 55, towerGrams: 5, partialGrams: null, priceKg: null, stock: null }] }));
  close(r.baseGrams, 32.5); assert.equal(r.filaments[0].partialBasis, 'reported-fixed-waste');
});
test('última cama parcial usa datos propios', () => {
  const r = calculateProduction(base({ quantity: 8, printers: 2, reservePct: 0, mode: 'partial', partialKind: 'specific', partialSeconds: 1800, filaments: [{ id: 'a', gramsPerBed: 60, partialGrams: 17, priceKg: 20000, stock: 70 }] }));
  assert.equal(r.estimatedPartial, false); close(r.baseGrams, 77); close(r.machineSeconds, 2 * 3600 + 53 * 60 + 1800); close(r.filaments[0].shortage, 7); close(r.filaments[0].baseCost, 1540);
});
test('precio y stock vacíos siguen sin informar', () => {
  const r = calculateProduction(base({ quantity: 6, printers: 1, reservePct: 0, filaments: [{ id: 'a', gramsPerBed: 10, partialGrams: null, priceKg: null, stock: null }] }));
  assert.equal(r.filaments[0].baseCost, null); assert.equal(r.filaments[0].shortage, null); assert.equal(r.baseCost, null); close(r.filaments[0].purchaseGrams, 10); assert.equal(r.filaments[0].spools1kg, 1);
});
test('plan de compra descuenta stock y redondea bobinas de un kilo', () => {
  const r = calculateProduction(base({ quantity: 150, reservePct: 10, filaments: [{ id: 'a', gramsPerBed: 69.53, partialGrams: null, priceKg: null, stock: 500 }] }));
  close(r.filaments[0].reserveGrams, 1912.075); close(r.filaments[0].purchaseGrams, 1412.075); assert.equal(r.filaments[0].spools1kg, 2); assert.equal(r.purchaseKg, 2);
});

const gcode = `; generated by OrcaSlicer\n; filament_type = PLA;PLA;PLA\n; filament_colour = #FF0000;#FFFFFF;#111111\n; filament used [g] = 1.67, 0.91, 69.53\n; total filament used [g] = 72.11\n; model filament used [g] = 1.2, 0.7, 67\n; wipe tower filament used [g] = 0.47, 0.21, 2.53\n; estimated printing time (normal mode) = 2h 53m\nG28\n`;
test('G-code detecta tiempo, colores y gramos sin sumar dos veces torre/total', () => {
  const parsed = parseGCodeText(gcode, 'orca.gcode'); const p = parsed.plates[0];
  assert.equal(p.seconds, 10380); assert.equal(p.filaments.length, 3); close(p.filaments.reduce((s, f) => s + f.gramsPerBed, 0), 72.11); assert.equal(p.filaments[0].modelGrams, 1.2); assert.equal(p.filaments[0].towerGrams, .47); assert.deepEqual(p.filaments.map((f) => f.colorName), ['Rojo', 'Blanco', 'Negro']);
});
test('G-code incompleto pide carga manual', () => {
  const parsed = parseGCodeText('G28\nG1 X10 Y10', 'incompleto.gcode');
  assert.equal(parsed.plates[0].seconds, null); assert.equal(parsed.plates[0].filaments.length, 0); assert.ok(parsed.warnings.some((w) => w.includes('tiempo')));
});

const slice = `<?xml version="1.0"?><config>
<plate><metadata key="index" value="1"/><metadata key="plate_name" value="Roja"/><metadata key="prediction" value="10380"/><metadata key="weight" value="72.11"/><filament id="1" type="PLA" color="#ff0000" used_g="72.11"/></plate>
<plate><metadata key="index" value="2"/><metadata key="plate_name" value="Azul"/><metadata key="prediction" value="4000"/><filament id="2" type="PETG" color="#0000ff" used_g="30.5"/></plate>
</config>`;
const model = `<?xml version="1.0"?><model unit="millimeter"><metadata name="Application">BambuStudio-02.05</metadata><resources/></model>`;
const zipped = zipSync({ 'Metadata/slice_info.config': strToU8(slice), '3D/3dmodel.model': strToU8(model) });
test('3MF laminado detecta varias camas y permite elegir referencia', () => {
  const parsed = parse3MFBuffer(zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength), 'multi.3mf');
  assert.equal(parsed.sliced, true); assert.equal(parsed.plates.length, 2); assert.equal(parsed.plates[0].name, 'Roja'); assert.equal(parsed.plates[1].seconds, 4000); assert.equal(parsed.plates[1].filaments[0].gramsPerBed, 30.5);
});
test('3MF sin laminar se explica y conserva carga manual', () => {
  const raw = zipSync({ '3D/3dmodel.model': strToU8(model) });
  const parsed = parse3MFBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), 'modelo.3mf');
  assert.equal(parsed.sliced, false); assert.equal(parsed.plates.length, 1); assert.ok(parsed.warnings[0].includes('sin G-code'));
});

const projectSettings = JSON.stringify({
  printer_model: 'Snapmaker U1', nozzle_diameter: ['0.4', '0.4', '0.4', '0.4'],
  extruder_type: ['Direct Drive', 'Direct Drive', 'Direct Drive', 'Direct Drive'],
  filament_colour: ['#FF0000', '#000000', '#FFFFFF', '#000000'],
  filament_type: ['PLA', 'PLA', 'PLA', 'PLA'], filament_settings_id: ['PLA 225', 'PLA 225', 'PLA 225', 'PLA 225'],
});
const projectModelSettings = `<?xml version="1.0"?><config><plate><metadata key="plater_id" value="1"/><model_instance/><model_instance/><model_instance/><model_instance/><model_instance/><model_instance/></plate><plate><metadata key="plater_id" value="2"/><model_instance/></plate></config>`;
const headerOnlySlice = `<?xml version="1.0"?><config><header><header_item key="X-BBL-Client-Version" value="02.06.00.51"/></header></config>`;
test('proyecto Bambu/Snapmaker sin G-code no se confunde con placa laminada', () => {
  const raw = zipSync({
    '3D/3dmodel.model': strToU8(model), 'Metadata/slice_info.config': strToU8(headerOnlySlice),
    'Metadata/project_settings.config': strToU8(projectSettings), 'Metadata/model_settings.config': strToU8(projectModelSettings),
  });
  const parsed = parse3MFBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), 'snapmaker.3mf');
  assert.equal(parsed.sliced, false); assert.equal(parsed.printerModel, 'Snapmaker U1'); assert.equal(parsed.colorSystem, 'multihead');
  assert.equal(parsed.plates.length, 2); assert.equal(parsed.plates[0].objectCount, 6); assert.equal(parsed.plates[0].filaments.length, 4);
  assert.equal(parsed.plates[0].filaments[0].gramsPerBed, null); assert.deepEqual(parsed.plates[0].filaments.map((f) => f.colorName), ['Rojo', 'Negro', 'Blanco', 'Negro']); assert.ok(parsed.warnings[0].includes('sin G-code'));
});

test('3MF conserva las vistas 3D de cada cama para el selector visual', () => {
  const settingsWithThumbs = `<?xml version="1.0"?><config><plate><metadata key="plater_id" value="1"/><metadata key="thumbnail_file" value="Metadata/plate_1.png"/><model_instance/></plate><plate><metadata key="plater_id" value="2"/><metadata key="thumbnail_file" value="Metadata/plate_2.png"/><model_instance/></plate></config>`;
  const raw = zipSync({
    '3D/3dmodel.model': strToU8(model), 'Metadata/project_settings.config': strToU8(projectSettings),
    'Metadata/model_settings.config': strToU8(settingsWithThumbs), 'Metadata/plate_1.png': new Uint8Array([137, 80, 78, 71]), 'Metadata/plate_2.png': new Uint8Array([137, 80, 78, 71, 2]),
  });
  const parsed = parse3MFBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), 'vistas.3mf');
  assert.equal(parsed.plates.length, 2); assert.equal(parsed.plates[0].thumbnailFile, 'Metadata/plate_1.png');
  assert.equal(parsed.plates[0].thumbnail.length, 4); assert.equal(parsed.plates[1].thumbnail.length, 5);
});

test('combina la vista 3D del proyecto con tiempo y gramos del G-code de la cama activa', () => {
  const raw = zipSync({
    '3D/3dmodel.model': strToU8(model), 'Metadata/project_settings.config': strToU8(projectSettings),
    'Metadata/model_settings.config': strToU8(projectModelSettings),
  });
  const project = parse3MFBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), 'proyecto.3mf');
  const stats = parseGCodeText(gcode, 'cama-1.gcode');
  const merged = mergePlateStats(project, 0, stats);
  assert.equal(merged.plates[0].seconds, 10380); close(merged.plates[0].filaments.reduce((sum, f) => sum + f.gramsPerBed, 0), 72.11);
  assert.equal(merged.plates[0].objectCount, 6); assert.equal(merged.plates[0].statsSource, 'cama-1.gcode');
  assert.equal(merged.plates[1].seconds, null); assert.equal(merged.sliced, false);
});

if (!process.exitCode) console.log(`\n${passed} pruebas OK`);
