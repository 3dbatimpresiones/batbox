// Puente de descargas de la Biblioteca 3D (Cloudflare Worker, plan gratis).
// GET /d/<token>  → canjea el permiso en Supabase y transmite el archivo desde Drive.
// GET /salud      → comprueba que el Worker responde.
// POST /sync       → (solo administradores) lanza en GitHub la importación de modelos nuevos.
// GET  /sync       → (solo administradores) estado de la última importación.
// Secretos (wrangler secret put): SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_SA_JSON, GITHUB_TOKEN.
// Nunca se envían al navegador.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLISHABLE_KEY = 'sb_publishable_du93qodYkSZRevJ-BgXUGw_BrFc6JMO'; // pública (la misma de BATBOX)
const ORIGINS = ['https://3dbat.com.ar', 'https://www.3dbat.com.ar', 'https://3dbatimpresiones.github.io', 'http://localhost:5173'];
const WORKFLOW = 'https://api.github.com/repos/3dbatimpresiones/batbox/actions/workflows/biblioteca-sync.yml';
let driveToken = null; // { value, expires } — se reutiliza mientras el Worker sigue vivo

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/salud') return text(200, 'ok');
    if (url.pathname === '/sync') return sync(req, env);
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(405, 'Método no permitido.');

    const m = url.pathname.match(/^\/d\/([^/]+)$/);
    if (!m || !UUID.test(m[1])) return text(404, 'Enlace de descarga inválido.');

    try {
      const grant = await redeem(env, m[1]);
      if (!grant) return text(403, 'El enlace venció o ya se usó. Volvé a la ficha del modelo y pedí la descarga de nuevo.');
      if (grant.provider !== 'gdrive') return text(501, 'Proveedor de almacenamiento no soportado.');
      return await streamFromDrive(env, req, grant);
    } catch (err) {
      console.error('descarga', err?.message || err);
      return text(502, 'No pudimos obtener el archivo. Probá de nuevo en unos minutos.');
    }
  },
};

// ---------- Actualizar biblioteca (botón del panel admin) ----------
async function sync(req, env) {
  const origin = req.headers.get('Origin') || '';
  const cors = ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Max-Age': '86400' } });
  }
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  try {
    // Solo administradores: se valida con la sesión del usuario contra Supabase (bb_lib_admin_stats exige admin).
    // O bien con la "llave de actualización" (secreto SYNC_KEY) del acceso directo de escritorio:
    // solo sirve para pedir/ver la actualización, no da acceso a nada más.
    const key = req.headers.get('X-Llave-Actualizar') || '';
    const keyOk = !!env.SYNC_KEY && key.length > 20 && await sameText(key, env.SYNC_KEY.trim());
    if (!keyOk) {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!jwt) return json(401, { error: 'Tenés que iniciar sesión.' });
      const check = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/bb_lib_admin_stats`, {
        method: 'POST', headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!check.ok) return json(403, { error: 'Solo los administradores pueden actualizar la biblioteca.' });
    }
    if (!env.GITHUB_TOKEN) return json(503, { error: 'Falta configurar GITHUB_TOKEN en el puente.' });

    const gh = { Authorization: `Bearer ${env.GITHUB_TOKEN.replace(/^FEFF/, "").trim()}`, Accept: 'application/vnd.github+json', 'User-Agent': 'batbox-biblioteca', 'X-GitHub-Api-Version': '2022-11-28' };
    if (req.method === 'POST') {
      const r = await fetch(`${WORKFLOW}/dispatches`, { method: 'POST', headers: { ...gh, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) });
      if (r.status !== 204) { console.error('github', r.status, (await r.text()).slice(0, 200)); return json(502, { error: 'GitHub no aceptó el pedido. Probá de nuevo en un rato.' }); }
      return json(202, { ok: true, requested_at: new Date().toISOString() });
    }
    if (req.method === 'GET') {
      const r = await fetch(`${WORKFLOW}/runs?per_page=1`, { headers: gh });
      if (!r.ok) return json(502, { error: 'No se pudo leer el estado en GitHub.' });
      const run = (await r.json()).workflow_runs?.[0];
      return json(200, run ? { status: run.status, conclusion: run.conclusion, created_at: run.created_at, event: run.event } : {});
    }
    return json(405, { error: 'Método no permitido.' });
  } catch (err) {
    console.error('sync', err?.message || err);
    return json(502, { error: 'No se pudo actualizar la biblioteca.' });
  }
}

// Comparación en tiempo constante (compara los hash, no el texto).
async function sameText(a, b) {
  const h = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

async function redeem(env, token) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/bb_lib_redeem`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY, // clave secreta sb_secret_ (no es JWT: va solo en apikey)
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_token: token }),
  });
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}

async function streamFromDrive(env, req, grant) {
  const headers = { Authorization: `Bearer ${await getDriveToken(env)}` };
  const range = req.headers.get('Range');
  if (range) headers.Range = range; // permite reanudar descargas

  const id = encodeURIComponent(grant.file_key);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
    method: req.method,
    headers,
  });

  if (!res.ok && res.status !== 206) {
    const detail = await res.text().catch(() => '');
    console.error('drive', res.status, detail.slice(0, 300));
    if (res.status === 404) return text(404, 'El archivo ya no está disponible.');
    if (res.status === 429 || res.status === 403) return text(503, 'Hay mucha demanda en este momento. Probá de nuevo en unos minutos.', { 'Retry-After': '120' });
    return text(502, 'No pudimos obtener el archivo. Probá de nuevo en unos minutos.');
  }

  const out = new Headers();
  for (const h of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Type']) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(grant.file_name)}`);
  out.set('Cache-Control', 'private, no-store');
  out.set('X-Content-Type-Options', 'nosniff');
  return new Response(res.body, { status: res.status, headers: out }); // se transmite, no se carga en memoria
}

// Token de acceso de la cuenta de servicio (solo lectura de Drive).
async function getDriveToken(env) {
  if (driveToken && driveToken.expires > Date.now() + 60_000) return driveToken.value;
  const sa = JSON.parse(env.GOOGLE_SA_JSON.replace(/^﻿/, '')); // PowerShell puede agregar BOM
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(new Uint8Array(sig))}`,
    }),
  });
  if (!res.ok) throw new Error(`google token ${res.status}`);
  const data = await res.json();
  driveToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return driveToken.value;
}

function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function text(status, body, extra = {}) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
}
