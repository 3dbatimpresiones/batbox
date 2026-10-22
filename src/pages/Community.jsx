import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useContent } from '../data/ContentContext.jsx';
import Icon from '../components/Icon.jsx';
import ClubPitch from '../components/ClubPitch.jsx';
import { SocialIcon, brandClass } from '../components/BrandIcon.jsx';
import { PageHead, SectionHead } from '../components/ui.jsx';
import { safeUrl } from '../lib/safeUrl.js';


// Cómo pedir ayuda: todas las consultas se resuelven en la comunidad.
const HELP_STEPS = [
  { n: 1, title: 'Entrá a la comunidad', text: 'Sumate al Discord o a la comunidad de WhatsApp. Es gratis.' },
  { n: 2, title: 'Contá qué te pasa', text: 'Impresora, material, slicer y fotos de la pieza: con eso se resuelve más rápido.' },
  { n: 3, title: 'Lo resolvemos entre todos', text: 'Te responden makers que ya pasaron por lo mismo. Y tu consulta ayuda al próximo.' },
];
const HELP_GROUPS = { discord: 'Entrar al Discord', grupos: 'Unirme a la comunidad' };

function ClubCta() {
  const { access, signIn } = useAuth();
  if (access === 'member') return <a className="btn primary" href="#/club">Entrar a Makers Club <Icon name="arrowRight" size={16} /></a>;
  if (access === 'guest') {
    return (
      <div className="cta-row">
        <button className="btn club" onClick={() => signIn('/acceso')}><Icon name="crown" size={16} /> Quiero unirme al Makers Club</button>
        <button className="btn ghost" onClick={() => signIn('/club')}><Icon name="login" size={16} /> Ya soy miembro: ingresar</button>
      </div>
    );
  }
  if (access === 'none') return <a className="btn club" href="#/acceso"><Icon name="crown" size={16} /> Quiero unirme al Makers Club</a>;
  return <a className="btn primary" href="#/acceso">Ver el estado de mi acceso <Icon name="arrowRight" size={16} /></a>;
}

export default function Community() {
  const { socials: SOCIALS } = useContent();
  // #/community?seccion=club → baja directo a Makers Club
  useEffect(() => {
    if (/[?&]seccion=club\b/.test(window.location.hash)) {
      setTimeout(() => document.getElementById('makers-club')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }, []);
  return (
    <div>
      <PageHead icon="users" label="BAT COMUNIDAD" title="Comunidad Makers 3DBAT"
        text="Una comunidad de makers que imprimen, diseñan y emprenden. Sumate a los grupos, seguinos en redes y conocé Makers Club." />

      <section className="block tight">
        <SectionHead label="SUMATE" title="Grupos y redes" />
        <div className="social-row">
          {SOCIALS.map((s) => (
            <a key={s.id} className={'social-card' + (s.url ? '' : ' pending')} href={safeUrl(s.url)}
              target={s.url ? '_blank' : undefined} rel="noopener noreferrer" aria-disabled={!s.url}>
              <span className={'card-icon' + brandClass(s)}><SocialIcon social={s} /></span>
              <span className="sc-txt"><strong>{s.label}</strong><small>{s.url ? s.handle : 'Enlace pendiente'}</small></span>
              {s.url && <Icon name="external" size={16} className="sc-ext" />}
            </a>
          ))}
        </div>
      </section>

      <ClubPitch id="makers-club">
        <ClubCta />
      </ClubPitch>

      <section className="card club-info help-info">
        <div className="ci-head">
          <div className="card-icon lg"><Icon name="message" size={24} /></div>
          <div>
            <div className="section-label">AYUDA</div>
            <h2>¿Problemas con tu impresión?</h2>
          </div>
        </div>
        <p className="help-lead">Todas las consultas y ayudas se resuelven en la comunidad, así lo que se responde le sirve a todos.</p>
        <ol className="steps">
          {HELP_STEPS.map((s) => (
            <li key={s.n}><span className="step-n">{s.n}</span><div><strong>{s.title}</strong><small>{s.text}</small></div></li>
          ))}
        </ol>
        <div className="help-ctas">
          {SOCIALS.filter((s) => HELP_GROUPS[s.id] && s.url).map((s) => (
            <a key={s.id} className="btn primary" href={safeUrl(s.url)} target="_blank" rel="noopener noreferrer">
              <SocialIcon social={s} size={16} /> {HELP_GROUPS[s.id]}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
