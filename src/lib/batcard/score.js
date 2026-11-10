// Motor de puntaje: Calidad = Capas × Multiplicador. Puro y determinista.
// Aritmética entera: Capas enteras; Multiplicador en milésimas (1000 = ×1).
// Un "×1,5" hace floor(m × 1500 / 1000): exacto con los factores del catálogo (múltiplos de 0,1).
// Redondeo único hacia abajo al final (Capas × m / 1000).
// Orden: contexto del jefe → base del Patrón → cartas puntuadas → cartas en mano → Mods (izq→der) → ajustes finales.
import { patternFor, cardChips, rankLabel, SUITS } from './hands.js';
import { MOD, MATERIALS, SEALS, EDITIONS } from './catalog.js';

export const MAX_ACTIVATIONS = 64; // tope de disparos por mano (no hay re-disparos en el MVP)
export const fmtMult = (m) => (m % 1000 === 0 ? String(m / 1000) : (m / 1000).toFixed(2).replace(/0$/, '').replace('.', ','));

// input: { cards, scoringIdx, pattern, level, mods:[ids], boss, heat, overextrude, round }
export function scoreHand(input) {
  const { cards, scoringIdx, pattern, level = 0, mods = [], boss, boss2, heat, overextrude, round, modData = {}, v = 1, chain = {} } = input;
  const has = (b) => boss === b || boss2 === b;
  const P = patternFor(pattern, v);
  const trace = [];
  let chips = 0, m = 0, activations = 0;
  const push = (phase, text, extra = {}) => trace.push({ phase, text, chips, mult: m, ...extra });
  const scoring = scoringIdx.map((i) => cards[i]);

  // 1. Contexto del jefe
  let warpIdx = -1;
  if (has('warping') && scoring.length) {
    let best = 0;
    scoring.forEach((c, i) => { if (c.r > scoring[best].r) best = i; });
    warpIdx = best;
    push('jefe', `Warping: ${rankLabel(scoring[best].r)}${SUITS[scoring[best].s].sym} no suma Capas`);
  }

  // 2. Base del Patrón (+ nivel de Perfil)
  chips = P.chips + level * P.lvl[0];
  m = (P.mult + level * P.lvl[1]) * 1000;
  push('base', `${P.name}${level ? ` (nivel ${level + 1})` : ''}`);
  if (has('cama_desnivelada') && round.printsDone === 0) {
    chips = Math.max(0, chips - 8);
    push('jefe', 'Cama Desnivelada: −8 Capas en la primera impresión');
  }
  if (overextrude) { chips += 12; push('calor', 'Sobreextruir: +12 Capas'); }
  if (has('stringing') && cards.length > scoringIdx.length) {
    const lost = 5 * (cards.length - scoringIdx.length);
    chips = Math.max(0, chips - lost);
    push('jefe', `Stringing: −${lost} Capas por cartas que no puntúan`);
  }
  if (has('atasco') && scoringIdx.length) push('jefe', 'Atasco de Extrusor: la primera carta no suma');
  if (has('pie_elefante') && scoringIdx.some((i) => cards[i].r <= 5)) push('jefe', 'Pie de Elefante: las cartas bajas no suman');

  // 3. Cartas puntuadas
  // Re-disparos (v4): Sello Rojo en la carta y Klipper en la primera carta puntuada.
  let gold = 0, secret = false;
  let topIdx = -1; scoring.forEach((c, i) => { if (topIdx < 0 || c.r > scoring[topIdx].r) topIdx = i; });
  const reimp = mods.includes('reimpresion') ? topIdx : -1;
  if (reimp === 0 && mods.includes('klipper')) secret = true; // Klipper y Reimpresión sobre la misma carta
  scoring.forEach((c, i) => {
    const why = [];
    if (c.sl === 'rojo') why.push(SEALS.rojo.name);
    if (i === 0 && mods.includes('klipper')) why.push('Klipper');
    if (i === reimp) why.push('Reimpresión');
    const reps = 1 + why.length;
    for (let k = 0; k < reps; k++) {
      if (k > 0) push('repetir', `${why[k - 1]}: ¡otra vez!`, { cardId: c.id, modSlot: why[k - 1] === 'Klipper' ? mods.indexOf('klipper') : why[k - 1] === 'Reimpresión' ? mods.indexOf('reimpresion') : undefined });
      scoreCard(c, i);
      if (c.sl === 'oro') { gold += 2; push('sello', `${SEALS.oro.name}: +2 Créditos`, { cardId: c.id }); }
    }
  });
  function scoreCard(c, i) {
    const marked = has('cama_marcada') && [1, 3].includes(cards.indexOf(c));
    const blocked = i === warpIdx || (has('atasco') && i === 0) || (has('pie_elefante') && c.r <= 5) || marked;
    let add = blocked ? 0 : cardChips(c.r) + (c.b || 0);
    const halved = !blocked && has('boquilla_tapada') && scoring.filter((x) => x.r === c.r).length > 1;
    if (halved) add = Math.floor(add / 2);
    if (halved) push('jefe', `Boquilla Tapada: ${rankLabel(c.r)}${SUITS[c.s].sym} repetida, aporta la mitad`, { cardId: c.id });
    if (marked) push('jefe', `Cama Desnivelada: ${rankLabel(c.r)}${SUITS[c.s].sym} está en una posición marcada`, { cardId: c.id });
    if (!blocked && c.s === 'H' && mods.includes('corazon_benchy')) add += cardChips(c.r);
    chips += add;
    push('carta', `${rankLabel(c.r)}${SUITS[c.s].sym}: +${add} Capas`, { cardId: c.id });
    // Material de la carta (reglas v2)
    const mat = c.m;
    if (mat === 'petg') { chips += 6; push('material', `${MATERIALS.petg.name}: +6 Capas`, { cardId: c.id }); }
    else if (mat === 'carbono') { chips += 12; push('material', `${MATERIALS.carbono.name}: +12 Capas (+1 Calor)`, { cardId: c.id }); }
    else if (mat === 'asa' && heat >= 4) { m = Math.floor((m * 1500) / 1000); push('material', `${MATERIALS.asa.name} con Calor ${heat}: ×1,5 Mult`, { cardId: c.id }); }
    else if (mat === 'seda' && cards.filter((x) => x.s === c.s).length === 1) { m += 2000; push('material', `${MATERIALS.seda.name} sola en su palo: +2 Mult`, { cardId: c.id }); }
    // Edición de la carta (reglas v6)
    if (c.ed === 'lam') { chips += 30; push('edicion', `${EDITIONS.lam.name}: +30 Capas`, { cardId: c.id }); }
    else if (c.ed === 'holo') { m += 8000; push('edicion', `${EDITIONS.holo.name}: +8 Mult`, { cardId: c.id }); }
    else if (c.ed === 'poli') { m = Math.floor((m * 1500) / 1000); push('edicion', `${EDITIONS.poli.name}: ×1,5 Mult`, { cardId: c.id }); }
  }

  // 4. Cartas en mano: sin efectos en el MVP (fase reservada).

  // 5. Mods de izquierda a derecha
  const ctx = { pattern, scoring, heat, round, modData, modCount: mods.length, chain };
  mods.forEach((id, slot) => {
    const mod = MOD[id];
    if (!mod || mod.effect.phase !== 'mods') return;
    if (activations >= MAX_ACTIVATIONS) return;
    if (!mod.effect.when(ctx)) return;
    activations++;
    const v = typeof mod.effect.value === 'function' ? mod.effect.value(ctx) : mod.effect.value;
    if (mod.effect.op === 'chips') { chips += v; push('mod', `${mod.name}: +${v} Capas`, { modSlot: slot }); }
    else if (mod.effect.op === 'mult') { m += v * 1000; push('mod', `${mod.name}: +${v} Mult`, { modSlot: slot }); }
    else if (mod.effect.op === 'xmult') { m = Math.floor((m * v) / 1000); push('mod', `${mod.name}: ×${fmtMult(v)} Mult`, { modSlot: slot }); }
  });

  // 6. Ajustes finales
  if (has('hotend_saturado') && heat >= 6) {
    m = Math.max(1000, m - 2000);
    push('jefe', 'Hotend Saturado: −2 Mult (Calor 6)');
  }

  if (secret) { m = m * 2; push('secreto', 'Dimensión oculta: Klipper + Reimpresión sobre la misma carta ×2 Mult'); }
  const total = Math.floor((chips * m) / 1000);
  trace.push({ phase: 'total', text: `${chips} × ${fmtMult(m)} = ${total}`, chips, mult: m, total });
  const effects = trace.filter((t) => ['mod', 'material', 'edicion', 'sello', 'repetir', 'secreto'].includes(t.phase)).length;
  return { chips, mult: m, total, trace, gold, secret, effects };
}
