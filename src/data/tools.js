import { LINKS } from '../config.js';

// Herramientas REALES (no son datos de ejemplo).
// status: 'available' | 'soon'   ·   access: 'free' | 'club'
// TODO(Etapa 5): pasan a la tabla de contenidos de Supabase y se ordenan desde el panel admin.
export const TOOLS = [
  {
    id: 'cotizador-free',
    name: 'Cotizador 3DBAT FREE',
    description: 'La versión gratuita del Cotizador 3DBAT 2.0: calculá el costo y el precio de tus impresiones sin pagar nada y conocé la herramienta.',
    icon: 'calculator',
    category: 'Cotización',
    status: 'available',
    access: 'free',
    url: LINKS.cotizadorFree,
    featured: true,
  },
  {
    id: 'cotizador-pro',
    name: 'Cotizador 3DBAT PRO 2.0',
    description: 'Calculá costos, precio de venta y ganancia de cada impresión. Pedidos, presupuestos en PDF, G-code y resina.',
    icon: 'calculator',
    category: 'Cotización',
    status: 'available',
    access: 'club',
    url: LINKS.cotizadorPro,
    featured: true,
  },
  {
    id: 'peso-de-carretes-vacios',
    name: 'Peso de Carretes Vacíos',
    description: 'Base de datos comunitaria de bobinas vacías: buscá tu marca y calculá cuánto filamento te queda.',
    icon: 'box',
    category: 'Filamento',
    status: 'available',
    access: 'free',
    url: LINKS.carretesVacios,
    featured: true,
  },
  {
    id: 'huecos-pines',
    name: 'Creador de Huecos para Pines',
    description: 'Cargá tu STL o 3MF y restale el hueco del prendedor de 20 mm en segundos, sin abrir un CAD.',
    icon: 'pin',
    category: 'Modelado',
    status: 'soon',
    access: 'free',
    url: null,
    featured: true,
  },
];

export const TOOL_STATUS = {
  available: { label: 'Disponible', cls: 'ok' },
  soon: { label: 'Próximamente', cls: 'muted' },
};
