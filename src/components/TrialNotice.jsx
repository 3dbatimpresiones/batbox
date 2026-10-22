import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { CLUB_PRICE_TEXT, TRIAL_DAYS } from '../config.js';
import Icon from './Icon.jsx';

// Aviso flotante en el Inicio sobre la prueba gratis (migración 022):
//   · durante la prueba: cuántos días quedan (se oculta por esta visita al cerrarlo)
//   · al terminar: recordatorio para suscribirse, UNA sola vez (si toca "Ahora no" no vuelve)
const keyOf = (uid, kind) => `bb_trial_notice_${kind}_${uid}`;
export const daysLeftOf = (end) => Math.max(0, Math.ceil((new Date(end) - Date.now()) / 864e5));

export default function TrialNotice({ route }) {
  const { access, isTrial, trialEndsAt, trial, user } = useAuth();
  const uid = user?.id;
  const ended = access === 'none' && trial && !trial.active;
  // Durante la prueba no flota nada: se ve en la franja del Inicio y en cada cosa premium (TrialBadge).
  const kind = ended ? 'ended' : null;
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!kind || !uid) { setHidden(true); return; }
    let h = false;
    try {
      if (kind === 'active') h = sessionStorage.getItem(keyOf(uid, kind)) === '1';
      else h = localStorage.getItem(keyOf(uid, kind)) === '1';
    } catch { /* sin storage: se muestra */ }
    setHidden(h);
  }, [kind, uid]);

  if (!kind || hidden || (route.parts[0] ?? '') !== '') return null;
  const close = () => {
    try {
      if (kind === 'active') sessionStorage.setItem(keyOf(uid, kind), '1');
      else localStorage.setItem(keyOf(uid, kind), '1');
    } catch { /* nada */ }
    setHidden(true);
  };

  if (kind === 'active') {
    const left = daysLeftOf(trialEndsAt);
    return (
      <aside className="trial-notice" role="status">
        <span className="tn-ico"><Icon name="crown" size={18} /></span>
        <div className="tn-body">
          <strong>Prueba gratis del Makers Club</strong>
          <small>{left <= 1 ? 'Es tu último día' : `Te quedan ${left} días`} con todo desbloqueado. Si te gusta, seguís por {CLUB_PRICE_TEXT}/mes.</small>
          <a className="btn club small" href="#/acceso"><Icon name="crown" size={14} /> Suscribirme</a>
        </div>
        <button className="tn-close" onClick={close} aria-label="Cerrar">×</button>
      </aside>
    );
  }
  return (
    <aside className="trial-notice ended" role="status">
      <span className="tn-ico"><Icon name="crown" size={18} /></span>
      <div className="tn-body">
        <strong>Terminó tu prueba gratis de {TRIAL_DAYS} días</strong>
        <small>¿Te gustaron las funciones PRO? Para seguir usándolas suscribite al Makers Club por <b>{CLUB_PRICE_TEXT} por mes</b>. Se cobra solo y lo cancelás cuando quieras.</small>
        <div className="tn-actions">
          <a className="btn club small" href="#/acceso"><Icon name="crown" size={14} /> Quiero suscribirme</a>
          <button className="btn text small" onClick={close}>Ahora no</button>
        </div>
      </div>
      <button className="tn-close" onClick={close} aria-label="Cerrar">×</button>
    </aside>
  );
}
