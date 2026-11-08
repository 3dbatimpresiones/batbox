import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import * as lib from '../lib/libraryApi.js';
import Icon from '../components/Icon.jsx';
import { Empty, Options, PageHead, SearchInput } from '../components/ui.jsx';

// =====================================================================
// BIBLIOTECA 3D (#/biblioteca) — exclusiva del Makers Club pago.
//   #/biblioteca              → catálogo (categorías, búsqueda, orden)
//   #/biblioteca/m/<slug>     → ficha del modelo y descarga
//   #/biblioteca/favoritos    → mis favoritos
// Mostrar u ocultar es solo interfaz: cada dato y cada descarga los valida la base.
// =====================================================================

const TITLE = 'BIBLIOTECA 3D';
const TEXT = 'Modelos 3D listos para imprimir, exclusivos para los miembros del Makers Club.';

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

function ModelCard({ m, cat }) {
  return (
    <a className="ga-card" href={'#/biblioteca/m/' + m.slug}>
      <div className="ga-cover"><Cover m={m} />
        <div className="ga-badges">
          {m.featured && <span className="chip cat"><Icon name="star" size={11} /> Destacado</span>}
          {m.status !== 'published' && <span className={'chip ' + lib.STATUS[m.status]?.cls}>{lib.STATUS[m.status]?.label}</span>}
        </div>
      </div>
      <div className="ga-info">
        <h3>{m.name}</h3>
        <div className="ga-meta">
          <span className="cm-date">ZIP{m.size_bytes ? ' · ' + lib.formatBytes(m.size_bytes) : ''}{m.parts_count ? ` · ${m.parts_count} piezas` : ''}</span>
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
      const rows = filters.favorites ? await lib.myFavorites() : await lib.models({ ...filters, offset });
      setItems((cur) => (offset ? [...(cur || []), ...rows] : rows));
      setDone(filters.favorites || rows.length < lib.PAGE); setError('');
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

function Home({ cats, quota, favorites }) {
  const [sort, setSort] = useState('new');
  const [category, setCategory] = useState(null);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 350); return () => clearTimeout(t); }, [qInput]);
  const roots = cats.filter((c) => !c.parent_id && c.visible);
  return (
    <>
      <div className="lib-tabs">
        <a className={'opt' + (!favorites ? ' active' : '')} href="#/biblioteca">Catálogo</a>
        <a className={'opt' + (favorites ? ' active' : '')} href="#/biblioteca/favoritos"><Icon name="heart" size={13} /> Mis favoritos</a>
      </div>
      <QuotaNote q={quota} />
      {favorites
        ? <Grid filters={{ favorites: true }} cats={cats} empty={<Empty icon="heart" title="Todavía no guardaste favoritos" text="Tocá el corazón en la ficha de un modelo para guardarlo acá." />} />
        : <>
          <div className="cm-toolbar">
            <SearchInput value={qInput} onChange={setQInput} placeholder="Buscar modelos por nombre o etiqueta…" />
            <div className="cm-filters"><Options value={sort} onChange={setSort} options={lib.SORTS} /></div>
            {roots.length > 0 && (
              <div className="cm-cats" role="group" aria-label="Categorías">
                <button type="button" className={'opt' + (!category ? ' active' : '')} onClick={() => setCategory(null)}>Todas</button>
                {roots.map((c) => <button key={c.id} type="button" className={'opt' + (category === c.id ? ' active' : '')} onClick={() => setCategory(c.id)}>{c.name} <small>({c.models})</small></button>)}
              </div>
            )}
          </div>
          <Grid filters={{ category, q, sort }} cats={cats}
            empty={<Empty icon="box" title={q || category ? 'No encontramos modelos' : 'La biblioteca se está armando'} text={q || category ? 'Probá con otra búsqueda o categoría.' : 'Muy pronto vas a encontrar acá los primeros modelos.'} />} />
        </>}
    </>
  );
}

function Detail({ slug, cats, quota, refreshQuota }) {
  const [m, setM] = useState(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  useEffect(() => { setM(undefined); lib.model(slug).then(setM).catch((e) => { setError(e.message); setM(null); }); }, [slug]);
  if (m === undefined) return <div className="empty"><div className="spinner" /></div>;
  const back = <a className="cm-back" href="#/biblioteca"><Icon name="arrowLeft" size={16} /> Biblioteca 3D</a>;
  if (!m) return <>{back}<Empty icon="alert" title="Este modelo no está disponible" text={error} /></>;
  const cat = cats.find((c) => c.id === m.category_id);
  const blocked = quota && !quota.admin && quota.remaining <= 0;
  const download = async () => {
    setBusy(true); setError(''); setOk('');
    try {
      const r = await lib.download(m.id);
      setOk(r.remaining == null ? 'Descarga iniciada.' : `Descarga iniciada. Te quedan ${r.remaining} en las próximas 24 h.`);
      setM((cur) => ({ ...cur, downloads: cur.downloads + (r.remaining == null ? 0 : 1) }));
    } catch (e) { setError(e.message); } finally { setBusy(false); refreshQuota(); }
  };
  const fav = async () => {
    try { const on = await lib.toggleFavorite(m.id); setM((cur) => ({ ...cur, is_favorite: on, favorites: Math.max(0, cur.favorites + (on ? 1 : -1)) })); }
    catch (e) { setError(e.message); }
  };
  return (
    <>
      {back}
      <article className="cm-post card lib-detail">
        <Cover m={m} />
        <div className="fo-chips">
          {cat && <span className="chip muted">{cat.name}</span>}
          {m.featured && <span className="chip cat"><Icon name="star" size={11} /> Destacado</span>}
          {m.status !== 'published' && <span className={'chip ' + lib.STATUS[m.status]?.cls}>{lib.STATUS[m.status]?.label}</span>}
        </div>
        <h1 className="fo-title">{m.name}</h1>
        {m.description && <p className="cm-body">{m.description}</p>}
        <dl className="ga-specs">
          <div><dt>Archivo</dt><dd>ZIP{m.size_bytes ? ' · ' + lib.formatBytes(m.size_bytes) : ''}</dd></div>
          <div><dt>Diseño</dt><dd>{m.author || 'Desconocido'}</dd></div>
          {m.license && <div><dt>Licencia</dt><dd>{m.license}</dd></div>}
          <div><dt>Descargas</dt><dd>{m.downloads}</dd></div>
        </dl>
        {m.parts?.length > 0 && (
          <div className="ga-files"><h3>Qué trae el ZIP</h3>
            {m.parts.map((p, i) => <div key={i} className="ga-file"><Icon name="box" size={16} /><div><b>{p.name}</b>{p.size ? <small className="cm-date">{lib.formatBytes(p.size)}</small> : null}</div></div>)}
          </div>
        )}
        {m.tags?.length > 0 && <div className="chips">{m.tags.map((t) => <span key={t} className="chip muted">#{t}</span>)}</div>}
        <div className="lib-actions">
          <button type="button" className="btn primary" disabled={busy || blocked} onClick={download}>
            <Icon name="box" size={16} /> {busy ? 'Preparando…' : 'Descargar modelo'}</button>
          <button type="button" className={'cm-act' + (m.is_favorite ? ' on' : '')} onClick={fav} aria-pressed={m.is_favorite}>
            <Icon name="heart" size={16} /> {m.is_favorite ? 'En favoritos' : 'Guardar en favoritos'}</button>
        </div>
        <QuotaNote q={quota} />
        {ok && <div className="cm-ok">{ok}</div>}
        {error && <div className="feedback-error">{error}</div>}
        <small className="cm-date">Los modelos son para uso personal de los miembros del Makers Club. No los compartas ni los revendas.</small>
      </article>
    </>
  );
}

export default function Biblioteca({ route }) {
  const { access, isTrial, signIn } = useAuth();
  const [quota, setQuota] = useState(null);
  const [cats, setCats] = useState(null);
  const [error, setError] = useState('');
  const [sub, arg] = [route.parts[1], route.parts[2]];
  const signedIn = access !== 'guest' && access !== 'loading';
  const refreshQuota = useCallback(() => lib.quota().then(setQuota).catch(() => {}), []);
  useEffect(() => {
    if (!signedIn) return;
    lib.quota().then((q) => {
      setQuota(q);
      if (q.paid) return lib.categories().then(setCats);
    }).catch((e) => setError(e.missing ? 'La Biblioteca 3D todavía no está instalada en la base (faltan las migraciones 058 y 059).' : e.message));
  }, [signedIn]);

  if (access === 'loading' || (signedIn && !quota && !error)) return <div className="empty"><div className="spinner" /></div>;
  if (!signedIn || (quota && !quota.paid)) return <Gate access={access} isTrial={isTrial} signIn={signIn} />;
  if (error) return <div className="cm-page"><div className="gate card gate-wide"><p>{error}</p></div></div>;
  if (!cats) return <div className="empty"><div className="spinner" /></div>;
  return (
    <div className="cm-page lib-page">
      <PageHead icon="box" label="Makers Club" title={TITLE} text={TEXT}>
        {quota?.admin && <a className="btn ghost" href="#/admin?tab=biblioteca"><Icon name="shield" size={16} /> Administrar</a>}
      </PageHead>
      {sub === 'm' ? <Detail slug={arg} cats={cats} quota={quota} refreshQuota={refreshQuota} />
        : <Home cats={cats} quota={quota} favorites={sub === 'favoritos'} />}
    </div>
  );
}
