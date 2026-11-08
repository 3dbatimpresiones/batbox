import { mkdir, writeFile } from 'node:fs/promises';
import Module from 'manifold-3d';
import { fromManifold } from '../src/lib/split/core.js';
import { binarySTL } from '../src/lib/split/export.js';

const M = await Module(); M.setup();
const out = new URL('../test-output/batsupport/', import.meta.url); await mkdir(out, { recursive: true });
const save = async (name, man) => { const part = { ...fromManifold(man, man.originalID()), name }; man.delete(); await writeFile(new URL(`${name}.stl`, out), binarySTL(part, name)); };

await save('01-voladizo-horizontal', M.Manifold.cube([10, 20, 12]).translate([-5, -10, 0]).add(M.Manifold.cube([32, 20, 5]).translate([-5, -10, 12])));
await save('02-agujero-pasante', M.Manifold.cube([24, 24, 20]).translate([-12, -12, 0]).subtract(M.Manifold.cylinder(20, 4, 4, 48)));
const body = M.Manifold.cube([16, 16, 24]).translate([-8, -8, 0]);
const crown = M.Manifold.cube([38, 22, 4]).translate([-19, -11, 24]);
const nose = M.Manifold.cube([10, 24, 5]).translate([8, -12, 15]);
await save('03-geometria-compleja', body.add(crown).add(nose));
console.log(new URL('.', out).pathname);
