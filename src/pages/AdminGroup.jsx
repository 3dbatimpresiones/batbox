import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { adminGroupCheck, adminGroupOverview, fmtDate, setGroupLink } from '../lib/subsApi.js';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/ui.jsx';

// =====================================================================
// GRUPO DE WHATSAPP (pestaña del panel admin) — migración 025
// WhatsApp no deja aprobar solicitudes desde otro sistema: esto te dice en
// segundos si quien pidió entrar pagó, y te da el mensaje listo para mandar.
// =====================================================================

const SUB_LINK = 'https://3dbat.com.ar/batbox/#/suscribirme';
const VERDICT = {
  ok: { cls: 'ok', icon: '✅', label: 'Pagó y está al día', todo: 'Aprobalo' },
  pending: { cls: 'warn', icon: '⏳', label: 'Se registró pero todavía no pagó', todo: 'No lo apruebes todavía' },
  expired: { cls: 'err', icon: '🕒', label: 'Vencido o canceló', todo: 'No lo apruebes' },
  blocked: { cls: 'orange', icon: '⛔', label: 'Suspendido o rechazado', todo: 'No lo apruebes' },
  unknown: { cls: 'muted', icon: '❓', label: 'No está en BATBOX con ese número', todo: 'Es un curioso o se registró con otro número' },
};
const MESSAGES = {
  pending: `¡Hola! Vimos tu solicitud para entrar al grupo del Makers Club 🙌 Todavía no nos figura el pago de tu suscripción. La completás acá: ${SUB_LINK} y apenas se acredite te aprobamos.`,
  expired: `¡Hola! Tu suscripción al Makers Club está vencida, por eso no podemos aprobarte en el grupo. Para volver, renovala acá: ${SUB_LINK} 🙌`,
  unknown: `¡Hola! Vimos tu solicitud para entrar al grupo del Makers Club 🙌 El grupo es solo para miembros suscriptos. Si ya pagaste, entrá a https://3dbat.com.ar/batbox/#/acceso con tu cuenta de Google y cargá ESTE número de celular en tus datos. Si todavía no te sumaste: ${SUB_LINK}`,
};

export default function AdminGroup() {
  const { notify } = useAuth();
  const [text, setText] = useState('');
  const [results, setResults] = useState(null);
  const [ov, setOv] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newLink, setNewLink] = useState('');

  const load = useCallback(() => adminGroupOverview().then((d) => { setOv(d); setError(''); }, (e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const check = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { setResults(await adminGroupCheck(text)); } catch (e) { notify('err', e.message); } finally { setBusy(false); }
  };
  const copy = (t, ok = 'Mensaje copiado') => navigator.clipboard?.writeText(t).then(() => notify('ok', ok), () => notify('err', 'No se pudo copiar'));
  const saveLink = async () => {
    setBusy(true);
    try { await setGroupLink(newLink.trim()); notify('ok', 'Link del grupo actualizado'); setNewLink(''); load(); }
    catch (e) { notify('err', e.message); } finally { setBusy(false); }
  };

  if (error) return <Empty icon="alert" title="No se pudo cargar" text={error} />;

  return (
    <div className="group-admin">
      <section className="card ga-card">
        <div className="section-label">VERIFICADOR DE SOLICITUDES</div>
        <h3>¿Quién pidió entrar al grupo?</h3>
        <p className="ed-hint">
          En WhatsApp abrí las solicitudes pendientes del grupo, copiá el número (o varios, uno por renglón) y pegalo acá.
          No importa cómo esté escrito (+54 9…, con espacios o guiones).
        </p>
        <div className="pink-input"><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={'+54 9 11 5555-5555\n+54 9 351 555-5555'} /></div>
        <div className="ga-actions">
          <button className="btn primary" onClick={check} disabled={busy || !text.trim()}><Icon name="search" size={16} /> Verificar</button>
          {results && <button className="btn text" onClick={() => { setText(''); setResults(null); }}>Limpiar</button>}
        </div>

        {results && (
          <div className="ga-results">
            {!results.length && <p className="ed-hint">No encontré números en lo que pegaste.</p>}
            {results.map((r, i) => {
              const m = r.members[0];
              const v = VERDICT[m ? m.verdict : 'unknown'];
              return (
                <div key={i} className={'ga-row t-' + v.cls}>
                  <div className="ga-main">
                    <div className="ga-num">{r.input}</div>
                    <div className="ga-verdict"><span className={'chip ' + v.cls}>{v.icon} {v.label}</span> <b>{v.todo}</b></div>
                    {r.members.map((mm) => (
                      <small key={mm.id}>
                        {mm.name || 'Sin nombre'} · {mm.email}{mm.expires_at ? ` · acceso hasta ${fmtDate(mm.expires_at)}` : ''}
                        {mm.clicked_at ? ` · pidió el link del grupo el ${fmtDate(mm.clicked_at)}` : ''}
                      </small>
                    ))}
                    {m && !r.exact && <small className="t-warn">Coincide solo en los últimos 8 dígitos: revisá que sea la misma persona.</small>}
                    {r.members.length > 1 && <small className="t-warn">Hay {r.members.length} fichas con este número.</small>}
                  </div>
                  {MESSAGES[m ? m.verdict : 'unknown'] && (
                    <button className="chip-btn" onClick={() => copy(MESSAGES[m ? m.verdict : 'unknown'])}>Copiar mensaje</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!ov ? <div className="empty"><div className="spinner" /></div> : <>
        <section className="card ga-card">
          <div className="section-label">PARA SACAR DEL GRUPO · {ov.removals.length}</div>
          <h3>Fueron miembros y hoy no están al día</h3>
          <p className="ed-hint">Vencidos, cancelados, suspendidos o rechazados. Buscalos en el grupo por el celular y sacalos.</p>
          {!ov.removals.length ? <p className="ed-hint">Nadie por ahora. 🎉</p> : (
            <div className="pay-list">
              {ov.removals.map((m) => (
                <div key={m.id} className="pay-row">
                  <span className={'chip ' + (m.status === 'suspended' || m.status === 'rejected' ? 'orange' : 'err')}>
                    {m.status === 'suspended' ? 'Suspendido' : m.status === 'rejected' ? 'Rechazado' : 'Vencido'}
                  </span>
                  <span className="pr-sub">{m.name || m.email}{m.name && <small> · {m.email}</small>}</span>
                  <small className="pr-op">{m.phone || 'sin celular'}{m.expires_at ? ` · venció ${fmtDate(m.expires_at)}` : ''}</small>
                  {m.phone && <button className="chip-btn" onClick={() => copy(m.phone, 'Celular copiado')}>Copiar celular</button>}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="two-blocks ga-two">
          <section className="card ga-card">
            <div className="section-label">AL DÍA SIN CELULAR · {ov.no_phone.length}</div>
            <h3>No los vas a poder reconocer</h3>
            <p className="ed-hint">Pagan, pero no tienen celular cargado. BATBOX les pide que lo carguen antes de darles el link del grupo; también podés cargarlo vos desde su ficha.</p>
            {ov.no_phone.slice(0, 30).map((m) => <small key={m.id} className="ga-line">{m.name || 'Sin nombre'} · {m.email}</small>)}
          </section>
          <section className="card ga-card">
            <div className="section-label">PIDIERON EL LINK · ÚLTIMOS 30 DÍAS</div>
            <h3>Van a aparecer en las solicitudes</h3>
            {!ov.recent_clicks.length ? <p className="ed-hint">Nadie todavía.</p> : ov.recent_clicks.map((c, i) => (
              <small key={i} className="ga-line">{fmtDate(c.clicked_at)} · {c.name || c.email} · {c.phone}</small>
            ))}
          </section>
        </div>

        <section className="card ga-card">
          <div className="section-label">LINK DEL GRUPO</div>
          <p className="ed-hint">
            Solo lo reciben los miembros al día, desde la página Makers Club. Actual: <b>{ov.link ? ov.link.replace(/\/([A-Za-z0-9]{4})[A-Za-z0-9]+$/, '/$1…') : 'sin cargar'}</b>.
            Si lo restablecés en WhatsApp (Info del grupo → Invitar con enlace → Restablecer), pegá el nuevo acá.
          </p>
          <div className="ga-link">
            <div className="pink-input"><input value={newLink} onChange={(e) => setNewLink(e.target.value)} placeholder="https://chat.whatsapp.com/…" /></div>
            <button className="btn primary" onClick={saveLink} disabled={busy || !newLink.trim()}>Guardar link nuevo</button>
          </div>
        </section>
      </>}
    </div>
  );
}
