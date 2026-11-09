import { useCallback, useEffect, useState } from 'react';
import * as lib from '../lib/libraryApi.js';
import { slugify } from '../lib/media.js';
import Icon from '../components/Icon.jsx';
import { Empty, Options } from '../components/ui.jsx';

// Panel admin → Biblioteca 3D. Solo administradores (lo valida la base con bb_lib_is_admin).
// Carga manual de modelos: cada modelo es un ZIP en la carpeta de Drive de la biblioteca.

const EMPTY = { id: null, name: '', slug: '', description: '', category_id: '', tagsText: '', drive: '', file_name: '', sizeMb: '',
  partsText: '', author: '', source: '', license: '', license_status: 'unknown', license_notes: '', featured: false, status: 'draft' };
const FILTERS = [{ value: '', label: 'Todos' }, { value: 'draft', label: 'Borradores' }, { value: 'published', label: 'Publicados' }, { value: 'hidden', label: 'Ocultos' }, { value: 'removed', label: 'Retirados' }];

function Stats({ s }) {
  if (!s) return null;
  const items = [['Modelos', s.models], ['Publicados', s.published], ['Borradores', s.drafts], ['Licencia sin verificar', s.unverified],
    ['Espacio', lib.formatBytes(s.bytes) || '0'], ['Descargas 24 h', s.downloads_24h], ['Descargas totales', s.downloads_total]];
  return <dl className="ga-specs lib-stats">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

function Categories({ cats, reload }) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [error, setError] = useState('');
  const run = async (fn) => { try { await fn(); setError(''); await reload(); } catch (e) { setError(e.message); } };
  return (
    <details className="card lib-box">
      <summary><b>Categorías</b> ({cats.length})</summary>
      {cats.map((c) => (
        <div key={c.id} className="ga-file">
          <Icon name="grid" size={16} />
          <div><b>{c.parent_id ? '↳ ' : ''}{c.name}</b><small className="cm-date">{c.models} publicados · orden {c.sort_order}{c.visible ? '' : ' · oculta'}</small></div>
          <button type="button" className="cm-link" onClick={() => { const n = prompt('Nuevo nombre', c.name); if (n?.trim()) run(() => lib.adminSaveCategory({ id: c.id, name: n.trim() })); }}>Renombrar</button>
          <button type="button" className="cm-link" onClick={() => { const n = prompt('Orden (número menor = primero)', c.sort_order); if (n !== null && !isNaN(+n)) run(() => lib.adminSaveCategory({ id: c.id, sort_order: +n })); }}>Orden</button>
          <button type="button" className="cm-link" onClick={() => run(() => lib.adminSaveCategory({ id: c.id, visible: !c.visible }))}>{c.visible ? 'Ocultar' : 'Mostrar'}</button>
          <button type="button" className="cm-link danger" onClick={() => { if (confirm(`¿Borrar la categoría "${c.name}"? Solo se puede si está vacía.`)) run(() => lib.adminDeleteCategory(c.id)); }}>Borrar</button>
        </div>
      ))}
      <form className="cm-row" onSubmit={(e) => { e.preventDefault(); run(async () => { await lib.adminSaveCategory({ name: name.trim(), slug: slugify(name), parent_id: parent || null, sort_order: (cats.length + 1) * 10 }); setName(''); }); }}>
        <label className="field"><span>Nueva categoría</span><div className="pink-input"><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Motos" /></div></label>
        <label className="field"><span>Dentro de (opcional)</span><div className="pink-input"><select value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">— Categoría principal —</option>{cats.filter((c) => !c.parent_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div></label>
        <button type="submit" className="btn ghost" disabled={!name.trim()}>Agregar</button>
      </form>
      {error && <div className="feedback-error">{error}</div>}
    </details>
  );
}

function Editor({ initial, cats, onDone }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (x) => setF((cur) => ({ ...cur, ...x }));
  const key = lib.driveId(f.drive);
  const valid = f.name.trim() && key && f.file_name.trim();
  const save = async (status) => {
    setBusy(true); setError('');
    try {
      const id = await lib.adminSaveModel({
        id: f.id, name: f.name.trim(), slug: f.slug || slugify(f.name), description: f.description.trim(), category_id: f.category_id || null,
        tags: f.tagsText.split(/[,#\s]+/).filter(Boolean).slice(0, 10), storage_key: key, file_name: f.file_name.trim(),
        size_bytes: f.sizeMb ? Math.round(+f.sizeMb * 1048576) : null,
        parts: f.partsText.split('\n').map((s) => s.trim()).filter(Boolean).map((name) => ({ name })),
        author: f.author.trim(), source: f.source.trim(), license: f.license.trim(), license_status: f.license_status,
        license_notes: f.license_notes.trim(), featured: f.featured,
      });
      if (status && status !== f.status) await lib.adminSetStatus(id, status);
      onDone();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <form className="cm-composer card ga-editor" onSubmit={(e) => { e.preventDefault(); save(null); }}>
      <h2>{f.id ? 'Editar modelo' : 'Nuevo modelo'}</h2>
      <label className="field"><span>Nombre</span><div className="pink-input"><input value={f.name} maxLength={150}
        onChange={(e) => set({ name: e.target.value, slug: f.id ? f.slug : slugify(e.target.value) })} placeholder="Volkswagen R32 MK5 con dirección · Escala 1:10" /></div></label>
      <label className="field"><span>Enlace o ID del ZIP en Drive</span><div className="pink-input"><input value={f.drive} onChange={(e) => set({ drive: e.target.value })} placeholder="https://drive.google.com/file/d/…/view" /></div>
        {f.drive && !key && <small className="cm-warn">No reconozco el enlace. Copialo desde Drive: clic derecho → Compartir → Copiar vínculo.</small>}
        {key && <small className="cm-date">ID: {key}</small>}</label>
      <div className="cm-row">
        <label className="field"><span>Nombre del archivo al descargar</span><div className="pink-input"><input value={f.file_name} onChange={(e) => set({ file_name: e.target.value })} placeholder="vw-r32-mk5.zip" /></div></label>
        <label className="field"><span>Peso (MB)</span><div className="pink-input"><input type="number" min="0" step="0.1" value={f.sizeMb} onChange={(e) => set({ sizeMb: e.target.value })} /></div></label>
        <label className="field"><span>Categoría</span><div className="pink-input"><select value={f.category_id} onChange={(e) => set({ category_id: e.target.value })}>
          <option value="">— Sin categoría —</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? '↳ ' : ''}{c.name}</option>)}</select></div></label>
      </div>
      <label className="field"><span>Descripción</span><div className="pink-input feedback-text"><textarea rows={4} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Qué es, escala, cómo se arma, recomendaciones de impresión…" /></div></label>
      <label className="field"><span>Etiquetas</span><div className="pink-input"><input value={f.tagsText} onChange={(e) => set({ tagsText: e.target.value })} placeholder="#volkswagen #escala #rc" /></div></label>
      <label className="field"><span>Piezas que trae el ZIP (una por línea, opcional)</span><div className="pink-input feedback-text"><textarea rows={3} value={f.partsText} onChange={(e) => set({ partsText: e.target.value })} placeholder={'carroceria.stl\nchasis.stl\nruedas.stl'} /></div></label>
      <fieldset className="lib-box">
        <legend>Derechos y licencia</legend>
        <div className="cm-row">
          <label className="field"><span>Diseño / autor (vacío = desconocido)</span><div className="pink-input"><input value={f.author} onChange={(e) => set({ author: e.target.value })} /></div></label>
          <label className="field"><span>Fuente original</span><div className="pink-input"><input value={f.source} onChange={(e) => set({ source: e.target.value })} placeholder="Propio, compra a…, enlace…" /></div></label>
          <label className="field"><span>Licencia</span><div className="pink-input"><input value={f.license} onChange={(e) => set({ license: e.target.value })} placeholder="Propia, comercial con redistribución, CC BY…" /></div></label>
        </div>
        <label className="field"><span>Estado de la licencia</span><div className="pink-input"><select value={f.license_status} onChange={(e) => set({ license_status: e.target.value })}>
          {Object.entries(lib.LICENSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div></label>
        <label className="field"><span>Notas / evidencia del permiso</span><div className="pink-input"><input value={f.license_notes} onChange={(e) => set({ license_notes: e.target.value })} placeholder="Dónde consta el permiso de redistribución digital" /></div></label>
        <small className="cm-date">Solo se puede publicar con la licencia <b>verificada</b>. Ojo: permiso para vender impresiones no es permiso para compartir el archivo.</small>
      </fieldset>
      <label className="nb-pref"><input type="checkbox" checked={f.featured} onChange={(e) => set({ featured: e.target.checked })} /> Destacado</label>
      {error && <div className="feedback-error">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn text" onClick={onDone}>Cancelar</button>
        <span className="cm-spacer" />
        <button type="submit" className="btn ghost" disabled={busy || !valid}>Guardar</button>
        {f.status !== 'published' && <button type="button" className="btn primary" disabled={busy || !valid || f.license_status !== 'verified'} onClick={() => save('published')}>
          <Icon name="send" size={16} /> Guardar y publicar</button>}
      </div>
    </form>
  );
}

// Lanza la importación desde Drive y espera a que termine (suele tardar 1 a 2 minutos).
function SyncButton({ before, onDone }) {
  const [state, setState] = useState('idle'); // idle | running | done | error
  const [msg, setMsg] = useState('');
  const run = async () => {
    setState('running'); setMsg('Buscando archivos nuevos en Drive… (unos 30 segundos; más si hay muchos modelos nuevos)');
    try {
      const { requested_at } = await lib.syncStart();
      const since = new Date(requested_at).getTime() - 5000;
      for (let i = 0; i < 100; i++) {
        await new Promise((ok) => setTimeout(ok, 3000));
        const s = await lib.syncStatus();
        if (s.created_at && new Date(s.created_at).getTime() >= since && s.status === 'completed') {
          if (s.conclusion !== 'success') throw new Error('La importación terminó con un error. Revisá Actions en GitHub.');
          const after = await lib.adminStats();
          const n = after.models - before;
          setState('done'); setMsg(n > 0 ? `Listo: ${n} modelo${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'} publicado${n === 1 ? '' : 's'}.` : 'Listo: no había archivos nuevos.');
          onDone();
          return;
        }
      }
      throw new Error('Está tardando más de lo normal. Volvé a mirar en unos minutos.');
    } catch (e) { setState('error'); setMsg(e.message); }
  };
  return (
    <div className="lib-sync">
      <button type="button" className="btn primary" disabled={state === 'running'} onClick={run}>
        <Icon name="refresh" size={16} /> {state === 'running' ? 'Actualizando…' : 'Actualizar biblioteca'}</button>
      {msg && <small className={state === 'error' ? 'cm-warn' : 'cm-date'}>{msg}</small>}
    </div>
  );
}

export default function AdminBiblioteca() {
  const [stats, setStats] = useState(null);
  const [cats, setCats] = useState(null);
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('');
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      const [s, c, r] = await Promise.all([lib.adminStats(), lib.categories(), lib.models({ status: filter || null, limit: 48 })]);
      setStats(s); setCats(c); setRows(r); setError('');
    } catch (e) { setError(e.missing ? 'Faltan las migraciones 058 y 059 en Supabase.' : e.message); }
  }, [filter]);
  useEffect(() => { reload(); }, [reload]);
  const open = async (slug) => {
    try {
      const m = await lib.model(slug);
      setEdit({ ...EMPTY, ...m, category_id: m.category_id || '', tagsText: (m.tags || []).map((t) => '#' + t).join(' '), drive: m.storage_key,
        sizeMb: m.size_bytes ? (m.size_bytes / 1048576).toFixed(1) : '', partsText: (m.parts || []).map((p) => p.name).join('\n'),
        author: m.author || '', source: m.source || '', license: m.license || '', license_notes: m.license_notes || '' });
    } catch (e) { setError(e.message); }
  };
  const setStatus = async (id, status) => { try { await lib.adminSetStatus(id, status); await reload(); } catch (e) { setError(e.message); } };

  if (error && !rows) return <div className="gate card gate-wide"><p>{error}</p></div>;
  if (!rows) return <div className="empty"><div className="spinner" /></div>;
  if (edit) return <Editor initial={edit} cats={cats} onDone={() => { setEdit(null); reload(); }} />;
  return (
    <div className="lib-admin">
      <Stats s={stats} />
      <SyncButton before={stats?.models || 0} onDone={reload} />
      <div className="lib-actions">
        <button type="button" className="btn ghost" onClick={() => setEdit({ ...EMPTY, category_id: cats[0]?.id || '' })}><Icon name="sparkles" size={16} /> Nuevo modelo a mano</button>
        <a className="btn ghost" href="#/biblioteca"><Icon name="external" size={16} /> Ver como miembro</a>
      </div>
      <Categories cats={cats} reload={reload} />
      <Options value={filter} onChange={setFilter} options={FILTERS} />
      {error && <div className="feedback-error">{error}</div>}
      {rows.length === 0 ? <Empty icon="box" title="No hay modelos" text="Cargá el primero con “Nuevo modelo”." /> : rows.map((m) => (
        <div key={m.id} className="ga-file">
          <Icon name="box" size={18} />
          <div><b>{m.name}</b><small className="cm-date"><span className={'chip ' + lib.STATUS[m.status]?.cls}>{lib.STATUS[m.status]?.label}</span> {lib.formatBytes(m.size_bytes)} · {m.downloads} descargas · ♥ {m.favorites}</small></div>
          <button type="button" className="cm-link" onClick={() => open(m.slug)}>Editar</button>
          {m.status === 'published'
            ? <button type="button" className="cm-link" onClick={() => setStatus(m.id, 'hidden')}>Ocultar</button>
            : <button type="button" className="cm-link" onClick={() => setStatus(m.id, 'published')}>Publicar</button>}
          {m.status !== 'removed' && <button type="button" className="cm-link danger" onClick={() => setStatus(m.id, 'removed')}>Retirar</button>}
          <button type="button" className="cm-link danger" onClick={async () => {
            if (!confirm(`¿Borrar "${m.name}" de la biblioteca?\n\nSe borran la ficha, fotos, vista 3D, reseñas y favoritos. El ZIP queda en el Drive pero no se vuelve a importar. No se puede deshacer.`)) return;
            try { await lib.adminDeleteModel(m.id); await reload(); } catch (e) { setError(e.message); }
          }}>Borrar</button>
        </div>
      ))}
    </div>
  );
}
