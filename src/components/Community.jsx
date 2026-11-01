import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import * as api from '../lib/communityApi.js';
import Icon from './Icon.jsx';
import { FeatIso, Nm, useFeaturedUid } from './Featured.jsx';
import { Confirm, Options } from './ui.jsx';

// Piezas reutilizables de BATBOX COMMUNITY (BATFEED, BATFORUM y GALERÍA las reutilizan).
// Todo texto de usuarios se pinta como texto (React lo escapa): no hay HTML inyectado.

export function Avatar({ author, size = 40, uid }) {
  const featured = useFeaturedUid();
  const name = author?.name || 'Maker';
  const base = author?.avatar
    ? <img className="cm-avatar" src={author.avatar} alt="" width={size} height={size} loading="lazy" style={{ width: size, height: size }} />
    : <span className="cm-avatar ph" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>;
  // Maker destacado de la semana: aro neón + isotipo al lado de la foto, donde sea que aparezca.
  return uid && featured === uid ? <span className="cm-av-feat">{base}<FeatIso size={Math.max(22, Math.round(size * 0.95))} /></span> : base;
}

// Visor de fotos. Con varias imágenes (`images` + `index`) muestra flechas, contador y deja pasar con el teclado o deslizando.
export function Lightbox({ src, images, index = 0, onClose }) {
  const list = images?.length ? images : [src];
  const [i, setI] = useState(Math.min(Math.max(index, 0), list.length - 1));
  const touch = useRef(null);
  const many = list.length > 1;
  const go = useCallback((d) => setI((x) => (x + d + list.length) % list.length), [list.length]);
  useEffect(() => {
    const on = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose, go]);
  const stop = (e) => e.stopPropagation();
  return createPortal(
    <div className="cm-lightbox" role="dialog" aria-modal="true" aria-label="Imagen ampliada" onClick={onClose}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (touch.current != null && many) { const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); } touch.current = null; }}>
      <button type="button" className="mini-btn cm-lb-x" onClick={onClose} aria-label="Cerrar">×</button>
      {many && <button type="button" className="cm-lb-nav prev" onClick={(e) => { stop(e); go(-1); }} aria-label="Foto anterior">‹</button>}
      <img key={list[i]} className="cm-lb-img" src={list[i]} alt="" onClick={stop} />
      {many && <button type="button" className="cm-lb-nav next" onClick={(e) => { stop(e); go(1); }} aria-label="Foto siguiente">›</button>}
      {many && <div className="cm-lb-count" onClick={stop}>{i + 1} / {list.length}</div>}
    </div>, document.body);
}

export function ReportModal({ type, id, onClose, onDone }) {
  const [reason, setReason] = useState('spam');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const send = async () => {
    setBusy(true); setError('');
    try { await api.reportContent({ type, id, reason, detail }); setSent(true); onDone?.(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rep-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="rep-t">Reportar contenido</h2>
        {sent ? <>
          <p>Gracias. El equipo lo va a revisar. Si varias personas lo reportan, se oculta mientras se revisa.</p>
          <div className="modal-actions"><button type="button" className="btn primary" onClick={onClose}>Listo</button></div>
        </> : <>
          <p>¿Qué pasa con este contenido?</p>
          <Options value={reason} onChange={setReason} options={api.REPORT_REASONS} />
          <div className="pink-input feedback-text"><textarea rows={3} maxLength={300} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Detalle (opcional)" /></div>
          {error && <div className="feedback-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn primary" disabled={busy} onClick={send}><Icon name="flag" size={16} /> {busy ? 'Enviando…' : 'Reportar'}</button>
          </div>
        </>}
      </div>
    </div>, document.body);
}

// ---------------------------------------------------------------- Comentarios
function CommentItem({ c, authors, canMod, onReply, onDelete, onReport, isReply }) {
  const a = authors[c.user_id];
  return (
    <li className={'cm-comment' + (isReply ? ' reply' : '')}>
      <a href={'#/batfeed/perfil/' + c.user_id} className="cm-c-av"><Avatar author={a} size={30} uid={c.user_id} /></a>
      <div className="cm-c-body">
        <div className="cm-c-head">
          <a href={'#/batfeed/perfil/' + c.user_id} className="cm-name"><Nm uid={c.user_id}>{a?.name || 'Maker'}</Nm></a>
          <span className="cm-date">{api.timeAgo(c.created_at)}</span>
        </div>
        <p>{c.body}</p>
        <div className="cm-c-actions">
          {!isReply && <button type="button" className="cm-link" onClick={() => onReply(c)}>Responder</button>}
          {c.mine && <button type="button" className="cm-link" onClick={() => onDelete(c)}>Borrar</button>}
          {!c.mine && <button type="button" className="cm-link" onClick={() => onReport(c)}>Reportar</button>}
          {canMod && !c.mine && <button type="button" className="cm-link danger" onClick={() => onDelete(c, true)}>Quitar (mod)</button>}
        </div>
      </div>
    </li>
  );
}

export function CommentsPanel({ postId, onCount, canMod }) {
  const [data, setData] = useState({ items: [], authors: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    try { const d = await api.loadComments(postId); setData(d); onCount?.(d.items.length); setError(''); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [postId, onCount]);
  useEffect(() => { load(); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setError('');
    try { await api.addComment({ postId, parentId: replyTo?.id, body: text.trim() }); setText(''); setReplyTo(null); await load(); }
    catch (er) { setError(er.message); } finally { setBusy(false); }
  };
  const remove = async (c, asMod) => {
    try { if (asMod) await api.modCommentRemove(c.id); else await api.deleteComment(c.id); await load(); }
    catch (er) { setError(er.message); }
  };

  const top = data.items.filter((c) => !c.parent_id);
  const replies = (id) => data.items.filter((c) => c.parent_id === id);
  return (
    <div className="cm-comments">
      {loading ? <div className="cm-loading"><span className="spinner xs" /> Cargando comentarios…</div>
        : top.length === 0 ? <p className="cm-empty">Todavía no hay comentarios. ¡Sé la primera persona en comentar!</p>
        : <ul className="cm-clist">
          {top.map((c) => (
            <li key={c.id} className="cm-thread">
              <ul>
                <CommentItem c={c} authors={data.authors} canMod={canMod}
                  onReply={(x) => { setReplyTo(x); inputRef.current?.focus(); }} onDelete={remove} onReport={(x) => setReport(x)} />
                {replies(c.id).map((r) => (
                  <CommentItem key={r.id} c={r} authors={data.authors} canMod={canMod} isReply onReply={() => {}} onDelete={remove} onReport={(x) => setReport(x)} />
                ))}
              </ul>
            </li>
          ))}
        </ul>}
      {error && <div className="feedback-error">{error}</div>}
      <form className="cm-cform" onSubmit={send}>
        {replyTo && <div className="cm-replying">Respondiendo a <b>{data.authors[replyTo.user_id]?.name || 'Maker'}</b>
          <button type="button" className="cm-link" onClick={() => setReplyTo(null)}>cancelar</button></div>}
        <div className="pink-input">
          <input ref={inputRef} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Escribí un comentario…" aria-label="Escribir un comentario" />
        </div>
        <button type="submit" className="btn primary" disabled={busy || !text.trim()} aria-label="Enviar comentario"><Icon name="send" size={16} /></button>
      </form>
      {report && <ReportModal type="comment" id={report.id} onClose={() => setReport(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Tarjeta de publicación
function Media({ post, onOpen }) {
  const [play, setPlay] = useState(false);
  const yt = api.youtubeId(post.video_url);
  const imgs = (post.media || []).map((m) => api.imageUrl(m.path));
  return (
    <>
      {imgs.length > 0 && (
        <div className={'cm-media n' + imgs.length}>
          {imgs.map((u) => (
            <button type="button" key={u} className="cm-img" onClick={() => onOpen(u)} aria-label="Ampliar imagen">
              <img src={u} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}
      {yt && (
        <div className="cm-video">
          {play
            ? <iframe src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0`} title="Video de YouTube" loading="lazy"
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            : <button type="button" className="cm-vthumb" onClick={() => setPlay(true)} aria-label="Reproducir video">
              <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" /><span className="cm-play"><Icon name="play" size={28} /></span>
            </button>}
        </div>
      )}
    </>
  );
}

export function PostCard({ post, author, authors, onChanged, onEdit, onTag, openComments = false }) {
  const { canEdit } = useAuth();
  const [p, setP] = useState(post);
  const [showC, setShowC] = useState(openComments);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [report, setReport] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setP(post), [post]);

  const react = async (kind) => {
    setPicker(false);
    const prev = p;
    const had = p.my_reaction;
    const next = had === kind ? null : kind;
    const reactions = { ...p.reactions };
    if (had) reactions[had] = Math.max(0, (reactions[had] || 1) - 1);
    if (next) reactions[next] = (reactions[next] || 0) + 1;
    setP({ ...p, my_reaction: next, reactions, reaction_count: Math.max(0, p.reaction_count + (next ? 1 : 0) - (had ? 1 : 0)) });
    try { await api.setReaction(p.id, had, kind); } catch (e) { setP(prev); setError(e.message); }
  };
  const save = async () => {
    const prev = p;
    setP({ ...p, saved: !p.saved });
    try { await api.setSaved(p.id, !prev.saved); onChanged?.('saved', p.id, !prev.saved); } catch (e) { setP(prev); setError(e.message); }
  };
  const copyLink = async () => {
    setMenu(false);
    const url = `${location.origin}${location.pathname}#/batfeed?post=${p.id}`;
    try { await navigator.clipboard.writeText(url); setError(''); } catch { /* sin portapapeles */ }
  };
  const doDelete = async () => {
    setConfirmDel(false);
    try { await api.deletePost(p); onChanged?.('deleted', p.id); } catch (e) { setError(e.message); }
  };
  const modSet = async (args) => {
    setMenu(false);
    try { await api.modPostSet({ id: p.id, ...args }); onChanged?.(args.status ? 'hidden' : 'pinned', p.id, args); } catch (e) { setError(e.message); }
  };

  const top = Object.entries(p.reactions || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const mine = REACTION_FOR(p.my_reaction);
  return (
    <article className={'cm-post card' + (p.pinned ? ' pinned' : '')}>
      <header className="cm-post-head">
        <a href={'#/batfeed/perfil/' + p.user_id} className="cm-p-av"><Avatar author={author} uid={p.user_id} /></a>
        <div className="cm-p-who">
          <a href={'#/batfeed/perfil/' + p.user_id} className="cm-name"><Nm uid={p.user_id}>{author?.name || 'Maker'}</Nm></a>
          <span className="cm-date">{api.timeAgo(p.created_at)}{p.edited_at ? ' · editado' : ''}</span>
        </div>
        <div className="cm-p-chips">
          {p.pinned && <span className="chip club"><Icon name="pinned" size={11} /> Destacado</span>}
          <span className="chip cat">{api.CATEGORY_LABEL[p.category] || p.category}</span>
        </div>
        <div className="cm-menu-wrap">
          <button type="button" className="icon-btn sm" onClick={() => setMenu((m) => !m)} aria-label="Más opciones" aria-expanded={menu}><Icon name="more" size={18} /></button>
          {menu && (
            <div className="cm-menu" role="menu" onMouseLeave={() => setMenu(false)}>
              <button type="button" role="menuitem" onClick={copyLink}><Icon name="link" size={14} /> Copiar enlace</button>
              {p.mine && <button type="button" role="menuitem" onClick={() => { setMenu(false); if (p.kind === 'project') window.location.hash = '#/galeria/editar/' + p.id; else onEdit?.(p); }}><Icon name="edit" size={14} /> Editar</button>}
              {p.mine && <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(false); setConfirmDel(true); }}><Icon name="trash" size={14} /> Eliminar</button>}
              {!p.mine && <button type="button" role="menuitem" onClick={() => { setMenu(false); setReport(true); }}><Icon name="flag" size={14} /> Reportar</button>}
              {canEdit && <button type="button" role="menuitem" onClick={() => modSet({ pinned: !p.pinned })}><Icon name="pinned" size={14} /> {p.pinned ? 'Quitar destacado' : 'Destacar'}</button>}
              {canEdit && !p.mine && <button type="button" role="menuitem" className="danger" onClick={() => modSet({ status: 'hidden' })}><Icon name="shield" size={14} /> Ocultar (mod)</button>}
            </div>
          )}
        </div>
      </header>

      {p.kind === 'project' && <a className="ga-feedlink" href={'#/galeria/p/' + p.id}><Icon name="image" size={14} /> Proyecto de la Galería Maker<b>{p.title}</b></a>}
      <p className="cm-body">{p.body}</p>
      {p.tags?.length > 0 && <div className="chips cm-tags">{p.tags.map((t) => (
        <button key={t} type="button" className="chip muted cm-tag" onClick={() => onTag?.(t)}>#{t}</button>
      ))}</div>}
      <Media post={p} onOpen={setZoom} />

      {(top.length > 0 || p.comment_count > 0) && (
        <div className="cm-counts">
          <span>{top.map(([k]) => api.REACTION_EMOJI[k]).join('')} {p.reaction_count > 0 && p.reaction_count}</span>
          {p.comment_count > 0 && <button type="button" className="cm-link" onClick={() => setShowC((s) => !s)}>{p.comment_count} {p.comment_count === 1 ? 'comentario' : 'comentarios'}</button>}
        </div>
      )}

      <div className="cm-actions">
        <div className="cm-react-wrap" onMouseLeave={() => setPicker(false)}>
          <button type="button" className={'cm-act' + (p.my_reaction ? ' on' : '')} onClick={() => react(p.my_reaction || 'like')}
            onContextMenu={(e) => { e.preventDefault(); setPicker(true); }} aria-pressed={!!p.my_reaction}>
            <span aria-hidden="true">{mine?.emoji || '👍'}</span> {mine?.label || 'Me gusta'}
          </button>
          <button type="button" className="cm-act cm-more" onClick={() => setPicker((v) => !v)} aria-label="Elegir reacción" aria-expanded={picker}>▾</button>
          {picker && (
            <div className="cm-picker" role="menu">
              {api.REACTIONS.map((r) => (
                <button key={r.kind} type="button" role="menuitem" title={r.label} aria-label={r.label} className={p.my_reaction === r.kind ? 'on' : ''} onClick={() => react(r.kind)}>{r.emoji}</button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className={'cm-act' + (showC ? ' on' : '')} onClick={() => setShowC((s) => !s)} aria-expanded={showC}><Icon name="message" size={16} /> Comentar</button>
        <button type="button" className={'cm-act' + (p.saved ? ' on' : '')} onClick={save} aria-pressed={p.saved}><Icon name="bookmark" size={16} /> {p.saved ? 'Guardado' : 'Guardar'}</button>
      </div>
      {error && <div className="feedback-error">{error}</div>}
      {showC && <CommentsPanel postId={p.id} canMod={canEdit} onCount={(n) => setP((x) => ({ ...x, comment_count: n }))} />}

      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      {report && <ReportModal type="post" id={p.id} onClose={() => setReport(false)} />}
      <Confirm open={confirmDel} danger title="¿Eliminar esta publicación?" text="Se borra con sus comentarios y reacciones. No se puede deshacer." yes="Eliminar" onYes={doDelete} onNo={() => setConfirmDel(false)} />
    </article>
  );
}
const REACTION_FOR = (kind) => api.REACTIONS.find((r) => r.kind === kind);

// ---------------------------------------------------------------- Compositor
export function Composer({ editing, onDone, onCancel }) {
  const { user } = useAuth();
  const [body, setBody] = useState(editing?.body || '');
  const [category, setCategory] = useState(editing?.category || 'proyectos');
  const [tagsText, setTagsText] = useState((editing?.tags || []).map((t) => '#' + t).join(' '));
  const [media, setMedia] = useState(editing?.media || []);
  const [video, setVideo] = useState(editing?.video_url || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const added = useRef([]); // subidas de esta sesión (se borran si se cancela)

  const videoOk = !video || !!api.youtubeId(video.trim());
  const pick = async (files) => {
    setError('');
    const room = api.MAX_IMAGES - media.length;
    if (room <= 0) return setError(`Máximo ${api.MAX_IMAGES} imágenes.`);
    setBusy(true);
    try {
      for (const f of [...files].slice(0, room)) {
        const m = await api.uploadImage(user.id, f);
        added.current.push(m.path);
        setMedia((cur) => [...cur, m]);
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const dropImg = (path) => {
    setMedia((cur) => cur.filter((m) => m.path !== path));
    if (added.current.includes(path)) { api.removeImages([path]); added.current = added.current.filter((x) => x !== path); }
  };
  const cancel = () => { api.removeImages(added.current); onCancel?.(); };

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim() || busy || !videoOk) return;
    setBusy(true); setError('');
    const data = { body: body.trim(), category, tags: api.parseTags(tagsText), media, video_url: video.trim() };
    try {
      if (editing) {
        await api.updatePost(editing.id, data);
        const gone = (editing.media || []).map((m) => m.path).filter((p) => !media.some((m) => m.path === p));
        api.removeImages(gone);
      } else await api.createPost(data);
      added.current = [];
      onDone?.();
    } catch (er) { setError(er.message); } finally { setBusy(false); }
  };

  return (
    <form className="cm-composer card" onSubmit={submit}>
      <h2>{editing ? 'Editar publicación' : 'Compartí con la comunidad'}</h2>
      <div className="pink-input feedback-text">
        <textarea rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} autoFocus
          placeholder="Contá en qué estás trabajando, mostrá una impresión, pedí una opinión…" aria-label="Texto de la publicación" />
      </div>
      <small className="feedback-count">{body.length}/2000</small>
      {media.length > 0 && (
        <div className="cm-previews">
          {media.map((m) => (
            <div key={m.path} className="cm-prev"><img src={api.imageUrl(m.path)} alt="" />
              <button type="button" className="mini-btn" onClick={() => dropImg(m.path)} aria-label="Quitar imagen">×</button></div>
          ))}
        </div>
      )}
      <div className="cm-row">
        <label className="field"><span>Categoría</span>
          <div className="pink-input"><select value={category} onChange={(e) => setCategory(e.target.value)}>
            {api.CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select></div></label>
        <label className="field"><span>Etiquetas (hasta 5)</span>
          <div className="pink-input"><input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="#benchy #petg #ender3" /></div></label>
      </div>
      <label className="field"><span>Video de YouTube (opcional)</span>
        <div className="pink-input"><input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtu.be/…" inputMode="url" /></div>
        {!videoOk && <small className="cm-warn">Solo se aceptan enlaces de YouTube (youtube.com o youtu.be).</small>}</label>
      {error && <div className="feedback-error">{error}</div>}
      <div className="modal-actions">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => pick(e.target.files)} />
        <button type="button" className="btn ghost" disabled={busy || media.length >= api.MAX_IMAGES} onClick={() => fileRef.current?.click()}>
          <Icon name="image" size={16} /> Fotos ({media.length}/{api.MAX_IMAGES})</button>
        <span className="cm-spacer" />
        <button type="button" className="btn text" onClick={cancel}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={busy || !body.trim() || !videoOk}>
          <Icon name="send" size={16} /> {busy ? 'Guardando…' : editing ? 'Guardar' : 'Publicar'}</button>
      </div>
    </form>
  );
}
