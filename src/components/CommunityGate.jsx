import Icon from './Icon.jsx';
import { imageUrl } from '../lib/communityApi.js';
import { Empty, PageHead } from './ui.jsx';

// Pantalla previa común de los módulos de comunidad: sin sesión, sin membresía o módulo apagado.
// Devuelve null cuando se puede mostrar el módulo.
export function gateView({ access, isMember, enabled, flagsLoaded, signIn, to, icon, title, text }) {
  if (access === 'loading' || !flagsLoaded) return <div className="empty"><div className="spinner" /></div>;
  if (!isMember) {
    return (
      <div className="cm-page">
        <PageHead icon={icon} label="Comunidad" title={title} text={text} />
        <div className="gate card gate-wide">
          <div className="big-ico tone-pink"><Icon name={access === 'guest' ? 'lock' : 'crown'} size={26} /></div>
          <h2>{title} es para el Makers Club</h2>
          <p>{text}</p>
          {access === 'guest'
            ? <button type="button" className="btn primary" onClick={() => signIn(to)}><Icon name="login" size={16} /> Ingresar con Google</button>
            : <a className="btn club" href="#/club"><Icon name="crown" size={16} /> Conocer el Makers Club</a>}
        </div>
      </div>
    );
  }
  if (!enabled) return <div className="cm-page"><Empty icon="lock" title={`${title} no está disponible por ahora`} text="Lo estamos preparando. Volvé pronto." /></div>;
  return null;
}

export function ImageStrip({ media, onDrop }) {
  return media.length > 0 ? (
    <div className="cm-previews">{media.map((m) => (
      <div key={m.path} className="cm-prev"><img src={imageUrl(m.path)} alt="" />
        {onDrop && <button type="button" className="mini-btn" onClick={() => onDrop(m.path)} aria-label="Quitar imagen">×</button>}</div>
    ))}</div>
  ) : null;
}
