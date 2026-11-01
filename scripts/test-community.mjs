// Pruebas de los helpers puros de BATBOX COMMUNITY (src/lib/communityApi.js).
// La lógica de permisos/RLS se prueba aparte con PGlite: scripts/sql/test044.mjs.
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const api = await import('../src/lib/communityApi.js');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('OK  ' + name); };

t('youtubeId acepta watch, shorts y youtu.be', () => {
  assert.equal(api.youtubeId('https://www.youtube.com/watch?v=W4zFluOZnjA'), 'W4zFluOZnjA');
  assert.equal(api.youtubeId('https://youtu.be/W4zFluOZnjA?t=3'), 'W4zFluOZnjA');
  assert.equal(api.youtubeId('https://youtube.com/shorts/W4zFluOZnjA'), 'W4zFluOZnjA');
});
t('youtubeId rechaza otros sitios, http y javascript:', () => {
  for (const u of ['https://evil.com/watch?v=W4zFluOZnjA', 'http://youtu.be/W4zFluOZnjA', 'javascript:alert(1)', '', null, 'https://youtu.be/corto'])
    assert.equal(api.youtubeId(u), null, String(u));
});
t('parseTags limpia #, minúsculas, duplicados y tope de 5', () => {
  assert.deepEqual(api.parseTags('#Benchy, benchy #PETG x'), ['benchy', 'petg']);
  assert.equal(api.parseTags('a1 b2 c3 d4 e5 f6 g7').length, 5);
  assert.deepEqual(api.parseTags('<script> #ok_1'), ['ok_1']);
});
t('timeAgo en español', () => {
  assert.equal(api.timeAgo(new Date().toISOString()), 'ahora');
  assert.equal(api.timeAgo(new Date(Date.now() - 5 * 60000).toISOString()), 'hace 5 min');
  assert.equal(api.timeAgo(new Date(Date.now() - 3 * 3600000).toISOString()), 'hace 3 h');
  assert.equal(api.timeAgo(new Date(Date.now() - 2 * 86400000).toISOString()), 'hace 2 d');
});
t('categorías y reacciones consistentes con la base', () => {
  assert.deepEqual(api.CATEGORIES.map((c) => c.value).sort(), ['consultas', 'diseno-3d', 'electronica', 'impresion-3d', 'laser-cnc', 'otros', 'proyectos', 'taller']);
  assert.deepEqual(api.REACTIONS.map((r) => r.kind).sort(), ['clap', 'fire', 'idea', 'like', 'wow']);
});
t('isMissing detecta función/tabla ausente', () => {
  assert.equal(api.isMissing({ code: 'PGRST202' }), true);
  assert.equal(api.isMissing({ code: '42P01' }), true);
  assert.equal(api.isMissing({ code: '23505' }), false);
});
console.log(`\n${n} OK`);

t('motivos de reporte = los de la base', () => {
  assert.deepEqual(api.REPORT_REASONS.map((r) => r.value).sort(), ['copyright', 'inapropiado', 'ofensivo', 'otro', 'spam']);
});
console.log(`
${n} OK (total)`);

t('galería: formatos y utilidades', () => {
  assert.deepEqual(api.GALLERY_EXTS, ['stl', '3mf', 'obj', 'step', 'stp', 'dxf', 'svg']);
  assert.equal(api.formatMinutes(90), '1 h 30 min');
  assert.equal(api.formatMinutes(45), '45 min');
  assert.equal(api.formatMinutes(120), '2 h');
  assert.equal(api.formatBytes(2 * 1048576), '2.0 MB');
  assert.equal(api.formatBytes(10), '1 KB');
});
console.log(`\n${n} OK (total con galería)`);
