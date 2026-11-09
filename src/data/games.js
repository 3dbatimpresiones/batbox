// Juegos de BATBOX. Para sumar uno: agregarlo acá (portada en src/assets) y, si tiene
// secciones propias, registrar sus pestañas en src/pages/Juego.jsx (GAME_TABS).
import tycoonImg from '../assets/tycoon-portada.webp';
import batcardImg from '../assets/batcard-portada.webp';
import { GAME_URL } from '../lib/mtApi.js';

export const GAMES = [
  {
    id: 'tycoon',
    name: '3DBAT Maker Tycoon',
    tag: 'Simulador idle',
    img: tycoonImg,
    imgAlt: 'Portada de 3DBAT Maker Tycoon: taller pixel art lleno de impresoras 3D',
    desc: 'Arrancá con una impresora en el escritorio y llegá a tu propia planta de producción. Granjas con otros makers, retos de la comunidad y ranking.',
    href: GAME_URL,
    live: true,
  },
  {
    id: 'batcard',
    name: 'BATCARD',
    tag: 'Roguelike de cartas · Nuevo',
    img: batcardImg,
    imgAlt: 'Portada de BATCARD: la A del título es un alicate de corte al ras',
    desc: 'Cada partida es una orden de producción: armá manos de póker, sumá Mods de taller, controlá el Calor y pasá los controles de calidad.',
    href: '#/batcard',
    isNew: true,
  },
];
