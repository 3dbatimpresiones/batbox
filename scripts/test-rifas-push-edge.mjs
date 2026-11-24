// npx --yes deno@2.5.6 run --node-modules-dir=none --no-lock --allow-env scripts/test-rifas-push-edge.mjs
// Criptografía real e I/O simulado, sin enviar notificaciones ni contactar Supabase.
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'npm:web-push@3.6.7';

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const vapid = webpush.generateVAPIDKeys();
Deno.env.set('SUPABASE_URL', 'https://fixture.example.test');
Deno.env.set('RIFAS_VAPID_PUBLIC_KEY', vapid.publicKey);
Deno.env.set('RIFAS_VAPID_PRIVATE_KEY', vapid.privateKey);
Deno.env.set('RIFAS_VAPID_SUBJECT', 'mailto:fixture@example.test');
const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic';
const secret = 't'.repeat(64);
const job = { event_id: crypto.randomUUID(), device_id: crypto.randomUUID(), lease: crypto.randomUUID() };
const outcomes = [];
let provider = 201;
let usable = true;
let pushes = 0;
let handler;
Deno.serve = (serve) => { handler = serve; };
globalThis.fetch = async (url, opt) => {
  const target = String(url);
  if (target.startsWith('https://fixture.example.test/')) {
    const fn = target.split('/').at(-1);
    const args = JSON.parse(opt.body);
    if (fn === 'bb_rf_cron_check') return Response.json(args.p_secret === secret);
    if (fn === 'bb_rp_tick') return new Response(null, { status: 204 });
    if (fn === 'bb_rp_claim') return Response.json([job]);
    if (fn === 'bb_rp_payload') {
      assert.deepEqual(args, { p_event: job.event_id, p_device: job.device_id, p_lease: job.lease });
      if (!usable) return Response.json(null);
      return Response.json({
        endpoint,
        keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
        ttl: 720,
        message: { id: job.event_id, test: false, title: 'Prueba privada', until: Date.now() + 720000 },
      });
    }
    if (fn === 'bb_rp_done') { outcomes.push(args); return new Response(null, { status: 204 }); }
  }
  assert.equal(target, endpoint);
  assert.match(opt.headers.get('authorization'), /^vapid t=.+, k=/);
  assert.equal(opt.headers.get('content-encoding'), 'aes128gcm');
  assert.equal(opt.headers.get('ttl'), '600');
  assert.equal(opt.redirect, 'error');
  assert.ok(opt.body.byteLength > 100);
  assert.equal(Buffer.from(opt.body).includes('Prueba privada'), false);
  pushes++;
  return new Response(null, { status: provider });
};
await import('../supabase/functions/bb-rifas-push/index.ts');
const request = (key = secret) => handler(new Request('https://fixture.example.test/', {method:'POST',headers:{'x-cron-secret':key}}));
const cfg = await (await handler(new Request('https://fixture.example.test/'))).json();
assert.deepEqual(cfg, { publicKey: vapid.publicKey });
assert.equal((await request('f'.repeat(64))).status,403);
assert.equal((await (await request()).json()).accepted,1);
assert.equal(outcomes.at(-1).p_result,'accepted');
provider=429;
await request();
assert.equal(outcomes.at(-1).p_result,'retry');
provider=410;
await request();
assert.equal(outcomes.at(-1).p_result,'gone');
usable=false;
await request();
assert.equal(outcomes.at(-1).p_result,'skipped');
assert.equal(pushes,3);
console.log('Edge Web Push: VAPID, cifrado, autenticación y resultados HTTP OK');
