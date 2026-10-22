import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { DEFAULTS } from '../lib/keychain/engine.js';
import { BEDS, arrange, build3MF, fileSafe, parseNames, placeOf, plateFileName, plateNames, toBinarySTL, zipFiles } from '../lib/keychain/exporters.js';
import { CATEGORIES, POPULAR, defaultWeight, fetchFont, loadFontList, showFontInPage } from '../lib/keychain/fonts.js';
import { norm } from '../lib/text.js';
import Icon from '../components/Icon.jsx';
import KeychainViewer from '../components/KeychainViewer.jsx';
import '../styles/keychains.css';

// =====================================================================
// CREADOR DE LLAVEROS. Muchos nombres con el mismo diseño, todas las
// fuentes de Google (o una propia), vista tipo slicer y descarga en 3MF
// (Bambu/Orca, cada llavero = 1 objeto con 2 piezas) o STL.
// Gratis: 1 nombre. Makers Club: todos los nombres juntos + fuente propia.
// =====================================================================

const FREE_NAMES = 1;
const SAMPLE = 'Sofi\nMateo\nValentina\nJuan Cruz\nEmma\nBenja';

// ---------- Worker (arma el 3D en segundo plano) ----------
function useBuilder() {
  const ref = useRef({ worker: null, builds: 0, fonts: new Map(), seq: 0, pending: new Map() });
  const spawn = useCallback(() => {
    const s = ref.current;
    s.worker?.terminate();
    s.worker = new Worker(new URL('../lib/keychain/worker.js', import.meta.url), { type: 'module' });
    s.builds = 0;
    s.worker.onmessage = (e) => {
      const m = e.data;
      const p = s.pending.get(m.id);
      if (m.type === 'progress') p?.onProgress?.(m.done, m.total);
      if (m.type === 'built' || m.type === 'merged') { s.pending.delete(m.id); p?.resolve(m); }
      if (m.type === 'font-error') s.onFontError?.(m.error);
    };
    // Una fuente cargada en el worker anterior se vuelve a mandar.
    for (const [key, buf] of s.fonts) s.worker.postMessage({ type: 'font', key, buffer: buf.slice(0) });
  }, []);
  useEffect(() => { spawn(); return () => ref.current.worker?.terminate(); }, [spawn]);
  const addFont = useCallback((key, buffer) => {
    const s = ref.current;
    if (s.fonts.has(key)) return;
    s.fonts.set(key, buffer.slice(0));
    s.worker.postMessage({ type: 'font', key, buffer: buffer.slice(0) });
  }, []);
  const build = useCallback((fontKey, names, params, onProgress) => {
    const s = ref.current;
    // manifold no libera toda la memoria intermedia: cada tanto se renueva el worker.
    if (++s.builds > 25) spawn();
    const id = ++s.seq;
    return new Promise((resolve) => {
      s.pending.set(id, { resolve, onProgress });
      s.worker.postMessage({ type: 'build', id, fontKey, names, params });
    });
  }, [spawn]);
  // Base + letras en una sola pieza (STL de un color).
  const merge = useCallback((items) => {
    const s = ref.current;
    const id = ++s.seq;
    return new Promise((resolve) => {
      s.pending.set(id, { resolve });
      s.worker.postMessage({ type: 'merge', id, items: items.map((it) => ({ base: it.base, letters: it.letters })) });
    });
  }, []);
  return { addFont, build, merge, ref };
}

function download(bytes, filename, type = 'application/octet-stream') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Controles ----------
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
        {options.map((o) => <button key={o.value} type="button" className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
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

// ---------- Selector de fuentes ----------
function FontPicker({ font, onPick, canUpload, onUpload }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [cat, setCat] = useState('popular');
  const [q, setQ] = useState('');
  const fileRef = useRef(null);
  useEffect(() => { loadFontList().then(setList).catch((e) => setErr(e.message)); }, []);
  const shown = useMemo(() => {
    if (!list) return [];
    const words = norm(q.trim());
    let l = list;
    if (words) l = l.filter((f) => norm(f.family).includes(words));
    else if (cat === 'popular') {
      const by = new Map(list.map((f) => [f.id, f]));
      l = POPULAR.map(([id]) => by.get(id)).filter(Boolean);
    } else if (cat !== 'all') l = l.filter((f) => f.category === cat);
    return l.slice(0, 400);
  }, [list, cat, q]);
  const current = list?.find((f) => f.id === font.id);
  return (
    <div className="kc-fonts">
      <div className="kc-font-now">
        <span className="kc-font-sample" style={{ fontFamily: `"${font.family}", sans-serif` }}>{font.family}</span>
        {font.custom ? <span className="chip club">Tu fuente</span> : current && current.weights.length > 1 && (
          <select value={font.weight} onChange={(e) => onPick({ ...font, weight: Number(e.target.value) })} aria-label="Grosor de la fuente">
            {current.weights.map((w) => <option key={w} value={w}>{w === 400 ? 'Normal' : w >= 700 ? `Gruesa ${w}` : `Fina ${w}`}</option>)}
          </select>
        )}
      </div>
      <div className="pink-input kc-font-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar entre ${list ? list.length.toLocaleString('es-AR') : '+1.900'} fuentes…`} /></div>
      {!q && (
        <div className="kc-cats">
          {CATEGORIES.map((c) => <button key={c.id} type="button" className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}
        </div>
      )}
      <div className="kc-font-list" role="listbox" aria-label="Fuentes">
        {err ? <p className="kc-muted">{err}</p> : !list ? <p className="kc-muted">Cargando fuentes…</p> : !shown.length ? <p className="kc-muted">No hay fuentes con ese nombre.</p>
          : shown.map((f) => (
            <button key={f.id} type="button" role="option" aria-selected={f.id === font.id} className={f.id === font.id ? 'on' : ''}
              onClick={() => onPick({ id: f.id, family: f.family, weight: defaultWeight(f) })}>{f.family}</button>
          ))}
      </div>
      <button type="button" className={'kc-upload' + (canUpload ? '' : ' locked')} onClick={() => (canUpload ? fileRef.current?.click() : onUpload(null))}>
        {canUpload ? <><Icon name="sparkles" size={14} /> Subir mi fuente (TTF, OTF o WOFF)</> : <><Icon name="lock" size={14} /> Subir tu fuente: Makers Club</>}
      </button>
      <input ref={fileRef} type="file" accept=".ttf,.otf,.woff" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }} />
    </div>
  );
}

// =====================================================================
export default function Keychains() {
  const { isMember, notify: notifyNow, signIn, access } = useAuth();
  // Aviso estable (el de useAuth cambia con cada cambio de sesión y rearmaría todo).
  const notifyRef = useRef(notifyNow); notifyRef.current = notifyNow;
  const notify = useCallback((t, m) => notifyRef.current(t, m), []);
  const { addFont, build, merge, ref } = useBuilder();
  const [namesRaw, setNamesRaw] = useState('Anna');
  const [twoLines, setTwoLines] = useState(false);
  const [dedupe, setDedupe] = useState(true);
  const [font, setFont] = useState({ id: 'pacifico', family: 'Pacifico', weight: 400 });
  const [fontKey, setFontKey] = useState(null);
  const [p, setP] = useState({ ...DEFAULTS });
  const [colors, setColors] = useState({ base: '#FFFFFF', letters: '#F78EB6' });
  const [bedId, setBedId] = useState('a1');
  const [custom, setCustom] = useState({ w: 220, h: 220 });
  const [gap, setGap] = useState(4);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [plateSel, setPlateSel] = useState('all'); // 'all' = todas las camas · número = una cama
  const [view, setView] = useState(null);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (v) => setP((o) => ({ ...o, [k]: v }));

  // Nombres: lista, repetidos y límite gratis.
  const parsed = useMemo(() => parseNames(namesRaw), [namesRaw]);
  const unique = useMemo(() => {
    if (!dedupe) return parsed;
    const seen = new Set();
    return parsed.filter((n) => { const k = norm(n); if (seen.has(k)) return false; seen.add(k); return true; });
  }, [parsed, dedupe]);
  const dupCount = parsed.length - new Set(parsed.map(norm)).size;
  const names = useMemo(() => (isMember ? unique : unique.slice(0, FREE_NAMES)), [isMember, unique]);
  const locked = !isMember && unique.length > FREE_NAMES;
  const texts = useMemo(() => names.map((n) => (twoLines ? n.replace(' ', '\n') : n)), [names, twoLines]);

  // Fuente: descargar y pasarla al worker.
  useEffect(() => {
    if (font.custom) return;
    let alive = true;
    fetchFont(font.id, font.weight).then(({ key, buffer }) => {
      if (!alive) return;
      addFont(key, buffer); setFontKey(key);
      showFontInPage(font.family, buffer, key);
    }).catch((e) => notify('err', e.message));
    return () => { alive = false; };
  }, [font, addFont, notify]);
  useEffect(() => { ref.current.onFontError = (m) => notify('err', m); }, [ref, notify]);

  const onUpload = async (file) => {
    if (!isMember) { notify('err', 'Subir tu propia fuente es de Makers Club.'); return; }
    if (/\.woff2$/i.test(file.name)) { notify('err', 'WOFF2 no se puede leer: usá TTF, OTF o WOFF.'); return; }
    if (file.size > 15 * 1024 * 1024) { notify('err', 'La fuente es muy pesada (máx. 15 MB).'); return; }
    let buffer;
    try { buffer = await file.arrayBuffer(); } catch { notify('err', 'No se pudo leer ese archivo. Probá copiarlo a otra carpeta y subirlo de nuevo.'); return; }
    const key = 'custom:' + file.name + ':' + file.size;
    const family = file.name.replace(/\.[^.]+$/, '');
    addFont(key, buffer); setFontKey(key);
    setFont({ id: key, family, weight: 400, custom: true });
    showFontInPage(family, buffer, key);
  };

  // Armar (con una pausa corta para no rearmar con cada tecla).
  const params = useMemo(() => p, [p]);
  useEffect(() => {
    if (!fontKey || !texts.length) { setItems([]); setBusy(false); return undefined; }
    let alive = true;
    setBusy(true); // ya cambió algo: las descargas esperan hasta tener el armado nuevo
    const t = setTimeout(async () => {
      setProgress(texts.length > 3 ? { done: 0, total: texts.length } : null);
      const res = await build(fontKey, texts, params, (done, total) => alive && setProgress({ done, total }));
      if (!alive) return;
      setBusy(false); setProgress(null);
      if (res.error) { notify('err', res.error); return; }
      setItems(res.items);
      const bad = res.items.filter((i) => i.error);
      if (bad.length) notify('err', `No se pudo armar: ${bad.map((b) => b.name.replace('\n', ' ')).join(', ')} (¿la fuente tiene esas letras?)`);
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [fontKey, texts, params, build, notify]);

  const bed = useMemo(() => { const b = BEDS.find((x) => x.id === bedId) || BEDS[0]; return b.id === 'custom' ? { ...b, w: custom.w, h: custom.h } : b; }, [bedId, custom]);
  const good = useMemo(() => items.filter((i) => !i.error).map((i) => ({ ...i, name: i.name.replace('\n', ' '), w: i.size.x, h: i.size.y })), [items]);
  const plates = useMemo(() => arrange(good, bed, gap), [good, bed, gap]);
  const tooBig = plates[0]?.tooBig;
  useEffect(() => { if (plateSel !== 'all' && plateSel >= plates.length) setPlateSel('all'); }, [plates.length, plateSel]);
  const multi = plates.length > 1 && !tooBig;
  const show = multi ? plateSel : 0;                                   // qué se ve
  const onePlate = multi && plateSel !== 'all' ? plateSel : null;      // cama elegida (para bajar solo esa)
  const maxSize = good.reduce((a, i) => ({ x: Math.max(a.x, i.size.x), y: Math.max(a.y, i.size.y), z: Math.max(a.z, i.size.z) }), { x: 0, y: 0, z: 0 });

  // ---------- Descargas ----------
  const canExport = good.length > 0 && !tooBig && !busy && !exporting;
  // Los archivos llevan los nombres de los llaveros ("Llaveros - Lola, Pedro y 18 más").
  const base = good.length === 1 ? fileSafe(good[0].name) : `Llaveros - ${plateNames({ items: good }, 60)}`.replace(/ñ/g, 'n').replace(/Ñ/g, 'N');
  const dl3mf = (only = null) => {
    const sel = only == null ? plates : [plates[only]];
    download(build3MF(sel, bed, colors), only == null ? `${base}.3mf` : `${plateFileName(plates[only], only)}.3mf`, 'model/3mf');
  };
  // STL de cada cama: cada llavero como UNA pieza sólida (base y letras unidas).
  const dlPlates = async (only = null) => {
    setExporting(true);
    try {
      const stls = [];
      for (const pl of only == null ? plates : [plates[only]]) {
        const { items: merged } = await merge(pl.items);
        stls.push(toBinarySTL(pl.items.map((it, i) => ({ manifold: merged[i], place: placeOf(it) }))));
      }
      if (only != null) download(stls[0], `${plateFileName(plates[only], only)}.stl`, 'model/stl');
      else if (stls.length === 1) download(stls[0], `${base}.stl`, 'model/stl');
      else download(zipFiles(Object.fromEntries(stls.map((s, i) => [`${plateFileName(plates[i], i)}.stl`, s]))), `${base} (STL por cama).zip`, 'application/zip');
    } finally { setExporting(false); }
  };
  // ZIP: por cada nombre, el llavero entero + base y letras por separado (para 2 colores).
  const dlEach = async () => {
    setExporting(true);
    try {
      const { items: merged } = await merge(good);
      const files = {};
      const used = new Map();
      good.forEach((it, i) => {
        let n = fileSafe(it.name);
        const c = (used.get(n) || 0) + 1; used.set(n, c); if (c > 1) n += `_${c}`;
        const place = { ...placeOf(it), x: 0, y: 0, rot: false };
        files[`${n}/${n}.stl`] = toBinarySTL([{ manifold: merged[i], place }]);
        files[`${n}/${n} - base.stl`] = toBinarySTL([{ manifold: it.base, place }]);
        files[`${n}/${n} - letras.stl`] = toBinarySTL([{ manifold: it.letters, place }]);
      });
      download(zipFiles(files), `${base} (STL por nombre).zip`, 'application/zip');
    } finally { setExporting(false); }
  };

  const loadList = async (file) => {
    if (!file) return;
    if (file.size > 500 * 1024) { notify('err', 'El archivo es muy grande.'); return; }
    const txt = await file.text();
    setNamesRaw(txt.replace(/\t/g, ','));
  };

  return (
    <div className="kc">
      <header className="kc-head">
        <div>
          <div className="section-label">HERRAMIENTA · BATBOX</div>
          <h1>Creador de Llaveros</h1>
          <p>Pegá todos los nombres y armá el mismo llavero para cada uno, listo para tu impresora.</p>
        </div>
      </header>

      <div className="kc-layout">
        {/* ---------- Panel de ajustes ---------- */}
        <aside className="card kc-panel">
          <Sec title="Nombres" icon="📝">
            <div className="pink-input"><textarea rows={5} value={namesRaw} onChange={(e) => setNamesRaw(e.target.value)}
              placeholder={'Uno abajo del otro, o separados por comas:\nSofi, Mateo, Valentina'} aria-label="Nombres" /></div>
            <div className="kc-row">
              <span className="kc-count"><b>{unique.length}</b> {unique.length === 1 ? 'nombre' : 'nombres'}{dupCount > 0 && !dedupe ? ` · ${dupCount} repetidos` : ''}</span>
              <span className="kc-links">
                <button type="button" onClick={() => fileRef.current?.click()}>Subir lista (.txt / .csv)</button>
                {!namesRaw.trim() || namesRaw === 'Anna' ? <button type="button" onClick={() => setNamesRaw(SAMPLE)}>Probar con ejemplo</button>
                  : <button type="button" onClick={() => setNamesRaw('')}>Borrar</button>}
              </span>
              <input ref={fileRef} type="file" accept=".txt,.csv,text/plain,text/csv" hidden onChange={(e) => { loadList(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            <label className="kc-check"><input type="checkbox" checked={twoLines} onChange={(e) => setTwoLines(e.target.checked)} /> Nombre y apellido en 2 renglones</label>
            {dupCount > 0 && <label className="kc-check"><input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} /> Sacar repetidos ({dupCount})</label>}
            {locked && (
              <div className="kc-lock">
                <Icon name="crown" size={16} />
                <span>Gratis armás <b>1 nombre</b>. Con <b>Makers Club</b> armás los {unique.length} juntos en la cama.</span>
                {access === 'guest' ? <button type="button" className="chip-btn" onClick={() => signIn('/llaveros')}>Ingresar</button> : <a className="chip-btn" href="#/club">Ver Makers Club</a>}
              </div>
            )}
          </Sec>

          <Sec title="Fuente" icon="🔤">
            <FontPicker font={font} onPick={(f) => setFont(f)} canUpload={isMember} onUpload={(f) => (f ? onUpload(f) : notify('err', 'Subir tu propia fuente es de Makers Club.'))} />
          </Sec>

          <Sec title="Texto" icon="✍️">
            <Num label="Alto de las letras" value={p.letterHeight} onChange={set('letterHeight')} min={5} max={40} step={0.5} hint="Alto de las mayúsculas." />
            <Num label="Espacio entre letras" value={p.letterSpacing} onChange={set('letterSpacing')} min={-3} max={6} step={0.1} />
            {twoLines && <Num label="Espacio entre renglones" value={p.lineSpacing} onChange={set('lineSpacing')} min={0.6} max={2} step={0.05} unit="×" />}
            {twoLines && <Seg label="Alineación" value={p.align} onChange={set('align')} options={[{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Derecha' }]} />}
          </Sec>

          <Sec title="Forma" icon="🔷">
            <Seg value={p.shape} onChange={set('shape')} options={[{ value: 'follow', label: 'Sigue las letras' }, { value: 'tag', label: 'Etiqueta' }, { value: 'capsule', label: 'Cápsula' }]} />
            <Num label="Borde alrededor" value={p.border} onChange={set('border')} min={0.8} max={10} step={0.1} />
            {p.shape === 'tag' && <Num label="Redondeo de esquinas" value={p.cornerRadius} onChange={set('cornerRadius')} min={0} max={20} step={0.5} />}
          </Sec>

          <Sec title="Anilla" icon="🔗">
            <Seg value={p.ring} onChange={set('ring')} options={[{ value: 'left', label: 'Izquierda' }, { value: 'top', label: 'Arriba' }, { value: 'right', label: 'Derecha' }, { value: 'none', label: 'Sin anilla' }]} />
            {p.ring !== 'none' && <>
              <Num label="Diámetro de la anilla" value={p.ringDiameter} onChange={set('ringDiameter')} min={6} max={20} step={0.5} />
              <Num label="Agujero" value={p.holeDiameter} onChange={set('holeDiameter')} min={2} max={Math.max(2.5, p.ringDiameter - 1.5)} step={0.1} />
              <Num label="Correr la anilla" value={p.ringOffset} onChange={set('ringOffset')} min={-4} max={4} step={0.1} hint="+ hacia afuera · − hacia adentro" />
            </>}
          </Sec>

          <Sec title="Alturas" icon="📏">
            <Seg value={p.style} onChange={set('style')} options={[{ value: 'raised', label: 'Letras en relieve' }, { value: 'flush', label: 'Letras incrustadas' }]} />
            <Num label="Grosor de la base" value={p.plateThickness} onChange={set('plateThickness')} min={1} max={8} step={0.1} />
            <Num label={p.style === 'flush' ? 'Profundidad de las letras' : 'Alto de las letras'} value={p.letterDepth} onChange={set('letterDepth')} min={0.4} max={p.style === 'flush' ? Math.max(0.6, p.plateThickness - 0.4) : 6} step={0.1} />
          </Sec>

          <Sec title="Colores" icon="🎨">
            <div className="kc-colors">
              <label><input type="color" value={colors.base} onChange={(e) => setColors((c) => ({ ...c, base: e.target.value }))} /> Base</label>
              <label><input type="color" value={colors.letters} onChange={(e) => setColors((c) => ({ ...c, letters: e.target.value }))} /> Letras</label>
            </div>
            <small className="kc-muted">En el 3MF la base va con el filamento 1 y las letras con el 2 (con estos colores).</small>
          </Sec>

          <Sec title="Impresora" icon="🖨️">
            <select className="kc-select" value={bedId} onChange={(e) => setBedId(e.target.value)} aria-label="Impresora">
              {BEDS.map((b) => <option key={b.id} value={b.id}>{b.label}{b.id !== 'custom' ? ` · ${b.w}×${b.h}` : ''}</option>)}
            </select>
            {bedId === 'custom' && <div className="kc-two">
              <Num label="Ancho de cama" value={custom.w} onChange={(v) => setCustom((c) => ({ ...c, w: v }))} min={80} max={500} step={1} />
              <Num label="Fondo de cama" value={custom.h} onChange={(v) => setCustom((c) => ({ ...c, h: v }))} min={80} max={500} step={1} />
            </div>}
            <Num label="Separación entre llaveros" value={gap} onChange={setGap} min={1} max={20} step={0.5} />
            <div className="kc-note">
              <b>⚠️ Importante:</b> la impresora de acá es solo para acomodar los llaveros en una cama de ese tamaño.
              Cuando abras el archivo en el slicer, <b>cambiala por la impresora que tengas vos</b> (y tu boquilla y filamento):
              si no, puede dar errores de compatibilidad y no te deja laminar.
            </div>
          </Sec>

          <button type="button" className="btn text kc-reset" onClick={() => setP({ ...DEFAULTS })}>Volver a los valores de fábrica</button>
        </aside>

        {/* ---------- Vista tipo slicer ---------- */}
        <section className="card kc-stage">
          <div className="kc-stage-top">
            <div className="kc-plates" role="tablist" aria-label="Camas">
              {multi && (
                <button type="button" role="tab" aria-selected={plateSel === 'all'} className={plateSel === 'all' ? 'on' : ''} onClick={() => setPlateSel('all')}>
                  Todas <small>({plates.length})</small>
                </button>
              )}
              {plates.length > 0 && !tooBig && plates.map((pl, i) => (
                <button key={i} type="button" role="tab" aria-selected={show === i} className={show === i ? 'on' : ''} onClick={() => setPlateSel(i)}>
                  Cama {i + 1} <small>({pl.items.length})</small>
                </button>
              ))}
            </div>
            <div className="kc-views">
              <button type="button" className="mini-btn" title="Ver en 3D" onClick={() => setView({ mode: 'front', t: Date.now() })}>3D</button>
              <button type="button" className="mini-btn" title="Ver desde arriba" onClick={() => setView({ mode: 'top', t: Date.now() })}><Icon name="grid" size={14} /></button>
            </div>
          </div>
          <div className="kc-canvas">
            <KeychainViewer plates={tooBig ? [] : plates} show={show} bed={bed} colors={colors} view={view} />
            {(busy || progress) && <div className="kc-busy">{progress ? `Armando ${progress.done} de ${progress.total}…` : 'Armando…'}</div>}
            {tooBig && <div className="kc-warn">El llavero es más grande que la cama. Bajá el alto de las letras o elegí otra impresora.</div>}
            {!texts.length && <div className="kc-warn soft">Escribí al menos un nombre.</div>}
          </div>
          <div className="kc-info">
            {good.length > 0 && !tooBig && <>
              <span><b>{good.length}</b> {good.length === 1 ? 'llavero' : 'llaveros'} · <b>{plates.length}</b> {plates.length === 1 ? 'cama' : 'camas'}</span>
              <span>Tamaño {good.length > 1 ? 'máximo ' : ''}<b>{maxSize.x.toFixed(1)} × {maxSize.y.toFixed(1)} × {maxSize.z.toFixed(1)} mm</b></span>
              <span>Cambio de color a <b>{good[0].colorChangeAt.toFixed(1)} mm</b></span>
            </>}
          </div>
        </section>

        {/* ---------- Descargas ---------- */}
        <aside className="card kc-out">
          <h3>Descargar</h3>
          {multi && onePlate == null && <small className="kc-muted">Para bajar una sola cama, elegila arriba de la vista (Cama 1, Cama 2…).</small>}
          <button type="button" className="btn primary kc-dl" disabled={!canExport} onClick={() => dl3mf()}>
            <Icon name="box" size={16} /> 3MF {multi ? `· todas las camas (${plates.length})` : ''}
          </button>
          {onePlate != null && (
            <button type="button" className="btn ghost kc-dl" disabled={!canExport} onClick={() => dl3mf(onePlate)}>
              <Icon name="box" size={16} /> 3MF · solo la Cama {onePlate + 1}
            </button>
          )}
          <small className="kc-muted">Para Bambu Studio u OrcaSlicer: cada cama del archivo es una placa del proyecto. Cada llavero es un objeto con 2 piezas (base y letras): lo movés entero y le cambiás el color a cada parte.</small>
          <div className="kc-note">⚠️ Al abrir el 3MF, <b>elegí tu impresora en el slicer</b> antes de laminar (la de acá es de ejemplo).</div>
          <button type="button" className="btn ghost kc-dl" disabled={!canExport} onClick={() => dlPlates()}>
            <Icon name="grid" size={16} /> STL {multi ? `· todas las camas (ZIP)` : 'de la cama'}
          </button>
          {onePlate != null && (
            <button type="button" className="btn ghost kc-dl" disabled={!canExport} onClick={() => dlPlates(onePlate)}>
              <Icon name="grid" size={16} /> STL · solo la Cama {onePlate + 1}
            </button>
          )}
          <button type="button" className="btn ghost kc-dl" disabled={!canExport} onClick={dlEach}>
            <Icon name="library" size={16} /> Un STL por nombre (ZIP)
          </button>
          <small className="kc-muted">El ZIP trae, por cada nombre, el llavero entero y también la base y las letras por separado (para 2 colores en cualquier slicer).</small>
          {exporting && <small className="kc-muted">Preparando archivos…</small>}

          {good.length > 1 && (
            <div className="kc-names">
              <h4>Llaveros ({good.length})</h4>
              {(multi ? plates : [{ items: good }]).map((pl, pi) => (
                <div key={pi} className="kc-names-plate">
                  {multi && <button type="button" className={'kc-names-head' + (show === pi ? ' on' : '')} onClick={() => setPlateSel(pi)}>Cama {pi + 1} <small>({pl.items.length})</small></button>}
                  <ul>{pl.items.map((it, i) => <li key={i}><span>{it.name}</span><small>{it.size.x.toFixed(0)}×{it.size.y.toFixed(0)}</small></li>)}</ul>
                </div>
              ))}
            </div>
          )}
          <div className="kc-tip">
            <b>Para imprimir en 2 colores con 1 solo filamento:</b> poné una pausa (cambio de filamento) a los {good[0] ? good[0].colorChangeAt.toFixed(1) : p.plateThickness.toFixed(1)} mm.
          </div>
        </aside>
      </div>
    </div>
  );
}
