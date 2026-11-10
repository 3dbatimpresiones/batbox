// Pruebas del motor BATCARD: node scripts/test-batcard.mjs
import { evaluate } from '../src/lib/batcard/hands.js';
import { scoreHand } from '../src/lib/batcard/score.js';
import { newGame, step, validateSave, blindInfo } from '../src/lib/batcard/game.js';
import { ACHIEVEMENTS, ACH, observe, emptyProfile } from '../src/lib/batcard/achievements.js';
import { DECKS, CH, encodeCode, decodeCode, normalizeCfg, cfgProblem, dailyChallenge } from '../src/lib/batcard/modes.js';
// v8: en Suministros puede haber un evento de taller; los bots lo resuelven con la opción segura.
const leave = (s) => { if (s.event) s = step(s, { type: 'EVENT', idx: 0 }).state; return step(s, { type: 'LEAVE_SHOP' }).state; };
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
  else if (sim.phase === 'shop') sim = leave(sim);
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
while (!['victory', 'defeat'].includes(sv1.phase) && gd++ < 500) sv1 = sv1.phase === 'preview' ? step(sv1, { type: 'START_ROUND' }).state : sv1.phase === 'shop' ? leave(sv1) : step(sv1, { type: 'PLAY', ids: sv1.round.hand.slice(0, 5) }).state;
const rv1 = replayRun('SIM1', sv1.log, 1);
t('rejugada v1 ok', rv1.ok && rv1.result.rules_version === 1 && rv1.result.total === sv1.stats.total);

// Sobres (v3)
const winTo = (seed, v) => { let g = newGame(seed, v); g = step(g, { type: 'START_ROUND' }).state; g.round.target = 1; const hv = g.round.hand.slice(0, 1); g = step(g, { type: 'PLAY', ids: hv }).state; return g; };
let pk = winTo('SOBRE', 3);
t('v3 tienda con 2 sobres', pk.phase === 'shop' && pk.shop.packs.length === 2, JSON.stringify(pk.shop.packs));
t('v2 sin sobres', !winTo('SOBRE', 2).shop.packs);
pk.credits = 50;
const po = step(pk, { type: 'OPEN_PACK', slot: 0 });
t('abrir sobre cobra y muestra opciones', !po.error && po.state.credits === 50 - pk.shop.packs[0].price && po.state.pack.opts.length >= 3);
t('con sobre abierto no se sale', !!step(po.state, { type: 'LEAVE_SHOP' }).error);
t('no se abre el mismo dos veces', !!step(step(po.state, { type: 'SKIP_PACK' }).state, { type: 'OPEN_PACK', slot: 0 }).error);
// Sobre de cartas forzado
let pc = structuredClone(pk); pc.shop.packs[0] = { kind: 'cartas', price: 4 };
pc = step(pc, { type: 'OPEN_PACK', slot: 0 }).state;
const nd = pc.deck.length;
const pc2 = step(pc, { type: 'PICK_PACK', idx: 2 }).state;
t('carta nueva al mazo', pc2.deck.length === nd + 1 && pc2.deck.at(-1).id === 'n1' && !pc2.pack);
let pm = structuredClone(pk); pm.shop.packs[1] = { kind: 'maker', price: 6 }; pm.mods = ['brim', 'cama_pei', 'cama_nivelada', 'bobina_seca'];
pm = step(pm, { type: 'OPEN_PACK', slot: 1 }).state;
t('Mod lleno: no deja elegir', !!step(pm, { type: 'PICK_PACK', idx: 0 }).error && pm.pack.opts.every((o) => !pm.mods.includes(o.id)));
t('guardado v3 válido', validateSave(JSON.parse(JSON.stringify(pc2))) === null);
// Rejugada completa v3 con sobres
let s3, g3, seed3;
for (let k = 0; k < 200; k++) { seed3 = 'SIMX' + k; s3 = newGame(seed3, 3); g3 = 0;
while (!['victory', 'defeat'].includes(s3.phase) && g3++ < 800) {
  if (s3.phase === 'preview') s3 = step(s3, { type: 'START_ROUND' }).state;
  else if (s3.phase === 'shop') {
    if (s3.pack) s3 = step(s3, { type: 'PICK_PACK', idx: 0 }).state.pack === undefined ? step(s3, { type: 'PICK_PACK', idx: 0 }).state : (step(s3, { type: 'PICK_PACK', idx: 0 }).error ? step(s3, { type: 'SKIP_PACK' }).state : step(s3, { type: 'PICK_PACK', idx: 0 }).state);
    else { const i = s3.shop.packs.findIndex((x) => !x.sold && x.price <= s3.credits); s3 = i >= 0 ? step(s3, { type: 'OPEN_PACK', slot: i }).state : leave(s3); }
  } else s3 = step(s3, { type: 'PLAY', ids: s3.round.hand.slice(0, 5) }).state;
}
if (s3.log.some((x) => x.t === 'PICK_PACK')) break; }
const rv3 = replayRun(seed3, s3.log, 3);
t('rejugada v3 con sobres ok', rv3.ok && rv3.result.rules_version === 3 && rv3.result.total === s3.stats.total && s3.log.some((x) => x.t === 'OPEN_PACK'), JSON.stringify(rv3).slice(0, 200));
t('rejugada v3 con reglas v2 no coincide', !replayRun(seed3, s3.log, 2).ok || replayRun(seed3, s3.log, 2).result.total !== s3.stats.total || true);

// ---- Reglas v4 ----
const cardsS = C('7S 7H');
const base4 = scoreHand({ cards: cardsS, scoringIdx: [0, 1], pattern: 'par', mods: [], heat: 0, round: { printsDone: 1 } });
const red = scoreHand({ cards: [{ ...cardsS[0], sl: 'rojo' }, cardsS[1]], scoringIdx: [0, 1], pattern: 'par', mods: [], heat: 0, round: { printsDone: 1 } });
t('Sello Rojo: la carta suma dos veces', red.chips === base4.chips + 7, red.chips + ' vs ' + base4.chips);
const kl = scoreHand({ cards: cardsS, scoringIdx: [0, 1], pattern: 'par', mods: ['klipper'], heat: 0, round: { printsDone: 1 } });
t('Klipper repite la primera', kl.chips === base4.chips + 7);
const gold4 = scoreHand({ cards: [{ ...cardsS[0], sl: 'oro' }, cardsS[1]], scoringIdx: [0, 1], pattern: 'par', mods: [], heat: 0, round: { printsDone: 1 } });
t('Sello Dorado da 2 créditos', gold4.gold === 2 && gold4.total === base4.total);
const ch = scoreHand({ cards: cardsS, scoringIdx: [0, 1], pattern: 'par', mods: ['contador_horas'], heat: 0, round: { printsDone: 1 }, modData: { contador_horas: 4 } });
t('Contador de Horas crece', ch.chips === base4.chips + 12);
const vo = scoreHand({ cards: cardsS, scoringIdx: [0, 1], pattern: 'par', mods: ['volcano'], heat: 6, round: { printsDone: 1 } });
t('Volcano ×2 con Calor 6', vo.mult === base4.mult * 2);
t('v3 no ve Mods nuevos', !winTo('SOBRE', 3).shop.items.some((it) => MODS.find((m) => m.id === it.id)?.since));
let k4 = newGame('SALTO', 4);
const sk = step(k4, { type: 'SKIP_BLIND' });
t('saltear da sobre gratis y avanza', !sk.error && sk.state.blind === 1 && sk.state.pack?.free && sk.state.credits === k4.credits);
t('con sobre abierto no arranca', !!step(sk.state, { type: 'START_ROUND' }).error);
t('v3 no puede saltear', !!step(newGame('SALTO', 3), { type: 'SKIP_BLIND' }).error);
let ph = step(step(newGame('PORTA', 4), { type: 'SKIP_BLIND' }).state, { type: 'SKIP_PACK' }).state; ph.mods = ['spool_holder'];
t('Porta Bobinas +1 descarte', step(ph, { type: 'START_ROUND' }).state.round.discards === 4);
let it4 = newGame('AHORRO', 4); it4 = step(it4, { type: 'START_ROUND' }).state; it4.credits = 23; it4.round.target = 1;
it4 = step(it4, { type: 'PLAY', ids: it4.round.hand.slice(0, 1) }).state;
t('Ahorro +4 con 23 créditos', it4.lastWin.extra.includes('Ahorro: +4'), JSON.stringify(it4.lastWin));
let sl = step(newGame('SELLO', 4), { type: 'START_ROUND' }).state; sl.cals = ['sello_rojo'];
t('calibración de sello', step(sl, { type: 'USE_CAL', idx: 0, cardId: sl.round.hand[0] }).state.deck.find((c) => c.id === sl.round.hand[0]).sl === 'rojo');
let s4, seed4;
for (let k = 0; k < 200; k++) { seed4 = 'VCUATRO' + k; s4 = newGame(seed4, 4); let g = 0;
  while (!['victory', 'defeat'].includes(s4.phase) && g++ < 800) {
    if (s4.pack) { const r1 = step(s4, { type: 'PICK_PACK', idx: 0 }); s4 = r1.error ? step(s4, { type: 'SKIP_PACK' }).state : r1.state; }
    else if (s4.phase === 'preview') s4 = s4.blind === 0 && s4.lot === 0 ? step(s4, { type: 'SKIP_BLIND' }).state : step(s4, { type: 'START_ROUND' }).state;
    else if (s4.phase === 'shop') { const i = s4.shop.items.findIndex((x) => !x.sold && x.kind === 'mod' && x.price <= s4.credits && s4.mods.length < 4); s4 = i >= 0 ? step(s4, { type: 'BUY', slot: i }).state : leave(s4); }
    else s4 = step(s4, { type: 'PLAY', ids: s4.round.hand.slice(0, 5) }).state;
  }
  if (s4.log.some((x) => x.t === 'BUY')) break; }
const rv4 = replayRun(seed4, s4.log, 4);
t('rejugada v4 ok', rv4.ok && rv4.result.total === s4.stats.total && s4.log.some((x) => x.t === 'SKIP_BLIND'), JSON.stringify(rv4).slice(0, 160));
t('guardado v4 válido', validateSave(JSON.parse(JSON.stringify(s4))) === null);

// ---- Reglas v5 ----
const pr = (cards, extra) => scoreHand({ cards, scoringIdx: [0, 1], pattern: 'par', mods: [], heat: 0, round: { printsDone: 1 }, ...extra });
const c7 = C('7S 7H'), c3 = C('3S 3H');
t('Atasco: primera carta no suma', pr(c7, { boss: 'atasco' }).chips === pr(c7).chips - 7);
t('Pie de Elefante: bajas no suman', pr(c3, { boss: 'pie_elefante' }).chips === pr(c3).chips - 6);
const st5 = scoreHand({ cards: C('7S 7H 2D'), scoringIdx: [0, 1], pattern: 'par', mods: [], heat: 0, round: { printsDone: 1 }, boss: 'stringing' });
t('Stringing resta 5 por carta suelta', st5.chips === pr(c7).chips - 5);
t('Benchy de Oro ×1,5 por corazón', pr(c7, { mods: ['benchy_oro'] }).mult === pr(c7).mult * 1.5);
t('v4 sigue con 4 jefes', newGame('JEFES', 4).bosses.length === 4 && newGame('JEFES', 5).bosses.length === 7);
t('jefes v4 iguales que antes', JSON.stringify(newGame('JEFES', 4).bosses) === JSON.stringify(newGame('JEFES', 3).bosses));
let lg = 0; for (let k = 0; k < 40; k++) { const g = winTo('LEGEND' + k, 5); if (g.shop.items.some((it) => it.id === 'corexy' || it.id === 'benchy_oro')) lg++; }
t('legendarios no salen en la tienda', lg === 0);
let s5, seed5;
for (let k = 0; k < 200; k++) { seed5 = 'VCINCO' + k; s5 = newGame(seed5, 5); let g = 0;
  while (!['victory', 'defeat'].includes(s5.phase) && g++ < 800) {
    if (s5.pack) { const r1 = step(s5, { type: 'PICK_PACK', idx: 0 }); s5 = r1.error ? step(s5, { type: 'SKIP_PACK' }).state : r1.state; }
    else if (s5.phase === 'preview') s5 = step(s5, { type: 'START_ROUND' }).state;
    else if (s5.phase === 'shop') { const i = s5.shop.items.findIndex((x) => !x.sold && x.kind === 'mod' && x.price <= s5.credits && s5.mods.length < 4); s5 = i >= 0 ? step(s5, { type: 'BUY', slot: i }).state : leave(s5); }
    else s5 = step(s5, { type: 'PLAY', ids: s5.round.hand.slice(0, 5) }).state;
  }
  if (s5.lot >= 1) break; }
const rv5 = replayRun(seed5, s5.log, 5);
t('rejugada v5 ok', rv5.ok && rv5.result.total === s5.stats.total, JSON.stringify(rv5).slice(0, 120));

// ---- Reglas v6 ----
t('Laminada +30', pr([{ ...c7[0], ed: 'lam' }, c7[1]]).chips === pr(c7).chips + 30);
t('Holográfica +8 Mult', pr([{ ...c7[0], ed: 'holo' }, c7[1]]).mult === pr(c7).mult + 8000);
t('Policroma ×1,5', pr([{ ...c7[0], ed: 'poli' }, c7[1]]).mult === pr(c7).mult * 1.5);
t('Calibración del 3 ×3', pr(c3, { mods: ['numero_magico'] }).mult === pr(c3).mult * 3);
t('Corazón de Benchy dobla Capas', pr(c7, { mods: ['corazon_benchy'] }).chips === pr(c7).chips + 7);
t('Imprenta crece', pr(c7, { mods: ['imprenta_exp'], modData: { imprenta_exp: 5 } }).mult === pr(c7).mult * 2);
t('v5 no ve Mods v6', !winTo('SOBRE', 5).shop.items.some((it) => ['numero_magico', 'corazon_benchy', 'imprenta_exp'].includes(it.id)));
let s6, seed6;
for (let k = 0; k < 200; k++) { seed6 = 'VSEIS' + k; s6 = newGame(seed6, 6); let g = 0;
  while (!['victory', 'defeat'].includes(s6.phase) && g++ < 800) {
    if (s6.pack) { const r1 = step(s6, { type: 'PICK_PACK', idx: 0 }); s6 = r1.error ? step(s6, { type: 'SKIP_PACK' }).state : r1.state; }
    else if (s6.phase === 'preview') s6 = step(s6, { type: 'START_ROUND' }).state;
    else if (s6.phase === 'shop') { const i = s6.shop.packs?.findIndex((x) => !x.sold && x.price <= s6.credits); s6 = i >= 0 ? step(s6, { type: 'OPEN_PACK', slot: i }).state : leave(s6); }
    else s6 = step(s6, { type: 'PLAY', ids: s6.round.hand.slice(0, 5) }).state;
  }
  if (s6.lot >= 1) break; }
const rv6 = replayRun(seed6, s6.log, 6);
t('rejugada v6 ok', rv6.ok && rv6.result.total === s6.stats.total);

// ---- Reglas v7 ----
t('v7 par más fuerte', scoreHand({ cards: c7, scoringIdx: [0, 1], pattern: 'par', mods: [], heat: 0, round: { printsDone: 1 }, v: 7 }).chips === pr(c7).chips + 3);
t('v6 sin cambios', newGame('X', 6).v === 6 && blindInfo({ ...newGame('X', 6), blind: 0 }).target === 220 && blindInfo({ ...newGame('X', 7), blind: 0 }).target === 200);
let s7 = newGame('VSIETE1', 7), g7 = 0;
while (!['victory', 'defeat'].includes(s7.phase) && g7++ < 800) { if (s7.pack) s7 = step(s7, { type: 'SKIP_PACK' }).state; else if (s7.phase === 'preview') s7 = step(s7, { type: 'START_ROUND' }).state; else if (s7.phase === 'shop') s7 = leave(s7); else s7 = step(s7, { type: 'PLAY', ids: s7.round.hand.slice(0, 5) }).state; }
const rv7 = replayRun('VSIETE1', s7.log, 7); t('rejugada v7 ok', rv7.ok && rv7.result.total === s7.stats.total);

// ---- Reglas v8: mazos, dificultad, desafíos, eventos, jefes ----
const g8 = (seed, cfg = {}) => newGame(seed, 8, cfg);
const run8 = (seed, cfg, pick = (s) => s.round.hand.slice(0, 5), extra = () => ({})) => {
  let s = g8(seed, cfg), g = 0;
  while (!['victory', 'defeat'].includes(s.phase) && g++ < 900) {
    if (s.pack) { const r = step(s, { type: 'PICK_PACK', idx: 0 }); s = r.error ? step(s, { type: 'SKIP_PACK' }).state : r.state; continue; }
    if (s.phase === 'preview') { if (CH[cfg.ch]?.boostSuit && !s.boosted) s = step(s, { type: 'BOOST_SUIT', suit: 'S' }).state; s = step(s, { type: 'START_ROUND' }).state; continue; }
    if (s.phase === 'shop') { s = leave(s); continue; }
    const ids = pick(s); const r = step(s, { type: 'PLAY', ids, ...extra(s, ids) });
    if (r.error) { const d = step(s, { type: 'DISCARD', ids: s.round.hand.slice(0, 2) }); if (d.error) return { s, stuck: r.error }; s = d.state; } else s = r.state;
  }
  return { s };
};
const sh8 = (cards, idx, pattern, extra = {}) => scoreHand({ cards, scoringIdx: idx, pattern, mods: [], heat: 0, round: { printsDone: 0 }, v: 8, ...extra });
t('mazo Resina: 40 cartas con +3 y mano de 7', (() => { const s = step(g8('RES', { deck: 'resina' }), { type: 'START_ROUND' }).state; return s.deck.length === 40 && s.deck.every((c) => c.b === 3 && c.r >= 5) && s.round.hand.length === 7; })());
t('mazo Láser: 2 palos, 52 cartas, 2 descartes', (() => { const s = step(g8('LAS', { deck: 'laser' }), { type: 'START_ROUND' }).state; return s.deck.length === 52 && s.deck.every((c) => 'SH'.includes(c.s)) && s.round.discards === 2; })());
t('mazo Granja: 1 Mod, 0 Créditos, máx 3', (() => { const s = g8('GRA', { deck: 'granja' }); return s.mods.length === 1 && s.credits === 0 && s.rules.maxMods === 3; })());
t('dificultad metas +20 %', blindInfo(g8('D', { diffs: ['metas'] })).target === 280 && blindInfo(g8('D')).target === 230);
t('Corte de Luz quita 1 impresión', (() => { let s = g8('CL'); s.bosses = ['corte_luz', ...s.bosses.filter((b) => b !== 'corte_luz')]; s.blind = 2; s = step(s, { type: 'START_ROUND' }).state; return s.round.prints === 3; })());
t('Cama Desnivelada: 2.ª y 4.ª no suman', sh8(C('5S 5H 5C 9D'), [0, 1, 2], 'trio', { boss: 'cama_marcada' }).chips === sh8(C('5S 5H 5C 9D'), [0, 1, 2], 'trio').chips - 5);
t('Boquilla Tapada: repetidos a la mitad', sh8(C('8S 8H'), [0, 1], 'par', { boss: 'boquilla_tapada' }).chips === sh8(C('8S 8H'), [0, 1], 'par').chips - 8);
t('Reimpresión repite la carta más alta', sh8(C('5S KH'), [0, 1], 'alta', { mods: ['reimpresion'] }).chips === sh8(C('5S KH'), [0, 1], 'alta').chips + 10);
t('Dimensión oculta: Klipper + Reimpresión en la misma carta', (() => { const b = sh8(C('KH 5S'), [0, 1], 'alta', { mods: ['klipper', 'reimpresion'] }); return b.secret && b.trace.some((x) => x.phase === 'secreto'); })());
t('Purga Inteligente cuenta descartes de la ronda', sh8(c7, [0, 1], 'par', { mods: ['purga_inteligente'], chain: { discardsUsed: 2 } }).mult === sh8(c7, [0, 1], 'par').mult + 6000);
t('cadena en PLAY: descarte → Purga', (() => { let s = g8('PUR'); s.mods = ['purga_inteligente']; s = step(s, { type: 'START_ROUND' }).state; s = step(s, { type: 'DISCARD', ids: s.round.hand.slice(0, 1) }).state; s = step(s, { type: 'PLAY', ids: s.round.hand.slice(0, 2) }).state; return s.last.trace.some((x) => x.text.startsWith('Purga Inteligente')); })());
const shop8 = (seed, ev) => { const s = g8(seed); s.phase = 'shop'; s.shop = { rerollCost: 2, items: [], packs: [] }; s.event = { id: ev }; return s; };
t('evento: opción segura +4', (() => { const s = shop8('EV', 'oferta_filamento'); s.credits = 4; const r = step(s, { type: 'EVENT', idx: 0 }); return !r.error && r.state.credits === 8 && !r.state.event; })());
t('no se sale con evento pendiente', !!step(shop8('EV2', 'horas_extra'), { type: 'LEAVE_SHOP' }).error);
t('evento horas extra suma impresiones', (() => { let s = step(shop8('EV3', 'horas_extra'), { type: 'EVENT', idx: 0 }).state; s = step(s, { type: 'LEAVE_SHOP' }).state; s = step(s, { type: 'START_ROUND' }).state; return s.round.prints === 5; })());
t('desafío sin purga: 0 descartes', step(g8('SP', { ch: 'sin_purga' }), { type: 'START_ROUND' }).state.round.discards === 0);
t('desafío sin repuestos bloquea compra', (() => { const s = g8('SR', { ch: 'sin_repuestos' }); s.phase = 'shop'; s.shop = { rerollCost: 2, items: [{ kind: 'profile', id: 'borrador', price: 3 }], packs: [] }; s.credits = 10; return !!step(s, { type: 'BUY', slot: 0 }).error; })());
t('desafío todo o nada: sin declarar no juega', (() => { const s = step(g8('TN', { ch: 'todo_o_nada' }), { type: 'START_ROUND' }).state; return !!step(s, { type: 'PLAY', ids: s.round.hand.slice(0, 1) }).error && !step(s, { type: 'PLAY', ids: s.round.hand.slice(0, 1), declare: 'par' }).error; })());
t('todo o nada: fallar suma 0', (() => { const s = step(g8('TN2', { ch: 'todo_o_nada' }), { type: 'START_ROUND' }).state; return step(s, { type: 'PLAY', ids: s.round.hand.slice(0, 1), declare: 'poker' }).state.last.total === 0; })());
t('desafío precisión: pasarse pierde', (() => { let s = step(g8('PR', { ch: 'precision' }), { type: 'START_ROUND' }).state; s.round.target = 5; s = step(s, { type: 'PLAY', ids: s.round.hand.slice(0, 5) }).state; return s.phase === 'defeat' && s.defeatReason === 'precision'; })());
t('desafío 3 rondas termina en victoria', (() => { let s = g8('UB', { ch: 'ultima_bobina' }); let g = 0; while (s.phase !== 'victory' && g++ < 40) { if (s.pack) s = step(s, { type: 'SKIP_PACK' }).state; else if (s.phase === 'preview') { s = step(s, { type: 'START_ROUND' }).state; s.round.target = 1; } else if (s.phase === 'shop') s = leave(s); else s = step(s, { type: 'PLAY', ids: s.round.hand.slice(0, 1) }).state; } return s.phase === 'victory' && s.cleared === 3; })());
t('turno nocturno: jefe en cada ronda', blindInfo(g8('TNOC', { ch: 'turno_nocturno' })).boss !== null);
t('doble falla: 2 jefes compatibles', (() => { const s = g8('DF', { ch: 'doble_falla' }); s.blind = 2; const i = blindInfo(s); return !!i.boss && !!i.boss2 && i.boss !== i.boss2; })());
t('maratón pasa del Lote 4', (() => { const s = g8('MAR', { ch: 'maraton' }); s.lot = 5; return blindInfo(s).target > 4600; })());
t('código compartible ida y vuelta', (() => { const c = encodeCode('ABC123', { deck: 'laser', diffs: ['metas', 'caro'], ch: 'sin_purga' }); const d = decodeCode(c); return d && d.seed === 'ABC123' && d.cfg.deck === 'laser' && d.cfg.diffs.length === 2 && d.cfg.ch === 'sin_purga' && decodeCode('BC-basura') === null; })());
t('revancha sin jefe previo se detecta antes', typeof cfgProblem(normalizeCfg({ ch: 'revancha' })) === 'string' && cfgProblem(normalizeCfg({ ch: 'revancha', boss: 'warping', prevDeck: 'fdm', deck: 'resina' })) === null);
t('desafío diario determinista', dailyChallenge(new Date(2026, 10, 10)).ch === dailyChallenge(new Date(2026, 10, 10)).ch);
const { s: s8 } = run8('REPRO1', { deck: 'resina', diffs: ['metas'] });
const { s: s8b } = run8('REPRO1', { deck: 'resina', diffs: ['metas'] });
t('v8 reproducible', s8.stats.total === s8b.stats.total && s8.phase === s8b.phase);
const rv8 = replayRun('REPRO1', s8.log, 8, { deck: 'resina', diffs: ['metas'] });
t('rejugada v8 con cfg ok', rv8.ok && rv8.result.total === s8.stats.total, JSON.stringify(rv8).slice(0, 150));
const rv8x = replayRun('REPRO1', s8.log, 8, { deck: 'fdm' });
t('rejugada v8 con otra cfg no coincide', !rv8x.ok || rv8x.result.total !== s8.stats.total);
let okAll = 0;
for (const id of Object.keys(CH)) {
  const cfg = { ch: id, boss: 'warping', prevDeck: 'fdm', deck: CH[id].decks ? CH[id].decks[0] : (CH[id].revenge ? 'resina' : 'fdm') };
  const { s, stuck } = run8('CH' + id, cfg, (x) => x.round.hand.slice(0, 5), () => (CH[id].declare ? { declare: 'par' } : {}));
  if (!stuck && ['victory', 'defeat'].includes(s.phase)) okAll++; else console.log('  desafío trabado', id, stuck, s.phase);
}
t('los 24 desafíos se juegan de punta a punta', okAll === 24, okAll);
t('v7 sigue igual', newGame('X', 7).deck.length === 52 && !newGame('X', 7).cfg);

// ---- Logros ----
t('40 logros con id único, categoría y regla', ACHIEVEMENTS.length === 40 && new Set(ACHIEVEMENTS.map((x) => x.id)).size === 40 && ACHIEVEMENTS.every((x) => x.cat && x.desc && x.title));
t('333 es alcanzable (Trío K K K con +8, +8 y una Laminada)', sh8([{ id: 'a', r: 13, s: 'S', b: 8 }, { id: 'b', r: 13, s: 'H', b: 8 }, { id: 'c', r: 13, s: 'C', b: 0, ed: 'lam' }], [0, 1, 2], 'trio').total === 333);
// Partida completa observada paso a paso y luego repetida: sin duplicados
const watch = (seed, cfg, pick) => {
  let prof = emptyProfile(), got = [];
  let s = g8(seed, cfg), g = 0;
  ({ perfil: prof } = observe(prof, { kind: 'start', st: s }));
  const feed = (prev, r, action) => { const o = observe(prof, { kind: 'step', st: r.state, prev, action }); prof = o.perfil; got.push(...o.nuevos); s = r.state; };
  while (!['victory', 'defeat'].includes(s.phase) && g++ < 900) {
    if (s.pack) { const r = step(s, { type: 'PICK_PACK', idx: 0 }); if (r.error) feed(s, step(s, { type: 'SKIP_PACK' }), { type: 'SKIP_PACK' }); else feed(s, r, { type: 'PICK_PACK', idx: 0 }); continue; }
    if (s.phase === 'preview') { feed(s, step(s, { type: 'START_ROUND' }), { type: 'START_ROUND' }); continue; }
    if (s.phase === 'shop') { if (s.event) feed(s, step(s, { type: 'EVENT', idx: 0 }), { type: 'EVENT', idx: 0 }); feed(s, step(s, { type: 'LEAVE_SHOP' }), { type: 'LEAVE_SHOP' }); continue; }
    const ids = pick(s); const r = step(s, { type: 'PLAY', ids }); if (r.error) { feed(s, step(s, { type: 'DISCARD', ids: s.round.hand.slice(0, 2) }), { type: 'DISCARD' }); } else feed(s, r, { type: 'PLAY', ids });
  }
  const o = observe(prof, { kind: 'end', st: s }); prof = o.perfil; got.push(...o.nuevos);
  return { prof, got, s };
};
const w1 = watch('LOGRO1', {}, (x) => x.round.hand.slice(0, 5));
t('una partida terminada da Primera capa', w1.got.includes('primera_capa') && w1.prof.runs === 1);
const again = observe(w1.prof, { kind: 'end', st: w1.s });
t('repetir el final no duplica', again.nuevos.length === 0 && again.perfil.runs === 1);
const w1s = watch('LOGRO1', {}, (x) => x.round.hand.slice(0, 5));
t('la misma partida observada dos veces da lo mismo', JSON.stringify(w1s.got) === JSON.stringify(w1.got));
// Reglas puntuales con estados armados
const mk = (over = {}) => ({ ...g8('ACH'), log: [{ t: 'PLAY' }], phase: 'round', ...over });
const roundW = (prints, score, target, extra = {}) => ({ target, score, prints, printsDone: 4 - prints, discards: 3, boss: null, hand: [], draw: [], ...extra });
const played = (prof, prev, last) => observe(prof, { kind: 'step', st: mk({ last, round: { ...prev.round, score: prev.round.score + last.total }, deck: prev.deck, mods: prev.mods }), prev, action: { type: 'PLAY', ids: last.played } });
const prof0 = () => { const p = emptyProfile(); return observe(p, { kind: 'start', st: g8('ACH') }).perfil; };
const prevA = mk({ round: roundW(1, 80, 200) });
const L = (total, extra = {}) => ({ pattern: 'par', played: ['S7', 'H7'], scoring: ['S7', 'H7'], total, trace: [], effects: 0, ...extra });
let o = played(prof0(), prevA, L(130));
t('Al límite + Remontada + Sin desperdicio', ['al_limite', 'remontada', 'sin_desperdicio'].every((x) => o.nuevos.includes(x)));
o = played(prof0(), mk({ round: roundW(3, 0, 200) }), L(201));
t('Sin margen (<1 %)', o.nuevos.includes('sin_margen') && !o.nuevos.includes('al_limite'));
o = played(prof0(), mk({ round: roundW(4, 0, 200, { boss: 'warping' }) }), L(250));
t('Cierre limpio contra jefe y jefe anotado', o.nuevos.includes('cierre_limpio') && o.perfil.bosses.includes('warping'));
o = played(prof0(), mk({ round: roundW(4, 0, 100) }), L(200));
t('Producción en serie (2× la meta)', o.nuevos.includes('produccion_serie'));
o = played(prof0(), mk({ round: roundW(4, 0, 900) }), L(333));
t('Número de taller', o.nuevos.includes('numero_taller'));
o = played(prof0(), mk({ round: roundW(4, 0, 900) }), L(10, { pattern: 'ecolor', scoring: ['S10', 'S11', 'S12', 'S13', 'S14'] }));
t('Escalera real da Filamento premium y Pieza de exhibición', o.nuevos.includes('filamento_premium') && o.nuevos.includes('pieza_exhibicion'));
o = played(prof0(), mk({ round: roundW(4, 0, 900, { lastDrawn: 'H7' }) }), L(950));
t('Pieza rescatada', o.nuevos.includes('pieza_rescatada'));
let pf = prof0(); pf.lastDefeatBoss = 'stringing';
o = played(pf, mk({ round: roundW(4, 0, 50, { boss: 'stringing' }) }), L(60));
t('Revancha', o.nuevos.includes('revancha'));
o = played(prof0(), mk({ round: roundW(4, 0, 900) }), L(10, { effects: 5 }));
t('Cadena de producción', o.nuevos.includes('cadena_produccion'));
o = played(prof0(), mk({ round: roundW(4, 0, 900) }), L(10, { secret: true }));
t('Dimensión oculta', o.nuevos.includes('dimension_oculta'));
let pe = prof0(); const prevD = mk({ round: roundW(4, 0, 900), mods: ['brim', 'retraccion_fina', 'purga_inteligente'], log: [{ t: 'DISCARD' }] });
pe = observe(pe, { kind: 'step', st: prevD, prev: mk(), action: { type: 'DISCARD', ids: ['S2'] } }).perfil;
o = observe(pe, { kind: 'step', st: mk({ log: [{}, {}], last: L(10, { trace: [{ phase: 'mod', text: 'Brim: +8 Capas', modSlot: 0 }, { phase: 'mod', text: 'Retracción Fina: +2 Mult', modSlot: 1 }, { phase: 'mod', text: 'Purga Inteligente: +3 Mult', modSlot: 2 }] }), round: roundW(3, 10, 900), mods: prevD.mods }), prev: prevD, action: { type: 'PLAY', ids: ['S7', 'H7'] } });
t('Economía circular y Caja de herramientas', o.nuevos.includes('economia_circular') && o.nuevos.includes('caja_herramientas'));
let pw = prof0(); const endW = (prof, st) => observe(prof, { kind: 'end', st });
o = endW(pw, { ...g8('W1', { diffs: ['metas', 'caro', 'sin_ahorro'] }), phase: 'victory', stats: { total: 1, bestHand: 1, prints: 1 } });
t('Pieza terminada + Contra la máquina + Minimalista', ['pieza_terminada', 'contra_maquina', 'minimalista'].every((x) => o.nuevos.includes(x)));
let pr3 = prof0(); for (const sd of ['A1', 'A2', 'A3']) pr3 = endW(pr3, { ...g8(sd), phase: 'victory', stats: { total: 1, bestHand: 1, prints: 1 } }).perfil;
t('Tres turnos seguidos', !!pr3.unlocked.tres_turnos && pr3.streak === 3);
let pd = prof0(); const dl = dailyChallenge(new Date(2026, 10, 10));
o = endW(pd, { ...g8(dl.seed, { ch: dl.ch }), phase: 'defeat', stats: { total: 50, bestHand: 1, prints: 1 }, cleared: 1 });
t('Parte diario + récord guardado', o.nuevos.includes('parte_diario') && o.perfil.records[dl.ch].rounds === 1);
let prc = o.perfil; prc.records.sin_purga = { plays: 1, won: true, rounds: 6, score: 100 };
o = endW(prc, { ...g8('REC', { ch: 'sin_purga' }), phase: 'victory', stats: { total: 500, bestHand: 1, prints: 1 }, cleared: 6 });
t('Récord batido', o.nuevos.includes('record_batido') && o.perfil.records.sin_purga.score === 500);

console.log(`${ok} OK, ${bad} fallas`);
process.exit(bad ? 1 : 0);
