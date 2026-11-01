import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import * as api from '../lib/communityApi.js';
import Icon from '../components/Icon.jsx';
import { Avatar, Composer, PostCard } from '../components/Community.jsx';
import { GalleryGrid } from '../components/GalleryCards.jsx';
import { BadgeRow } from '../components/Badge.jsx';
import { Nm } from '../components/Featured.jsx';
import { Empty, Options, PageHead, SearchInput } from '../components/ui.jsx';

// =====================================================================
// BATFEED (#/batfeed) — muro de la comunidad. Solo Makers Club.
//   #/batfeed                 → muro
//   #/batfeed?post=<id>       → una publicación (enlaces de notificaciones)
//   #/batfeed/perfil/<uid>    → perfil de un autor
// Lo que ves y lo que podés hacer lo decide la base (RLS / RPC).
// =====================================================================

const PAGE = 12;
const VIEWS = [
  { value: 'all', label: 'Todo' },
  { value: 'mine', label: 'Mis publicaciones' },
  { value: 'saved', label: 'Guardados' },
];
const SORTS = [{ value: 'recent', label: 'Recientes' }, { value: 'top', label: 'Destacados' }];

function useFeed(filters) {
  const [items, setItems] = useState([]);
  const [authors, setAuthors] = useState({});
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const seq = useRef(0);
  const key = JSON.stringify(filters);

  const fetchPage = useCallback(async (reset) => {
    const my = ++seq.current;
    if (filters.off) { setLoading(false); setItems([]); setDone(true); return; }
    if (reset) { setLoading(true); setDone(false); } else setMore(true);
    try {
      const cur = reset ? [] : items;
      const last = cur[cur.length - 1];
      const res = await api.loadFeed({
        ...filters, limit: PAGE,
        before: filters.sort === 'recent' && last ? last.created_at : null,
        offset: filters.sort === 'top' ? cur.length : 0,
      });
      if (my !== seq.current) return;
      setItems(reset ? res.items : [...cur, ...res.items.filter((x) => !cur.some((c) => c.id === x.id))]);
      setAuthors((a) => ({ ...a, ...res.authors }));
      setDone(res.items.length < PAGE);
      setError('');
    } catch (e) {
      if (my === seq.current) setError(e.missing ? 'BATFEED todavía no está instalado en la base (falta la migración 044).' : e.message);
    } finally { if (my === seq.current) { setLoading(false); setMore(false); } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, items]);

  useEffect(() => { fetchPage(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
  return { items, setItems, authors, loading, more, error, done, loadMore: () => fetchPage(false), reload: () => fetchPage(true) };
}

function Gate({ access, signIn }) {
  if (access === 'loading') return <div className="empty"><div className="spinner" /></div>;
  return (
    <div className="gate card gate-wide">
      <div className="big-ico tone-pink"><Icon name={access === 'none' || access === 'pending' ? 'crown' : 'lock'} size={26} /></div>
      <h2>BATFEED es para el Makers Club</h2>
      <p>Compartí tus proyectos, mirá lo que hacen otras personas y conversá con la comunidad maker.</p>
      {access === 'guest'
        ? <button type="button" className="btn primary" onClick={() => signIn('/batfeed')}><Icon name="login" size={16} /> Ingresar con Google</button>
        : <a className="btn club" href="#/club"><Icon name="crown" size={16} /> Conocer el Makers Club</a>}
    </div>
  );
}

function ProfileHead({ uid }) {
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [edit, setEdit] = useState(false);
  const [bio, setBio] = useState('');
  const [spec, setSpec] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { const d = await api.loadProfile(uid); setP(d); setBio(d?.bio || ''); setSpec((d?.specialties || []).join(', ')); } catch (e) { setError(e.message); } }, [uid]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    try { await api.saveProfile({ bio, specialties: spec.split(',').map((s) => s.trim()).filter(Boolean) }); setEdit(false); load(); }
    catch (e) { setError(e.message); }
  };
  if (!p) return error ? <div className="feedback-error">{error}</div> : <div className="cm-loading"><span className="spinner xs" /></div>;
  return (
    <section className="cm-profile card">
      <Avatar author={p} size={72} uid={p.user_id} />
      <div className="cm-pr-txt">
        <h1><Nm uid={p.user_id}>{p.name}</Nm></h1>
        <div className="cm-date">{p.posts} {p.posts === 1 ? 'publicación' : 'publicaciones'} · {p.creations || 0} {p.creations === 1 ? 'creación' : 'creaciones'}</div>
        <BadgeRow badges={p.badges} />
        {!edit && <>
          {p.bio && <p>{p.bio}</p>}
          {p.specialties.length > 0 && <div className="chips">{p.specialties.map((s) => <span key={s} className="chip cat">{s}</span>)}</div>}
        </>}
        {edit && <div className="cm-pr-edit">
          <div className="pink-input"><textarea rows={3} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Contá algo sobre vos y tus máquinas (no pongas teléfono ni correo)" /></div>
          <div className="pink-input"><input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="Especialidades separadas por coma: FDM, resina, láser…" /></div>
          {error && <div className="feedback-error">{error}</div>}
          <div className="modal-actions"><button type="button" className="btn text" onClick={() => setEdit(false)}>Cancelar</button>
            <button type="button" className="btn primary" onClick={save}>Guardar</button></div>
        </div>}
        {p.is_me && !edit && user && <button type="button" className="btn ghost" onClick={() => setEdit(true)}><Icon name="edit" size={14} /> Editar mi perfil</button>}
      </div>
    </section>
  );
}

export default function Feed({ route }) {
  const { access, signIn, isMember, user } = useAuth();
  const flags = api.useCommunityFlags();
  const sub = route.parts[1];
  const profileUid = sub === 'perfil' ? route.parts[2] : null;
  const postId = route.query.post || null;

  const [view, setView] = useState('all');
  const [sort, setSort] = useState('recent');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [ptab, setPtab] = useState('posts');

  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 350); return () => clearTimeout(t); }, [qInput]);

  const filters = {
    sort: profileUid || postId ? 'recent' : sort,
    category: category || null, tag: tag || null, q: q || null,
    saved: view === 'saved' && !profileUid, author: profileUid || (view === 'mine' ? user?.id : null),
    id: postId,
  };
  const feed = useFeed(isMember && flags?.batfeed && !profileUid ? filters : { off: true });

  // Carga automática al llegar al final.
  const sentinel = useRef(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || feed.done || feed.loading || feed.more || feed.error) return undefined;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) feed.loadMore(); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const onChanged = (what, id, extra) => {
    if (what === 'deleted' || what === 'hidden' || (what === 'saved' && view === 'saved' && !extra)) feed.setItems((l) => l.filter((x) => x.id !== id));
    if (what === 'pinned') feed.reload();
  };

  if (access === 'loading' || flags === null) return <div className="empty"><div className="spinner" /></div>;
  if (!isMember) return <div className="cm-page"><PageHead icon="message" label="Comunidad" title="BATFEED" text="El muro de la comunidad maker." /><Gate access={access} signIn={signIn} /></div>;
  if (!flags.batfeed) return <div className="cm-page"><Empty icon="lock" title="BATFEED no está disponible por ahora" text="Lo estamos preparando. Volvé pronto." /></div>;

  if (profileUid) {
    return (
      <div className="cm-page">
        <a className="cm-back" href="#/galeria"><Icon name="arrowLeft" size={16} /> Volver a la galería</a>
        <ProfileHead uid={profileUid} />
        <h2 className="fo-h2">Mis creaciones</h2>
        <GalleryGrid filters={{ author: profileUid }} empty={<Empty icon="image" title="Todavía no hay creaciones" text="Los proyectos que se publiquen en la Galería Maker aparecen acá como portfolio." />} />
      </div>
    );
  }
  const onDone = () => { setComposing(false); setEditing(null); feed.reload(); };
  const filtersOn = category || tag || q;
  return (
    <div className="cm-page">
      <PageHead icon="message" label="Comunidad" title="BATFEED" text="Mostrá tus proyectos, mirá lo que hacen otros makers y conversá." />
      {profileUid && <><a className="cm-back" href="#/batfeed"><Icon name="arrowLeft" size={16} /> Volver al muro</a><ProfileHead uid={profileUid} /><Options value={ptab} onChange={setPtab} options={[{ value: 'posts', label: 'Publicaciones' }, { value: 'creations', label: 'Mis creaciones' }]} /></>}
      {profileUid && ptab === 'creations' && <GalleryGrid filters={{ author: profileUid }} empty={<Empty icon="image" title="Todavía no hay creaciones" text="Los proyectos que se publiquen en la Galería Maker aparecen acá como portfolio." />} />}
      {postId && <a className="cm-back" href="#/batfeed"><Icon name="arrowLeft" size={16} /> Ver todo el muro</a>}

      {!profileUid && !postId && (
        <div className="cm-toolbar">
          <SearchInput value={qInput} onChange={setQInput} placeholder="Buscar publicaciones o #etiquetas…" />
          <div className="cm-filters">
            <Options value={view} onChange={setView} options={VIEWS} />
            <Options value={sort} onChange={setSort} options={SORTS} />
          </div>
          <div className="cm-cats" role="group" aria-label="Categorías">
            <button type="button" className={'opt' + (!category ? ' active' : '')} onClick={() => setCategory('')}>Todas</button>
            {api.CATEGORIES.map((c) => <button key={c.value} type="button" className={'opt' + (category === c.value ? ' active' : '')} onClick={() => setCategory(c.value)}>{c.label}</button>)}
          </div>
          {tag && <div className="cm-activetag">Etiqueta: <b>#{tag}</b> <button type="button" className="cm-link" onClick={() => setTag('')}>quitar</button></div>}
        </div>
      )}

      {!(profileUid && ptab === 'creations') && !composing && !editing && (
        <button type="button" className="cm-compose-btn card" onClick={() => setComposing(true)}>
          <Icon name="edit" size={18} /> Compartí un proyecto, una foto o una duda…
        </button>
      )}
      {(composing || editing) && <Composer editing={editing} onDone={onDone} onCancel={() => { setComposing(false); setEditing(null); }} />}

      {profileUid && ptab === 'creations' ? null : feed.loading ? <div className="empty"><div className="spinner" /></div>
        : feed.error ? <div className="gate card gate-wide"><div className="big-ico"><Icon name="alert" size={26} /></div><p>{feed.error}</p>
          <button type="button" className="btn ghost" onClick={feed.reload}><Icon name="refresh" size={16} /> Reintentar</button></div>
        : feed.items.length === 0 ? (
          <Empty icon={view === 'saved' ? 'bookmark' : 'message'}
            title={filtersOn ? 'No encontramos publicaciones con ese filtro' : view === 'saved' ? 'Todavía no guardaste nada' : view === 'mine' || profileUid ? 'Todavía no hay publicaciones' : 'El muro está vacío'}
            text={filtersOn ? 'Probá con otra búsqueda o categoría.' : view === 'all' && !profileUid ? 'Sé la primera persona en compartir algo con la comunidad.' : undefined} />
        ) : (
          <div className="cm-list">
            {feed.items.map((p) => (
              <PostCard key={p.id} post={p} author={feed.authors[p.user_id]} authors={feed.authors} openComments={!!postId}
                onChanged={onChanged} onEdit={(x) => { setEditing(x); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                onTag={(t) => { setTag(t); setView('all'); }} />
            ))}
            <div ref={sentinel} className="cm-sentinel">
              {feed.more && <span className="spinner xs" />}
              {feed.done && feed.items.length > PAGE && <small>Llegaste al final.</small>}
              {!feed.done && !feed.more && <button type="button" className="btn ghost" onClick={feed.loadMore}>Ver más</button>}
            </div>
          </div>
        )}
    </div>
  );
}
