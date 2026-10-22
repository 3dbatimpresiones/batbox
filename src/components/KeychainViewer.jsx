import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { placeOf } from '../lib/keychain/exporters.js';

// Vista tipo slicer: la cama de la impresora con los llaveros de la cama elegida.
// Eje Z hacia arriba (como en el slicer). La cámara solo se mueve sola al cambiar
// de impresora o al tocar "Ver de frente" / "Desde arriba".

function geometryFrom(mesh, place) {
  const np = mesh.numProp, src = mesh.vertProperties, tri = mesh.triVerts;
  const { cx, cy, x, y, rot } = place;
  const pos = new Float32Array(tri.length * 3);
  for (let t = 0; t < tri.length; t++) {
    const v = tri[t] * np;
    let px = src[v] - cx, py = src[v + 1] - cy;
    if (rot) { const k = px; px = -py; py = k; }
    pos[t * 3] = px + x; pos[t * 3 + 1] = py + y; pos[t * 3 + 2] = src[v + 2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();   // sin índices = caras planas y bordes nítidos, como en el slicer
  return g;
}

function bedGroup(bed) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(bed.w, bed.h, 1.2), new THREE.MeshStandardMaterial({ color: 0x2a2f45, roughness: 0.9 }));
  plate.position.set(bed.w / 2, bed.h / 2, -0.61);
  g.add(plate);
  const pts = [];
  for (let x = 0; x <= bed.w + 0.01; x += 10) pts.push(x, 0, 0.02, x, bed.h, 0.02);
  for (let y = 0; y <= bed.h + 0.01; y += 10) pts.push(0, y, 0.02, bed.w, y, 0.02);
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
    new THREE.LineBasicMaterial({ color: 0x4a5275, transparent: true, opacity: 0.55 }));
  g.add(grid);
  const edge = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.03, bed.w, 0, 0.03, bed.w, bed.h, 0.03, 0, bed.h, 0.03], 3)),
    new THREE.LineBasicMaterial({ color: 0x5ddadb }));
  g.add(edge);
  return g;
}

export default function KeychainViewer({ plate, bed, colors, view, onReady }) {
  const box = useRef(null);
  const st = useRef(null);

  // Escena (una sola vez).
  useEffect(() => {
    const el = box.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f5a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-120, -200, 300); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd8ff, 0.5); fill.position.set(200, 150, 120); scene.add(fill);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;
    const content = new THREE.Group(); scene.add(content);
    let bedObj = null;
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();
    st.current = { renderer, scene, camera, controls, content, bedKey: null, setBed: (b) => { if (bedObj) scene.remove(bedObj); bedObj = bedGroup(b); scene.add(bedObj); } };
    onReady?.(renderer.domElement);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      content.traverse((o) => { o.geometry?.dispose(); });
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cámara: de frente en ángulo (como al abrir el slicer) o desde arriba.
  const aim = (mode) => {
    const s = st.current; if (!s) return;
    const c = new THREE.Vector3(bed.w / 2, bed.h / 2, 0);
    // Distancia según el lado más largo de la cama y la forma del recuadro (que entre entera).
    const fit = Math.max(bed.w / Math.max(0.6, s.camera.aspect), bed.h);
    const d = fit * 1.75;
    if (mode === 'top') s.camera.position.set(c.x, c.y - 0.001, d * 1.02);
    else s.camera.position.set(c.x, c.y - d * 0.8, d * 0.68);
    s.controls.target.copy(c); s.controls.update();
  };

  useEffect(() => {
    const s = st.current; if (!s) return;
    const key = `${bed.w}x${bed.h}`;
    if (s.bedKey !== key) { s.setBed(bed); s.bedKey = key; aim('front'); }
  }, [bed.w, bed.h]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (view?.mode) aim(view.mode); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Llaveros de la cama elegida.
  useEffect(() => {
    const s = st.current; if (!s) return;
    s.content.traverse((o) => { o.geometry?.dispose(); });
    s.content.clear();
    s.mats?.forEach((m) => m.dispose());
    const mBase = new THREE.MeshStandardMaterial({ color: colors.base, roughness: 0.55, metalness: 0.02 });
    const mLet = new THREE.MeshStandardMaterial({ color: colors.letters, roughness: 0.5, metalness: 0.02 });
    s.mats = [mBase, mLet];
    for (const it of plate?.items || []) {
      const place = placeOf(it);
      s.content.add(new THREE.Mesh(geometryFrom(it.base, place), mBase));
      s.content.add(new THREE.Mesh(geometryFrom(it.letters, place), mLet));
    }
  }, [plate, colors.base, colors.letters]);

  return <div className="kc-viewer" ref={box} />;
}
