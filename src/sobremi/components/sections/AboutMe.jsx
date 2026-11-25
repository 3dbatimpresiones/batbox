import { LINKS } from '../../config/site.js';
import { ABOUT } from '../../data/about.js';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';

// "Sobre mí": quién está detrás de 3DBAT y su trayectoria.
// Textos en src/data/about.js; fotos en public/img/.
export default function AboutMe() {
  return (
    <section id="sobre-mi" className="section about" aria-labelledby="sobre-mi-title">
      <div className="container">
        <div className="about-top">
          <figure className="about-photo">
            <img src={ABOUT.portrait} alt={ABOUT.portraitAlt} width="720" height="900" loading="lazy" decoding="async" />
          </figure>
          <div className="about-copy">
            <div className="section-label">SOBRE MÍ</div>
            <h2 id="sobre-mi-title" className="section-title">{ABOUT.title} <span className="grad-text">{ABOUT.titleAccent}</span></h2>
            <p className="section-intro about-lead">Soy <strong>{ABOUT.name}</strong>, {ABOUT.lead}</p>
            {ABOUT.paragraphs.map((p) => <p key={p} className="section-intro">{p}</p>)}
            <ol className="about-timeline">
              {ABOUT.timeline.map((t) => (
                <li key={t.title}>
                  <span className="card-icon"><Icon name={t.icon} /></span>
                  <div>
                    <span className="about-when">{t.when}</span>
                    <strong>{t.title}</strong>
                    <p>{t.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="hero-ctas">
              <Button href={LINKS.batboxCommunity} iconRight="arrowRight">Sumate a la comunidad</Button>
            </div>
          </div>
        </div>
        {/* Foto del taller y tarjetas (ABOUT.workshop / ABOUT.values) sacadas por ahora: el dueño va a mandar una foto nueva. */}
      </div>
    </section>
  );
}
