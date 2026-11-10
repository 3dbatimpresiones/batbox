import { useLayoutEffect, useRef } from 'react';
import logo3dbat from '../../assets/logo-3dbat.webp';
import { SUITS, rankLabel, cardText } from '../../lib/batcard/hands.js';
import { MATERIALS } from '../../lib/batcard/catalog.js';

// Motivos de taller por palo, en píxeles 12×12. a = color del palo, b = tinta, c = latón, d = filamento rosa.
const MOTIF = {
  S: ['..bbbbbbbb..', '..baaaaaab..', '..babbbbab..', '..baaaaaab..', '..bbbbbbbb..', '....cccc....', '....cccc....', '.....cc.....', '.....dd.....', '....dddd....', '...dd..dd...', '..dd....dd..'],
  H: ['......bb....', '......ab....', '....bbbbb...', '....babab...', '....bbbbb...', '.bbbbbbbbbbb', '.baaaaaaaaab', '..baaaaaaab.', '...baaaaab..', '....bbbbb...', '............', '............'],
  C: ['...bbbbbb...', '..baaaaaab..', '.baabbbbaab.', '.bab....bab.', '.bab.bb.bab.', '.bab.bb.bab.', '.bab....bab.', '.baabbbbaab.', '..baaaaaab..', '...bbbbbb...', '............', '............'],
  D: ['...bbbbbb...', '...baaaab...', '...baaaab...', '..bbbbbbbb..', '..bccccccb..', '...bccccb...', '....bccb....', '.....bb.....', '.....dd.....', '.....dd.....', '....dddd....', '............'],
};
const COL = { S: '#3167FF', H: '#873DFF', C: '#24DCFF', D: '#FF39B8' };
const PAL = { b: '#181833', c: '#E2B13C', d: '#FF39B8' };

// Logo oficial 3DBAT (imagen de la marca).
export function Logo3DBAT({ className = '' }) {
  return <img className={className} src={logo3dbat} alt="" draggable="false" />;
}

// Dorso BATCARD: marco pixel violeta con el logo de 3DBAT al centro.
export function CardBack({ className = '' }) {
  return (
    <span className={`bc-back ${className}`} aria-hidden="true">
      <span className="bc-back-logo"><Logo3DBAT /></span>
      <i>BATCARD</i>
    </span>
  );
}

export function Motif({ suit, size = 12 }) {
  const rows = MOTIF[suit];
  const rects = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') rects.push(<rect key={x + '-' + y} x={x} y={y} width="1.02" height="1.02" fill={ch === 'a' ? COL[suit] : PAL[ch]} />);
  }));
  return <svg className="bc-motif" viewBox="0 0 12 12" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true">{rects}</svg>;
}

// Inclinación 3D que sigue al puntero + brillo; se aplica a la capa del medio (no mueve el área táctil).
function tilt(e) {
  if (e.pointerType !== 'mouse') return; // en táctil no se inclina ni queda "agrandada"
  const el = e.currentTarget.querySelector('.bc-card-tilt');
  if (!el) return;
  const b = e.currentTarget.getBoundingClientRect();
  const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
  el.style.setProperty('--ry', `${((px - 0.5) * 22).toFixed(1)}deg`);
  el.style.setProperty('--rx', `${((0.5 - py) * 18).toFixed(1)}deg`);
  el.style.setProperty('--gx', `${(px * 100).toFixed(0)}%`);
  el.style.setProperty('--gy', `${(py * 100).toFixed(0)}%`);
}
function untilt(e) {
  const el = e.currentTarget.querySelector('.bc-card-tilt');
  if (el) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); }
}

export default function Card({ card, selected, scoring, lit, onClick, order, disabled, idx = 0, deal = null, fan = null }) {
  // Al repartir: la carta arranca boca abajo encima del mazo (.bc-deckpile) y viaja a su lugar.
  const inRef = useRef(null);
  useLayoutEffect(() => {
    if (deal == null || !inRef.current) return;
    const pile = document.querySelector('.bc-deckpile');
    if (!pile) return;
    const a = pile.getBoundingClientRect(), b = inRef.current.parentElement.getBoundingClientRect();
    inRef.current.style.setProperty('--dx', `${Math.round(a.left + a.width / 2 - (b.left + b.width / 2))}px`);
    inRef.current.style.setProperty('--dy', `${Math.round(a.top + a.height / 2 - (b.top + b.height / 2))}px`);
  }, [deal]);
  const suit = SUITS[card.s];
  const mat = card.m && MATERIALS[card.m];
  const cls = ['bc-card', mat ? 'mat-' + card.m : '', suit.color === 'pink' ? 'is-pink' : '', selected ? 'sel' : '', scoring ? 'scoring' : '', lit ? 'lit' : ''].join(' ');
  const label = `${cardText(card)}${mat ? `, de ${mat.name}: ${mat.desc}` : ''}${card.b ? `, +${card.b} Capas` : ''}${selected ? `, seleccionada ${order}` : ''}`;
  const inner = (
    <span className="bc-card-tilt">
    <span ref={inRef} className={`bc-card-in${deal != null ? ' deal' : ''}`} style={{ '--ph': idx * 0.7, '--deal': `${deal || 0}ms` }}>
      {deal != null && <CardBack className="bc-back-ov" />}
      <span className="bc-corner tl"><b>{rankLabel(card.r)}</b><i>{suit.sym}</i></span>
      <Motif suit={card.s} />
      <span className="bc-corner br"><b>{rankLabel(card.r)}</b><i>{suit.sym}</i></span>
      {card.b > 0 && <span className="bc-bonus">+{card.b}</span>}
      {mat && <span className="bc-mat" title={`${mat.name}: ${mat.desc}`}>{mat.short}</span>}
      {selected && order && <span className="bc-order">{order}</span>}
    </span>
    </span>
  );
  // Abanico: cada carta rota y baja según su distancia al centro de la mano.
  const st = fan ? (() => { const d = fan.i - (fan.n - 1) / 2; return { '--fr': `${(d * 3.2).toFixed(2)}deg`, '--fy': `${(d * d * 2.4).toFixed(1)}px`, zIndex: fan.i + 1 }; })() : undefined;
  if (!onClick) return <span className={cls} data-cid={card.id} role="img" aria-label={label} style={st}>{inner}</span>;
  return <button type="button" className={cls} data-cid={card.id} aria-pressed={!!selected} aria-label={label} onClick={onClick} disabled={disabled} style={st} onPointerMove={tilt} onPointerLeave={untilt}>{inner}</button>;
}
