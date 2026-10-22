// =====================================================================
// DATOS DE EJEMPLO — Etapa 2
// Todo lo de este archivo es contenido de muestra para ver el diseño.
// Cada ítem tiene sample: true y se muestra con la etiqueta "EJEMPLO".
// En la Etapa 4 esto se reemplaza por contenido real desde Supabase,
// donde lo exclusivo queda protegido por RLS (acá NO está protegido).
// =====================================================================

// kind: 'resource' | 'news'   (los tutoriales reales están en tutorials.js)
// access: 'free' | 'club'

export const LIBRARY_CATEGORIES = ['Modelos', 'Software', 'Aprendizaje', 'Proveedores', 'Utilidades'];
export const MEDIA_PLATFORMS = {
  youtube: { label: 'YouTube', icon: 'youtube' },
  short: { label: 'Shorts', icon: 'youtube' },
  instagram: { label: 'Reel', icon: 'instagram' },
  other: { label: 'Otro', icon: 'link' },
};

const R = (o) => ({ kind: 'resource', sample: true, url: null, ...o });
const N = (o) => ({ kind: 'news', sample: true, url: null, ...o });

export const SAMPLE_ITEMS = [
  // ---- RECURSOS (#/library) ----
  R({ id: 'res-printables', title: 'Printables', description: 'Biblioteca enorme de modelos gratuitos con buena moderación.', category: 'Modelos', access: 'free', url: 'https://www.printables.com/', featured: true }),
  R({ id: 'res-makerworld', title: 'MakerWorld', description: 'Modelos listos para imprimir, muchos con perfiles incluidos.', category: 'Modelos', access: 'free', url: 'https://makerworld.com/', featured: true }),
  R({ id: 'res-orca', title: 'Orca Slicer', description: 'Slicer libre con herramientas de calibración integradas.', category: 'Software', access: 'free', url: 'https://github.com/SoftFever/OrcaSlicer', featured: true }),
  R({ id: 'res-tinkercad', title: 'Tinkercad', description: 'Modelado 3D simple desde el navegador, ideal para empezar.', category: 'Aprendizaje', access: 'free', url: 'https://www.tinkercad.com/' }),
  R({ id: 'res-perfiles-club', title: 'Perfiles de impresión 3DBAT', description: 'Los perfiles que usamos en el taller para PLA, PETG y TPU.', category: 'Utilidades', access: 'club', featured: true }),
  R({ id: 'res-proveedores-club', title: 'Lista de proveedores recomendados', description: 'Filamentos, repuestos y resinas que probamos y recomendamos.', category: 'Proveedores', access: 'club' }),

  // ---- NOVEDADES ----
  N({ id: 'news-batbox', title: 'Nace BATBOX', description: 'Todas las herramientas, tutoriales y recursos de 3DBAT en un solo lugar.', category: 'Novedades', access: 'free', date: '2026-10-21' }),
  N({ id: 'news-cotizador', title: 'Cotizador PRO: G-code multi-extrusor', description: 'Ahora suma bien el peso de impresiones con varios extrusores o AMS.', category: 'Herramientas', access: 'free', date: '2026-10-20' }),
  N({ id: 'news-pines', title: 'Se viene el Creador de Huecos para Pines', description: 'Una herramienta gratuita para agregar el hueco del prendedor a tus modelos.', category: 'Herramientas', access: 'free', date: '2026-10-18' }),
  N({ id: 'news-club-vivo', title: 'Próximo vivo exclusivo de Makers Club', description: 'Revisión de perfiles y preguntas en vivo para miembros.', category: 'Makers Club', access: 'club', date: '2026-10-17' }),
];

// Beneficios de Makers Club (página Comunidad). Texto provisorio para revisar.

export const CLUB_BENEFITS = [
  { icon: 'calculator', title: 'Cotizador 3DBAT PRO 2.0', text: 'Cotizá con todos tus costos (material, luz, máquina, mano de obra) y armá presupuestos con márgenes para revendedores.' },
  { icon: 'clipboard', title: 'Control de Pedidos', text: 'Tus pedidos, clientes, señas, entregas y ganancias del mes, todo en un solo lugar.' },
  { icon: 'sparkles', title: 'Creador de Llaveros Múltiples Nombres', text: 'Muchos nombres de una vez, tu propia tipografía y las camas listas en 3MF o STL para tu slicer.' },
  { icon: 'graduation', title: 'Tutoriales exclusivos', text: 'Contenido avanzado que no se publica en redes.' },
  { icon: 'library', title: 'Recursos especiales', text: 'Perfiles, archivos y listas que usamos en el taller.' },
  { icon: 'star', title: 'Novedades primero', text: 'Herramientas nuevas y lanzamientos antes que nadie.' },
]

