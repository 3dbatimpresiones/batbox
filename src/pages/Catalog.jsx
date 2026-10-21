import { useMemo, useState } from 'react';
import { MEDIA_PLATFORMS } from '../data/sample.js';
import { newest, useContent } from '../data/ContentContext.jsx';
import { matches } from '../lib/text.js';
import Icon from '../components/Icon.jsx';
import { Empty, Options, PageHead, SearchInput, SectionHead } from '../components/ui.jsx';
import { ContentCard, Grid, ToolCard } from '../components/Cards.jsx';

const ACCESS_OPTS = [
  { value: 'all', label: 'Todo' },
  { value: 'free', label: 'Gratis' },
  { value: 'club', label: 'Makers Club' },
];

// Categorías tomadas del propio contenido (las nuevas aparecen solas).
const categoriesOf = (items, key = 'category') => [...new Set(items.map((i) => i[key]).filter(Boolean))];

// Catálogo genérico: buscador + filtro de categoría + filtro de acceso.
function useCatalog(items, catKey = 'category') {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [acc, setAcc] = useState('all');
  const list = useMemo(() => items.filter((i) =>
    (cat === 'all' || i[catKey] === cat) && (acc === 'all' || i.access === acc) && matches(i, q)
  ), [items, catKey, q, cat, acc]);
  return { q, setQ, cat, setCat, acc, setAcc, list };
}

function Filters({ c, categories, placeholder }) {
  return (
    <div className="filters card">
      <SearchInput value={c.q} onChange={c.setQ} placeholder={placeholder} />
      <div className="filter-row">
        <Options value={c.cat} onChange={c.setCat} options={[{ value: 'all', label: 'Todas' }, ...categories]} />
        <div className="view-toggle">
          {ACCESS_OPTS.map((o) => (
            <button key={o.value} className={'seg' + (c.acc === o.value ? ' active' : '')} onClick={() => c.setAcc(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Results({ list }) {
  if (!list.length) return <Empty title="No encontramos nada con esos filtros" text="Probá con otra palabra o elegí otra categoría." />;
  return <Grid>{list.map((i) => <ContentCard key={i.id} item={i} />)}</Grid>;
}

export function Tools() {
  const { tools: TOOLS } = useContent();
  return (
    <div>
      <PageHead icon="wrench" label="BAT TOOLS" title="Herramientas"
        text="Apps y calculadoras para tu taller. Algunas son gratuitas y otras exclusivas de Makers Club." />
      <Grid min={320}>
        {TOOLS.map((t) => <ToolCard key={t.id} tool={t} />)}
        <article className="card tool-card soon-card">
          <div className="card-icon lg"><Icon name="sparkles" size={24} /></div>
          <h3>Más herramientas en camino</h3>
          <p>BATBOX está preparado para sumar nuevas apps y calculadoras sin rediseñar nada.</p>
        </article>
      </Grid>
    </div>
  );
}

export function Academy() {
  const { byKind } = useContent();
  const all = byKind('tutorial');
  const items = useMemo(() => newest(all), [all]);
  const c = useCatalog(items);
  return (
    <div>
      <PageHead icon="graduation" label="BAT ACADEMY" title="Tutoriales"
        text="Aprendé a imprimir mejor, diseñar tus piezas y hacer crecer tu emprendimiento." />
      <Filters c={c} categories={categoriesOf(items)} placeholder="Buscar tutoriales…" />
      <Results list={c.list} />
    </div>
  );
}

export function Media() {
  const { byKind } = useContent();
  const all = byKind('video');
  const items = useMemo(() => newest(all), [all]);
  const c = useCatalog(items, 'platform');
  const platforms = categoriesOf(items, 'platform').map((value) => ({ value, label: MEDIA_PLATFORMS[value]?.label || value }));
  return (
    <div>
      <PageHead icon="video" label="BAT MEDIA" title="Videos y reels"
        text="Videos de YouTube, Shorts y reels de Instagram de 3DBAT. Algunos se abren directamente en su plataforma." />
      <Filters c={c} categories={platforms} placeholder="Buscar videos…" />
      <Results list={c.list} />
    </div>
  );
}

export function Library() {
  const { byKind } = useContent();
  const items = byKind('resource');
  const c = useCatalog(items);
  const featured = items.filter((i) => i.featured);
  const filtering = c.q || c.cat !== 'all' || c.acc !== 'all';
  return (
    <div>
      <PageHead icon="library" label="BAT LIBRARY" title="Recursos"
        text="Enlaces, programas y recursos útiles para makers, elegidos por 3DBAT." />
      {!filtering && featured.length > 0 && (
        <section className="block tight">
          <SectionHead label="RECOMENDADOS" title="Los favoritos de 3DBAT" />
          <Grid min={220}>{featured.map((i) => <ContentCard key={i.id} item={i} />)}</Grid>
        </section>
      )}
      <SectionHead label="BIBLIOTECA" title="Todos los recursos" />
      <Filters c={c} categories={categoriesOf(items)} placeholder="Buscar recursos…" />
      <Results list={c.list} />
    </div>
  );
}
