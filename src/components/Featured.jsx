import { useEffect, useState } from 'react';
import * as api from '../lib/communityApi.js';
import { useAuth } from '../auth/AuthContext.jsx';

// Maker destacado de la semana: su isotipo y colores neón acompañan su nombre y foto en todo BATBOX.
// La base solo dice QUIÉN es (bb_featured_info); acá se cachea unos minutos para no consultar en cada tarjeta.
let cache = { info: undefined, at: 0 };
let pending = null;
const subs = new Set();

function load() {
  if (cache.info !== undefined && Date.now() - cache.at < 5 * 60 * 1000) return Promise.resolve(cache.info);
  if (!pending) {
    pending = api.featuredInfo().catch(() => null).then((i) => { cache = { info: i || null, at: Date.now() }; pending = null; subs.forEach((f) => f(cache.info)); return cache.info; });
  }
  return pending;
}

// { user_id, name } del destacado de la semana, o null.
export function useFeatured() {
  const [info, setInfo] = useState(cache.info ?? null);
  useEffect(() => {
    let on = true;
    const f = (i) => on && setInfo(i);
    subs.add(f);
    load().then(f);
    return () => { on = false; subs.delete(f); };
  }, []);
  return info;
}

export const useFeaturedUid = () => useFeatured()?.user_id || null;

// ¿Este apodo/nombre es el del destacado? (para rankings que solo conocen el apodo)
export function useIsFeaturedName(name) {
  const n = useFeatured()?.name;
  return !!(n && name && n.trim().toLowerCase() === String(name).trim().toLowerCase());
}

export function FeatIso({ size = 24 }) {
  const src = `${import.meta.env.BASE_URL}badges/maker-semana-iso.png`;
  return <img className="feat-iso" src={src} alt="Maker destacado de la semana" title="Maker destacado de la semana" height={size} width={size} style={{ height: size, width: size }} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
}

// Nombre con colores neón en ciclo si la persona es la destacada.
export function Nm({ uid, children, className = '' }) {
  const f = useFeaturedUid();
  return <span className={className + (uid && f === uid ? ' feat-name' : '')}>{children}</span>;
}

// Para rankings: isotipo + nombre en neón cuando el apodo coincide con el destacado.
export function FeatByName({ name, children, size = 20 }) {
  const is = useIsFeaturedName(name);
  return is ? <><FeatIso size={size} /><span className="feat-name">{children}</span></> : children;
}

// "Yo": si la persona que mira ES la destacada de la semana, su nombre lleva el isotipo y el neón (saludos, cuenta, etc.).
export function Me({ children, size = 30 }) {
  const { user } = useAuth();
  const f = useFeaturedUid();
  return user && f === user.id ? <span className="feat-me"><FeatIso size={size} /><span className="feat-name">{children}</span></span> : children;
}

// Cartelito para la página de cuenta: solo lo ve el destacado.
export function MeBanner() {
  const { user } = useAuth();
  const f = useFeaturedUid();
  if (!user || f !== user.id) return null;
  return <div className="feat-banner"><FeatIso size={34} /><span>¡Sos el <b>Maker destacado de la semana</b>! Tu insignia se suma a tu perfil cuando elijan a otra persona.</span></div>;
}
