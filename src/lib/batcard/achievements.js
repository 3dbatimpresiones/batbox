// Logros, perfil y récords de BATCARD. Puro: observe(perfil, hecho) → { perfil, nuevos }.
// Cada logro tiene una regla verificable escrita en `desc` (la misma que ve el jugador).
// Anti-duplicados: el perfil guarda hasta qué acción (índice del log) ya procesó cada semilla.
import { bossesFor, BOSS } from './catalog.js';
import { DECK_IDS, CH } from './modes.js';

export const REWARDS = {
  t_maker: { type: 'titulo', name: 'Maker' },
  t_calibrador: { type: 'titulo', name: 'Calibrador' },
  t_inspector: { type: 'titulo', name: 'Inspector de calidad' },
  t_leyenda: { type: 'titulo', name: 'Leyenda del taller' },
  m_cian: { type: 'marco', name: 'Marco cian', cls: 'marco-cian' },
  m_oro: { type: 'marco', name: 'Marco dorado', cls: 'marco-oro' },
  m_holo: { type: 'marco', name: 'Marco holográfico', cls: 'marco-holo' },
  d_logo: { type: 'dorso', name: 'Dorso 3DBAT firmado', skin: 'firmado' },
};

export const ACHIEVEMENTS = [
  // Primeras partidas
  { id: 'primera_capa', n: 1, cat: 'Primeras partidas', title: 'Primera capa', desc: 'Terminá una partida (ganada o perdida).' },
  { id: 'pieza_terminada', n: 2, cat: 'Primeras partidas', title: 'Pieza terminada', desc: 'Ganá una partida.', reward: 't_maker' },
  { id: 'banco_pruebas', n: 3, cat: 'Primeras partidas', title: 'Banco de pruebas', desc: 'Terminá partidas con 3 mazos iniciales distintos.', max: 3 },
  { id: 'caja_herramientas', n: 4, cat: 'Primeras partidas', title: 'Caja de herramientas', desc: 'Activá 3 Mods de Taller distintos en una misma partida.', max: 3 },
  { id: 'turno_completo', n: 5, cat: 'Primeras partidas', title: 'Turno completo', desc: 'Vencé a 3 jefes distintos.', max: 3 },
  // Manos de póker
  { id: 'doble_pasada', n: 6, cat: 'Manos de póker', title: 'Doble pasada', desc: 'Puntuá con un Doble par.' },
  { id: 'trio_boquillas', n: 7, cat: 'Manos de póker', title: 'Trío de boquillas', desc: 'Puntuá con un Trío.' },
  { id: 'en_linea', n: 8, cat: 'Manos de póker', title: 'En línea', desc: 'Puntuá con una Escalera.' },
  { id: 'color_parejo', n: 9, cat: 'Manos de póker', title: 'Color parejo', desc: 'Puntuá con un Color.' },
  { id: 'cama_llena', n: 10, cat: 'Manos de póker', title: 'Cama llena', desc: 'Puntuá con un Full.' },
  // Manos raras
  { id: 'cuatro_cabezales', n: 11, cat: 'Manos raras', title: 'Cuatro cabezales', desc: 'Puntuá con un Póker.', reward: 'm_cian' },
  { id: 'filamento_premium', n: 12, cat: 'Manos raras', title: 'Filamento premium', desc: 'Puntuá con una Escalera de color.' },
  { id: 'pieza_exhibicion', n: 13, cat: 'Manos raras', title: 'Pieza de exhibición', desc: 'Puntuá con una Escalera real (10, J, Q, K y A del mismo palo).', reward: 'm_oro' },
  { id: 'menor_mayor', n: 14, cat: 'Manos raras', title: 'De menor a mayor', desc: 'En una partida, puntuá un Par, después un Trío y después un Póker (en ese orden, no hace falta que sean seguidos).', max: 3 },
  { id: 'muestrario', n: 15, cat: 'Manos raras', title: 'Muestrario', desc: 'Puntuá con 6 Patrones distintos en una misma partida.', max: 6 },
  // Tensión y remontadas
  { id: 'al_limite', n: 16, cat: 'Tensión y remontadas', title: 'Al límite', desc: 'Superá la meta con tu última impresión disponible.' },
  { id: 'sin_margen', n: 17, cat: 'Tensión y remontadas', title: 'Sin margen', desc: 'Ganá una ronda pasándote de la meta por menos del 1 %.' },
  { id: 'remontada', n: 18, cat: 'Tensión y remontadas', title: 'Remontada', desc: 'Empezá tu última impresión con menos de la mitad de la meta y superala con esa jugada.' },
  { id: 'sin_desperdicio', n: 19, cat: 'Tensión y remontadas', title: 'Sin desperdicio', desc: 'Ganá una ronda sin usar descartes.' },
  { id: 'cierre_limpio', n: 20, cat: 'Tensión y remontadas', title: 'Cierre limpio', desc: 'Vencé a un jefe con la primera impresión de la ronda.' },
  // Estrategias
  { id: 'monocolor', n: 21, cat: 'Estrategias', title: 'Monocolor', desc: 'Puntuá 5 manos seguidas con todas las cartas puntuadas del mismo palo, en una partida que termines ganando.', max: 5 },
  { id: 'cuatro_materiales', n: 22, cat: 'Estrategias', title: 'Cuatro materiales', desc: 'En una misma ronda, hacé puntuar cartas de los 4 palos.', max: 4 },
  { id: 'economia_circular', n: 23, cat: 'Estrategias', title: 'Economía circular', desc: 'Descartá y, en la impresión siguiente, activá Brim, Retracción Fina y Purga Inteligente a la vez.' },
  { id: 'cadena_produccion', n: 24, cat: 'Estrategias', title: 'Cadena de producción', desc: 'Activá 5 efectos (Mods, materiales, sellos, ediciones o repeticiones) en una sola mano.', max: 5 },
  { id: 'minimalista', n: 25, cat: 'Estrategias', title: 'Minimalista', desc: 'Ganá una partida sin tener nunca más de 1 Mod equipado.', reward: 't_calibrador' },
  // Dominio
  { id: 'taller_sin_fallas', n: 26, cat: 'Dominio', title: 'Taller sin fallas', desc: 'Vencé a todos los jefes del catálogo.', max: 9, reward: 'd_logo' },
  { id: 'tres_turnos', n: 27, cat: 'Dominio', title: 'Tres turnos', desc: 'Ganá 3 partidas seguidas (sin perder ninguna en el medio).', max: 3 },
  { id: 'coleccionista', n: 28, cat: 'Dominio', title: 'Coleccionista de mazos', desc: 'Ganá una partida con cada mazo inicial.', max: 4 },
  { id: 'contra_maquina', n: 29, cat: 'Dominio', title: 'Contra la máquina', desc: 'Ganá una partida con 3 modificadores de dificultad activos.', reward: 't_leyenda' },
  { id: 'produccion_serie', n: 30, cat: 'Dominio', title: 'Producción en serie', desc: 'Conseguí en una sola mano al menos el doble de la meta de la ronda.', reward: 'm_holo' },
  // Desafíos
  { id: 'parte_diario', n: 31, cat: 'Desafíos', title: 'Parte diario', desc: 'Terminá tu primer desafío diario.' },
  { id: 'semana_taller', n: 32, cat: 'Desafíos', title: 'Semana de taller', desc: 'Ganá un desafío semanal.' },
  { id: 'semilla_compartida', n: 33, cat: 'Desafíos', title: 'Semilla compartida', desc: 'Terminá una partida cargada desde un código compartido.' },
  { id: 'record_batido', n: 34, cat: 'Desafíos', title: 'Récord batido', desc: 'Mejorá tu marca en un desafío que ya habías ganado.' },
  { id: 'inspector_calidad', n: 35, cat: 'Desafíos', title: 'Inspector de calidad', desc: 'Terminá 10 desafíos distintos.', max: 10, reward: 't_inspector' },
  // Secretos (muestran una pista hasta desbloquearse)
  { id: 'falla_feliz', n: 36, cat: 'Secretos', title: 'Falla feliz', secret: true, hint: 'A veces lo más simple alcanza…', desc: 'Ganá una ronda en la que todas tus impresiones hayan sido Carta alta.' },
  { id: 'numero_taller', n: 37, cat: 'Secretos', title: 'Número de taller', secret: true, hint: 'Un número que se repite tres veces.', desc: 'Conseguí exactamente 333 puntos en una mano.' },
  { id: 'pieza_rescatada', n: 38, cat: 'Secretos', title: 'Pieza rescatada', secret: true, hint: 'La última en llegar puede salvar la ronda.', desc: 'Ganá una ronda con una mano en la que puntúe la última carta que robaste del mazo.' },
  { id: 'revancha', n: 39, cat: 'Secretos', title: 'Revancha', secret: true, hint: 'Hay cuentas pendientes con alguien.', desc: 'Vencé al jefe que terminó tu partida anterior.' },
  { id: 'dimension_oculta', n: 40, cat: 'Secretos', title: 'Dimensión oculta', secret: true, hint: 'Dos Mods que repiten… sobre la misma carta.', desc: 'Activá Klipper y Reimpresión sobre la misma carta en una mano (×2 Mult secreto).' },
];
export const ACH = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
const ALL_BOSSES = bossesFor(8).map((b) => b.id);

export const emptyProfile = () => ({
  v: 1, unlocked: {}, progress: {}, seen: {}, runs: 0, wins: 0, streak: 0,
  decksDone: [], decksWon: [], bosses: [], challengesDone: [], records: {}, lastDefeatBoss: null, lastDeck: null,
  cosmetics: { titulo: null, marco: null }, run: null,
});

// ---------- Observador ----------
// hecho: { kind: 'start'|'step'|'end', st, prev?, action?, res? }
// Devuelve { perfil, nuevos: [ids desbloqueados ahora] }. Nunca duplica: usa perfil.seen[semilla].
export function observe(p0, h) {
  const p = structuredClone(p0);
  const nuevos = [];
  const st = h.st;
  const seedKey = st.seed + (st.cfg ? '#' + JSON.stringify(st.cfg) : '');
  const unlock = (id) => { if (!p.unlocked[id]) { p.unlocked[id] = Date.now(); nuevos.push(id); } };
  const prog = (id, val, max) => { p.progress[id] = Math.min(max, Math.max(p.progress[id] || 0, val)); if (p.progress[id] >= max) unlock(id); };
  const addSet = (arr, x) => { if (!arr.includes(x)) arr.push(x); return arr; };

  if (h.kind === 'start') {
    p.run = { seed: seedKey, mods: [], maxMods: st.mods.length, stage: 0, patterns: [], monoStreak: 0, monoMax: 0, roundPats: [], roundSuits: [], roundDiscarded: false, lastDiscard: false };
    return { perfil: p, nuevos };
  }
  if (!p.run || p.run.seed !== seedKey) p.run = { seed: seedKey, mods: [], maxMods: st.mods.length, stage: 0, patterns: [], monoStreak: 0, monoMax: 0, roundPats: [], roundSuits: [], roundDiscarded: false, lastDiscard: false };
  const run = p.run;

  if (h.kind === 'step') {
    const idx = st.log.length - 1;
    if ((p.seen[seedKey] ?? -1) >= idx) return { perfil: p, nuevos }; // ya procesado (recarga / reintento del guardado)
    p.seen[seedKey] = idx;
    const a = h.action, prev = h.prev, r = st.round, pr = prev.round;
    run.maxMods = Math.max(run.maxMods, st.mods.length);
    if (a.type === 'START_ROUND') { run.roundPats = []; run.roundSuits = []; run.roundDiscarded = false; run.lastDiscard = false; }
    if (a.type === 'DISCARD') { run.roundDiscarded = true; run.lastDiscard = true; }
    if (a.type === 'PLAY' && st.last) {
      const L = st.last, pat = L.pattern, sc = (L.scoring || []).map((id) => st.deck.find((c) => c.id === id)).filter(Boolean);
      // Mods activados en la partida
      L.trace.forEach((t) => { if (t.modSlot != null && (t.phase === 'mod' || t.phase === 'repetir')) addSet(run.mods, prev.mods[t.modSlot]); });
      prog('caja_herramientas', run.mods.length, 3);
      // Patrones
      if (L.total > 0 || true) {
        if (pat === 'doble') unlock('doble_pasada'); if (pat === 'trio') unlock('trio_boquillas'); if (pat === 'escalera') unlock('en_linea');
        if (pat === 'color') unlock('color_parejo'); if (pat === 'full') unlock('cama_llena'); if (pat === 'poker') unlock('cuatro_cabezales');
        if (pat === 'ecolor') { unlock('filamento_premium'); if (sc.length === 5 && [10, 11, 12, 13, 14].every((x) => sc.some((c) => c.r === x))) unlock('pieza_exhibicion'); }
        addSet(run.patterns, pat); prog('muestrario', run.patterns.length, 6);
        run.roundPats.push(pat);
        const order = ['par', 'trio', 'poker'];
        if (pat === order[run.stage]) run.stage++;
        prog('menor_mayor', run.stage, 3);
      }
      // Monocolor
      const suits = [...new Set(sc.map((c) => c.s))];
      run.monoStreak = suits.length === 1 ? run.monoStreak + 1 : 0;
      run.monoMax = Math.max(run.monoMax, run.monoStreak);
      p.progress.monocolor = Math.max(p.progress.monocolor || 0, Math.min(5, run.monoMax));
      suits.forEach((s) => addSet(run.roundSuits, s));
      prog('cuatro_materiales', run.roundSuits.length, 4);
      // Economía circular: descarte → Brim + Retracción Fina + Purga Inteligente en la misma impresión
      if (run.lastDiscard) {
        const names = L.trace.filter((t) => t.phase === 'mod').map((t) => t.text.split(':')[0]);
        if (['Brim', 'Retracción Fina', 'Purga Inteligente'].every((n) => names.includes(n))) unlock('economia_circular');
      }
      run.lastDiscard = false;
      if ((L.effects || 0) >= 5) unlock('cadena_produccion'); p.progress.cadena_produccion = Math.max(p.progress.cadena_produccion || 0, Math.min(5, L.effects || 0));
      if (pr && L.total >= pr.target * 2) unlock('produccion_serie');
      if (L.total === 333) unlock('numero_taller');
      if (L.secret) unlock('dimension_oculta');
      // Ronda ganada con esta mano
      const won = pr && pr.score < pr.target && pr.score + L.total >= pr.target;
      if (won) {
        const final = pr.score + L.total;
        if (pr.prints === 1) unlock('al_limite');
        if (final < pr.target * 1.01) unlock('sin_margen');
        if (pr.prints === 1 && pr.score < pr.target / 2) unlock('remontada');
        if (!run.roundDiscarded) unlock('sin_desperdicio');
        if (pr.boss && pr.printsDone === 0) unlock('cierre_limpio');
        if (run.roundPats.length && run.roundPats.every((x) => x === 'alta')) unlock('falla_feliz');
        if (pr.lastDrawn && L.scoring.includes(pr.lastDrawn)) unlock('pieza_rescatada');
        [pr.boss, pr.boss2].filter(Boolean).forEach((b) => { addSet(p.bosses, b); if (b === p.lastDefeatBoss) unlock('revancha'); });
        prog('turno_completo', p.bosses.length, 3);
        prog('taller_sin_fallas', p.bosses.filter((b) => ALL_BOSSES.includes(b)).length, ALL_BOSSES.length);
      }
    }
    return { perfil: p, nuevos };
  }

  if (h.kind === 'end') {
    const endKey = seedKey + '/fin';
    if (p.seen[endKey]) return { perfil: p, nuevos };
    p.seen[endKey] = 1;
    const won = st.phase === 'victory', cfg = st.cfg || { deck: 'fdm', diffs: [] }, ch = cfg.ch ? CH[cfg.ch] : null;
    p.runs++; unlock('primera_capa');
    addSet(p.decksDone, cfg.deck); prog('banco_pruebas', p.decksDone.length, 3);
    p.lastDeck = cfg.deck;
    if (won) {
      p.wins++; p.streak++; unlock('pieza_terminada');
      addSet(p.decksWon, cfg.deck); prog('coleccionista', p.decksWon.length, DECK_IDS.length);
      prog('tres_turnos', p.streak, 3);
      if ((cfg.diffs || []).length >= 3) unlock('contra_maquina');
      if (run.maxMods <= 1) unlock('minimalista');
      if (run.monoMax >= 5) unlock('monocolor');
      if (ch?.weekly && st.seed.startsWith('SEM')) unlock('semana_taller');
    } else {
      p.streak = 0;
      if (st.round?.boss) p.lastDefeatBoss = st.round.boss;
    }
    if (st.fromCode) unlock('semilla_compartida');
    if (ch) {
      if (ch.daily && st.seed.startsWith('DIA')) unlock('parte_diario');
      addSet(p.challengesDone, cfg.ch); prog('inspector_calidad', p.challengesDone.length, 10);
      // Récord del desafío: primero rondas superadas, después puntaje
      const key = cfg.ch, rec = p.records[key] || { plays: 0, won: false, rounds: 0, score: 0 };
      const rounds = st.cleared || 0, score = st.stats.total;
      const better = rounds > rec.rounds || (rounds === rec.rounds && score > rec.score);
      if (rec.won && better) unlock('record_batido');
      p.records[key] = { plays: rec.plays + 1, won: rec.won || won, rounds: Math.max(rec.rounds, rounds), score: better ? score : rec.score, bestRounds: better ? rounds : rec.bestRounds ?? rec.rounds, seed: better ? st.seed : rec.seed, at: Date.now() };
    }
    p.run = null;
    return { perfil: p, nuevos };
  }
  return { perfil: p, nuevos };
}

export const progressOf = (p, id) => { const a = ACH[id]; if (!a?.max) return null; return { val: Math.min(a.max, p.progress[id] || 0), max: a.max }; };
export const unlockedRewards = (p) => ACHIEVEMENTS.filter((a) => a.reward && p.unlocked[a.id]).map((a) => a.reward);
