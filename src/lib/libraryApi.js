import { sb } from './supabase.js';
import { LIBRARY_DL_URL, SUPABASE_URL } from '../config.js';

// Portadas livianas (WebP) que genera scripts/biblioteca-importar.mjs, en un bucket público.
export const thumbUrl = (key) => (key ? `${SUPABASE_URL}/storage/v1/object/public/bb-lib-thumbs/${encodeURIComponent(key)}` : null);

// Biblioteca 3D (migraciones 058–059). Todo lo valida la base: solo Makers Club pago.

const MISSING = new Set(['PGRST202', '42883', '42P01', 'PGRST205']);

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const e = new Error(error.message || 'Error inesperado');
    e.missing = MISSING.has(error.code);
    throw e;
  }
  return data;
}

export const SORTS = [
  { value: 'new', label: 'Nuevos' },
  { value: 'popular', label: 'Populares' },
  { value: 'rating', label: 'Mejor valorados' },
  { value: 'name', label: 'A–Z' },
];
export const PAGE = 24;

export const quota = () => rpc('bb_lib_quota');
export const categories = () => rpc('bb_lib_categories_list');
export const models = ({ category = null, q = '', sort = 'new', offset = 0, limit = PAGE, status = null, tag = null } = {}) =>
  rpc('bb_lib_models_list', { p_category: category, p_q: q || null, p_sort: sort, p_limit: limit, p_offset: offset, p_status: status, p_tag: tag });
export const tags = (category = null) => rpc('bb_lib_tags', { p_category: category });
export const related = (id) => rpc('bb_lib_related', { p_model: id });

// Valoraciones
export const reviews = (id) => rpc('bb_lib_reviews_list', { p_model: id });
export const saveReview = (id, stars, comment) => rpc('bb_lib_review_save', { p_model: id, p_stars: stars, p_comment: comment || '' });
export const deleteReview = (id, user = null) => rpc('bb_lib_review_delete', { p_model: id, p_user: user });

// "Lo imprimí": fotos de impresiones de los miembros (las fotos van al bucket de comunidad).
export const makes = (id) => rpc('bb_lib_makes_list', { p_model: id });
export const saveMake = (id, media, caption, galleryPost = null) => rpc('bb_lib_make_save', { p_model: id, p_media: media, p_caption: caption || '', p_gallery: galleryPost });
export const deleteMake = (id) => rpc('bb_lib_make_delete', { p_id: id });

// Colecciones personales
export const myCollections = (model = null) => rpc('bb_lib_my_collections', { p_model: model });
export const saveCollection = (name, id = null) => rpc('bb_lib_collection_save', { p_name: name, p_id: id });
export const deleteCollection = (id) => rpc('bb_lib_collection_delete', { p_id: id });
export const toggleInCollection = (id, model) => rpc('bb_lib_collection_toggle', { p_id: id, p_model: model });
export const collectionModels = (id) => rpc('bb_lib_collection_models', { p_id: id });

// Etiquetas automáticas → texto lindo ("escala 1:12" → "Escala 1:12", "gt-rc" → "GT-RC", "con direccion" → "Con dirección").
const TAG_LABEL = { 'gt-rc': 'GT-RC', 'con direccion': 'Con dirección', bmw: 'BMW' };
export const tagLabel = (t) => TAG_LABEL[t] || t.replace(/^\w/, (c) => c.toUpperCase());
export const model = (slug) => rpc('bb_lib_model', { p_slug: slug });
export const toggleFavorite = (id) => rpc('bb_lib_favorite_toggle', { p_model: id });
export const myFavorites = () => rpc('bb_lib_my_favorites');
export const myDownloads = () => rpc('bb_lib_my_downloads');
// Última descarga propia de un modelo (067). Si la función todavía no existe, no muestra nada.
export const myLastDownload = (id) => rpc('bb_lib_my_last_download', { p_model: id }).catch(() => null);
// "5 h 13 min" a partir de segundos.
export const formatDuration = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`; };

// Pide el permiso y arranca la descarga en el navegador (el archivo viene del puente, no de Supabase).
// part = posición del archivo en m.parts para bajar solo ese archivo (066); sin part, el ZIP entero.
export async function download(id, part = null) {
  const r = await rpc('bb_lib_download', part == null ? { p_model: id } : { p_model: id, p_part: part });
  const a = document.createElement('a');
  a.href = `${LIBRARY_DL_URL}/d/${r.token}`;
  a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  return r;
}

// --- Administración ---
export const adminStats = () => rpc('bb_lib_admin_stats');
export const adminSaveModel = (p) => rpc('bb_lib_admin_model_save', { p });
export const adminSetStatus = (id, status) => rpc('bb_lib_admin_model_status', { p_model: id, p_status: status });
export const adminSaveCategory = (p) => rpc('bb_lib_admin_category_save', { p });
export const adminDeleteModel = (id) => rpc('bb_lib_admin_model_delete', { p_id: id });
export const adminDeleteCategory =(id) => rpc('bb_lib_admin_category_delete', { p_id: id });

// Botón "Actualizar biblioteca" (solo admins): el puente valida que sea admin y lanza la importación en GitHub.
async function syncCall(method) {
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Tenés que iniciar sesión.');
  const r = await fetch(`${LIBRARY_DL_URL}/sync`, { method, headers: { Authorization: `Bearer ${token}` } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'No se pudo actualizar la biblioteca.');
  return body;
}
export const syncStart = () => syncCall('POST');
export const syncStatus = () => syncCall('GET');

// Acepta un enlace de Drive (/file/d/<ID>/ o ?id=<ID>) o el ID solo.
export function driveId(text = '') {
  const s = text.trim();
  const m = s.match(/\/d\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,200}$/.test(s) ? s : '';
}

export const formatBytes = (b) => (!b ? '' : b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export const STATUS = {
  draft: { label: 'Borrador', cls: 'sample' },
  published: { label: 'Publicado', cls: 'ok' },
  hidden: { label: 'Oculto', cls: 'muted' },
  archived: { label: 'Archivado', cls: 'muted' },
  removed: { label: 'Retirado', cls: 'muted' },
};
export const LICENSE = {
  unknown: 'Sin verificar',
  verified: 'Verificada',
  rejected: 'Rechazada',
};
