// Reducer de partida BATCARD. Puro: step(state, action) → { state, events } | { error }.
// Una acción inválida devuelve error SIN tocar el estado ni consumir RNG (se trabaja sobre una copia).
import { RNG_VERSION, seedState, shuffle, randInt } from './rng.js';
import { standardDeck, evaluate, SUIT_IDS, PATTERNS } from './hands.js';
import { MODS, MOD, CALIBRATIONS, SPOOLS, CAL, PROFILES, PROF, PACKS, MATERIALS, SEALS, modsFor, shopModsFor, bossesFor, calsFor, INTEREST, targetsFor, BOSSES, TARGETS, BLIND_NAMES, BLIND_PAY, RULES, MIN_DECK } from './catalog.js';
import { scoreHand } from './score.js';
import { EVENTS, EVENT } from './catalog.js';
import { DECKS, DIFFS, CH, BOSS_CONFLICT, normalizeCfg } from './modes.js';

export const RULES_VERSION = 8; // v2: materiales · v3: sobres · v4: ahorro, saltear, sellos y Mods nuevos. Las partidas viejas siguen con sus reglas.
export const SUPPORTED_RULES = [1, 2, 3, 4, 5, 6, 7, 8];
export const LOTS = TARGETS.length;

export function newGame(seed, v = RULES_VERSION, cfgIn = {}) {
  const rng = { deck: seedState(seed + '/mazo'), shop: seedState(seed + '/tienda'), boss: seedState(seed + '/jefe') };
  if (v >= 3) rng.pack = seedState(seed + '/sobres');
  if (v >= 8) rng.ev = seedState(seed + '/eventos');
  const modData = {};
  const bosses = shuffle(rng.boss, bossesFor(v).map((b) => b.id));
  const st = {
    v, rngVersion: RNG_VERSION, seed, rng,
    phase: 'preview', lot: 0, blind: 0, credits: 4,
    deck: standardDeck(), mods: [], cals: [], levels: {}, bosses,
    round: null, shop: null, last: null, ...(v >= 4 ? { modData } : {}),
    stats: { bestHand: 0, prints: 0, total: 0 },
    log: [], // acciones válidas en orden: el servidor rejuega la partida con esto para el ranking
  };
  if (v >= 8) {
    // Reglas v8: mazo inicial, dificultad y desafío (todo determinista a partir de la semilla y cfg).
    const cfg = normalizeCfg(cfgIn), D = DECKS[cfg.deck], ch = cfg.ch ? CH[cfg.ch] : null;
    st.cfg = cfg;
    st.rules = { ...RULES, ...D.rules, ...(ch?.rules || {}) };
    let cards = ch?.deckCards ? ch.deckCards() : D.cards();
    if (ch?.deckFilter) cards = cards.filter(ch.deckFilter);
    st.deck = cards;
    st.credits = D.credits ?? 4;
    st.mods = [...(ch?.startMods || [])];
    if (D.startMod) { const pool = shopModsFor(v); st.mods.push(pool[randInt(rng.shop, pool.length)].id); }
    st.mods.forEach((id) => { modData[id] = 0; });
    st.cleared = 0;
    st.stats.bestCombo = 0; st.stats.bosses = []; st.stats.patCount = {};
  }
  return st;
}
const R8 = (st) => (st.v >= 8 && st.rules ? st.rules : RULES);
const chOf = (st) => (st.v >= 8 && st.cfg?.ch ? CH[st.cfg.ch] : null);
const hasDiff = (st, d) => st.v >= 8 && !!st.cfg?.diffs?.includes(d);

export const blindInfo = (st) => {
  if (st.v < 8) return {
    name: BLIND_NAMES[st.blind], target: targetsFor(st.v)[st.lot][st.blind],
    pay: BLIND_PAY[st.blind], boss: st.blind === 2 ? st.bosses[st.lot % st.bosses.length] : null,
  };
  const ch = chOf(st), T = targetsFor(st.v);
  let target = st.lot < LOTS ? T[st.lot][st.blind] : T[LOTS - 1][st.blind] * 1.6 ** (st.lot - LOTS + 1);
  if (hasDiff(st, 'metas')) target *= 1.2;
  if (ch?.targetMul) target *= ch.targetMul;
  if (st.overload) target *= 1 + st.overload;
  target = Math.max(10, Math.round(target / 10) * 10);
  let boss = null;
  if (st.blind === 2 || ch?.allBoss) {
    boss = ch?.allBoss ? st.bosses[(st.lot * 3 + st.blind) % st.bosses.length] : st.bosses[st.lot % st.bosses.length];
    if (ch?.revenge && st.blind === 2 && st.lot === 0 && st.cfg.boss) boss = st.cfg.boss;
  }
  let boss2 = null;
  if (ch?.doubleBoss && st.blind === 2 && boss) boss2 = st.bosses.find((b) => b !== boss && !BOSS_CONFLICT.some((p) => p.includes(b) && p.includes(boss))) || null;
  return { name: BLIND_NAMES[st.blind], target, pay: BLIND_PAY[st.blind], boss, boss2 };
};

const fail = (error) => ({ error });
// Solo los campos que usan las reglas (así el log es chico y no lleva basura).
const compact = (a) => {
  const o = { t: a.type };
  for (const k of ['ids', 'overextrude', 'idx', 'cardId', 'suit', 'from', 'to', 'slot', 'declare']) if (a[k] !== undefined && a[k] !== false) o[k] = a[k];
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
      if (st.pack) return 'Terminá de abrir el sobre.';
      if (chOf(st)?.boostSuit && !st.boosted) return 'Primero elegí qué palo potenciar.';
      const info = blindInfo(st);
      const draw = shuffle(st.rng.deck, st.deck.map((c) => c.id));
      st.round = {
        target: info.target, boss: info.boss, score: 0,
        prints: RULES.prints, discards: RULES.discards - (info.boss === 'bobina_enredada' ? 1 : 0),
        heat: 0, draw, hand: [], printsDone: 0, lastPattern: null, patternsScored: [], discardedSincePlay: false,
      };
      if (st.v >= 4 && st.mods.includes('spool_holder')) st.round.discards += 1;
      if (st.v >= 8) {
        const ch = chOf(st), Rr = R8(st), nx = st.next || {};
        const r = st.round, has = (b) => info.boss === b || info.boss2 === b;
        r.boss2 = info.boss2 || null;
        r.prints = Rr.prints - (has('corte_luz') ? 1 : 0) - (hasDiff(st, 'jefe_duro') && st.blind === 2 ? 1 : 0) - (ch?.bossPrintsMinus && info.boss ? ch.bossPrintsMinus : 0) + (nx.prints || 0);
        r.prints = Math.max(1, r.prints);
        r.discards = Math.max(0, Rr.discards - (has('bobina_enredada') ? 1 : 0) - (nx.discardsMinus || 0) + (st.mods.includes('spool_holder') ? 1 : 0));
        r.heat = nx.heat || 0;
        st.next = null;
        r.discardsUsed = 0; r.suitStreak = 0; r.lastSuit = null; r.suitsScored = []; r.patternChanges = 0; r.lastClass = null; r.overCount = 0;
        if (ch?.reqSuit) r.reqSuit = SUIT_IDS[st.cleared % 4];
        if (ch?.blockMostUsed && st.blockNext) r.blocked = st.blockNext;
        r.startPrints = r.prints;
      }
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
      const ch = chOf(st);
      let chain = {};
      if (st.v >= 8) {
        const REP = ['par', 'doble', 'trio', 'full', 'poker'], SEQ = ['escalera', 'color', 'ecolor'];
        if (r.blocked === evald.id) return `Fuera de catálogo: el ${evald.name || evald.id} está bloqueado en esta ronda.`;
        if (ch?.alternate) {
          const cls = REP.includes(evald.id) ? 'rep' : SEQ.includes(evald.id) ? 'seq' : null;
          if (!cls) r.altZero = 'Calibración cruzada: la Carta alta no vale';
          else if (r.lastClass === cls) r.altZero = cls === 'rep' ? 'Calibración cruzada: tocaba Escalera, Color o Escalera de color' : 'Calibración cruzada: tocaba una mano de valores repetidos';
          else r.altZero = null;
        }
        if (ch?.declare && !PATTERNS.some((p) => p.id === a.declare)) return 'Todo o nada: declará qué Patrón vas a puntuar.';
        const sc = evald.scoring.map((i) => cards[i]);
        const suits = [...new Set(sc.map((c) => c.s))];
        const mono = suits.length === 1 ? suits[0] : null;
        chain = {
          discardsUsed: r.discardsUsed || 0,
          suitStreak: mono ? (r.lastSuit === mono ? (r.suitStreak || 0) + 1 : 1) : 0,
          patternChanges: (r.patternChanges || 0) + (r.lastPattern && r.lastPattern !== evald.id ? 1 : 0),
          suitsScored: new Set([...(r.suitsScored || []), ...suits]).size,
          mono,
        };
      }
      const result = scoreHand({
        cards, scoringIdx: evald.scoring, pattern: evald.id, level: st.levels[evald.id] || 0,
        mods: st.mods, boss: r.boss, boss2: r.boss2, heat, overextrude: over, round: r, modData: st.modData || {}, v: st.v, chain,
      });
      if (st.v >= 8) {
        // Reglas del desafío que tocan el total (se agregan a la traza antes del total final).
        const totalT = result.trace.pop();
        let { chips, mult } = result, zero = null;
        if (ch?.overload && r.lastPattern === evald.id) { r.overCount = (r.overCount || 0) + 1; mult += 3000 * r.overCount; result.trace.push({ phase: 'reto', text: `Sobrecarga ×${r.overCount}: +${3 * r.overCount} Mult`, chips, mult }); }
        if (ch?.declare) {
          if (a.declare === evald.id) { mult = Math.floor((mult * 1500) / 1000); result.trace.push({ phase: 'reto', text: 'Todo o nada: ¡acertaste! ×1,5 Mult', chips, mult }); }
          else zero = 'Todo o nada: declaraste otro Patrón';
        }
        if (ch?.minEffects && result.effects < ch.minEffects) zero = `En cadena: activaste ${result.effects} efecto${result.effects === 1 ? '' : 's'} (hacen falta ${ch.minEffects})`;
        if (r.reqSuit && !evald.scoring.some((i) => cards[i].s === r.reqSuit)) zero = 'Multimaterial: no puntuó ninguna carta del palo pedido';
        if (r.altZero) zero = r.altZero;
        if (zero) { result.trace.push({ phase: 'reto', text: zero + ': la mano suma 0', chips, mult }); result.total = 0; }
        else result.total = Math.floor((chips * mult) / 1000);
        result.chips = chips; result.mult = mult;
        result.trace.push({ ...totalT, text: `${chips} × ${(mult / 1000).toString().replace('.', ',')} = ${result.total}`, chips, mult, total: result.total });
        r.lastSuit = chain.mono; r.suitStreak = chain.suitStreak; r.patternChanges = chain.patternChanges;
        r.suitsScored = [...new Set([...(r.suitsScored || []), ...evald.scoring.map((i) => cards[i].s)])];
        if (!r.altZero) r.lastClass = ['par', 'doble', 'trio', 'full', 'poker'].includes(evald.id) ? 'rep' : ['escalera', 'color', 'ecolor'].includes(evald.id) ? 'seq' : r.lastClass;
        st.stats.bestCombo = Math.max(st.stats.bestCombo || 0, result.effects || 0);
        st.stats.patCount[evald.id] = (st.stats.patCount[evald.id] || 0) + 1;
      }
      if (st.v >= 4) {
        if (result.gold) st.credits += result.gold;
        if (st.mods.includes('contador_horas')) st.modData.contador_horas = (st.modData.contador_horas || 0) + 1;
      }
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
      if (st.v >= 8) r.discardsUsed = (r.discardsUsed || 0) + 1;
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
      if (cal.seal) {
        if (card.sl === cal.seal) return `Esa carta ya tiene el ${cal.name}.`;
        card.sl = cal.seal;
      } else if (cal.mat) {
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
    case 'BOOST_SUIT': {
      const ch = chOf(st);
      if (!ch?.boostSuit || st.boosted || st.phase !== 'preview') return 'Ahora no se puede.';
      if (!ch.boostSuit.includes(a.suit)) return 'Elegí uno de los dos palos.';
      st.deck.forEach((c) => { if (c.s === a.suit) c.b = (c.b || 0) + 5; });
      st.boosted = a.suit;
      return null;
    }
    case 'EVENT': {
      if (st.phase !== 'shop' || !st.event) return 'No hay evento de taller.';
      if (![0, 1, 2].includes(a.idx)) return 'Opción inválida.';
      const e = EVENT[st.event.id], s = st.rng.ev;
      const win = a.idx === 1 ? randInt(s, 2) === 0 : true;
      let out = 'Seguís de largo.';
      const pc = st.stats.patCount || {};
      const top = Object.keys(pc).sort((x, y) => pc[y] - pc[x])[0] || 'par';
      const pick2 = () => { const pool = [...st.deck]; const o = []; for (let i = 0; i < 2 && pool.length; i++) o.push(pool.splice(randInt(s, pool.length), 1)[0]); return o; };
      if (a.idx !== 2) {
        if (e.id === 'oferta_filamento') { const d = a.idx === 0 ? 4 : win ? 10 : -3; st.credits = Math.max(0, st.credits + d); out = d > 0 ? `+${d} Créditos.` : `Perdiste ${-d} Créditos.`; }
        if (e.id === 'calibracion_rapida') {
          if (a.idx === 0 || win) { const n = a.idx === 0 ? 1 : 2; st.levels[top] = (st.levels[top] || 0) + n; out = `${PATTERNS.find((p) => p.id === top).name} sube ${n} nivel${n > 1 ? 'es' : ''}.`; }
          else { st.next = { ...(st.next || {}), discardsMinus: 1 }; out = 'Falló: 1 descarte menos en la próxima ronda.'; }
        }
        if (e.id === 'cama_nueva') {
          const two = pick2();
          if (a.idx === 0) { two.forEach((c) => { c.b = (c.b || 0) + 5; }); out = '2 cartas ganan +5 Capas.'; }
          else if (win) { two.forEach((c) => { c.ed = 'poli'; }); out = '¡2 cartas Policromas!'; }
          else if (st.deck.length - 2 >= MIN_DECK) { const ids = two.map((c) => c.id); st.deck = st.deck.filter((c) => !ids.includes(c.id)); out = 'Se rompieron 2 cartas: salen del mazo.'; }
          else out = 'Casi se rompen 2 cartas, pero el mazo ya es chico: no pasó nada.';
        }
        if (e.id === 'horas_extra') {
          if (a.idx === 0) { st.next = { ...(st.next || {}), prints: 1 }; out = '+1 impresión en la próxima ronda.'; }
          else if (win) { st.next = { ...(st.next || {}), prints: 2 }; out = '+2 impresiones en la próxima ronda.'; }
          else { st.next = { ...(st.next || {}), heat: 4 }; out = 'Recalentado: la próxima ronda arranca con Calor 4.'; }
        }
      }
      st.lastEvent = { id: e.id, idx: a.idx, win, out };
      st.event = null;
      ev.push({ type: 'event', id: e.id, idx: a.idx, win, out });
      return null;
    }
    case 'SKIP_BLIND': {
      if (st.phase !== 'preview' || st.v < 4) return 'No se puede saltear ahora.';
      if (st.pack) return 'Terminá de abrir el sobre.';
      if (st.blind >= 2) return 'El Control de Calidad no se puede saltear.';
      const kind = pickWeighted(st.rng.pack);
      st.blind += 1;
      st.stats.skips = (st.stats.skips || 0) + 1;
      st.pack = { kind, opts: rollPack(st, kind), free: true };
      ev.push({ type: 'blind_skipped', kind });
      return null;
    }
    case 'OPEN_PACK': {
      if (st.phase !== 'shop' || st.v < 3) return 'Suministros está cerrado.';
      if (chOf(st)?.noBuy) return 'Sin repuestos: en este desafío no se compra nada.';
      if (st.pack) return 'Terminá de abrir el sobre.';
      const pk = st.shop.packs?.[a.slot];
      if (!pk || pk.sold) return 'Ese sobre ya no está.';
      if (st.credits < pk.price) return 'No te alcanzan los Créditos.';
      st.credits -= pk.price;
      pk.sold = true;
      st.pack = { kind: pk.kind, opts: rollPack(st, pk.kind) };
      ev.push({ type: 'pack_opened', kind: pk.kind });
      return null;
    }
    case 'PICK_PACK': {
      if (!st.pack) return 'No hay sobre abierto.';
      const o = st.pack.opts[a.idx];
      if (!o) return 'Esa opción no existe.';
      if (o.kind === 'mod' && st.mods.length >= R8(st).maxMods) return `Máximo ${R8(st).maxMods} Mods. Vendé uno o salteá.`;
      if (o.kind === 'cal' && st.cals.length >= RULES.maxCals) return `Máximo ${RULES.maxCals} calibraciones guardadas. Salteá o usá una.`;
      if (o.kind === 'card') { st.nextCard = (st.nextCard || 0) + 1; st.deck.push({ ...o.card, id: 'n' + st.nextCard }); }
      else if (o.kind === 'mod') { st.mods.push(o.id); if (st.modData) st.modData[o.id] = 0; }
      else if (o.kind === 'cal') st.cals.push(o.id);
      else if (o.kind === 'profile') { const p = PROF[o.id].pattern; st.levels[p] = (st.levels[p] || 0) + 1; }
      st.pack = null;
      ev.push({ type: 'pack_pick', opt: o });
      return null;
    }
    case 'SKIP_PACK': {
      if (!st.pack) return 'No hay sobre abierto.';
      st.pack = null;
      return null;
    }
    case 'BUY': {
      if (st.phase !== 'shop') return 'Suministros está cerrado.';
      if (st.pack) return 'Terminá de abrir el sobre.';
      if (chOf(st)?.noBuy) return 'Sin repuestos: en este desafío no se compra nada.';
      const it = st.shop.items[a.slot];
      if (!it || it.sold) return 'Ese producto ya no está.';
      if (st.credits < it.price) return 'No te alcanzan los Créditos.';
      if (it.kind === 'mod' && st.mods.length >= R8(st).maxMods) return `Máximo ${R8(st).maxMods} Mods. Vendé uno primero.`;
      if (it.kind === 'cal' && st.cals.length >= RULES.maxCals) return `Máximo ${RULES.maxCals} calibraciones guardadas.`;
      st.credits -= it.price;
      it.sold = true;
      if (it.kind === 'mod') { st.mods.push(it.id); if (st.modData) st.modData[it.id] = 0; if (it.pair) st.shop.items.forEach((x) => { if (x.pair) x.sold = true; }); }
      else if (it.kind === 'cal') st.cals.push(it.id);
      else if (it.kind === 'profile') { const p = PROF[it.id].pattern; st.levels[p] = (st.levels[p] || 0) + 1; }
      ev.push({ type: 'bought', item: it });
      return null;
    }
    case 'REROLL': {
      if (st.phase !== 'shop') return 'Suministros está cerrado.';
      if (st.pack) return 'Terminá de abrir el sobre.';
      if (st.credits < st.shop.rerollCost) return 'No te alcanzan los Créditos.';
      st.credits -= st.shop.rerollCost;
      st.shop.rerollCost += 1;
      st.shop.items = rollShop(st);
      return null;
    }
    case 'LEAVE_SHOP': {
      if (st.phase !== 'shop') return 'Suministros está cerrado.';
      if (st.pack) return 'Terminá de abrir el sobre.';
      if (st.event) return 'Primero resolvé el evento de taller.';
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
  while (r.hand.length < R8(st).handSize && r.draw.length) { r.lastDrawn = r.draw[0]; r.hand.push(r.draw.shift()); }
}

function winRound(st, ev) {
  const r = st.round;
  const ch = chOf(st);
  if (ch?.maxOver && r.score > r.target * (1 + ch.maxOver)) {
    st.phase = 'defeat';
    ev.push({ type: 'defeat', reason: `Fuera de medida: te pasaste ${Math.round((r.score / r.target - 1) * 100)} % de la meta (máximo ${Math.round(ch.maxOver * 100)} %).` });
    st.defeatReason = 'precision';
    return null;
  }
  let pay = BLIND_PAY[st.blind] + r.prints;
  const extra = [];
  if (st.v >= 4 && !hasDiff(st, 'sin_ahorro')) { const it = Math.min(INTEREST.max, Math.floor(st.credits / INTEREST.per)); if (it) { pay += it; extra.push(`Ahorro: +${it}`); } }
  for (const id of st.mods) {
    const e = MOD[id].effect;
    if (e.phase === 'round_win' && e.when({ round: r })) { pay += e.value; extra.push(`${MOD[id].name}: +${e.value}`); }
  }
  st.credits += pay;
  if (st.v >= 6 && st.mods.includes('imprenta_exp')) st.modData.imprenta_exp = (st.modData.imprenta_exp || 0) + 1;
  ev.push({ type: 'round_won', pay, extra, base: BLIND_PAY[st.blind], left: r.prints });
  st.lastWin = { pay, extra, base: BLIND_PAY[st.blind], left: r.prints, score: r.score, target: r.target };
  if (st.v >= 8) {
    st.cleared = (st.cleared || 0) + 1;
    if (r.boss) st.stats.bosses.push(r.boss);
    if (r.boss2) st.stats.bosses.push(r.boss2);
    st.overload = ch?.overload ? 0.1 * (r.overCount || 0) : 0;
    if (ch?.blockMostUsed) {
      const cnt = {}; r.patternsScored.forEach((p) => { cnt[p] = (cnt[p] || 0) + 1; });
      const max = Math.max(...Object.values(cnt));
      st.blockNext = [...r.patternsScored].reverse().find((p) => cnt[p] === max) || null; // empate: el último que jugaste
    }
    if (ch && ch.rounds && ch.rounds !== Infinity && st.cleared >= ch.rounds) { st.phase = 'victory'; ev.push({ type: 'victory' }); return null; }
    if (!ch?.endless && st.lot === LOTS - 1 && st.blind === 2) { st.phase = 'victory'; ev.push({ type: 'victory' }); return null; }
  } else if (st.lot === LOTS - 1 && st.blind === 2) { st.phase = 'victory'; ev.push({ type: 'victory' }); return null; }
  st.phase = 'shop';
  st.shop = { rerollCost: 2, items: [] };
  st.shop.items = rollShop(st);
  if (st.v >= 3) st.shop.packs = rollPacks(st);
  if (st.v >= 8 && st.blind === 1) st.event = { id: EVENTS[randInt(st.rng.ev, EVENTS.length)].id }; // un evento por lote, después de la Tanda
  return null;
}

// Dos sobres por visita (no cambian al refrescar). Stream de RNG propio: no altera mazo ni tienda.
const PACK_IDS = Object.keys(PACKS);
function pickWeighted(s) {
  let x = randInt(s, PACK_IDS.reduce((t, k) => t + PACKS[k].weight, 0));
  for (const k of PACK_IDS) { if (x < PACKS[k].weight) return k; x -= PACKS[k].weight; }
  return PACK_IDS[0];
}
function rollPacks(st) {
  const s = st.rng.pack;
  return [0, 1].map(() => { const k = pickWeighted(s); return { kind: k, price: PACKS[k].price + (hasDiff(st, 'caro') ? 1 : 0) }; });
}
function rollPack(st, kind) {
  const s = st.rng.pack;
  const n = PACKS[kind].n;
  const take = (arr) => { const pool = [...arr]; const out = []; for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(randInt(s, pool.length), 1)[0]); return out; };
  if (kind === 'cartas') {
    const mats = Object.keys(MATERIALS);
    return Array.from({ length: n }, () => {
      const card = { r: 2 + randInt(s, 13), s: SUIT_IDS[randInt(s, 4)], b: 0 };
      if (randInt(s, 2) === 0) card.m = mats[randInt(s, mats.length)];
      if (randInt(s, 4) === 0) card.b = 4;
      if (st.v >= 4 && randInt(s, 5) === 0) card.sl = randInt(s, 2) ? 'oro' : 'rojo';
      if (st.v >= 6 && randInt(s, 4) === 0) card.ed = ['lam', 'holo', 'poli'][randInt(s, 3)];
      return { kind: 'card', card };
    });
  }
  if (kind === 'calibracion') return take(calsFor(Math.max(2, st.v))).map((c) => ({ kind: 'cal', id: c.id }));
  if (kind === 'perfiles') return take(PROFILES).map((p) => ({ kind: 'profile', id: p.id }));
  const all = modsFor(st.v);
  const pool = all.filter((m) => !st.mods.includes(m.id));
  return take(pool.length ? pool : all).map((m) => ({ kind: 'mod', id: m.id }));
}

// 2 Mods (que no tengas) + 2 consumibles (Perfil 60 % / calibración 40 %).
function rollShop(st) {
  const s = st.rng.shop;
  const pool = shopModsFor(st.v).filter((m) => !st.mods.includes(m.id));
  const items = [];
  const up = hasDiff(st, 'caro') ? 1 : 0;
  if (chOf(st)?.twoMods) {
    for (let i = 0; i < 2 && pool.length; i++) { const m = pool.splice(randInt(s, pool.length), 1)[0]; items.push({ kind: 'mod', id: m.id, price: m.price + up, pair: true }); }
    return items;
  }
  for (let i = 0; i < 2 && pool.length; i++) {
    const m = pool.splice(randInt(s, pool.length), 1)[0];
    items.push({ kind: 'mod', id: m.id, price: m.price + up });
  }
  for (let i = 0; i < 2; i++) {
    if (randInt(s, 10) < 6) { const p = PROFILES[randInt(s, PROFILES.length)]; items.push({ kind: 'profile', id: p.id, price: p.price + up }); }
    else { const pool = calsFor(st.v); const c = pool[randInt(s, pool.length)]; items.push({ kind: 'cal', id: c.id, price: c.price + up }); }
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
  const score = scoreHand({ cards, scoringIdx: e.scoring, pattern: e.id, level, mods: st.mods, boss: st.round.boss, heat, overextrude: !!overextrude, round: st.round, modData: st.modData || {}, v: st.v, boss2: st.round.boss2 });
  return { pattern: e.id, scoring: e.scoring.map((i) => cards[i].id), heat, level, score };
}

// ---------- Guardado ----------
export function validateSave(x) {
  if (!x || typeof x !== 'object') return 'vacío';
  if (!SUPPORTED_RULES.includes(x.v)) return `versión de reglas ${x.v} (actual ${RULES_VERSION})`;
  if (x.rngVersion !== RNG_VERSION) return 'versión de RNG distinta';
  if (!['preview', 'round', 'shop', 'victory', 'defeat'].includes(x.phase)) return 'fase desconocida';
  if (!Array.isArray(x.deck) || x.deck.length < MIN_DECK) return 'mazo inválido';
  for (const k of ['deck', 'shop', 'boss', ...(x.v >= 3 ? ['pack'] : []), ...(x.v >= 8 ? ['ev'] : [])]) if (!Array.isArray(x.rng?.[k]) || x.rng[k].length !== 4) return 'RNG inválido';
  if (!x.mods.every((id) => MOD[id]) || !x.cals.every((id) => CAL[id])) return 'catálogo desconocido';
  if (x.lot < 0 || (x.lot >= LOTS && !(x.v >= 8 && x.cfg?.ch && CH[x.cfg.ch]?.endless)) || x.blind < 0 || x.blind > 2) return 'progreso inválido';
  if (x.phase === 'round' && (!x.round || !Array.isArray(x.round.hand))) return 'ronda inválida';
  if (Object.keys(x.levels).some((k) => !PATTERNS.some((p) => p.id === k))) return 'Perfil desconocido';
  return null;
}
