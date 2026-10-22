import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { sb } from '../lib/supabase.js';
import {
  PAY_STATUS, SUB_STATUS, adminSubscriptions, daysLeft, deleteManualPayment, downloadCsv, fmtDate, linkSubscription,
  manualPayment, money, SIM_DB, SIM_SUBS, SIM_MEMBERS, syncMercadoPago,
} from '../lib/subsApi.js';
import Icon from '../components/Icon.jsx';
import { Confirm, Empty, SearchInput } from '../components/ui.jsx';
import { MonthlyIncome } from '../components/OrderCharts.jsx';
import '../styles/orders.css';

// =====================================================================
// SUSCRIPCIONES DEL MAKERS CLUB (pestaña del panel admin)
// Lo que llega de Mercado Pago (webhook mp-webhook) + pagos manuales.
// Quién paga, cuándo, hasta cuándo tiene acceso y el historial completo.
// Funciones de la base (014): bb_admin_subscriptions · bb_admin_link_subscription
//   bb_admin_manual_payment · bb_admin_delete_manual_payment
// =====================================================================

const SOON = 7; // "por vencer": 7 días o menos
const fullName = (m) => [m.first_name, m.last_name].filter(Boolean).join(' ') || 'Sin nombre';
const ym = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 7);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const ago = (d) => {
  const min = Math.round((Date.now() - new Date(d)) / 6e4);
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
};

// Estado de pago de cada miembro (para filtrar y para el chip).
function payState(r) {
  if (!r.pays.length && !r.sub) return 'none';
  const left = daysLeft(r.m.subscription_expires_at);
  if (left == null) return 'ok';
  if (left < 0) return 'late';
  if (left <= SOON) return 'soon';
  return 'ok';
}
const STATES = {
  ok: { label: 'Al día', plural: 'Al día', cls: 'ok' },
  soon: { label: 'Por vencer', plural: 'Por vencer', cls: 'warn' },
  late: { label: 'Vencido', plural: 'Vencidos', cls: 'err' },
  none: { label: 'Sin pagos', plural: 'Sin pagos', cls: 'muted' },
};

export default function AdminSubs() {
  const { notify } = useAuth();
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('paying');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    if (SIM_DB) { setData(SIM_SUBS); setMembers(SIM_MEMBERS); return; }
    try {
      const [d, m] = await Promise.all([adminSubscriptions(), sb.rpc('admin_get_all_members')]);
      if (m.error) throw new Error(m.error.message);
      setData(d); setMembers(m.data || []); setError(null);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, okText) => {
    if (SIM_DB) { notify('ok', 'Simulación: ' + okText); return true; }
    setBusy(true);
    try { await fn(); notify('ok', okText); await load(); return true; }
    catch (e) { notify('err', e.message); return false; }
    finally { setBusy(false); }
  };

  const sync = async () => {
    if (SIM_DB) { notify('ok', 'Simulación: 12 suscripciones y 30 cobros traídos'); return; }
    setSyncing(true);
    try {
      const r = await syncMercadoPago();
      if (r.subs || r.account_total == null) notify('ok', `Listo: ${r.subs} suscripciones y ${r.pays} cobros revisados`);
      else if (!r.account_total) notify('err', 'Tu cuenta de Mercado Pago no tiene ninguna suscripción. ¿El Access Token es de la cuenta que cobra el Makers Club?');
      else notify('err', `El plan del Makers Club no tiene suscripciones, pero tu cuenta tiene ${r.account_total} en otro plan: `
        + r.other_plans.map((p) => `${p.reason || 'sin nombre'} (${p.count}, id ${p.plan_id})`).join(' · '));
      await load();
    }
    catch (e) { notify('err', e.message); }
    finally { setSyncing(false); }
  };

  // Une cada miembro con su suscripción y sus pagos.
  const rows = useMemo(() => {
    if (!data) return [];
    const subsBy = {}, paysBy = {};
    for (const s of data.subscriptions) if (s.member_id) (subsBy[s.member_id] ||= []).push(s);
    for (const p of data.payments) if (p.member_id) (paysBy[p.member_id] ||= []).push(p);
    return members.map((m) => {
      const subs = subsBy[m.id] || [];
      const pays = paysBy[m.id] || [];
      const ok = pays.filter((p) => p.status === 'approved');
      const r = { m, subs, sub: subs.find((s) => s.status === 'authorized') || subs[0] || null, pays, last: ok[0] || null, total: ok.reduce((a, p) => a + Number(p.amount || 0), 0), count: ok.length };
      r.state = payState(r);
      return r;
    });
  }, [data, members]);

  const loose = useMemo(() => (data?.subscriptions || []).filter((s) => !s.member_id), [data]);
  const counts = useMemo(() => {
    const c = { ok: 0, soon: 0, late: 0, none: 0 };
    for (const r of rows) if (r.m.status === 'approved' || r.state !== 'none') c[r.state]++;
    return c;
  }, [rows]);

  const monthly = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => ym(new Date(now.getFullYear(), now.getMonth() - 11 + i, 15)));
    const by = Object.fromEntries(months.map((k) => [k, { month: k, income: 0, count: 0 }]));
    for (const p of data?.payments || []) {
      if (p.status !== 'approved' || !p.paid_at) continue;
      const k = ym(p.paid_at);
      if (by[k]) { by[k].income += Number(p.amount || 0); by[k].count++; }
    }
    return months.map((k) => by[k]);
  }, [data]);
  const [month, setMonth] = useState(() => ym(new Date()));
  const thisMonth = monthly.find((r) => r.month === month) || { income: 0, count: 0 };
  const activeSubs = (data?.subscriptions || []).filter((s) => s.status === 'authorized').length;

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (filter === 'paying' ? r.state !== 'none' : filter === 'none' ? r.state === 'none' && r.m.status === 'approved' : r.state === filter))
      .filter((r) => !needle || [r.m.email, r.m.first_name, r.m.last_name, r.m.phone, r.m.discord_username, r.m.instagram_username, r.sub?.payer_email, ...r.pays.map((p) => p.id)]
        .some((v) => v?.toLowerCase().includes(needle)))
      .sort((a, b) => (new Date(a.m.subscription_expires_at || 8.64e15) - new Date(b.m.subscription_expires_at || 8.64e15)));
  }, [rows, filter, q]);

  // Vencidos que todavía figuran como aprobados (siguen entrando hasta que se marquen).
  const lateApproved = rows.filter((r) => r.state === 'late' && r.m.status === 'approved');

  const exportMembers = () => downloadCsv(
    ['Nombre', 'Apellido', 'Correo', 'Celular', 'Discord', 'Instagram', 'Estado BATBOX', 'Situación', 'Suscripción MP', 'Correo de MP', 'Próximo cobro', 'Acceso hasta', 'Último pago', 'Pagos', 'Total pagado'],
    rows.filter((r) => r.state !== 'none' || r.m.status === 'approved').map((r) => [r.m.first_name, r.m.last_name, r.m.email, r.m.phone, r.m.discord_username, r.m.instagram_username, r.m.status,
      STATES[r.state].label, r.sub ? (SUB_STATUS[r.sub.status]?.label || r.sub.status) : '', r.sub?.payer_email, r.sub?.next_payment_date?.slice(0, 10),
      r.m.subscription_expires_at?.slice(0, 10), r.last?.paid_at?.slice(0, 10), r.count, r.total]),
    `makers-club-suscriptores-${today()}.csv`,
  );
  const exportPayments = () => {
    const byId = Object.fromEntries(members.map((m) => [m.id, m]));
    downloadCsv(['Fecha', 'Número de operación', 'Miembro', 'Correo', 'Monto', 'Estado', 'Origen', 'Meses', 'Nota'],
      (data?.payments || []).map((p) => [p.paid_at?.slice(0, 10), p.source === 'manual' ? '' : p.id, byId[p.member_id] ? fullName(byId[p.member_id]) : 'Sin unir',
        byId[p.member_id]?.email || p.payer_email, p.amount, PAY_STATUS[p.status]?.label || p.status, p.source === 'manual' ? 'Manual' : 'Mercado Pago', p.months, p.notes]),
      `makers-club-pagos-${today()}.csv`);
  };

  if (error) return <Empty icon="alert" title="No se pudieron cargar las suscripciones" text={error} />;
  if (!data) return <div className="empty"><div className="spinner" /></div>;
  const selRow = sel && rows.find((r) => r.m.id === sel);
  const ev = data.last_event;

  return (
    <div className="subs">
      <div className="subs-bar card">
        <div className="sb-info">
          <span className={'sb-dot ' + (!ev ? 'off' : ev.ok ? 'on' : 'bad')} />
          <span>
            {ev ? <>Último aviso de Mercado Pago: <b>{ago(ev.at)}</b>{!ev.ok && <> · <span className="t-err">con error: {ev.detail}</span></>}</>
              : 'Todavía no llegó ningún aviso de Mercado Pago.'}
          </span>
        </div>
        <div className="sb-actions">
          <button className="btn ghost" onClick={sync} disabled={syncing}><Icon name="refresh" size={16} /> {syncing ? 'Trayendo…' : 'Traer de Mercado Pago'}</button>
          <button className="btn ghost" onClick={exportMembers}><Icon name="clipboard" size={16} /> Exportar suscriptores</button>
          <button className="btn ghost" onClick={exportPayments}><Icon name="clipboard" size={16} /> Exportar pagos</button>
        </div>
      </div>

      <div className="member-stats subs-stats">
        <div className="mstat static"><b className="c-cyan">{activeSubs}</b><span>Suscripciones activas</span></div>
        {Object.entries(STATES).map(([k, s]) => (
          <button key={k} className={`mstat t-${s.cls}` + (filter === k ? ' active' : '')} onClick={() => setFilter(filter === k ? 'paying' : k)}>
            <b>{counts[k]}</b><span>{s.plural}</span>
          </button>
        ))}
        <div className="mstat static"><b className="c-ok">{money(thisMonth.income)}</b><span>Cobrado en {month === ym(new Date()) ? 'este mes' : 'el mes elegido'}</span></div>
      </div>

      <section className="card subs-chart">
        <div className="section-label">COBROS POR MES</div>
        {monthly.some((r) => r.income > 0)
          ? <MonthlyIncome rows={monthly} selected={month} onSelect={setMonth} unit={['cobro', 'cobros']} incomeLabel="Cobrado" />
          : <p className="ed-hint">Todavía no hay cobros registrados. Aparecen acá cuando llegan de Mercado Pago o cuando cargás un pago manual.</p>}
      </section>

      {loose.length > 0 && <LooseSubs subs={loose} members={members} payments={data.payments} busy={busy}
        onLink={(s, mid) => run(() => linkSubscription(s.id, mid), 'Suscripción unida')} />}

      {lateApproved.length > 0 && (filter === 'late' || filter === 'paying') && (
        <div className="admin-warn">
          <Icon name="alert" size={18} />
          <span>{lateApproved.length === 1 ? '1 persona venció' : `${lateApproved.length} personas vencieron`} (pasaron los 10 días de margen) y todavía tienen acceso.</span>
          <button className="btn ghost small" disabled={busy} onClick={() => setConfirm(lateApproved)}>Marcar como vencidos</button>
        </div>
      )}

      <div className="filters card">
        <div className="filter-row">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre, correo (también el de Mercado Pago), celular o número de operación…" />
          <div className="view-toggle">
            <button className={'seg' + (filter === 'paying' ? ' active' : '')} onClick={() => setFilter('paying')}>Con pagos</button>
            <button className={'seg' + (filter === 'none' ? ' active' : '')} onClick={() => setFilter('none')}>Aprobados sin pagos</button>
          </div>
        </div>
        {filter === 'none' && <p className="ed-hint">Miembros aprobados que no tienen ningún pago registrado (por ejemplo, los que cargaste a mano antes). Abrí su ficha para registrar un pago manual o unir su suscripción.</p>}
      </div>

      {!list.length ? <Empty icon="users" title="Nadie en esta lista" text={q ? 'Probá con otra búsqueda.' : filter === 'paying' ? 'Cuando lleguen los primeros pagos de Mercado Pago, aparecen acá.' : 'No hay miembros en este grupo.'} />
        : (
          <div className="admin-list">
            {list.map((r) => <SubRow key={r.m.id} r={r} onOpen={() => setSel(r.m.id)} />)}
          </div>
        )}

      {selRow && <SubDetail r={selRow} busy={busy} onClose={() => setSel(null)}
        onManual={(f) => run(() => manualPayment(selRow.m.id, f), 'Pago registrado')}
        onDelete={(p) => run(() => deleteManualPayment(p.id), 'Pago manual borrado')} />}

      <Confirm open={!!confirm} danger title="Marcar como vencidos"
        text={confirm ? `Dejan de entrar a Makers Club y al Cotizador PRO hasta que vuelvan a pagar: ${confirm.map((r) => fullName(r.m)).join(', ')}.` : ''}
        yes="Marcar vencidos" onNo={() => setConfirm(null)}
        onYes={async () => {
          const list2 = confirm; setConfirm(null);
          await run(async () => {
            for (const r of list2) {
              const { error: e } = await sb.rpc('admin_update_member_status', { p_member_id: r.m.id, p_new_status: 'expired', p_notes: 'Venció la suscripción' });
              if (e) throw new Error(e.message);
            }
          }, list2.length === 1 ? 'Marcado como vencido' : `${list2.length} marcados como vencidos`);
        }} />
    </div>
  );
}

function SubRow({ r, onOpen }) {
  const st = STATES[r.state];
  const left = daysLeft(r.m.subscription_expires_at);
  const sub = r.sub ? SUB_STATUS[r.sub.status] || { label: r.sub.status, cls: 'muted' } : null;
  return (
    <button className="member-row sub-row" onClick={onOpen}>
      <span className="avatar">{(r.m.first_name?.[0] || r.m.email?.[0] || '?').toUpperCase()}</span>
      <span className="mr-main">
        <strong>{fullName(r.m)}</strong>
        <small>{r.m.email}{r.sub?.payer_email && r.sub.payer_email.toLowerCase() !== r.m.email.toLowerCase() && <> · MP: {r.sub.payer_email}</>}</small>
        <small className="mr-social">
          {sub ? <span>Mercado Pago: {sub.label}</span> : r.pays.length ? <span>Pagos manuales</span> : null}
          {r.last && <span>Último pago {fmtDate(r.last.paid_at)} · {money(r.last.amount)}</span>}
          {r.count > 0 && <span>{r.count} {r.count === 1 ? 'pago' : 'pagos'} · {money(r.total)}</span>}
        </small>
      </span>
      <span className="mr-side">
        <span className={'chip ' + st.cls}>{st.label}</span>
        <small>{r.m.subscription_expires_at
          ? left < 0 ? `Venció el ${fmtDate(r.m.subscription_expires_at)}` : `Acceso hasta ${fmtDate(r.m.subscription_expires_at)}${left <= SOON ? ` (${left} ${left === 1 ? 'día' : 'días'})` : ''}`
          : 'Sin vencimiento'}</small>
        {r.m.status !== 'approved' && <small className="t-warn">En BATBOX: {r.m.status === 'expired' ? 'vencido' : r.m.status === 'pending' ? 'pendiente' : r.m.status === 'suspended' ? 'suspendido' : r.m.status}</small>}
      </span>
    </button>
  );
}

function SubDetail({ r, busy, onClose, onManual, onDelete }) {
  const [f, setF] = useState({ amount: r.sub?.amount || r.last?.amount || '', date: today(), months: 1, notes: '' });
  const [toDel, setToDel] = useState(null);
  const sub = r.sub;
  const how = { email: 'sola, por el correo', operacion: 'con el número de operación', admin: 'a mano (admin)' };
  const rowsInfo = [
    ['Celular', r.m.phone],
    ['Suscripción de Mercado Pago', sub ? (SUB_STATUS[sub.status]?.label || sub.status) : 'No tiene'],
    ['Correo de Mercado Pago', sub?.payer_email],
    ['Suscripto desde', sub && fmtDate(sub.date_created)],
    ['Próximo cobro', sub?.status === 'authorized' && fmtDate(sub.next_payment_date)],
    ['Monto mensual', sub?.amount && money(sub.amount)],
    ['Se unió', sub?.linked_by && how[sub.linked_by]],
    ['Acceso hasta', r.m.subscription_expires_at ? fmtDate(r.m.subscription_expires_at) + ' (incluye 10 días de margen)' : 'Sin vencimiento'],
    ['Total pagado', `${money(r.total)} en ${r.count} ${r.count === 1 ? 'pago' : 'pagos'}`],
  ].filter(([, v]) => v);
  const save = async () => {
    if (!(Number(f.amount) >= 0) || f.amount === '') return;
    if (await onManual(f)) setF((x) => ({ ...x, notes: '' }));
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide member-detail" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="md-head">
          <span className="avatar lg">{(r.m.first_name?.[0] || r.m.email?.[0] || '?').toUpperCase()}</span>
          <div><h2>{fullName(r.m)}</h2><small>{r.m.email}</small></div>
          <span className={'chip ' + STATES[r.state].cls}>{STATES[r.state].label}</span>
        </div>
        <dl className="md-rows">{rowsInfo.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>

        <div className="section-label">HISTORIAL DE PAGOS</div>
        {!r.pays.length ? <p className="ed-hint">Todavía no tiene pagos registrados.</p> : (
          <div className="pay-list">
            {r.pays.map((p) => {
              const ps = PAY_STATUS[p.status] || { label: p.status, cls: 'muted' };
              return (
                <div key={p.id} className="pay-row">
                  <span className="pr-date">{fmtDate(p.paid_at)}</span>
                  <span className="pr-amt">{money(p.amount)}</span>
                  <span className={'chip ' + ps.cls}>{ps.label}</span>
                  <small className="pr-op">{p.source === 'manual' ? `Manual · ${p.months} ${p.months === 1 ? 'mes' : 'meses'}${p.notes ? ' · ' + p.notes : ''}` : `Op. ${p.id}`}</small>
                  {p.source === 'manual' && <button className="icon-btn" title="Borrar este pago manual" disabled={busy} onClick={() => setToDel(p)}><Icon name="trash" size={15} /></button>}
                </div>
              );
            })}
          </div>
        )}

        <div className="section-label">REGISTRAR UN PAGO MANUAL</div>
        <p className="ed-hint">Para transferencias, efectivo o pagos de antes. Le da acceso por los meses que elijas (+10 días de margen).</p>
        <div className="member-form manual-pay">
          <label className="ed-field"><span className="ed-label">Monto</span>
            <div className="pink-input"><input type="number" min="0" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div></label>
          <label className="ed-field"><span className="ed-label">Fecha del pago</span>
            <div className="pink-input"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div></label>
          <label className="ed-field"><span className="ed-label">Meses que cubre</span>
            <div className="pink-input"><select value={f.months} onChange={(e) => setF({ ...f, months: Number(e.target.value) })}>
              {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'mes' : 'meses'}</option>)}
            </select></div></label>
          <label className="ed-field"><span className="ed-label">Nota</span>
            <div className="pink-input"><input maxLength={200} value={f.notes} placeholder="Ej. Transferencia" onChange={(e) => setF({ ...f, notes: e.target.value })} /></div></label>
        </div>
        <button className="btn primary wide" disabled={busy || f.amount === ''} onClick={save}>{busy ? 'Guardando…' : 'Registrar pago'}</button>

        <div className="modal-actions"><button className="btn ghost" onClick={onClose}>Cerrar</button></div>
        <Confirm open={!!toDel} danger title="Borrar pago manual" text={toDel ? `${fmtDate(toDel.paid_at)} · ${money(toDel.amount)}. El vencimiento se vuelve a calcular.` : ''}
          yes="Borrar" onNo={() => setToDel(null)} onYes={() => { const p = toDel; setToDel(null); onDelete(p); }} />
      </div>
    </div>
  );
}

// Suscripciones que no se pudieron unir solas (pagó con un correo que no está en la lista
// y todavía no puso su número de operación).
function LooseSubs({ subs, members, payments, busy, onLink }) {
  const [pick, setPick] = useState({});
  const sorted = useMemo(() => [...members].sort((a, b) => fullName(a).localeCompare(fullName(b), 'es')), [members]);
  return (
    <section className="card loose-subs">
      <div className="section-label">SIN UNIR · {subs.length}</div>
      <h3>Suscripciones que todavía no son de nadie</h3>
      <p className="ed-hint">Pagaron con un correo de Mercado Pago que no está en la lista y todavía no pusieron su número de operación. Si sabés quién es, elegilo y tocá Unir.</p>
      {subs.map((s) => {
        const ops = payments.filter((p) => p.subscription_id === s.id && p.status === 'approved');
        return (
          <div key={s.id} className="loose-row">
            <div className="lr-main">
              <strong>{s.payer_email || 'Correo no informado por Mercado Pago'}</strong>
              <small>{fmtDate(s.date_created)} · {money(s.amount)} · {SUB_STATUS[s.status]?.label || s.status}{ops[0] && <> · Op. {ops[0].id}</>}</small>
            </div>
            <div className="lr-pick">
              <div className="pink-input"><select value={pick[s.id] || ''} onChange={(e) => setPick({ ...pick, [s.id]: e.target.value })}>
                <option value="">Elegí un miembro…</option>
                {sorted.map((m) => <option key={m.id} value={m.id}>{fullName(m)} · {m.email}</option>)}
              </select></div>
              <button className="btn primary small" disabled={busy || !pick[s.id]} onClick={() => onLink(s, pick[s.id])}>Unir</button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
