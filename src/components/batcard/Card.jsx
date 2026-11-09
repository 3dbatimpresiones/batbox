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

export default function Card({ card, selected, scoring, lit, onClick, order, disabled, idx = 0 }) {
  const suit = SUITS[card.s];
  const cls = ['bc-card', suit.color === 'pink' ? 'is-pink' : '', selected ? 'sel' : '', scoring ? 'scoring' : '', lit ? 'lit' : ''].join(' ');
  const label = `${cardText(card)}${card.b ? `, +${card.b} Capas` : ''}${selected ? `, seleccionada ${order}` : ''}`;
  const inner = (
    <span className="bc-card-in" style={{ '--ph': idx * 0.7 }}>
      <span className="bc-corner tl"><b>{rankLabel(card.r)}</b><i>{suit.sym}</i></span>
      <Motif suit={card.s} />
      <span className="bc-corner br"><b>{rankLabel(card.r)}</b><i>{suit.sym}</i></span>
      {card.b > 0 && <span className="bc-bonus">+{card.b}</span>}
      {selected && order && <span className="bc-order">{order}</span>}
    </span>
  );
  if (!onClick) return <span className={cls} role="img" aria-label={label}>{inner}</span>;
  return <button type="button" className={cls} aria-pressed={!!selected} aria-label={label} onClick={onClick} disabled={disabled}>{inner}</button>;
}
