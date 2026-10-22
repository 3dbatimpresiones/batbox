import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { LINKS } from '../config.js';
import Icon from '../components/Icon.jsx';
import AccessPanel from '../components/AccessPanel.jsx';
import AccessForm from '../components/AccessForm.jsx';
import { PAY_STATUS, SUB_STATUS, daysLeft, fmtDate, money, mySubscription } from '../lib/subsApi.js';

// #/acceso — login, estado de la cuenta, suscripción y datos personales.
export function Account() {
  const { access, isMember, isAdmin, isEditor, canEdit, displayName, email, signOut, isTrial, trialEndsAt } = useAuth();
  const [me, setMe] = useState(undefined); // undefined = cargando
  const [meError, setMeError] = useState('');
  const load = useCallback(() => {
    mySubscription().then((d) => { setMe(d); setMeError(''); }, (e) => { setMe(null); setMeError(e.message); });
  }, []);
  useEffect(() => { if (isMember) load(); }, [isMember, load]);

  if (isTrial) {
    const left = Math.max(0, Math.ceil((new Date(trialEndsAt) - Date.now()) / 864e5));
    return (
      <div className="narrow">
        <div className="gate card gate-wide">
          <div className="big-ico tone-pink"><Icon name="crown" size={26} /></div>
          <h2>Estás en la prueba gratis</h2>
          <p className="gate-text">
            {left <= 1 ? 'Hoy es tu último día' : `Te quedan ${left} días`} con todo el Makers Club desbloqueado (hasta el {new Date(trialEndsAt).toLocaleDateString('es-AR')}).
            Para seguir después, suscribite acá: se activa solo y no perdés nada de lo que hiciste.
          </p>
          <AccessForm mode="new" me={me} />
          <button className="btn text wide" onClick={signOut}><Icon name="logout" size={16} /> Cerrar sesión</button>
        </div>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="narrow">
        <AccessPanel full intro={access === 'guest' ? 'Ingresá a BATBOX' : undefined} />
      </div>
    );
  }

  return (
    <div className="narrow">
      <div className="gate card">
        <div className="big-ico tone-ok"><Icon name="check" size={26} /></div>
        <h2>¡Hola, {displayName}!</h2>
        <p className="gate-text">Tu membresía de Makers Club está activa. Tu sesión también sirve para el Cotizador PRO, así que no tenés que volver a ingresar.</p>
        <div className="gate-email"><Icon name="user" size={14} /> {email}{isAdmin && <span className="chip club">✦ Admin</span>}{isEditor && <span className="chip cat">✎ Editor</span>}</div>
        <div className="gate-actions">
          <a className="btn primary wide" href="#/club"><Icon name="crown" size={18} /> Entrar a Makers Club</a>
          <a className="btn ghost wide" href={LINKS.cotizadorPro} target="_blank" rel="noopener">
            <Icon name="calculator" size={18} /> Abrir Cotizador PRO <Icon name="external" size={14} />
          </a>
          {canEdit && <a className="btn ghost wide" href="#/admin"><Icon name="shield" size={18} /> {isAdmin ? 'Panel admin' : 'Panel de editor'}</a>}
          <button className="btn text wide" onClick={signOut}><Icon name="logout" size={16} /> Cerrar sesión</button>
        </div>
      </div>

      <MySubscription me={me} error={meError} />

      <section className="card acc-card">
        <div className="section-label">MIS DATOS</div>
        <h3>Tus datos en el Makers Club</h3>
        <p className="ed-hint">Los ve solo la administración. Sirven para sumarte a los grupos y contactarte si hay algún problema con tu suscripción.</p>
        {me === undefined ? <div className="spinner" /> : <AccessForm mode="edit" me={me} onSaved={load} />}
      </section>
    </div>
  );
}

function MySubscription({ me, error }) {
  if (me === undefined) return <section className="card acc-card"><div className="spinner" /></section>;
  if (error) return <section className="card acc-card"><p className="ed-hint">{error}</p></section>;
  const sub = me?.subscription;
  const pays = me?.payments || [];
  const left = daysLeft(me?.expires_at);
  const st = sub ? SUB_STATUS[sub.status] || { label: sub.status, cls: 'muted' } : null;
  return (
    <section className="card acc-card">
      <div className="section-label">MI SUSCRIPCIÓN</div>
      <h3>Makers Club mensual</h3>
      <dl className="md-rows">
        <div><dt>Suscripción de Mercado Pago</dt><dd>{st ? <span className={'chip ' + st.cls}>{st.label}</span> : 'Sin suscripción registrada'}</dd></div>
        {sub?.status === 'authorized' && sub.next_payment_date && <div><dt>Próximo cobro</dt><dd>{fmtDate(sub.next_payment_date)}{sub.amount ? ' · ' + money(sub.amount) : ''}</dd></div>}
        <div><dt>Acceso hasta</dt><dd className={left != null && left <= 7 ? 'warn' : ''}>
          {me?.expires_at ? <>{fmtDate(me.expires_at)}{left != null && left >= 0 && <small> (en {left} {left === 1 ? 'día' : 'días'})</small>}</> : 'Sin vencimiento'}
        </dd></div>
      </dl>
      {sub?.status === 'authorized' && <p className="ed-hint">Se renueva sola cada mes. Si un cobro falla, tenés 10 días de margen antes de perder el acceso.</p>}
      {sub && sub.status !== 'authorized' && (
        <a className="btn primary wide" href={LINKS.mpSubscribe} target="_blank" rel="noopener noreferrer">
          <Icon name="crown" size={16} /> Volver a suscribirme <Icon name="external" size={14} />
        </a>
      )}

      {pays.length > 0 && <>
        <div className="section-label acc-sub">MIS PAGOS</div>
        <div className="pay-list">
          {pays.map((p) => {
            const ps = PAY_STATUS[p.status] || { label: p.status, cls: 'muted' };
            return (
              <div key={p.id} className="pay-row">
                <span className="pr-date">{fmtDate(p.paid_at)}</span>
                <span className="pr-amt">{money(p.amount)}</span>
                <span className={'chip ' + ps.cls}>{ps.label}</span>
                <small className="pr-op">{p.source === 'manual' ? 'Pago manual' : `Op. ${p.id}`}</small>
              </div>
            );
          })}
        </div>
      </>}

      <a className="btn ghost wide acc-manage" href={LINKS.mpManage} target="_blank" rel="noopener noreferrer">
        Ver o cancelar mi suscripción en Mercado Pago <Icon name="external" size={14} />
      </a>
    </section>
  );
}
