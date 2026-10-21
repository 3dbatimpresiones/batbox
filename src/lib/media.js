// Detecta plataforma e IDs a partir de un enlace pegado en el panel admin.
export function parseMediaUrl(raw = '') {
  const url = raw.trim();
  let m = url.match(/youtube\.com\/shorts\/([\w-]{11})/i);
  if (m) return { platform: 'short', youtubeId: m[1], instagramCode: null, thumb: ytThumb(m[1]) };
  m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  if (m) return { platform: 'youtube', youtubeId: m[1], instagramCode: null, thumb: ytThumb(m[1]) };
  m = url.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/i);
  if (m) return { platform: 'instagram', youtubeId: null, instagramCode: m[1], thumb: null };
  return { platform: url ? 'other' : null, youtubeId: null, instagramCode: null, thumb: null };
}

export const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// Portadas de Instagram guardadas en public/thumbs/ig/ (Instagram no da un enlace
// fijo: los de su CDN vencen). Para sumar una: guardar <codigo>.jpg ahí y
// agregar el código a esta lista, o subir la imagen desde el panel admin.
const LOCAL_IG_THUMBS = new Set([
  'DEVyWWoxJsn', 'DEnb5WLSir4', 'DL_BpsRRy9Z', 'DMthGPcxbaQ', 'DN7AqpLDi1w', 'DN_fB6DEW60',
  'DOJMBfgDn4O', 'DOOz7fcEfWo', 'DPzx5-WEbBN', 'DUoCF6vEYAh', 'DUq_u2dEs36', 'DVgnzHjEfpH',
]);

// Capturas reales de cada herramienta (public/thumbs/tools/<slug>.jpg).
// Si en el panel se carga otra imagen para la herramienta, tiene prioridad.
const LOCAL_TOOL_THUMBS = new Set(['cotizador-free', 'cotizador-pro', 'huecos-pines', 'peso-de-carretes-vacios']);

// Rutas relativas ("thumbs/...") se resuelven contra la base de la web (/batbox/).
export const resolveAsset = (p) => (!p ? null : /^https?:\/\//i.test(p) ? p : import.meta.env.BASE_URL + p.replace(/^\/+/, ''));

// Miniatura de un contenido: la cargada (thumb_url), la portada local de Instagram
// o la captura local de la herramienta.
export function thumbSrc(item) {
  if (item.thumb) return resolveAsset(item.thumb);
  if (item.instagramCode && LOCAL_IG_THUMBS.has(item.instagramCode)) return resolveAsset(`thumbs/ig/${item.instagramCode}.jpg`);
  if (LOCAL_TOOL_THUMBS.has(item.id)) return resolveAsset(`thumbs/tools/${item.id}.jpg`);
  return null;
}

// Portadas verticales (reels, shorts): se muestran enteras sobre fondo desenfocado.
export const isVerticalMedia = (item) => item.platform === 'instagram' || item.platform === 'short';

// "Cambio de BOQUILLA en 1 minuto" → "cambio-de-boquilla-en-1-minuto"
export function slugify(text = '') {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '') || 'contenido';
}

export const isHttpUrl = (s) => /^https?:\/\/\S+$/i.test((s || '').trim());

// Dominio de un enlace ("www.printables.com" → "printables.com") y su ícono (favicon),
// para que un recurso sin miniatura muestre de qué página es.
export function siteHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
export const faviconUrl = (url) => {
  const host = siteHost(url);
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : null;
};
