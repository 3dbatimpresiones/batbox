import { useMemo, useState } from 'react';
import { useWiki } from '../lib/wikiApi.js';
import { norm } from '../lib/text.js';
import Icon from '../components/Icon.jsx';
import WikiEditor from '../components/WikiEditor.jsx';
import { Empty, SearchInput } from '../components/ui.jsx';
import { wikiTags } from './Wiki.jsx';

// Pestaña "WikiBAT" del panel: lista completa para agregar, editar y borrar términos.
export default function AdminWiki() {
  const { terms, source, loading, reload } = useWiki();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const list = useMemo(() => {
    const words = norm(q.trim()).split(/\s+/).filter(Boolean);
    return [...terms]
      .filter((t) => words.every((w) => norm([t.term, t.en, t.def, t.tag].filter(Boolean).join(' ')).includes(w)))
      .sort((a, b) => a.term.localeCompare(b.term, 'es', { sensitivity: 'base' }));
  }, [terms, q]);

  if (!loading && source !== 'db') {
    return <Empty icon="book" title="Falta la migración de la WikiBAT" text="Corré supabase/008_batbox_wiki.sql en Supabase para poder agregar y editar términos desde acá." />;
  }

  return (
    <div>
      <div className="filters card">
        <div className="filter-row">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar en la WikiBAT…" />
          <button className="btn primary" onClick={() => setEditing({})}><Icon name="sparkles" size={16} /> Nuevo término</button>
        </div>
        <p className="wiki-count">{list.length} de {terms.length} términos · <a href="#/wiki">Ver la WikiBAT</a></p>
      </div>
      {loading ? <div className="empty"><div className="spinner" /></div>
        : !list.length ? <Empty icon="search" title="Sin resultados" text="Probá con otra palabra." />
        : (
          <div className="admin-list">
            {list.map((t) => (
              <button key={t.id} className="member-row wiki-row" onClick={() => setEditing(t)}>
                <span className="mr-main">
                  <strong>{t.term} {t.tag && <span className="chip cat">{t.tag}</span>}</strong>
                  <small>{t.en ? t.en + ' · ' : ''}{t.def}</small>
                </span>
                <Icon name="edit" size={16} />
              </button>
            ))}
          </div>
        )}
      {editing && (
        <WikiEditor term={editing} tags={wikiTags(terms)} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}
