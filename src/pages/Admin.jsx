import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useContent } from '../data/ContentContext.jsx';
import { MEDIA_PLATFORMS } from '../data/sample.js';
import { PLATFORM_LABEL } from '../data/tutorials.js';
import AdminMembers from './AdminMembers.jsx';
import AdminComments from './AdminComments.jsx';
import AdminActivity from './AdminActivity.jsx';
import { navigate } from '../lib/router.js';
import { matches } from '../lib/text.js';
import { isHttpUrl, parseMediaUrl, slugify, thumbSrc, ytThumb } from '../lib/media.js';
import * as api from '../lib/adminApi.js';
import Icon from '../components/Icon.jsx';
import AccessPanel from '../components/AccessPanel.jsx';
import { Confirm, Empty, Options, PageHead, SearchInput } from '../components/ui.jsx';
import { ContentCard, ToolCard } from '../components/Cards.jsx';

// =====================================================================
// PANEL ADMIN DE BATBOX (#/admin)
//   #/admin                 → contenidos, redes y miembros
//   #/admin/nuevo/<tipo>    → crear
//   #/admin/editar/<slug>   → editar
// Mostrar este panel es solo interfaz: cada cambio lo valida Supabase
// con is_admin() (RLS). Sin permiso, no se guarda nada.
// =====================================================================

const KINDS = [
  { value: 'tool', label: 'Herramientas', one: 'Herramienta', icon: 'wrench' },
  { value: 'tutorial', label: 'Tutoriales', one: 'Tutorial', icon: 'graduation' },
  { value: 'resource', label: 'Recursos', one: 'Recurso', icon: 'library' },
  { value: 'news', label: 'Novedades', one: 'Novedad', icon: 'newspaper' },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.value, k]));
const STATUS = {
  published: { label: 'Publicado', cls: 'ok' },
  draft: { label: 'Borrador', cls: 'sample' },
  archived: { label: 'Archivado', cls: 'muted' },
};
const TOOL_ICONS = ['calculator', 'pin', 'wrench', 'box', 'sparkles', 'graduation', 'library', 'video', 'link', 'star', 'book', 'edit', 'users', 'crown', 'shield'];
const SOCIAL_ICONS = ['instagram', 'youtube', 'message', 'users', 'link'];

// ---------------------------------------------------------------------
export default function Admin({ route }) {
  const { canEdit, access, simulated } = useAuth();

  if (!canEdit) {
    if (access === 'loading') return <div className="narrow"><AccessPanel /></div>;
    return (
      <div className="narrow">
        <div className="gate card">
          <div className="big-ico tone-err"><Icon name="shield" size={26} /></div>
          <h2>Sin permisos</h2>
          <p className="gate-text">Esta sección es solo para el equipo de 3DBAT (administradores y editores).</p>
          <div className="gate-actions"><a className="btn ghost wide" href="#/">Volver al inicio</a></div>
        </div>
      </div>
    );
  }

  const [, sub, arg] = route.parts;
  return (
    <div className="admin">
      {simulated && <div className="admin-warn"><Icon name="alert" size={18} /> Modo simulación: podés recorrer el panel, pero para guardar tenés que iniciar sesión de verdad.</div>}
      <MigrationNotice />
      {sub === 'nuevo' && <Editor key={'new-' + arg} kind={KIND[arg] ? arg : 'tutorial'} />}
      {sub === 'editar' && <Editor key={'edit-' + arg} slug={arg} />}
      {!sub && <Dashboard initialTab={{ miembros: 'members', actividad: 'activity', comentarios: 'comments', redes: 'socials' }[route.query.tab] || 'content'} />}
    </div>
  );
}

function MigrationNotice() {
  const { source, error, loading } = useContent();
  if (loading || source === 'db') return null;
  const missing = error?.code === '42P01' || /bb_content/.test(error?.message || '');
  return (
    <div className="admin-warn err">
      <Icon name="alert" size={18} />
      {missing
        ? <span>Falta correr la migración en Supabase (<b>supabase/001_batbox_contenidos.sql</b>). Mientras tanto la web usa los datos locales y no se puede editar.</span>
        : <span>No se pudo leer el contenido desde Supabase: {error?.message || 'error de conexión'}.</span>}
    </div>
  );
}

// ---------------------------------------------------------------------
// LISTADO
// ---------------------------------------------------------------------
function Dashboard({ initialTab }) {
  const { isAdmin } = useAuth();
  // Miembros y Actividad muestran datos personales: solo admins (los editores no).
  const [tab, setTab] = useState(!isAdmin && ['members', 'activity'].includes(initialTab) ? 'content' : initialTab);
  const { socials } = useContent();
  return (
    <div>
      <PageHead icon="shield" label="ADMINISTRACIÓN" title={isAdmin ? 'Panel admin' : 'Panel de editor'}
        text={isAdmin ? 'Contenidos, miembros de Makers Club y redes de BATBOX, todo en un solo lugar.' : 'Contenidos, comentarios y redes de BATBOX.'} />
      <div className="view-toggle admin-tabs">
        <button className={'seg' + (tab === 'content' ? ' active' : '')} onClick={() => setTab('content')}>Contenidos</button>
        {isAdmin && <button className={'seg' + (tab === 'members' ? ' active' : '')} onClick={() => setTab('members')}>Miembros</button>}
        {isAdmin && <button className={'seg' + (tab === 'activity' ? ' active' : '')} onClick={() => setTab('activity')}>Actividad</button>}
        <button className={'seg' + (tab === 'comments' ? ' active' : '')} onClick={() => setTab('comments')}>Comentarios</button>
        <button className={'seg' + (tab === 'socials' ? ' active' : '')} onClick={() => setTab('socials')}>Redes</button>
      </div>
      {tab === 'content' && <ContentList />}
      {tab === 'socials' && <SocialsEditor key={JSON.stringify(socials)} />}
      {tab === 'members' && isAdmin && <AdminMembers />}
      {tab === 'comments' && <AdminComments />}
      {tab === 'activity' && isAdmin && <AdminActivity />}
    </div>
  );
}

function ContentList() {
  const { adminRows, source, reload } = useContent();
  const { notify } = useAuth();
  const [kind, setKind] = useState('tutorial');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const ofKind = useMemo(() => adminRows.filter((r) => r.kind === kind), [adminRows, kind]);
  const list = ofKind.filter((r) => (status === 'all' || r.pubStatus === status) && matches(r, q));
  const canReorder = !q && status === 'all';
  const counts = Object.fromEntries(KINDS.map((k) => [k.value, adminRows.filter((r) => r.kind === k.value).length]));

  const run = async (fn, okText) => {
    setBusy(true);
    try { await fn(); notify('ok', okText); reload(); } catch (e) { notify('err', e.message); } finally { setBusy(false); }
  };
  const move = (idx, dir) => {
    const arr = [...ofKind];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    run(() => api.saveOrder(arr), 'Orden guardado');
  };

  if (source !== 'db') return <Empty icon="alert" title="Edición no disponible" text="El contenido todavía no está en Supabase." />;

  return (
    <div>
      <div className="filters card">
        <div className="admin-kinds">
          {KINDS.map((k) => (
            <button key={k.value} className={'opt' + (kind === k.value ? ' active' : '')} onClick={() => setKind(k.value)}>
              {k.label} <em>{counts[k.value]}</em>
            </button>
          ))}
        </div>
        <div className="filter-row">
          <SearchInput value={q} onChange={setQ} placeholder={`Buscar en ${KIND[kind].label.toLowerCase()}…`} />
          <div className="view-toggle">
            {[['all', 'Todos'], ['published', 'Publicados'], ['draft', 'Borradores'], ['archived', 'Archivados']].map(([v, l]) => (
              <button key={v} className={'seg' + (status === v ? ' active' : '')} onClick={() => setStatus(v)}>{l}</button>
            ))}
          </div>
          <a className="btn primary" href={'#/admin/nuevo/' + kind}><Icon name="sparkles" size={16} /> Nuevo {KIND[kind].one.toLowerCase()}</a>
        </div>
      </div>

      {!list.length && <Empty icon={KIND[kind].icon} title="No hay nada acá todavía" text={`Creá ${kind === 'news' ? 'la primera novedad' : 'el primer ' + KIND[kind].one.toLowerCase()} con el botón "Nuevo".`} />}

      <div className="admin-list">
        {list.map((r) => {
          const idx = ofKind.indexOf(r);
          const st = STATUS[r.pubStatus];
          return (
            <div key={r.dbId} className={'admin-row' + (r.pubStatus !== 'published' ? ' dim' : '')}>
              <div className="ar-order">
                <button className="mini-btn" disabled={busy || !canReorder || idx === 0} onClick={() => move(idx, -1)} title="Subir">▲</button>
                <button className="mini-btn" disabled={busy || !canReorder || idx === ofKind.length - 1} onClick={() => move(idx, 1)} title="Bajar">▼</button>
              </div>
              <div className={'ar-thumb k-' + r.kind + (r.platform ? ' p-' + r.platform : '')}>
                {thumbSrc(r) ? <img src={thumbSrc(r)} alt="" referrerPolicy="no-referrer" /> : <Icon name={r.kind === 'tool' ? r.icon : (MEDIA_PLATFORMS[r.platform]?.icon || KIND[r.kind].icon)} size={20} />}
              </div>
              <a className="ar-main" href={'#/admin/editar/' + r.id}>
                <strong>{r.title}</strong>
                <span className="chips">
                  <span className={'chip ' + st.cls}>{st.label}</span>
                  <span className={'chip ' + (r.access === 'club' ? 'club' : 'free')}>{r.access === 'club' ? 'Makers Club' : 'Gratis'}</span>
                  {r.category && <span className="chip cat">{r.category}</span>}
                  {r.platform && r.kind !== 'tool' && <span className="chip">{(r.kind === 'video' ? MEDIA_PLATFORMS[r.platform]?.label : PLATFORM_LABEL[r.platform]) || r.platform}</span>}
                </span>
              </a>
              <div className="ar-actions">
                <button className={'mini-btn' + (r.featured ? ' on' : '')} disabled={busy} title={r.featured ? 'Quitar de destacados' : 'Destacar'}
                  onClick={() => run(() => api.setFields(r.dbId, { featured: !r.featured }), r.featured ? 'Ya no está destacado' : 'Destacado')}>
                  <Icon name="star" size={15} />
                </button>
                <button className="chip-btn" disabled={busy}
                  onClick={() => run(() => api.setFields(r.dbId, { status: r.pubStatus === 'published' ? 'draft' : 'published' }),
                    r.pubStatus === 'published' ? 'Pasado a borrador (ya no se ve en la web)' : 'Publicado')}>
                  {r.pubStatus === 'published' ? 'Ocultar' : 'Publicar'}
                </button>
                <a className="mini-btn" href={'#/admin/editar/' + r.id} title="Editar"><Icon name="edit" size={15} /></a>
                <button className="mini-btn danger" disabled={busy} title="Borrar" onClick={() => setToDelete(r)}><Icon name="x" size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {!canReorder && list.length > 1 && <p className="hint-small">Para cambiar el orden, borrá la búsqueda y elegí "Todos".</p>}

      <Confirm open={!!toDelete} title="¿Borrar este contenido?" danger
        text={toDelete ? `"${toDelete.title}" se va a borrar para siempre. Si solo querés que no se vea, usá "Ocultar".` : ''}
        yes="Borrar" onNo={() => setToDelete(null)}
        onYes={() => { const r = toDelete; setToDelete(null); run(() => api.deleteContent(r.dbId), 'Borrado'); }} />
    </div>
  );
}

// ---------------------------------------------------------------------
// EDITOR
// ---------------------------------------------------------------------
function emptyForm(kind, rows) {
  const same = rows.filter((r) => r.kind === kind).map((r) => r.sortOrder);
  // Herramientas al final; el resto arriba de todo (lo más nuevo primero).
  const sort = !same.length ? 10 : kind === 'tool' ? Math.max(...same) + 10 : Math.min(...same) - 10;
  return {
    kind, title: '', description: '', category: '', access: 'free', status: 'draft', featured: false, sort_order: sort,
    platform: null, thumb_url: '', icon: kind === 'tool' ? 'wrench' : null, tool_status: kind === 'tool' ? 'available' : null,
    url: '', youtube_id: null, instagram_code: null, embeddable: true, body: '',
  };
}

function formFromRow(r) {
  return {
    kind: r.kind, title: r.title, description: r.description, category: r.category, access: r.access, status: r.pubStatus,
    featured: r.featured, sort_order: r.sortOrder, platform: r.platform, thumb_url: r.thumb || '', icon: r.kind === 'tool' ? r.icon : null,
    tool_status: r.kind === 'tool' ? r.status : null,
    url: r.url || '', youtube_id: r.rawYoutubeId, instagram_code: r.instagramCode, embeddable: r.embeddable, body: r.body || '',
  };
}

function Field({ label, hint, children }) {
  return (
    <label className="ed-field">
      <span className="ed-label">{label}</span>
      {children}
      {hint && <span className="ed-hint">{hint}</span>}
    </label>
  );
}

function Editor({ slug, kind: newKind }) {
  const { adminRows, loading, reload } = useContent();
  const { notify } = useAuth();
  const row = slug ? adminRows.find((r) => r.id === slug) : null;
  const isNew = !slug;
  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const autoFilledId = useRef(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (form || loading) return;
    const f = isNew ? emptyForm(newKind, adminRows) : row ? formFromRow(row) : null;
    if (f) { setForm(f); setInitial(JSON.stringify(f)); }
  }, [form, loading, isNew, newKind, row, adminRows]);

  if (loading && !form) return <div className="empty"><div className="spinner" /></div>;
  if (!isNew && !row && !form) return <Empty icon="alert" title="No encontramos ese contenido" text="Puede que se haya borrado." />;
  if (!form) return null;

  const k = KIND[form.kind];
  const dirty = JSON.stringify(form) !== initial;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const categories = [...new Set(adminRows.filter((r) => r.kind === form.kind).map((r) => r.category).filter(Boolean))];

  const onUrl = (url) => {
    const m = parseMediaUrl(url);
    const autoThumb = !form.thumb_url || form.thumb_url === (form.youtube_id && ytThumb(form.youtube_id));
    set({
      url,
      // Recursos y novedades: un enlace común no es "plataforma" (sin play ni etiqueta).
      platform: form.kind === 'tool' || (m.platform === 'other' && ['resource', 'news'].includes(form.kind)) ? null : m.platform,
      youtube_id: m.youtubeId, instagram_code: m.instagramCode,
      thumb_url: autoThumb ? (m.thumb || '') : form.thumb_url,
    });
    // Contenido nuevo: al pegar un enlace de YouTube/Instagram se completan solos
    // los campos vacíos (una sola vez por enlace).
    const mediaId = m.youtubeId || m.instagramCode;
    if (isNew && form.kind !== 'tool' && mediaId && autoFilledId.current !== mediaId) {
      autoFilledId.current = mediaId;
      fillFromLink(url, false);
    }
  };

  // Página web pegada entera en un contenido nuevo (campo vacío): se completa sola,
  // igual que YouTube/Instagram. Al escribir a mano no, para no leer enlaces a medias.
  const onPasteUrl = (e) => {
    const pasted = e.clipboardData.getData('text').trim();
    const m = parseMediaUrl(pasted);
    if (!isNew || form.kind === 'tool' || form.url.trim() || !isHttpUrl(pasted) || m.youtubeId || m.instagramCode) return;
    if (autoFilledId.current === pasted) return;
    autoFilledId.current = pasted;
    setTimeout(() => fillFromLink(pasted, false), 0);
  };

  // Trae título, descripción y miniatura desde el enlace (Edge Function bb-link-preview).
  // overwrite=true (botón) reemplaza esos campos; false (automático) solo completa los vacíos.
  const fillFromLink = async (url = form.url, overwrite = true) => {
    const m = parseMediaUrl(url);
    if (!m.youtubeId && !m.instagramCode && !isHttpUrl(url)) { notify('err', 'Pegá un enlace que empiece con https://'); return; }
    setFetchingMeta(true);
    try {
      const { data, partial } = await api.fetchLinkPreview(url, m);
      setForm((f) => {
        const pick = (field, value) => (value && (overwrite || !String(f[field] || '').trim()) ? value : f[field]);
        return {
          ...f,
          title: pick('title', data.title),
          description: pick('description', data.description),
          thumb_url: pick('thumb_url', data.thumb),
          embeddable: typeof data.embeddable === 'boolean' ? data.embeddable : f.embeddable,
        };
      });
      if (partial && !data.title) notify('err', 'Solo pude poner la miniatura. Para traer título y descripción falta instalar la función bb-link-preview en Supabase.');
      else notify('ok', partial
        ? 'Completé título y miniatura. Para traer también la descripción falta instalar la función en Supabase.'
        : (data.warning || 'Datos completados desde el enlace: revisalos y editá lo que quieras.'));
    } catch (e) {
      notify('err', e.message);
    } finally {
      setFetchingMeta(false);
    }
  };

  const errors = [];
  if (!form.title.trim()) errors.push('Poné un título.');
  if (form.url && !isHttpUrl(form.url)) errors.push('El enlace tiene que empezar con https://');
  if (form.thumb_url && !isHttpUrl(form.thumb_url) && !/^thumbs\//.test(form.thumb_url)) errors.push('La miniatura tiene que ser un enlace https://');

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await api.uploadImage(file, slugify(form.title || 'imagen'));
      set({ thumb_url: url });
      notify('ok', 'Imagen subida. Acordate de tocar Guardar.');
    } catch (err) { notify('err', err.message); } finally { setUploading(false); }
  };

  const leave = () => (dirty ? setConfirmLeave(true) : navigate('/admin'));

  const save = async () => {
    if (errors.length) { notify('err', errors[0]); return; }
    setSaving(true);
    const content = {
      kind: form.kind, title: form.title.trim(), description: form.description.trim(), category: form.category.trim(),
      access: form.access, status: form.status, featured: form.featured, sort_order: Number(form.sort_order) || 0,
      platform: form.kind === 'tool' ? null : form.platform, thumb_url: form.thumb_url.trim() || null,
      icon: form.kind === 'tool' ? form.icon : null, tool_status: form.kind === 'tool' ? form.tool_status : null,
    };
    const body = {
      url: form.url.trim() || null, youtube_id: form.youtube_id, instagram_code: form.instagram_code,
      embeddable: form.embeddable, body: form.body,
    };
    try {
      if (isNew) await api.createContent({ ...content, slug: slugify(form.title) }, body);
      else await api.updateContent(row.dbId, content, body);
      notify('ok', form.status === 'published' ? 'Guardado y publicado' : 'Guardado como ' + STATUS[form.status].label.toLowerCase());
      reload();
      navigate('/admin');
    } catch (e) {
      notify('err', e.message);
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    try { await api.deleteContent(row.dbId); notify('ok', 'Borrado'); reload(); navigate('/admin'); } catch (e) { notify('err', e.message); }
  };

  // Vista previa con la misma tarjeta que usa la web.
  const preview = {
    id: slug || 'nuevo', kind: form.kind, title: form.title || 'Título', name: form.title || 'Nombre', description: form.description,
    category: form.category, access: form.access, featured: form.featured, platform: form.platform,
    platformLabel: form.kind === 'video' ? MEDIA_PLATFORMS[form.platform]?.label : PLATFORM_LABEL[form.platform],
    thumb: form.thumb_url || null, instagramCode: form.instagram_code, icon: form.icon, status: form.tool_status, url: form.url, sample: false, hasBody: true,
  };

  return (
    <div className="editor">
      <button className="back" onClick={leave}><Icon name="arrowLeft" size={16} /> Volver al panel</button>
      <div className="ed-head">
        <div>
          <div className="section-label">{isNew ? 'NUEVO' : 'EDITAR'} · {k.one.toUpperCase()}</div>
          <h1>{form.title || (isNew ? `Nuevo ${k.one.toLowerCase()}` : 'Sin título')}</h1>
        </div>
        <div className="ed-actions">
          {!isNew && row?.pubStatus === 'published' && <a className="btn ghost" href={form.kind === 'tool' ? '#/tools' : '#/ver/' + slug} target="_blank" rel="noopener">Ver en la web <Icon name="external" size={14} /></a>}
          <button className="btn primary" onClick={save} disabled={saving || (!dirty && !isNew)}>
            {saving ? 'Guardando…' : <><Icon name="check" size={16} /> Guardar</>}
          </button>
        </div>
      </div>

      <div className="ed-grid">
        <div className="card ed-form">
          <Field label="Título *">
            <div className="pink-input"><input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ej: Cambio de boquilla en 1 minuto" /></div>
          </Field>
          <Field label="Descripción" hint="Una o dos líneas: es lo que se ve en la tarjeta.">
            <div className="pink-input"><textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} /></div>
          </Field>
          <Field label={form.kind === 'tool' ? 'Enlace de la herramienta' : 'Enlace (YouTube, Instagram o página web)'}
            hint={form.kind === 'tool' ? 'La dirección que abre el botón "Abrir herramienta".' : 'Pegá el enlace y se completan solos título, descripción y miniatura (YouTube, Instagram o cualquier página).'}>
            <div className="pink-input"><input value={form.url} onChange={(e) => onUrl(e.target.value)} onPaste={onPasteUrl} placeholder="https://…" /></div>
          </Field>
          {form.kind !== 'tool' && (form.youtube_id || form.instagram_code || isHttpUrl(form.url)) && (
            <button type="button" className="magic-btn" onClick={() => fillFromLink()} disabled={fetchingMeta}
              title="Trae título, descripción y miniatura del enlace (reemplaza lo que haya en esos campos)">
              {fetchingMeta ? <><span className="spinner xs" /> Buscando datos del enlace…</> : <><Icon name="sparkles" size={16} /> Completar con el enlace</>}
            </button>
          )}
          {form.kind !== 'tool' && form.platform && (
            <div className="ed-detected">
              <Icon name={MEDIA_PLATFORMS[form.platform]?.icon || 'link'} size={16} />
              Detectado: <b>{PLATFORM_LABEL[form.platform] || MEDIA_PLATFORMS[form.platform]?.label || 'Otro enlace'}</b>
              {((form.youtube_id && form.embeddable) || form.instagram_code) && <span className="muted">· se puede ver dentro de BATBOX</span>}
              {form.youtube_id && !form.embeddable && <span className="muted">· se abre en YouTube</span>}
            </div>
          )}
          {form.platform === 'instagram' && !thumbSrc({ thumb: form.thumb_url, instagramCode: form.instagram_code }) && (
            <div className="ed-tip"><Icon name="alert" size={16} /> Todavía no hay portada. Tocá <b>Completar con el enlace</b> para traerla de Instagram; si no funciona, hacé una captura de la portada del reel y subila en <b>Miniatura</b>.</div>
          )}
          {form.youtube_id && (
            <label className="toggle-row">
              <input type="checkbox" checked={!form.embeddable} onChange={(e) => set({ embeddable: !e.target.checked })} />
              <span className="switch" />
              <span>El video tiene la inserción desactivada en YouTube (mostrar miniatura y abrir en YouTube)</span>
            </label>
          )}
          {form.kind === 'video' && (
            <Field label="Plataforma">
              <Options value={form.platform || 'other'} onChange={(v) => set({ platform: v })}
                options={Object.entries(MEDIA_PLATFORMS).map(([value, p]) => ({ value, label: p.label }))} />
            </Field>
          )}
          <div className="ed-two">
            <Field label="Categoría" hint={categories.length ? 'Elegí una existente o escribí una nueva.' : 'Escribí una categoría.'}>
              <div className="pink-input">
                <input list={'cats-' + form.kind} value={form.category} onChange={(e) => set({ category: e.target.value })} placeholder="Ej: Slicer" />
                <datalist id={'cats-' + form.kind}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            </Field>
            <Field label="Miniatura (opcional)" hint="Con YouTube se completa sola. Para Instagram subí la portada del reel.">
              <div className="thumb-input">
                <div className="pink-input"><input value={form.thumb_url} onChange={(e) => set({ thumb_url: e.target.value })} placeholder="https://…jpg" /></div>
                <label className={'chip-btn upload-btn' + (uploading ? ' busy' : '')}>
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onUpload} disabled={uploading} />
                  {uploading ? 'Subiendo…' : 'Subir imagen'}
                </label>
              </div>
            </Field>
          </div>
          {form.kind === 'tool' && (
            <>
              <Field label="Estado de la herramienta">
                <div className="view-toggle">
                  <button className={'seg' + (form.tool_status === 'available' ? ' active' : '')} onClick={() => set({ tool_status: 'available' })}>Disponible</button>
                  <button className={'seg' + (form.tool_status === 'soon' ? ' active' : '')} onClick={() => set({ tool_status: 'soon' })}>Próximamente</button>
                </div>
              </Field>
              <Field label="Ícono">
                <div className="icon-pick">
                  {TOOL_ICONS.map((i) => (
                    <button key={i} type="button" className={'icon-btn sm' + (form.icon === i ? ' active' : '')} onClick={() => set({ icon: i })} title={i}><Icon name={i} size={18} /></button>
                  ))}
                </div>
              </Field>
            </>
          )}
          <Field label="Texto completo (opcional)" hint="Pasos, notas o lo que quieras mostrar en la página del contenido.">
            <div className="pink-input"><textarea rows={5} value={form.body} onChange={(e) => set({ body: e.target.value })} /></div>
          </Field>
        </div>

        <div className="ed-side">
          <div className="card ed-box">
            <div className="section-label">PUBLICACIÓN</div>
            <div className="view-toggle full">
              {Object.entries(STATUS).map(([v, s]) => (
                <button key={v} className={'seg' + (form.status === v ? ' active' : '')} onClick={() => set({ status: v })}>{s.label}</button>
              ))}
            </div>
            <p className="ed-hint">{form.status === 'published' ? 'Se ve en la web.' : form.status === 'draft' ? 'Solo lo ven los admins.' : 'Guardado pero oculto.'}</p>

            <div className="section-label">ACCESO</div>
            <div className="view-toggle full">
              <button className={'seg' + (form.access === 'free' ? ' active' : '')} onClick={() => set({ access: 'free' })}>Gratis</button>
              <button className={'seg' + (form.access === 'club' ? ' active' : '')} onClick={() => set({ access: 'club' })}>Makers Club</button>
            </div>
            <p className="ed-hint">{form.access === 'club' ? 'Todos ven la tarjeta, pero el enlace/video solo los miembros aprobados.' : 'Cualquiera puede verlo, sin iniciar sesión.'}</p>

            <label className="toggle-row">
              <input type="checkbox" checked={form.featured} onChange={(e) => set({ featured: e.target.checked })} />
              <span className="switch" /><span>Destacado en el inicio</span>
            </label>
          </div>

          <div className="ed-preview">
            <div className="section-label">VISTA PREVIA</div>
            {form.kind === 'tool' ? <ToolCard tool={preview} /> : <div className="ed-preview-card"><ContentCard item={preview} /></div>}
          </div>

          {!isNew && <button className="btn text wide danger-text" onClick={() => setConfirmDelete(true)}><Icon name="x" size={14} /> Borrar este contenido</button>}
        </div>
      </div>

      <Confirm open={confirmLeave} title="¿Salir sin guardar?" text="Los cambios que hiciste se van a perder."
        yes="Salir sin guardar" onNo={() => setConfirmLeave(false)} onYes={() => navigate('/admin')} />
      <Confirm open={confirmDelete} danger title="¿Borrar este contenido?" text={`"${form.title}" se va a borrar para siempre.`}
        yes="Borrar" onNo={() => setConfirmDelete(false)} onYes={remove} />
    </div>
  );
}

// ---------------------------------------------------------------------
// REDES SOCIALES
// ---------------------------------------------------------------------
function SocialsEditor() {
  const { socials, source, reload } = useContent();
  const { notify } = useAuth();
  const [list, setList] = useState(() => socials.map((s) => ({ ...s, url: s.url || '' })));
  const [saving, setSaving] = useState(false);
  const set = (i, patch) => setList((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  if (source !== 'db') return <Empty icon="alert" title="Edición no disponible" text="Falta correr la migración en Supabase." />;

  const save = async () => {
    const bad = list.find((s) => s.url && !isHttpUrl(s.url));
    if (bad) { notify('err', `El enlace de ${bad.label} tiene que empezar con https://`); return; }
    setSaving(true);
    try {
      await api.saveSetting('socials', list.map((s, i) => ({ ...s, id: s.id || 'red-' + i, url: s.url.trim() || null })));
      notify('ok', 'Redes guardadas');
      reload();
    } catch (e) { notify('err', e.message); } finally { setSaving(false); }
  };

  return (
    <div className="card socials-editor">
      <p className="ed-hint">Estos enlaces aparecen en el inicio, en Comunidad y en el pie de página. Las redes sin enlace se muestran como "Enlace pendiente".</p>
      {list.map((s, i) => (
        <div key={i} className="social-edit-row">
          <div className="icon-pick compact">
            {SOCIAL_ICONS.map((ic) => (
              <button key={ic} type="button" className={'icon-btn sm' + (s.icon === ic ? ' active' : '')} onClick={() => set(i, { icon: ic })}><Icon name={ic} size={16} /></button>
            ))}
          </div>
          <div className="pink-input"><input value={s.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Nombre" /></div>
          <div className="pink-input"><input value={s.handle} onChange={(e) => set(i, { handle: e.target.value })} placeholder="@usuario o texto" /></div>
          <div className="pink-input"><input value={s.url} onChange={(e) => set(i, { url: e.target.value })} placeholder="https://…" /></div>
          <button className="mini-btn danger" title="Quitar" onClick={() => setList((l) => l.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
        </div>
      ))}
      <div className="socials-actions">
        <button className="chip-btn" onClick={() => setList((l) => [...l, { id: 'red-' + Date.now(), label: '', handle: '', icon: 'link', url: '' }])}>+ Agregar red</button>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : <><Icon name="check" size={16} /> Guardar redes</>}</button>
      </div>
    </div>
  );
}
