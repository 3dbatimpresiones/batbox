import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { sendFeedback } from '../lib/feedbackApi.js';
import Icon from './Icon.jsx';
import { Options } from './ui.jsx';

const KINDS = [
  { value: 'idea', label: '💡 Una idea' },
  { value: 'error', label: '🐞 Algo anda mal' },
  { value: 'otro', label: '💬 Otra cosa' },
];

export default function FeedbackModal({ source, sourceLabel, context, onClose }) {
  const { displayName, email, simulated } = useAuth();
  const [kind, setKind] = useState('idea');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const send = async () => {
    setBusy(true); setError('');
    try {
      if (!simulated) await sendFeedback({
        source, kind, message: message.trim(),
        context: { ...context, w: window.innerWidth, ua: (navigator.userAgent || '').slice(0, 120) },
      });
      setSent(true);
    } catch (e) {
      setError(e.missing ? 'Las sugerencias todavía no están activadas. Falta la migración 042.' : e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-head">
          <div><div className="section-label">{sourceLabel}</div><h2 id="feedback-title">Sugerencias</h2></div>
          <button type="button" className="mini-btn" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {sent ? <div className="feedback-sent">
          <div className="big-ico tone-ok"><Icon name="check" size={28} /></div>
          <p><b>¡Gracias! Ya le llegó al equipo de 3DBAT.</b><br />Leemos todas las ideas y reportes.</p>
          <button type="button" className="btn primary" onClick={onClose}>Seguir usando la herramienta</button>
        </div> : <>
          <p>¿Qué te gustaría mejorar? ¿Algo no funciona como esperabas? Contanos.</p>
          <Options value={kind} onChange={setKind} options={KINDS} />
          <div className="pink-input feedback-text"><textarea rows={5} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder={kind === 'error' ? 'Ej.: cuando intento editar un pedido…' : 'Ej.: estaría bueno poder…'} autoFocus /></div>
          <small className="feedback-count">{message.length}/1000</small>
          <p className="feedback-who">Se envía como <b>{displayName || email}</b>.</p>
          {error && <div className="feedback-error">{error}</div>}
          <div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn primary" disabled={busy || message.trim().length < 5} onClick={send}>
              <Icon name="message" size={16} /> {busy ? 'Enviando…' : 'Mandar sugerencia'}
            </button></div>
        </>}
      </div>
    </div>
  );
}
