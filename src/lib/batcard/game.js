// Reducer de partida BATCARD. Puro: step(state, action) → { state, events } | { error }.
// Una acción inválida devuelve error SIN tocar el estado ni consumir RNG (se trabaja sobre una copia).
import { RNG_VERSION, seedState, shuffle, randInt } from './rng.js';
import { standardDeck, evaluate, SUIT_IDS, PATTERNS } from './hands.js';
import { MODS, MOD, CALIBRATIONS, SPOOLS, CAL, PROFILES, PROF, BOSSES, TARGETS, BLIND_NAMES, BLIND_PAY, RULES, MIN_DECK } from './catalog.js';
import { scoreHand } from './score.js';

export const RULES_VERSION = 2; // v2: materiales en las cartas. Las partidas v1 siguen con sus reglas.
export const SUPPORTED_RULES = [1, 2];
export const LOTS = TARGETS.length;

export function newGame(seed, v = RULES_VERSION) {
  const rng = { deck: seedState(seed + '/mazo'), shop: seedState(seed + '/tienda'), boss: seedState(seed + '/jefe') };
  const bosses = shuffle(rng.boss, BOSSES.map((b) => b.id));
  return {
    v, rngVersion: RNG_VERSION, seed, rng,
    phase: 'preview', lot: 0, blind: 0, credits: 4,
    deck: standardDeck(), mods: [], cals: [], levels: {}, bosses,
    round: null, shop: null, last: null,
    stats: { bestHand: 0, prints: 0, total: 0 },
    log: [], // acciones válidas en orden: el servidor rejuega la partida con esto para el ranking
  };
}

export const blindInfo = (st) => ({
  name: BLIND_NAMES[st.blind], target: TARGETS[st.lot][st.blind],
  pay: BLIND_PAY[st.blind], boss: st.blind === 2 ? st.bosses[st.lot % st.bosses.length] : null,
});

const fail = (error) => ({ error });
// Solo los campos que usan las reglas (así el log es chico y no lleva basura).
const compact = (a) => {
  const o = { t: a.type };
  for (const k of ['ids', 'overextrude', 'idx', 'cardId', 'suit', 'from', 'to', 'slot']) if (a[k] !== undefined && a[k] !== false) o[k] = a[k];
  return o;
};
export const expand = (o) => { const { t, ...rest } = o; return { type: t, ...rest }; };

export function step(prev, action) {
  const st = structuredClone(prev);
  const events = [];
  const res = apply(st, action, events);
  if (res) return fail(res);
  if (Array.isArray(st.log) && action.type !== 'MOVE_MOD_PREVIEW') st.log.push(compact(action));
  return { state: st, events };
}

function apply(st, a, ev) {
  switch (a.type) {
    case 'START_ROUND': {
      if (st.phase !== 'preview') return 'No es momento de empezar una ronda.';
      const info = blindInfo(st);
      const draw = shuffle(st.rng.deck, st.deck.map((c) => c.id));
      st.round = {
        target: info.target, boss: info.boss, score: 0,
        prints: RULES.prints, discards: RULES.discards - (info.boss === 'bobina_enredada' ? 1 : 0),
        heat: 0, draw, hand: [], printsDone: 0, lastPattern: null, patternsScored: [], discardedSincePlay: false,
      };
      refill(st);
      st.phase = 'round';
      st.last = null;
      ev.push({ type: 'round_start' });
      return null;
    }
    case 'PLAY': {
      if (st.phase !== 'round') return 'No hay una ronda en curso.';
      const r = st.round;
      const cards = pickHand(st, a.ids);
      if (typeof cards === 'string') return cards;
      if (r.prints <= 0) return 'No quedan impresiones.';
      const over = !!a.overextrude;
      if (over && r.heat > RULES.overLimit) return 'Con Calor 5 o 6 no se puede Sobreextruir.';
      const heat = over ? Math.min(RULES.heatMax, r.heat + RULES.overHeat) : r.heat;
      const evald = evaluate(cards);
      const result = scoreHand({
        cards, scoringIdx: evald.scoring, pattern: evald.id, level: st.levels[evald.id] || 0,
        mods: st.mods, boss: r.boss, heat, overextrude: over, round: r,
      });
      r.heat = heat;
      r.score += result.total;
      r.prints -= 1;
      r.printsDone += 1;
      r.lastPattern = evald.id;
      r.patternsScored.push(evald.id);
      r.discardedSincePlay = false;
      r.hand = r.hand.filter((id) => !a.ids.includes(id));
      if (st.v >= 2) {
        const scoredCards = evald.scoring.map((i) => cards[i]);
        const cf = scoredCards.filter((c) => c.m === 'carbono').length;
        if (cf) r.heat = Math.min(RULES.heatMax, r.heat + cf);
        // TPU: rebota a la mano una vez por ronda
        r.tpuBack = r.tpuBack || [];
        for (const c of cards) if (c.m === 'tpu' && !r.tpuBack.includes(c.id)) { r.tpuBack.push(c.id); r.hand.push(c.id); }
      }
      st.stats.prints += 1;
      st.stats.total += result.total;
      st.stats.bestHand = Math.max(st.stats.bestHand, result.total);
      st.last = { pattern: evald.id, played: a.ids, scoring: evald.scoring.map((i) => cards[i].id), ...result };
      ev.push({ type: 'scored', ...st.last });
      if (r.score >= r.target) return winRound(st, ev);
      if (r.prints <= 0) { st.phase = 'defeat'; ev.push({ type: 'defeat', reason: 'Te quedaste sin impresiones.' }); return null; }
      refill(st);
      if (!r.hand.length) { st.phase = 'defeat'; ev.push({ type: 'defeat', reason: 'No quedan cartas para imprimir.' }); }
      return null;
    }
    case 'DISCARD': {
      if (st.phase !== 'round') return 'No hay una ronda en curso.';
      const r = st.round;
      if (r.discards <= 0) return 'No quedan descartes.';
      const cards = pickHand(st, a.ids);
      if (typeof cards === 'string') return cards;
      if (st.v >= 2 && cards.some((c) => c.m === 'petg')) return 'El PETG es pegajoso: no se puede descartar.';
      r.discards -= 1;
      r.heat = Math.max(0, r.heat - 1); // enfría 1 una vez por acción
      r.discardedSincePlay = true;
      r.hand = r.hand.filter((id) => !a.ids.includes(id));
      refill(st);
      ev.push({ type: 'discarded', ids: a.ids });
      if (!r.hand.length) { st.phase = 'defeat'; ev.push({ type: 'defeat', reason: 'No quedan cartas para imprimir.' }); }
      return null;
    }
    case 'USE_CAL': {
      if (st.phase !== 'round') return 'Las calibraciones se usan durante una ronda.';
      const id = st.cals[a.idx];
      const cal = CAL[id];
      if (!cal) return 'Esa calibración no existe.';
      const r = st.round;
      if (cal.target !== 'none') {
        if (!r.hand.includes(a.cardId)) return 'Elegí una carta de tu mano.';
      }
      const card = st.deck.find((c) => c.id === a.cardId);
      if (cal.mat) {
        if (card.m === cal.mat) return `Esa carta ya es de ${cal.name.replace('Bobina de ', '')}.`;
        card.m = cal.mat;
      } else if (id === 'flujo') card.b = (card.b || 0) + 4;
      else if (id === 'cambio_bobina') {
        if (!SUIT_IDS.includes(a.suit) || a.suit === card.s) return 'Elegí un palo distinto.';
        card.s = a.suit;
      } else if (id === 'corte_ras') {
        if (st.deck.length <= MIN_DECK) return `El mazo no puede bajar de ${MIN_DECK} cartas.`;
        st.deck = st.deck.filter((c) => c.id !== a.cardId);
        r.hand = r.hand.filter((x) => x !== a.cardId);
        refill(st);
      } else if (id === 'enfriamiento') {
        if (r.heat <= 0) return 'El Calor ya está en 0.';
        r.heat = Math.max(0, r.heat - 2);
      }
      st.cals.splice(a.idx, 1);
      ev.push({ type: 'cal_used', id });
      return null;
    }
    case 'MOVE_MOD': {
      const { from, to } = a;
      if (!(from in st.mods) || to < 0 || to >= st.mods.length) return 'Posición inválida.';
      const [x] = st.mods.splice(from, 1);
      st.mods.splice(to, 0, x);
      return null;
    }
    case 'SELL_MOD': {
      if (st.phase !== 'shop') return 'Solo podés vender en Suministros.';
      const id = st.mods[a.idx];
      if (!id) return 'No hay Mod en ese lugar.';
      st.mods.splice(a.idx, 1);
      st.credits += Math.floor(MOD[id].price / 2);
      return null;
    }
    case 'BUY': {
      if (st.phase !== 'shop') return 'Suministros está cerrado.';
      const it = st.shop.items[a.slot];
      if (!it || it.sold) return 'Ese producto ya no está.';
      if (st.credits < it.price) return 'No te alcanzan los Créditos.';
      if (it.kind === 'mod' && st.mods.length >= RULES.maxMods) return `Máximo ${RULES.maxMods} Mods. Vendé uno primero.`;
      if (it.kind === 'cal' && st.cals.length >= RULES.maxCals) return `Máximo ${RULES.maxCals} calibraciones guardadas.`;
      st.credits -= it.price;
      it.sold = true;
      if (it.kind === 'mod') st.mods.push(it.id);
      else if (it.kind === 'cal') st.cals.push(it.id);
      else if (it.kind === 'profile') { const p = PROF[it.id].pattern; st.levels[p] = (st.levels[p] || 0) + 1; }
      ev.push({ type: 'bought', item: it });
      return null;
    }
    case 'REROLL': {
      if (st.phase !== 'shop') return 'Suministros está cerrado.';
      if (st.credits < st.shop.rerollCost) return 'No te alcanzan los Créditos.';
      st.credits -= st.shop.rerollCost;
      st.shop.rerollCost += 1;
      st.shop.items = rollShop(st);
      return null;
    }
    case 'LEAVE_SHOP': {
      if (st.phase !== 'shop') return 'Suministros está cerrado.';
      st.shop = null;
      st.blind += 1;
      if (st.blind > 2) { st.blind = 0; st.lot += 1; }
      st.phase = 'preview';
      return null;
    }
    default: return 'Acción desconocida.';
  }
}

function pickHand(st, ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5) return 'Elegí de 1 a 5 cartas.';
  if (new Set(ids).size !== ids.length) return 'Carta repetida.';
  if (!ids.every((id) => st.round.hand.includes(id))) return 'Esa carta no está en tu mano.';
  return ids.map((id) => st.deck.find((c) => c.id === id));
}

function refill(st) {
  const r = st.round;
  while (r.hand.length < RULES.handSize && r.draw.length) r.hand.push(r.draw.shift());
}

function winRound(st, ev) {
  const r = st.round;
  let pay = BLIND_PAY[st.blind] + r.prints;
  const extra = [];
  for (const id of st.mods) {
    const e = MOD[id].effect;
    if (e.phase === 'round_win' && e.when({ round: r })) { pay += e.value; extra.push(`${MOD[id].name}: +${e.value}`); }
  }
  st.credits += pay;
  ev.push({ type: 'round_won', pay, extra, base: BLIND_PAY[st.blind], left: r.prints });
  st.lastWin = { pay, extra, base: BLIND_PAY[st.blind], left: r.prints, score: r.score, target: r.target };
  if (st.lot === LOTS - 1 && st.blind === 2) { st.phase = 'victory'; ev.push({ type: 'victory' }); return null; }
  st.phase = 'shop';
  st.shop = { rerollCost: 2, items: [] };
  st.shop.items = rollShop(st);
  return null;
}

// 2 Mods (que no tengas) + 2 consumibles (Perfil 60 % / calibración 40 %).
function rollShop(st) {
  const s = st.rng.shop;
  const pool = MODS.filter((m) => !st.mods.includes(m.id));
  const items = [];
  for (let i = 0; i < 2 && pool.length; i++) {
    const m = pool.splice(randInt(s, pool.length), 1)[0];
    items.push({ kind: 'mod', id: m.id, price: m.price });
  }
  for (let i = 0; i < 2; i++) {
    if (randInt(s, 10) < 6) { const p = PROFILES[randInt(s, PROFILES.length)]; items.push({ kind: 'profile', id: p.id, price: p.price }); }
    else { const pool = st.v >= 2 ? [...CALIBRATIONS, ...SPOOLS] : CALIBRATIONS; const c = pool[randInt(s, pool.length)]; items.push({ kind: 'cal', id: c.id, price: c.price }); }
  }
  return items;
}

// Pronóstico para la UI (no modifica nada).
export function preview(st, ids, overextrude) {
  if (st.phase !== 'round' || !ids.length || ids.length > 5) return null;
  const cards = ids.map((id) => st.deck.find((c) => c.id === id));
  const e = evaluate(cards);
  const heat = overextrude ? Math.min(RULES.heatMax, st.round.heat + RULES.overHeat) : st.round.heat;
  const level = st.levels[e.id] || 0;
  // Mismo cálculo que al imprimir: el total estimado es exacto.
  const score = scoreHand({ cards, scoringIdx: e.scoring, pattern: e.id, level, mods: st.mods, boss: st.round.boss, heat, overextrude: !!overextrude, round: st.round });
  return { pattern: e.id, scoring: e.scoring.map((i) => cards[i].id), heat, level, score };
}

// ---------- Guardado ----------
export function validateSave(x) {
  if (!x || typeof x !== 'object') return 'vacío';
  if (!SUPPORTED_RULES.includes(x.v)) return `versión de reglas ${x.v} (actual ${RULES_VERSION})`;
  if (x.rngVersion !== RNG_VERSION) return 'versión de RNG distinta';
  if (!['preview', 'round', 'shop', 'victory', 'defeat'].includes(x.phase)) return 'fase desconocida';
  if (!Array.isArray(x.deck) || x.deck.length < MIN_DECK) return 'mazo inválido';
  for (const k of ['deck', 'shop', 'boss']) if (!Array.isArray(x.rng?.[k]) || x.rng[k].length !== 4) return 'RNG inválido';
  if (!x.mods.every((id) => MOD[id]) || !x.cals.every((id) => CAL[id])) return 'catálogo desconocido';
  if (x.lot < 0 || x.lot >= LOTS || x.blind < 0 || x.blind > 2) return 'progreso inválido';
  if (x.phase === 'round' && (!x.round || !Array.isArray(x.round.hand))) return 'ronda inválida';
  if (Object.keys(x.levels).some((k) => !PATTERNS.some((p) => p.id === k))) return 'Perfil desconocido';
  return null;
}
