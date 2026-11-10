// Sonidos sintetizados (WebAudio): motores paso a paso, clicks de taller y cierre de alicate. Sin archivos.
let ctx = null;
let volume = 0.6;
let muted = false;
export function setAudio(v, m) { volume = v; muted = m; }

function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ f = 440, f2, dur = 0.08, type = 'square', gain = 0.15, at = 0 }) {
  if (muted || volume <= 0) return;
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(gain * volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}

function noise({ dur = 0.05, gain = 0.2, at = 0, hp = 2000 }) {
  if (muted || volume <= 0) return;
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const b = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = gain * volume;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}

// Ruido filtrado con barrido de frecuencia (cartas que se deslizan / vidrio que cae).
function sweep({ dur = 0.2, gain = 0.2, at = 0, f1 = 600, f2 = 3000, q = 0.8, type = 'bandpass' }) {
  if (muted || volume <= 0) return;
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const b = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f1, t); f.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * volume, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}

export const sfx = {
  // Descartar: las cartas se deslizan fuera de la mesa (fsss-fsss) + golpecito de papel.
  discard: (n = 2) => { for (let i = 0; i < Math.min(5, n); i++) sweep({ dur: 0.16, gain: 0.22, at: i * 0.06, f1: 900, f2: 3200, q: 1.2 }); sweep({ dur: 0.08, gain: 0.25, at: Math.min(5, n) * 0.06 + 0.05, f1: 300, f2: 160, type: 'lowpass', q: 0.7 }); },
  select: (n = 1) => tone({ f: [523, 659, 784, 880, 1047][Math.min(4, n - 1)], dur: 0.06, gain: 0.08 }),
  deselect: () => tone({ f: 620, dur: 0.04, gain: 0.07 }),
  print: () => { for (let i = 0; i < 6; i++) tone({ f: 180 + i * 40, dur: 0.05, type: 'sawtooth', gain: 0.06, at: i * 0.05 }); },
  // Golpe de ficha: "clinc" brillante (transitorio ~4 kHz) + cuerpo que sube un semitono por golpe.
  tick: (i = 0) => { const k = Math.min(14, i); sweep({ dur: 0.05, gain: 0.3, f1: 3800 + k * 60, f2: 4600 + k * 60, q: 6 }); tone({ f: 1046 * 2 ** (k / 12), f2: 1046 * 2 ** ((k + 0.5) / 12), dur: 0.11, type: 'sine', gain: 0.1 }); tone({ f: 2093 * 2 ** (k / 12), dur: 0.05, type: 'triangle', gain: 0.04 }); },
  tickOld: (i = 0) => { const sc = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; const k = sc[Math.min(10, i)]; tone({ f: 523 * 2 ** (k / 12), dur: 0.09, type: 'triangle', gain: 0.12 }); tone({ f: 1046 * 2 ** (k / 12), dur: 0.05, type: 'square', gain: 0.03 }); },
  big: () => { noise({ dur: 0.35, gain: 0.25, hp: 400 }); [262, 330, 392, 523, 659].forEach((f) => tone({ f, dur: 0.6, type: 'sawtooth', gain: 0.05 })); },
  cash: (n = 5) => { for (let i = 0; i < n; i++) { tone({ f: 988, dur: 0.05, gain: 0.07, at: i * 0.07 }); tone({ f: 1319, dur: 0.08, gain: 0.07, at: i * 0.07 + 0.035 }); } },
  // Multiplicador: campanita aguda sostenida con trémolo (bien distinta del golpe de ficha).
  mult: () => { for (let j = 0; j < 8; j++) tone({ f: 2400, dur: 0.05, type: 'sine', gain: 0.07 * (1 - j / 10), at: j * 0.04 }); tone({ f: 1200, f2: 1800, dur: 0.25, type: 'triangle', gain: 0.06 }); },
  snap: () => { noise({ dur: 0.04, gain: 0.35, hp: 3000 }); tone({ f: 1400, f2: 700, dur: 0.05, type: 'square', gain: 0.06 }); },
  coin: () => { tone({ f: 988, dur: 0.06, gain: 0.08 }); tone({ f: 1319, dur: 0.12, gain: 0.08, at: 0.06 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.14, gain: 0.09, at: i * 0.1 })),
  // Vidrio roto: golpe grave + crujido + lluvia de astillas agudas al azar que caen durante ~1,2 s.
  shatter: () => {
    tone({ f: 90, f2: 35, dur: 0.6, type: 'sine', gain: 0.4 });
    sweep({ dur: 0.35, gain: 0.55, f1: 6000, f2: 1500, type: 'highpass', q: 0.5 });
    sweep({ dur: 0.9, gain: 0.25, at: 0.05, f1: 9000, f2: 4000, type: 'bandpass', q: 1.5 });
    for (let i = 0; i < 28; i++) {
      const at = 0.04 + Math.pow(Math.random(), 1.6) * 1.2, f = 2800 + Math.random() * 6500;
      tone({ f, f2: f * (0.92 + Math.random() * 0.06), dur: 0.05 + Math.random() * 0.12, type: Math.random() < 0.5 ? 'sine' : 'triangle', gain: 0.03 + Math.random() * 0.05, at });
      if (Math.random() < 0.4) sweep({ dur: 0.04, gain: 0.12, at, f1: 7000, f2: 9000, type: 'highpass' });
    }
  },
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone({ f, dur: 0.18, type: 'sawtooth', gain: 0.07, at: i * 0.14 })),
};
