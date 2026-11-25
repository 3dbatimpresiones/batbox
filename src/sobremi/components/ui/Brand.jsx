import Icon from './Icon.jsx';

// Marca: logo cuadrado con degradé rosa→índigo + nombre (sistema de diseño 1 y 6.1).
export default function Brand({ href = '#inicio', tagline }) {
  return (
    <a className="brand" href={href} aria-label="3DBAT IMPRESIONES, ir al inicio">
      <span className="brand-logo"><Icon name="layers" size={26} /></span>
      <span className="brand-text">
        <span className="brand-name">3DBAT <span className="c-cyan">IMPRESIONES</span></span>
        {tagline && <span className="tagline">{tagline}</span>}
      </span>
    </a>
  );
}
