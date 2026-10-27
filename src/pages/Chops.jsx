import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useAuth } from '../auth/AuthContext.jsx';
import { toBinarySTL } from '../lib/keychain/exporters.js';
import { computeLayout, LIMITS } from '../lib/chop/layout.js';
import { MAX_TRIS, bounds, guessAxis, orient, parse3MF, parseSTL, radiusAt, svgToShapes, weld } from '../lib/chop/files.js';
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

const DEF = { rows: 2, cols: 6, width: 25, gapV: 6, startH: 4, startAngle: 0, coverage: 360, stagger: false,
  exclude: false, exclCenter: 90, exclWidth: 70, depth: 0.6, relief: 1.2, mode: 'relief', engrave: 0.8, snap: true, radial: 0, spin: 0, overrides: {} };
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
  const [axis, setAxis] = useState(null);             // { z0, z1, r0, r1 }
  const [chopState, setChopState] = useState({ ok: false, error: '' });
  // Diseño
  const [design, setDesign] = useState(null);         // { shapes, w0, h0, name, points }
  const [designState, setDesignState] = useState({ ok: false, error: '' });
  // Patrón
  const [p, setP] = useState(DEF);
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }));
  const [preview, setPreview] = useState(null);       // malla de los relieves
  const [items, setItems] = useState([]);              // dónde quedó cada diseño (para el gizmo)
  const [sel, setSel] = useState(null);                // { target: 'chop' | 'designs', key? }
  const [tmode, setTmode] = useState('translate');     // translate · rotate · scale (como OrcaSlicer: M · R · S)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState(null);
  const [showRef, setShowRef] = useState(true);
  const [exp, setExp] = useState(null);               // { done, total } mientras exporta
  const [check, setCheck] = useState(null);

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
    const H = bounds(pos).maxZ;
    const z0 = Math.round(H * 0.12), z1 = Math.round(H * 0.88);
    setTf({ ...t, cx: +cx.toFixed(2), cy: +cy.toFixed(2) });
    setAxis({ z0, z1, r0: +radiusAt(pos, z0).toFixed(2), r1: +radiusAt(pos, z1).toFixed(2) });
  }, []);

  const loadChop = async (file) => {
    if (!file) return;
    setChopState({ ok: false, error: '' }); setPreview(null); setCheck(null);
    try {
      const buf = await file.arrayBuffer();
      const pos = /\.3mf$/i.test(file.name) ? parse3MF(buf) : parseSTL(buf);
      if (pos.length / 9 > MAX_TRIS) throw new Error(`El modelo tiene demasiados triángulos (${Math.round(pos.length / 9).toLocaleString('es-AR')}). Simplificalo a menos de ${MAX_TRIS.toLocaleString('es-AR')}.`);
      setRaw(pos); setChopName(file.name.replace(/\.(stl|3mf)$/i, ''));
      detect(pos, { up: 'z', flip: false, scale: 1, q: null });
      setP((x) => ({ ...x, overrides: {} })); setSel(null);
    } catch (e) { setRaw(null); setChopState({ ok: false, error: e.message }); }
  };
  const loadDesign = async (file) => {
    if (!file) return;
    setDesignState({ ok: false, error: '' }); setPreview(null); setCheck(null);
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
      try { await call({ type: 'chop', vert, tri }, [vert.buffer, tri.buffer]); if (alive) setChopState({ ok: true, error: '' }); }
      catch (e) { if (alive) setChopState({ ok: false, error: e.message }); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [chopPos, call]);
  useEffect(() => {
    if (!design) return;
    call({ type: 'design', shapes: design.shapes, w0: design.w0, h0: design.h0 })
      .then(() => setDesignState({ ok: true, error: '' }), (e) => setDesignState({ ok: false, error: e.message }));
  }, [design, call]);

  const layout = useMemo(() => (axis && design ? computeLayout(p, axis, design.h0 / design.w0) : null), [p, axis, design]);
  const ready = chopState.ok && designState.ok && axis && layout;

  // Vista previa liviana (relieves curvados, sin la unión).
  const update = useCallback(async () => {
    if (!ready) return;
    setBusy(true); setError('');
    try { const r = await call({ type: 'preview', p, axis }); setPreview(r.reliefs); setItems(r.layout?.items || []); }
    catch (e) { setError(e.message); setPreview(null); setItems([]); }
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
      // Grabado: si atravesó la pared aparecen agujeros (sube el genus) o pedazos sueltos.
      if (r.check.mode === 'engrave' && (r.check.genus > r.check.chopGenus || r.check.pieces > 1)) {
        throw new Error('El grabado atraviesa la pared del chop (queda agujereado). Bajá la profundidad del grabado y volvé a descargar. No se descargó nada.');
      }
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
  if (import.meta.env.DEV) window.__chop = { setSel, onTransform, p, tf, items, THREE };
  const loose = Object.keys(p.overrides || {}).length;
  const selLabel = !sel ? 'Nada (tocá el chop o un diseño)'
    : sel.target === 'chop' ? 'El chop'
      : sel.key ? `Solo el diseño de la fila ${+sel.key.split('-')[0] + 1}, columna ${+sel.key.split('-')[1] + 1}` : 'Todos los diseños juntos';

  const total = layout ? layout.items.length : 0;
  const setAx = (k) => (v) => setAxis((a) => ({ ...a, [k]: v }));
  const H = dims ? dims.z : 300;

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

      <div className="kc-layout">
        {/* ---------- Ajustes ---------- */}
        <aside className="card kc-panel">
          <Sec title="Chop" icon="🍺">
            <input ref={chopInput} type="file" accept=".stl,.3mf" hidden onChange={(e) => { loadChop(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" className="btn primary chop-load" onClick={() => chopInput.current?.click()}><Icon name="box" size={16} /> Cargar chop</button>
            <small className="kc-muted">STL o 3MF, en milímetros. Cilíndrico o cónico (puede tener asa).</small>
            {chopState.error && <div className="kc-warn-inline">{chopState.error}</div>}
            {dims && <>
              <div className="kc-hint">📏 <b>{chopName}</b>: {dims.x.toFixed(1)} × {dims.y.toFixed(1)} × <b>{dims.z.toFixed(1)}</b> mm (alto)</div>
              <Num label="Escala" value={+(tf.scale * 100).toFixed(1)} onChange={(v) => setTf((t) => ({ ...t, scale: v / 100 }))} min={1} max={2540} step={0.1} unit="%"
                hint="Si el alto no es el real (archivo en cm o pulgadas), corregilo acá: 1000 % = de cm a mm · 2540 % = de pulgadas a mm." />
              <Seg label="Hacia arriba" value={tf.up} onChange={(v) => { const t = { ...tf, up: v }; detect(raw, t); }}
                options={[{ value: 'z', label: 'Z' }, { value: 'y', label: 'Y' }, { value: 'x', label: 'X' }]} />
              <button type="button" className="kc-font-change" onClick={() => detect(raw, { ...tf, flip: !tf.flip })}>↕ Dar vuelta (si quedó con la boca abajo)</button>
            </>}
          </Sec>

          {axis && <Sec title="Eje y zona decorable" icon="🎯">
            <div className="kc-hint">La superficie celeste del visor tiene que coincidir con la pared del chop. El radio se mide sin el asa.</div>
            <div className="kc-two">
              <Num label="Eje X" value={tf.cx} onChange={(v) => setTf((t) => ({ ...t, cx: v }))} min={-500} max={500} step={0.1} />
              <Num label="Eje Y" value={tf.cy} onChange={(v) => setTf((t) => ({ ...t, cy: v }))} min={-500} max={500} step={0.1} />
            </div>
            <div className="kc-two">
              <Num label="Zona desde" value={axis.z0} onChange={setAx('z0')} min={0} max={H} step={0.5} />
              <Num label="Zona hasta" value={axis.z1} onChange={setAx('z1')} min={0} max={H} step={0.5} />
            </div>
            <div className="kc-two">
              <Num label="Radio abajo" value={axis.r0} onChange={setAx('r0')} min={5} max={300} step={0.05} />
              <Num label="Radio arriba" value={axis.r1} onChange={setAx('r1')} min={5} max={300} step={0.05} />
            </div>
            <button type="button" className="kc-font-change" onClick={() => detect(raw, tf)}>🎯 Detectar el centro por la base y los radios</button>
            {axis.z1 - axis.z0 < 5 && <div className="kc-warn-inline">La zona decorable es muy chica: "Zona hasta" tiene que ser mayor que "Zona desde".</div>}
          </Sec>}

          <Sec title="Diseño" icon="🛡️">
            <input ref={designInput} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { loadDesign(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" className="btn primary chop-load" onClick={() => designInput.current?.click()}><Icon name="star" size={16} /> Cargar diseño</button>
            <small className="kc-muted">SVG con formas rellenas (los huecos del logo se respetan). Texto y trazos: convertilos a contornos antes.</small>
            {designState.error && <div className="kc-warn-inline">{designState.error}</div>}
            {design && <div className="kc-hint">🛡️ <b>{design.name}</b> · {p.width.toFixed(1)} × {(p.width * design.h0 / design.w0).toFixed(1)} mm</div>}
            <Num label="Ancho del diseño" value={p.width} onChange={set('width')} min={3} max={150} step={0.5} hint="El alto se ajusta solo (mantiene las proporciones)." />
            <Num label="Giro del diseño" value={p.spin} onChange={set('spin')} min={-180} max={180} step={1} unit="°" />
            <Seg label="Apoyar en" value={p.snap} onChange={set('snap')}
              options={[{ value: true, label: '🧲 La pared real' }, { value: false, label: 'La superficie celeste' }]} />
            <small className="kc-muted">{p.snap
              ? 'Cada diseño se mide contra el modelo y se pega donde está la pared de verdad, aunque el chop no sea un cono perfecto.'
              : 'Los diseños siguen la superficie celeste (eje y radios de arriba). Si quedan separados, volvé a "La pared real".'}</small>
            <Num label="Acercar (−) / alejar (+) de la pared" value={p.radial} onChange={set('radial')} min={-10} max={10} step={0.1}
              hint="Ajuste fino: negativo los mete más en la pared, positivo los aleja." />
            <Seg label="Tipo" value={p.mode} onChange={set('mode')}
              options={[{ value: 'relief', label: '⬆ Relieve (hacia afuera)' }, { value: 'engrave', label: '⬇ Grabado (hacia adentro)' }]} />
            {p.mode === 'relief' ? (
              <div className="kc-two">
                <Num label="Espesor del relieve" value={p.relief} onChange={set('relief')} min={0.2} max={6} step={0.1} hint="Cuánto sobresale." />
                <Num label="Profundidad en el chop" value={p.depth} onChange={set('depth')} min={0.2} max={3} step={0.1} hint="Cuánto entra en la pared (para que quede bien pegado)." />
              </div>
            ) : (
              <Num label="Profundidad del grabado" value={p.engrave} onChange={set('engrave')} min={0.2} max={5} step={0.1}
                hint="Cuánto se hunde en la pared. Tiene que ser menor que el espesor de la pared del chop (si la atraviesa, te avisamos al descargar)." />
            )}
          </Sec>

          <Sec title="Patrón" icon="🔁">
            <div className="kc-two">
              <Num label="Filas" value={p.rows} onChange={set('rows')} min={1} max={LIMITS.rows} step={1} unit="" />
              <Num label="Columnas" value={p.cols} onChange={set('cols')} min={1} max={LIMITS.cols} step={1} unit="" />
            </div>
            <div className="kc-two">
              <Num label="Separación vertical" value={p.gapV} onChange={set('gapV')} min={0} max={80} step={0.5} />
              <Num label="Altura inicial" value={p.startH} onChange={set('startH')} min={0} max={H} step={0.5} hint="Desde abajo de la zona." />
            </div>
            <div className="kc-two">
              <Num label="Giro inicial" value={p.startAngle} onChange={set('startAngle')} min={0} max={359} step={1} unit="°" />
              <Num label="Cobertura" value={p.coverage} onChange={set('coverage')} min={10} max={360} step={1} unit="°" />
            </div>
            {layout && <small className="kc-muted">Separación horizontal: <b>{layout.step.toFixed(1)}°</b> entre centros (sale de la cobertura ÷ columnas).</small>}
            <Seg label="Filas" value={p.stagger} onChange={set('stagger')} options={[{ value: false, label: 'Alineadas' }, { value: true, label: 'Alternadas' }]} />
          </Sec>

          <Sec title="Zona del asa" icon="☕">
            <Seg label="No poner diseños sobre el asa" value={p.exclude} onChange={set('exclude')} options={[{ value: false, label: 'No' }, { value: true, label: 'Sí, excluir' }]} />
            {p.exclude && <div className="kc-two">
              <Num label="Centro del asa" value={p.exclCenter} onChange={set('exclCenter')} min={0} max={359} step={1} unit="°" />
              <Num label="Ancho a excluir" value={p.exclWidth} onChange={set('exclWidth')} min={5} max={300} step={1} unit="°" />
            </div>}
            {p.exclude && <small className="kc-muted">La cuña roja del visor marca la zona excluida. 0° = eje X (rojo del gizmo); los ángulos suben en sentido antihorario visto desde arriba.</small>}
          </Sec>
          <button type="button" className="btn text kc-reset" onClick={() => setP(DEF)}>Volver a los valores de fábrica</button>
        </aside>

        {/* ---------- Visor ---------- */}
        <section className="card kc-stage">
          <div className="kc-stage-top">
            <div className="kc-plates">
              <button type="button" className={showRef ? 'on' : ''} onClick={() => setShowRef((v) => !v)} title="Mostrar u ocultar la superficie de referencia">Referencia</button>
            </div>
            <div className="kc-views">
              {[['iso', '3D'], ['front', 'Frente'], ['side', 'Costado'], ['top', 'Arriba']].map(([m, l]) => (
                <button key={m} type="button" className="mini-btn" onClick={() => setView({ mode: m, t: Date.now() })}>{l}</button>
              ))}
            </div>
          </div>
          <div className="chop-gizmo">
            <div className="kc-seg" role="group" aria-label="Herramienta">
              {[['translate', 'Mover', 'M'], ['rotate', 'Rotar', 'R'], ['scale', 'Escalar', 'S']].map(([m, l, k]) => (
                <button key={m} type="button" className={tmode === m ? 'on' : ''} onClick={() => setTmode(m)} title={`${l} (tecla ${k})`}>{l} <small>{k}</small></button>
              ))}
            </div>
            <span className="cg-sel">Seleccionado: <b>{selLabel}</b></span>
            {sel && <button type="button" className="mini-btn" onClick={() => setSel(null)}>Soltar</button>}
            {loose > 0 && <button type="button" className="mini-btn" onClick={() => setP((x) => ({ ...x, overrides: {} }))}>Juntar de nuevo ({loose} {loose === 1 ? 'suelto' : 'sueltos'})</button>}
          </div>
          <small className="kc-muted cg-hint">Clic en el chop o en un diseño para moverlo con el gizmo. <b>Shift + clic</b> en un diseño: lo separás de los demás.</small>
          <div className="kc-canvas">
            <ChopViewer items={items} selection={sel} mode={tmode} onPick={onPick} onTransform={onTransform} chopPos={chopPos} reliefs={preview} axis={axis} showRef={showRef}
              exclusion={p.exclude ? { center: p.exclCenter, width: p.exclWidth } : null}
              colors={{ chop: '#8E9089', relief: p.mode === 'engrave' ? '#3B2A4A' : '#F78EB6' }} view={view} />
            {busy && <div className="kc-busy">Armando vista previa…</div>}
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
          <h3>Resultado</h3>
          <button type="button" className="btn ghost kc-dl" disabled={!ready || busy} onClick={update}><Icon name="refresh" size={16} /> Actualizar patrón</button>
          <button type="button" className="btn primary kc-dl" disabled={!ready || !total || busy || !!exp} onClick={exportSTL}>
            <Icon name="box" size={16} /> {exp ? `${p.mode === 'engrave' ? 'Grabando' : 'Uniendo'} ${exp.done} de ${exp.total}…` : 'Descargar STL'}
          </button>
          <small className="kc-muted">{p.mode === 'engrave'
            ? 'Vista previa: en oscuro, las zonas que se van a grabar. Al descargar se restan de verdad de la pared (puede tardar unos segundos).'
            : 'La vista previa muestra los diseños sobre el chop. Al descargar se hace la unión real en una sola pieza (puede tardar unos segundos).'}</small>
          {layout?.warnings.map((w, i) => <div key={i} className="kc-note">⚠️ {w}</div>)}
          {error && <div className="kc-warn-inline">{error}</div>}
          {check && check.status === 'NoError' && (
            <div className={check.pieces === 1 ? 'kc-tip' : 'kc-note'}>
              {check.pieces === 1
                ? <>✅ <b>Sólido verificado:</b> una sola pieza cerrada{check.mode === 'engrave' ? ', sin perforar la pared' : ''}. Volumen {Math.round(check.volume / 1000)} cm³ (el chop solo: {Math.round(check.chopVolume / 1000)} cm³).</>
                : <>⚠️ El STL salió en <b>{check.pieces} piezas</b>: algún diseño no toca la pared. Subí la profundidad o corregí los radios para que la superficie celeste coincida con el chop.</>}
            </div>
          )}
          <div className="kc-tip"><b>Primera versión:</b> chops cilíndricos o cónicos y diseños SVG, en relieve o grabado. Revisá siempre el STL en tu slicer antes de imprimir.</div>
        </aside>
      </div>
    </div>
  );
}
