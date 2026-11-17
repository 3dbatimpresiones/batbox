import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty, PageHead, SearchInput } from '../components/ui.jsx';
import { filterProducts, loadCatalog, photoUrl, productLink, whatsappLink } from '../lib/catalogApi.js';
import '../styles/catalog.css';

// 3DBAT CATALOG público: #/trabajos y #/trabajos/<slug>.
export default function Trabajos({ route }) {
  const [state, setState] = useState({ loading: true, error: '', categories: [], products: [], settings: {} });
  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((d) => alive && setState({ loading: false, error: '', ...d }))
      .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: e.message })));
    return () => { alive = false; };
  }, []);

  const slug = route.parts[1];
  // Solo lo publicado (los editores también ven borradores en la base, acá se ocultan).
  const published = useMemo(() => state.products.filter((p) => p.status === 'published'), [state.products]);

  if (state.loading) return <div className="cat-loading">Cargando catálogo…</div>;
  if (state.error) return <Empty icon="alert" title="No se pudo cargar el catálogo" text={state.error} />;
  if (slug) {
    const p = published.find((x) => x.slug === slug);
    return p ? <Detail p={p} phone={state.settings.whatsapp} /> : <Empty icon="search" title="Trabajo no encontrado" text="Puede que se haya despublicado." />;
  }
  return <List products={published} categories={state.categories} phone={state.settings.whatsapp} />;
}

function List({ products, categories, phone }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const usedCats = categories.filter((c) => c.active && products.some((p) => p.category_id === c.id));
  const list = filterProducts(products, { q, category });
  const featured = !q && category === 'all' ? products.filter((p) => p.featured) : [];
  return (
    <div className="cat">
      <PageHead icon="image" label="3DBAT CATALOG" title="Trabajos en impresión 3D"
        text="Piezas reales que hicimos. ¿Querés algo parecido o a medida? Consultanos por WhatsApp.">
        <a className="btn primary" href={whatsappLink(phone)} target="_blank" rel="noreferrer"><Icon name="message" size={18} /> Consulta personalizada</a>
      </PageHead>

      {featured.length > 0 && (
        <section className="cat-featured">
          <h2 className="cat-h"><Icon name="star" size={18} /> Destacados</h2>
          <div className="cat-grid">{featured.map((p) => <Card key={p.id} p={p} />)}</div>
        </section>
      )}

      <div className="filters card cat-filters">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar trabajos…" />
        {usedCats.length > 0 && (
          <div className="opts" role="group">
            <button type="button" className={'opt' + (category === 'all' ? ' active' : '')} onClick={() => setCategory('all')}>Todos</button>
            {usedCats.map((c) => (
              <button key={c.id} type="button" className={'opt' + (category === c.id ? ' active' : '')} onClick={() => setCategory(c.id)}>{c.name}</button>
            ))}
          </div>
        )}
      </div>

      {list.length
        ? <div className="cat-grid">{list.map((p) => <Card key={p.id} p={p} />)}</div>
        : <Empty icon="search" title={products.length ? 'Sin resultados' : 'Pronto vas a ver trabajos acá'} text={products.length ? 'Probá con otra búsqueda o categoría.' : ''} />}
    </div>
  );
}

function Card({ p }) {
  return (
    <a className="cat-card card" href={`#/trabajos/${p.slug}`}>
      <div className="cat-thumb">
        {p.cover ? <img src={photoUrl(p.cover)} alt={p.title} loading="lazy" /> : <Icon name="image" size={34} />}
        {p.featured && <span className="cat-star"><Icon name="star" size={14} /></span>}
      </div>
      <div className="cat-card-body">
        {p.category_name && <span className="cat-chip">{p.category_name}</span>}
        <h3>{p.title}</h3>
      </div>
    </a>
  );
}

function Detail({ p, phone }) {
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState(false);
  const link = productLink(p.slug);
  const photos = p.photos.length ? p.photos : [];
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: p.title, url: link });
      else { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch { /* cancelado */ }
  };
  return (
    <div className="cat cat-detail">
      <a className="cat-back" href="#/trabajos">← Todos los trabajos</a>
      <div className="cat-detail-grid">
        <div className="cat-gallery">
          <div className="cat-main card">
            {photos[i] ? <img src={photoUrl(photos[i].path)} alt={p.title} /> : <Icon name="image" size={48} />}
          </div>
          {photos.length > 1 && (
            <div className="cat-thumbs">
              {photos.map((f, k) => (
                <button key={f.id} className={'cat-tn' + (k === i ? ' active' : '')} onClick={() => setI(k)} aria-label={`Foto ${k + 1}`}>
                  <img src={photoUrl(f.path)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="cat-info card">
          {p.category_name && <span className="cat-chip">{p.category_name}</span>}
          <h1>{p.title}</h1>
          {p.show_client && p.client && <p className="cat-client">Hecho para <b>{p.client}</b></p>}
          {p.description && <p className="cat-desc">{p.description}</p>}
          <div className="cat-actions">
            <a className="btn primary wide" href={whatsappLink(phone, p, link)} target="_blank" rel="noreferrer"><Icon name="message" size={18} /> Consultar por WhatsApp</a>
            <button className="btn ghost wide" onClick={share}><Icon name="link" size={18} /> {copied ? 'Link copiado' : 'Compartir'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
