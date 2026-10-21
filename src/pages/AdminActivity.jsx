import { useCallback, useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';
import { Empty, SearchInput } from '../components/ui.jsx';

// =====================================================================
// ACTIVIDAD (pestaña del panel admin) — migración 004
// Ranking de uso del Cotizador PRO y de BATBOX + quién está en línea.
// Los datos los da bb_admin_activity(), que verifica is_admin() en la base.
// "En línea" = usó BATBOX o el cotizador en los últimos 2 minutos.
// =====================================================================

const PERIODS = [{ days: 1, label: 'Hoy' }, { days: 7, label: '7 días' }, { days: 30, label: '30 días' }, { days: 0, label: 'Siempre' }];
const SORTS = [
  { key: 'minutes_total', label: 'Uso total' },
  { key: 'minutes_cotizador', label: 'Cotizador' },
  { key: 'minutes_batbox', label: 'BATBOX' },
];
const SECTION = {
  inicio: 'Inicio', tools: 'BAT Tools', academy: 'BAT Academy', media: 'BAT Media', library: 'BAT Library',
  community: 'Comunidad', club: 'Makers Club', acceso: 'Mi cuenta', admin: 'Panel admin', buscar: 'Búsqueda', ver: 'viendo un contenido',
};
const REFRESH = 30 * 1000;

const fullName = (r) => [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email?.split('@')[0] || 'Miembro';
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
const where = (r) => (r.last_app === 'cotizador' ? 'en el Cotizador PRO' : `en BATBOX${SECTION[r.last_section] ? ' · ' + SECTION[r.last_section] : ''}`);

// Solo `npm run dev` con ?simdb: datos ficticios para ver la pantalla.
const SIM = import.meta.env.DEV && new URLSearchParams(window.location.search).has('simdb');
const SIM_ROWS = [
  { user_id: 'a', email: 'maker.uno@ejemplo.com', first_name: 'Maker', last_name: 'Uno', role: 'user', minutes_batbox: 95, minutes_cotizador: 742, sessions: 31, days_active: 18, last_app: 'cotizador', seconds_ago: 25, online: true },
  { user_id: 'b', email: '3dbatimpresiones@gmail.com', first_name: '3DBAT', last_name: 'Admin', role: 'admin', minutes_batbox: 410, minutes_cotizador: 220, sessions: 40, days_active: 21, last_app: 'batbox', last_section: 'admin', seconds_ago: 5, online: true },
  { user_id: 'c', email: 'maker.dos@ejemplo.com', first_name: 'Maker', last_name: 'Dos', role: 'user', minutes_batbox: 160, minutes_cotizador: 205, sessions: 12, days_active: 9, last_app: 'batbox', last_section: 'academy', seconds_ago: 50, online: true },
  { user_id: 'd', email: 'maker.tres@ejemplo.com', first_name: 'Maker', last_name: 'Tres', role: 'user', minutes_batbox: 12, minutes_cotizador: 188, sessions: 6, days_active: 5, last_app: 'cotizador', seconds_ago: 7400, online: false },
  { user_id: 'e', email: 'maker.cuatro@ejemplo.com', first_name: null, last_name: null, role: 'user', minutes_batbox: 48, minutes_cotizador: 0, sessions: 3, days_active: 2, last_app: 'batbox', last_section: 'media', seconds_ago: 190000, online: false },
].map((r) => ({ ...r, minutes_total: r.minutes_batbox + r.minutes_cotizador }));

export default function AdminActivity() {
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
  const sum = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
  const max = Math.max(1, ...ranking.map((r) => r[sort]));
  const periodLabel = PERIODS.find((p) => p.days === days)?.label.toLowerCase();

  return (
    <div className="activity">
      <div className="member-stats act-stats">
        <div className="mstat t-ok"><b>{online.length}</b><span>En línea ahora</span></div>
        <div className="mstat"><b className="c-cyan">{rows.filter((r) => r.minutes_total > 0).length}</b><span>Activos · {periodLabel}</span></div>
        <div className="mstat"><b>{fmtMinutes(sum('minutes_cotizador'))}</b><span>En el Cotizador</span></div>
        <div className="mstat"><b>{fmtMinutes(sum('minutes_batbox'))}</b><span>En BATBOX</span></div>
      </div>

      <section className="card online-box">
        <div className="online-head">
          <span className="live-dot" /> <b>En línea ahora</b>
          <small>{updatedAt ? `Actualizado ${updatedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · se actualiza solo` : ''}</small>
          <button className="mini-btn" title="Actualizar" onClick={() => load()}><Icon name="refresh" size={14} /></button>
        </div>
        {loading ? <div className="spinner xs" /> : !online.length
          ? <p className="ed-hint">Nadie está usando BATBOX ni el cotizador en este momento.</p>
          : (
            <ul className="online-list">
              {online.map((r) => (
                <li key={r.user_id}>
                  <span className="avatar">{fullName(r).charAt(0).toUpperCase()}<span className="status-dot s-member" /></span>
                  <div><b>{fullName(r)}</b><small>{where(r)}</small></div>
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
          Se cuentan los minutos de <b>uso activo</b> de cada miembro aprobado: la página abierta, a la vista y en uso.
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
                    {r.role === 'admin' && <span className="chip club">Admin</span>}
                  </strong>
                  <small>{r.email}</small>
                  <div className="rank-bar" title={`Cotizador ${fmtMinutes(r.minutes_cotizador)} · BATBOX ${fmtMinutes(r.minutes_batbox)}`}>
                    {sort !== 'minutes_batbox' && <span className="b-cot" style={{ width: `${(r.minutes_cotizador / max) * 100}%` }} />}
                    {sort !== 'minutes_cotizador' && <span className="b-bb" style={{ width: `${(r.minutes_batbox / max) * 100}%` }} />}
                  </div>
                  <div className="rank-legend">
                    <span><i className="b-cot" />Cotizador {fmtMinutes(r.minutes_cotizador)}</span>
                    <span><i className="b-bb" />BATBOX {fmtMinutes(r.minutes_batbox)}</span>
                    <span>{r.days_active} {r.days_active === 1 ? 'día' : 'días'} · {r.sessions} {r.sessions === 1 ? 'sesión' : 'sesiones'}</span>
                  </div>
                </div>
                <div className="rank-side">
                  <b>{fmtMinutes(r[sort])}</b>
                  {r.online
                    ? <span className="chip ok"><span className="live-dot sm" />En línea</span>
                    : <span className="chip muted">{fmtAgo(r.seconds_ago)}</span>}
                  {r.online && <small>{where(r)}</small>}
                </div>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}
