// Secciones principales. Para sumar una sección nueva: agregarla acá y
// registrar su página en App.jsx.
export const NAV = [
  { to: '/', key: '', label: 'Inicio', short: 'Inicio', icon: 'home' },
  { to: '/tools', key: 'tools', label: 'BAT Tools', short: 'Tools', icon: 'wrench' },
  { to: '/academy', key: 'academy', label: 'BAT Academy', short: 'Academy', icon: 'graduation' },
  { to: '/media', key: 'media', label: 'BAT Media', short: 'Media', icon: 'video' },
  { to: '/library', key: 'library', label: 'BAT Library', short: 'Library', icon: 'library' },
  { to: '/community', key: 'community', label: 'BAT Community', short: 'Comunidad', icon: 'users' },
  { to: '/club', key: 'club', label: 'Makers Club', short: 'Makers Club', icon: 'crown' },
];

// Barra inferior en celulares: 4 accesos + "Más".
export const MOBILE_MAIN = ['', 'tools', 'academy', 'club'];
