import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import * as api from '../lib/rifasApi.js';
import { navigate, useRoute } from '../lib/router.js';
import Icon from '../components/Icon.jsx';
import { Confirm, Empty } from '../components/ui.jsx';
import { RafflePushAdmin } from '../components/RafflePush.jsx';
import '../styles/rifas.css';
import CoverCropper from '../components/CoverCropper.jsx';

// Pestaña "Rifas" del panel (#/admin?tab=rifas). Solo administradores: cada función
// de la base vuelve a verificar is_admin().
//   #/admin?tab=rifas                         → Mis rifas (activas / inactivas)
//   #/admin?tab=rifas&r=<id>&v=<vista>        → panel de una rifa
//   vistas: admin (Administración) · nuevo · buscar · avanzado · ajustes · general · personal · perfil · compartir · cierre

const uuid = () => crypto.randomUUID();
// Dirección del enlace: minúsculas, números, guiones y ñ (los demás acentos se quitan).
const keepEnie = (s, fn) => fn(s.toLowerCase().replace(/ñ/g, '\u0001')).replace(/\u0001/g, 'ñ');
const slugify = (s) => keepEnie(s, (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u0001]+/g, '-').replace(/^-|-$/g, '')).slice(0, 60);
const slugTyping = (s) => keepEnie(s, (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u0001-]+/g, '-').replace(/-{2,}/g, '-')).slice(0, 60);
const go = (id, v) => navigate(`/admin?tab=rifas${id ? `&r=${id}` : ''}${v ? `&v=${v}` : ''}`);
const fmtOf = (r) => (n) => api.fmtNum(n, r?.num_to ?? 99, r?.num_from ?? 0);

function Chip({ map, value }) {
  const s = map[value] || { label: value, cls: 'muted', icon: 'more' };
  return <span className={'chip ' + s.cls}><Icon name={s.icon} size={12} /> {s.short || s.label}</span>;
}

function Qr({ text, size = 150 }) {
  const svg = useMemo(() => { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }, [text]);
  return <div className="rf-qr" style={{ width: size, height: size }} role="img" aria-label="Código QR" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function AdminRifas() {
  const { query } = useRoute();
  if (query.r) return <RafflePanel key={query.r} id={query.r} view={query.v || 'admin'} />;
  if (query.v === 'notificaciones') return <RafflePushAdmin />;
  return <MyRaffles />;
}

// ---------------------------------------------------------------------
// Mis rifas
// ---------------------------------------------------------------------
function MyRaffles() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [create, setCreate] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const load = useCallback(() => api.adminList().then((l) => { setList(l); setError(''); }).catch((e) => { setError(e.message); setList([]); }), []);
  useEffect(() => { load(); }, [load]);
  const active = (list || []).filter((r) => !['closed', 'archived'].includes(r.status));
  const old = (list || []).filter((r) => ['closed', 'archived'].includes(r.status));
  return (
    <div className="rf-admin">
      <div className="rf-mine-head"><h3>Rifas activas</h3><button type="button" className="btn primary" onClick={() => setCreate(true)}><Icon name="sparkles" size={16} /> Nueva rifa</button></div>
      <p><a className="btn ghost" href="#/admin?tab=rifas&v=notificaciones"><Icon name="bell" size={16} /> Notificaciones de rifas</a></p>
      {error && <div className="feedback-error">{error}</div>}
      {!list ? <div className="cm-loading"><span className="spinner xs" /></div> : (
        <>
          {active.length === 0 ? <Empty icon="star" title="No hay rifas activas" text="Tocá “Nueva rifa” para armar una en un minuto." /> : <div className="rf-cards">{active.map((r) => <RaffleCard key={r.id} r={r} reload={load} />)}</div>}
          {old.length > 0 && (
            <>
              <button type="button" className="rf-old-toggle" aria-expanded={showOld} onClick={() => setShowOld(!showOld)}>Rifas inactivas ({old.length}) <span aria-hidden>{showOld ? '▲' : '▼'}</span></button>
              {showOld && <div className="rf-cards">{old.map((r) => <RaffleCard key={r.id} r={r} reload={load} />)}</div>}
            </>
          )}
        </>
      )}
      {create && <CreateModal last={list?.[0]} onClose={() => setCreate(false)} />}
    </div>
  );
}

function RaffleCard({ r, reload }) {
  const [menu, setMenu] = useState(false);
  const sold = r.confirmed;
  const pct = r.total ? Math.round((sold / r.total) * 100) : 0;
  return (
    <article className="rf-card">
      <button type="button" className="rf-card-main" onClick={() => go(r.id)}>
        <span className="rf-card-img">{r.cover_url ? <img src={r.cover_url} alt="" loading="lazy" /> : <Icon name="star" size={26} />}</span>
        <span className="rf-card-txt">
          <small>{api.fmtDate(r.draw_at, false) || 'Al agotar números'}{r.status !== 'published' && <> · <Chip map={api.RAFFLE_STATUS} value={r.status} /></>}</small>
          <b>{r.title}</b>
          <span className="rf-bar" aria-hidden><i style={{ width: pct + '%' }} /></span>
          <small>{sold}/{r.total} <b className="rf-pct">{pct}%</b>{r.review > 0 && <> · <span className="rf-badge-review">{r.review} por revisar</span></>}</small>
        </span>
      </button>
      <div className="rf-card-menu">
        <button type="button" className="icon-btn" aria-label={'Opciones de ' + r.title} aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="more" size={18} /></button>
        {menu && (
          <div className="rf-dropdown" role="menu" onMouseLeave={() => setMenu(false)}>
            <button type="button" role="menuitem" onClick={() => go(r.id)}><Icon name="grid" size={16} /> Administración</button>
            <a role="menuitem" href={'#/rifas/' + r.slug} target="_blank" rel="noopener noreferrer"><Icon name="external" size={16} /> Talonario web</a>
            <button type="button" role="menuitem" onClick={() => go(r.id, 'ajustes')}><Icon name="edit" size={16} /> Ajustes</button>
            <button type="button" role="menuitem" onClick={async () => { const id = await api.adminDuplicate(r.id); go(id, 'ajustes'); reload(); }}><Icon name="clipboard" size={16} /> Duplicar</button>
          </div>
        )}
      </div>
    </article>
  );
}

// Crear rifa rápido: título, precio, cantidad y fecha. El resto se copia de la última rifa.
function CreateModal({ last, onClose }) {
  const [f, setF] = useState({ title: '', price: '', count: '', date: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cents = api.pesosToCents(f.price);
  const count = parseInt(f.count, 10);
  const valid = f.title.trim().length >= 3 && cents > 0 && count >= 2 && count <= 100000;
  const start = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError('');
    try {
      const base = last ? await api.adminGet(last.id).catch(() => null) : null;
      const id = await api.adminSave({
        title: f.title.trim(), slug: `${slugify(f.title) || 'rifa'}-${Math.random().toString(36).slice(2, 6)}`,
        price_cents: cents, num_from: 1, num_to: count, draw_at: /^20\d\d-\d\d-\d\d$/.test(f.date) ? `${f.date}T21:00:00-03:00` : '',
        transfer_info: base?.transfer_info || '', terms: base?.terms || '', support_contact: base?.support_contact || '', organizer: base?.organizer || '',
        pay_hours: base?.pay_hours || 8, max_per_entry: 1000, min_per_entry: base?.min_per_entry || 1, require_phone: base?.require_phone ?? true, csv_profile: base?.csv_profile || 'rifary',
        prizes: [], description: '', cover_url: '', logo_url: '',
      });
      try { await api.adminSetStatus(id, 'published'); go(id); } catch { go(id, 'general&falta=1'); }
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal rf-modal" role="dialog" aria-modal="true" aria-labelledby="rf-new-h" onClick={(e) => e.stopPropagation()} onSubmit={start}>
        <div className="rf-modal-head"><h2 id="rf-new-h">Crear rifa</h2><button type="button" className="mini-btn" aria-label="Cerrar" onClick={onClose}>×</button></div>
        <label className="field"><span>Título</span><div className="pink-input"><input autoFocus value={f.title} maxLength={120} placeholder="Nombre de la rifa" onChange={(e) => setF({ ...f, title: e.target.value })} /></div></label>
        <div className="rf-two">
          <label className="field"><span>Precio por número</span><div className="pink-input"><input value={f.price} inputMode="decimal" placeholder="12000" onChange={(e) => setF({ ...f, price: e.target.value })} /></div></label>
          <label className="field"><span>Cantidad de números</span><div className="pink-input"><input value={f.count} inputMode="numeric" placeholder="100" onChange={(e) => setF({ ...f, count: e.target.value.replace(/\D/g, '') })} /></div></label>
        </div>
        <label className="field"><span>Fecha del sorteo (opcional)</span><div className="pink-input"><input type="date" min="2024-01-01" max="2099-12-31" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div><small className="rf-muted">Vacía = se sortea al agotar los números.</small></label>
        {valid && (
          <div className="rf-goal"><small>Objetivo de recaudación</small><b>ARS {api.money(cents * count).slice(1)}</b><small>{count} números del 1 al {count} · sin costo de activación</small></div>
        )}
        <p className="rf-muted">{last ? 'Alias, bases y contacto se copian de tu última rifa; los cambiás en Ajustes.' : 'Después completá alias, bases y contacto en Ajustes para publicarla.'}</p>
        {error && <div className="feedback-error" role="alert">{error}</div>}
        <button type="submit" className="btn primary wide" disabled={!valid || busy}>{busy ? 'Creando…' : 'Comenzar'}</button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------
// Panel de una rifa
// ---------------------------------------------------------------------
const SIDE = [
  { v: 'talonario', label: 'Talonario web', icon: 'grid', ext: true },
  { v: 'admin', label: 'Administración', icon: 'clipboard' },
  { v: 'ajustes', label: 'Ajustes', icon: 'edit' },
  { v: 'compartir', label: 'Compartir link', icon: 'send' },
  { v: 'cierre', label: 'Cierre y padrón', icon: 'trophy' },
  { href: '#/admin?tab=rifas&v=notificaciones', label: 'Notificaciones', icon: 'bell' },
];

function RafflePanel({ id, view }) {
  const { query } = useRoute();
  const [r, setR] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.adminGet(id).then(setR).catch((e) => setError(e.message));
    api.adminList().then((l) => setStats(l.find((x) => x.id === id) || null)).catch(() => {});
  }, [id]);
  useEffect(() => { load(); }, [load]);
  if (!r) return <div className="cm-loading">{error ? <div className="feedback-error">{error}</div> : <span className="spinner xs" />}</div>;
  const section = ['nuevo', 'buscar', 'avanzado'].includes(view) ? 'admin' : ['general', 'personal', 'perfil'].includes(view) ? 'ajustes' : view;
  return (
    <div className="rf-panel">
      <div className="rf-panel-top">
        <button type="button" className="icon-btn" aria-label="Mis rifas" onClick={() => go()}><Icon name="home" size={18} /></button>
        <div className="rf-panel-title"><Icon name="clipboard" size={16} /> <span>{r.title}</span> <Chip map={api.RAFFLE_STATUS} value={r.status} /></div>
      </div>
      <nav className="rf-side" aria-label="Secciones de la rifa">
        {SIDE.map((s) => s.href
          ? <a key={s.href} href={s.href}><Icon name={s.icon} size={16} /> {s.label}</a>
          : s.ext
          ? <a key={s.v} href={'#/rifas/' + r.slug} target="_blank" rel="noopener noreferrer"><Icon name={s.icon} size={16} /> {s.label} <Icon name="external" size={14} /></a>
          : <button key={s.v} type="button" className={section === s.v ? 'active' : ''} aria-current={section === s.v ? 'page' : undefined} onClick={() => go(id, s.v)}><Icon name={s.icon} size={16} /> {s.label}</button>)}
      </nav>
      <div className="rf-main">
        {section === 'admin' && <AdminHome r={r} stats={stats} view={view} reload={load} />}
        {view === 'ajustes' && <Settings r={r} />}
        {['general', 'personal', 'perfil'].includes(view) && <Editor r={r} part={view} missing={query.falta === '1'} onSaved={load} />}
        {view === 'compartir' && <Share r={r} />}
        {view === 'cierre' && <Closing raffle={r} reload={load} />}
      </div>
    </div>
  );
}

function AdminHome({ r, stats, view, reload }) {
  const tiles = [
    { v: 'nuevo', label: 'Nuevo', icon: 'sparkles' },
    { v: 'buscar', label: 'Buscar', icon: 'search' },
    { v: 'avanzado', label: 'Avanzado', icon: 'grid' },
  ];
  return (
    <div className="rf-adminhome">
      <div className="rf-tiles3">{tiles.map((t) => (
        <button key={t.v} type="button" className={'rf-tile' + (view === t.v ? ' active' : '')} aria-pressed={view === t.v} onClick={() => go(r.id, view === t.v ? 'admin' : t.v)}>
          <Icon name={t.icon} size={26} /><span>{t.label}</span></button>))}
      </div>
      {view === 'nuevo' && <Manual raffle={r} onDone={() => { reload(); go(r.id); }} />}
      {view === 'avanzado' && <Advanced r={r} reload={reload} />}
      {view !== 'nuevo' && <Entries raffle={r} stats={stats} search={view === 'buscar'} />}
    </div>
  );
}

function Donut({ value, total }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rf-donut" role="img" aria-label={`${pct}% ocupado: ${value} de ${total}`}>
      <div className="rf-donut-ring" style={{ '--p': pct }}><span>{pct}%</span></div>
      <small>{value} / {total}</small>
    </div>
  );
}

function Entries({ raffle, stats, search }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [purge, setPurge] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState('');
  const load = useCallback(() => api.adminEntries(raffle.id, { q, status, sort, page }).then(setData).catch((e) => setError(e.message)), [raffle.id, q, status, sort, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const s = stats || { held: 0, review: 0, confirmed: 0, total: raffle.num_to - raffle.num_from + 1 };
  const filter = (v) => { setStatus(status === v ? '' : v); setPage(1); };
  return (
    <div>
      <div className="rf-statrow">
        <Donut value={s.held + s.review + s.confirmed} total={s.total} />
        {[['pending', 'Apartado', s.held, 'blue'], ['review', 'Revisando', s.review, 'orange'], ['confirmed', 'Validado', s.confirmed, 'green']].map(([v, l, n, c]) => (
          <button key={v} type="button" className={'rf-stat ' + c + (status === v ? ' active' : '')} aria-pressed={status === v} onClick={() => filter(v)}><b>{n}</b><span>{l}</span></button>))}
      </div>
      <div className="rf-listbar">
        <small className="rf-muted">Cantidad de números. Tocá una tarjeta para filtrar la lista.</small>
        <button type="button" className="rf-foot-btn danger" onClick={() => setPurge(true)}><Icon name="trash" size={16} /> Borrar cancelados y vencidos</button>
      </div>
      {purgeMsg && <div className="cm-ok" role="status">{purgeMsg}</div>}
      <Confirm open={purge} danger title="¿Borrar cancelados y vencidos?" text="Se borran de la lista todas las participaciones canceladas o vencidas de esta rifa, con sus comprobantes. Las apartadas, en revisión y validadas no se tocan." yes="Borrar"
        onYes={async () => { setPurge(false); try { const r = await api.adminDeleteEntries(raffle.id); setPurgeMsg(r.deleted ? `Se borraron ${r.deleted} registro(s).` : 'No había cancelados ni vencidos.'); load(); } catch (e) { setError(e.message); } }} onNo={() => setPurge(false)} />
      {search && (
        <div className="rf-filters">
          <div className="pink-input"><input type="search" autoFocus value={q} placeholder="Número, código, nombre, teléfono o email" aria-label="Buscar participaciones" onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <div className="pink-input"><select value={status} aria-label="Estado" onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos los estados</option>{Object.entries(api.ENTRY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}</select></div>
          <div className="pink-input"><select value={sort} aria-label="Orden" onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Más recientes</option><option value="old">Más antiguas</option><option value="number">Por número</option><option value="review">En revisión primero</option></select></div>
        </div>
      )}
      {error && <div className="feedback-error">{error}</div>}
      {!data ? <div className="cm-loading"><span className="spinner xs" /></div> : data.rows.length === 0
        ? <p className="rf-empty">{status || q ? 'Sin resultados con ese filtro.' : <>Todavía no hay participaciones. Tocá <b>Nuevo</b> para registrar una que te llegó por otro canal.</>}</p>
        : (
          <table className="rf-table">
            <thead><tr><th scope="col"><button type="button" className="rf-sort" onClick={() => setSort(sort === 'number' ? 'recent' : 'number')}>⇅ Nombre</button></th><th scope="col">Números</th><th scope="col">Cant.</th><th scope="col">Estado</th><th scope="col">Fecha</th></tr></thead>
            <tbody>{data.rows.map((e) => (
              <tr key={e.id} tabIndex={0} onClick={() => setOpen(e.id)} onKeyDown={(ev) => ev.key === 'Enter' && setOpen(e.id)}>
                <td><b>{e.name}</b><small>{e.phone || e.email}</small></td>
                <td className="rf-td-n">{e.numbers.map(fmtOf(raffle)).join(' · ')}</td>
                <td>{e.numbers.length}</td>
                <td><Chip map={api.ENTRY_STATUS} value={e.status} /></td>
                <td>{new Date(e.created_at).toLocaleDateString('es-AR', { timeZone: api.TZ, day: 'numeric', month: 'short' })}</td>
              </tr>))}</tbody>
          </table>
        )}
      {data && pages > 1 && <div className="rf-pager"><button type="button" className="btn text" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button>
        <span>Página {page} de {pages} · {data.total} en total</span>
        <button type="button" className="btn text" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente →</button></div>}
      {open && <EntryDetail id={open} onClose={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function Advanced({ r, reload }) {
  const [ask, setAsk] = useState(null);
  const [msg, setMsg] = useState({});
  const act = async (fn, ok) => { setMsg({}); try { await fn(); setMsg({ ok }); reload(); } catch (e) { setMsg({ err: e.message, missing: e.data?.missing || [] }); } };
  return (
    <div className="card rf-adv">
      <h4>Estado de la rifa</h4>
      <p className="rf-muted">Ahora: <Chip map={api.RAFFLE_STATUS} value={r.status} /></p>
      <div className="rf-actions">
        {['draft', 'paused'].includes(r.status) && <button type="button" className="btn primary" onClick={() => setAsk({ title: r.status === 'draft' ? '¿Publicar la rifa?' : '¿Reanudar reservas?', text: 'El talonario queda abierto para quien tenga el enlace.', yes: 'Publicar', run: () => act(() => api.adminSetStatus(r.id, 'published'), 'Publicada.') })}>Publicar</button>}
        {r.status === 'published' && <button type="button" className="btn ghost" onClick={() => setAsk({ title: '¿Pausar reservas?', text: 'Nadie podrá reservar números nuevos. Las reservas vigentes siguen y se pueden subir comprobantes.', yes: 'Pausar', run: () => act(() => api.adminSetStatus(r.id, 'paused'), 'Reservas pausadas.') })}><Icon name="clock" size={16} /> Pausar reservas</button>}
        <button type="button" className="btn ghost" onClick={async () => go(await api.adminDuplicate(r.id), 'ajustes')}><Icon name="clipboard" size={16} /> Duplicar como borrador</button>
        {r.status === 'closed' && <button type="button" className="btn ghost" onClick={() => setAsk({ title: '¿Archivar?', text: 'Se oculta del público. Los padrones se conservan.', yes: 'Archivar', run: () => act(() => api.adminSetStatus(r.id, 'archived'), 'Archivada.') })}>Archivar</button>}
      </div>
      {msg.ok && <div className="cm-ok" role="status">{msg.ok}</div>}
      {msg.err && <div className="feedback-error" role="alert">{msg.err}
        {msg.missing?.length > 0 && <div className="rf-actions rf-fixlinks">
          {msg.missing.some((m) => /precio|pago/.test(m)) && <button type="button" className="btn ghost" onClick={() => go(r.id, 'general')}>Ir a General</button>}
          {msg.missing.some((m) => /bases/.test(m)) && <button type="button" className="btn ghost" onClick={() => go(r.id, 'general')}>Ir a General (bases)</button>}
        </div>}</div>}
      <Confirm open={!!ask} title={ask?.title} text={ask?.text} yes={ask?.yes} onYes={() => { const a = ask; setAsk(null); a.run(); }} onNo={() => setAsk(null)} />
    </div>
  );
}

function Settings({ r }) {
  const tiles = [
    { v: 'general', icon: 'grid', title: 'General', text: 'Precio, premios, bases, fecha, pago y números' },
    { v: 'personal', icon: 'image', title: 'Personalización', text: 'Portada del talonario' },
    { v: 'perfil', icon: 'user', title: 'Mi perfil', text: 'Organizador y contacto de soporte' },
    { href: '#/admin?tab=rifas&v=notificaciones', icon: 'bell', title: 'Notificaciones', text: 'Avisos push de todas las rifas: prender, textos y prueba' },
  ];
  return (
    <div>
      <h3 className="rf-h">Ajustes</h3>
      <div className="rf-settings">
        {tiles.map((t) => t.href
          ? <a key={t.href} className="rf-set-tile" href={t.href}><b><Icon name={t.icon} size={18} /> {t.title}</b><small>{t.text}</small></a>
          : <button key={t.v} type="button" className="rf-set-tile" onClick={() => go(r.id, t.v)}><b><Icon name={t.icon} size={18} /> {t.title}</b><small>{t.text}</small></button>)}
      </div>
      {['published', 'paused'].includes(r.status) && <button type="button" className="btn rf-danger" onClick={() => go(r.id, 'cierre')}><Icon name="x" size={16} /> Cancelar / finalizar rifa</button>}
    </div>
  );
}

const PART_FIELDS = {
  general: ['title', 'prizes', 'terms', 'price', 'draw_at', 'transfer_info', 'require_phone', 'min_per_entry', 'pay_hours', 'num_from', 'num_to', 'csv_profile', 'slug'],
  personal: ['cover_url', 'logo_url'],
  perfil: ['organizer', 'support_contact'],
};

function Editor({ r, part, missing, onSaved }) {
  const [f, setF] = useState(() => ({ ...r, prizes: r.prizes?.length ? r.prizes : [''], price: api.centsToPesos(r.price_cents), draw_at: api.toLocalInput(r.draw_at) }));
  useEffect(() => {
    let alive = true;
    api.adminGet(r.id).then((x) => { if (alive && x) setF({ ...x, prizes: x.prizes?.length ? x.prizes : [''], price: api.centsToPesos(x.price_cents), draw_at: api.toLocalInput(x.draw_at) }); }).catch(() => {});
    return () => { alive = false; };
  }, [r.id, part]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const set = (x) => setF((c) => ({ ...c, ...x }));
  const cents = api.pesosToCents(f.price);
  const locked = r.locked;
  const coverInput = useRef(null);
  const logoInput = useRef(null);
  const [crop, setCrop] = useState(null); // { src, local }
  const pickCover = (file, field = 'cover_url') => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError('Elegí una foto JPG, PNG o WebP.'); return; }
    setCrop({ src: URL.createObjectURL(file), local: true, field });
    if (coverInput.current) coverInput.current.value = '';
    if (logoInput.current) logoInput.current.value = '';
  };
  const closeCrop = () => { if (crop?.local) URL.revokeObjectURL(crop.src); setCrop(null); };
  const uploadCover = async (file, field = 'cover_url') => {
    if (!file) return;
    setBusy(field === 'logo_url' ? 'logo' : 'cover'); setError(''); setOk('');
    try { const url = await api.uploadCover(r.id, file); set({ [field]: url }); await save({ [field]: url }); setOk(field === 'logo_url' ? 'Logo subido y guardado.' : 'Portada subida y guardada.'); }
    catch (e) { setError(e.message); setBusy(false); }
    finally { if (coverInput.current) coverInput.current.value = ''; }
  };
  const save = async (over = {}) => {
    setBusy(true); setError(''); setOk('');
    try {
      // Tomamos lo último guardado y pisamos solo los campos de esta pantalla:
      // así General no borra las bases ni Personalización el precio, aunque la pantalla esté desactualizada.
      const fresh = await api.adminGet(r.id);
      const mine = Object.fromEntries(PART_FIELDS[part].map((k) => [k, { ...f, ...over }[k]]));
      const f2 = { ...fresh, prizes: fresh.prizes?.length ? fresh.prizes : [], price: api.centsToPesos(fresh.price_cents), draw_at: api.toLocalInput(fresh.draw_at), ...mine };
      const cents = api.pesosToCents(f2.price);
      if (cents === null) throw new Error('Revisá el precio.');
      await api.adminSave({ ...f2, slug: slugify(f2.slug || '') || r.slug, id: r.id, price_cents: cents, prizes: f2.prizes.map((p) => p.trim()).filter(Boolean), draw_at: api.fromLocalInput(f2.draw_at),
        num_from: Number(f2.num_from), num_to: Number(f2.num_to), max_per_entry: 1000, min_per_entry: Math.max(1, Number(f2.min_per_entry) || 1), pay_hours: Number(f2.pay_hours) });
      setOk('Guardado.'); onSaved();
      if (missing && r.status === 'draft' && f2.transfer_info.trim().length >= 5 && f2.terms.trim().length >= 10) {
        try { await api.adminSetStatus(r.id, 'published'); setOk('Guardado y publicado.'); onSaved(); } catch { /* sigue en borrador */ }
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const title = { general: 'General', personal: 'Personalización', perfil: 'Mi perfil' }[part];
  return (
    <div className="card cm-composer rf-editor">
      <button type="button" className="cm-link" onClick={() => go(r.id, 'ajustes')}>← Ajustes</button>
      <h3 className="rf-h">Ajustes › {title}</h3>
      {missing && <div className="admin-warn"><Icon name="alert" size={16} /> Para publicarla faltan la información de pago y las bases (las dos en General).</div>}
      {locked && part === 'general' && <div className="admin-warn"><Icon name="lock" size={16} /> Ya hay participaciones: el precio y el rango quedan fijos.</div>}
      {part === 'general' && <>
        <div className="rf-info"><Icon name="alert" size={14} /> Talonario de <b>{Number(f.num_to) - Number(f.num_from) + 1}</b> números ({fmtOf(f)(Number(f.num_from))} a {fmtOf(f)(Number(f.num_to))}).{locked ? ' Ya tiene participaciones: el tamaño y el precio no se pueden cambiar.' : ''}</div>
        <label className="field"><span>Título</span><div className="pink-input"><input value={f.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} /></div></label>
        <label className="field"><span>Dirección del enlace</span>
          <div className="rf-slug"><span className="rf-slug-base">…/rifas/</span><div className="pink-input"><input value={f.slug} maxLength={60} spellCheck={false} autoCapitalize="none"
            onChange={(e) => set({ slug: slugTyping(e.target.value) })}
            onBlur={() => set({ slug: slugify(f.slug) })} /></div></div>
          <small className="rf-muted">Link: {api.shareUrl(slugify(f.slug) || '…')}{r.status !== 'draft' && f.slug !== r.slug ? ' · ⚠️ El link anterior deja de funcionar: volvé a compartir el nuevo.' : ''}</small></label>
        <div className="field"><span>Premios</span>
          {f.prizes.map((p, i) => (
            <div key={i} className="ga-kv"><div className="pink-input"><input value={p} maxLength={140} placeholder={`${i + 1}° premio`} onChange={(e) => set({ prizes: f.prizes.map((x, j) => (j === i ? e.target.value : x)) })} /></div>
              {f.prizes.length > 1 && <button type="button" className="mini-btn" aria-label="Quitar premio" onClick={() => set({ prizes: f.prizes.filter((_, j) => j !== i) })}>×</button>}</div>))}
          {f.prizes.length < 10 && <button type="button" className="cm-link" onClick={() => set({ prizes: [...f.prizes, ''] })}>+ Agregar premio</button>}
        </div>
        <label className="field"><span>Bases y condiciones (obligatorio para publicar · se muestran en el talonario)</span><div className="pink-input feedback-text"><textarea rows={6} maxLength={8000} placeholder="Ej.: El sorteo se hace cuando se vendan todos los números, en vivo por Instagram. Los números se validan con el comprobante de transferencia…" value={f.terms} onChange={(e) => set({ terms: e.target.value })} /></div>
          <small className="rf-muted">{f.terms.trim().length} caracteres · mínimo 10</small></label>
        {locked && <small className="cm-date">Si cambiás las bases se crea una versión nueva; las participaciones anteriores conservan la que aceptaron.</small>}
        <div className="cm-row">
          <label className="field"><span>Precio por número</span><div className="pink-input"><input value={f.price} inputMode="decimal" disabled={locked} onChange={(e) => set({ price: e.target.value })} /></div></label>
          <label className="field"><span>Moneda</span><div className="pink-input"><input value="ARS · Peso argentino" disabled /></div></label>
        </div>
        <label className="field"><span>Fecha del sorteo (opcional, hora de Buenos Aires)</span><div className="pink-input"><input type="datetime-local" min={api.DATE_MIN} max={api.DATE_MAX} value={f.draw_at} onChange={(e) => set({ draw_at: e.target.value })} /></div>
          <span className="rf-row-hint">{f.draw_at ? <button type="button" className="cm-link" onClick={() => set({ draw_at: '' })}>Quitar fecha (sortear al agotar números)</button> : <small className="rf-muted">Sin fecha: el talonario dice «Se sortea al agotar los números».</small>}</span></label>
        <label className="field"><span>Información de pago (alias, CBU, titular)</span><div className="pink-input feedback-text"><textarea rows={4} maxLength={1000} placeholder="Alias: …  ·  CBU: …  ·  Titular: …" value={f.transfer_info} onChange={(e) => set({ transfer_info: e.target.value })} /></div></label>
        <div className="cm-row">
          <label className="field"><span>Datos de participantes requeridos</span><div className="pink-input"><select value={f.require_phone ? 'tel' : 'email'} onChange={(e) => set({ require_phone: e.target.value === 'tel' })}>
            <option value="tel">Nombre y apellido, email y teléfono / WhatsApp</option><option value="email">Nombre y apellido y email (teléfono / WhatsApp opcional)</option></select></div></label>
          <label className="field"><span>Compra mínima (números por reserva)</span><div className="pink-input"><input type="number" min={1} max={1000} value={f.min_per_entry ?? 1} onChange={(e) => set({ min_per_entry: e.target.value })} /></div><small className="rf-muted">Sin máximo: cada persona compra los que quiera.</small></label>
          <label className="field"><span>Horas de tolerancia para pagar</span><div className="pink-input"><input type="number" min={1} max={720} value={f.pay_hours} onChange={(e) => set({ pay_hours: e.target.value })} /></div></label>
        </div>
        <label className="rf-switch"><input type="checkbox" role="switch" checked={Number(f.num_from) === 0} disabled={locked}
          onChange={(e) => { const n = Number(f.num_to) - Number(f.num_from) + 1; set(e.target.checked ? { num_from: 0, num_to: n - 1 } : { num_from: 1, num_to: n }); }} />
          <span><b>Comenzar numeración en cero</b><small>Del {Number(f.num_from) === 0 ? '00' : '0'} al {Number(f.num_to) - Number(f.num_from)} con ceros a la izquierda (como en las rifas de 00 a 99).</small></span></label>
        <details className="rf-more"><summary>Más opciones</summary>
          <label className="field"><span>Formato del CSV</span><div className="pink-input"><select value={f.csv_profile} onChange={(e) => set({ csv_profile: e.target.value })}>
            <option value="rifary">Compatible Rifary</option><option value="provisional">Provisional (numero,nombre,…)</option></select></div></label>
        </details>
      </>}
      {part === 'personal' && <>
        <div className="field"><span>Portada</span>
          <div className="rf-coverup">
            {/^https:\/\//.test(f.cover_url || '') ? <img className="rf-cover-prev" src={f.cover_url} alt="Vista previa de la portada" /> : <div className="rf-cover-empty"><Icon name="image" size={30} /><small>Sin portada</small></div>}
            <div className="rf-actions">
              <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pickCover(e.target.files?.[0])} />
              <button type="button" className="btn primary" disabled={!!busy} onClick={() => coverInput.current?.click()}><Icon name="image" size={16} /> {busy === 'cover' ? 'Subiendo…' : f.cover_url ? 'Cambiar foto' : 'Subir foto'}</button>
              {/^https:\/\//.test(f.cover_url || '') && <button type="button" className="btn ghost" disabled={!!busy} onClick={() => setCrop({ src: f.cover_url, local: false, field: 'cover_url' })}><Icon name="edit" size={16} /> Ajustar encuadre</button>}
              {f.cover_url && <button type="button" className="btn text" disabled={!!busy} onClick={() => { set({ cover_url: '' }); save({ cover_url: '' }); }}>Quitar</button>}
            </div>
            <small className="rf-muted">JPG, PNG o WebP. Se muestra en formato banner (3:1, bien apaisado): al subirla elegís qué franja queda arrastrándola.</small>
            {crop && (crop.field === 'logo_url'
              ? <CoverCropper src={crop.src} ratio={1} outW={512} name="logo.webp" title="Encuadrar logo" hint="Arrastrá la foto para elegir qué se ve dentro del círculo. Con el zoom la agrandás." onCancel={closeCrop} onDone={(file) => { closeCrop(); uploadCover(file, 'logo_url'); }} />
              : <CoverCropper src={crop.src} onCancel={closeCrop} onDone={(file) => { closeCrop(); uploadCover(file); }} />)}
          </div>
          <details className="rf-more"><summary>O pegá el link de una imagen</summary>
            <div className="pink-input"><input value={f.cover_url} inputMode="url" maxLength={500} placeholder="https://…" onChange={(e) => set({ cover_url: e.target.value })} /></div></details>
        </div>
        <div className="field"><span>Logo (círculo junto al título)</span>
          <div className="rf-coverup">
            {/^https:\/\//.test(f.logo_url || '') ? <img className="rf-logo-prev" src={f.logo_url} alt="Vista previa del logo" /> : <div className="rf-logo-prev rf-logo-empty"><Icon name="star" size={26} /></div>}
            <div className="rf-actions">
              <input ref={logoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pickCover(e.target.files?.[0], 'logo_url')} />
              <button type="button" className="btn primary" disabled={!!busy} onClick={() => logoInput.current?.click()}><Icon name="image" size={16} /> {busy === 'logo' ? 'Subiendo…' : f.logo_url ? 'Cambiar logo' : 'Subir logo'}</button>
              {/^https:\/\//.test(f.logo_url || '') && <button type="button" className="btn ghost" disabled={!!busy} onClick={() => setCrop({ src: f.logo_url, local: false, field: 'logo_url' })}><Icon name="edit" size={16} /> Ajustar encuadre</button>}
              {f.logo_url && <button type="button" className="btn text" disabled={!!busy} onClick={() => { set({ logo_url: '' }); save({ logo_url: '' }); }}>Quitar</button>}
            </div>
            <small className="rf-muted">Cuadrado, se muestra redondo. Si no subís logo se usa la portada.</small>
          </div>
        </div>
      </>}
      {part === 'perfil' && <>
        <label className="field"><span>Organizador (se muestra en el talonario)</span><div className="pink-input"><input value={f.organizer || ''} maxLength={120} placeholder="@3DBAT IMPRESIONES & @FILACOLOR" onChange={(e) => set({ organizer: e.target.value })} /></div></label>
        <label className="field"><span>Contacto de soporte</span><div className="pink-input"><input value={f.support_contact} maxLength={200} placeholder="WhatsApp de la comunidad, email…" onChange={(e) => set({ support_contact: e.target.value })} /></div></label>
      </>}
      {error && <div className="feedback-error" role="alert">{error}</div>}
      {ok && <div className="cm-ok" role="status">{ok}</div>}
      <div className="rf-savebar"><button type="button" className="btn primary" disabled={busy || f.title.trim().length < 3 || cents === null} onClick={() => save()}><Icon name="check" size={16} /> {busy ? 'Guardando…' : 'Guardar'}</button></div>
    </div>
  );
}

function Share({ r }) {
  const url = api.shareUrl(r.slug);
  const [done, setDone] = useState(false);
  return (
    <div className="card rf-sharebox">
      <h3>Compartir link</h3>
      {r.status === 'draft' && <div className="admin-warn"><Icon name="alert" size={16} /> Es un borrador: publicala en Administración → Avanzado.</div>}
      <div className="pink-input"><input readOnly value={url} aria-label="Enlace del talonario" onFocus={(e) => e.target.select()} /></div>
      <div className="rf-actions">
        <a className="btn primary" href={api.whatsappShare(`${r.title} — elegí tus números acá: ${url}`)} target="_blank" rel="noopener noreferrer"><Icon name="message" size={16} /> WhatsApp</a>
        <button type="button" className="btn ghost" onClick={() => navigator.clipboard?.writeText(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}><Icon name={done ? 'check' : 'link'} size={16} /> {done ? 'Copiado' : 'Copiar enlace'}</button>
      </div>
      <Qr text={url} size={180} />
      <small className="rf-muted">Escaneá el código para abrir el talonario desde el celular.</small>
    </div>
  );
}

// ---------------------------------------------------------------------
// Ficha, carga manual y cierre (lógica sin cambios)
// ---------------------------------------------------------------------
// Visor del comprobante: se abre ENCIMA de la página (sin pestaña nueva). Esc o la X lo cierran.
function ProofViewer({ proof, onClose }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState('');
  const isPdf = proof.mime === 'application/pdf';
  useEffect(() => { api.proofUrl(proof.storage_path).then(setUrl).catch((e) => setErr(e.message)); }, [proof.storage_path]);
  useEffect(() => {
    const k = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <div className="rf-lightbox" role="dialog" aria-modal="true" aria-label="Comprobante" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <button type="button" className="rf-lightbox-x" aria-label="Cerrar comprobante" onClick={onClose}>×</button>
      {err ? <div className="feedback-error">{err}</div>
        : !url ? <span className="spinner" aria-label="Cargando" />
          : isPdf ? <iframe className="rf-lightbox-pdf" src={url} title="Comprobante PDF" />
            : <img className="rf-lightbox-img" src={url} alt="Comprobante de pago" />}
      <small className="rf-lightbox-meta">Subido el {api.fmtDate(proof.created_at)} · {isPdf ? 'PDF' : proof.mime.split('/')[1].toUpperCase()} · {Math.round(proof.size_bytes / 1024)} KB</small>
    </div>
  );
}

const STATE_BTNS = [
  { key: 'apartado', label: 'Apartado', cls: 'blue', match: ['pending', 'rejected'] },
  { key: 'revisando', label: 'Revisando', cls: 'orange', match: ['review'] },
  { key: 'validado', label: 'Validado', cls: 'green', match: ['confirmed'] },
];

function EntryDetail({ id, onClose }) {
  const [e, setE] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [reject, setReject] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [ask, setAsk] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [del, setDel] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(true);
  const [copied, setCopied] = useState(false);
  const [op] = useState(() => ({ confirm: uuid(), reject: uuid(), cancel: uuid() }));
  const load = useCallback(() => api.adminEntry(id).then((x) => { setE(x); setNotes(x?.admin_notes || ''); setNotesSaved(true); }).catch((err) => setError(err.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const k = (ev) => ev.key === 'Escape' && !viewer && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose, viewer]);
  const run = async (fn, msg) => { setBusy(true); setError(''); setOk(''); try { await fn(); setOk(msg); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const fmt = fmtOf(e);
  const saveNotes = async () => { if (notesSaved || !e) return; try { await api.adminNote(e.id, notes); setNotesSaved(true); } catch (err) { setError(err.message); } };
  const ticketUrl = e?.access_token ? api.entryUrl(e.access_token) : '';
  const copyTicket = async () => { try { await navigator.clipboard.writeText(ticketUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sin portapapeles */ } };
  const live = e && ['pending', 'rejected', 'review', 'confirmed'].includes(e.status);
  const lastProof = e?.proofs?.[0];
  const phoneDigits = (e?.phone || '').replace(/\D/g, '');
  const pickState = (k) => {
    if (!e || STATE_BTNS.find((b) => b.key === k).match.includes(e.status)) return;
    if (k === 'validado') setAsk(true);
    else if (k === 'apartado') setReject({ reason: '', mode: 'resend', hours: 8 });
    else setError('“Revisando” se activa solo cuando el participante sube el comprobante.');
  };
  return (
    <div className="rf-drawer" role="dialog" aria-modal="true" aria-label="Detalles de la participación" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="card rf-drawer-in rf-detail">
        <div className="rf-detail-head"><h3>Detalles</h3><button type="button" className="mini-btn" aria-label="Cerrar" onClick={onClose}>×</button></div>
        {!e ? <div className="cm-loading">{error ? <div className="feedback-error">{error}</div> : <span className="spinner xs" />}</div> : <>
          <div className="rf-detail-who"><b>{e.name}</b><small className="rf-code">{e.code.toUpperCase()}</small></div>
          <ul className="rf-detail-rows">
            <li><Icon name="clipboard" size={20} /><span className="rf-detail-nums">{e.numbers.map((n) => <span key={n}>{fmt(n)}</span>)}</span></li>
            <li><Icon name="clock" size={20} /><span>{api.fmtDate(e.created_at)}{e.expires_at && ['pending', 'rejected'].includes(e.status) ? <small> · vence {api.fmtDate(e.expires_at)}</small> : null}</span></li>
            <li><span className="rf-detail-ico">$</span><span>{api.money(e.total_cents)}</span></li>
            <li><Icon name="message" size={20} /><span>{e.phone || '—'}</span>
              {phoneDigits && <><a className="rf-detail-act wa" href={'https://wa.me/' + phoneDigits} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp" title="WhatsApp">WA</a>
                <a className="rf-detail-act" href={'tel:' + phoneDigits} aria-label="Llamar" title="Llamar">📞</a></>}</li>
            <li><Icon name="send" size={20} /><span>Correo del participante: <a href={'mailto:' + e.email}>{e.email}</a></span></li>
          </ul>

          <h4>Estado</h4>
          {live ? (
            <div className="rf-states" role="group" aria-label="Estado de la participación">
              {STATE_BTNS.map((b) => { const on = b.match.includes(e.status); return (
                <button key={b.key} type="button" className={'rf-state ' + b.cls + (on ? ' on' : '')} aria-pressed={on} disabled={busy} onClick={() => pickState(b.key)}>
                  <i aria-hidden /> {b.label}{on && e.status === 'rejected' ? ' (rechazado)' : ''}</button>); })}
            </div>
          ) : <Chip map={api.ENTRY_STATUS} value={e.status} />}
          {e.reject_reason && e.status === 'rejected' && <small className="rf-muted">Último rechazo: {e.reject_reason}</small>}
          {reject && (
            <div className="card cm-report">
              <b>Volver a Apartado (rechazar el comprobante)</b>
              <label className="field"><span>Motivo (lo ve el participante)</span><div className="pink-input"><input autoFocus value={reject.reason} maxLength={300} placeholder="Ej.: el importe no coincide" onChange={(ev) => setReject({ ...reject, reason: ev.target.value })} /></div></label>
              <label className="nb-pref"><input type="radio" name="rmode" checked={reject.mode === 'resend'} onChange={() => setReject({ ...reject, mode: 'resend' })} /> Dejar reenviar con nuevo plazo de
                <input className="rf-hours" type="number" min={1} max={720} value={reject.hours} onChange={(ev) => setReject({ ...reject, hours: Number(ev.target.value) })} aria-label="Horas" /> h</label>
              <label className="nb-pref"><input type="radio" name="rmode" checked={reject.mode === 'release'} onChange={() => setReject({ ...reject, mode: 'release' })} /> Liberar los números</label>
              <div className="modal-actions"><button type="button" className="btn text" onClick={() => setReject(null)}>Volver</button>
                <button type="button" className="btn primary" disabled={busy || reject.reason.trim().length < 3} onClick={() => run(() => api.adminReject(id, reject.reason, reject.mode, reject.hours, op.reject), 'Comprobante rechazado; se avisó por correo.').then(() => { setReject(null); api.adminMailFlush(id).catch(() => {}); })}>Rechazar</button></div>
            </div>)}

          <div className="rf-notes">
            <label htmlFor="rf-notes-in"><b>Notas privadas</b> <small className="rf-muted">{notesSaved ? 'Solo las ven los admins' : 'Sin guardar…'}</small></label>
            <textarea id="rf-notes-in" rows={2} maxLength={2000} placeholder="Agregar notas" value={notes} onChange={(ev) => { setNotes(ev.target.value); setNotesSaved(false); }} onBlur={saveNotes} />
          </div>

          {lastProof ? (
            <div className="rf-proofcard">
              <div><b><Icon name="image" size={18} /> Comprobante</b>{lastProof.status === 'rejected' && <span className="rf-proof-rej">rechazado</span>}</div>
              <small>Subido el {api.fmtDate(lastProof.created_at, false)}</small>
              <button type="button" className="rf-proof-open" onClick={() => setViewer(lastProof)}>Abrir</button>
              {e.proofs.length > 1 && (
                <details className="rf-proof-old"><summary>Comprobantes anteriores ({e.proofs.length - 1})</summary>
                  {e.proofs.slice(1).map((p) => <button key={p.id} type="button" className="cm-link" onClick={() => setViewer(p)}>{api.fmtDate(p.created_at)}{p.reason ? ` · rechazado: ${p.reason}` : ''}</button>)}
                </details>)}
            </div>
          ) : <div className="rf-proofcard empty"><b><Icon name="image" size={18} /> Comprobante</b><small>Todavía no subió el comprobante.</small></div>}

          {error && <div className="feedback-error" role="alert">{error}</div>}
          {ok && <div className="cm-ok" role="status">{ok}</div>}

          <div className="rf-detail-foot">
            <button type="button" className="rf-foot-btn" onClick={copyTicket} disabled={!ticketUrl} title="Copiar el enlace del ticket"><Icon name={copied ? 'check' : 'link'} size={18} /> {copied ? 'Copiado' : 'Copiar enlace'}</button>
            {ticketUrl && <a className="rf-foot-btn" href={ticketUrl} target="_blank" rel="noopener noreferrer"><Icon name="clipboard" size={18} /> Abrir ticket</a>}
            {!['cancelled', 'expired'].includes(e.status) && <button type="button" className="rf-foot-btn danger" disabled={busy} onClick={() => setCancel({ reason: '' })}><Icon name="x" size={18} /> Cancelar reserva</button>}
            {['cancelled', 'expired'].includes(e.status) && <button type="button" className="rf-foot-btn danger" disabled={busy} onClick={() => setDel(true)}><Icon name="trash" size={18} /> Borrar registro</button>}
          </div>
          {cancel && (
            <div className="card cm-report">
              <label className="field"><span>Motivo de la cancelación (lo recibe el participante)</span><div className="pink-input"><input autoFocus value={cancel.reason} maxLength={300} onChange={(ev) => setCancel({ reason: ev.target.value })} /></div></label>
              <p className="rf-muted">Los números {e.numbers.map(fmt).join(', ')} vuelven a quedar libres.</p>
              <div className="modal-actions"><button type="button" className="btn text" onClick={() => setCancel(null)}>Volver</button>
                <button type="button" className="btn primary" disabled={busy || cancel.reason.trim().length < 3} onClick={() => run(async () => {
                  await api.adminCancel(id, cancel.reason, op.cancel);
                  setCancel(null);
                  await api.adminMailFlush(id).catch(() => {});
                }, 'Reserva cancelada. Revisá el estado del aviso en Correos e historial.')}>Cancelar reserva</button></div>
            </div>)}

          <details className="rf-more">
            <summary>Correos e historial</summary>
            {e.mails.length === 0 ? <small className="cm-date">Sin correos.</small> : e.mails.map((m) => (
              <div key={m.id} className="ap-row"><small className="cm-date">{{ reserved: 'Reserva', confirmed: 'Confirmación', rejected: 'Rechazo', reminder: 'Recordatorio', expired: 'Vencimiento', cancelled: 'Cancelación' }[m.kind]} · {{ queued: 'en cola', sending: 'enviando', sent: 'enviado', failed: 'falló' }[m.status]}{m.last_error ? ` (${m.last_error})` : ''} · {api.fmtDate(m.sent_at || m.created_at)}</small></div>))}
            <div className="rf-actions">
              {e.status === 'cancelled'
                ? <button type="button" className="btn text" disabled={busy} onClick={() => run(() => api.adminResend(id, 'cancelled', uuid()), 'Revisá el estado del aviso en Correos e historial.')}>Enviar aviso de cancelación</button>
                : <button type="button" className="btn text" disabled={busy} onClick={() => run(() => api.adminResend(id, 'reserved', uuid()), 'Correo de participación reenviado.')}>Reenviar enlace por correo</button>}
              {e.status === 'confirmed' && <button type="button" className="btn text" disabled={busy} onClick={() => run(() => api.adminResend(id, 'confirmed', uuid()), 'Correo de confirmación reenviado.')}>Reenviar confirmación</button>}
            </div>
            <ol className="rf-history">{e.events.map((v, i) => <li key={i}><small>{api.fmtDate(v.created_at)}</small> {EVENT[v.kind] || v.kind}{v.detail?.reason ? `: ${v.detail.reason}` : ''}{v.actor ? <small> · Acción de {v.actor}</small> : ''}</li>)}</ol>
          </details>
        </>}
        <Confirm open={del} danger title="¿Borrar este registro?" text="Se borra la participación cancelada o vencida y su comprobante. No se puede deshacer." yes="Borrar"
          onYes={async () => { setDel(false); try { await api.adminDeleteEntries(e.raffle_id, e.id); onClose(); } catch (err) { setError(err.message); } }} onNo={() => setDel(false)} />
        <Confirm open={ask} title="¿Validar el pago?" text={e ? `Confirmás que se acreditaron ${api.money(e.total_cents)} por los números ${e.numbers.map(fmt).join(', ')}. Se habilitan los tickets y se avisa por correo.` : ''} yes="Sí, validar"
          onYes={() => { setAsk(false); run(() => api.adminConfirm(id, op.confirm), 'Pago validado; tickets habilitados.').then(() => api.adminMailFlush(id).catch(() => {})); }} onNo={() => setAsk(false)} />
      </div>
      {viewer && <ProofViewer proof={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

function WinnersForm({ raffle }) {
  const prizes = raffle.prizes?.length ? raffle.prizes : ['Premio'];
  const [nums, setNums] = useState(() => prizes.map((_, i) => (raffle.winners?.[i] ? String(raffle.winners[i].number) : '')));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({});
  const [result, setResult] = useState(null);
  const fmt = fmtOf(raffle);
  const save = async () => {
    setBusy(true); setMsg({});
    try {
      const list = nums.map((n) => n.trim()).filter((n, i, all) => all.slice(i).some(Boolean)); // quita vacíos del final
      if (list.some((n) => !/^\d+$/.test(n))) throw new Error('Completá los números en orden (sin dejar premios vacíos en el medio).');
      const r = await api.adminSetWinners(raffle.id, list.map(Number));
      setResult(r.winners); setMsg({ ok: r.winners.length ? 'Ganadores informados: ya se ven en la página de Rifas y en el talonario.' : 'Ganadores borrados.' });
    } catch (e) { setMsg({ err: e.message }); } finally { setBusy(false); }
  };
  return (
    <div className="card cm-composer rf-winform">
      <h4><Icon name="trophy" size={16} /> Informar ganadores</h4>
      <small className="cm-date">Cargá el número que salió para cada premio (por ejemplo, los últimos 2 dígitos de la Quiniela). En público se muestra solo el nombre y la inicial del apellido.</small>
      {prizes.map((p, i) => (
        <label key={i} className="rf-winrow"><span className="rf-place">{i + 1}°</span><span className="rf-winprize">{p}</span>
          <div className="pink-input"><input inputMode="numeric" value={nums[i]} placeholder={fmt(raffle.num_from)} aria-label={`Número ganador del ${i + 1}° premio`}
            onChange={(e) => setNums(nums.map((x, j) => (j === i ? e.target.value.replace(/\D/g, '') : x)))} /></div></label>))}
      {result?.length > 0 && <ul className="rf-winpreview">{result.map((w) => <li key={w.place}>{w.place}° · N° {w.number} · <b>{w.name || 'número no vendido'}</b></li>)}</ul>}
      {msg.ok && <div className="cm-ok" role="status">{msg.ok}</div>}
      {msg.err && <div className="feedback-error" role="alert">{msg.err}</div>}
      <div className="rf-actions"><button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Informar ganadores'}</button></div>
    </div>
  );
}

const PROOF_STATUS = { pending: { label: 'Para revisar', cls: 'cat', icon: 'search' }, accepted: { label: 'Aceptado', cls: 'ok', icon: 'check' }, rejected: { label: 'Rechazado', cls: 'err', icon: 'x' } };

const EVENT = { entries_deleted: 'Registros borrados', note: 'Nota privada editada', winners: 'Ganadores informados', reserved: 'Reservó', proof_uploaded: 'Adjuntó comprobante', rejected: 'Comprobante rechazado', confirmed: 'Pago confirmado', expired: 'Venció sin comprobante', cancelled: 'Cancelada', mail_resend: 'Correo reenviado' };

function Manual({ raffle, onDone }) {
  const [f, setF] = useState({ numbers: '', name: '', email: '', phone: '', confirm: true, ref: '' });
  const [op, setOp] = useState(uuid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (x) => setF((c) => ({ ...c, ...x }));
  const numbers = [...new Set(f.numbers.split(/[^0-9]+/).filter(Boolean).map(Number))];
  const save = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.adminManual(raffle.id, { ...f, numbers, method: 'transfer' }, op);
      if (r.confirm && !r.confirm.ok) throw new Error('Reservada, pero no se pudo confirmar: ' + r.confirm.error);
      setOp(uuid()); api.adminMailFlush(r.entry_id).catch(() => {}); onDone();
    } catch (e) { setError(e.data?.taken ? `Ocupados: ${e.data.taken.map(fmtOf(raffle)).join(', ')}` : e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card cm-composer">
      <h4>Nuevo participante</h4>
      <small className="cm-date">Para pedidos que te llegan por otro canal. Mismas reglas que el talonario (rango, disponibilidad, máximo).</small>
      <label className="field"><span>Números (separados por coma o espacio)</span><div className="pink-input"><input autoFocus value={f.numbers} inputMode="numeric" placeholder="7, 8, 15" onChange={(e) => set({ numbers: e.target.value })} /></div></label>
      <div className="cm-row">
        <label className="field"><span>Nombre</span><div className="pink-input"><input value={f.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} /></div></label>
        <label className="field"><span>Teléfono</span><div className="pink-input"><input type="tel" value={f.phone} maxLength={24} onChange={(e) => set({ phone: e.target.value })} /></div></label>
        <label className="field"><span>Email</span><div className="pink-input"><input type="email" value={f.email} maxLength={120} onChange={(e) => set({ email: e.target.value })} /></div></label>
      </div>
      <label className="nb-pref"><input type="checkbox" checked={f.confirm} onChange={(e) => set({ confirm: e.target.checked })} /> Ya verifiqué la acreditación: validar el pago ahora</label>
      {f.confirm && <label className="field"><span>Referencia del pago (opcional)</span><div className="pink-input"><input value={f.ref} maxLength={80} onChange={(e) => set({ ref: e.target.value })} /></div></label>}
      <p className="rf-muted">Total: {api.money(raffle.price_cents * numbers.length)}</p>
      {error && <div className="feedback-error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn primary" disabled={busy || !numbers.length || f.name.trim().length < 2} onClick={save}>{busy ? 'Guardando…' : 'Registrar participante'}</button></div>
    </div>
  );
}

function Closing({ raffle, reload }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const [op, setOp] = useState(uuid);
  const load = useCallback(() => api.adminCloseSummary(raffle.id).then(setS).catch((e) => setError(e.message)), [raffle.id]);
  useEffect(() => { load(); }, [load]);
  if (!s) return <div className="cm-loading">{error ? <div className="feedback-error">{error}</div> : <span className="spinner xs" />}</div>;
  const fmt = fmtOf(raffle);
  const closed = s.status === 'closed' || s.status === 'archived';
  const close = async () => { setError(''); try { await api.adminClose(raffle.id, true); setOk('Rifa cerrada.'); reload(); load(); } catch (e) { setError(e.message); } };
  const generate = async () => {
    setError(''); setOk('');
    try { const r = await api.adminExportCreate(raffle.id, reason, op); setOp(uuid()); setReason(''); setOk(`Padrón versión ${r.version} generado (${r.row_count} números).`); load(); } catch (e) { setError(e.message); }
  };
  const download = async (x) => { try { const d = await api.adminExportGet(x.id); api.downloadText(d.filename, d.csv); } catch (e) { setError(e.message); } };
  return (
    <div className="rf-close">
      <h3 className="rf-h">Cierre y padrón</h3>
      <p className="rf-muted">El sorteo se hace por fuera de BATBOX: acá cerrás la rifa y descargás el CSV con los números validados.</p>
      <div className="rf-summary card">
        <div><small>Números validados que van al archivo</small><b>{s.confirmed_numbers}</b></div>
        <div><small>Participaciones validadas</small><b>{s.confirmed_entries}</b></div>
        <div><small>Por resolver</small><b>{s.review.length + s.pending.length}</b></div>
      </div>
      {s.review.length > 0 && <div className="admin-warn"><Icon name="alert" size={16} /> <span><b>{s.review.length} con comprobante en revisión</b> (no entran al padrón hasta validarlos o rechazarlos): {s.review.map((e) => `${e.name} (${e.numbers.map(fmt).join(', ')})`).join(' · ')}</span></div>}
      {s.pending.length > 0 && <div className="admin-warn"><Icon name="clock" size={16} /> <span><b>{s.pending.length} apartados sin comprobante</b>{closed ? '' : ' se cancelan al cerrar'}: {s.pending.map((e) => `${e.name} (${e.numbers.map(fmt).join(', ')})`).join(' · ')}</span></div>}
      {error && <div className="feedback-error" role="alert">{error}</div>}
      {ok && <div className="cm-ok" role="status">{ok}</div>}
      {!closed && ['published', 'paused'].includes(s.status) && <button type="button" className="btn rf-danger" onClick={() => setAsk(true)}><Icon name="lock" size={16} /> Cerrar rifa</button>}
      {closed && (
        <div className="card cm-composer">
          <h4>Padrón para el sorteo externo</h4>
          <small className="cm-date">Una fila por número validado. Cada versión queda congelada: volver a descargarla da exactamente el mismo archivo (huella SHA-256).</small>
          {s.exports.length > 0 && <label className="field"><span>Motivo de la corrección (obligatorio para una nueva versión)</span><div className="pink-input"><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></div></label>}
          <button type="button" className="btn primary" disabled={s.review.length > 0 || s.pending.length > 0} onClick={generate}>{s.exports.length ? 'Generar nueva versión' : 'Generar padrón'}</button>
          {s.exports.map((x) => (
            <div key={x.id} className="cm-mod-head ap-row"><span><b>v{x.version}</b> · {x.row_count} números · {x.profile === 'rifary' ? 'formato Rifary' : 'provisional'} · {api.fmtDate(x.created_at)}{x.created_by ? ` · ${x.created_by}` : ''}{x.reason ? ` · Motivo: ${x.reason}` : ''}<br /><small className="cm-date rf-code">SHA-256 {x.sha256.slice(0, 16)}…</small></span>
              <button type="button" className="btn ghost" onClick={() => download(x)}><Icon name="download" size={16} /> CSV</button></div>))}
        </div>)}
      {closed && <WinnersForm raffle={raffle} />}
      <Confirm open={ask} danger title="¿Cerrar la rifa?" yes="Cerrar"
        text={`Se frenan las reservas nuevas.${s.pending.length ? ` Se cancelan ${s.pending.length} apartados sin comprobante y sus números se liberan.` : ''}${s.review.length ? ` Quedan ${s.review.length} comprobantes por revisar antes de generar el padrón.` : ''} Van ${s.confirmed_numbers} números validados.`}
        onYes={() => { setAsk(false); close(); }} onNo={() => setAsk(false)} />
    </div>
  );
}
