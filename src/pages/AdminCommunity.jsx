import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import * as api from '../lib/communityApi.js';
import Icon from '../components/Icon.jsx';
import { Empty, Options } from '../components/ui.jsx';

// Pestaña "Comunidad" del panel (#/admin). Mismo panel de siempre: no hay uno aparte.
// Editores = moderación (reportes, ocultos). Admin = además activa/desactiva módulos.
// Cada acción la valida la base (bb_can_edit / is_admin).

const REASON = Object.fromEntries(api.REPORT_REASONS.map((r) => [r.value, r.label]));
const STATE = { published: 'Visible', hidden: 'Oculto', removed: 'Quitado' };
const TYPE = { post: 'Publicación', comment: 'Comentario', topic: 'Tema del foro', reply: 'Respuesta del foro' };

function Stats() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.modStats().then(setS).catch((e) => setError(e.missing ? 'Falta la migración 044.' : e.message)); }, []);
  if (error) return <div className="feedback-error">{error}</div>;
  if (!s) return <div className="cm-loading"><span className="spinner xs" /></div>;
  const items = [['Publicaciones', s.posts], ['Comentarios', s.comments], ['Reacciones', s.reactions], ['Autores (30 días)', s.active_authors_30d], ['Ocultas', s.hidden], ['Reportes abiertos', s.open_reports]];
  return <div className="cm-stats">{items.map(([l, n]) => <div key={l} className={'cm-stat' + (l === 'Reportes abiertos' && n > 0 ? ' warn' : '')}><b>{n}</b><span>{l}</span></div>)}</div>;
}

function Flags() {
  const { isAdmin } = useAuth();
  const flags = api.useCommunityFlags();
  const [local, setLocal] = useState(null);
  const [error, setError] = useState('');
  const cur = local || flags;
  if (!cur) return null;
  const toggle = async (k) => {
    const next = { ...cur, [k]: !cur[k] };
    setLocal(next);
    try { await api.saveFlags(next); setError(''); } catch (e) { setLocal(cur); setError(e.message); }
  };
  return (
    <section className="card cm-flags">
      <h3>Módulos de la comunidad</h3>
      {[['batfeed', 'Base social (reacciones, comentarios, avisos y perfiles; la usan Galería y Foro: no apagar)'], ['batforum', 'BATFORUM (foro)'], ['batgallery', 'GALERÍA MAKER'], ['batmap', 'Mapa Maker'], ['batpartners', 'Patrocinadores (directorio público)']].map(([k, label]) => (
        <label key={k} className="nb-pref"><input type="checkbox" checked={!!cur[k]} disabled={!isAdmin} onChange={() => toggle(k)} /> {label}</label>
      ))}
      {!isAdmin && <small>Solo administración puede activar o desactivar módulos.</small>}
      {error && <div className="feedback-error">{error}</div>}
    </section>
  );
}

function Reports() {
  const [status, setStatus] = useState('open');
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setList(await api.modReports(status)); setError(''); } catch (e) { setError(e.missing ? 'Falta la migración 044.' : e.message); setList([]); }
  }, [status]);
  useEffect(() => { setList(null); load(); }, [load]);
  const resolve = async (r, action, hide) => {
    try { await api.modResolve({ type: r.target_type, id: r.target_id, action, hide }); load(); } catch (e) { setError(e.message); }
  };
  return (
    <section className="cm-mod">
      <div className="cm-mod-head"><h3>Reportes</h3>
        <Options value={status} onChange={setStatus} options={[{ value: 'open', label: 'Abiertos' }, { value: 'actioned', label: 'Resueltos' }, { value: 'dismissed', label: 'Descartados' }]} /></div>
      {error && <div className="feedback-error">{error}</div>}
      {!list ? <div className="cm-loading"><span className="spinner xs" /></div>
        : list.length === 0 ? <Empty icon="check" title="Sin reportes" text="No hay nada para revisar en esta lista." />
          : list.map((r) => (
            <article key={r.target_type + r.target_id} className="card cm-report">
              <div className="chips">
                <span className="chip cat">{TYPE[r.target_type] || r.target_type}</span>
                <span className="chip club">{r.count} {r.count === 1 ? 'reporte' : 'reportes'}</span>
                <span className="chip muted">{STATE[r.state] || r.state || 'Eliminado'}</span>
                {r.reasons.map((x) => <span key={x} className="chip muted">{REASON[x] || x}</span>)}
              </div>
              <p className="cm-rp-body"><b>{r.author || '—'}:</b> {r.preview || <i>(contenido eliminado)</i>}</p>
              {r.details?.length > 0 && <ul className="cm-rp-det">{r.details.map((d, i) => <li key={i}>“{d}”</li>)}</ul>}
              {status === 'open' && (
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={() => resolve(r, 'dismissed')}>Descartar{r.state !== 'published' ? ' y restituir' : ''}</button>
                  <button type="button" className="btn primary" onClick={() => resolve(r, 'actioned', true)}><Icon name="shield" size={16} /> Ocultar contenido</button>
                </div>
              )}
            </article>
          ))}
    </section>
  );
}

function Hidden() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.modHidden().then(setList).catch((e) => { setError(e.missing ? 'Falta la migración 044.' : e.message); setList([]); }), []);
  useEffect(() => { load(); }, [load]);
  const restore = async (id) => { try { await api.modPostSet({ id, status: 'published', note: 'restituido' }); load(); } catch (e) { setError(e.message); } };
  if (list && list.length === 0) return null;
  return (
    <section className="cm-mod">
      <h3>Publicaciones ocultas</h3>
      {error && <div className="feedback-error">{error}</div>}
      {!list ? <div className="cm-loading"><span className="spinner xs" /></div> : list.map((p) => (
        <article key={p.id} className="card cm-report">
          <p className="cm-rp-body"><b>{p.author}:</b> {p.body}</p>
          <div className="modal-actions"><button type="button" className="btn ghost" onClick={() => restore(p.id)}>Restituir</button></div>
        </article>
      ))}
    </section>
  );
}

function Categories() {
  const { isAdmin } = useAuth();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.adminCategories().then(setList).catch((e) => { setError(e.missing ? 'Falta la migración 045.' : e.message); setList([]); }), []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);
  if (!isAdmin) return null;
  const save = async () => {
    try { await api.saveCategory(edit); setEdit(null); setError(''); load(); } catch (e) { setError(e.message); }
  };
  const remove = async (c) => {
    try { await api.deleteCategory(c.id); load(); } catch (e) { setError(e.message); }
  };
  const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return (
    <section className="cm-mod">
      <div className="cm-mod-head"><h3>Categorías del foro</h3>
        <button type="button" className="btn ghost" onClick={() => setEdit({ name: '', slug: '', description: '', sort: 100, active: true })}>+ Nueva categoría</button></div>
      {error && <div className="feedback-error">{error}</div>}
      {edit && (
        <div className="card cm-report">
          <div className="pink-input"><input value={edit.name} maxLength={60} placeholder="Nombre" onChange={(e) => setEdit({ ...edit, name: e.target.value, slug: edit.id ? edit.slug : slugify(e.target.value) })} /></div>
          <div className="pink-input"><input value={edit.slug} maxLength={40} placeholder="slug-en-la-url" disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></div>
          <div className="pink-input"><input value={edit.description} maxLength={200} placeholder="Descripción corta" onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
          <div className="cm-row"><label className="nb-pref">Orden <div className="pink-input"><input type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: e.target.value })} /></div></label>
            <label className="nb-pref"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Visible para miembros</label></div>
          <div className="modal-actions"><button type="button" className="btn text" onClick={() => setEdit(null)}>Cancelar</button>
            <button type="button" className="btn primary" disabled={edit.name.trim().length < 2 || !/^[a-z0-9-]{2,40}$/.test(edit.slug)} onClick={save}>Guardar</button></div>
        </div>
      )}
      {!list ? <div className="cm-loading"><span className="spinner xs" /></div> : list.map((c) => (
        <article key={c.id} className="card cm-report">
          <div className="cm-mod-head"><div><b>{c.name}</b> <span className="cm-date">/{c.slug} · orden {c.sort}</span> {!c.active && <span className="chip muted">Oculta</span>}</div>
            <span><button type="button" className="cm-link" onClick={() => setEdit(c)}>Editar</button>{' '}
              <button type="button" className="cm-link danger" onClick={() => remove(c)}>Borrar</button></span></div>
        </article>
      ))}
      <small className="cm-date">Una categoría con temas no se puede borrar: ocultala en su lugar.</small>
    </section>
  );
}

function Places() {
  const { isAdmin } = useAuth();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.adminPlaces().then(setList).catch((e) => { setError(e.missing ? 'Falta la migración 048.' : e.message); setList([]); }), []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);
  if (!isAdmin) return null;
  const save = async () => { try { await api.savePlace(edit); setEdit(null); setError(''); load(); } catch (e) { setError(e.message); } };
  const pending = (list || []).filter((p) => !p.active);
  const shown = (list || []).filter((p) => p.active).slice(0, 200);
  const noPoint = (v) => v === '' || v == null;
  return (
    <section className="cm-mod">
      <div className="cm-mod-head"><h3>Mapa Maker: ciudades</h3>
        <button type="button" className="btn ghost" onClick={() => setEdit({ country: 'Argentina', region: '', city: '', lat: '', lng: '', active: true })}>+ Nueva ciudad</button></div>
      <small className="cm-date">Cargá el punto central de la CIUDAD (2 decimales). Nunca pongas una dirección.</small>
      {error && <div className="feedback-error">{error}</div>}
      {edit && (
        <div className="card cm-report">
          <div className="pink-input"><input value={edit.country} placeholder="País" onChange={(e) => setEdit({ ...edit, country: e.target.value })} /></div>
          <div className="pink-input"><input value={edit.region} placeholder="Provincia o región" onChange={(e) => setEdit({ ...edit, region: e.target.value })} /></div>
          <div className="pink-input"><input value={edit.city} placeholder="Ciudad" onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></div>
          <div className="cm-row"><div className="pink-input"><input value={edit.lat ?? ''} placeholder="Latitud (ej.: -34.60)" inputMode="decimal" onChange={(e) => setEdit({ ...edit, lat: e.target.value })} /></div>
            <div className="pink-input"><input value={edit.lng ?? ''} placeholder="Longitud (ej.: -58.38)" inputMode="decimal" onChange={(e) => setEdit({ ...edit, lng: e.target.value })} /></div></div>
          <label className="nb-pref"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Visible en el mapa</label>
          <div className="modal-actions"><button type="button" className="btn text" onClick={() => setEdit(null)}>Cancelar</button>
            <button type="button" className="btn primary" disabled={!edit.country.trim() || !edit.region.trim() || !edit.city.trim() || (edit.active && (noPoint(edit.lat) || noPoint(edit.lng)))} onClick={save}>Guardar</button></div>
        </div>
      )}
      {pending.length > 0 && <><b>Sugeridas por la comunidad ({pending.length})</b>{pending.map((p) => (
        <article key={p.id} className="card cm-report"><div className="cm-mod-head"><span>{p.city}, {p.region}, {p.country}</span>
          <button type="button" className="cm-link" onClick={() => setEdit({ ...p, active: true, lat: '', lng: '' })}>Revisar y activar</button></div></article>))}</>}
      {!list ? <div className="cm-loading"><span className="spinner xs" /></div> : <details><summary>Ciudades activas ({shown.length})</summary>
        {shown.map((p) => <div key={p.id} className="cm-mod-head"><span className="cm-date">{p.city} · {p.region} · {p.lat}, {p.lng}</span>
          <span><button type="button" className="cm-link" onClick={() => setEdit(p)}>Editar</button>{' '}
            <button type="button" className="cm-link danger" onClick={() => api.deletePlace(p.id).then(load).catch((e) => setError(e.message))}>Borrar</button></span></div>)}</details>}
    </section>
  );
}

function GalleryCategories() {
  const { isAdmin } = useAuth();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.adminGalleryCategories().then(setList).catch((e) => { setError(e.missing ? 'Falta la migración 049.' : e.message); setList([]); }), []);
  useEffect(() => { if (isAdmin) { load(); api.galleryStats().then(setStats).catch(() => {}); } }, [isAdmin, load]);
  if (!isAdmin) return null;
  const save = async () => { try { await api.saveGalleryCategory(edit); setEdit(null); setError(''); load(); } catch (e) { setError(e.message); } };
  const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return (
    <section className="cm-mod">
      <div className="cm-mod-head"><h3>Galería Maker: categorías</h3>
        <button type="button" className="btn ghost" onClick={() => setEdit({ name: '', slug: '', sort: 100, active: true })}>+ Nueva categoría</button></div>
      {stats && <small className="cm-date">{stats.projects} proyectos · {stats.drafts} borradores · {stats.files} archivos ({stats.storage_mb} MB) · {stats.downloads} descargas</small>}
      <small className="cm-date">Los límites de archivos (tamaño, cantidad, espacio, descargas por hora) se ajustan en la tabla de ajustes, clave gallery_limits.</small>
      {error && <div className="feedback-error">{error}</div>}
      {edit && (
        <div className="card cm-report">
          <div className="pink-input"><input value={edit.name} maxLength={60} placeholder="Nombre" onChange={(e) => setEdit({ ...edit, name: e.target.value, slug: edit.id ? edit.slug : slugify(e.target.value) })} /></div>
          <div className="pink-input"><input value={edit.slug} maxLength={40} placeholder="slug-en-la-url" disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></div>
          <div className="cm-row"><label className="nb-pref">Orden <div className="pink-input"><input type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: e.target.value })} /></div></label>
            <label className="nb-pref"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Visible</label></div>
          <div className="modal-actions"><button type="button" className="btn text" onClick={() => setEdit(null)}>Cancelar</button>
            <button type="button" className="btn primary" disabled={edit.name.trim().length < 2 || !/^[a-z0-9-]{2,40}$/.test(edit.slug)} onClick={save}>Guardar</button></div>
        </div>
      )}
      {!list ? <div className="cm-loading"><span className="spinner xs" /></div> : list.map((c) => (
        <article key={c.id} className="card cm-report"><div className="cm-mod-head"><div><b>{c.name}</b> <span className="cm-date">/{c.slug} · orden {c.sort}</span> {!c.active && <span className="chip muted">Oculta</span>}</div>
          <span><button type="button" className="cm-link" onClick={() => setEdit(c)}>Editar</button>{' '}
            <button type="button" className="cm-link danger" onClick={() => api.deleteGalleryCategory(c.id).then(load).catch((e) => setError(e.message))}>Borrar</button></span></div></article>
      ))}
    </section>
  );
}

export default function AdminCommunity() {
  return (
    <div className="cm-admin">
      <Stats />
      <Flags />
      <Reports />
      <Hidden />
      <Categories />
      <GalleryCategories />
      <Places />
    </div>
  );
}
