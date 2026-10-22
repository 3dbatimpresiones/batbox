import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { CLUB_PRICE_TEXT } from '../config.js';
import { navigate } from '../lib/router.js';
import Icon from './Icon.jsx';
import { Benefits } from './ClubPitch.jsx';

// La primera vez que entra alguien que NO es miembro: elige qué quiere hacer.
// Se muestra una sola vez por cuenta (se recuerda en este navegador).
// No aparece si vino a propósito a la solicitud (#/acceso).
const KEY = (uid) => 'bb_welcome_seen_' + uid;

export default function WelcomeChoice({ route }) {
  const { access, user, displayName, isTrial, trialEndsAt, trial } = useAuth();
  const [open, setOpen] = useState(false);
  const uid = user?.id;

  useEffect(() => {
    // Si ya tuvo la prueba y terminó, alcanza con el recordatorio del Inicio (TrialNotice).
    const show = (access === 'none' && !trial) || isTrial;
    if (!show || !uid || route.parts[0] === 'acceso') { setOpen(false); return; }
    let seen = false;
    try { seen = localStorage.getItem(KEY(uid)) === '1'; } catch { /* sin storage: se muestra */ }
    setOpen(!seen);
  }, [access, isTrial, trial, uid, route.parts]);

  if (!open) return null;
  const done = () => { try { localStorage.setItem(KEY(uid), '1'); } catch { /* nada */ } setOpen(false); };

  if (isTrial) {
    const left = Math.max(0, Math.ceil((new Date(trialEndsAt) - Date.now()) / 864e5));
    return createPortal(
      <div className="modal-back" onClick={done}>
        <div className="modal welcome" role="dialog" aria-modal="true" aria-labelledby="wc-title" onClick={(e) => e.stopPropagation()}>
          <div className="wc-head">
            <div className="section-label">BIENVENIDO A BATBOX</div>
            <h2 id="wc-title">¡Hola{displayName ? `, ${displayName}` : ''}! Por ser tu primera vez, tenés {left} días gratis de todas las herramientas del Makers Club</h2>
            <p className="wc-lead">Usá todo lo PRO sin pagar nada: no hace falta tarjeta ni suscribirte. Cuando terminen los {left} días, si te gustó, seguís por <b>{CLUB_PRICE_TEXT} por mes</b>; si no, seguís usando todo lo gratis (Cotizador FREE, tutoriales y más).</p>
          </div>
          <div className="section-label wc-sub">LO QUE TENÉS DESBLOQUEADO</div>
          <Benefits />
          <div className="wc-trial-actions">
            <button className="btn primary" onClick={() => { done(); navigate('/'); }}><Icon name="crown" size={16} /> Continuar gratis · {left} días de prueba</button>
            <button className="btn ghost" onClick={() => { done(); navigate('/acceso'); }}>Suscribirme ya</button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="modal-back" onClick={done}>
      <div className="modal welcome" role="dialog" aria-modal="true" aria-labelledby="wc-title" onClick={(e) => e.stopPropagation()}>
        <div className="wc-head">
          <div className="section-label">BIENVENIDO A BATBOX</div>
          <h2 id="wc-title">¡Hola{displayName ? `, ${displayName}` : ''}! ¿Qué querés hacer?</h2>
        </div>

        <div className="wc-options">
          <button className="wc-opt" onClick={() => { done(); navigate('/'); }}>
            <span className="wc-ico"><Icon name="search" size={22} /></span>
            <strong>Explorar gratis</strong>
            <small>Usá el <b>Cotizador FREE</b> y las herramientas gratis, mirá <b>todos los tutoriales</b> y el contenido gratuito: WikiBAT, recursos y comunidad. Sin pagar nada.</small>
            <span className="btn ghost small">Ir al inicio</span>
          </button>
          <button className="wc-opt club" onClick={() => { done(); navigate('/acceso'); }}>
            <span className="wc-ico"><Icon name="crown" size={22} /></span>
            <strong>Unirme al Makers Club</strong>
            <small><b>{CLUB_PRICE_TEXT} por mes</b>, suscripción automática por Mercado Pago. La cancelás cuando quieras. Desbloqueás todo lo de abajo.</small>
            <span className="btn club small"><Icon name="crown" size={14} /> Quiero unirme</span>
          </button>
        </div>

        <div className="section-label wc-sub">QUÉ DESBLOQUEÁS CON EL MAKERS CLUB</div>
        <Benefits />
        <p className="ed-hint wc-foot">Si después te decidís, lo encontrás en <b>Makers Club</b>, arriba en el menú.</p>
      </div>
    </div>,
    document.body,
  );
}
