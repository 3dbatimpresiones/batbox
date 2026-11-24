import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import * as api from '../lib/rifasApi.js';
import { navigate } from '../lib/router.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/ui.jsx';
import RaffleVerify from '../components/RaffleVerify.jsx';
import '../styles/rifas.css';

// BAT RIFAS — vistas públicas:
//   #/rifas/<slug>               talonario
//   #/rifas/p/<token>[?nuevo=1]  ticket digital (enlace personal)
//   #/rifas/v/<código>           verificación pública del QR de un número

const ADMIN_ONLY = api.RIFAS_ADMIN_ONLY;

export default function Rifas({ route }) {
  const { isAdmin, access } = useAuth();
  const dec = (x) => { try { return x ? decodeURIComponent(x) : x; } catch { return x; } };
  const [, a0, b] = route.parts;
  const a = dec(a0);
  if (ADMIN_ONLY && !isAdmin) {
    if (access === 'loading') return <Loading />;
    return (
      <div className="narrow rf">
        <Empty icon="lock" title="BAT RIFAS está en prueba" text="Por ahora solo lo pueden usar los administradores. Muy pronto se abre para toda la comunidad." />
        {access !== 'member' && <a className="btn primary" href="#/acceso">Ingresar</a>}
      </div>
    );
  }
  if (a === 'p' && b) return <TicketView token={b} isNew={route.query.nuevo === '1'} />;
  if (a === 'v' && b) return <VerifyView code={b} />;
  if (a) return <RaffleView slug={a} isAdmin={isAdmin} />;
  return <RifasHome />;
}

// ---------------------------------------------------------------------
// #/rifas: rifas activas y la última finalizada con sus ganadores
// ---------------------------------------------------------------------
function Winners({ winners, title = 'Ganadores' }) {
  if (!winners?.length) return null;
  return (
    <section className="card rf-winners" aria-labelledby="rf-win-h">
      <h2 id="rf-win-h"><Icon name="trophy" size={20} /> {title}</h2>
      <ol className="rf-winlist">
        {winners.map((w) => (
          <li key={w.place}>
            <span className="rf-place" aria-hidden>{w.place}°</span>
            <div className="rf-win-txt"><small>{w.prize}</small><b>{w.name || 'Número no vendido'}</b></div>
            <span className="rf-win-n" aria-label={'Número ' + w.number}>{w.number}</span>
          </li>))}
      </ol>
      <RaffleVerify many={winners.length > 1} />
    </section>
  );
}

function RifasHome() {
  const [h, setH] = useState(undefined);
  const [error, setError] = useState('');
  useEffect(() => { api.getHome().then(setH).catch((e) => { setError(e.message); setH(null); }); }, []);
  if (h === undefined) return <Loading />;
  if (!h) return <div className="narrow rf"><Empty icon="alert" title="No pudimos cargar las rifas" text={error || 'Probá de nuevo en un rato.'} /></div>;
  const fin = h.finished;
  return (
    <div className="rf">
      <header className="rf-home-head"><span className="rf-kicker">BAT RIFAS · Makers 3DBAT</span><h1>{h.active.length ? '¡Rifa activa!' : 'Rifas'}</h1></header>
      {h.active.map((r) => {
        const pct = r.total ? Math.round((r.taken / r.total) * 100) : 0;
        const list = (r.prizes || []).flatMap((p) => String(p).split(/\n+/)).filter(Boolean);
        return (
          <Fragment key={r.slug}>
          <a className="card rf-live-card" href={'#/rifas/' + r.slug}>
            {r.cover_url ? <img src={r.cover_url} alt="" /> : <div className="rf-coverph"><Icon name="trophy" size={44} /><b>BAT RIFAS</b></div>}
            <div className="rf-live-txt">
              <span className="rf-live-badge">{r.status === 'paused' ? 'Reservas pausadas' : 'Activa · elegí tus números'}</span>
              <h2>{r.title}</h2>
              {list.length > 0 && <ol className="rf-prizelist mini">{list.map((p, i) => <li key={i}><span className="rf-place" aria-hidden>{i + 1}°</span><span>{p}</span></li>)}</ol>}
              <span className="rf-bar" aria-hidden><i style={{ width: pct + '%' }} /></span>
              <small>{pct}% vendido · {api.money(r.price_cents)} por número · {api.fmtDate(r.draw_at, false) || 'se sortea al agotar los números'}</small>
              <span className="btn primary">Participar</span>
            </div>
          </a>
          <RaffleVerify many={(r.prizes || []).length > 1} />
          {r.terms && (
            <section className="card rf-terms-card rf-terms-full" aria-label={'Bases y condiciones de ' + r.title}>
              <h2><Icon name="book" size={18} /> Bases y condiciones</h2>
              <div className="rf-terms-txt">{r.terms}</div>
              <a className="btn primary" href={'#/rifas/' + r.slug}>Ir al talonario y participar</a>
            </section>
          )}
          </Fragment>);
      })}
      {fin && (
        <section className="rf-finished" aria-labelledby="rf-fin-h">
          <div className="rf-fin-banner"><Icon name="trophy" size={22} /><div><small>{h.active.length ? 'Última rifa finalizada' : 'Rifa finalizada'}</small><h2 id="rf-fin-h">{fin.title}</h2></div></div>
          {fin.cover_url && <img className="rf-fin-cover" src={fin.cover_url} alt="" />}
          {fin.winners?.length ? <Winners winners={fin.winners} title={fin.winners.length > 1 ? 'Ganadores' : 'Ganador'} />
            : <p className="rf-note"><Icon name="clock" size={16} /> La rifa cerró. Los ganadores se informan acá apenas se haga el sorteo.</p>}
          <a className="rf-back" href={'#/rifas/' + fin.slug}>Ver el talonario de esta rifa →</a>
        </section>
      )}
      {!h.active.length && !fin && <Empty icon="star" title="Todavía no hay rifas" text="Cuando haya una rifa activa la vas a ver acá. ¡Atento al botón Rifas del menú!" />}
    </div>
  );
}

function Loading() { return <div className="rf-center"><span className="spinner" aria-label="Cargando" /></div>; }
const fmtOf = (r) => (n) => api.fmtNum(n, r.num_to, r.num_from);

function Qr({ text, size = 132 }) {
  const svg = useMemo(() => { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }, [text]);
  return <div className="rf-qr" style={{ width: size, height: size }} role="img" aria-label="Código QR" dangerouslySetInnerHTML={{ __html: svg }} />;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
  }
}
function Copy({ text, label = 'Copiar enlace', className = 'btn ghost' }) {
  const [done, setDone] = useState(false);
  return <button type="button" className={className} onClick={async () => { await copyText(text); setDone(true); setTimeout(() => setDone(false), 1800); }}><Icon name={done ? 'check' : 'link'} size={16} /> {done ? 'Copiado' : label}</button>;
}

function Modal({ title, onClose, children, labelId = 'rf-modal-h' }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose?.(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal rf-modal" role="dialog" aria-modal="true" aria-labelledby={labelId} onClick={(e) => e.stopPropagation()}>
        <div className="rf-modal-head"><h2 id={labelId}>{title}</h2>{onClose && <button type="button" className="mini-btn" aria-label="Cerrar" onClick={onClose}>×</button>}</div>
        {children}
      </div>
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
const PAGE = 100;

function RaffleView({ slug, isAdmin }) {
  const [raffle, setRaffle] = useState(undefined);
  const [error, setError] = useState('');
  const [sel, setSel] = useState([]);
  const [onlyFree, setOnlyFree] = useState(false);
  const [page, setPage] = useState(0);
  const [find, setFind] = useState('');
  const [flash, setFlash] = useState(null);
  const [modal, setModal] = useState(null); // participar | bases | verificar | organizador | menu
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

  const fmt = fmtOf(raffle);
  const total = raffle.num_to - raffle.num_from + 1;
  const free = total - taken.size;
  const pct = Math.round((taken.size / total) * 100);
  const open = raffle.status === 'published';
  const all = [];
  for (let n = raffle.num_from; n <= raffle.num_to; n++) if (!onlyFree || !taken.has(n) || sel.includes(n)) all.push(n);
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const pg = Math.min(page, pages - 1);
  const nums = all.slice(pg * PAGE, pg * PAGE + PAGE);
  const toggle = (n) => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : s.length >= raffle.max_per_entry ? s : [...s, n].sort((x, y) => x - y)));
  const shareLink = api.shareUrl(raffle.slug);
  const goFind = (e) => {
    e.preventDefault();
    const n = parseInt(find, 10);
    if (Number.isNaN(n) || n < raffle.num_from || n > raffle.num_to) { setFlash({ n: null, msg: `Ese número no está en el talonario (${fmt(raffle.num_from)} a ${fmt(raffle.num_to)}).` }); return; }
    setOnlyFree(false); setPage(Math.floor((n - raffle.num_from) / PAGE));
    const st = taken.get(n);
    setFlash({ n, msg: st ? `El ${fmt(n)} ya está ${st === 'sold' ? 'vendido' : 'apartado'}.` : `El ${fmt(n)} está libre.` });
    setTimeout(() => document.getElementById('rf-n-' + n)?.focus(), 60);
  };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: raffle.title, text: `${raffle.title} — elegí tus números`, url: shareLink }); return; } catch { /* cancelado */ } }
    setModal('compartir');
  };

  return (
    <div className="rf rf-wide">
      <StatusBanner status={raffle.status} />
      {raffle.winners?.length > 0 && <Winners winners={raffle.winners} title={raffle.winners.length > 1 ? '¡Ganadores!' : '¡Ganador!'} />}
      <div className="rf-layout">
        <section className="rf-left">
          <header className="rf-head">
            <span className="rf-avatar">{raffle.cover_url ? <img src={raffle.cover_url} alt="" /> : <Icon name="star" size={22} />}</span>
            <div><h1 className={'rf-title ' + (raffle.title.length > 26 ? 'xl' : raffle.title.length > 16 ? 'l' : '')}>{raffle.title}</h1><small>{(api.fmtDate(raffle.draw_at, false) || 'Se sortea al agotar los números').toUpperCase()}</small></div>
          </header>
          <div className="rf-coverbox card">{raffle.cover_url ? <img src={raffle.cover_url} alt={'Portada de ' + raffle.title} /> : <div className="rf-coverph"><Icon name="trophy" size={48} /><b>BAT RIFAS</b><small>Makers 3DBAT</small></div>}</div>
          {raffle.prizes?.length > 0 && (() => {
            const list = raffle.prizes.flatMap((p) => String(p).split(/\n+/)).map((p) => p.trim()).filter(Boolean);
            return (
              <section className="card rf-prizecard" aria-labelledby="rf-prize-h">
                <h2 id="rf-prize-h"><Icon name="trophy" size={18} /> {list.length > 1 ? `${list.length} ganadores` : 'Premio'}</h2>
                <ol className="rf-prizelist">{list.map((p, i) => <li key={i}><span className="rf-place" aria-hidden>{i + 1}°</span><span>{p}</span></li>)}</ol>
                <RaffleVerify many={list.length > 1} />
              </section>
            );
          })()}
          <section className="card rf-terms-card" aria-labelledby="rf-terms-h">
            <h2 id="rf-terms-h"><Icon name="book" size={18} /> Bases y condiciones</h2>
            <div className="rf-terms-txt" tabIndex={0}>{raffle.terms || 'Las bases todavía no se cargaron.'}</div>
          </section>
          {raffle.organizer && <div className="rf-org"><Icon name="user" size={22} /><div><small>Organizador</small><b>{raffle.organizer}</b></div></div>}
          <div className="rf-phoneqr card"><Qr text={shareLink} size={130} /><div><Icon name="sparkles" size={20} /><b>Escaneá el código para ver el talonario desde tu celular</b></div></div>
        </section>

        <section className="rf-right" aria-labelledby="rf-pick-h">
          <div className="rf-topbar">
            <div className="rf-progress" role="img" aria-label={`${pct}% del talonario ocupado`}><span className="rf-bar"><i style={{ width: pct + '%' }} /></span><small>{pct}%</small></div>
            <button type="button" className="icon-btn" aria-label="Compartir" onClick={share}><Icon name="send" size={18} /></button>
            <div className="rf-menuwrap">
              <button type="button" className="icon-btn" aria-label="Menú" aria-expanded={modal === 'menu'} onClick={() => setModal(modal === 'menu' ? null : 'menu')}><Icon name="more" size={18} /></button>
              {modal === 'menu' && (
                <div className="rf-dropdown" role="menu">
                  <button type="button" role="menuitem" onClick={() => setModal('verificar')}><Icon name="check" size={16} /> Verificar participación</button>
                  <button type="button" role="menuitem" onClick={() => setModal('organizador')}><Icon name="user" size={16} /> Organizador</button>
                  <button type="button" role="menuitem" onClick={() => { setModal(null); share(); }}><Icon name="send" size={16} /> Compartir</button>
                  {isAdmin && <>
                    <div className="rf-dd-sec">Administrador</div>
                    <a role="menuitem" href={`#/admin?tab=rifas&r=${raffle.id}`}><Icon name="clipboard" size={16} /> Administración</a>
                    <a role="menuitem" href={`#/admin?tab=rifas&r=${raffle.id}&v=ajustes`}><Icon name="edit" size={16} /> Ajustes</a>
                    <div className="rf-dd-sec">Mi cuenta</div>
                    <a role="menuitem" href="#/admin?tab=rifas"><Icon name="home" size={16} /> Mis rifas</a>
                  </>}
                </div>
              )}
            </div>
          </div>
          <div className="rf-pickhead">
            <h2 id="rf-pick-h">¡Elegí tus números!</h2>
            <button type="button" className={'rf-onlyfree' + (onlyFree ? ' on' : '')} aria-pressed={onlyFree} onClick={() => { setOnlyFree(!onlyFree); setPage(0); }}><Icon name="search" size={14} /> {onlyFree ? 'Solo disponibles' : 'Todos'}</button>
          </div>
          <form className="rf-find" onSubmit={goFind} role="search">
            <div className="pink-input"><input inputMode="numeric" value={find} onChange={(e) => setFind(e.target.value.replace(/\D/g, ''))} placeholder="Buscar número" aria-label="Buscar número" /></div>
            <button className="btn ghost" type="submit">Buscar</button>
          </form>
          {flash && <p className="rf-flash" role="status">{flash.msg}</p>}
          <ul className="rf-legend" aria-label="Referencias">
            <li><span className="rf-sw free" /> Libre</li><li><span className="rf-sw mine">✓</span> Elegido</li>
            <li><span className="rf-sw held">⏳</span> Apartado</li><li><span className="rf-sw sold">✕</span> Vendido</li>
          </ul>
          {pages > 1 && (
            <div className="rf-blocks" role="tablist" aria-label="Páginas de números">
              {Array.from({ length: pages }, (_, i) => (
                <button key={i} type="button" role="tab" aria-selected={i === pg} className={'opt' + (i === pg ? ' active' : '')} onClick={() => setPage(i)}>{fmt(all[i * PAGE])}–{fmt(all[Math.min((i + 1) * PAGE, all.length) - 1])}</button>))}
            </div>
          )}
          <div className="rf-grid" role="group" aria-label="Números">
            {nums.map((n) => {
              const st = taken.get(n); const mine = sel.includes(n); const label = fmt(n);
              return (
                <button key={n} id={'rf-n-' + n} type="button" className={'rf-n ' + (mine ? 'mine' : st || 'free') + (flash?.n === n ? ' flash' : '')}
                  disabled={!!st || !open} aria-pressed={mine}
                  aria-label={`Número ${label}${st === 'sold' ? ', vendido' : st === 'held' ? ', apartado' : mine ? ', elegido' : ', libre'}`}
                  onClick={() => toggle(n)}>{st ? <><span className="rf-n-ico" aria-hidden>{st === 'held' ? '⏳' : '✕'}</span><span className="rf-n-small">{label}</span></> : label}</button>);
            })}
          </div>
          {open && free === 0 && <p className="rf-banner closed">No quedan números disponibles.</p>}
          {(raffle.min_per_entry || 1) > 1 && <p className="rf-minbuy" role="note"><Icon name="alert" size={14} /> Compra mínima: <b>{raffle.min_per_entry} números</b>.</p>}
        </section>
      </div>

      <div className="rf-statsbar" aria-live="polite">
        {sel.length && open ? (
          <>
            <div className="rf-statsel"><b>{sel.map((n) => '#' + fmt(n)).join(' ')}</b><small>{api.money(raffle.price_cents * sel.length)} · {sel.length} número{sel.length > 1 ? 's' : ''}</small></div>
            <button type="button" className="btn text" onClick={() => setSel([])}>Limpiar</button>
            {sel.length < (raffle.min_per_entry || 1)
              ? <button type="button" className="btn primary" disabled>Elegí {(raffle.min_per_entry || 1) - sel.length} más</button>
              : <button type="button" className="btn primary" onClick={() => setModal('participar')}>Participar</button>}
          </>
        ) : (
          <>
            <div><b>{free}</b><small>Disponibles</small></div>
            <div><b>{api.money(raffle.price_cents)}</b><small>Por número</small></div>
            <div><b>{api.fmtDate(raffle.draw_at, false) ? new Date(raffle.draw_at).toLocaleDateString('es-AR', { timeZone: api.TZ, day: 'numeric', month: 'short' }) : 'Al agotar'}</b><small>Sorteo</small></div>
          </>
        )}
      </div>

      {modal === 'participar' && <ParticipateModal raffle={raffle} sel={sel} setSel={setSel} reload={load} onClose={() => setModal(null)} />}
      {modal === 'bases' && (
        <Modal title="¿Cómo participar?" onClose={() => setModal(null)}>
          <ol className="rf-steps"><li>Elegí tus números en el talonario.</li><li>Completá tus datos y reservá: quedan <b>apartados</b> por {raffle.pay_hours} h.</li><li>Transferí el total y subí el comprobante desde tu ticket digital.</li><li>Cuando verificamos la acreditación, tus números quedan <b>validados</b>.</li></ol>
          <details open><summary><b>Bases y condiciones (versión {raffle.terms_version})</b></summary><p className="rf-pre-txt">{raffle.terms}</p></details>
          <small className="rf-muted">{api.fmtDate(raffle.draw_at) ? `Sorteo: ${api.fmtDate(raffle.draw_at)} (hora de Buenos Aires).` : 'El sorteo se hace cuando se vendan todos los números.'} Se hace por fuera de BATBOX con el procedimiento de la comunidad.</small>
        </Modal>
      )}
      {modal === 'organizador' && (
        <Modal title="Organizador" onClose={() => setModal(null)}>
          <p><b>{raffle.organizer || 'Makers 3DBAT · 3DBAT IMPRESIONES'}</b></p>
          {raffle.support_contact && <p>Consultas: {raffle.support_contact}</p>}
        </Modal>
      )}
      {modal === 'compartir' && (
        <Modal title="Compartir" onClose={() => setModal(null)}>
          <div className="rf-actions">
            <a className="btn primary" href={api.whatsappShare(`${raffle.title} — elegí tus números acá: ${shareLink}`)} target="_blank" rel="noopener noreferrer"><Icon name="message" size={16} /> WhatsApp</a>
            <Copy text={shareLink} />
          </div>
        </Modal>
      )}
      {modal === 'verificar' && <VerifyModal onClose={() => setModal(null)} />}
    </div>
  );
}

function VerifyModal({ onClose }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const go = (e) => {
    e.preventDefault();
    const s = v.trim();
    const tok = /([0-9a-f]{64})/.exec(s)?.[1];
    const code = /\/v\/([0-9a-f]{20})/.exec(s)?.[1] || (/^[0-9a-f]{20}$/.test(s) ? s : null);
    if (tok) navigate('/rifas/p/' + tok);
    else if (code) navigate('/rifas/v/' + code);
    else setErr('Pegá el enlace de tu ticket (lo recibiste por correo) o el código del QR.');
  };
  return (
    <Modal title="Verificar participación" onClose={onClose}>
      <form onSubmit={go} className="rf-form-in">
        <label className="field"><span>Enlace del ticket o código del QR</span><div className="pink-input"><input autoFocus value={v} onChange={(e) => { setV(e.target.value); setErr(''); }} /></div></label>
        {err && <div className="feedback-error" role="alert">{err}</div>}
        <button type="submit" className="btn primary wide">Verificar</button>
      </form>
    </Modal>
  );
}

function ParticipateModal({ raffle, sel, setSel, reload, onClose }) {
  const [f, setF] = useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [taken, setTaken] = useState([]);
  const key = useRef(crypto.randomUUID());   // misma clave = misma operación (doble clic / reintento)
  const set = (x) => setF((c) => ({ ...c, ...x }));
  const fmt = fmtOf(raffle);
  const valid = sel.length && f.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.email) && (!raffle.require_phone || f.phone.replace(/\D/g, '').length >= 6);
  const submit = async (e) => {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true); setError(''); setTaken([]);
    try {
      const r = await api.reserve(raffle.slug, { numbers: sel, name: f.name, email: f.email, phone: f.phone, terms_version: raffle.terms_version, client_key: key.current });
      if (r.ok) { api.flushMail(r.token); navigate(`/rifas/p/${r.token}?nuevo=1`); return; }
      setError(r.error);
      if (r.taken?.length) { setTaken(r.taken); setSel((s) => s.filter((n) => !r.taken.includes(n))); reload(); }
      if (r.terms_version) reload();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Participar" onClose={busy ? undefined : onClose}>
      <form onSubmit={submit} className="rf-form-in" noValidate>
        <div className="rf-chosen-wrap"><small>Números elegidos:</small><div className="rf-chosen">{sel.map((n) => <span key={n}>#{fmt(n)}</span>)}</div></div>
        {taken.length > 0 && <div className="feedback-error" role="alert">Se ocuparon: <b>{taken.map(fmt).join(', ')}</b>. Los sacamos de tu selección; podés seguir con el resto o volver a elegir.</div>}
        <label className="field"><span>Nombre y apellido</span><div className="pink-input"><input autoFocus required autoComplete="name" maxLength={80} placeholder="Nombre y apellido" value={f.name} onChange={(e) => set({ name: e.target.value })} /></div></label>
        <label className="field"><span>Teléfono / WhatsApp{raffle.require_phone ? '' : ' (opcional)'}</span><div className="pink-input"><input type="tel" inputMode="tel" autoComplete="tel" maxLength={24} placeholder="11 5555 5555" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></div></label>
        <label className="field"><span>Email para enviarte el ticket de participación</span><div className="pink-input"><input required type="email" inputMode="email" autoComplete="email" maxLength={120} placeholder="Email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></div></label>
        <p className="rf-total"><b>Total: {api.money(raffle.price_cents * sel.length)}</b> ({sel.length} número{sel.length > 1 ? 's' : ''})</p>
        <div className="rf-terms-mini" tabIndex={0} aria-label="Bases y condiciones"><b>Bases y condiciones</b><p>{raffle.terms}</p></div>
        <small className="rf-muted">Al tocar «Aceptar y continuar» confirmás que leíste y aceptás las bases y condiciones (versión {raffle.terms_version}).</small>
        {error && !taken.length && <div className="feedback-error" role="alert">{error}</div>}
        <button type="submit" className="btn primary wide" disabled={busy || !valid}>{busy ? <><span className="spinner xs" /> Reservando…</> : 'Aceptar y continuar'}</button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Ticket digital (participación privada)
// ---------------------------------------------------------------------
const BADGE = {
  pending: ['blue', 'APARTADO', 'Estos números están reservados temporalmente.'],
  rejected: ['red', 'COMPROBANTE RECHAZADO', 'Subí un comprobante nuevo antes de que venza el plazo.'],
  review: ['orange', 'EN REVISIÓN', 'Recibimos tu comprobante. Un administrador va a revisar que el pago se haya acreditado y te avisamos por correo.'],
  confirmed: ['green', 'VALIDADO', '¡Pago verificado! Tus números ya participan.'],
  expired: ['gray', 'VENCIDO', 'El plazo venció sin comprobante y los números se liberaron.'],
  cancelled: ['gray', 'CANCELADO', 'Esta participación se canceló.'],
};

function Countdown({ until }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return <b>venció</b>;
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  return <b>{h ? `${h} h ` : ''}{m} min</b>;
}

function TicketView({ token, isNew }) {
  const [e, setE] = useState(undefined);
  const [error, setError] = useState('');
  const [intro, setIntro] = useState(isNew);
  const load = useCallback(() => api.getEntry(token).then(setE).catch((err) => { setError(err.message); setE(null); }), [token]);
  useEffect(() => { load(); }, [load]);
  if (e === undefined) return <Loading />;
  if (!e) return <div className="narrow rf"><Empty icon="lock" title="No encontramos esta participación" text={error || 'El enlace puede estar incompleto. Buscá el correo de BAT RIFAS y abrilo desde ahí.'} /></div>;
  const fmt = fmtOf(e.raffle);
  const myUrl = api.entryUrl(token);
  const [cls, label, note] = BADGE[e.status];
  const save = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Mi ticket · ' + e.raffle.title, url: myUrl }); return; } catch { /* cancelado */ } }
    await copyText(myUrl); alert('Copiamos el enlace de tu ticket. Guardalo: con él volvés a esta página.');
  };
  return (
    <div className="rf-ticketpage">
      <div className="rf-tk-band">
        <div className="rf-tk-top"><span>Ticket digital</span><button type="button" className="btn ghost rf-tk-save" onClick={save}><Icon name="download" size={16} /> Guardar</button></div>
        <h1>{e.raffle.title}</h1>
        <small>{api.fmtDate(e.raffle.draw_at, false) || 'Se sortea al agotar los números'}</small>
      </div>
      <article className="rf-tk-card">
        <Qr text={myUrl} size={200} />
        <hr className="rf-dash" />
        <p className="rf-code rf-tk-code">{e.code.toUpperCase()}</p>
        <p className="rf-tk-name">{e.name.toUpperCase()}</p>
        <div className="rf-tk-nums">{e.numbers.map((n) => <span key={n}>{fmt(n)}</span>)}</div>
        <span className={'rf-tk-badge ' + cls}>{label} · {e.numbers.length} NÚMERO{e.numbers.length > 1 ? 'S' : ''}</span>
        <p className={'rf-tk-note ' + cls}>{note}</p>
        {['pending', 'rejected'].includes(e.status) && e.expires_at && <p className="rf-tk-deadline"><Icon name="clock" size={14} /> Plazo: {api.fmtDate(e.expires_at)} (quedan <Countdown until={e.expires_at} />)</p>}
        {e.status === 'rejected' && <div className="feedback-error" role="alert"><b>Motivo:</b> {e.reject_reason}</div>}
        <hr className="rf-dash" />
        <p className="rf-tk-total">Total a transferir: <b>{api.money(e.total_cents)}</b></p>
        {e.raffle.transfer_info && ['pending', 'rejected'].includes(e.status) && (
          <div className="rf-tk-pay"><b>Datos para transferir</b><p className="rf-pre">{e.raffle.transfer_info}</p><Copy text={e.raffle.transfer_info} label="Copiar datos de pago" /></div>
        )}
        {e.can_upload && <ProofUpload token={token} onDone={load} />}
      </article>

      {e.status === 'confirmed' && (
        <section className="rf-tickets" aria-label="Números validados">
          {e.tickets.map((t) => (
            <article key={t.verify_code} className="card rf-ticket">
              <div><span className="rf-kicker">{e.raffle.title}</span><div className="rf-ticket-n">{t.label}</div><small>Número validado · {e.name}</small></div>
              <Qr text={api.verifyUrl(t.verify_code)} />
            </article>))}
          <p className="rf-muted">Cada QR verifica solo la rifa, el número y si es válido. No muestra tus datos.</p>
        </section>
      )}
      <p className="rf-muted rf-center-txt">Te mandamos este ticket por correo a {e.email}.{e.raffle.support_contact ? ` ¿Dudas? ${e.raffle.support_contact}` : ''}</p>
      <p className="rf-center-txt"><a className="rf-back" href={'#/rifas/' + e.raffle.slug}>← Volver al talonario</a></p>

      {intro && (
        <Modal title="Números apartados" onClose={() => setIntro(false)} labelId="rf-intro-h">
          <p>Revisá bien los requisitos para que tu participación sea válida.</p>
          <p>Para completar tu participación:</p>
          <ul className="rf-intro-list"><li><b>Realizá el pago</b> de {api.money(e.total_cents)}</li><li><b>Subí el comprobante</b> en este ticket</li></ul>
          {e.expires_at && <small className="rf-muted">Tenés tiempo hasta el {api.fmtDate(e.expires_at)}.</small>}
          <button type="button" className="btn primary wide" autoFocus onClick={() => { setIntro(false); navigate('/rifas/p/' + token); }}>Continuar</button>
        </Modal>
      )}
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
    <section className="rf-proof">
      <h2><Icon name="image" size={18} /> Enviar comprobante</h2>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" className="rf-proof-tile" disabled={busy} onClick={() => input.current?.click()}>
        <Icon name="download" size={28} /><span>{file ? file.name : 'Subir archivo'}</span></button>
      <p>Enviá una imagen o captura de tu comprobante para validar tu participación. JPG, PNG, WebP o PDF de hasta 5 MB.</p>
      {error && <div className="feedback-error" role="alert">{error}</div>}
      {file && <button type="button" className="btn dark wide" disabled={busy} onClick={send}>{busy ? <><span className="spinner xs" /> Enviando…</> : 'Enviar comprobante'}</button>}
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
          <h1>{v.valid ? 'Número válido' : 'Número NO válido'}</h1>
          <p>{v.raffle}</p>
          <div className="rf-ticket-n">{v.number}</div>
        </> : <><h1>Ticket inexistente</h1><p>Este código no corresponde a ningún ticket de BAT RIFAS.</p></>}
      </section>
    </div>
  );
}
