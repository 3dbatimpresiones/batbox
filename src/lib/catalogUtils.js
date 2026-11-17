// Helpers puros del 3DBAT CATALOG (sin Supabase): probados en scripts/test-catalog.mjs.
export const DEFAULT_WHATSAPP = '5491132523503';

export function productLink(slug, origin = window.location.origin + window.location.pathname) {
  return `${origin}#/trabajos/${slug}`;
}

export function whatsappLink(phone, product, link) {
  const num = String(phone || DEFAULT_WHATSAPP).replace(/\D/g, '');
  const text = product
    ? `Hola 3DBAT! Quiero consultar por un trabajo como este: ${product.title}${link ? `\n${link}` : ''}`
    : 'Hola 3DBAT! Quiero consultar por un trabajo personalizado en impresión 3D.';
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

export function filterProducts(list, { q = '', category = 'all', featuredOnly = false } = {}) {
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = norm(q).trim().split(/\s+/).filter(Boolean);
  return list.filter((p) => {
    if (category !== 'all' && p.category_id !== category) return false;
    if (featuredOnly && !p.featured) return false;
    const hay = norm([p.title, p.description, p.category_name, p.show_client ? p.client : ''].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

export const sortProducts = (list) => [...list].sort((a, b) =>
  (b.featured - a.featured) || (a.sort - b.sort) || String(b.created_at).localeCompare(String(a.created_at)));

