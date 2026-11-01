import { useState } from 'react';
import Icon from './Icon.jsx';

// Insignia: imagen en public/badges/<slug>.png. Si todavía no está el archivo, muestra un ícono provisorio.
const FALLBACK = { 'maker-semana': 'trophy' };

export function BadgeImg({ slug, size = 40, className = '', variant = '' }) {
  const [bad, setBad] = useState(false);
  const src = `${import.meta.env.BASE_URL}badges/${slug}${variant ? '-' + variant : ''}.png`;
  return bad
    ? <span className={'bdg-fallback ' + className} style={{ width: size, height: size }}><Icon name={FALLBACK[slug] || 'star'} size={Math.round(size * 0.55)} /></span>
    : <img className={'bdg-img ' + className} src={src} alt="" height={size} style={{ height: size, width: 'auto' }} loading="lazy" onError={() => setBad(true)} />;
}

// Lista de insignias de una persona (perfil). badges = [{ slug, name, description, count }]
export function BadgeRow({ badges }) {
  if (!badges?.length) return null;
  return (
    <div className="bdg-row" aria-label="Insignias">
      {badges.map((b) => (
        <span key={b.slug} className="bdg-chip" title={b.description}>
          <BadgeImg slug={b.slug} size={46} variant="iso" />
          <span><b>{b.name}</b>{b.count > 1 && <small> ×{b.count}</small>}</span>
        </span>
      ))}
    </div>
  );
}
