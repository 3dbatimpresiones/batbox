// Integración local. Ninguna llamada toca Supabase o un proveedor push real.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

const file = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const db = new PGlite();
const admin = '00000000-0000-0000-0000-00000000000a';
const other = '00000000-0000-0000-0000-00000000000b';
const base = 'https://3dbat.com.ar/batbox/';
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), '') = '1' $$;
  grant execute on function public.is_admin() to anon, authenticated;
  insert into auth.users values ('${admin}', 'admin@example.test'), ('${other}', 'other@example.test');
`);
for (const sql of ['076_batbox_rifas.sql','077_batbox_rifas_acceso_publico.sql','078_batbox_rifas_correo_cancelacion.sql','079_batbox_rifas_web_push.sql']) {
  await db.exec(file('supabase/' + sql));
}

const contexts = {
  root: "set test.uid = ''; set test.admin = '0';",
  anon: "set role anon; set test.uid = ''; set test.admin = '0';",
  user: `set role authenticated; set test.uid = '${other}'; set test.admin = '0';`,
  admin: `set role authenticated; set test.uid = '${admin}'; set test.admin = '1';`,
  otherAdmin: `set role authenticated; set test.uid = '${other}'; set test.admin = '1';`,
  worker: "set role service_role; set test.uid = ''; set test.admin = '0';",
};
async function sql(role, query, args = []) {
  await db.exec('reset role; ' + contexts[role]);
  try { return (await db.query(query, args)).rows; }
  finally { await db.exec('reset role;'); }
}
async function first(role, query, args = []) {
  const [row] = await sql(role, query, args);
  return row ? Object.values(row)[0] : null;
}
const call = (role, fn, ...args) => first(role, `select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args);
const rp = (role, fn, ...args) => call(role, 'bb_rp_' + fn, ...args);
const rf = (role, fn, ...args) => call(role, 'bb_rf_' + fn, ...args);
const mkRaffle = async (slug, title) => {
  const id = await rf('admin', 'admin_save', { slug, title, num_from: 0, num_to: 99, max_per_entry: 25,
    pay_hours: 2, price_cents: 10000, transfer_info: 'pago.ficticio', terms: 'Bases ficticias de prueba.' });
  assert.equal((await rf('admin', 'admin_set_status', id, 'published')).ok, true);
  return id;
};
const slug = 'navideña-fixture';
const raffle = await mkRaffle(slug, 'Navideña {hora}');
await mkRaffle('otra-fixture', 'Segunda rifa');
const reserve = async (numbers, id = crypto.randomUUID(), at = slug) => {
  const result = await rf('anon','reserve',at,numbers,'Persona de prueba','persona@example.test','1155550000',1,id);
  assert.equal(result.ok,true, JSON.stringify(result));
  return result;
};
const events = (entry, kind) => sql('root',
  'select * from public.bb_rp_events where entry_id=$1 and kind=$2 order by created_at',
  [entry.entry_id,kind]);
const jobsFor = (entry) => sql('root', `
  select d.*, n.kind from public.bb_rp_deliveries d join public.bb_rp_events n on n.id=d.event_id where n.entry_id=$1
`, [entry.entry_id]);
const tick = () => rp('worker','tick');
const cfg = await rp('admin','admin_config');
assert.equal(cfg.lead_minutes,30);
assert.equal(cfg.enabled,false);
await assert.rejects(rp('user','admin_config'), /permiso|admin/i);
await assert.rejects(rp('anon','claim'), /permission denied/);
await assert.rejects(rp('anon','inbox','a'.repeat(64),null), /inválido/);
await assert.rejects(rp('admin','admin_save',true,30,{
  ...cfg.defaults, registered: { ...cfg.defaults.registered, title: '{email}' },
}), /Plantilla inválida/);
await assert.rejects(rp('admin','admin_save',true,30,{
  ...cfg.defaults, cancelled: { ...cfg.defaults.cancelled, body: '   ' },
}), /Plantilla inválida/);
await rp('admin','admin_save',true,30,cfg.defaults);

const op = crypto.randomUUID();
const entry = await reserve([3,8],op);
assert.equal((await reserve([3,8],op)).entry_id,entry.entry_id);
const [registered] = await events(entry,'registered');
assert.match(registered.body,/Navideña \{hora\}/);
assert.equal((await events(entry,'registered')).length,1);
assert.equal((await events(entry,'confirmed')).length,0);
const before = await rp('anon','inbox',entry.token,null);
assert.equal(before.subscribed,false);
assert.equal(before.events[0].push_status,null);
assert.equal(before.events[0].read_at,null);
await rp('anon','read',entry.token,registered.id);
assert.ok((await rp('anon','inbox',entry.token,null)).events[0].read_at);
assert.equal((await jobsFor(entry)).length,0);

const sub = (name) => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/' + name, keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) } });
const s1 = '1'.repeat(64), s2 = '2'.repeat(64);
const link = (e, key, name, role = 'anon') => rp(role,'subscribe',key,sub(name),base,e.token,false);
const a = await link(entry,s1,'device-a');
const b = await link(entry,s2,'device-b');
assert.notEqual(a,b);
assert.equal(await link(entry,s1,'device-a'),a);
await assert.rejects(link(entry,'3'.repeat(64),'device-a'),/otro dispositivo/);
await assert.rejects(rp('anon','subscribe','4'.repeat(64),{ ...sub('x'), endpoint: 'https://127.0.0.1/example' },base,entry.token,false),/incompatible/);
await assert.rejects(rp('anon','subscribe','4'.repeat(64),sub('x'),base,null,true),/permiso|admin/i);
assert.equal((await jobsFor(entry)).filter((j) => j.kind === 'registered').length,2);
const proof = await rf('worker','attach_proof',entry.token,`${raffle}/${entry.entry_id}/fixture.pdf`,'application/pdf',500);
assert.equal(proof.ok,true);
assert.equal((await events(entry,'confirmed')).length,0);
await sql('root',"update public.bb_raffle_entries set expires_at=now()+interval '10 minutes' where id=$1",[entry.entry_id]);
await tick();
assert.equal((await events(entry,'reminder')).length,0, 'review preserva números');

await sql('root',"update public.bb_raffle_tickets set status='confirmed' where entry_id=$1 and number=3",[entry.entry_id]);
const [partial] = await events(entry,'confirmed');
assert.deepEqual(partial.numbers,[3]);
assert.match(partial.body,/números 03 para/);
assert.doesNotMatch(partial.body,/08/);
await rf('admin','admin_confirm',entry.entry_id,crypto.randomUUID());
await rf('admin','admin_confirm',entry.entry_id,crypto.randomUUID());
const confirmations = await events(entry,'confirmed');
assert.deepEqual(confirmations.map((e) => e.numbers),[[3],[8]]);
await tick();
assert.equal((await events(entry,'expired')).length,0);

const next = await reserve([10,11,12,13,14,15,16,17,18,19]);
await link(next,s1,'device-a');
await rf('admin','admin_confirm',next.entry_id,crypto.randomUUID());
assert.match((await events(next,'confirmed'))[0].body,/10, 11, 12, 13, 14, 15, 16, 17 \+2 más/);
const second = await reserve([3],undefined,'otra-fixture');
await link(second,s1,'device-a');
await rp('anon','disable',s1,entry.token);
assert.equal((await rp('anon','inbox',entry.token,s1)).subscribed,false);
assert.equal((await rp('anon','inbox',second.token,s1)).subscribed,true);
assert.equal((await rp('anon','inbox',entry.token,s2)).subscribed,true);

const reminder = await reserve([25]);
await link(reminder,s2,'device-b');
await sql('root',"update public.bb_raffle_entries set expires_at='2099-01-01 01:10:00+00' where id=$1",[reminder.entry_id]);
await db.exec("alter table public.bb_raffle_entries disable trigger bb_rp_deadline_version");
await sql('root',"update public.bb_raffle_entries set expires_at=now()+interval '20 minutes', rp_deadline_since=now()-interval '2 hours' where id=$1",[reminder.entry_id]);
await db.exec("alter table public.bb_raffle_entries enable trigger bb_rp_deadline_version");
await tick();
await tick();
const [old] = await events(reminder,'reminder');
assert.ok(old);
assert.equal((await events(reminder,'reminder')).length,1);
assert.match(old.body,/vence el \d\d\/\d\d\/\d\d\d\d a las \d\d:\d\d/);
assert.equal(await rp('root','valid',old.id,b),true);
await sql('root',"update public.bb_raffle_entries set expires_at=now()+interval '21 minutes' where id=$1",[reminder.entry_id]);
assert.equal(await rp('root','valid',old.id,b),false);
await tick();
const reminders = await events(reminder,'reminder');
assert.equal(reminders.length,2);
assert.equal(await rp('root','valid',reminders[1].id,b),true);
await rf('admin','admin_confirm',reminder.entry_id,crypto.randomUUID());
assert.equal(await rp('root','valid',reminders[1].id,b),false);
await tick();
assert.equal((await events(reminder,'expired')).length,0);

const tooShort = await reserve([26]);
await db.exec('alter table public.bb_raffle_entries disable trigger bb_rp_deadline_version');
await sql('root',"update public.bb_raffle_entries set expires_at=created_at+interval '20 minutes' where id=$1",[tooShort.entry_id]);
await db.exec('alter table public.bb_raffle_entries enable trigger bb_rp_deadline_version');
await tick();
assert.match((await events(tooShort,'reminder'))[0].skip_reason,/menor a la anticipación/);
assert.equal((await rp('anon','inbox',tooShort.token,null)).events.some((e) => e.kind === 'reminder'),false);
await rp('admin','admin_save',true,180,cfg.defaults);
const shortAtCreation = await reserve([27]);
assert.match((await events(shortAtCreation,'reminder'))[0].skip_reason,/menor a la anticipación/);
await rp('admin','admin_save',true,30,cfg.defaults);

const expired = await reserve([30]);
await link(expired,s2,'device-b');
await sql('root',"update public.bb_raffle_entries set expires_at=now()-interval '1 minute' where id=$1",[expired.entry_id]);
await tick();
await tick();
const [expiredNotice] = await events(expired,'expired');
assert.equal((await events(expired,'expired')).length,1);
assert.equal((await events(expired,'cancelled')).length,0);
assert.match(expiredNotice.body,/consultar la disponibilidad actual/);
assert.equal(await rp('root','valid',expiredNotice.id,b),true);
const replacement = await reserve([30]);
await link(replacement,s2,'device-b');
assert.equal(await rp('root','valid',expiredNotice.id,b),false);
assert.ok((await rp('anon','inbox',expired.token,s2)).events.find((e) => e.kind === 'expired'));

const cancelled = await reserve([35,36]);
await link(cancelled,s2,'device-b');
const cancelOp = crypto.randomUUID();
await rf('admin','admin_cancel',cancelled.entry_id,'Motivo interno de prueba',cancelOp);
assert.equal((await rf('admin','admin_cancel',cancelled.entry_id,'Motivo interno de prueba',cancelOp)).repeated,true);
const [cancelNotice] = await events(cancelled,'cancelled');
assert.equal((await events(cancelled,'cancelled')).length,1);
assert.deepEqual(cancelNotice.numbers,[35,36]);
assert.doesNotMatch(cancelNotice.body,/Motivo interno|devolv/);
await sql('root',"update public.bb_rp_events set created_at=now()-interval '15 minutes' where entry_id=$1 and kind='registered'",[cancelled.entry_id]);
await link(cancelled,'7'.repeat(64),'device-late');
assert.equal((await jobsFor(cancelled)).length,2, 'el nuevo dispositivo no recibe avisos viejos');

const activeJob = (await sql('worker','select * from public.bb_rp_claim()')).find((j) => j.event_id === cancelNotice.id);
assert.ok(activeJob);
const [eventId,deviceId,lease] = [activeJob.event_id,activeJob.device_id,activeJob.lease];
const payload = await rp('worker','payload',eventId,deviceId,lease);
assert.deepEqual(Object.keys(payload.message).sort(), ['body','device','entry','id','slug','test','title','until']);
assert.equal(payload.message.slug, slug);
assert.doesNotMatch(JSON.stringify(payload.message),/example\.test|pago\.ficticio|Motivo interno/);
assert.equal(await rp('worker','payload',eventId,deviceId,crypto.randomUUID()),null);
await rp('worker','done',eventId,deviceId,lease,'retry','HTTP 429');
assert.equal((await sql('worker','select * from public.bb_rp_claim()')).some((j) => j.event_id === eventId),false);
assert.equal((await jobsFor(cancelled)).find((j) => j.event_id === eventId).status,'queued');
assert.equal(await first('root','select active from public.bb_rp_devices where id=$1',[deviceId]),true);
await sql('root',"update public.bb_rp_deliveries set next_at=now()-interval '1 second' where event_id=$1",[eventId]);
const retried = (await sql('worker','select * from public.bb_rp_claim()')).find((j) => j.event_id === eventId);
assert.notEqual(retried.lease,lease);
await rp('worker','done',eventId,deviceId,retried.lease,'gone','HTTP 410');
assert.equal(await first('root','select active from public.bb_rp_devices where id=$1',[deviceId]),false);
assert.deepEqual(await sql('root','select result from public.bb_rp_attempts where event_id=$1 order by attempt',[eventId]),[{result:'retry'},{result:'gone'}]);

const late = await reserve([40]);
await sql('root',"update public.bb_rp_events set created_at=now()-interval '15 minutes' where entry_id=$1",[late.entry_id]);
await link(late,s1,'device-a');
assert.equal((await jobsFor(late)).length,0);
await rf('admin','admin_confirm',late.entry_id,crypto.randomUUID());
await rp('admin','admin_save',false,30,cfg.defaults);
assert.equal((await jobsFor(late)).filter((j) => j.status === 'skipped').length,1);
await rp('admin','admin_save',true,30,cfg.defaults);
assert.equal((await jobsFor(late)).filter((j) => j.status === 'queued').length,0);
assert.ok((await rp('anon','inbox',late.token,s1)).events.find((e) => e.kind === 'confirmed'));
const sa = '9'.repeat(64);
const adminDevice = await rp('admin','subscribe',sa,sub('admin-only'),base,null,true);
await assert.rejects(rp('otherAdmin','admin_test',sa,'registered'),/activá/);
const testEvent = await rp('admin','admin_test',sa,'registered');
assert.deepEqual(await sql('root','select device_id from public.bb_rp_deliveries where event_id=$1',[testEvent]),[{device_id:adminDevice}]);
await rp('admin','admin_test',sa,'registered');
await rp('admin','admin_test',sa,'registered');
await rp('admin','admin_test',sa,'registered'); // sin límite de pruebas para admins (pedido del usuario)
await rp('anon','disable',s1,null);
assert.equal((await rp('anon','inbox',second.token,s1)).subscribed,false);

// Validar el SQL de publicación del job con el contrato de las extensiones
// simulado. El comando HTTP se registra como texto, nunca se ejecuta.
await db.exec(`
  create schema cron; create schema net; create schema vault;
  create table cron.job(jobname text primary key, schedule text not null, command text not null);
  create table vault.secrets(name text primary key);
  insert into vault.secrets values ('bb_rifas_cron');
  create function cron.schedule(text,text,text) returns bigint language sql as $$
    insert into cron.job values ($1,$2,$3)
    on conflict(jobname) do update set schedule=excluded.schedule, command=excluded.command
    returning 1::bigint;
  $$;
`);
const cronSQL = file('supabase/080_batbox_rifas_web_push_cron.sql');
await db.exec(cronSQL);
await db.exec(cronSQL);
const [jobConfig] = (await db.query('select * from cron.job')).rows;
assert.equal(jobConfig.schedule, '* * * * *');
assert.match(jobConfig.command, /bb-rifas-push/);
assert.match(jobConfig.command, /vault.decrypted_secrets/);
await db.close();

// Worker real evaluado con las APIs de navegador simuladas y sin red.
const mockCache = new Map();
const listeners = {};
const shown = [];
const navigations = [];
let focused = false;
const scope = 'https://3dbat.com.ar/batbox/';
const stateCacheKey = scope + '__rifas_push_device__';
const mockWindow = { url: scope, navigate: async (url) => { navigations.push(url); return mockWindow; }, focus: async () => { focused = true; } };
vm.runInNewContext(file('public/batbox-sw.js'), {
  self: {
    registration: { scope, showNotification: async (title, opts) => shown.push({ title, ...opts }) },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    clients: { matchAll: async () => [mockWindow], openWindow: async (url) => navigations.push(url) },
  },
  URL, Response, Date,
  caches: { open: async () => ({
    match: async (key) => mockCache.get(key)?.clone(),
    put: async (key, value) => { mockCache.set(key, value); },
  }) },
});
const setDevice = (id, entries) => mockCache.set(stateCacheKey, new Response(JSON.stringify({device:id,entries})));
const fire = async (event, data) => {
  let running;
  listeners[event]({ ...data, waitUntil: (p) => { running = p; } });
  await running;
};
const m = { ...payload.message, until: Date.now()+10_000 };
setDevice(m.device,[m.entry]);
await fire('push',{ data:{ json: () => m } });
await fire('push',{ data:{ json: () => m } });
// Repetido: se vuelve a mostrar con la misma etiqueta (reemplaza, no suena de nuevo): nunca un push silencioso.
assert.equal(shown.length,2);
assert.equal(shown[0].tag, shown[1].tag);
assert.equal(shown[1].renotify, false);
await fire('notificationclick',{ notification:{ data:shown[0].data, close() {} } });
assert.equal(focused,true);
assert.deepEqual(navigations,[scope+'#/rifas/navide%C3%B1a-fixture/mi/'+m.entry]);
assert.doesNotMatch(navigations[0],/p\/[a-f0-9]{64}/);
setDevice('otro-dispositivo',[]);
await fire('push',{ data:{ json: () => ({ ...m, id:crypto.randomUUID() }) } });
// Otro dispositivo/usuario: aviso genérico SIN datos privados (no silencioso).
assert.equal(shown.length,3);
assert.equal(shown[2].title,'BAT RIFAS');
assert.equal(shown[2].data.generic,true);
assert.doesNotMatch(JSON.stringify(shown[2]), new RegExp(m.entry));
await fire('notificationclick',{ notification:{ data:shown[0].data, close() {} } });
assert.equal(navigations.length,1);
// Datos ilegibles o vencidos: también genérico.
await fire('push',{ data:{ json: () => { throw new Error('x'); } } });
await fire('push',{ data:{ json: () => ({ ...m, until: Date.now() - 1 }) } });
assert.equal(shown.length,5);
assert.ok(shown.slice(3).every((n) => n.data.generic));
assert.equal(listeners.fetch,undefined);

// Estados de permiso y cambio de cuenta en el cliente, sin abrir un diálogo real.
const store = new Map();
const permission = { permission: 'default' };
const nav = { userAgent: 'Desktop', platform: 'Win32', maxTouchPoints: 0 };
let requestCount = 0, detached = false;
const subMock = { toJSON: () => sub('browser-fixture'), unsubscribe: async () => { detached = true; } };
const reg = {
  active: { scriptURL: scope + 'batbox-sw.js' },
  scope,
  getNotifications: async () => [],
  pushManager: {
    getSubscription: async () => subMock,
    subscribe: async () => { requestCount++; return subMock; },
  },
};
nav.serviceWorker = { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg) };
const clientWindow = {
  location: { origin: 'https://3dbat.com.ar' }, isSecureContext:true, Notification:permission, PushManager: {},
  caches: {},
};
const bindings = {};
const clientCode = file('src/lib/rifasPush.js').replace(/^import .*;$/gm, '')
  .replaceAll('import.meta.env.BASE_URL', "'/batbox/'").replace(/^export /gm,'');
vm.runInNewContext(clientCode + '\nObject.assign(bindings, {platformState, preparePush, enablePush, switchPushOwner, linkedTicket, disableRaffle});', {
  window:clientWindow, navigator:nav, Notification:permission, matchMedia:()=>({matches:false}), URL, Response,
  AbortSignal, atob, crypto, setTimeout, clearTimeout, bindings,
  SUPABASE_URL:'https://fixture.example.test', SUPABASE_PUBLISHABLE_KEY:'fixture',
  fetch:async()=>Response.json({publicKey:'A'.repeat(87)}),
  sb:{rpc: (fn) => ({abortSignal:async() => ({data:fn==='bb_rp_subscribe' ? m.device : null,error:null})})},
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: (k) => store.delete(k) },
  caches:{open:async()=>({put:async (k,v)=>mockCache.set(k,v),delete:async (k)=>mockCache.delete(k)})},
});
assert.equal(bindings.platformState(),'pending');
const prepared = await bindings.preparePush();
assert.equal(requestCount,0,'preparar no pide permiso');
permission.permission='denied';
assert.equal(bindings.platformState(),'denied');
assert.equal(requestCount,0);
permission.permission='granted';
assert.equal(bindings.platformState(),'granted');
delete clientWindow.PushManager;
assert.equal(bindings.platformState(),'unsupported');
clientWindow.PushManager={};
nav.userAgent='iPhone';
assert.equal(bindings.platformState(),'install');
nav.standalone=true;
assert.equal(bindings.platformState(),'granted');
await bindings.switchPushOwner('first');
await bindings.enablePush(prepared,{ owner:'first',token:'a'.repeat(64),entry:m.entry,raffle });
assert.equal(bindings.linkedTicket(m.entry,'first'),'a'.repeat(64));
assert.equal(bindings.linkedTicket(m.entry,'second'),null);
await bindings.switchPushOwner('second');
assert.equal(bindings.linkedTicket(m.entry,'first'),null);
assert.equal(mockCache.has(stateCacheKey),false);
assert.equal(detached,true);
await assert.rejects(bindings.enablePush(prepared,{ owner:'first',token:'a'.repeat(64),entry:m.entry,raffle }),/cuenta cambió/);
assert.equal(requestCount,1);
console.log('BAT RIFAS Web Push: integración SQL, privacidad, cola y Service Worker OK');
