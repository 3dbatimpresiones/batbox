import { useEffect, useState } from 'react';

// Datos editables de un miembro (panel admin). Guarda con bb_admin_update_member (migración 019).
// No toca el correo, el estado ni los permisos.
const FIELDS = [
  ['first_name', 'Nombre', 'text'],
  ['last_name', 'Apellido', 'text'],
  ['phone', 'Celular', 'tel'],
  ['discord', 'Discord', 'text'],
  ['instagram', 'Instagram', 'text'],
];
export const memberData = (m) => ({
  first_name: m?.first_name || '', last_name: m?.last_name || '', phone: m?.phone || '',
  discord: m?.discord_username || '', instagram: m?.instagram_username || '',
});

export default function MemberDataForm({ member, busy, onSave }) {
  const [f, setF] = useState(() => memberData(member));
  useEffect(() => { setF(memberData(member)); }, [member]);
  const initial = memberData(member);
  const changed = Object.keys(f).some((k) => f[k].trim() !== initial[k]);
  return (
    <>
      <div className="member-form md-data">
        {FIELDS.map(([k, label, type]) => (
          <label key={k} className="ed-field">
            <span className="ed-label">{label}</span>
            <div className="pink-input"><input type={type} maxLength={k === 'phone' ? 30 : 60} value={f[k]}
              onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} /></div>
          </label>
        ))}
      </div>
      {changed && (
        <div className="md-data-actions">
          <button className="chip-btn" disabled={busy} onClick={() => setF(initial)}>Deshacer</button>
          <button className="chip-btn" disabled={busy} onClick={() => onSave(f)}>Guardar datos</button>
        </div>
      )}
    </>
  );
}
