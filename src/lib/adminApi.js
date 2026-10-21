import { sb } from './supabase.js';

// Operaciones del panel admin. La base las valida con is_admin() (RLS):
// si alguien sin permiso las llama, no se guarda nada.
// Supabase no da error cuando RLS filtra un UPDATE: por eso se pide
// .select() y se comprueba que haya filas afectadas.

const NO_PERMISSION = 'No se guardó: tu cuenta no tiene permiso de administrador.';

function check({ data, error }, expectRows = true) {
  if (error) throw new Error(error.message);
  if (expectRows && (!data || (Array.isArray(data) && data.length === 0))) throw new Error(NO_PERMISSION);
  return data;
}

export async function createContent(content, body) {
  let res = await sb.from('bb_content').insert(content).select('id, slug').single();
  if (res.error?.code === '23505') {
    // slug repetido: se agrega un sufijo corto
    content = { ...content, slug: `${content.slug}-${Math.random().toString(36).slice(2, 6)}` };
    res = await sb.from('bb_content').insert(content).select('id, slug').single();
  }
  const row = check(res);
  check(await sb.from('bb_content_body').upsert({ content_id: row.id, ...body }).select('content_id'));
  return row;
}

export async function updateContent(id, content, body) {
  check(await sb.from('bb_content').update(content).eq('id', id).select('id'));
  if (body) check(await sb.from('bb_content_body').upsert({ content_id: id, ...body }).select('content_id'));
}

export async function setFields(id, fields) {
  check(await sb.from('bb_content').update(fields).eq('id', id).select('id'));
}

export async function deleteContent(id) {
  check(await sb.from('bb_content').delete().eq('id', id).select('id'));
}

// Recibe la lista ya ordenada y guarda sort_order 10, 20, 30… solo donde cambió.
export async function saveOrder(list) {
  const changes = list.map((r, i) => ({ id: r.dbId, sort: (i + 1) * 10, prev: r.sortOrder })).filter((c) => c.sort !== c.prev);
  for (const c of changes) await setFields(c.id, { sort_order: c.sort });
}

// Sube una imagen al bucket público "batbox-media" (migración 002) y devuelve su URL.
const MAX_IMG = 2 * 1024 * 1024;
export async function uploadImage(file, nameHint = 'imagen') {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Tiene que ser una imagen JPG, PNG, WEBP o GIF.');
  if (file.size > MAX_IMG) throw new Error('La imagen pesa más de 2 MB. Achicala o usá otra.');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[file.type];
  const path = `thumbs/${Date.now()}-${nameHint}.${ext}`;
  const { error } = await sb.storage.from('batbox-media').upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error('Falta correr la migración 002 (imágenes) en Supabase.');
    if (/row-level security|unauthorized|403/i.test(error.message)) throw new Error('Tu cuenta no tiene permiso para subir imágenes.');
    throw new Error(error.message);
  }
  return sb.storage.from('batbox-media').getPublicUrl(path).data.publicUrl;
}

// Datos de un enlace de YouTube/Instagram (Edge Function "bb-link-preview").
// Si la función no está instalada, para YouTube se usa su oEmbed público
// (título y miniatura; la descripción solo la da la función).
export async function fetchLinkPreview(url, parsed) {
  const { data, error } = await sb.functions.invoke('bb-link-preview', { body: { url } });
  if (!error && data && !data.error) return { data, partial: false };
  let message = data?.error;
  const status = error?.context?.status;
  if (error?.context?.json) { try { message = (await error.context.json()).error || message; } catch { /* sin cuerpo */ } }
  if (status === 403) throw new Error(message || 'Solo administradores pueden usar esta función.');
  if (parsed?.youtubeId) {
    const o = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + parsed.youtubeId)}&format=json`);
    const fallback = { platform: parsed.platform, youtubeId: parsed.youtubeId, thumb: parsed.thumb, embeddable: o.status !== 401 && o.status !== 403, title: '', description: '' };
    if (o.ok) fallback.title = (await o.json()).title || '';
    return { data: fallback, partial: true };
  }
  throw new Error(message || 'La función bb-link-preview todavía no está instalada en Supabase.');
}

export async function saveSetting(key, value) {
  check(await sb.from('bb_settings').upsert({ key, value }).select('key'));
}
