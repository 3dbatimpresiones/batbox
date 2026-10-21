import { useAuth } from '../auth/AuthContext.jsx';
import { LINKS } from '../config.js';
import Icon from '../components/Icon.jsx';
import AccessPanel from '../components/AccessPanel.jsx';

// #/acceso — login, estado de la cuenta y solicitud.
export function Account() {
  const { access, isMember, isAdmin, displayName, email, signOut } = useAuth();

  if (!isMember) {
    return (
      <div className="narrow">
        <AccessPanel intro={access === 'guest' ? 'Ingresá a BATBOX' : undefined} />
      </div>
    );
  }

  return (
    <div className="narrow">
      <div className="gate card">
        <div className="big-ico tone-ok"><Icon name="check" size={26} /></div>
        <h2>¡Hola, {displayName}!</h2>
        <p className="gate-text">Tu membresía de Makers Club está activa. Tu sesión también sirve para el Cotizador PRO, así que no tenés que volver a ingresar.</p>
        <div className="gate-email"><Icon name="user" size={14} /> {email}{isAdmin && <span className="chip club">✦ Admin</span>}</div>
        <div className="gate-actions">
          <a className="btn primary wide" href="#/club"><Icon name="crown" size={18} /> Entrar a Makers Club</a>
          <a className="btn ghost wide" href={LINKS.cotizadorPro} target="_blank" rel="noopener">
            <Icon name="calculator" size={18} /> Abrir Cotizador PRO <Icon name="external" size={14} />
          </a>
          {isAdmin && <a className="btn ghost wide" href="#/admin"><Icon name="shield" size={18} /> Panel admin</a>}
          <button className="btn text wide" onClick={signOut}><Icon name="logout" size={16} /> Cerrar sesión</button>
        </div>
      </div>
    </div>
  );
}
