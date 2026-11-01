// Secciones principales. Para sumar una sección nueva: agregarla acá y
// registrar su página en App.jsx.
export const NAV = [
  { to: '/', key: '', label: 'Inicio', short: 'Inicio', icon: 'home' },
  { to: '/tools', key: 'tools', label: 'Herramientas', short: 'Herramientas', icon: 'wrench' },
  { to: '/juego', key: 'juego', label: '3DBAT Maker Tycoon', short: 'Maker Tycoon', icon: 'gamepad' },
  { to: '/academy', key: 'academy', label: 'Tutoriales', short: 'Tutoriales', icon: 'graduation' },
  { to: '/wiki', key: 'wiki', label: 'WikiBAT', short: 'WikiBAT', icon: 'book' },
  { to: '/library', key: 'library', label: 'Recursos', short: 'Recursos', icon: 'library' },
  { to: '/community', key: 'community', label: 'Comunidad', short: 'Comunidad', icon: 'users' },
  // Módulos de comunidad (sub: true): no van en la barra principal; se listan dentro de #/community.
  // Se muestran solo a miembros y si el flag de bb_settings está activo.
  { to: '/galeria', key: 'galeria', label: 'Galería Maker', short: 'Galería', icon: 'image', flag: 'batgallery' },
  { to: '/batforum', key: 'batforum', label: 'BATFORUM', short: 'BATFORUM', icon: 'message', flag: 'batforum', sub: true, blurb: 'Preguntas y respuestas entre makers.' },
  { to: '/mapa', key: 'mapa', label: 'Mapa Maker', short: 'Mapa Maker', icon: 'pin', flag: 'batmap', sub: true, blurb: 'Encontrá makers de tu ciudad (voluntario, solo ciudad).' },
  { to: '/club', key: 'club', label: 'Makers Club', short: 'Makers Club', icon: 'crown' },
];

// Barra inferior en celulares: 4 accesos + "Más".
export const MOBILE_MAIN = ['', 'tools', 'academy', 'club'];
