import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { CLUB_PRICE_TEXT, LINKS, PAYPAL_PRICE_TEXT } from '../config.js';
import { sb } from '../lib/supabase.js';
import { navigate } from '../lib/router.js';
import { mySubscription, requestAccess } from '../lib/subsApi.js';
import Icon from '../components/Icon.jsx';
import BrandIcon from '../components/BrandIcon.jsx';
import { Benefits } from '../components/ClubPitch.jsx';

// =====================================================================
// #/suscribirme — PÁGINA OCULTA de pago directo (no está en ningún menú).
// Para quien ya decidió suscribirse (link del mensaje de WhatsApp/Discord):
// entra con Google → deja sus datos → paga en Mercado Pago → se activa solo
// y lo manda al Inicio. Sin prueba gratis (bb_skip_trial, migración 024).
// Con PayPal (otros países) guarda los mismos datos, la ficha queda pendiente
// en el panel y se aprueba a mano al ver el pago.
// =====================================================================

const EMPTY = { first_name: '', last_name: '', phone: '', discord: '', instagram: '' };
const POLL_MS = 5000;

export default function Subscribe() {
  const { access, isTrial, user, signIn, signOut, recheck, notify, simulated } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [phase, setPhase] = useState('form'); // form · waiting
  const [method, setMethod] = useState(() => (/[?&]paypal\b/.test(window.location.hash) ? 'paypal' : 'mp')); // mp · paypal
  const pp = method === 'paypal';
  const priceText = pp ? (PAYPAL_PRICE_TEXT ? `${PAYPAL_PRICE_TEXT}/mes` : 'en dólares') : `${CLUB_PRICE_TEXT}/mes`;
  const choose = (m) => {
    setMethod(m); setError('');
    window.history.replaceState(null, '', '#/suscribirme' + (m === 'paypal' ? '?paypal' : ''));
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [op, setOp] = useState('');
  const [opMsg, setOpMsg] = useState('');
  const [popupBlocked, setPopupBlocked] = useState(false);
  const filled = useRef(false);

  // Este camino no usa la bienvenida de prueba ni el aviso de "terminó tu prueba".
  useEffect(() => {
    if (!user?.id) return;
    try {
      localStorage.setItem('bb_welcome_seen_' + user.id, '1');
      localStorage.setItem('bb_trial_notice_ended_' + user.id, '1');
    } catch { /* sin storage */ }
  }, [user?.id]);

  // Completa con lo que ya tenga cargado o con su nombre de Google.
  useEffect(() => {
    if (!user || filled.current) return;
    filled.current = true;
    const g = (user.user_metadata?.full_name || '').trim().split(/\s+/);
    const fill = (me) => setF((x) => ({
      first_name: me?.first_name || x.first_name || g[0] || '',
      last_name: me?.last_name || x.last_name || g.slice(1).join(' ') || '',
      phone: me?.phone || x.phone, discord: me?.discord || x.discord, instagram: me?.instagram || x.instagram,
    }));
    if (simulated) fill(null); else mySubscription().then(fill, () => fill(null));
  }, [user, simulated]);

  // Esperando el pago: se pregunta a la base cada 5 s; apenas queda aprobado, al Inicio.
  useEffect(() => {
    if (phase !== 'waiting' || simulated) return undefined;
    let stop = false;
    const tick = async () => {
      const { data } = await sb.rpc('get_my_access');
      const m = data?.[0];
      if (!stop && m?.status === 'approved' && !m.is_trial) {
        stop = true;
        await recheck();
        notify('ok', '¡Listo! Ya sos parte del Makers Club');
        navigate('/');
      }
    };
    const t = setInterval(tick, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [phase, simulated, recheck, notify]);

  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setError(''); };

  const pay = async (how, e) => {
    e?.preventDefault();
    if (!f.first_name.trim() || !f.last_name.trim()) { setError('Completá tu nombre y apellido.'); return; }
    if (f.phone.replace(/\D/g, '').length < 6) { setError('Completá tu celular (con característica).'); return; }
    // La pestaña de pago se abre ya (si se abre después de guardar, el navegador la bloquea).
    const w = window.open('about:blank', '_blank');
    const url = how === 'paypal' ? LINKS.paypalSubscribe : LINKS.mpSubscribe;
    setBusy(true); setError('');
    try {
      if (!simulated) {
        await sb.rpc('bb_skip_trial');
        await requestAccess({ ...f, operation: '' });
      }
      if (w) w.location.href = url; else setPopupBlocked(true);
      setMethod(how);
      setPhase('waiting');
    } catch (err) {
      if (w) w.close();
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const activateWithOp = async () => {
    if (!/\d{6,}/.test(op.replace(/\D/g, ''))) { setOpMsg('El número de operación son solo números (ej. 98765432101).'); return; }
    setBusy(true); setOpMsg('');
    try {
      const status = simulated ? 'approved' : await requestAccess({ ...f, operation: op });
      if (status === 'approved') {
        await recheck();
        notify('ok', '¡Listo! Ya sos parte del Makers Club');
        navigate('/');
      } else {
        setOpMsg('Todavía no encontramos ese número. Si recién pagaste, Mercado Pago puede tardar unos minutos: probá de nuevo en un rato.');
      }
    } catch (err) { setOpMsg(err.message); } finally { setBusy(false); }
  };

  const head = (
    <div className="sub-head">
      <div className="big-ico tone-pink"><Icon name="crown" size={26} /></div>
      <div className="section-label">MAKERS CLUB 3DBAT</div>
      <h1>Suscribite al Makers Club</h1>
      <p>Cuota mensual automática. La cancelás cuando quieras.</p>
    </div>
  );

  if (access === 'loading') return <div className="sub-page">{head}<div className="spinner" /></div>;

  if (access === 'member' && !isTrial && phase !== 'waiting') {
    return (
      <div className="sub-page">
        {head}
        <div className="card sub-card sub-done">
          <h2>¡Ya sos miembro del Makers Club!</h2>
          <p>Tu suscripción está activa: no tenés que pagar de nuevo.</p>
          <a className="btn primary" href="#/">Ir al inicio</a>
        </div>
      </div>
    );
  }

  return (
    <div className="sub-page">
      {head}
      <div className="sub-grid">
        <div className="card sub-card">
          <div className="pay-choice" role="radiogroup" aria-label="Cómo vas a pagar">
            <button type="button" role="radio" aria-checked={!pp} className={'pc-opt' + (!pp ? ' active' : '')} onClick={() => choose('mp')} disabled={phase === 'waiting'}>
              <span className="pc-flag" aria-label="Argentina">
                <svg width="28" height="19" viewBox="0 0 28 19" aria-hidden="true"><rect width="28" height="19" rx="3" fill="#74ACDF" /><rect y="6.33" width="28" height="6.34" fill="#fff" /><circle cx="14" cy="9.5" r="2.1" fill="#F6B40E" /></svg>
              </span>
              <span className="pc-txt"><strong>Desde Argentina</strong><small>Mercado Pago</small></span>
              <b className="pc-price">{CLUB_PRICE_TEXT}<small>/mes</small></b>
            </button>
            <button type="button" role="radio" aria-checked={pp} className={'pc-opt pp' + (pp ? ' active' : '')} onClick={() => choose('paypal')} disabled={phase === 'waiting'}>
              <span className="pc-flag">🌎</span>
              <span className="pc-txt"><strong>Desde otro país</strong><small>PayPal</small></span>
              <b className="pc-price">{PAYPAL_PRICE_TEXT ? <>{PAYPAL_PRICE_TEXT}<small>/mes</small></> : <small>en dólares</small>}</b>
            </button>
          </div>
          {access === 'guest' ? (
            <div className="af-step">
              <span className="af-num">1</span>
              <div className="af-body">
                <strong>Ingresá con tu cuenta de Google</strong>
                <p>Tu suscripción queda a tu nombre y con esa misma cuenta entrás a BATBOX y al Cotizador PRO.</p>
                <button className="btn primary" onClick={() => signIn(pp ? '/suscribirme?paypal' : '/suscribirme')}><Icon name="login" size={16} /> Ingresar con Google</button>
              </div>
            </div>
          ) : phase === 'form' ? (
            <form className="access-form" onSubmit={(e) => pay(method, e)} noValidate>
              <div className="af-step done">
                <span className="af-num"><Icon name="check" size={15} /></span>
                <div className="af-body"><strong>Ingresaste con Google</strong><p>{user?.email}</p></div>
              </div>
              <div className="af-step">
                <span className="af-num">2</span>
                <div className="af-body">
                  <strong>Tus datos</strong>
                  <div className="member-form af-fields">
                    <Field label="Nombre *" value={f.first_name} onChange={set('first_name')} autoComplete="given-name" />
                    <Field label="Apellido *" value={f.last_name} onChange={set('last_name')} autoComplete="family-name" />
                    <Field label="Celular *" value={f.phone} onChange={set('phone')} type="tel" autoComplete="tel" placeholder="Ej. 11 5555-5555" span />
                    <Field label="Discord" value={f.discord} onChange={set('discord')} placeholder="Tu usuario (si tenés)" />
                    <Field label="Instagram" value={f.instagram} onChange={set('instagram')} placeholder="@usuario (si tenés)" />
                  </div>
                </div>
              </div>
              <div className="af-step">
                <span className="af-num">3</span>
                <div className="af-body">
                  <strong>{pp ? 'Pagá con PayPal' : 'Pagá en Mercado Pago'}</strong>
                  <p>{pp
                    ? <>Se abre PayPal para suscribirte{PAYPAL_PRICE_TEXT ? <> por <b>{PAYPAL_PRICE_TEXT} por mes</b></> : ' (el monto en dólares lo ves en PayPal antes de confirmar)'}. Los pagos de PayPal los revisamos a mano: apenas veamos el tuyo activamos tu cuenta y te avisamos.</>
                    : 'Se abre Mercado Pago para suscribirte. Cuando termines, esta página se da cuenta sola y te lleva al inicio con todo desbloqueado.'}</p>
                </div>
              </div>
              {error && <p className="af-msg err"><Icon name="alert" size={15} /> {error}</p>}
              {pp ? (
                <button className="btn paypal wide" disabled={busy}>
                  {busy ? 'Guardando…' : <>Guardar y pagar {PAYPAL_PRICE_TEXT ? `${PAYPAL_PRICE_TEXT}/mes ` : ''}con <span className="pp-word"><b>Pay</b><i>Pal</i></span></>}
                </button>
              ) : (
                <button className="btn club wide" disabled={busy}>
                  <Icon name="crown" size={18} /> {busy ? 'Guardando…' : `Guardar y pagar ${priceText} con Mercado Pago`}
                </button>
              )}
              <button type="button" className="btn text wide" onClick={signOut}>Usar otra cuenta de Google</button>
            </form>
          ) : method === 'paypal' ? (
            <div className="sub-wait">
              <span className="pp-logo big"><BrandIcon name="paypal" size={28} /></span>
              <h2>¡Listo! Tus datos ya quedaron guardados</h2>
              <p>Completá la suscripción en la pestaña de PayPal. Los pagos de PayPal los revisamos a mano: apenas veamos el tuyo activamos esta cuenta ({user?.email}) y te avisamos.</p>
              <a className={'btn ' + (popupBlocked ? 'paypal' : 'ghost')} href={LINKS.paypalSubscribe} target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={16} /> {popupBlocked ? 'Abrir PayPal para pagar' : 'Volver a abrir PayPal'}
              </a>
              <button type="button" className="btn text" onClick={() => setPhase('form')}>Corregir mis datos</button>
            </div>
          ) : (
            <div className="sub-wait">
              <div className="spinner" />
              <h2>Esperando tu pago…</h2>
              <p>Completá la suscripción en la pestaña de Mercado Pago. Apenas se confirme, te llevamos al inicio: no cierres esta página.</p>
              <a className={'btn ' + (popupBlocked ? 'club' : 'ghost')} href={LINKS.mpSubscribe} target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={16} /> {popupBlocked ? 'Abrir Mercado Pago para pagar' : 'Volver a abrir Mercado Pago'}
              </a>
              <details className="af-help sub-op">
                <summary>¿Pagaste con otra cuenta de Mercado Pago?</summary>
                <p>Pegá el número de operación del comprobante (en la app: <b>Actividad</b> → el pago → <b>Número de operación</b>).</p>
                <div className="sub-op-row">
                  <div className="pink-input"><input inputMode="numeric" placeholder="Ej. 98765432101" value={op} onChange={(e) => { setOp(e.target.value); setOpMsg(''); }} /></div>
                  <button type="button" className="btn primary" disabled={busy} onClick={activateWithOp}>Activar</button>
                </div>
                {opMsg && <p className="af-msg warn"><Icon name="clock" size={15} /> {opMsg}</p>}
              </details>
            </div>
          )}
        </div>

        <aside className="card sub-card sub-side">
          <div className="section-label">QUÉ INCLUYE</div>
          <Benefits />
        </aside>
      </div>
    </div>
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
