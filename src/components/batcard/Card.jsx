import { SUITS, rankLabel, cardText } from '../../lib/batcard/hands.js';

// Motivos de taller por palo, en píxeles 12×12. a = color del palo, b = tinta, c = latón, d = filamento rosa.
const MOTIF = {
  S: ['..bbbbbbbb..', '..baaaaaab..', '..babbbbab..', '..baaaaaab..', '..bbbbbbbb..', '....cccc....', '....cccc....', '.....cc.....', '.....dd.....', '....dddd....', '...dd..dd...', '..dd....dd..'],
  H: ['......bb....', '......ab....', '....bbbbb...', '....babab...', '....bbbbb...', '.bbbbbbbbbbb', '.baaaaaaaaab', '..baaaaaaab.', '...baaaaab..', '....bbbbb...', '............', '............'],
  C: ['...bbbbbb...', '..baaaaaab..', '.baabbbbaab.', '.bab....bab.', '.bab.bb.bab.', '.bab.bb.bab.', '.bab....bab.', '.baabbbbaab.', '..baaaaaab..', '...bbbbbb...', '............', '............'],
  D: ['...bbbbbb...', '...baaaab...', '...baaaab...', '..bbbbbbbb..', '..bccccccb..', '...bccccb...', '....bccb....', '.....bb.....', '.....dd.....', '.....dd.....', '....dddd....', '............'],
};
const COL = { S: '#3167FF', H: '#873DFF', C: '#24DCFF', D: '#FF39B8' };
const PAL = { b: '#181833', c: '#E2B13C', d: '#FF39B8' };

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
  const suit = SUITS[card.s];
  const cls = ['bc-card', suit.color === 'pink' ? 'is-pink' : '', selected ? 'sel' : '', scoring ? 'scoring' : '', lit ? 'lit' : ''].join(' ');
  const label = `${cardText(card)}${card.b ? `, +${card.b} Capas` : ''}${selected ? `, seleccionada ${order}` : ''}`;
  const inner = (
    <span className="bc-card-tilt">
    <span className={`bc-card-in${deal != null ? ' deal' : ''}`} style={{ '--ph': idx * 0.7, '--deal': `${deal || 0}ms` }}>
      <span className="bc-corner tl"><b>{rankLabel(card.r)}</b><i>{suit.sym}</i></span>
      <Motif suit={card.s} />
      <span className="bc-corner br"><b>{rankLabel(card.r)}</b><i>{suit.sym}</i></span>
      {card.b > 0 && <span className="bc-bonus">+{card.b}</span>}
      {selected && order && <span className="bc-order">{order}</span>}
    </span>
    </span>
  );
  // Abanico: cada carta rota y baja según su distancia al centro de la mano.
  const st = fan ? (() => { const d = fan.i - (fan.n - 1) / 2; return { '--fr': `${(d * 3.2).toFixed(2)}deg`, '--fy': `${(d * d * 2.4).toFixed(1)}px`, zIndex: fan.i + 1 }; })() : undefined;
  if (!onClick) return <span className={cls} data-cid={card.id} role="img" aria-label={label} style={st}>{inner}</span>;
  return <button type="button" className={cls} data-cid={card.id} aria-pressed={!!selected} aria-label={label} onClick={onClick} disabled={disabled} style={st} onPointerMove={tilt} onPointerLeave={untilt}>{inner}</button>;
}
