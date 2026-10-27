import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useAuth } from '../auth/AuthContext.jsx';
import { toBinarySTL } from '../lib/keychain/exporters.js';
import { computeLayout, LIMITS } from '../lib/chop/layout.js';
import { MAX_TRIS, bounds, detectWallZone, guessAxis, orient, parse3MF, parseSTL, svgToShapes, weld } from '../lib/chop/files.js';
import Icon from '../components/Icon.jsx';
import AccessPanel from '../components/AccessPanel.jsx';
import { TrialChip } from '../components/TrialBadge.jsx';
import ChopViewer from '../components/ChopViewer.jsx';
import '../styles/keychains.css';

// =====================================================================
// #/chops — Personalizador de chops 3D (Makers Club)
// Chop (STL/3MF) + diseño (SVG) → el diseño se repite en filas y columnas
// sobre la pared del chop, curvado, y se une en un solo sólido imprimible.
// La vista previa y el STL usan la misma distribución (lib/chop/layout.js).
// =====================================================================

const DEF = { rows: 3, cols: 6, width: 25, gapV: 6, startH: 4, startAngle: 0, coverage: 360, stagger: false,
  exclude: false, exclCenter: 90, exclWidth: 70, depth: 0.6, relief: 1.2, mode: 'engrave', engrave: 0.5, snap: true, radial: 0, spin: 0, overrides: {} };
const STEPS = [
  { n: 1, label: 'Chop', help: 'Cargá y orientá el modelo base.' },
  { n: 2, label: 'Diseño', help: 'Cargá el SVG y elegí relieve o grabado.' },
  { n: 3, label: 'Patrón', help: 'Definí filas, columnas y zona del asa.' },
  { n: 4, label: 'Descargar', help: 'Revisá el resultado y generá el STL.' },
];
const wrap360 = (a) => ((a % 360) + 360) % 360;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function useChopWorker() {
  const ref = useRef(null);
  const get = () => {
    if (!ref.current) {
      const worker = new Worker(new URL('../lib/chop/worker.js', import.meta.url), { type: 'module' });
      const st = { worker, seq: 0, pending: new Map() };
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') { st.onProgress?.(m.done, m.total); return; }
        const p = st.pending.get(m.id); if (!p) return;
        st.pending.delete(m.id);
        if (m.type === 'error') p.reject(new Error(m.error)); else p.resolve(m);
      };
      ref.current = st;
    }
    return ref.current;
  };
  // Al salir de la página se cierra (y si React lo vuelve a montar, se crea de nuevo).
  useEffect(() => () => { ref.current?.worker.terminate(); ref.current = null; }, []);
  return useCallback((msg, transfer, onProgress) => {
    const s = get(), id = ++s.seq;
    s.onProgress = onProgress;
    return new Promise((resolve, reject) => { s.pending.set(id, { resolve, reject }); s.worker.postMessage({ ...msg, id }, transfer || []); });
  }, []);
}

function download(bytes, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'model/stl' }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Controles (mismo estilo que el Creador de Llaveros) ----------
function Num({ label, value, onChange, min, max, step = 0.1, unit = 'mm', hint }) {
  return (
    <label className="kc-num">
      <span className="kc-num-top"><span>{label}</span>
        <span className="kc-num-val">
          <input type="number" value={value} min={min} max={max} step={step}
            onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))); }} />
          {unit && <em>{unit}</em>}
        </span>
      </span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Seg({ value, onChange, options, label }) {
  return (
    <div className="kc-field">
      {label && <span className="kc-label">{label}</span>}
      <div className="kc-seg" role="group" aria-label={label}>
        {options.map((o) => <button key={String(o.value)} type="button" className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
      </div>
    </div>
  );
}
function Sec({ title, icon, children, open: open0 = true }) {
  const [open, setOpen] = useState(open0);
  return (
    <section className="kc-sec">
      <button type="button" className="kc-sec-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{icon} {title}</span><span className={'kc-caret' + (open ? ' open' : '')}>▼</span>
      </button>
      {open && <div className="kc-sec-body">{children}</div>}
    </section>
  );
}

export default function Chops() {
  const { isMember, access } = useAuth();
  if (access === 'loading') return <div className="empty"><div className="spinner" /></div>;
  if (!isMember) {
    return (
      <div className="club-locked">
        <div className="club-locked-head">
          <div className="section-label">MAKERS CLUB · HERRAMIENTA</div>
          <h1>Personalizador de chops 3D</h1>
          <p>Subí tu chop y tu escudo o logo: se repite en filas y columnas sobre la pared, en relieve, y bajás un STL listo para imprimir.</p>
        </div>
        <AccessPanel intro="Herramienta solo para miembros" />
      </div>
    );
  }
  return <ChopsApp />;
}

function ChopsApp() {
  const call = useChopWorker();
  const chopInput = useRef(null), designInput = useRef(null);
  // Chop
  const [raw, setRaw] = useState(null);               // triángulos tal cual el archivo
  const [chopName, setChopName] = useState('');
  const [tf, setTf] = useState({ up: 'z', flip: false, scale: 1, cx: 0, cy: 0, q: null });
  const [handle, setHandle] = useState([]);           // arcos de la manija (detectados en el worker): zona prohibida
  const [axis, setAxis] = useState(null);             // { z0, z1, r0, r1 }
  const [surfaceGap, setSurfaceGap] = useState(0);    // separación radial manual de la malla celeste
  const [chopState, setChopState] = useState({ ok: false, error: '' });
  // Diseño
  const [design, setDesign] = useState(null);         // { shapes, w0, h0, name, points }
  const [designState, setDesignState] = useState({ ok: false, error: '' });
  // Patrón
  const [p, setP] = useState(DEF);
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }));
  const [preview, setPreview] = useState(null);       // malla de los relieves
  const [previewChop, setPreviewChop] = useState(null); // chop con el grabado booleano ya restado
  const [items, setItems] = useState([]);              // dónde quedó cada diseño (para el gizmo)
  const [sel, setSel] = useState(null);                // { target: 'chop' | 'designs', key? }
  const [tmode, setTmode] = useState('translate');     // translate · rotate · scale (como OrcaSlicer: M · R · S)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState(null);
  const [showRef, setShowRef] = useState(true);
  const [axisEditing, setAxisEditing] = useState(true);
  const [showDepth, setShowDepth] = useState(true);
  const [exp, setExp] = useState(null);               // { done, total } mientras exporta
  const [check, setCheck] = useState(null);
  const [wizardStep, setWizardStep] = useState(1);

  // Chop orientado (eje en 0,0 y base en z=0)
  const chopPos = useMemo(() => (raw ? orient(raw, tf) : null), [raw, tf]);
  const dims = useMemo(() => {
    if (!chopPos) return null;
    const b = bounds(chopPos);
    return { x: b.maxX - b.minX, y: b.maxY - b.minY, z: b.maxZ - b.minZ };
  }, [chopPos]);

  // Detecta eje y radios (sin contar el asa). Se usa al cargar y con el botón.
  const detect = useCallback((rawPos, t) => {
    const base = orient(rawPos, { ...t, cx: 0, cy: 0 });
    const { cx, cy } = guessAxis(base);
    const pos = orient(rawPos, { ...t, cx, cy });
    const zone = detectWallZone(pos);
    setTf({ ...t, cx: +cx.toFixed(2), cy: +cy.toFixed(2) });
    setAxis({ z0: +zone.z0.toFixed(2), z1: +zone.z1.toFixed(2), r0: +zone.r0.toFixed(2), r1: +zone.r1.toFixed(2) });
    setSurfaceGap(0);
    setAxisEditing(true);
  }, []);

  const loadChop = async (file) => {
    if (!file) return;
    setWizardStep(1);
    setChopState({ ok: false, error: '' }); setPreview(null); setPreviewChop(null); setCheck(null);
    try {
      const buf = await file.arrayBuffer();
      const pos = /\.3mf$/i.test(file.name) ? parse3MF(buf) : parseSTL(buf);
      if (pos.length / 9 > MAX_TRIS) throw new Error(`El modelo tiene demasiados triángulos (${Math.round(pos.length / 9).toLocaleString('es-AR')}). Simplificalo a menos de ${MAX_TRIS.toLocaleString('es-AR')}.`);
      setRaw(pos); setChopName(file.name.replace(/\.(stl|3mf)$/i, ''));
      detect(pos, { up: 'z', flip: false, scale: 1, q: null });
      setP((x) => ({ ...x, overrides: {} })); setSel(null);
      hist.current = { stack: [], i: -1 }; setHistPos({ i: -1, n: 0 });
    } catch (e) { setRaw(null); setChopState({ ok: false, error: e.message }); }
  };
  const loadDesign = async (file) => {
    if (!file) return;
    setWizardStep(2);
    setDesignState({ ok: false, error: '' }); setPreview(null); setPreviewChop(null); setCheck(null);
    try {
      if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') throw new Error('Por ahora el diseño tiene que ser un SVG (vector). PNG/JPG todavía no: convertí el logo a SVG con tu programa de diseño.');
      const d = svgToShapes(await file.text());
      setDesign({ ...d, name: file.name });
    } catch (e) { setDesign(null); setDesignState({ ok: false, error: e.message }); }
  };

  // El chop va al worker cada vez que cambia la orientación, la escala o el eje.
  useEffect(() => {
    if (!chopPos) return undefined;
    let alive = true;
    const t = setTimeout(async () => {
      const { vert, tri } = weld(chopPos);
      try { const r = await call({ type: 'chop', vert, tri }, [vert.buffer, tri.buffer]); if (alive) { setHandle(r.handle || []); setChopState({ ok: true, error: '' }); } }
      catch (e) { if (alive) setChopState({ ok: false, error: e.message }); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [chopPos, call]);
  useEffect(() => {
    if (!design) return;
    call({ type: 'design', shapes: design.shapes, w0: design.w0, h0: design.h0 })
      .then(() => setDesignState({ ok: true, error: '' }), (e) => setDesignState({ ok: false, error: e.message }));
  }, [design, call]);
  useEffect(() => {
    if (chopState.ok && axis) setWizardStep((s) => s === 1 ? 2 : s);
  }, [chopState.ok, axis]);

  const layout = useMemo(() => (axis && design ? computeLayout(p, axis, design.h0 / design.w0, handle) : null), [p, axis, design, handle]);
  const ready = chopState.ok && designState.ok && axis && layout;
  const forbidden = useMemo(() => [...handle, ...(p.exclude ? [{ center: p.exclCenter, width: p.exclWidth }] : [])], [handle, p.exclude, p.exclCenter, p.exclWidth]);

  // Vista previa liviana (relieves curvados, sin la unión).
  const update = useCallback(async () => {
    if (!ready) return;
    setBusy(true); setError('');
    try { const r = await call({ type: 'preview', p, axis }); setPreview(r.reliefs); setPreviewChop(r.mesh || null); setItems(r.layout?.items || []); }
    catch (e) { setError(e.message); setPreview(null); setPreviewChop(null); setItems([]); }
    finally { setBusy(false); }
  }, [ready, call, p, axis]);
  useEffect(() => { const t = setTimeout(update, 450); return () => clearTimeout(t); }, [update]);

  // STL final: unión booleana real + verificación.
  const exportSTL = async () => {
    setError(''); setCheck(null); setExp({ done: 0, total: layout.items.length });
    try {
      const r = await call({ type: 'export', p, axis }, [], (done, total) => setExp({ done, total }));
      setCheck(r.check);
      if (r.check.status !== 'NoError') throw new Error('La operación no dio un sólido válido (' + r.check.status + '). Probá con otra profundidad o revisá el modelo.');
      download(toBinarySTL([r.mesh]), `${chopName || 'chop'}-personalizado.stl`);
    } catch (e) { setError(e.message); }
    finally { setExp(null); }
  };

  // Teclas como en OrcaSlicer: M mover · R rotar · S escalar · Esc soltar
  useEffect(() => {
    const onKey = (e) => {
      if (/input|textarea|select/i.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'm') setTmode('translate'); else if (k === 'r') setTmode('rotate'); else if (k === 's') setTmode('scale');
      else if (k === 'escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onPick = (hit) => {
    if (!hit) { setSel(null); return; }
    if (hit.target === 'chop') setSel({ target: 'chop' });
    else setSel(hit.shift && hit.key ? { target: 'designs', key: hit.key } : { target: 'designs', key: null });
  };

  const onTransform = ({ mode, selection, start, end, frame }) => {
    if (!selection) return;
    if (selection.target === 'chop') {
      if (mode === 'translate') {
        const d = end.pos.clone().sub(start.pos);
        setTf((t) => ({ ...t, cx: +(t.cx - d.x).toFixed(2), cy: +(t.cy - d.y).toFixed(2) }));
      } else if (mode === 'rotate') {
        const dq = end.quat.clone().multiply(start.quat.clone().invert());
        const q0 = tf.q ? new THREE.Quaternion(...tf.q) : new THREE.Quaternion();
        const q = dq.multiply(q0);
        detect(raw, { ...tf, q: [q.x, q.y, q.z, q.w] });          // girado: se vuelven a medir eje y radios
      } else {
        const k = Math.max(end.scale.x / start.scale.x, end.scale.y / start.scale.y, end.scale.z / start.scale.z, 0.05);
        const k2 = Math.min(end.scale.x / start.scale.x, end.scale.y / start.scale.y, end.scale.z / start.scale.z);
        const f = Math.abs(Math.log(k)) >= Math.abs(Math.log(k2)) ? k : k2;
        detect(raw, { ...tf, scale: clamp(tf.scale * f, 0.01, 25.4) });
      }
      return;
    }
    // Diseños (todos juntos, o uno solo con Shift)
    const key = selection.key;
    const edit = (fn) => setP((x) => {
      if (!key) return fn(x, null);
      const ov = { da: 0, dh: 0, dr: 0, spin: 0, s: 1, ...(x.overrides[key] || {}) };
      return { ...x, overrides: { ...x.overrides, [key]: fn(x, ov) } };
    });
    if (mode === 'translate') {
      const d = end.pos.clone().sub(start.pos);
      const du = d.dot(frame.tangent), dv = d.dot(frame.up), dw = d.dot(frame.radial);
      const da = (du / Math.max(1, frame.r)) * (180 / Math.PI);
      edit((x, ov) => (ov ? { ...ov, da: ov.da + da, dh: ov.dh + dv, dr: ov.dr + dw }
        : { ...x, startAngle: +wrap360(x.startAngle + da).toFixed(1), startH: +Math.max(0, x.startH + dv).toFixed(1), radial: +clamp(x.radial + dw, -10, 10).toFixed(2) }));
    } else if (mode === 'rotate') {
      const dq = start.quat.clone().invert().multiply(end.quat);
      const deg = 2 * Math.atan2(dq.z, dq.w) * (180 / Math.PI);
      edit((x, ov) => (ov ? { ...ov, spin: ov.spin + deg } : { ...x, spin: +(((x.spin + deg + 180) % 360 + 360) % 360 - 180).toFixed(1) }));
    } else {
      const k = Math.max(end.scale.x / start.scale.x, end.scale.y / start.scale.y, 0.05);
      edit((x, ov) => (ov ? { ...ov, s: clamp(ov.s * k, 0.2, 4) } : { ...x, width: +clamp(x.width * k, 3, 150).toFixed(1) }));
    }
  };
  // Solo en `npm run dev`: acceso para las pruebas automáticas (Vite lo saca del build).
  if (import.meta.env.DEV) window.__chop = { setSel, onTransform, p, tf, items, THREE, handle, axis, layout };
  const loose = Object.keys(p.overrides || {}).length;
  const selLabel = !sel ? 'Nada (tocá el chop o un diseño)'
    : sel.target === 'chop' ? 'El chop'
      : sel.key ? `Solo el diseño de la fila ${+sel.key.split('-')[0] + 1}, columna ${+sel.key.split('-')[1] + 1}` : 'Todos los diseños juntos';

  // Armado automático: llena la zona decorable, centrado (al cargar o con el botón).
  const autoFit = useCallback((ax = axis, d = design) => {
    if (!ax || !d) return;
    const r = Math.min(ax.r0, ax.r1), zone = Math.max(5, ax.z1 - ax.z0), aspect = d.h0 / d.w0;
    setP((x) => {
      const cols = x.cols || 6, gap = 6;
      // Ancho: ~55 % del espacio de cada columna, pero que entren al menos 2 filas.
      let width = Math.min((2 * Math.PI * r / cols) * 0.55, (zone - gap) / 2 / aspect);
      width = +clamp(width, 6, 120).toFixed(1);
      const H = width * aspect;
      const rows = clamp(Math.floor((zone + gap) / (H + gap)), 1, 6);
      const used = rows * H + (rows - 1) * gap;
      return { ...x, width, rows, gapV: gap, startH: +Math.max(0, (zone - used) / 2).toFixed(1), startAngle: 0, spin: 0, radial: 0, overrides: {} };
    });
  }, [axis, design]);
  const fitted = useRef('');
  useEffect(() => {
    const k = chopName + '|' + (design?.name || '');
    if (axis && design && fitted.current !== k) { fitted.current = k; autoFit(axis, design); }
  }, [axis, design, chopName, autoFit]);

  // Mover con flechitas (y + / −): lo seleccionado, o todo el patrón si no hay nada elegido.
  const nudge = useCallback((da, dh, ds = 1) => {
    const key = sel?.target === 'designs' ? sel.key : null;
    setP((x) => {
      if (!key) return { ...x, startAngle: +wrap360(x.startAngle + da).toFixed(1), startH: +Math.max(0, x.startH + dh).toFixed(1), width: +clamp(x.width * ds, 3, 150).toFixed(1) };
      const ov = { da: 0, dh: 0, dr: 0, spin: 0, s: 1, ...(x.overrides[key] || {}) };
      return { ...x, overrides: { ...x.overrides, [key]: { ...ov, da: ov.da + da, dh: ov.dh + dh, s: clamp(ov.s * ds, 0.2, 4) } } };
    });
  }, [sel]);
  useEffect(() => {
    const onKey = (e) => {
      if (/input|textarea|select/i.test(e.target.tagName) || sel?.target === 'chop') return;
      const big = e.shiftKey;
      const map = { ArrowLeft: [-(big ? 10 : 2), 0], ArrowRight: [big ? 10 : 2, 0], ArrowUp: [0, big ? 5 : 1], ArrowDown: [0, -(big ? 5 : 1)] };
      if (map[e.key]) { e.preventDefault(); nudge(map[e.key][0], map[e.key][1]); }
      else if (e.key === '+' || e.key === '=') nudge(0, 0, 1.05);
      else if (e.key === '-') nudge(0, 0, 1 / 1.05);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nudge, sel]);
  // Arrastre con el mouse sobre el chop
  const onDrag = ({ key, da, dh }) => {
    if (key) setSel({ target: 'designs', key }); else setSel({ target: 'designs', key: null });
    setP((x) => {
      if (!key) return { ...x, startAngle: +wrap360(x.startAngle + da).toFixed(1), startH: +Math.max(0, x.startH + dh).toFixed(1) };
      const ov = { da: 0, dh: 0, dr: 0, spin: 0, s: 1, ...(x.overrides[key] || {}) };
      return { ...x, overrides: { ...x.overrides, [key]: { ...ov, da: ov.da + da, dh: ov.dh + dh } } };
    });
  };

  // ---------- Deshacer / rehacer (Ctrl + Z · Ctrl + Y o Ctrl + Shift + Z) ----------
  // Guarda patrón, chop (orientación, escala, posición) y eje. Los cambios seguidos
  // (por ejemplo, mover un deslizador) se juntan en un solo paso.
  const hist = useRef({ stack: [], i: -1 });
  const [histPos, setHistPos] = useState({ i: -1, n: 0 });
  useEffect(() => {
    if (!axis) return undefined;
    const t = setTimeout(() => {
      const h = hist.current, snap = JSON.stringify({ p, tf, axis });
      if (h.stack[h.i] === snap) return;
      h.stack = h.stack.slice(0, h.i + 1).concat(snap).slice(-150);
      h.i = h.stack.length - 1;
      setHistPos({ i: h.i, n: h.stack.length });
    }, 350);
    return () => clearTimeout(t);
  }, [p, tf, axis]);
  const goHist = useCallback((dir) => {
    const h = hist.current, j = h.i + dir;
    if (j < 0 || j >= h.stack.length) return;
    h.i = j;
    const snap = JSON.parse(h.stack[j]);
    setP(snap.p); setTf(snap.tf); setAxis(snap.axis);
    setHistPos({ i: h.i, n: h.stack.length });
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); goHist(-1); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); goHist(1); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [goHist]);

  const total = layout ? layout.items.length : 0;
  const setAx = (k) => (v) => setAxis((a) => ({ ...a, [k]: v }));
  const setGap = (v) => {
    const delta = v - surfaceGap;
    setSurfaceGap(v);
    setAxis((a) => a ? { ...a, r0: a.r0 + delta, r1: a.r1 + delta } : a);
  };
  const adjustSurface = ({ kind, value, delta, gap }) => {
    if (kind === 'radius') { setSurfaceGap(+gap.toFixed(2)); setAxis((a) => ({ ...a, r0: a.r0 + delta, r1: a.r1 + delta })); }
    else setAxis((a) => ({ ...a, [kind]: value }));
  };
  const H = dims ? dims.z : 300;
  const canOpenStep = (n) => n === 1 || (n === 2 && chopState.ok) || (n === 3 && designState.ok) || (n === 4 && ready && total > 0);
  const nextDisabled = wizardStep === 1 ? !chopState.ok : wizardStep === 2 ? !designState.ok : wizardStep === 3 ? !ready || !total : false;
  const nextLabel = wizardStep === 1 ? 'Continuar con el diseño' : wizardStep === 2 ? 'Continuar con el patrón' : 'Revisar y descargar';

  return (
    <div className="kc chop">
      <header className="kc-head">
        <div className="kc-head-title">
          <div className="section-label">HERRAMIENTAS · BATBOX</div>
          <h1>Personalizador de chops 3D</h1>
          <TrialChip />
        </div>
        <p>Tu escudo o logo repetido en filas y columnas sobre la pared del chop, en relieve o grabado, listo para imprimir.</p>
      </header>

      <nav className="chop-wizard" aria-label="Etapas del personalizador">
        {STEPS.map((step) => (
          <button key={step.n} type="button" disabled={!canOpenStep(step.n)}
            className={(wizardStep === step.n ? 'current' : '') + (wizardStep > step.n ? ' done' : '')}
            onClick={() => setWizardStep(step.n)} aria-current={wizardStep === step.n ? 'step' : undefined}>
            <span>{wizardStep > step.n ? '✓' : step.n}</span>
            <b>{step.label}</b>
          </button>
        ))}
      </nav>

      <div className="kc-layout">
        {/* ---------- Ajustes ---------- */}
        <aside className="card kc-panel">
          <div className="chop-step-head">
            <span>Paso {wizardStep} de 4</span>
            <h3>{STEPS[wizardStep - 1].label}</h3>
            <p>{STEPS[wizardStep - 1].help}</p>
          </div>

          {wizardStep === 1 && <>
            <Sec title="Cargar chop" icon="🍺">
              <input ref={chopInput} type="file" accept=".stl,.3mf" hidden onChange={(e) => { loadChop(e.target.files?.[0]); e.target.value = ''; }} />
              <button type="button" className="btn primary chop-load" onClick={() => chopInput.current?.click()}><Icon name="box" size={16} /> {raw ? 'Cambiar chop' : 'Cargar chop'}</button>
              <small className="kc-muted">STL o 3MF, en milímetros. Cilíndrico o cónico (puede tener asa).</small>
              {chopState.error && <div className="kc-warn-inline">{chopState.error}</div>}
              {dims && <>
                <div className="kc-hint">📏 <b>{chopName}</b>: {dims.x.toFixed(1)} × {dims.y.toFixed(1)} × <b>{dims.z.toFixed(1)}</b> mm (alto)</div>
                <Num label="Escala" value={+(tf.scale * 100).toFixed(1)} onChange={(v) => setTf((t) => ({ ...t, scale: v / 100 }))} min={1} max={2540} step={0.1} unit="%"
                  hint="Si el alto no es el real, corregilo acá: 1000 % = cm a mm · 2540 % = pulgadas a mm." />
                <Seg label="Hacia arriba" value={tf.up} onChange={(v) => { const t = { ...tf, up: v }; detect(raw, t); }}
                  options={[{ value: 'z', label: 'Z' }, { value: 'y', label: 'Y' }, { value: 'x', label: 'X' }]} />
                <button type="button" className="kc-font-change" onClick={() => detect(raw, { ...tf, flip: !tf.flip })}>↕ Dar vuelta</button>
              </>}
            </Sec>
            {axis && <Sec title="Pared decorable" icon="🎯">
              <div className="kc-hint">La superficie celeste se detecta sobre el cuerpo principal del chop, buscando el tramo continuo entre los aros. Si tu modelo es especial, podés ajustar estos valores.</div>
              <div className="chop-stack">
                <Num label="Eje X" value={tf.cx} onChange={(v) => setTf((t) => ({ ...t, cx: v }))} min={-500} max={500} step={0.1} />
                <Num label="Eje Y" value={tf.cy} onChange={(v) => setTf((t) => ({ ...t, cy: v }))} min={-500} max={500} step={0.1} />
              </div>
              <div className="chop-stack">
                <Num label="Zona desde" value={axis.z0} onChange={setAx('z0')} min={0} max={H} step={0.5} />
                <Num label="Zona hasta" value={axis.z1} onChange={setAx('z1')} min={0} max={H} step={0.5} />
              </div>
              <div className="chop-stack">
                <Num label="Radio abajo" value={axis.r0} onChange={setAx('r0')} min={5} max={300} step={0.05} />
                <Num label="Radio arriba" value={axis.r1} onChange={setAx('r1')} min={5} max={300} step={0.05} />
              </div>
              <Num label="Separación malla / pared" value={surfaceGap} onChange={setGap} min={-10} max={10} step={0.1}
                hint="Negativo mete la malla hacia la pared; positivo la separa." />
              <div className="kc-note">En el visor: arrastrá los tiradores <b>Arriba</b>, <b>Abajo</b> y <b>Radio</b> para estirar la zona y ajustar su distancia a la pared.</div>
              <button type="button" className="kc-font-change" onClick={() => detect(raw, tf)}>🎯 Detectar nuevamente</button>
              {axis.z1 - axis.z0 < 5 && <div className="kc-warn-inline">La zona decorable es demasiado chica.</div>}
            </Sec>}
          </>}

          {wizardStep === 2 && <Sec title="Diseño y acabado" icon="🛡️">
            <input ref={designInput} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { loadDesign(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" className="btn primary chop-load" onClick={() => designInput.current?.click()}><Icon name="star" size={16} /> {design ? 'Cambiar diseño' : 'Cargar diseño'}</button>
            <small className="kc-muted">SVG con formas rellenas. Convertí textos y trazos a contornos.</small>
            {designState.error && <div className="kc-warn-inline">{designState.error}</div>}
            {design && <>
              <div className="kc-hint">🛡️ <b>{design.name}</b> · {layout ? layout.W.toFixed(1) : p.width.toFixed(1)} × {layout ? layout.H.toFixed(1) : (p.width * design.h0 / design.w0).toFixed(1)} mm</div>
              {layout?.fitScale < 0.999 && <div className="kc-note">🛡️ <b>Ajuste automático de seguridad:</b> pediste {p.width.toFixed(1)} mm, pero se usan {layout.W.toFixed(1)} mm para dejar 1 mm libre arriba y abajo. Así los escudos no cortan los aros del chop. Para hacerlos más grandes, reducí las filas o la separación vertical en el paso 3.</div>}
              <Num label="Ancho del diseño" value={p.width} onChange={set('width')} min={3} max={150} step={0.5} hint="Se ajusta automáticamente si las filas no entran entre los aros." />
              <Num label="Giro del diseño" value={p.spin} onChange={set('spin')} min={-180} max={180} step={1} unit="°" />
              <Seg label="Apoyar en" value={p.snap} onChange={set('snap')}
                options={[{ value: true, label: '🧲 La pared real' }, { value: false, label: 'La superficie celeste' }]} />
              <Num label="Acercar (−) / alejar (+)" value={p.radial} onChange={set('radial')} min={-10} max={10} step={0.1} />
              <Seg label="Tipo" value={p.mode} onChange={set('mode')}
                options={[{ value: 'relief', label: '⬆ Relieve' }, { value: 'engrave', label: '⬇ Grabado' }]} />
              {p.mode === 'relief' ? <div className="chop-stack">
                <Num label="Espesor del relieve" value={p.relief} onChange={set('relief')} min={0.2} max={6} step={0.1} />
                <Num label="Profundidad en el chop" value={p.depth} onChange={set('depth')} min={0.2} max={3} step={0.1} />
              </div> : <Num label="Profundidad del grabado" value={p.engrave} onChange={set('engrave')} min={0.2} max={5} step={0.1}
                hint="Recomendado: 0,5 mm para un grabado visible sin acercarse demasiado a atravesar la pared." />}
            </>}
          </Sec>}

          {wizardStep === 3 && <>
            <Sec title="Distribución" icon="🔁">
              <div className="kc-hint">🛡️ <b>Margen de seguridad:</b> el patrón deja 1 mm libre junto al aro superior y 1 mm junto al inferior. Si intentás agrandarlo o moverlo fuera de esa zona, se ajusta automáticamente para no cortar el chop.</div>
              <div className="chop-stack">
                <Num label="Filas" value={p.rows} onChange={set('rows')} min={1} max={LIMITS.rows} step={1} unit="" />
                <Num label="Columnas" value={p.cols} onChange={set('cols')} min={1} max={LIMITS.cols} step={1} unit="" />
              </div>
              <div className="chop-stack">
                <Num label="Separación vertical" value={p.gapV} onChange={set('gapV')} min={0} max={80} step={0.5} />
                <Num label="Altura inicial" value={p.startH} onChange={set('startH')} min={0} max={H} step={0.5} />
              </div>
              <div className="chop-stack">
                <Num label="Giro inicial" value={p.startAngle} onChange={set('startAngle')} min={0} max={359} step={1} unit="°" />
                <Num label="Cobertura" value={p.coverage} onChange={set('coverage')} min={10} max={360} step={1} unit="°" />
              </div>
              {layout && <small className="kc-muted">Total: <b>{total}</b> · separación horizontal: <b>{layout.step.toFixed(1)}°</b>.</small>}
              {layout?.fitScale < 0.999 && <div className="kc-note">El patrón fue reducido al <b>{Math.round(layout.fitScale * 100)} %</b> para que entren las {p.rows} filas. Ancho real de cada diseño: <b>{layout.W.toFixed(1)} mm</b>.</div>}
              <Seg label="Filas" value={p.stagger} onChange={set('stagger')} options={[{ value: false, label: 'Alineadas' }, { value: true, label: 'Alternadas' }]} />
            </Sec>
            <Sec title="Zona del asa" icon="☕">
              {handle.length
                ? <div className="kc-tip">🛡️ Manija detectada (zona roja): los diseños <b>nunca</b> se ponen ahí, ni aunque los arrastres, porque romperían el chop.</div>
                : <div className="kc-note">No se detectó manija en este modelo. Si tiene una, marcala abajo a mano.</div>}
              <Seg label="Excluir otra zona a mano" value={p.exclude} onChange={set('exclude')} options={[{ value: false, label: 'No' }, { value: true, label: 'Sí, excluir' }]} />
              {p.exclude && <div className="chop-stack">
                <Num label="Centro del asa" value={p.exclCenter} onChange={set('exclCenter')} min={0} max={359} step={1} unit="°" />
                <Num label="Ancho a excluir" value={p.exclWidth} onChange={set('exclWidth')} min={5} max={300} step={1} unit="°" />
              </div>}
            </Sec>
            <button type="button" className="btn text kc-reset" onClick={() => setP(DEF)}>Volver a valores iniciales</button>
          </>}

          {wizardStep === 4 && <div className="chop-review-summary">
            <div><span>Chop</span><b>{chopName}</b><button type="button" onClick={() => setWizardStep(1)}>Editar</button></div>
            <div><span>Diseño</span><b>{design?.name}</b><button type="button" onClick={() => setWizardStep(2)}>Editar</button></div>
            <div><span>Patrón</span><b>{total} repeticiones</b><button type="button" onClick={() => setWizardStep(3)}>Editar</button></div>
            <div className="chop-safety-row"><span>Seguridad</span><b>1 mm arriba y abajo{layout?.fitScale < 0.999 ? ` · ajustado al ${Math.round(layout.fitScale * 100)} %` : ''}</b></div>
          </div>}

          <div className="chop-wizard-actions">
            {wizardStep > 1 && <button type="button" className="btn ghost" onClick={() => setWizardStep((s) => s - 1)}>← Atrás</button>}
            {wizardStep < 4 && <button type="button" className="btn primary" disabled={nextDisabled} onClick={() => setWizardStep((s) => Math.min(4, s + 1))}>{nextLabel} →</button>}
          </div>
        </aside>

        {/* ---------- Visor ---------- */}
        <section className="card kc-stage">
          <div className="kc-stage-top">
            <div className="kc-plates">
              <button type="button" className={showRef ? 'on' : ''} onClick={() => setShowRef((v) => !v)} title="Mostrar u ocultar la superficie de referencia">Referencia</button>
              {axis && wizardStep <= 2 && <button type="button" className={axisEditing ? 'on' : ''}
                aria-pressed={axisEditing} onClick={() => {
                  if (!axisEditing) setShowRef(true);
                  setAxisEditing((v) => !v);
                }} title={axisEditing ? 'Fijar la zona y ocultar sus tiradores' : 'Volver a mostrar y editar los tiradores'}>
                {axisEditing ? 'Confirmar tiradores' : 'Volver a editar tiradores'}
              </button>}
              {p.mode === 'engrave' && design && <button type="button" className={showDepth ? 'on' : ''}
                aria-pressed={showDepth} onClick={() => setShowDepth((v) => !v)}
                title="Iluminar sutilmente el interior de los huecos grabados">Rayos X verde</button>}
            </div>
            <div className="kc-views">
              {[['iso', '3D'], ['front', 'Frente'], ['side', 'Costado'], ['top', 'Arriba']].map(([m, l]) => (
                <button key={m} type="button" className="mini-btn" onClick={() => setView({ mode: m, t: Date.now() })}>{l}</button>
              ))}
            </div>
          </div>
          {wizardStep >= 3 && ready && <><div className="chop-gizmo">
            <button type="button" className="mini-btn" title="Deshacer (Ctrl + Z)" disabled={histPos.i <= 0} onClick={() => goHist(-1)}>↶ Deshacer</button>
            <button type="button" className="mini-btn" title="Rehacer (Ctrl + Y)" disabled={histPos.i >= histPos.n - 1} onClick={() => goHist(1)}>↷ Rehacer</button>
            <div className="kc-seg" role="group" aria-label="Herramienta">
              {[['translate', 'Mover', 'M'], ['rotate', 'Rotar', 'R'], ['scale', 'Escalar', 'S']].map(([m, l, k]) => (
                <button key={m} type="button" className={tmode === m ? 'on' : ''} onClick={() => setTmode(m)} title={`${l} (tecla ${k})`}>{l} <small>{k}</small></button>
              ))}
            </div>
            <span className="cg-sel">Seleccionado: <b>{selLabel}</b></span>
            {sel && <button type="button" className="mini-btn" onClick={() => setSel(null)}>Soltar</button>}
            {loose > 0 && <button type="button" className="mini-btn" onClick={() => setP((x) => ({ ...x, overrides: {} }))}>Juntar de nuevo ({loose} {loose === 1 ? 'suelto' : 'sueltos'})</button>}
          </div>
          <div className="chop-pad">
            <span className="cg-sel">Acomodar:</span>
            <button type="button" className="mini-btn" title="Girar a la izquierda (←)" onClick={() => nudge(-2, 0)}>◀</button>
            <button type="button" className="mini-btn" title="Girar a la derecha (→)" onClick={() => nudge(2, 0)}>▶</button>
            <button type="button" className="mini-btn" title="Subir (↑)" onClick={() => nudge(0, 1)}>▲</button>
            <button type="button" className="mini-btn" title="Bajar (↓)" onClick={() => nudge(0, -1)}>▼</button>
            <button type="button" className="mini-btn" title="Achicar (−)" onClick={() => nudge(0, 0, 1 / 1.05)}>−</button>
            <button type="button" className="mini-btn" title="Agrandar (+)" onClick={() => nudge(0, 0, 1.05)}>+</button>
            <button type="button" className="mini-btn" onClick={() => autoFit()} disabled={!axis || !design}>✨ Acomodar automático</button>
          </div>
          <small className="kc-muted cg-hint"><b>Visor:</b> izquierda orbita · derecha o ruedita apretada desplazan · rueda gira para zoom. <b>Arrastrá un diseño</b> sobre el chop para mover todo el patrón (Shift + arrastrar: solo ese). Clic en el chop o en un diseño para usar el gizmo (M · R · S).</small></>}
          <div className="kc-canvas">
            <ChopViewer items={items} selection={sel} mode={tmode} onPick={onPick} onTransform={onTransform} onDrag={onDrag} onAxisChange={adjustSurface} axisEditable={showRef && axisEditing && wizardStep <= 2} fitKey={chopName && raw ? chopName + raw.length : ''} chopPos={chopPos} resultMesh={previewChop} reliefs={preview} axis={axis} surfaceGap={surfaceGap} showRef={showRef} showDepth={p.mode === 'engrave' && showDepth}
              exclusion={forbidden}
              colors={{ chop: '#8E9089', relief: p.mode === 'engrave' ? '#3B2A4A' : '#F78EB6' }} view={view} />
            {busy && !preview && <div className="kc-busy">Armando vista previa…</div>}
            {!raw && <div className="kc-warn soft">Cargá un chop (STL o 3MF) para empezar.</div>}
            {raw && !design && <div className="kc-warn soft">Ahora cargá tu diseño (SVG).</div>}
          </div>
          <div className="kc-info">
            {layout && <span>Total: <b>{total}</b> {total === 1 ? 'repetición' : 'repeticiones'} · {p.mode === 'engrave' ? 'grabado' : 'relieve'}</span>}
            {layout && <span>Diseño <b>{layout.W.toFixed(1)} × {layout.H.toFixed(1)} mm</b></span>}
            {axis && <span>Pared <b>Ø {(axis.r0 * 2).toFixed(1)} → {(axis.r1 * 2).toFixed(1)} mm</b></span>}
          </div>
        </section>

        {/* ---------- Acciones ---------- */}
        <aside className="card kc-out">
          {wizardStep === 4 ? <>
          <h3>Resultado</h3>
          <button type="button" className="btn ghost kc-dl" disabled={!ready || busy} onClick={update}><Icon name="refresh" size={16} /> Actualizar patrón</button>
          <button type="button" className="btn primary kc-dl" disabled={!ready || !total || busy || !!exp} onClick={exportSTL}>
            <Icon name="box" size={16} /> {exp ? `${p.mode === 'engrave' ? 'Grabando' : 'Uniendo'} ${exp.done} de ${exp.total}…` : 'Descargar STL'}
          </button>
          <small className="kc-muted">{p.mode === 'engrave'
            ? 'Vista previa exacta: muestra el hueco ya restado de la pared, igual que en el STL final (puede tardar unos segundos en recalcular).'
            : 'La vista previa muestra los diseños sobre el chop. Al descargar se hace la unión real con el modelo (puede tardar unos segundos).'}</small>
          {layout?.warnings.filter((w) => p.mode !== 'engrave' || !w.includes('zona decorable')).map((w, i) => <div key={i} className="kc-note">⚠️ {w}</div>)}
          {error && <div className="kc-warn-inline">{error}</div>}
          {check && check.status === 'NoError' && (() => {
            const extraPieces = check.pieces > check.chopPieces;
            if (check.mode === 'engrave') return (
              <div className="kc-tip">
                ✅ <b>STL generado y descargado.</b> {check.pieces} {check.pieces === 1 ? 'pieza cerrada' : 'componentes cerrados'}. Revisalo en el slicer antes de imprimir.
              </div>
            );
            return (
              <div className={!extraPieces ? 'kc-tip' : 'kc-note'}>
                {!extraPieces
                  ? <>✅ <b>Sólido verificado:</b> {check.pieces === 1 ? 'una sola pieza cerrada' : `${check.pieces} componentes cerrados, igual que el STL original`}. Volumen {Math.round(check.volume / 1000)} cm³ (el chop solo: {Math.round(check.chopVolume / 1000)} cm³).</>
                  : <>⚠️ El STL salió en <b>{check.pieces} piezas</b> (el original tenía {check.chopPieces}): algún diseño no toca la pared. Subí la profundidad o corregí los radios.</>}
              </div>
            );
          })()}
          <div className="kc-tip"><b>Primera versión:</b> chops cilíndricos o cónicos y diseños SVG, en relieve o grabado. Revisá siempre el STL en tu slicer antes de imprimir.</div>
          </> : <>
            <div className="chop-next-card">
              <span>Paso actual</span>
              <h3>{wizardStep}. {STEPS[wizardStep - 1].label}</h3>
              <p>{STEPS[wizardStep - 1].help}</p>
            </div>
            {wizardStep === 1 && !raw && <div className="kc-tip">Empezá cargando el archivo STL o 3MF del chop.</div>}
            {wizardStep === 1 && raw && <div className="kc-tip">El chop se detectó correctamente. Podés volver a este paso cuando necesites corregir escala, orientación o pared decorable.</div>}
            {wizardStep === 2 && !design && <div className="kc-tip">Cargá un SVG. Después aparecerán solamente las opciones del acabado.</div>}
            {wizardStep === 2 && design && <div className="kc-tip">Elegí tamaño, apoyo y tipo de acabado; luego continuá al patrón.</div>}
            {wizardStep === 3 && <div className="kc-tip">Ajustá la repetición mirando el visor. El sistema mantiene automáticamente el patrón entre los aros.</div>}
            <button type="button" className="btn primary kc-dl" disabled={nextDisabled}
              onClick={() => setWizardStep((s) => Math.min(4, s + 1))}>{nextLabel} →</button>
          </>}
        </aside>
      </div>
    </div>
  );
}
