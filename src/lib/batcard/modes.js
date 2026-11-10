// BATCARD reglas v8: mazos iniciales, modificadores de dificultad y desafíos.
// Todo es dato puro: el reducer (game.js) consulta estas tablas. IDs estables (se guardan en partidas y récords).
import { SUIT_IDS } from './hands.js';

// ---------- Mazos iniciales ----------
const ranks = (from, to) => { const o = []; for (let r = from; r <= to; r++) o.push(r); return o; };
const build = (suits, rs, copies = 1, extra = {}) => {
  const out = [];
  for (let k = 0; k < copies; k++) for (const s of suits) for (const r of rs) out.push({ id: `${s}${r}${k ? '_' + k : ''}`, r, s, b: 0, ...extra });
  return out;
};
export const DECKS = {
  fdm: { name: 'Taller FDM', icon: '🖨', pro: 'Mazo completo de 52 cartas.', con: 'Sin ventajas especiales.', plan: 'Estándar: probá cualquier estrategia.',
    cards: () => build(SUIT_IDS, ranks(2, 14)), rules: {} },
  resina: { name: 'Taller de Resina', icon: '💧', pro: '40 cartas (sin 2, 3 ni 4) y todas con +3 Capas.', con: 'Mano de 7 cartas.', plan: 'Manos altas y Capas: Pares, Tríos y Full.',
    cards: () => build(SUIT_IDS, ranks(5, 14), 1, { b: 3 }), rules: { handSize: 7 } },
  laser: { name: 'Taller Láser', icon: '🔺', pro: 'Solo 2 palos (Picas y Corazones, 52 cartas): el Color sale fácil.', con: '2 descartes por ronda.', plan: 'Color y Escalera de color.',
    cards: () => build(['S', 'H'], ranks(2, 14), 2), rules: { discards: 2 } },
  granja: { name: 'Granja de Impresoras', icon: '🏭', pro: 'Empezás con un Mod de Taller al azar.', con: 'Empezás sin Créditos y con 3 Mods como máximo.', plan: 'Sinergias de Mods desde la primera ronda.',
    cards: () => build(SUIT_IDS, ranks(2, 14)), rules: { maxMods: 3 }, credits: 0, startMod: true },
};
export const DECK_IDS = Object.keys(DECKS);

// ---------- Modificadores de dificultad ----------
export const DIFFS = {
  metas: { name: 'Pedido exigente', desc: 'Las metas suben un 20 %.' },
  sin_ahorro: { name: 'Sin ahorro', desc: 'No cobrás interés por tus Créditos.' },
  jefe_duro: { name: 'Inspector estricto', desc: 'En el Control de Calidad tenés 1 impresión menos.' },
  caro: { name: 'Inflación', desc: 'Todo en Suministros cuesta 1 Crédito más.' },
};
export const DIFF_IDS = Object.keys(DIFFS);

// ---------- Desafíos ----------
// rounds: rondas ganadas para cumplirlo (0 = partida completa; Infinity = maratón). Todo lo demás son reglas que lee el reducer.
export const CHALLENGES = [
  // Diarios rápidos
  { id: 'ultima_bobina', n: 1, cat: 'Diarios rápidos', name: 'Última bobina', rule: 'Un solo descarte por ronda.', goal: 'Ganá las 3 rondas del Lote 1.', rounds: 3, rules: { discards: 1 }, daily: true },
  { id: 'primera_pasada', n: 2, cat: 'Diarios rápidos', name: 'Primera pasada', rule: 'Una sola impresión por ronda (metas a la mitad).', goal: 'Ganá 2 rondas.', rounds: 2, rules: { prints: 1 }, targetMul: 0.5, daily: true },
  { id: 'sobra_taller', n: 3, cat: 'Diarios rápidos', name: 'Sobra de taller', rule: 'Mazo reducido: sin cartas del 2 al 6 (32 cartas).', goal: 'Ganá las 3 rondas del Lote 1.', rounds: 3, deckFilter: (c) => c.r >= 7, daily: true },
  { id: 'precision', n: 4, cat: 'Diarios rápidos', name: 'Precisión dimensional', rule: 'Si una ronda termina más de un 5 % arriba de la meta, la pieza sale fuera de medida y perdés.', goal: 'Ganá 2 rondas sin pasarte del 5 %.', rounds: 2, maxOver: 0.05, daily: true },
  // Restricciones
  { id: 'sin_repuestos', n: 5, cat: 'Restricciones', name: 'Sin repuestos', rule: 'No podés comprar ni abrir sobres en Suministros.', goal: 'Ganá 6 rondas (Lotes 1 y 2).', rounds: 6, noBuy: true },
  { id: 'sin_purga', n: 6, cat: 'Restricciones', name: 'Sin purga', rule: 'No hay descartes.', goal: 'Ganá 6 rondas.', rounds: 6, rules: { discards: 0 } },
  { id: 'presupuesto', n: 7, cat: 'Restricciones', name: 'Presupuesto maker', rule: 'Un solo Mod equipado a la vez.', goal: 'Ganá 6 rondas.', rounds: 6, rules: { maxMods: 1 } },
  { id: 'fuera_catalogo', n: 8, cat: 'Restricciones', name: 'Fuera de catálogo', rule: 'El Patrón que más usaste en la ronda anterior queda bloqueado en la siguiente (si hay empate, el último que jugaste).', goal: 'Ganá 6 rondas.', rounds: 6, blockMostUsed: true },
  // Construcción de mazo
  { id: 'pla_petg', n: 9, cat: 'Construcción de mazo', name: 'PLA vs. PETG', rule: 'Mazo de 2 palos. Antes de la primera ronda elegís cuál potenciar (+5 Capas a sus cartas).', goal: 'Ganá 6 rondas.', rounds: 6, deck: 'laser', boostSuit: ['S', 'H'] },
  { id: 'multimaterial', n: 10, cat: 'Construcción de mazo', name: 'Impresión multimaterial', rule: 'Cada ronda pide un palo (rota Picas, Corazones, Tréboles, Diamantes): una mano suma solo si puntúa al menos una carta de ese palo.', goal: 'Ganá 4 rondas.', rounds: 4, reqSuit: true },
  { id: 'taller_compacto', n: 11, cat: 'Construcción de mazo', name: 'Taller compacto', rule: 'Mazo concentrado: solo 9, 10, J, Q, K y A, dos copias de cada una (48 cartas).', goal: 'Ganá 6 rondas.', rounds: 6, deckCards: () => build(SUIT_IDS, ranks(9, 14), 2) },
  { id: 'repuestos_azar', n: 12, cat: 'Construcción de mazo', name: 'Repuestos al azar', rule: 'Suministros ofrece exactamente 2 Mods y solo podés llevarte uno.', goal: 'Ganá 6 rondas.', rounds: 6, twoMods: true },
  // Riesgo y combos
  { id: 'sobrecarga', n: 13, cat: 'Riesgo y combos', name: 'Sobrecarga', rule: 'Repetir el Patrón de tu mano anterior da +3 Mult por repetición seguida, pero cada repetición sube un 10 % la meta de la ronda siguiente.', goal: 'Ganá 6 rondas.', rounds: 6, overload: true },
  { id: 'en_cadena', n: 14, cat: 'Riesgo y combos', name: 'En cadena', rule: 'Una mano solo suma si activa al menos 2 efectos (Mods, materiales, sellos o ediciones). Empezás con Retracción Fina y Bobina Seca.', goal: 'Ganá 3 rondas.', rounds: 3, minEffects: 2, startMods: ['retraccion_fina', 'bobina_seca'] },
  { id: 'calibracion_cruzada', n: 15, cat: 'Riesgo y combos', name: 'Calibración cruzada', rule: 'Alterná manos de valores repetidos (Par, Doble par, Trío, Full, Póker) con manos de secuencia o palo (Escalera, Color, Escalera de color). Carta alta no vale.', goal: 'Ganá 3 rondas.', rounds: 3, alternate: true },
  { id: 'todo_o_nada', n: 16, cat: 'Riesgo y combos', name: 'Todo o nada', rule: 'Antes de imprimir declarás el Patrón. Si acertás: ×1,5 Mult. Si no: la mano suma 0.', goal: 'Ganá 3 rondas.', rounds: 3, declare: true },
  // Jefes
  { id: 'turno_nocturno', n: 17, cat: 'Jefes', name: 'Turno nocturno', rule: 'Las tres rondas del lote son contra jefes.', goal: 'Vencé a 3 jefes seguidos.', rounds: 3, allBoss: true },
  { id: 'doble_falla', n: 18, cat: 'Jefes', name: 'Doble falla', rule: 'El Control de Calidad trae dos reglas de jefe a la vez.', goal: 'Ganá las 3 rondas del Lote 1.', rounds: 3, doubleBoss: true },
  { id: 'revancha', n: 19, cat: 'Jefes', name: 'Revancha de taller', rule: 'Enfrentás al jefe que terminó tu última partida, con un mazo inicial distinto al de esa partida.', goal: 'Ganá las 3 rondas del Lote 1.', rounds: 3, revenge: true },
  { id: 'parada_emergencia', n: 20, cat: 'Jefes', name: 'Parada de emergencia', rule: 'Contra el jefe tenés una impresión menos de lo habitual.', goal: 'Ganá las 3 rondas del Lote 1.', rounds: 3, bossPrintsMinus: 1 },
  // Competitivos y comunidad
  { id: 'misma_mesa', n: 21, cat: 'Competitivos y comunidad', name: 'Misma mesa', rule: 'Semilla semanal, Taller FDM y reglas fijas: todos juegan exactamente la misma partida.', goal: 'Ganá la partida completa (o llegá lo más lejos posible).', rounds: 0, weekly: true, deck: 'fdm' },
  { id: 'mismo_problema', n: 22, cat: 'Competitivos y comunidad', name: 'Mismo problema, distinta solución', rule: 'Semilla semanal y elegís entre Resina, Láser o Granja.', goal: 'Ganá la partida completa.', rounds: 0, weekly: true, decks: ['resina', 'laser', 'granja'] },
  { id: 'maraton', n: 23, cat: 'Competitivos y comunidad', name: 'Maratón maker', rule: 'Después del Lote 4 sigue: cada lote nuevo pide un 60 % más.', goal: 'Superá tantas rondas como puedas.', rounds: Infinity, endless: true },
  { id: 'reto_comunidad', n: 24, cat: 'Competitivos y comunidad', name: 'Reto de la comunidad', rule: 'Armá una partida (mazo, dificultad y semilla) y compartí su código con Makers 3DBAT. Quien lo cargue juega exactamente lo mismo.', goal: 'Ganá la partida completa.', rounds: 0, community: true },
];
export const CH = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

// Jefes que no conviene juntar en "Doble falla".
export const BOSS_CONFLICT = [['corte_luz', 'bobina_enredada']];

// ---------- Semillas de fecha (diario / semanal) ----------
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}W${pad(Math.ceil(((t - y0) / 86400000 + 1) / 7))}`;
}
const DAILY = CHALLENGES.filter((c) => c.daily);
export function dailyChallenge(d = new Date()) {
  const k = dayKey(d); let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { ch: DAILY[h % DAILY.length].id, seed: 'DIA' + k };
}
export const weeklySeed = (d = new Date()) => 'SEM' + weekKey(d);

// ---------- Código compartible: semilla + mazo + dificultad + desafío ----------
export function encodeCode(seed, cfg = {}) {
  const parts = [seed, cfg.deck || 'fdm', (cfg.diffs || []).join('.'), cfg.ch || '', cfg.boost || ''];
  return 'BC-' + btoa(unescape(encodeURIComponent(parts.join('|')))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
export function decodeCode(code) {
  try {
    const raw = String(code).trim().replace(/^BC-/i, '').replace(/-/g, '+').replace(/_/g, '/');
    const [seed, deck, diffs, ch, boost] = decodeURIComponent(escape(atob(raw))).split('|');
    if (!/^[A-Za-z0-9]{3,40}$/.test(seed) || !DECKS[deck]) return null;
    const ds = (diffs || '').split('.').filter((x) => DIFFS[x]);
    return { seed, cfg: { deck, diffs: ds, ...(ch && CH[ch] ? { ch } : {}), ...(boost ? { boost } : {}) } };
  } catch { return null; }
}

// ---------- Normalización y chequeo de compatibilidad (antes de empezar) ----------
export function normalizeCfg(cfg = {}) {
  const ch = cfg.ch && CH[cfg.ch] ? cfg.ch : undefined;
  let deck = DECKS[cfg.deck] ? cfg.deck : 'fdm';
  if (ch && CH[ch].deck) deck = CH[ch].deck;
  const diffs = [...new Set((cfg.diffs || []).filter((d) => DIFFS[d]))].sort();
  const o = { deck, diffs };
  if (ch) o.ch = ch;
  if (cfg.boss) o.boss = cfg.boss;
  if (cfg.prevDeck) o.prevDeck = cfg.prevDeck;
  return o;
}
// Devuelve un texto si la combinación no se puede jugar (se muestra antes de empezar).
export function cfgProblem(cfg) {
  const ch = cfg.ch && CH[cfg.ch];
  if (!ch) return null;
  if (ch.decks && !ch.decks.includes(cfg.deck)) return `Este desafío se juega con ${ch.decks.map((d) => DECKS[d].name).join(', ')}.`;
  if (ch.revenge) {
    if (!cfg.boss) return 'Todavía no perdiste contra ningún jefe: no hay revancha disponible.';
    if (cfg.prevDeck && cfg.prevDeck === cfg.deck) return `Elegí un mazo distinto de ${DECKS[cfg.prevDeck].name}, que es con el que perdiste.`;
  }
  if (ch.rules?.maxMods && DECKS[cfg.deck].startMod && ch.startMods) return 'Combinación incompatible.';
  return null;
}
