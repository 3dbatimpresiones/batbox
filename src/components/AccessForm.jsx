import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { LINKS } from '../config.js';
import { mySubscription, requestAccess } from '../lib/subsApi.js';
import Icon from './Icon.jsx';

// =====================================================================
// SOLICITUD DE ACCESO AL MAKERS CLUB (reemplaza al formulario de Google)
// La persona carga sus propios datos con su sesión de Google. Si paga con
// Mercado Pago usando ESE MISMO correo, se activa sola. Si su cuenta de
// Mercado Pago tiene otro correo, pone el número de operación del
// comprobante y se activa al instante (bb_request_access, migración 014).
//   mode: new (sin ficha) · pending · renew (vencida) · edit ("Mis datos")
// =====================================================================

const EMPTY = { first_name: '', last_name: '', phone: '', discord: '', instagram: '', operation: '' };

export default function AccessForm({ mode = 'new', me: given, onSaved }) {
  const { recheck, notify, user, simulated } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [miss, setMiss] = useState(false);
  const edit = mode === 'edit';

  // Completa con lo que ya tenga cargado (o con su nombre de Google).
  useEffect(() => {
    let alive = true;
    const fill = (me) => {
      if (!alive) return;
      const g = (user?.user_metadata?.full_name || '').trim().split(/\s+/);
      setF((x) => ({
        ...x,
        first_name: me?.first_name || x.first_name || g[0] || '',
        last_name: me?.last_name || x.last_name || g.slice(1).join(' ') || '',
        phone: me?.phone || x.phone, discord: me?.discord || x.discord, instagram: me?.instagram || x.instagram,
      }));
    };
    if (given !== undefined) fill(given);
    else mySubscription().then(fill, () => fill(null));
    return () => { alive = false; };
  }, [given, user]);

  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setError(''); if (k === 'operation') setMiss(false); };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.first_name.trim() || !f.last_name.trim()) { setError('Completá tu nombre y apellido.'); return; }
    if (f.phone.replace(/\D/g, '').length < 6) { setError('Completá tu celular (con característica).'); return; }
    if (f.operation && !/\d{6,}/.test(f.operation.replace(/\D/g, ''))) { setError('El número de operación son solo números (ej. 98765432101).'); return; }
    if (simulated) { notify('ok', 'Simulación: datos enviados'); return; }
    setBusy(true); setError('');
    try {
      const status = await requestAccess(edit ? { ...f, operation: '' } : f);
      if (edit) { notify('ok', 'Tus datos se guardaron'); onSaved?.(); return; }
      if (status === 'not_found') {
        setMiss(true);
        return; // queda en esta pantalla para que revise el número
      }
      notify('ok', status === 'approved' ? '¡Listo! Ya sos parte del Makers Club' : 'Solicitud enviada. Se activa sola cuando llegue tu pago.');
      recheck();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="access-form" onSubmit={submit} noValidate>
      {!edit && (
        <div className="af-step done">
          <span className="af-num"><Icon name="check" size={15} /></span>
          <div className="af-body">
            <strong>Ingresaste con Google</strong>
            <p>{user?.email}</p>
          </div>
        </div>
      )}

      {!edit && (
        <div className="af-step">
          <span className="af-num">2</span>
          <div className="af-body">
            <strong>{mode === 'renew' ? 'Renová tu suscripción' : 'Suscribite en Mercado Pago'}</strong>
            <p>Plan mensual. Se cobra solo cada mes y lo podés cancelar cuando quieras. {mode === 'pending' && 'Si ya te suscribiste, seguí con el paso 3.'}</p>
            <a className="btn primary" href={LINKS.mpSubscribe} target="_blank" rel="noopener noreferrer">
              <Icon name="crown" size={16} /> {mode === 'renew' ? 'Renovar en Mercado Pago' : 'Suscribirme al Makers Club'} <Icon name="external" size={14} />
            </a>
          </div>
        </div>
      )}

      <div className={edit ? '' : 'af-step'}>
        {!edit && <span className="af-num">3</span>}
        <div className="af-body">
          {!edit && <strong>Completá tus datos</strong>}
          <div className="member-form af-fields">
            <Field label="Nombre *" value={f.first_name} onChange={set('first_name')} autoComplete="given-name" />
            <Field label="Apellido *" value={f.last_name} onChange={set('last_name')} autoComplete="family-name" />
            <Field label="Celular *" value={f.phone} onChange={set('phone')} type="tel" autoComplete="tel" placeholder="Ej. 11 5555-5555" span />
            <Field label="Discord" value={f.discord} onChange={set('discord')} placeholder="Tu usuario (si tenés)" />
            <Field label="Instagram" value={f.instagram} onChange={set('instagram')} placeholder="@usuario (si tenés)" />
          </div>
        </div>
      </div>

      {!edit && (
        <div className="af-step af-sub">
          <div className="af-body">
            <strong>Número de operación <span className="af-opt">(si hace falta)</span></strong>
            <p>
              Si tu cuenta de Mercado Pago usa <b>este mismo correo de Google</b>, dejalo vacío: se activa solo.
              Si usa <b>otro correo</b>, copiá el número de operación del comprobante y se activa al instante.
            </p>
            <details className="af-help">
              <summary>¿Dónde lo encuentro?</summary>
              <p>En la app de Mercado Pago: <b>Actividad</b> → tocá el pago al Makers Club → <b>Número de operación</b>. También está en el mail de “pago aprobado”.</p>
            </details>
            <Field label="Número de operación" value={f.operation} onChange={set('operation')} inputMode="numeric" placeholder="Ej. 98765432101" span />
            {miss && (
              <p className="af-msg warn">
                <Icon name="clock" size={15} /> Todavía no encontramos ese número. Si recién pagaste, Mercado Pago puede tardar unos minutos en avisarnos:
                probá de nuevo en un rato. Tus datos ya quedaron guardados.
              </p>
            )}
          </div>
        </div>
      )}

      {error && <p className="af-msg err"><Icon name="alert" size={15} /> {error}</p>}
      <button className="btn primary wide" disabled={busy}>
        {busy ? 'Enviando…' : edit ? 'Guardar mis datos' : f.operation.trim() ? 'Activar mi acceso' : mode === 'new' ? 'Enviar solicitud' : 'Guardar'}
      </button>
    </form>
  );
}

function Field({ label, span, ...props }) {
  return (
    <label className={'ed-field' + (span ? ' span2' : '')}>
      <span className="ed-label">{label}</span>
      <div className="pink-input"><input type="text" maxLength={60} {...props} /></div>
    </label>
  );
}
