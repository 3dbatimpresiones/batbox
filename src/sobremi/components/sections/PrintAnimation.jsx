import { useEffect, useRef } from 'react';

// Ilustración de la portada: una impresora 3D FDM armando un jarrón como una de verdad:
// la boquilla recorre cada capa de punta a punta (en zigzag, una capa en cada sentido) y el
// plástico va quedando detrás; al terminar la capa sube el eje Z y arranca la siguiente.
// El material recién extruido se ve rosa (caliente). Al final el cabezal sube y queda centrado.
// Se pausa fuera de pantalla. Se anima aunque el sistema tenga "reducir movimiento" (pedido del dueño).
//
// Rendimiento: React dibuja el SVG UNA sola vez; cada cuadro solo cambia atributos de los
// elementos que se mueven (sin re-render), así el scroll de la página no se traba.
const N = 16;          // capas
const STEP = 14;       // alto de capa + separación (exagerado para que se vea)
const LAYER_H = 11;
const PLATE_Y = 330;   // borde superior de la cama
const CX = 200;
const LAYER_MS = 450;  // tiempo en recorrer una capa
const Z_MS = 130;      // subida del eje Z entre capas
const HOLD_MS = 2000;  // pieza terminada antes de reiniciar
const FADE_MS = 450;
const PER = LAYER_MS + Z_MS;
const CYCLE = N * PER + HOLD_MS;

const layerY = (i) => PLATE_Y - (i + 1) * STEP + (STEP - LAYER_H);
const layerW = (i) => 100 + 60 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (i / (N - 1)) * 0.85));
const TIP = 2;         // la punta de la boquilla apoya sobre el cordón que deposita
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
// Dónde empieza y termina la boquilla en cada capa (zigzag: pares →, impares ←).
const startX = (i) => (i % 2 === 0 ? CX - layerW(i) / 2 : CX + layerW(i) / 2);
const endX = (i) => (i % 2 === 0 ? CX + layerW(i) / 2 : CX - layerW(i) / 2);
const LAYERS = Array.from({ length: N }, (_, i) => ({ y: layerY(i), w: layerW(i) }));

// Estado de la impresión en el instante t (ms dentro del ciclo).
function frame(t) {
  if (t >= N * PER) {                       // terminada: el cabezal sube y queda centrado sobre la pieza
    const h = t - N * PER;
    const a = ease(Math.min(1, h / 450));
    return { done: N, current: -1, p: 0, nx: endX(N - 1) + (CX - endX(N - 1)) * a, ny: layerY(N - 1) + TIP - a * 30,
      printing: false, finished: true, fading: h > HOLD_MS - FADE_MS };
  }
  const k = Math.floor(t / PER);
  const w = t - k * PER;
  if (w < LAYER_MS) {                       // recorriendo la capa k
    const p = w / LAYER_MS;
    return { done: k, current: k, p, nx: startX(k) + (endX(k) - startX(k)) * p, ny: layerY(k) + TIP, printing: true };
  }
  const z = ease((w - LAYER_MS) / Z_MS);    // sube Z y se acomoda al inicio de la próxima capa
  const next = Math.min(k + 1, N - 1);
  return { done: k + 1, current: -1, p: 0,
    nx: endX(k) + (startX(next) - endX(k)) * z,
    ny: layerY(k) + TIP + (layerY(next) - layerY(k)) * z, printing: false };
}

export default function PrintAnimation() {
  const wrap = useRef(null);
  const status = useRef(null);
  const piece = useRef(null);
  const layerEls = useRef([]);
  const hot = useRef(null);
  const gantry = useRef(null);
  const head = useRef(null);
  const melt = useRef(null);

  useEffect(() => {
    const prev = {};
    const set = (key, el, attr, value) => { if (prev[key] !== value) { prev[key] = value; el.setAttribute(attr, value); } };

    const draw = (t) => {
      const f = frame(t);
      for (let i = 0; i < N; i++) set('l' + i, layerEls.current[i], 'visibility', i < f.done ? 'visible' : 'hidden');
      if (f.current >= 0 && f.p > 0) {
        const l = LAYERS[f.current];
        const w = Math.max(LAYER_H, l.w * f.p + LAYER_H / 2); // el extremo redondeado queda debajo de la punta
        const x = f.current % 2 === 0 ? CX - l.w / 2 : CX + l.w / 2 - w;
        set('hv', hot.current, 'visibility', 'visible');
        set('hx', hot.current, 'x', x.toFixed(1));
        set('hy', hot.current, 'y', String(l.y));
        set('hw', hot.current, 'width', w.toFixed(1));
      } else set('hv', hot.current, 'visibility', 'hidden');
      set('gy', gantry.current, 'y', (f.ny - 62).toFixed(1));
      set('head', head.current, 'transform', `translate(${(f.nx - CX).toFixed(1)} ${f.ny.toFixed(1)})`);
      set('melt', melt.current, 'visibility', f.printing ? 'visible' : 'hidden');
      set('fade', piece.current, 'class', `pa-piece${f.fading ? ' fading' : ''}`);
      const label = f.finished ? '✔ Pieza lista' : `CAPA ${String(Math.min(N, f.printing ? f.current + 1 : f.done)).padStart(2, '0')}/${N}`;
      if (prev.label !== label) {
        prev.label = label;
        status.current.textContent = label;
        status.current.className = `print-status${f.finished ? ' done' : ''}`;
      }
    };

    let raf = null;
    let start = performance.now();
    let pausedAt = null;
    let visible = true;
    const loop = (now) => { draw((now - start) % CYCLE); raf = requestAnimationFrame(loop); };
    const run = () => {
      const on = visible && !document.hidden;
      if (on && raf === null) {
        if (pausedAt !== null) { start += performance.now() - pausedAt; pausedAt = null; }
        raf = requestAnimationFrame(loop);
      } else if (!on && raf !== null) {
        cancelAnimationFrame(raf); raf = null; pausedAt = performance.now();
      }
    };
    draw(0);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); });
    io.observe(wrap.current);
    document.addEventListener('visibilitychange', run);
    run();
    return () => { if (raf !== null) cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', run); };
  }, []);

  return (
    <div className="print-anim" ref={wrap}>
      <div className="print-status" ref={status} aria-hidden="true">CAPA 01/{N}</div>
      <svg viewBox="0 0 400 380" role="img" aria-label="Ilustración de una impresora 3D imprimiendo una pieza capa por capa">
        <defs>
          <linearGradient id="pa-layer" x1="0" y1={PLATE_Y} x2="0" y2={layerY(N - 1)} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#5DDADB" />
            <stop offset="1" stopColor="#9aa0ff" />
          </linearGradient>
          <radialGradient id="pa-glow">
            <stop offset="0" stopColor="#5DDADB" stopOpacity=".35" />
            <stop offset="1" stopColor="#5DDADB" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Marco */}
        <rect className="pa-frame" x="32" y="22" width="10" height="334" rx="5" />
        <rect className="pa-frame" x="358" y="22" width="10" height="334" rx="5" />
        <rect className="pa-frame" x="32" y="18" width="336" height="10" rx="5" />
        <rect className="pa-base" x="20" y="352" width="360" height="16" rx="8" />

        {/* Cama + brillo */}
        <ellipse cx={CX} cy={PLATE_Y + 2} rx="150" ry="26" fill="url(#pa-glow)" />
        <rect className="pa-plate" x="76" y={PLATE_Y} width="248" height="10" rx="5" />

        {/* Pieza: capas terminadas + la capa que se está imprimiendo (crece detrás de la boquilla) */}
        <g className="pa-piece" ref={piece}>
          {LAYERS.map((l, i) => (
            <rect key={i} ref={(el) => { layerEls.current[i] = el; }} className="pa-layer" visibility="hidden"
              x={CX - l.w / 2} y={l.y} width={l.w} height={LAYER_H} rx={LAYER_H / 2} />
          ))}
          <rect ref={hot} className="pa-layer hot" visibility="hidden" x={CX} y={LAYERS[0].y} width={LAYER_H} height={LAYER_H} rx={LAYER_H / 2} />
        </g>

        {/* Eje X (sube con Z) */}
        <rect ref={gantry} className="pa-gantry" x="36" y={layerY(0) + TIP - 62} width="328" height="10" rx="5" />
        {/* Carro + hotend + boquilla (se mueve en X a lo largo de la capa) */}
        <g ref={head}>
          <rect className="pa-car" x="172" y="-72" width="56" height="42" rx="10" />
          <rect className="pa-fan" x="186" y="-64" width="28" height="10" rx="5" />
          <rect className="pa-block" x="186" y="-30" width="28" height="16" rx="3" />
          <path className="pa-nozzle" d="M192 -14 H208 L200 -1 Z" />
          <rect ref={melt} className="pa-melt" x="197.5" y="-4" width="5" height="6" rx="2" visibility="hidden" />
        </g>
      </svg>
    </div>
  );
}
