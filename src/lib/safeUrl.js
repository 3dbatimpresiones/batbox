// =====================================================================
// Enlaces seguros: todo enlace que viene de la base (herramientas, recursos,
// videos, redes) pasa por acá antes de ponerse en un href.
// Solo se aceptan https://, http:// y secciones internas de BATBOX (#/…).
// Cualquier otra cosa (javascript:, data:, etc.) se descarta: así un enlace
// mal cargado nunca puede ejecutar código en BATBOX.
// =====================================================================
export function safeUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  if (/^#\/[\w\-/?=&.%]*$/.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}
