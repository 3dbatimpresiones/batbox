import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import { Confirm, Empty, Options, SearchInput } from '../components/ui.jsx';
import * as api from '../lib/catalogApi.js';
import '../styles/catalog.css';

// Panel del 3DBAT CATALOG (pestaña "Trabajos" del panel admin).
const STATUS = { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' };
const STATUS_OPTS = [{ value: 'all', label: 'Todos' }, ...Object.entries(STATUS).map(([value, label]) => ({ value, label }))];

export default function AdminTrabajos() {
  const { notify, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('products');
  const [editing, setEditing] = useState(null);

  const reload = useCallback(() => api.loadCatalog().then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { reload(); }, [reload]);

  const run = async (fn, ok) => {
    try { await fn(); if (ok) notify('ok', ok); await reload(); } catch (e) { notify('err', e.message); }
  };

  if (error) {
    const missing = /bb_cat_|does not exist|42P01/.test(error);
    return <div className="admin-warn err"><Icon name="alert" size={18} />
      <span>{missing ? <>Falta correr la migración <b>supabase/074_batbox_catalogo.sql</b>.</> : error}</span></div>;
  }
  if (!data) return <div className="cat-loading">Cargando…</div>;

  if (editing) {
    const product = editing === 'new' ? null : data.products.find((p) => p.id === editing);
    return <ProductEditor key={editing} product={product} categories={data.categories} run={run}
      onDone={(id) => setEditing(id || null)} />;
  }

  return (
    <div className="cat-admin">
      <div className="view-toggle">
        <button className={'seg' + (view === 'products' ? ' active' : '')} onClick={() => setView('products')}>Productos</button>
        <button className={'seg' + (view === 'categories' ? ' active' : '')} onClick={() => setView('categories')}>Categorías</button>
        {isAdmin && <button className={'seg' + (view === 'settings' ? ' active' : '')} onClick={() => setView('settings')}>Ajustes</button>}
        <a className="btn ghost" href="#/trabajos" target="_blank" rel="noreferrer"><Icon name="external" size={16} /> Ver catálogo</a>
      </div>
      {view === 'products' && <ProductList data={data} run={run} onEdit={setEditing} />}
      {view === 'categories' && <Categories categories={data.categories} products={data.products} run={run} />}
      {view === 'settings' && isAdmin && <Settings settings={data.settings} run={run} />}
    </div>
  );
}

// ---------------------------------------------------------------------
function ProductList({ data, run, onEdit }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [confirm, setConfirm] = useState(null);
  const all = data.products;
  const list = api.filterProducts(all, { q }).filter((p) => status === 'all' || p.status === status);
  const reorderable = !q && status === 'all';

  const move = (idx, dir) => {
    const ids = all.map((p) => p.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    run(() => api.reorderProducts(ids));
  };

  return (
    <div>
      <div className="filters card cat-filters">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar productos…" />
        <Options value={status} onChange={setStatus} options={STATUS_OPTS} />
        <button className="btn primary" onClick={() => onEdit('new')}><Icon name="sparkles" size={16} /> Nuevo producto</button>
      </div>
      {!list.length && <Empty icon="image" title="Sin productos" text="Creá el primero con «Nuevo producto»." />}
      <div className="cat-rows">
        {list.map((p) => {
          const idx = all.indexOf(p);
          return (
            <div key={p.id} className="cat-row card">
              <div className="cat-row-thumb">{p.cover ? <img src={api.photoUrl(p.cover)} alt="" /> : <Icon name="image" size={22} />}</div>
              <div className="cat-row-main">
                <b>{p.title}</b>
                <span className="cat-row-meta">
                  <span className={'cat-status s-' + p.status}>{STATUS[p.status]}</span>
                  {p.featured && <span className="cat-status s-feat">Destacado</span>}
                  {p.category_name || 'Sin categoría'} · {p.photos.length} foto{p.photos.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="cat-row-actions">
                {reorderable && <>
                  <button className="chip-btn" title="Subir" disabled={idx === 0} onClick={() => move(idx, -1)}>▲</button>
                  <button className="chip-btn" title="Bajar" disabled={idx === all.length - 1} onClick={() => move(idx, 1)}>▼</button>
                </>}
                <button className="chip-btn" onClick={() => onEdit(p.id)}>Editar</button>
                <button className="chip-btn" onClick={() => run(() => api.setProductFields(p.id, { featured: !p.featured }), p.featured ? 'Ya no es destacado.' : 'Marcado como destacado.')}>{p.featured ? 'Quitar ★' : '★'}</button>
                {p.status !== 'published'
                  ? <button className="chip-btn" onClick={() => run(() => api.setProductFields(p.id, { status: 'published' }), 'Publicado.')}>Publicar</button>
                  : <button className="chip-btn" onClick={() => run(() => api.setProductFields(p.id, { status: 'archived' }), 'Archivado.')}>Archivar</button>}
                <button className="chip-btn" onClick={() => run(() => api.duplicateProduct(p), 'Duplicado como borrador.')}>Duplicar</button>
                <button className="chip-btn danger" onClick={() => setConfirm(p)}>Eliminar</button>
              </div>
            </div>
          );
        })}
      </div>
      <Confirm open={!!confirm} danger title="¿Eliminar producto?" yes="Eliminar"
        text={confirm ? `Se borran «${confirm.title}» y sus fotos. No se puede deshacer (si dudás, archivalo).` : ''}
        onNo={() => setConfirm(null)} onYes={() => { const p = confirm; setConfirm(null); run(() => api.deleteProduct(p), 'Eliminado.'); }} />
    </div>
  );
}

// ---------------------------------------------------------------------
function ProductEditor({ product, categories, run, onDone }) {
  const { notify } = useAuth();
  const [f, setF] = useState(() => ({
    title: '', description: '', category_id: '', client: '', show_client: false, status: 'draft', featured: false, sort: 0, cover_path: null,
    ...(product || {}),
  }));
  const [photos, setPhotos] = useState(product?.photos || []);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const save = async () => {
    if (!f.title.trim()) { notify('err', 'Falta el título.'); return; }
    setBusy(true);
    try {
      const r = await api.saveProduct({ ...f, title: f.title.trim(), id: product?.id });
      notify('ok', product ? 'Cambios guardados.' : 'Producto creado. Ahora podés sumar fotos.');
      await run(async () => {});
      onDone(product ? null : r.id);
    } catch (e) { notify('err', e.message); } finally { setBusy(false); }
  };

  const upload = async (files) => {
    setBusy(true);
    try {
      let next = photos;
      for (const file of files) {
        const ph = await api.addPhoto(product.id, file, next.length);
        next = [...next, ph];
        setPhotos(next);
      }
      await run(async () => {});
    } catch (e) { notify('err', e.message); } finally { setBusy(false); }
  };
  const movePhoto = async (i, dir) => {
    const next = [...photos]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPhotos(next);
    await run(() => api.reorderPhotos(next));
  };
  const dropPhoto = async (ph) => {
    await run(() => api.removePhoto(ph), 'Foto borrada.');
    setPhotos((cur) => cur.filter((x) => x.id !== ph.id));
    if (f.cover_path === ph.path) setF((s) => ({ ...s, cover_path: null }));
  };

  return (
    <div className="cat-editor">
      <button className="cat-back" onClick={() => onDone(null)}>← Volver al listado</button>
      <h2>{product ? 'Editar producto' : 'Nuevo producto'}</h2>
      <div className="card cat-form">
        <label>Título<input className="pink-input" value={f.title} maxLength={120} onChange={set('title')} /></label>
        <label>Descripción<textarea className="pink-input" rows={5} value={f.description} maxLength={4000} onChange={set('description')} /></label>
        <div className="cat-form-2">
          <label>Categoría
            <select className="pink-input" value={f.category_id || ''} onChange={set('category_id')}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (oculta)'}</option>)}
            </select>
          </label>
          <label>Estado
            <select className="pink-input" value={f.status} onChange={set('status')}>
              {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <div className="cat-form-2">
          <label>Cliente (opcional)<input className="pink-input" value={f.client || ''} maxLength={120} onChange={set('client')} /></label>
          <label className="cat-check"><input type="checkbox" checked={f.show_client} onChange={set('show_client')} /> Mostrar el cliente en el catálogo</label>
        </div>
        <label className="cat-check"><input type="checkbox" checked={f.featured} onChange={set('featured')} /> Destacado</label>
        <div className="cat-actions">
          <button className="btn primary" disabled={busy} onClick={save}>{product ? 'Guardar cambios' : 'Crear producto'}</button>
        </div>
      </div>

      {product && (
        <div className="card cat-form">
          <h3>Fotos</h3>
          <p className="cat-hint">Se optimizan solas (WebP, máx. 2000 px). La marcada como portada es la que se ve en el listado; si no hay, se usa la primera.</p>
          <div className="cat-photos">
            {photos.map((ph, i) => (
              <div key={ph.id} className={'cat-ph' + ((f.cover_path || photos[0]?.path) === ph.path ? ' cover' : '')}>
                <img src={api.photoUrl(ph.path)} alt="" />
                <div className="cat-ph-bar">
                  <button className="chip-btn" disabled={i === 0} onClick={() => movePhoto(i, -1)}>◀</button>
                  <button className="chip-btn" disabled={i === photos.length - 1} onClick={() => movePhoto(i, 1)}>▶</button>
                  <button className="chip-btn" onClick={() => { setF((s) => ({ ...s, cover_path: ph.path })); run(() => api.setProductFields(product.id, { cover_path: ph.path }), 'Portada cambiada.'); }}>Portada</button>
                  <button className="chip-btn danger" onClick={() => dropPhoto(ph)}>✕</button>
                </div>
              </div>
            ))}
            <label className={'cat-ph cat-add' + (busy ? ' busy' : '')}>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={busy}
                onChange={(e) => { const fl = [...e.target.files]; e.target.value = ''; if (fl.length) upload(fl); }} />
              <Icon name="image" size={26} /><span>{busy ? 'Subiendo…' : 'Sumar fotos'}</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
function Categories({ categories, products, run }) {
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState(null);
  const count = (id) => products.filter((p) => p.category_id === id).length;
  const add = () => { const name = draft.trim(); if (!name) return; setDraft(''); run(() => api.saveCategory({ name, sort: categories.length * 10 }), 'Categoría creada.'); };
  const move = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= categories.length) return;
    const list = [...categories]; [list[i], list[j]] = [list[j], list[i]];
    run(async () => { for (let k = 0; k < list.length; k++) await api.saveCategory({ ...list[k], sort: k * 10 }); });
  };
  return (
    <div>
      <div className="filters card cat-filters">
        <input className="pink-input" placeholder="Nueva categoría (ej.: Llaveros)" value={draft} maxLength={60}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary" onClick={add}>Agregar</button>
      </div>
      {!categories.length && <Empty icon="grid" title="Sin categorías" />}
      <div className="cat-rows">
        {categories.map((c, i) => (
          <div key={c.id} className="cat-row card">
            <div className="cat-row-main">
              <input className="pink-input" defaultValue={c.name} maxLength={60}
                onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== c.name) run(() => api.saveCategory({ ...c, name }), 'Renombrada.'); }} />
              <span className="cat-row-meta">{count(c.id)} producto{count(c.id) === 1 ? '' : 's'}{c.active ? '' : ' · oculta'}</span>
            </div>
            <div className="cat-row-actions">
              <button className="chip-btn" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
              <button className="chip-btn" disabled={i === categories.length - 1} onClick={() => move(i, 1)}>▼</button>
              <button className="chip-btn" onClick={() => run(() => api.saveCategory({ ...c, active: !c.active }))}>{c.active ? 'Ocultar' : 'Mostrar'}</button>
              <button className="chip-btn danger" onClick={() => setConfirm(c)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
      <Confirm open={!!confirm} danger title="¿Eliminar categoría?" yes="Eliminar"
        text={confirm ? `Los ${count(confirm.id)} productos de «${confirm.name}» quedan sin categoría (no se borran).` : ''}
        onNo={() => setConfirm(null)} onYes={() => { const c = confirm; setConfirm(null); run(() => api.deleteCategory(c.id), 'Categoría eliminada.'); }} />
    </div>
  );
}

// ---------------------------------------------------------------------
function Settings({ settings, run }) {
  const [phone, setPhone] = useState(settings.whatsapp || api.DEFAULT_WHATSAPP);
  return (
    <div className="card cat-form">
      <label>WhatsApp para consultas (con código de país, sin + ni espacios)
        <input className="pink-input" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
      </label>
      <p className="cat-hint">Ejemplo Argentina: 549 + característica + número.</p>
      <div className="cat-actions">
        <button className="btn primary" onClick={() => run(() => api.saveSettings({ ...settings, whatsapp: phone }), 'Guardado.')}>Guardar</button>
        <a className="btn ghost" href={api.whatsappLink(phone)} target="_blank" rel="noreferrer">Probar link</a>
      </div>
    </div>
  );
}
