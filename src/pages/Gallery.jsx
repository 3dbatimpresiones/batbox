import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import * as api from '../lib/communityApi.js';
import { navigate } from '../lib/router.js';
import { safeUrl } from '../lib/safeUrl.js';
import { useUploads } from '../lib/useUploads.js';
import Icon from '../components/Icon.jsx';
import { Avatar, CommentsPanel, Lightbox, ReportModal } from '../components/Community.jsx';
import { gateView, ImageStrip } from '../components/CommunityGate.jsx';
import { GalleryGrid } from '../components/GalleryCards.jsx';
import { Nm } from '../components/Featured.jsx';
import { Confirm, Empty, Options, PageHead, SearchInput } from '../components/ui.jsx';

// =====================================================================
// GALERÍA MAKER (#/galeria) — portfolio y descubrimiento de creaciones. Solo Makers Club.
//   #/galeria                 → destacados + galería con filtros
//   #/galeria/p/<id>          → proyecto (fotos, datos técnicos, archivos, comentarios)
//   #/galeria/nuevo           → publicar        #/galeria/editar/<id> → editar
// Un proyecto es una publicación de BATFEED con datos extra: reacciones, comentarios,
// guardados, reportes y avisos son los mismos. Permisos y límites los valida la base.
// =====================================================================

const TABS = [{ value: 'all', label: 'Galería' }, { value: 'saved', label: 'Guardados' }, { value: 'mine', label: 'Mis creaciones' }, { value: 'drafts', label: 'Borradores' }];
const STATES = [{ value: '', label: 'Todos' }, { value: 'done', label: 'Terminados' }, { value: 'wip', label: 'En desarrollo' }];

function Home({ cats, userId }) {
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('recent');
  const [state, setState] = useState('');
  const [category, setCategory] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 350); return () => clearTimeout(t); }, [qInput]);
  const browsing = tab === 'all' && !q && !category && !state && sort === 'recent';
  const filters = { q, category, sort, state, saved: tab === 'saved', drafts: tab === 'drafts', author: tab === 'mine' ? userId : null };
  return (
    <>
      <Options value={tab} onChange={setTab} options={TABS} />
      {browsing && <>
        <GalleryGrid filters={{ featured: 'week_pick' }} limit={1} bare compact />
        <section className="ga-section"><h2 className="fo-h2"><Icon name="star" size={16} /> Selección 3DBAT</h2><GalleryGrid filters={{ featured: 'pick' }} limit={4} bare compact /></section>
        <section className="ga-section"><h2 className="fo-h2">Tendencias de la semana</h2><GalleryGrid filters={{ sort: 'week' }} limit={4} bare compact /></section>
        <h2 className="fo-h2">Todas las creaciones</h2>
      </>}
      <div className="cm-toolbar">
        <SearchInput value={qInput} onChange={setQInput} placeholder="Buscar por proyecto, máquina, material o #etiqueta…" />
        <div className="cm-filters"><Options value={sort} onChange={setSort} options={api.GALLERY_SORTS} /><Options value={state} onChange={setState} options={STATES} /></div>
        <div className="cm-cats" role="group" aria-label="Categorías">
          <button type="button" className={'opt' + (!category ? ' active' : '')} onClick={() => setCategory('')}>Todas</button>
          {cats.map((c) => <button key={c.slug} type="button" className={'opt' + (category === c.slug ? ' active' : '')} onClick={() => setCategory(c.slug)}>{c.name}</button>)}
        </div>
      </div>
      <GalleryGrid filters={filters} empty={<Empty icon="image" title={tab === 'drafts' ? 'No tenés borradores' : tab === 'mine' ? 'Todavía no publicaste creaciones' : tab === 'saved' ? 'Todavía no guardaste proyectos' : 'No encontramos proyectos'}
        text={tab === 'all' && !q && !category ? 'Sé la primera persona en mostrar lo que hiciste.' : 'Probá con otros filtros.'} />} />
    </>
  );
}

function Reactions({ p, onChange }) {
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState('');
  const react = async (kind) => {
    setPicker(false);
    const had = p.my_reaction; const next = had === kind ? null : kind;
    try { await api.setReaction(p.id, had, kind); onChange({ my_reaction: next, reaction_count: Math.max(0, p.reaction_count + (next ? 1 : 0) - (had ? 1 : 0)) }); }
    catch (e) { setError(e.message); }
  };
  const save = async () => { try { await api.setSaved(p.id, !p.saved); onChange({ saved: !p.saved }); } catch (e) { setError(e.message); } };
  const cur = api.REACTIONS.find((r) => r.kind === p.my_reaction);
  return (
    <div className="cm-actions">
      <div className="cm-react-wrap" onMouseLeave={() => setPicker(false)}>
        <button type="button" className={'cm-act' + (p.my_reaction ? ' on' : '')} onClick={() => react(p.my_reaction || 'like')} aria-pressed={!!p.my_reaction}>
          <span aria-hidden="true">{cur?.emoji || '👍'}</span> {cur?.label || 'Me gusta'} · {p.reaction_count}</button>
        <button type="button" className="cm-act cm-more" onClick={() => setPicker((v) => !v)} aria-label="Elegir reacción" aria-expanded={picker}>▾</button>
        {picker && <div className="cm-picker" role="menu">{api.REACTIONS.map((r) => <button key={r.kind} type="button" role="menuitem" title={r.label} aria-label={r.label} className={p.my_reaction === r.kind ? 'on' : ''} onClick={() => react(r.kind)}>{r.emoji}</button>)}</div>}
      </div>
      <button type="button" className={'cm-act' + (p.saved ? ' on' : '')} onClick={save} aria-pressed={p.saved}><Icon name="bookmark" size={16} /> {p.saved ? 'Guardado' : 'Guardar'}</button>
      <button type="button" className="cm-act" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/galeria/p/${p.id}`); setError('Enlace copiado.'); } catch { setError('No se pudo copiar el enlace.'); } }}><Icon name="link" size={16} /> Compartir</button>
      {error && <small className="cm-date">{error}</small>}
    </div>
  );
}

function Detail({ id }) {
  const { canEdit, isAdmin } = useAuth();
  const [d, setD] = useState(undefined);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(null);
  const [report, setReport] = useState(false);
  const [del, setDel] = useState(false);
  const [dl, setDl] = useState('');
  const load = useCallback(async () => { try { setD(await api.galleryProject(id)); setError(''); } catch (e) { setError(e.message); setD(null); } }, [id]);
  useEffect(() => { setD(undefined); load(); }, [load]);
  if (d === undefined) return <div className="empty"><div className="spinner" /></div>;
  if (!d) return <><a className="cm-back" href="#/galeria"><Icon name="arrowLeft" size={16} /> Galería</a><Empty icon="alert" title="Este proyecto no está disponible" text={error || 'Puede que se haya borrado o esté en revisión.'} /></>;
  const p = d.project; const author = d.authors[p.user_id];
  const patch = (x) => setD((cur) => ({ ...cur, project: { ...cur.project, ...x } }));
  const run = async (fn) => { try { await fn(); await load(); } catch (e) { setError(e.message); } };
  const download = async (f) => {
    setDl(f.id); setError('');
    try { const url = await api.downloadGalleryFile(f.id); const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); await load(); }
    catch (e) { setError(e.message); } finally { setDl(''); }
  };
  const specs = [['Tecnología', p.technology], ['Máquina', p.machine], ['Material', p.material], ['Tiempo', api.formatMinutes(p.build_minutes)], ...Object.entries(p.params || {})].filter(([, v]) => v);
  return (
    <>
      <a className="cm-back" href="#/galeria"><Icon name="arrowLeft" size={16} /> Galería</a>
      {p.status === 'draft' && <div className="vo-note"><Icon name="alert" size={13} /> Borrador: solo vos lo ves. <a href={'#/galeria/editar/' + p.id}>Editar y publicar</a></div>}
      <article className="cm-post card ga-detail">
        <div className="fo-chips">
          {p.week_pick && <span className="chip club"><Icon name="trophy" size={11} /> Proyecto de la semana</span>}
          {p.pick && <span className="chip cat"><Icon name="star" size={11} /> Selección 3DBAT</span>}
          <span className="chip muted">{p.category_name}</span>
          <span className={'chip ' + (p.state === 'wip' ? 'sample' : 'ok')}>{p.state === 'wip' ? 'En desarrollo' : 'Terminado'}</span>
        </div>
        <h1 className="fo-title">{p.title}</h1>
        <div className="cm-post-head"><a href={'#/batfeed/perfil/' + p.user_id}><Avatar author={author} size={36} uid={p.user_id} /></a>
          <div className="cm-p-who"><a href={'#/batfeed/perfil/' + p.user_id} className="cm-name"><Nm uid={p.user_id}>{author?.name || 'Maker'}</Nm></a>
            <span className="cm-date">{api.timeAgo(p.created_at)}{p.edited_at ? ' · editado' : ''}</span></div></div>
        {p.media.length > 0 && <div className={'ga-photos n' + Math.min(p.media.length, 4)}>{p.media.map((m, k) => { const u = api.imageUrl(m.path); return (
          <button type="button" key={m.path} onClick={() => setZoom(k)} aria-label="Ampliar foto"><img src={u} alt="" loading="lazy" decoding="async" /></button>); })}</div>}
        {api.youtubeId(p.video_url) && <div className="cm-video"><iframe src={`https://www.youtube-nocookie.com/embed/${api.youtubeId(p.video_url)}?rel=0`} title="Video del proyecto" loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>}
        <p className="cm-body">{p.description}</p>
        {specs.length > 0 && <dl className="ga-specs">{specs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
        {p.tags.length > 0 && <div className="chips">{p.tags.map((t) => <span key={t} className="chip muted">#{t}</span>)}</div>}
        {p.links.length > 0 && <div className="ga-links">{p.links.map((l) => safeUrl(l.url) && <a key={l.url} className="btn ghost" href={safeUrl(l.url)} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} /> {l.label}</a>)}</div>}
        {d.files.length > 0 && (
          <div className="ga-files"><h3>Archivos para descargar</h3>
            {d.files.map((f) => (
              <div key={f.id} className="ga-file"><Icon name="box" size={18} /><div><b>{f.name}</b><small className="cm-date">{f.ext.toUpperCase()} · {api.formatBytes(f.size_bytes)} · {f.downloads} descargas{!f.downloadable ? ' · privado (solo vos)' : ''}</small></div>
                <button type="button" className="btn ghost" disabled={dl === f.id} onClick={() => download(f)}>{dl === f.id ? 'Preparando…' : 'Descargar'}</button></div>))}
            <small className="cm-date">El autor confirmó que tiene derecho a compartir estos archivos. Usalos respetando su licencia.</small></div>
        )}
        {p.status === 'published' && <Reactions p={p} onChange={patch} />}
        <div className="fo-actions">
          {p.mine && <a className="cm-link" href={'#/galeria/editar/' + p.id}>Editar</a>}
          {p.mine && <button type="button" className="cm-link danger" onClick={() => setDel(true)}>Eliminar</button>}
          {!p.mine && p.status === 'published' && <button type="button" className="cm-link" onClick={() => setReport(true)}>Reportar</button>}
          {isAdmin && p.status === 'published' && <button type="button" className="cm-link" onClick={() => run(() => api.galleryFeature({ id: p.id, pick: !p.pick }))}>{p.pick ? 'Quitar de Selección 3DBAT' : 'Agregar a Selección 3DBAT'}</button>}
          {isAdmin && p.status === 'published' && <button type="button" className="cm-link" onClick={() => run(() => api.galleryFeature({ id: p.id, week: !p.week_pick }))}>{p.week_pick ? 'Quitar proyecto de la semana' : 'Elegir como proyecto de la semana'}</button>}
          {canEdit && !p.mine && p.status === 'published' && <button type="button" className="cm-link danger" onClick={() => run(async () => { await api.modPostSet({ id: p.id, status: 'hidden' }); navigate('/galeria'); })}>Ocultar (mod)</button>}
        </div>
        {error && <div className="feedback-error">{error}</div>}
        {p.status === 'published' && <CommentsPanel postId={p.id} canMod={canEdit} />}
      </article>
      {zoom !== null && <Lightbox images={p.media.map((m) => api.imageUrl(m.path))} index={zoom} onClose={() => setZoom(null)} />}
      {report && <ReportModal type="post" id={p.id} onClose={() => setReport(false)} />}
      <Confirm open={del} danger title="¿Eliminar este proyecto?" text="Se borra con sus fotos, archivos, comentarios y reacciones. No se puede deshacer." yes="Eliminar"
        onYes={async () => { setDel(false); try { await api.deleteGalleryProject({ id: p.id, media: p.media, files: d.files }); navigate('/galeria'); } catch (e) { setError(e.message); } }} onNo={() => setDel(false)} />
    </>
  );
}

function Editor({ id, cats }) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState(!id);
  const [pid, setPid] = useState(id || null);
  const [f, setF] = useState({ title: '', description: '', category: cats[0]?.slug || '', tagsText: '', video: '', state: 'done', technology: '', machine: '', material: '', hours: '', params: [], links: [], license: false, in_feed: true });
  const [status, setStatus] = useState('draft');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const up = useUploads(user.id, 4, []);
  const [initialMedia, setInitialMedia] = useState([]);
  const [removedList, setRemoved] = useState([]);
  const fileRef = useRef(null);
  const photoRef = useRef(null);
  const set = (x) => setF((cur) => ({ ...cur, ...x }));

  const loadProject = useCallback(async () => {
    const d = await api.galleryProject(id);
    if (!d || !d.project.mine) throw new Error('No encontramos ese proyecto entre los tuyos.');
    const p = d.project;
    setF({ title: p.title, description: p.description, category: p.category, tagsText: p.tags.map((t) => '#' + t).join(' '), video: p.video_url || '', state: p.state, technology: p.technology || '',
      machine: p.machine || '', material: p.material || '', hours: p.build_minutes == null ? '' : String(Math.round((p.build_minutes / 60) * 100) / 100),
      params: Object.entries(p.params || {}).map(([k, v]) => ({ k, v })), links: p.links || [], license: !!p.license_ack, in_feed: p.in_feed });
    setStatus(p.status); setFiles(d.files);
    return p;
  }, [id]);
  useEffect(() => { if (id) loadProject().then((p) => { setInitialMedia(p.media); setLoaded(true); }).catch((e) => { setError(e.message); setLoaded(true); }); }, [id, loadProject]);
  const media = [...initialMedia.filter((m) => !removedList.includes(m.path)), ...up.media];
  const dropPhoto = (path) => { if (initialMedia.some((m) => m.path === path)) setRemoved((r) => [...r, path]); else up.drop(path); };

  const minutes = f.hours === '' ? null : Math.round(Number(f.hours) * 60);
  const payload = (publish) => ({ id: pid, title: f.title.trim(), description: f.description.trim(), category: f.category, tags: api.parseTags(f.tagsText), media, video: f.video.trim() || null,
    state: f.state, technology: f.technology.trim(), machine: f.machine.trim(), material: f.material.trim(), minutes,
    params: Object.fromEntries(f.params.filter((r) => r.k.trim() && r.v.trim()).map((r) => [r.k.trim(), r.v.trim()])),
    links: f.links.filter((l) => l.label.trim() && l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })), license: f.license, in_feed: f.in_feed, publish });
  const videoOk = !f.video.trim() || !!api.youtubeId(f.video.trim());

  const save = async (publish) => {
    setBusy(true); setError(''); setOk('');
    try {
      const newId = await api.gallerySave(payload(publish));
      up.commit();
      api.removeImages(removedList);
      if (publish) { navigate('/galeria/p/' + newId); return; }
      setPid(newId); setOk('Guardado.');
      if (!id) navigate('/galeria/editar/' + newId);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const addFile = async (list) => {
    if (!pid) { setError('Guardá el borrador primero y después sumá los archivos.'); return; }
    setBusy(true); setError('');
    try { for (const file of [...list]) await api.uploadGalleryFile(user.id, pid, file, false); const d = await api.galleryProject(pid); setFiles(d.files); }
    catch (e) { setError(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const fileAct = async (fn) => { try { await fn(); const d = await api.galleryProject(pid); setFiles(d.files); setError(''); } catch (e) { setError(e.message); } };

  if (!loaded) return <div className="empty"><div className="spinner" /></div>;
  const publishedAlready = status === 'published';
  return (
    <form className="cm-composer card ga-editor" onSubmit={(e) => { e.preventDefault(); save(true); }}>
      <h2>{id ? (publishedAlready ? 'Editar proyecto' : 'Editar borrador') : 'Nuevo proyecto'}</h2>
      <label className="field"><span>Título del proyecto</span><div className="pink-input"><input value={f.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder="Ej.: Soporte de auriculares en PETG" /></div></label>
      <label className="field"><span>Descripción</span><div className="pink-input feedback-text"><textarea rows={5} maxLength={2000} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Contá cómo lo hiciste, qué problema resuelve, qué aprendiste…" /></div></label>
      <div><div className="cm-date">Fotos (hasta 4; la primera es la portada)</div>
        <ImageStrip media={media} onDrop={dropPhoto} />
        <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { up.pick(e.target.files); e.target.value = ''; }} />
        <button type="button" className="btn ghost" disabled={up.busy || media.length >= 4} onClick={() => photoRef.current?.click()}><Icon name="image" size={16} /> Agregar fotos ({media.length}/4)</button></div>
      <div className="cm-row">
        <label className="field"><span>Categoría</span><div className="pink-input"><select value={f.category} onChange={(e) => set({ category: e.target.value })}>{cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></div></label>
        <label className="field"><span>Estado del proyecto</span><div className="pink-input"><select value={f.state} onChange={(e) => set({ state: e.target.value })}><option value="done">Terminado</option><option value="wip">En desarrollo</option></select></div></label>
      </div>
      <label className="field"><span>Etiquetas (hasta 5)</span><div className="pink-input"><input value={f.tagsText} onChange={(e) => set({ tagsText: e.target.value })} placeholder="#petg #soporte #funcional" /></div></label>
      <label className="field"><span>Video de YouTube (opcional)</span><div className="pink-input"><input value={f.video} onChange={(e) => set({ video: e.target.value })} placeholder="https://youtu.be/…" inputMode="url" /></div>
        {!videoOk && <small className="cm-warn">Solo se aceptan enlaces de YouTube.</small>}</label>
      <details className="ga-tech" open={!!(f.technology || f.machine || f.material || f.hours || f.params.length)}>
        <summary>Datos técnicos (opcionales)</summary>
        <div className="cm-row">
          <label className="field"><span>Tecnología</span><div className="pink-input"><input value={f.technology} maxLength={60} onChange={(e) => set({ technology: e.target.value })} placeholder="FDM, resina, láser…" /></div></label>
          <label className="field"><span>Impresora o máquina</span><div className="pink-input"><input value={f.machine} maxLength={80} onChange={(e) => set({ machine: e.target.value })} placeholder="Bambu Lab A1" /></div></label>
          <label className="field"><span>Material</span><div className="pink-input"><input value={f.material} maxLength={80} onChange={(e) => set({ material: e.target.value })} placeholder="PETG" /></div></label>
          <label className="field"><span>Tiempo de fabricación (horas)</span><div className="pink-input"><input type="number" min="0" step="0.25" value={f.hours} onChange={(e) => set({ hours: e.target.value })} /></div></label>
        </div>
        <div className="cm-date">Parámetros (altura de capa, relleno, velocidad…)</div>
        {f.params.map((r, i) => (
          <div key={i} className="ga-kv"><div className="pink-input"><input value={r.k} maxLength={40} placeholder="Nombre" onChange={(e) => set({ params: f.params.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)) })} /></div>
            <div className="pink-input"><input value={r.v} maxLength={100} placeholder="Valor" onChange={(e) => set({ params: f.params.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)) })} /></div>
            <button type="button" className="mini-btn" onClick={() => set({ params: f.params.filter((_, j) => j !== i) })} aria-label="Quitar parámetro">×</button></div>))}
        {f.params.length < 20 && <button type="button" className="cm-link" onClick={() => set({ params: [...f.params, { k: '', v: '' }] })}>+ Agregar parámetro</button>}
      </details>
      <div><div className="cm-date">Enlaces relacionados (hasta 5, solo https)</div>
        {f.links.map((l, i) => (
          <div key={i} className="ga-kv"><div className="pink-input"><input value={l.label} maxLength={40} placeholder="Nombre" onChange={(e) => set({ links: f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></div>
            <div className="pink-input"><input value={l.url} maxLength={300} placeholder="https://…" inputMode="url" onChange={(e) => set({ links: f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} /></div>
            <button type="button" className="mini-btn" onClick={() => set({ links: f.links.filter((_, j) => j !== i) })} aria-label="Quitar enlace">×</button></div>))}
        {f.links.length < 5 && <button type="button" className="cm-link" onClick={() => set({ links: [...f.links, { label: '', url: 'https://' }] })}>+ Agregar enlace</button>}</div>

      <section className="ga-filesbox">
        <h3>Archivos 3D (opcional)</h3>
        <label className="nb-pref"><input type="checkbox" checked={f.license} onChange={(e) => set({ license: e.target.checked })} /> Confirmo que tengo derecho a compartir este contenido y sus archivos</label>
        {!pid ? <small className="cm-date">Guardá el borrador para poder subir archivos (STL, 3MF, OBJ, STEP, DXF, SVG · máx. {api.GALLERY_MAX_FILE_MB} MB).</small> : <>
          {files.map((fl) => (
            <div key={fl.id} className="ga-file"><Icon name="box" size={18} /><div><b>{fl.name}</b><small className="cm-date">{fl.ext.toUpperCase()} · {api.formatBytes(fl.size_bytes)} · {fl.downloads} descargas</small></div>
              <label className="nb-pref"><input type="checkbox" checked={fl.downloadable} onChange={(e) => fileAct(() => api.galleryFileSet(fl.id, { downloadable: e.target.checked }))} /> Permitir descarga</label>
              <button type="button" className="cm-link danger" onClick={() => fileAct(() => api.removeGalleryFile(fl.id))}>Quitar</button></div>))}
          <input ref={fileRef} type="file" accept=".stl,.3mf,.obj,.step,.stp,.dxf,.svg" multiple hidden onChange={(e) => addFile(e.target.files)} />
          <button type="button" className="btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="box" size={16} /> Subir archivo 3D</button>
          <small className="cm-date">Los archivos son privados hasta que marques “Permitir descarga”, y para eso tenés que confirmar que tenés derecho a compartirlos. Para que se guarde la confirmación, guardá el proyecto antes.</small></>}
      </section>
      {error && <div className="feedback-error">{error}</div>}
      {ok && <div className="cm-ok">{ok}</div>}
      <div className="modal-actions">
        <button type="button" className="btn text" onClick={() => navigate(id ? '/galeria/p/' + id : '/galeria')}>Cancelar</button>
        <span className="cm-spacer" />
        {!publishedAlready && <button type="button" className="btn ghost" disabled={busy || up.busy || f.title.trim().length < 5 || !f.description.trim() || !videoOk} onClick={() => save(false)}>Guardar borrador</button>}
        <button type="submit" className="btn primary" disabled={busy || up.busy || f.title.trim().length < 5 || !f.description.trim() || media.length < 1 || !videoOk}>
          <Icon name="send" size={16} /> {publishedAlready ? 'Guardar cambios' : busy ? 'Publicando…' : 'Publicar'}</button>
      </div>
    </form>
  );
}

export default function Gallery({ route }) {
  const { access, isMember, signIn, user } = useAuth();
  const flags = api.useCommunityFlags();
  const [cats, setCats] = useState(null);
  const [error, setError] = useState('');
  const [sub, arg] = [route.parts[1], route.parts[2]];
  const enabled = isMember && !!flags?.batgallery;
  useEffect(() => { if (enabled) api.galleryCategories().then(setCats).catch((e) => setError(e.missing ? 'La Galería Maker todavía no está instalada en la base (falta la migración 049).' : e.message)); }, [enabled]);
  const gate = gateView({ access, isMember, enabled, flagsLoaded: flags !== null, signIn, to: '/galeria', icon: 'image',
    title: 'GALERÍA MAKER', text: 'Mostrá lo que creaste con impresión 3D, CNC, láser y electrónica, y descubrí proyectos de otros makers.' });
  if (gate) return gate;
  if (error) return <div className="cm-page"><div className="gate card gate-wide"><p>{error}</p></div></div>;
  if (!cats) return <div className="empty"><div className="spinner" /></div>;
  return (
    <div className="cm-page ga-page">
      <PageHead icon="image" label="Comunidad" title="GALERÍA MAKER" text="Tus creaciones, tu portfolio y el lugar para descubrir proyectos de la comunidad.">
        {sub !== 'nuevo' && sub !== 'editar' && <a className="btn primary" href="#/galeria/nuevo"><Icon name="sparkles" size={16} /> Publicar proyecto</a>}
      </PageHead>
      {sub === 'nuevo' ? <Editor key="new" cats={cats} /> : sub === 'editar' ? <Editor key={arg} id={arg} cats={cats} /> : sub === 'p' ? <Detail id={arg} /> : <Home cats={cats} userId={user.id} />}
    </div>
  );
}
