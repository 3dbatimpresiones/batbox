// Catálogo BATCARD. IDs estables: nunca renombrar un id ya publicado (rompe guardados).
// Efecto de Mod: { phase, when(ctx) -> bool, op, value | value(ctx) }
//   phase 'mods'      → se resuelve al puntuar, de izquierda a derecha.
//   phase 'round_win' → al ganar la ronda (op 'credits').
//   op: 'chips' (+Capas), 'mult' (+Multiplicador), 'xmult' (×Multiplicador, en milésimas: 1500 = ×1,5), 'credits'.
// ctx.heat = Calor al resolver la mano (ya incluye Sobreextruir).
import { isFace } from './hands.js';

export const MODS = [
  { id: 'primera_capa', name: 'Primera Capa', rarity: 'común', price: 4, finish: 'laminado', tags: ['capas'],
    desc: '+12 Capas en la primera impresión de cada ronda.',
    effect: { phase: 'mods', when: (c) => c.round.printsDone === 0, op: 'chips', value: 12 } },
  { id: 'brim', name: 'Brim', rarity: 'común', price: 4, finish: 'laminado', tags: ['capas', 'descarte'],
    desc: '+8 Capas en la próxima impresión después de descartar.',
    effect: { phase: 'mods', when: (c) => c.round.discardedSincePlay, op: 'chips', value: 8 } },
  { id: 'boquilla_laton', name: 'Boquilla de Latón', rarity: 'común', price: 5, finish: 'metalico', tags: ['capas', 'figuras'],
    desc: '+5 Capas por cada figura (J, Q, K) puntuada.',
    effect: { phase: 'mods', when: (c) => c.scoring.some((x) => isFace(x.r)), op: 'chips', value: (c) => 5 * c.scoring.filter((x) => isFace(x.r)).length } },
  { id: 'acero_endurecido', name: 'Acero Endurecido', rarity: 'poco común', price: 6, finish: 'metalico', tags: ['mult'],
    desc: '+3 al Multiplicador si puntúan cuatro cartas o más.',
    effect: { phase: 'mods', when: (c) => c.scoring.length >= 4, op: 'mult', value: 3 } },
  { id: 'cama_pei', name: 'Cama PEI', rarity: 'común', price: 4, finish: 'holografico', tags: ['mult', 'color'],
    desc: '+2 al Multiplicador al puntuar Color.',
    effect: { phase: 'mods', when: (c) => c.pattern === 'color', op: 'mult', value: 2 } },
  { id: 'retraccion_fina', name: 'Retracción Fina', rarity: 'común', price: 5, finish: 'laminado', tags: ['mult', 'descarte'],
    desc: '+1 al Multiplicador por cada descarte restante.',
    effect: { phase: 'mods', when: (c) => c.round.discards > 0, op: 'mult', value: (c) => c.round.discards } },
  { id: 'pressure_advance', name: 'Pressure Advance', rarity: 'rara', price: 7, finish: 'policromo', tags: ['xmult'],
    desc: '×1,5 al Multiplicador si el Patrón cambia respecto de la impresión anterior de la ronda.',
    effect: { phase: 'mods', when: (c) => !!c.round.lastPattern && c.round.lastPattern !== c.pattern, op: 'xmult', value: 1500 } },
  { id: 'cama_nivelada', name: 'Cama Nivelada', rarity: 'común', price: 3, finish: 'laminado', tags: ['capas', 'par'],
    desc: '+10 Capas si puntúa un par de rango bajo (2 a 5).',
    effect: { phase: 'mods', when: (c) => hasLowPair(c.scoring), op: 'chips', value: 10 } },
  { id: 'sensor_filamento', name: 'Sensor de Filamento', rarity: 'poco común', price: 5, finish: 'metalico', tags: ['créditos'],
    desc: '+2 Créditos al ganar una ronda sin descartes restantes.',
    effect: { phase: 'round_win', when: (c) => c.round.discards === 0, op: 'credits', value: 2 } },
  { id: 'bobina_seca', name: 'Bobina Seca', rarity: 'común', price: 4, finish: 'holografico', tags: ['mult', 'calor'],
    desc: '+2 al Multiplicador con Calor de 0 a 2.',
    effect: { phase: 'mods', when: (c) => c.heat <= 2, op: 'mult', value: 2 } },
  { id: 'torre_purga', name: 'Torre de Purga', rarity: 'poco común', price: 5, finish: 'policromo', tags: ['capas', 'calor'],
    desc: '+15 Capas con Calor de 4 a 5.',
    effect: { phase: 'mods', when: (c) => c.heat >= 4 && c.heat <= 5, op: 'chips', value: 15 } },
  { id: 'benchy_maestro', name: 'Benchy Maestro', rarity: 'rara', price: 7, finish: 'holografico', tags: ['xmult'],
    desc: '×1,4 al Multiplicador si en esta ronda ya puntuaste dos Patrones diferentes antes de esta mano.',
    effect: { phase: 'mods', when: (c) => new Set(c.round.patternsScored).size >= 2, op: 'xmult', value: 1400 } },
];

function hasLowPair(cards) {
  const cnt = {};
  for (const x of cards) cnt[x.r] = (cnt[x.r] || 0) + 1;
  return Object.entries(cnt).some(([r, n]) => n >= 2 && +r >= 2 && +r <= 5);
}

// Calibraciones: se usan SOLO durante una ronda. target 'card' = exactamente 1 carta seleccionada de la mano.
export const CALIBRATIONS = [
  { id: 'flujo', name: 'Flujo', price: 3, target: 'card', desc: '+4 Capas permanentes a una carta elegida de tu mano.' },
  { id: 'cambio_bobina', name: 'Cambio de Bobina', price: 3, target: 'card+suit', desc: 'Cambia el palo de una carta elegida de tu mano.' },
  { id: 'corte_ras', name: 'Corte al Ras', price: 3, target: 'card', desc: 'Elimina del mazo una carta elegida de tu mano (mínimo 30 cartas en el mazo).' },
  { id: 'enfriamiento', name: 'Enfriamiento', price: 3, target: 'none', desc: 'Baja 2 de Calor (solo durante la ronda).' },
];
export const MIN_DECK = 30;

// Perfiles de laminado: suben un nivel a un Patrón (la tabla de suba está en PATTERNS[].lvl).
export const PROFILES = [
  { id: 'borrador', name: 'Borrador', pattern: 'alta', price: 3 },
  { id: 'detalle_fino', name: 'Detalle Fino', pattern: 'par', price: 3 },
  { id: 'vase_mode', name: 'Vase Mode', pattern: 'doble', price: 3 },
  { id: 'relleno_gyroid', name: 'Relleno Gyroid', pattern: 'trio', price: 3 },
  { id: 'soportes_organicos', name: 'Soportes Orgánicos', pattern: 'escalera', price: 3 },
  { id: 'costura_oculta', name: 'Costura Oculta', pattern: 'color', price: 3 },
  { id: 'altura_adaptativa', name: 'Altura Adaptativa', pattern: 'full', price: 4 },
  { id: 'puente_perfecto', name: 'Puente Perfecto', pattern: 'poker', price: 4 },
  { id: 'multimaterial', name: 'Multimaterial', pattern: 'ecolor', price: 4 },
];

// Jefes del Control de Calidad.
export const BOSSES = [
  { id: 'cama_desnivelada', name: 'Cama Desnivelada', desc: 'La primera impresión de la ronda pierde 8 Capas (después de la base, sin bajar de 0).' },
  { id: 'bobina_enredada', name: 'Bobina Enredada', desc: 'Empezás la ronda con 1 descarte menos.' },
  { id: 'warping', name: 'Warping', desc: 'La carta puntuada de mayor rango no suma Capas.' },
  { id: 'hotend_saturado', name: 'Hotend Saturado', desc: 'Si una mano termina con Calor 6, el Multiplicador final baja 2 (mínimo 1).' },
];

export const MOD = Object.fromEntries(MODS.map((m) => [m.id, m]));
export const CAL = Object.fromEntries(CALIBRATIONS.map((m) => [m.id, m]));
export const PROF = Object.fromEntries(PROFILES.map((m) => [m.id, m]));
export const BOSS = Object.fromEntries(BOSSES.map((m) => [m.id, m]));

// Metas por Lote (Prototipo / Tanda / Control de Calidad). Hipótesis de balance.
export const TARGETS = [[220, 330, 450], [550, 750, 1000], [1200, 1650, 2200], [2600, 3600, 4800]];
export const BLIND_NAMES = ['Prototipo', 'Tanda', 'Control de Calidad'];
export const BLIND_PAY = [3, 4, 5];
export const RULES = { handSize: 8, prints: 4, discards: 3, maxMods: 4, maxCals: 2, heatMax: 6, overHeat: 2, overChips: 12, overLimit: 4 };
