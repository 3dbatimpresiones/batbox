// =====================================================================
// Worker del Creador de Llaveros: arma las piezas 3D sin trabar la página.
// Mensajes:
//   { type: 'font', key, buffer }                → guarda una fuente (ArrayBuffer)
//   { type: 'merge', id, items: [{ base, letters }] } → { type: 'merged', id, items: [malla unida] }
//   { type: 'build', id, fontKey, names, params } → arma cada nombre y responde
//     { type: 'built', id, items: [{ name, base, letters, size, bounds, colorChangeAt } | { name, error }] }
// =====================================================================
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import opentype from 'opentype.js';
import { buildKeychain } from './engine.js';

let M = null;
const fonts = new Map();
const ready = Module({ locateFile: () => wasmUrl }).then((m) => { m.setup(); M = m; });

const plain = (manifold) => {
  const mesh = manifold.getMesh();
  return { numProp: mesh.numProp, vertProperties: new Float32Array(mesh.vertProperties), triVerts: new Uint32Array(mesh.triVerts) };
};

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'font') {
      try {
        fonts.set(msg.key, opentype.parse(msg.buffer));
        self.postMessage({ type: 'font-ok', key: msg.key });
      } catch (err) {
        self.postMessage({ type: 'font-error', key: msg.key, error: 'No se pudo leer esa fuente (usá TTF, OTF o WOFF).' });
      }
      return;
    }
    if (msg.type === 'merge') {
      // Une base + letras de cada llavero en una sola pieza sólida (para STL de un color).
      await ready;
      const out = [], transfer = [];
      for (const it of msg.items) {
        const a = new M.Manifold(new M.Mesh(it.base)), b = new M.Manifold(new M.Mesh(it.letters));
        const u = M.Manifold.union(a, b);
        const m = plain(u);
        a.delete(); b.delete(); u.delete();
        out.push(m); transfer.push(m.vertProperties.buffer, m.triVerts.buffer);
      }
      self.postMessage({ type: 'merged', id: msg.id, items: out }, transfer);
      return;
    }
    if (msg.type === 'build') {
      await ready;
      const font = fonts.get(msg.fontKey);
      if (!font) { self.postMessage({ type: 'built', id: msg.id, items: [], error: 'Falta cargar la fuente.' }); return; }
      const items = [];
      const transfer = [];
      for (const name of msg.names) {
        try {
          const kc = buildKeychain(M, font, name, msg.params);
          if (!kc) { items.push({ name, error: 'Sin letras para dibujar' }); continue; }
          const base = plain(kc.base), letters = plain(kc.letters);
          kc.base.delete(); kc.letters.delete();
          transfer.push(base.vertProperties.buffer, base.triVerts.buffer, letters.vertProperties.buffer, letters.triVerts.buffer);
          items.push({ name, base, letters, size: kc.size, bounds: kc.bounds, colorChangeAt: kc.colorChangeAt });
        } catch (err) {
          items.push({ name, error: 'No se pudo armar este nombre' });
        }
        // Avance para la barra de progreso.
        self.postMessage({ type: 'progress', id: msg.id, done: items.length, total: msg.names.length });
      }
      self.postMessage({ type: 'built', id: msg.id, items }, transfer);
    }
  } catch (err) {
    self.postMessage({ type: 'built', id: msg.id, items: [], error: String(err?.message || err) });
  }
};
