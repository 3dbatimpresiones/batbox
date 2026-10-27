import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

// Visor tipo slicer del Personalizador de chops: cama en Z=0, eje Z hacia arriba,
// órbita / zoom / paneo con el mouse o los dedos y el gizmo de ejes (tocá un eje para mirar desde ahí).
// Muestra el chop, los relieves (vista previa), la superficie de referencia y la zona del asa.
// Gizmo como OrcaSlicer (mover / rotar / escalar): clic en el chop = el chop;
// clic en un diseño = todos los diseños juntos; Shift + clic = solo ese diseño.

function meshGeometry(m) {
  const np = m.numProp, src = m.vertProperties, tri = m.triVerts;
  const pos = new Float32Array(tri.length * 3);
  for (let t = 0; t < tri.length; t++) { const v = tri[t] * np; pos[t * 3] = src[v]; pos[t * 3 + 1] = src[v + 1]; pos[t * 3 + 2] = src[v + 2]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function soupGeometry(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Marco local de un diseño sobre la pared: x = a lo ancho, y = hacia arriba, z = hacia afuera.
function frameOf(it) {
  const a = (it.angle * Math.PI) / 180;
  const radial = new THREE.Vector3(Math.cos(a), Math.sin(a), 0), tangent = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0), up = new THREE.Vector3(0, 0, 1);
  const m = new THREE.Matrix4().makeBasis(tangent, up, radial);
  return { pos: new THREE.Vector3(radial.x * it.r, radial.y * it.r, it.h), quat: new THREE.Quaternion().setFromRotationMatrix(m), radial, tangent, up };
}

export default function ChopViewer({ chopPos, reliefs, axis, exclusion, showRef, colors, view, items, selection, mode, onPick, onTransform }) {
  const cb = useRef({});
  cb.current = { onPick, onTransform, items, selection, mode };
  const box = useRef(null);
  const st = useRef(null);

  useEffect(() => {
    const el = box.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.autoClear = false;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
    camera.up.set(0, 0, 1);
    camera.position.set(0, -320, 220);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f5a, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(-150, -220, 300); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd8ff, 0.6); fill.position.set(220, 160, 120); scene.add(fill);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;
    controls.target.set(0, 0, 60);
    // Cama: grilla de 10 mm (como en el slicer)
    const bed = new THREE.Group();
    const S = 220, pts = [];
    for (let v = -S / 2; v <= S / 2 + 0.01; v += 10) pts.push(v, -S / 2, 0, v, S / 2, 0, -S / 2, v, 0, S / 2, v, 0);
    bed.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
      new THREE.LineBasicMaterial({ color: 0x4a5275, transparent: true, opacity: 0.55 })));
    const plate = new THREE.Mesh(new THREE.BoxGeometry(S, S, 1.2), new THREE.MeshStandardMaterial({ color: 0x2a2f45, roughness: 0.9 }));
    plate.position.z = -0.61; bed.add(plate);
    scene.add(bed);
    const content = new THREE.Group(); scene.add(content);
    const helpers = new THREE.Group(); scene.add(helpers);
    // Gizmo de transformación (mover / rotar / escalar) sobre un objeto "proxy"
    const proxy = new THREE.Object3D(); scene.add(proxy);
    const tc = new TransformControls(camera, renderer.domElement);
    tc.setSize(0.9);
    tc.addEventListener('dragging-changed', (e) => {
      controls.enabled = !e.value;
      const st0 = st.current;
      if (e.value) st0.start = { pos: proxy.position.clone(), quat: proxy.quaternion.clone(), scale: proxy.scale.clone() };
      else if (st0.start) {
        const { onTransform: fn, selection: sel } = cb.current;
        fn?.({ mode: tc.mode, selection: sel, start: st0.start, end: { pos: proxy.position.clone(), quat: proxy.quaternion.clone(), scale: proxy.scale.clone() }, frame: st0.frame });
        st0.start = null;
      }
    });
    scene.add(tc.getHelper());
    // Clic (sin arrastrar) para elegir qué se transforma
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
    const onPickUp = (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || tc.dragging || tc.axis) { down = null; return; }
      down = null;
      const rect = renderer.domElement.getBoundingClientRect();
      // El cubito de ejes (abajo a la derecha, 128 px) tiene su propio clic
      if (e.clientX > rect.right - 128 && e.clientY > rect.bottom - 128) return;
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(content.children, false)[0];
      const { onPick: fn, items: its } = cb.current;
      if (!hit) { fn?.(null); return; }
      if (hit.object.name === 'reliefs' && its?.length) {
        // ¿Qué diseño se tocó? El centro más cercano al punto.
        let best = null, bd = Infinity;
        for (const it of its) { const f = frameOf(it); const d = f.pos.distanceToSquared(hit.point); if (d < bd) { bd = d; best = it; } }
        fn?.({ target: 'designs', key: best?.key, shift: e.shiftKey });
      } else fn?.({ target: 'chop' });
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onPickUp);
    const gizmo = new ViewHelper(camera, renderer.domElement);
    gizmo.setLabels('X', 'Y', 'Z');
    const timer = new THREE.Timer();
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const onUp = (e) => { if (gizmo.handleClick(e)) e.stopPropagation(); };
    renderer.domElement.addEventListener('pointerup', onUp);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      timer.update(); const dt = timer.getDelta();
      if (gizmo.animating) gizmo.update(dt);
      gizmo.center.copy(controls.target);
      controls.update();
      renderer.clear();
      renderer.render(scene, camera);
      gizmo.render(renderer);
    };
    loop();
    st.current = { renderer, scene, camera, controls, content, helpers, gizmo, tc, proxy };
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); gizmo.dispose(); tc.dispose();
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onPickUp);
      scene.traverse((o) => { o.geometry?.dispose(); });
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, []);

  // Encuadre: frente, arriba, costado o en ángulo, centrado en la zona decorable.
  const aim = (mode) => {
    const s = st.current; if (!s) return;
    const h = axis ? axis.z1 : 100, r = axis ? Math.max(axis.r0, axis.r1) : 50;
    const c = new THREE.Vector3(0, 0, h / 2), d = Math.max(h, r * 2) * 2.6;
    const dir = { front: [0, -1, 0.15], top: [0, -0.001, 1], side: [1, 0, 0.15], iso: [0.7, -0.9, 0.7] }[mode] || [0.7, -0.9, 0.7];
    const v = new THREE.Vector3(...dir).normalize().multiplyScalar(d);
    s.camera.position.copy(c).add(v); s.controls.target.copy(c); s.controls.update();
  };
  useEffect(() => { if (view?.mode) aim(view.mode); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chop + relieves
  useEffect(() => {
    const s = st.current; if (!s) return;
    s.content.traverse((o) => o.geometry?.dispose()); s.content.clear();
    if (chopPos) { const m = new THREE.Mesh(soupGeometry(chopPos), new THREE.MeshStandardMaterial({ color: colors.chop, roughness: 0.6 })); m.name = 'chop'; s.content.add(m); }
    if (reliefs) { const m = new THREE.Mesh(meshGeometry(reliefs), new THREE.MeshStandardMaterial({ color: colors.relief, roughness: 0.45 })); m.name = 'reliefs'; s.content.add(m); }
  }, [chopPos, reliefs, colors.chop, colors.relief]);

  // Gizmo: dónde se ubica y cómo se ve según lo elegido y el modo (como OrcaSlicer)
  useEffect(() => {
    const s = st.current; if (!s) return;
    const { tc, proxy } = s;
    if (!selection || (selection.target === 'designs' && !items?.length) || (selection.target === 'chop' && !chopPos)) { tc.detach(); return; }
    proxy.scale.set(1, 1, 1);
    if (selection.target === 'chop') {
      proxy.position.set(0, 0, 0); proxy.quaternion.identity(); s.frame = null;
      tc.setSpace('world'); tc.setMode(mode);
      // El chop siempre apoya en la cama: no se mueve en altura
      tc.showX = true; tc.showY = true; tc.showZ = mode !== 'translate';
    } else {
      const it = (selection.key && items.find((i) => i.key === selection.key)) || items[0];
      const f = frameOf(it);
      proxy.position.copy(f.pos); proxy.quaternion.copy(f.quat); s.frame = { ...f, r: it.r, key: it.key };
      tc.setSpace('local'); tc.setMode(mode);
      // Diseños: mover a lo ancho / arriba-abajo / hacia la pared; rotar sobre sí mismos; escalar parejo
      tc.showX = mode !== 'rotate'; tc.showY = mode !== 'rotate'; tc.showZ = true;
    }
    tc.attach(proxy);
  }, [selection, mode, items, chopPos]);
  // Encuadra al cargar un chop nuevo
  useEffect(() => { if (chopPos) aim('iso'); }, [chopPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Superficie de referencia (cono/cilindro translúcido) y zona del asa (cuña roja)
  useEffect(() => {
    const s = st.current; if (!s) return;
    s.helpers.traverse((o) => o.geometry?.dispose()); s.helpers.clear();
    if (!axis || !showRef) return;
    const h = Math.max(0.1, axis.z1 - axis.z0);
    const cone = new THREE.CylinderGeometry(axis.r1, axis.r0, h, 72, 1, true);
    cone.rotateX(Math.PI / 2); cone.translate(0, 0, axis.z0 + h / 2);
    s.helpers.add(new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: 0x5ddadb, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })));
    // Solo los dos bordes de la zona decorable (abajo y arriba)
    for (const [z, r] of [[axis.z0, axis.r0], [axis.z1, axis.r1]]) {
      const ring = [];
      for (let k = 0; k <= 96; k++) { const t = (k / 96) * Math.PI * 2; ring.push(r * Math.cos(t), r * Math.sin(t), z); }
      s.helpers.add(new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ring, 3)), new THREE.LineBasicMaterial({ color: 0x5ddadb })));
    }
    // Eje
    s.helpers.add(new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, axis.z1 + 15], 3)),
      new THREE.LineDashedMaterial({ color: 0xf78eb6 })));
    if (exclusion) {
      const r = Math.max(axis.r0, axis.r1) + 6;
      const start = ((exclusion.center - exclusion.width / 2) * Math.PI) / 180, len = (exclusion.width * Math.PI) / 180;
      // En CylinderGeometry, después de girarlo para que el eje sea Z, el ángulo θ queda en θ - 90° desde +X.
      const wedge = new THREE.CylinderGeometry(r, r, h, 24, 1, true, start + Math.PI / 2, len);
      wedge.rotateX(Math.PI / 2); wedge.translate(0, 0, axis.z0 + h / 2);
      s.helpers.add(new THREE.Mesh(wedge, new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })));
    }
  }, [axis, exclusion, showRef]);

  return <div className="kc-viewer chop-viewer" ref={box} tabIndex={0} />;
}
