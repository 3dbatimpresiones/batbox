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

export function shake(el, strong = false) {
  if (!el) return;
  el.classList.remove('bc-shake', 'bc-shake-big');
  void el.offsetWidth;
  el.classList.add(strong ? 'bc-shake-big' : 'bc-shake');
}

// ---------- Música ambiente (synthwave de taller, generada en vivo) ----------
// Am – F – C – G a 96 BPM. Intensidad 0 (menú) / 1 (ronda) / 2 (jefe o calor alto).
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
let ac = null, master = null, filt = null, timer = 0, stepN = 0, nextT = 0, level = 1, vol = 0.35, on = false;

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
function hat(t, g) {
  const b = ac.createBuffer(1, ac.sampleRate * 0.04, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ac.createBufferSource(), hp = ac.createBiquadFilter(), e = ac.createGain();
  hp.type = 'highpass'; hp.frequency.value = 7000; e.gain.value = g;
  s.buffer = b; s.connect(hp).connect(e).connect(master); s.start(t);
}
function schedule() {
  const spb = 60 / 96 / 4; // semicorchea
  while (nextT < ac.currentTime + 0.2) {
    const bar = Math.floor(stepN / 16) % 4, s = stepN % 16, ch = CHORDS[bar];
    if (s === 0) ch.forEach((m, i) => { note(mtof(m), nextT, spb * 16, 'sawtooth', 0.035, filt, i * 7 - 7); note(mtof(m), nextT, spb * 16, 'sawtooth', 0.025, filt, 9); });
    if (s % 4 === 0) note(mtof(ch[0] - 24), nextT, spb * 3, 'square', 0.05);
    if (level >= 1 && s % 2 === 0) note(mtof(ch[(s / 2) % 3] + 12 + (s >= 8 ? 12 : 0)), nextT, spb * 1.5, 'triangle', 0.03);
    if (level >= 2 && s % 2 === 1) hat(nextT, 0.03);
    if (level >= 2 && s % 4 === 0) note(55, nextT, 0.12, 'sine', 0.12, master); // bombo suave
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
    if (filt) filt.frequency.setTargetAtTime([900, 1500, 2600][n] || 1500, ac.currentTime, 0.5);
  },
  setVolume(v) {
    vol = v;
    if (master && on) master.gain.setTargetAtTime(v, ac.currentTime, 0.1);
    if (v <= 0) music.stop();
  },
  get playing() { return on; },
};
