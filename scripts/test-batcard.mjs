// Pruebas del motor BATCARD: node scripts/test-batcard.mjs
import { evaluate } from '../src/lib/batcard/hands.js';
import { scoreHand } from '../src/lib/batcard/score.js';
import { newGame, step, validateSave, blindInfo } from '../src/lib/batcard/game.js';
import { MODS } from '../src/lib/batcard/catalog.js';
import { seedState, nextU32 } from '../src/lib/batcard/rng.js';

let ok = 0, bad = 0;
const t = (name, cond, info = '') => { if (cond) ok++; else { bad++; console.log('FALLA', name, info); } };
const C = (s) => s.split(' ').map((x) => ({ id: x, r: { J: 11, Q: 12, K: 13, A: 14 }[x.slice(0, -1)] || +x.slice(0, -1), s: x.slice(-1), b: 0 }));
const pat = (s) => evaluate(C(s)).id;

// Evaluador
t('alta', pat('2S 9H') === 'alta');
t('alta idx', evaluate(C('2S 9H 4C')).scoring[0] === 1);
t('par', pat('7S 7H 2C') === 'par');
t('doble', pat('7S 7H 2C 2D KS') === 'doble');
t('doble scoring 4', evaluate(C('7S 7H 2C 2D KS')).scoring.length === 4);
t('trio', pat('5S 5H 5C') === 'trio');
t('escalera', pat('5S 6H 7C 8D 9S') === 'escalera');
t('escalera A baja', pat('AS 2H 3C 4D 5S') === 'escalera');
t('escalera A alta', pat('10S JH QC KD AS') === 'escalera');
t('sin vuelta', pat('QS KH AC 2D 3S') === 'alta');
t('color', pat('2H 7H 9H JH KH') === 'color');
t('full', pat('3S 3H 3C 9D 9S') === 'full');
t('poker', pat('8S 8H 8C 8D 2S') === 'poker');
t('poker scoring 4', evaluate(C('8S 8H 8C 8D 2S')).scoring.length === 4);
t('ecolor', pat('9C 10C JC QC KC') === 'ecolor');
t('ecolor A baja', pat('AD 2D 3D 4D 5D') === 'ecolor');
t('4 cartas no escalera', pat('5S 6H 7C 8D') === 'alta');

// Caso del prompt: par de 7, Mod +2 mult luego ×1,5 = 156; invertido = 130
const mPlus = { id: 't_plus', name: '+2', effect: { phase: 'mods', when: () => true, op: 'mult', value: 2 } };
const mX = { id: 't_x', name: 'x1.5', effect: { phase: 'mods', when: () => true, op: 'xmult', value: 1500 } };
MODS.push(mPlus, mX);
const { MOD } = await import('../src/lib/batcard/catalog.js');
MOD.t_plus = mPlus; MOD.t_x = mX;
const round = { printsDone: 1, discards: 0, lastPattern: null, patternsScored: [], discardedSincePlay: false };
const base = { cards: C('7S 7H'), scoringIdx: [0, 1], pattern: 'par', heat: 0, round };
const a = scoreHand({ ...base, mods: ['t_plus', 't_x'] });
const b = scoreHand({ ...base, mods: ['t_x', 't_plus'] });
t('caso 156', a.total === 156, JSON.stringify(a.trace.at(-1)));
t('caso 130', b.total === 130, JSON.stringify(b.trace.at(-1)));
t('traza termina en total', a.trace.at(-1).phase === 'total');

// Jefes
t('warping', scoreHand({ ...base, cards: C('7S 7H'), boss: 'warping' }).chips === 12 + 7);
t('cama desnivelada', scoreHand({ ...base, round: { ...round, printsDone: 0 }, boss: 'cama_desnivelada' }).chips === 4 + 14);
t('hotend saturado', scoreHand({ ...base, heat: 6, boss: 'hotend_saturado' }).mult === 1000);
t('sobreextruir', scoreHand({ ...base, overextrude: true }).chips === 38);

// RNG reproducible
const s1 = seedState('ABC'), s2 = seedState('ABC');
t('rng igual', [1, 2, 3].every(() => nextU32(s1) === nextU32(s2)));
const g1 = newGame('SEMILLA'), g2 = newGame('SEMILLA');
t('bosses iguales', g1.bosses.join() === g2.bosses.join());

// Reducer: partida
let g = newGame('PRUEBA');
let r = step(g, { type: 'PLAY', ids: ['S2'] });
t('play fuera de ronda = error', !!r.error);
g = step(g, { type: 'START_ROUND' }).state;
t('mano 8', g.round.hand.length === 8);
const g2r = step(newGame('PRUEBA'), { type: 'START_ROUND' }).state;
t('misma semilla misma mano', g.round.hand.join() === g2r.round.hand.join());
const rngBefore = JSON.stringify(g.rng);
r = step(g, { type: 'PLAY', ids: ['ZZ'] });
t('inválida no consume rng', !!r.error && JSON.stringify(g.rng) === rngBefore);
r = step(g, { type: 'DISCARD', ids: [g.round.hand[0]] });
t('descarte', r.state.round.discards === 2 && r.state.round.hand.length === 8);
// Calor
g = r.state;
r = step(g, { type: 'PLAY', ids: [g.round.hand[0]], overextrude: true });
t('calor +2', r.state.round.heat === 2);
let h = r.state; h.round.heat = 5;
t('sin sobreextruir con 5', !!step(h, { type: 'PLAY', ids: [h.round.hand[0]], overextrude: true }).error);
h = step(h, { type: 'DISCARD', ids: [h.round.hand[0]] }).state;
t('descartar enfría 1', h.round.heat === 4);

// Simulación: jugar carta alta siempre hasta perder o ganar, sin romper
let sim = newGame('SIM'), guard = 0;
while (!['victory', 'defeat'].includes(sim.phase) && guard++ < 500) {
  if (sim.phase === 'preview') sim = step(sim, { type: 'START_ROUND' }).state;
  else if (sim.phase === 'shop') sim = step(sim, { type: 'LEAVE_SHOP' }).state;
  else sim = step(sim, { type: 'PLAY', ids: sim.round.hand.slice(0, 5) }).state;
}
t('simulación termina', ['victory', 'defeat'].includes(sim.phase), sim.phase);
t('guardado válido', validateSave(JSON.parse(JSON.stringify(sim))) === null, validateSave(sim));
t('guardado basura', validateSave({ v: 1 }) !== null);
t('blindInfo jefe', blindInfo({ ...newGame('X'), blind: 2 }).boss !== null);

// Tienda
let sh = newGame('TIENDA');
sh.phase = 'round'; sh.round = { target: 1, score: 0, prints: 4, discards: 3, heat: 0, draw: [], hand: ['S14', 'H14'], printsDone: 0, lastPattern: null, patternsScored: [], discardedSincePlay: false, boss: null };
sh = step(sh, { type: 'PLAY', ids: ['S14', 'H14'] }).state;
t('gana → tienda', sh.phase === 'shop' && sh.shop.items.length === 4);
t('pago 3+3', sh.credits === 4 + 3 + 3, sh.credits);
const before = sh.credits;
const rr = step(sh, { type: 'REROLL' }).state;
t('reroll cobra', rr.credits === before - 2 && rr.shop.rerollCost === 3);
const modSlot = sh.shop.items.findIndex((i) => i.kind === 'mod');
const bought = step(sh, { type: 'BUY', slot: modSlot });
t('compra mod', bought.error ? sh.credits < sh.shop.items[modSlot].price : bought.state.mods.length === 1);
t('compra repetida falla', !bought.state || !!step(bought.state, { type: 'BUY', slot: modSlot }).error);

// Rejugada para el ranking
const { replayRun } = await import('../src/lib/batcard/verify.js');
const rep = replayRun('SIM', sim.log, sim.v);
t('replay ok', rep.ok, rep.error);
t('replay mismo total', rep.ok && rep.result.total === sim.stats.total && rep.result.won === (sim.phase === 'victory'));
const trucho = JSON.parse(JSON.stringify(sim.log)); const pi = trucho.findIndex((a) => a.t === 'PLAY'); trucho[pi].ids = ['XX'];
t('replay rechaza jugada falsa', !replayRun('SIM', trucho, sim.v).ok);
t('replay rechaza otra semilla', !replayRun('OTRA', sim.log).ok || replayRun('OTRA', sim.log).result.total !== sim.stats.total);
t('replay rechaza incompleta', !replayRun('SIM', sim.log.slice(0, -1), sim.v).ok);
t('log no guarda errores', !sim.log.some((a) => a.t === 'PLAY' && a.ids?.includes('ZZ')));

// ---------- Materiales (reglas v2) ----------
const M = (str, m) => C(str).map((c) => ({ ...c, m }));
const r0 = { printsDone: 1, discards: 0, lastPattern: null, patternsScored: [], discardedSincePlay: false };
const sc = (cards, heat = 0) => { const e = evaluate(cards); return scoreHand({ cards, scoringIdx: e.scoring, pattern: e.id, heat, round: r0 }); };
t('PETG +6 Capas', sc(M('7S 7H', 'petg')).chips === 12 + 14 + 12, sc(M('7S 7H', 'petg')).chips);
t('Carbono +12 Capas', sc(M('7S', 'carbono')).chips === 5 + 7 + 12);
t('ASA sin calor no multiplica', sc(M('7S', 'asa'), 2).mult === 1000);
t('ASA con calor 4: ×1,5', sc(M('7S', 'asa'), 4).mult === 1500);
const seda = [...M('7S', 'seda'), ...C('7H')];
t('Seda sola en su palo +2 Mult', sc(seda).mult === 4000, sc(seda).mult);
t('Seda con otra del palo: nada', sc([...M('7S', 'seda'), ...C('2S')]).mult === 1000);
// Reducer v2
let mg2 = step(newGame('MAT'), { type: 'START_ROUND' }).state;
const h0 = mg2.round.hand[0];
mg2.deck.find((c) => c.id === h0).m = 'petg';
t('PETG no se descarta', /pegajoso/.test(step(mg2, { type: 'DISCARD', ids: [h0] }).error || ''));
mg2.deck.find((c) => c.id === h0).m = 'tpu';
let mg3 = step(mg2, { type: 'PLAY', ids: [h0] }).state;
t('TPU vuelve a la mano', mg3.round.hand.includes(h0));
const mg4 = step(mg3, { type: 'PLAY', ids: [h0] }).state;
t('TPU solo una vez por ronda', !mg4.round.hand.includes(h0));
mg2.deck.find((c) => c.id === h0).m = 'carbono';
t('Carbono sube 1 de Calor', step(mg2, { type: 'PLAY', ids: [h0] }).state.round.heat === 1);
// Bobina en la tienda/calibración
let mg5 = step(newGame('BOB'), { type: 'START_ROUND' }).state; mg5.cals = ['bobina_seda'];
const mg6 = step(mg5, { type: 'USE_CAL', idx: 0, cardId: mg5.round.hand[1] }).state;
t('Bobina pone el material', mg6.deck.find((c) => c.id === mg5.round.hand[1]).m === 'seda' && mg6.cals.length === 0);
// Compatibilidad v1: misma semilla, misma tienda que antes (sin bobinas)
const v1 = newGame('COMPAT', 1); t('partida v1 sigue siendo v1', v1.v === 1 && validateSave(JSON.parse(JSON.stringify(v1))) === null);
let sv1 = newGame('SIM1', 1), gd = 0;
while (!['victory', 'defeat'].includes(sv1.phase) && gd++ < 500) sv1 = sv1.phase === 'preview' ? step(sv1, { type: 'START_ROUND' }).state : sv1.phase === 'shop' ? step(sv1, { type: 'LEAVE_SHOP' }).state : step(sv1, { type: 'PLAY', ids: sv1.round.hand.slice(0, 5) }).state;
const rv1 = replayRun('SIM1', sv1.log, 1);
t('rejugada v1 ok', rv1.ok && rv1.result.rules_version === 1 && rv1.result.total === sv1.stats.total);

console.log(`${ok} OK, ${bad} fallas`);
process.exit(bad ? 1 : 0);
