import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { placeOf } from '../lib/keychain/exporters.js';

// Vista tipo slicer: la cama elegida o todas las camas juntas (en grilla, como Bambu Studio).
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

// Número de la cama dibujado en el piso, delante de la cama (como en Bambu Studio).
function plateLabel(n, size) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#5ddadb'; x.font = 'bold 84px Outfit, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(n).padStart(2, '0'), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return m;
}

function bedGroup(bed, label) {
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
  if (label) {
    const l = plateLabel(label, Math.min(28, bed.w * 0.12));
    l.position.set(bed.w + Math.min(28, bed.w * 0.12) * 0.55, Math.min(28, bed.w * 0.12) * 0.5, 0.05);
    g.add(l);
  }
  return g;
}

// Dónde va cada cama en la vista "Todas": grilla de ⌈√n⌉ columnas (igual que Bambu Studio).
export function plateOffset(i, n, bed) {
  const v = Math.sqrt(n), r = Math.round(v);
  const cols = v > r ? r + 1 : r;
  return [(i % cols) * bed.w * 1.2, -Math.floor(i / cols) * bed.h * 1.2];
}

export default function KeychainViewer({ plates, show, bed, colors, view }) {
  const box = useRef(null);
  const st = useRef(null);

  // Escena (una sola vez).
  useEffect(() => {
    const el = box.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f5a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-120, -200, 300); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd8ff, 0.5); fill.position.set(200, 150, 120); scene.add(fill);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;
    const beds = new THREE.Group(); scene.add(beds);
    const content = new THREE.Group(); scene.add(content);
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();
    st.current = { renderer, scene, camera, controls, content, beds, area: null, layoutKey: null };
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      const free = (o) => { o.geometry?.dispose(); if (o.material?.map) o.material.map.dispose(); };
      content.traverse(free); beds.traverse(free);
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, []);

  // Qué camas se dibujan y dónde: todas (en grilla) o solo la elegida.
  const all = show === 'all' && plates.length > 1;
  const visible = all ? plates.map((pl, i) => ({ pl, i, off: plateOffset(i, plates.length, bed) }))
    : plates[show] ? [{ pl: plates[show], i: show, off: [0, 0] }] : [];

  // Cámara: encuadra todas las camas visibles. De frente en ángulo o desde arriba.
  const aim = (mode) => {
    const s = st.current; if (!s || !s.area) return;
    const { minX, maxX, minY, maxY } = s.area;
    const w = maxX - minX, h = maxY - minY;
    const c = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0);
    const fit = Math.max(w / Math.max(0.6, s.camera.aspect), h);
    const d = fit * (s.area.maxX - s.area.minX > bed.w * 1.5 ? 2.05 : 1.75); // con varias camas, un poco más lejos
    if (mode === 'top') s.camera.position.set(c.x, c.y - 0.001, d * 1.02);
    else s.camera.position.set(c.x, c.y - d * 0.8, d * 0.68);
    s.controls.target.copy(c); s.controls.update();
  };

  // Camas (se rehacen si cambia la impresora, la cantidad o la vista).
  const layoutKey = `${bed.w}x${bed.h}|${all ? 'all' : 'one'}|${all ? plates.length : 1}`;
  useEffect(() => {
    const s = st.current; if (!s) return;
    if (s.layoutKey === layoutKey) return;
    s.beds.traverse((o) => { o.geometry?.dispose(); if (o.material?.map) o.material.map.dispose(); });
    s.beds.clear();
    const n = all ? plates.length : 1;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const [ox, oy] = all ? plateOffset(i, n, bed) : [0, 0];
      const g = bedGroup(bed, all ? i + 1 : null);
      g.position.set(ox, oy, 0);
      s.beds.add(g);
      minX = Math.min(minX, ox); minY = Math.min(minY, oy); maxX = Math.max(maxX, ox + bed.w); maxY = Math.max(maxY, oy + bed.h);
    }
    s.area = { minX, minY, maxX, maxY };
    s.layoutKey = layoutKey;
    aim(view?.mode === 'top' ? 'top' : 'front');
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (view?.mode) aim(view.mode); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Llaveros de las camas visibles.
  useEffect(() => {
    const s = st.current; if (!s) return;
    s.content.traverse((o) => { o.geometry?.dispose(); });
    s.content.clear();
    // Dos materiales para todo (cambiar el color solo los repinta, ver abajo).
    if (!s.mats) s.mats = [new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.02 }), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.02 })];
    const [mBase, mLet] = s.mats;
    mBase.color.set(colors.base); mLet.color.set(colors.letters);
    for (const { pl, off } of visible) {
      for (const it of pl.items) {
        const place = { ...placeOf(it) };
        place.x += off[0]; place.y += off[1];
        s.content.add(new THREE.Mesh(geometryFrom(it.base, place), mBase));
        s.content.add(new THREE.Mesh(geometryFrom(it.letters, place), mLet));
      }
    }
  }, [plates, show, all, bed.w, bed.h]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cambiar de color: solo se repintan los materiales (no se rearman las piezas).
  useEffect(() => {
    const s = st.current; if (!s?.mats) return;
    s.mats[0].color.set(colors.base); s.mats[1].color.set(colors.letters);
  }, [colors.base, colors.letters]);

  return <div className="kc-viewer" ref={box} />;
}
