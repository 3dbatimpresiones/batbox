import { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/rifasApi.js';
import Icon from '../components/Icon.jsx';
import { Confirm, Empty } from '../components/ui.jsx';
import '../styles/rifas.css';

// Pestaña "Rifas" del panel (#/admin?tab=rifas). Solo administradores: cada función
// de la base vuelve a verificar is_admin() (sin permiso no se lee ni guarda nada).

const uuid = () => crypto.randomUUID();
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const EMPTY = { title: '', slug: '', cover_url: '', prizes: [''], description: '', terms: '', draw_at: '', price: '', num_from: 0, num_to: 99,
  max_per_entry: 10, pay_hours: 24, transfer_info: '', support_contact: '', require_phone: true, csv_profile: 'rifary' };

function Chip({ map, value }) {
  const s = map[value] || { label: value, cls: 'muted', icon: 'more' };
  return <span className={'chip ' + s.cls}><Icon name={s.icon} size={12} /> {s.short || s.label}</span>;
}

export default function AdminRifas() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState(null); // { mode: 'edit'|'manage', id }
  const load = useCallback(() => api.adminList().then((l) => { setList(l); setError(''); }).catch((e) => { setError(e.message); setList([]); }), []);
  useEffect(() => { load(); }, [load]);

  if (view?.mode === 'edit') return <Editor id={view.id} onClose={(id) => { load(); setView(id ? { mode: 'manage', id } : null); }} />;
  if (view?.mode === 'manage') return <Manage id={view.id} onBack={() => { load(); setView(null); }} onEdit={() => setView({ mode: 'edit', id: view.id })} onOpen={(id) => setView({ mode: 'manage', id })} />;
  return (
    <div className="cm-admin rf-admin">
      <div className="cm-mod-head"><h3>BAT RIFAS</h3><button type="button" className="btn primary" onClick={() => setView({ mode: 'edit' })}>+ Nueva rifa</button></div>
      <small className="cm-date">Talonario propio: reservas, comprobantes, confirmación manual y padrón CSV para el sorteo externo. Horario: Buenos Aires.</small>
      {error && <div className="feedback-error">{error}</div>}
      {!list ? <div className="cm-loading"><span className="spinner xs" /></div> : list.length === 0
        ? <Empty icon="star" title="Todavía no hay rifas" text="Tocá “Nueva rifa” para armar la primera." />
        : list.map((r) => (
          <article key={r.id} className="card cm-report rf-arow">
            <button type="button" className="rf-arow-main" onClick={() => setView({ mode: 'manage', id: r.id })}>
              <b>{r.title}</b>
              <span className="fo-chips"><Chip map={api.RAFFLE_STATUS} value={r.status} /><small className="cm-date">/{r.slug}</small></span>
              <span className="rf-counts">
                <span><i className="rf-sw free" /> {r.total - r.held - r.review - r.confirmed} libres</span>
                <span><i className="rf-sw held">⏳</i> {r.held} reservados</span>
                <span><i className="rf-sw review">?</i> {r.review} en revisión</span>
                <span><i className="rf-sw sold">✓</i> {r.confirmed} confirmados</span>
              </span>
            </button>
          </article>))}
    </div>
  );
}

// ---------------------------------------------------------------------
function Editor({ id, onClose }) {
  const [f, setF] = useState(id ? null : { ...EMPTY });
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState('draft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    api.adminGet(id).then((r) => {
      setLocked(r.locked); setStatus(r.status);
      setF({ ...EMPTY, ...r, prizes: r.prizes?.length ? r.prizes : [''], price: api.centsToPesos(r.price_cents), draw_at: api.toLocalInput(r.draw_at) });
    }).catch((e) => setError(e.message));
  }, [id]);
  if (!f) return <div className="cm-loading">{error ? <div className="feedback-error">{error}</div> : <span className="spinner xs" />}</div>;
  const set = (x) => setF((c) => ({ ...c, ...x }));
  const cents = api.pesosToCents(f.price);
  const valid = f.title.trim().length >= 3 && /^[a-z0-9-]{3,60}$/.test(f.slug) && cents !== null && Number(f.num_to) >= Number(f.num_from);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const nid = await api.adminSave({ ...f, id: id || null, price_cents: cents, prizes: f.prizes.map((p) => p.trim()).filter(Boolean),
        draw_at: api.fromLocalInput(f.draw_at), num_from: Number(f.num_from), num_to: Number(f.num_to), max_per_entry: Number(f.max_per_entry), pay_hours: Number(f.pay_hours) });
      onClose(nid);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card cm-composer rf-editor">
      <h3>{id ? 'Editar rifa' : 'Nueva rifa (borrador)'}</h3>
      {locked && <div className="admin-warn"><Icon name="lock" size={16} /> Ya hay participaciones: el precio y el rango quedan fijos. Si cambiás las bases se crea una versión nueva (las participaciones anteriores conservan la que aceptaron).</div>}
      <div className="cm-row">
        <label className="field"><span>Título</span><div className="pink-input"><input value={f.title} maxLength={120} onChange={(e) => set({ title: e.target.value, slug: id ? f.slug : slugify(e.target.value) })} /></div></label>
        <label className="field"><span>Dirección (slug)</span><div className="pink-input"><input value={f.slug} maxLength={60} disabled={status !== 'draft'} onChange={(e) => set({ slug: slugify(e.target.value) })} /></div></label>
      </div>
      <label className="field"><span>Portada (URL https de la imagen)</span><div className="pink-input"><input value={f.cover_url} inputMode="url" maxLength={500} onChange={(e) => set({ cover_url: e.target.value })} /></div></label>
      <div className="field"><span>Premios</span>
        {f.prizes.map((p, i) => (
          <div key={i} className="ga-kv"><div className="pink-input"><input value={p} maxLength={140} placeholder={`${i + 1}° premio`} onChange={(e) => set({ prizes: f.prizes.map((x, j) => (j === i ? e.target.value : x)) })} /></div>
            {f.prizes.length > 1 && <button type="button" className="mini-btn" aria-label="Quitar premio" onClick={() => set({ prizes: f.prizes.filter((_, j) => j !== i) })}>×</button>}</div>))}
        {f.prizes.length < 10 && <button type="button" className="cm-link" onClick={() => set({ prizes: [...f.prizes, ''] })}>+ Agregar premio</button>}
      </div>
      <label className="field"><span>Descripción</span><div className="pink-input feedback-text"><textarea rows={3} maxLength={2000} value={f.description} onChange={(e) => set({ description: e.target.value })} /></div></label>
      <label className="field"><span>Bases y condiciones</span><div className="pink-input feedback-text"><textarea rows={5} maxLength={8000} value={f.terms} onChange={(e) => set({ terms: e.target.value })} /></div></label>
      <div className="cm-row">
        <label className="field"><span>Precio por número (ARS)</span><div className="pink-input"><input value={f.price} inputMode="decimal" disabled={locked} placeholder="1500" onChange={(e) => set({ price: e.target.value })} /></div></label>
        <label className="field"><span>Sorteo externo (hora de Buenos Aires)</span><div className="pink-input"><input type="datetime-local" value={f.draw_at} onChange={(e) => set({ draw_at: e.target.value })} /></div></label>
      </div>
      <div className="cm-row">
        <label className="field"><span>Desde el número</span><div className="pink-input"><input type="number" min={0} value={f.num_from} disabled={locked} onChange={(e) => set({ num_from: e.target.value })} /></div></label>
        <label className="field"><span>Hasta el número</span><div className="pink-input"><input type="number" min={0} value={f.num_to} disabled={locked} onChange={(e) => set({ num_to: e.target.value })} /></div></label>
        <label className="field"><span>Máx. por reserva</span><div className="pink-input"><input type="number" min={1} max={1000} value={f.max_per_entry} onChange={(e) => set({ max_per_entry: e.target.value })} /></div></label>
        <label className="field"><span>Horas para pagar</span><div className="pink-input"><input type="number" min={1} max={720} value={f.pay_hours} onChange={(e) => set({ pay_hours: e.target.value })} /></div></label>
      </div>
      <small className="cm-date">Los números se muestran con ceros a la izquierda según el último (0–99 → 00, 07…).</small>
      <label className="field"><span>Instrucciones de transferencia (alias, CBU, titular)</span><div className="pink-input feedback-text"><textarea rows={3} maxLength={1000} value={f.transfer_info} onChange={(e) => set({ transfer_info: e.target.value })} /></div></label>
      <label className="field"><span>Contacto de soporte</span><div className="pink-input"><input value={f.support_contact} maxLength={200} placeholder="WhatsApp de la comunidad, email…" onChange={(e) => set({ support_contact: e.target.value })} /></div></label>
      <div className="cm-row">
        <label className="nb-pref"><input type="checkbox" checked={f.require_phone} onChange={(e) => set({ require_phone: e.target.checked })} /> Pedir teléfono obligatorio</label>
        <label className="field"><span>Formato del CSV</span><div className="pink-input"><select value={f.csv_profile} onChange={(e) => set({ csv_profile: e.target.value })}>
          <option value="rifary">Compatible Rifary (number,name,phone,email,status,code,date,…)</option>
          <option value="provisional">Provisional (numero,nombre,telefono,email,id_participacion,confirmado_el)</option></select></div></label>
      </div>
      {error && <div className="feedback-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn text" onClick={() => onClose(id)}>Cancelar</button>
        <button type="button" className="btn primary" disabled={busy || !valid} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
    </div>
  );
}

// ---------------------------------------------------------------------
function Manage({ id, onBack, onEdit, onOpen }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [ask, setAsk] = useState(null);
  const [tab, setTab] = useState('entries');
  const load = useCallback(() => api.adminGet(id).then(setR).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!r) return <div className="cm-loading">{error ? <div className="feedback-error">{error}</div> : <span className="spinner xs" />}</div>;
  const act = async (fn, msg) => { setError(''); setOk(''); try { await fn(); setOk(msg); load(); } catch (e) { setError(e.message); } };
  const preview = `#/rifas/${r.slug}`;
  return (
    <div className="cm-admin rf-admin">
      <button type="button" className="cm-link" onClick={onBack}>← Todas las rifas</button>
      <div className="cm-mod-head"><h3>{r.title}</h3><Chip map={api.RAFFLE_STATUS} value={r.status} /></div>
      <div className="rf-actions">
        {r.status !== 'closed' && r.status !== 'archived' && <button type="button" className="btn ghost" onClick={onEdit}><Icon name="edit" size={16} /> Editar</button>}
        <a className="btn ghost" href={preview} target="_blank" rel="noopener noreferrer"><Icon name="external" size={16} /> {r.status === 'draft' ? 'Previsualizar' : 'Ver talonario'}</a>
        {['draft', 'paused'].includes(r.status) && <button type="button" className="btn primary" onClick={() => setAsk({ title: r.status === 'draft' ? '¿Publicar la rifa?' : '¿Reanudar reservas?', text: 'El talonario queda abierto para cualquiera con el enlace.', yes: 'Publicar', run: () => act(() => api.adminSetStatus(id, 'published'), 'Publicada.') })}>Publicar</button>}
        {r.status === 'published' && <button type="button" className="btn ghost" onClick={() => setAsk({ title: '¿Pausar reservas?', text: 'Nadie podrá reservar números nuevos. Las reservas vigentes siguen su curso y se pueden subir comprobantes.', yes: 'Pausar', run: () => act(() => api.adminSetStatus(id, 'paused'), 'Reservas pausadas.') })}><Icon name="clock" size={16} /> Pausar</button>}
        <button type="button" className="btn ghost" onClick={() => act(async () => onOpen(await api.adminDuplicate(id)), 'Duplicada como borrador.')}><Icon name="clipboard" size={16} /> Duplicar</button>
        {r.status === 'closed' && <button type="button" className="btn ghost" onClick={() => setAsk({ title: '¿Archivar?', text: 'Se oculta del público. Los padrones exportados se conservan.', yes: 'Archivar', run: () => act(() => api.adminSetStatus(id, 'archived'), 'Archivada.') })}>Archivar</button>}
      </div>
      {r.status !== 'draft' && <div className="rf-share"><a className="btn ghost" href={api.whatsappShare(`${r.title} — elegí tus números: ${api.shareUrl(r.slug)}`)} target="_blank" rel="noopener noreferrer"><Icon name="message" size={16} /> WhatsApp</a>
        <button type="button" className="btn ghost" onClick={() => navigator.clipboard?.writeText(api.shareUrl(r.slug)).then(() => setOk('Enlace copiado.'))}><Icon name="link" size={16} /> Copiar enlace</button></div>}
      {error && <div className="feedback-error" role="alert">{error}</div>}
      {ok && <div className="cm-ok" role="status">{ok}</div>}
      <div className="view-toggle admin-tabs">
        <button type="button" className={'seg' + (tab === 'entries' ? ' active' : '')} onClick={() => setTab('entries')}>Participaciones</button>
        <button type="button" className={'seg' + (tab === 'manual' ? ' active' : '')} onClick={() => setTab('manual')}>Carga manual</button>
        <button type="button" className={'seg' + (tab === 'close' ? ' active' : '')} onClick={() => setTab('close')}>Cierre y padrón</button>
      </div>
      {tab === 'entries' && <Entries raffle={r} />}
      {tab === 'manual' && <Manual raffle={r} onDone={() => setTab('entries')} />}
      {tab === 'close' && <Closing raffle={r} reload={load} />}
      <Confirm open={!!ask} title={ask?.title} text={ask?.text} yes={ask?.yes} danger={ask?.danger} onYes={() => { const a = ask; setAsk(null); a.run(); }} onNo={() => setAsk(null)} />
    </div>
  );
}

function Entries({ raffle }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('review');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const load = useCallback(() => api.adminEntries(raffle.id, { q, status, sort, page }).then(setData).catch((e) => setError(e.message)), [raffle.id, q, status, sort, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const fmt = (n) => api.fmtNum(n, raffle.num_to);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  return (
    <div>
      <div className="rf-filters">
        <div className="pink-input"><input type="search" value={q} placeholder="Número, código, nombre, teléfono o email" aria-label="Buscar participaciones" onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <div className="pink-input"><select value={status} aria-label="Estado" onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos los estados</option>{Object.entries(api.ENTRY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}</select></div>
        <div className="pink-input"><select value={sort} aria-label="Orden" onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Más recientes</option><option value="old">Más antiguas</option><option value="number">Por número</option><option value="review">En revisión primero</option></select></div>
      </div>
      {error && <div className="feedback-error">{error}</div>}
      {!data ? <div className="cm-loading"><span className="spinner xs" /></div> : data.rows.length === 0
        ? <Empty icon="search" title={status === 'review' ? 'No hay comprobantes para revisar' : 'Sin resultados'} text={status ? 'Probá con otro estado.' : 'Todavía no hay participaciones.'} />
        : <ul className="rf-elist">{data.rows.map((e) => (
          <li key={e.id}><button type="button" className="card rf-erow" onClick={() => setOpen(e.id)}>
            <span className="rf-erow-n">{e.numbers.map(fmt).join(' · ')}</span>
            <span className="rf-erow-who"><b>{e.name}</b><small>{e.phone || e.email}</small></span>
            <span className="rf-erow-meta"><Chip map={api.ENTRY_STATUS} value={e.status} /><small>{api.money(e.total_cents)} · {api.fmtDate(e.created_at)}</small></span>
          </button></li>))}</ul>}
      {data && pages > 1 && <div className="rf-pager"><button type="button" className="btn text" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button>
        <span>Página {page} de {pages} · {data.total} en total</span>
        <button type="button" className="btn text" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente →</button></div>}
      {open && <EntryDetail id={open} onClose={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function EntryDetail({ id, onClose }) {
  const [e, setE] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [reject, setReject] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [ask, setAsk] = useState(false);
  const [op] = useState(() => ({ confirm: uuid(), reject: uuid(), cancel: uuid() }));
  const load = useCallback(() => api.adminEntry(id).then(setE).catch((err) => setError(err.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const k = (ev) => ev.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const run = async (fn, msg) => { setBusy(true); setError(''); setOk(''); try { await fn(); setOk(msg); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const fmt = (n) => api.fmtNum(n, e?.num_to ?? 99);
  const openProof = async (p) => { try { window.open(await api.proofUrl(p.storage_path), '_blank', 'noopener'); } catch (err) { setError(err.message); } };
  return (
    <div className="rf-drawer" role="dialog" aria-modal="true" aria-label="Ficha de participación" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="card rf-drawer-in">
        <div className="cm-mod-head"><h3>Participación</h3><button type="button" className="mini-btn" aria-label="Cerrar" onClick={onClose}>×</button></div>
        {!e ? <div className="cm-loading">{error ? <div className="feedback-error">{error}</div> : <span className="spinner xs" />}</div> : <>
          <Chip map={api.ENTRY_STATUS} value={e.status} />
          <div className="rf-summary">
            <div><small>Números</small><b>{e.numbers.map(fmt).join(', ')}</b></div>
            <div><small>Importe esperado</small><b>{api.money(e.total_cents)}</b></div>
            <div><small>Código</small><b className="rf-code">{e.code}</b></div>
          </div>
          <dl className="rf-dl">
            <dt>Nombre</dt><dd>{e.name}</dd>
            <dt>Email</dt><dd><a href={'mailto:' + e.email}>{e.email}</a></dd>
            <dt>Teléfono</dt><dd>{e.phone ? <a href={'https://wa.me/' + e.phone.replace(/\D/g, '')} target="_blank" rel="noopener noreferrer">{e.phone}</a> : '—'}</dd>
            <dt>Creada</dt><dd>{api.fmtDate(e.created_at)} · {e.source === 'manual' ? 'carga manual' : 'talonario'} · bases v{e.terms_version}</dd>
            {e.expires_at && <><dt>Vence</dt><dd>{api.fmtDate(e.expires_at)}</dd></>}
            {e.confirmed_at && <><dt>Confirmada</dt><dd>{api.fmtDate(e.confirmed_at)}</dd></>}
            {e.reject_reason && <><dt>Último rechazo</dt><dd>{e.reject_reason}</dd></>}
          </dl>
          <h4>Comprobantes</h4>
          {e.proofs.length === 0 ? <small className="cm-date">Sin comprobante todavía.</small> : e.proofs.map((p) => (
            <div key={p.id} className="cm-mod-head ap-row"><span><Chip map={{ pending: { label: 'Para revisar', cls: 'cat', icon: 'search' }, accepted: { label: 'Aceptado', cls: 'ok', icon: 'check' }, rejected: { label: 'Rechazado', cls: 'err', icon: 'x' } }} value={p.status} /> <small className="cm-date">{api.fmtDate(p.created_at)} · {p.mime.split('/')[1].toUpperCase()} · {Math.round(p.size_bytes / 1024)} KB{p.reason ? ` · ${p.reason}` : ''}</small></span>
              <button type="button" className="cm-link" onClick={() => openProof(p)}>Ver</button></div>))}
          <p className="rf-muted">Un comprobante solo no confirma: verificá la acreditación en la cuenta antes de confirmar.</p>
          {error && <div className="feedback-error" role="alert">{error}</div>}
          {ok && <div className="cm-ok" role="status">{ok}</div>}
          <div className="rf-actions">
            {['review', 'pending', 'rejected'].includes(e.status) && <button type="button" className="btn primary" disabled={busy} onClick={() => setAsk(true)}><Icon name="check" size={16} /> Confirmar pago</button>}
            {['review', 'pending', 'rejected'].includes(e.status) && <button type="button" className="btn ghost" disabled={busy} onClick={() => setReject({ reason: '', mode: 'resend', hours: 24 })}><Icon name="x" size={16} /> Rechazar comprobante</button>}
            {!['cancelled', 'expired'].includes(e.status) && <button type="button" className="btn text" disabled={busy} onClick={() => setCancel({ reason: '' })}>Cancelar reserva</button>}
          </div>
          {reject && (
            <div className="card cm-report">
              <label className="field"><span>Motivo (lo ve el participante)</span><div className="pink-input"><input autoFocus value={reject.reason} maxLength={300} placeholder="Ej.: el importe no coincide" onChange={(ev) => setReject({ ...reject, reason: ev.target.value })} /></div></label>
              <label className="nb-pref"><input type="radio" name="rmode" checked={reject.mode === 'resend'} onChange={() => setReject({ ...reject, mode: 'resend' })} /> Dejar reenviar con nuevo plazo de
                <input className="rf-hours" type="number" min={1} max={720} value={reject.hours} onChange={(ev) => setReject({ ...reject, hours: Number(ev.target.value) })} aria-label="Horas" /> h (los números siguen apartados)</label>
              <label className="nb-pref"><input type="radio" name="rmode" checked={reject.mode === 'release'} onChange={() => setReject({ ...reject, mode: 'release' })} /> Liberar los números</label>
              <div className="modal-actions"><button type="button" className="btn text" onClick={() => setReject(null)}>Volver</button>
                <button type="button" className="btn primary" disabled={busy || reject.reason.trim().length < 3} onClick={() => run(() => api.adminReject(id, reject.reason, reject.mode, reject.hours, op.reject), 'Comprobante rechazado; se avisó por correo.').then(() => { setReject(null); api.adminMailFlush(id).catch(() => {}); })}>Rechazar</button></div>
            </div>)}
          {cancel && (
            <div className="card cm-report">
              <label className="field"><span>Motivo de la cancelación</span><div className="pink-input"><input autoFocus value={cancel.reason} maxLength={300} onChange={(ev) => setCancel({ reason: ev.target.value })} /></div></label>
              <p className="rf-muted">Los números {e.numbers.map(fmt).join(', ')} vuelven a quedar libres.</p>
              <div className="modal-actions"><button type="button" className="btn text" onClick={() => setCancel(null)}>Volver</button>
                <button type="button" className="btn primary" disabled={busy || cancel.reason.trim().length < 3} onClick={() => run(() => api.adminCancel(id, cancel.reason, op.cancel), 'Reserva cancelada.').then(() => setCancel(null))}>Cancelar reserva</button></div>
            </div>)}
          <h4>Correos</h4>
          {e.mails.length === 0 ? <small className="cm-date">Ninguno.</small> : e.mails.map((m) => (
            <div key={m.id} className="ap-row"><small className="cm-date">{{ reserved: 'Reserva', confirmed: 'Confirmación', rejected: 'Rechazo' }[m.kind]} · {{ queued: 'en cola', sending: 'enviando', sent: 'enviado', failed: 'falló' }[m.status]}{m.last_error ? ` (${m.last_error})` : ''} · {api.fmtDate(m.sent_at || m.created_at)}</small></div>))}
          <div className="rf-actions">
            <button type="button" className="btn text" disabled={busy} onClick={() => run(() => api.adminResend(id, 'reserved', uuid()), 'Correo de participación reenviado.')}>Reenviar enlace</button>
            {e.status === 'confirmed' && <button type="button" className="btn text" disabled={busy} onClick={() => run(() => api.adminResend(id, 'confirmed', uuid()), 'Correo de confirmación reenviado.')}>Reenviar confirmación</button>}
          </div>
          <h4>Historial</h4>
          <ol className="rf-history">{e.events.map((v, i) => <li key={i}><small>{api.fmtDate(v.created_at)}</small> {EVENT[v.kind] || v.kind}{v.detail?.reason ? `: ${v.detail.reason}` : ''}{v.actor ? <small> · {v.actor}</small> : ''}</li>)}</ol>
        </>}
        <Confirm open={ask} title="¿Confirmar el pago?" text={e ? `Confirmás que se acreditaron ${api.money(e.total_cents)} por los números ${e.numbers.map(fmt).join(', ')}. Se habilitan los tickets y se avisa por correo.` : ''} yes="Sí, confirmar"
          onYes={() => { setAsk(false); run(() => api.adminConfirm(id, op.confirm), 'Pago confirmado; tickets habilitados.').then(() => api.adminMailFlush(id).catch(() => {})); }} onNo={() => setAsk(false)} />
      </div>
    </div>
  );
}
const EVENT = { reserved: 'Reservó', proof_uploaded: 'Adjuntó comprobante', rejected: 'Comprobante rechazado', confirmed: 'Pago confirmado', expired: 'Venció sin comprobante', cancelled: 'Cancelada', mail_resend: 'Correo reenviado' };

function Manual({ raffle, onDone }) {
  const [f, setF] = useState({ numbers: '', name: '', email: '', phone: '', confirm: true, ref: '' });
  const [op, setOp] = useState(uuid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (x) => setF((c) => ({ ...c, ...x }));
  const numbers = [...new Set(f.numbers.split(/[^0-9]+/).filter(Boolean).map(Number))];
  const save = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.adminManual(raffle.id, { ...f, numbers, method: 'transfer' }, op);
      if (r.confirm && !r.confirm.ok) throw new Error('Reservada, pero no se pudo confirmar: ' + r.confirm.error);
      setOp(uuid()); api.adminMailFlush(r.entry_id).catch(() => {}); onDone();
    } catch (e) { setError(e.data?.taken ? `Ocupados: ${e.data.taken.map((n) => api.fmtNum(n, raffle.num_to)).join(', ')}` : e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card cm-composer">
      <h4>Participación recibida por otro canal</h4>
      <small className="cm-date">Aplica las mismas reglas que el talonario (rango, disponibilidad, máximo por reserva).</small>
      <label className="field"><span>Números (separados por coma o espacio)</span><div className="pink-input"><input value={f.numbers} inputMode="numeric" placeholder="7, 8, 15" onChange={(e) => set({ numbers: e.target.value })} /></div></label>
      <div className="cm-row">
        <label className="field"><span>Nombre</span><div className="pink-input"><input value={f.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} /></div></label>
        <label className="field"><span>Email</span><div className="pink-input"><input type="email" value={f.email} maxLength={120} onChange={(e) => set({ email: e.target.value })} /></div></label>
        <label className="field"><span>Teléfono</span><div className="pink-input"><input type="tel" value={f.phone} maxLength={24} onChange={(e) => set({ phone: e.target.value })} /></div></label>
      </div>
      <label className="nb-pref"><input type="checkbox" checked={f.confirm} onChange={(e) => set({ confirm: e.target.checked })} /> Ya verifiqué la acreditación: confirmar el pago ahora</label>
      {f.confirm && <label className="field"><span>Referencia del pago (opcional)</span><div className="pink-input"><input value={f.ref} maxLength={80} onChange={(e) => set({ ref: e.target.value })} /></div></label>}
      <p className="rf-muted">Total: {api.money(raffle.price_cents * numbers.length)}</p>
      {error && <div className="feedback-error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn primary" disabled={busy || !numbers.length || f.name.trim().length < 2} onClick={save}>{busy ? 'Guardando…' : 'Registrar participación'}</button></div>
    </div>
  );
}

function Closing({ raffle, reload }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const [op, setOp] = useState(uuid);
  const load = useCallback(() => api.adminCloseSummary(raffle.id).then(setS).catch((e) => setError(e.message)), [raffle.id]);
  useEffect(() => { load(); }, [load]);
  if (!s) return <div className="cm-loading">{error ? <div className="feedback-error">{error}</div> : <span className="spinner xs" />}</div>;
  const fmt = (n) => api.fmtNum(n, raffle.num_to);
  const closed = s.status === 'closed' || s.status === 'archived';
  const close = async () => { setError(''); try { await api.adminClose(raffle.id, true); setOk('Rifa cerrada.'); reload(); load(); } catch (e) { setError(e.message); } };
  const generate = async () => {
    setError(''); setOk('');
    try { const r = await api.adminExportCreate(raffle.id, reason, op); setOp(uuid()); setReason(''); setOk(`Padrón versión ${r.version} generado (${r.row_count} números).`); load(); } catch (e) { setError(e.message); }
  };
  const download = async (x) => { try { const d = await api.adminExportGet(x.id); api.downloadText(d.filename, d.csv); } catch (e) { setError(e.message); } };
  return (
    <div className="rf-close">
      <div className="rf-summary card">
        <div><small>Números confirmados que van al archivo</small><b>{s.confirmed_numbers}</b></div>
        <div><small>Participaciones confirmadas</small><b>{s.confirmed_entries}</b></div>
        <div><small>Por resolver</small><b>{s.review.length + s.pending.length}</b></div>
      </div>
      {s.review.length > 0 && <div className="admin-warn"><Icon name="alert" size={16} /> <span><b>{s.review.length} con comprobante en revisión</b> (no entran al padrón hasta confirmarlos o rechazarlos): {s.review.map((e) => `${e.name} (${e.numbers.map(fmt).join(', ')})`).join(' · ')}</span></div>}
      {s.pending.length > 0 && <div className="admin-warn"><Icon name="clock" size={16} /> <span><b>{s.pending.length} reservas sin comprobante</b>{closed ? '' : ' se cancelan al cerrar'}: {s.pending.map((e) => `${e.name} (${e.numbers.map(fmt).join(', ')})`).join(' · ')}</span></div>}
      {error && <div className="feedback-error" role="alert">{error}</div>}
      {ok && <div className="cm-ok" role="status">{ok}</div>}
      {!closed && ['published', 'paused'].includes(s.status) && <button type="button" className="btn primary" onClick={() => setAsk(true)}><Icon name="lock" size={16} /> Cerrar rifa</button>}
      {closed && (
        <div className="card cm-composer">
          <h4>Padrón para el sorteo externo</h4>
          <small className="cm-date">Una fila por número confirmado. Cada versión queda congelada: volver a descargarla da exactamente el mismo archivo (huella SHA-256).</small>
          {s.exports.length > 0 && <label className="field"><span>Motivo de la corrección (obligatorio para una nueva versión)</span><div className="pink-input"><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></div></label>}
          <button type="button" className="btn primary" disabled={s.review.length > 0 || s.pending.length > 0} onClick={generate}>{s.exports.length ? 'Generar nueva versión' : 'Generar padrón'}</button>
          {s.exports.map((x) => (
            <div key={x.id} className="cm-mod-head ap-row"><span><b>v{x.version}</b> · {x.row_count} números · {x.profile === 'rifary' ? 'formato Rifary' : 'provisional'} · {api.fmtDate(x.created_at)}{x.created_by ? ` · ${x.created_by}` : ''}{x.reason ? ` · Motivo: ${x.reason}` : ''}<br /><small className="cm-date rf-code">SHA-256 {x.sha256.slice(0, 16)}…</small></span>
              <button type="button" className="btn ghost" onClick={() => download(x)}><Icon name="download" size={16} /> CSV</button></div>))}
        </div>)}
      <Confirm open={ask} danger title="¿Cerrar la rifa?" yes="Cerrar"
        text={`Se frenan las reservas nuevas.${s.pending.length ? ` Se cancelan ${s.pending.length} reservas sin comprobante y sus números se liberan.` : ''}${s.review.length ? ` Quedan ${s.review.length} comprobantes por revisar antes de generar el padrón.` : ''} Van ${s.confirmed_numbers} números confirmados.`}
        onYes={() => { setAsk(false); close(); }} onNo={() => setAsk(false)} />
    </div>
  );
}
