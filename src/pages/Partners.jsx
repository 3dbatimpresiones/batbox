import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import * as api from '../lib/communityApi.js';
import { safeUrl } from '../lib/safeUrl.js';
import Icon from '../components/Icon.jsx';
import { Empty, PageHead, SearchInput } from '../components/ui.jsx';
import { SocialIcon } from '../components/BrandIcon.jsx';
import { PartnerLogo, RelationChip } from '../components/PartnerBits.jsx';

// =====================================================================
// BATPARTNERS · PATROCINADORES (#/patrocinadores, #/patrocinadores/<slug>)
// Directorio público de marcas que colaboran con 3DBAT. Lo carga y administra el equipo desde el panel.
// "Patrocinado" = colaboración comercial (la marca paga o aporta a 3DBAT): siempre se rotula así.
// =====================================================================

function Card({ p }) {
  return (
    <a className="pt-card card" href={'#/patrocinadores/' + p.slug}>
      <PartnerLogo p={p} />
      <div className="pt-card-in">
        <div className="fo-chips"><RelationChip relation={p.relation} />{api.partnerTypes(p).map((t) => <span key={t} className="chip muted">{api.PARTNER_TYPE_LABEL[t] || t}</span>)}</div>
        <h3>{p.name}</h3>
        {p.tagline && <p>{p.tagline}</p>}
        {p.benefits > 0 && <span className="pt-ben"><Icon name="sparkles" size={13} /> {p.benefits} {p.benefits === 1 ? 'beneficio' : 'beneficios'}</span>}
      </div>
    </a>
  );
}

function Detail({ slug }) {
  const { isMember } = useAuth();
  const [p, setP] = useState(undefined);
  const [copied, setCopied] = useState('');
  useEffect(() => { setP(undefined); api.partnerDetail(slug).then(setP).catch(() => setP(null)); }, [slug, isMember]);
  if (p === undefined) return <div className="empty"><div className="spinner" /></div>;
  if (!p) return <><a className="cm-back" href="#/patrocinadores"><Icon name="arrowLeft" size={16} /> Patrocinadores</a><Empty icon="alert" title="Esta marca no está disponible" text="Puede que la colaboración haya terminado." /></>;
  const copy = async (b) => {
    api.partnerClick(p.id, 'benefit');
    try { await navigator.clipboard.writeText(b.code); setCopied(b.id); setTimeout(() => setCopied(''), 2200); } catch { /* sin portapapeles */ }
  };
  return (
    <>
      <a className="cm-back" href="#/patrocinadores"><Icon name="arrowLeft" size={16} /> Patrocinadores</a>
      <article className="card pt-detail">
        <div className="pt-head">
          <PartnerLogo p={p} size={120} />
          <div className="pt-head-txt">
            <div className="fo-chips"><RelationChip relation={p.relation} />{api.partnerTypes(p).map((t) => <span key={t} className="chip muted">{api.PARTNER_TYPE_LABEL[t] || t}</span>)}{p.featured && <span className="chip cat"><Icon name="star" size={11} /> Destacado</span>}</div>
            <h1>{p.name}</h1>
            {p.tagline && <p className="pt-tag">{p.tagline}</p>}
            <div className="pt-actions">
              {safeUrl(p.website) && <a className="btn primary" href={safeUrl(p.website)} target="_blank" rel="sponsored noopener noreferrer" onClick={() => api.partnerClick(p.id, 'web')}><Icon name="external" size={16} /> Visitar sitio</a>}
              {p.links.map((l) => safeUrl(l.url) && (
                <a key={l.url} className="btn ghost" href={safeUrl(l.url)} target="_blank" rel="noopener noreferrer" onClick={() => api.partnerClick(p.id, 'social')}><SocialIcon social={{ ...l, icon: 'link' }} size={15} /> {l.label}</a>
              ))}
            </div>
          </div>
        </div>
        {p.description && <p className="cm-body">{p.description}</p>}
        {p.relation === 'sponsor' && <p className="pt-disc"><Icon name="alert" size={13} /> <b>Contenido patrocinado:</b> esta marca colabora económicamente con 3DBAT. Te lo avisamos para que decidas con toda la información.</p>}
        {p.ends_on && <p className="cm-date">Colaboración vigente hasta el {new Date(p.ends_on + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>}
      </article>

      {p.benefits.length > 0 && (
        <section className="pt-benefits">
          <h2 className="fo-h2"><Icon name="sparkles" size={17} /> Beneficios para la comunidad</h2>
          {p.benefits.map((b) => (
            <div key={b.id} className={'card pt-benefit' + (b.locked ? ' locked' : '')}>
              <div className="pt-b-main"><b>{b.title}</b>{b.description && <p>{b.description}</p>}
                {b.valid_until && <small className="cm-date">Válido hasta el {new Date(b.valid_until + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}</small>}</div>
              {b.locked ? (
                <a className="btn club" href="#/club"><Icon name="lock" size={15} /> Exclusivo del Makers Club</a>
              ) : (
                <div className="pt-b-act">
                  {b.code && <button type="button" className="pt-code" onClick={() => copy(b)} title="Copiar código">{copied === b.id ? '¡Copiado!' : b.code} <Icon name="link" size={13} /></button>}
                  {safeUrl(b.url) && <a className="btn ghost" href={safeUrl(b.url)} target="_blank" rel="sponsored noopener noreferrer" onClick={() => api.partnerClick(p.id, 'benefit')}>Ir a la oferta</a>}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

export default function Partners({ route }) {
  const flags = api.useCommunityFlags();
  const [type, setType] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const slug = route.parts[1];
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 300); return () => clearTimeout(t); }, [qInput]);
  useEffect(() => {
    if (slug || !flags?.batpartners) return;
    api.partnersList({ type, q }).then((l) => { setList(l); setError(''); }).catch((e) => setError(e.missing ? 'Los patrocinadores todavía no están instalados en la base (falta la migración 054).' : e.message));
  }, [slug, type, q, flags]);

  if (flags === null) return <div className="empty"><div className="spinner" /></div>;
  if (!flags.batpartners) return <div className="cm-page"><Empty icon="lock" title="Patrocinadores no está disponible por ahora" text="Lo estamos preparando. Volvé pronto." /></div>;
  if (slug) return <div className="cm-page"><Detail slug={slug} /></div>;
  const featured = (list || []).filter((p) => p.featured);
  const rest = (list || []).filter((p) => !p.featured);
  return (
    <div className="cm-page pt-page">
      <PageHead icon="star" label="BATPARTNERS" title="Patrocinadores y colaboradores" text="Las marcas y creadores que acompañan a 3DBAT y a la comunidad maker." />
      <p className="pt-disc"><Icon name="alert" size={13} /> Las marcas con la etiqueta <b>Patrocinado</b> tienen una colaboración comercial con 3DBAT. Las etiquetadas <b>Colaborador</b> no implican pago. Solo mostramos marcas con las que realmente trabajamos.</p>
      <div className="cm-toolbar">
        <SearchInput value={qInput} onChange={setQInput} placeholder="Buscar una marca…" />
        <div className="cm-cats" role="group" aria-label="Tipo">
          <button type="button" className={'opt' + (!type ? ' active' : '')} onClick={() => setType('')}>Todas</button>
          {api.PARTNER_TYPES.map((t) => <button key={t.value} type="button" className={'opt' + (type === t.value ? ' active' : '')} onClick={() => setType(t.value)}>{t.label}</button>)}
        </div>
      </div>
      {error ? <div className="gate card gate-wide"><p>{error}</p></div>
        : !list ? <div className="empty"><div className="spinner" /></div>
          : list.length === 0 ? <Empty icon="star" title={q || type ? 'No encontramos marcas con ese filtro' : 'Pronto vas a ver acá a nuestros patrocinadores'} text={q || type ? 'Probá con otra búsqueda.' : 'Estamos sumando marcas que colaboran con la comunidad.'} />
            : <>
              {featured.length > 0 && <section className="pt-section"><h2 className="fo-h2"><Icon name="star" size={16} /> Destacados</h2><div className="pt-grid">{featured.map((p) => <Card key={p.id} p={p} />)}</div></section>}
              {rest.length > 0 && <section className="pt-section">{featured.length > 0 && <h2 className="fo-h2">Todas las marcas</h2>}<div className="pt-grid">{rest.map((p) => <Card key={p.id} p={p} />)}</div></section>}
            </>}
    </div>
  );
}
