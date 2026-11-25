// =====================================================================
// DATOS PÚBLICOS DE LA MARCA
// Todo lo que está acá va al navegador: nada de claves ni contraseñas.
// La web es la portada; el contenido (comunidad, herramientas, tutoriales,
// Makers Club) vive en BATBOX, publicado en este mismo dominio en /batbox/.
// =====================================================================

export const SITE = {
  name: '3DBAT IMPRESIONES',
  tagline: 'Impresión 3D desde la experiencia real',
};

// Ruta relativa: BATBOX se publica junto con esta web (npm run build:full).
// Se abre en la misma pestaña. BATBOX usa rutas con # (#/tools, #/club…).
const BATBOX = '';   // dentro de BATBOX: rutas con # directas

export const LINKS = {
  batbox: BATBOX,
  batboxTools: `${BATBOX}#/tools`,
  batboxAcademy: `${BATBOX}#/academy`,
  batboxCommunity: `${BATBOX}#/community`,
  batboxClub: `${BATBOX}#/club`,
};

export const DISCORD_INVITE = 'uvQQPuvJgd';

// Grupos de la comunidad y redes (pie de página).
export const CHANNELS = [
  { id: 'discord', label: 'Discord', icon: 'discord', url: `https://discord.gg/${DISCORD_INVITE}` },
  { id: 'whatsapp', label: 'Comunidad de WhatsApp', icon: 'messageCircle', url: 'https://chat.whatsapp.com/HWcG4nZh8JC15cTjpVim69' },
  { id: 'youtube', label: 'YouTube', icon: 'youtube', url: 'https://www.youtube.com/@3dbat.impresiones' },
  { id: 'instagram', label: 'Instagram', icon: 'instagram', url: 'https://www.instagram.com/3dbat.impresiones' },
  { id: 'tiktok', label: 'TikTok', icon: 'music', url: 'https://www.tiktok.com/@3dbat.impresiones' },
];

// Menú: accesos directos a las secciones de BATBOX + "Sobre mí" (en esta misma página).
export const NAV = [
  { id: 'tools', label: 'Herramientas', href: LINKS.batboxTools },
  { id: 'academy', label: 'Tutoriales', href: LINKS.batboxAcademy },
  { id: 'community', label: 'Comunidad', href: LINKS.batboxCommunity },
  { id: 'club', label: 'Makers Club', href: LINKS.batboxClub },
  { id: 'about', label: 'Sobre mí', href: '#sobre-mi' },
];
