import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

// Encuadre de la portada de una rifa en formato banner (3:1).
// Se arrastra la foto (mouse o dedo) y se ajusta el zoom; al confirmar devuelve
// un File WebP de 1800×600 con exactamente lo que se ve en el marco.
export const COVER_RATIO = 3;   // banner 3:1
const OUT_W = 1800;
const OUT_H = Math.round(OUT_W / COVER_RATIO);

export default function CoverCropper({ src, onCancel, onDone }) {
  const frame = useRef(null);
  const wrap = useRef(null);
  const drag = useRef(null);
  const [img, setImg] = useState(null);
  const [fw, setFw] = useState(640);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fh = fw / COVER_RATIO;

  useEffect(() => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => setImg(i);
    i.onerror = () => setError('No se pudo abrir la imagen.');
    i.src = src;
  }, [src]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const fit = () => setFw(Math.max(200, Math.min(720, el.clientWidth)));
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const base = img ? Math.max(fw / img.naturalWidth, fh / img.naturalHeight) : 1;
  const scale = base * zoom;
  const dw = img ? img.naturalWidth * scale : 0;
  const dh = img ? img.naturalHeight * scale : 0;
  const clamp = (o) => ({ x: Math.min(0, Math.max(fw - dw, o.x)), y: Math.min(0, Math.max(fh - dh, o.y)) });
  // Al abrir: centrada horizontalmente y pegada ARRIBA (la parte superior de la foto, como pide el banner).
  useEffect(() => { if (img) setOff(clamp({ x: (fw - dw) / 2, y: 0 })); }, [img, fw]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setOff((o) => clamp(o)); }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const down = (e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, o: off }; };
  const move = (e) => { const d = drag.current; if (d) setOff(clamp({ x: d.o.x + e.clientX - d.x, y: d.o.y + e.clientY - d.y })); };
  const up = () => { drag.current = null; };
  const key = (e) => {
    const step = e.shiftKey ? 40 : 10;
    const m = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (m) { e.preventDefault(); setOff((o) => clamp({ x: o.x + m[0], y: o.y + m[1] })); }
  };

  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const c = document.createElement('canvas');
      c.width = OUT_W; c.height = OUT_H;
      c.getContext('2d').drawImage(img, -off.x / scale, -off.y / scale, fw / scale, fh / scale, 0, 0, OUT_W, OUT_H);
      const blob = await new Promise((res) => c.toBlob(res, 'image/webp', 0.86));
      if (!blob) throw new Error('Este navegador no pudo recortar la imagen.');
      onDone(new File([blob], 'portada.webp', { type: 'image/webp' }));
    } catch (err) {
      setError(/tainted|insecure/i.test(String(err?.message)) ? 'No se pudo reencuadrar esta imagen. Subila de nuevo con «Cambiar foto».' : err.message);
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-back" onClick={busy ? undefined : onCancel}>
      <div className="modal rf-modal rf-cropper" role="dialog" aria-modal="true" aria-labelledby="rf-crop-h" onClick={(e) => e.stopPropagation()}>
        <div className="rf-modal-head"><h2 id="rf-crop-h">Encuadrar portada</h2><button type="button" className="mini-btn" aria-label="Cerrar" onClick={onCancel}>×</button></div>
        <p className="rf-muted">Arrastrá la foto para elegir qué parte se ve en el banner. Con el zoom la agrandás.</p>
        <div className="rf-crop-wrap" ref={wrap}>
          <div ref={frame} className="rf-crop-frame" style={{ width: fw, height: fh }} tabIndex={0} aria-label="Área de la portada: arrastrá o usá las flechas"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
            {img ? <img src={src} alt="" draggable={false} style={{ width: dw, height: dh, transform: `translate(${off.x}px, ${off.y}px)` }} />
              : !error && <span className="spinner" aria-label="Cargando" />}
            <span className="rf-crop-hint" aria-hidden><Icon name="image" size={14} /> Arrastrá para mover</span>
          </div>
        </div>
        <label className="rf-crop-zoom"><span>Zoom</span>
          <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} disabled={!img} /></label>
        {error && <div className="feedback-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn text" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="button" className="btn primary" onClick={confirm} disabled={!img || busy}>{busy ? 'Guardando…' : 'Usar este encuadre'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
