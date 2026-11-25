import { LINKS, SITE } from '../../config/site.js';
import { BATBOX_SECTIONS } from '../../data/makers.js';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import PrintAnimation from './PrintAnimation.jsx';

// Portada: frase principal + los 4 accesos de BATBOX a la vista apenas se entra
// (antes estaban más abajo y con zoom 100% no se llegaban a ver).
export default function Hero() {
  return (
    <section id="inicio" className="hero" aria-labelledby="inicio-title">
      <div className="container hero-grid">
        <div className="hero-copy">
          <div className="section-label">{SITE.tagline.toUpperCase()}</div>
          <h1 id="inicio-title">Todo lo que un maker necesita, <span className="grad-text nowrap">en un solo lugar.</span></h1>
          <p className="hero-lead">
            Todo vive en <b>BATBOX</b>: herramientas, tutoriales, la comunidad y el Makers Club. Y si algo no te sale,
            no estás solo: en la comunidad Makers 3DBAT lo resolvemos entre todos.
          </p>
          <div className="hero-ctas">
            <Button href="#/tools" iconRight="arrowRight">Ver herramientas</Button>
            <Button href={LINKS.batboxCommunity} variant="ghost" icon="users">Sumate a la comunidad</Button>
          </div>
        </div>
        <div className="hero-visual card">
          <PrintAnimation />
        </div>
      </div>

      <div className="container">
        <nav className="hero-entry" id="batbox" aria-label="Secciones de BATBOX">
          {BATBOX_SECTIONS.map((s) => (
            <a key={s.title} className="entry-card" href={s.href}>
              <span className="card-icon"><Icon name={s.icon} /></span>
              <span className="entry-txt"><strong>{s.title}</strong><small>{s.text}</small></span>
              <Icon name="arrowRight" size={18} className="entry-arrow" />
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}
