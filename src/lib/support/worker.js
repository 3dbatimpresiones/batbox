import initManifold from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { analyze, centerAssemblyOnBed, splitBodies } from '../split/core.js';
import { parseModel } from '../split/io.js';
import { analyzeLayers, optimizeSupport } from './core.js';

const ready = initManifold({ locateFile: () => wasmUrl }).then((M) => { M.setup(); return M; });
let originals = [], optimized = [], additions = [], sourceName = '';
const clone = (p) => ({ name: p.name, vert: new Float32Array(p.vert), tri: new Uint32Array(p.tri), col: p.col ? new Uint16Array(p.col) : null });
const transfer = (items) => items.flatMap((p) => [p.vert.buffer, p.tri.buffer, ...(p.col ? [p.col.buffer] : [])]);
const pack = (items) => items.map((p) => ({ ...clone(p), info: analyze(p) }));
const send = (id, extra = {}) => {
  const a = pack(originals), b = pack(optimized), c = pack(additions);
  self.postMessage({ type: 'ok', id, originals: a, optimized: b, additions: c, sourceName, ...extra }, [...transfer(a), ...transfer(b), ...transfer(c)]);
};

self.onmessage = async ({ data: msg }) => {
  try {
    const M = await ready;
    if (msg.type === 'load') {
      const parsed = parseModel(msg.name, msg.buffer);
      if (!parsed.objects.length) throw new Error('El archivo no contiene geometría.');
      const bodies = [];
      parsed.objects.forEach((object, objectIndex) => {
        const separated = splitBodies(object);
        separated.forEach((body, bodyIndex) => bodies.push({
          ...clone(body),
          name: separated.length > 1 ? `${object.name || `Objeto ${objectIndex + 1}`} · cuerpo ${bodyIndex + 1}` : (object.name || `Objeto ${objectIndex + 1}`),
        }));
      });
      originals = centerAssemblyOnBed(bodies); optimized = []; additions = []; sourceName = msg.name;
      const analyses = originals.map((p) => analyzeLayers(M, p, msg.settings));
      send(msg.id, { analyses, warnings: parsed.warnings || [] });
    } else if (msg.type === 'analyze') {
      const analyses = originals.map((p) => analyzeLayers(M, p, msg.settings));
      send(msg.id, { analyses });
    } else if (msg.type === 'optimize') {
      const results = originals.map((p) => optimizeSupport(M, p, msg.settings));
      optimized = results.map((r) => r.part); additions = results.flatMap((r) => r.added ? [r.added] : []);
      send(msg.id, { analyses: results.map((r) => r.analysis), stats: results.map((r) => r.stats) });
    } else throw new Error('Operación BATSUPPORT desconocida.');
  } catch (error) { self.postMessage({ type: 'error', id: msg.id, error: error?.message || String(error) }); }
};
