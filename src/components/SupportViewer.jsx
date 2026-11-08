import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';

function geometry(part, heat = false, bands = []) {
  const pos = new Float32Array(part.tri.length * 3);
  const colors = heat ? new Float32Array(part.tri.length * 3) : null;
  for (let i = 0; i < part.tri.length; i += 3) {
    const ids = [part.tri[i], part.tri[i + 1], part.tri[i + 2]];
    const p = ids.map((id) => [part.vert[id * 3], part.vert[id * 3 + 1], part.vert[id * 3 + 2]]);
    for (let k = 0; k < 3; k++) pos.set(p[k], (i + k) * 3);
    if (colors) {
      const ab = new THREE.Vector3(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
      const ac = new THREE.Vector3(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
      const nz = ab.cross(ac).normalize().z, z = (p[0][2] + p[1][2] + p[2][2]) / 3;
      const critical = nz < -.15 && bands.some((b) => Math.abs(z - b.z) < Math.max(.5, b.step || .25));
      const moderate = nz < -.15;
      const c = new THREE.Color(critical ? '#ef4444' : moderate ? '#fbbf24' : '#34d399');
      for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (colors) g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals(); g.computeBoundingBox(); return g;
}

const SupportViewer = forwardRef(function SupportViewer({ originals = [], optimized = [], additions = [], mode = 'original', analyses = [] }, ref) {
  const host = useRef(null), state = useRef(null);
  useImperativeHandle(ref, () => ({ fit: () => state.current?.fit(), view: (v) => state.current?.view(v) }), []);
  useEffect(() => {
    const el = host.current, renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#11163f');
    const camera = new THREE.PerspectiveCamera(38, 1, .05, 100000); camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2560, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.8); sun.position.set(4, -5, 8); scene.add(sun);
    const grid = new THREE.GridHelper(400, 40, 0x5ddadb, 0x343766); grid.rotateX(Math.PI / 2); grid.material.transparent = true; grid.material.opacity = .42; scene.add(grid);
    const axes = new THREE.AxesHelper(35); scene.add(axes);
    const group = new THREE.Group(); scene.add(group);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    const gizmo = new ViewHelper(camera, renderer.domElement); gizmo.setLabels('X', 'Y', 'Z'); const timer = new THREE.Timer();
    let size = { w: 1, h: 1 }, raf;
    const resize = () => { size = { w: el.clientWidth, h: el.clientHeight }; if (!size.w || !size.h) return; renderer.setSize(size.w, size.h, false); camera.aspect = size.w / size.h; camera.updateProjectionMatrix(); };
    const fit = () => { const box = new THREE.Box3().setFromObject(group); if (box.isEmpty()) return; const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), span = Math.max(10, s.x, s.y, s.z); controls.target.copy(c); camera.position.set(c.x + span * 1.4, c.y - span * 1.7, c.z + span * 1.25); camera.near = span / 1000; camera.far = span * 100; camera.updateProjectionMatrix(); controls.update(); state.current.span = span; };
    const view = (name) => { const box = new THREE.Box3().setFromObject(group); if (box.isEmpty()) return; const c = box.getCenter(new THREE.Vector3()), d = (state.current.span || 50) * 3, map = { top: [0, 0, d], bottom: [0, 0, -d], front: [0, -d, 0], side: [d, 0, 0] }, v = map[name] || [d, -d, d]; controls.target.copy(c); camera.up.set(name === 'top' || name === 'bottom' ? 0 : 0, name === 'top' || name === 'bottom' ? 1 : 0, name === 'top' || name === 'bottom' ? 0 : 1); camera.position.set(c.x + v[0], c.y + v[1], c.z + v[2]); controls.update(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const click = (e) => { const r = renderer.domElement.getBoundingClientRect(); if (e.clientX > r.right - 128 && e.clientY > r.bottom - 128) gizmo.handleClick(e); };
    renderer.domElement.addEventListener('pointerup', click);
    const loop = () => { raf = requestAnimationFrame(loop); timer.update(); if (gizmo.animating) gizmo.update(timer.getDelta()); gizmo.center.copy(controls.target); controls.update(); renderer.clear(); renderer.render(scene, camera); gizmo.render(renderer); }; loop();
    state.current = { renderer, scene, camera, group, controls, gizmo, fit, view, span: 50, last: null };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.domElement.removeEventListener('pointerup', click); controls.dispose(); gizmo.dispose(); group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement); state.current = null; };
  }, []);

  useEffect(() => {
    const s = state.current; if (!s) return; s.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); s.group.clear();
    const add = (part, color, opacity = 1, heat = false, bands = []) => {
      const g = geometry(part, heat, bands), m = new THREE.MeshStandardMaterial({ color: heat ? '#fff' : color, vertexColors: heat, roughness: .58, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity > .6 }); s.group.add(new THREE.Mesh(g, m));
    };
    if (mode === 'original') originals.forEach((p) => add(p, '#6f7fe8'));
    else if (mode === 'optimized') (optimized.length ? optimized : originals).forEach((p) => add(p, '#5ddadb'));
    else if (mode === 'compare') { originals.forEach((p) => add(p, '#f78eb6', .28)); (optimized.length ? optimized : originals).forEach((p) => add(p, '#5ddadb', .72)); }
    else if (mode === 'changes') { originals.forEach((p) => add(p, '#6f7fe8', .24)); additions.forEach((p) => add(p, '#5ddadb')); }
    else originals.forEach((p, i) => add(p, '#fff', 1, true, (analyses[i]?.bands || []).map((b) => ({ ...b, step: analyses[i]?.settings?.layerHeight }))));
    if (s.last !== originals && originals.length) { s.fit(); s.last = originals; }
  }, [originals, optimized, additions, mode, analyses]);
  return <div className="support-viewer" ref={host}><div className="support-viewer-help">Izquierdo: orbitar · Derecho/ruedita: mover · Rueda: zoom</div></div>;
});

export default SupportViewer;
