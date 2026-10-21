import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { navigate } from '../lib/router.js';
import { newest, useContent } from '../data/ContentContext.jsx';
import Icon from '../components/Icon.jsx';
import { SearchInput, SectionHead } from '../components/ui.jsx';
import { ContentCard, Grid, MiniCard, NewsRow, ToolCard } from '../components/Cards.jsx';

const QUICK = [
  { to: '/tools', icon: 'wrench', label: 'Herramientas' },
  { to: '/academy', icon: 'graduation', label: 'Tutoriales' },
  { to: '/wiki', icon: 'book', label: 'WikiBAT' },
  { to: '/library', icon: 'library', label: 'Recursos' },
  { to: '/community', icon: 'users', label: 'Comunidad' },
];

function ClubBanner() {
  const { access, displayName, signIn } = useAuth();
  const member = access === 'member';
  return (
    <section className="club-banner">
      <div className="cb-glow" />
      <div className="cb-ico"><Icon name="crown" size={30} /></div>
      <div className="cb-txt">
        <div className="section-label">MAKERS CLUB 3DBAT</div>
        <h2>{member ? `¡Hola, ${displayName}! Tu zona exclusiva te espera` : 'Herramientas PRO, tutoriales exclusivos y más'}</h2>
        <p>{member
          ? 'Entrá a Makers Club para usar el Cotizador PRO y ver el contenido exclusivo.'
          : 'Si ya sos miembro, ingresá con tu cuenta de Google y listo: no hace falta registrarte de nuevo.'}</p>
      </div>
      <div className="cb-actions">
        {member && <a className="btn dark" href="#/club">Entrar a Makers Club <Icon name="arrowRight" size={16} /></a>}
        {access === 'guest' && <>
          <button className="btn dark" onClick={() => signIn('/club')}><Icon name="login" size={16} /> Ingresar</button>
          <a className="btn outline-dark" href="#/community">Conocé Makers Club</a>
        </>}
        {!member && access !== 'guest' && <a className="btn dark" href="#/club">Ver mi acceso <Icon name="arrowRight" size={16} /></a>}
      </div>
    </section>
  );
}

export default function Home() {
  const [q, setQ] = useState('');
  const { tools: TOOLS, items, byKind, socials: SOCIALS } = useContent();
  const tutorials = newest(byKind('tutorial')).slice(0, 3);
  const featured = items.filter((i) => i.featured && i.kind === 'tutorial').slice(0, 3);
  const allResources = byKind('resource');
  const resources = (allResources.some((i) => i.featured) ? allResources.filter((i) => i.featured) : allResources).slice(0, 4);
  const news = newest(byKind('news')).slice(0, 4);

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-orb o1" /><div className="hero-orb o2" /><div className="hero-orb o3" />
        <div className="hero-in">
          <div className="hero-logo"><Icon name="box" size={40} /></div>
          <h1 className="wordmark">BAT<span>BOX</span></h1>
          <p className="hero-by">by 3DBAT IMPRESIONES</p>
          <p className="hero-slogan">Todo tu universo maker, en un solo lugar.</p>
          <div className="hero-search">
            <SearchInput value={q} onChange={setQ} placeholder="Buscá tutoriales, herramientas, recursos…"
              onSubmit={(v) => navigate('/buscar' + (v.trim() ? '?q=' + encodeURIComponent(v.trim()) : ''))} />
          </div>
          <div className="quick">
            {QUICK.map((x) => (
              <a key={x.to} href={'#' + x.to} className="quick-item"><Icon name={x.icon} size={18} /> {x.label}</a>
            ))}
          </div>
        </div>
      </section>

      <section className="block">
        <SectionHead label="BAT HERRAMIENTAS" title="Accesos rápidos" to="/tools" />
        <Grid min={340}>{TOOLS.map((t) => <ToolCard key={t.id} tool={t} />)}</Grid>
      </section>

      <section className="block">
        <SectionHead label="BAT TUTORIALES" title="Últimos tutoriales" to="/academy" />
        <Grid min={340}>{tutorials.map((i) => <ContentCard key={i.id} item={i} />)}</Grid>
      </section>

      <ClubBanner />

      {featured.length > 0 && (
        <section className="block">
          <SectionHead label="DESTACADOS" title="Lo que no te podés perder" to="/academy" linkText="Ver tutoriales" />
          <Grid min={340}>{featured.map((i) => <ContentCard key={i.id} item={i} />)}</Grid>
        </section>
      )}

      <div className="two-blocks">
        <section className="block">
          <SectionHead label="BAT RECURSOS" title="Recursos recomendados" to="/library" />
          <div className="card mini-list">{resources.map((i) => <MiniCard key={i.id} item={i} />)}</div>
        </section>
        <section className="block">
          <SectionHead label="NOVEDADES" title="Novedades de 3DBAT" />
          <div className="card news-list">{news.map((i) => <NewsRow key={i.id} item={i} />)}</div>
        </section>
      </div>

      <section className="block">
        <SectionHead label="COMUNIDAD" title="Seguí a 3DBAT" to="/community" linkText="Ir a la comunidad" />
        <div className="social-row">
          {SOCIALS.map((s) => (
            <a key={s.id} className={'social-card' + (s.url ? '' : ' pending')} href={s.url || '#/community'}
              target={s.url ? '_blank' : undefined} rel="noopener noreferrer">
              <span className="card-icon"><Icon name={s.icon} /></span>
              <span className="sc-txt"><strong>{s.label}</strong><small>{s.url ? s.handle : 'Enlace pendiente'}</small></span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
