// FILACOLOR · Proveedor oficial de la Comunidad Makers 3DBAT.
// Datos tomados de filacolor.com.ar (octubre 2026). A propósito NO hay precios,
// stock ni descuentos: cambian todo el tiempo y no queremos prometer nada viejo.
// Los destacados se pueden cambiar desde el panel de BATBOX (bb_settings 'filacolor').
// La misma información está en el juego: maker-tycoon/src/online/filacolor.js (mantener iguales).

const BASE = 'https://filacolor.com.ar';
const UTM = 'utm_source=3dbat&utm_medium=maker-tycoon&utm_campaign=proveedor-oficial';
export const fcUrl = (path = '/', medium = 'batbox') =>
  `${BASE}${path}${path.includes('?') ? '&' : '?'}${UTM.replace('maker-tycoon', medium)}`;

export const FILACOLOR = {
  name: 'Filacolor',
  role: 'Proveedor oficial de la Comunidad Makers 3DBAT',
  tagline: 'Filamentos 3D, impresoras, repuestos y servicio técnico.',
  about: 'Arrancó en la pandemia con una sola impresora 3D (como todos), creció como MROM3D y en julio de 2023 nació Filacolor: filamentos, impresoras, repuestos y asesoramiento para makers y emprendedores.',
  address: 'Av. de los Incas 4370, Parque Chas, CABA',
  hours: 'Lunes a viernes de 10 a 18 h · sábados de 10 a 14 h',
  shipping: 'Envíos a todo el país',
  phone: '+54 11 2390-2993',
  whatsapp: 'https://wa.me/5491123902993',
  instagram: 'https://www.instagram.com/filacolor/',
  links: {
    home: '/',
    filamentos: '/categoria-producto/filamentos/',
    impresoras: '/categoria-producto/impresoras/',
    repuestos: '/categoria-producto/repuestos/',
    servicio: '/servicio-tecnico/',
    contacto: '/contacto/',
  },
  services: [
    'Diagnóstico de fallas',
    'Cambio de hotend, nozzle y extrusor',
    'Atascos y problemas de extrusión',
    'Nivelación y calibración',
    'Limpieza y mantenimiento general',
    'Repuestos originales y compatibles',
  ],
  brands: ['Bambu Lab', 'Creality', 'Elegoo', 'Flashforge', 'Snapmaker', 'Grilon3', '3N3', '3NMAX', 'GST3D', 'R3D'],
  // Comparador de materiales (como el de su web). Puntajes de 1 a 5.
  materials: [
    { id: 'PLA', desc: 'Fácil de imprimir, excelente acabado y bajo olor.', nozzle: '190–220 °C', bed: '45–60 °C', enclosure: 'No',
      score: { facilidad: 5, golpes: 3, calor: 2, flexibilidad: 1, exterior: 2, acabado: 5 },
      ideal: 'Decoración, prototipos, juguetes y piezas de uso interior.', note: 'Puede deformarse con temperaturas elevadas.',
      path: '/categoria-producto/filamentos/cat-pla/', color: '#5DDADB' },
    { id: 'PETG', desc: 'Resistente, durable y adecuado para piezas funcionales.', nozzle: '220–250 °C', bed: '70–90 °C', enclosure: 'No obligatorio',
      score: { facilidad: 4, golpes: 4, calor: 3, flexibilidad: 2, exterior: 4, acabado: 4 },
      ideal: 'Piezas funcionales, soportes, recipientes y uso cotidiano.', note: 'Puede generar hilos si no está bien calibrada la retracción.',
      path: '/categoria-producto/filamentos/basicos/petg/', color: '#7c83ff' },
    { id: 'ABS', desc: 'Alta resistencia térmica y mecánica.', nozzle: '230–260 °C', bed: '90–110 °C', enclosure: 'Recomendado',
      score: { facilidad: 2, golpes: 4, calor: 5, flexibilidad: 2, exterior: 3, acabado: 3 },
      ideal: 'Carcasas, repuestos, piezas técnicas y automoción.', note: 'Requiere buena ventilación y control de corrientes de aire.',
      path: '/categoria-producto/filamentos/basicos/abs/', color: '#f2f2f2' },
    { id: 'ASA', desc: 'Similar al ABS, pero con mejor resistencia al exterior.', nozzle: '240–270 °C', bed: '90–110 °C', enclosure: 'Recomendado',
      score: { facilidad: 2, golpes: 4, calor: 5, flexibilidad: 2, exterior: 5, acabado: 4 },
      ideal: 'Piezas exteriores, cartelería, soportes y repuestos.', note: 'Conviene imprimirlo en una máquina cerrada y ventilada.',
      path: '/categoria-producto/filamentos/', color: '#e8e3d5' },
    { id: 'TPU', desc: 'Flexible, elástico y resistente a impactos.', nozzle: '210–240 °C', bed: '40–60 °C', enclosure: 'No',
      score: { facilidad: 3, golpes: 5, calor: 3, flexibilidad: 5, exterior: 4, acabado: 3 },
      ideal: 'Protectores, juntas, ruedas, fundas y piezas flexibles.', note: 'Debe imprimirse lentamente y con el filamento seco.',
      path: '/categoria-producto/tpu/', color: '#F78EB6' },
    { id: 'PLA-CF', desc: 'PLA reforzado con fibra de carbono, rígido y de acabado mate.', nozzle: '200–230 °C', bed: '45–60 °C', enclosure: 'No',
      score: { facilidad: 4, golpes: 3, calor: 3, flexibilidad: 1, exterior: 3, acabado: 5 },
      ideal: 'Piezas rígidas, técnicas, decorativas y de aspecto profesional.', note: 'Se recomienda utilizar una boquilla endurecida.',
      path: '/categoria-producto/filamentos/cat-pla/pla-cf/', color: '#3a3d45' },
  ],
  // Máquinas del juego que Filacolor tiene en su catálogo (página del producto).
  machines: {
    ender3: '/producto/creality-ender-3-v3-se/',
    a1mini: '/producto/bambulab-a1-mini-combo/',
    a1: '/producto/bambu-lab-a1/',
    k1c: '/producto/creality-k1c/',
    u1: '/producto/snapmaker-u1/',
  },
  // Materiales del juego → categoría en Filacolor.
  gameMaterials: {
    PLA: '/categoria-producto/filamentos/cat-pla/',
    PETG: '/categoria-producto/filamentos/basicos/petg/',
    TPU: '/categoria-producto/tpu/',
    ASA: '/categoria-producto/filamentos/basicos/abs/',
    PACF: '/categoria-producto/filamentos/tecnicos/',
  },
  // Destacados por defecto (el panel de BATBOX los puede reemplazar).
  highlights: [
    { title: 'Snapmaker U1', text: 'Impresora multicolor con cambio de cabezal. Consultá disponibilidad.', path: '/producto/snapmaker-u1/' },
    { title: 'Nueva línea 3N3 Silk', text: 'Brillo y terminación premium: malaquita, cobre, rojo, papaya, plata y aluminio.', path: '/producto/3n3-silk/' },
    { title: 'Servicio técnico', text: 'Diagnóstico, reparación y puesta a punto de tu impresora. Turnos por WhatsApp.', path: '/servicio-tecnico/' },
  ],
};

export const SCORE_LABELS = { facilidad: 'Facilidad', golpes: 'Golpes', calor: 'Calor', flexibilidad: 'Flexibilidad', exterior: 'Exterior', acabado: 'Acabado' };
