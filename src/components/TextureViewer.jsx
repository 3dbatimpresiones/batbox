import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js';

function geometryOf(part) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(part.vert, 3)); g.setIndex(new THREE.BufferAttribute(part.tri, 1)); g.computeVertexNormals(); return g;
}
function selectedGeometry(part, mask) {
  const p = [];
  for (let f = 0; f < mask.length; f++) if (mask[f]) for (let k = 0; k < 3; k++) { const i = part.tri[f * 3 + k] * 3; p.push(part.vert[i], part.vert[i + 1], part.vert[i + 2]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
}

const TextureViewer = forwardRef(function TextureViewer({ original, result, selection, protectedMask, mode, comparePosition = 50, pickMode = '', brushRadius = 3, erase = false, onFace }, ref) {
  const host = useRef(null), state = useRef(null), faceRef = useRef(onFace), pickRef = useRef(pickMode), radiusRef = useRef(brushRadius), eraseRef = useRef(erase);
  useEffect(() => { faceRef.current = onFace; pickRef.current = pickMode; radiusRef.current = brushRadius; eraseRef.current = erase; }, [onFace, pickMode, brushRadius, erase]);
  useImperativeHandle(ref, () => ({ fit: () => state.current?.fit(), view: (v) => state.current?.view(v) }), []);
  useEffect(() => {
    const el = host.current, renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.autoClear = false; renderer.localClippingEnabled = true; el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#10143a');
    const camera = new THREE.PerspectiveCamera(42, 1, .01, 100000); camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    scene.add(new THREE.HemisphereLight(0xffffff, 0x202855, 2.35)); const light = new THREE.DirectionalLight(0xffffff, 2.7); light.position.set(4, -5, 8); scene.add(light);
    const grid = new THREE.GridHelper(400, 40, 0x5ddadb, 0x343766); grid.rotateX(Math.PI / 2); grid.material.transparent = true; grid.material.opacity = .42; scene.add(grid);
    const axes = new THREE.AxesHelper(22); scene.add(axes); const group = new THREE.Group(); scene.add(group); const cursor = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 48), new THREE.MeshBasicMaterial({ color: '#5ddadb', transparent: true, opacity: .95, side: THREE.DoubleSide, depthTest: false })); cursor.visible = false; cursor.renderOrder = 8; scene.add(cursor);
    const helper = new ViewHelper(camera, renderer.domElement); helper.setLabels('X', 'Y', 'Z'); const timer = new THREE.Timer();
    let span = 100, size = { w: 1, h: 1 }, raf, down = null;
    const resize = () => { camera.aspect = size.w / size.h; camera.updateProjectionMatrix(); renderer.setSize(size.w, size.h, false); };
    const fit = () => { const box = new THREE.Box3().setFromObject(group); if (box.isEmpty()) return; const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()); span = Math.max(s.x, s.y, s.z, 10); controls.target.copy(c); camera.position.set(c.x + span * 1.45, c.y - span * 1.7, c.z + span * 1.25); camera.near = Math.max(.01, span / 1000); camera.far = span * 100; camera.updateProjectionMatrix(); controls.update(); };
    const view = (axis) => { const box = new THREE.Box3().setFromObject(group); if (box.isEmpty()) return; const c = box.getCenter(new THREE.Vector3()), d = span * 3, vertical = axis === 'top' || axis === 'bottom', v = { front:[0,-d,0], back:[0,d,0], left:[-d,0,0], right:[d,0,0], top:[0,0,d], bottom:[0,0,-d] }[axis] || [d,-d,d]; camera.up.set(0, vertical ? 1 : 0, vertical ? 0 : 1); controls.target.copy(c); camera.position.set(c.x + v[0], c.y + v[1], c.z + v[2]); controls.update(); };
    const ro = new ResizeObserver(() => { size = { w: el.clientWidth, h: el.clientHeight }; if (size.w && size.h) resize(); }); ro.observe(el);
    const pointerDown = (e) => { if (e.button === 0) down = [e.clientX, e.clientY]; };
    const hitAt = (e) => { const r = renderer.domElement.getBoundingClientRect(), mouse = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(mouse, camera); return ray.intersectObjects(group.children, false).find((h) => h.object.userData.original); };
    const paint = (e, commit = false) => { const kind = pickRef.current, hit = hitAt(e); if (!hit) { cursor.visible = false; return; } if (kind === 'brush' || kind === 'protect') { const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld); cursor.visible = true; cursor.position.copy(hit.point).addScaledVector(normal, .01); cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), normal); cursor.scale.setScalar(radiusRef.current); cursor.material.color.set(kind === 'protect' ? '#fbbf24' : eraseRef.current ? '#ef4444' : '#5ddadb'); } else cursor.visible = false; if (commit && hit.faceIndex != null) faceRef.current?.(hit.faceIndex, [hit.point.x, hit.point.y, hit.point.z], eraseRef.current); };
    let lastPaint = 0;
    const pointerMove = (e) => { if (!(pickRef.current === 'brush' || pickRef.current === 'protect')) { cursor.visible = false; return; } if ((e.buttons & 1) && performance.now() - lastPaint > 45) { lastPaint = performance.now(); paint(e, true); } else paint(e, false); };
    const pointerUp = (e) => { const kind = pickRef.current; if (!kind || e.button !== 0 || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; if (kind === 'connected' || kind === 'brush' || kind === 'protect') paint(e, true); controls.enabled = true; };
    const brushDown = (e) => { pointerDown(e); if ((pickRef.current === 'brush' || pickRef.current === 'protect') && e.button === 0) controls.enabled = false; };
    renderer.domElement.addEventListener('pointerdown', brushDown); renderer.domElement.addEventListener('pointermove', pointerMove); renderer.domElement.addEventListener('pointerup', pointerUp);
    const loop = () => { raf = requestAnimationFrame(loop); timer.update(); if (helper.animating) helper.update(timer.getDelta()); controls.update(); renderer.clear(); renderer.render(scene, camera); helper.render(renderer); }; loop();
    state.current = { group, fit, view, lastOriginal: null };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); helper.dispose(); renderer.domElement.removeEventListener('pointerdown', brushDown); renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerup', pointerUp); group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); cursor.geometry.dispose(); cursor.material.dispose(); renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement); state.current = null; };
  }, []);
  useEffect(() => {
    const s = state.current; if (!s) return; s.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); s.group.clear();
    const add = (part, material, originalFlag = false) => { if (!part) return null; const mesh = new THREE.Mesh(geometryOf(part), material); mesh.userData.original = originalFlag; s.group.add(mesh); return mesh; };
    const baseMat = new THREE.MeshStandardMaterial({ color: '#5367bd', roughness: .58, metalness: .04, side: THREE.DoubleSide });
    if (mode === 'original' || mode === 'preview' || !result) add(original, baseMat, true);
    else if (mode === 'real') add(result, new THREE.MeshStandardMaterial({ color: '#5ddadb', roughness: .56, metalness: .04, side: THREE.DoubleSide }));
    else if (mode === 'compare') {
      const min = original.info?.min?.[0] ?? 0, max = original.info?.max?.[0] ?? 1, split = min + (max - min) * comparePosition / 100;
      const left = new THREE.Plane(new THREE.Vector3(-1, 0, 0), split), right = new THREE.Plane(new THREE.Vector3(1, 0, 0), -split);
      add(original, new THREE.MeshStandardMaterial({ color: '#5367bd', roughness: .58, side: THREE.DoubleSide, clippingPlanes: [left] }));
      add(result, new THREE.MeshStandardMaterial({ color: '#5ddadb', roughness: .55, side: THREE.DoubleSide, clippingPlanes: [right] }));
      const divider = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1, (original.info?.size?.[1] || 1) * 1.15), Math.max(1, (original.info?.size?.[2] || 1) * 1.15)), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false })); divider.rotateY(Math.PI / 2); divider.position.set(split, (original.info.min[1] + original.info.max[1]) / 2, (original.info.min[2] + original.info.max[2]) / 2); divider.raycast = () => {}; s.group.add(divider);
    } else {
      add(result, new THREE.MeshStandardMaterial({ color: mode === 'changes' ? '#f78eb6' : '#5ddadb', roughness: .55, side: THREE.DoubleSide, transparent: mode === 'compare', opacity: mode === 'compare' ? .82 : 1 }));
      add(original, new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: mode === 'changes' ? .22 : .55, depthTest: false }), mode === 'compare');
    }
    if (original && selection?.some((v) => v) && (mode === 'preview' || !result)) { const overlay = new THREE.Mesh(selectedGeometry(original, selection), new THREE.MeshBasicMaterial({ color: '#f78eb6', transparent: true, opacity: .58, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); overlay.raycast = () => {}; s.group.add(overlay); }
    if (original && protectedMask?.some((v) => v) && (mode === 'preview' || !result)) { const overlay = new THREE.Mesh(selectedGeometry(original, protectedMask), new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: .72, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); overlay.raycast = () => {}; s.group.add(overlay); }
    if (original && original !== s.lastOriginal) { s.fit(); s.lastOriginal = original; }
  }, [original, result, selection, protectedMask, mode, comparePosition]);
  const help = pickMode === 'connected' ? 'Hace clic sobre una superficie conectada' : pickMode === 'brush' ? 'Arrastra para pintar seleccion · activa Borrar para quitar' : pickMode === 'protect' ? 'Arrastra para proteger geometria que no debe modificarse' : 'Izquierdo: orbitar · Derecho: desplazar · Rueda: zoom';
  return <div className={'texture-viewer' + (pickMode ? ' picking' : '')} ref={host}><div className="texture-help">{help}</div></div>;
});
export default TextureViewer;

