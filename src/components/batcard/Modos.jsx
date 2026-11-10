// Pantallas del ciclo roguelike de BATCARD: Jugar (mazo + dificultad + código), Desafíos, Logros, evento de taller y avisos.
import { useEffect, useState } from 'react';
import { DECKS, DECK_IDS, DIFFS, DIFF_IDS, CHALLENGES, CH, dailyChallenge, weeklySeed, dayKey, weekKey, encodeCode, decodeCode, cfgProblem, normalizeCfg } from '../../lib/batcard/modes.js';
import { ACHIEVEMENTS, REWARDS, progressOf, unlockedRewards } from '../../lib/batcard/achievements.js';
import { BOSS, EVENT } from '../../lib/batcard/catalog.js';
import { PATTERN } from '../../lib/batcard/hands.js';
import { sfx } from './sfx.js';

const fmt = (n) => Number(n || 0).toLocaleString('es-AR');

// ---------------------------------------------------------------- Jugar: mazo inicial + dificultad + código
export function Setup({ profile, canRank, onStart, back, starting }) {
  const [deck, setDeck] = useState(profile?.lastDeck && DECKS[profile.lastDeck] ? profile.lastDeck : 'fdm');
  const [diffs, setDiffs] = useState([]);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const standard = deck === 'fdm' && diffs.length === 0;
  const loadCode = () => {
    const d = decodeCode(code);
    if (!d) { setCodeErr('Ese código no es válido.'); return; }
    const prob = cfgProblem(normalizeCfg({ ...d.cfg, boss: profile?.lastDefeatBoss, prevDeck: profile?.lastDeck }));
    if (prob) { setCodeErr(prob); return; }
    onStart(d.cfg, { seed: d.seed, fromCode: true });
  };
  return (
    <section className="bc-panel bc-setup">
      <h2>Nueva partida</h2>
      <p className="muted">Elegí tu <b>taller</b> (mazo inicial). Cada uno habilita una estrategia distinta.</p>
      <div className="bc-decks">
        {DECK_IDS.map((id) => { const D = DECKS[id]; const won = profile?.decksWon?.includes(id); return (
          <button key={id} className={`bc-deck${deck === id ? ' sel' : ''}`} onClick={() => { setDeck(id); sfx.select(1); }} aria-pressed={deck === id}>
            <span className="bc-deck-ico">{D.icon}</span>
            <b>{D.name}</b>{won && <i className="bc-deck-won" title="Ganaste con este mazo">🏆</i>}
            <span className="pro">✚ {D.pro}</span>
            <span className="con">− {D.con}</span>
            <small>{D.plan}</small>
          </button>); })}
      </div>
      <h3>Dificultad <small className="muted">(opcional: ganar con 3 da un logro)</small></h3>
      <div className="bc-diffs">
        {DIFF_IDS.map((id) => (
          <label key={id} className={`bc-diff${diffs.includes(id) ? ' on' : ''}`}>
            <input type="checkbox" checked={diffs.includes(id)} onChange={(e) => setDiffs(e.target.checked ? [...diffs, id] : diffs.filter((x) => x !== id))} />
            <b>{DIFFS[id].name}</b><span>{DIFFS[id].desc}</span>
          </label>
        ))}
      </div>
      <p className="muted small">{standard
        ? (canRank ? '🏆 Partida estándar: entra al ranking.' : 'Partida estándar. Ingresá con Google para que entre al ranking.')
        : 'Con otro mazo o dificultad la partida no entra al ranking público: queda como récord personal.'}</p>
      <div className="bc-actions">
        <button className="bc-btn primary big" disabled={starting} onClick={() => onStart({ deck, diffs })}>{starting ? 'Preparando…' : 'Arrancar'}</button>
        <button className="bc-btn" onClick={back}>Volver</button>
      </div>
      <details className="bc-code">
        <summary>Tengo un código compartido</summary>
        <div className="bc-code-row">
          <input value={code} onChange={(e) => { setCode(e.target.value); setCodeErr(''); }} placeholder="BC-…" aria-label="Código de partida" />
          <button className="bc-btn small" onClick={loadCode}>Cargar</button>
        </div>
        {codeErr && <p className="bc-alert">{codeErr}</p>}
        <p className="muted small">Con el mismo código todos juegan exactamente la misma partida: mismo mazo, mismas reglas, mismas cartas.</p>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------- Desafíos
const CATS = [...new Set(CHALLENGES.map((c) => c.cat))];
export function Desafios({ profile, onStart, back }) {
  const today = dailyChallenge(), dk = dayKey(), wk = weekKey();
  const [pick, setPick] = useState(null); // desafío que pide elegir mazo
  const rec = (id) => profile?.records?.[id];
  const start = (ch, deck) => {
    const cfg = { ch: ch.id, deck: deck || ch.deck || 'fdm', diffs: [], boss: profile?.lastDefeatBoss, prevDeck: profile?.lastDeck };
    const prob = cfgProblem(normalizeCfg(cfg));
    if (prob) { alert(prob); return; }
    const seed = ch.daily ? (ch.id === today.ch ? today.seed : 'DIA' + dk + ch.n) : ch.weekly ? weeklySeed() + ch.n : undefined;
    onStart(cfg, seed ? { seed } : {});
  };
  const Row = ({ ch, tag }) => { const r = rec(ch.id); const needDeck = ch.decks || ch.revenge; return (
    <article className={`bc-ch${r?.won ? ' won' : ''}`}>
      <header>{tag && <span className="bc-ch-tag">{tag}</span>}<b>{ch.n}. {ch.name}</b>{r?.won && <i title="Ganado">✔</i>}</header>
      <dl>
        <dt>Mazo</dt><dd>{ch.decks ? ch.decks.map((d) => DECKS[d].name).join(' / ') : ch.deck ? DECKS[ch.deck].name : ch.revenge ? 'Distinto al de tu última partida' : ch.deckCards ? 'Especial (ver regla)' : 'Taller FDM'}</dd>
        <dt>Regla</dt><dd>{ch.rule}</dd>
        <dt>Objetivo</dt><dd>{ch.goal}</dd>
        <dt>Victoria</dt><dd>{ch.rounds === 0 ? 'Partida completa (4 Lotes)' : ch.rounds === Infinity ? 'No termina: contás rondas' : `${ch.rounds} rondas ganadas`}</dd>
      </dl>
      <footer>
        {r ? <span className="bc-ch-rec">Tu marca: <b>{r.rounds} ronda{r.rounds === 1 ? '' : 's'}</b> · {fmt(r.score)} Calidad · {r.plays} intento{r.plays === 1 ? '' : 's'}</span> : <span className="bc-ch-rec muted">Sin intentos</span>}
        {needDeck && pick === ch.id ? (
          <span className="bc-ch-decks">{(ch.decks || DECK_IDS.filter((d) => d !== profile?.lastDeck)).map((d) => <button key={d} className="bc-btn small" onClick={() => start(ch, d)}>{DECKS[d].icon} {DECKS[d].name}</button>)}</span>
        ) : <button className="bc-btn small primary" onClick={() => (needDeck ? setPick(ch.id) : start(ch))}>{r ? 'Reintentar' : 'Jugar'}</button>}
      </footer>
    </article>); };
  return (
    <section className="bc-panel bc-chs">
      <h2>Desafíos</h2>
      <p className="muted">Un diario corto, un semanal y un catálogo permanente. Cada reto cambia cómo jugás. Tu marca se guarda aunque el ranking público esté pendiente.</p>
      <h3>Hoy · {dk.slice(6)}/{dk.slice(4, 6)}</h3>
      <Row ch={CH[today.ch]} tag="DIARIO" />
      <h3>Esta semana · {wk}</h3>
      <div className="bc-ch-grid">{CHALLENGES.filter((c) => c.weekly).map((c) => <Row key={c.id} ch={c} tag="SEMANAL" />)}</div>
      {CATS.map((cat) => (
        <div key={cat}>
          <h3>{cat}</h3>
          <div className="bc-ch-grid">{CHALLENGES.filter((c) => c.cat === cat && !c.weekly).map((c) => <Row key={c.id} ch={c} />)}</div>
        </div>
      ))}
      <div className="bc-actions"><button className="bc-btn" onClick={back}>Volver</button></div>
    </section>
  );
}

// ---------------------------------------------------------------- Logros (álbum) + cosméticos
const ACATS = [...new Set(ACHIEVEMENTS.map((a) => a.cat))];
export function Logros({ profile, setCosmetic, back }) {
  const n = Object.keys(profile?.unlocked || {}).length;
  const rewards = unlockedRewards(profile || { unlocked: {} });
  const cos = profile?.cosmetics || {};
  return (
    <section className="bc-panel bc-album">
      <h2>Logros <small>{n} / {ACHIEVEMENTS.length}</small></h2>
      <div className="bc-album-bar"><i style={{ width: `${(n / ACHIEVEMENTS.length) * 100}%` }} /></div>
      {rewards.length > 0 && (
        <div className="bc-cosm">
          <b>Recompensas</b>
          <label>Título <select value={cos.titulo || ''} onChange={(e) => setCosmetic('titulo', e.target.value || null)}><option value="">Ninguno</option>{rewards.filter((r) => REWARDS[r].type === 'titulo').map((r) => <option key={r} value={r}>{REWARDS[r].name}</option>)}</select></label>
          <label>Marco de cartas <select value={cos.marco || ''} onChange={(e) => setCosmetic('marco', e.target.value || null)}><option value="">Normal</option>{rewards.filter((r) => REWARDS[r].type === 'marco').map((r) => <option key={r} value={r}>{REWARDS[r].name}</option>)}</select></label>
        </div>
      )}
      {ACATS.map((cat) => (
        <div key={cat}>
          <h3>{cat}</h3>
          <div className="bc-ach-grid">
            {ACHIEVEMENTS.filter((a) => a.cat === cat).map((a) => {
              const ok = !!profile?.unlocked?.[a.id], pr = progressOf(profile || { progress: {} }, a.id);
              const hidden = a.secret && !ok;
              return (
                <article key={a.id} className={`bc-ach${ok ? ' ok' : ''}${hidden ? ' secret' : ''}`}>
                  <span className="bc-ach-ico">{ok ? '🏅' : hidden ? '❓' : '🔒'}</span>
                  <b>{hidden ? 'Logro secreto' : a.title}</b>
                  <span>{hidden ? `Pista: ${a.hint}` : a.desc}</span>
                  {pr && !ok && <span className="bc-ach-prog"><i style={{ width: `${(pr.val / pr.max) * 100}%` }} /><small>{pr.val} / {pr.max}</small></span>}
                  {a.reward && <small className={`bc-ach-rew${ok ? '' : ' muted'}`}>{ok ? 'Desbloqueó' : 'Desbloquea'}: {REWARDS[a.reward].name}</small>}
                </article>
              );
            })}
          </div>
        </div>
      ))}
      <div className="bc-actions"><button className="bc-btn" onClick={back}>Volver</button></div>
    </section>
  );
}

// ---------------------------------------------------------------- Evento de taller (en Suministros)
export function EventPanel({ st, act }) {
  const e = EVENT[st.event.id];
  if (!e) return null;
  return (
    <div className="bc-event" role="dialog" aria-label={e.name}>
      <header><span>⚡ Evento de taller</span><b>{e.name}</b><p>{e.text}</p></header>
      <div className="bc-event-opts">
        {e.opts.map((o, i) => (
          <button key={i} className={`bc-event-opt${o.safe ? ' safe' : ' risky'}`} onClick={() => act({ type: 'EVENT', idx: i }, (res) => { const ev = res.events.find((x) => x.type === 'event'); if (ev) { if (i === 1 && !ev.win) sfx.lose(); else sfx.cash(4); } })}>
            <b>{o.label}</b><small>{o.safe ? 'Seguro' : 'Arriesgado'}</small><span>{o.desc}</span>
          </button>
        ))}
        <button className="bc-event-opt skip" onClick={() => act({ type: 'EVENT', idx: 2 })}><b>Seguir de largo</b><small>Sin cambios</small><span>No pasa nada.</span></button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Regla del jefe / del desafío (consultable durante la ronda)
export function RuleSheet({ st, onClose }) {
  const r = st.round, ch = st.cfg?.ch ? CH[st.cfg.ch] : null;
  const bosses = [r?.boss, r?.boss2].filter(Boolean);
  return (
    <div className="bc-rules" role="dialog" aria-label="Reglas de esta ronda" onClick={onClose}>
      <div className="bc-rules-in" onClick={(e) => e.stopPropagation()}>
        <h3>Reglas de esta ronda</h3>
        {bosses.length === 0 && !ch && <p className="muted">Ronda normal: sin jefe ni desafío.</p>}
        {bosses.map((b) => <p key={b} className="bc-rule boss"><b>⚠ {BOSS[b].name}</b><span>{BOSS[b].desc}</span></p>)}
        {ch && <p className="bc-rule ch"><b>🎯 {ch.name}</b><span>{ch.rule}</span><small>{ch.goal}{st.cleared != null && ch.rounds && ch.rounds !== Infinity ? ` · Llevás ${st.cleared} de ${ch.rounds}.` : ''}</small></p>}
        {r?.reqSuit && <p className="bc-rule ch"><b>Palo pedido ahora</b><span>Esta ronda solo suman las manos que puntúen al menos una carta de {({ S: 'Picas ♠', H: 'Corazones ♥', C: 'Tréboles ♣', D: 'Diamantes ♦' })[r.reqSuit]}.</span></p>}
        {r?.blocked && <p className="bc-rule ch"><b>Patrón bloqueado</b><span>{PATTERN[r.blocked].name} no se puede jugar en esta ronda.</span></p>}
        <button className="bc-btn small" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Avisos de logro (cola; raros con insignia)
export function AchToasts({ queue, pop }) {
  const cur = queue[0];
  useEffect(() => {
    if (!cur) return undefined;
    const a = ACHIEVEMENTS.find((x) => x.id === cur);
    if (a?.reward) sfx.unstick(); else sfx.coin();
    const h = setTimeout(pop, a?.reward ? 3400 : 2200);
    return () => clearTimeout(h);
  }, [cur, pop]);
  if (!cur) return null;
  const a = ACHIEVEMENTS.find((x) => x.id === cur);
  const rare = !!a.reward;
  return (
    <div className={`bc-toast${rare ? ' rare' : ''}`} role="status" key={cur}>
      <span className="bc-toast-ico">{rare ? '🏅' : '✔'}</span>
      <div><small>{rare ? 'Logro raro' : 'Logro'}{queue.length > 1 ? ` · +${queue.length - 1} más` : ''}</small><b>{a.title}</b><span>{a.desc}</span>{rare && <em>Recompensa: {REWARDS[a.reward].name}</em>}</div>
    </div>
  );
}
