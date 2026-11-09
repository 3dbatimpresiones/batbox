import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import * as lib from '../lib/libraryApi.js';
import { gallerySave, imageUrl, removeImages, useCommunityFlags } from '../lib/communityApi.js';
import { useUploads } from '../lib/useUploads.js';
import Icon from '../components/Icon.jsx';
import { Empty, Options, PageHead, SearchInput } from '../components/ui.jsx';

// =====================================================================
// BIBLIOTECA 3D (#/biblioteca) — exclusiva del Makers Club pago.
//   #/biblioteca              → catálogo (recién agregados, categorías, búsqueda, orden)
//   #/biblioteca/m/<slug>     → ficha del modelo (galería de fotos) y descarga
//   #/biblioteca/favoritos    → mis favoritos
//   #/biblioteca/descargas    → mis descargas
// Hasta el lanzamiento (interruptor "biblioteca" apagado) solo la usan los admins;
// el resto ve "Próximamente". Cada dato y cada descarga los valida la base.
// =====================================================================

const TITLE = 'BIBLIOTECA 3D';
const TEXT = 'Modelos 3D listos para imprimir, exclusivos para los miembros del Makers Club.';
// NUEVO = publicado después de tu visita anterior a la Biblioteca 3D (en este navegador).
// Durante esta visita se siguen viendo; en la próxima ya no. Si nunca entraste: los de los últimos 7 días.
const NEW_DAYS = 7;
let seenBefore = null; // momento de la visita anterior (se fija una vez por carga de la página)
const isNew = (m) => {
  if (!m.published_at) return false;
  const since = seenBefore || Date.now() - NEW_DAYS * 864e5;
  return new Date(m.published_at).getTime() > since;
};
const fmtDate = (d) => new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

// Última visita (solo en este navegador) para avisar cuántos modelos entraron desde entonces.
const VISIT_KEY = 'bb_lib_last_visit';
const readVisit = () => { try { return Number(localStorage.getItem(VISIT_KEY)) || 0; } catch { return 0; } };
const saveVisit = () => { try { localStorage.setItem(VISIT_KEY, String(Date.now())); } catch { /* sin almacenamiento */ } };

// ---------------------------------------------------------------------
// Próximamente: fondo borroso que no deja ver nada + un solo mensaje.
// No pide ningún dato a la base.
function ComingSoon() {
  return (
    <div className="lib-soon" role="region" aria-label="Próximamente">
      <div className="lib-soon-bg" aria-hidden="true">
        {Array.from({ length: 40 }, (_, i) => <div key={i} className={'lib-soon-card c' + (i % 4)}><i /><b /><s /></div>)}
      </div>
      <div className="lib-soon-msg">
        <span className="lib-soon-kicker">PRÓXIMAMENTE</span>
        <h1>Se viene algo grande acá.</h1>
        <p>Muy pronto.</p>
      </div>
    </div>
  );
}

function Gate({ access, isTrial, signIn }) {
  return (
    <div className="cm-page">
      <PageHead icon="box" label="Makers Club" title={TITLE} text={TEXT} />
      <div className="gate card gate-wide">
        <div className="big-ico tone-pink"><Icon name={access === 'guest' ? 'lock' : 'crown'} size={26} /></div>
        <h2>La Biblioteca 3D es para el Makers Club</h2>
        <p>{isTrial ? 'La prueba gratis no incluye la Biblioteca 3D. Sumate al Makers Club para explorar y descargar los modelos.' : TEXT}</p>
        {access === 'guest'
          ? <button type="button" className="btn primary" onClick={() => signIn('/biblioteca')}><Icon name="login" size={16} /> Ingresar con Google</button>
          : <a className="btn club" href="#/club"><Icon name="crown" size={16} /> Conocer el Makers Club</a>}
      </div>
    </div>
  );
}

function QuotaNote({ q }) {
  if (!q || q.admin) return q?.admin ? <small className="cm-date">Administración: sin límite de descargas.</small> : null;
  return (
    <small className="cm-date">
      <Icon name="clock" size={12} /> Descargas disponibles: <b>{q.remaining} de {q.limit}</b> (se renuevan 24 h después de cada descarga)
      {q.next_free_at && <> · próxima: {new Date(q.next_free_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</>}
    </small>
  );
}

function Cover({ m }) {
  const [broken, setBroken] = useState(false);
  const url = lib.thumbUrl(m?.thumb_key);
  if (url && !broken) return <img className="lib-cover lib-img" src={url} alt={m.name} loading="lazy" decoding="async" onError={() => setBroken(true)} />;
  return <div className="ga-nocover lib-cover"><Icon name="box" size={34} /></div>;
}

// Galería de la ficha: una foto quieta. Las flechas aparecen al pasar el mouse por la foto
// (en celular se ven siempre y también se puede deslizar). Sin pase automático.
function Gallery({ m }) {
  const keys = m.images?.length ? m.images : m.thumb_key ? [m.thumb_key] : [];
  const [i, setI] = useState(0);
  const [intro, setIntro] = useState(true); // al entrar, las flechas se ven unos segundos
  const touch = useRef(null);
  const n = keys.length;
  useEffect(() => { const t = setTimeout(() => setIntro(false), 3500); return () => clearTimeout(t); }, []);
  const go = (d) => setI((cur) => (cur + d + n) % n);
  useEffect(() => { // precarga la siguiente y la anterior para que el cambio sea instantáneo
    if (n < 2) return;
    [1, -1].forEach((d) => { const img = new Image(); img.src = lib.thumbUrl(keys[(i + d + n) % n]); });
  }, [i, n]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!n) return <Cover m={m} />;
  return (
    <div className={'lib-gal' + (intro ? ' intro' : '')}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current ?? 0); if (n > 1 && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); }}>
      <img className="lib-gal-img" src={lib.thumbUrl(keys[i])} alt={`${m.name} — foto ${i + 1} de ${n}`} decoding="async" />
      {n > 1 && <>
        <button type="button" className="lib-arrow left" onClick={() => go(-1)} aria-label="Foto anterior"><Icon name="arrowLeft" size={22} /></button>
        <button type="button" className="lib-arrow right" onClick={() => go(1)} aria-label="Foto siguiente"><Icon name="arrowRight" size={22} /></button>
      </>}
      <span className="lib-gal-count"><Icon name="image" size={12} /> {n > 1 ? `${i + 1} / ${n}` : '1 foto'}</span>
    </div>
  );
}

// Estrellas: muestra un promedio (solo lectura) o permite elegir (onPick).
function Stars({ value = 0, onPick, size = 14 }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <span className={'lib-stars' + (onPick ? ' pick' : '')} onMouseLeave={() => setHover(0)} role={onPick ? 'radiogroup' : 'img'} aria-label={onPick ? 'Elegí de 1 a 5 estrellas' : `${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((s) => {
        const fill = shown >= s ? 'full' : shown >= s - 0.5 ? 'half' : '';
        return onPick
          ? <button key={s} type="button" className={'lib-star ' + fill} style={{ fontSize: size }} onMouseEnter={() => setHover(s)} onClick={() => onPick(s)} aria-label={`${s} estrella${s > 1 ? 's' : ''}`}>★</button>
          : <i key={s} className={'lib-star ' + fill} style={{ fontSize: size }}>★</i>;
      })}
    </span>
  );
}

// El visor 3D (three.js) solo se descarga al tocar "Ver en 3D".
const LibraryViewer = lazy(() => import('../components/LibraryViewer.jsx'));

// Fotos o vista 3D (pestañas). Sin vista 3D, solo la galería.
function Media({ m }) {
  const [tab, setTab] = useState('fotos');
  useEffect(() => setTab('fotos'), [m.id]);
  if (!m.preview_key) return <Gallery m={m} />;
  return (
    <div className="lib-media">
      <div className="lib-seg lib-media-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'fotos'} className={tab === 'fotos' ? 'on' : ''} onClick={() => setTab('fotos')}><Icon name="image" size={14} /> Fotos</button>
        <button type="button" role="tab" aria-selected={tab === '3d'} className={tab === '3d' ? 'on' : ''} onClick={() => setTab('3d')}><Icon name="box" size={14} /> Ver en 3D</button>
      </div>
      {tab === '3d'
        ? <Suspense fallback={<div className="lib-viewer"><div className="lib-viewer-msg"><span className="spinner" /> Cargando el visor…</div></div>}>
            <LibraryViewer previewKey={m.preview_key} meta={m.preview_meta} name={m.name} />
          </Suspense>
        : <Gallery m={m} />}
    </div>
  );
}

function ModelCard({ m, cat }) {
  return (
    <a className="ga-card" href={'#/biblioteca/m/' + m.slug}>
      <div className="ga-cover"><Cover m={m} />
        <div className="ga-badges">
          {isNew(m) && <span className="chip lib-new">NUEVO</span>}
          {m.featured && <span className="chip cat"><Icon name="star" size={11} /> Destacado</span>}
          {m.status !== 'published' && <span className={'chip ' + lib.STATUS[m.status]?.cls}>{lib.STATUS[m.status]?.label}</span>}
        </div>
        {m.photos > 0 && <span className="ga-count" title="Fotos"><Icon name="image" size={12} /> {m.photos}</span>}
      </div>
      <div className="ga-info">
        <h3>{m.name}</h3>
        {m.rating_count > 0 && <span className="lib-rating" title={`${m.rating} de 5 (${m.rating_count} valoraciones)`}><Stars value={m.rating} /> <small>{m.rating} ({m.rating_count})</small></span>}
        <div className="ga-meta">
          <span className="cm-date">{m.last_download ? `Descargado el ${fmtDate(m.last_download)}${m.times > 1 ? ` (${m.times} veces)` : ''}`
            : `ZIP${m.size_bytes ? ' · ' + lib.formatBytes(m.size_bytes) : ''}${m.parts_count ? ` · ${m.parts_count} piezas` : ''}`}</span>
          <span className="ga-stats"><span title="Descargas"><Icon name="box" size={12} /> {m.downloads}</span><span title="Favoritos">♥ {m.favorites}</span></span>
        </div>
        {cat && <span className="chip muted">{cat.name}</span>}
      </div>
    </a>
  );
}

function Grid({ filters, cats, empty }) {
  const [items, setItems] = useState(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const key = JSON.stringify(filters);
  const load = useCallback(async (offset) => {
    try {
      const all = filters.favorites || filters.downloads || filters.collection;
      const rows = filters.favorites ? await lib.myFavorites() : filters.downloads ? await lib.myDownloads()
        : filters.collection ? await lib.collectionModels(filters.collection) : await lib.models({ ...filters, offset });
      setItems((cur) => (offset ? [...(cur || []), ...rows] : rows));
      setDone(!!all || rows.length < (filters.limit || lib.PAGE)); setError('');
    } catch (e) { setError(e.message); setItems((cur) => cur || []); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { setItems(null); load(0); }, [load]);
  if (items === null) return <div className="empty"><div className="spinner" /></div>;
  if (error && !items.length) return <div className="gate card gate-wide"><p>{error}</p><button type="button" className="btn ghost" onClick={() => load(0)}><Icon name="refresh" size={16} /> Reintentar</button></div>;
  if (!items.length) return empty;
  const byId = Object.fromEntries(cats.map((c) => [c.id, c]));
  return (
    <>
      <div className="ga-grid">{items.map((m) => <ModelCard key={m.id} m={m} cat={byId[m.category_id]} />)}</div>
      {!done && <div className="cm-sentinel"><button type="button" className="btn ghost" onClick={() => load(items.length)}>Ver más</button></div>}
    </>
  );
}

// Recién agregados: los últimos modelos (hasta 4) y cuántos entraron desde la última visita.
function Recent({ cats, lastVisit }) {
  const [items, setItems] = useState(null);
  useEffect(() => { lib.models({ sort: 'new', limit: 8 }).then(setItems).catch(() => setItems([])); }, []);
  if (!items?.length) return null;
  const fresh = items.filter((m) => m.published_at && new Date(m.published_at).getTime() > Date.now() - 14 * 864e5);
  if (!fresh.length) return null;
  const sinceVisit = lastVisit ? items.filter((m) => new Date(m.published_at).getTime() > lastVisit).length : 0;
  const byId = Object.fromEntries(cats.map((c) => [c.id, c]));
  return (
    <section className="lib-recent">
      <h2 className="fo-h2"><Icon name="sparkles" size={16} /> Recién agregados
        {sinceVisit > 0 && <span className="lib-since">{sinceVisit >= 8 ? '8 o más' : sinceVisit} nuevo{sinceVisit === 1 ? '' : 's'} desde tu última visita</span>}</h2>
      <div className="ga-grid">{fresh.slice(0, 4).map((m) => <ModelCard key={m.id} m={m} cat={byId[m.category_id]} />)}</div>
    </section>
  );
}

const TABS = [['', 'Catálogo', null], ['favoritos', 'Mis favoritos', 'heart'], ['colecciones', 'Mis colecciones', 'bookmark'], ['descargas', 'Mis descargas', 'box']];

// Mis colecciones: lista con portada y cantidad; adentro, la grilla de modelos.
function Collections({ cats, openId }) {
  const [list, setList] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => lib.myCollections().then(setList).catch((e) => { setError(e.message); setList([]); }), []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn) => { try { await fn(); setError(''); await load(); } catch (e) { setError(e.message); } };
  if (list === null) return <div className="empty"><div className="spinner" /></div>;
  const cur = openId && list.find((c) => c.id === openId);
  if (openId) {
    if (!cur) return <Empty icon="bookmark" title="No encontramos esa colección" text="Puede que la hayas borrado." />;
    return (
      <>
        <div className="lib-col-head">
          <a className="cm-back" href="#/biblioteca/colecciones"><Icon name="arrowLeft" size={16} /> Mis colecciones</a>
          <h2 className="fo-h2">{cur.name} <small>({cur.count})</small></h2>
          <span className="cm-spacer" />
          <button type="button" className="cm-link" onClick={() => { const n = prompt('Nuevo nombre', cur.name); if (n?.trim()) run(() => lib.saveCollection(n.trim(), cur.id)); }}>Renombrar</button>
          <button type="button" className="cm-link danger" onClick={() => { if (confirm(`¿Borrar la colección "${cur.name}"? Los modelos no se borran.`)) run(async () => { await lib.deleteCollection(cur.id); location.hash = '#/biblioteca/colecciones'; }); }}>Borrar</button>
        </div>
        {error && <div className="feedback-error">{error}</div>}
        <Grid filters={{ collection: cur.id }} cats={cats} empty={<Empty icon="bookmark" title="Esta colección está vacía" text="En la ficha de cada modelo tocá “Guardar en colección”." />} />
      </>
    );
  }
  return (
    <>
      <form className="lib-col-new" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(async () => { await lib.saveCollection(name.trim()); setName(''); }); }}>
        <div className="pink-input"><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Nueva colección (ej.: Para imprimir, Regalos…)" /></div>
        <button type="submit" className="btn ghost" disabled={!name.trim()}><Icon name="sparkles" size={15} /> Crear</button>
      </form>
      {error && <div className="feedback-error">{error}</div>}
      {list.length === 0 ? <Empty icon="bookmark" title="Todavía no tenés colecciones" text="Armá listas como “Para imprimir” o “Regalos” y guardá ahí los modelos." />
        : <div className="ga-grid">{list.map((c) => (
          <a key={c.id} className="ga-card" href={'#/biblioteca/colecciones/' + c.id}>
            <div className="ga-cover">{c.cover ? <img className="lib-cover lib-img" src={lib.thumbUrl(c.cover)} alt="" loading="lazy" /> : <div className="ga-nocover lib-cover"><Icon name="bookmark" size={34} /></div>}</div>
            <div className="ga-info"><h3>{c.name}</h3><span className="cm-date">{c.count} modelo{c.count === 1 ? '' : 's'}</span></div>
          </a>))}</div>}
    </>
  );
}

function Home({ cats, quota, tab, arg, lastVisit }) {
  const [sort, setSort] = useState('new');
  const [category, setCategory] = useState(null);
  const [tag, setTag] = useState(null);
  const [tagList, setTagList] = useState([]);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 350); return () => clearTimeout(t); }, [qInput]);
  useEffect(() => { if (!tab) lib.tags(category).then(setTagList).catch(() => setTagList([])); }, [tab, category]);
  const roots = cats.filter((c) => !c.parent_id && c.visible);
  const browsing = !q && !category && !tag && sort === 'new';
  return (
    <>
      <div className="lib-tabs">
        {TABS.map(([k, label, icon]) => (
          <a key={k} className={'opt' + (tab === k ? ' active' : '')} href={'#/biblioteca' + (k ? '/' + k : '')}>{icon && <Icon name={icon} size={13} />} {label}</a>))}
      </div>
      <QuotaNote q={quota} />
      {tab === 'favoritos' ? <Grid filters={{ favorites: true }} cats={cats} empty={<Empty icon="heart" title="Todavía no guardaste favoritos" text="Tocá el corazón en la ficha de un modelo para guardarlo acá." />} />
        : tab === 'descargas' ? <Grid filters={{ downloads: true }} cats={cats} empty={<Empty icon="box" title="Todavía no descargaste modelos" text="Lo que descargues va a quedar anotado acá para volver a encontrarlo." />} />
          : tab === 'colecciones' ? <Collections cats={cats} openId={arg} />
          : <>
            {browsing && <Recent cats={cats} lastVisit={lastVisit} />}
            <div className="cm-toolbar">
              <SearchInput value={qInput} onChange={setQInput} placeholder="Buscar modelos por nombre o etiqueta…" />
              <div className="cm-filters"><Options value={sort} onChange={setSort} options={lib.SORTS} /></div>
              {roots.length > 0 && (
                <div className="cm-cats" role="group" aria-label="Categorías">
                  <button type="button" className={'opt' + (!category ? ' active' : '')} onClick={() => setCategory(null)}>Todas</button>
                  {roots.map((c) => <button key={c.id} type="button" className={'opt' + (category === c.id ? ' active' : '')} onClick={() => { setCategory(c.id); setTag(null); }}>{c.name} <small>({c.models})</small></button>)}
                </div>
              )}
              {tagList.length > 0 && (
                <div className="lib-tagbar" role="group" aria-label="Filtros">
                  <Icon name="flag" size={14} />
                  {tagList.map((t) => (
                    <button key={t.tag} type="button" className={'lib-tag' + (tag === t.tag ? ' active' : '')} onClick={() => setTag(tag === t.tag ? null : t.tag)} aria-pressed={tag === t.tag}>
                      {lib.tagLabel(t.tag)} <small>{t.count}</small></button>))}
                </div>
              )}
            </div>
            {browsing && <h2 className="fo-h2">Todos los modelos</h2>}
            <Grid filters={{ category, q, sort, tag }} cats={cats}
              empty={<Empty icon="box" title={q || category || tag ? 'No encontramos modelos' : 'La biblioteca se está armando'} text={q || category || tag ? 'Probá con otra búsqueda, categoría o filtro.' : 'Muy pronto vas a encontrar acá los primeros modelos.'} />} />
          </>}
    </>
  );
}

// "Guardar en colección": menú con las colecciones propias (tildar/destildar) y crear una nueva.
function CollectionPicker({ modelId }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const wrap = useRef(null);
  const load = () => lib.myCollections(modelId).then(setList).catch((e) => setError(e.message));
  useEffect(() => {
    if (!open) return undefined;
    load();
    const out = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn) => { try { await fn(); setError(''); await load(); } catch (e) { setError(e.message); } };
  const inAny = list?.some((c) => c.has);
  return (
    <div className="lib-picker" ref={wrap}>
      <button type="button" className={'cm-act' + (inAny ? ' on' : '')} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="bookmark" size={16} /> Guardar en colección</button>
      {open && (
        <div className="lib-picker-pop" role="dialog" aria-label="Colecciones">
          {list === null ? <span className="spinner xs" /> : list.length === 0 ? <small className="cm-date">Todavía no tenés colecciones.</small>
            : list.map((c) => (
              <label key={c.id} className="nb-pref"><input type="checkbox" checked={c.has} onChange={() => run(() => lib.toggleInCollection(c.id, modelId))} /> {c.name} <small className="cm-date">({c.count})</small></label>))}
          <form className="lib-picker-new" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(async () => { const id = await lib.saveCollection(name.trim()); await lib.toggleInCollection(id, modelId); setName(''); }); }}>
            <div className="pink-input"><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Nueva colección…" /></div>
            <button type="submit" className="btn ghost" disabled={!name.trim()}>Crear</button>
          </form>
          {error && <small className="cm-warn">{error}</small>}
        </div>
      )}
    </div>
  );
}

// Valoraciones: estrellas + comentario. Solo puede valorar quien descargó el modelo.
function Reviews({ m, isAdmin, onChange }) {
  const [data, setData] = useState(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const load = useCallback(() => lib.reviews(m.id).then((d) => {
    setData(d);
    const mine = d.items.find((r) => r.mine);
    setStars(mine?.stars || 0); setComment(mine?.comment || ''); setEditing(!mine);
  }).catch((e) => setError(e.message)), [m.id]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn) => { try { await fn(); setError(''); await load(); onChange(); } catch (e) { setError(e.message); } };
  if (!data) return null;
  const mine = data.items.find((r) => r.mine);
  return (
    <section className="lib-reviews">
      <h3 className="fo-h2"><Icon name="star" size={16} /> Valoraciones
        {m.rating_count > 0 && <span className="lib-rating"><Stars value={m.rating} /> <small>{m.rating} de 5 · {m.rating_count}</small></span>}</h3>
      {data.can_review ? (editing ? (
        <form className="lib-review-form" onSubmit={(e) => { e.preventDefault(); if (stars) run(() => lib.saveReview(m.id, stars, comment)); }}>
          <span className="cm-date">{mine ? 'Editá tu valoración' : '¿Qué te pareció este modelo?'}</span>
          <Stars value={stars} onPick={setStars} size={24} />
          <div className="pink-input feedback-text"><textarea rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Contá cómo salió la impresión (opcional)" /></div>
          <div className="lib-actions">
            <button type="submit" className="btn primary" disabled={!stars}>Publicar valoración</button>
            {mine && <button type="button" className="btn text" onClick={() => setEditing(false)}>Cancelar</button>}
          </div>
        </form>
      ) : null) : <small className="cm-date">Vas a poder valorar este modelo después de descargarlo.</small>}
      {error && <div className="feedback-error">{error}</div>}
      {data.items.length === 0 ? <small className="cm-date">Todavía no hay valoraciones.</small> : data.items.map((r) => (
        <div key={r.user_id} className="lib-review">
          <div className="lib-review-head"><b>{r.name || 'Maker'}</b> <Stars value={r.stars} size={13} /> <small className="cm-date">{fmtDate(r.updated_at)}</small>
            {r.mine && !editing && <button type="button" className="cm-link" onClick={() => setEditing(true)}>Editar</button>}
            {(r.mine || isAdmin) && <button type="button" className="cm-link danger" onClick={() => run(() => lib.deleteReview(m.id, r.mine ? null : r.user_id))}>Borrar</button>}
          </div>
          {r.comment && <p className="cm-body">{r.comment}</p>}
        </div>))}
    </section>
  );
}

// "Lo imprimí": los miembros muestran su impresión del modelo (y opcionalmente la publican en la Galería Maker).
const MODEL_URL = (slug) => `https://3dbat.com.ar/batbox/#/biblioteca/m/${slug}`;
function Makes({ m, isAdmin }) {
  const { user } = useAuth();
  const flags = useCommunityFlags();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [toGallery, setToGallery] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(null);
  const up = useUploads(user?.id, 1, []);
  const fileRef = useRef(null);
  const load = useCallback(() => lib.makes(m.id).then(setItems).catch((e) => { setError(e.message); setItems([]); }), [m.id]);
  useEffect(() => { load(); }, [load]);
  const canGallery = !!flags?.batgallery;
  const cancel = () => { up.discard(); up.reset(); setCaption(''); setOpen(false); setError(''); };
  const publish = async () => {
    if (!up.media.length) return;
    setBusy(true); setError('');
    try {
      let post = null;
      if (canGallery && toGallery) {
        post = await gallerySave({ title: `Imprimí: ${m.name}`.slice(0, 120), description: caption.trim() || 'Impreso desde la Biblioteca 3D de BATBOX.',
          category: 'impresion-fdm', tags: ['biblioteca3d'], media: up.media, links: [{ label: 'Ver en la Biblioteca 3D', url: MODEL_URL(m.slug) }],
          state: 'done', in_feed: true, publish: true });
      }
      await lib.saveMake(m.id, up.media[0], caption, post);
      up.commit(); up.reset(); setCaption(''); setOpen(false); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const remove = async (k) => {
    try { const path = await lib.deleteMake(k.id); if (path && !k.gallery_post) removeImages([path]); await load(); } catch (e) { setError(e.message); }
  };
  if (items === null) return null;
  return (
    <section className="lib-makes">
      <div className="lib-col-head">
        <h3 className="fo-h2"><Icon name="image" size={16} /> Lo imprimieron {items.length > 0 && <small>({items.length})</small>}</h3>
        <span className="cm-spacer" />
        {!open && <button type="button" className="btn ghost" onClick={() => setOpen(true)}><Icon name="sparkles" size={15} /> Lo imprimí</button>}
      </div>
      {open && (
        <div className="lib-make-form card">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { up.pick(e.target.files); e.target.value = ''; }} />
          {up.media.length ? <img className="lib-make-preview" src={imageUrl(up.media[0].path)} alt="Tu impresión" />
            : <button type="button" className="btn ghost" disabled={up.busy} onClick={() => fileRef.current?.click()}><Icon name="image" size={16} /> {up.busy ? 'Subiendo…' : 'Elegir foto de tu impresión'}</button>}
          <div className="pink-input"><input value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} placeholder="Material, color, ajustes… (opcional)" /></div>
          {canGallery && <label className="nb-pref"><input type="checkbox" checked={toGallery} onChange={(e) => setToGallery(e.target.checked)} /> Publicar también en la Galería Maker</label>}
          {up.error && <small className="cm-warn">{up.error}</small>}
          <div className="lib-actions">
            <button type="button" className="btn primary" disabled={busy || up.busy || !up.media.length} onClick={publish}>{busy ? 'Publicando…' : 'Publicar'}</button>
            <button type="button" className="btn text" onClick={cancel}>Cancelar</button>
          </div>
        </div>
      )}
      {error && <div className="feedback-error">{error}</div>}
      {items.length === 0 ? !open && <small className="cm-date">¿Lo imprimiste? Mostrale a la comunidad cómo te quedó.</small> : (
        <div className="lib-make-grid">{items.map((k, i) => (
          <figure key={k.id} className={'lib-make' + (k.hidden ? ' hidden' : '')}>
            <button type="button" className="lib-make-img" onClick={() => setZoom(i)} aria-label="Ver foto"><img src={imageUrl(k.media.path)} alt={`Impresión de ${k.name || 'un maker'}`} loading="lazy" /></button>
            <figcaption>
              <b>{k.name || 'Maker'}</b>{k.caption && <span>{k.caption}</span>}
              <span className="lib-make-acts">
                {k.gallery_post && <a className="cm-link" href={'#/galeria/p/' + k.gallery_post}>En la Galería</a>}
                {k.mine && <button type="button" className="cm-link danger" onClick={() => remove(k)}>Borrar</button>}
                {isAdmin && !k.mine && <button type="button" className="cm-link" onClick={() => remove(k)}>{k.hidden ? 'Mostrar' : 'Ocultar'}</button>}
              </span>
            </figcaption>
          </figure>))}</div>
      )}
      {zoom !== null && items[zoom] && (
        <div className="lib-zoom" role="dialog" aria-label="Foto ampliada" onClick={() => setZoom(null)}>
          <img src={imageUrl(items[zoom].media.path)} alt="" />
        </div>
      )}
    </section>
  );
}

// Relacionados: "También te puede gustar".
function Related({ m, cats }) {
  const [items, setItems] = useState(null);
  useEffect(() => { setItems(null); lib.related(m.id).then(setItems).catch(() => setItems([])); }, [m.id]);
  if (!items?.length) return null;
  const byId = Object.fromEntries(cats.map((c) => [c.id, c]));
  return (
    <section className="lib-recent">
      <h2 className="fo-h2"><Icon name="sparkles" size={16} /> También te puede gustar</h2>
      <div className="ga-grid">{items.map((x) => <ModelCard key={x.id} m={x} cat={byId[x.category_id]} />)}</div>
    </section>
  );
}

function Detail({ slug, cats, quota, refreshQuota, isAdmin }) {
  const [m, setM] = useState(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const reload = useCallback(() => lib.model(slug).then(setM).catch((e) => { setError(e.message); setM(null); }), [slug]);
  useEffect(() => { setM(undefined); reload(); window.scrollTo(0, 0); }, [reload]);
  if (m === undefined) return <div className="empty"><div className="spinner" /></div>;
  const back = <a className="cm-back" href="#/biblioteca"><Icon name="arrowLeft" size={16} /> Biblioteca 3D</a>;
  if (!m) return <>{back}<Empty icon="alert" title="Este modelo no está disponible" text={error} /></>;
  const cat = cats.find((c) => c.id === m.category_id);
  const blocked = quota && !quota.admin && quota.remaining <= 0;
  const download = async (part = null) => {
    setBusy(part ?? true); setError(''); setOk('');
    try {
      const r = await lib.download(m.id, part);
      const what = part == null ? 'Descarga iniciada.' : `Descargando ${r.file_name}.`;
      setOk(r.remaining == null ? what : `${what} ${r.counted ? 'Contó como 1 descarga' : 'No suma: este modelo ya contó hoy'}. Te quedan ${r.remaining} en las próximas 24 h.`);
      if (r.counted && r.remaining != null) setM((cur) => ({ ...cur, downloads: cur.downloads + 1 }));
    } catch (e) { setError(e.message); } finally { setBusy(false); refreshQuota(); }
  };
  const single = /\.zip$/i.test(m.file_name || '');
  const fav = async () => {
    try { const on = await lib.toggleFavorite(m.id); setM((cur) => ({ ...cur, is_favorite: on, favorites: Math.max(0, cur.favorites + (on ? 1 : -1)) })); }
    catch (e) { setError(e.message); }
  };
  return (
    <>
      {back}
      <article className="cm-post card lib-detail">
        <Media m={m} />
        <div className="fo-chips">
          {isNew(m) && <span className="chip lib-new">NUEVO</span>}
          {cat && <span className="chip muted">{cat.name}</span>}
          {m.featured && <span className="chip cat"><Icon name="star" size={11} /> Destacado</span>}
          {m.status !== 'published' && <span className={'chip ' + lib.STATUS[m.status]?.cls}>{lib.STATUS[m.status]?.label}</span>}
        </div>
        <h1 className="fo-title">{m.name}</h1>
        {m.rating_count > 0 && <span className="lib-rating"><Stars value={m.rating} size={16} /> <small>{m.rating} de 5 ({m.rating_count} valoraci{m.rating_count === 1 ? 'ón' : 'ones'})</small></span>}
        {m.description && <p className="cm-body">{m.description}</p>}
        <dl className="ga-specs">
          <div><dt>Archivo</dt><dd>{single ? "ZIP" : "RAR"}{m.size_bytes ? ' · ' + lib.formatBytes(m.size_bytes) : ''}</dd></div>
          <div><dt>Diseño</dt><dd>{m.author || 'Desconocido'}</dd></div>
          {m.license && <div><dt>Licencia</dt><dd>{m.license}</dd></div>}
          <div><dt>Descargas</dt><dd>{m.downloads}</dd></div>
        </dl>
        {m.parts?.length > 0 && (
          <div className="ga-files"><h3>Qué trae el {single ? 'ZIP' : 'archivo'}</h3>
            {single && m.parts.some((p) => p.o != null) && <small className="cm-date">Tocá la flecha para bajar un archivo suelto. Bajar varios archivos del mismo modelo cuenta como 1 sola descarga.</small>}
            {m.parts.map((p, i) => (
              <div key={i} className="ga-file"><Icon name="box" size={16} /><div><b>{p.name}</b>{p.size ? <small className="cm-date">{lib.formatBytes(p.size)}</small> : null}</div>
                {single && p.o != null && (
                  <button type="button" className="lib-part-dl" disabled={busy !== false} onClick={() => download(i)}
                    aria-label={`Descargar ${p.name}`} title={`Descargar solo ${p.name}`}>
                    {busy === i ? <span className="spinner" /> : <Icon name="download" size={18} />}</button>
                )}
              </div>
            ))}
          </div>
        )}
        {m.tags?.length > 0 && <div className="chips">{m.tags.map((t) => <span key={t} className="chip muted">{lib.tagLabel(t)}</span>)}</div>}
        <div className="lib-actions">
          <button type="button" className="btn primary" disabled={busy !== false || blocked} onClick={() => download()}>
            <Icon name="box" size={16} /> {busy === true ? 'Preparando…' : 'Descargar modelo completo'}</button>
          <button type="button" className={'cm-act' + (m.is_favorite ? ' on' : '')} onClick={fav} aria-pressed={m.is_favorite}>
            <Icon name="heart" size={16} /> {m.is_favorite ? 'En favoritos' : 'Guardar en favoritos'}</button>
          <CollectionPicker modelId={m.id} />
        </div>
        <QuotaNote q={quota} />
        {ok && <div className="cm-ok">{ok}</div>}
        {error && <div className="feedback-error">{error}</div>}
        <small className="cm-date">Los modelos son para uso personal de los miembros del Makers Club. No los compartas ni los revendas.</small>
        <Makes m={m} isAdmin={isAdmin} />
        <Reviews m={m} isAdmin={isAdmin} onChange={reload} />
      </article>
      <Related m={m} cats={cats} />
    </>
  );
}

export default function Biblioteca({ route }) {
  const { access, isTrial, isAdmin, signIn } = useAuth();
  const flags = useCommunityFlags();
  const [quota, setQuota] = useState(null);
  const [cats, setCats] = useState(null);
  const [error, setError] = useState('');
  const [lastVisit] = useState(() => { const v = readVisit(); if (seenBefore === null) seenBefore = v; return v; });
  const [sub, arg] = [route.parts[1], route.parts[2]];
  const signedIn = access !== 'guest' && access !== 'loading';
  const open = isAdmin || !!flags?.biblioteca;
  const refreshQuota = useCallback(() => lib.quota().then(setQuota).catch(() => {}), []);
  useEffect(() => {
    if (!signedIn || !open) return;
    lib.quota().then((q) => {
      setQuota(q);
      if (q.paid) return lib.categories().then((c) => { setCats(c); saveVisit(); });
    }).catch((e) => setError(e.missing ? 'La Biblioteca 3D todavía no está instalada en la base (faltan las migraciones 058 a 060).' : e.message));
  }, [signedIn, open]);

  if (access === 'loading' || flags === null) return <div className="empty"><div className="spinner" /></div>;
  if (!open) return <ComingSoon />;
  if (signedIn && !quota && !error) return <div className="empty"><div className="spinner" /></div>;
  if (!signedIn || (quota && !quota.paid)) return <Gate access={access} isTrial={isTrial} signIn={signIn} />;
  if (error) return <div className="cm-page"><div className="gate card gate-wide"><p>{error}</p></div></div>;
  if (!cats) return <div className="empty"><div className="spinner" /></div>;
  return (
    <div className="cm-page lib-page">
      <PageHead icon="box" label="Makers Club" title={TITLE} text={TEXT}>
        {quota?.admin && <a className="btn ghost" href="#/admin?tab=biblioteca"><Icon name="shield" size={16} /> Administrar</a>}
      </PageHead>
      {quota?.admin && !flags?.biblioteca && <div className="vo-note"><Icon name="lock" size={13} /> Solo la ven los administradores: para el resto figura como “Próximamente”. Se abre desde Panel → Comunidad → Biblioteca 3D.</div>}
      {sub === 'm' ? <Detail slug={arg} cats={cats} quota={quota} refreshQuota={refreshQuota} isAdmin={!!quota?.admin} />
        : <Home cats={cats} quota={quota} tab={['favoritos', 'descargas', 'colecciones'].includes(sub) ? sub : ''} arg={arg} lastVisit={lastVisit} />}
    </div>
  );
}
