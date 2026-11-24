import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import * as api from '../lib/rifasApi.js';
import { navigate } from '../lib/router.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/ui.jsx';
import '../styles/rifas.css';

// BAT RIFAS — vistas públicas (sin cuenta):
//   #/rifas/<slug>      talonario
//   #/rifas/p/<token>   participación privada (enlace personal)
//   #/rifas/v/<código>  verificación pública del QR de un ticket

// Etapa de prueba: SOLO ADMINS (la base también lo exige con bb_rf_admin_only()).
const ADMIN_ONLY = true;

export default function Rifas({ route }) {
  const { isAdmin, access } = useAuth();
  const [, a, b] = route.parts;
  if (ADMIN_ONLY && !isAdmin) {
    if (access === 'loading') return <Loading />;
    return (
      <div className="narrow rf">
        <Empty icon="lock" title="BAT RIFAS está en prueba" text="Por ahora solo lo pueden usar los administradores. Muy pronto se abre para toda la comunidad." />
        {access !== 'member' && <a className="btn primary" href="#/acceso">Ingresar</a>}
      </div>
    );
  }
  if (a === 'p' && b) return <EntryView token={b} />;
  if (a === 'v' && b) return <VerifyView code={b} />;
  if (a) return <RaffleView slug={a} />;
  return (
    <div className="narrow rf">
      <Empty icon="star" title="BAT RIFAS" text="Abrí el enlace de la rifa que te compartieron para ver el talonario." />
    </div>
  );
}

function Loading() { return <div className="rf-center"><span className="spinner" aria-label="Cargando" /></div>; }

function Copy({ text, label = 'Copiar enlace' }) {
  const [done, setDone] = useState(false);
  const go = async () => {
    try { await navigator.clipboard.writeText(text); } catch {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 1800);
  };
  return <button type="button" className="btn ghost" onClick={go}><Icon name={done ? 'check' : 'link'} size={16} /> {done ? 'Copiado' : label}</button>;
}

function ShareBar({ raffle }) {
  const url = api.shareUrl(raffle.slug);
  const msg = `${raffle.title} — elegí tus números acá: ${url}`;
  return (
    <div className="rf-share">
      <a className="btn primary" href={api.whatsappShare(msg)} target="_blank" rel="noopener noreferrer"><Icon name="message" size={16} /> Compartir por WhatsApp</a>
      <Copy text={url} />
    </div>
  );
}

function StatusBanner({ status }) {
  if (status === 'published') return null;
  const t = {
    paused: ['clock', 'Las reservas están pausadas por el momento. Volvé a mirar en un rato.'],
    closed: ['lock', 'Esta rifa ya cerró. ¡Gracias por participar! El sorteo se hace por fuera de BATBOX.'],
    draft: ['edit', 'Vista previa de un borrador: solo la ves vos como admin.'],
  }[status] || ['alert', 'Esta rifa no está disponible.'];
  return <div className={'rf-banner ' + status} role="status"><Icon name={t[0]} size={18} /> {t[1]}</div>;
}

// ---------------------------------------------------------------------
// Talonario
// ---------------------------------------------------------------------
const BLOCK = 100;

function RaffleView({ slug }) {
  const [raffle, setRaffle] = useState(undefined);
  const [error, setError] = useState('');
  const [sel, setSel] = useState([]);
  const [step, setStep] = useState('pick'); // pick | form
  const [block, setBlock] = useState(0);
  const [find, setFind] = useState('');
  const [flash, setFlash] = useState(null);
  const load = useCallback(() => api.getRaffle(slug).then((r) => { setRaffle(r); setError(''); }).catch((e) => { setError(e.message); setRaffle(null); }), [slug]);
  useEffect(() => { load(); }, [load]);

  const taken = useMemo(() => {
    const m = new Map();
    raffle?.held?.forEach((n) => m.set(n, 'held'));
    raffle?.sold?.forEach((n) => m.set(n, 'sold'));
    return m;
  }, [raffle]);

  if (raffle === undefined) return <Loading />;
  if (!raffle) return <div className="narrow rf"><Empty icon="alert" title="No encontramos esta rifa" text={error || 'Revisá el enlace o pedile uno nuevo a quien te lo pasó.'} /></div>;

  const total = raffle.num_to - raffle.num_from + 1;
  const free = total - taken.size;
  const open = raffle.status === 'published';
  const blocks = Math.ceil(total / BLOCK);
  const start = raffle.num_from + block * BLOCK;
  const nums = Array.from({ length: Math.min(BLOCK, raffle.num_to - start + 1) }, (_, i) => start + i);
  const toggle = (n) => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : s.length >= raffle.max_per_entry ? s : [...s, n].sort((x, y) => x - y)));
  const goFind = (e) => {
    e.preventDefault();
    const n = parseInt(find, 10);
    if (Number.isNaN(n) || n < raffle.num_from || n > raffle.num_to) { setFlash({ n: null, msg: `Ese número no está en el talonario (${api.fmtNum(raffle.num_from, raffle.num_to)} a ${api.fmtNum(raffle.num_to, raffle.num_to)}).` }); return; }
    setBlock(Math.floor((n - raffle.num_from) / BLOCK));
    const st = taken.get(n);
    setFlash({ n, msg: st ? `El ${api.fmtNum(n, raffle.num_to)} ya está ${st === 'sold' ? 'vendido' : 'reservado'}.` : `El ${api.fmtNum(n, raffle.num_to)} está libre.` });
    setTimeout(() => document.getElementById('rf-n-' + n)?.focus(), 50);
  };

  return (
    <div className="rf">
      <StatusBanner status={raffle.status} />
      <header className="rf-hero card">
        {raffle.cover_url && <img className="rf-cover" src={raffle.cover_url} alt="" loading="eager" />}
        <div className="rf-hero-txt">
          <span className="rf-kicker">BAT RIFAS · Makers 3DBAT</span>
          <h1>{raffle.title}</h1>
          {raffle.prizes?.length > 0 && (
            <ul className="rf-prizes">{raffle.prizes.map((p, i) => <li key={i}><Icon name="trophy" size={16} /> <span>{raffle.prizes.length > 1 && <b>{i + 1}° premio: </b>}{p}</span></li>)}</ul>
          )}
          <div className="rf-facts">
            <div><small>Precio por número</small><b>{api.money(raffle.price_cents)}</b></div>
            <div><small>Sorteo (informativo)</small><b>{raffle.draw_at ? api.fmtDate(raffle.draw_at) : 'A confirmar'}</b></div>
            <div><small>Disponibles</small><b>{free} de {total}</b></div>
          </div>
          {raffle.draw_at && <small className="rf-muted">Horario de Buenos Aires. El sorteo se hace por fuera de BATBOX con el procedimiento de la comunidad.</small>}
        </div>
      </header>
      {raffle.description && <section className="card rf-text"><p>{raffle.description}</p></section>}
      <ShareBar raffle={raffle} />

      {step === 'pick' && (
        <section className="card rf-board" aria-labelledby="rf-board-h">
          <div className="rf-board-head">
            <h2 id="rf-board-h">Elegí tus números</h2>
            <form className="rf-find" onSubmit={goFind} role="search">
              <div className="pink-input"><input inputMode="numeric" value={find} onChange={(e) => setFind(e.target.value.replace(/\D/g, ''))} placeholder="Buscar número" aria-label="Buscar número" /></div>
              <button className="btn ghost" type="submit"><Icon name="search" size={16} /> Buscar</button>
            </form>
          </div>
          {flash && <p className="rf-flash" role="status">{flash.msg}</p>}
          <ul className="rf-legend" aria-label="Referencias">
            <li><span className="rf-sw free" /> Libre</li>
            <li><span className="rf-sw mine">✓</span> Elegido</li>
            <li><span className="rf-sw held">⏳</span> Reservado</li>
            <li><span className="rf-sw sold">✕</span> Vendido</li>
          </ul>
          {blocks > 1 && (
            <div className="rf-blocks" role="tablist" aria-label="Bloques de números">
              {Array.from({ length: blocks }, (_, i) => (
                <button key={i} type="button" role="tab" aria-selected={i === block} className={'opt' + (i === block ? ' active' : '')} onClick={() => setBlock(i)}>
                  {api.fmtNum(raffle.num_from + i * BLOCK, raffle.num_to)}–{api.fmtNum(Math.min(raffle.num_from + (i + 1) * BLOCK - 1, raffle.num_to), raffle.num_to)}
                </button>))}
            </div>
          )}
          <div className="rf-grid" role="group" aria-label="Números">
            {nums.map((n) => {
              const st = taken.get(n); const mine = sel.includes(n);
              const label = api.fmtNum(n, raffle.num_to);
              return (
                <button key={n} id={'rf-n-' + n} type="button" className={'rf-n ' + (mine ? 'mine' : st || 'free') + (flash?.n === n ? ' flash' : '')}
                  disabled={!!st || !open} aria-pressed={mine}
                  aria-label={`Número ${label}${st === 'sold' ? ', vendido' : st === 'held' ? ', reservado' : mine ? ', elegido' : ', libre'}`}
                  onClick={() => toggle(n)}>{label}{st === 'held' && <i aria-hidden>⏳</i>}{st === 'sold' && <i aria-hidden>✕</i>}</button>);
            })}
          </div>
          {open && free === 0 && <p className="rf-banner closed">No quedan números disponibles.</p>}
          {sel.length >= raffle.max_per_entry && <p className="rf-muted">Llegaste al máximo de {raffle.max_per_entry} números por reserva.</p>}
        </section>
      )}

      {step === 'form' && <ReserveForm raffle={raffle} sel={sel} setSel={setSel} onBack={() => setStep('pick')} reload={load} />}

      {step === 'pick' && open && (
        <div className="rf-cart" aria-live="polite">
          <div><small>{sel.length ? `${sel.length} número${sel.length > 1 ? 's' : ''}: ${sel.map((n) => api.fmtNum(n, raffle.num_to)).join(', ')}` : 'Tocá los números que quieras'}</small>
            <b>{api.money(raffle.price_cents * sel.length)}</b></div>
          <button type="button" className="btn primary" disabled={!sel.length} onClick={() => { setStep('form'); window.scrollTo(0, 0); }}>Continuar</button>
        </div>
      )}

      <details className="card rf-terms"><summary>Bases y condiciones (versión {raffle.terms_version})</summary><p>{raffle.terms}</p></details>
      {raffle.support_contact && <p className="rf-muted rf-center-txt">¿Dudas? {raffle.support_contact}</p>}
    </div>
  );
}

function ReserveForm({ raffle, sel, setSel, onBack, reload }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', accept: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [taken, setTaken] = useState([]);
  const key = useRef(crypto.randomUUID());   // misma clave = misma operación (doble clic / reintento)
  const set = (x) => setF((c) => ({ ...c, ...x }));
  const fmt = (n) => api.fmtNum(n, raffle.num_to);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setTaken([]);
    try {
      const r = await api.reserve(raffle.slug, { numbers: sel, name: f.name, email: f.email, phone: f.phone, terms_version: raffle.terms_version, client_key: key.current });
      if (r.ok) { api.flushMail(r.token); navigate('/rifas/p/' + r.token); return; }
      setError(r.error);
      if (r.taken?.length) { setTaken(r.taken); setSel((s) => s.filter((n) => !r.taken.includes(n))); reload(); }
      if (r.terms_version) reload();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <form className="card rf-form" onSubmit={submit} noValidate>
      <h2>Tus datos</h2>
      <div className="rf-summary">
        <div><small>Números</small><b>{sel.map(fmt).join(', ') || '—'}</b></div>
        <div><small>Total a transferir</small><b>{api.money(raffle.price_cents * sel.length)}</b></div>
      </div>
      {taken.length > 0 && (
        <div className="feedback-error" role="alert">Se ocuparon: <b>{taken.map(fmt).join(', ')}</b>. Los sacamos de tu selección; podés seguir con el resto o elegir otros.</div>
      )}
      <label className="field"><span>Nombre y apellido</span><div className="pink-input"><input required autoComplete="name" maxLength={80} value={f.name} onChange={(e) => set({ name: e.target.value })} /></div></label>
      <label className="field"><span>Email (te mandamos el ticket)</span><div className="pink-input"><input required type="email" inputMode="email" autoComplete="email" maxLength={120} value={f.email} onChange={(e) => set({ email: e.target.value })} /></div></label>
      <label className="field"><span>Teléfono / WhatsApp{raffle.require_phone ? '' : ' (opcional)'}</span><div className="pink-input"><input type="tel" inputMode="tel" autoComplete="tel" maxLength={24} placeholder="11 5555 5555" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></div></label>
      <label className="nb-pref rf-accept"><input type="checkbox" checked={f.accept} onChange={(e) => set({ accept: e.target.checked })} /> Leí y acepto las <a href="#rf-bases" onClick={(e) => { e.preventDefault(); document.querySelector('.rf-terms')?.setAttribute('open', ''); document.querySelector('.rf-terms')?.scrollIntoView({ behavior: 'smooth' }); }}>bases (versión {raffle.terms_version})</a>.</label>
      <p className="rf-muted">Tenés {raffle.pay_hours} h para transferir y adjuntar el comprobante. Si no, los números se liberan solos.</p>
      {error && !taken.length && <div className="feedback-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn text" onClick={onBack}>Volver a los números</button>
        <button type="submit" className="btn primary" disabled={busy || !sel.length || !f.accept || f.name.trim().length < 2 || !f.email.includes('@') || (raffle.require_phone && f.phone.replace(/\D/g, '').length < 6)}>
          {busy ? <><span className="spinner xs" /> Reservando…</> : 'Reservar números'}</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Participación privada
// ---------------------------------------------------------------------
function Qr({ text, size = 132 }) {
  const svg = useMemo(() => { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }, [text]);
  return <div className="rf-qr" style={{ width: size, height: size }} role="img" aria-label="Código QR de verificación" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Countdown({ until }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return <b>venció</b>;
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  return <b>{h ? `${h} h ` : ''}{m} min</b>;
}

function EntryView({ token }) {
  const [e, setE] = useState(undefined);
  const [error, setError] = useState('');
  const load = useCallback(() => api.getEntry(token).then(setE).catch((err) => { setError(err.message); setE(null); }), [token]);
  useEffect(() => { load(); }, [load]);
  if (e === undefined) return <Loading />;
  if (!e) return <div className="narrow rf"><Empty icon="lock" title="No encontramos esta participación" text={error || 'El enlace puede estar incompleto. Buscá el correo de BAT RIFAS y abrilo desde ahí.'} /></div>;
  const st = api.ENTRY_STATUS[e.status];
  const fmt = (n) => api.fmtNum(n, e.raffle.num_to);
  const myUrl = api.entryUrl(token);
  return (
    <div className="rf narrow">
      <a className="rf-back" href={'#/rifas/' + e.raffle.slug}>← {e.raffle.title}</a>
      <section className="card rf-entry">
        <span className={'chip ' + st.cls}><Icon name={st.icon} size={14} /> {st.label}</span>
        <h1>Tu participación</h1>
        <div className="rf-summary">
          <div><small>Números</small><b>{e.numbers.map(fmt).join(', ')}</b></div>
          <div><small>Importe</small><b>{api.money(e.total_cents)}</b></div>
          <div><small>Código</small><b className="rf-code">{e.code}</b></div>
        </div>
        {['pending', 'rejected'].includes(e.status) && e.expires_at && (
          <p className="rf-deadline"><Icon name="clock" size={16} /> Tenés hasta el <b>{api.fmtDate(e.expires_at)}</b> (quedan <Countdown until={e.expires_at} />) para enviar el comprobante.</p>
        )}
        {e.status === 'rejected' && <div className="feedback-error" role="alert"><b>Rechazamos tu comprobante:</b> {e.reject_reason}{e.can_upload ? ' Podés enviar uno nuevo.' : ''}</div>}
        {e.status === 'review' && <p className="rf-note"><Icon name="search" size={16} /> Recibimos tu comprobante. Lo revisamos contra la cuenta y te avisamos por correo. Tus números siguen apartados.</p>}
        {e.status === 'expired' && <p className="rf-note">El plazo venció sin comprobante y los números se liberaron. Si querés participar, volvé al talonario.</p>}
        {e.status === 'cancelled' && <p className="rf-note">Esta participación se canceló{e.cancel_reason ? `: ${e.cancel_reason}` : ''}.</p>}
      </section>

      {e.raffle.transfer_info && ['pending', 'rejected'].includes(e.status) && (
        <section className="card rf-pay">
          <h2>Cómo pagar</h2>
          <p className="rf-pre">{e.raffle.transfer_info}</p>
          <p>Transferí <b>{api.money(e.total_cents)}</b> exactos y adjuntá el comprobante acá abajo.</p>
          <Copy text={e.raffle.transfer_info} label="Copiar datos de pago" />
        </section>
      )}
      {e.can_upload && <ProofUpload token={token} onDone={load} />}

      {e.status === 'confirmed' && (
        <section className="rf-tickets" aria-label="Tickets">
          {e.tickets.map((t) => (
            <article key={t.verify_code} className="card rf-ticket">
              <div><span className="rf-kicker">{e.raffle.title}</span><div className="rf-ticket-n">{t.label}</div><small>Ticket válido · {e.name}</small></div>
              <Qr text={api.verifyUrl(t.verify_code)} />
            </article>))}
          <p className="rf-muted">Cada QR verifica solo la rifa, el número y si es válido. No muestra tus datos.</p>
        </section>
      )}

      <section className="card rf-keep">
        <b>Guardá este enlace</b>
        <p className="rf-muted">Es personal: con él volvés a esta página. También te lo mandamos por correo a {e.email}.</p>
        <Copy text={myUrl} label="Copiar mi enlace" />
      </section>
      {e.raffle.support_contact && <p className="rf-muted rf-center-txt">¿Dudas? {e.raffle.support_contact}</p>}
    </div>
  );
}

function ProofUpload({ token, onDone }) {
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = (f) => {
    setError('');
    if (!f) return;
    if (!api.PROOF_TYPES.includes(f.type)) { setError('Subí una foto (JPG, PNG, WebP) o un PDF.'); return; }
    if (f.size > api.PROOF_MAX) { setError('El archivo supera 5 MB. Probá con una captura.'); return; }
    setFile(f);
  };
  const send = async () => {
    setBusy(true); setError('');
    try { await api.uploadProof(token, file); onDone(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="card rf-upload">
      <h2>Adjuntar comprobante</h2>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" className="btn ghost wide" disabled={busy} onClick={() => input.current?.click()}><Icon name="image" size={16} /> {file ? `Cambiar: ${file.name}` : 'Elegir foto o PDF'}</button>
      <small className="rf-muted">JPG, PNG, WebP o PDF de hasta 5 MB. Adjuntar no confirma el pago: lo validamos contra la acreditación.</small>
      {error && <div className="feedback-error" role="alert">{error}</div>}
      <button type="button" className="btn primary wide" disabled={!file || busy} onClick={send}>{busy ? <><span className="spinner xs" /> Enviando…</> : 'Enviar comprobante'}</button>
    </section>
  );
}

function VerifyView({ code }) {
  const [v, setV] = useState(undefined);
  useEffect(() => { api.verifyTicket(code).then(setV).catch(() => setV({ found: false })); }, [code]);
  if (v === undefined) return <Loading />;
  return (
    <div className="rf narrow">
      <section className={'card rf-verify ' + (v.found && v.valid ? 'ok' : 'bad')}>
        <div className="big-ico"><Icon name={v.found && v.valid ? 'check' : 'x'} size={30} /></div>
        {v.found ? <>
          <h1>{v.valid ? 'Ticket válido' : 'Ticket NO válido'}</h1>
          <p>{v.raffle}</p>
          <div className="rf-ticket-n">{v.number}</div>
        </> : <><h1>Ticket inexistente</h1><p>Este código no corresponde a ningún ticket de BAT RIFAS.</p></>}
      </section>
    </div>
  );
}
