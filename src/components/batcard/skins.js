// Skins del mazo BATCARD: solo visual (no toca reglas ni ranking). Se cambian en plena partida.
import { useSyncExternalStore } from 'react';

export const SKINS = {
  clasico: { name: 'Clásico' },
  arcade: { name: 'Arcade', dir: 'arcade' },
  maker: { name: 'Maker', dir: 'maker' },
};

const SUIT_FILE = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds' };
const RANK_FILE = { 11: 'j', 12: 'q', 13: 'k', 14: 'a' };
const base = () => `${import.meta.env.BASE_URL}batcard/skins/`;

export const faceUrl = (card, skin) => {
  const s = SKINS[skin];
  if (!s?.dir || !SUIT_FILE[card.s] || card.r < 2 || card.r > 14) return null;
  return `${base()}${s.dir}/${SUIT_FILE[card.s]}-${RANK_FILE[card.r] || card.r}.webp`;
};
export const backUrl = (skin) => (SKINS[skin]?.dir ? `${base()}${SKINS[skin].dir}/dorso.webp` : null);

let cur = 'clasico';
const subs = new Set();
export function setSkin(id) {
  if (!SKINS[id] || id === cur) return;
  cur = id;
  subs.forEach((f) => f());
}
export const useSkin = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => cur, () => cur);

// Precarga las 53 imágenes para que el cambio no parpadee.
export function preloadSkin(id) {
  const s = SKINS[id];
  if (!s?.dir || typeof Image === 'undefined') return;
  const urls = [backUrl(id)];
  for (const k of Object.keys(SUIT_FILE)) for (let r = 2; r <= 14; r++) urls.push(faceUrl({ s: k, r }, id));
  urls.forEach((u) => { const im = new Image(); im.src = u; });
}
