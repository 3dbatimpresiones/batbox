import { useState } from 'react';
import Icon from './Icon.jsx';
import { EMBLEMS, REWARDS, metricLabel, rewardName, titleName, frameClass } from '../data/rewards.js';
import { GAME_URL, useLive, useMt } from '../lib/mtApi.js';
import tallerAnim from '../assets/tycoon-taller.webp';
import fcIcon from '../assets/filacolor-icon.png';

// =====================================================================
// Piezas de 3DBAT Maker Tycoon para BATBOX (Inicio, página del juego, panel).
// =====================================================================

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
export const num = (n) => nf.format(Math.floor(Number(n) || 0));
export function money(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return 'AR$ ' + (v / 1e9).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' mil M';
  if (v >= 1e6) return 'AR$ ' + (v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' M';
  return 'AR$ ' + num(v);
}

export function Avatar({ name, frame, size = 36, src }) {
  const ch = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const img = src && /^data:image\//.test(src) ? src : null;
  return (
    <span className={'mt-av ' + frameClass(frame) + (img ? ' has-img' : '')} style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {img ? <img src={img} alt="" /> : ch}
    </span>
  );
}
export function Emblem({ emblem = 'nozzle', color = '#5DDADB', size = 36 }) {
  const E = EMBLEMS[emblem] || EMBLEMS.nozzle;
  return (
    <span className="mt-emblem" style={{ width: size, height: size, background: color + '26', borderColor: color + '88', color }} aria-hidden="true">
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={E.path} /></svg>
    </span>
  );
}

export function LiveLine({ live, compact }) {
  if (!live) return null;
  return (
    <p className={'mt-live' + (compact ? ' compact' : '')}>
      <i className="mt-dot" /> <b>{num(live.online)}</b> {live.online === 1 ? 'maker' : 'makers'} en BATBOX
      <span>· 🎮 <b>{num(live.playing)}</b> jugando ahora</span>
      {!compact && <span>· 🏭 <b>{num(live.farms)}</b> {live.farms === 1 ? 'granja activa' : 'granjas activas'}</span>}
    </p>
  );
}

// Indicador chico y permanente del encabezado.
export function LiveChip() {
  const live = useLive();
  if (!live) return null;
  return (
    <a className="mt-live-chip" href="#/juego" title={`${num(live.online)} en BATBOX · ${num(live.playing)} jugando Maker Tycoon · ${num(live.farms)} granjas activas`}>
      <i className="mt-dot" /><b>{num(live.online)}</b><span> online</span>
    </a>
  );
}

const KIND_LABEL = { diario: 'Diario', semanal: 'Semanal', tecnico: 'Técnico', comunidad: 'Comunidad', granja: 'Granja', evento: 'Evento' };
const fmtProg = (metric, v) => (metric === 'earned' ? money(v) : num(v));
function timeLeft(c) {
  if (c.ends_at) return 'Hasta el ' + new Date(c.ends_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  if (c.recur === 'day') return 'Se renueva todos los días';
  if (c.recur === 'week') return 'Se renueva cada lunes';
  return 'Toda la temporada';
}
export function ChallengeCard({ c, compact }) {
  const isCom = c.scope === 'comunidad';
  const prog = Number(isCom ? c.community || 0 : c.mine?.progress || 0);
  const done = isCom ? c.community_done : c.mine?.completed;
  const frac = Math.min(1, prog / Number(c.target));
  return (
    <div className={'mt-ch' + (done ? ' done' : '') + (c.featured ? ' featured' : '') + (compact ? ' compact' : '')}>
      <div className="mt-ch-head">
        <span className={'mt-kind k-' + c.kind}>{KIND_LABEL[c.kind] || c.kind}</span>
        <b>{c.title}</b>
        {done && <span className="mt-ok">✔ Cumplido</span>}
      </div>
      {!compact && c.description && <p className="mt-ch-desc">{c.description}</p>}
      <div className="mt-bar"><i style={{ width: `${frac * 100}%` }} /></div>
      <div className="mt-ch-meta">
        <span>{isCom || c.mine ? `${fmtProg(c.metric, prog)} / ` : 'Meta: '}{fmtProg(c.metric, c.target)} {c.metric !== 'earned' && metricLabel(c.metric)}</span>
        <span>{timeLeft(c)}</span>
      </div>
      <div className="mt-ch-reward">
        Premio: {c.reward_points > 0 && <b>{num(c.reward_points)} pts</b>}{c.reward_points > 0 && c.reward_id && ' + '}{c.reward_id && <b>{rewardName(c.reward_id)}</b>}
        {isCom && <span> · {num(c.participants)} makers aportando</span>}
      </div>
    </div>
  );
}

const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`);
export function RankRows({ rows, farms, empty = 'Todavía no hay nadie en este ranking.' }) {
  if (!rows?.length) return <p className="mt-empty">{empty}</p>;
  return (
    <div className="mt-rank">
      {rows.map((r) => (farms ? (
        <div key={r.id || r.rank} className={'mt-rank-row' + (r.me ? ' me' : '')}>
          <span className="rk">{medal(r.rank)}</span><Emblem emblem={r.emblem} color={r.color} size={30} />
          <span className="rn">{r.name}<small>{r.members != null ? `${r.members}/6 makers` : ''}</small></span><b>{num(r.points)}</b>
        </div>
      ) : (
        <div key={r.rank + r.name} className={'mt-rank-row' + (r.me ? ' me' : '')}>
          <span className="rk">{medal(r.rank)}</span><Avatar name={r.name} frame={r.frame} src={r.avatar} size={30} />
          <span className="rn">{r.name}{titleName(r.title) && <em>{titleName(r.title)}</em>}
            {r.farm && <small><Emblem emblem={r.farm.emblem} color={r.farm.color} size={14} /> {r.farm.name}</small>}</span>
          <b>{num(r.points)}</b>
        </div>
      )))}
    </div>
  );
}

// ---------- Bloque destacado del Inicio ----------
export function TycoonHomeBlock() {
  const live = useLive();
  const ov = useMt('bb_mt_overview');
  const o = ov.data;
  const featured = o?.challenges?.find((c) => c.featured) || o?.challenges?.find((c) => c.scope === 'comunidad') || o?.challenges?.[0];
  const [imgOk, setImgOk] = useState(true);
  return (
    <section className="mt-home">
      <div className="mt-home-media">
        {imgOk ? <img src={tallerAnim} alt="El taller de Maker Tycoon funcionando: impresoras 3D trabajando" onError={() => setImgOk(false)} /> : <div className="mt-home-ph"><Icon name="gamepad" size={48} /></div>}
        <span className="mt-new">NOVEDAD GRATIS</span>
      </div>
      <div className="mt-home-txt">
        <div className="section-label">NOVEDAD GRATIS · JUEGO DE 3DBAT</div>
        <h2>3DBAT Maker Tycoon</h2>
        <p>Armá tu taller, producí, creá tu granja con otros makers y competí en los retos de la comunidad.</p>
        <LiveLine live={live} />
        <div className="mt-home-cta">
          <a className="btn primary" href={GAME_URL}><Icon name="gamepad" size={18} /> Jugar gratis</a>
          <a className="btn ghost" href="#/juego?ver=ranking"><Icon name="trophy" size={16} /> Ver ranking</a>
        </div>
        {featured && (
          <div className="mt-home-ch">
            <div className="section-label">RETO ACTIVO</div>
            <ChallengeCard c={featured} compact />
          </div>
        )}
      </div>
      {o && (o.top_players?.length > 0 || o.top_farms?.length > 0) && (
        <div className="mt-home-tops">
          <div>
            <div className="section-label">TOP MAKERS · {o.season?.name}</div>
            <RankRows rows={o.top_players} empty="Todavía nadie: ¡podés ser el primero!" />
          </div>
          <div>
            <div className="section-label">TOP GRANJAS</div>
            <RankRows rows={o.top_farms} farms empty="Todavía no hay granjas: armá la primera." />
          </div>
        </div>
      )}
      <a className="mt-home-fc" href="#/filacolor">
        <img src={fcIcon} alt="" width="28" height="28" />
        <span><b>Abastecimiento oficial · FILACOLOR</b><small>Filamentos, impresoras, repuestos y servicio técnico para tu taller real</small></span>
        <Icon name="arrowRight" size={16} />
      </a>
    </section>
  );
}

export { REWARDS };
