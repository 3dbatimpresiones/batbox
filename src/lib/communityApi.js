import { useEffect, useState } from 'react';
import { sb } from './supabase.js';

// Capa de datos de BATBOX COMMUNITY (migración 044). Todo pasa por RPC o tablas con RLS:
// la validación real (miembro, autor, límites, moderación) vive en la base.

export const CATEGORIES = [
  { value: 'proyectos', label: 'Proyectos' },
  { value: 'impresion-3d', label: 'Impresión 3D' },
  { value: 'diseno-3d', label: 'Diseño 3D' },
  { value: 'laser-cnc', label: 'Láser y CNC' },
  { value: 'electronica', label: 'Electrónica' },
  { value: 'taller', label: 'Taller y mejoras' },
  { value: 'consultas', label: 'Consultas' },
  { value: 'otros', label: 'Otros' },
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

export const REACTIONS = [
  { kind: 'like', emoji: '👍', label: 'Me gusta' },
  { kind: 'fire', emoji: '🔥', label: 'Genial' },
  { kind: 'wow', emoji: '😮', label: 'Wow' },
  { kind: 'clap', emoji: '👏', label: 'Aplausos' },
  { kind: 'idea', emoji: '💡', label: 'Buena idea' },
];
export const REACTION_EMOJI = Object.fromEntries(REACTIONS.map((r) => [r.kind, r.emoji]));

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam o publicidad' },
  { value: 'ofensivo', label: 'Ofensivo o agresivo' },
  { value: 'inapropiado', label: 'Contenido inapropiado' },
  { value: 'copyright', label: 'Es de otra persona (derechos de autor)' },
  { value: 'otro', label: 'Otro motivo' },
];

export const MAX_IMAGES = 4;
export const BUCKET = 'bb-community';

export const isMissing = (e) => !!e && (e.code === 'PGRST202' || e.code === '42883' || e.code === '42P01' || e.code === 'PGRST205');

function wrap(error) {
  const e = new Error(error.message || 'Error inesperado');
  e.code = error.code;
  e.missing = isMissing(error);
  return e;
}

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw wrap(error);
  return data;
}

// ---------- Flags ----------
let flagsCache = null;
let flagsPromise = null;

export function loadFlags(force = false) {
  if (!force && flagsCache) return Promise.resolve(flagsCache);
  if (!force && flagsPromise) return flagsPromise;
  flagsPromise = Promise.resolve(sb.from('bb_settings').select('value').eq('key', 'community_flags').maybeSingle())
    .then(({ data }) => { flagsCache = data?.value || {}; return flagsCache; })
    .catch(() => { flagsCache = {}; return flagsCache; })
    .finally(() => { flagsPromise = null; });
  return flagsPromise;
}

export function useCommunityFlags() {
  const [flags, setFlags] = useState(flagsCache);
  useEffect(() => { let on = true; loadFlags().then((f) => on && setFlags(f)); return () => { on = false; }; }, []);
  return flags;
}

export async function saveFlags(next) {
  const { error } = await sb.from('bb_settings').upsert({ key: 'community_flags', value: next });
  if (error) throw wrap(error);
  flagsCache = next;
}

// ---------- Feed ----------
export const loadFeed = (o = {}) => rpc('bb_feed', {
  p_sort: o.sort || 'recent', p_category: o.category || null, p_q: o.q || null, p_tag: o.tag || null,
  p_author: o.author || null, p_saved: !!o.saved, p_before: o.before || null, p_offset: o.offset || 0,
  p_limit: o.limit || 12, p_id: o.id || null,
});
export const loadComments = (postId) => rpc('bb_post_comments_list', { p_post: postId, p_limit: 200 });
export const loadProfile = (uid) => rpc('bb_profile', { p_user: uid || null });
export const saveProfile = ({ bio, specialties }) => rpc('bb_profile_set', { p_bio: bio, p_specialties: specialties });

// ---------- Escritura ----------
export async function createPost({ body, category, tags, media, video_url }) {
  const { data, error } = await sb.from('bb_posts').insert({ body, category, tags, media, video_url: video_url || null }).select('id').single();
  if (error) throw wrap(error);
  return data.id;
}

export async function updatePost(id, { body, category, tags, media, video_url }) {
  const { data, error } = await sb.from('bb_posts').update({ body, category, tags, media, video_url: video_url || null }).eq('id', id).select('id');
  if (error) throw wrap(error);
  if (!data?.length) throw new Error('No se pudo guardar (¿ya no está disponible?).');
}

export async function deletePost(post) {
  const { error } = await sb.from('bb_posts').delete().eq('id', post.id);
  if (error) throw wrap(error);
  const paths = (post.media || []).map((m) => m.path);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths).catch(() => {});
}

export async function setReaction(postId, current, next) {
  if (current && current === next) {
    const { error } = await sb.from('bb_post_reactions').delete().eq('post_id', postId);
    if (error) throw wrap(error);
  } else if (current) {
    const { error } = await sb.from('bb_post_reactions').update({ kind: next }).eq('post_id', postId);
    if (error) throw wrap(error);
  } else {
    const { error } = await sb.from('bb_post_reactions').insert({ post_id: postId, kind: next });
    if (error) throw wrap(error);
  }
}

export async function setSaved(postId, saved) {
  const { error } = saved
    ? await sb.from('bb_post_saves').insert({ post_id: postId })
    : await sb.from('bb_post_saves').delete().eq('post_id', postId);
  if (error) throw wrap(error);
}

export async function addComment({ postId, parentId, body }) {
  const { data, error } = await sb.from('bb_post_comments')
    .insert({ post_id: postId, parent_id: parentId || null, body }).select('id').single();
  if (error) throw wrap(error);
  return data.id;
}

export async function deleteComment(id) {
  const { error } = await sb.from('bb_post_comments').delete().eq('id', id);
  if (error) throw wrap(error);
}

export const reportContent = ({ type, id, reason, detail }) =>
  rpc('bb_report', { p_type: type, p_id: String(id), p_reason: reason, p_detail: detail || null });

// ---------- Imágenes ----------
// Se reducen en el navegador (máx. 1600 px, WebP ~80 %) para cuidar Supabase Storage y transferencia.
export async function shrinkImage(file, maxSide = 1600) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Solo se aceptan imágenes JPG, PNG o WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('La imagen es demasiado pesada (máximo 15 MB antes de optimizarla).');
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.82));
  if (!blob) throw new Error('Este navegador no pudo optimizar la imagen.');
  if (blob.size > 3 * 1024 * 1024) throw new Error('La imagen sigue muy pesada; probá con una más chica.');
  return { blob, w, h };
}

export async function uploadImage(uid, file) {
  const { blob, w, h } = await shrinkImage(file);
  const name = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.webp`;
  const path = `${uid}/${name}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', upsert: false });
  if (error) throw new Error(error.message || 'No se pudo subir la imagen.');
  return { path, w, h };
}

export const removeImages = (paths) => paths.length ? sb.storage.from(BUCKET).remove(paths).catch(() => {}) : Promise.resolve();
export const imageUrl = (path) => sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

// ---------- Notificaciones ----------
export const loadNotifications = (before) => rpc('bb_notifications_list', { p_limit: 30, p_before: before || null });
export const unreadCount = () => rpc('bb_notifications_unread');
export const markRead = (ids) => rpc('bb_notifications_read', { p_ids: ids || null });

export async function loadPrefs() {
  const { data, error } = await sb.from('bb_notification_prefs').select('prefs').maybeSingle();
  if (error) throw wrap(error);
  return data?.prefs || {};
}
export async function savePrefs(userId, prefs) {
  const { error } = await sb.from('bb_notification_prefs').upsert({ user_id: userId, prefs, updated_at: new Date().toISOString() });
  if (error) throw wrap(error);
}

// ---------- Moderación (solo admin/editor; la base lo valida) ----------
export const modStats = () => rpc('bb_mod_stats');
export const modReports = (status = 'open') => rpc('bb_mod_reports', { p_status: status });
export const modResolve = ({ type, id, action, hide }) => rpc('bb_mod_report_resolve', { p_type: type, p_id: id, p_action: action, p_hide: !!hide });
export const modHidden = () => rpc('bb_mod_hidden_posts');
export const modPostSet = ({ id, status = null, pinned = null, note = null }) => rpc('bb_mod_post_set', { p_id: id, p_status: status, p_pinned: pinned, p_note: note });
export const modCommentRemove = (id) => rpc('bb_mod_comment_remove', { p_id: id });

// ---------- BATFORUM ----------
export const forumCategories = () => rpc('bb_forum_categories_list');
export const forumTopics = (o = {}) => rpc('bb_forum_topics_list', {
  p_category: o.category || null, p_q: o.q || null, p_filter: o.filter || 'all', p_sort: o.sort || 'activity',
  p_offset: o.offset || 0, p_limit: o.limit || 15,
});
export const forumTopic = (id) => rpc('bb_forum_topic', { p_id: id });
export const forumReplies = (id) => rpc('bb_forum_replies_list', { p_topic: id, p_limit: 300 });
export const forumSetSolution = (topic, reply) => rpc('bb_forum_set_solution', { p_topic: topic, p_reply: reply || null });
export const forumTopicSet = ({ id, closed = null, pinned = null, status = null }) =>
  rpc('bb_forum_topic_set', { p_topic: id, p_closed: closed, p_pinned: pinned, p_status: status, p_note: null });
export const forumReplyRemove = (id) => rpc('bb_forum_reply_remove', { p_id: id });
export const forumStats = () => rpc('bb_forum_stats');

export async function createTopic({ category_id, title, body, media }) {
  const { data, error } = await sb.from('bb_forum_topics').insert({ category_id, title, body, media }).select('id').single();
  if (error) throw wrap(error);
  return data.id;
}
export async function updateTopic(id, { title, body, media }) {
  const { data, error } = await sb.from('bb_forum_topics').update({ title, body, media }).eq('id', id).select('id');
  if (error) throw wrap(error);
  if (!data?.length) throw new Error('No se pudo guardar (¿ya no está disponible?).');
}
export async function deleteTopic(topic) {
  const { error } = await sb.from('bb_forum_topics').delete().eq('id', topic.id);
  if (error) throw wrap(error);
  const paths = (topic.media || []).map((m) => m.path);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths).catch(() => {});
}
export async function addReply({ topicId, body, media }) {
  const { data, error } = await sb.from('bb_forum_replies').insert({ topic_id: topicId, body, media: media || [] }).select('id').single();
  if (error) throw wrap(error);
  return data.id;
}
export async function deleteReply(id) {
  const { error } = await sb.from('bb_forum_replies').delete().eq('id', id);
  if (error) throw wrap(error);
}
// Administración de categorías (RLS: solo admin)
export async function adminCategories() {
  const { data, error } = await sb.from('bb_forum_categories').select('*').order('sort').order('name');
  if (error) throw wrap(error);
  return data;
}
export async function saveCategory(c) {
  const row = { slug: c.slug, name: c.name, description: c.description || '', sort: Number(c.sort) || 100, active: c.active !== false };
  const { error } = c.id ? await sb.from('bb_forum_categories').update(row).eq('id', c.id) : await sb.from('bb_forum_categories').insert(row);
  if (error) throw wrap(error);
}
export async function deleteCategory(id) {
  const { error } = await sb.from('bb_forum_categories').delete().eq('id', id);
  if (error) throw wrap(error);
}

// ---------- MAPA MAKER ----------
export const mapPlaces = () => rpc('bb_map_places_list');
export const mapMakers = (o = {}) => rpc('bb_map_makers', { p_place: o.place || null, p_region: o.region || null, p_specialty: o.specialty || null, p_offset: 0, p_limit: 60 });
export const mapMy = () => rpc('bb_map_my');
export const mapJoin = ({ place, specialties, visible, links }) => rpc('bb_map_join', { p_place: place, p_specialties: specialties || [], p_visible: visible !== false, p_links: links || [] });
export const mapSetVisible = (v) => rpc('bb_map_set_visible', { p_visible: v });
export const mapLeave = () => rpc('bb_map_leave');
export const mapSuggest = ({ country, region, city }) => rpc('bb_map_suggest', { p_country: country, p_region: region, p_city: city });
export const mapStats = () => rpc('bb_map_stats');
export async function adminPlaces() {
  const { data, error } = await sb.from('bb_map_places').select('*').order('country').order('region').order('city');
  if (error) throw wrap(error);
  return data;
}
export async function savePlace(p) {
  const row = { country: p.country, region: p.region, city: p.city, lat: p.lat === '' ? null : Number(p.lat), lng: p.lng === '' ? null : Number(p.lng), active: !!p.active };
  const { error } = p.id ? await sb.from('bb_map_places').update(row).eq('id', p.id) : await sb.from('bb_map_places').insert(row);
  if (error) throw wrap(error);
}
export async function deletePlace(id) {
  const { error } = await sb.from('bb_map_places').delete().eq('id', id);
  if (error) throw wrap(error);
}

// ---------- GALERÍA MAKER ----------
export const GALLERY_BUCKET = 'bb-gallery-files';
export const GALLERY_EXTS = ['stl', '3mf', 'obj', 'step', 'stp', 'dxf', 'svg'];
export const GALLERY_MAX_FILE_MB = 25;
export const GALLERY_SORTS = [
  { value: 'recent', label: 'Recientes' }, { value: 'popular', label: 'Más populares' },
  { value: 'week', label: 'Tendencia semanal' }, { value: 'month', label: 'Tendencia mensual' },
];
export const featuredMaker = () => rpc('bb_featured_maker');
export async function featuredInfo() {
  try { return await rpc('bb_featured_info'); }
  catch (e) {
    if (!e.missing) throw e;
    const uid = await featuredMaker();
    return uid ? { user_id: uid, name: null } : null;
  }
}
export const galleryCategories = () => rpc('bb_gallery_categories_list');
export const galleryList = (o = {}) => rpc('bb_gallery_list', {
  p_q: o.q || null, p_category: o.category || null, p_sort: o.sort || 'recent', p_state: o.state || null, p_author: o.author || null,
  p_saved: !!o.saved, p_featured: o.featured || null, p_drafts: !!o.drafts, p_offset: o.offset || 0, p_limit: o.limit || 12,
});
export const galleryProject = (id) => rpc('bb_gallery_project', { p_id: id });
export const galleryFeature = ({ id, pick = null, week = null }) => rpc('bb_gallery_feature', { p_post: id, p_pick: pick, p_week: week });
export const galleryStats = () => rpc('bb_gallery_stats');
export const gallerySave = (f) => rpc('bb_gallery_save', {
  p_id: f.id || null, p_title: f.title, p_description: f.description, p_category: f.category, p_tags: f.tags || [], p_media: f.media || [],
  p_video: f.video || null, p_state: f.state || 'done', p_technology: f.technology || null, p_machine: f.machine || null, p_material: f.material || null,
  p_minutes: f.minutes === '' || f.minutes == null ? null : Number(f.minutes), p_params: f.params || {}, p_links: f.links || [],
  p_license: !!f.license, p_in_feed: f.in_feed !== false, p_publish: !!f.publish,
});
export const galleryFileSet = (file, { downloadable = null, remove = false } = {}) => rpc('bb_gallery_file_set', { p_file: file, p_downloadable: downloadable, p_remove: remove });
export async function deleteGalleryProject(project) {
  const { error } = await sb.from('bb_posts').delete().eq('id', project.id);
  if (error) throw wrap(error);
  const photos = (project.media || []).map((m) => m.path);
  if (photos.length) await sb.storage.from(BUCKET).remove(photos).catch(() => {});
  const paths = (project.files || []).map((f) => f.path).filter(Boolean);
  if (paths.length) await sb.storage.from(GALLERY_BUCKET).remove(paths).catch(() => {});
}
export async function uploadGalleryFile(uid, postId, file, downloadable = false) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!GALLERY_EXTS.includes(ext)) throw new Error(`Formato no admitido. Usá: ${GALLERY_EXTS.join(', ').toUpperCase()}.`);
  if (file.size > GALLERY_MAX_FILE_MB * 1048576) throw new Error(`El archivo supera el máximo de ${GALLERY_MAX_FILE_MB} MB.`);
  const path = `${uid}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(GALLERY_BUCKET).upload(path, file, { upsert: false, contentType: 'application/octet-stream' });
  if (error) throw new Error(error.message || 'No se pudo subir el archivo.');
  try {
    return await rpc('bb_gallery_file_register', { p_post: postId, p_path: path, p_name: file.name.slice(0, 100), p_downloadable: downloadable });
  } catch (e) { await sb.storage.from(GALLERY_BUCKET).remove([path]).catch(() => {}); throw e; }
}
export async function removeGalleryFile(fileId) {
  const path = await galleryFileSet(fileId, { remove: true });
  if (path) await sb.storage.from(GALLERY_BUCKET).remove([path]).catch(() => {});
}
// Pide permiso a la base (límite por hora) y recién después firma la descarga.
export async function downloadGalleryFile(fileId) {
  const g = await rpc('bb_gallery_file_download', { p_file: fileId });
  const { data, error } = await sb.storage.from(GALLERY_BUCKET).createSignedUrl(g.path, 60, { download: g.name });
  if (error) throw new Error('No se pudo preparar la descarga. Probá de nuevo.');
  return data.signedUrl;
}
export async function adminGalleryCategories() {
  const { data, error } = await sb.from('bb_gallery_categories').select('*').order('sort').order('name');
  if (error) throw wrap(error);
  return data;
}
export async function saveGalleryCategory(c) {
  const row = { slug: c.slug, name: c.name, sort: Number(c.sort) || 100, active: c.active !== false };
  const { error } = c.id ? await sb.from('bb_gallery_categories').update(row).eq('id', c.id) : await sb.from('bb_gallery_categories').insert(row);
  if (error) throw wrap(error);
}
export async function deleteGalleryCategory(id) {
  const { error } = await sb.from('bb_gallery_categories').delete().eq('id', id);
  if (error) throw wrap(error);
}
export const formatMinutes = (m) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
export const formatBytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// ---------- Utilidades de presentación ----------
export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`;
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: s > 86400 * 300 ? 'numeric' : undefined });
}

export function youtubeId(url) {
  const m = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url || '');
  return m ? m[1] : null;
}

export function parseTags(text) {
  return [...new Set(String(text || '').split(/[\s,]+/).map((t) => t.replace(/^#+/, '').toLowerCase()).filter((t) => /^[a-z0-9áéíóúñ_-]{2,24}$/.test(t)))].slice(0, 5);
}
