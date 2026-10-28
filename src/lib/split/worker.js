import initManifold from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { analyze, cutByPlane, splitBodies, validate } from './core.js';
import { parseModel } from './io.js';
import { cutRegion, faceData, selectRegion } from './regions.js';
import { maskInsideLoop, meshGraph, nodesFromRegion, traceLoop } from './path.js';

let parts = [], palette = [], warnings = [], selection = null, perimeter = null;
const faceCache = new WeakMap(), graphCache = new WeakMap();
const ready = initManifold({ locateFile: () => wasmUrl }).then((M) => { M.setup(); return M; });
const clone = (p) => ({ name: p.name, vert: new Float32Array(p.vert), tri: new Uint32Array(p.tri), col: p.col ? new Uint16Array(p.col) : null });
const transfer = (list) => list.flatMap((p) => [p.vert.buffer, p.tri.buffer, ...(p.col ? [p.col.buffer] : [])]);
const payload = (M) => parts.map((p, i) => ({ ...clone(p), info: validate(M, p), index: i }));
const sendParts = (M, id, extra = {}) => { const list = payload(M); self.postMessage({ type: 'ok', id, parts: list, palette, warnings, ...extra }, transfer(list)); };
const sendPerimeter = (id, p) => { const positions = p.positions.map((v) => new Float32Array(v)); self.postMessage({ type: 'perimeter', id, index: p.index, nodes: p.nodes, positions, valid: p.valid, problems: p.problems }, positions.map((v) => v.buffer)); };

self.onmessage = async ({ data: msg }) => {
  try {
    const M = await ready;
    if (msg.type === 'load') {
      const parsed = parseModel(msg.name, msg.buffer);
      parts = parsed.objects.map((p, i) => ({ ...p, name: p.name || `Pieza ${i + 1}` })); palette = parsed.palette; warnings = parsed.warnings; selection = null; perimeter = null;
      sendParts(M, msg.id, { sourceName: msg.name });
    } else if (msg.type === 'split-bodies') {
      const out = [];
      for (const p of parts) splitBodies(p).forEach((q, i, all) => out.push({ ...q, name: all.length > 1 ? `${p.name} · cuerpo ${i + 1}` : p.name }));
      parts = out; selection = null; perimeter = null; sendParts(M, msg.id);
    } else if (msg.type === 'cut-plane') {
      const p = parts[msg.index]; if (!p) throw new Error('La pieza elegida ya no existe.');
      const [a, b] = cutByPlane(M, p, msg.normal, msg.point);
      if (!a || !b) throw new Error('El plano no atraviesa la pieza. Movelo hacia el interior del modelo.');
      const next = parts.slice(); next.splice(msg.index, 1, { ...a, name: `${p.name} · A` }, { ...b, name: `${p.name} · B` }); parts = next; selection = null; perimeter = null;
      sendParts(M, msg.id);
    } else if (msg.type === 'select-region') {
      const p = parts[msg.index]; if (!p) throw new Error('La pieza elegida ya no existe.');
      let data = faceCache.get(p); if (!data) { data = faceData(p); faceCache.set(p, data); }
      const r = selectRegion(p, msg.face, msg.mode, msg.angle, data); selection = { index: msg.index, mask: r.mask, seed: msg.face }; perimeter = null;
      const mask = new Uint8Array(r.mask); self.postMessage({ type: 'selection', id: msg.id, index: msg.index, mask, count: r.count, area: r.area, color: r.color }, [mask.buffer]);
    } else if (msg.type === 'clear-region') {
      selection = null; perimeter = null; self.postMessage({ type: 'selection', id: msg.id, index: -1, mask: null, count: 0, area: 0, color: null });
    } else if (msg.type === 'suggest-perimeter') {
      if (!selection || selection.index !== msg.index) throw new Error('Elegí una región antes de crear el contorno.');
      const p = parts[msg.index], nodes = nodesFromRegion(p, selection.mask, msg.count || 8), graph = graphCache.get(p) || meshGraph(p); graphCache.set(p, graph);
      const traced = traceLoop(p, nodes, msg.magnet, msg.smooth, graph), mask = maskInsideLoop(p, traced.route, selection.seed); perimeter = { ...traced, mask, index: msg.index, seed: selection.seed };
      sendPerimeter(msg.id, perimeter);
    } else if (msg.type === 'trace-perimeter') {
      const p = parts[msg.index]; if (!p) throw new Error('La pieza elegida ya no existe.'); const graph = graphCache.get(p) || meshGraph(p); graphCache.set(p, graph);
      const traced = traceLoop(p, msg.nodes, msg.magnet, msg.smooth, graph), seed = msg.seed ?? selection?.seed ?? msg.nodes[0].face, mask = maskInsideLoop(p, traced.route, seed); perimeter = { ...traced, mask, index: msg.index, seed };
      sendPerimeter(msg.id, perimeter);
    } else if (msg.type === 'cut-perimeter') {
      if (!perimeter || perimeter.index !== msg.index || !perimeter.valid) throw new Error('El contorno no está listo para cortar.');
      const p = parts[msg.index], result = cutRegion(M, p, perimeter.mask, msg.depth), next = parts.slice(); next.splice(msg.index, 1, { ...result[0], name: `${p.name} · contorno` }, { ...result[1], name: `${p.name} · base` }); parts = next; selection = null; perimeter = null;
      sendParts(M, msg.id);
    } else if (msg.type === 'cut-region') {
      if (!selection || selection.index !== msg.index) throw new Error('Elegí una región de la pieza primero.');
      const p = parts[msg.index]; if (!p) throw new Error('La pieza elegida ya no existe.');
      const [a, b] = cutRegion(M, p, selection.mask, msg.depth);
      const next = parts.slice(); next.splice(msg.index, 1, { ...a, name: `${p.name} · región` }, { ...b, name: `${p.name} · base` }); parts = next; selection = null; perimeter = null;
      sendParts(M, msg.id);
    } else if (msg.type === 'analyze') {
      self.postMessage({ type: 'analysis', id: msg.id, info: parts.map(analyze) });
    } else throw new Error('Operación desconocida.');
  } catch (err) { self.postMessage({ type: 'error', id: msg.id, error: err?.message || String(err) }); }
};
