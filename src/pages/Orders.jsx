import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  addTask, balanceOf, daysUntil, deleteOrder, deleteTask, exportCsv, isDelivered, isMade, loadNote, monthOf, monthStats,
  patchOrder, patchTask, productKey, saveNote, todayISO, toggleDelivered, toggleMade, useOrders,
} from '../lib/ordersApi.js';
import Icon from '../components/Icon.jsx';
import AccessPanel from '../components/AccessPanel.jsx';
import OrderEditor from '../components/OrderEditor.jsx';
import { MonthlyIncome, ProductsDonut, monthLabel } from '../components/OrderCharts.jsx';
import { Confirm, Empty } from '../components/ui.jsx';
import '../styles/orders.css';

// =====================================================================
// CONTROL DE PEDIDOS (Makers Club). Misma idea y orden que una planilla de pedidos:
// barra lateral con meses y vistas; arriba ingresos, pedidos y unidades; la tabla
// de pedidos (con seña, tildes de producción y entrega); compras y diseños
// pendientes; productos más pedidos y anotaciones. Todo en la cuenta (migración 009).
// =====================================================================

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const shiftMonth = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmtDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const VIEWS = [
  { id: 'panel', label: '📊 Panel de Control' },
  { id: 'galeria', label: '🖼️ Galería del Mes' },
  { id: 'meses', label: '📈 Comparar meses' },
];

export default function Orders() {
  const { isMember, access } = useAuth();
  if (access === 'loading') return <div className="empty"><div className="spinner" /></div>;
  if (!isMember) {
    return (
      <div className="club-locked">
        <div className="club-locked-head">
          <div className="section-label">MAKERS CLUB · HERRAMIENTA</div>
          <h1>Control de Pedidos</h1>
          <p className="ol-lead">Registrá tus pedidos con su seña, tildá lo que ya produjiste y entregaste, y mirá cuánto vendiste en el mes. Es una herramienta de Makers Club.</p>
        </div>
        <AccessPanel intro="Herramienta solo para miembros" />
      </div>
    );
  }
  return <OrdersApp />;
}

// Bloque con título que se pliega (▼ / ▶), como en la planilla.
function Fold({ title, open, onToggle, action, children, className = '' }) {
  return (
    <section className={'card ob-fold ' + className}>
      <div className="ob-fold-head">
        <button type="button" className="ob-fold-btn" onClick={onToggle} aria-expanded={open}>
          <span className="ob-fold-title">{title}</span>
          <span className={'ob-caret' + (open ? ' open' : '')} aria-hidden="true">▼</span>
        </button>
        {action}
      </div>
      {open && <div className="ob-fold-body">{children}</div>}
    </section>
  );
}

function OrdersApp() {
  const { notify } = useAuth();
  const { orders, tasks, loading, missing, error, reload } = useOrders();
  const [month, setMonth] = useState(monthOf());
  const [view, setView] = useState('panel');
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [open, setOpen] = useState({ pedidos: true, compras: true, disenos: true, productos: true, notas: true });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  // Meses del selector: los que tienen pedidos + los últimos 12 + el actual.
  const months = useMemo(() => {
    const set = new Set(orders.map((o) => monthOf(o.order_date)));
    for (let i = 0; i < 12; i++) set.add(shiftMonth(monthOf(), -i));
    set.add(month);
    return [...set].sort().reverse();
  }, [orders, month]);

  const monthOrders = useMemo(() => orders.filter((o) => monthOf(o.order_date) === month), [orders, month]);
  const stats = useMemo(() => monthStats(monthOrders), [monthOrders]);

  const top = useMemo(() => {
    const m = new Map();
    for (const o of monthOrders) {
      const k = productKey(o.product);
      const r = m.get(k) || { key: k, units: 0, income: 0, count: 0 };
      r.units += Number(o.quantity) || 0; r.income += Number(o.price) || 0; r.count += 1;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.units - a.units);
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
  const remove = async () => {
    const o = toDelete; setToDelete(null);
    try { await deleteOrder(o); notify('ok', 'Pedido eliminado'); reload(); } catch (e) { notify('err', e.message); }
  };

  if (loading) return <div className="empty"><div className="spinner" /></div>;
  if (missing) return <Empty icon="alert" title="Falta activar el Control de Pedidos" text="El administrador tiene que correr la migración supabase/009_batbox_pedidos.sql en Supabase." />;
  if (error) return <Empty icon="alert" title="No pudimos cargar tus pedidos" text="Revisá tu conexión y recargá la página." />;

  return (
    <div className="ob">
      <aside className="card ob-side">
        <div className="ob-logo"><Icon name="clipboard" size={30} /></div>

        <div className="ob-side-sec">
          <h3 className="ob-sec-title">GESTIÓN DE MESES</h3>
          <div className="ob-month">
            <button type="button" className="mini-btn" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mes anterior"><Icon name="arrowLeft" size={14} /></button>
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mes">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m, true).replace(" de ", " ")}</option>)}
            </select>
            <button type="button" className="mini-btn" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Mes siguiente"><Icon name="arrowRight" size={14} /></button>
          </div>
          <small className="ob-hint">Cada pedido va al mes de su fecha. No hace falta crear meses.</small>
        </div>

        <div className="ob-side-sec">
          <h3 className="ob-sec-title">VISTAS</h3>
          <div className="ob-views">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className={'ob-view' + (view === v.id ? ' active' : '')} onClick={() => setView(v.id)}>{v.label}</button>
            ))}
          </div>
        </div>

        <div className="ob-side-foot">
          <button type="button" className="ob-view small" onClick={() => exportCsv(orders, `pedidos-respaldo-${todayISO()}.csv`)} disabled={!orders.length}>
            💾 Descargar Respaldo
          </button>
          <small className="ob-hint">Se abre con Excel. Tus pedidos ya quedan guardados en tu cuenta.</small>
        </div>
      </aside>

      <div className="ob-main">
        <header className="ob-head">
          <div>
            <h1 className="ob-title">CONTROL DE PEDIDOS</h1>
            <div className="ob-sub">3DBAT · MAKERS CLUB · {monthLabel(month, true).toUpperCase()}</div>
          </div>
          <button type="button" className="btn primary ob-new" onClick={newOrder}>+ Registrar Pedido</button>
        </header>

        <section className="ob-stats" aria-label="Resumen del mes">
          <div className="card ob-stat"><span>INGRESOS DEL MES</span><b className="c-ok">{money.format(stats.income)}</b></div>
          <div className="card ob-stat"><span>PEDIDOS</span><b>{stats.count}</b></div>
          <div className="card ob-stat"><span>UNIDADES</span><b>{stats.units.toLocaleString('es-AR')}</b></div>
          {stats.toCollect > 0 && <div className="card ob-stat"><span>RESTA COBRAR</span><b className="c-warn">{money.format(stats.toCollect)}</b></div>}
        </section>

        {view === 'panel' && (
          <>
            <Fold title="📋 CONTROL DE PEDIDOS" open={open.pedidos} onToggle={() => toggle('pedidos')}>
              {!monthOrders.length ? (
                <p className="ob-empty">No hay pedidos en {monthLabel(month, true).toLowerCase()}. Tocá "+ Registrar Pedido" para anotar uno.</p>
              ) : (
                <div className="ob-table-wrap">
                  <table className="ob-table">
                    <thead>
                      <tr><th>IMAGEN</th><th>PRODUCTO</th><th>CANT.</th><th>PRECIO</th><th>SEÑA</th><th>PRODUCCIÓN</th><th>ENTREGA</th><th aria-label="Acciones" /></tr>
                    </thead>
                    <tbody>
                      {monthOrders.map((o) => (
                        <OrderRow key={o.id} o={o} onEdit={() => setEditing(o)} onDelete={() => setToDelete(o)} onPatch={quick} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Fold>

            <div className="ob-two">
              <TaskFold kind="compra" title="🛒 COMPRAS PENDIENTES" empty="No hay compras pendientes" placeholder="Ej: PLA negro 1 kg"
                open={open.compras} onToggle={() => toggle('compras')} tasks={tasks} reload={reload} />
              <TaskFold kind="diseno" title="🎨 DISEÑOS PENDIENTES" empty="No hay diseños pendientes" placeholder="Ej: Logo de un cliente"
                open={open.disenos} onToggle={() => toggle('disenos')} tasks={tasks} reload={reload} />
            </div>

            <div className="ob-two">
              <Fold title="PRODUCTOS MÁS PEDIDOS" open={open.productos} onToggle={() => toggle('productos')}>
                <ProductsDonut rows={top} />
              </Fold>
              <Fold title="ANOTACIONES DEL MES" open={open.notas} onToggle={() => toggle('notas')}>
                <MonthNotes month={month} />
              </Fold>
            </div>
          </>
        )}

        {view === 'galeria' && (
          <section className="ob-gallery-wrap">
            <h2 className="ob-view-title">📸 GALERÍA DEL MES</h2>
            {!gallery.length ? <p className="ob-empty">No hay pedidos con imagen en {monthLabel(month, true).toLowerCase()}.</p> : (
              <div className="ord-gallery">
                {gallery.map((o) => (
                  <button key={o.id} className="og-item" onClick={() => setEditing(o)}>
                    <img src={o.imageUrl} alt={o.product} loading="lazy" />
                    <span>{o.product}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {view === 'meses' && (
          <section className="card ob-fold">
            <h2 className="ob-view-title">📈 CUÁNTO VENDISTE POR MES</h2>
            <p className="ob-hint">Pasá el mouse por una barra para ver el detalle. Tocala para abrir ese mes.</p>
            <MonthlyIncome rows={monthly} selected={month} onSelect={(m) => { setMonth(m); setView('panel'); }} />
          </section>
        )}
      </div>

      {editing && (
        <OrderEditor order={editing} products={products}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
      <Confirm open={!!toDelete} danger title="⚠️ ¿Eliminar este pedido?" text={toDelete ? `"${toDelete.product}" se borra para siempre.` : ''}
        yes="Sí, eliminar" no="Cancelar" onNo={() => setToDelete(null)} onYes={remove} />
    </div>
  );
}

function OrderRow({ o, onEdit, onDelete, onPatch }) {
  const made = isMade(o);
  const delivered = isDelivered(o);
  const bal = balanceOf(o);
  const late = !delivered && o.delivery_date && daysUntil(o.delivery_date) < 0;
  return (
    <tr className={delivered ? 'done' : ''}>
      <td data-l="Imagen">
        <button type="button" className="or-thumb" onClick={onEdit} aria-label={`Ver ${o.product}`}>
          {o.imageUrl ? <img src={o.imageUrl} alt="" loading="lazy" /> : <span aria-hidden="true">📦</span>}
        </button>
      </td>
      <td data-l="Producto" className="ob-prod"><button type="button" onClick={onEdit}>{o.product}</button></td>
      <td data-l="Cant.">{o.quantity}</td>
      <td data-l="Precio" className="c-ok ob-price">{money.format(o.price)}</td>
      <td data-l="Seña" className="ob-dep">
        <span>{Number(o.deposit) > 0 ? money.format(o.deposit) : '—'}</span>
        {bal > 0
          ? <button type="button" className="or-collect" onClick={() => onPatch(o.id, { paid: true }, '¡Listo! Quedó pagado')} title="Tocá cuando te pague el resto">Resta {money.format(bal)}</button>
          : Number(o.price) > 0 && <small className="c-ok">Pagado ✓</small>}
      </td>
      <td data-l="Producción">
        <label className="ob-check">
          <input type="checkbox" checked={made} onChange={() => onPatch(o.id, { status: toggleMade(o) })} aria-label={`Producido: ${o.product}`} />
          <span className={made ? 'struck' : ''}>{fmtDate(o.production_date)}</span>
        </label>
      </td>
      <td data-l="Entrega">
        <label className="ob-check">
          <input type="checkbox" checked={delivered} onChange={() => onPatch(o.id, { status: toggleDelivered(o) }, delivered ? null : '¡Entregado! 🎉')} aria-label={`Entregado: ${o.product}`} />
          <span className={delivered ? 'struck' : ''}>{fmtDate(o.delivery_date)}</span>
        </label>
        {late && <span className="chip err ob-late">Atrasado</span>}
      </td>
      <td className="ob-actions">
        <button type="button" className="mini-btn" onClick={onEdit} aria-label={`Editar ${o.product}`} title="Editar"><Icon name="edit" size={14} /></button>
        <button type="button" className="mini-btn danger" onClick={onDelete} aria-label={`Eliminar ${o.product}`} title="Eliminar pedido"><Icon name="trash" size={14} /></button>
      </td>
    </tr>
  );
}

// Compras / Diseños pendientes: "+" abre el campo para agregar, tilde para tachar.
function TaskFold({ kind, title, empty, placeholder, open, onToggle, tasks, reload }) {
  const { notify } = useAuth();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const mine = tasks.filter((t) => t.kind === kind);
  const run = async (fn) => { try { await fn(); reload(); } catch (e) { notify('err', e.message); } };
  const add = (e) => { e.preventDefault(); if (!text.trim()) return; const t = text; setText(''); run(() => addTask(kind, t)); };
  const plus = (
    <button type="button" className="ob-plus" onClick={() => { setAdding((v) => !v); if (!open) onToggle(); }} aria-label={`Agregar a ${title}`} title="Agregar">+</button>
  );
  return (
    <Fold title={title} open={open} onToggle={onToggle} action={plus}>
      {adding && (
        <form className="ot-add" onSubmit={add}>
          <div className="pink-input"><input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={placeholder} autoFocus aria-label={title} /></div>
          <button className="btn primary" type="submit">Agregar</button>
        </form>
      )}
      {!mine.length ? <p className="ob-empty">{empty}</p> : (
        <ul className="ot-list">
          {mine.map((t) => (
            <li key={t.id} className={t.done ? 'done' : ''}>
              <label><input type="checkbox" checked={t.done} onChange={() => run(() => patchTask(t.id, { done: !t.done }))} /> <span>{t.text}</span></label>
              <button type="button" className="mini-btn danger" onClick={() => run(() => deleteTask(t.id))} aria-label={`Borrar ${t.text}`} title="Borrar"><Icon name="trash" size={12} /></button>
            </li>
          ))}
        </ul>
      )}
    </Fold>
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
    <div className="ord-notes">
      <div className="pink-input"><textarea rows={9} value={text} onChange={(e) => change(e.target.value)} maxLength={5000}
        placeholder="Escribí tus notas acá… (recordatorios, insumos que faltan, etc.)" aria-label="Anotaciones del mes" /></div>
      <small className="ob-hint" aria-live="polite">{status || 'Se guarda solo.'}</small>
    </div>
  );
}
