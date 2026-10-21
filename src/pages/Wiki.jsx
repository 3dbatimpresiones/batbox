import { useMemo, useState } from 'react';
import { WIKI_INTRO, WIKI_SOURCE, WIKI_TERMS } from '../data/wiki.js';
import { norm } from '../lib/text.js';
import Icon from '../components/Icon.jsx';
import { Empty, PageHead, SearchInput } from '../components/ui.jsx';

// =====================================================================
// WIKIBAT — glosario de impresión 3D en orden alfabético.
// Buscador (término, nombre en inglés o definición) + índice A–Z.
// =====================================================================

const SORTED = [...WIKI_TERMS].sort((a, b) => a.term.localeCompare(b.term, 'es', { sensitivity: 'base' }));
const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
const letterOf = (t) => (t.term.trim()[0] === 'Ñ' ? 'Ñ' : norm(t.term.trim()[0]).toUpperCase());

export default function Wiki() {
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const words = norm(q.trim()).split(/\s+/).filter(Boolean);
    const list = SORTED.filter((t) => {
      const hay = norm([t.term, t.en, t.def, t.tag].filter(Boolean).join(' '));
      return words.every((w) => hay.includes(w));
    });
    const map = new Map();
    for (const t of list) {
      const l = letterOf(t);
      if (!map.has(l)) map.set(l, []);
      map.get(l).push(t);
    }
    return [...map.entries()].map(([letter, terms]) => ({ letter, terms }));
  }, [q]);

  const total = groups.reduce((n, g) => n + g.terms.length, 0);
  const present = new Set(groups.map((g) => g.letter));
  // Solo se mueve la vista cuando la persona toca una letra.
  const jump = (l) => document.getElementById('wiki-' + l)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="wiki">
      <PageHead icon="book" label="BAT WIKI" title="WikiBAT · Glosario 3D" text={WIKI_INTRO} />

      <div className="filters card wiki-tools">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar un término, en español o en inglés (ej: warping, boquilla, PID)…" />
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
            {g.terms.map((t) => (
              <article key={t.term} className="wiki-term">
                <header>
                  <h3>{t.term}</h3>
                  {t.en && <span className="wiki-en" lang="en">{t.en}</span>}
                  {t.tag && <span className="chip cat">{t.tag}</span>}
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
    </div>
  );
}
