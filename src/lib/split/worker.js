import initManifold from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { analyze, centerAssemblyOnBed, cutByPlane, placePartOnBed, rotatePart, splitBodies, translatePart, validate } from './core.js';
import { parseModel } from './io.js';
import { cutRegion, faceData, selectBrush, selectRegion } from './regions.js';
import { maskInsideLoop, meshGraph, nodesFromRegion, traceLoop } from './path.js';

let parts = [], palette = [], warnings = [], selection = null, perimeter = null, undo = [], redo = [];
const faceCache = new WeakMap(), graphCache = new WeakMap();
const ready = initManifold({ locateFile: () => wasmUrl }).then((M) => { M.setup(); return M; });
const clone = (p) => ({ name: p.name, vert: new Float32Array(p.vert), tri: new Uint32Array(p.tri), col: p.col ? new Uint16Array(p.col) : null });
const transfer = (list) => list.flatMap((p) => [p.vert.buffer, p.tri.buffer, ...(p.col ? [p.col.buffer] : [])]);
const payload = (M) => parts.map((p, i) => ({ ...clone(p), info: validate(M, p), index: i }));
const snapshot = () => parts.map(clone);
const remember = () => { undo.push(snapshot()); if (undo.length > 6) undo.shift(); redo = []; };
const sendParts = (M, id, extra = {}) => { const list = payload(M); self.postMessage({ type: 'ok', id, parts: list, palette, warnings, canUndo: undo.length > 0, canRedo: redo.length > 0, ...extra }, transfer(list)); };
const sendPerimeter = (id, p) => { const positions = p.positions.map((v) => new Float32Array(v)); self.postMessage({ type: 'perimeter', id, index: p.index, nodes: p.nodes, positions, valid: p.valid, problems: p.problems }, positions.map((v) => v.buffer)); };
const warnOnce = (text) => { if (!warnings.includes(text)) warnings = [...warnings, text]; };

self.onmessage = async ({ data: msg }) => {
  try {
    const M = await ready;
    if (msg.type === 'load') {
      const parsed = parseModel(msg.name, msg.buffer);
      // Un 3MF de slicer suele guardar muchas piezas como componentes de un
      // unico objeto de build. Mostrarlas fundidas fue la causa de la carga
      // incorrecta (por ejemplo, 14 componentes aparecian como una pieza).
      parts = [];
      parsed.objects.forEach((p, objectIndex) => {
        const bodies = splitBodies(p);
        bodies.forEach((body, bodyIndex) => parts.push({
          ...body,
          name: bodies.length > 1 ? `${p.name || `Pieza ${objectIndex + 1}`} · pieza ${bodyIndex + 1}` : (p.name || `Pieza ${objectIndex + 1}`),
        }));
      });
      parts = centerAssemblyOnBed(parts);
      palette = parsed.palette; warnings = parsed.warnings; selection = null; perimeter = null; undo = []; redo = [];
      sendParts(M, msg.id, { sourceName: msg.name });
    } else if (msg.type === 'split-bodies') {
      const out = [];
      for (const p of parts) splitBodies(p).forEach((q, i, all) => out.push({ ...q, name: all.length > 1 ? `${p.name} · cuerpo ${i + 1}` : p.name }));
      remember(); parts = out; selection = null; perimeter = null; sendParts(M, msg.id);
    } else if (msg.type === 'cut-plane') {
      const p = parts[msg.index]; if (!p) throw new Error('La pieza elegida ya no existe.');
      let a, b;
      try { [a, b] = cutByPlane(M, p, msg.normal, msg.point); }
      catch (error) { throw new Error(`No se aplicó el corte porque la malla no permite generar dos sólidos cerrados y limpios. Reparala antes de cortar. ${error?.message || ''}`); }
      if (!a || !b) throw new Error('El plano no atraviesa la pieza. Movelo hacia el interior del modelo.');
      const next = parts.slice(); next.splice(msg.index, 1, { ...a, name: `${p.name} · A` }, { ...b, name: `${p.name} · B` }); remember(); parts = next; selection = null; perimeter = null;
      sendParts(M, msg.id);
    } else if (msg.type === 'rotate-part') {
      const p = parts[msg.index]; if (!p) throw new Error('La pieza elegida ya no existe.');
      const next = parts.slice(); next[msg.index] = rotatePart(p, msg.quaternion); remember(); parts = next; selection = null; perimeter = null;
      sendParts(M, msg.id, { selected: msg.index });
    } else if (msg.type === 'move-part') {
      const p = parts[msg.index]; if (!p) throw new Error('La pieza elegida ya no existe.');
      const next = parts.slice(); next[msg.index] = translatePart(p, msg.delta); remember(); parts = next; selection = null; perimeter = null;
      sendParts(M, msg.id, { selected: msg.index });
    } else if (msg.type === 'place-on-bed') {
      const p = parts[msg.index]; if (!p) throw new Error('La pieza elegida ya no existe.');
      const next = parts.slice(); next[msg.index] = placePartOnBed(p); remember(); parts = next; selection = null; perimeter = null;
      sendParts(M, msg.id, { selected: msg.index });
    } else if (msg.type === 'undo') {
      if (!undo.length) throw new Error('No hay cambios para deshacer.');
      redo.push(snapshot()); parts = undo.pop(); selection = null; perimeter = null; sendParts(M, msg.id);
    } else if (msg.type === 'redo') {
      if (!redo.length) throw new Error('No hay cambios para rehacer.');
      undo.push(snapshot()); parts = redo.pop(); selection = null; perimeter = null; sendParts(M, msg.id);
    } else if (msg.type === 'select-region') {
      const p = parts[msg.index]; if (!p) throw new Error('La pieza elegida ya no existe.');
      let data = faceCache.get(p); if (!data) { data = faceData(p); faceCache.set(p, data); }
      const r = msg.mode === 'brush' ? selectBrush(p, msg.face, msg.radius, data) : selectRegion(p, msg.face, msg.mode, msg.angle, data);
      // La varita usa exactamente el mismo trazador técnico que Nodos: de la
      // región de color se obtiene un lazo natural, con imán y suavizado, y la
      // máscara final proviene del perímetro, no de un flood-fill irregular.
      if (msg.mode === 'color' && r.count > 6) {
        try {
          const graph = graphCache.get(p) || meshGraph(p); graphCache.set(p, graph);
          const nodes = nodesFromRegion(p, r.mask, msg.nodeCount || 12);
          const traced = traceLoop(p, nodes, msg.magnet ?? 60, msg.smooth ?? 35, graph);
          if (traced.valid) { const tracedMask = maskInsideLoop(p, traced.route, msg.face); let count = 0, area = 0; for (let i = 0; i < tracedMask.length; i++) if (tracedMask[i]) { count++; area += data.area[i]; } r.mask = tracedMask; r.count = count; r.area = area; }
        } catch { /* conserva la selección de color si el lazo no puede cerrarse */ }
      }
      const sameSelection = selection?.index === msg.index && selection.mask?.length === r.mask.length;
      if (msg.erase && !sameSelection) r.mask.fill(0);
      else if ((msg.additive || msg.erase) && sameSelection) for (let i = 0; i < r.mask.length; i++) r.mask[i] = msg.erase ? (selection.mask[i] && !r.mask[i] ? 1 : 0) : (r.mask[i] || selection.mask[i] ? 1 : 0);
      let count = 0, area = 0; for (let i = 0; i < r.mask.length; i++) if (r.mask[i]) { count++; area += data.area[i]; }
      selection = { index: msg.index, mask: r.mask, seed: msg.face }; perimeter = null;
      const mask = new Uint8Array(r.mask); self.postMessage({ type: 'selection', id: msg.id, index: msg.index, face: msg.face, mask, count, area, color: r.color }, [mask.buffer]);
    } else if (msg.type === 'invert-region') {
      if (!selection || selection.index !== msg.index) throw new Error('Elegí una región antes de invertirla.');
      const p = parts[msg.index]; let data = faceCache.get(p); if (!data) { data = faceData(p); faceCache.set(p, data); }
      const mask = new Uint8Array(selection.mask.length); let count = 0, area = 0;
      for (let i = 0; i < mask.length; i++) if (!selection.mask[i]) { mask[i] = 1; count++; area += data.area[i]; }
      selection = { ...selection, mask }; perimeter = null;
      self.postMessage({ type: 'selection', id: msg.id, index: msg.index, face: selection.seed, mask, count, area, color: null }, [mask.buffer]);
    } else if (msg.type === 'clear-region') {
      selection = null; perimeter = null; self.postMessage({ type: 'selection', id: msg.id, index: -1, mask: null, count: 0, area: 0, color: null });
    } else if (msg.type === 'suggest-perimeter') {
      if (!selection || selection.index !== msg.index) throw new Error('Elegí una región antes de crear el contorno.');
      const p = parts[msg.index], nodes = nodesFromRegion(p, selection.mask, msg.count || 8), graph = graphCache.get(p) || meshGraph(p); graphCache.set(p, graph);
      const traced = traceLoop(p, nodes, msg.magnet, msg.smooth, graph), mask = maskInsideLoop(p, traced.route, selection.seed); perimeter = { ...traced, mask, index: msg.index, seed: selection.seed };
      sendPerimeter(msg.id, perimeter);
    } else if (msg.type === 'trace-perimeter') {
      const p = parts[msg.index]; if (!p) throw new Error('La pieza elegida ya no existe.'); const graph = graphCache.get(p) || meshGraph(p); graphCache.set(p, graph);
      const traced = traceLoop(p, msg.nodes, msg.magnet, msg.smooth, graph), seed = msg.seed ?? selection?.seed ?? null, mask = maskInsideLoop(p, traced.route, seed); perimeter = { ...traced, mask, index: msg.index, seed };
      sendPerimeter(msg.id, perimeter);
    } else if (msg.type === 'cut-perimeter') {
      if (!perimeter || perimeter.index !== msg.index || !perimeter.valid) throw new Error('El contorno no está listo para cortar.');
      const p = parts[msg.index]; let result;
      try { result = cutRegion(M, p, perimeter.mask, msg.depth, { solidify: false }); } catch (error) { throw new Error(`No se aplicó el contorno porque no produciría dos sólidos limpios y encastrables. ${error?.message || ''}`); }
      const next = parts.slice(); next.splice(msg.index, 1, { ...result[0], name: `${p.name} · contorno` }, { ...result[1], name: `${p.name} · base` }); remember(); parts = next; selection = null; perimeter = null;
      sendParts(M, msg.id);
    } else if (msg.type === 'cut-region') {
      if (!selection || selection.index !== msg.index) throw new Error('Elegí una región de la pieza primero.');
      const p = parts[msg.index]; if (!p) throw new Error('La pieza elegida ya no existe.');
      let a, b;
      try { [a, b] = cutRegion(M, p, selection.mask, msg.depth); } catch (error) { throw new Error(`No se aplicó la extracción porque no produciría dos sólidos limpios y encastrables. ${error?.message || ''}`); }
      const next = parts.slice(); next.splice(msg.index, 1, { ...a, name: `${p.name} · región` }, { ...b, name: `${p.name} · base` }); remember(); parts = next; selection = null; perimeter = null;
      sendParts(M, msg.id);
    } else if (msg.type === 'analyze') {
      self.postMessage({ type: 'analysis', id: msg.id, info: parts.map(analyze) });
    } else throw new Error('Operación desconocida.');
  } catch (err) { self.postMessage({ type: 'error', id: msg.id, error: err?.message || String(err) }); }
};
