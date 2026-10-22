import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { deleteOrder, saveOrder, todayISO } from '../lib/ordersApi.js';
import Icon from './Icon.jsx';
import { Confirm } from './ui.jsx';

// Formulario para anotar o editar un pedido. Lo básico a la vista;
// seña/costo/contacto/notas/fechas extra quedan en "Más datos (opcional)".
const EMPTY = {
  product: '', client_name: '', client_contact: '', quantity: 1, price: '', cost: '', deposit: '',
  paid: true, status: 'pendiente', order_date: '', production_date: '', delivery_date: '', notes: '',
};
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const PAY = [
  { id: 'todo', label: '✅ Sí, todo' },
  { id: 'sena', label: '🤝 Dejó seña' },
  { id: 'nada', label: '⏳ Todavía no' },
];

export default function OrderEditor({ order, products = [], onClose, onSaved }) {
  const { notify, user } = useAuth();
  const isNew = !order?.id;
  const [form, setForm] = useState(() => {
    const f = { ...EMPTY, order_date: todayISO(), ...(order || {}) };
    for (const k of ['cost', 'production_date', 'delivery_date']) if (f[k] == null) f[k] = '';
    if (!isNew && !f.paid && !Number(f.deposit)) f.deposit = '';
    return f;
  });
  const [pay, setPay] = useState(() => (isNew || order.paid ? 'todo' : Number(order.deposit) > 0 ? 'sena' : 'nada'));
  const [more, setMore] = useState(() => !isNew && !!(order.client_contact || order.cost != null || order.notes || order.production_date));
  const [file, setFile] = useState(undefined); // undefined: sin cambios · File: nueva · null: quitar
  const [preview, setPreview] = useState(order?.imageUrl || null);
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (!(file instanceof Blob)) return undefined;
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const n = (v) => (v === '' || v == null ? 0 : Number(v));
  const made = form.status === 'listo' || form.status === 'entregado';
  const delivered = form.status === 'entregado';
  const owed = pay === 'todo' ? 0 : Math.max(0, n(form.price) - (pay === 'sena' ? n(form.deposit) : 0));
  const unit = n(form.quantity) > 1 && n(form.price) > 0 ? n(form.price) / n(form.quantity) : null;
  const profit = form.cost === '' ? null : n(form.price) - n(form.cost);
  const list = useMemo(() => [...new Set(products)].slice(0, 200), [products]);

  const save = async () => {
    if (!form.product.trim()) { notify('err', 'Escribí qué te pidieron.'); return; }
    if (n(form.quantity) < 1) { notify('err', 'La cantidad tiene que ser 1 o más.'); return; }
    if (pay === 'sena' && n(form.deposit) <= 0) { notify('err', '¿De cuánto fue la seña?'); return; }
    if (pay === 'sena' && n(form.price) > 0 && n(form.deposit) > n(form.price)) { notify('err', 'La seña no puede ser más que el precio.'); return; }
    setBusy(true);
    try {
      await saveOrder({ ...form, paid: pay === 'todo', deposit: pay === 'sena' ? form.deposit : 0 }, user?.id, file);
      notify('ok', isNew ? '¡Pedido anotado!' : 'Cambios guardados');
      onSaved();
    } catch (e) { notify('err', e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    setAskDelete(false); setBusy(true);
    try { await deleteOrder(order); notify('ok', 'Pedido borrado'); onSaved(); }
    catch (e) { notify('err', e.message); } finally { setBusy(false); }
  };
  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { notify('err', 'Elegí una foto (JPG, PNG o WebP).'); return; }
    if (f.size > 15 * 1024 * 1024) { notify('err', 'Esa foto es muy pesada (máx. 15 MB).'); return; }
    setFile(f);
  };
  const setStatus = (madeNow, deliveredNow) => setForm((f) => ({ ...f, status: deliveredNow ? 'entregado' : madeNow ? 'listo' : 'pendiente' }));

  return (
    <>
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide order-modal" role="dialog" aria-modal="true" aria-labelledby="order-ed-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="order-ed-title">{isNew ? '📦 Anotar pedido' : '✏️ Editar pedido'}</h2>
        <div className="member-form order-form">
          <label className="ed-field span2">
            <span className="ed-label">¿Qué te pidieron? *</span>
            <div className="pink-input"><input value={form.product} onChange={set('product')} list="order-products" maxLength={160}
              placeholder="Ej: LLAVERO con nombre" autoFocus={isNew} /></div>
            <datalist id="order-products">{list.map((p) => <option key={p} value={p} />)}</datalist>
          </label>

          <label className="ed-field">
            <span className="ed-label">¿Cuántos? *</span>
            <div className="pink-input"><input type="number" min="1" step="1" inputMode="numeric" value={form.quantity} onChange={set('quantity')} /></div>
          </label>
          <label className="ed-field">
            <span className="ed-label">¿Cuánto cobrás en total? ($)</span>
            <div className="pink-input"><input type="number" min="0" step="any" inputMode="decimal" value={form.price} onChange={set('price')} placeholder="0" /></div>
            {unit != null && <small className="ed-hint">Sale {money.format(unit)} cada uno</small>}
          </label>

          <label className="ed-field">
            <span className="ed-label">¿Para quién? <em className="opt-tag">opcional</em></span>
            <div className="pink-input"><input value={form.client_name} onChange={set('client_name')} maxLength={120} placeholder="Nombre del cliente" /></div>
          </label>
          <label className="ed-field">
            <span className="ed-label">¿Para cuándo? <em className="opt-tag">opcional</em></span>
            <div className="pink-input"><input type="date" value={form.delivery_date} onChange={set('delivery_date')} /></div>
          </label>

          <div className="ed-field span2">
            <span className="ed-label">¿Ya te pagó?</span>
            <div className="opts" role="group" aria-label="¿Ya te pagó?">
              {PAY.map((p) => <button key={p.id} type="button" className={'opt' + (pay === p.id ? ' active' : '')} onClick={() => setPay(p.id)}>{p.label}</button>)}
            </div>
            {pay === 'sena' && (
              <div className="pink-input order-dep"><input type="number" min="0" step="any" inputMode="decimal" value={form.deposit} onChange={set('deposit')} placeholder="¿De cuánto fue la seña? ($)" aria-label="Seña" autoFocus /></div>
            )}
            {owed > 0 && <small className="ed-hint">Te va a deber <b className="c-warn">{money.format(owed)}</b>. Cuando te pague, tocá "Te debe…" en la lista.</small>}
          </div>

          <div className="ed-field">
            <span className="ed-label">Foto <em className="opt-tag">opcional</em></span>
            <div className="order-photo">
              {preview ? <img src={preview} alt="Foto del pedido" /> : <span className="op-empty" aria-hidden="true">📷</span>}
              <div className="op-actions">
                <label className="chip-btn">{preview ? 'Cambiar foto' : 'Subir foto'}<input type="file" accept="image/*" onChange={pickFile} hidden /></label>
                {preview && <button type="button" className="chip-btn" onClick={() => { setFile(null); setPreview(null); }}>Sacar foto</button>}
              </div>
            </div>
          </div>
          <div className="ed-field">
            <span className="ed-label">¿Cómo va?</span>
            <label className="order-check"><input type="checkbox" checked={made} onChange={(e) => setStatus(e.target.checked, e.target.checked && delivered)} /> Ya está hecho</label>
            <label className="order-check"><input type="checkbox" checked={delivered} onChange={(e) => setStatus(made || e.target.checked, e.target.checked)} /> Ya lo entregué</label>
          </div>

          <div className="span2">
            <button type="button" className="btn text order-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>
              {more ? '▾' : '▸'} Más datos (opcional): contacto, costo, notas…
            </button>
          </div>
          {more && (
            <>
              <label className="ed-field">
                <span className="ed-label">Contacto</span>
                <div className="pink-input"><input value={form.client_contact} onChange={set('client_contact')} maxLength={160} placeholder="WhatsApp, Instagram…" /></div>
              </label>
              <label className="ed-field">
                <span className="ed-label">¿Cuánto te costó hacerlo? ($)</span>
                <div className="pink-input"><input type="number" min="0" step="any" inputMode="decimal" value={form.cost} onChange={set('cost')} placeholder="Del Cotizador 3DBAT" /></div>
                {profit != null && <small className="ed-hint">Ganás <b className={profit >= 0 ? 'c-ok' : 'c-err'}>{money.format(profit)}</b></small>}
              </label>
              <label className="ed-field">
                <span className="ed-label">Fecha del pedido</span>
                <div className="pink-input"><input type="date" value={form.order_date} onChange={set('order_date')} required /></div>
                <small className="ed-hint">Define en qué mes aparece.</small>
              </label>
              <label className="ed-field">
                <span className="ed-label">Fecha para hacerlo</span>
                <div className="pink-input"><input type="date" value={form.production_date} onChange={set('production_date')} /></div>
              </label>
              <label className="ed-field span2">
                <span className="ed-label">Notas</span>
                <div className="pink-input"><textarea rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} placeholder="Color, medidas, envío…" /></div>
              </label>
            </>
          )}
        </div>
        <div className="modal-actions">
          {!isNew && <button className="btn danger wiki-del" onClick={() => setAskDelete(true)} disabled={busy}><Icon name="trash" size={16} /> Borrar</button>}
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : <><Icon name="check" size={16} /> Guardar</>}</button>
        </div>
      </div>
    </div>
    <Confirm open={askDelete} danger title="¿Borrar este pedido?" text={`"${order?.product}" se borra para siempre, con su foto.`}
      yes="Sí, borrar" no="No" onNo={() => setAskDelete(false)} onYes={remove} />
    </>
  );
}
