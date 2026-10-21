// Secciones principales. Para sumar una sección nueva: agregarla acá y
// registrar su página en App.jsx.
export const NAV = [
  { to: '/', key: '', label: 'Inicio', short: 'Inicio', icon: 'home' },
  { to: '/tools', key: 'tools', label: 'Herramientas', short: 'Herramientas', icon: 'wrench' },
  { to: '/academy', key: 'academy', label: 'Tutoriales', short: 'Tutoriales', icon: 'graduation' },
  { to: '/media', key: 'media', label: 'Multimedia', short: 'Multimedia', icon: 'video' },
  { to: '/library', key: 'library', label: 'Recursos', short: 'Recursos', icon: 'library' },
  { to: '/community', key: 'community', label: 'Comunidad', short: 'Comunidad', icon: 'users' },
  { to: '/club', key: 'club', label: 'Makers Club', short: 'Makers Club', icon: 'crown' },
];

// Barra inferior en celulares: 4 accesos + "Más".
export const MOBILE_MAIN = ['', 'tools', 'academy', 'club'];
