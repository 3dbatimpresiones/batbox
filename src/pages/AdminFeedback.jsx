import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { loadAdminFeedback, setAdminFeedback } from '../lib/feedbackApi.js';
import Icon from '../components/Icon.jsx';
import { Confirm, Empty, Options } from '../components/ui.jsx';
import { FEEDBACK_TOOLS } from '../components/FeedbackButton.jsx';

const KINDS = { idea: ['💡 Idea', 'ok'], error: ['🐞 Algo anda mal', 'err'], otro: ['💬 Otra cosa', 'muted'] };
const STATUSES = [{ value: 'nueva', label: 'Nuevas' }, { value: 'leida', label: 'Leídas' }, { value: 'hecha', label: 'Hechas' }, { value: '', label: 'Todas' }];
const SOURCES = Object.fromEntries(Object.entries(FEEDBACK_TOOLS).map(([source, tool]) => [source, tool.label]));
const sourceName = (source) => SOURCES[source] || source?.replaceAll('-', ' ') || 'Sin herramienta';
const when = (t) => t ? new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function AdminFeedback() {
  const { notify, simulated } = useAuth();
  const [status, setStatus] = useState('nueva');
  const [source, setSource] = useState('');
  const [state, setState] = useState({ loading: true, rows: [], error: '', missing: false });
  const [del, setDel] = useState(null);

  const load = useCallback(async () => {
    if (simulated) { setState({ loading: false, rows: [], error: '', missing: false }); return; }
    setState((s) => ({ ...s, loading: true, error: '' }));
    try { setState({ loading: false, rows: await loadAdminFeedback({ status, source }), error: '', missing: false }); }
    catch (e) { setState({ loading: false, rows: [], error: e.message, missing: !!e.missing }); }
  }, [status, source, simulated]);
  useEffect(() => { load(); }, [load]);

  const setStatusFor = async (id, next) => {
    try { await setAdminFeedback({ id, status: next }); load(); } catch (e) { notify('err', e.message); }
  };
  if (state.missing) return <Empty icon="alert" title="Falta la migración 042" text="Corré supabase/042_batbox_sugerencias.sql para activar el buzón general de herramientas." />;
  if (state.error) return <Empty icon="alert" title="No se pudieron cargar las sugerencias" text={state.error} />;

  return <div className="mt-admin">
    <p className="ed-hint">Sugerencias enviadas desde las herramientas de BATBOX. Cada tarjeta indica claramente desde cuál llegó.</p>
    <Options value={status} onChange={setStatus} options={STATUSES} />
    <div style={{ marginTop: 10 }}><Options value={source} onChange={setSource} options={[
      { value: '', label: 'Todas las herramientas' }, ...Object.entries(SOURCES).map(([value, label]) => ({ value, label })),
    ]} /></div>
    {state.loading && <div className="empty"><div className="spinner" /></div>}
    {!state.loading && state.rows.length === 0 && <Empty icon="message" title="Nada por acá" text={status === 'nueva' ? 'No hay sugerencias nuevas.' : 'No hay sugerencias con este filtro.'} />}
    <div className="mt-adm-list">{state.rows.map((f) => <div key={f.id} className="card mt-adm-ch mt-fb">
      <div className="mt-adm-ch-top">
        <span className="chip club">🧰 {sourceName(f.source)}</span>
        <span className={'chip ' + (KINDS[f.kind]?.[1] || 'muted')}>{KINDS[f.kind]?.[0] || f.kind}</span>
        {f.status !== 'nueva' && <span className="chip muted">{f.status === 'hecha' ? '✔ Hecha' : 'Leída'}</span>}
        <small className="ed-hint">{when(f.created_at)} · {f.who || 'Sin nombre'}</small>
      </div>
      <p className="mt-fb-msg">{f.message}</p>
      {f.context?.view && <small className="ed-hint">Vista: {f.context.view}{f.context.month ? ` · Mes: ${f.context.month}` : ''}</small>}
      <div className="mt-adm-actions">
        {f.status !== 'leida' && <button className="btn ghost sm" onClick={() => setStatusFor(f.id, 'leida')}>Marcar leída</button>}
        {f.status !== 'hecha' && <button className="btn ghost sm" onClick={() => setStatusFor(f.id, 'hecha')}>✔ Hecha</button>}
        {f.status !== 'nueva' && <button className="btn text sm" onClick={() => setStatusFor(f.id, 'nueva')}>Volver a nueva</button>}
        <button className="btn text sm" onClick={() => setDel(f)}><Icon name="trash" size={14} /> Borrar</button>
      </div>
    </div>)}</div>
    <Confirm open={!!del} danger title="¿Borrar la sugerencia?" text="No se puede deshacer." yes="Borrar"
      onYes={async () => { const f = del; setDel(null); try { await setAdminFeedback({ id: f.id, remove: true }); load(); } catch (e) { notify('err', e.message); } }} onNo={() => setDel(null)} />
  </div>;
}
