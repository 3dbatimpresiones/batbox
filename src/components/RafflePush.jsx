import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { fmtDate } from '../lib/rifasApi.js';
import * as push from '../lib/rifasPush.js';

function usePushSetup() {
  const [platform, setPlatform] = useState(push.platformState);
  const [prepared, setPrepared] = useState(null);
  const [setupError, setSetupError] = useState('');
  const refreshPlatform = useCallback(() => setPlatform(push.platformState()), []);
  useEffect(() => {
    addEventListener('focus', refreshPlatform);
    return () => removeEventListener('focus', refreshPlatform);
  }, [refreshPlatform]);
  const prepare = useCallback(() => {
    setSetupError('');
    push.preparePush().then(setPrepared).catch((error) => setSetupError(error.message));
  }, []);
  useEffect(() => {
    if (['pending', 'granted'].includes(platform)) prepare();
  }, [platform, prepare]);
  return { platform, prepared, setupError, refreshPlatform, prepare };
}

function PushHelp({ setup }) {
  if (setup.platform === 'install') {
    return <p className="rf-muted">En iPhone o iPad con iOS/iPadOS 16.4 o posterior, abrí BATBOX en Safari y elegí Compartir → Agregar a pantalla de inicio. Abrí BATBOX desde ese ícono. Para recuperar tu participación ahí, copiá el enlace privado y usá «Abrir mi ticket» en Rifas.</p>;
  }
  if (setup.platform === 'unsupported') return <p className="rf-muted">Este navegador no admite avisos push en este contexto. Podés consultar Mis avisos desde tu ticket.</p>;
  if (setup.platform === 'denied') return <p className="rf-muted">El navegador bloqueó los avisos. Revisá los permisos del sitio o los ajustes de notificaciones de BATBOX y después volvé a abrir el ticket.</p>;
  if (setup.setupError) return <p role="status" className="rf-muted">{setup.setupError} <button className="btn text" type="button" onClick={setup.prepare}>Reintentar conexión</button></p>;
  return null;
}

export function TicketNotices({ token, isNew }) {
  const { user, access, simulated } = useAuth();
  const owner = user?.id ?? null;
  const setup = usePushSetup();
  const [inbox, setInbox] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hasSubscription, setHasSubscription] = useState(false);
  const [open, setOpen] = useState(false);
  const reload = useCallback(async () => {
    const data = await push.getInbox(token, owner);
    setInbox(data);
    return data;
  }, [token, owner]);
  useEffect(() => {
    if (access === 'loading' || simulated) return;
    let current = true;
    const load = () => reload().catch((e) => { if (current) setError(e.message); });
    load();
    addEventListener('focus', load);
    return () => { current = false; removeEventListener('focus', load); };
  }, [access, simulated, reload]);
  const entry = inbox?.entry_id;
  const raffle = inbox?.raffle_id;
  useEffect(() => {
    if (entry && isNew && !inbox.subscribed && push.hasFollow(raffle, owner)) {
      push.followNewTicket({ owner, token, raffle, entry }).then(reload).catch(() => {});
    }
  }, [entry, inbox?.subscribed, isNew, owner, raffle, token, reload]);
  useEffect(() => {
    push.subscriptionPresent(setup.prepared).then(setHasSubscription).catch(() => setHasSubscription(false));
  }, [setup.prepared, inbox?.subscribed, setup.platform]);
  const optedIn = push.hasFollow(raffle, owner);
  const showingPush = inbox?.subscribed && hasSubscription && setup.platform === 'granted' && optedIn;
  const run = async (action) => {
    setBusy(true);
    setError('');
    try { await action(); await reload(); } catch (e) {
      if (push.platformState() !== 'denied') setError(e.message);
    } finally { setBusy(false); setup.refreshPlatform(); }
  };
  if (simulated) return null;
  const unread = inbox?.events.filter((n) => !n.read_at).length ?? 0;

  return (
    <section className="card rf-push" aria-label="Avisos de esta participación">
      <h2>Notificaciones de esta rifa</h2>
      <p>Te avisamos cuando te sumes a la rifa, cuando confirmemos el pago de tus números y si tus reservas están por vencer, vencieron o fueron canceladas.</p>
      {showingPush ? <p role="status">{inbox.push_enabled ? 'Avisos push activos en este dispositivo. La entrega depende del navegador y del dispositivo.'
        : 'Este dispositivo está vinculado. Los envíos push de rifas están pausados.'}</p>
        : setup.platform === 'granted' && <p className="rf-muted">Permiso concedido. Falta vincular esta participación.</p>}
      {!showingPush && setup.platform === 'pending' && <p className="rf-muted">Permiso pendiente.</p>}
      <PushHelp setup={setup} />
      <div className="rf-actions">
        {!showingPush && ['pending', 'granted'].includes(setup.platform) && <button type="button" className="btn primary" disabled={busy || !entry || !setup.prepared || access === 'loading'} onClick={() => run(() => push.enablePush(setup.prepared, { owner, token, raffle, entry }))}>Activar avisos de esta rifa</button>}
        {optedIn && <button type="button" className="btn ghost" disabled={busy} onClick={() => run(() => push.disableRaffle(token, raffle, owner))}>Desactivar avisos de esta rifa</button>}
        {optedIn && <button type="button" className="btn text" disabled={busy} onClick={() => run(async () => {
          await push.switchPushOwner(owner, true);
          await push.switchPushOwner(owner);
        })}>Desvincular este dispositivo</button>}
      </div>
      {error && <p role="alert" className="feedback-error">{error}</p>}
      <details open={open} onToggle={(ev) => setOpen(ev.currentTarget.open)}>
        <summary>Mis avisos{unread > 0 && ` · ${unread} sin leer`}</summary>
        {unread > 0 && <button type="button" className="btn text" disabled={busy} onClick={() => run(() => push.markRead(token, null))}>Marcar todos como leídos</button>}
        {inbox && !inbox.events.length && <p className="rf-muted">Todavía no hay avisos.</p>}
        <ul className="rf-push-list">
          {inbox?.events.map((n) => (
            <li key={n.id} className={n.read_at ? '' : 'rf-push-unread'}>
              <b>{n.title}</b>
              <small>{fmtDate(n.created_at)} · {push.DELIVERY_LABELS[n.push_status] || 'Aviso generado'}{n.read_at ? ' · Leído' : ' · Sin leer'}</small>
              <p>{n.body}</p>
              {!n.read_at && <button type="button" className="btn text" disabled={busy} onClick={() => run(() => push.markRead(token, n.id))}>Marcar como leído</button>}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

const variables = {
  registered: ['rifa'], confirmed: ['rifa', 'numeros'], reminder: ['rifa', 'numeros', 'fecha', 'hora'],
  expired: ['rifa', 'numeros'], cancelled: ['rifa', 'numeros'],
};
const examples = { rifa: 'Rifa de prueba', numeros: '03, 09, 21', fecha: '25/12/2026', hora: '18:00' };
const sample = (s) => s.replace(/\{([a-z_]+)\}/g, (raw, name) => examples[name] || raw);
const attemptLabels = { sending: 'En curso', accepted: 'Aceptado', retry: 'Reintento programado', skipped: 'Omitido',
  failed: 'Falló', gone: 'Suscripción vencida', timeout: 'Sin respuesta' };

export function RafflePushAdmin() {
  const owner = useAuth().user?.id ?? null;
  const setup = usePushSetup();
  const [config, setConfig] = useState(null);
  const [selected, setSelected] = useState('registered');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const reload = () => push.getPushAdmin().then(setConfig);
  useEffect(() => { reload().catch((e) => setError(e.message)); }, []);
  const run = async (action, notice) => {
    setBusy(true); setMsg(''); setError('');
    try { await action(); setMsg(notice); } catch (e) { setError(e.message); }
    finally { setBusy(false); setup.refreshPlatform(); }
  };
  const update = (patch) => { setConfig((c) => ({ ...c, ...patch })); setDirty(true); };
  const setRule = (patch) => update({ rules: { ...config.rules, [selected]: { ...config.rules[selected], ...patch } } });
  const rule = config?.rules[selected];
  return (
    <section className="card rf-push">
      <header className="rf-mine-head"><h2>Notificaciones de rifas</h2><a className="btn ghost" href="#/admin?tab=rifas">Volver a Mis rifas</a></header>
      {error && <p role="alert" className="feedback-error">{error}</p>}
      {msg && <p role="status">{msg}</p>}
      {config && <>
        <p>Los interruptores controlan Web Push. Los avisos se guardan en la bandeja del ticket.</p>
        <form onSubmit={(ev) => {
          ev.preventDefault();
          run(async () => { await push.savePushAdmin(config); setDirty(false); await reload(); }, 'Configuración guardada.');
        }}>
          <label className="rf-push-check"><input type="checkbox" checked={config.enabled} onChange={(e) => update({ enabled: e.target.checked })} /> Habilitar Web Push</label>
          <label className="field"><span>Anticipación del recordatorio (minutos)</span><input type="number" min="5" max="10080" required value={config.lead_minutes} onChange={(e) => update({ lead_minutes: e.target.value })} /></label>
          <label className="field"><span>Evento</span><select value={selected} onChange={(e) => setSelected(e.target.value)}>{Object.keys(variables).map((k) => <option key={k} value={k}>{push.EVENT_LABELS[k]}</option>)}</select></label>
          <label className="rf-push-check"><input type="checkbox" checked={rule.enabled} onChange={(e) => setRule({ enabled: e.target.checked })} /> Enviar Web Push para este evento</label>
          <label className="field"><span>Título</span><input required maxLength={100} value={rule.title} onChange={(e) => setRule({ title: e.target.value })} /></label>
          <label className="field"><span>Mensaje</span><textarea required rows={3} maxLength={450} value={rule.body} onChange={(e) => setRule({ body: e.target.value })} /></label>
          <p className="rf-muted">Variables admitidas: {variables[selected].map((v) => `{${v}}`).join(', ')}. Evitá incluir datos personales o de pago.</p>
          <aside className="rf-push-preview"><small>Vista previa</small><b>{sample(rule.title)}</b><p>{sample(rule.body)}</p></aside>
          <div className="rf-actions">
            <button type="submit" className="btn primary" disabled={!dirty || busy}>Guardar configuración</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => update({ rules: Object.fromEntries(Object.entries(config.rules).map(([k, r]) => [k, { ...config.defaults[k], enabled: r.enabled }])) })}>Restaurar textos predeterminados</button>
          </div>
        </form>
        <section>
          <h3>Prueba en este dispositivo</h3>
          <p className="rf-muted">La prueba usa la plantilla guardada del evento seleccionado y sólo va a este dispositivo.</p>
          <PushHelp setup={setup} />
          <div className="rf-actions">
            <button type="button" className="btn ghost" disabled={busy || !setup.prepared || !['pending', 'granted'].includes(setup.platform)}
              onClick={() => run(() => push.enablePush(setup.prepared, { owner, admin: true }), 'Dispositivo vinculado para pruebas.')}>Vincular dispositivo de prueba</button>
            <button type="button" className="btn primary" disabled={busy || dirty || setup.platform !== 'granted'}
              onClick={() => run(async () => { await push.sendPushTest(selected, owner); await reload(); }, 'Prueba en cola. Consultá el historial para ver el resultado.')}>Enviar prueba</button>
          </div>
        </section>
        <section>
          <h3>Historial · {config.devices} suscripciones activas</h3>
          <button type="button" className="btn text" disabled={busy || dirty} onClick={() => run(reload, 'Historial actualizado.')}>Actualizar historial</button>
          {config.history.length === 0 && <p className="rf-muted">Sin eventos todavía.</p>}
          <ul className="rf-push-list">{config.history.map((e) => (
            <li key={e.id}>
              <b>{push.EVENT_LABELS[e.kind]}{e.slug && ` · ${e.slug}`}</b><small>{fmtDate(e.created_at)} · {e.title}</small>
              {e.skip_reason && <p>{e.skip_reason}</p>}
              {!e.deliveries.length && !e.skip_reason && <p>{e.eligible ? 'Aviso generado · sin dispositivos destinatarios' : 'Aviso generado · push desactivado'}</p>}
              {e.deliveries.map((d, i) => <details key={i}>
                <summary>{push.DELIVERY_LABELS[d.status]} · {d.attempts} intentos{d.error && ` · ${d.error}`}</summary>
                {d.log.map((a) => <p key={a.attempt}>{fmtDate(a.at)} · Intento {a.attempt} · {attemptLabels[a.result]}{a.detail && ` · ${a.detail}`}</p>)}
              </details>)}
            </li>
          ))}</ul>
        </section>
      </>}
    </section>
  );
}
