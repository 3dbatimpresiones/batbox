// Motor de puntaje: Calidad = Capas × Multiplicador. Puro y determinista.
// Aritmética entera: Capas enteras; Multiplicador en milésimas (1000 = ×1).
// Un "×1,5" hace floor(m × 1500 / 1000): exacto con los factores del catálogo (múltiplos de 0,1).
// Redondeo único hacia abajo al final (Capas × m / 1000).
// Orden: contexto del jefe → base del Patrón → cartas puntuadas → cartas en mano → Mods (izq→der) → ajustes finales.
import { PATTERN, cardChips, rankLabel, SUITS } from './hands.js';
import { MOD, MATERIALS, SEALS } from './catalog.js';

export const MAX_ACTIVATIONS = 64; // tope de disparos por mano (no hay re-disparos en el MVP)
export const fmtMult = (m) => (m % 1000 === 0 ? String(m / 1000) : (m / 1000).toFixed(2).replace(/0$/, '').replace('.', ','));

// input: { cards, scoringIdx, pattern, level, mods:[ids], boss, heat, overextrude, round }
export function scoreHand(input) {
  const { cards, scoringIdx, pattern, level = 0, mods = [], boss, heat, overextrude, round, modData = {} } = input;
  const P = PATTERN[pattern];
  const trace = [];
  let chips = 0, m = 0, activations = 0;
  const push = (phase, text, extra = {}) => trace.push({ phase, text, chips, mult: m, ...extra });
  const scoring = scoringIdx.map((i) => cards[i]);

  // 1. Contexto del jefe
  let warpIdx = -1;
  if (boss === 'warping' && scoring.length) {
    let best = 0;
    scoring.forEach((c, i) => { if (c.r > scoring[best].r) best = i; });
    warpIdx = best;
    push('jefe', `Warping: ${rankLabel(scoring[best].r)}${SUITS[scoring[best].s].sym} no suma Capas`);
  }

  // 2. Base del Patrón (+ nivel de Perfil)
  chips = P.chips + level * P.lvl[0];
  m = (P.mult + level * P.lvl[1]) * 1000;
  push('base', `${P.name}${level ? ` (nivel ${level + 1})` : ''}`);
  if (boss === 'cama_desnivelada' && round.printsDone === 0) {
    chips = Math.max(0, chips - 8);
    push('jefe', 'Cama Desnivelada: −8 Capas en la primera impresión');
  }
  if (overextrude) { chips += 12; push('calor', 'Sobreextruir: +12 Capas'); }
  if (boss === 'stringing' && cards.length > scoringIdx.length) {
    const lost = 5 * (cards.length - scoringIdx.length);
    chips = Math.max(0, chips - lost);
    push('jefe', `Stringing: −${lost} Capas por cartas que no puntúan`);
  }
  if (boss === 'atasco' && scoringIdx.length) push('jefe', 'Atasco de Extrusor: la primera carta no suma');
  if (boss === 'pie_elefante' && scoringIdx.some((i) => cards[i].r <= 5)) push('jefe', 'Pie de Elefante: las cartas bajas no suman');

  // 3. Cartas puntuadas
  // Re-disparos (v4): Sello Rojo en la carta y Klipper en la primera carta puntuada.
  let gold = 0;
  scoring.forEach((c, i) => {
    let reps = 1;
    if (c.sl === 'rojo') reps++;
    if (i === 0 && mods.includes('klipper')) reps++;
    for (let k = 0; k < reps; k++) {
      if (k > 0) push('repetir', `${k === 1 && c.sl === 'rojo' ? SEALS.rojo.name : 'Klipper'}: ¡otra vez!`, { cardId: c.id });
      scoreCard(c, i);
      if (c.sl === 'oro') { gold += 2; push('sello', `${SEALS.oro.name}: +2 Créditos`, { cardId: c.id }); }
    }
  });
  function scoreCard(c, i) {
    const blocked = i === warpIdx || (boss === 'atasco' && i === 0) || (boss === 'pie_elefante' && c.r <= 5);
    const add = blocked ? 0 : cardChips(c.r) + (c.b || 0);
    chips += add;
    push('carta', `${rankLabel(c.r)}${SUITS[c.s].sym}: +${add} Capas`, { cardId: c.id });
    // Material de la carta (reglas v2)
    const mat = c.m;
    if (mat === 'petg') { chips += 6; push('material', `${MATERIALS.petg.name}: +6 Capas`, { cardId: c.id }); }
    else if (mat === 'carbono') { chips += 12; push('material', `${MATERIALS.carbono.name}: +12 Capas (+1 Calor)`, { cardId: c.id }); }
    else if (mat === 'asa' && heat >= 4) { m = Math.floor((m * 1500) / 1000); push('material', `${MATERIALS.asa.name} con Calor ${heat}: ×1,5 Mult`, { cardId: c.id }); }
    else if (mat === 'seda' && cards.filter((x) => x.s === c.s).length === 1) { m += 2000; push('material', `${MATERIALS.seda.name} sola en su palo: +2 Mult`, { cardId: c.id }); }
  }

  // 4. Cartas en mano: sin efectos en el MVP (fase reservada).

  // 5. Mods de izquierda a derecha
  const ctx = { pattern, scoring, heat, round, modData, modCount: mods.length };
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
  if (boss === 'hotend_saturado' && heat >= 6) {
    m = Math.max(1000, m - 2000);
    push('jefe', 'Hotend Saturado: −2 Mult (Calor 6)');
  }

  const total = Math.floor((chips * m) / 1000);
  trace.push({ phase: 'total', text: `${chips} × ${fmtMult(m)} = ${total}`, chips, mult: m, total });
  return { chips, mult: m, total, trace, gold };
}
