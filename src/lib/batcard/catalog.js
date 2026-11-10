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
  // ---- Reglas v4 (since: 4): solo aparecen en partidas nuevas ----
  { id: 'klipper', since: 4, name: 'Klipper', rarity: 'rara', price: 7, finish: 'policromo', tags: ['repetir'],
    desc: 'La primera carta puntuada se dispara dos veces.',
    effect: { phase: 'retrigger' } },
  { id: 'contador_horas', since: 4, name: 'Contador de Horas', rarity: 'poco común', price: 6, finish: 'metalico', tags: ['capas', 'crece'],
    desc: 'Crece: +3 Capas por cada impresión que hiciste desde que lo tenés.',
    effect: { phase: 'mods', when: (c) => (c.modData.contador_horas || 0) > 0, op: 'chips', value: (c) => 3 * (c.modData.contador_horas || 0) } },
  { id: 'granja', since: 4, name: 'Granja de Impresoras', rarity: 'común', price: 5, finish: 'laminado', tags: ['capas'],
    desc: '+6 Capas por cada Mod de Taller que tengas (este incluido).',
    effect: { phase: 'mods', when: () => true, op: 'chips', value: (c) => 6 * c.modCount } },
  { id: 'camara_cerrada', since: 4, name: 'Cámara Cerrada', rarity: 'poco común', price: 6, finish: 'holografico', tags: ['mult', 'calor'],
    desc: '+1 al Multiplicador por cada punto de Calor.',
    effect: { phase: 'mods', when: (c) => c.heat > 0, op: 'mult', value: (c) => c.heat } },
  { id: 'spool_holder', since: 4, name: 'Porta Bobinas', rarity: 'común', price: 4, finish: 'laminado', tags: ['descarte'],
    desc: '+1 descarte en cada ronda.',
    effect: { phase: 'round_start' } },
  { id: 'volcano', since: 4, name: 'Hotend Volcano', rarity: 'rara', price: 8, finish: 'policromo', tags: ['xmult', 'calor'],
    desc: '×2 al Multiplicador con Calor 6.',
    effect: { phase: 'mods', when: (c) => c.heat >= 6, op: 'xmult', value: 2000 } },
  // ---- Reglas v5: legendarios (solo salen en el Sobre Maker) ----
  { id: 'corexy', since: 5, legendary: true, name: 'CoreXY Legendaria', rarity: 'legendaria', price: 10, finish: 'legendario', tags: ['xmult'],
    desc: '×3 al Multiplicador si puntúan 5 cartas.',
    effect: { phase: 'mods', when: (c) => c.scoring.length >= 5, op: 'xmult', value: 3000 } },
  { id: 'benchy_oro', since: 5, legendary: true, name: 'Benchy de Oro', rarity: 'legendaria', price: 10, finish: 'legendario', tags: ['xmult', 'benchy'],
    desc: '×1,5 al Multiplicador por cada carta de Corazones (Benchy) puntuada.',
    effect: { phase: 'mods', when: (c) => c.scoring.some((x) => x.s === 'H'), op: 'xmult', value: (c) => Math.round(1000 * Math.pow(1.5, c.scoring.filter((x) => x.s === 'H').length)) } },
];
export const modsFor = (v) => MODS.filter((m) => (m.since || 1) <= v);
export const shopModsFor = (v) => modsFor(v).filter((m) => !m.legendary);

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

// Materiales (filamentos) de las cartas — reglas v2. Sin material = PLA (base).
export const MATERIALS = {
  petg: { name: 'PETG', short: 'PETG', desc: '+6 Capas al puntuar. Es pegajosa: no se puede descartar.' },
  tpu: { name: 'TPU', short: 'TPU', desc: 'Flexible: después de imprimirla vuelve a tu mano (una vez por ronda).' },
  asa: { name: 'ASA', short: 'ASA', desc: '×1,5 Mult al puntuar si el Calor está en 4 o más.' },
  carbono: { name: 'Fibra de carbono', short: 'CF', desc: '+12 Capas al puntuar, pero sube 1 de Calor.' },
  seda: { name: 'Seda', short: 'SEDA', desc: '+2 Mult al puntuar si es la única carta de su palo en la jugada.' },
};
// Bobinas: calibraciones que le ponen un material a una carta de la mano (solo reglas v2).
// Sellos de calidad (reglas v4): se ponen con una calibración o vienen en los sobres.
export const SEALS = {
  oro: { name: 'Sello Dorado', desc: '+2 Créditos cada vez que esta carta puntúa.' },
  rojo: { name: 'Sello Rojo', desc: 'Esta carta puntúa dos veces.' },
};
export const SEAL_CALS = Object.keys(SEALS).map((k) => ({ id: 'sello_' + k, name: SEALS[k].name, price: 5, target: 'card', seal: k, desc: `Le pone a una carta de tu mano el ${SEALS[k].name}: ${SEALS[k].desc}` }));
export const SPOOLS = Object.keys(MATERIALS).map((m) => ({ id: 'bobina_' + m, name: 'Bobina de ' + MATERIALS[m].name, price: 4, target: 'card', mat: m, desc: `Convierte una carta de tu mano en ${MATERIALS[m].name}: ${MATERIALS[m].desc}` }));

// Sobres (reglas v3): se compran en Suministros, se abren y elegís 1 opción.
export const PACKS = {
  cartas: { name: 'Sobre de Cartas', price: 4, n: 4, weight: 40, desc: 'Elegí 1 de 4 cartas nuevas para tu mazo (algunas traen material o Capas extra).' },
  calibracion: { name: 'Sobre de Calibración', price: 4, n: 3, weight: 25, desc: 'Elegí 1 de 3 calibraciones o bobinas de filamento.' },
  perfiles: { name: 'Sobre de Perfiles', price: 4, n: 3, weight: 20, desc: 'Elegí 1 de 3 perfiles de laminado: sube de nivel un Patrón.' },
  maker: { name: 'Sobre Maker', price: 6, n: 3, weight: 15, desc: 'Raro. Elegí 1 de 3 Mods de Taller.' },
};

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
  { id: 'atasco', since: 5, name: 'Atasco de Extrusor', desc: 'La primera carta puntuada de cada mano no suma Capas.' },
  { id: 'stringing', since: 5, name: 'Stringing', desc: 'Cada carta jugada que no puntúa resta 5 Capas.' },
  { id: 'pie_elefante', since: 5, name: 'Pie de Elefante', desc: 'Las cartas del 2 al 5 no suman Capas.' },
];
export const bossesFor = (v) => BOSSES.filter((b) => (b.since || 1) <= v);

export const MOD = Object.fromEntries(MODS.map((m) => [m.id, m]));
export const CAL = Object.fromEntries([...CALIBRATIONS, ...SPOOLS, ...SEAL_CALS].map((m) => [m.id, m]));
export const calsFor = (v) => [...CALIBRATIONS, ...(v >= 2 ? SPOOLS : []), ...(v >= 4 ? SEAL_CALS : [])];
export const INTEREST = { per: 5, max: 5 };
export const PROF = Object.fromEntries(PROFILES.map((m) => [m.id, m]));
export const BOSS = Object.fromEntries(BOSSES.map((m) => [m.id, m]));

// Metas por Lote (Prototipo / Tanda / Control de Calidad). Hipótesis de balance.
export const TARGETS = [[220, 330, 450], [550, 750, 1000], [1200, 1650, 2200], [2600, 3600, 4800]];
export const BLIND_NAMES = ['Prototipo', 'Tanda', 'Control de Calidad'];
export const BLIND_PAY = [3, 4, 5];
export const RULES = { handSize: 8, prints: 4, discards: 3, maxMods: 4, maxCals: 2, heatMax: 6, overHeat: 2, overChips: 12, overLimit: 4 };
