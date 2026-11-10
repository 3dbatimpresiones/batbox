import { audioCtx } from './sfx.js';
// "Game feel" de BATCARD: confeti, números flotantes, temblor y música ambiente sintetizada.
// Todo respeta movimiento reducido / destellos apagados (lo decide quien llama).

const PALETTE = ['#24DCFF', '#3167FF', '#873DFF', '#FF39B8', '#E2B13C', '#F5E9DB'];

// ---------- Confeti (canvas fijo a pantalla completa, se borra solo) ----------
let cv = null, ctx2d = null, parts = [], raf = 0;
function ensureCanvas() {
  if (cv) return;
  cv = document.createElement('canvas');
  cv.className = 'bc-confetti';
  document.body.appendChild(cv);
  ctx2d = cv.getContext('2d');
}
function loop() {
  const w = (cv.width = innerWidth), h = (cv.height = innerHeight);
  ctx2d.clearRect(0, 0, w, h);
  parts = parts.filter((p) => p.life > 0 && p.y < h + 40);
  for (const p of parts) {
    p.vx *= 0.985; p.vy = p.vy * 0.985 + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1;
    // Estilo pixel: posiciones en grilla de 4 px y sin rotación suave (se "voltea" por pasos).
    const px = Math.round(p.x / 4) * 4, py = Math.round(p.y / 4) * 4, flip = Math.floor(p.rot * 2) % 2 === 0;
    ctx2d.globalAlpha = Math.min(1, p.life / 30);
    ctx2d.fillStyle = p.c;
    if (p.kind === 'fil') { for (let k = 0; k < 4; k++) ctx2d.fillRect(px + k * 4, py + (flip ? k % 2 : (k + 1) % 2) * 4, 4, 4); } // tira de filamento
    else if (p.kind === 'coin') { ctx2d.fillStyle = '#E2B13C'; ctx2d.fillRect(px - 4, py - 4, flip ? 8 : 4, 8); ctx2d.fillStyle = '#fff4c2'; ctx2d.fillRect(px - 4, py - 4, 4, 4); }
    else if (p.kind === 'card') { ctx2d.fillStyle = '#181833'; ctx2d.fillRect(px - 5, py - 7, 10, 14); ctx2d.fillStyle = '#F5E9DB'; ctx2d.fillRect(px - 4, py - 6, 8, 12); ctx2d.fillStyle = p.c; ctx2d.fillRect(px - 2, py - 2, 4, 4); }
    else ctx2d.fillRect(px, py, flip ? 8 : 4, flip ? 4 : 8);
    ctx2d.globalAlpha = 1;
  }
  if (parts.length) raf = requestAnimationFrame(loop);
  else { ctx2d.clearRect(0, 0, w, h); raf = 0; }
}
export function confetti({ x = innerWidth / 2, y = innerHeight / 3, n = 120, spread = 1, coins = 0, up = 1 } = {}) {
  ensureCanvas();
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * spread;
    const v = (6 + Math.random() * 9) * up;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.25, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      s: 5 + Math.random() * 6, c: PALETTE[i % PALETTE.length], kind: Math.random() < 0.3 ? 'fil' : Math.random() < 0.12 ? 'card' : 'sq', life: 140 + Math.random() * 60 });
  }
  for (let i = 0; i < coins; i++) {
    parts.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, g: 0.18,
      rot: 0, vr: (Math.random() - 0.5) * 0.3, s: 8, c: '#E2B13C', kind: 'coin', life: 220 });
  }
  if (!raf) raf = requestAnimationFrame(loop);
}
export const burstAt = (el, opts = {}) => {
  if (!el) return;
  const b = el.getBoundingClientRect();
  confetti({ x: b.left + b.width / 2, y: b.top + b.height / 2, n: 30, spread: 2, up: 0.6, ...opts });
};

// ---------- Números flotantes ----------
export function popText(el, text, kind = 'chips', big = false) {
  if (!el) return;
  const b = el.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = `bc-pop k-${kind}${big ? ' big' : ''}`;
  d.textContent = text;
  d.style.left = `${b.left + b.width / 2 + (Math.random() - 0.5) * 16}px`;
  d.style.top = `${b.top + (big ? b.height / 2 : 4)}px`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), big ? 1600 : 1000);
}

// Efectos de pantalla por clase en .bc-root (se reinician en cada llamada).
const rootEl = () => document.querySelector('.bc-root');
function retrigger(cls, ms, vars = {}) {
  const r = rootEl(); if (!r) return;
  for (const [k, v] of Object.entries(vars)) r.style.setProperty(k, v);
  r.classList.remove(cls); void r.offsetWidth; r.classList.add(cls);
  clearTimeout(r['_t' + cls]); r['_t' + cls] = setTimeout(() => r.classList.remove(cls), ms);
}
// Latido: viñeta + micro zoom de la mesa; crece con la intensidad (0..1).
export const fxPulse = (k = 0.3) => retrigger('fx-pulse', 260, { '--pi': Math.max(0, Math.min(1, k)).toFixed(2) });
// Aberración cromática (rojo/cian separados) para golpes ×Mult.
export const fxChroma = () => retrigger('fx-chroma', 380);
// Zoom con desenfoque de toda la escena (total grande, ronda ganada).
export const fxZoomBlur = () => retrigger('fx-zoomblur', 560);

// Destello de toda la pantalla (golpes grandes, jefes, legendarios).
export function flashScreen(color = '#fff', ms = 380) {
  const d = document.createElement('div');
  d.className = 'bc-flashfx';
  d.style.setProperty('--fc', color);
  d.style.animationDuration = ms + 'ms';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms + 50);
}

export function shake(el, strong = false) {
  if (!el) return;
  el.classList.remove('bc-shake', 'bc-shake-big');
  void el.offsetWidth;
  el.classList.add(strong ? 'bc-shake-big' : 'bc-shake');
}

// ---------- Música (generada en vivo, sin archivos) ----------
// Varias pistas para elegir. Intensidad 0 (menú) / 1 (ronda) / 2 (jefe o calor alto) suma capas.
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
export const TRACKS = {
  synthwave: { name: 'Synthwave de taller', bpm: 96, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], pad: 'sawtooth', arp: 'triangle', bass: 'square', cutoff: [900, 1500, 2600] },
  lofi: { name: 'Lo-fi del laminador', bpm: 74, swing: 0.18, chords: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [57, 60, 64, 67]], pad: 'triangle', arp: 'sine', bass: 'sine', cutoff: [700, 1100, 1600], vinyl: true },
  chip: { name: 'Chiptune de la granja', bpm: 138, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], pad: 'square', arp: 'square', bass: 'triangle', cutoff: [2200, 3200, 5000], arpFast: true },
  ambiente: { name: 'Ambiente nocturno', bpm: 60, chords: [[52, 55, 59, 62], [48, 52, 55, 59], [45, 48, 52, 55], [47, 50, 54, 57]], pad: 'sine', arp: 'sine', bass: 'sine', cutoff: [600, 900, 1300], noDrums: true },
  stepper: { name: 'Motores paso a paso', bpm: 112, chords: [[45, 52, 57], [43, 50, 55], [41, 48, 53], [40, 47, 52]], pad: 'sawtooth', arp: 'square', bass: 'sawtooth', cutoff: [800, 1400, 2400], stepper: true },
};
let ac = null, master = null, filt = null, timer = 0, stepN = 0, nextT = 0, level = 1, vol = 0.35, on = false, track = TRACKS.synthwave;

function audio() {
  if (!ac) {
    ac = audioCtx(); // el mismo contexto que los efectos (necesario en iPad/Safari)
    if (!ac) return null;
    master = ac.createGain(); master.gain.value = 0;
    filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 1400; filt.Q.value = 4;
    filt.connect(master).connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function note(f, t, dur, type, g, dest = filt, detune = 0) {
  const o = ac.createOscillator(), e = ac.createGain();
  o.type = type; o.frequency.value = f; o.detune.value = detune;
  e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + Math.min(0.02, dur / 4));
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(e).connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function hat(t, g, f = 7000, len = 0.04) {
  const b = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ac.createBufferSource(), hp = ac.createBiquadFilter(), e = ac.createGain();
  hp.type = 'highpass'; hp.frequency.value = f; e.gain.value = g;
  s.buffer = b; s.connect(hp).connect(e).connect(master); s.start(t);
}
function schedule() {
  const T = track, spb = 60 / T.bpm / 4; // semicorchea
  while (nextT < ac.currentTime + 0.2) {
    const bar = Math.floor(stepN / 16) % 4, s = stepN % 16, ch = T.chords[bar];
    const t = nextT + (T.swing && s % 2 ? spb * T.swing : 0);
    // Colchón de acordes
    if (s === 0) ch.forEach((m, i) => { note(mtof(m), t, spb * 16, T.pad, T.pad === 'sine' ? 0.05 : 0.03, filt, i * 6 - 6); if (T.pad !== 'sine') note(mtof(m), t, spb * 16, T.pad, 0.02, filt, 9); });
    // Bajo
    if (T.stepper) { if (s % 2 === 0) note(mtof(ch[0] - 12 + (s % 8 === 6 ? 7 : 0)), t, spb * 0.9, T.bass, 0.035); }
    else if (s % 4 === 0) note(mtof(ch[0] - 24), t, spb * (T.noDrums ? 8 : 3), T.bass, T.bass === 'sine' ? 0.09 : 0.05);
    // Arpegio (desde la ronda)
    if (level >= 1) {
      if (T.arpFast) note(mtof(ch[s % ch.length] + 12 + (Math.floor(s / 4) % 2) * 12), t, spb * 0.8, T.arp, 0.022);
      else if (s % 2 === 0 && !(T.noDrums && s % 4)) note(mtof(ch[(s / 2) % ch.length] + 12 + (s >= 8 ? 12 : 0)), t, spb * (T.noDrums ? 6 : 1.5), T.arp, T.noDrums ? 0.025 : 0.03);
    }
    // Batería
    if (!T.noDrums) {
      const drums = level >= 2 || (level >= 1 && T !== TRACKS.synthwave);
      if (drums && s % 2 === 1) hat(t, T.vinyl ? 0.018 : 0.03, T.vinyl ? 5000 : 7000);
      if (drums && (s === 0 || s === 8 || (T.arpFast && s % 4 === 0))) note(55, t, 0.14, 'sine', 0.13, master);
      if (drums && (s === 4 || s === 12)) hat(t, 0.06, 1800, 0.09); // caja suave
    }
    if (T.vinyl && s === 0 && Math.random() < 0.6) hat(t + spb * 3, 0.01, 2500, 0.02); // chasquido de vinilo
    nextT += spb; stepN++;
  }
}
export const music = {
  start() {
    if (on || vol <= 0) return;
    if (!audio()) return;
    on = true; nextT = ac.currentTime + 0.05;
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setTargetAtTime(vol, ac.currentTime, 0.8);
    timer = setInterval(schedule, 60);
  },
  stop() {
    if (!on) return;
    on = false; clearInterval(timer);
    master.gain.setTargetAtTime(0, ac.currentTime, 0.2);
  },
  setLevel(n) {
    level = n;
    if (filt) filt.frequency.setTargetAtTime(track.cutoff[n] || 1500, ac.currentTime, 0.5);
  },
  setTrack(id) {
    track = TRACKS[id] || TRACKS.synthwave; stepN = 0;
    if (filt && ac) filt.frequency.setTargetAtTime(track.cutoff[level] || 1500, ac.currentTime, 0.3);
  },
  setVolume(v) {
    vol = v;
    if (master && on) master.gain.setTargetAtTime(v, ac.currentTime, 0.1);
    if (v <= 0) music.stop();
  },
  get playing() { return on; },
};
