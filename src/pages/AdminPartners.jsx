import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../lib/communityApi.js';
import Icon from '../components/Icon.jsx';
import { PartnerLogo } from '../components/PartnerBits.jsx';
import { Confirm, Empty } from '../components/ui.jsx';

// Pestaña "Patrocinadores" del panel (#/admin?tab=partners). Solo administración (la base lo exige con is_admin()).
// No hay datos de ejemplo: solo se muestran marcas con las que realmente se trabaja.

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
const EMPTY = { name: '', slug: '', type: 'filamentos', types: ['filamentos'], relation: 'collaborator', tagline: '', description: '', logo_path: '', logo_bare: false, website: 'https://', links: [], status: 'draft', featured: false, sort: 100, starts_on: '', ends_on: '' };
const EMPTY_B = { title: '', description: '', code: '', url: '', members_only: true, valid_until: '', active: true, sort: 100 };

function Benefits({ partnerId }) {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.adminBenefits(partnerId).then(setList).catch((e) => setError(e.message)), [partnerId]);
  useEffect(() => { load(); }, [load]);
  const move = async (i, d) => {
    const ids = list.map((x) => x.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setList(ids.map((id) => list.find((x) => x.id === id)));
    try { await api.reorderPartners(ids); load(); } catch (e) { setError(e.message); load(); }
  };
  const save = async () => { try { await api.saveBenefit(partnerId, edit); setEdit(null); setError(''); load(); } catch (e) { setError(e.message); } };
  return (
    <div className="ap-benefits">
      <div className="cm-mod-head"><b>Beneficios y cupones</b><button type="button" className="btn ghost" onClick={() => setEdit({ ...EMPTY_B })}>+ Beneficio</button></div>
      {error && <div className="feedback-error">{error}</div>}
      {edit && (
        <div className="card cm-report">
          <div className="pink-input"><input value={edit.title} maxLength={80} placeholder="Título (ej.: 10% en filamentos)" onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
          <div className="pink-input"><input value={edit.description} maxLength={300} placeholder="Detalle (opcional)" onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
          <div className="cm-row">
            <div className="pink-input"><input value={edit.code || ''} maxLength={40} placeholder="Código de cupón (opcional)" onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></div>
            <div className="pink-input"><input value={edit.url || ''} maxLength={300} placeholder="https://… enlace de la oferta (opcional)" inputMode="url" onChange={(e) => setEdit({ ...edit, url: e.target.value })} /></div>
          </div>
          <div className="cm-row">
            <label className="field"><span>Válido hasta (opcional)</span><div className="pink-input"><input type="date" value={edit.valid_until || ''} onChange={(e) => setEdit({ ...edit, valid_until: e.target.value })} /></div></label>
            <label className="nb-pref"><input type="checkbox" checked={edit.members_only} onChange={(e) => setEdit({ ...edit, members_only: e.target.checked })} /> Solo para el Makers Club (el código se oculta al resto)</label>
            <label className="nb-pref"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Activo</label>
          </div>
          <div className="modal-actions"><button type="button" className="btn text" onClick={() => setEdit(null)}>Cancelar</button>
            <button type="button" className="btn primary" disabled={edit.title.trim().length < 2} onClick={save}>Guardar beneficio</button></div>
        </div>
      )}
      {!list ? <div className="cm-loading"><span className="spinner xs" /></div> : list.length === 0 ? <small className="cm-date">Todavía no hay beneficios.</small> : list.map((b) => (
        <div key={b.id} className="cm-mod-head ap-row">
          <span><b>{b.title}</b> {b.code && <code>{b.code}</code>} {b.members_only && <span className="chip club">Club</span>} {!b.active && <span className="chip muted">Apagado</span>} {b.valid_until && <small className="cm-date">hasta {b.valid_until}</small>}</span>
          <span><button type="button" className="cm-link" onClick={() => setEdit({ ...EMPTY_B, ...b })}>Editar</button>{' '}
            <button type="button" className="cm-link danger" onClick={() => api.deleteBenefit(b.id).then(load).catch((e) => setError(e.message))}>Borrar</button></span>
        </div>
      ))}
    </div>
  );
}

function Form({ initial, onDone, onCancel }) {
  const [f, setF] = useState({ ...EMPTY, ...initial, website: initial.website || 'https://', starts_on: initial.starts_on || '', ends_on: initial.ends_on || '', links: initial.links || [] });
  const [id, setId] = useState(initial.id || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const file = useRef(null);
  const set = (x) => setF((c) => ({ ...c, ...x }));
  const save = async () => {
    setBusy(true); setError(''); setOk('');
    try { const newId = await api.savePartner({ ...f, id, website: f.website === 'https://' ? '' : f.website }); setId(newId); setOk('Guardado.'); onDone(false); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const logo = async (files) => {
    if (!files?.[0]) return;
    setBusy(true); setError('');
    try { set({ logo_path: await api.uploadPartnerLogo(files[0]) }); } catch (e) { setError(e.message); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  const valid = f.name.trim().length >= 2 && /^[a-z0-9-]{2,50}$/.test(f.slug);
  return (
    <div className="card cm-composer ap-form">
      <h3>{id ? 'Editar' : 'Nuevo'} patrocinador / colaborador</h3>
      <div className="cm-row">
        <label className="field"><span>Nombre</span><div className="pink-input"><input value={f.name} maxLength={80} onChange={(e) => set({ name: e.target.value, slug: id ? f.slug : slugify(e.target.value) })} /></div></label>
        <label className="field"><span>Dirección (slug)</span><div className="pink-input"><input value={f.slug} maxLength={50} disabled={!!id} onChange={(e) => set({ slug: e.target.value })} /></div></label>
      </div>
      <div className="cm-row">
        <div className="field"><span>Categorías (hasta 4)</span>
          <div className="cm-cats" role="group" aria-label="Categorías">
            {api.PARTNER_TYPES.map((t) => { const on = (f.types || []).includes(t.value); return (
              <button key={t.value} type="button" className={'opt' + (on ? ' active' : '')} aria-pressed={on}
                onClick={() => { const cur = f.types || []; const n = on ? cur.filter((x) => x !== t.value) : [...cur, t.value].slice(0, 4); if (n.length) set({ types: n, type: n[0] }); }}>{t.label}</button>); })}
          </div></div>
        <label className="field"><span>Relación (se muestra públicamente)</span><div className="pink-input"><select value={f.relation} onChange={(e) => set({ relation: e.target.value })}>
          <option value="sponsor">Patrocinado (colaboración comercial)</option><option value="collaborator">Colaborador (sin pago)</option></select></div></label>
      </div>
      <label className="field"><span>Frase corta</span><div className="pink-input"><input value={f.tagline} maxLength={140} onChange={(e) => set({ tagline: e.target.value })} /></div></label>
      <label className="field"><span>Descripción</span><div className="pink-input feedback-text"><textarea rows={4} maxLength={1500} value={f.description} onChange={(e) => set({ description: e.target.value })} /></div></label>
      <div className="ap-logo">
        <PartnerLogo p={{ name: f.name || '?', logo_path: f.logo_path, logo_bare: f.logo_bare }} size={72} />
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => logo(e.target.files)} />
        <button type="button" className="btn ghost" disabled={busy} onClick={() => file.current?.click()}><Icon name="image" size={16} /> {f.logo_path ? 'Cambiar logo' : 'Subir logo'}</button>
        <label className="nb-pref"><input type="checkbox" checked={!!f.logo_bare} onChange={(e) => set({ logo_bare: e.target.checked })} /> Logo sin fondo (sin el cuadrado blanco; usá un PNG transparente)</label>
        <small className="cm-date">JPG, PNG o WebP. Se achica solo. Mejor con fondo transparente o claro.</small>
      </div>
      <label className="field"><span>Sitio web (https)</span><div className="pink-input"><input value={f.website} maxLength={300} inputMode="url" onChange={(e) => set({ website: e.target.value })} /></div></label>
      <div><div className="cm-date">Redes (hasta 6, solo https)</div>
        {f.links.map((l, i) => (
          <div key={i} className="ga-kv"><div className="pink-input"><input value={l.label} maxLength={30} placeholder="Red" onChange={(e) => set({ links: f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></div>
            <div className="pink-input"><input value={l.url} maxLength={300} placeholder="https://…" onChange={(e) => set({ links: f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} /></div>
            <button type="button" className="mini-btn" onClick={() => set({ links: f.links.filter((_, j) => j !== i) })} aria-label="Quitar red">×</button></div>))}
        {f.links.length < 6 && <button type="button" className="cm-link" onClick={() => set({ links: [...f.links, { label: '', url: 'https://' }] })}>+ Agregar red</button>}</div>
      <div className="cm-row">
        <label className="field"><span>Estado</span><div className="pink-input"><select value={f.status} onChange={(e) => set({ status: e.target.value })}>{Object.entries(api.PARTNER_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></label>
        <label className="field"><span>Desde (opcional)</span><div className="pink-input"><input type="date" value={f.starts_on} onChange={(e) => set({ starts_on: e.target.value })} /></div></label>
        <label className="field"><span>Hasta (opcional)</span><div className="pink-input"><input type="date" value={f.ends_on} onChange={(e) => set({ ends_on: e.target.value })} /></div></label>
        <label className="field"><span>Orden</span><div className="pink-input"><input type="number" value={f.sort} onChange={(e) => set({ sort: e.target.value })} /></div></label>
      </div>
      <label className="nb-pref"><input type="checkbox" checked={f.featured} onChange={(e) => set({ featured: e.target.checked })} /> Destacado (aparece primero y en la franja del Inicio)</label>
      <small className="cm-date">Solo se muestra si el estado es “Activo” y hoy (hora de Buenos Aires) está dentro de las fechas. Fuera de fecha se oculta solo.</small>
      {error && <div className="feedback-error">{error}</div>}
      {ok && <div className="cm-ok">{ok}</div>}
      <div className="modal-actions"><button type="button" className="btn text" onClick={onCancel}>Cerrar</button>
        <button type="button" className="btn primary" disabled={busy || !valid} onClick={save}>Guardar</button></div>
      {id ? <Benefits partnerId={id} /> : <small className="cm-date">Guardá la marca para poder cargar sus beneficios y cupones.</small>}
    </div>
  );
}

export default function AdminPartners() {
  const [list, setList] = useState(null);
  const [stats, setStats] = useState({});
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.adminPartners().then((l) => { setList(l); setError(''); }).catch((e) => { setError(e.missing ? 'Falta la migración 054.' : e.message); setList([]); });
    api.partnerStats().then((s) => setStats(Object.fromEntries(s.map((x) => [x.partner_id, x])))).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="cm-admin">
      <div className="cm-mod-head"><h3>Patrocinadores y colaboradores</h3><button type="button" className="btn primary" onClick={() => setEdit({})}>+ Nueva marca</button></div>
      <small className="cm-date">El directorio es público. Cargá solo marcas con las que realmente trabajás y rotulá bien si es un patrocinio comercial.</small>
      {error && <div className="feedback-error">{error}</div>}
      {edit && <Form key={edit.id || 'new'} initial={edit} onDone={() => load()} onCancel={() => { setEdit(null); load(); }} />}
      {!list ? <div className="cm-loading"><span className="spinner xs" /></div> : list.length === 0 && !edit ? <Empty icon="star" title="Todavía no cargaste ninguna marca" text="Tocá “Nueva marca” para empezar." />
        : list.map((p, i) => {
          const s = stats[p.id];
          return (
            <article key={p.id} className="card cm-report ap-item">
              <div className="ap-order">
                <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                <button type="button" aria-label="Bajar" disabled={i === list.length - 1} onClick={() => move(i, 1)}>▼</button>
              </div>
              <PartnerLogo p={p} size={52} />
              <div className="ap-item-txt">
                <b>{p.name}</b>
                <div className="fo-chips"><span className={'chip ' + (p.status === 'active' ? 'ok' : 'muted')}>{api.PARTNER_STATUS[p.status]}</span>
                  <span className={'chip ' + (p.relation === 'sponsor' ? 'club' : 'cat')}>{p.relation === 'sponsor' ? 'Patrocinado' : 'Colaborador'}</span>
                  {api.partnerTypes(p).map((t) => <span key={t} className="chip muted">{api.PARTNER_TYPE_LABEL[t] || t}</span>)}{p.featured && <span className="chip cat">Destacado</span>}</div>
                {s && <small className="cm-date">Últimos 30 días: {s.web} visitas al sitio · {s.benefit} usos de beneficios · {s.social} clics en redes (personas distintas por día)</small>}
              </div>
              <span><button type="button" className="cm-link" onClick={() => setEdit(p)}>Editar</button>{' '}
                <button type="button" className="cm-link danger" onClick={() => setDel(p)}>Borrar</button></span>
            </article>
          );
        })}
      <Confirm open={!!del} danger title={`¿Borrar a ${del?.name}?`} text="Se borran también sus beneficios y métricas. Si solo querés ocultarla, ponela en Pausado." yes="Borrar"
        onYes={async () => { const d = del; setDel(null); try { await api.deletePartner(d.id); load(); } catch (e) { setError(e.message); } }} onNo={() => setDel(null)} />
    </div>
  );
}
