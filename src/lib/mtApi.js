import { useCallback, useEffect, useRef, useState } from 'react';
import { sb } from './supabase.js';

// =====================================================================
// 3DBAT Maker Tycoon dentro de BATBOX (migración 026).
// Todo lo público (ranking, retos, presencia) se lee con funciones de la base;
// si la migración todavía no está, las secciones se muestran como "muy pronto".
// =====================================================================

export const GAME_URL = import.meta.env.BASE_URL + 'juego/';
export const isMissing = (e) => !!e && (e.code === 'PGRST202' || e.code === '42883' || /Could not find the function/i.test(e.message || ''));

export async function mt(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) { const err = new Error(error.message); err.code = error.code; err.missing = isMissing(error); throw err; }
  return data;
}

// Identificador al azar del navegador para contar "en línea" (el mismo que usa el juego).
function clientId() {
  const KEY = 'bb_live_id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
    return id;
  } catch { return null; }
}

// Presencia de BATBOX (todos, con o sin cuenta) + contador público, compartido por toda la app.
let liveState = null;
const listeners = new Set();
let started = false;
let stopped = false;
function startLive() {
  if (started) return;
  started = true;
  const cid = clientId();
  const ping = () => {
    if (stopped || !cid || document.visibilityState !== 'visible') return;
    sb.rpc('bb_live_ping', { p_client: cid, p_app: 'batbox' }).then(({ error }) => { if (isMissing(error)) stopped = true; });
  };
  const counts = () => {
    if (stopped || document.visibilityState !== 'visible') return;
    sb.rpc('bb_live_counts').then(({ data, error }) => {
      if (isMissing(error)) { stopped = true; return; }
      if (data) { liveState = data; listeners.forEach((f) => f(data)); }
    });
  };
  ping(); setTimeout(counts, 1200);
  setInterval(ping, 45000);
  setInterval(counts, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { ping(); counts(); } });
}
export function useLive() {
  const [live, setLive] = useState(liveState);
  useEffect(() => {
    startLive();
    listeners.add(setLive);
    return () => listeners.delete(setLive);
  }, []);
  return live;
}

// Llamada con estado de carga, error y "no disponible todavía".
export function useMt(fn, args, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null, missing: false });
  const argsRef = useRef(args);
  argsRef.current = args;
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return mt(fn, argsRef.current)
      .then((data) => setState({ loading: false, data, error: null, missing: false }))
      .catch((e) => setState({ loading: false, data: null, error: e.message, missing: e.missing }));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}
