import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const COLORS = ['#5ddadb', '#8b5cf6', '#f78eb6', '#6366f1', '#fbbf24', '#34d399', '#fb923c', '#a78bfa'];
function makeGeometry(p, palette = []) {
  // Geometria no indexada: cada triangulo conserva su color exacto. Promediar
  // colores en vertices compartidos mezclaba/desaturaba la pintura tras cortar.
  const pos = new Float32Array(p.tri.length * 3), colors = p.col && palette.length ? new Float32Array(p.tri.length * 3) : null;
  for (let i = 0; i < p.tri.length; i++) {
    const src = p.tri[i] * 3, dst = i * 3; pos[dst] = p.vert[src]; pos[dst + 1] = p.vert[src + 1]; pos[dst + 2] = p.vert[src + 2];
    if (colors) { const c = new THREE.Color(palette[p.col[Math.floor(i / 3)]] || '#9aa6c5'); colors[dst] = c.r; colors[dst + 1] = c.g; colors[dst + 2] = c.b; }
  }
  const source = new THREE.BufferGeometry(); source.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (colors) source.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Suaviza la triangulación visible de superficies curvas, pero conserva como
  // arista dura el encuentro entre una pared y la tapa plana del corte.
  const g = toCreasedNormals(source, Math.PI / 4); g.computeBoundingBox(); return g;
}
function selectionGeometry(part, mask) { const index = []; for (let f = 0; f < mask.length; f++) if (mask[f]) index.push(part.tri[f * 3], part.tri[f * 3 + 1], part.tri[f * 3 + 2]); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(part.vert, 3)); g.setIndex(index); g.computeVertexNormals(); return g; }

const SplitViewer = forwardRef(function SplitViewer({ parts, selected, hidden, mode, projection, exploded, plane, palette = [], regionSelection, regionMode = false, brushMode = false, brushRadius = 3, onFaceClick, perimeter, nodeMode = false, selectedNode = -1, onNodeSelect, onNodeAdd, onNodeMove, onNodePreview, transformMode = 'off', onPieceTransform }, ref) {
  const host = useRef(null), state = useRef(null), clickRef = useRef(onFaceClick), addRef = useRef(onNodeAdd), moveRef = useRef(onNodeMove), previewNodeRef = useRef(onNodePreview), selectNodeRef = useRef(onNodeSelect), transformRef = useRef(onPieceTransform), regionModeRef = useRef(regionMode), brushModeRef = useRef(brushMode), brushRadiusRef = useRef(brushRadius), nodeModeRef = useRef(nodeMode);
  useEffect(() => { clickRef.current = onFaceClick; addRef.current = onNodeAdd; moveRef.current = onNodeMove; previewNodeRef.current = onNodePreview; selectNodeRef.current = onNodeSelect; transformRef.current = onPieceTransform; regionModeRef.current = regionMode; brushModeRef.current = brushMode; brushRadiusRef.current = brushRadius; nodeModeRef.current = nodeMode; }, [onFaceClick, onNodeAdd, onNodeMove, onNodePreview, onNodeSelect, onPieceTransform, regionMode, brushMode, brushRadius, nodeMode]);
  useImperativeHandle(ref, () => ({ fit: () => state.current?.fit(), view: (axis) => state.current?.view(axis) }), []);
  useEffect(() => {
    const el = host.current, renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.autoClear = false; el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#11163f');
    const persp = new THREE.PerspectiveCamera(40, 1, .1, 100000), ortho = new THREE.OrthographicCamera(-100, 100, 100, -100, .1, 100000); persp.up.set(0, 0, 1); ortho.up.set(0, 0, 1);
    const controls = new OrbitControls(persp, renderer.domElement); controls.enableDamping = true; controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    scene.add(new THREE.HemisphereLight(0xffffff, 0x26304e, 2.2)); const sun = new THREE.DirectionalLight(0xffffff, 2.7); sun.position.set(3, -4, 7); scene.add(sun);
    const grid = new THREE.GridHelper(400, 40, 0x5ddadb, 0x343766); grid.rotateX(Math.PI / 2); grid.material.opacity = .46; grid.material.transparent = true; scene.add(grid);
    const group = new THREE.Group(); scene.add(group); const planeGroup = new THREE.Group(); scene.add(planeGroup); const brushCursor = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 48), new THREE.MeshBasicMaterial({ color: '#5ddadb', transparent: true, opacity: .9, side: THREE.DoubleSide, depthTest: false })); brushCursor.visible = false; brushCursor.renderOrder = 8; scene.add(brushCursor);
    const transform = new TransformControls(persp, renderer.domElement); transform.setMode('rotate'); transform.setSpace('world'); transform.setSize(.82); scene.add(transform.getHelper());
    let transformStart = null;
    transform.addEventListener('dragging-changed', (e) => {
      controls.enabled = !e.value;
      if (e.value && transform.object) transformStart = { position: transform.object.position.clone(), quaternion: transform.object.quaternion.clone() };
      else if (transformStart && transform.object) {
        const index = transform.object.userData.index;
        if (transform.mode === 'translate') { const d = transform.object.position.clone().sub(transformStart.position); if (d.lengthSq() > 1e-10) transformRef.current?.(index, { type: 'move', value: [d.x, d.y, d.z] }); }
        else { const q = transform.object.quaternion.clone().multiply(transformStart.quaternion.clone().invert()); if (Math.abs(q.w) < .999999) transformRef.current?.(index, { type: 'rotate', value: [q.x, q.y, q.z, q.w] }); }
        transformStart = null;
      }
    });
    const gizmo = new ViewHelper(persp, renderer.domElement); gizmo.setLabels('X', 'Y', 'Z'); const timer = new THREE.Timer();
    let active = persp, size = { w: 1, h: 1 }, raf;
    const updateCamera = () => { const a = size.w / size.h; persp.aspect = a; persp.updateProjectionMatrix(); const span = state.current?.span || 100; ortho.left = -span * a; ortho.right = span * a; ortho.top = span; ortho.bottom = -span; ortho.updateProjectionMatrix(); };
    const fit = () => { const box = new THREE.Box3().setFromObject(group); if (box.isEmpty()) return; const center = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), span = Math.max(s.x, s.y, s.z, 10); state.current.span = span * .72; controls.target.copy(center); active.position.set(center.x + span * 1.35, center.y - span * 1.65, center.z + span * 1.25); active.near = Math.max(.01, span / 1000); active.far = span * 100; active.updateProjectionMatrix(); updateCamera(); controls.object = active; controls.update(); };
    const view = (axis) => { const box = new THREE.Box3().setFromObject(group); if (box.isEmpty()) return; const c = box.getCenter(new THREE.Vector3()), span = state.current.span || 100; const d = span * 3; controls.target.copy(c); const vertical = axis === 'top' || axis === 'bottom', v = { front: [0, -d, 0], back: [0, d, 0], left: [-d, 0, 0], right: [d, 0, 0], top: [0, 0, d], bottom: [0, 0, -d] }[axis] || [d, -d, d]; active.up.set(vertical ? 0 : 0, vertical ? 1 : 0, vertical ? 0 : 1); active.position.set(c.x + v[0], c.y + v[1], c.z + v[2]); controls.update(); };
    const ro = new ResizeObserver(() => { size = { w: el.clientWidth, h: el.clientHeight }; if (size.w && size.h) { renderer.setSize(size.w, size.h, false); updateCamera(); } }); ro.observe(el);
    const gizmoClick = (e) => { const r = renderer.domElement.getBoundingClientRect(); if (e.clientX >= r.right - 128 && e.clientY >= r.bottom - 128 && gizmo.handleClick(e)) e.stopPropagation(); };
    renderer.domElement.addEventListener('pointerup', gizmoClick);
    let down = null; const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    const block = (e) => { if (e.button === 1 || e.type === 'contextmenu') e.preventDefault(); if (e.type === 'mousedown' && e.button === 0) down = [e.clientX, e.clientY]; };
    const hitsAt = (e) => { const r = renderer.domElement.getBoundingClientRect(); mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(mouse, active); ray.params.Line.threshold = Math.max(.15, (state.current?.span || 10) * .012); return ray.intersectObjects(group.children, true); };
    const surfaceAnchor = (hit) => { const mesh = hit.object, p = mesh.worldToLocal(hit.point.clone()), pos = mesh.geometry.getAttribute('position'), face = hit.face; const a = new THREE.Vector3().fromBufferAttribute(pos, face.a), b = new THREE.Vector3().fromBufferAttribute(pos, face.b), c = new THREE.Vector3().fromBufferAttribute(pos, face.c), bary = new THREE.Vector3(); THREE.Triangle.getBarycoord(p, a, b, c, bary); return { index: mesh.userData.index, face: hit.faceIndex, bary: [bary.x, bary.y, bary.z], position: [p.x, p.y, p.z] }; };
    const pick = (e) => { if (e.button !== 0 || !down || (!brushModeRef.current && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5)) return; const hits = hitsAt(e), node = hits.find((h) => h.object.userData.node != null); if (node && nodeModeRef.current) { selectNodeRef.current?.(node.object.userData.node); return; } if (!regionModeRef.current) return; const hit = hits.find((h) => h.object.userData.base); if (hit?.faceIndex != null) clickRef.current?.(hit.object.userData.index, hit.faceIndex, undefined, e.shiftKey, e.altKey); };
    let lastPaint = 0;
    const paintBrush = (e) => { if (!brushModeRef.current) { brushCursor.visible = false; return; } const hit = hitsAt(e).find((h) => h.object.userData.base); if (!hit) { brushCursor.visible = false; return; } const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld); brushCursor.visible = true; brushCursor.position.copy(hit.point).addScaledVector(normal, Math.max(.01, brushRadiusRef.current * .01)); brushCursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal); brushCursor.scale.setScalar(brushRadiusRef.current); if (!(e.buttons & 1) || performance.now() - lastPaint < 32) return; if (hit.faceIndex != null) { lastPaint = performance.now(); clickRef.current?.(hit.object.userData.index, hit.faceIndex, undefined, true, e.altKey); } };
    const brushDown = (e) => { if (brushModeRef.current && e.button === 0) controls.enabled = false; };
    const brushUp = () => { if (brushModeRef.current) controls.enabled = true; };
    const addNode = (e) => { if (!nodeModeRef.current) return; e.preventDefault(); const hits = hitsAt(e), line = hits.find((h) => h.object.userData.segment != null), hit = hits.find((h) => h.object.userData.base); if (hit?.faceIndex != null) addRef.current?.(surfaceAnchor(hit), line ? line.object.userData.segment + 1 : undefined); };
    let draggingNode = -1, dragAnchor = null;
    const startDrag = (e) => { if (!nodeModeRef.current || e.button !== 0) return; const node = hitsAt(e).find((h) => h.object.userData.node != null); if (!node) return; draggingNode = node.object.userData.node; dragAnchor = null; controls.enabled = false; e.preventDefault(); e.stopPropagation(); selectNodeRef.current?.(draggingNode); };
    const dragNode = (e) => { if (draggingNode < 0) return; const hit = hitsAt(e).find((h) => h.object.userData.base); if (hit?.faceIndex != null) { dragAnchor = surfaceAnchor(hit); previewNodeRef.current?.(draggingNode, dragAnchor); } e.preventDefault(); e.stopPropagation(); };
    const finishDrag = (e) => { if (draggingNode < 0) return; const n = draggingNode, anchor = dragAnchor; draggingNode = -1; dragAnchor = null; controls.enabled = true; e.preventDefault(); e.stopPropagation(); if (anchor) moveRef.current?.(n, anchor); };
    renderer.domElement.addEventListener('mousedown', startDrag, true); renderer.domElement.addEventListener('mousemove', dragNode, true); renderer.domElement.addEventListener('mouseup', finishDrag, true); renderer.domElement.addEventListener('mousedown', brushDown, true); renderer.domElement.addEventListener('mousemove', paintBrush); renderer.domElement.addEventListener('mouseup', brushUp, true); renderer.domElement.addEventListener('mousedown', block); renderer.domElement.addEventListener('mouseup', pick); renderer.domElement.addEventListener('dblclick', addNode); renderer.domElement.addEventListener('contextmenu', block);
    const loop = () => { raf = requestAnimationFrame(loop); timer.update(); if (gizmo.animating) gizmo.update(timer.getDelta()); gizmo.center.copy(controls.target); controls.update(); renderer.clear(); renderer.render(scene, active); gizmo.render(renderer); }; loop();
    state.current = { renderer, scene, group, planeGroup, controls, transform, gizmo, persp, ortho, lastParts: null, get active() { return active; }, setActive(c) { const old = active; active = c; c.position.copy(old.position); c.quaternion.copy(old.quaternion); controls.object = c; transform.camera = c; gizmo.camera = c; updateCamera(); controls.update(); }, fit, view, span: 100 }; if (import.meta.env.DEV) window.__splitViewer = state.current;
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); transform.dispose(); gizmo.dispose(); renderer.domElement.removeEventListener('pointerup', gizmoClick); renderer.domElement.removeEventListener('mousedown', startDrag, true); renderer.domElement.removeEventListener('mousemove', dragNode, true); renderer.domElement.removeEventListener('mouseup', finishDrag, true); renderer.domElement.removeEventListener('mousedown', brushDown, true); renderer.domElement.removeEventListener('mousemove', paintBrush); renderer.domElement.removeEventListener('mouseup', brushUp, true); renderer.domElement.removeEventListener('mousedown', block); renderer.domElement.removeEventListener('mouseup', pick); renderer.domElement.removeEventListener('dblclick', addNode); renderer.domElement.removeEventListener('contextmenu', block); group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement); state.current = null; };
  }, []);
  useEffect(() => { const s = state.current; if (!s) return; s.setActive(projection === 'ortho' ? s.ortho : s.persp); }, [projection]);
  useEffect(() => {
    const s = state.current; if (!s) return; s.transform.detach(); s.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); s.group.clear();
    const centers = parts.map((p) => { const b = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(p.vert, 3)); return b.getCenter(new THREE.Vector3()); }); const all = new THREE.Box3(); centers.forEach((c) => all.expandByPoint(c)); const center = all.getCenter(new THREE.Vector3());
    parts.forEach((p, i) => {
      const geometry = makeGeometry(p, palette), mat = new THREE.MeshStandardMaterial({ color: geometry.getAttribute('color') ? '#ffffff' : COLORS[i % COLORS.length], vertexColors: !!geometry.getAttribute('color'), roughness: .58, metalness: .03, side: THREE.DoubleSide, transparent: mode === 'transparent', opacity: mode === 'transparent' ? .28 : 1, wireframe: mode === 'wire' });
      const mesh = new THREE.Mesh(geometry, mat); mesh.userData.index = i; mesh.userData.base = true; mesh.visible = !hidden.has(i);
      const pivot = new THREE.Group(); pivot.userData.index = i; pivot.position.copy(centers[i]); mesh.position.copy(centers[i]).multiplyScalar(-1); pivot.add(mesh);
      if (exploded) { const d = centers[i].clone().sub(center); if (d.lengthSq() < 1e-8) d.set((i % 2 ? 1 : -1), (i % 3) - 1, .25); d.normalize().multiplyScalar(exploded * 12); pivot.position.add(d); }
      if (i === selected) { mat.emissive = new THREE.Color('#173c45'); mat.emissiveIntensity = .55; }
      if (regionSelection?.index === i && regionSelection.mask) { const overlay = new THREE.Mesh(selectionGeometry(p, regionSelection.mask), new THREE.MeshBasicMaterial({ color: '#f78eb6', transparent: true, opacity: .5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false })); overlay.raycast = () => {}; mesh.add(overlay); }
      if (perimeter?.index === i) {
        const pg = new THREE.Group();
        perimeter.positions.forEach((points, segment) => { const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(points, 3)); const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: perimeter.valid ? '#5ddadb' : '#ff456f', depthTest: false })); line.userData.segment = segment; pg.add(line); });
        perimeter.nodes.forEach((node, n) => { const points = perimeter.positions[n], sphere = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.28, s.span * .018), 18, 14), new THREE.MeshBasicMaterial({ color: n === selectedNode ? '#ffffff' : '#5ddadb', depthTest: false })); sphere.position.set(points[0], points[1], points[2]); sphere.userData.node = n; sphere.renderOrder = 6; pg.add(sphere); });
        mesh.add(pg);
      }
      s.group.add(pivot); if (i === selected && (transformMode === 'rotate' || transformMode === 'move') && !hidden.has(i)) { s.transform.setMode(transformMode === 'move' ? 'translate' : 'rotate'); s.transform.attach(pivot); }
    });
    if (parts.length && parts !== s.lastParts) { s.fit(); s.lastParts = parts; }
  }, [parts, selected, hidden, mode, exploded, palette, regionSelection, perimeter, selectedNode, transformMode]);
  useEffect(() => { const s = state.current; if (!s) return; s.planeGroup.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); s.planeGroup.clear(); if (!plane?.visible || !parts.length) return; const span = Math.max(8, plane.size || s.span * 1.15); const g = new THREE.PlaneGeometry(span, span); const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#5ddadb', transparent: true, opacity: .075, side: THREE.DoubleSide, depthWrite: false })); const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: '#5ddadb', transparent: true, opacity: .8, depthTest: false })); const n = new THREE.Vector3(...plane.normal).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); mesh.quaternion.copy(q); mesh.position.fromArray(plane.point); edge.quaternion.copy(q); edge.position.copy(mesh.position); edge.renderOrder = 3; s.planeGroup.add(mesh, edge); }, [plane, parts]);
  return <div className={'split-viewer' + (regionMode || nodeMode ? ' picking' : '')} ref={host}><div className="split-help">{transformMode === 'move' ? 'Arrastrá una flecha del gizmo para mover la pieza en X, Y o Z' : transformMode === 'rotate' ? 'Arrastrá los anillos del gizmo para rotar la pieza · el giro se aplica al modelo real' : nodeMode ? 'Doble clic: agregar nodo · Clic: seleccionar · Supr: eliminar' : regionMode ? 'Hacé clic sobre la zona que querés separar · Arrastrá para orbitar' : 'Izquierdo: orbitar · Derecho/ruedita: mover · Rueda: zoom'}</div></div>;
});
export default SplitViewer;
