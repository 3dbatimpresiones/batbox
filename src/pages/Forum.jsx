import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import * as api from '../lib/communityApi.js';
import { navigate } from '../lib/router.js';
import { useUploads } from '../lib/useUploads.js';
import Icon from '../components/Icon.jsx';
import { Avatar, Lightbox, ReportModal } from '../components/Community.jsx';
import { gateView, ImageStrip } from '../components/CommunityGate.jsx';
import { Nm } from '../components/Featured.jsx';
import { Confirm, Empty, Options, PageHead, SearchInput } from '../components/ui.jsx';

// =====================================================================
// BATFORUM (#/batforum) — foro de la comunidad. Solo Makers Club.
//   #/batforum              → categorías + temas recientes
//   #/batforum/c/<slug>     → temas de una categoría
//   #/batforum/t/<id>       → un tema con sus respuestas
//   #/batforum/nuevo        → crear tema (?cat=<slug>)
// Permisos y límites los valida la base (RLS / RPC).
// =====================================================================

const FILTERS = [{ value: 'all', label: 'Todos' }, { value: 'unsolved', label: 'Sin resolver' }, { value: 'solved', label: 'Resueltos' }, { value: 'mine', label: 'Mis temas' }];
const SORTS = [{ value: 'activity', label: 'Última actividad' }, { value: 'new', label: 'Nuevos' }, { value: 'replies', label: 'Más respuestas' }];
const PAGE = 15;

function SolvedChip({ solved }) {
  return solved ? <span className="chip ok"><Icon name="check" size={11} /> Resuelto</span> : null;
}

function TopicRow({ t, author }) {
  return (
    <a className="fo-row card" href={'#/batforum/t/' + t.id}>
      <Avatar author={author} size={38} uid={t.user_id} />
      <div className="fo-row-main">
        <div className="fo-row-title">{t.pinned && <Icon name="pinned" size={14} />} {t.title}</div>
        <div className="fo-row-meta">
          <span className="chip cat">{t.category_name}</span>
          <SolvedChip solved={t.solved} />
          {t.closed && <span className="chip muted"><Icon name="lock" size={11} /> Cerrado</span>}
          <span className="cm-date"><Nm uid={t.user_id}>{author?.name || 'Maker'}</Nm> · {api.timeAgo(t.last_activity_at)}</span>
        </div>
      </div>
      <div className="fo-row-count" title="Respuestas"><b>{t.reply_count}</b><small>resp.</small></div>
    </a>
  );
}

function TopicList({ category }) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('activity');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [authors, setAuthors] = useState({});
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 350); return () => clearTimeout(t); }, [qInput]);

  const load = useCallback(async (reset, from) => {
    const my = ++seq.current;
    if (reset) setLoading(true);
    try {
      const res = await api.forumTopics({ category, q, filter, sort, offset: reset ? 0 : from, limit: PAGE });
      if (my !== seq.current) return;
      setItems((cur) => (reset ? res.items : [...cur, ...res.items.filter((x) => !cur.some((c) => c.id === x.id))]));
      setAuthors((a) => ({ ...a, ...res.authors }));
      setDone(res.items.length < PAGE);
      setError('');
    } catch (e) { if (my === seq.current) setError(e.missing ? 'BATFORUM todavía no está instalado en la base (falta la migración 045).' : e.message); }
    finally { if (my === seq.current) setLoading(false); }
  }, [category, q, filter, sort]);
  useEffect(() => { load(true, 0); }, [load]);

  return (
    <section className="fo-list">
      <div className="cm-toolbar">
        <SearchInput value={qInput} onChange={setQInput} placeholder="Buscar en el foro…" />
        <div className="cm-filters"><Options value={filter} onChange={setFilter} options={FILTERS} /><Options value={sort} onChange={setSort} options={SORTS} /></div>
      </div>
      {loading ? <div className="empty"><div className="spinner" /></div>
        : error ? <div className="gate card gate-wide"><p>{error}</p><button type="button" className="btn ghost" onClick={() => load(true, 0)}><Icon name="refresh" size={16} /> Reintentar</button></div>
          : items.length === 0 ? <Empty icon="message" title={q || filter !== 'all' ? 'No encontramos temas con ese filtro' : 'Todavía no hay temas'} text={q || filter !== 'all' ? 'Probá con otra búsqueda.' : 'Creá el primero con “Nuevo tema”.'} />
            : <>
              <div className="fo-rows">{items.map((t) => <TopicRow key={t.id} t={t} author={authors[t.user_id]} />)}</div>
              {!done && <div className="cm-sentinel"><button type="button" className="btn ghost" onClick={() => load(false, items.length)}>Ver más</button></div>}
            </>}
    </section>
  );
}

function Home({ cats }) {
  return (
    <>
      <section className="fo-cats">
        {cats.map((c) => (
          <a key={c.id} className="fo-cat card" href={'#/batforum/c/' + c.slug}>
            <strong>{c.name}</strong>
            <small>{c.description}</small>
            <span className="cm-date">{c.topics} {c.topics === 1 ? 'tema' : 'temas'}{c.unsolved > 0 ? ` · ${c.unsolved} sin resolver` : ''}</span>
          </a>
        ))}
      </section>
      <h2 className="fo-h2">Temas</h2>
      <TopicList />
    </>
  );
}

function NewTopic({ cats, initialSlug }) {
  const { user } = useAuth();
  const up = useUploads(user.id, 3);
  const [cat, setCat] = useState(cats.find((c) => c.slug === initialSlug)?.id || cats[0]?.id || '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { const id = await api.createTopic({ category_id: cat, title: title.trim(), body: body.trim(), media: up.media }); up.commit(); navigate('/batforum/t/' + id); }
    catch (er) { setError(er.message); } finally { setBusy(false); }
  };
  return (
    <form className="cm-composer card" onSubmit={submit}>
      <h2>Nuevo tema</h2>
      <label className="field"><span>Categoría</span>
        <div className="pink-input"><select value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div></label>
      <label className="field"><span>Título (la pregunta en una frase)</span>
        <div className="pink-input"><input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: La primera capa no se pega en la A1" /></div></label>
      <label className="field"><span>Detalle</span>
        <div className="pink-input feedback-text"><textarea rows={7} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Contá qué pasó, qué material y configuración usás y qué ya probaste. Si podés, sumá una foto." /></div></label>
      <small className="feedback-count">{body.length}/5000</small>
      <ImageStrip media={up.media} onDrop={up.drop} />
      {(error || up.error) && <div className="feedback-error">{error || up.error}</div>}
      <div className="modal-actions">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { up.pick(e.target.files); e.target.value = ''; }} />
        <button type="button" className="btn ghost" disabled={up.busy || up.media.length >= 3} onClick={() => fileRef.current?.click()}><Icon name="image" size={16} /> Fotos ({up.media.length}/3)</button>
        <span className="cm-spacer" />
        <button type="button" className="btn text" onClick={() => { up.discard(); navigate('/batforum'); }}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={busy || up.busy || title.trim().length < 5 || !body.trim()}><Icon name="send" size={16} /> {busy ? 'Publicando…' : 'Publicar tema'}</button>
      </div>
    </form>
  );
}

function ReplyBox({ topicId, onSent }) {
  const { user } = useAuth();
  const up = useUploads(user.id, 3);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError('');
    try { await api.addReply({ topicId, body: text.trim(), media: up.media }); up.commit(); up.reset(); setText(''); onSent(); }
    catch (er) { setError(er.message); } finally { setBusy(false); }
  };
  return (
    <form className="fo-reply-box card" onSubmit={send}>
      <div className="pink-input feedback-text"><textarea rows={4} maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribí tu respuesta…" aria-label="Tu respuesta" /></div>
      <ImageStrip media={up.media} onDrop={up.drop} />
      {(error || up.error) && <div className="feedback-error">{error || up.error}</div>}
      <div className="modal-actions">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { up.pick(e.target.files); e.target.value = ''; }} />
        <button type="button" className="btn ghost" disabled={up.busy || up.media.length >= 3} onClick={() => fileRef.current?.click()}><Icon name="image" size={16} /> Foto</button>
        <span className="cm-spacer" />
        <button type="submit" className="btn primary" disabled={busy || up.busy || !text.trim()}><Icon name="send" size={16} /> {busy ? 'Enviando…' : 'Responder'}</button>
      </div>
    </form>
  );
}

function Pics({ media, onOpen }) {
  if (!media?.length) return null;
  return <div className="cm-media n2">{media.map((m) => { const u = api.imageUrl(m.path); return (
    <button type="button" key={m.path} className="cm-img" onClick={() => onOpen(u)} aria-label="Ampliar imagen"><img src={u} alt="" loading="lazy" /></button>); })}</div>;
}

function Topic({ id }) {
  const { canEdit } = useAuth();
  const [data, setData] = useState(undefined);
  const [replies, setReplies] = useState({ items: [], authors: {} });
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(null);
  const [report, setReport] = useState(null);
  const [del, setDel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '' });

  const load = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([api.forumTopic(id), api.forumReplies(id)]);
      setData(t); setReplies(r); setError('');
    } catch (e) { setError(e.message); setData(null); }
  }, [id]);
  useEffect(() => { setData(undefined); load(); }, [load]);

  const run = async (fn) => { try { await fn(); await load(); } catch (e) { setError(e.message); } };

  if (data === undefined) return <div className="empty"><div className="spinner" /></div>;
  if (!data) return <><a className="cm-back" href="#/batforum"><Icon name="arrowLeft" size={16} /> Volver al foro</a>
    <Empty icon="alert" title="Este tema no está disponible" text={error || 'Puede que se haya borrado o esté en revisión.'} /></>;
  const t = data.topic;
  const author = data.authors[t.user_id];
  const canSolve = t.mine || canEdit;
  return (
    <>
      <a className="cm-back" href={'#/batforum/c/' + t.category}><Icon name="arrowLeft" size={16} /> {t.category_name}</a>
      <article className="cm-post card">
        <div className="fo-chips">
          <span className="chip cat">{t.category_name}</span><SolvedChip solved={!!t.solved_reply_id} />
          {t.closed && <span className="chip muted"><Icon name="lock" size={11} /> Cerrado</span>}
          {t.pinned && <span className="chip club"><Icon name="pinned" size={11} /> Destacado</span>}
        </div>
        {editing ? (
          <div className="fo-edit">
            <div className="pink-input"><input value={draft.title} maxLength={140} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Título" /></div>
            <div className="pink-input feedback-text"><textarea rows={6} maxLength={5000} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} aria-label="Detalle" /></div>
            <div className="modal-actions"><button type="button" className="btn text" onClick={() => setEditing(false)}>Cancelar</button>
              <button type="button" className="btn primary" disabled={draft.title.trim().length < 5 || !draft.body.trim()}
                onClick={() => run(async () => { await api.updateTopic(t.id, { title: draft.title.trim(), body: draft.body.trim(), media: t.media }); setEditing(false); })}>Guardar</button></div>
          </div>
        ) : <>
          <h1 className="fo-title">{t.title}</h1>
          <div className="cm-post-head">
            <a href={'#/batfeed/perfil/' + t.user_id}><Avatar author={author} size={34} uid={t.user_id} /></a>
            <div className="cm-p-who"><a href={'#/batfeed/perfil/' + t.user_id} className="cm-name"><Nm uid={t.user_id}>{author?.name || 'Maker'}</Nm></a>
              <span className="cm-date">{api.timeAgo(t.created_at)}{t.edited_at ? ' · editado' : ''}</span></div>
          </div>
          <p className="cm-body">{t.body}</p>
          <Pics media={t.media} onOpen={setZoom} />
        </>}
        <div className="fo-actions">
          {t.mine && !editing && <button type="button" className="cm-link" onClick={() => { setDraft({ title: t.title, body: t.body }); setEditing(true); }}>Editar</button>}
          {(t.mine || canEdit) && <button type="button" className="cm-link" onClick={() => run(() => api.forumTopicSet({ id: t.id, closed: !t.closed }))}>{t.closed ? 'Reabrir' : 'Cerrar tema'}</button>}
          {canEdit && <button type="button" className="cm-link" onClick={() => run(() => api.forumTopicSet({ id: t.id, pinned: !t.pinned }))}>{t.pinned ? 'Quitar destacado' : 'Destacar'}</button>}
          {canEdit && !t.mine && <button type="button" className="cm-link danger" onClick={() => run(async () => { await api.forumTopicSet({ id: t.id, status: 'hidden' }); navigate('/batforum'); })}>Ocultar (mod)</button>}
          {t.mine && <button type="button" className="cm-link danger" onClick={() => setDel(true)}>Eliminar</button>}
          {!t.mine && <button type="button" className="cm-link" onClick={() => setReport({ type: 'topic', id: t.id })}>Reportar</button>}
        </div>
        {error && <div className="feedback-error">{error}</div>}
      </article>

      <h2 className="fo-h2">{replies.items.length} {replies.items.length === 1 ? 'respuesta' : 'respuestas'}</h2>
      {replies.items.length === 0 ? <p className="cm-empty">Todavía nadie respondió. ¡Podés ser la primera persona!</p>
        : <div className="fo-replies">{replies.items.map((r) => {
          const a = replies.authors[r.user_id];
          return (
            <article key={r.id} className={'cm-post card fo-reply' + (r.is_solution ? ' solution' : '')}>
              {r.is_solution && <span className="chip ok"><Icon name="check" size={11} /> Solución</span>}
              <div className="cm-post-head">
                <a href={'#/batfeed/perfil/' + r.user_id}><Avatar author={a} size={34} uid={r.user_id} /></a>
                <div className="cm-p-who"><a href={'#/batfeed/perfil/' + r.user_id} className="cm-name"><Nm uid={r.user_id}>{a?.name || 'Maker'}</Nm></a><span className="cm-date">{api.timeAgo(r.created_at)}</span></div>
              </div>
              <p className="cm-body">{r.body}</p>
              <Pics media={r.media} onOpen={setZoom} />
              <div className="fo-actions">
                {canSolve && (r.is_solution
                  ? <button type="button" className="cm-link" onClick={() => run(() => api.forumSetSolution(t.id, null))}>Quitar solución</button>
                  : <button type="button" className="cm-link ok" onClick={() => run(() => api.forumSetSolution(t.id, r.id))}><Icon name="check" size={12} /> Marcar como solución</button>)}
                {r.mine && <button type="button" className="cm-link danger" onClick={() => run(() => api.deleteReply(r.id))}>Borrar</button>}
                {!r.mine && <button type="button" className="cm-link" onClick={() => setReport({ type: 'reply', id: r.id })}>Reportar</button>}
                {canEdit && !r.mine && <button type="button" className="cm-link danger" onClick={() => run(() => api.forumReplyRemove(r.id))}>Quitar (mod)</button>}
              </div>
            </article>
          );
        })}</div>}
      {t.closed && !canEdit ? <p className="cm-empty"><Icon name="lock" size={14} /> Este tema está cerrado: no admite más respuestas.</p> : <ReplyBox topicId={t.id} onSent={load} />}

      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      {report && <ReportModal type={report.type} id={report.id} onClose={() => setReport(null)} />}
      <Confirm open={del} danger title="¿Eliminar este tema?" text="Se borra con todas sus respuestas. No se puede deshacer." yes="Eliminar"
        onYes={async () => { setDel(false); try { await api.deleteTopic({ id: t.id, media: t.media }); navigate('/batforum'); } catch (e) { setError(e.message); } }} onNo={() => setDel(false)} />
    </>
  );
}

export default function Forum({ route }) {
  const { access, isMember, signIn } = useAuth();
  const flags = api.useCommunityFlags();
  const [cats, setCats] = useState(null);
  const [error, setError] = useState('');
  const [sub, arg] = [route.parts[1], route.parts[2]];

  useEffect(() => {
    if (!isMember || !flags?.batforum) return;
    api.forumCategories().then(setCats).catch((e) => setError(e.missing ? 'BATFORUM todavía no está instalado en la base (falta la migración 045).' : e.message));
  }, [isMember, flags]);

  const gate = gateView({ access, isMember, enabled: !!flags?.batforum, flagsLoaded: flags !== null, signIn, to: '/batforum', icon: 'message',
    title: 'BATFORUM', text: 'Preguntá, respondé y resolvé dudas de impresión 3D, láser, CNC, diseño y electrónica con la comunidad.' });
  if (gate) return gate;
  if (error) return <div className="cm-page"><div className="gate card gate-wide"><p>{error}</p></div></div>;
  if (!cats) return <div className="empty"><div className="spinner" /></div>;

  const cat = sub === 'c' ? cats.find((c) => c.slug === arg) : null;
  return (
    <div className="cm-page">
      <PageHead icon="message" label="Comunidad" title={cat ? cat.name : 'BATFORUM'} text={cat ? cat.description : 'Preguntas y respuestas entre makers. Marcá la solución para ayudar al próximo que tenga el mismo problema.'}>
        {sub !== 'nuevo' && sub !== 't' && <a className="btn primary" href={'#/batforum/nuevo' + (cat ? '?cat=' + cat.slug : '')}><Icon name="edit" size={16} /> Nuevo tema</a>}
      </PageHead>
      {sub === 'nuevo' ? <NewTopic cats={cats} initialSlug={route.query.cat} />
        : sub === 't' ? <Topic id={arg} />
          : cat ? <><a className="cm-back" href="#/batforum"><Icon name="arrowLeft" size={16} /> Todas las categorías</a><TopicList category={cat.slug} /></>
            : sub === 'c' ? <Empty icon="alert" title="Esa categoría no existe" text="Volvé al foro y elegí otra." />
              : <Home cats={cats} />}
    </div>
  );
}
