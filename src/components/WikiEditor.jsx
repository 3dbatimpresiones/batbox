import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { deleteWikiTerm, saveWikiTerm } from '../lib/wikiApi.js';
import Icon from './Icon.jsx';
import { Confirm } from './ui.jsx';

// Formulario para agregar o editar un término de la WikiBAT (equipo: admins y editores).
const EMPTY = { term: '', en: '', tag: '', def: '', pros: '', cons: '' };

export default function WikiEditor({ term, tags = [], onClose, onSaved }) {
  const { notify } = useAuth();
  const isNew = !term?.id;
  const [form, setForm] = useState({ ...EMPTY, ...(term || {}) });
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.term.trim()) { notify('err', 'Poné el nombre del término.'); return; }
    if (!form.def.trim()) { notify('err', 'Escribí la definición.'); return; }
    setBusy(true);
    try {
      await saveWikiTerm(form);
      notify('ok', isNew ? 'Término agregado a la WikiBAT' : 'Término actualizado');
      onSaved();
    } catch (e) { notify('err', e.message); } finally { setBusy(false); }
  };

  const remove = async () => {
    setAskDelete(false); setBusy(true);
    try {
      await deleteWikiTerm(term.id);
      notify('ok', 'Término borrado');
      onSaved();
    } catch (e) { notify('err', e.message); } finally { setBusy(false); }
  };

  return (
    <>
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="wiki-ed-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="wiki-ed-title">{isNew ? 'Agregar término' : `Editar "${term.term}"`}</h2>
        <p>Se ordena solo en orden alfabético. Lo ven todos en la WikiBAT apenas lo guardás.</p>
        <div className="member-form">
          <label className="ed-field">
            <span className="ed-label">Término *</span>
            <div className="pink-input"><input value={form.term} onChange={set('term')} placeholder="Ej: Boquilla de acero endurecido" autoFocus maxLength={120} /></div>
          </label>
          <label className="ed-field">
            <span className="ed-label">En inglés</span>
            <div className="pink-input"><input value={form.en} onChange={set('en')} placeholder="Ej: Hardened Steel Nozzle" maxLength={120} /></div>
          </label>
          <label className="ed-field span2">
            <span className="ed-label">Definición *</span>
            <div className="pink-input"><textarea rows={4} value={form.def} onChange={set('def')} maxLength={2000} /></div>
          </label>
          <label className="ed-field">
            <span className="ed-label">Etiqueta (opcional)</span>
            <div className="pink-input"><input list="wiki-tags" value={form.tag} onChange={set('tag')} placeholder="Ej: Tipo de impresora" maxLength={60} /></div>
            <datalist id="wiki-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
          </label>
          <span />
          <label className="ed-field">
            <span className="ed-label">Ventajas (opcional)</span>
            <div className="pink-input"><textarea rows={2} value={form.pros} onChange={set('pros')} maxLength={1000} /></div>
          </label>
          <label className="ed-field">
            <span className="ed-label">Desventajas (opcional)</span>
            <div className="pink-input"><textarea rows={2} value={form.cons} onChange={set('cons')} maxLength={1000} /></div>
          </label>
        </div>
        <div className="modal-actions">
          {!isNew && (
            <button className="btn danger wiki-del" onClick={() => setAskDelete(true)} disabled={busy}><Icon name="trash" size={16} /> Borrar</button>
          )}
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : <><Icon name="check" size={16} /> Guardar</>}</button>
        </div>
      </div>
    </div>
    {/* Fuera del fondo del editor: un clic en su fondo no cierra el editor */}
    <Confirm open={askDelete} danger title={`Borrar "${term?.term}"`} text="Se borra de la WikiBAT para todos. No se puede deshacer."
        yes="Borrar" onNo={() => setAskDelete(false)} onYes={remove} />
    </>
  );
}
