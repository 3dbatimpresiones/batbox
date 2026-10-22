import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  STATUSES, addTask, balanceOf, daysUntil, deleteTask, exportCsv, loadNote, monthOf, monthStats,
  patchOrder, patchTask, productKey, profitOf, saveNote, statusOf, todayISO, useOrders,
} from '../lib/ordersApi.js';
import { norm } from '../lib/text.js';
import Icon from '../components/Icon.jsx';
import AccessPanel from '../components/AccessPanel.jsx';
import OrderEditor from '../components/OrderEditor.jsx';
import { MonthlyIncome, TopProducts, monthLabel } from '../components/OrderCharts.jsx';
import { Empty, Options, PageHead, SearchInput } from '../components/ui.jsx';
import '../styles/orders.css';

// =====================================================================
// CONTROL DE PEDIDOS (Makers Club). Pedidos del mes con cliente, seña, estado y
// entrega; avisos de vencimiento; compras y diseños pendientes; gráficos;
// notas del mes y galería. Todo guardado en la cuenta (migración 009).
// =====================================================================

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const shiftMonth = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmtDay = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—');
const FILTERS = [{ value: 'all', label: 'Todos' }, ...STATUSES.map((s) => ({ value: s.id, label: s.label })), { value: 'cobrar', label: 'Por cobrar' }];

// Cartel de vencimiento de un pedido no entregado.
function dueInfo(o) {
  if (o.status === 'entregado' || !o.delivery_date) return null;
  const d = daysUntil(o.delivery_date);
  if (d < 0) return { cls: 'err', text: d === -1 ? 'Atrasado 1 día' : `Atrasado ${-d} días` };
  if (d === 0) return { cls: 'warn', text: 'Se entrega hoy' };
  if (d <= 3) return { cls: 'warn', text: d === 1 ? 'Mañana' : `En ${d} días` };
  return null;
}

export default function Orders() {
  const { isMember, access } = useAuth();
  if (access === 'loading') return <div className="empty"><div className="spinner" /></div>;
  if (!isMember) {
    return (
      <div className="club-locked">
        <div className="club-locked-head">
          <div className="section-label">MAKERS CLUB · HERRAMIENTA</div>
          <h1>Control de Pedidos</h1>
          <p className="ol-lead">Organizá los pedidos de tu emprendimiento: clientes, señas, entregas y ganancia del mes. Es una herramienta exclusiva de Makers Club.</p>
        </div>
        <AccessPanel intro="Herramienta solo para miembros" />
      </div>
    );
  }
  return <OrdersApp />;
}

function OrdersApp() {
  const { notify } = useAuth();
  const { orders, tasks, loading, missing, error, reload } = useOrders();
  const [month, setMonth] = useState(monthOf());
  const [scope, setScope] = useState('month'); // 'month' | 'all'
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const monthOrders = useMemo(() => orders.filter((o) => monthOf(o.order_date) === month), [orders, month]);
  const stats = useMemo(() => monthStats(monthOrders), [monthOrders]);

  // Avisos: pedidos sin entregar atrasados o que vencen en 3 días (de cualquier mes).
  const alerts = useMemo(() => orders.map((o) => ({ o, due: dueInfo(o) })).filter((x) => x.due)
    .sort((a, b) => a.o.delivery_date.localeCompare(b.o.delivery_date)), [orders]);

  const list = useMemo(() => {
    const words = norm(q.trim()).split(/\s+/).filter(Boolean);
    return (scope === 'all' || words.length ? orders : monthOrders)
      .filter((o) => (filter === 'all' ? true : filter === 'cobrar' ? balanceOf(o) > 0 : o.status === filter))
      .filter((o) => words.every((w) => norm([o.product, o.client_name, o.client_contact, o.notes].join(' ')).includes(w)));
  }, [orders, monthOrders, scope, filter, q]);

  const top = useMemo(() => {
    const m = new Map();
    for (const o of monthOrders) {
      const k = productKey(o.product);
      const r = m.get(k) || { key: k, units: 0, income: 0, count: 0 };
      r.units += Number(o.quantity) || 0; r.income += Number(o.price) || 0; r.count += 1;
      m.set(k, r);
    }
    const rows = [...m.values()].sort((a, b) => b.units - a.units);
    if (rows.length <= 7) return rows;
    const rest = rows.slice(6).reduce((a, r) => ({ key: 'Otros', units: a.units + r.units, income: a.income + r.income, count: a.count + r.count }), { key: 'Otros', units: 0, income: 0, count: 0 });
    return [...rows.slice(0, 6), rest];
  }, [monthOrders]);

  const monthly = useMemo(() => {
    const last = monthOf() > month ? monthOf() : month;
    return Array.from({ length: 12 }, (_, i) => shiftMonth(last, i - 11)).map((m) => {
      const s = monthStats(orders.filter((o) => monthOf(o.order_date) === m));
      return { month: m, income: s.income, profit: s.profit, count: s.count };
    });
  }, [orders, month]);

  const products = useMemo(() => orders.map((o) => o.product), [orders]);
  const gallery = monthOrders.filter((o) => o.imageUrl);

  const quick = async (id, patch, okText) => {
    try { await patchOrder(id, patch); if (okText) notify('ok', okText); reload(); } catch (e) { notify('err', e.message); }
  };

  if (loading) return <div className="empty"><div className="spinner" /></div>;
  if (missing) return <Empty icon="alert" title="Falta activar el Control de Pedidos" text="El administrador tiene que correr la migración supabase/009_batbox_pedidos.sql en Supabase." />;
  if (error) return <Empty icon="alert" title="No pudimos cargar tus pedidos" text="Revisá tu conexión y recargá la página." />;

  return (
    <div className="orders">
      <PageHead icon="clipboard" label="MAKERS CLUB · HERRAMIENTA" title="Control de Pedidos"
        text="Tus pedidos, clientes, señas y entregas en un solo lugar. Solo vos ves tus datos." />

      <div className="card ord-bar">
        <div className="ord-month" role="group" aria-label="Mes">
          <button className="mini-btn" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mes anterior"><Icon name="arrowLeft" size={16} /></button>
          <strong>{monthLabel(month, true)}</strong>
          <button className="mini-btn" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Mes siguiente"><Icon name="arrowRight" size={16} /></button>
          {month !== monthOf() && <button className="chip-btn" onClick={() => setMonth(monthOf())}>Ir a este mes</button>}
        </div>
        <div className="ord-actions">
          <button className="btn ghost" onClick={() => exportCsv(scope === 'all' ? orders : monthOrders, `pedidos-${scope === 'all' ? 'todos' : month}.csv`)}
            disabled={!(scope === 'all' ? orders : monthOrders).length}>
            <Icon name="newspaper" size={16} /> Exportar a Excel
          </button>
          <button className="btn primary" onClick={() => setEditing({ order_date: month === monthOf() ? todayISO() : month + '-01' })}>
            <Icon name="sparkles" size={16} /> Nuevo pedido
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <section className="ord-alerts card" aria-label="Avisos de entrega">
          <div className="oa-head"><Icon name="alert" size={18} /> <b>{alerts.length === 1 ? '1 pedido necesita atención' : `${alerts.length} pedidos necesitan atención`}</b></div>
          <div className="oa-list">
            {alerts.slice(0, 6).map(({ o, due }) => (
              <button key={o.id} className="oa-item" onClick={() => setEditing(o)}>
                <span className={'chip ' + due.cls}>{due.text}</span>
                <span className="oa-txt">{o.product}{o.client_name ? ` · ${o.client_name}` : ''}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="ord-stats" aria-label="Resumen del mes">
        <Stat label="Ingresos del mes" value={money.format(stats.income)} icon="trophy" />
        <Stat label="Ganancia" value={stats.profit == null ? '—' : money.format(stats.profit)} icon="sparkles"
          hint={stats.profit == null ? 'Cargá el costo de los pedidos' : stats.profitPartial ? 'Solo pedidos con costo' : null} />
        <Stat label="Por cobrar" value={money.format(stats.toCollect)} icon="clock" warn={stats.toCollect > 0} />
        <Stat label="Pedidos" value={stats.count} icon="clipboard" />
        <Stat label="Unidades" value={stats.units.toLocaleString('es-AR')} icon="box" />
      </section>

      <section className="block tight">
        <div className="card filters">
          <div className="filter-row">
            <SearchInput value={q} onChange={setQ} placeholder="Buscar por producto, cliente o nota…" />
            <div className="view-toggle" role="group" aria-label="Qué pedidos ver">
              <button className={'seg' + (scope === 'month' ? ' active' : '')} onClick={() => setScope('month')}>Este mes</button>
              <button className={'seg' + (scope === 'all' ? ' active' : '')} onClick={() => setScope('all')}>Todos</button>
            </div>
          </div>
          <div className="filter-row"><Options value={filter} onChange={setFilter} options={FILTERS} /></div>
        </div>

        {!list.length ? (
          <Empty icon="clipboard" title={orders.length ? 'No hay pedidos con ese filtro' : 'Todavía no cargaste pedidos'}
            text={orders.length ? 'Probá con otro filtro, otro mes o "Todos".' : 'Tocá "Nuevo pedido" para cargar el primero.'} />
        ) : (
          <div className="ord-list">
            {list.map((o) => <OrderRow key={o.id} o={o} onEdit={() => setEditing(o)} onPatch={quick} showMonth={scope === 'all' || !!q.trim()} />)}
          </div>
        )}
      </section>

      <div className="ord-two">
        <TaskList kind="compra" title="Compras pendientes" icon="box" tasks={tasks} reload={reload} />
        <TaskList kind="diseno" title="Diseños pendientes" icon="sparkles" tasks={tasks} reload={reload} />
      </div>

      <div className="ord-two">
        <section className="card ord-card">
          <h3 className="oc-title">Productos más pedidos <small>{monthLabel(month, true)} · unidades</small></h3>
          <TopProducts rows={top} />
        </section>
        <section className="card ord-card">
          <h3 className="oc-title">Ingresos por mes <small>últimos 12 meses · tocá un mes para verlo</small></h3>
          <MonthlyIncome rows={monthly} selected={month} onSelect={setMonth} />
        </section>
      </div>

      <MonthNotes month={month} />

      {gallery.length > 0 && (
        <section className="block">
          <h3 className="oc-title">Galería de {monthLabel(month, true).toLowerCase()}</h3>
          <div className="ord-gallery">
            {gallery.map((o) => (
              <button key={o.id} className="og-item" onClick={() => setEditing(o)}>
                <img src={o.imageUrl} alt={o.product} loading="lazy" />
                <span>{o.product}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {editing && (
        <OrderEditor order={editing.id ? editing : { ...editing }} products={products}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function Stat({ label, value, icon, hint, warn }) {
  return (
    <div className={'card ord-stat' + (warn ? ' warn' : '')}>
      <span className="card-icon"><Icon name={icon} size={18} /></span>
      <span className="os-txt">
        <small>{label}</small>
        <strong>{value}</strong>
        {hint && <em>{hint}</em>}
      </span>
    </div>
  );
}

function OrderRow({ o, onEdit, onPatch, showMonth }) {
  const st = statusOf(o.status);
  const due = dueInfo(o);
  const bal = balanceOf(o);
  const profit = profitOf(o);
  return (
    <article className={'card ord-row' + (o.status === 'entregado' ? ' done' : '')}>
      <button className="or-thumb" onClick={onEdit} aria-label={`Editar ${o.product}`}>
        {o.imageUrl ? <img src={o.imageUrl} alt="" loading="lazy" /> : <Icon name="box" size={20} />}
      </button>
      <div className="or-main">
        <button className="or-title" onClick={onEdit}>{o.product}</button>
        <span className="or-sub">
          {o.client_name || 'Sin cliente'}{o.client_contact ? ` · ${o.client_contact}` : ''}
          {showMonth && ` · ${fmtDay(o.order_date)}`}
        </span>
      </div>
      <div className="or-qty"><small>Cant.</small><b>{o.quantity}</b></div>
      <div className="or-money">
        <b>{money.format(o.price)}</b>
        {bal > 0
          ? <button className="or-collect" onClick={() => onPatch(o.id, { paid: true }, 'Marcado como cobrado')} title="Marcar como cobrado">Debe {money.format(bal)}</button>
          : <small className="c-ok">Cobrado</small>}
        {profit != null && <small>Ganancia {money.format(profit)}</small>}
      </div>
      <div className="or-date">
        <small>Entrega</small>
        <b>{fmtDay(o.delivery_date)}</b>
        {due && <span className={'chip ' + due.cls}>{due.text}</span>}
      </div>
      <label className={'or-status chip ' + st.cls}>
        <span className="sr-only">Estado</span>
        <select value={o.status} onChange={(e) => onPatch(o.id, { status: e.target.value })}>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <button className="mini-btn or-edit" onClick={onEdit} aria-label={`Editar ${o.product}`}><Icon name="edit" size={14} /></button>
    </article>
  );
}

function TaskList({ kind, title, icon, tasks, reload }) {
  const { notify } = useAuth();
  const [text, setText] = useState('');
  const mine = tasks.filter((t) => t.kind === kind);
  const run = async (fn) => { try { await fn(); reload(); } catch (e) { notify('err', e.message); } };
  const add = (e) => { e.preventDefault(); if (!text.trim()) return; const t = text; setText(''); run(() => addTask(kind, t)); };
  const doneCount = mine.filter((t) => t.done).length;
  return (
    <section className="card ord-card">
      <h3 className="oc-title"><Icon name={icon} size={16} /> {title} <small>{mine.length - doneCount === 1 ? '1 pendiente' : `${mine.length - doneCount} pendientes`}</small></h3>
      <form className="ot-add" onSubmit={add}>
        <div className="pink-input"><input value={text} onChange={(e) => setText(e.target.value)} maxLength={300}
          placeholder={kind === 'compra' ? 'Ej: PLA negro 1 kg' : 'Ej: Logo de cliente en 3D'} aria-label={`Agregar a ${title}`} /></div>
        <button className="btn primary" type="submit" aria-label="Agregar"><Icon name="check" size={16} /></button>
      </form>
      {!mine.length ? <p className="oc-empty">Nada pendiente 🎉</p> : (
        <ul className="ot-list">
          {mine.map((t) => (
            <li key={t.id} className={t.done ? 'done' : ''}>
              <label><input type="checkbox" checked={t.done} onChange={() => run(() => patchTask(t.id, { done: !t.done }))} /> <span>{t.text}</span></label>
              <button className="mini-btn danger" onClick={() => run(() => deleteTask(t.id))} aria-label={`Borrar ${t.text}`}><Icon name="x" size={12} /></button>
            </li>
          ))}
        </ul>
      )}
      {doneCount > 0 && (
        <button className="btn text ot-clear" onClick={() => run(async () => { for (const t of mine.filter((x) => x.done)) await deleteTask(t.id); })}>
          Borrar los tachados ({doneCount})
        </button>
      )}
    </section>
  );
}

// Anotaciones del mes: se guardan solas un momento después de dejar de escribir.
function MonthNotes({ month }) {
  const { notify } = useAuth();
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const timer = useRef(null);
  const loaded = useRef(null);
  useEffect(() => {
    let alive = true;
    setStatus(''); loaded.current = null;
    loadNote(month).then((t) => { if (alive) { setText(t); loaded.current = month; } });
    return () => { alive = false; clearTimeout(timer.current); };
  }, [month]);
  const change = (v) => {
    setText(v); setStatus('Guardando…');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (loaded.current !== month) return;
      try { await saveNote(month, v); setStatus('Guardado'); } catch (e) { setStatus(''); notify('err', e.message); }
    }, 800);
  };
  return (
    <section className="card ord-card ord-notes">
      <h3 className="oc-title">Anotaciones de {monthLabel(month, true).toLowerCase()} <small aria-live="polite">{status}</small></h3>
      <div className="pink-input"><textarea rows={4} value={text} onChange={(e) => change(e.target.value)} maxLength={5000}
        placeholder="Recordatorios, insumos que faltan, ideas…" aria-label="Anotaciones del mes" /></div>
    </section>
  );
}
