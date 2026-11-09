// RNG con semilla para BATCARD. Algoritmo versionado: si cambia, cambia RNG_VERSION.
// sfc32 (32 bits) sembrado con cyrb128. El estado son 4 enteros sin signo: se guarda tal cual.
export const RNG_VERSION = 'sfc32-cyrb128-v1';

export function seedState(text) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const s = [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  for (let i = 0; i < 12; i++) nextU32(s); // calentar
  return s;
}

// Avanza el estado (lo muta) y devuelve un entero de 32 bits.
export function nextU32(s) {
  let [a, b, c, d] = s;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  s[0] = a >>> 0; s[1] = b; s[2] = c; s[3] = d;
  return t;
}

export const randInt = (s, n) => nextU32(s) % n; // sesgo despreciable para n chico

export function shuffle(s, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newSeed() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const buf = new Uint32Array(8);
  (globalThis.crypto || { getRandomValues: (b) => b.map(() => Math.random() * 2 ** 32) }).getRandomValues(buf);
  for (const n of buf) out += abc[n % abc.length];
  return out;
}
