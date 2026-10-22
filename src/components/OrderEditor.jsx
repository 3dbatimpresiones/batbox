import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { saveOrder, todayISO } from '../lib/ordersApi.js';
import Icon from './Icon.jsx';

// "Registrar Pedido": producto, imagen, cantidad, precio, seña y las dos fechas.
// Los demás datos que ya tenga el pedido (cliente, notas…) se conservan al editar.
const EMPTY = {
  product: '', client_name: '', client_contact: '', quantity: 1, price: '', cost: null, deposit: '',
  paid: false, status: 'pendiente', order_date: '', production_date: '', delivery_date: '', notes: '',
};
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

export default function OrderEditor({ order, products = [], onClose, onSaved }) {
  const { notify, user } = useAuth();
  const isNew = !order?.id;
  const [form, setForm] = useState(() => {
    const f = { ...EMPTY, order_date: todayISO(), ...(order || {}) };
    for (const k of ['production_date', 'delivery_date']) if (f[k] == null) f[k] = '';
    if (!Number(f.deposit)) f.deposit = '';
    return f;
  });
  const [file, setFile] = useState(undefined); // undefined: sin cambios · File: nueva · null: quitar
  const [preview, setPreview] = useState(order?.imageUrl || null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (!(file instanceof Blob)) return undefined;
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const n = (v) => (v === '' || v == null ? 0 : Number(v));
  const rest = form.paid ? 0 : Math.max(0, n(form.price) - n(form.deposit));
  const list = useMemo(() => [...new Set(products)].slice(0, 200), [products]);

  const save = async (e) => {
    e.preventDefault();
    if (!form.product.trim()) { notify('err', 'Escribí el producto.'); return; }
    if (n(form.quantity) < 1) { notify('err', 'La cantidad tiene que ser 1 o más.'); return; }
    if (n(form.price) > 0 && n(form.deposit) > n(form.price)) { notify('err', 'La seña no puede ser más que el precio.'); return; }
    setBusy(true);
    try {
      // Si la seña cubre todo el precio, el pedido queda pagado.
      const paid = form.paid || (n(form.price) > 0 && n(form.deposit) >= n(form.price));
      await saveOrder({ ...form, paid }, user?.id, file);
      notify('ok', isNew ? '¡Pedido registrado!' : 'Cambios guardados');
      onSaved();
    } catch (err) { notify('err', err.message); } finally { setBusy(false); }
  };
  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { notify('err', 'Elegí una imagen (JPG, PNG o WebP).'); return; }
    if (f.size > 15 * 1024 * 1024) { notify('err', 'Esa imagen es muy pesada (máx. 15 MB).'); return; }
    setFile(f);
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal wide order-modal" role="dialog" aria-modal="true" aria-labelledby="order-ed-title" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="om-head">
          <h2 id="order-ed-title">{isNew ? 'Registrar Nuevo Pedido' : 'Editar Pedido'}</h2>
          <button type="button" className="mini-btn" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={14} /></button>
        </div>
        <div className="member-form order-form">
          <label className="ed-field span2">
            <span className="ed-label">Producto</span>
            <div className="pink-input"><input value={form.product} onChange={set('product')} list="order-products" maxLength={160}
              placeholder="Ej. LLAVERO Personalizado" autoFocus={isNew} /></div>
            <datalist id="order-products">{list.map((p) => <option key={p} value={p} />)}</datalist>
          </label>

          <div className="ed-field span2">
            <span className="ed-label">Imagen del Pedido (Opcional)</span>
            <div className="order-photo">
              {preview ? <img src={preview} alt="Imagen del pedido" /> : <span className="op-empty" aria-hidden="true">📦</span>}
              <div className="op-actions">
                <label className="chip-btn">{preview ? 'Cambiar imagen' : 'Elegir imagen'}<input type="file" accept="image/*" onChange={pickFile} hidden /></label>
                {preview && <button type="button" className="chip-btn" onClick={() => { setFile(null); setPreview(null); }}>Quitar</button>}
              </div>
            </div>
          </div>

          <label className="ed-field">
            <span className="ed-label">Cantidad</span>
            <div className="pink-input"><input type="number" min="1" step="1" inputMode="numeric" value={form.quantity} onChange={set('quantity')} required /></div>
          </label>
          <label className="ed-field">
            <span className="ed-label">Precio Total ($)</span>
            <div className="pink-input"><input type="number" min="0" step="any" inputMode="decimal" value={form.price} onChange={set('price')} placeholder="0" /></div>
          </label>

          <label className="ed-field">
            <span className="ed-label">Seña ($)</span>
            <div className="pink-input"><input type="number" min="0" step="any" inputMode="decimal" value={form.deposit} onChange={set('deposit')} placeholder="0" /></div>
          </label>
          <div className="ed-field order-rest">
            <span className="ed-label">Resta cobrar</span>
            <b className={rest > 0 ? 'c-warn' : 'c-ok'}>{n(form.price) > 0 ? (rest > 0 ? money.format(rest) : 'Nada, está pago ✓') : '—'}</b>
            {(n(form.price) > n(form.deposit) || form.paid) && (
              <label className="order-check"><input type="checkbox" checked={!!form.paid} onChange={(e) => setForm((f) => ({ ...f, paid: e.target.checked }))} /> Ya me pagó todo</label>
            )}
          </div>

          <label className="ed-field">
            <span className="ed-label">Fecha Producción</span>
            <div className="pink-input"><input type="date" value={form.production_date} onChange={set('production_date')} /></div>
          </label>
          <label className="ed-field">
            <span className="ed-label">Fecha Entrega</span>
            <div className="pink-input"><input type="date" value={form.delivery_date} onChange={set('delivery_date')} /></div>
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar Pedido'}</button>
        </div>
      </form>
    </div>
  );
}
