import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useContent } from '../data/ContentContext.jsx';
import { sb } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';
import { Confirm, Empty, SearchInput } from '../components/ui.jsx';

// Moderación de comentarios de Makers Club (migración 003).
// Los admins leen y borran cualquier comentario (RLS: is_admin()).

const fmt = (d) => new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function AdminComments() {
  const { notify } = useAuth();
  const { reloadStats } = useContent();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await sb.from('bb_comments')
      .select('id, author_name, body, created_at, bb_content(title, slug)')
      .order('created_at', { ascending: false }).limit(200);
    if (e) setError(e); else { setRows(data || []); setError(null); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) {
    const missing = /bb_comments/.test(error.message || '');
    return <Empty icon="alert" title={missing ? 'Falta correr la migración 003' : 'No se pudieron cargar los comentarios'}
      text={missing ? 'Corré supabase/003_batbox_interaccion.sql en el SQL Editor para activar likes y comentarios.' : error.message} />;
  }

  const needle = q.trim().toLowerCase();
  const list = rows.filter((r) => !needle || [r.author_name, r.body, r.bb_content?.title].some((v) => v?.toLowerCase().includes(needle)));

  const remove = async (r) => {
    setToDelete(null);
    const { error: e } = await sb.from('bb_comments').delete().eq('id', r.id).select('id');
    if (e) { notify('err', 'No se pudo borrar: ' + e.message); return; }
    notify('ok', 'Comentario borrado');
    setRows((x) => x.filter((c) => c.id !== r.id));
    reloadStats();
  };

  return (
    <div>
      <div className="filters card">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por autor, texto o contenido…" />
        <p className="ed-hint">Los últimos 200 comentarios de Makers Club. Solo los miembros aprobados pueden comentar; acá podés borrar cualquiera.</p>
      </div>
      {loading ? <div className="empty"><div className="spinner" /></div>
        : !list.length ? <Empty icon="message" title="No hay comentarios" text={q ? 'Probá con otra búsqueda.' : 'Cuando los miembros comenten, van a aparecer acá.'} />
        : (
          <ul className="comment-list">
            {list.map((r) => (
              <li key={r.id} className="comment">
                <span className="avatar">{(r.author_name || 'M').charAt(0).toUpperCase()}</span>
                <div className="cm-body">
                  <div className="cm-head">
                    <b>{r.author_name}</b><small>{fmt(r.created_at)}</small>
                    {r.bb_content && <a className="cm-where" href={'#/ver/' + r.bb_content.slug} target="_blank" rel="noopener">en "{r.bb_content.title}"</a>}
                  </div>
                  <p>{r.body}</p>
                </div>
                <button className="mini-btn danger" title="Borrar" onClick={() => setToDelete(r)}><Icon name="trash" size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      <Confirm open={!!toDelete} danger title="¿Borrar este comentario?" text={toDelete ? `${toDelete.author_name}: "${toDelete.body.slice(0, 140)}"` : ''}
        yes="Borrar" onNo={() => setToDelete(null)} onYes={() => remove(toDelete)} />
    </div>
  );
}
