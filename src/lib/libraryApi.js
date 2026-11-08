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
  { value: 'name', label: 'A–Z' },
];
export const PAGE = 24;

export const quota = () => rpc('bb_lib_quota');
export const categories = () => rpc('bb_lib_categories_list');
export const models = ({ category = null, q = '', sort = 'new', offset = 0, limit = PAGE, status = null } = {}) =>
  rpc('bb_lib_models_list', { p_category: category, p_q: q || null, p_sort: sort, p_limit: limit, p_offset: offset, p_status: status });
export const model = (slug) => rpc('bb_lib_model', { p_slug: slug });
export const toggleFavorite = (id) => rpc('bb_lib_favorite_toggle', { p_model: id });
export const myFavorites = () => rpc('bb_lib_my_favorites');
export const myDownloads = () => rpc('bb_lib_my_downloads');

// Pide el permiso y arranca la descarga en el navegador (el archivo viene del puente, no de Supabase).
export async function download(id) {
  const r = await rpc('bb_lib_download', { p_model: id });
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
