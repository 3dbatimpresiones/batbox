// Sonidos de BATCARD sintetizados (WebAudio), sin archivos.
// Todo pasa por un bus con compresor (más "pegada") y un envío a reverb (espacio), con paneo estéreo.
let ctx = null, bus = null, rev = null;
let volume = 0.6;
let muted = false;
export function setAudio(v, m) { volume = v; muted = m; }

function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    const comp = ctx.createDynamicsCompressor();
    // Limitador final (no aplasta el golpe) + saturación suave tipo consola = más pegada y volumen
    comp.threshold.value = -4; comp.knee.value = 2; comp.ratio.value = 14; comp.attack.value = 0.012; comp.release.value = 0.12;
    const sat = ctx.createWaveShaper();
    const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
    sat.curve = curve; sat.oversample = '2x';
    const post = ctx.createGain(); post.gain.value = 0.95;
    bus = ctx.createGain(); bus.gain.value = 2.3;
    bus.connect(sat).connect(post).connect(comp).connect(ctx.destination);
    // Reverb: respuesta de impulso generada (ruido estéreo con caída exponencial de ~1,6 s)
    const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    rev = ctx.createGain(); rev.gain.value = 0.2;
    rev.connect(conv).connect(comp);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const on = () => !muted && volume > 0 && ac();
// Contexto de audio compartido con la música (iPad/Safari solo habilita UN contexto creado dentro de un toque).
export function audioCtx() { return ac(); }
// Desbloqueo para iOS: un sonido mudo de 1 muestra dentro del gesto del usuario.
export function unlockAudio() {
  const a = ac(); if (!a) return;
  try { const b = a.createBuffer(1, 1, 22050), s = a.createBufferSource(); s.buffer = b; s.connect(a.destination); s.start(0); } catch { /* nada */ }
}

// Salida común: ganancia → paneo → bus (+ envío a reverb)
function out(a, node, { pan = 0, wet = 0.25 }) {
  const p = a.createStereoPanner ? a.createStereoPanner() : null;
  if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); p.connect(bus); if (wet) { const w = a.createGain(); w.gain.value = wet; p.connect(w).connect(rev); } }
  else { node.connect(bus); }
}

function tone({ f = 440, f2, dur = 0.08, type = 'square', gain = 0.15, at = 0, attack = 0.004, pan = 0, wet = 0.25, vib = 0 }) {
  if (!on()) return;
  const a = ctx, t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  if (vib) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = 7; lg.gain.value = f * vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * volume, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); out(a, g, { pan, wet }); o.start(t); o.stop(t + dur + 0.05);
}

function sweep({ dur = 0.2, gain = 0.2, at = 0, f1 = 600, f2 = 3000, q = 0.8, type = 'bandpass', pan = 0, wet = 0.2 }) {
  if (!on()) return;
  const a = ctx, t = a.currentTime + at;
  const b = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b; fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f1, t); fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * volume, t + Math.min(0.01, dur * 0.25)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g); out(a, g, { pan, wet }); s.start(t);
}
const noise = ({ dur = 0.05, gain = 0.2, at = 0, hp = 2000, pan = 0 }) => sweep({ dur, gain, at, f1: hp, f2: hp * 1.2, type: 'highpass', q: 0.5, pan });
const semi = (n) => 2 ** (n / 12);
// Escala pentatónica mayor: suena "bien" aunque suba muchos pasos
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];

export const sfx = {
  // Elegir carta: "plic" con brillo, más agudo cuantas más cartas elegiste
  select: (n = 1) => { const k = PENTA[Math.min(6, n - 1)]; tone({ f: 660 * semi(k), f2: 700 * semi(k), dur: 0.09, type: 'triangle', gain: 0.14, wet: 0.15 }); tone({ f: 1320 * semi(k), dur: 0.05, type: 'sine', gain: 0.05 }); sweep({ dur: 0.04, gain: 0.08, f1: 5000, f2: 7000, q: 3 }); },
  deselect: () => { tone({ f: 520, f2: 380, dur: 0.08, type: 'triangle', gain: 0.1, wet: 0.1 }); },
  // Imprimir: motor paso a paso que acelera + golpe del cabezal
  print: () => { for (let i = 0; i < 8; i++) tone({ f: 140 + i * 35, dur: 0.045, type: 'sawtooth', gain: 0.05, at: i * 0.04, wet: 0.05 }); tone({ f: 120, f2: 60, dur: 0.18, type: 'sine', gain: 0.35, at: 0.32, wet: 0.1 }); sweep({ dur: 0.12, gain: 0.15, at: 0.32, f1: 2500, f2: 800, q: 1 }); },
  // Golpe de puntaje: ficha (clinc) + chispa + cuerpo afinado que sube por la pentatónica; cada carta un poco más a la derecha
  tick: (i = 0) => {
    const k = PENTA[Math.min(PENTA.length - 1, i)], pan = Math.max(-0.6, Math.min(0.6, -0.6 + i * 0.2));
    sweep({ dur: 0.06, gain: 0.35, f1: 3600, f2: 5200, q: 8, pan, wet: 0.3 });           // clinc de ficha
    tone({ f: 523 * semi(k), dur: 0.22, type: 'triangle', gain: 0.18, pan, wet: 0.35 });  // cuerpo afinado
    tone({ f: 1046 * semi(k), dur: 0.12, type: 'square', gain: 0.035, pan, wet: 0.3 });   // brillo
    tone({ f: 2093 * semi(k), dur: 0.08, type: 'sine', gain: 0.05, at: 0.03, pan, wet: 0.4 }); // chispa
    tone({ f: 130, f2: 80, dur: 0.08, type: 'sine', gain: 0.18, wet: 0 });                   // golpe grave corto
  },
  // Multiplicador: subida tipo "power-up" + campana con vibrato (muy distinta del golpe)
  mult: () => {
    tone({ f: 300, f2: 1400, dur: 0.18, type: 'sawtooth', gain: 0.07, wet: 0.2 });
    [0, 4, 7, 12].forEach((s, j) => tone({ f: 1046 * semi(s), dur: 0.45, type: 'sine', gain: 0.07, at: 0.12 + j * 0.035, wet: 0.5, vib: 0.012, pan: (j - 1.5) * 0.3 }));
  },
  // Total de la mano: impacto grave + acorde mayor brillante + aire
  big: () => {
    tone({ f: 110, f2: 40, dur: 0.6, type: 'sine', gain: 0.6, wet: 0.1 });
    [24, 28, 31, 36].forEach((s, j) => tone({ f: 392 * semi(s), dur: 0.5, type: 'sine', gain: 0.04, at: 0.05 + j * 0.05, wet: 0.6, pan: (j - 1.5) * 0.4 })); // brillo afinado (sin ruido)
    [0, 4, 7, 12, 16].forEach((s, j) => tone({ f: 392 * semi(s), dur: 1.1, type: j % 2 ? 'square' : 'sawtooth', gain: 0.045, attack: 0.01, wet: 0.6, pan: (j - 2) * 0.3, vib: 0.006 }));
  },
  // Cobrar: cascada de monedas que suben
  cash: (n = 5) => { for (let i = 0; i < n; i++) { const k = PENTA[Math.min(PENTA.length - 1, i)], pan = (i % 2 ? 0.4 : -0.4); tone({ f: 1318 * semi(k), dur: 0.09, type: 'square', gain: 0.05, at: i * 0.075, pan, wet: 0.3 }); tone({ f: 1760 * semi(k), dur: 0.16, type: 'sine', gain: 0.07, at: i * 0.075 + 0.04, pan, wet: 0.4 }); } },
  deal: (i = 0) => { sweep({ dur: 0.05, gain: 0.22, f1: 2600, f2: 5200, q: 1.6, pan: -0.5 + (i % 8) * 0.14 }); tone({ f: 190, f2: 120, dur: 0.06, type: 'sine', gain: 0.12 }); },
  rip: () => { sweep({ dur: 0.35, gain: 0.35, f1: 1200, f2: 5200, q: 0.8 }); sweep({ dur: 0.2, gain: 0.25, at: 0.12, f1: 3000, f2: 900, q: 1.5, pan: 0.3 }); tone({ f: 220, f2: 880, dur: 0.3, type: 'triangle', gain: 0.08, wet: 0.4 }); },
  flip: (i = 0) => { sweep({ dur: 0.06, gain: 0.2, f1: 2000, f2: 4500, q: 2, pan: -0.4 + i * 0.25 }); tone({ f: 880 * semi(PENTA[Math.min(6, i)]), dur: 0.12, type: 'sine', gain: 0.08, wet: 0.4 }); },
  shimmer: () => { for (let i = 0; i < 6; i++) tone({ f: 1760 * semi(PENTA[i % PENTA.length]), dur: 0.25, type: 'sine', gain: 0.05, at: i * 0.05, pan: i % 2 ? 0.5 : -0.5, wet: 0.6 }); },
  coin: () => { tone({ f: 1318, dur: 0.08, type: 'square', gain: 0.06, wet: 0.3 }); tone({ f: 1760, dur: 0.22, type: 'sine', gain: 0.09, at: 0.06, wet: 0.45 }); },
  snap: () => { sweep({ dur: 0.05, gain: 0.4, f1: 3000, f2: 6000, q: 2 }); tone({ f: 1400, f2: 700, dur: 0.06, type: 'square', gain: 0.06 }); },
  // Aprobar la ronda: fanfarria ascendente + acorde final + platillo
  blocked: () => { tone({ f: 140, dur: 0.09, type: 'square', gain: 0.12 }); tone({ f: 104, dur: 0.14, type: 'square', gain: 0.12, at: 0.1 }); sweep({ dur: 0.08, gain: 0.15, f1: 400, f2: 200, type: 'lowpass', q: 3 }); },
  boss: () => { tone({ f: 55, f2: 40, dur: 0.9, type: 'sawtooth', gain: 0.18, wet: 0.5 }); tone({ f: 110, f2: 82, dur: 0.7, type: 'square', gain: 0.06, at: 0.05, wet: 0.6 }); sweep({ dur: 0.5, gain: 0.25, f1: 200, f2: 60, type: 'lowpass', q: 4 }); },
  xmult: () => { [0, 4, 7, 12].forEach((k, i) => tone({ f: 523 * semi(k), dur: 0.14, type: 'square', gain: 0.07, at: i * 0.045, wet: 0.35 })); sweep({ dur: 0.25, gain: 0.3, f1: 800, f2: 6000, q: 1.5, at: 0.05 }); tone({ f: 80, f2: 40, dur: 0.25, type: 'sine', gain: 0.35 }); },
  legend: () => { for (let i = 0; i < 10; i++) tone({ f: 1046 * semi(PENTA[i % PENTA.length]) * (i > 4 ? 2 : 1), dur: 0.3, type: 'triangle', gain: 0.05, at: i * 0.06, pan: i % 2 ? 0.6 : -0.6, wet: 0.7 }); tone({ f: 130, dur: 0.8, type: 'sine', gain: 0.2, wet: 0.5 }); },
  win: () => {
    [0, 4, 7, 12, 16, 19].forEach((s, j) => tone({ f: 523 * semi(s), dur: 0.22, type: 'square', gain: 0.07, at: j * 0.08, pan: (j - 2.5) * 0.25, wet: 0.35 }));
    [0, 4, 7, 12].forEach((s) => tone({ f: 523 * semi(s), dur: 1.2, type: 'sawtooth', gain: 0.045, at: 0.5, attack: 0.02, wet: 0.6, vib: 0.008 }));
    tone({ f: 65, f2: 45, dur: 0.7, type: 'sine', gain: 0.5, at: 0.5, wet: 0.1 });
    [24, 28, 31, 36, 40].forEach((s, j) => tone({ f: 523 * semi(s), dur: 0.7, type: 'sine', gain: 0.035, at: 0.5 + j * 0.06, wet: 0.7, pan: (j - 2) * 0.35, vib: 0.004 })); // lluvia de campanitas (sin "tssss")
  },
  // Descartar: las cartas se deslizan fuera de la mesa + golpecito de papel
  discard: (n = 2) => { for (let i = 0; i < Math.min(5, n); i++) sweep({ dur: 0.16, gain: 0.25, at: i * 0.06, f1: 900, f2: 3200, q: 1.2, pan: -0.5 + i * 0.25 }); sweep({ dur: 0.08, gain: 0.3, at: Math.min(5, n) * 0.06 + 0.05, f1: 300, f2: 160, type: 'lowpass', q: 0.7 }); },
  // Vidrio roto: golpe grave + crujido + lluvia de astillas agudas repartidas en estéreo
  shatter: () => {
    tone({ f: 90, f2: 30, dur: 0.8, type: 'sine', gain: 0.7, wet: 0.2 });
    sweep({ dur: 0.35, gain: 0.6, f1: 6000, f2: 1500, type: 'highpass', q: 0.5, wet: 0.4 });
    sweep({ dur: 0.9, gain: 0.3, at: 0.05, f1: 9000, f2: 4000, type: 'bandpass', q: 1.5, wet: 0.5 });
    for (let i = 0; i < 32; i++) {
      const at = 0.04 + Math.pow(Math.random(), 1.6) * 1.3, f = 2800 + Math.random() * 6500, pan = Math.random() * 2 - 1;
      tone({ f, f2: f * (0.92 + Math.random() * 0.06), dur: 0.05 + Math.random() * 0.14, type: Math.random() < 0.5 ? 'sine' : 'triangle', gain: 0.04 + Math.random() * 0.06, at, pan, wet: 0.5 });
      if (Math.random() < 0.4) sweep({ dur: 0.04, gain: 0.14, at, f1: 7000, f2: 9000, type: 'highpass', pan });
    }
  },
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone({ f, f2: f * 0.97, dur: 0.3, type: 'sawtooth', gain: 0.06, at: i * 0.18, wet: 0.5, vib: 0.01 })),
};

// ===== Capa agresiva (pedido: puntos, sumas, ganar y perder con más golpe) =====
const kick = (g = 0.4, at = 0) => { tone({ f: 160, f2: 42, dur: 0.14, type: 'sine', gain: g, at, wet: 0 }); sweep({ dur: 0.02, gain: g * 0.6, at, f1: 3000, f2: 1200, q: 1 }); };
const crash = (g = 0.3, at = 0) => { sweep({ dur: 0.9, gain: g, at, f1: 9000, f2: 4000, q: 0.4, type: 'highpass', wet: 0.6 }); sweep({ dur: 0.5, gain: g * 0.7, at, f1: 6000, f2: 2500, q: 0.6, wet: 0.5 }); };
{
  const base = { tick: sfx.tick, mult: sfx.mult, big: sfx.big, win: sfx.win, lose: sfx.lose, cash: sfx.cash };
  sfx.tick = (i = 0) => {
    base.tick(i);
    const n = Math.min(i, 12);
    kick(0.22 + n * 0.025);
    tone({ f: 660 * semi(n * 2), dur: 0.07, type: 'square', gain: 0.06 + n * 0.004, wet: 0.2 });       // bip que sube con cada golpe
    sweep({ dur: 0.05, gain: 0.25, f1: 2000 + n * 300, f2: 7000, q: 2 });                               // chasquido
  };
  sfx.mult = () => {
    base.mult(); kick(0.4);
    tone({ f: 200, f2: 1800, dur: 0.22, type: 'sawtooth', gain: 0.1, wet: 0.25 });
    tone({ f: 203, f2: 1830, dur: 0.22, type: 'square', gain: 0.06, wet: 0.25 });                        // desafinado = grosor
    sweep({ dur: 0.25, gain: 0.3, f1: 600, f2: 8000, q: 1.2 });
  };
  sfx.big = () => {
    base.big(); kick(0.7); kick(0.45, 0.12);
    tone({ f: 70, f2: 28, dur: 1.0, type: 'sine', gain: 0.55, wet: 0.2 });                               // sub que cae
    [0, 7, 12, 19].forEach((s, j) => tone({ f: 261 * semi(s), dur: 0.35, type: 'square', gain: 0.07, at: j * 0.03, wet: 0.4, pan: (j - 1.5) * 0.4 }));
    crash(0.35, 0.02);
  };
  sfx.win = () => {
    base.win();
    [0, 4, 7, 12, 16, 19, 24].forEach((s, j) => { tone({ f: 523 * semi(s), dur: 0.16, type: 'square', gain: 0.08, at: j * 0.07, wet: 0.35, pan: (j % 2 ? 0.4 : -0.4) }); });
    [0, 0.14, 0.28, 0.49].forEach((t) => kick(0.45, t));
    [0, 4, 7, 12].forEach((s, j) => tone({ f: 523 * semi(s + 12), dur: 0.9, type: 'sawtooth', gain: 0.05, at: 0.5, wet: 0.6, vib: 0.008, pan: (j - 1.5) * 0.3 }));
    crash(0.4, 0.5);
  };
  sfx.lose = () => {
    base.lose();
    kick(0.8); tone({ f: 55, f2: 25, dur: 1.4, type: 'sawtooth', gain: 0.18, wet: 0.5 });
    [0, -1, -3, -5].forEach((s, j) => { tone({ f: 220 * semi(s), f2: 220 * semi(s - 12), dur: 0.5, type: 'sawtooth', gain: 0.08, at: 0.2 + j * 0.22, wet: 0.5 }); tone({ f: 224 * semi(s), f2: 224 * semi(s - 12), dur: 0.5, type: 'square', gain: 0.05, at: 0.2 + j * 0.22, wet: 0.5 }); });
    sweep({ dur: 1.2, gain: 0.35, f1: 4000, f2: 120, q: 1, type: 'lowpass', wet: 0.6 });
  };
  sfx.cash = (n = 5) => { base.cash(n); kick(0.3); };
}

// ===== Sonidos de puntaje v3: nuevos de raíz (no capas sobre los viejos) =====
const aggrTick = sfx.tick; // golpe agresivo anterior (bombo + chasquido + bip) que se mantiene
sfx.tick = (i = 0) => {
  aggrTick(i);
  const n = Math.min(i, 14), f = 392 * semi(n * 2);               // sube un tono entero por golpe
  const pan = Math.max(-0.7, Math.min(0.7, -0.7 + n * 0.12));
  kick(0.35 + n * 0.02);
  sweep({ dur: 0.035, gain: 0.45, f1: 4500, f2: 9000, q: 3, pan });  // clack de ficha
  tone({ f, dur: 0.07, type: 'square', gain: 0.17, pan, wet: 0.15 });
  tone({ f: f * 2, dur: 0.18, type: 'triangle', gain: 0.16, at: 0.012, pan, wet: 0.35 });
  tone({ f: f * 3, dur: 0.32, type: 'sine', gain: 0.07, at: 0.02, pan, wet: 0.55 });            // campanita
  tone({ f: f * 4.01, dur: 0.22, type: 'sine', gain: 0.035, at: 0.025, pan, wet: 0.6 });
};
// Contador del total: bips de tragamonedas que suben (k = 0..1)
sfx.roll = (k = 0) => { const f = 700 + k * 1400; tone({ f, dur: 0.028, type: 'square', gain: 0.07, wet: 0.1 }); tone({ f: f * 2, dur: 0.02, type: 'sine', gain: 0.04 }); };
sfx.ding = () => {
  kick(0.6);
  [1568, 2093, 3136, 4186].forEach((f, j) => tone({ f, dur: 1.1 - j * 0.15, type: 'sine', gain: 0.12 - j * 0.02, at: j * 0.01, wet: 0.7, pan: (j - 1.5) * 0.3 }));
  tone({ f: 784, dur: 0.5, type: 'triangle', gain: 0.1, wet: 0.5 });
  crash(0.25);
};

// ===== Anuncio de Patrón: un sonido propio para cada jugada =====
sfx.pattern = (id) => {
  const arp = (notes, step, type, g, base = 523, len = 0.18) => notes.forEach((s, j) => tone({ f: base * semi(s), dur: len, type, gain: g, at: j * step, wet: 0.35, pan: (j % 2 ? 0.4 : -0.4) }));
  switch (id) {
    case 'alta': tone({ f: 330, f2: 300, dur: 0.15, type: 'triangle', gain: 0.14, wet: 0.3 }); kick(0.25); break;
    case 'par': kick(0.4); arp([0, 0], 0.09, 'square', 0.12, 659); break;
    case 'doble': kick(0.45); kick(0.35, 0.18); arp([0, 0, 5, 5], 0.09, 'square', 0.11, 587); break;
    case 'trio': [0, 0.11, 0.22].forEach((t) => kick(0.5, t)); arp([0, 4, 7], 0.11, 'sawtooth', 0.11, 392, 0.3); break;
    case 'escalera': kick(0.4); arp([0, 2, 4, 5, 7, 9, 11, 12], 0.045, 'square', 0.1, 523, 0.12); sweep({ dur: 0.45, gain: 0.3, f1: 400, f2: 9000, q: 1.2 }); break;
    case 'color': kick(0.5); sweep({ dur: 0.6, gain: 0.4, f1: 200, f2: 6000, q: 0.8 }); [0, 4, 7, 11].forEach((s, j) => tone({ f: 392 * semi(s), dur: 0.7, type: 'sawtooth', gain: 0.06, at: 0.08, wet: 0.6, pan: (j - 1.5) * 0.4, vib: 0.006 })); break;
    case 'full': [0, 0.12, 0.24].forEach((t) => kick(0.55, t)); [0, 4, 7, 12].forEach((s, j) => tone({ f: 262 * semi(s), dur: 0.6, type: 'square', gain: 0.08, at: 0.06 * j, wet: 0.5 })); crash(0.35, 0.3); break;
    case 'poker': [0, 0.13, 0.26, 0.39].forEach((t, j) => { kick(0.7, t); tone({ f: 110 * semi(j * 3), dur: 0.12, type: 'sawtooth', gain: 0.15, at: t, wet: 0.2 }); }); crash(0.4, 0.45); break;
    case 'ecolor': [0, 0.1, 0.2, 0.3, 0.4].forEach((t) => kick(0.6, t)); arp([0, 4, 7, 12, 16, 19, 24, 28], 0.05, 'square', 0.1, 523, 0.25); sweep({ dur: 0.9, gain: 0.4, f1: 300, f2: 12000, q: 1 }); crash(0.5, 0.45); break;
    default: kick(0.3);
  }
};
