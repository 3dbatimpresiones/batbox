import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import AccessPanel from '../components/AccessPanel.jsx';
import FeedbackButton from '../components/FeedbackButton.jsx';
import Icon from '../components/Icon.jsx';
import SupportViewer from '../components/SupportViewer.jsx';
import { binarySTL, downloadBytes, safeName } from '../lib/split/export.js';
import '../styles/support.css';

const fmt = (n, d = 1) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: d });
function joinParts(parts, name) {
  let nv = 0; const vert = [], tri = [];
  for (const p of parts) { vert.push(...p.vert); for (const i of p.tri) tri.push(i + nv); nv += p.vert.length / 3; }
  return { name, vert: Float32Array.from(vert), tri: Uint32Array.from(tri), col: null };
}
function useSupportWorker() {
  const ref = useRef(null);
  useEffect(() => () => { ref.current?.worker.terminate(); ref.current = null; }, []);
  return useCallback((msg, transfer = []) => {
    if (!ref.current) {
      const worker = new Worker(new URL('../lib/support/worker.js', import.meta.url), { type: 'module' });
      const state = { worker, seq: 0, pending: new Map() };
      worker.onmessage = ({ data }) => { const p = state.pending.get(data.id); if (!p) return; state.pending.delete(data.id); data.type === 'error' ? p.reject(new Error(data.error)) : p.resolve(data); };
      worker.onerror = (e) => { state.pending.forEach((p) => p.reject(new Error(e.message || 'Falló el motor geométrico.'))); state.pending.clear(); };
      ref.current = state;
    }
    const s = ref.current, id = ++s.seq;
    return new Promise((resolve, reject) => { s.pending.set(id, { resolve, reject }); s.worker.postMessage({ ...msg, id }, transfer); });
  }, []);
}

export default function Support() {
  const { isMember } = useAuth(); const call = useSupportWorker();
  const input = useRef(null), viewer = useRef(null);
  const [source, setSource] = useState(null), [originals, setOriginals] = useState([]), [optimized, setOptimized] = useState([]), [additions, setAdditions] = useState([]);
  const [analyses, setAnalyses] = useState([]), [stats, setStats] = useState([]), [warnings, setWarnings] = useState([]), [mode, setMode] = useState('original');
  const [angle, setAngle] = useState(50), [layerHeight, setLayerHeight] = useState(.2), [extrusionWidth, setExtrusionWidth] = useState(.42), [minRegionArea, setMinRegionArea] = useState(1), [maxAddedPercent, setMaxAddedPercent] = useState(35), [preserveHoles, setPreserveHoles] = useState(true), [intensity, setIntensity] = useState('balanced');
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [drag, setDrag] = useState(false);
  const settings = useMemo(() => ({ angle: Number(angle), layerHeight: Number(layerHeight), extrusionWidth: Number(extrusionWidth), minRegionArea: Number(minRegionArea), maxAddedPercent: Number(maxAddedPercent), preserveHoles }), [angle, layerHeight, extrusionWidth, minRegionArea, maxAddedPercent, preserveHoles]);
  const apply = (m) => { setOriginals(m.originals || []); setOptimized(m.optimized || []); setAdditions(m.additions || []); if (m.analyses) setAnalyses(m.analyses); if (m.stats) setStats(m.stats); if (m.warnings) setWarnings(m.warnings); };
  const load = async (file) => {
    if (!file) return; if (!/\.(stl|3mf)$/i.test(file.name)) { setError('Usá un archivo STL o 3MF.'); return; }
    setBusy('Leyendo, cerrando secciones y analizando capas…'); setError(''); setStats([]); setMode('original');
    try { const buffer = await file.arrayBuffer(); const m = await call({ type: 'load', name: file.name, buffer, settings }, [buffer]); apply(m); setSource(file); requestAnimationFrame(() => viewer.current?.fit()); }
    catch (e) { setError(e.message); setOriginals([]); setSource(null); } finally { setBusy(''); if (input.current) input.current.value = ''; }
  };
  const analyze = async () => { if (!originals.length) return; setBusy('Comparando material entre capas consecutivas…'); setError(''); try { const m = await call({ type: 'analyze', settings }); apply(m); setMode('overhang'); } catch (e) { setError(e.message); } finally { setBusy(''); } };
  const optimize = async () => { if (!originals.length) return; setBusy('Propagando secciones y construyendo transiciones inclinadas…'); setError(''); try { const m = await call({ type: 'optimize', settings }); apply(m); setMode('changes'); } catch (e) { setError(e.message); setOptimized([]); setAdditions([]); setStats([]); } finally { setBusy(''); } };
  const chooseIntensity = (next) => { setIntensity(next); const v = { conservative: [2, 20], balanced: [1, 35], aggressive: [.35, 60] }[next]; setMinRegionArea(v[0]); setMaxAddedPercent(v[1]); };
  const totals = useMemo(() => ({ regions: analyses.reduce((a, x) => a + x.regions, 0), layers: analyses.reduce((a, x) => a + x.layers, 0), tris: originals.reduce((a, x) => a + x.info.tris, 0), originalVolume: stats.reduce((a, x) => a + x.originalVolume, 0), optimizedVolume: stats.reduce((a, x) => a + x.optimizedVolume, 0), addedVolume: stats.reduce((a, x) => a + x.addedVolume, 0), corrected: stats.reduce((a, x) => a + x.corrected, 0), unresolved: stats.reduce((a, x) => a + x.unresolved, 0) }), [analyses, originals, stats]);
  const ready = optimized.length > 0 && stats.length === optimized.length && stats.every((s) => s.valid);
  const download = () => { if (!ready) return; const base = safeName(source?.name?.replace(/\.[^.]+$/, '') || 'modelo'); const bytes = binarySTL(joinParts(optimized, `${base}_BATSUPPORT`), 'BATSUPPORT'); downloadBytes(bytes, `${base}_BATSUPPORT.stl`, 'model/stl'); };

  if (!isMember) return <div className="club-locked"><div className="club-locked-head"><div className="section-label">MAKERS CLUB · HERRAMIENTA</div><h1>BATSUPPORT</h1><p>Convertí voladizos difíciles en geometrías imprimibles y exportá un STL realmente modificado.</p><FeedbackButton source="batsupport" /></div><AccessPanel intro="Herramienta privada para miembros del Makers Club" /></div>;
  return <div className="support-page">
    <header className="support-head"><div><div className="section-label">MODELADO · BATBOX</div><h1>BATSUPPORT <span>V1</span></h1><h2>Convertí voladizos difíciles en geometrías imprimibles.</h2><p>Subí tu STL o 3MF y generá transiciones inclinadas reales, conservando la geometría original siempre que sea posible.</p></div><div className="support-head-actions"><FeedbackButton source="batsupport" /><button className="btn ghost" onClick={() => input.current?.click()}><Icon name="upload" size={16} /> Abrir modelo</button></div></header>
    <input ref={input} hidden type="file" accept=".stl,.3mf" onChange={(e) => load(e.target.files?.[0])} />
    {!originals.length ? <button className={'support-drop card' + (drag ? ' drag' : '')} onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); load(e.dataTransfer.files?.[0]); }}><Icon name="upload" size={44} /><strong>Arrastrá tu STL o 3MF</strong><span>El archivo se procesa localmente en tu dispositivo.</span></button> : <div className="support-layout">
      <aside className="support-panel card">
        <section><h3>Modelo</h3><div className="support-file"><Icon name="box" /><span><b>{source?.name}</b><small>{originals.length} {originals.length === 1 ? 'objeto' : 'objetos'} · {totals.tris.toLocaleString('es-AR')} triángulos</small></span></div>{warnings.map((w, i) => <div className="support-warning" key={i}>{w}</div>)}</section>
        <section><h3>Configuración</h3><label>Ángulo máximo <select value={angle} onChange={(e) => setAngle(e.target.value)}><option>45</option><option>50</option><option>55</option><option>60</option><option value="90">90 · no modificar</option></select></label><label>Altura de capa <select value={layerHeight} onChange={(e) => setLayerHeight(e.target.value)}><option value=".12">0,12 mm</option><option value=".16">0,16 mm</option><option value=".2">0,20 mm</option><option value=".24">0,24 mm</option></select></label><label>Ancho de extrusión <input type="number" min=".2" max="1.2" step=".01" value={extrusionWidth} onChange={(e) => setExtrusionWidth(e.target.value)} /> mm</label><label>Región mínima <input type="number" min=".05" step=".05" value={minRegionArea} onChange={(e) => setMinRegionArea(e.target.value)} /> mm²</label><div className="support-intensity">{[['conservative','Conservadora'],['balanced','Equilibrada'],['aggressive','Agresiva']].map(([v, l]) => <button key={v} className={intensity === v ? 'active' : ''} onClick={() => chooseIntensity(v)}>{l}</button>)}</div><label className="toggle-row"><input type="checkbox" checked={preserveHoles} disabled onChange={(e) => setPreserveHoles(e.target.checked)} /><span className="switch" /> Preservar agujeros · protección obligatoria en V1</label></section>
        <section><button className="btn ghost wide" disabled={!!busy} onClick={analyze}>Actualizar análisis</button><button className="btn primary wide support-generate" disabled={!!busy} onClick={optimize}>GENERAR GEOMETRÍA AUTOPORTANTE</button><small>El motor rechaza mallas abiertas y correcciones que superen el límite de {maxAddedPercent} %.</small></section>
      </aside>
      <main className="support-stage card"><div className="support-toolbar"><div>{[['original','Original'],['optimized','Optimizado'],['compare','Comparación'],['changes','Cambios'],['overhang','Voladizos']].map(([v, l]) => <button key={v} className={mode === v ? 'active' : ''} disabled={(v === 'optimized' || v === 'changes') && !optimized.length} onClick={() => setMode(v)}>{l}</button>)}</div><div>{[['top','Arriba'],['bottom','Abajo'],['front','Frente'],['side','Lateral']].map(([v, l]) => <button key={v} onClick={() => viewer.current?.view(v)}>{l}</button>)}<button onClick={() => viewer.current?.fit()}>Restablecer</button></div></div><SupportViewer ref={viewer} originals={originals} optimized={optimized} additions={additions} mode={mode} analyses={analyses} />{busy && <div className="support-busy"><div className="spinner" /><b>{busy}</b><small>Trabajo real en Web Worker; la interfaz sigue disponible.</small></div>}</main>
      <aside className="support-panel card support-results"><section><h3>Resultado del análisis</h3><dl><div><dt>Capas analizadas</dt><dd>{totals.layers}</dd></div><div><dt>Regiones críticas</dt><dd>{totals.regions}</dd></div><div><dt>Regiones corregidas</dt><dd>{stats.length ? totals.corrected : '—'}</dd></div><div><dt>Sin resolver</dt><dd>{stats.length ? totals.unresolved : '—'}</dd></div></dl></section><section><h3>Geometría</h3><dl><div><dt>Volumen original</dt><dd>{fmt(stats.length ? totals.originalVolume : originals.reduce((a, p) => a + p.info.volume, 0), 2)} mm³</dd></div><div><dt>Volumen optimizado</dt><dd>{stats.length ? `${fmt(totals.optimizedVolume, 2)} mm³` : '—'}</dd></div><div><dt>Material agregado</dt><dd>{stats.length ? `${fmt(totals.addedVolume, 2)} mm³` : '—'}</dd></div><div><dt>Estado de malla</dt><dd className={ready ? 'ok' : ''}>{ready ? 'Cerrada y validada' : 'Pendiente'}</dd></div></dl></section><section><h3>Descarga</h3><button className="btn primary wide" disabled={!ready || !!busy} onClick={download}><Icon name="download" size={16} /> Descargar STL optimizado</button>{optimized.length > 0 && !ready && <div className="support-warning">Quedan voladizos sin resolver. La descarga permanece bloqueada para no presentar el archivo como listo.</div>}<small>La descarga contiene la malla modificada, no una transformación visual. Abrila en OrcaSlicer antes de imprimir.</small></section></aside>
    </div>}
    {error && <div className="support-error"><Icon name="alert" size={18} /><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
  </div>;
}
