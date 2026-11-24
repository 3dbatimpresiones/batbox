import { sb } from './supabase.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';

const scope = new URL(import.meta.env.BASE_URL, window.location.origin);
const worker = new URL('batbox-sw.js', scope).href;
const stateKey = new URL('__rifas_push_device__', scope).href;
const storageKey = 'batbox-rifas-push-v1';
const ownerKey = storageKey + '-owner';
const endpoint = `${SUPABASE_URL}/functions/v1/bb-rifas-push`;
let preparation;
let mutations = Promise.resolve();

export const EVENT_LABELS = {
  registered: 'Participación registrada',
  confirmed: 'Pago confirmado',
  reminder: 'Próximo vencimiento',
  expired: 'Reserva vencida',
  cancelled: 'Números cancelados',
  test: 'Prueba del administrador',
};
export const DELIVERY_LABELS = {
  queued: 'Envío push pendiente',
  sending: 'Envío push pendiente',
  accepted: 'Aceptado por el servicio push',
  failed: 'Envío push fallido',
  skipped: 'Sin envío push',
};

async function rpc(name, params = {}) {
  const { data, error } = await sb.rpc('bb_rp_' + name, params).abortSignal(AbortSignal.timeout(8000));
  if (error) throw new Error(error.code === 'PGRST202' ? 'Los avisos de rifas todavía no están habilitados.' : error.message);
  return data;
}

function getDevice() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || null; } catch { return null; }
}

function ownerMatches(owner) {
  try { return localStorage.getItem(ownerKey) === JSON.stringify(owner); } catch { return false; }
}

function mutate(fn) {
  const run = () => navigator.locks ? navigator.locks.request(storageKey, fn) : fn();
  const result = mutations.then(run);
  mutations = result.catch(() => {});
  return result;
}

async function saveDevice(device) {
  const cache = await caches.open(storageKey);
  const entries = device ? Object.keys(device.tickets) : [];
  if (device) {
    await cache.put(stateKey, new Response(JSON.stringify({ device: device.id, entries, admin: device.admin })));
    localStorage.setItem(storageKey, JSON.stringify(device));
  } else {
    await cache.delete(stateKey);
    localStorage.removeItem(storageKey);
  }
  const reg = await navigator.serviceWorker.getRegistration(scope.href);
  for (const n of await reg?.getNotifications?.().catch(() => []) || []) {
    if (!n.tag.startsWith('bat-rifa-')) continue;
    if (!device || n.data?.device !== device.id || (n.data?.test ? !device.admin : !entries.includes(n.data?.entry))) n.close();
  }
}

export function platformState() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = navigator.standalone || matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches;
  if (ios && !installed) return 'install';
  if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator)
    || !('PushManager' in window) || !('caches' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' ? 'granted' : 'pending';
}

async function registration() {
  const current = await navigator.serviceWorker.getRegistration(scope.href);
  const installed = current?.active || current?.waiting || current?.installing;
  if (current && installed?.scriptURL !== worker) {
    throw new Error('Este sitio ya tiene un Service Worker que requiere integración.');
  }
  await navigator.serviceWorker.register(worker, { scope: scope.pathname });
  let timer;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('El navegador no pudo preparar los avisos.')), 10000); }),
    ]);
  } finally { clearTimeout(timer); }
}

export function preparePush() {
  if (!preparation) preparation = Promise.all([
    registration(),
    fetch(endpoint, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(8000) })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!/^[\w-]{87}$/.test(data?.publicKey || '')) throw new Error('El envío push todavía no está disponible.');
        return Uint8Array.from(atob(data.publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='), (x) => x.charCodeAt(0));
      }),
  ]).then(([reg, key]) => ({ reg, key })).catch((error) => { preparation = null; throw error; });
  return preparation;
}

function newSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, '0')).join('');
}

async function clearDevice(device, reg) {
  await saveDevice(null);
  const subscription = await reg?.pushManager.getSubscription().catch(() => null);
  await Promise.allSettled([
    subscription?.unsubscribe(),
    device?.secret ? rpc('disable', { p_secret: device.secret }) : null,
  ]);
}

export function switchPushOwner(owner, force = false) {
  try {
    localStorage.setItem(ownerKey, force ? 'detached' : JSON.stringify(owner));
  } catch { /* El navegador no puede persistir el vínculo. */ }
  const device = getDevice();
  if (!device || (!force && device.owner === owner)) return Promise.resolve();
  // Cerrar el acceso del trabajador local aun si una escritura SQL sigue en curso.
  const fence = caches.open(storageKey).then((cache) => cache.delete(stateKey)).catch(() => {});
  return mutate(async () => {
    await fence;
    const active = getDevice();
    if (active && (force || active.owner !== owner)) await clearDevice(active, await navigator.serviceWorker.getRegistration(scope.href));
  });
}

async function bind({ subscription, owner, existing, token, raffle, entry, admin }) {
  if (!ownerMatches(owner)) throw new Error('La cuenta cambió. Volvé a abrir el ticket.');
  const secret = existing?.secret || newSecret();
  const id = await rpc('subscribe', {
    p_secret: secret,
    p_subscription: subscription.toJSON(),
    p_base: scope.href,
    p_token: token || null,
    p_admin: !!admin,
  });
  if (!ownerMatches(owner)) {
    await rpc('disable', { p_secret: secret }).catch(() => {});
    throw new Error('La cuenta cambió. Volvé a abrir el ticket.');
  }
  const tickets = { ...existing?.tickets };
  if (entry) tickets[entry] = { token, raffle };
  try {
    await saveDevice({ id, secret, owner, admin: !!(existing?.admin || admin), tickets });
    if (!ownerMatches(owner)) {
      await saveDevice(null);
      const reg = await navigator.serviceWorker.getRegistration(scope.href);
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
      throw new Error('La cuenta cambió. Volvé a abrir el ticket.');
    }
  } catch (error) {
    await rpc('disable', { p_secret: secret }).catch(() => {});
    throw error;
  }
}

// subscribe() se invoca en el propio gesto. El navegador gestiona su diálogo.
export function enablePush(prepared, { owner, token, raffle, entry, admin = false }) {
  const existing = getDevice();
  if (!ownerMatches(owner) || (existing && existing.owner !== owner)) return Promise.reject(new Error('La cuenta cambió. Volvé a abrir el ticket.'));
  const { reg, key } = prepared;
  const subscription = reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    .then((value) => ({ value }), (error) => ({ error }));
  return mutate(async () => {
    const active = getDevice();
    if (active && active.owner !== owner) throw new Error('La cuenta cambió. Volvé a abrir el ticket.');
    const settled = await subscription;
    if (settled.error) throw settled.error;
    await bind({ subscription: settled.value, owner, existing: active, token, raffle, entry, admin });
  });
}

export async function followNewTicket({ owner, token, raffle, entry }) {
  if (!hasFollow(raffle, owner) || platformState() !== 'granted') return;
  return mutate(async () => {
    const active = getDevice();
    if (!active || active.owner !== owner || active.tickets[entry] || !hasFollow(raffle, owner)) return;
    const reg = await navigator.serviceWorker.getRegistration(scope.href);
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription) await bind({ subscription, owner, existing: active, token, raffle, entry });
  });
}

export function hasFollow(raffle, owner) {
  const d = getDevice();
  return !!raffle && ownerMatches(owner) && d?.owner === owner && Object.values(d.tickets).some((t) => t.raffle === raffle);
}

export function disableRaffle(token, raffle, owner) {
  return mutate(async () => {
    const d = getDevice();
    if (!d || d.owner !== owner) return;
    const tickets = Object.fromEntries(Object.entries(d.tickets).filter(([, t]) => t.raffle !== raffle));
    await saveDevice({ ...d, tickets });
    await rpc('disable', { p_secret: d.secret, p_token: token });
  });
}

export function linkedTicket(entry, owner) {
  const d = getDevice();
  const t = ownerMatches(owner) && d?.owner === owner && d.tickets?.[entry];
  return t ? t.token : null;
}

export async function subscriptionPresent(prepared) {
  return !!await prepared?.reg.pushManager.getSubscription();
}

export function getInbox(token, owner) {
  const d = getDevice();
  return rpc('inbox', { p_token: token, p_secret: ownerMatches(owner) && d?.owner === owner ? d.secret : null });
}

export const markRead = (token, event) => rpc('read', { p_token: token, p_event: event });
export const getPushAdmin = () => rpc('admin_config');
export const savePushAdmin = (config) => rpc('admin_save', { p_enabled: config.enabled, p_lead: Number(config.lead_minutes), p_rules: config.rules });
export function sendPushTest(kind, owner) {
  const d = getDevice();
  if (!ownerMatches(owner) || !d?.admin || d.owner !== owner) throw new Error('Primero activá este dispositivo.');
  return rpc('admin_test', { p_secret: d.secret, p_kind: kind });
}
