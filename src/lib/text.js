// Normaliza para buscar sin importar mayúsculas ni tildes ("calibración" = "calibracion").
export function norm(s = '') {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function matches(item, q) {
  const needle = norm(q.trim());
  if (!needle) return true;
  const hay = norm([item.title, item.name, item.description, item.category, item.platformLabel].filter(Boolean).join(' '));
  return needle.split(/\s+/).every((w) => hay.includes(w));
}

export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}
