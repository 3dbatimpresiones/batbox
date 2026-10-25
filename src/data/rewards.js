// Premios virtuales del juego online. Son SOLO estéticos: ninguno da plata,
// velocidad ni puntos. Los gana cada jugador en la base (bb_mt_unlocks) y acá
// se describe cómo se ven. La misma lista está en el juego: maker-tycoon/src/online/rewards.js.

export const REWARD_KINDS = {
  title: 'Títulos',
  frame: 'Marcos de perfil',
  decor: 'Decoración del taller',
  skin: 'Bases para tus máquinas',
  effect: 'Efectos de producción',
  banner: 'Banners de granja',
  plan: 'Planos exclusivos',
};

export const REWARDS = {
  // Títulos
  t_pionero: { kind: 'title', name: 'Pionero · Temporada 1', how: 'Jugar online en la primera temporada.' },
  t_fundador: { kind: 'title', name: 'Fundador de granja', how: 'Crear una Granja Maker.' },
  t_rey_petg: { kind: 'title', name: 'Rey del PETG', how: 'Reto técnico: 500 piezas en PETG.' },
  t_spaghetti: { kind: 'title', name: 'Domador de Spaghetti', how: 'Reto técnico: resolver 25 fallas.' },
  t_tpu: { kind: 'title', name: 'Domador del TPU', how: 'Reto técnico: 30 piezas en TPU.' },
  t_capitan: { kind: 'title', name: 'Capitán de Granja', how: 'Reto de granja: 40 pedidos urgentes.' },
  t_facturador: { kind: 'title', name: 'Facturador serial', how: 'Reto semanal de facturación.' },
  t_maker_semana: { kind: 'title', name: 'Maker de la semana', how: 'Lo entrega el equipo 3DBAT.' },
  t_corazon: { kind: 'title', name: 'Corazón de la comunidad', how: 'Lo entrega el equipo 3DBAT.' },
  t_puntual: { kind: 'title', name: 'Siempre a tiempo', how: 'Retos de pedidos.' },
  t_liga_plata: { kind: 'title', name: 'Liga Plata', how: 'Ascender a Plata en la Liga Maker.' },
  t_liga_oro: { kind: 'title', name: 'Liga Oro', how: 'Ascender a Oro en la Liga Maker.' },
  t_liga_platino: { kind: 'title', name: 'Liga Platino', how: 'Ascender a Platino en la Liga Maker.' },
  t_liga_diamante: { kind: 'title', name: 'Liga Diamante', how: 'Ascender a Diamante en la Liga Maker.' },
  t_liga_leyenda: { kind: 'title', name: 'Leyenda Maker', how: 'Ascender a Leyenda Maker en la Liga.' },
  t_liga_top100: { kind: 'title', name: 'Top 100 3DBAT', how: 'Llegar a la división más alta de la Liga.' },
  t_duelista: { kind: 'title', name: 'Duelista', how: 'Ganar 10 Duelos Maker.' },
  t_guerra: { kind: 'title', name: 'Campeón de guerra de granjas', how: 'Ganar una guerra amistosa de granjas.' },
  t_bati_live: { kind: 'title', name: 'Estuve en BATI LIVE', how: 'Aportar a una meta cumplida de BATI LIVE.' },
  // Marcos
  f_cian: { kind: 'frame', name: 'Neón cian', how: 'Retos y eventos.', css: 'fr-cian' },
  f_rosa: { kind: 'frame', name: 'Neón rosa', how: 'Retos y eventos.', css: 'fr-rosa' },
  f_comunidad: { kind: 'frame', name: 'Marco de la comunidad', how: 'Aportar a un reto de comunidad cumplido.', css: 'fr-comunidad' },
  f_oro: { kind: 'frame', name: 'Marco dorado', how: 'Podio de una temporada.', css: 'fr-oro' },
  f_carbono: { kind: 'frame', name: 'Fibra de carbono', how: 'Retos y eventos.', css: 'fr-carbono' },
  f_liga_platino: { kind: 'frame', name: 'Marco Platino', how: 'Llegar a Platino en la Liga Maker.', css: 'fr-platino' },
  f_liga_diamante: { kind: 'frame', name: 'Marco Diamante', how: 'Llegar a Diamante en la Liga Maker.', css: 'fr-diamante' },
  // Decoración del taller (aparece en el 3D)
  d_cartel3dbat: { kind: 'decor', name: 'Cartel neón 3DBAT', how: 'Regalo por crear tu perfil online.' },
  d_planta: { kind: 'decor', name: 'Planta del taller', how: 'Retos y eventos.' },
  d_trofeo: { kind: 'decor', name: 'Trofeo de temporada', how: 'Top 10 de una temporada.' },
  d_bandera: { kind: 'decor', name: 'Bandera argentina', how: 'Eventos especiales.' },
  d_bati: { kind: 'decor', name: 'Figura de BATI', how: 'Eventos especiales.' },
  // Bases debajo de cada máquina (las máquinas mantienen sus colores reales)
  s_negro: { kind: 'skin', name: 'Base de goma antivibración', how: 'Retos y eventos.', color: '#16181d' },
  s_blanco: { kind: 'skin', name: 'Base blanca premium', how: 'Retos y eventos.', color: '#e9ebf0' },
  s_rosa: { kind: 'skin', name: 'Base neón rosa 3DBAT', how: 'Retos y eventos.', color: '#F78EB6' },
  s_cian: { kind: 'skin', name: 'Base neón cian 3DBAT', how: 'Retos y eventos.', color: '#5DDADB' },
  // Efectos
  e_confeti: { kind: 'effect', name: 'Confeti en las ventas', how: 'Retos y eventos.' },
  e_chispas: { kind: 'effect', name: 'Chispas neón', how: 'Retos y eventos.' },
  // Banners de granja
  b_circuito: { kind: 'banner', name: 'Banner Circuito', how: 'Reto de granja semanal.', css: 'bn-circuito' },
  b_galaxia: { kind: 'banner', name: 'Banner Galaxia', how: 'Eventos de granja.', css: 'bn-galaxia' },
  b_fuego: { kind: 'banner', name: 'Banner Fuego', how: 'Eventos de granja.', css: 'bn-fuego' },
  b_campeones: { kind: 'banner', name: 'Banner Campeones', how: 'Ganar una guerra amistosa de granjas.', css: 'bn-campeones' },
  // Planos (productos que se ven distinto, pagan IGUAL que su versión común)
  p_bati: { kind: 'plan', name: 'Plano: Llavero BATI', how: 'Eventos especiales.' },
};

export const rewardName = (id) => REWARDS[id]?.name || id;
export const titleName = (id) => (id && REWARDS[id]?.kind === 'title' ? REWARDS[id].name : null);
export const frameClass = (id) => (id && REWARDS[id]?.css) || '';

// Emblemas y colores de las granjas.
export const EMBLEMS = {
  nozzle: { name: 'Boquilla', path: 'M8 3h8v5l-2 3h-4L8 8zM10 11h4l-2 4zM12 15v6' },
  spool: { name: 'Bobina', path: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM12 3v6M12 15v6' },
  bat: { name: 'Murciélago', path: 'M2 9c3 0 4 3 6 3 0-2 1-4 4-5 3 1 4 3 4 5 2 0 3-3 6-3-1 5-4 9-10 10C6 18 3 14 2 9z' },
  gear: { name: 'Engranaje', path: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1' },
  bolt: { name: 'Rayo', path: 'M13 2 3 14h9l-1 8 10-12h-9z' },
  rocket: { name: 'Cohete', path: 'M12 2c4 3 5 8 4 13H8C7 10 8 5 12 2zM8 15l-3 4 4-1M16 15l3 4-4-1M12 8a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3z' },
  cube: { name: 'Cubo', path: 'M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10' },
  star: { name: 'Estrella', path: 'm12 2 3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z' },
  flame: { name: 'Llama', path: 'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z' },
  mate: { name: 'Mate', path: 'M7 8h10l-1 11a3 3 0 0 1-3 2h-2a3 3 0 0 1-3-2zM12 8V3l4-1M6 8h12' },
};
export const FARM_COLORS = ['#5DDADB', '#F78EB6', '#8b8ff0', '#34D399', '#FBBF24', '#EF4444', '#f2f2f2', '#F39237'];

// Nivel de granja según su experiencia (los puntos que fue sumando su gente).
const LEVELS = [0, 300, 1000, 2500, 5000, 9000, 15000, 25000, 40000, 60000, 90000];
export function farmLevel(xp = 0) {
  let lvl = 1;
  while (lvl < LEVELS.length && xp >= LEVELS[lvl]) lvl++;
  const cur = LEVELS[lvl - 1];
  const next = LEVELS[lvl] ?? null;
  return { level: lvl, cur, next, frac: next ? (xp - cur) / (next - cur) : 1 };
}
// Sectores de la nave de producción que se encienden con el nivel de la granja.
export const FARM_SECTORS = [
  { level: 1, name: 'Línea FDM', icon: '🖨️' },
  { level: 2, name: 'Packing', icon: '📦' },
  { level: 3, name: 'Depósito de bobinas', icon: '🧵' },
  { level: 4, name: 'Sala de resina', icon: '💧' },
  { level: 5, name: 'Corte láser', icon: '🔆' },
  { level: 6, name: 'Taller CNC', icon: '⚙️' },
  { level: 7, name: 'Control de calidad', icon: '🔍' },
  { level: 8, name: 'Showroom', icon: '🏆' },
];

// Cómo se lee cada métrica de los retos.
export function metricLabel(metric) {
  if (!metric) return '';
  if (metric.startsWith('product:')) return 'piezas';
  if (metric.startsWith('material:')) return `piezas en ${metric.slice(9) === 'PACF' ? 'PA-CF' : metric.slice(9)}`;
  return { orders: 'pedidos', urgent: 'pedidos urgentes', pieces: 'piezas', events: 'fallas resueltas', xl: 'piezas grandes',
    contracts: 'contratos', daily: 'desafíos diarios', earned: 'facturado', points: 'Puntos Maker' }[metric] || metric;
}
