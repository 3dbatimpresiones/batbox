import { parseModel } from '../split/io.js';
import { analyze, merge } from '../split/core.js';
import { applyTextureLayers, brushSelection, invertSelection, selectAll, selectConnected } from './core.js';

let original = null, result = null, selection = null, protectedMask = null, sourceName = '';
const clone = (p) => ({ name: p.name, vert: new Float32Array(p.vert), tri: new Uint32Array(p.tri), col: p.col ? new Uint16Array(p.col) : null });
const pack = (p) => { if (!p) return null; const info = analyze(p); info.printable = info.closed && info.volume > 0; return { ...clone(p), info }; };
const transfer = (items) => items.filter(Boolean).flatMap((p) => [p.vert.buffer, p.tri.buffer, ...(p.col ? [p.col.buffer] : [])]);
function send(id, extra = {}) { const a = pack(original), b = pack(result), s = selection ? new Uint8Array(selection) : null, p = protectedMask ? new Uint8Array(protectedMask) : null; self.postMessage({ type: 'ok', id, original: a, result: b, selection: s, protected: p, sourceName, ...extra }, [...transfer([a, b]), ...(s ? [s.buffer] : []), ...(p ? [p.buffer] : [])]); }

self.onmessage = ({ data: msg }) => {
  try {
    if (msg.type === 'load') {
      self.postMessage({ type: 'progress', id: msg.id, stage: 'Leyendo y verificando el archivo' });
      const parsed = parseModel(msg.name, msg.buffer), joined = parsed.objects.length === 1 ? parsed.objects[0] : merge(parsed.objects);
      original = { ...clone(joined), name: msg.name.replace(/\.[^.]+$/, '') }; result = null; selection = new Uint8Array(original.tri.length / 3); protectedMask = new Uint8Array(original.tri.length / 3); sourceName = msg.name;
      const warnings = [...(parsed.warnings || [])];
      if (/\.3mf$/i.test(msg.name)) warnings.push('La geometria y las transformaciones del 3MF se leen en milimetros. La exportacion STL de esta etapa no conserva colores ni metadatos 3MF.');
      send(msg.id, { warnings });
    } else if (msg.type === 'select-all') { selection = selectAll(original); send(msg.id); }
    else if (msg.type === 'select-connected') { selection = selectConnected(original, msg.face, msg.angle); send(msg.id); }
    else if (msg.type === 'select-brush') { selection = brushSelection(original, msg.face, msg.point, msg.radius, selection, msg.erase); send(msg.id); }
    else if (msg.type === 'invert-selection') { selection = invertSelection(original, selection); send(msg.id); }
    else if (msg.type === 'set-selection') { selection = msg.selection?.length === original.tri.length / 3 ? new Uint8Array(msg.selection) : new Uint8Array(original.tri.length / 3); send(msg.id); }
    else if (msg.type === 'clear-selection') { selection = new Uint8Array(original.tri.length / 3); send(msg.id); }
    else if (msg.type === 'protect-brush') { protectedMask = brushSelection(original, msg.face, msg.point, msg.radius, protectedMask, msg.erase); send(msg.id); }
    else if (msg.type === 'set-protection') { protectedMask = msg.protected?.length === original.tri.length / 3 ? new Uint8Array(msg.protected) : new Uint8Array(original.tri.length / 3); send(msg.id); }
    else if (msg.type === 'clear-protection') { protectedMask = new Uint8Array(original.tri.length / 3); send(msg.id); }
    else if (msg.type === 'generate') {
      self.postMessage({ type: 'progress', id: msg.id, stage: 'Subdividiendo solamente la region seleccionada' });
      const generated = applyTextureLayers(original, msg.layers, { protected: protectedMask, protectionMargin: msg.protectionMargin }, ({ done, total }) => self.postMessage({ type: 'progress', id: msg.id, stage: 'Evaluando capas y desplazando vertices', done, total }));
      self.postMessage({ type: 'progress', id: msg.id, stage: 'Validando topologia y dimensiones' });
      result = { ...generated.part, name: `${original.name}_BATTEXTURE` };
      const before = analyze(original), after = analyze(result), critical = after.open > before.open || after.nonManifold > before.nonManifold || after.degenerate > before.degenerate;
      if (critical) { result = null; throw new Error('La validacion detecto nuevos errores topologicos. El original permanece intacto.'); }
      send(msg.id, { generation: generated.stats });
    } else if (msg.type === 'reset') { result = null; send(msg.id); }
    else throw new Error('Operacion BATTEXTURE desconocida.');
  } catch (error) { self.postMessage({ type: 'error', id: msg.id, error: error?.message || String(error) }); }
};

