import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { navigate } from '../lib/router.js';
import { GAME_URL, useLive, useMt } from '../lib/mtApi.js';
import { ChallengeCard, Emblem, LiveLine, RankRows, num } from '../components/Tycoon.jsx';
import { Options, SearchInput } from '../components/ui.jsx';
import { farmLevel } from '../data/rewards.js';
import tallerAnim from '../assets/tycoon-taller.webp';
import fcLogo from '../assets/filacolor-logo.png';

// =====================================================================
// #/juego — 3DBAT Maker Tycoon dentro de BATBOX: jugar, ranking, retos y granjas.
// El juego en sí está en /batbox/juego/ (misma web: comparte la sesión de Google).
// =====================================================================

const TABS = [['ranking', 'Ranking', 'trophy'], ['retos', 'Retos', 'star'], ['granjas', 'Granjas', 'users'], ['como', 'Cómo funciona', 'book']];

export default function Juego({ query }) {
  const live = useLive();
  const tab = TABS.some(([k]) => k === query.ver) ? query.ver : 'ranking';
  const setTab = (k) => navigate('/juego?ver=' + k);
  const ov = useMt('bb_mt_overview');
  return (
    <div className="mt-page">
      <section className="mt-hero">
        <div className="mt-hero-media"><img src={tallerAnim} alt="El taller de Maker Tycoon funcionando" /></div>
        <div className="mt-hero-txt">
          <div className="section-label">NOVEDAD GRATIS · JUEGO DE 3DBAT</div>
          <h1>3DBAT Maker Tycoon</h1>
          <p>Arrancá con una impresora en el escritorio y llegá a tu propia planta de producción. Armá tu taller, producí, creá tu granja con otros makers y competí en los retos de la comunidad.</p>
          <LiveLine live={live} />
          <div className="mt-home-cta">
            <a className="btn primary big" href={GAME_URL}><Icon name="gamepad" size={20} /> Jugar gratis</a>
            <button className="btn ghost" onClick={() => setTab('como')}><Icon name="book" size={16} /> Cómo funciona</button>
          </div>
          <p className="mt-note">Gratis y sin límites, con o sin cuenta. Con tu cuenta de Google (la misma de BATBOX) guardás la partida en la nube y entrás al ranking. {ov.data?.season && <>Temporada actual: <b>{ov.data.season.name}</b>.</>}</p>
        </div>
      </section>

      <div className="view-toggle mt-tabs" role="tablist">
        {TABS.map(([k, l, ic]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={'seg' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}><Icon name={ic} size={15} /> {l}</button>
        ))}
      </div>
      {ov.missing && tab !== 'como' ? (
        <div className="card mt-soon"><Icon name="clock" size={22} /><p><b>El juego online arranca muy pronto.</b> Ya podés jugar: tu partida se guarda en tu navegador. En unos días se suman el ranking, las granjas y los retos.</p></div>
      ) : (
        <>
          {tab === 'ranking' && <Ranking />}
          {tab === 'retos' && <Retos />}
          {tab === 'granjas' && <Granjas />}
        </>
      )}
      {tab === 'como' && <Como />}

      <a className="mt-fc-strip" href="#/filacolor">
        <img src={fcLogo} alt="Filacolor" />
        <span><b>Abastecimiento oficial · FILACOLOR</b><small>El proveedor oficial de la Comunidad Makers 3DBAT: filamentos, impresoras, repuestos y servicio técnico.</small></span>
        <Icon name="arrowRight" size={18} />
      </a>
    </div>
  );
}

const RANKS = [['global', 'Temporada'], ['semanal', 'Semanal'], ['granjas', 'Granjas'], ['comunidad', 'Comunidad'], ['fama', 'Hall de la Fama']];
const RANK_TXT = {
  global: 'Puntos Maker de la temporada: pedidos cumplidos, calidad, máquinas nuevas, fallas resueltas, retos y logros.',
  semanal: 'Producción y retos de esta semana. Se reinicia cada lunes.',
  granjas: 'Lo que suman todos los integrantes de cada granja durante la temporada.',
  comunidad: 'Aportes a los retos de comunidad, donde todos empujan hacia la misma meta.',
  fama: 'Los mejores de cada temporada terminada.',
};
function Ranking() {
  const [kind, setKind] = useState('global');
  const r = useMt(kind === 'fama' ? 'bb_mt_hall_list' : 'bb_mt_ranking', kind === 'fama' ? undefined : { p_kind: kind, p_limit: 100 }, [kind]);
  return (
    <section className="card mt-panel">
      <Options value={kind} onChange={setKind} options={RANKS.map(([value, label]) => ({ value, label }))} />
      <p className="mt-help">{RANK_TXT[kind]}</p>
      {r.loading && <div className="empty"><div className="spinner" /></div>}
      {r.error && !r.missing && <p className="mt-err">{r.error}</p>}
      {!r.loading && r.data && kind === 'fama' && (r.data.length === 0 ? <p className="mt-empty">Todavía no terminó ninguna temporada.</p> : r.data.map((h) => (
        <div key={h.season_id} className="mt-hall">
          <h3>{h.season}</h3>
          <RankRows rows={(h.global || []).map((x) => ({ ...x, title: null }))} />
          {h.granjas?.length > 0 && <><div className="section-label">GRANJAS</div><RankRows rows={h.granjas.map((g) => ({ ...g, emblem: 'nozzle', color: '#5DDADB' }))} farms /></>}
        </div>
      )))}
      {!r.loading && r.data && kind !== 'fama' && (
        <>
          <RankRows rows={r.data.rows} farms={kind === 'granjas'} />
          {r.data.me && !r.data.rows.some((x) => x.me) && <div className="mt-rank-row me pinned"><span className="rk">#{r.data.me.rank}</span><span className="rn">Vos</span><b>{num(r.data.me.points)}</b></div>}
          <p className="mt-help">Con nombre aparecen solo los que eligieron perfil público. Para entrar: abrí el juego e ingresá con Google.</p>
        </>
      )}
    </section>
  );
}

function Retos() {
  const r = useMt('bb_mt_challenges_active');
  return (
    <section className="mt-panel-list">
      {r.loading && <div className="empty"><div className="spinner" /></div>}
      {r.data?.length === 0 && <p className="mt-empty card">No hay retos activos en este momento.</p>}
      <div className="mt-ch-grid">{(r.data || []).map((c) => <ChallengeCard key={c.id} c={c} />)}</div>
      <p className="mt-help">Los retos se juegan dentro del juego con tu partida en la nube, y el servidor los va contando solo. Los de comunidad se cumplen entre todos.</p>
    </section>
  );
}

function Granjas() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const r = useMt('bb_mt_farm_list', { p_search: term || null, p_limit: 60 }, [term]);
  return (
    <section className="card mt-panel">
      <p className="mt-help">Una Granja Maker es un equipo de hasta 6 makers. Cada uno juega en su propio taller y todo lo que suma va también a la granja: contratos cooperativos, nivel de la nave de producción y ranking de granjas. Para crear una o unirte, entrá al juego → Online → Granja.</p>
      <div className="mt-search"><SearchInput value={q} onChange={setQ} placeholder="Buscar granja" /></div>
      {r.loading && <div className="empty"><div className="spinner" /></div>}
      {r.data?.length === 0 && <p className="mt-empty">No hay granjas{term ? ' con ese nombre' : ' todavía'}.</p>}
      <div className="mt-farms">
        {(r.data || []).map((f) => (
          <div key={f.id} className="mt-farm">
            <Emblem emblem={f.emblem} color={f.color} size={44} />
            <span className="mt-farm-txt"><b>{f.name}</b><small>Nivel {farmLevel(f.xp).level} · {f.members}/6 makers · {num(f.points)} pts{f.playing > 0 ? ` · ${f.playing} jugando` : ''} · {f.open ? 'abierta' : 'con código'}</small>{f.description && <small className="muted">{f.description}</small>}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Como() {
  return (
    <section className="mt-como">
      <div className="card">
        <h3>🎮 Gratis y sin límites</h3>
        <p>Se juega desde el navegador, en la compu o el celular. Sin cuenta podés jugar todo lo que quieras: la partida se guarda en ese navegador.</p>
      </div>
      <div className="card">
        <h3>☁️ Con tu cuenta de Google</h3>
        <p>La misma de BATBOX y del Cotizador (no hace falta ser del Makers Club). Tu partida queda en la nube para seguir desde cualquier dispositivo, y entrás al ranking, las granjas y los retos. Si ya tenías una partida, nunca se pisa: si hay dos distintas, elegís cuál usar y la otra queda guardada.</p>
      </div>
      <div className="card">
        <h3>🏆 Puntos Maker</h3>
        <p>Suman los pedidos cumplidos (y su calidad), las piezas, las fallas resueltas, los desafíos diarios y semanales, las máquinas nuevas, los logros y los retos. Cada cosa tiene un tope por día: gana el que juega bien y seguido, no el que deja la compu prendida más horas.</p>
      </div>
      <div className="card">
        <h3>🛡️ Juego limpio</h3>
        <p>Los puntos los calcula el servidor a partir de la partida guardada, con límites de ritmo: editar la partida no da más puntos que los de un jugador muy activo. Las cuentas que hagan trampa se bloquean del ranking (pueden seguir jugando).</p>
      </div>
      <div className="card">
        <h3>👑 Sin pagar para ganar</h3>
        <p>Nadie compra ventajas. Los premios de los retos son estéticos: títulos, marcos, decoración del taller, bases para las máquinas, efectos y banners de granja.</p>
      </div>
      <div className="card">
        <h3>🔒 Tu privacidad</h3>
        <p>Elegís cómo aparecés: público, solo para tu granja u oculto («Maker anónimo»). El contador de «en línea» muestra solo números, nunca quién es cada uno.</p>
      </div>
    </section>
  );
}
