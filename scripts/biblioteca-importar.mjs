// Importador de la Biblioteca 3D: lee la carpeta de Drive, saca piezas y foto de cada ZIP y los carga en Supabase.
// Uso local: node scripts/biblioteca-importar.mjs <clave.json> [salida.sql] [carpeta portadas] [supabase-secret.txt] [--publicar]
// Uso automático (GitHub Actions): variables GOOGLE_SA_JSON y SUPABASE_SECRET (contenido, no rutas) y --publicar.
// Estructura esperada en Drive: BIBLIOTECA STLS BATBOX/<Categoría>/<Modelo>.zip (o .rar: se baja entero, ver biblioteca-rar.mjs)
// No descarga los ZIP enteros: lee solo el índice final y la foto (pedidos parciales).
// Sin --publicar los nuevos entran en borrador; con --publicar quedan publicados (licencia verificada por el
// administrador). Si un modelo ya existe (mismo archivo de Drive), no se duplica ni se pisa lo editado.
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
// RAR: se carga solo cuando hay un .rar (en GitHub, --revisar corre antes de instalar dependencias).
const rarList = async (b) => (await import('./biblioteca-rar.mjs')).rarList(b);
const rarExtract = async (b, k) => (await import('./biblioteca-rar.mjs')).rarExtract(b, k);

const ROOT_NAME = 'BIBLIOTECA STLS BATBOX';
const PUBLISH = process.argv.includes('--publicar');
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
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

// Lo que se guarda de cada pieza. En los ZIP también su ubicación (o = offset, c = tamaño comprimido,
// m = método) para poder bajar ese archivo suelto (migración 066). ZIP64 / >4 GB: solo nombre y tamaño.
const BIG = 0xffffffff;
const publicPart = ({ name, size, _m, _c, _o }) =>
  (_o != null && _o !== BIG && _c !== BIG && (_m === 0 || _m === 8) ? { name, size, o: _o, c: _c, m: _m } : { name, size });

// Saca las fotos del ZIP (solo esos bytes) y las convierte a WebP con ffmpeg:
// la primera también como portada liviana (640 px) y todas para la galería de la ficha (1280 px, hasta 8).
const MAX_PHOTOS = 8;
async function photos(id, parts, slug) {
  const imgs = (parts || []).filter((p) => /\.(png|jpe?g|webp)$/i.test(p.name) && p._c > 0 && p._c < 30e6 && (p._m === 0 || p._m === 8))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true })).slice(0, MAX_PHOTOS);
  return photoSet(imgs.map((img) => ({ name: img.name, load: async () => {
    const head = await range(id, img._o, img._o + 29);
    const start = img._o + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    const data = await range(id, start, start + img._c - 1);
    return img._m === 8 ? zlib.inflateRawSync(data) : data;
  } })), slug);
}

// Fotos de un RAR ya descargado entero.
async function rarPhotos(buf, slug) {
  const files = await rarExtract(buf, (n) => /\.(png|jpe?g|webp)$/i.test(n));
  const imgs = Object.entries(files).map(([name, data]) => ({ name: name.split('/').pop(), data }))
    .filter((x) => x.data.length < 30e6).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true })).slice(0, MAX_PHOTOS);
  return photoSet(imgs.map((x) => ({ name: x.name, load: async () => Buffer.from(x.data) })), slug);
}

async function photoSet(imgs, slug) {
  let thumb = null; const images = [];
  for (const [k, img] of imgs.entries()) {
    const raw = await img.load();
    const tmp = path.join(os.tmpdir(), `bb-lib-${slug}-${k}${path.extname(img.name)}`);
    fs.writeFileSync(tmp, raw);
    const conv = (width, name) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-vf', `scale='min(${width},iw)':-2`, '-frames:v', '1', '-quality', '78', path.join(thumbsDir, name)]);
    try {
      if (!thumb) { conv(640, slug + '.webp'); thumb = slug + '.webp'; }
      conv(1280, `${slug}-g${k + 1}.webp`); images.push(`${slug}-g${k + 1}.webp`);
    } finally { fs.unlinkSync(tmp); }
  }
  return { thumb, images };
}

const slugify = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110) || 'modelo';
// Google Drive agrega "-20261109T031425Z-1-001" al descargar carpetas: se quita del nombre.
const ARCH_RE = /\.(zip|rar)$/i;
const archExt = (name) => (/\.rar$/i.test(name) ? '.rar' : '.zip');
async function download(id) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: H });
  if (!r.ok) throw new Error('Drive ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
const pretty = (file) => file.replace(ARCH_RE, '').replace(/[-_ ]*\d{8}T\d{6}Z(-\d+){0,2}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
const sql = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

const roots = await list(`name='${ROOT_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
if (!roots.length) { console.error('No encuentro la carpeta', ROOT_NAME); process.exit(1); }
const lines = ['-- Generado por scripts/biblioteca-importar.mjs el ' + new Date().toISOString(), 'begin;'];
// Si hay acceso a Supabase, se saltean los ZIP ya cargados (no se vuelven a leer ni a convertir).
// --fotos: además completa la galería de los modelos ya cargados que todavía no la tienen.
const FILL_PHOTOS = process.argv.includes('--fotos');
const existing = new Map(), takenSlugs = new Set(); // storage_key → { slug, images, thumb }
const deletedKeys = new Set(); // ZIP borrados desde el panel: no se vuelven a importar
const seenFiles = new Map();    // huella (md5, o tamaño+nombre si Drive no da md5) → nombre del modelo ya cargado
// Vistas previas 3D (migración 063): modelos que todavía no tienen una (ni un error anotado).
let PREVIEWS = true; const needPreview = [];
// v3 = GLB comprimido (meshopt + cuantizado 16 bits). --rehacer-3d regenera las vistas de versiones anteriores.
const PREVIEW_V = 3, REHACER = process.argv.includes('--rehacer-3d');
if (secretArg || process.env.SUPABASE_SECRET) {
  const k = (process.env.SUPABASE_SECRET || fs.readFileSync(secretArg, 'utf8')).replace(/^﻿/, '').trim();
  for (let from = 0; ; from += 1000) {
    const cols = 'id,storage_key,slug,images,thumb_key,md5,size_bytes,name' +(PREVIEWS ? ',preview_key,preview_meta' : '');
    const r = await fetch(`https://llciggitqtseosfklbjl.supabase.co/rest/v1/bb_lib_models?select=${cols}&order=created_at`, { headers: { apikey: k, Authorization: 'Bearer ' + k, Range: `${from}-${from + 999}` } });
    if (!r.ok && PREVIEWS && r.status === 400) { PREVIEWS = false; from -= 1000; console.log('Vistas previas 3D: falta la migración 063, se saltean.'); continue; }
    if (!r.ok) { console.error('No se pudo leer Supabase:', r.status); process.exit(1); }
    const rows = await r.json();
    rows.forEach((x) => {
      existing.set(x.storage_key, { slug: x.slug, images: x.images || [], thumb: x.thumb_key }); takenSlugs.add(x.slug);
      seenFiles.set(x.md5 ? 'md5:' + x.md5 : `sz:${x.size_bytes}:${slugify(x.name)}`, x.name);
      const old = REHACER && x.preview_key && x.preview_meta?.v !== PREVIEW_V;
      if (PREVIEWS && ((!x.preview_key && !x.preview_meta) || old)) needPreview.push({ id: x.id, slug: x.slug, storage_key: x.storage_key, thumb: x.thumb_key, oldKey: x.preview_key });
    });
    if (rows.length < 1000) break;
  }
  // Modelos borrados desde el panel (065): no se reimportan y se limpian sus archivos.
  const SBU = 'https://llciggitqtseosfklbjl.supabase.co', hk = { apikey: k, Authorization: 'Bearer ' + k };
  const dr = await fetch(`${SBU}/rest/v1/bb_lib_deleted?select=storage_key,name,files,cleaned`, { headers: hk });
  if (dr.ok) for (const d of await dr.json()) {
    deletedKeys.add(d.storage_key);
    if (d.cleaned) continue;
    const del = (bucket, names) => names.length && fetch(`${SBU}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: { ...hk, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: names }) });
    try {
      await del('bb-lib-thumbs', (d.files?.thumbs || []).filter(Boolean));
      if (d.files?.preview) await del('bb-lib-previews', [d.files.preview]);
      await fetch(`${SBU}/rest/v1/bb_lib_deleted?storage_key=eq.${encodeURIComponent(d.storage_key)}`, { method: 'PATCH', headers: { ...hk, 'Content-Type': 'application/json' }, body: JSON.stringify({ cleaned: true }) });
      console.log(`Borrado: limpiados los archivos de "${d.name}".`);
    } catch (e) { console.log(`Borrado: no se pudieron limpiar los archivos de "${d.name}" (${e.message}).`); }
  }
}

// --rehacer-piezas: completa la ubicación de cada archivo en los ZIP ya cargados (descarga por archivo, 066).
// Solo lee el índice de cada ZIP (unos KB), no lo baja entero.
// --rehacer-impresion: lee tiempo y filamento reales (3MF laminado) de los modelos que ya tienen vista 3D
// y los suma a preview_meta.print. Baja cada ZIP/RAR una vez; no toca la vista 3D.
if (process.argv.includes('--rehacer-impresion') && (secretArg || process.env.SUPABASE_SECRET)) {
  const { printInfo } = await import('./biblioteca-preview.mjs');
  const k = (process.env.SUPABASE_SECRET || fs.readFileSync(secretArg, 'utf8')).replace(/^﻿/, '').trim();
  const SBU = 'https://llciggitqtseosfklbjl.supabase.co/rest/v1', hk = { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' };
  const rows = await (await fetch(`${SBU}/bb_lib_models?select=id,name,storage_key,preview_meta&preview_key=not.is.null`, { headers: hk })).json();
  let con = 0, sin = 0;
  for (const r of rows.filter((x) => x.preview_meta && !('print' in x.preview_meta))) {
    try {
      const print = await printInfo(await download(r.storage_key));
      const res = await fetch(`${SBU}/bb_lib_models?id=eq.${r.id}`, { method: 'PATCH', headers: hk, body: JSON.stringify({ preview_meta: { ...r.preview_meta, print } }) });
      if (!res.ok) throw new Error('supabase ' + res.status);
      print.length ? con++ : sin++;
      console.log(`impresión: ${r.name}: ${print.length ? print.map((p) => `${p.file} ${Math.round(p.time_s / 60)} min ${p.grams} g ${p.plates} cama(s)`).join(' | ') : 'sin datos'}`);
    } catch (e) { console.log(`impresión: ${r.name}: no se pudo (${e.message})`); }
  }
  console.log(`Con datos de impresión: ${con} · sin datos: ${sin}`);
  process.exit(0);
}

if (process.argv.includes('--rehacer-piezas') && (secretArg || process.env.SUPABASE_SECRET)) {
  const k = (process.env.SUPABASE_SECRET || fs.readFileSync(secretArg, 'utf8')).replace(/^﻿/, '').trim();
  const SBU = 'https://llciggitqtseosfklbjl.supabase.co/rest/v1', hk = { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' };
  const rows = await (await fetch(`${SBU}/bb_lib_models?select=id,name,storage_key,file_name,size_bytes,parts`, { headers: hk })).json();
  let ok = 0, skip = 0;
  for (const r of rows) {
    if (!/\.zip$/i.test(r.file_name) || !r.size_bytes || (r.parts || []).some((p) => p.o != null)) { skip++; continue; }
    try {
      const parts = await zipParts(r.storage_key, Number(r.size_bytes));
      if (!parts) throw new Error('sin índice');
      const res = await fetch(`${SBU}/bb_lib_models?id=eq.${r.id}`, { method: 'PATCH', headers: hk, body: JSON.stringify({ parts: parts.map(publicPart) }) });
      if (!res.ok) throw new Error('supabase ' + res.status);
      ok++; console.log(`piezas: ${r.name} (${parts.length})`);
    } catch (e) { console.log(`piezas: ${r.name}: no se pudo (${e.message})`); }
  }
  console.log(`Piezas actualizadas: ${ok} · salteados: ${skip}`);
  process.exit(0);
}

// Fotos sueltas en Drive al lado del ZIP: "Modelo.jpg", "Modelo - 1.jpg", "Modelo_2.png", "Modelo (3).webp"…
// Se asocian al ZIP con el mismo nombre. En la galería se guardan como <slug>--d-<idDrive>.webp.
const IMG_RE = /\.(jpe?g|png|webp)$/i;
// El número de foto solo cuenta si va separado por guion, guion bajo o entre paréntesis
// (así "Peugeot 206.jpg" o "… Escala 1:12.png" no pierden su número).
const looseBase = (name) => slugify(name.replace(IMG_RE, '').replace(/\s*[-_]\s*\d{1,2}\s*$|\s*\(\s*\d{1,2}\s*\)\s*$/, ''));
const looseKey = (slug, id) => `${slug}--d-${id}.webp`;
const used = new Set(takenSlugs); let count = 0, skipped = [];
const records = [], categories = [];

async function walk(folderId, catSlug, catPath) {
  const files = await list(`'${folderId}' in parents and trashed=false`);
  const loose = new Map(); // base del nombre → fotos sueltas
  for (const f of files) if (IMG_RE.test(f.name) && f.mimeType !== 'application/vnd.google-apps.folder') {
    const b = looseBase(f.name); if (!loose.has(b)) loose.set(b, []); loose.get(b).push(f);
  }
  for (const list of loose.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
  for (const f of files) {
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      const slug = slugify(f.name);
      if (!catSlug) {
        categories.push({ name: f.name.trim(), slug, sort_order: 100 });
        lines.push(`insert into public.bb_lib_categories (name, slug, sort_order) values (${sql(f.name.trim())}, ${sql(slug)}, 100) on conflict (slug) do nothing;`);
        await walk(f.id, slug, f.name);
      } else await walk(f.id, catSlug, catPath + ' / ' + f.name); // subcarpetas: misma categoría
      continue;
    }
    if (IMG_RE.test(f.name)) continue; // fotos sueltas: van con su ZIP
    if (!ARCH_RE.test(f.name)) { skipped.push(`${catPath || '(raíz)'}/${f.name} (no es ZIP ni RAR)`); continue; }
    if (/\.part\d+\.rar$/i.test(f.name)) { skipped.push(`${catPath || '(raíz)'}/${f.name} (RAR en varias partes: subilo como un solo archivo)`); continue; }
    if (deletedKeys.has(f.id)) continue; // borrado desde el panel
    const extra = loose.get(slugify(pretty(f.name))) || [];
    const ex = existing.get(f.id);
    // Duplicados: un archivo idéntico (mismo contenido, aunque tenga otro nombre o esté en otra carpeta)
    // a uno ya cargado o a otro de esta misma corrida se ignora.
    const dupKey = f.md5Checksum ? 'md5:' + f.md5Checksum : `sz:${f.size}:${slugify(pretty(f.name))}`;
    if (!ex && seenFiles.has(dupKey)) { skipped.push(`${catPath || '(raíz)'}/${f.name} (duplicado de "${seenFiles.get(dupKey)}": se ignora)`); continue; }
    if (!ex) seenFiles.set(dupKey, pretty(f.name));
    if (ex) {
      // Ya cargado: solo se actualiza la galería si cambiaron las fotos sueltas (o --fotos y no tiene ninguna).
      const zipImgs = ex.images.filter((k) => !k.includes('--d-'));
      const wanted = [...zipImgs, ...extra.map((p) => looseKey(ex.slug, p.id))];
      const fromZip = FILL_PHOTOS && !zipImgs.length;
      if (fromZip || JSON.stringify(wanted) !== JSON.stringify(ex.images))
        pending.push({ f, catSlug, catPath, slug: ex.slug, refill: true, extra, ex, fromZip });
      continue;
    }
    let slug = slugify(pretty(f.name)); while (used.has(slug)) slug += '-2'; used.add(slug);
    pending.push({ f, catSlug, catPath, slug, extra });
  }
}

// Convierte una foto suelta de Drive (se baja entera: son livianas) a WebP para la galería.
async function loosePhoto(p, slug, withCover) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${p.id}?alt=media`, { headers: H });
  if (!r.ok) throw new Error('Drive ' + r.status);
  const tmp = path.join(os.tmpdir(), `bb-lib-${p.id}${path.extname(p.name)}`);
  fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
  const conv = (width, name) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-vf', `scale='min(${width},iw)':-2`, '-frames:v', '1', '-quality', '78', path.join(thumbsDir, name)]);
  try {
    conv(1280, looseKey(slug, p.id));
    if (withCover) conv(640, slug + '.webp');
  } finally { fs.unlinkSync(tmp); }
}

// Procesa un ZIP nuevo: piezas (índice) + foto. Se corren varios a la vez.
// Fotos sueltas → claves de galería (convierte solo las que todavía no están subidas).
async function addLoose(extra, slug, have, needCover) {
  const keys = [];
  for (const p of extra) {
    const key = looseKey(slug, p.id);
    try {
      if (!have.includes(key)) { await loosePhoto(p, slug, needCover && !keys.length); newFiles.push(key); if (needCover && !keys.length) newFiles.push(slug + '.webp'); }
      keys.push(key);
    } catch (e) { skipped.push(`${p.name}: no se pudo convertir la foto (${e.message})`); }
  }
  return keys;
}

async function processZip({ f, catSlug, catPath, slug, refill, extra = [], ex, fromZip }) {
  if (refill) {
    // Modelo ya cargado: se rearma la galería (fotos del ZIP + fotos sueltas actuales).
    let zipImgs = ex.images.filter((k) => !k.includes('--d-')), thumb = null;
    if (fromZip) {
      try {
        ({ thumb, images: zipImgs } = archExt(f.name) === '.rar' ? await rarPhotos(await download(f.id), slug) : await photos(f.id, await zipParts(f.id, Number(f.size || 0)), slug));
        newFiles.push(...zipImgs); if (thumb) newFiles.push(thumb);
      }
      catch (e) { skipped.push(`${f.name}: no se pudieron sacar las fotos (${e.message})`); }
    }
    const looseKeys = await addLoose(extra, slug, ex.images, !ex.thumb && !thumb);
    if (!ex.thumb && !thumb && looseKeys.length) thumb = slug + '.webp';
    refills.push({ storage_key: f.id, thumb, images: [...zipImgs, ...looseKeys], name: pretty(f.name) });
    console.log(`~ galería de ${pretty(f.name)}: ${zipImgs.length + looseKeys.length} foto(s)`);
    return;
  }
  {
    const size = Number(f.size || 0);
    const isRarFile = archExt(f.name) === '.rar';
    let parts = null, rarBuf = null;
    try {
      if (isRarFile) { rarBuf = await download(f.id); parts = await rarList(rarBuf); }
      else parts = await zipParts(f.id, size);
    } catch (e) { skipped.push(`${f.name}: no se pudo leer el índice (${e.message}); se carga sin piezas`); }
    let thumb = null, images = [];
    try { ({ thumb, images } = isRarFile ? (rarBuf ? await rarPhotos(rarBuf, slug) : { thumb: null, images: [] }) : await photos(f.id, parts, slug)); }
    catch (e) { skipped.push(`${f.name}: no se pudieron sacar las fotos (${e.message})`); }
    rarBuf = null;
    const fileName = slugify(pretty(f.name)) + archExt(f.name);
    newFiles.push(...images); if (thumb) newFiles.push(thumb);
    const looseKeys = await addLoose(extra, slug, [], !thumb);
    if (!thumb && looseKeys.length) thumb = slug + '.webp';
    images = [...images, ...looseKeys];
    if (parts) parts = parts.map(publicPart);
    records.push({ cat: catSlug, row: { slug, name: pretty(f.name), storage_key: f.id, file_name: fileName,
      size_bytes: size || null, md5: f.md5Checksum || null, parts: parts || [], thumb_key: thumb, images } });
    lines.push(`insert into public.bb_lib_models (slug, name, category_id, storage_key, file_name, size_bytes, md5, parts, thumb_key)
  values (${sql(slug)}, ${sql(pretty(f.name))}, ${catSlug ? `(select id from public.bb_lib_categories where slug = ${sql(catSlug)})` : 'null'},
          ${sql(f.id)}, ${sql(fileName)}, ${size || 'null'}, ${sql(f.md5Checksum)}, ${sql(JSON.stringify(parts || []))}::jsonb, ${sql(thumb)})
  on conflict (storage_key) do update set thumb_key = coalesce(excluded.thumb_key, bb_lib_models.thumb_key), parts = excluded.parts;`);
    count++;
    console.log(`+ ${catPath || '(sin categoría)'} → ${pretty(f.name)} · ${(size / 1048576).toFixed(1)} MB · ${parts ? parts.length + ' piezas' : 'sin índice'} · ${images.length} foto(s)`);
  }
}
const pending = [], refills = [], newFiles = [];
for (const r of roots) await walk(r.id, null, '');

// --revisar: solo cuenta los ZIP nuevos (para que GitHub instale ffmpeg únicamente si hace falta).
if (process.argv.includes('--revisar')) {
  console.log(`Para procesar (modelos nuevos o fotos nuevas): ${pending.length} · vistas 3D pendientes: ${needPreview.length}`);
  if (skipped.length) console.log('Salteados:\n  ' + skipped.join('\n  '));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `nuevos=${pending.length + needPreview.length}\n`);
  process.exit(0);
}
const queue = [...pending];
await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => { while (queue.length) await processZip(queue.shift()); }));
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
  const upload = (name) => call('/storage/v1/object/bb-lib-thumbs/' + encodeURIComponent(name), { method: 'POST',
    headers: { 'Content-Type': 'image/webp', 'x-upsert': 'true' }, body: fs.readFileSync(path.join(thumbsDir, name)) });
  for (const name of new Set(newFiles)) await upload(name); // solo lo convertido en esta corrida
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
  // Galería de modelos ya cargados (--fotos).
  for (const r of refills) {
    const body = { images: r.images }; if (r.thumb) body.thumb_key = r.thumb;
    await call('/rest/v1/bb_lib_models?storage_key=eq.' + encodeURIComponent(r.storage_key), { method: 'PATCH', headers: J, body: JSON.stringify(body) });
  }
  if (refills.length) console.log(`Galerías completadas: ${refills.filter((r) => r.images.length).length} de ${refills.length}.`);
  console.log(`Supabase: ${nuevos} modelos nuevos${PUBLISH ? ' publicados' : ' en borrador'}, ${records.length - nuevos} ya estaban.`);

  // Aviso en la campanita a los miembros (migración 060). Si falla, la carga igual quedó hecha.
  if (PUBLISH && nuevos > 0) {
    const names = records.slice(0, 3).map((r) => r.row.name).join(', ') + (nuevos > 3 ? ` y ${nuevos - 3} más` : '');
    try {
      const n = await call('/rest/v1/rpc/bb_lib_notify_new', { method: 'POST', headers: J, body: JSON.stringify({ p_count: nuevos, p_names: names }) });
      console.log(`Aviso enviado a ${n} miembro(s).`);
    } catch (e) { console.log('No se pudo enviar el aviso:', e.message); }
  }
}

// --- Vistas previas 3D (migración 063): para el visor de la ficha. Hasta 15 por corrida. ---
// Baja el ZIP una vez, arma un GLB liviano con colores y lo guarda en el bucket PRIVADO bb-lib-previews.
// Si falla, anota el error en preview_meta y no se reintenta solo (se borra preview_meta para reintentar).
if (PREVIEWS && (secretArg || process.env.SUPABASE_SECRET) && !process.argv.includes('--sin-3d')) {
  const { buildPreview, dominantColor } = await import('./biblioteca-preview.mjs');
  const SB = 'https://llciggitqtseosfklbjl.supabase.co';
  const key = (process.env.SUPABASE_SECRET || fs.readFileSync(secretArg, 'utf8')).replace(/^\uFEFF/, '').trim();
  const h = { apikey: key, Authorization: 'Bearer ' + key };
  const patch = (id, body) => fetch(`${SB}/rest/v1/bb_lib_models?id=eq.${id}`, { method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  // Los modelos recién insertados en esta corrida también necesitan su vista.
  if (records.length) {
    const fresh = await (await fetch(`${SB}/rest/v1/bb_lib_models?select=id,slug,storage_key,thumb_key&preview_key=is.null&preview_meta=is.null`, { headers: h })).json();
    for (const x of fresh) if (!needPreview.some((n) => n.id === x.id)) needPreview.push({ id: x.id, slug: x.slug, storage_key: x.storage_key, thumb: x.thumb_key });
  }
  const todo = needPreview.slice(0, REHACER ? 500 : 15);
  let made = 0;
  for (const m of todo) {
    try {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${m.storage_key}?alt=media`, { headers: H });
      if (!r.ok) throw new Error('Drive ' + r.status);
      const zip = Buffer.from(await r.arrayBuffer());
      let body = null;
      if (m.thumb) { // color principal de la portada para la carrocería (si es STL)
        try {
          const img = Buffer.from(await (await fetch(`${SB}/storage/v1/object/public/bb-lib-thumbs/${encodeURIComponent(m.thumb)}`)).arrayBuffer());
          const tmp = path.join(os.tmpdir(), `bb-lib-cover-${m.slug}.webp`); fs.writeFileSync(tmp, img);
          body = dominantColor(execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', tmp, '-vf', 'scale=48:36', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']));
          fs.unlinkSync(tmp);
        } catch { /* sin ffmpeg o sin portada: color por defecto */ }
      }
      const p = await buildPreview(zip, { bodyColor: body || '#e6e8ec' });
      // El nombre lleva la versión: así el navegador que la guardó en caché pide la nueva.
      const name = `${m.slug}.v${PREVIEW_V}.glb`;
      const up = await fetch(`${SB}/storage/v1/object/bb-lib-previews/${encodeURIComponent(name)}`, { method: 'POST', headers: { ...h, 'Content-Type': 'model/gltf-binary', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }, body: p.glb });
      if (!up.ok) throw new Error('subida ' + up.status + ' ' + (await up.text()).slice(0, 120));
      await patch(m.id, { preview_key: name, preview_meta: { mode: p.mode, size_mm: p.size, parts: p.parts, tris: p.tris, colors: p.colors, plates: p.plates, print: p.print, v: PREVIEW_V } });
      if (m.oldKey && m.oldKey !== name) await fetch(`${SB}/storage/v1/object/bb-lib-previews`, { method: 'DELETE', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [m.oldKey] }) }).catch(() => {});
      made++; console.log(`3D ${m.slug}: ${p.mode} · ${p.parts} piezas · ${p.colors} colores · ${p.plates} cama(s) · ${(p.glb.length / 1048576).toFixed(2)} MB`);
    } catch (e) {
      console.log(`3D ${m.slug}: no se pudo (${e.message})`);
      await patch(m.id, { preview_meta: { error: String(e.message).slice(0, 200), at: new Date().toISOString() } }).catch(() => {});
    }
  }
  if (todo.length) console.log(`Vistas 3D: ${made} de ${todo.length}${needPreview.length > todo.length ? ` (quedan ${needPreview.length - todo.length} para la próxima)` : ''}.`);
}
