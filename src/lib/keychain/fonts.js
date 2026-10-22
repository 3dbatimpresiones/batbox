// =====================================================================
// Fuentes del Creador de Llaveros: todo el catálogo de Google Fonts
// (vía Fontsource, con licencia libre OFL/Apache) + fuentes propias.
// Se descargan en WOFF (opentype.js no lee WOFF2) y quedan en memoria.
// =====================================================================

const LIST_URL = 'https://api.fontsource.org/v1/fonts?subsets=latin';
const fileUrl = (id, weight) => `https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/latin-${weight}-normal.woff`;

// Las más usadas para llaveros (arriba de todo en la lista). [id, peso sugerido]
export const POPULAR = [
  ['pacifico', 400], ['lobster', 400], ['fredoka', 700], ['titan-one', 400], ['luckiest-guy', 400],
  ['righteous', 400], ['shrikhand', 400], ['chewy', 400], ['permanent-marker', 400], ['bungee', 400],
  ['bebas-neue', 400], ['montserrat', 900], ['poppins', 800], ['varela-round', 400], ['baloo-2', 800],
  ['comfortaa', 700], ['dancing-script', 700], ['great-vibes', 400], ['sniglet', 800], ['lilita-one', 400],
  ['bangers', 400], ['cookie', 400], ['satisfy', 400], ['grand-hotel', 400], ['caveat', 700],
  ['nunito', 900], ['rubik', 800], ['kaushan-script', 400], ['courgette', 400], ['yellowtail', 400],
  ['alfa-slab-one', 400], ['bowlby-one', 400], ['passion-one', 700], ['sigmar-one', 400], ['cherry-bomb-one', 400],
];
export const CATEGORIES = [
  { id: 'popular', label: 'Populares' },
  { id: 'handwriting', label: 'Manuscritas' },
  { id: 'display', label: 'Decorativas' },
  { id: 'sans-serif', label: 'Simples' },
  { id: 'serif', label: 'Con serifa' },
  { id: 'all', label: 'Todas' },
];

let listPromise = null;
// Lista de familias: [{ id, family, category, weights }]
export function loadFontList() {
  if (!listPromise) {
    listPromise = (async () => {
      try {
        const cached = sessionStorage.getItem('bb_fontlist');
        if (cached) return JSON.parse(cached);
      } catch { /* sin caché */ }
      const res = await fetch(LIST_URL);
      if (!res.ok) throw new Error('No se pudo cargar la lista de fuentes.');
      const all = (await res.json())
        .filter((f) => f.type === 'google' && f.category !== 'icons' && f.styles?.includes('normal'))
        .map((f) => ({ id: f.id, family: f.family, category: f.category, weights: f.weights }));
      try { sessionStorage.setItem('bb_fontlist', JSON.stringify(all)); } catch { /* lleno */ }
      return all;
    })().catch((e) => { listPromise = null; throw e; });
  }
  return listPromise;
}

// Peso por defecto: el sugerido si existe; si no, el más grueso hasta 800 (los llaveros
// quedan mejor con trazo grueso); si no, el que haya.
export function defaultWeight(font) {
  const pop = POPULAR.find(([id]) => id === font.id);
  if (pop && font.weights.includes(pop[1])) return pop[1];
  const ok = font.weights.filter((w) => w <= 800);
  return ok.length ? Math.max(...ok) : font.weights[0];
}

const cache = new Map();
// Descarga el archivo de la fuente (ArrayBuffer). key = "id:peso".
export async function fetchFont(id, weight) {
  const key = `${id}:${weight}`;
  if (!cache.has(key)) {
    cache.set(key, fetch(fileUrl(id, weight)).then((r) => {
      if (!r.ok) throw new Error('No se pudo descargar la fuente.');
      return r.arrayBuffer();
    }).catch((e) => { cache.delete(key); throw e; }));
  }
  return { key, buffer: (await cache.get(key)).slice(0) };
}

// Muestra la fuente en la página (para el nombre de la fuente y la vista previa del texto).
const shown = new Set();
export async function showFontInPage(family, buffer, key) {
  if (shown.has(key)) return;
  try {
    const face = new FontFace(family, buffer.slice(0));
    await face.load();
    document.fonts.add(face);
    shown.add(key);
  } catch { /* no es grave: solo es la vista del nombre */ }
}
