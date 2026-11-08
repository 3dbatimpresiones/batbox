// Puente de descargas de la Biblioteca 3D (Cloudflare Worker, plan gratis).
// GET /d/<token>  → canjea el permiso en Supabase y transmite el archivo desde Drive.
// GET /salud      → comprueba que el Worker responde.
// Secretos (wrangler secret put): SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_SA_JSON.
// Nunca se envían al navegador.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let driveToken = null; // { value, expires } — se reutiliza mientras el Worker sigue vivo

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/salud') return text(200, 'ok');
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
