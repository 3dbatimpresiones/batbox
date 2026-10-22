import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  addTask, balanceOf, daysUntil, deleteTask, exportCsv, isDelivered, isMade, loadNote, monthOf, monthStats,
  patchOrder, patchTask, productKey, saveNote, todayISO, toggleDelivered, toggleMade, useOrders,
} from '../lib/ordersApi.js';
import { norm } from '../lib/text.js';
import Icon from '../components/Icon.jsx';
import AccessPanel from '../components/AccessPanel.jsx';
import OrderEditor from '../components/OrderEditor.jsx';
import { MonthlyIncome, TopProducts, monthLabel } from '../components/OrderCharts.jsx';
import { Empty, Options, PageHead, SearchInput } from '../components/ui.jsx';
import '../styles/orders.css';

// =====================================================================
// CONTROL DE PEDIDOS (Makers Club). Simple, como una planilla: cargás qué te
// pidieron, cuánto y para cuándo, y tildás "Hecho" y "Entregado".
// Extras opcionales: seña, costo, cliente, notas. Todo en la cuenta (migración 009).
// =====================================================================

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const shiftMonth = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmtDay = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—');
const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'hacer', label: 'Sin hacer' },
  { value: 'entregar', label: 'Sin entregar' },
  { value: 'deben', label: 'Me deben' },
];

// Aviso de entrega de un pedido que todavía no se entregó.
function dueInfo(o) {
  if (isDelivered(o) || !o.delivery_date) return null;
  const d = daysUntil(o.delivery_date);
  if (d < 0) return { cls: 'err', text: d === -1 ? 'Atrasado 1 día' : `Atrasado ${-d} días` };
  if (d === 0) return { cls: 'warn', text: 'Es para hoy' };
  if (d <= 3) return { cls: 'warn', text: d === 1 ? 'Es para mañana' : `Faltan ${d} días` };
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
          <p className="ol-lead">Anotá tus pedidos, tildá lo que ya hiciste y lo que ya entregaste, y mirá cuánto vendiste en el mes. Es una herramienta de Makers Club.</p>
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
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const monthOrders = useMemo(() => orders.filter((o) => monthOf(o.order_date) === month), [orders, month]);
  const stats = useMemo(() => monthStats(monthOrders), [monthOrders]);
  const pendingDelivery = monthOrders.filter((o) => !isDelivered(o)).length;

  // "Ojo con estos": sin entregar y atrasados o para dentro de 3 días (de cualquier mes).
  const alerts = useMemo(() => orders.map((o) => ({ o, due: dueInfo(o) })).filter((x) => x.due)
    .sort((a, b) => a.o.delivery_date.localeCompare(b.o.delivery_date)), [orders]);

  const searching = !!q.trim();
  const list = useMemo(() => {
    const words = norm(q.trim()).split(/\s+/).filter(Boolean);
    // Al buscar, busca en todos los meses.
    return (words.length ? orders : monthOrders)
      .filter((o) => (filter === 'hacer' ? !isMade(o) : filter === 'entregar' ? !isDelivered(o) : filter === 'deben' ? balanceOf(o) > 0 : true))
      .filter((o) => words.every((w) => norm([o.product, o.client_name, o.client_contact, o.notes].join(' ')).includes(w)));
  }, [orders, monthOrders, filter, q]);

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
  const newOrder = () => setEditing({ order_date: month === monthOf() ? todayISO() : month + '-01' });

  const quick = async (id, patch, okText) => {
    try { await patchOrder(id, patch); if (okText) notify('ok', okText); reload(); } catch (e) { notify('err', e.message); }
  };

  if (loading) return <div className="empty"><div className="spinner" /></div>;
  if (missing) return <Empty icon="alert" title="Falta activar el Control de Pedidos" text="El administrador tiene que correr la migración supabase/009_batbox_pedidos.sql en Supabase." />;
  if (error) return <Empty icon="alert" title="No pudimos cargar tus pedidos" text="Revisá tu conexión y recargá la página." />;

  return (
    <div className="orders">
      <PageHead icon="clipboard" label="MAKERS CLUB · HERRAMIENTA" title="Control de Pedidos"
        text="Anotá tus pedidos y tildá lo que ya hiciste y entregaste. Solo vos ves tus datos." />

      <div className="card ord-bar">
        <div className="ord-month" role="group" aria-label="Mes">
          <button className="mini-btn" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mes anterior"><Icon name="arrowLeft" size={16} /></button>
          <strong>📅 {monthLabel(month, true)}</strong>
          <button className="mini-btn" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Mes siguiente"><Icon name="arrowRight" size={16} /></button>
          {month !== monthOf() && <button className="chip-btn" onClick={() => setMonth(monthOf())}>Volver a este mes</button>}
        </div>
        <button className="btn primary ord-new" onClick={newOrder}>+ Anotar pedido</button>
      </div>

      {alerts.length > 0 && (
        <section className="ord-alerts card" aria-label="Pedidos para revisar">
          <div className="oa-head">⚠️ <b>Ojo con {alerts.length === 1 ? 'este pedido' : `estos ${alerts.length} pedidos`}</b></div>
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
        <Stat label="Vendiste este mes" value={money.format(stats.income)} emoji="💰" />
        <Stat label="Pedidos" value={stats.count} emoji="📦" />
        <Stat label="Unidades" value={stats.units.toLocaleString('es-AR')} emoji="🔢" />
        <Stat label="Falta entregar" value={pendingDelivery} emoji="🚚" warn={pendingDelivery > 0} />
        {stats.toCollect > 0 && <Stat label="Te deben" value={money.format(stats.toCollect)} emoji="💸" warn />}
        {stats.profit != null && <Stat label="Ganancia" value={money.format(stats.profit)} emoji="📈" hint={stats.profitPartial ? 'De los pedidos con costo' : null} />}
      </section>

      <section className="card ord-card ord-orders">
        <div className="ord-head">
          <h3 className="oc-title">📋 {searching ? 'Resultados de la búsqueda' : `Pedidos de ${monthLabel(month, true).toLowerCase()}`}</h3>
          <div className="ord-tools">
            <SearchInput value={q} onChange={setQ} placeholder="Buscar un pedido…" />
            <Options value={filter} onChange={setFilter} options={FILTERS} />
          </div>
        </div>

        {!list.length ? (
          <Empty icon="clipboard" title={!orders.length ? 'Todavía no anotaste pedidos' : searching ? 'No encontramos ese pedido' : filter !== 'all' ? 'No hay pedidos así' : 'No hay pedidos este mes'}
            text={!orders.length ? 'Tocá "+ Anotar pedido" para cargar el primero.' : searching ? 'Probá con otra palabra.' : filter !== 'all' ? 'Probá con "Todos".' : 'Cambiá de mes con las flechas o anotá uno nuevo.'} />
        ) : (
          <>
            <div className="ord-cols" aria-hidden="true">
              <span /><span>Pedido</span><span>Cant.</span><span>Precio</span><span>Entrega</span><span>Hecho</span><span>Entregado</span><span />
            </div>
            <div className="ord-list">
              {list.map((o) => <OrderRow key={o.id} o={o} onEdit={() => setEditing(o)} onPatch={quick} showDate={searching} />)}
            </div>
          </>
        )}
        {monthOrders.length > 0 && !searching && (
          <button className="btn text ord-export" onClick={() => exportCsv(monthOrders, `pedidos-${month}.csv`)}>
            <Icon name="newspaper" size={15} /> Bajar este mes en Excel
          </button>
        )}
      </section>

      <div className="ord-two">
        <TaskList kind="compra" title="🛒 Compras pendientes" placeholder="Ej: PLA negro 1 kg" tasks={tasks} reload={reload} />
        <TaskList kind="diseno" title="🎨 Diseños pendientes" placeholder="Ej: Logo de un cliente" tasks={tasks} reload={reload} />
      </div>

      <div className="ord-two">
        <section className="card ord-card">
          <h3 className="oc-title">🏆 Lo que más te piden <small>{monthLabel(month, true)} · unidades</small></h3>
          <TopProducts rows={top} />
        </section>
        <section className="card ord-card">
          <h3 className="oc-title">📊 Cuánto vendiste por mes <small>tocá un mes para verlo</small></h3>
          <MonthlyIncome rows={monthly} selected={month} onSelect={setMonth} />
        </section>
      </div>

      <MonthNotes month={month} />

      {gallery.length > 0 && (
        <section className="block">
          <h3 className="oc-title">🖼️ Fotos de {monthLabel(month, true).toLowerCase()}</h3>
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
        <OrderEditor order={editing} products={products}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function Stat({ label, value, emoji, hint, warn }) {
  return (
    <div className={'card ord-stat' + (warn ? ' warn' : '')}>
      <span className="os-emoji" aria-hidden="true">{emoji}</span>
      <span className="os-txt">
        <small>{label}</small>
        <strong>{value}</strong>
        {hint && <em>{hint}</em>}
      </span>
    </div>
  );
}

// Tilde grande ("Hecho" / "Entregado").
function Tick({ on, label, onClick, cls }) {
  return (
    <button type="button" className={'or-tick ' + cls + (on ? ' on' : '')} onClick={onClick} aria-pressed={on} aria-label={label} title={label}>
      <Icon name="check" size={18} />
      <span className="or-tick-l">{label}</span>
    </button>
  );
}

function OrderRow({ o, onEdit, onPatch, showDate }) {
  const due = dueInfo(o);
  const bal = balanceOf(o);
  return (
    <article className={'ord-row' + (isDelivered(o) ? ' done' : '')}>
      <button className="or-thumb" onClick={onEdit} aria-label={`Ver ${o.product}`}>
        {o.imageUrl ? <img src={o.imageUrl} alt="" loading="lazy" /> : <span aria-hidden="true">📦</span>}
      </button>
      <div className="or-main">
        <button className="or-title" onClick={onEdit}>{o.product}</button>
        {(o.client_name || showDate) && (
          <span className="or-sub">{o.client_name}{o.client_name && showDate ? ' · ' : ''}{showDate ? `pedido del ${fmtDay(o.order_date)}` : ''}</span>
        )}
      </div>
      <div className="or-qty"><span className="or-k">Cant.</span><b>{o.quantity}</b></div>
      <div className="or-money">
        <b>{money.format(o.price)}</b>
        {bal > 0 && (
          <button className="or-collect" onClick={() => onPatch(o.id, { paid: true }, '¡Listo! Marcado como pagado')} title="Tocá cuando te pague">
            Te debe {money.format(bal)}
          </button>
        )}
      </div>
      <div className="or-date">
        <span className="or-k">Entrega</span>
        <b>{fmtDay(o.delivery_date)}</b>
        {due && <span className={'chip ' + due.cls}>{due.text}</span>}
      </div>
      <Tick cls="t-made" on={isMade(o)} label="Hecho" onClick={() => onPatch(o.id, { status: toggleMade(o) })} />
      <Tick cls="t-deliv" on={isDelivered(o)} label="Entregado" onClick={() => onPatch(o.id, { status: toggleDelivered(o) }, isDelivered(o) ? null : '¡Entregado! 🎉')} />
      <button className="mini-btn or-edit" onClick={onEdit} aria-label={`Editar ${o.product}`} title="Editar"><Icon name="edit" size={14} /></button>
    </article>
  );
}

function TaskList({ kind, title, placeholder, tasks, reload }) {
  const { notify } = useAuth();
  const [text, setText] = useState('');
  const mine = tasks.filter((t) => t.kind === kind);
  const run = async (fn) => { try { await fn(); reload(); } catch (e) { notify('err', e.message); } };
  const add = (e) => { e.preventDefault(); if (!text.trim()) return; const t = text; setText(''); run(() => addTask(kind, t)); };
  const doneCount = mine.filter((t) => t.done).length;
  const left = mine.length - doneCount;
  return (
    <section className="card ord-card">
      <h3 className="oc-title">{title} {left > 0 && <small>{left === 1 ? 'falta 1' : `faltan ${left}`}</small>}</h3>
      <form className="ot-add" onSubmit={add}>
        <div className="pink-input"><input value={text} onChange={(e) => setText(e.target.value)} maxLength={300}
          placeholder={placeholder} aria-label={`Agregar a ${title}`} /></div>
        <button className="btn primary" type="submit">Agregar</button>
      </form>
      {!mine.length ? <p className="oc-empty">Nada pendiente 🎉</p> : (
        <ul className="ot-list">
          {mine.map((t) => (
            <li key={t.id} className={t.done ? 'done' : ''}>
              <label><input type="checkbox" checked={t.done} onChange={() => run(() => patchTask(t.id, { done: !t.done }))} /> <span>{t.text}</span></label>
              <button className="mini-btn danger" onClick={() => run(() => deleteTask(t.id))} aria-label={`Borrar ${t.text}`} title="Borrar"><Icon name="x" size={12} /></button>
            </li>
          ))}
        </ul>
      )}
      {doneCount > 0 && (
        <button className="btn text ot-clear" onClick={() => run(async () => { for (const t of mine.filter((x) => x.done)) await deleteTask(t.id); })}>
          Sacar los tachados ({doneCount})
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
      try { await saveNote(month, v); setStatus('✓ Guardado'); } catch (e) { setStatus(''); notify('err', e.message); }
    }, 800);
  };
  return (
    <section className="card ord-card ord-notes">
      <h3 className="oc-title">📝 Anotaciones del mes <small aria-live="polite">{status}</small></h3>
      <div className="pink-input"><textarea rows={4} value={text} onChange={(e) => change(e.target.value)} maxLength={5000}
        placeholder="Escribí lo que quieras: recordatorios, insumos que faltan, ideas… Se guarda solo." aria-label="Anotaciones del mes" /></div>
    </section>
  );
}
