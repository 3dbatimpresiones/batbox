import { sb } from './supabase.js';

// Suscripciones de Mercado Pago (migración 014 + Edge Function "mp-webhook").
// Todo lo valida la base: la persona solo ve y edita lo suyo; el panel, solo admins.

const msg = (error) => {
  const m = error?.message || 'Error de conexión';
  if (/bb_request_access|bb_my_subscription|bb_admin_subscriptions|function .* does not exist|PGRST202/i.test(m + (error?.code || ''))) {
    return 'Falta correr la migración 014 (suscripciones) en Supabase.';
  }
  return m;
};

// Solicitud de acceso / "Mis datos". Devuelve el estado: approved · pending · not_found · …
export async function requestAccess(f) {
  const { data, error } = await sb.rpc('bb_request_access', {
    p_first_name: f.first_name.trim(), p_last_name: f.last_name.trim(), p_phone: f.phone.trim(),
    p_discord: f.discord.trim() || null, p_instagram: f.instagram.trim() || null,
    p_operation: f.operation?.trim() || null,
  });
  if (error) throw new Error(msg(error));
  return data;
}

export async function mySubscription() {
  if (SIM_DB) {
    return { first_name: 'Maker', last_name: 'Ejemplo', phone: '11 5555-0000', discord: 'maker', instagram: 'maker3d', status: 'approved', expires_at: new Date(Date.now() + 33 * 864e5).toISOString(),
      subscription: { status: 'authorized', next_payment_date: new Date(Date.now() + 23 * 864e5).toISOString(), amount: 5000 },
      payments: [0, 1, 2].map((i) => ({ id: String(90000000100 + i), paid_at: new Date(Date.now() - (7 + 30 * i) * 864e5).toISOString(), amount: 5000, status: 'approved', source: 'mp' })) };
  }
  const { data, error } = await sb.rpc('bb_my_subscription');
  if (error) throw new Error(msg(error));
  return data; // null si todavía no tiene ficha
}

export async function adminSubscriptions() {
  const { data, error } = await sb.rpc('bb_admin_subscriptions');
  if (error) throw new Error(msg(error));
  return data;
}

export async function linkSubscription(subId, memberId) {
  const { error } = await sb.rpc('bb_admin_link_subscription', { p_sub: subId, p_member: memberId });
  if (error) throw new Error(msg(error));
}

export async function memberFromSubscription(subId) {
  const { data, error } = await sb.rpc('bb_admin_member_from_subscription', { p_sub: subId });
  if (error) throw new Error(/bb_admin_member_from_subscription|PGRST202/.test(error.message + error.code) ? 'Falta correr la migración 018 en Supabase.' : error.message);
  return data; // id del miembro
}

// Editar nombre, apellido, celular, Discord e Instagram de un miembro (migración 019).
export async function updateMember(memberId, f) {
  const { error } = await sb.rpc('bb_admin_update_member', {
    p_member: memberId, p_first_name: f.first_name.trim(), p_last_name: f.last_name.trim(),
    p_phone: f.phone.trim(), p_discord: f.discord.trim(), p_instagram: f.instagram.trim(),
  });
  if (error) throw new Error(/bb_admin_update_member|PGRST202/.test(error.message + error.code) ? 'Falta correr la migración 019 en Supabase.' : error.message);
}

export async function unlinkSubscription(subId) {
  const { error } = await sb.rpc('bb_admin_unlink_subscription', { p_sub: subId });
  if (error) throw new Error(/bb_admin_unlink_subscription|PGRST202/.test(error.message + error.code) ? 'Falta correr la migración 017 en Supabase.' : error.message);
}

export async function manualPayment(memberId, { amount, date, months, notes }) {
  const { error } = await sb.rpc('bb_admin_manual_payment', {
    p_member: memberId, p_amount: Number(amount), p_paid_at: date, p_months: Number(months), p_notes: notes || '',
  });
  if (error) throw new Error(msg(error));
}

export async function deleteManualPayment(id) {
  const { error } = await sb.rpc('bb_admin_delete_manual_payment', { p_id: id });
  if (error) throw new Error(msg(error));
}

// Trae de Mercado Pago todas las suscripciones del plan y sus cobros.
export async function syncMercadoPago() {
  const { data, error } = await sb.functions.invoke('mp-webhook', { body: { action: 'sync' } });
  if (!error) return data;
  let text = data?.error;
  if (error.context?.json) { try { text = (await error.context.json()).error || text; } catch { /* sin cuerpo */ } }
  if (error.context?.status === 404 || /Failed to send/i.test(error.message)) text = 'Falta instalar la función mp-webhook en Supabase.';
  throw new Error(text || error.message);
}

// ---- Fechas y montos ----
export const money = (v) => (v == null ? '—' : Number(v).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }));
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const daysLeft = (d) => (d ? Math.ceil((new Date(d) - Date.now()) / 864e5) : null);

export const SUB_STATUS = {
  authorized: { label: 'Activa', cls: 'ok' },
  pending: { label: 'Pendiente', cls: 'warn' },
  paused: { label: 'Pausada', cls: 'orange' },
  cancelled: { label: 'Cancelada', cls: 'muted' },
};
export const PAY_STATUS = {
  approved: { label: 'Aprobado', cls: 'ok' },
  pending: { label: 'Pendiente', cls: 'warn' },
  in_process: { label: 'En proceso', cls: 'warn' },
  rejected: { label: 'Rechazado', cls: 'err' },
  cancelled: { label: 'Cancelado', cls: 'muted' },
  refunded: { label: 'Devuelto', cls: 'muted' },
  charged_back: { label: 'Contracargo', cls: 'err' },
};

// Exporta a CSV que Excel abre bien en español (separador ; y acentos OK).
export function downloadCsv(head, rows, filename) {
  const cell = (v) => {
    let s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // que Excel no lo tome como fórmula
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = '\ufeff' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- Solo `npm run dev` con ?simdb: datos ficticios para ver las pantallas ----
export const SIM_DB = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('simdb');
const d = (days) => new Date(Date.now() + days * 864e5).toISOString();
export const SIM_MEMBERS = SIM_DB ? [
  { id: 'm1', email: 'maker.uno@ejemplo.com', first_name: 'Maker', last_name: 'Uno', phone: '11 5555-0001', discord_username: 'makeruno', status: 'approved', subscription_expires_at: d(33) },
  { id: 'm2', email: 'maker.dos@ejemplo.com', first_name: 'Maker', last_name: 'Dos', phone: '11 5555-0002', status: 'approved', subscription_expires_at: d(4) },
  { id: 'm3', email: 'maker.tres@ejemplo.com', first_name: 'Maker', last_name: 'Tres', status: 'approved', subscription_expires_at: d(-3) },
  { id: 'm4', email: 'maker.cuatro@ejemplo.com', first_name: 'Maker', last_name: 'Cuatro', status: 'approved', subscription_expires_at: null },
  { id: 'm5', email: 'maker.cinco@ejemplo.com', first_name: 'Maker', last_name: 'Cinco', status: 'approved', subscription_expires_at: d(80) },
  { id: 'm6', email: 'maker.seis@ejemplo.com', first_name: 'Maker', last_name: 'Seis', status: 'pending', subscription_expires_at: null },
] : [];
const simPays = [];
if (SIM_DB) {
  for (let i = 0; i < 9; i++) simPays.push({ id: String(90000000100 + i), subscription_id: 's1', member_id: 'm1', source: 'mp', status: 'approved', amount: 5000, paid_at: d(3 - 30 * i), months: 1, notes: '' });
  for (let i = 0; i < 4; i++) simPays.push({ id: String(90000000200 + i), subscription_id: 's2', member_id: 'm2', source: 'mp', status: i === 0 ? 'rejected' : 'approved', amount: 5000, paid_at: d(-26 - 30 * i), months: 1, notes: '' });
  simPays.push({ id: '90000000301', subscription_id: 's3', member_id: 'm3', source: 'mp', status: 'approved', amount: 5000, paid_at: d(-43), months: 1, notes: '' });
  simPays.push({ id: 'manual-1', member_id: 'm5', source: 'manual', status: 'approved', amount: 14000, paid_at: d(-10), months: 3, notes: 'Transferencia' });
  simPays.push({ id: '90000000401', subscription_id: 's4', member_id: null, source: 'mp', status: 'approved', amount: 5000, paid_at: d(-1), months: 1, notes: '' });
  for (let i = 0; i < 5; i++) simPays.push({ id: String(90000000500 + i), subscription_id: 'a1', member_id: null, product: 'publicidad', source: 'mp', status: 'approved', amount: 9000, paid_at: d(-2 - 30 * i), months: 1, notes: '' });
  simPays.push({ id: '90000000601', subscription_id: 'a2', member_id: null, product: 'publicidad', source: 'mp', status: 'approved', amount: 9000, paid_at: d(-70), months: 1, notes: '' });
  simPays.sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at));
}
export const SIM_SUBS = SIM_DB ? {
  subscriptions: [
    { id: 's4', status: 'authorized', payer_email: 'cuenta.mp@hotmail.com', payer_name: 'Maker Cuatro', amount: 5000, date_created: d(-1), next_payment_date: d(29), member_id: null },
    { id: 's5', status: 'authorized', payer_email: 'makerseis.ventas@yahoo.com', amount: 5000, date_created: d(-20), next_payment_date: d(10), member_id: null },
    { id: 's6', status: 'authorized', payer_email: 'otra.persona@gmail.com', payer_name: 'Juana Gómez', amount: 5000, date_created: d(-40), next_payment_date: d(20), member_id: null },
    { id: 's7', status: 'cancelled', payer_email: 'vieja@hotmail.com', amount: 4000, date_created: d(-300), next_payment_date: null, member_id: null },
    { id: 's1', status: 'authorized', payer_email: 'maker.uno@ejemplo.com', amount: 5000, date_created: d(-240), next_payment_date: d(23), member_id: 'm1', linked_by: 'email' },
    { id: 's2', status: 'authorized', payer_email: 'otro.correo@yahoo.com', amount: 5000, date_created: d(-120), next_payment_date: d(-6), member_id: 'm2', linked_by: 'operacion' },
    { id: 'a1', product: 'publicidad', status: 'authorized', payer_email: 'tienda.filamentos@ejemplo.com', amount: 9000, date_created: d(-150), next_payment_date: d(28), member_id: null },
    { id: 'a2', product: 'publicidad', status: 'cancelled', payer_email: 'repuestos3d@ejemplo.com', amount: 9000, date_created: d(-100), next_payment_date: null, member_id: null },
    { id: 's3', status: 'cancelled', payer_email: 'maker.tres@ejemplo.com', amount: 5000, date_created: d(-43), next_payment_date: null, member_id: 'm3', linked_by: 'email' },
  ],
  payments: simPays,
  last_event: { at: d(-0.02), ok: true, topic: 'subscription_authorized_payment', detail: 'suscripción s1' },
} : null;
