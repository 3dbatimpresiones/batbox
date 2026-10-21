import { useAuth } from '../auth/AuthContext.jsx';
import { LINKS } from '../config.js';
import Icon from './Icon.jsx';

// Mensajes por estado, alineados con los del Cotizador PRO.
const STATUS = {
  pending: {
    icon: 'clock', tone: 'warn', title: 'Solicitud pendiente',
    text: 'Tu solicitud está en revisión. Vamos a comprobar que tu membresía del Makers Club 3DBAT esté activa. No hace falta que la envíes de nuevo.',
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
    text: 'Tu membresía del Makers Club 3DBAT está vencida. Comunicate con la administración para renovarla.',
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

function Gate({ icon, tone = 'cyan', title, text, children, email }) {
  return (
    <div className="gate card">
      <div className={'big-ico tone-' + tone}><Icon name={icon} size={26} /></div>
      <h2>{title}</h2>
      {text && <p className="gate-text">{text}</p>}
      {email && <div className="gate-email"><Icon name="user" size={14} /> {email}</div>}
      <div className="gate-actions">{children}</div>
    </div>
  );
}

// Panel que explica qué tiene que hacer la persona según su estado.
// `intro` permite personalizar el motivo (ej. "Este tutorial es exclusivo…").
export default function AccessPanel({ intro }) {
  const { access, email, signIn, signOut, recheck, error } = useAuth();

  if (access === 'loading') {
    return <Gate icon="clock" title="Verificando acceso…"><div className="spinner" /></Gate>;
  }

  if (access === 'guest') {
    return (
      <Gate icon="lock" title={intro || 'Contenido exclusivo de Makers Club'}
        text="Ingresá con tu cuenta de Google. Si ya usás el Cotizador PRO, entrá con la misma cuenta: tu acceso se reconoce solo, sin registrarte de nuevo.">
        <button className="btn primary wide" onClick={() => signIn()}>
          <Icon name="login" size={18} /> Ingresar con Google
        </button>
        <a className="btn ghost wide" href="#/community">¿Todavía no sos miembro? Conocé Makers Club</a>
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

  if (access === 'none') {
    return (
      <Gate icon="crown" tone="pink" title="Todavía no sos parte de Makers Club"
        text="Iniciaste sesión, pero esta cuenta todavía no tiene acceso. Completá la solicitud usando este mismo correo de Google; cuando verifiquemos tu membresía, vas a poder entrar."
        email={email}>
        <a className="btn primary wide" href={LINKS.accessForm} target="_blank" rel="noopener noreferrer">
          Solicitar acceso a Makers Club <Icon name="external" size={16} />
        </a>
        <button className="btn ghost wide" onClick={recheck}><Icon name="refresh" size={18} /> Ya me aprobaron · volver a comprobar</button>
        <FreeHint />
        <button className="btn text wide" onClick={signOut}>Usar otra cuenta de Google</button>
      </Gate>
    );
  }

  const s = STATUS[access];
  if (s) {
    return (
      <Gate icon={s.icon} tone={s.tone} title={s.title} text={s.text} email={email}>
        {access === 'pending' && <>
          <button className="btn primary wide" onClick={recheck}><Icon name="refresh" size={18} /> Volver a comprobar</button>
          <FreeHint />
        </>}
        {access !== 'pending' && <a className="btn ghost wide" href="#/community">Contactar a la administración</a>}
        <button className="btn text wide" onClick={signOut}>Cerrar sesión</button>
      </Gate>
    );
  }

  return null; // member: quien llama muestra el contenido
}
