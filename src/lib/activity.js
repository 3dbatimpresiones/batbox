import { useEffect, useRef } from 'react';
import { sb } from './supabase.js';

// Registro de uso para el ranking del panel admin (migración 004).
// Cada minuto, si la pestaña está visible y la persona la usó en los
// últimos 2 minutos, se avisa a Supabase con bb_ping. La base cuenta como
// máximo 1 minuto por minuto real y solo registra a miembros aprobados.
// No se envía nada más que la app y la sección.

const EVERY = 60 * 1000;
const IDLE = 2 * 60 * 1000;
const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'];

export function useActivityPing(enabled, section) {
  const sectionRef = useRef(section);
  const sendRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let lastInput = Date.now();
    let lastPing = 0;
    let stopped = false;

    const send = (minGap = 15000) => {
      if (stopped || document.visibilityState !== 'visible' || Date.now() - lastInput > IDLE) return;
      if (Date.now() - lastPing < minGap) return;
      lastPing = Date.now();
      sb.rpc('bb_ping', { p_app: 'batbox', p_section: sectionRef.current || null }).then(({ error }) => {
        // Sin la migración 004 la función no existe: se deja de intentar.
        if (error && (error.code === 'PGRST202' || error.code === '42883')) stopped = true;
      });
    };
    sendRef.current = send;

    const onInput = () => {
      const wasIdle = Date.now() - lastInput > IDLE;
      lastInput = Date.now();
      if (wasIdle) send();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') onInput(); };

    EVENTS.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => send(EVERY - 5000), EVERY);
    send(0);

    return () => {
      sendRef.current = null;
      clearInterval(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, onInput));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  // Al cambiar de sección se actualiza el "en línea · sección" enseguida.
  useEffect(() => {
    sectionRef.current = section;
    sendRef.current?.(3000);
  }, [section]);
}
