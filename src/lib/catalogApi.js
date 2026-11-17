import { sb } from './supabase.js';
import { shrinkImage } from './communityApi.js';
import { slugify } from './media.js';
import { sortProducts } from './catalogUtils.js';

export { DEFAULT_WHATSAPP, filterProducts, productLink, sortProducts, whatsappLink } from './catalogUtils.js';

// 3DBAT CATALOG (migración 074). Lectura pública de lo publicado; la escritura
// la valida la base con bb_can_edit() (RLS). Ver supabase/074_batbox_catalogo.sql.

const BUCKET = 'bb-catalog';

function check({ data, error }, expectRows = true) {
  if (error) throw new Error(error.message);
  if (expectRows && (!data || (Array.isArray(data) && !data.length))) throw new Error('No se guardó: tu cuenta no tiene permiso de edición.');
  return data;
}

export const photoUrl = (path) => (path ? sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : '');

// ---------- Lectura ----------
const PROD_COLS = 'id, slug, title, description, category_id, client, show_client, status, featured, sort, cover_path, created_at, updated_at, published_at, bb_cat_photos(id, path, w, h, sort, edit)';

function shape(p, cats) {
  const photos = [...(p.bb_cat_photos || [])].sort((a, b) => a.sort - b.sort);
  const cat = cats.find((c) => c.id === p.category_id);
  return { ...p, photos, bb_cat_photos: undefined, category_name: cat?.name || '', cover: p.cover_path || photos[0]?.path || '' };
}

export async function loadCatalog() {
  const [cats, prods, settings] = await Promise.all([
    sb.from('bb_cat_categories').select('*').order('sort').order('name'),
    sb.from('bb_cat_products').select(PROD_COLS),
    sb.from('bb_settings').select('value').eq('key', 'catalog').maybeSingle(),
  ]);
  const categories = check(cats, false) || [];
  const products = sortProducts((check(prods, false) || []).map((p) => shape(p, categories)));
  return { categories, products, settings: settings.data?.value || {} };
}

// ---------- Categorías ----------
export async function saveCategory(c) {
  const row = { name: c.name.trim(), slug: slugify(c.slug || c.name), sort: Number(c.sort) || 0, active: c.active !== false };
  return c.id
    ? check(await sb.from('bb_cat_categories').update(row).eq('id', c.id).select('id'))
    : check(await sb.from('bb_cat_categories').insert(row).select('id'));
}
export const deleteCategory = async (id) => check(await sb.from('bb_cat_categories').delete().eq('id', id).select('id'));

// ---------- Productos ----------
const PROD_FIELDS = ['title', 'description', 'category_id', 'client', 'show_client', 'status', 'featured', 'sort', 'cover_path'];
const pick = (o) => Object.fromEntries(PROD_FIELDS.filter((k) => k in o).map((k) => [k, o[k] === '' && k === 'category_id' ? null : o[k]]));

export async function saveProduct(p) {
  const row = pick(p);
  if (p.id) return check(await sb.from('bb_cat_products').update(row).eq('id', p.id).select('id, slug').single());
  let slug = slugify(p.slug || p.title);
  let res = await sb.from('bb_cat_products').insert({ ...row, slug }).select('id, slug').single();
  if (res.error?.code === '23505') {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    res = await sb.from('bb_cat_products').insert({ ...row, slug }).select('id, slug').single();
  }
  return check(res);
}

export async function setProductFields(id, fields) {
  return check(await sb.from('bb_cat_products').update(fields).eq('id', id).select('id'));
}

export async function deleteProduct(product) {
  const paths = (product.photos || []).map((f) => f.path);
  check(await sb.from('bb_cat_products').delete().eq('id', product.id).select('id'));
  if (paths.length) await sb.storage.from(BUCKET).remove(paths).catch(() => {});
}

// Duplicado: copia como borrador, con copias propias de cada foto (borrar uno no afecta al otro).
export async function duplicateProduct(product) {
  const copy = await saveProduct({ ...product, id: undefined, title: `${product.title} (copia)`, status: 'draft', featured: false, cover_path: null });
  for (const f of product.photos || []) {
    const path = `${copy.id}/${rand()}.webp`;
    const { error } = await sb.storage.from(BUCKET).copy(f.path, path);
    if (error) throw new Error(error.message);
    check(await sb.from('bb_cat_photos').insert({ product_id: copy.id, path, w: f.w, h: f.h, sort: f.sort, edit: f.edit || {} }).select('id'));
  }
  return copy;
}

export async function reorderProducts(ids) {
  for (let i = 0; i < ids.length; i++) await setProductFields(ids[i], { sort: i * 10 });
}

// ---------- Fotos ----------
const rand = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export async function addPhoto(productId, file, sort) {
  const { blob, w, h } = await shrinkImage(file, 2000);
  const path = `${productId}/${rand()}.webp`;
  const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', upsert: false });
  if (up.error) throw new Error(up.error.message || 'No se pudo subir la foto.');
  try {
    return check(await sb.from('bb_cat_photos').insert({ product_id: productId, path, w, h, sort }).select('id, path, w, h, sort, edit').single());
  } catch (e) { await sb.storage.from(BUCKET).remove([path]).catch(() => {}); throw e; }
}

export async function removePhoto(photo) {
  check(await sb.from('bb_cat_photos').delete().eq('id', photo.id).select('id'));
  await sb.storage.from(BUCKET).remove([photo.path]).catch(() => {});
}

export async function reorderPhotos(photos) {
  for (let i = 0; i < photos.length; i++) check(await sb.from('bb_cat_photos').update({ sort: i }).eq('id', photos[i].id).select('id'));
}

// ---------- Ajustes ----------
export async function saveSettings(value) {
  return check(await sb.from('bb_settings').upsert({ key: 'catalog', value }).select('key'));
}
