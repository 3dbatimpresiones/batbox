// Fuente de la Edge Function "batcard-submit". NO editar index.ts a mano:
// generarlo con  node scripts/build-batcard-fn.mjs  (empaqueta las reglas del juego adentro).
// Recibe { seed, log } con el token del jugador, rejuega la partida y registra
// el resultado calculado acá (nunca el que diga el navegador).
import { replayRun } from '../src/lib/batcard/verify.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function handler(req, env) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });
  const { url, anon, service } = env;
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'Iniciá sesión para entrar al ranking.' });

  // 1. ¿Quién es? (valida el token con Supabase Auth)
  const ures = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
  if (!ures.ok) return json(401, { error: 'Sesión vencida: volvé a ingresar.' });
  const user = await ures.json();

  // 2. ¿Es del Makers Club? (misma regla que el resto de BATBOX)
  const mres = await fetch(`${url}/rest/v1/rpc/bb_is_member`, { method: 'POST', headers: { Authorization: auth, apikey: anon, 'Content-Type': 'application/json' }, body: '{}' });
  if (!mres.ok || (await mres.json()) !== true) return json(403, { error: 'El ranking de BATCARD es para el Makers Club.' });

  // 3. Rejugar
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Datos inválidos.' }); }
  if (JSON.stringify(body?.log ?? null).length > 200000) return json(413, { error: 'Partida demasiado larga.' });
  const rep = replayRun(body?.seed, body?.log);
  if (!rep.ok) return json(422, { error: rep.error });

  // 4. Registrar con service_role (la función SQL valida que la semilla sea suya y no esté usada)
  const rres = await fetch(`${url}/rest/v1/rpc/bb_bc_record`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${service}`, apikey: service, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user: user.id, p_seed: body.seed, p_result: rep.result, p_log: body.log }),
  });
  const out = await rres.json().catch(() => ({}));
  if (!rres.ok) return json(409, { error: out?.message || 'No se pudo registrar la partida.' });
  return json(200, { ok: true, ...out, result: rep.result });
}

if (typeof Deno !== 'undefined') {
  const env = {
    url: Deno.env.get('SUPABASE_URL'),
    anon: Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY'),
    service: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY'),
  };
  Deno.serve((req) => handler(req, env));
}
