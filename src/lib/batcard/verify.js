// Rejuega una partida desde la semilla y el log de acciones. Lo usa el servidor
// (función batcard-submit) para calcular el resultado sin confiar en el cliente.
import { newGame, step, expand, SUPPORTED_RULES } from './game.js';
import { RNG_VERSION } from './rng.js';

export const MAX_LOG = 3000;

export function replayRun(seed, log, v = 1) {
  if (!SUPPORTED_RULES.includes(v)) return { ok: false, error: 'Versión de reglas desconocida.' };
  if (typeof seed !== 'string' || !/^[A-Za-z0-9]{3,40}$/.test(seed)) return { ok: false, error: 'Semilla inválida.' };
  if (!Array.isArray(log) || log.length < 2 || log.length > MAX_LOG) return { ok: false, error: 'Partida inválida.' };
  let st = newGame(seed, v);
  for (let i = 0; i < log.length; i++) {
    if (st.phase === 'victory' || st.phase === 'defeat') return { ok: false, error: `Hay jugadas después del final (paso ${i}).` };
    const r = step(st, expand(log[i] || {}));
    if (r.error) return { ok: false, error: `Jugada inválida en el paso ${i}: ${r.error}` };
    st = r.state;
  }
  if (st.phase !== 'victory' && st.phase !== 'defeat') return { ok: false, error: 'La partida no terminó.' };
  return {
    ok: true,
    result: {
      rules_version: v, rng_version: RNG_VERSION, won: st.phase === 'victory',
      lot: st.lot + 1, blind: st.blind, total: st.stats.total, best_hand: st.stats.bestHand, prints: st.stats.prints,
    },
  };
}
