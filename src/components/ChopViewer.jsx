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

// Mueve en vivo los diseños (sin recalcular): da (rad) alrededor del eje, dz (mm) en altura,
// dr (mm) hacia afuera, spin (rad) sobre sí mismo y k (escala). key = solo ese diseño.
function applyLive(content, live, axis) {
  // En un cono, al subir el diseño la pared se abre: se corre hacia afuera lo mismo.
  const slope = axis ? (axis.r1 - axis.r0) / Math.max(1e-6, axis.z1 - axis.z0) : 0;
  for (const m of content.children) {
    if (m.name !== 'reliefs') continue;
    const it = m.userData.it;
    if (!live || (live.key && it.key !== live.key)) { m.matrix.identity(); m.matrixAutoUpdate = false; continue; }
    const f = frameOf(it);
    const local = new THREE.Matrix4().makeTranslation(f.pos.x, f.pos.y, f.pos.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(f.radial, live.spin || 0))
      .multiply(new THREE.Matrix4().makeScale(live.k || 1, live.k || 1, live.k || 1))
      .multiply(new THREE.Matrix4().makeTranslation(-f.pos.x, -f.pos.y, -f.pos.z));
    const dr = (live.dr || 0) + (live.dz || 0) * slope;
    const out = new THREE.Matrix4().makeTranslation(f.radial.x * dr, f.radial.y * dr, 0);
    m.matrix.copy(new THREE.Matrix4().makeRotationZ(live.da || 0).multiply(new THREE.Matrix4().makeTranslation(0, 0, live.dz || 0)).multiply(out).multiply(local));
    m.matrixAutoUpdate = false; m.matrixWorldNeedsUpdate = true;
  }
}
const fmt = (v, d = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d).replace('.', ',');

export default function ChopViewer({ chopPos, resultMesh, reliefs, axis, surfaceGap, exclusion, showRef, showDepth, colors, view, items, selection, mode, onPick, onTransform, onDrag, onAxisChange, axisEditable, fitKey }) {
  const cb = useRef({});
  const liveRef = useRef(null);
  cb.current = { onPick, onTransform, onDrag, onAxisChange, axisEditable, items, selection, mode, axis, surfaceGap, chopPos };
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
    // Controles como los usa el usuario en OrcaSlicer: izquierda orbita;
    // derecha o ruedita apretada desplazan; girar la rueda conserva el zoom.
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
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
    const showLive = (live) => {
      const el2 = liveRef.current; if (!el2) return;
      if (!live) { el2.hidden = true; return; }
      const parts = [];
      if (live.da) parts.push(`↔ ${fmt(live.da * 180 / Math.PI)}°`);
      if (live.dz) parts.push(`↕ ${fmt(live.dz)} mm`);
      if (live.dr) parts.push(`${live.dr < 0 ? '⇥ hacia la pared' : '⇤ hacia afuera'} ${fmt(live.dr)} mm`);
      if (live.spin) parts.push(`⟳ ${fmt(live.spin * 180 / Math.PI)}°`);
      if (live.k && Math.abs(live.k - 1) > 1e-3) parts.push(`⤢ ×${live.k.toFixed(2).replace('.', ',')}`);
      if (live.chop) parts.push(live.chop);
      el2.textContent = (live.key ? 'Este diseño: ' : live.chop ? 'Chop: ' : 'Patrón: ') + (parts.join(' · ') || 'sin cambios');
      el2.hidden = false;
    };
    const tc = new TransformControls(camera, renderer.domElement);
    tc.setSize(0.9);
    tc.addEventListener('dragging-changed', (e) => {
      controls.enabled = !e.value;
      const st0 = st.current;
      if (e.value) st0.start = { pos: proxy.position.clone(), quat: proxy.quaternion.clone(), scale: proxy.scale.clone() };
      else if (st0.start) {
        showLive(null);
        const { onTransform: fn, selection: sel } = cb.current;
        fn?.({ mode: tc.mode, selection: sel, start: st0.start, end: { pos: proxy.position.clone(), quat: proxy.quaternion.clone(), scale: proxy.scale.clone() }, frame: st0.frame });
        st0.start = null;
      }
    });
    tc.addEventListener('objectChange', () => {
      const st0 = st.current; if (!st0?.start) return;
      const sel = cb.current.selection, start = st0.start;
      if (sel?.target === 'chop') {
        const chopMesh = content.children.find((o) => o.name === 'chop');
        if (chopMesh) { chopMesh.position.copy(proxy.position).sub(start.pos); chopMesh.quaternion.copy(proxy.quaternion.clone().multiply(start.quat.clone().invert())); chopMesh.scale.copy(proxy.scale).divide(start.scale); }
        const d = proxy.position.clone().sub(start.pos);
        showLive({ chop: tc.mode === 'translate' ? `X ${fmt(d.x)} · Y ${fmt(d.y)} mm` : tc.mode === 'scale' ? `×${(proxy.scale.x / start.scale.x).toFixed(2)}` : 'girando' });
        return;
      }
      const f = st0.frame; if (!f) return;
      const live = { key: sel?.key || null };
      if (tc.mode === 'translate') {
        const d = proxy.position.clone().sub(start.pos);
        live.da = d.dot(f.tangent) / Math.max(1, f.r); live.dz = d.dot(f.up); live.dr = d.dot(f.radial);
      } else if (tc.mode === 'rotate') {
        const dq = start.quat.clone().invert().multiply(proxy.quaternion);
        live.spin = 2 * Math.atan2(dq.z, dq.w);
      } else live.k = Math.max(proxy.scale.x / start.scale.x, proxy.scale.y / start.scale.y, 0.05);
      applyLive(content, live, cb.current.axis); showLive(live);
    });
    scene.add(tc.getHelper());
    // Clic (sin arrastrar) para elegir qué se transforma
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null, drag = null, axisDrag = null;
    const toNdc = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };
    // Punto del rayo sobre el cilindro de radio r (eje Z): para arrastrar sobre la pared
    const onCylinder = (r) => {
      const o = ray.ray.origin, d = ray.ray.direction;
      const A = d.x * d.x + d.y * d.y, B = 2 * (o.x * d.x + o.y * d.y), C = o.x * o.x + o.y * o.y - r * r;
      const disc = B * B - 4 * A * C;
      if (A < 1e-9 || disc < 0) return null;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      return t > 0 ? o.clone().addScaledVector(d, t) : null;
    };
    const nearest = (pt) => {
      let best = null, bd = Infinity;
      for (const it of cb.current.items || []) { const d = frameOf(it).pos.distanceToSquared(pt); if (d < bd) { bd = d; best = it; } }
      return best;
    };
    const onDown = (e) => {
      // Evita el autoscroll de Chromium sin impedir que OrbitControls reciba
      // el botón central y lo use para orbitar.
      if (e.button === 1) { e.preventDefault(); down = null; return; }
      if (e.button !== 0) { down = null; return; }
      down = { x: e.clientX, y: e.clientY };
      if (tc.axis) return;
      toNdc(e);
      if (cb.current.axisEditable) {
        const handle = ray.intersectObjects(helpers.children.filter((o) => o.name === 'axis-handle'), false)[0];
        if (handle) {
          const kind = handle.object.userData.kind;
          // Siempre arrastramos sobre un plano paralelo a la pantalla. El plano
          // horizontal anterior quedaba casi paralelo al rayo de la cámara y un
          // movimiento mínimo podía disparar el radio a valores enormes.
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), handle.point);
          const p0 = ray.ray.intersectPlane(plane, new THREE.Vector3());
          if (p0) {
            let maxZ = cb.current.axis.z1;
            const pos = cb.current.chopPos;
            if (pos?.length) for (let i = 2; i < pos.length; i += 3) maxZ = Math.max(maxZ, pos[i]);
            const radial = new THREE.Vector3(handle.object.position.x, handle.object.position.y, 0).normalize();
            axisDrag = { kind, plane, p0, radial, maxZ, gap0: cb.current.surfaceGap || 0, axis0: { ...cb.current.axis }, lastDr: 0, pointerId: e.pointerId };
            controls.enabled = false;
            e.preventDefault();
            e.stopImmediatePropagation();
            renderer.domElement.setPointerCapture?.(e.pointerId);
            return;
          }
        }
      }
      const hit = ray.intersectObjects(content.children, false)[0];
      if (hit?.object.name !== 'reliefs') return;
      // Agarró un diseño: se arrastra sobre la pared (todos, o solo ese con Shift)
      const it = hit.object.userData.it || nearest(hit.point);
      const p0 = onCylinder(it.r);
      if (!p0) return;
      drag = { it, r: it.r, a0: Math.atan2(p0.y, p0.x), z0: p0.z, shift: e.shiftKey, moved: false, mesh: hit.object };
      controls.enabled = false;
      e.stopImmediatePropagation();                              // la cámara no gira mientras se arrastra un diseño
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (axisDrag) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toNdc(e);
        const p = ray.ray.intersectPlane(axisDrag.plane, new THREE.Vector3());
        if (!p) return;
        if (axisDrag.kind === 'radius') {
          const rawDr = p.clone().sub(axisDrag.p0).dot(axisDrag.radial);
          const nextGap = Math.max(-10, Math.min(10, axisDrag.gap0 + rawDr));
          const dr = nextGap - axisDrag.gap0;
          const incremental = dr - axisDrag.lastDr; axisDrag.lastDr = dr;
          cb.current.onAxisChange?.({ kind: 'radius', delta: incremental, gap: nextGap });
          showLive({ chop: `Malla / pared ${fmt(dr)} mm` });
        } else {
          const dz = p.z - axisDrag.p0.z;
          const value = axisDrag.kind === 'z1'
            ? Math.min(axisDrag.maxZ, Math.max(axisDrag.axis0.z0 + 5, axisDrag.axis0.z1 + dz))
            : Math.max(0, Math.min(axisDrag.axis0.z1 - 5, axisDrag.axis0.z0 + dz));
          cb.current.onAxisChange?.({ kind: axisDrag.kind, value });
          showLive({ chop: `${axisDrag.kind === 'z1' ? 'Límite superior' : 'Límite inferior'} ${fmt(dz)} mm` });
        }
        renderer.domElement.style.cursor = 'grabbing';
        return;
      }
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) return;
      drag.moved = true;
      toNdc(e);
      const p = onCylinder(drag.r);
      if (!p) return;
      let da = Math.atan2(p.y, p.x) - drag.a0;
      if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
      drag.da = da; drag.dz = p.z - drag.z0;
      // Vista en vivo: el patrón (o ese diseño solo) se mueve mientras arrastrás
      const live = { key: drag.shift ? drag.it.key : null, da, dz: drag.dz };
      applyLive(content, live, cb.current.axis); showLive(live);
      renderer.domElement.style.cursor = 'grabbing';
    };
    const endDrag = () => {
      if (!drag) return false;
      const d = drag; drag = null;
      controls.enabled = true; renderer.domElement.style.cursor = ''; showLive(null);
      if (!d.moved) return false;
      cb.current.onDrag?.({ key: d.shift ? d.it.key : null, da: (d.da || 0) * (180 / Math.PI), dh: d.dz || 0 });
      return true;
    };
    const endAxisDrag = () => {
      if (!axisDrag) return false;
      const pointerId = axisDrag.pointerId;
      axisDrag = null; controls.enabled = true; renderer.domElement.style.cursor = ''; showLive(null);
      if (renderer.domElement.hasPointerCapture?.(pointerId)) renderer.domElement.releasePointerCapture(pointerId);
      return true;
    };
    const onPickUp = (e) => {
      if (endAxisDrag()) { e.preventDefault(); e.stopImmediatePropagation(); down = null; return; }
      if (endDrag()) { e.preventDefault(); e.stopImmediatePropagation(); down = null; return; }
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
        const best = hit.object.userData.it || nearest(hit.point);
        fn?.({ target: 'designs', key: best?.key, shift: e.shiftKey });
      } else fn?.({ target: 'chop' });
    };
    renderer.domElement.addEventListener('pointerdown', onDown, true);   // antes que la órbita de la cámara
    renderer.domElement.addEventListener('pointermove', onMove, true);
    renderer.domElement.addEventListener('pointerup', onPickUp, true);
    renderer.domElement.addEventListener('pointercancel', onPickUp, true);
    const stopMiddleAutoscroll = (e) => { if (e.button === 1) e.preventDefault(); };
    renderer.domElement.addEventListener('auxclick', stopMiddleAutoscroll);
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
    if (import.meta.env.DEV) window.__chopViewer = st.current; // solo para pruebas en `npm run dev`
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); gizmo.dispose(); tc.dispose();
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointerdown', onDown, true);
      renderer.domElement.removeEventListener('pointermove', onMove, true);
      renderer.domElement.removeEventListener('pointerup', onPickUp, true);
      renderer.domElement.removeEventListener('pointercancel', onPickUp, true);
      renderer.domElement.removeEventListener('auxclick', stopMiddleAutoscroll);
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
    if (resultMesh || chopPos) {
      const geometry = resultMesh ? meshGeometry(resultMesh) : soupGeometry(chopPos);
      const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colors.chop, roughness: 0.6 }));
      m.name = 'chop'; s.content.add(m);
    }
    if (reliefs?.length) {
      // En grabado mostramos solo las caras internas del cortador. Con prueba de
      // profundidad activa, la pared oculta el resto y el verde queda dentro del
      // hueco real, como una iluminación de rayos X muy sutil.
      const mat = resultMesh && showDepth
        ? new THREE.MeshBasicMaterial({
          color: 0x55d98a, transparent: true, opacity: 0.18,
          depthTest: true, depthWrite: false, side: THREE.BackSide,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        })
        : resultMesh
          ? new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
          : new THREE.MeshStandardMaterial({ color: colors.relief, roughness: 0.45 });
      reliefs.forEach((r, i) => {
        const m = new THREE.Mesh(meshGeometry(r), mat);
        m.name = 'reliefs'; m.userData.it = items?.[i] || null;
        if (resultMesh && showDepth) m.renderOrder = 2;
        s.content.add(m);
      });
    }
  }, [chopPos, resultMesh, reliefs, showDepth, colors.chop, colors.relief]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Encuadra solo al cargar un chop nuevo (no cada vez que se lo mueve o gira)
  useEffect(() => { if (fitKey) aim('iso'); }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (axisEditable) {
      const addHandle = (kind, label, position, color) => {
        const handle = new THREE.Mesh(new THREE.SphereGeometry(3.2, 18, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 }));
        handle.name = 'axis-handle'; handle.userData.kind = kind; handle.position.copy(position); s.helpers.add(handle);
        const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 42;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = 'rgba(13,20,51,.88)'; ctx.roundRect(1, 1, 158, 40, 12); ctx.fill();
        ctx.strokeStyle = '#5ddadb'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = '700 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 80, 22);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
        sprite.position.copy(position).add(new THREE.Vector3(0, 0, kind === 'z1' ? 6 : kind === 'z0' ? -6 : 6)); sprite.scale.set(24, 6.3, 1); sprite.renderOrder = 5; s.helpers.add(sprite);
      };
      addHandle('z1', 'Arriba', new THREE.Vector3(0, -axis.r1, axis.z1), 0x5ddadb);
      addHandle('z0', 'Abajo', new THREE.Vector3(0, -axis.r0, axis.z0), 0x5ddadb);
      addHandle('radius', 'Radio', new THREE.Vector3((axis.r0 + axis.r1) / 2, 0, (axis.z0 + axis.z1) / 2), 0xf78eb6);
    }
    // Eje
    s.helpers.add(new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, axis.z1 + 15], 3)),
      new THREE.LineDashedMaterial({ color: 0xf78eb6 })));
    // Zonas prohibidas (manija detectada + exclusión manual), en rojo.
    for (const ex of [].concat(exclusion || [])) {
      const r = Math.max(axis.r0, axis.r1) + 6;
      const start = ((ex.center - ex.width / 2) * Math.PI) / 180, len = (Math.min(360, ex.width) * Math.PI) / 180;
      const za = Math.max(axis.z0, ex.z0 ?? axis.z0), zb = Math.min(axis.z1, ex.z1 ?? axis.z1);
      if (!(zb > za)) continue;
      // En CylinderGeometry, después de girarlo para que el eje sea Z, el ángulo θ queda en θ - 90° desde +X.
      const wedge = new THREE.CylinderGeometry(r, r, zb - za, 24, 1, true, start + Math.PI / 2, len);
      wedge.rotateX(Math.PI / 2); wedge.translate(0, 0, za + (zb - za) / 2);
      s.helpers.add(new THREE.Mesh(wedge, new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })));
    }
  }, [axis, exclusion, showRef, axisEditable]);

  return (
    <div className="kc-viewer chop-viewer" ref={box} tabIndex={0}>
      <div className="chop-live" ref={liveRef} hidden />
    </div>
  );
}
