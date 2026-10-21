import { useAuth } from '../auth/AuthContext.jsx';
import { useContent } from '../data/ContentContext.jsx';
import { CLUB_BENEFITS } from '../data/sample.js';
import Icon from '../components/Icon.jsx';
import { PageHead, SectionHead } from '../components/ui.jsx';

const STEPS = [
  { n: 1, title: 'Completá la solicitud', text: 'Usá el mismo correo de Google con el que vas a ingresar.' },
  { n: 2, title: 'Verificamos tu membresía', text: 'La administración revisa que tu membresía esté activa.' },
  { n: 3, title: 'Ingresá con Google', text: 'Una vez aprobado, entrás a Makers Club y al Cotizador PRO.' },
];

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
        <button className="btn primary" onClick={() => signIn('/club')}><Icon name="login" size={16} /> Ingresar para solicitar o usar mi acceso</button>
        <small className="cta-note">Al ingresar te mostramos si ya tenés acceso o cómo pedirlo, así nunca repetís la solicitud.</small>
      </div>
    );
  }
  return <a className="btn primary" href="#/club">Ver el estado de mi acceso <Icon name="arrowRight" size={16} /></a>;
}

export default function Community() {
  const { socials: SOCIALS } = useContent();
  return (
    <div>
      <PageHead icon="users" label="BAT COMMUNITY" title="Comunidad Makers 3DBAT"
        text="Una comunidad de makers que imprimen, diseñan y emprenden. Sumate a los grupos, seguinos en redes y conocé Makers Club." />

      <section className="block tight">
        <SectionHead label="SUMATE" title="Grupos y redes" />
        <div className="social-row">
          {SOCIALS.map((s) => (
            <a key={s.id} className={'social-card' + (s.url ? '' : ' pending')} href={s.url || undefined}
              target={s.url ? '_blank' : undefined} rel="noopener noreferrer" aria-disabled={!s.url}>
              <span className="card-icon"><Icon name={s.icon} /></span>
              <span className="sc-txt"><strong>{s.label}</strong><small>{s.url ? s.handle : 'Enlace pendiente'}</small></span>
              {s.url && <Icon name="external" size={16} className="sc-ext" />}
            </a>
          ))}
        </div>
      </section>

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
            <a key={s.id} className="btn primary" href={s.url} target="_blank" rel="noopener noreferrer">
              <Icon name={s.icon} size={16} /> {HELP_GROUPS[s.id]}
            </a>
          ))}
        </div>
      </section>

      <section className="card club-info">
        <div className="ci-head">
          <div className="card-icon lg pink"><Icon name="crown" size={24} /></div>
          <div>
            <div className="section-label">MAKERS CLUB 3DBAT</div>
            <h2>Beneficios de la membresía</h2>
          </div>
        </div>
        <div className="benefits">
          {CLUB_BENEFITS.map((b) => (
            <div key={b.title} className="benefit">
              <span className="benefit-ico"><Icon name={b.icon} size={18} /></span>
              <div><strong>{b.title}</strong><small>{b.text}</small></div>
            </div>
          ))}
        </div>

        <div className="section-label">CÓMO SUMARTE</div>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.n}><span className="step-n">{s.n}</span><div><strong>{s.title}</strong><small>{s.text}</small></div></li>
          ))}
        </ol>
        <ClubCta />
      </section>
    </div>
  );
}
