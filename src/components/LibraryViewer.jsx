import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sb } from '../lib/supabase.js';
import Icon from './Icon.jsx';

// =====================================================================
// Visor 3D de la Biblioteca (solo se carga al tocar "Ver en 3D" en la ficha).
// Lee la vista previa liviana (GLB) del bucket privado bb-lib-previews: Supabase
// solo se la entrega a miembros pagos. Modos: "En colores" (como el 3MF, sobre la
// cama) y "Sólido" (un solo color). Vistas: 3/4, frente, costado y arriba.
// =====================================================================

const SOLID = new THREE.MeshStandardMaterial({ color: '#cfd6de', roughness: 0.5, metalness: 0.05 });
const VIEWS = [['iso', '3/4'], ['front', 'Frente'], ['side', 'Costado'], ['top', 'Arriba']];

// Cama de impresión "pintada": PEI oscuro con grilla celeste y el nombre de BATBOX.
function bedTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 1024, 1024); grd.addColorStop(0, '#1d2340'); grd.addColorStop(1, '#141a33');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = 'rgba(93,218,219,.22)'; g.lineWidth = 2;
  for (let i = 0; i <= 1024; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke(); }
  g.strokeStyle = 'rgba(247,142,182,.45)'; g.lineWidth = 6; g.strokeRect(12, 12, 1000, 1000);
  g.fillStyle = 'rgba(255,255,255,.10)'; g.font = 'bold 72px Outfit, sans-serif'; g.textAlign = 'center'; g.fillText('BATBOX', 512, 980);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export default function LibraryViewer({ previewKey, meta, name }) {
  const box = useRef(null);
  const api = useRef({});
  const [state, setState] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [mode, setMode] = useState('color');

  useEffect(() => {
    let alive = true, frame = 0;
    const el = box.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight('#ffffff', '#3b4370', 1.1));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(1, 2, 1.4); scene.add(sun);
    const fill = new THREE.DirectionalLight('#9fdcff', 0.7); fill.position.set(-1.5, 0.8, -1); scene.add(fill);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const loop = () => { frame = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();

    (async () => {
      try {
        const { data, error: e } = await sb.storage.from('bb-lib-previews').download(previewKey);
        if (e || !data) throw new Error('No se pudo cargar la vista 3D. Probá de nuevo en un rato.');
        const gltf = await new GLTFLoader().parseAsync(await data.arrayBuffer(), '');
        if (!alive) return;
        const model = gltf.scene;
        model.rotation.x = -Math.PI / 2; // los archivos de impresión vienen con Z hacia arriba
        model.updateMatrixWorld(true);
        const meshes = [];
        model.traverse((o) => {
          if (!o.isMesh) return;
          o.geometry = toCreasedNormals(o.geometry, Math.PI / 5); // curvas suaves, bordes vivos
          o.userData.color = o.material; meshes.push(o);
        });
        // Camas de impresión (256 × 256 mm, como en el laminador), en las coordenadas del archivo.
        const plates = gltf.parser.json.extras?.plates?.length ? gltf.parser.json.extras.plates : null;
        const bedMat = new THREE.MeshStandardMaterial({ map: bedTexture(), roughness: 0.85 });
        const edgeMat = new THREE.MeshStandardMaterial({ color: '#10152b' });
        const mb0 = new THREE.Box3().setFromObject(model);
        const list = plates || (() => { const sz = mb0.getSize(new THREE.Vector3()), c = mb0.getCenter(new THREE.Vector3()); return [{ x: c.x, y: -c.z, w: Math.max(256, sz.x + 10), d: Math.max(256, sz.z + 10) }]; })();
        for (const p of list) {
          const bed = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.d, 3), [edgeMat, edgeMat, edgeMat, edgeMat, bedMat, edgeMat]);
          bed.position.set(p.x, p.y, -1.6); model.add(bed);
        }
        // Apoya el conjunto sobre la cama, centrado.
        const b = new THREE.Box3().setFromObject(model), size = b.getSize(new THREE.Vector3()), center = b.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -b.min.y, -center.z);
        const holder = new THREE.Group(); holder.add(model); scene.add(holder);
        const r = Math.max(size.x, size.y, size.z, 10);
        const target = new THREE.Vector3(0, size.y / 2, 0);
        api.current = {
          view(v) {
            const d = r * 1.25;
            const pos = { iso: [d * 0.62, d * 0.55, d * 0.72], front: [0, size.y / 2 + d * 0.08, d], side: [d, size.y / 2 + d * 0.08, 0], top: [0.001, d * 1.1, 0.001] }[v];
            camera.position.set(...pos); controls.target.copy(target); controls.update();
          },
          mode(m) { for (const o of meshes) o.material = m === 'solid' ? SOLID : o.userData.color; },
        };
        controls.minDistance = r * 0.3; controls.maxDistance = r * 8;
        api.current.view('iso');
        setState('ready');
      } catch (e) { if (alive) { setError(e.message); setState('error'); } }
    })();

    return () => {
      alive = false; cancelAnimationFrame(frame); ro.disconnect(); controls.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; ms.forEach((m) => { if (m !== SOLID) { m.map?.dispose(); m.dispose(); } }); });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [previewKey]);

  useEffect(() => { api.current.mode?.(mode); }, [mode, state]);
  const full = () => { const el = box.current?.parentElement; if (!document.fullscreenElement) el?.requestFullscreen?.(); else document.exitFullscreen?.(); };
  const size = meta?.size_mm;

  return (
    <div className="lib-viewer">
      <div ref={box} className="lib-viewer-canvas" aria-label={`Vista 3D de ${name}`} />
      {state === 'loading' && <div className="lib-viewer-msg"><span className="spinner" /> Preparando la vista 3D…</div>}
      {state === 'error' && <div className="lib-viewer-msg">{error}</div>}
      {state === 'ready' && <>
        <div className="lib-viewer-bar">
          <div className="lib-seg" role="group" aria-label="Modo">
            <button type="button" className={mode === 'color' ? 'on' : ''} onClick={() => setMode('color')}>En colores</button>
            <button type="button" className={mode === 'solid' ? 'on' : ''} onClick={() => setMode('solid')}>Sólido</button>
          </div>
          <div className="lib-seg" role="group" aria-label="Vista">
            {VIEWS.map(([k, l]) => <button key={k} type="button" onClick={() => api.current.view(k)}>{l}</button>)}
          </div>
          <button type="button" className="lib-seg-btn" onClick={full} aria-label="Pantalla completa" title="Pantalla completa"><Icon name="external" size={15} /></button>
        </div>
        <span className="lib-viewer-info">
          {size ? `${size[0]} × ${size[1]} × ${size[2]} mm (todas las piezas)` : ''}{meta?.parts ? ` · ${meta.parts} pieza${meta.parts === 1 ? '' : 's'}` : ''} · vista simplificada
        </span>
      </>}
    </div>
  );
}
