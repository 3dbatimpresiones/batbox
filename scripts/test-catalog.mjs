// Prueba de helpers puros del 3DBAT CATALOG: node scripts/test-catalog.mjs
import { filterProducts, sortProducts, whatsappLink } from '../src/lib/catalogUtils.js';
let ok = 0, fail = 0;
const t = (name, cond) => { cond ? ok++ : (fail++, console.log('FALLA:', name)); };
const items = [
  { id: 1, title: 'Llavero Batman', description: 'PLA negro', category_id: 'a', featured: false, sort: 0, created_at: '2026-01-01', client: 'Juan', show_client: false },
  { id: 2, title: 'Maceta Groot', description: 'impresión en PETG', category_id: 'b', featured: true, sort: 10, created_at: '2026-02-01', client: 'Ana', show_client: true },
];
t('wa sin producto', whatsappLink('+54 9 11 3252-3503') === 'https://wa.me/5491132523503?text=' + encodeURIComponent('Hola 3DBAT! Quiero consultar por un trabajo personalizado en impresión 3D.'));
t('wa con producto incluye link', decodeURIComponent(whatsappLink(null, items[0], 'https://x/#/trabajos/a')).includes('Llavero Batman\nhttps://x/#/trabajos/a'));
t('wa usa número por defecto', whatsappLink('').startsWith('https://wa.me/5491132523503'));
t('busca sin tildes', filterProducts(items, { q: 'impresion' }).length === 1);
t('busca varias palabras', filterProducts(items, { q: 'llavero pla' }).length === 1);
t('categoría', filterProducts(items, { category: 'b' })[0].id === 2);
t('cliente oculto no se busca', filterProducts(items, { q: 'juan' }).length === 0);
t('cliente visible se busca', filterProducts(items, { q: 'ana' }).length === 1);
t('solo destacados', filterProducts(items, { featuredOnly: true }).length === 1);
t('destacado primero', sortProducts(items)[0].id === 2);
console.log(`${ok} OK, ${fail} fallas`); process.exit(fail ? 1 : 0);
