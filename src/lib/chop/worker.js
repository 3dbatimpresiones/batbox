// =====================================================================
// Worker del Personalizador de chops (no traba la página).
//   { type:'chop', id, vert, tri }              → { type:'chop-ok', id, volume, tris } | error
//   { type:'design', id, shapes, w0, h0 }       → { type:'design-ok', id }
//   { type:'preview', id, p, axis }             → { type:'preview-ok', id, reliefs, mesh?, layout }
//   { type:'export', id, p, axis }              → progreso + { type:'export-ok', id, mesh, check }
// =====================================================================
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { buildReliefs, chopFromMesh, combineAll, designSection, wallIndex } from './core.js';
import { detectHandle } from './handle.js';

let M = null;
const ready = Module({ locateFile: () => wasmUrl }).then((m) => { m.setup(); M = m; });
let chop = null, cs = null, design = null, wall = null, handle = [];

// Malla indexada → triángulos sueltos (lo que espera detectHandle).
const soup = (vert, tri) => {
  const out = new Float32Array(tri.length * 3);
  for (let t = 0; t < tri.length; t++) { const v = tri[t] * 3; out[t * 3] = vert[v]; out[t * 3 + 1] = vert[v + 1]; out[t * 3 + 2] = vert[v + 2]; }
  return out;
};

const plain = (manifold) => {
  const mesh = manifold.getMesh();
  return { numProp: mesh.numProp, vertProperties: new Float32Array(mesh.vertProperties), triVerts: new Uint32Array(mesh.triVerts) };
};

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    await ready;
    if (msg.type === 'chop') {
      if (chop) chop.delete();
      chop = null;
      chop = chopFromMesh(M, msg.vert, msg.tri);
      wall = wallIndex(msg.vert, msg.tri);   // para apoyar cada diseño en la pared real
      handle = detectHandle(soup(msg.vert, msg.tri));   // zona prohibida: ningún diseño sobre la manija
      self.postMessage({ type: 'chop-ok', id: msg.id, volume: chop.volume(), tris: chop.numTri(), handle });
    } else if (msg.type === 'design') {
      if (cs) cs.delete();
      cs = null;
      cs = designSection(M, msg.shapes);
      design = { w0: msg.w0, h0: msg.h0 };
      self.postMessage({ type: 'design-ok', id: msg.id });
    } else if (msg.type === 'preview' || msg.type === 'export') {
      if (!chop) throw new Error('Cargá primero el chop.');
      if (!cs) throw new Error('Cargá primero el diseño (SVG).');
      const { reliefs, layout } = buildReliefs(M, cs, design, msg.p, msg.axis, wall, handle);
      if (!reliefs.length) {
        self.postMessage({ type: msg.type + '-ok', id: msg.id, layout, reliefs: null, mesh: null });
        return;
      }
      if (msg.type === 'preview') {
        const meshes = reliefs.map(plain); // también sirven como zonas invisibles para seleccionar/arrastrar
        if (msg.p.mode === 'engrave') {
          // En grabado se muestra el hueco real: misma booleana que la exportación.
          const { result } = combineAll(M, chop, reliefs, 'engrave');
          reliefs.forEach((r) => r.delete());
          const mesh = plain(result); result.delete();
          self.postMessage({ type: 'preview-ok', id: msg.id, layout, reliefs: meshes, mesh },
            [mesh.vertProperties.buffer, mesh.triVerts.buffer, ...meshes.flatMap((m) => [m.vertProperties.buffer, m.triVerts.buffer])]);
        } else {
          reliefs.forEach((r) => r.delete());
          self.postMessage({ type: 'preview-ok', id: msg.id, layout, reliefs: meshes, mesh: null },
            meshes.flatMap((m) => [m.vertProperties.buffer, m.triVerts.buffer]));
        }
      } else {
        const { result, check } = combineAll(M, chop, reliefs, msg.p.mode, (done, total) => self.postMessage({ type: 'progress', id: msg.id, done, total }));
        reliefs.forEach((r) => r.delete());
        const mesh = plain(result);
        result.delete();
        self.postMessage({ type: 'export-ok', id: msg.id, layout, mesh, check }, [mesh.vertProperties.buffer, mesh.triVerts.buffer]);
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, error: err?.message || String(err) });
  }
};
