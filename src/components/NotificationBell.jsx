import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import * as api from '../lib/communityApi.js';
import { navigate } from '../lib/router.js';
import Icon from './Icon.jsx';
import { Avatar } from './Community.jsx';

// Campana de notificaciones internas (migración 044). Las crea solo la base;
// acá se leen, se marcan como leídas y se eligen preferencias.
// Diseñada para sumar push después: la tabla ya tiene pushed_at.

const TEXT = {
  comment: 'comentó tu publicación',
  reply: 'respondió tu comentario',
  reaction: 'reaccionó a tu publicación',
  badge: 'te entregó una insignia',
  forum_reply: 'respondió tu tema del foro',
  forum_solution: 'marcó tu respuesta como solución',
  library_new: 'sumó modelos nuevos',
};
const PREF_LABEL = {
  badge: 'Insignias que gano', comment: 'Comentarios en mis publicaciones', reply: 'Respuestas a mis comentarios', reaction: 'Reacciones a mis publicaciones',
  forum_reply: 'Respuestas en mis temas del foro', forum_solution: 'Mi respuesta marcada como solución',
  library_new: 'Modelos nuevos en la Biblioteca 3D',
 };

export default function NotificationBell() {
  const { isMember, user } = useAuth();
  const flags = api.useCommunityFlags();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [error, setError] = useState('');
  const [off, setOff] = useState(false);
  const wrap = useRef(null);
  const active = isMember && !!(flags?.batfeed || flags?.batforum || flags?.batgallery) && !off;

  const refreshCount = useCallback(async () => {
    try { setCount(await api.unreadCount()); } catch (e) { if (e.missing) setOff(true); }
  }, []);
  useEffect(() => {
    if (!active) return undefined;
    refreshCount();
    const t = setInterval(() => { if (document.visibilityState === 'visible') refreshCount(); }, 60000);
    return () => clearInterval(t);
  }, [active, refreshCount]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setError('');
      try { setData(await api.loadNotifications()); refreshCount(); } catch (e) { setError(e.message); }
    }
  };
  const readAll = async () => {
    try { await api.markRead(null); setData((d) => d && { ...d, items: d.items.map((n) => ({ ...n, read: true })) }); setCount(0); } catch (e) { setError(e.message); }
  };
  const go = async (n) => {
    setOpen(false);
    if (!n.read) { api.markRead([n.id]).then(refreshCount).catch(() => {}); }
    if (n.kind === 'library_new') { navigate('/biblioteca'); return; }
    if (!n.post_id) return;
    if (n.ref_type === 'topic') navigate('/batforum/t/' + n.post_id);
    else if (n.ref_type === 'badge' || n.post_kind === 'project') navigate('/galeria/p/' + n.post_id);
    else navigate('/batfeed?post=' + n.post_id);
  };
  const openPrefs = async () => {
    setShowPrefs((v) => !v);
    if (!prefs) { try { setPrefs(await api.loadPrefs()); } catch (e) { setError(e.message); } }
  };
  const setPref = async (k, on) => {
    const next = { ...prefs, [k]: on };
    setPrefs(next);
    try { await api.savePrefs(user.id, next); } catch (e) { setError(e.message); }
  };

  if (!active) return null;
  return (
    <div className="nb-wrap" ref={wrap}>
      <button type="button" className={'icon-btn' + (open ? ' active' : '')} onClick={toggle} aria-label={count ? `Notificaciones, ${count} sin leer` : 'Notificaciones'} aria-expanded={open} title="Notificaciones">
        <Icon name="bell" />
        {count > 0 && <span className="nb-badge">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="nb-panel" role="dialog" aria-label="Notificaciones">
          <div className="nb-head">
            <strong>Notificaciones</strong>
            <span>
              <button type="button" className="cm-link" onClick={readAll} disabled={!count}>Marcar todas como leídas</button>
              <button type="button" className="cm-link" onClick={openPrefs}>{showPrefs ? 'Volver' : 'Preferencias'}</button>
            </span>
          </div>
          {error && <div className="feedback-error">{error}</div>}
          {showPrefs ? (
            <div className="nb-prefs">
              {!prefs ? <span className="spinner xs" /> : Object.entries(PREF_LABEL).map(([k, label]) => (
                <label key={k} className="nb-pref"><input type="checkbox" checked={prefs[k] !== false} onChange={(e) => setPref(k, e.target.checked)} /> {label}</label>
              ))}
              <small>Más adelante vas a poder recibir avisos en tu celular.</small>
            </div>
          ) : !data ? <div className="cm-loading"><span className="spinner xs" /> Cargando…</div>
            : data.items.length === 0 ? <p className="cm-empty">No tenés notificaciones todavía.</p>
              : (
                <ul className="nb-list">
                  {data.items.map((n) => {
                    const a = data.authors[n.actor_id];
                    return (
                      <li key={n.id}>
                        <button type="button" className={'nb-item' + (n.read ? '' : ' unread')} onClick={() => go(n)}>
                          <Avatar author={a} size={34} uid={n.actor_id} />
                          <span className="nb-txt"><b>{n.kind === 'library_new' ? 'La Biblioteca 3D' : a?.name || 'Alguien'}</b> {TEXT[n.kind] || 'tiene novedades para vos'}
                            {n.snippet && <em>“{n.snippet}”</em>}
                            <small>{api.timeAgo(n.created_at)}</small></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
        </div>
      )}
    </div>
  );
}
