import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { CLUB_PRICE_TEXT } from '../config.js';
import { mySubscription, whatsappGroup } from '../lib/subsApi.js';
import Icon from './Icon.jsx';

// Grupo de WhatsApp del Makers Club (migración 025): solo para los que pagan.
// El link lo da la base; los de prueba gratis no lo reciben.
export default function GroupCard() {
  const { isTrial, simulated, notify } = useAuth();
  const [phone, setPhone] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isTrial) return;
    mySubscription().then((me) => setPhone(me?.phone || ''), () => setPhone(''));
  }, [isTrial]);

  if (isTrial) {
    return (
      <section className="card group-card locked">
        <span className="gc-ico"><Icon name="message" size={22} /></span>
        <div className="gc-body">
          <div className="section-label">GRUPO DE WHATSAPP DEL MAKERS CLUB</div>
          <strong>El grupo es solo para suscriptores</strong>
          <p>Ayuda entre miembros, archivos exclusivos, sorteos con un día de anticipación y encuestas. Se habilita cuando te suscribís ({CLUB_PRICE_TEXT}/mes).</p>
        </div>
        <a className="btn club" href="#/acceso"><Icon name="crown" size={16} /> Suscribirme</a>
      </section>
    );
  }

  const join = async () => {
    setError('');
    if (simulated) { notify('ok', 'Simulación: acá se abriría el grupo'); return; }
    const w = window.open('about:blank', '_blank'); // se abre ya, si no el navegador la bloquea
    setBusy(true);
    try {
      const link = await whatsappGroup();
      if (w) w.location.href = link; else window.location.href = link;
    } catch (e) {
      if (w) w.close();
      setError(e.message);
    } finally { setBusy(false); }
  };
  const noPhone = phone === '';

  return (
    <section className="card group-card">
      <span className="gc-ico"><Icon name="message" size={22} /></span>
      <div className="gc-body">
        <div className="section-label">GRUPO DE WHATSAPP DEL MAKERS CLUB</div>
        <strong>Sumate al grupo exclusivo</strong>
        <p>
          {noPhone
            ? <>Primero cargá tu celular en <a href="#/acceso">Mis datos</a>: es el número que vamos a buscar cuando pidas entrar.</>
            : <>Pedí entrar desde WhatsApp con tu número <b>{phone || '…'}</b>: con ese te reconocemos y te aprobamos. Si usás otro, cambialo antes en <a href="#/acceso">Mis datos</a>.</>}
        </p>
        {error && <p className="af-msg err"><Icon name="alert" size={15} /> {error}</p>}
      </div>
      <button className="btn primary gc-btn" onClick={join} disabled={busy || noPhone || phone === undefined}>
        <Icon name="message" size={16} /> {busy ? 'Abriendo…' : 'Unirme al grupo'}
      </button>
    </section>
  );
}
