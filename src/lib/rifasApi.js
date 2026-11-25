import { sb } from './supabase.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';
import { shrinkImage } from './communityApi.js';

// BAT RIFAS (migración 076 + Edge Function bb-rifas). Toda regla vive en el servidor;
// acá solo se llama a las funciones y se da formato.

export const TZ = 'America/Argentina/Buenos_Aires';
// El acceso público también requiere habilitar bb_rf_admin_only() en Supabase.
export const RIFAS_ADMIN_ONLY = false;
const FN_URL = `${SUPABASE_URL}/functions/v1/bb-rifas`;

export const RAFFLE_STATUS = {
  draft: { label: 'Borrador', cls: 'sample', icon: 'edit' },
  published: { label: 'Publicada', cls: 'ok', icon: 'check' },
  paused: { label: 'Reservas pausadas', cls: 'warn', icon: 'clock' },
  closed: { label: 'Cerrada', cls: 'club', icon: 'lock' },
  archived: { label: 'Archivada', cls: 'muted', icon: 'box' },
};
export const ENTRY_STATUS = {
  pending: { label: 'Esperando pago', short: 'Pendiente', cls: 'warn', icon: 'clock' },
  review: { label: 'Comprobante en revisión', short: 'En revisión', cls: 'cat', icon: 'search' },
  rejected: { label: 'Comprobante rechazado', short: 'Rechazado', cls: 'err', icon: 'alert' },
  confirmed: { label: 'Pago confirmado', short: 'Confirmado', cls: 'ok', icon: 'check' },
  expired: { label: 'Reserva vencida', short: 'Vencido', cls: 'muted', icon: 'x' },
  cancelled: { label: 'Cancelada', short: 'Cancelado', cls: 'muted', icon: 'x' },
};

export const money = (cents) => '$' + (Number(cents || 0) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 });
export const fmtNum = (n, to, from = 0) => (Number(from) > 0 ? String(n) : String(n).padStart(Math.max(String(to).length, 1), '0'));
// Fechas a prueba de valores inválidos (una fecha imposible nunca debe romper la pantalla).
const okDate = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100 ? d : null; };
export const fmtDate = (iso, withTime = true) => { const d = okDate(iso); return d ? d.toLocaleString('es-AR', { timeZone: TZ, dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}) }) : ''; };

// <input type="datetime-local"> se interpreta SIEMPRE como hora de Buenos Aires (UTC−3, sin horario de verano).
export const toLocalInput = (iso) => {
  const d = okDate(iso);
  return d ? new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 16) : '';
};
export const DATE_MIN = '2024-01-01T00:00';
export const DATE_MAX = '2099-12-31T23:59';
export const fromLocalInput = (v) => (/^20\d\d-\d\d-\d\dT\d\d:\d\d$/.test(v || '') ? `${v}:00-03:00` : '');

// Pesos escritos por el admin ("1.500" o "1500,50") → centavos enteros.
export function pesosToCents(v) {
  const s = String(v ?? '').trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i, d = ''] = s.split('.');
  return Number(i) * 100 + Number((d + '00').slice(0, 2));
}
export const centsToPesos = (c) => (c % 100 ? (c / 100).toFixed(2).replace('.', ',') : String(c / 100));

// Enlaces: el de compartir pasa por la página de vista previa (metadatos para WhatsApp)
// cuando BATBOX corre en 3dbat.com.ar; en otro lado, va directo al hash.
export function appBase() {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/index\.html$/, '');
}
export function shareUrl(slug) {
  const host = window.location.hostname;
  if (host === '3dbat.com.ar' || host === 'www.3dbat.com.ar') return `https://3dbat.com.ar/rifa/?r=${encodeURIComponent(slug)}`;
  return `${appBase()}#/rifas/${slug}`;
}
export const entryUrl = (token) => `${appBase()}#/rifas/p/${token}`;
export const verifyUrl = (code) => `${appBase()}#/rifas/v/${code}`;
export const whatsappShare = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const e = new Error(error.code === '42501' ? 'No tenés permiso para esta acción.' : /bb_raffles_slug_key/.test(error.message) ? 'Esa dirección ya la usa otra rifa: elegí otra.' : /bb_raffles_slug_check/.test(error.message) ? 'La dirección debe tener entre 3 y 60 caracteres: letras minúsculas (incluida la ñ), números y guiones.' : /function .* does not exist|PGRST202/.test(error.message + error.code) ? 'Falta correr la migración 076 (BAT RIFAS) en Supabase.' : error.message);
    e.code = error.code;
    throw e;
  }
  return data;
}
const must = (r) => { if (r && r.ok === false) { const e = new Error(r.error); e.data = r; throw e; } return r; };

// ---- Público ----
export const getRaffle = (slug) => rpc('bb_rf_public', { p_slug: slug });
export const reserve = (slug, f) => rpc('bb_rf_reserve', {
  p_slug: slug, p_numbers: f.numbers, p_name: f.name, p_email: f.email, p_phone: f.phone, p_terms_version: f.terms_version, p_client_key: f.client_key,
});
export const getEntry = (token) => rpc('bb_rf_entry', { p_token: token });
export const selfRelease = (token) => rpc('bb_rf_self_release', { p_token: token });
export const verifyTicket = (code) => rpc('bb_rf_verify', { p_code: code });
export const getHome = () => rpc('bb_rf_home', {});

// ¿Hay alguna rifa activa? (para el brillo del botón del menú). Cacheado 2 min; si falla, no brilla.
// La caché depende de quién mira (en etapa de prueba la base solo responde a admins).
let liveCache = { key: '', at: 0, value: false, p: null };
export function fetchRafflesLive(who = '') {
  if (liveCache.key === who && Date.now() - liveCache.at < 60000) return Promise.resolve(liveCache.value);
  if (!(liveCache.p && liveCache.key === who)) {
    const p = sb.rpc('bb_rf_active_count').then(({ data }) => { liveCache = { key: who, at: Date.now(), value: (data || 0) > 0, p: null }; return liveCache.value; })
      .catch(() => { liveCache = { key: who, at: Date.now(), value: false, p: null }; return false; });
    liveCache = { ...liveCache, key: who, p };
  }
  return liveCache.p;
}

async function callFn(body, { auth = false } = {}) {
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY };
  if (auth) {
    const { data } = await sb.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  if (!(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  let r;
  try { r = await fetch(FN_URL, { method: 'POST', headers, body }); } catch { throw new Error('Sin conexión. Revisá internet y probá de nuevo.'); }
  const out = await r.json().catch(() => ({ ok: false, error: 'Respuesta inesperada del servidor.' }));
  if (!r.ok || out.ok === false) throw new Error(out.error || `Error ${r.status}`);
  return out;
}
export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const PROOF_MAX = 5 * 1024 * 1024;
export function uploadProof(token, file) {
  if (file.size > PROOF_MAX) return Promise.reject(new Error('El archivo supera 5 MB.'));
  const fd = new FormData();
  fd.append('token', token);
  fd.append('file', file);
  return callFn(fd);
}
// Pide el envío de los correos en cola. Si falla, la reserva sigue firme (se reenvía desde el panel).
export const flushMail = (token) => callFn({ action: 'mail', token }).catch(() => null);

// ---- Admin (cada función vuelve a chequear is_admin() en la base) ----
export const adminList = () => rpc('bb_rf_admin_list', {});
export const adminGet = (id) => rpc('bb_rf_admin_get', { p_id: id });
export const adminSave = (p) => rpc('bb_rf_admin_save', { p });
export const adminSetStatus = async (id, status) => must(await rpc('bb_rf_admin_set_status', { p_id: id, p_status: status }));
export const adminDuplicate = (id) => rpc('bb_rf_admin_duplicate', { p_id: id });
export const adminEntries = (raffleId, { q = '', status = '', sort = 'recent', page = 1, size = 25 } = {}) =>
  rpc('bb_rf_admin_entries', { p_raffle: raffleId, p_q: q, p_status: status, p_sort: sort, p_page: page, p_size: size });
export const adminEntry = (id) => rpc('bb_rf_admin_entry', { p_entry: id });
export const adminManual = async (raffleId, p, op) => must(await rpc('bb_rf_admin_manual', { p_raffle: raffleId, p, p_op: op }));
export const adminConfirm = async (id, op) => must(await rpc('bb_rf_admin_confirm', { p_entry: id, p_op: op }));
export const adminReject = async (id, reason, mode, hours, op) => must(await rpc('bb_rf_admin_reject', { p_entry: id, p_reason: reason, p_mode: mode, p_hours: hours, p_op: op }));
// Borra canceladas/vencidas (una o todas) y después sus archivos de comprobante.
export async function adminDeleteEntries(raffleId, entryId = null) {
  const r = must(await rpc('bb_rf_admin_delete_entries', { p_raffle: raffleId, p_entry: entryId }));
  if (r.paths?.length) await sb.storage.from('bb-rifas-comprobantes').remove(r.paths).catch(() => {});
  return r;
}
export const adminNote = async (id, note) => must(await rpc('bb_rf_admin_note', { p_entry: id, p_note: note }));
export const adminCancel = async (id, reason, op) => must(await rpc('bb_rf_admin_cancel', { p_entry: id, p_reason: reason, p_op: op }));
export async function adminResend(id, kind, op) {
  must(await rpc('bb_rf_admin_resend', { p_entry: id, p_kind: kind, p_op: op }));
  return callFn({ action: 'mail', entry_id: id }, { auth: true });
}
export const adminMailFlush = (id) => callFn({ action: 'mail', entry_id: id }, { auth: true });
export const adminCloseSummary = (id) => rpc('bb_rf_admin_close_summary', { p_raffle: id });
export const adminSetWinners = async (id, numbers) => must(await rpc('bb_rf_admin_set_winners', { p_raffle: id, p_numbers: numbers }));
export const adminClose = async (id, releasePending) => must(await rpc('bb_rf_admin_close', { p_raffle: id, p_release_pending: releasePending }));
export const adminExportCreate = async (id, reason, op) => must(await rpc('bb_rf_admin_export_create', { p_raffle: id, p_reason: reason, p_op: op }));
export const adminExportGet = (id) => rpc('bb_rf_admin_export_get', { p_export: id });
// Portada: se achica en el navegador (máx. 1600 px, WebP) y se sube al bucket público de portadas (solo admins).
export async function uploadCover(raffleId, file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Elegí una foto JPG, PNG o WebP.');
  const { blob } = await shrinkImage(file, 1600);
  const path = `${raffleId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.webp`;
  const { error } = await sb.storage.from('bb-rifas-portadas').upload(path, blob, { contentType: 'image/webp', upsert: false });
  if (error) throw new Error(/row-level|policy|Unauthorized/i.test(error.message) ? 'Para subir la portada tenés que iniciar sesión como admin.' : error.message || 'No se pudo subir la foto.');
  return sb.storage.from('bb-rifas-portadas').getPublicUrl(path).data.publicUrl;
}

export async function proofUrl(path) {
  const { data, error } = await sb.storage.from('bb-rifas-comprobantes').createSignedUrl(path, 600);
  if (error) throw new Error('No se pudo abrir el comprobante (¿sos admin?).');
  return data.signedUrl;
}

// Descarga el texto EXACTO guardado en la base (sin re-codificar).
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
