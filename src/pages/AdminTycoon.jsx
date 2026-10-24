import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import { Confirm, Empty, Options, SearchInput } from '../components/ui.jsx';
import { mt } from '../lib/mtApi.js';
import * as api from '../lib/adminApi.js';
import { REWARDS, REWARD_KINDS, rewardName, metricLabel } from '../data/rewards.js';
import { FILACOLOR } from '../data/filacolor.js';
import { Emblem, num } from '../components/Tycoon.jsx';
import { useFilacolorSettings } from './Filacolor.jsx';

// =====================================================================
// PANEL · 3DBAT Maker Tycoon (migración 026)
// Retos y premios (equipo), jugadores, granjas y temporadas (admins),
// destacados de Filacolor (equipo). Cada acción la valida la base.
// =====================================================================

const SUBS = [['resumen', 'Resumen'], ['sugerencias', 'Sugerencias'], ['retos', 'Retos'], ['jugadores', 'Jugadores'], ['granjas', 'Granjas'], ['filacolor', 'Filacolor']];

export default function AdminTycoon() {
  const { isAdmin } = useAuth();
  const [sub, setSub] = useState(isAdmin ? 'resumen' : 'sugerencias');
  const subs = SUBS.filter(([k]) => isAdmin || ['retos', 'filacolor', 'sugerencias'].includes(k));
  return (
    <div className="mt-admin">
      <Options value={sub} onChange={setSub} options={subs.map(([value, label]) => ({ value, label }))} />
      {sub === 'resumen' && isAdmin && <Resumen />}
      {sub === 'sugerencias' && <Sugerencias />}
      {sub === 'retos' && <Retos />}
      {sub === 'jugadores' && isAdmin && <Jugadores />}
      {sub === 'granjas' && isAdmin && <Granjas />}
      {sub === 'filacolor' && <FilacolorAdmin />}
    </div>
  );
}

function useLoad(fn, args, deps = []) {
  const [st, setSt] = useState({ loading: true, data: null, error: null });
  const load = useCallback(() => mt(fn, args).then((data) => setSt({ loading: false, data, error: null }), (e) => setSt({ loading: false, data: null, error: e.missing ? 'missing' : e.message })), deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { ...st, reload: load };
}
function Missing() {
  return <Empty icon="alert" title="Falta la migración 026" text="Corré supabase/026_batbox_maker_tycoon.sql en Supabase → SQL Editor para activar el juego online." />;
}
const when = (t) => (t ? new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

// ---------- Resumen y temporadas ----------
function Resumen() {
  const { notify } = useAuth();
  const s = useLoad('bb_mt_admin_stats');
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [closing, setClosing] = useState(false);
  const [newName, setNewName] = useState('');
  useEffect(() => { if (s.data?.season) { setName(s.data.season.name); setRate(String(s.data.season.usd_rate)); } }, [s.data]);
  if (s.error === 'missing') return <Missing />;
  if (s.error) return <Empty icon="alert" title="No se pudo cargar" text={s.error} />;
  if (!s.data) return <div className="empty"><div className="spinner" /></div>;
  const d = s.data;
  const save = async () => {
    try { await mt('bb_mt_admin_season_set', { p_name: name, p_usd_rate: Number(rate) || null }); notify('ok', 'Temporada actualizada'); s.reload(); } catch (e) { notify('err', e.message); }
  };
  const close = async () => {
    setClosing(false);
    try { await mt('bb_mt_admin_season_close', { p_new_name: newName, p_usd_rate: Number(rate) || null }); notify('ok', 'Temporada cerrada: Hall de la Fama publicado'); setNewName(''); s.reload(); } catch (e) { notify('err', e.message); }
  };
  return (
    <div className="mt-adm">
      <div className="mt-kpis">
        <div className="card"><span>Jugadores online</span><b>{num(d.players)}</b><small>{num(d.banned)} bloqueados</small></div>
        <div className="card"><span>Partidas en la nube</span><b>{num(d.saves)}</b><small>{num(d.saved_today)} guardadas en 24 h</small></div>
        <div className="card"><span>Granjas</span><b>{num(d.farms)}</b><small>{num(d.live?.farms)} activas ahora</small></div>
        <div className="card"><span>Ahora</span><b>{num(d.live?.online)}</b><small>en BATBOX · {num(d.live?.playing)} jugando</small></div>
        <div className="card"><span>Retos activos</span><b>{num(d.challenges_active)}</b><small>en la pestaña Retos</small></div>
      </div>
      <section className="card mt-adm-card">
        <div className="section-label">TEMPORADA ACTUAL</div>
        <div className="mt-form-row">
          <label className="ed-field"><span className="ed-label">Nombre</span><div className="pink-input"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></div></label>
          <label className="ed-field"><span className="ed-label">Cotización (US$ 1 = AR$)</span><div className="pink-input"><input type="number" min="1" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
            <span className="ed-hint">La usa el selector ARS/USD del juego. Fija durante la temporada.</span></label>
        </div>
        <button className="btn primary" onClick={save}><Icon name="check" size={16} /> Guardar</button>
        <div className="section-label" style={{ marginTop: 22 }}>CERRAR TEMPORADA</div>
        <p className="ed-hint">Guarda el top 10 en el Hall de la Fama, entrega trofeo (top 10) y marco dorado (podio), y arranca la temporada nueva con los puntos en 0. Las partidas, granjas y premios de cada uno NO se tocan.</p>
        <div className="mt-form-row">
          <label className="ed-field"><span className="ed-label">Nombre de la temporada nueva</span><div className="pink-input"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Temporada 2" maxLength={40} /></div></label>
        </div>
        <button className="btn danger" disabled={newName.trim().length < 2} onClick={() => setClosing(true)}>Cerrar temporada y publicar el Hall de la Fama</button>
        <Confirm open={closing} danger title="¿Cerrar la temporada?" text={`Se publica el Hall de la Fama de «${d.season?.name}» y arranca «${newName}» con todos los puntos en 0. No se puede deshacer.`} yes="Cerrar temporada" onYes={close} onNo={() => setClosing(false)} />
      </section>
      <section className="card mt-adm-card">
        <div className="section-label">ÚLTIMOS CAMBIOS DEL EQUIPO</div>
        {d.log.length === 0 && <p className="ed-hint">Todavía no hay cambios.</p>}
        <div className="mt-log">{d.log.map((l) => <div key={l.id}><span>{when(l.created_at)}</span><b>{l.action}</b><small>{l.target || ''}</small></div>)}</div>
      </section>
    </div>
  );
}

// ---------- Sugerencias de los jugadores (migración 027) ----------
const FB_KIND = { idea: ['💡 Idea', 'ok'], error: ['🐞 Algo anda mal', 'err'], otro: ['💬 Otra cosa', 'muted'] };
const FB_STATUS = [['nueva', 'Nuevas'], ['leida', 'Leídas'], ['hecha', 'Hechas'], ['', 'Todas']];
function Sugerencias() {
  const { notify } = useAuth();
  const [status, setStatus] = useState('nueva');
  const r = useLoad('bb_mt_admin_feedback', { p_status: status || null }, [status]);
  const [del, setDel] = useState(null);
  if (r.error === 'missing') return <Empty icon="alert" title="Falta la migración 027" text="Corré supabase/027_batbox_mt_sugerencias.sql en Supabase → SQL Editor para recibir sugerencias." />;
  if (r.error) return <Empty icon="alert" title="No se pudo cargar" text={r.error} />;
  const set = async (id, st) => { try { await mt('bb_mt_admin_feedback_set', { p_id: id, p_status: st }); r.reload(); } catch (e) { notify('err', e.message); } };
  return (
    <div className="mt-adm">
      <p className="ed-hint">Lo que mandan los jugadores desde el botón «Sugerencias» del juego. Marcalas como leídas o hechas para llevar la cuenta.</p>
      <Options value={status} onChange={setStatus} options={FB_STATUS.map(([value, label]) => ({ value, label }))} />
      {!r.data && <div className="empty"><div className="spinner" /></div>}
      {r.data?.length === 0 && <Empty icon="message" title="Nada por acá" text={status === 'nueva' ? 'No hay sugerencias nuevas.' : 'Todavía no hay sugerencias.'} />}
      <div className="mt-adm-list">
        {(r.data || []).map((f) => (
          <div key={f.id} className="card mt-adm-ch mt-fb">
            <div className="mt-adm-ch-top">
              <span className={'chip ' + (FB_KIND[f.kind]?.[1] || 'muted')}>{FB_KIND[f.kind]?.[0] || f.kind}</span>
              {f.status !== 'nueva' && <span className="chip muted">{f.status === 'hecha' ? '✔ Hecha' : 'Leída'}</span>}
              <small className="ed-hint">{when(f.created_at)} · {f.who || 'Sin cuenta'}{f.contact ? ` · contacto: ${f.contact}` : ''}</small>
            </div>
            <p className="mt-fb-msg">{f.message}</p>
            {f.context && Object.keys(f.context).length > 0 && <small className="ed-hint">Lugar {f.context.space ?? '—'} · {f.context.machines ?? '—'} máquinas · pantalla {f.context.w ?? '—'} px</small>}
            <div className="mt-adm-actions">
              {f.status !== 'leida' && <button className="btn ghost sm" onClick={() => set(f.id, 'leida')}>Marcar leída</button>}
              {f.status !== 'hecha' && <button className="btn ghost sm" onClick={() => set(f.id, 'hecha')}>✔ Hecha</button>}
              {f.status !== 'nueva' && <button className="btn text sm" onClick={() => set(f.id, 'nueva')}>Volver a nueva</button>}
              <button className="btn text sm" onClick={() => setDel(f)}><Icon name="trash" size={14} /> Borrar</button>
            </div>
          </div>
        ))}
      </div>
      <Confirm open={!!del} danger title="¿Borrar la sugerencia?" text="No se puede deshacer." yes="Borrar"
        onYes={async () => { const f = del; setDel(null); try { await mt('bb_mt_admin_feedback_set', { p_id: f.id, p_delete: true }); r.reload(); } catch (e) { notify('err', e.message); } }} onNo={() => setDel(null)} />
    </div>
  );
}

// ---------- Retos ----------
const KINDS = [['diario', 'Diario'], ['semanal', 'Semanal'], ['tecnico', 'Técnico'], ['comunidad', 'Comunidad'], ['granja', 'Granja'], ['evento', 'Evento']];
const SCOPES = [['individual', 'Individual (cada uno)'], ['comunidad', 'Comunidad (todos juntos)'], ['granja', 'Granja (entre sus integrantes)']];
const METRICS = [['orders', 'Pedidos cumplidos'], ['urgent', 'Pedidos urgentes'], ['contracts', 'Contratos de empresa'], ['pieces', 'Piezas fabricadas'],
  ['events', 'Fallas resueltas'], ['xl', 'Piezas grandes (L/XL)'], ['daily', 'Desafíos diarios cobrados'], ['earned', 'Plata facturada (AR$)'], ['points', 'Puntos Maker'], ['product', 'Piezas de un producto'], ['material', 'Piezas en un material']];
const PRODUCTS = { llavero: 'Llavero con nombre', benchy: 'Benchy', soporte: 'Soporte de celular', maceta: 'Maceta geométrica', gancho: 'Gancho de pared', figura: 'Figura de colección',
  engranaje: 'Engranaje de repuesto', topes: 'Topes y fundas (TPU)', organizador: 'Organizador modular', llaveromulti: 'Llavero multicolor', carcasa: 'Carcasa para electrónica', casco: 'Casco cosplay',
  lampara: 'Lámpara multicolor', maqueta: 'Maqueta de arquitectura', figurapintada: 'Figura multicolor premium', dron: 'Frame de dron', armadura: 'Armadura cosplay', silla: 'Silla impresa',
  industrial: 'Repuesto industrial', miniatura: 'Miniatura de rol', joya: 'Prototipo de joyería', dental: 'Modelo dental', busto: 'Busto de colección', llaveroacr: 'Llavero de acrílico',
  posavasos: 'Posavasos', caja: 'Caja de MDF', cartel: 'Cartel de acrílico', mural: 'Mural de MDF', tabla: 'Tabla de asado', cartelmad: 'Cartel de madera', alu: 'Pieza de aluminio', mueble: 'Mueble fresado', llaverobati: 'Llavero BATI' };
const MATS = ['PLA', 'PETG', 'TPU', 'ASA', 'PACF', 'RESINA', 'MDF', 'ACRILICO', 'MADERA', 'ALU'];
const STATUS = { draft: ['Borrador', 'muted'], active: ['Activo', 'ok'], closed: ['Cerrado', 'warn'] };
const blank = { kind: 'semanal', scope: 'individual', title: '', description: '', metric: 'orders', target: 10, min_hours: 1, recur: 'week', reward_points: 50, reward_id: '', featured: false, status: 'draft', starts_at: '', ends_at: '' };
const toLocal = (t) => (t ? new Date(new Date(t).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

function Retos() {
  const { notify } = useAuth();
  const r = useLoad('bb_mt_admin_challenges');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  if (r.error === 'missing') return <Missing />;
  if (r.error) return <Empty icon="alert" title="No se pudo cargar" text={r.error} />;
  const quick = async (c, patch, okText) => { try { await mt('bb_mt_admin_challenge_save', { p: { id: c.id, ...patch } }); notify('ok', okText); r.reload(); } catch (e) { notify('err', e.message); } };
  if (edit) return <RetoEditor init={edit} onDone={() => { setEdit(null); r.reload(); }} />;
  return (
    <div className="mt-adm">
      <div className="mt-adm-head">
        <p className="ed-hint">Los retos activos aparecen en el juego y en BATBOX. El servidor cuenta el progreso solo. El destacado se muestra en el Inicio de BATBOX.</p>
        <button className="btn primary" onClick={() => setEdit(blank)}><Icon name="star" size={16} /> Nuevo reto</button>
      </div>
      {!r.data && <div className="empty"><div className="spinner" /></div>}
      <div className="mt-adm-list">
        {(r.data || []).map((c) => (
          <div key={c.id} className="card mt-adm-ch">
            <div className="mt-adm-ch-top">
              <span className={'chip ' + STATUS[c.status][1]}>{STATUS[c.status][0]}</span>
              {c.featured && <span className="chip warn">★ Destacado</span>}
              <span className="chip muted">{KINDS.find((k) => k[0] === c.kind)?.[1]} · {c.scope}</span>
              <b>{c.title}</b>
            </div>
            <small className="ed-hint">Meta: {num(c.target)} {metricLabel(c.metric)} · {c.recur === 'day' ? 'se renueva cada día' : c.recur === 'week' ? 'se renueva cada lunes' : 'una vez'} · ritmo máx.: {c.min_hours} h · premio {num(c.reward_points)} pts{c.reward_id ? ` + ${rewardName(c.reward_id)}` : ''}</small>
            <small className="ed-hint">Ahora: {num(c.participants)} participando · {num(c.completed)} cumplieron{c.scope === 'comunidad' ? ` · total comunidad ${num(c.community)}` : ''}</small>
            <div className="mt-adm-actions">
              <button className="btn ghost sm" onClick={() => setEdit({ ...c, starts_at: toLocal(c.starts_at), ends_at: toLocal(c.ends_at), reward_id: c.reward_id || '' })}><Icon name="edit" size={14} /> Editar</button>
              {c.status !== 'active' && <button className="btn ghost sm" onClick={() => quick(c, { status: 'active' }, 'Reto activado')}>Activar</button>}
              {c.status === 'active' && <button className="btn ghost sm" onClick={() => quick(c, { status: 'closed' }, 'Reto cerrado')}>Cerrar</button>}
              <button className="btn ghost sm" onClick={() => quick(c, { featured: !c.featured }, c.featured ? 'Ya no es destacado' : 'Destacado en el Inicio')}>{c.featured ? 'Quitar destacado' : 'Destacar en el Inicio'}</button>
              <button className="btn text sm" onClick={() => setDel(c)}><Icon name="trash" size={14} /> Borrar</button>
            </div>
          </div>
        ))}
      </div>
      <Confirm open={!!del} danger title="¿Borrar el reto?" text={`Se borra «${del?.title}» con todo su progreso. Los premios que ya se entregaron quedan.`} yes="Borrar"
        onYes={async () => { const c = del; setDel(null); try { await mt('bb_mt_admin_challenge_delete', { p_id: c.id }); notify('ok', 'Reto borrado'); r.reload(); } catch (e) { notify('err', e.message); } }} onNo={() => setDel(null)} />
    </div>
  );
}

function RetoEditor({ init, onDone }) {
  const { notify } = useAuth();
  const [f, setF] = useState(() => ({ ...init, metricBase: init.metric?.split(':')[0] || 'orders', metricArg: init.metric?.split(':')[1] || '' }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const metric = f.metricBase === 'product' ? `product:${f.metricArg || 'llavero'}` : f.metricBase === 'material' ? `material:${f.metricArg || 'PLA'}` : f.metricBase;
  const save = async () => {
    setBusy(true);
    try {
      await mt('bb_mt_admin_challenge_save', { p: {
        id: f.id || null, kind: f.kind, scope: f.scope, title: f.title, description: f.description, metric, target: Number(f.target),
        min_hours: Number(f.min_hours) || 1, recur: f.recur, reward_points: Number(f.reward_points) || 0, reward_id: f.reward_id || '',
        featured: !!f.featured, status: f.status, starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null, ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : '',
      } });
      notify('ok', 'Reto guardado'); onDone();
    } catch (e) { notify('err', e.message); }
    setBusy(false);
  };
  return (
    <div className="card mt-adm-card mt-editor">
      <div className="section-label">{f.id ? 'EDITAR RETO' : 'NUEVO RETO'}</div>
      <label className="ed-field"><span className="ed-label">Título</span><div className="pink-input"><input value={f.title} onChange={set('title')} maxLength={80} placeholder="Ej.: Imprimí 30 piezas en TPU" /></div></label>
      <label className="ed-field"><span className="ed-label">Descripción (opcional)</span><div className="pink-input"><textarea rows={2} value={f.description} onChange={set('description')} maxLength={300} /></div></label>
      <div className="mt-form-row">
        <label className="ed-field"><span className="ed-label">Tipo</span><select className="mt-select" value={f.kind} onChange={set('kind')}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="ed-field"><span className="ed-label">Quién lo juega</span><select className="mt-select" value={f.scope} onChange={set('scope')}>{SCOPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="ed-field"><span className="ed-label">Se renueva</span><select className="mt-select" value={f.recur} onChange={set('recur')}><option value="none">No (una vez)</option><option value="day">Cada día</option><option value="week">Cada lunes</option></select></label>
      </div>
      <div className="mt-form-row">
        <label className="ed-field"><span className="ed-label">Qué se cuenta</span><select className="mt-select" value={f.metricBase} onChange={set('metricBase')}>{METRICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {f.metricBase === 'product' && <label className="ed-field"><span className="ed-label">Producto</span><select className="mt-select" value={f.metricArg || 'llavero'} onChange={set('metricArg')}>{Object.entries(PRODUCTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
        {f.metricBase === 'material' && <label className="ed-field"><span className="ed-label">Material</span><select className="mt-select" value={f.metricArg || 'PLA'} onChange={set('metricArg')}>{MATS.map((v) => <option key={v} value={v}>{v === 'PACF' ? 'PA-CF' : v}</option>)}</select></label>}
        <label className="ed-field"><span className="ed-label">Meta</span><div className="pink-input"><input type="number" min="1" value={f.target} onChange={set('target')} /></div></label>
        <label className="ed-field"><span className="ed-label">Mínimo de horas</span><div className="pink-input"><input type="number" min="0.05" step="0.5" value={f.min_hours} onChange={set('min_hours')} /></div>
          <span className="ed-hint">Anti-trampa: nadie puede completarlo en menos tiempo.</span></label>
      </div>
      <div className="mt-form-row">
        <label className="ed-field"><span className="ed-label">Puntos de premio</span><div className="pink-input"><input type="number" min="0" max="5000" value={f.reward_points} onChange={set('reward_points')} /></div></label>
        <label className="ed-field"><span className="ed-label">Premio virtual</span>
          <select className="mt-select" value={f.reward_id} onChange={set('reward_id')}>
            <option value="">Sin premio virtual</option>
            {Object.entries(REWARD_KINDS).map(([k, l]) => <optgroup key={k} label={l}>{Object.entries(REWARDS).filter(([, r]) => r.kind === k).map(([id, r]) => <option key={id} value={id}>{r.name}</option>)}</optgroup>)}
          </select>
          <span className="ed-hint">Los banners solo sirven en retos de granja. Nada da ventajas: son estéticos.</span></label>
      </div>
      <div className="mt-form-row">
        <label className="ed-field"><span className="ed-label">Empieza</span><div className="pink-input"><input type="datetime-local" value={f.starts_at || ''} onChange={set('starts_at')} /></div><span className="ed-hint">Vacío = ahora.</span></label>
        <label className="ed-field"><span className="ed-label">Termina (opcional)</span><div className="pink-input"><input type="datetime-local" value={f.ends_at || ''} onChange={set('ends_at')} /></div></label>
        <label className="ed-field"><span className="ed-label">Estado</span><select className="mt-select" value={f.status} onChange={set('status')}><option value="draft">Borrador</option><option value="active">Activo</option><option value="closed">Cerrado</option></select></label>
      </div>
      <label className="toggle-row"><input type="checkbox" checked={!!f.featured} onChange={set('featured')} /><span className="switch" /><span>Destacarlo en el Inicio de BATBOX</span></label>
      <div className="mt-adm-actions">
        <button className="btn primary" disabled={busy || f.title.trim().length < 3 || !(Number(f.target) > 0)} onClick={save}><Icon name="check" size={16} /> Guardar reto</button>
        <button className="btn text" onClick={onDone}>Cancelar</button>
      </div>
    </div>
  );
}

// ---------- Jugadores ----------
function Jugadores() {
  const { notify } = useAuth();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  const r = useLoad('bb_mt_admin_players', { p_search: term || null, p_limit: 200 }, [term]);
  const [open, setOpen] = useState(null);
  if (r.error === 'missing') return <Missing />;
  if (r.error) return <Empty icon="alert" title="No se pudo cargar" text={r.error} />;
  const act = async (fn, args, ok) => { try { await mt(fn, args); notify('ok', ok); r.reload(); } catch (e) { notify('err', e.message); } };
  return (
    <div className="mt-adm">
      <SearchInput value={q} onChange={setQ} placeholder="Buscar por apodo o email" />
      <p className="ed-hint">«Días al tope» = días de la última semana en que llegó al máximo de puntos por pedidos. Si alguien lo hace siempre y con números raros, revisalo.</p>
      {!r.data && <div className="empty"><div className="spinner" /></div>}
      {r.data?.length === 0 && <Empty icon="users" title="Sin jugadores" text="Todavía nadie creó su perfil online." />}
      <div className="mt-players">
        {(r.data || []).map((p) => (
          <div key={p.user_id} className={'card mt-player' + (p.banned ? ' banned' : '')}>
            <button className="mt-player-head" onClick={() => setOpen(open === p.user_id ? null : p.user_id)}>
              <span className="mt-player-name"><b>{p.nick}</b>{p.playing && <i className="mt-dot" title="Jugando ahora" />}<small>{p.email}</small></span>
              <span className="mt-player-stats"><b>{num(p.points)}</b><small>temporada · {num(p.week_points)} semana · {num(p.today)} hoy</small></span>
              {p.banned ? <span className="chip err">Bloqueado</span> : p.cap_days >= 5 ? <span className="chip warn">{p.cap_days} días al tope</span> : <span className="chip muted">{p.privacy}</span>}
            </button>
            {open === p.user_id && (
              <div className="mt-player-body">
                <small className="ed-hint">Granja: {p.farm || '—'} · Última partida en la nube: {when(p.saved_at)}{p.summary ? ` · ${num(p.summary.machines)} máquinas, ${num(p.summary.pieces)} piezas, ${num(p.summary.moves)} mudanzas` : ''}</small>
                {p.banned && <small className="ed-hint">Motivo del bloqueo: {p.ban_reason || '—'}</small>}
                <PlayerActions p={p} act={act} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerActions({ p, act }) {
  const [reason, setReason] = useState('');
  const [nick, setNick] = useState(p.nick);
  const [reward, setReward] = useState('');
  const [confirm, setConfirm] = useState(null);
  return (
    <div className="mt-player-actions">
      {!p.banned ? (
        <div className="mt-inline"><div className="pink-input"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo del bloqueo (lo ve el jugador)" /></div>
          <button className="btn danger sm" onClick={() => setConfirm({ t: '¿Bloquear del ranking?', x: 'Puede seguir jugando y guardando, pero no suma puntos ni aparece en rankings.', go: () => act('bb_mt_admin_player_set', { p_user: p.user_id, p_banned: true, p_reason: reason || null }, 'Jugador bloqueado') })}>Bloquear</button></div>
      ) : <button className="btn ghost sm" onClick={() => act('bb_mt_admin_player_set', { p_user: p.user_id, p_banned: false }, 'Jugador desbloqueado')}>Desbloquear</button>}
      <div className="mt-inline"><div className="pink-input"><input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} /></div>
        <button className="btn ghost sm" disabled={nick.trim() === p.nick} onClick={() => act('bb_mt_admin_player_set', { p_user: p.user_id, p_nick: nick.trim() }, 'Apodo cambiado')}>Cambiar apodo</button></div>
      <div className="mt-inline">
        <select className="mt-select" value={reward} onChange={(e) => setReward(e.target.value)}><option value="">Elegí un premio…</option>{Object.entries(REWARDS).map(([id, x]) => <option key={id} value={id}>{x.name}</option>)}</select>
        <button className="btn ghost sm" disabled={!reward} onClick={() => act('bb_mt_admin_grant', { p_user: p.user_id, p_reward: reward }, 'Premio entregado')}>Regalar premio</button>
      </div>
      <div className="mt-adm-actions">
        <button className="btn text sm" onClick={() => setConfirm({ t: '¿Borrar sus puntos?', x: 'Se borran sus puntos de esta temporada y de esta semana. La partida no se toca.', go: () => act('bb_mt_admin_player_set', { p_user: p.user_id, p_reset_points: true }, 'Puntos borrados') })}>Borrar puntos de la temporada</button>
        <button className="btn text sm" onClick={() => setConfirm({ t: '¿Recuperar la copia anterior?', x: 'Para cuando alguien dice que perdió la partida: cambia la partida de la nube por la copia anterior (la actual queda como copia).', go: () => act('bb_mt_admin_restore_prev', { p_user: p.user_id }, 'Copia anterior recuperada') })}>Recuperar copia anterior de la nube</button>
      </div>
      <Confirm open={!!confirm} danger title={confirm?.t} text={confirm?.x} yes="Sí, hacerlo" onYes={() => { const c = confirm; setConfirm(null); c.go(); }} onNo={() => setConfirm(null)} />
    </div>
  );
}

// ---------- Granjas ----------
function Granjas() {
  const { notify } = useAuth();
  const r = useLoad('bb_mt_admin_farms');
  const [confirm, setConfirm] = useState(null);
  const [names, setNames] = useState({});
  if (r.error === 'missing') return <Missing />;
  if (r.error) return <Empty icon="alert" title="No se pudo cargar" text={r.error} />;
  const act = async (args, ok) => { try { await mt('bb_mt_admin_farm_set', args); notify('ok', ok); r.reload(); } catch (e) { notify('err', e.message); } };
  return (
    <div className="mt-adm">
      {!r.data && <div className="empty"><div className="spinner" /></div>}
      {r.data?.length === 0 && <Empty icon="users" title="Sin granjas" text="Todavía nadie creó una granja." />}
      <div className="mt-players">
        {(r.data || []).map((f) => (
          <div key={f.id} className={'card mt-player' + (f.hidden ? ' banned' : '')}>
            <div className="mt-farm-adm">
              <Emblem emblem={f.emblem} color={f.color} size={40} />
              <span className="mt-player-name"><b>{f.name}</b><small>Código {f.code} · {f.open ? 'abierta' : 'con código'} · {num(f.points)} pts · creada {when(f.created_at)}</small>
                {f.description && <small>«{f.description}»</small>}
                <small>{(f.members || []).map((m) => `${m.nick} (${m.role}, ${num(m.contributed)})`).join(' · ')}</small></span>
              {f.hidden && <span className="chip err">Oculta</span>}
            </div>
            <div className="mt-player-actions">
              <div className="mt-inline"><div className="pink-input"><input value={names[f.id] ?? f.name} onChange={(e) => setNames((x) => ({ ...x, [f.id]: e.target.value }))} maxLength={28} /></div>
                <button className="btn ghost sm" disabled={(names[f.id] ?? f.name).trim() === f.name} onClick={() => act({ p_farm: f.id, p_name: names[f.id] }, 'Nombre cambiado')}>Renombrar</button></div>
              <div className="mt-adm-actions">
                <button className="btn ghost sm" onClick={() => act({ p_farm: f.id, p_hidden: !f.hidden }, f.hidden ? 'Granja visible' : 'Granja oculta')}>{f.hidden ? 'Mostrar' : 'Ocultar (moderación)'}</button>
                {f.description && <button className="btn ghost sm" onClick={() => act({ p_farm: f.id, p_description: '' }, 'Descripción borrada')}>Borrar descripción</button>}
                <button className="btn text sm" onClick={() => setConfirm(f)}><Icon name="trash" size={14} /> Disolver</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Confirm open={!!confirm} danger title="¿Disolver la granja?" text={`Se borra «${confirm?.name}» y sus integrantes quedan sin granja. Sus partidas y premios no se tocan.`} yes="Disolver"
        onYes={() => { const f = confirm; setConfirm(null); act({ p_farm: f.id, p_dissolve: true }, 'Granja disuelta'); }} onNo={() => setConfirm(null)} />
    </div>
  );
}

// ---------- Filacolor ----------
function FilacolorAdmin() {
  const { notify } = useAuth();
  const current = useFilacolorSettings();
  const [banner, setBanner] = useState({ text: '', url: '' });
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(-1);
  useEffect(() => {
    if (list || current === undefined) return;
    setBanner(current?.banner || { text: '', url: '' });
    setList(current?.highlights?.length ? current.highlights : FILACOLOR.highlights.map((h) => ({ title: h.title, text: h.text, url: 'https://filacolor.com.ar' + h.path, image: '' })));
  }, [current, list]);
  if (!list) return <div className="empty"><div className="spinner" /></div>;
  const upd = (i, k, v) => setList((l) => l.map((h, j) => (j === i ? { ...h, [k]: v } : h)));
  const fill = async (i) => {
    setFilling(i);
    try {
      const { data } = await api.fetchLinkPreview(list[i].url, null);
      setList((l) => l.map((h, j) => (j === i ? { ...h, title: h.title || data.title || '', text: h.text || (data.description || '').slice(0, 160), image: data.thumb || h.image } : h)));
      notify('ok', 'Datos traídos desde la página');
    } catch (e) { notify('err', e.message); }
    setFilling(-1);
  };
  const save = async () => {
    const clean = list.filter((h) => h.title.trim() && /^https:\/\//.test(h.url || '')).map((h) => ({ title: h.title.trim(), text: (h.text || '').trim(), url: h.url.trim(), image: /^https:\/\//.test(h.image || '') ? h.image : '' }));
    setBusy(true);
    try { await api.saveSetting('filacolor', { banner: banner.text.trim() ? { text: banner.text.trim(), url: banner.url.trim() } : null, highlights: clean }); notify('ok', 'Filacolor actualizado en BATBOX y en el juego'); }
    catch (e) { notify('err', e.message); }
    setBusy(false);
  };
  return (
    <div className="mt-adm">
      <p className="ed-hint">Lo que cargues acá se ve en la página de Filacolor de BATBOX y en la pestaña Filacolor del juego. Sin precios ni stock (cambian todo el tiempo): título, una frase y el enlace al producto o la promo. Pegá el enlace y tocá «Completar» para traer el título y la foto.</p>
      <section className="card mt-adm-card">
        <div className="section-label">BANNER DE CAMPAÑA (OPCIONAL)</div>
        <div className="mt-form-row">
          <label className="ed-field"><span className="ed-label">Texto</span><div className="pink-input"><input value={banner.text} onChange={(e) => setBanner((b) => ({ ...b, text: e.target.value }))} maxLength={90} placeholder="Ej.: Nuevos colores de PLA Silk en Filacolor" /></div></label>
          <label className="ed-field"><span className="ed-label">Enlace</span><div className="pink-input"><input value={banner.url} onChange={(e) => setBanner((b) => ({ ...b, url: e.target.value }))} placeholder="https://filacolor.com.ar/…" /></div></label>
        </div>
      </section>
      <section className="card mt-adm-card">
        <div className="section-label">DESTACADOS</div>
        {list.map((h, i) => (
          <div key={i} className="mt-hl-edit">
            <div className="mt-form-row">
              <label className="ed-field"><span className="ed-label">Enlace</span><div className="pink-input"><input value={h.url} onChange={(e) => upd(i, 'url', e.target.value)} placeholder="https://filacolor.com.ar/producto/…" /></div></label>
              <button className="btn ghost sm" disabled={filling === i || !/^https:\/\//.test(h.url || '')} onClick={() => fill(i)}>{filling === i ? 'Leyendo…' : 'Completar'}</button>
            </div>
            <div className="mt-form-row">
              <label className="ed-field"><span className="ed-label">Título</span><div className="pink-input"><input value={h.title} onChange={(e) => upd(i, 'title', e.target.value)} maxLength={60} /></div></label>
              <label className="ed-field"><span className="ed-label">Frase</span><div className="pink-input"><input value={h.text} onChange={(e) => upd(i, 'text', e.target.value)} maxLength={160} /></div></label>
            </div>
            {h.image && <img className="mt-hl-img" src={h.image} alt="" />}
            <div className="mt-adm-actions">
              <button className="btn text sm" disabled={i === 0} onClick={() => setList((l) => { const a = [...l]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; })}>▲</button>
              <button className="btn text sm" disabled={i === list.length - 1} onClick={() => setList((l) => { const a = [...l]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return a; })}>▼</button>
              {h.image && <button className="btn text sm" onClick={() => upd(i, 'image', '')}>Quitar foto</button>}
              <button className="btn text sm" onClick={() => setList((l) => l.filter((_, j) => j !== i))}><Icon name="trash" size={14} /> Quitar</button>
            </div>
          </div>
        ))}
        <button className="btn ghost" disabled={list.length >= 8} onClick={() => setList((l) => [...l, { title: '', text: '', url: '', image: '' }])}>+ Agregar destacado</button>
      </section>
      <button className="btn primary" disabled={busy} onClick={save}><Icon name="check" size={16} /> Guardar Filacolor</button>
    </div>
  );
}
