import { useCallback, useEffect, useState } from 'react';
import { sb } from './supabase.js';

// =====================================================================
// Control de Pedidos (migración 009: bb_orders, bb_order_tasks, bb_order_notes
// y el bucket privado "bb-pedidos"). Cada maker solo ve lo suyo: lo valida la base (RLS).
// Con `npm run dev` y ?simdb se usa una base de prueba en el navegador (no toca Supabase).
// =====================================================================

export const STATUSES = [
  { id: 'pendiente', label: 'Pendiente', cls: 'muted' },
  { id: 'produccion', label: 'En producción', cls: 'cat' },
  { id: 'listo', label: 'Listo', cls: 'warn' },
  { id: 'entregado', label: 'Entregado', cls: 'ok' },
];
export const statusOf = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

// Vista simple (como la de una planilla): dos tildes, "Hecho" y "Entregado".
// Hecho = listo o entregado · Entregado = entregado. 'produccion' cuenta como "sin hacer".
export const isMade = (o) => o.status === 'listo' || o.status === 'entregado';
export const isDelivered = (o) => o.status === 'entregado';
export const toggleMade = (o) => (isMade(o) ? 'pendiente' : 'listo');
export const toggleDelivered = (o) => (isDelivered(o) ? 'listo' : 'entregado');
export const nextStatus = (id) => STATUSES[Math.min(STATUSES.findIndex((s) => s.id === id) + 1, STATUSES.length - 1)].id;

const BUCKET = 'bb-pedidos';
const ORDER_COLS = 'id, product, client_name, client_contact, quantity, price, cost, deposit, paid, status, order_date, production_date, delivery_date, notes, image_path, created_at';
const SIM = import.meta.env.DEV && new URLSearchParams(window.location.search).has('simdb');
const missing = (e) => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));
const friendly = (e) => {
  if (/row-level security|permission/i.test(e?.message || '')) return new Error('Tu cuenta no tiene acceso al Control de Pedidos (es para miembros de Makers Club).');
  return new Error(e?.message || 'No se pudo guardar. Probá de nuevo.');
};
const num = (v) => (v === '' || v == null ? 0 : Number(v));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

// ---------- Fechas (siempre en hora local: "2026-10-22") ----------
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const monthOf = (iso) => (iso || todayISO()).slice(0, 7); // "2026-10"
export const daysUntil = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = todayISO().split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
};

// ---------- Base de prueba (solo dev + ?simdb) ----------
const SIM_KEY = 'bb_sim_pedidos';
function simLoad() {
  try { const s = JSON.parse(localStorage.getItem(SIM_KEY)); if (s) return s; } catch { /* sin datos */ }
  const m = monthOf(); const [y, mm] = m.split('-').map(Number);
  const prev = (k) => { const d = new Date(y, mm - 1 - k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const t = todayISO();
  const add = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const o = (product, client, q, price, cost, dep, status, od, del, paid = false) => ({ id: uuid(), product, client_name: client, client_contact: '', quantity: q, price, cost, deposit: dep, paid, status, order_date: od, production_date: null, delivery_date: del, notes: '', image_path: null, created_at: od });
  const s = {
    orders: [
      o('LLAVERO personalizado con nombre', 'Juli', 20, 30000, 7000, 10000, 'produccion', t, add(2)),
      o('MACETA geométrica', 'Caro', 2, 18000, 5200, 18000, 'listo', t, add(-1), true),
      o('FIGURA articulada dragón', 'Nico', 1, 25000, 6000, 5000, 'pendiente', t, add(6)),
      o('LLAVERO logo empresa', 'Estudio Sur', 50, 60000, 14000, 30000, 'entregado', `${m}-03`, `${m}-10`, true),
      o('SOPORTE auriculares', 'Fede', 1, 12000, 3000, 0, 'pendiente', `${m}-05`, add(1)),
      o('MACETA autorriego', 'Laura', 3, 21000, 6900, 10000, 'entregado', `${prev(1)}-12`, `${prev(1)}-20`, true),
      o('LLAVERO personalizado', 'Club Atlético', 40, 52000, 12000, 52000, 'entregado', `${prev(1)}-02`, `${prev(1)}-09`, true),
      o('FIGURA dragón', 'Tomi', 1, 22000, 5500, 22000, 'entregado', `${prev(2)}-15`, `${prev(2)}-22`, true),
      o('SOPORTE celular', 'Ale', 4, 16000, 4000, 16000, 'entregado', `${prev(3)}-08`, `${prev(3)}-12`, true),
    ],
    tasks: [
      { id: uuid(), kind: 'compra', text: 'PLA negro 1 kg', done: false, created_at: t },
      { id: uuid(), kind: 'compra', text: 'Argollas para llaveros', done: true, created_at: t },
      { id: uuid(), kind: 'diseno', text: 'Logo de Estudio Sur en 3D', done: false, created_at: t },
    ],
    notes: { [m]: 'Pedir presupuesto de cajas para envíos.' },
  };
  localStorage.setItem(SIM_KEY, JSON.stringify(s));
  return s;
}
const simSave = (s) => localStorage.setItem(SIM_KEY, JSON.stringify(s));

// ---------- Fotos ----------
// Achica la foto en el navegador (máx. 1000 px, WebP) para que suba rápido y ocupe poco.
export function compressImage(file, max = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo leer la imagen.'))), 'image/webp', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Ese archivo no es una imagen válida.')); };
    img.src = url;
  });
}
const blobToDataUrl = (b) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });

async function signImages(orders) {
  if (SIM) return orders.map((o) => ({ ...o, imageUrl: o.image_path || null }));
  const paths = orders.map((o) => o.image_path).filter(Boolean);
  if (!paths.length) return orders.map((o) => ({ ...o, imageUrl: null }));
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6);
  const map = new Map((data || []).map((d) => [d.path, d.signedUrl]));
  return orders.map((o) => ({ ...o, imageUrl: o.image_path ? map.get(o.image_path) || null : null }));
}

// ---------- Lectura ----------
export function useOrders() {
  const [state, setState] = useState({ orders: [], tasks: [], loading: true, missing: false, error: null });
  const load = useCallback(async () => {
    if (SIM) {
      const s = simLoad();
      setState({ orders: await signImages(s.orders), tasks: s.tasks, loading: false, missing: false, error: null });
      return;
    }
    const [o, t] = await Promise.all([
      sb.from('bb_orders').select(ORDER_COLS).order('order_date', { ascending: false }).order('created_at', { ascending: false }),
      sb.from('bb_order_tasks').select('id, kind, text, done, created_at').order('created_at'),
    ]);
    const err = o.error || t.error;
    if (err) { setState({ orders: [], tasks: [], loading: false, missing: missing(err), error: err }); return; }
    setState({ orders: await signImages(o.data), tasks: t.data, loading: false, missing: false, error: null });
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// ---------- Pedidos ----------
const cleanOrder = (o) => ({
  product: (o.product || '').trim(),
  client_name: (o.client_name || '').trim(),
  client_contact: (o.client_contact || '').trim(),
  quantity: Math.max(1, Math.round(num(o.quantity) || 1)),
  price: num(o.price),
  cost: o.cost === '' || o.cost == null ? null : num(o.cost),
  deposit: num(o.deposit),
  paid: !!o.paid,
  status: o.status || 'pendiente',
  order_date: o.order_date || todayISO(),
  production_date: o.production_date || null,
  delivery_date: o.delivery_date || null,
  notes: (o.notes || '').trim(),
});

// image: undefined = no tocar la foto · File = foto nueva · null = quitar la foto
export async function saveOrder(order, userId, image) {
  const row = cleanOrder(order);
  if (SIM) {
    const s = simLoad();
    if (image instanceof Blob) row.image_path = await blobToDataUrl(await compressImage(image));
    else if (image === null) row.image_path = null;
    if (order.id) s.orders = s.orders.map((x) => (x.id === order.id ? { ...x, ...row } : x));
    else s.orders.unshift({ id: uuid(), image_path: null, created_at: new Date().toISOString(), ...row });
    simSave(s);
    return;
  }
  const oldPath = order.image_path || null;
  if (image instanceof Blob) {
    const blob = await compressImage(image);
    const path = `${userId}/${uuid()}.webp`;
    const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', upsert: false });
    if (up.error) throw friendly(up.error);
    row.image_path = path;
  } else if (image === null) row.image_path = null;
  const res = order.id
    ? await sb.from('bb_orders').update(row).eq('id', order.id).select('id')
    : await sb.from('bb_orders').insert(row).select('id');
  if (res.error) {
    if (row.image_path && row.image_path !== oldPath) await sb.storage.from(BUCKET).remove([row.image_path]);
    throw friendly(res.error);
  }
  if (!res.data?.length) throw friendly({ message: 'permission' });
  // La foto anterior ya no se usa: se borra para no ocupar lugar.
  if (oldPath && 'image_path' in row && row.image_path !== oldPath) await sb.storage.from(BUCKET).remove([oldPath]);
}

// Cambios rápidos desde la lista (estado, cobrado) sin abrir el formulario.
export async function patchOrder(id, patch) {
  if (SIM) { const s = simLoad(); s.orders = s.orders.map((x) => (x.id === id ? { ...x, ...patch } : x)); simSave(s); return; }
  const res = await sb.from('bb_orders').update(patch).eq('id', id).select('id');
  if (res.error || !res.data?.length) throw friendly(res.error || { message: 'permission' });
}

export async function deleteOrder(order) {
  if (SIM) { const s = simLoad(); s.orders = s.orders.filter((x) => x.id !== order.id); simSave(s); return; }
  const res = await sb.from('bb_orders').delete().eq('id', order.id).select('id');
  if (res.error || !res.data?.length) throw friendly(res.error || { message: 'permission' });
  if (order.image_path) await sb.storage.from(BUCKET).remove([order.image_path]);
}

// ---------- Compras y diseños pendientes ----------
export async function addTask(kind, text) {
  const row = { kind, text: text.trim() };
  if (SIM) { const s = simLoad(); s.tasks.push({ id: uuid(), done: false, created_at: new Date().toISOString(), ...row }); simSave(s); return; }
  const res = await sb.from('bb_order_tasks').insert(row).select('id');
  if (res.error) throw friendly(res.error);
}
export async function patchTask(id, patch) {
  if (SIM) { const s = simLoad(); s.tasks = s.tasks.map((x) => (x.id === id ? { ...x, ...patch } : x)); simSave(s); return; }
  const res = await sb.from('bb_order_tasks').update(patch).eq('id', id).select('id');
  if (res.error) throw friendly(res.error);
}
export async function deleteTask(id) {
  if (SIM) { const s = simLoad(); s.tasks = s.tasks.filter((x) => x.id !== id); simSave(s); return; }
  const res = await sb.from('bb_order_tasks').delete().eq('id', id);
  if (res.error) throw friendly(res.error);
}

// ---------- Anotaciones del mes ("2026-10") ----------
export async function loadNote(month) {
  if (SIM) return simLoad().notes[month] || '';
  const { data } = await sb.from('bb_order_notes').select('text').eq('month', month + '-01').maybeSingle();
  return data?.text || '';
}
export async function saveNote(month, text) {
  if (SIM) { const s = simLoad(); s.notes[month] = text; simSave(s); return; }
  const res = await sb.from('bb_order_notes').upsert({ month: month + '-01', text }, { onConflict: 'owner,month' });
  if (res.error) throw friendly(res.error);
}

// ---------- Cálculos ----------
export const balanceOf = (o) => (o.paid ? 0 : Math.max(0, num(o.price) - num(o.deposit)));
export const profitOf = (o) => (o.cost == null ? null : num(o.price) - num(o.cost));

export function monthStats(orders) {
  const withCost = orders.filter((o) => o.cost != null);
  return {
    income: orders.reduce((a, o) => a + num(o.price), 0),
    count: orders.length,
    units: orders.reduce((a, o) => a + num(o.quantity), 0),
    toCollect: orders.reduce((a, o) => a + balanceOf(o), 0),
    profit: withCost.length ? withCost.reduce((a, o) => a + profitOf(o), 0) : null,
    profitPartial: withCost.length > 0 && withCost.length < orders.length,
  };
}

// "LLAVERO personalizado" y "LLAVERO logo" cuentan juntos como "LLAVERO"
// (la primera palabra en MAYÚSCULAS agrupa). Si no hay mayúsculas, el nombre completo.
export function productKey(name = '') {
  const words = name.trim().split(/\s+/);
  const caps = [];
  for (const w of words) { if (w.length > 1 && w === w.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(w)) caps.push(w); else break; }
  return caps.length ? caps.join(' ') : name.trim();
}

// Exporta a CSV que Excel abre bien en español (separador ; y acentos OK).
export function exportCsv(orders, filename) {
  const head = ['Fecha', 'Producto', 'Cliente', 'Contacto', 'Cantidad', 'Precio', 'Costo', 'Ganancia', 'Seña', 'Saldo', 'Cobrado', 'Estado', 'Producción', 'Entrega', 'Notas'];
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s; // que Excel no lo tome como fórmula
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const n = (v) => (v == null ? '' : String(v).replace('.', ','));
  const rows = orders.map((o) => [o.order_date, o.product, o.client_name, o.client_contact, o.quantity, n(o.price), n(o.cost), n(profitOf(o)),
    n(o.deposit), n(balanceOf(o)), o.paid ? 'Sí' : 'No', statusOf(o.status).label, o.production_date || '', o.delivery_date || '', o.notes]);
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
