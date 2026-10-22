import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useContent } from '../data/ContentContext.jsx';
import { sb } from '../lib/supabase.js';
import { INSTAGRAM, YOUTUBE } from '../config.js';
import Icon from './Icon.jsx';
import { Confirm } from './ui.jsx';
import { safeUrl } from '../lib/safeUrl.js';

// =====================================================================
// INTERACCIÓN EN CADA CONTENIDO
// 1) PlatformActions: suscribirse / like / comentar en TU canal.
//    YouTube tiene botón oficial de suscripción embebible; like y comentar
//    solo se pueden hacer en YouTube/Instagram (no lo permiten desde otra web).
// 2) CommunityBox: likes, dislikes y comentarios propios de BATBOX,
//    solo para miembros de Makers Club (migración 003, RLS en Supabase).
// =====================================================================

export function PlatformActions({ item }) {
  const isYT = item.platform === 'youtube' || item.platform === 'short';
  const isIG = item.platform === 'instagram';
  if (!isYT && !isIG) return null;

  if (isYT) {
    return (
      <section className="platform-actions card">
        <div className="pa-head"><Icon name="youtube" size={18} /> Apoyá el canal en YouTube</div>
        <div className="pa-row">
          <iframe className="yt-sub" title="Suscribirme a 3DBAT en YouTube" loading="lazy"
            src={`https://www.youtube.com/subscribe_embed?channelid=${YOUTUBE.channelId}&layout=full&count=default&theme=dark`} />
          <div className="pa-btns">
            <a className="btn ghost" href={safeUrl(item.url) || YOUTUBE.url} target="_blank" rel="noopener noreferrer"><Icon name="thumbsUp" size={16} /> Dar like en YouTube</a>
            <a className="btn ghost" href={safeUrl(item.url) || YOUTUBE.url} target="_blank" rel="noopener noreferrer"><Icon name="message" size={16} /> Comentar en YouTube</a>
          </div>
        </div>
        <p className="pa-hint">Tus likes y comentarios en YouTube ayudan a que el video llegue a más makers. YouTube no deja hacerlos desde otra página, por eso se abren allá.</p>
      </section>
    );
  }
  return (
    <section className="platform-actions card">
      <div className="pa-head"><Icon name="instagram" size={18} /> Apoyá a 3DBAT en Instagram</div>
      <div className="pa-btns">
        <a className="btn primary" href={INSTAGRAM.url} target="_blank" rel="noopener noreferrer"><Icon name="instagram" size={16} /> Seguir a @{INSTAGRAM.handle}</a>
        <a className="btn ghost" href={safeUrl(item.url) || INSTAGRAM.url} target="_blank" rel="noopener noreferrer"><Icon name="heart" size={16} /> Like y comentarios en Instagram</a>
      </div>
      <p className="pa-hint">Instagram no deja dar like ni comentar desde otra página, por eso se abre la publicación original.</p>
    </section>
  );
}

// Solo `npm run dev` con ?simdb: comentarios ficticios para ver el diseño (no guarda nada).
const SIM = import.meta.env.DEV && new URLSearchParams(window.location.search).has('simdb');
const SIM_COMMENTS = [
  { id: 'c1', author_name: 'Facundo C.', body: 'Me salvó la primera capa, gracias! Lo probé con PETG y también funciona.', created_at: new Date(Date.now() - 36e5).toISOString(), user_id: 'sim' },
  { id: 'c2', author_name: 'Maker U.', body: '¿Sirve igual para la A1 normal o solo para la mini?', created_at: new Date(Date.now() - 864e5 * 2).toISOString(), user_id: 'otro' },
];

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function ago(iso) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps = [[60, 'second'], [3600, 'minute', 60], [86400, 'hour', 3600], [2592000, 'day', 86400], [31536000, 'month', 2592000], [Infinity, 'year', 31536000]];
  for (const [limit, unit, div = 1] of steps) if (Math.abs(s) < limit) return rtf.format(Math.round(s / div), unit);
  return '';
}

export function CommunityBox({ item }) {
  // isAdmin acá = puede moderar comentarios (admin o editor)
  const { isMember, canEdit: isAdmin, access, user, signIn, notify } = useAuth();
  const { statsOf, reloadStats, interactionsEnabled } = useContent();
  const [mine, setMine] = useState(null);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const canRead = isMember || isAdmin;
  const dbId = item.dbId;

  const loadComments = useCallback(async () => {
    if (!dbId || !canRead) return;
    if (SIM) { setComments(SIM_COMMENTS); return; }
    setLoadingComments(true);
    const { data, error } = await sb.from('bb_comments').select('id, author_name, body, created_at, user_id')
      .eq('content_id', dbId).order('created_at', { ascending: false }).limit(100);
    if (!error) setComments(data || []);
    setLoadingComments(false);
  }, [dbId, canRead]);

  useEffect(() => {
    if (!dbId || !isMember || !user) { setMine(null); return; }
    if (SIM) { setMine(1); return; }
    sb.from('bb_reactions').select('value').eq('content_id', dbId).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setMine(data?.value ?? null));
  }, [dbId, isMember, user]);
  useEffect(() => { loadComments(); }, [loadComments]);

  if (!dbId || !interactionsEnabled) return null;
  const st = statsOf(dbId) || { likes: 0, dislikes: 0, comments: 0 };

  const react = async (v) => {
    if (!isMember) return;
    if (SIM) { setMine(mine === v ? null : v); return; }
    setBusy(true);
    const prev = mine;
    setMine(prev === v ? null : v);
    const { error } = prev === v
      ? await sb.from('bb_reactions').delete().eq('content_id', dbId).eq('user_id', user.id)
      : await sb.from('bb_reactions').upsert({ content_id: dbId, value: v }, { onConflict: 'content_id,user_id' });
    if (error) { setMine(prev); notify('err', 'No se pudo guardar: ' + error.message); }
    reloadStats();
    setBusy(false);
  };

  const post = async () => {
    const body = text.trim();
    if (!body) return;
    if (SIM) { setComments((c) => [{ id: 'n' + Date.now(), author_name: 'Maker', body, created_at: new Date().toISOString(), user_id: user?.id }, ...c]); setText(''); return; }
    setBusy(true);
    const { data, error } = await sb.from('bb_comments').insert({ content_id: dbId, body })
      .select('id, author_name, body, created_at, user_id').single();
    setBusy(false);
    if (error) { notify('err', /Demasiados/.test(error.message) ? error.message : 'No se pudo publicar el comentario.'); return; }
    setComments((c) => [data, ...c]);
    setText('');
    reloadStats();
  };

  const remove = async (c) => {
    setToDelete(null);
    const { error } = await sb.from('bb_comments').delete().eq('id', c.id);
    if (error) { notify('err', 'No se pudo borrar.'); return; }
    setComments((list) => list.filter((x) => x.id !== c.id));
    reloadStats();
  };

  return (
    <section className="community-box card">
      <div className="cb-top">
        <div>
          <div className="section-label">COMUNIDAD MAKERS CLUB</div>
          <h2>¿Te sirvió este contenido?</h2>
        </div>
        <div className="react-btns">
          <button className={'react-btn' + (mine === 1 ? ' on like' : '')} disabled={!isMember || busy} onClick={() => react(1)} title={isMember ? 'Me gusta' : 'Exclusivo de Makers Club'}>
            <Icon name="thumbsUp" size={18} /> <b>{st.likes}</b>
          </button>
          <button className={'react-btn' + (mine === -1 ? ' on dislike' : '')} disabled={!isMember || busy} onClick={() => react(-1)} title={isMember ? 'No me gusta' : 'Exclusivo de Makers Club'}>
            <Icon name="thumbsDown" size={18} /> <b>{st.dislikes}</b>
          </button>
          <span className="react-count"><Icon name="message" size={16} /> {st.comments}</span>
        </div>
      </div>

      {!canRead ? (
        <div className="cb-locked">
          <Icon name="lock" size={18} />
          <span>Los likes y comentarios son exclusivos de <b>Makers Club</b>.</span>
          {access === 'guest'
            ? <button className="btn primary" onClick={() => signIn()}><Icon name="login" size={16} /> Ingresar</button>
            : <a className="btn ghost" href="#/club">Ver mi acceso</a>}
        </div>
      ) : (
        <>
          {isMember && (
            <div className="comment-form">
              <div className="pink-input"><textarea rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Contá tu experiencia, hacé una pregunta o sumá un tip…"
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) post(); }} /></div>
              <div className="cf-foot">
                <small>{text.length}/1000 · Ctrl+Enter para publicar</small>
                <button className="btn primary" onClick={post} disabled={busy || !text.trim()}><Icon name="send" size={15} /> Publicar</button>
              </div>
            </div>
          )}
          {loadingComments && !comments.length && <div className="cb-empty"><div className="spinner xs" /></div>}
          {!loadingComments && !comments.length && <div className="cb-empty">Todavía no hay comentarios. ¡Sé el primero!</div>}
          <ul className="comment-list">
            {comments.map((c) => (
              <li key={c.id} className="comment">
                <span className="avatar">{(c.author_name || 'M').charAt(0).toUpperCase()}</span>
                <div className="cm-body">
                  <div className="cm-head"><b>{c.author_name}</b><small>{ago(c.created_at)}</small></div>
                  <p>{c.body}</p>
                </div>
                {(c.user_id === user?.id || isAdmin) && (
                  <button className="mini-btn danger" title="Borrar comentario" onClick={() => setToDelete(c)}><Icon name="trash" size={14} /></button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <Confirm open={!!toDelete} danger title="¿Borrar el comentario?" text={toDelete ? `"${toDelete.body.slice(0, 120)}"` : ''}
        yes="Borrar" onNo={() => setToDelete(null)} onYes={() => remove(toDelete)} />
    </section>
  );
}

// Contadores chicos para las tarjetas (solo si hay algo que mostrar).
export function CardStats({ item }) {
  const { statsOf } = useContent();
  const st = statsOf(item.dbId);
  if (!st || (!st.likes && !st.comments)) return null;
  return (
    <span className="card-stats">
      {st.likes > 0 && <span><Icon name="thumbsUp" size={12} /> {st.likes}</span>}
      {st.comments > 0 && <span><Icon name="message" size={12} /> {st.comments}</span>}
    </span>
  );
}
