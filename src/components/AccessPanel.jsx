import { useAuth } from '../auth/AuthContext.jsx';
import { CLUB_PRICE_TEXT, LINKS } from '../config.js';
import Icon from './Icon.jsx';
import AccessForm from './AccessForm.jsx';
import { useState } from 'react';

// Mensajes por estado, alineados con los del Cotizador PRO.
const STATUS = {
  pending: {
    icon: 'clock', tone: 'warn', title: 'Solicitud pendiente',
    text: 'Tu solicitud ya está guardada. Se activa sola apenas llegue tu pago de Mercado Pago. Si tu cuenta de Mercado Pago usa otro correo, activala con el número de operación.',
  },
  rejected: {
    icon: 'x', tone: 'err', title: 'Solicitud rechazada',
    text: 'No pudimos validar tu membresía con los datos enviados. Comunicate con la administración del Makers Club 3DBAT.',
  },
  suspended: {
    icon: 'alert', tone: 'orange', title: 'Acceso suspendido',
    text: 'Tu acceso a Makers Club está suspendido. Comunicate con la administración del Makers Club 3DBAT.',
  },
  expired: {
    icon: 'clock', tone: 'muted', title: 'Membresía vencida',
    text: 'Tu membresía del Makers Club 3DBAT está vencida. Renová la suscripción en Mercado Pago y se reactiva sola cuando llegue el pago.',
  },
};

// Mientras no tenga Makers Club, puede usar la versión gratuita.
function FreeHint() {
  return (
    <a className="free-hint" href={LINKS.cotizadorFree} target="_blank" rel="noopener">
      <Icon name="calculator" size={16} /> Mientras tanto, usá gratis el <b>Cotizador 3DBAT FREE</b> <Icon name="external" size={13} />
    </a>
  );
}

function Gate({ icon, tone = 'cyan', title, text, children, email, wide }) {
  return (
    <div className={'gate card' + (wide ? ' gate-wide' : '')}>
      <div className={'big-ico tone-' + tone}><Icon name={icon} size={26} /></div>
      <h2>{title}</h2>
      {text && <p className="gate-text">{text}</p>}
      {email && <div className="gate-email"><Icon name="user" size={14} /> {email}</div>}
      <div className="gate-actions">{children}</div>
    </div>
  );
}

// Solicitud vista por alguien que todavía no ingresó: los 3 pasos, con el 1 activo.
function JoinPreview({ onSignIn, onBack }) {
  return (
    <Gate icon="crown" tone="pink" title="Solicitud de acceso al Makers Club" wide
      text="Son 3 pasos y lleva un par de minutos.">
      <div className="access-form">
        <div className="af-step">
          <span className="af-num">1</span>
          <div className="af-body">
            <strong>Ingresá con tu cuenta de Google</strong>
            <p>Así tu acceso queda a tu nombre y no tenés que crear otra contraseña. <b>Ingresar no da acceso:</b> se activa recién cuando se confirma tu suscripción.</p>
            <button className="btn primary" onClick={onSignIn}><Icon name="login" size={16} /> Ingresar con Google</button>
          </div>
        </div>
        <div className="af-step off">
          <span className="af-num">2</span>
          <div className="af-body">
            <strong>Suscribite en Mercado Pago</strong>
            <p>Plan mensual: se cobra solo y lo cancelás cuando quieras. Se habilita al ingresar.</p>
          </div>
        </div>
        <div className="af-step off">
          <span className="af-num">3</span>
          <div className="af-body">
            <strong>Completá tus datos</strong>
            <p>Nombre, celular, Discord e Instagram. Si pagaste con este mismo correo, se activa solo.</p>
          </div>
        </div>
      </div>
      <button className="btn text wide" onClick={onBack}>Volver</button>
    </Gate>
  );
}

// Panel que explica qué tiene que hacer la persona según su estado.
// `intro` permite personalizar el motivo (ej. "Este tutorial es exclusivo…").
export default function AccessPanel({ intro, benefitsLink = true, full = false }) {
  const { access, email, signIn, signOut, recheck, error } = useAuth();
  const [open, setOpen] = useState(false);
  // "Quiero unirme": primero se muestra la solicitud (paso 1 = ingresar con Google).
  // También se abre sola con #/acceso?unirme (botones de Inicio y Comunidad).
  const [join, setJoin] = useState(() => /[?&]unirme\b/.test(window.location.hash));

  if (access === 'loading') {
    return <Gate icon="clock" title="Verificando acceso…"><div className="spinner" /></Gate>;
  }

  if (access === 'guest' && join) {
    return <JoinPreview onSignIn={() => signIn('/acceso')} onBack={() => setJoin(false)} />;
  }

  if (access === 'guest') {
    return (
      <Gate icon="lock" title={intro || 'Contenido exclusivo de Makers Club'}
        text="Elegí qué querés hacer:">
        <button className="btn primary wide" onClick={() => signIn()}>
          <Icon name="login" size={18} /> Ingresar con Google
        </button>
        <small className="gate-caption">Para entrar a la web con tu cuenta. Si ya sos miembro, accedés a todo (usá la misma cuenta que en el Cotizador PRO). Si no, usás lo gratis.</small>
        <button className="btn club wide" onClick={() => setJoin(true)}>
          <Icon name="crown" size={18} /> Quiero unirme al Makers Club
        </button>
        <small className="gate-caption">Para suscribirte y ser miembro: Cotizador PRO, tutoriales exclusivos y todas las herramientas.</small>
        {benefitsLink && <a className="gate-link" href="#/community?seccion=club">¿Qué incluye? Ver beneficios</a>}
      </Gate>
    );
  }

  if (access === 'error') {
    return (
      <Gate icon="alert" tone="err" title="No pudimos comprobar tu acceso" text={error} email={email}>
        <button className="btn primary wide" onClick={recheck}><Icon name="refresh" size={18} /> Volver a intentar</button>
        <button className="btn ghost wide" onClick={signOut}><Icon name="logout" size={18} /> Cerrar sesión</button>
      </Gate>
    );
  }

  if (access === 'none' && !full) {
    return (
      <Gate icon="crown" tone="pink" title={intro || 'Esto es del Makers Club'}
        text={`Se desbloquea con la membresía mensual de ${CLUB_PRICE_TEXT}, automática por Mercado Pago. Mientras tanto podés seguir usando todo lo gratis.`}>
        <a className="btn club wide" href="#/acceso"><Icon name="crown" size={18} /> Quiero unirme al Makers Club</a>
        <a className="btn ghost wide" href="#/">Seguir explorando gratis</a>
        {benefitsLink && <a className="gate-link" href="#/community?seccion=club">¿Qué incluye? Ver beneficios</a>}
      </Gate>
    );
  }

  if (access === 'none') {
    return (
      <Gate icon="crown" tone="pink" title="Solicitud de acceso al Makers Club" wide
        text="Ya ingresaste: seguí con el paso 2. No hace falta mandar nada más por otro lado.">
        <AccessForm mode="new" />
        <FreeHint />
        <button className="btn text wide" onClick={signOut}>Usar otra cuenta de Google</button>
      </Gate>
    );
  }

  const s = STATUS[access];
  if (s) {
    const canPay = access === 'pending' || access === 'expired';
    return (
      <Gate icon={s.icon} tone={s.tone} title={s.title} text={s.text} email={email} wide={canPay && open}>
        {canPay && !open && <>
          {access === 'expired' && (
            <a className="btn primary wide" href={LINKS.mpSubscribe} target="_blank" rel="noopener noreferrer">
              <Icon name="crown" size={18} /> Renovar en Mercado Pago <Icon name="external" size={14} />
            </a>
          )}
          <button className={'btn wide ' + (access === 'pending' ? 'primary' : 'ghost')} onClick={() => setOpen(true)}>
            {access === 'pending' ? 'Ya pagué · activar con el número de operación' : 'Ya renové · activar con el número de operación'}
          </button>
          <button className="btn ghost wide" onClick={recheck}><Icon name="refresh" size={18} /> Volver a comprobar</button>
          {access === 'pending' && <FreeHint />}
        </>}
        {canPay && open && <AccessForm mode={access === 'expired' ? 'renew' : 'pending'} />}
        {!canPay && <a className="btn ghost wide" href="#/community">Contactar a la administración</a>}
        <button className="btn text wide" onClick={signOut}>Cerrar sesión</button>
      </Gate>
    );
  }

  return null; // member: quien llama muestra el contenido
}
