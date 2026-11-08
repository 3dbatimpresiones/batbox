// Importador de la Biblioteca 3D: lee la carpeta de Drive, saca piezas y foto de cada ZIP y los carga en Supabase.
// Uso local: node scripts/biblioteca-importar.mjs <clave.json> [salida.sql] [carpeta portadas] [supabase-secret.txt] [--publicar]
// Uso automático (GitHub Actions): variables GOOGLE_SA_JSON y SUPABASE_SECRET (contenido, no rutas) y --publicar.
// Estructura esperada en Drive: BIBLIOTECA STLS BATBOX/<Categoría>/<Modelo>.zip
// No descarga los ZIP enteros: lee solo el índice final y la foto (pedidos parciales).
// Sin --publicar los nuevos entran en borrador; con --publicar quedan publicados (licencia verificada por el
// administrador). Si un modelo ya existe (mismo archivo de Drive), no se duplica ni se pisa lo editado.
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT_NAME = 'BIBLIOTECA STLS BATBOX';
const PUBLISH = process.argv.includes('--publicar');
const ARGS = process.argv.slice(2).filter((a) => a !== '--publicar');
const [keyPath, outPath = 'biblioteca-import.sql', thumbsDir = 'biblioteca-portadas', secretArg] = ARGS;
fs.mkdirSync(thumbsDir, { recursive: true });
if (!keyPath && !process.env.GOOGLE_SA_JSON) { console.error('Falta la clave de Google (.json o GOOGLE_SA_JSON)'); process.exit(1); }

const sa = JSON.parse((process.env.GOOGLE_SA_JSON || fs.readFileSync(keyPath, 'utf8')).replace(/^﻿/, ''));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
const jwt = unsigned + '.' + crypto.sign('RSA-SHA256', Buffer.from(unsigned), sa.private_key).toString('base64url');
const tok = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) })).json();
if (!tok.access_token) { console.error('No se pudo autenticar con Google:', tok.error); process.exit(1); }
const H = { Authorization: 'Bearer ' + tok.access_token };

async function list(q) {
  const out = []; let page = '';
  do {
    const u = 'https://www.googleapis.com/drive/v3/files?pageSize=1000&fields=nextPageToken,files(id,name,mimeType,size,md5Checksum)&q=' + encodeURIComponent(q) + (page ? '&pageToken=' + page : '');
    const r = await (await fetch(u, { headers: H })).json();
    if (r.error) throw new Error(r.error.message);
    out.push(...r.files); page = r.nextPageToken;
  } while (page);
  return out;
}

async function range(id, start, end) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: { ...H, Range: `bytes=${start}-${end}` } });
  if (r.status !== 206 && r.status !== 200) throw new Error('Drive ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

// Lista las piezas del ZIP leyendo solo el directorio central (al final del archivo).
async function zipParts(id, size) {
  const tailLen = Math.min(size, 70000);
  const tail = await range(id, size - tailLen, size - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  let cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
  if (cdOff === 0xffffffff || cdSize === 0xffffffff) { // ZIP64
    const loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]), eocd);
    const z64 = await range(id, Number(tail.readBigUInt64LE(loc + 8)), Number(tail.readBigUInt64LE(loc + 8)) + 55);
    cdSize = Number(z64.readBigUInt64LE(40)); cdOff = Number(z64.readBigUInt64LE(48));
  }
  const cd = await range(id, cdOff, cdOff + cdSize - 1);
  const parts = []; let p = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24), off = cd.readUInt32LE(p + 42);
    const n = cd.readUInt16LE(p + 28), x = cd.readUInt16LE(p + 30), c = cd.readUInt16LE(p + 32);
    const raw = cd.subarray(p + 46, p + 46 + n);
    const name = (flags & 0x800) ? raw.toString('utf8') : raw.toString('latin1');
    if (!name.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/i.test(name)) parts.push({ name: name.split('/').pop(), size: usize === 0xffffffff ? null : usize, _m: method, _c: csize, _o: off });
    p += 46 + n + x + c;
  }
  return parts;
}

// Saca la primera foto del ZIP (solo esos bytes) y la convierte en una portada WebP liviana con ffmpeg.
async function thumbnail(id, parts, slug) {
  const img = parts?.find((p) => /\.(png|jpe?g|webp)$/i.test(p.name) && p._c > 0 && p._c < 30e6 && (p._m === 0 || p._m === 8));
  if (!img) return null;
  const head = await range(id, img._o, img._o + 29);
  const start = img._o + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  const data = await range(id, start, start + img._c - 1);
  const raw = img._m === 8 ? zlib.inflateRawSync(data) : data;
  const tmp = path.join(os.tmpdir(), 'bb-lib-' + slug + path.extname(img.name));
  fs.writeFileSync(tmp, raw);
  const out = path.join(thumbsDir, slug + '.webp');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-vf', 'scale=640:-2', '-frames:v', '1', '-quality', '78', out]);
  fs.unlinkSync(tmp);
  return slug + '.webp';
}

const slugify = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110) || 'modelo';
const pretty = (file) => file.replace(/\.zip$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
const sql = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

const roots = await list(`name='${ROOT_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
if (!roots.length) { console.error('No encuentro la carpeta', ROOT_NAME); process.exit(1); }
const lines = ['-- Generado por scripts/biblioteca-importar.mjs el ' + new Date().toISOString(), 'begin;'];
// Si hay acceso a Supabase, se saltean los ZIP ya cargados (no se vuelven a leer ni a convertir).
const existing = new Set(), takenSlugs = new Set();
if (secretArg || process.env.SUPABASE_SECRET) {
  const k = (process.env.SUPABASE_SECRET || fs.readFileSync(secretArg, 'utf8')).replace(/^﻿/, '').trim();
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`https://llciggitqtseosfklbjl.supabase.co/rest/v1/bb_lib_models?select=storage_key,slug&order=created_at`, { headers: { apikey: k, Authorization: 'Bearer ' + k, Range: `${from}-${from + 999}` } });
    if (!r.ok) { console.error('No se pudo leer Supabase:', r.status); process.exit(1); }
    const rows = await r.json(); rows.forEach((x) => { existing.add(x.storage_key); takenSlugs.add(x.slug); });
    if (rows.length < 1000) break;
  }
}
const used = new Set(takenSlugs); let count = 0, skipped = [];
const records = [], categories = [];

async function walk(folderId, catSlug, catPath) {
  for (const f of await list(`'${folderId}' in parents and trashed=false`)) {
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      const slug = slugify(f.name);
      if (!catSlug) {
        categories.push({ name: f.name.trim(), slug, sort_order: 100 });
        lines.push(`insert into public.bb_lib_categories (name, slug, sort_order) values (${sql(f.name.trim())}, ${sql(slug)}, 100) on conflict (slug) do nothing;`);
        await walk(f.id, slug, f.name);
      } else await walk(f.id, catSlug, catPath + ' / ' + f.name); // subcarpetas: misma categoría
      continue;
    }
    if (!/\.zip$/i.test(f.name)) { skipped.push(`${catPath || '(raíz)'}/${f.name} (no es ZIP)`); continue; }
    if (existing.has(f.id)) continue;
    const size = Number(f.size || 0);
    let parts = null;
    try { parts = await zipParts(f.id, size); } catch (e) { skipped.push(`${f.name}: no se pudo leer el índice (${e.message}); se carga sin piezas`); }
    let slug = slugify(pretty(f.name)); while (used.has(slug)) slug += '-2'; used.add(slug);
    let thumb = null;
    try { thumb = await thumbnail(f.id, parts, slug); } catch (e) { skipped.push(`${f.name}: no se pudo sacar la foto (${e.message})`); }
    if (parts) parts = parts.map(({ name, size }) => ({ name, size }));
    records.push({ cat: catSlug, row: { slug, name: pretty(f.name), storage_key: f.id, file_name: slugify(pretty(f.name)) + '.zip',
      size_bytes: size || null, md5: f.md5Checksum || null, parts: parts || [], thumb_key: thumb } });
    lines.push(`insert into public.bb_lib_models (slug, name, category_id, storage_key, file_name, size_bytes, md5, parts, thumb_key)
  values (${sql(slug)}, ${sql(pretty(f.name))}, ${catSlug ? `(select id from public.bb_lib_categories where slug = ${sql(catSlug)})` : 'null'},
          ${sql(f.id)}, ${sql(slugify(pretty(f.name)) + '.zip')}, ${size || 'null'}, ${sql(f.md5Checksum)}, ${sql(JSON.stringify(parts || []))}::jsonb, ${sql(thumb)})
  on conflict (storage_key) do update set thumb_key = coalesce(excluded.thumb_key, bb_lib_models.thumb_key), parts = excluded.parts;`);
    count++;
    console.log(`+ ${catPath || '(sin categoría)'} → ${pretty(f.name)} · ${(size / 1048576).toFixed(1)} MB · ${parts ? parts.length + ' piezas' : 'sin índice'}${thumb ? ' · con foto' : ''}`);
  }
}
for (const r of roots) await walk(r.id, null, '');
lines.push('commit;');
fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`\n${count} modelos → ${outPath}`);
if (skipped.length) console.log('Avisos:\n  ' + skipped.join('\n  '));

// --- Carga directa en Supabase (opcional): 4.º argumento = archivo local con la clave secreta sb_secret_ ---
if (secretArg || process.env.SUPABASE_SECRET) {
  const SB = 'https://llciggitqtseosfklbjl.supabase.co';
  const key = (process.env.SUPABASE_SECRET || fs.readFileSync(secretArg, 'utf8')).replace(/^﻿/, '').trim();
  const h = { apikey: key, Authorization: 'Bearer ' + key };
  const call = async (url, opts = {}) => {
    const r = await fetch(SB + url, { ...opts, headers: { ...h, ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`${opts.method || 'GET'} ${url.split('?')[0]} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : r.json().catch(() => null);
  };
  // Bucket público solo para portadas (WebP, máx. 1 MB).
  const buckets = await call('/storage/v1/bucket');
  if (!buckets.some((b) => b.id === 'bb-lib-thumbs')) {
    await call('/storage/v1/bucket', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'bb-lib-thumbs', name: 'bb-lib-thumbs', public: true, file_size_limit: 1048576, allowed_mime_types: ['image/webp'] }) });
    console.log('Bucket bb-lib-thumbs creado.');
  }
  for (const r of records) if (r.row.thumb_key)
    await call('/storage/v1/object/bb-lib-thumbs/' + encodeURIComponent(r.row.thumb_key), { method: 'POST',
      headers: { 'Content-Type': 'image/webp', 'x-upsert': 'true' }, body: fs.readFileSync(path.join(thumbsDir, r.row.thumb_key)) });
  const J = { 'Content-Type': 'application/json' };
  if (categories.length) await call('/rest/v1/bb_lib_categories?on_conflict=slug', { method: 'POST', headers: { ...J, Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(categories) });
  const cats = await call('/rest/v1/bb_lib_categories?select=id,slug');
  const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
  let nuevos = 0;
  for (const r of records) {
    const exists = await call('/rest/v1/bb_lib_models?select=id,thumb_key&storage_key=eq.' + encodeURIComponent(r.row.storage_key));
    if (!exists.length) {
      const pub = PUBLISH ? { license_status: 'verified', license_notes: 'Verificada por decisión del administrador (carga automática).',
        status: 'published', published_at: new Date().toISOString() } : {};
      await call('/rest/v1/bb_lib_models', { method: 'POST', headers: J, body: JSON.stringify({ ...r.row, category_id: catId[r.cat] || null, ...pub }) });
      console.log(`  nuevo: ${r.row.name}${PUBLISH ? ' (publicado)' : ' (borrador)'}`);
      nuevos++;
    } else if (!exists[0].thumb_key && r.row.thumb_key) { // ya existía: solo completa la foto, no pisa lo editado
      await call('/rest/v1/bb_lib_models?id=eq.' + exists[0].id, { method: 'PATCH', headers: J, body: JSON.stringify({ thumb_key: r.row.thumb_key }) });
    }
  }
  console.log(`Supabase: ${nuevos} modelos nuevos${PUBLISH ? ' publicados' : ' en borrador'}, ${records.length - nuevos} ya estaban.`);
}
