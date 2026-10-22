import { useAuth } from '../auth/AuthContext.jsx';
import { CLUB_PRICE_TEXT, TRIAL_DAYS } from '../config.js';
import Icon from './Icon.jsx';

// Prueba gratis (migración 022): cuántos días quedan, en el Inicio y en cada cosa premium.
export function useTrialLeft() {
  const { isTrial, trialEndsAt } = useAuth();
  if (!isTrial || !trialEndsAt) return null;
  return Math.max(0, Math.ceil((new Date(trialEndsAt) - Date.now()) / 864e5));
}
const leftText = (n) => (n <= 1 ? 'último día' : `quedan ${n} días`);

// Etiqueta chica para herramientas y contenido premium.
export function TrialChip() {
  const left = useTrialLeft();
  if (left == null) return null;
  return <span className="chip club trial-chip"><Icon name="crown" size={11} /> Prueba {TRIAL_DAYS} días · {leftText(left)}</span>;
}

// Franja finita arriba del Inicio (no flota ni tapa nada).
export function TrialBar() {
  const left = useTrialLeft();
  if (left == null) return null;
  return (
    <div className="trial-bar" role="status">
      <Icon name="crown" size={16} />
      <span>
        <b>Prueba gratis de {TRIAL_DAYS} días</b> · {left <= 1 ? 'hoy es tu último día' : `te quedan ${left} días`} con todo el Makers Club desbloqueado.
        <span className="tb-after"> Después seguís por {CLUB_PRICE_TEXT}/mes.</span>
      </span>
      <a className="btn club small" href="#/acceso">Suscribirme</a>
    </div>
  );
}
