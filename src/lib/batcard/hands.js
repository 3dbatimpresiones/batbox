// Cartas y evaluador de Patrones (manos de póker). Puro.
export const SUITS = {
  S: { sym: '♠', name: 'Picas', motif: 'Hotend', color: 'ink' },
  H: { sym: '♥', name: 'Corazones', motif: 'Benchy', color: 'pink' },
  C: { sym: '♣', name: 'Tréboles', motif: 'Bobina', color: 'ink' },
  D: { sym: '♦', name: 'Diamantes', motif: 'Boquilla', color: 'pink' },
};
export const SUIT_IDS = ['S', 'H', 'C', 'D'];
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const RANK_NAME = { 11: 'Jota', 12: 'Reina', 13: 'Rey', 14: 'As' };
export const rankLabel = (r) => RANK_LABEL[r] || String(r);
export const rankName = (r) => RANK_NAME[r] || String(r);
export const cardChips = (r) => (r === 14 ? 11 : r >= 11 ? 10 : r);
export const isFace = (r) => r >= 11 && r <= 13;
export const cardText = (c) => `${rankName(c.r)} de ${SUITS[c.s].name}`;

export function standardDeck() {
  const out = [];
  for (const s of SUIT_IDS) for (let r = 2; r <= 14; r++) out.push({ id: `${s}${r}`, r, s, b: 0 });
  return out;
}

// Patrones en orden de fuerza. base = Capas × Multiplicador; lvl = suma por nivel de Perfil.
export const PATTERNS = [
  { id: 'alta', name: 'Carta alta', chips: 5, mult: 1, lvl: [10, 1] },
  { id: 'par', name: 'Par', chips: 12, mult: 2, lvl: [15, 1] },
  { id: 'doble', name: 'Doble par', chips: 20, mult: 2, lvl: [20, 1] },
  { id: 'trio', name: 'Trío', chips: 30, mult: 3, lvl: [20, 2] },
  { id: 'escalera', name: 'Escalera', chips: 30, mult: 4, lvl: [30, 3] },
  { id: 'color', name: 'Color', chips: 35, mult: 4, lvl: [15, 2] },
  { id: 'full', name: 'Full', chips: 40, mult: 4, lvl: [25, 2] },
  { id: 'poker', name: 'Póker', chips: 60, mult: 7, lvl: [30, 3] },
  { id: 'ecolor', name: 'Escalera de color', chips: 100, mult: 8, lvl: [40, 4] },
];
export const PATTERN = Object.fromEntries(PATTERNS.map((p) => [p.id, p]));

// Escalera de 5 rangos distintos. A-2-3-4-5 (as bajo) y 10-J-Q-K-A válidas; sin vuelta (Q-K-A-2-3 no).
function isStraight(ranks) {
  if (ranks.length !== 5 || new Set(ranks).size !== 5) return false;
  const s = [...ranks].sort((a, b) => a - b);
  if (s[4] - s[0] === 4) return true;
  return s.join(',') === '2,3,4,5,14';
}

// cards: en orden de selección. Devuelve { id, scoring: [índices en cards] }.
export function evaluate(cards) {
  const n = cards.length;
  if (n < 1 || n > 5) return null;
  const byRank = new Map();
  cards.forEach((c, i) => { if (!byRank.has(c.r)) byRank.set(c.r, []); byRank.get(c.r).push(i); });
  const all = cards.map((_, i) => i);
  const flush = n === 5 && cards.every((c) => c.s === cards[0].s);
  const straight = isStraight(cards.map((c) => c.r));
  if (flush && straight) return { id: 'ecolor', scoring: all };
  // Grupos ordenados por tamaño y luego rango (desempate por rango).
  const groups = [...byRank.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0]);
  const sizes = groups.map((g) => g[1].length);
  if (sizes[0] === 4) return { id: 'poker', scoring: groups[0][1] };
  if (sizes[0] === 3 && sizes[1] === 2) return { id: 'full', scoring: all };
  if (flush) return { id: 'color', scoring: all };
  if (straight) return { id: 'escalera', scoring: all };
  if (sizes[0] === 3) return { id: 'trio', scoring: groups[0][1] };
  if (sizes[0] === 2 && sizes[1] === 2) return { id: 'doble', scoring: [...groups[0][1], ...groups[1][1]].sort((a, b) => a - b) };
  if (sizes[0] === 2) return { id: 'par', scoring: groups[0][1] };
  // Carta alta: mayor rango; empate imposible entre rangos distintos, pero se respeta el orden de selección.
  let best = 0;
  cards.forEach((c, i) => { if (c.r > cards[best].r) best = i; });
  return { id: 'alta', scoring: [best] };
}
