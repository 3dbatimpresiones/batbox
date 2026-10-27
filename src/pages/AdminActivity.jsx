import { useCallback, useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';
import { Empty, SearchInput } from '../components/ui.jsx';

// =====================================================================
// ACTIVIDAD (pestaña del panel admin)
// * En vivo (migración 004 + 033): minutos de uso del Cotizador PRO, de BATBOX
//   y del juego Maker Tycoon + quién está en línea. bb_admin_activity() verifica is_admin().
//   "En línea" = usó BATBOX o el cotizador en los últimos 2 minutos, o tiene el juego abierto.
//   Del juego se distingue "Jugando" (ventana a la vista y en uso) de "Juego abierto" (de fondo).
// * Historial (migración 005): estimación desde que existe el Supabase con
//   las renovaciones de sesión. bb_admin_history() (solo admins).
// =====================================================================

const PERIODS = [{ days: 1, label: 'Hoy' }, { days: 7, label: '7 días' }, { days: 30, label: '30 días' }, { days: 0, label: 'Siempre' }];
const SORTS = [
  { key: 'minutes_total', label: 'Uso total' },
  { key: 'minutes_cotizador', label: 'Cotizador' },
  { key: 'minutes_batbox', label: 'BATBOX' },
  { key: 'minutes_juego', label: 'Juego' },
];
const SORT_NOTE = { minutes_total: 'de uso en total', minutes_cotizador: 'en el Cotizador', minutes_batbox: 'en BATBOX', minutes_juego: 'jugando Maker Tycoon' };
const APPS = [['minutes_cotizador', 'b-cot', 'Cotizador'], ['minutes_batbox', 'b-bb', 'BATBOX'], ['minutes_juego', 'b-game', 'Juego']];
const SECTION = {
  inicio: 'Inicio', tools: 'Herramientas', academy: 'Tutoriales', wiki: 'WikiBAT', media: 'Multimedia', library: 'Recursos', produccion: 'Planificador de producción',
  community: 'Comunidad', club: 'Makers Club', acceso: 'Mi cuenta', admin: 'Panel admin', buscar: 'Búsqueda', ver: 'viendo un contenido',
};
const REFRESH = 30 * 1000;

const fullName = (r) => [r.first_name, r.last_name].filter(Boolean).join(' ') || r.nick || r.email?.split('@')[0] || 'Miembro';
export function fmtMinutes(m) {
  if (!m) return '0 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}
function fmtAgo(s) {
  if (s == null) return 'Sin registro';
  if (s < 3600) return `Hace ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `Hace ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'Ayer' : `Hace ${d} días`;
}
const webWhere = (r) => (r.last_app === 'cotizador' ? 'en el Cotizador PRO' : `en BATBOX${SECTION[r.last_section] ? ' · ' + SECTION[r.last_section] : ''}`);
// Dónde está: en la página (BATBOX/Cotizador) y/o en el juego. Sin la migración 033 no hay datos del juego.
function where(r) {
  const web = r.web_online ?? (r.online && r.last_app !== 'juego');
  const parts = [];
  if (r.game_state === 'jugando') parts.push('🎮 Jugando Maker Tycoon (ventana del juego a la vista)');
  else if (r.game_state === 'abierto') parts.push('Juego abierto de fondo (no lo está mirando)');
  if (web) parts.push(webWhere(r));
  return parts.join(' · también ') || webWhere(r);
}
// Etiqueta corta del estado en línea
function LiveChip({ r }) {
  const web = r.web_online ?? (r.online && r.last_app !== 'juego');
  if (r.game_state === 'jugando') return <span className="chip ok game"><span className="live-dot sm" />🎮 Jugando</span>;
  if (r.game_state === 'abierto' && !web) return <span className="chip warn"><span className="live-dot sm" />Juego de fondo</span>;
  return <span className="chip ok"><span className="live-dot sm" />En la página</span>;
}

// Solo `npm run dev` con ?simdb: datos ficticios para ver la pantalla.
const SIM = import.meta.env.DEV && new URLSearchParams(window.location.search).has('simdb');
const SIM_ROWS = [
  { user_id: 'a', email: 'maker.uno@ejemplo.com', first_name: 'Maker', last_name: 'Uno', role: 'user', minutes_batbox: 95, minutes_cotizador: 742, sessions: 31, days_active: 18, last_app: 'cotizador', seconds_ago: 25, online: true },
  { user_id: 'b', email: 'dueno@ejemplo.com', first_name: '3DBAT', last_name: 'Admin', role: 'admin', minutes_batbox: 410, minutes_cotizador: 220, sessions: 40, days_active: 21, last_app: 'batbox', last_section: 'admin', seconds_ago: 5, online: true },
  { user_id: 'c', email: 'maker.dos@ejemplo.com', first_name: 'Maker', last_name: 'Dos', role: 'user', minutes_batbox: 160, minutes_cotizador: 205, sessions: 12, days_active: 9, last_app: 'batbox', last_section: 'academy', seconds_ago: 50, online: true },
  { user_id: 'd', email: 'maker.tres@ejemplo.com', first_name: 'Maker', last_name: 'Tres', role: 'user', minutes_batbox: 12, minutes_cotizador: 188, sessions: 6, days_active: 5, last_app: 'cotizador', seconds_ago: 7400, online: false },
  { user_id: 'e', email: 'maker.cuatro@ejemplo.com', first_name: null, last_name: null, role: 'user', minutes_batbox: 48, minutes_cotizador: 0, sessions: 3, days_active: 2, last_app: 'batbox', last_section: 'media', seconds_ago: 190000, online: false },
].map((r, i) => ({ ...r, minutes_juego: [55, 30, 0, 0, 12][i], game_state: ['jugando', null, 'abierto', null, null][i], web_online: r.online && i !== 0 }))
  .map((r) => ({ ...r, minutes_total: r.minutes_batbox + r.minutes_cotizador + r.minutes_juego, online: r.online || !!r.game_state }));

function LiveView() {
  const [days, setDays] = useState(30);
  const [sort, setSort] = useState('minutes_total');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async (quiet = false) => {
    if (SIM) { setRows(SIM_ROWS); setLoading(false); setUpdatedAt(new Date()); return; }
    if (!quiet) setLoading(true);
    const { data, error: e } = await sb.rpc('bb_admin_activity', { p_days: days });
    if (e) setError(e); else { setRows(data || []); setError(null); setUpdatedAt(new Date()); }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
    // Se actualiza sola mientras la pestaña está visible.
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, REFRESH);
    return () => clearInterval(t);
  }, [load]);

  const ranking = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => r[sort] > 0 || r.online)
      .sort((a, b) => b[sort] - a[sort] || (b.online - a.online))
      .map((r, i) => ({ ...r, pos: r[sort] > 0 ? i + 1 : null }))
      .filter((r) => !needle || [r.email, r.first_name, r.last_name].some((v) => v?.toLowerCase().includes(needle)));
  }, [rows, sort, q]);

  if (error) {
    const missing = /bb_admin_activity|function|42883|PGRST202/i.test((error.message || '') + error.code);
    return <Empty icon="alert" title={missing ? 'Falta correr la migración 004' : 'No se pudo cargar la actividad'}
      text={missing ? 'Corré supabase/004_batbox_actividad.sql en el SQL Editor para activar el ranking y el estado en línea.' : error.message} />;
  }

  const online = rows.filter((r) => r.online);
  const playing = online.filter((r) => r.game_state === 'jugando').length;
  const hasGame = rows.some((r) => 'minutes_juego' in r);
  const sum = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
  const max = Math.max(1, ...ranking.map((r) => r[sort]));
  const periodLabel = PERIODS.find((p) => p.days === days)?.label.toLowerCase();

  return (
    <div className="activity">
      <div className="member-stats act-stats">
        <div className="mstat t-ok"><b>{online.length}</b><span>En línea ahora{hasGame ? ` · ${playing} jugando` : ''}</span></div>
        <div className="mstat"><b className="c-cyan">{rows.filter((r) => r.minutes_total > 0).length}</b><span>Activos · {periodLabel}</span></div>
        <div className="mstat"><b>{fmtMinutes(sum('minutes_cotizador'))}</b><span>En el Cotizador</span></div>
        <div className="mstat"><b>{fmtMinutes(sum('minutes_batbox'))}</b><span>En BATBOX</span></div>
        {hasGame && <div className="mstat"><b className="c-game">{fmtMinutes(sum('minutes_juego'))}</b><span>Jugando Maker Tycoon</span></div>}
      </div>
      {!hasGame && !loading && <p className="ed-hint warn-box">Para ver también al juego (minutos jugados y quién está jugando de verdad) corré <b>supabase/033_batbox_actividad_juego.sql</b> en Supabase.</p>}

      <section className="card online-box">
        <div className="online-head">
          <span className="live-dot" /> <b>En línea ahora</b>
          <small>{updatedAt ? `Actualizado ${updatedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · se actualiza solo` : ''}</small>
          <button className="mini-btn" title="Actualizar" onClick={() => load()}><Icon name="refresh" size={14} /></button>
        </div>
        {loading ? <div className="spinner xs" /> : !online.length
          ? <p className="ed-hint">Nadie está usando BATBOX, el cotizador ni el juego en este momento.</p>
          : (
            <ul className="online-list">
              {online.map((r) => (
                <li key={r.user_id}>
                  <span className="avatar">{fullName(r).charAt(0).toUpperCase()}<span className="status-dot s-member" /></span>
                  <div><b>{fullName(r)} <LiveChip r={r} /></b><small>{where(r)}</small></div>
                </li>
              ))}
            </ul>
          )}
      </section>

      <div className="filters card">
        <div className="filter-row">
          <div className="view-toggle">
            {PERIODS.map((p) => <button key={p.days} className={'seg' + (days === p.days ? ' active' : '')} onClick={() => setDays(p.days)}>{p.label}</button>)}
          </div>
          <div className="view-toggle">
            {SORTS.map((s) => <button key={s.key} className={'seg' + (sort === s.key ? ' active' : '')} onClick={() => setSort(s.key)}>{s.label}</button>)}
          </div>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar miembro…" />
        <p className="ed-hint">
          Se cuentan los minutos de <b>uso activo</b>: la página abierta, a la vista y en uso. BATBOX y el Cotizador cuentan a los miembros aprobados;
          el juego, a todos los que juegan con su cuenta de Google, y solo mientras la ventana del juego está a la vista («Jugando»).
          «Juego de fondo» = lo tiene abierto en otra pestaña o ventana: el taller sigue andando pero no lo está mirando.
          No se guarda qué cotizan ni qué miran. Esta pantalla la ven solo los administradores.
        </p>
      </div>

      {loading ? <div className="empty"><div className="spinner" /></div>
        : !ranking.length ? <Empty icon="clock" title="Todavía no hay actividad" text={q ? 'Probá con otra búsqueda.' : 'Cuando los miembros usen BATBOX o el cotizador, el ranking va a aparecer acá.'} />
        : (
          <ol className="rank-list">
            {ranking.map((r) => (
              <li key={r.user_id} className={'rank-row' + (r.pos && r.pos <= 3 ? ` top top-${r.pos}` : '')}>
                <span className="rank-pos">{r.pos ? (r.pos <= 3 ? <Icon name="trophy" size={18} /> : r.pos) : '—'}</span>
                <span className="avatar">{fullName(r).charAt(0).toUpperCase()}{r.online && <span className="status-dot s-member" />}</span>
                <div className="rank-main">
                  <strong>
                    {fullName(r)}
                    {r.role === 'admin' && <span className="chip club">Admin</span>}{r.role === 'editor' && <span className="chip cat">Editor</span>}
                    {r.member === false && <span className="chip muted" title="Juega con su cuenta de Google pero no es miembro de BATBOX">Solo juego</span>}
                  </strong>
                  <small>{r.email}</small>
                  <div className="rank-bar" title={APPS.map(([k, , l]) => `${l} ${fmtMinutes(r[k] || 0)}`).join(' · ')}>
                    {APPS.filter(([k]) => sort === 'minutes_total' || sort === k).map(([k, c]) => <span key={k} className={c} style={{ width: `${((r[k] || 0) / max) * 100}%` }} />)}
                  </div>
                  <div className="rank-legend">
                    {APPS.filter(([k]) => k !== 'minutes_juego' || hasGame).map(([k, c, l]) => <span key={k}><i className={c} />{l} {fmtMinutes(r[k] || 0)}</span>)}
                    <span>{r.days_active} {r.days_active === 1 ? 'día' : 'días'} · {r.sessions} {r.sessions === 1 ? 'sesión' : 'sesiones'}</span>
                  </div>
                </div>
                <div className="rank-side">
                  <div className="metric main"><b>{fmtMinutes(r[sort])}</b><small>{SORT_NOTE[sort]} · {periodLabel}</small></div>
                  {r.online
                    ? <LiveChip r={r} />
                    : <span className="chip muted">Última vez {fmtAgo(r.seconds_ago).toLowerCase()}</span>}
                  {r.online && <small>{where(r)}</small>}
                </div>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}

export default function AdminActivity() {
  const [mode, setMode] = useState('live');
  return (
    <div>
      <div className="view-toggle act-mode">
        <button className={'seg' + (mode === 'live' ? ' active' : '')} onClick={() => setMode('live')}><span className="live-dot sm" /> En vivo</button>
        <button className={'seg' + (mode === 'history' ? ' active' : '')} onClick={() => setMode('history')}><Icon name="clock" size={14} /> Historial</button>
      </div>
      {mode === 'live' ? <LiveView /> : <HistoryView />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Historial desde el 17/06/2026 (creación del Supabase)
// ---------------------------------------------------------------------
const STATUS_CHIP = { pending: ['warn', 'Pendiente'], suspended: ['orange', 'Suspendido'], rejected: ['err', 'Rechazado'], expired: ['muted', 'Vencido'] };
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const agoSeconds = (d) => (d ? Math.max(0, (Date.now() - new Date(d).getTime()) / 1000) : null);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const SIM_HISTORY = [
  { user_id: 'a', email: 'maker.uno@ejemplo.com', first_name: 'Maker', last_name: 'Uno', role: 'user', status: 'approved', first_seen: '2026-06-18', last_seen: new Date().toISOString(), days_active: 41, hours_active: 96 },
  { user_id: 'b', email: 'dueno@ejemplo.com', first_name: '3DBAT', last_name: 'Admin', role: 'admin', status: 'approved', first_seen: '2026-06-17', last_seen: new Date().toISOString(), days_active: 55, hours_active: 88 },
  { user_id: 'd', email: 'maker.tres@ejemplo.com', first_name: 'Maker', last_name: 'Tres', role: 'user', status: 'suspended', first_seen: '2026-07-04', last_seen: '2026-09-30', days_active: 12, hours_active: 19 },
  { user_id: 'f', email: 'maker.cinco@ejemplo.com', first_name: 'Maker', last_name: 'Cinco', role: 'user', status: 'approved', first_seen: '2026-08-11', last_seen: '2026-08-11', days_active: 0, hours_active: 0 },
];

function HistoryView() {
  const [rows, setRows] = useState([]);
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [sort, setSort] = useState('hours_active');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (SIM) { setRows(SIM_HISTORY); setOnlineIds(new Set(['a', 'b'])); setLoading(false); return; }
      const [h, live] = await Promise.all([sb.rpc('bb_admin_history'), sb.rpc('bb_admin_activity', { p_days: 1 })]);
      if (!alive) return;
      if (h.error) setError(h.error); else setRows(h.data || []);
      if (!live.error) setOnlineIds(new Set((live.data || []).filter((r) => r.online).map((r) => r.user_id)));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const ranking = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const other = sort === 'hours_active' ? 'days_active' : 'hours_active';
    return [...rows]
      .sort((a, b) => b[sort] - a[sort] || b[other] - a[other])
      .map((r, i) => ({ ...r, pos: r[sort] > 0 ? i + 1 : null }))
      .filter((r) => !needle || [r.email, r.first_name, r.last_name].some((v) => v?.toLowerCase().includes(needle)));
  }, [rows, sort, q]);

  if (error) {
    const missing = /bb_admin_history|function|42883|PGRST202/i.test((error.message || '') + error.code);
    return <Empty icon="alert" title={missing ? 'Falta correr la migración 005' : 'No se pudo cargar el historial'}
      text={missing ? 'Corré supabase/005_batbox_historial.sql en el SQL Editor para ver el historial desde junio.' : error.message} />;
  }

  const used = rows.filter((r) => r.hours_active > 0);
  const totalHours = rows.reduce((t, r) => t + r.hours_active, 0);
  const max = Math.max(1, ...ranking.map((r) => r[sort]));
  const byHours = sort === 'hours_active';

  return (
    <div className="activity">
      <div className="member-stats act-stats">
        <div className="mstat"><b className="c-cyan">{used.length}</b><span>Usaron el cotizador</span></div>
        <div className="mstat"><b>{rows.length - used.length}</b><span>Sin uso registrado</span></div>
        <div className="mstat"><b>~{totalHours} h</b><span>Con la app abierta</span></div>
        <div className="mstat"><b>17/06/2026</b><span>Datos desde</span></div>
      </div>

      <div className="filters card">
        <div className="filter-row">
          <div className="view-toggle">
            <button className={'seg' + (byHours ? ' active' : '')} onClick={() => setSort('hours_active')}>Más horas</button>
            <button className={'seg' + (!byHours ? ' active' : '')} onClick={() => setSort('days_active')}>Más días</button>
          </div>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar miembro…" />
        <p className="ed-hint">
          <b>Estimación</b> desde que se creó el Supabase, con las renovaciones de sesión que se guardan mientras alguien tiene la app abierta
          (más o menos una por hora). Hasta el 21/10/2026 todo es uso del <b>Cotizador PRO</b>. Si alguien cerró sesión, esa parte no quedó guardada.
          Para el tiempo exacto, mirá <b>En vivo</b>.
        </p>
      </div>

      {loading ? <div className="empty"><div className="spinner" /></div>
        : !ranking.length ? <Empty icon="clock" title="Sin resultados" text="Probá con otra búsqueda." />
        : (
          <ol className="rank-list">
            {ranking.map((r) => {
              const chip = STATUS_CHIP[r.status];
              const on = onlineIds.has(r.user_id);
              return (
                <li key={r.user_id} className={'rank-row' + (r.pos && r.pos <= 3 ? ` top top-${r.pos}` : '')}>
                  <span className="rank-pos">{r.pos ? (r.pos <= 3 ? <Icon name="trophy" size={18} /> : r.pos) : '—'}</span>
                  <span className="avatar">{fullName(r).charAt(0).toUpperCase()}{on && <span className="status-dot s-member" />}</span>
                  <div className="rank-main">
                    <strong>
                      {fullName(r)}
                      {r.role === 'admin' && <span className="chip club">Admin</span>}{r.role === 'editor' && <span className="chip cat">Editor</span>}
                    {r.member === false && <span className="chip muted" title="Juega con su cuenta de Google pero no es miembro de BATBOX">Solo juego</span>}
                      {chip && <span className={'chip ' + chip[0]}>{chip[1]}</span>}
                    </strong>
                    <small>{r.email}</small>
                    <div className="rank-bar"><span className="b-cot" style={{ width: `${(r[sort] / max) * 100}%` }} /></div>
                    <div className="rank-legend">
                      <span>Cuenta desde {fmtDay(r.first_seen)}</span>
                      <span>Último ingreso {fmtDay(r.last_seen)}</span>
                    </div>
                  </div>
                  <div className="rank-side">
                    {r.hours_active ? (
                      <div className={'rank-metrics' + (byHours ? '' : ' days-first')}>
                        <div className={'metric' + (byHours ? ' main' : '')} title="Horas distintas en las que tuvo el cotizador abierto (aproximado)">
                          <b>~{r.hours_active} h</b><small>con el cotizador abierto</small>
                        </div>
                        <div className={'metric' + (byHours ? '' : ' main')} title="Cantidad de días distintos en los que entró">
                          <b>{plural(r.days_active, 'día', 'días')}</b><small>distintos en que entró</small>
                        </div>
                      </div>
                    ) : <div className="metric"><b className="muted-val">Sin uso</b><small>no hay registro de que lo haya abierto</small></div>}
                    {on ? <span className="chip ok"><span className="live-dot sm" />En línea</span>
                      : <span className="chip muted">{r.last_seen ? `Última vez ${fmtAgo(agoSeconds(r.last_seen)).toLowerCase()}` : 'Nunca entró'}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
    </div>
  );
}
