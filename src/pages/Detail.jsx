import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { navigate } from '../lib/router.js';
import { useContent } from '../data/ContentContext.jsx';
import { PLATFORM_LABEL } from '../data/tutorials.js';
import { fmtDate, matches } from '../lib/text.js';
import Icon from '../components/Icon.jsx';
import AccessPanel from '../components/AccessPanel.jsx';
import { CommunityBox, PlatformActions } from '../components/Interaction.jsx';
import { AccessChip, Empty, PageHead, SampleChip, SearchInput } from '../components/ui.jsx';
import { ContentCard, Grid, Thumb, ToolCard } from '../components/Cards.jsx';

const KIND_LABEL = { tutorial: 'BAT ACADEMY', video: 'BAT MEDIA', resource: 'BAT LIBRARY', news: 'NOVEDADES' };
const KIND_BACK = { tutorial: '/academy', video: '/media', resource: '/library', news: '/' };

// Reproductor embebido (YouTube / Instagram) o, si no se puede, enlace externo.
export function Embed({ item }) {
  if (item.youtubeId) {
    return (
      <div className="embed">
        <iframe src={`https://www.youtube-nocookie.com/embed/${item.youtubeId}`} title={item.title}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />
      </div>
    );
  }
  if (item.instagramCode) {
    return (
      <div className="embed ig">
        <iframe src={`https://www.instagram.com/p/${item.instagramCode}/embed/`} title={item.title}
          allow="encrypted-media" allowFullScreen loading="lazy" scrolling="no" />
      </div>
    );
  }
  return null;
}

function Payload({ item }) {
  if (item.url) {
    const platform = PLATFORM_LABEL[item.platform] || item.platformLabel;
    const label = platform ? `Ver en ${platform}` : 'Abrir recurso';
    return <a className="btn primary" href={item.url} target="_blank" rel="noopener noreferrer">{label} <Icon name="external" size={16} /></a>;
  }
  return (
    <div className="payload-pending">
      <Icon name="clock" size={18} />
      {item.sample ? 'Contenido de ejemplo: todavía no tiene enlace ni video.' : 'Este contenido todavía no tiene enlace.'}
    </div>
  );
}

export function Detail({ id }) {
  const { isMember } = useAuth();
  const { findItem, loading } = useContent();
  const item = findItem(id);
  if (!item && loading) return <div className="empty"><div className="spinner" /></div>;
  if (!item) return <Empty icon="alert" title="No encontramos este contenido" text="Puede que se haya movido o ya no esté disponible." />;
  const locked = item.access === 'club' && !isMember;
  const hasEmbed = !locked && (item.youtubeId || item.instagramCode);

  return (
    <div className="detail">
      <a className="back" href={'#' + KIND_BACK[item.kind]}><Icon name="arrowLeft" size={16} /> Volver</a>
      <div className={'detail-grid' + (item.instagramCode && !locked ? ' vertical' : '')}>
        {hasEmbed
          ? <Embed item={item} />
          : (!locked && item.url
            ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="thumb-link" aria-label="Ver el video"><Thumb item={item} big /></a>
            : <Thumb item={item} big />)}
        <div className="detail-info">
          <div className="section-label">{KIND_LABEL[item.kind]}</div>
          <h1>{item.title}</h1>
          <div className="chips">
            <span className="chip cat">{item.kind === 'video' ? item.platformLabel : item.category}</span>
            {item.kind !== 'video' && item.platform && <span className="chip">{PLATFORM_LABEL[item.platform]}</span>}
            <AccessChip access={item.access} />
            <SampleChip show={item.sample} />
          </div>
          <p className="detail-desc">{item.description}</p>
          <div className="c-meta">
            {item.level && <span>Nivel: {item.level}</span>}
            {item.duration && <span>Duración: {item.duration}</span>}
            {item.date && <span>{fmtDate(item.date)}</span>}
          </div>
          {!locked && <div className="detail-payload"><Payload item={item} /></div>}
        </div>
      </div>
      {!locked && item.body && <div className="card detail-body">{item.body}</div>}
      {!locked && <PlatformActions item={item} />}
      {locked && <AccessPanel intro="Este contenido es exclusivo de Makers Club" />}
      <CommunityBox item={item} />
    </div>
  );
}

export function Search({ q: initial }) {
  const [q, setQ] = useState(initial);
  useEffect(() => setQ(initial), [initial]);
  const { tools: TOOLS, items: ALL_ITEMS } = useContent();
  const term = q.trim();
  const tools = term ? TOOLS.filter((t) => matches(t, term)) : [];
  const items = term ? ALL_ITEMS.filter((i) => matches(i, term)) : [];
  const submit = (v) => navigate('/buscar' + (v.trim() ? '?q=' + encodeURIComponent(v.trim()) : ''));

  return (
    <div>
      <PageHead icon="search" label="BUSCADOR" title="Buscar en BATBOX" text="Herramientas, tutoriales, videos, recursos y novedades." />
      <div className="filters card">
        <SearchInput value={q} onChange={setQ} onSubmit={submit} placeholder="¿Qué estás buscando?" autoFocus />
      </div>
      {!term && <Empty icon="search" title="Escribí lo que buscás" text="Por ejemplo: calibración, cotizador, PLA, timelapse." />}
      {term && !tools.length && !items.length && <Empty title={`Sin resultados para “${term}”`} text="Probá con otra palabra." />}
      {tools.length > 0 && <Grid min={320}>{tools.map((t) => <ToolCard key={t.id} tool={t} />)}</Grid>}
      {items.length > 0 && <div className="block tight"><Grid>{items.map((i) => <ContentCard key={i.id} item={i} />)}</Grid></div>}
    </div>
  );
}

export function NotFound() {
  return <Empty icon="alert" title="Esta página no existe" text="Usá el menú para volver a una sección de BATBOX." />;
}
