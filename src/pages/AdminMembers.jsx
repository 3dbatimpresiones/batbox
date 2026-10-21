import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { sb } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';
import { Confirm, Empty, SearchInput } from '../components/ui.jsx';

// =====================================================================
// MIEMBROS DE MAKERS CLUB (pestaña del panel admin)
// Usa las MISMAS funciones de Supabase que el panel del Cotizador PRO:
//   admin_get_all_members · admin_add_member · admin_update_member_status
//   admin_update_notes · admin_update_expiration
// Todas verifican is_admin() en la base y dejan registro en admin_actions.
// No hay ninguna tabla ni regla nueva: es otra pantalla para los mismos datos.
// =====================================================================

const STATUS = {
  pending: { label: 'Pendiente', plural: 'Pendientes', cls: 'warn' },
  approved: { label: 'Aprobado', plural: 'Aprobados', cls: 'ok' },
  suspended: { label: 'Suspendido', plural: 'Suspendidos', cls: 'orange' },
  rejected: { label: 'Rechazado', plural: 'Rechazados', cls: 'err' },
  expired: { label: 'Vencido', plural: 'Vencidos', cls: 'muted' },
};
// Mismas transiciones que el panel del cotizador.
const ACTIONS = {
  approved: { label: 'Aprobar', next: 'approved', cls: 'ok' },
  rejected: { label: 'Rechazar', next: 'rejected', cls: 'err' },
  suspended: { label: 'Suspender', next: 'suspended', cls: 'orange' },
  reactivate: { label: 'Reactivar', next: 'approved', cls: 'cyan' },
  expired: { label: 'Marcar vencido', next: 'expired', cls: 'muted' },
};
const ACTIONS_FOR = {
  pending: ['approved', 'rejected'],
  approved: ['suspended', 'expired', 'rejected'],
  suspended: ['reactivate', 'rejected'],
  rejected: ['reactivate'],
  expired: ['reactivate', 'suspended'],
};

const EMPTY_ADD = { email: '', first_name: '', last_name: '', discord: '', instagram: '', phone: '', notes: '', approve: true };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const fullName = (m) => [m.first_name, m.last_name].filter(Boolean).join(' ') || 'Sin nombre';

// Solo `npm run dev` con ?simdb: miembros ficticios para ver la pantalla.
const SIM = import.meta.env.DEV && new URLSearchParams(window.location.search).has('simdb');
const SIM_MEMBERS = [
  { id: 's1', email: '3dbatimpresiones@gmail.com', first_name: '3DBAT', last_name: 'Admin', status: 'approved', role: 'admin', created_at: '2026-06-17', approved_at: '2026-06-17', last_access_at: '2026-10-21' },
  { id: 's2', email: 'maker.uno@ejemplo.com', first_name: 'Maker', last_name: 'Uno', discord_username: 'makeruno', instagram_username: 'maker.uno', phone: '11 5555-0001', status: 'approved', role: 'user', created_at: '2026-07-02', approved_at: '2026-07-02', last_access_at: '2026-10-19', internal_notes: 'Pagó por transferencia.' },
  { id: 's3', email: 'maker.dos@ejemplo.com', first_name: 'Maker', last_name: 'Dos', status: 'pending', role: 'user', created_at: '2026-10-20' },
  { id: 's4', email: 'maker.tres@ejemplo.com', first_name: 'Maker', last_name: 'Tres', status: 'suspended', role: 'user', created_at: '2026-08-11', subscription_expires_at: '2026-11-30' },
];

export default function AdminMembers() {
  const { notify } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [add, setAdd] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (SIM) { setMembers(SIM_MEMBERS); setLoading(false); return; }
    setLoading(true);
    const { data, error: e } = await sb.rpc('admin_get_all_members');
    if (e) setError(e.message); else { setMembers(data || []); setError(null); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rpc = async (fn, args, okText) => {
    if (SIM) { notify('ok', 'Simulación: ' + okText); return true; }
    setBusy(true);
    const { error: e } = await sb.rpc(fn, args);
    setBusy(false);
    if (e) { notify('err', 'Error: ' + e.message); return false; }
    notify('ok', okText);
    await load();
    return true;
  };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members.filter((m) => (filter === 'all' || m.status === filter) && (!needle || [m.email, m.first_name, m.last_name, m.discord_username, m.instagram_username, m.phone]
      .some((v) => v?.toLowerCase().includes(needle))));
  }, [members, q, filter]);
  const selected = members.find((m) => m.id === selectedId) || null;

  const doAdd = async () => {
    const email = add.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) { notify('err', 'Ingresá un correo válido.'); return; }
    if (members.some((m) => m.email.toLowerCase() === email)) { notify('err', 'Ese correo ya está en la lista.'); return; }
    if (SIM) { notify('ok', 'Simulación: miembro agregado'); setAdd(null); return; }
    setBusy(true);
    const { data: newId, error: e } = await sb.rpc('admin_add_member', {
      p_email: email, p_first_name: add.first_name || null, p_last_name: add.last_name || null,
      p_discord: add.discord.replace(/^@/, '') || null, p_instagram: add.instagram.replace(/^@/, '') || null,
      p_phone: add.phone || null, p_notes: add.notes || null,
    });
    if (e) { setBusy(false); notify('err', 'Error: ' + e.message); return; }
    if (add.approve && newId) {
      const { error: e2 } = await sb.rpc('admin_update_member_status', { p_member_id: newId, p_new_status: 'approved', p_notes: null });
      if (e2) notify('err', 'Se agregó, pero no se pudo aprobar: ' + e2.message);
    }
    setBusy(false);
    notify('ok', add.approve ? 'Miembro agregado y aprobado' : 'Miembro agregado como pendiente');
    setAdd(null);
    load();
  };

  if (error) {
    return <Empty icon="alert" title="No se pudo cargar la lista de miembros" text={error.includes('autorizado') ? 'Tu cuenta no tiene permiso de administrador en Supabase.' : error} />;
  }

  const counts = Object.fromEntries(Object.keys(STATUS).map((s) => [s, members.filter((m) => m.status === s).length]));

  return (
    <div className="members">
      <div className="member-stats">
        <button className={'mstat' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>
          <b className="c-cyan">{members.length}</b><span>Total</span>
        </button>
        {Object.entries(STATUS).map(([s, st]) => (
          <button key={s} className={`mstat t-${st.cls}` + (filter === s ? ' active' : '')} onClick={() => setFilter(s)}>
            <b>{counts[s]}</b><span>{st.plural}</span>
          </button>
        ))}
      </div>

      <div className="filters card">
        <div className="filter-row">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre, correo, Discord, Instagram o celular…" />
          <button className="btn primary" onClick={() => setAdd({ ...EMPTY_ADD })}><Icon name="user" size={16} /> Agregar miembro</button>
        </div>
      </div>

      {loading ? <div className="empty"><div className="spinner" /></div>
        : !list.length ? <Empty icon="users" title="Sin resultados" text={q ? 'Probá con otra búsqueda.' : 'No hay miembros con este estado.'} />
        : (
          <div className="admin-list">
            {list.map((m) => (
              <button key={m.id} className="member-row" onClick={() => setSelectedId(m.id)}>
                <span className="avatar">{(m.first_name?.[0] || m.email?.[0] || '?').toUpperCase()}</span>
                <span className="mr-main">
                  <strong>{fullName(m)} {m.role === 'admin' && <span className="chip club">✦ Admin</span>}</strong>
                  <small>{m.email}</small>
                  {(m.discord_username || m.instagram_username) && (
                    <small className="mr-social">
                      {m.discord_username && <span>Discord @{m.discord_username}</span>}
                      {m.instagram_username && <span>IG @{m.instagram_username}</span>}
                    </small>
                  )}
                </span>
                <span className="mr-side">
                  <span className={'chip ' + STATUS[m.status]?.cls}>{STATUS[m.status]?.label || m.status}</span>
                  <small>Último acceso: {fmt(m.last_access_at)}</small>
                </span>
              </button>
            ))}
          </div>
        )}

      {selected && (
        <MemberDetail m={selected} busy={busy} onClose={() => setSelectedId(null)}
          onAction={(a) => setConfirm({ ...ACTIONS[a], member: selected })}
          onSaveNotes={(notes) => rpc('admin_update_notes', { p_member_id: selected.id, p_notes: notes }, 'Notas guardadas')}
          onSaveExpiry={(date) => rpc('admin_update_expiration', { p_member_id: selected.id, p_expires_at: date ? date + 'T23:59:59-03:00' : null }, date ? 'Vencimiento guardado' : 'Vencimiento quitado')} />
      )}

      <Confirm open={!!confirm} danger={confirm?.cls === 'err'} title={confirm ? `${confirm.label} a ${fullName(confirm.member)}` : ''}
        text={confirm ? `¿Confirmás que querés ${confirm.label.toLowerCase()} a ${confirm.member.email}?` : ''}
        yes={confirm?.label || 'Confirmar'} onNo={() => setConfirm(null)}
        onYes={async () => {
          const c = confirm; setConfirm(null);
          await rpc('admin_update_member_status', { p_member_id: c.member.id, p_new_status: c.next, p_notes: null }, `${c.label}: listo`);
        }} />

      {add && (
        <div className="modal-back" onClick={() => setAdd(null)}>
          <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Agregar miembro</h2>
            <p>El correo tiene que ser exactamente el de la cuenta de Google con la que va a ingresar.</p>
            <div className="member-form">
              {[['email', 'Correo de Google *', 'email'], ['first_name', 'Nombre', 'text'], ['last_name', 'Apellido', 'text'],
                ['discord', 'Discord', 'text'], ['instagram', 'Instagram', 'text'], ['phone', 'Celular', 'tel']].map(([k, label, type]) => (
                <label key={k} className={'ed-field' + (k === 'email' ? ' span2' : '')}>
                  <span className="ed-label">{label}</span>
                  <div className="pink-input"><input type={type} value={add[k]} onChange={(e) => setAdd((a) => ({ ...a, [k]: e.target.value }))} autoFocus={k === 'email'} /></div>
                </label>
              ))}
              <label className="ed-field span2">
                <span className="ed-label">Notas internas</span>
                <div className="pink-input"><textarea rows={2} value={add.notes} onChange={(e) => setAdd((a) => ({ ...a, notes: e.target.value }))} /></div>
              </label>
            </div>
            <label className="toggle-row">
              <input type="checkbox" checked={add.approve} onChange={(e) => setAdd((a) => ({ ...a, approve: e.target.checked }))} />
              <span className="switch" /><span>Aprobar ahora (si no, queda pendiente)</span>
            </label>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setAdd(null)}>Cancelar</button>
              <button className="btn primary" onClick={doAdd} disabled={busy}>{busy ? 'Guardando…' : 'Agregar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberDetail({ m, busy, onClose, onAction, onSaveNotes, onSaveExpiry }) {
  const [notes, setNotes] = useState(m.internal_notes || '');
  const [expiry, setExpiry] = useState(m.subscription_expires_at ? m.subscription_expires_at.slice(0, 10) : '');
  useEffect(() => { setNotes(m.internal_notes || ''); setExpiry(m.subscription_expires_at ? m.subscription_expires_at.slice(0, 10) : ''); }, [m]);
  const rows = [
    ['Discord', m.discord_username && '@' + m.discord_username],
    ['Instagram', m.instagram_username && '@' + m.instagram_username],
    ['Celular', m.phone],
    ['Registrado', fmt(m.created_at)],
    ['Aprobado', m.approved_at && fmt(m.approved_at)],
    ['Último acceso', fmt(m.last_access_at)],
  ].filter(([, v]) => v);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide member-detail" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="md-head">
          <span className="avatar lg">{(m.first_name?.[0] || m.email?.[0] || '?').toUpperCase()}</span>
          <div>
            <h2>{fullName(m)}</h2>
            <small>{m.email}</small>
          </div>
          <span className={'chip ' + STATUS[m.status]?.cls}>{STATUS[m.status]?.label}</span>
        </div>

        <dl className="md-rows">
          {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          {m.role === 'admin' && <div><dt>Rol</dt><dd><span className="chip club">✦ Admin</span></dd></div>}
        </dl>

        <div className="section-label">ACCIONES</div>
        <div className="md-actions">
          {(ACTIONS_FOR[m.status] || []).map((a) => (
            <button key={a} className={'act-btn t-' + ACTIONS[a].cls} disabled={busy} onClick={() => onAction(a)}>{ACTIONS[a].label}</button>
          ))}
        </div>

        <div className="section-label">NOTAS INTERNAS</div>
        <div className="pink-input"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Solo las ven los admins" /></div>
        {notes !== (m.internal_notes || '') && (
          <button className="chip-btn wide-chip" disabled={busy} onClick={() => onSaveNotes(notes)}>Guardar notas</button>
        )}

        <div className="section-label">VENCIMIENTO DE LA MEMBRESÍA</div>
        <div className="md-expiry">
          <div className="pink-input"><input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
          <button className="chip-btn" disabled={busy || expiry === (m.subscription_expires_at?.slice(0, 10) || '')} onClick={() => onSaveExpiry(expiry)}>Guardar</button>
          {m.subscription_expires_at && <button className="chip-btn" disabled={busy} onClick={() => { setExpiry(''); onSaveExpiry(''); }}>Quitar</button>}
        </div>
        <p className="ed-hint">Por ahora es informativo: ni BATBOX ni el cotizador bloquean el acceso cuando vence.</p>

        <div className="modal-actions"><button className="btn ghost" onClick={onClose}>Cerrar</button></div>
      </div>
    </div>
  );
}
