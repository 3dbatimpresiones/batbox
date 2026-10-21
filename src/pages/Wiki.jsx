import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { WIKI_INTRO, WIKI_SOURCE } from '../data/wiki.js';
import { useWiki } from '../lib/wikiApi.js';
import { norm } from '../lib/text.js';
import Icon from '../components/Icon.jsx';
import WikiEditor from '../components/WikiEditor.jsx';
import { Empty, PageHead, SearchInput } from '../components/ui.jsx';

// =====================================================================
// WIKIBAT — glosario de impresión 3D en orden alfabético.
// Buscador (término, nombre en inglés o definición) + índice A–Z.
// El equipo (admins y editores) agrega y edita términos acá mismo (tabla bb_wiki, migración 008).
// =====================================================================

const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
const letterOf = (t) => (t.term.trim()[0] === 'Ñ' ? 'Ñ' : norm(t.term.trim()[0]).toUpperCase());
export const wikiTags = (terms) => [...new Set(terms.map((t) => t.tag).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

export default function Wiki() {
  const { canEdit } = useAuth();
  const { terms, source, error, reload } = useWiki();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (nuevo) | término
  const editable = canEdit && source === 'db';

  const sorted = useMemo(() => [...terms].sort((a, b) => a.term.localeCompare(b.term, 'es', { sensitivity: 'base' })), [terms]);

  const groups = useMemo(() => {
    const words = norm(q.trim()).split(/\s+/).filter(Boolean);
    const list = sorted.filter((t) => {
      const hay = norm([t.term, t.en, t.def, t.tag].filter(Boolean).join(' '));
      return words.every((w) => hay.includes(w));
    });
    const map = new Map();
    for (const t of list) {
      const l = letterOf(t);
      if (!map.has(l)) map.set(l, []);
      map.get(l).push(t);
    }
    return [...map.entries()].map(([letter, items]) => ({ letter, items }));
  }, [q, sorted]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const present = new Set(groups.map((g) => g.letter));
  // Solo se mueve la vista cuando la persona toca una letra.
  const jump = (l) => document.getElementById('wiki-' + l)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="wiki">
      <PageHead icon="book" label="BAT WIKI" title="WikiBAT · Glosario 3D" text={WIKI_INTRO} />

      {canEdit && source === 'local' && error && (
        <div className="admin-warn"><Icon name="alert" size={18} /> Para editar la WikiBAT falta correr la migración <b>supabase/008_batbox_wiki.sql</b> en Supabase. Mientras tanto se ve la lista fija.</div>
      )}

      <div className="filters card wiki-tools">
        <div className="wiki-search-row">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar un término, en español o en inglés (ej: warping, boquilla, PID)…" />
          {editable && <button className="btn primary" onClick={() => setEditing({})}><Icon name="sparkles" size={16} /> Agregar término</button>}
        </div>
        <nav className="wiki-az" aria-label="Índice alfabético">
          {ALPHABET.map((l) => (
            <button key={l} className="az-btn" disabled={!present.has(l)} onClick={() => jump(l)} aria-label={`Ir a la letra ${l}`}>{l}</button>
          ))}
        </nav>
        <p className="wiki-count">{q ? `${total} ${total === 1 ? 'resultado' : 'resultados'}` : `${total} términos`}</p>
      </div>

      {!groups.length ? (
        <Empty icon="book" title="No encontramos ese término" text="Probá con otra palabra, en español o en inglés. Si falta, contanos en la comunidad y lo sumamos." />
      ) : groups.map((g) => (
        <section key={g.letter} id={'wiki-' + g.letter} className="wiki-group" aria-labelledby={'wiki-h-' + g.letter}>
          <h2 id={'wiki-h-' + g.letter} className="wiki-letter">{g.letter}</h2>
          <div className="wiki-list">
            {g.items.map((t) => (
              <article key={t.id || t.term} className="wiki-term">
                <header>
                  <h3>{t.term}</h3>
                  {t.en && <span className="wiki-en" lang="en">{t.en}</span>}
                  {t.tag && <span className="chip cat">{t.tag}</span>}
                  {editable && (
                    <button className="wiki-edit" onClick={() => setEditing(t)} title={`Editar "${t.term}"`} aria-label={`Editar ${t.term}`}>
                      <Icon name="edit" size={15} />
                    </button>
                  )}
                </header>
                <p>{t.def}</p>
                {(t.pros || t.cons) && (
                  <div className="wiki-pc">
                    {t.pros && <div className="pc ok"><b><Icon name="check" size={14} /> Ventajas</b><span>{t.pros}</span></div>}
                    {t.cons && <div className="pc warn"><b><Icon name="alert" size={14} /> Desventajas</b><span>{t.cons}</span></div>}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      <p className="wiki-credit">
        WikiBAT creada por <b>@3dbat.impresiones</b> y la comunidad Makers 3DBAT · {' '}
        <a href={WIKI_SOURCE} target="_blank" rel="noopener noreferrer">Ver la WikiBAT original <Icon name="external" size={12} /></a>
      </p>

      {editing && (
        <WikiEditor term={editing} tags={wikiTags(terms)} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}
