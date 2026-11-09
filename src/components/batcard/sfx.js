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

export const sfx = {
  select: (n = 1) => tone({ f: [523, 659, 784, 880, 1047][Math.min(4, n - 1)], dur: 0.06, gain: 0.08 }),
  deselect: () => tone({ f: 620, dur: 0.04, gain: 0.07 }),
  print: () => { for (let i = 0; i < 6; i++) tone({ f: 180 + i * 40, dur: 0.05, type: 'sawtooth', gain: 0.06, at: i * 0.05 }); },
  // Escala mayor que sube con cada paso: cada carta suena más alto que la anterior.
  tick: (i = 0) => { const sc = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; const k = sc[Math.min(10, i)]; tone({ f: 523 * 2 ** (k / 12), dur: 0.09, type: 'triangle', gain: 0.12 }); tone({ f: 1046 * 2 ** (k / 12), dur: 0.05, type: 'square', gain: 0.03 }); },
  big: () => { noise({ dur: 0.35, gain: 0.25, hp: 400 }); [262, 330, 392, 523, 659].forEach((f) => tone({ f, dur: 0.6, type: 'sawtooth', gain: 0.05 })); },
  cash: (n = 5) => { for (let i = 0; i < n; i++) { tone({ f: 988, dur: 0.05, gain: 0.07, at: i * 0.07 }); tone({ f: 1319, dur: 0.08, gain: 0.07, at: i * 0.07 + 0.035 }); } },
  mult: () => tone({ f: 330, f2: 990, dur: 0.12, type: 'square', gain: 0.08 }),
  snap: () => { noise({ dur: 0.04, gain: 0.35, hp: 3000 }); tone({ f: 1400, f2: 700, dur: 0.05, type: 'square', gain: 0.06 }); },
  coin: () => { tone({ f: 988, dur: 0.06, gain: 0.08 }); tone({ f: 1319, dur: 0.12, gain: 0.08, at: 0.06 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.14, gain: 0.09, at: i * 0.1 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone({ f, dur: 0.18, type: 'sawtooth', gain: 0.07, at: i * 0.14 })),
};
