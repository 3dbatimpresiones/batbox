// Regresión manual para un STL/3MF real. Uso:
// node scripts/test-split-real.mjs "E:\\DESCARGAS WINDOWS\\Batman+Echo+dot+Stand-U1.3mf"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseModel } from '../src/lib/split/io.js';
import { analyze, splitBodies } from '../src/lib/split/core.js';

const file = process.argv[2];
if (!file) throw new Error('Indicá la ruta del STL, OBJ o 3MF real a validar.');
const bytes = readFileSync(file);
const parsed = parseModel(file, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
assert.ok(parsed.objects.length, 'El archivo debe contener al menos un objeto.');

for (const object of parsed.objects) {
  const info = analyze(object);
  assert.equal(info.open, 0, `${object.name}: no debe tener aristas abiertas antes de editar.`);
  assert.equal(info.nonManifold, 0, `${object.name}: no debe tener aristas no-manifold antes de editar.`);
  assert.equal(info.flipped, 0, `${object.name}: no debe tener normales invertidas antes de editar.`);
  const bodies = splitBodies(object);
  for (const body of bodies) {
    const bodyInfo = analyze(body);
    assert.ok(bodyInfo.closed && bodyInfo.components === 1, `${body.name}: cada componente debe seguir cerrado.`);
  }
  console.log(`OK ${object.name}: ${info.tris.toLocaleString('es-AR')} triángulos, ${bodies.length} componentes cerrados`);
}

console.log(`BATSplit real: ${parsed.objects.length} objeto(s) validado(s).`);
