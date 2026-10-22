import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { STATUSES, deleteOrder, saveOrder, todayISO } from '../lib/ordersApi.js';
import Icon from './Icon.jsx';
import { Confirm } from './ui.jsx';

// Formulario para cargar o editar un pedido del Control de Pedidos.
const EMPTY = {
  product: '', client_name: '', client_contact: '', quantity: 1, price: '', cost: '', deposit: '',
  paid: false, status: 'pendiente', order_date: '', production_date: '', delivery_date: '', notes: '',
};
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

export default function OrderEditor({ order, products = [], onClose, onSaved }) {
  const { notify, user } = useAuth();
  const isNew = !order?.id;
  const [form, setForm] = useState(() => {
    const f = { ...EMPTY, order_date: todayISO(), ...(order || {}) };
    for (const k of ['cost', 'production_date', 'delivery_date']) if (f[k] == null) f[k] = '';
    return f;
  });
  const [file, setFile] = useState(undefined); // undefined: sin cambios · File: nueva · null: quitar
  const [preview, setPreview] = useState(order?.imageUrl || null);
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => {
    if (!(file instanceof Blob)) return undefined;
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const n = (v) => (v === '' || v == null ? 0 : Number(v));
  const balance = form.paid ? 0 : Math.max(0, n(form.price) - n(form.deposit));
  const profit = form.cost === '' ? null : n(form.price) - n(form.cost);
  const unit = n(form.quantity) > 0 && n(form.price) > 0 ? n(form.price) / n(form.quantity) : null;
  const list = useMemo(() => [...new Set(products)].slice(0, 200), [products]);

  const save = async () => {
    if (!form.product.trim()) { notify('err', 'Poné qué producto es.'); return; }
    if (n(form.quantity) < 1) { notify('err', 'La cantidad tiene que ser al menos 1.'); return; }
    if (n(form.deposit) > n(form.price) && n(form.price) > 0) { notify('err', 'La seña no puede ser mayor que el precio.'); return; }
    setBusy(true);
    try {
      await saveOrder(form, user?.id, file);
      notify('ok', isNew ? 'Pedido guardado' : 'Pedido actualizado');
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
    if (!f) return;
    if (!/^image\//.test(f.type)) { notify('err', 'Elegí una imagen (JPG, PNG o WebP).'); return; }
    if (f.size > 15 * 1024 * 1024) { notify('err', 'La imagen es muy pesada (máx. 15 MB).'); return; }
    setFile(f);
  };

  return (
    <>
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide order-modal" role="dialog" aria-modal="true" aria-labelledby="order-ed-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="order-ed-title">{isNew ? 'Nuevo pedido' : 'Editar pedido'}</h2>
        <div className="member-form order-form">
          <label className="ed-field span2">
            <span className="ed-label">Producto *</span>
            <div className="pink-input"><input value={form.product} onChange={set('product')} list="order-products" maxLength={160}
              placeholder="Ej: LLAVERO personalizado con nombre" autoFocus={isNew} /></div>
            <datalist id="order-products">{list.map((p) => <option key={p} value={p} />)}</datalist>
            <small className="ed-hint">Tip: la primera palabra en MAYÚSCULAS agrupa los productos en el gráfico (LLAVERO, MACETA…).</small>
          </label>

          <label className="ed-field">
            <span className="ed-label">Cliente</span>
            <div className="pink-input"><input value={form.client_name} onChange={set('client_name')} maxLength={120} placeholder="Nombre" /></div>
          </label>
          <label className="ed-field">
            <span className="ed-label">Contacto</span>
            <div className="pink-input"><input value={form.client_contact} onChange={set('client_contact')} maxLength={160} placeholder="WhatsApp, Instagram…" /></div>
          </label>

          <label className="ed-field">
            <span className="ed-label">Cantidad *</span>
            <div className="pink-input"><input type="number" min="1" step="1" inputMode="numeric" value={form.quantity} onChange={set('quantity')} /></div>
          </label>
          <label className="ed-field">
            <span className="ed-label">Precio total ($)</span>
            <div className="pink-input"><input type="number" min="0" step="any" inputMode="decimal" value={form.price} onChange={set('price')} placeholder="0" /></div>
            {unit != null && <small className="ed-hint">{money.format(unit)} por unidad</small>}
          </label>
          <label className="ed-field">
            <span className="ed-label">Seña cobrada ($)</span>
            <div className="pink-input"><input type="number" min="0" step="any" inputMode="decimal" value={form.deposit} onChange={set('deposit')} placeholder="0" /></div>
          </label>
          <label className="ed-field">
            <span className="ed-label">Costo total ($, opcional)</span>
            <div className="pink-input"><input type="number" min="0" step="any" inputMode="decimal" value={form.cost} onChange={set('cost')} placeholder="Del Cotizador 3DBAT" /></div>
          </label>

          <div className="order-sums span2">
            <span>Saldo a cobrar: <b className={balance > 0 ? 'c-warn' : 'c-ok'}>{money.format(balance)}</b></span>
            {profit != null && <span>Ganancia: <b className={profit >= 0 ? 'c-ok' : 'c-err'}>{money.format(profit)}</b></span>}
            <label className="order-check"><input type="checkbox" checked={form.paid} onChange={set('paid')} /> Ya me pagó todo</label>
          </div>

          <div className="ed-field span2">
            <span className="ed-label">Estado</span>
            <div className="opts" role="group" aria-label="Estado del pedido">
              {STATUSES.map((s) => (
                <button key={s.id} type="button" className={'opt' + (form.status === s.id ? ' active' : '')}
                  onClick={() => setForm((f) => ({ ...f, status: s.id }))}>{s.label}</button>
              ))}
            </div>
          </div>

          <label className="ed-field">
            <span className="ed-label">Fecha del pedido</span>
            <div className="pink-input"><input type="date" value={form.order_date} onChange={set('order_date')} required /></div>
          </label>
          <label className="ed-field">
            <span className="ed-label">Fecha de entrega</span>
            <div className="pink-input"><input type="date" value={form.delivery_date} onChange={set('delivery_date')} /></div>
          </label>
          <label className="ed-field">
            <span className="ed-label">Fecha de producción</span>
            <div className="pink-input"><input type="date" value={form.production_date} onChange={set('production_date')} /></div>
          </label>

          <div className="ed-field">
            <span className="ed-label">Foto (opcional)</span>
            <div className="order-photo">
              {preview ? <img src={preview} alt="Foto del pedido" /> : <span className="op-empty"><Icon name="box" size={22} /></span>}
              <div className="op-actions">
                <label className="chip-btn">{preview ? 'Cambiar' : 'Subir foto'}<input type="file" accept="image/*" onChange={pickFile} hidden /></label>
                {preview && <button type="button" className="chip-btn" onClick={() => { setFile(null); setPreview(null); }}>Quitar</button>}
              </div>
            </div>
          </div>

          <label className="ed-field span2">
            <span className="ed-label">Notas</span>
            <div className="pink-input"><textarea rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} placeholder="Color, medidas, detalles del envío…" /></div>
          </label>
        </div>
        <div className="modal-actions">
          {!isNew && <button className="btn danger wiki-del" onClick={() => setAskDelete(true)} disabled={busy}><Icon name="trash" size={16} /> Borrar</button>}
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : <><Icon name="check" size={16} /> Guardar</>}</button>
        </div>
      </div>
    </div>
    <Confirm open={askDelete} danger title="¿Borrar este pedido?" text={`"${order?.product}" se borra para siempre, con su foto.`}
      yes="Borrar" onNo={() => setAskDelete(false)} onYes={remove} />
    </>
  );
}
