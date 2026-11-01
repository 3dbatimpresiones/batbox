import { useRef, useState } from 'react';
import * as api from './communityApi.js';

// Fotos adjuntas de un formulario (foro). Se optimizan en el navegador y se suben a
// bb-community/<uid>/. Las subidas de la sesión se borran si se cancela el formulario.
export function useUploads(uid, max = 3, initial = []) {
  const [media, setMedia] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const added = useRef([]);

  const pick = async (files) => {
    setError('');
    const room = max - media.length;
    if (room <= 0) { setError(`Máximo ${max} imágenes.`); return; }
    setBusy(true);
    try {
      for (const f of [...files].slice(0, room)) {
        const m = await api.uploadImage(uid, f);
        added.current.push(m.path);
        setMedia((cur) => [...cur, m]);
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const drop = (path) => {
    setMedia((cur) => cur.filter((m) => m.path !== path));
    if (added.current.includes(path)) { api.removeImages([path]); added.current = added.current.filter((x) => x !== path); }
  };
  const discard = () => { api.removeImages(added.current); added.current = []; };
  const commit = () => { added.current = []; };
  const reset = () => { setMedia([]); added.current = []; };
  return { media, busy, error, setError, pick, drop, discard, commit, reset };
}
