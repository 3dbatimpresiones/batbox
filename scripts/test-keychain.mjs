// Prueba del motor del Creador de Llaveros en Node (no se publica).
// Uso: node scripts/test-keychain.mjs <fuente.woff|.ttf> <carpeta-salida>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import Module from 'manifold-3d';
import opentype from 'opentype.js';
import { buildKeychain } from '../src/lib/keychain/engine.js';
import { arrange, toBinarySTL, build3MF, BEDS } from '../src/lib/keychain/exporters.js';

const [fontPath, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const M = await Module(); M.setup();
const buf = readFileSync(fontPath);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'OK  ' : 'FALLA'} ${n}${x ? ' — ' + x : ''}`); };
const check = (name, kc) => {
  for (const part of ['base', 'letters']) {
    const m = kc[part];
    ok(`${name}: ${part} sin errores`, m.status() === 'NoError', m.status());
    ok(`${name}: ${part} con volumen`, m.volume() > 1, m.volume().toFixed(1) + ' mm³');
  }
};

const cases = [
  ['Anna', {}],
  ['Sofía\nGonzález', { shape: 'tag' }],
  ['MATEO', { shape: 'capsule', ring: 'top' }],
  ['Ñandú', { style: 'flush', ring: 'right' }],
  ['Lu', { ring: 'none' }],
];
const kcs = [];
for (const [text, o] of cases) {
  const kc = buildKeychain(M, font, text, o);
  ok(`"${text.replace('\n', ' / ')}" se arma`, !!kc);
  if (!kc) continue;
  check(text.replace('\n', ' / '), kc);
  console.log(`     tamaño ${kc.size.x.toFixed(1)} × ${kc.size.y.toFixed(1)} × ${kc.size.z.toFixed(1)} mm · cambio de color a ${kc.colorChangeAt} mm`);
  kcs.push({ name: text.replace('\n', ' '), w: kc.size.x, h: kc.size.y, ...kc });
}
const anna = kcs[0];
ok('altura de las letras ≈ 14 mm de mayúscula', anna && anna.size.y > 14 && anna.size.y < 30, anna?.size.y.toFixed(1));

// Acomodar 30 nombres en una A1 mini (180×180): varias camas, grilla centrada.
const many = Array.from({ length: 30 }, (_, i) => ({ ...kcs[i % kcs.length], name: 'N' + i }));
const plates = arrange(many, BEDS.find((b) => b.id === 'a1mini'), 4);
ok('30 llaveros se reparten en varias camas', plates.length > 1, plates.length + ' camas');
const allInside = plates.every((pl) => pl.items.every((it) => it.x - it.w / 2 >= -0.01 && it.x + it.w / 2 <= 180.01 && it.y - it.h / 2 >= -0.01 && it.y + it.h / 2 <= 180.01));
ok('todos quedan dentro de la cama', allInside);
const pl0 = plates[0];
const minX = Math.min(...pl0.items.map((it) => it.x - it.w / 2)), maxX = Math.max(...pl0.items.map((it) => it.x + it.w / 2));
ok('la grilla queda centrada (simétrica)', Math.abs(minX - (180 - maxX)) < 0.5, `${minX.toFixed(1)} / ${(180 - maxX).toFixed(1)}`);

writeFileSync(`${out}/anna.stl`, toBinarySTL([anna.base, anna.letters]));
const threemf = build3MF(plates, BEDS.find((b) => b.id === 'a1mini'), { base: '#FFFFFF', letters: '#F78EB6' });
writeFileSync(`${out}/llaveros.3mf`, threemf);
ok('genera STL y 3MF', true);
console.log(`\nResultado: ${pass} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
