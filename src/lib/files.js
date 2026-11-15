// Enlaces de DESCARGA en las herramientas: si el enlace termina en un archivo (por ejemplo el instalador de una
// GitHub Release), la tarjeta dice «Descargar instalador» / «Descargar» en vez de «Abrir herramienta».
const INSTALLER_EXTS = ['exe', 'msi'];
const FILE_EXTS = ['zip', '7z', 'rar', 'pdf', 'dmg', 'pkg', 'apk', '3mf', 'stl'];

// 'installer' (.exe / .msi) · 'file' (ZIP, PDF, 3MF…) · null (una página o sección común).
export function downloadKind(url) {
  let path = '';
  try { path = new URL(String(url ?? '')).pathname; } catch { return null; }
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (INSTALLER_EXTS.includes(ext)) return 'installer';
  if (FILE_EXTS.includes(ext)) return 'file';
  return null;
}

// Nombre del archivo del enlace (se muestra al pasar el mouse por el botón).
export function fileNameFromUrl(url) {
  try {
    const u = new URL(String(url));
    return decodeURIComponent(u.pathname.split('/').pop() || '');
  } catch {
    return '';
  }
}
