const TAU = Math.PI * 2;

export const ROLLER_DEFAULTS = Object.freeze({
  length: 100, diameter: 28, hole: 8, depth: 1.2,
  pattern: 'wood', repeatX: 5, repeatY: 4, mode: 'relief', resolution: 320,
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
const fract = (v) => v - Math.floor(v);
const smooth = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / Math.max(1e-9, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function patternHeight(pattern, u, v, rx = 5, ry = 4) {
  const x = u * rx, y = v * ry;
  if (pattern === 'lines') return Math.pow(Math.max(0, Math.sin(TAU * (x + 0.18 * Math.sin(TAU * y)))), 10);
  if (pattern === 'waves') return Math.pow(Math.max(0, Math.sin(TAU * (x + 0.24 * Math.sin(TAU * y)))), 7);
  if (pattern === 'diamonds') {
    const dx = Math.abs(fract(x) - 0.5), dy = Math.abs(fract(y) - 0.5);
    return 1 - smooth(0.32, 0.5, dx + dy);
  }
  if (pattern === 'bricks') {
    const row = Math.floor(y), bx = fract(x + (row % 2) * 0.5), by = fract(y);
    const mortar = Math.min(Math.min(bx, 1 - bx), Math.min(by, 1 - by));
    return smooth(0.035, 0.09, mortar);
  }
  if (pattern === 'dots') {
    const dx = fract(x) - 0.5, dy = fract(y) - 0.5;
    return 1 - smooth(0.16, 0.42, Math.hypot(dx, dy));
  }
  // Veta de madera periódica: líneas orgánicas y nudos, sin costura al cerrar el cilindro.
  const bend = 0.20 * Math.sin(TAU * y) + 0.08 * Math.sin(TAU * (2 * y + u));
  // La frecuencia angular debe ser entera: así u=0 y u=1 tienen exactamente
  // la misma altura y normal, sin la cicatriz vertical al cerrar el cilindro.
  const knotFreq = Math.max(1, Math.round(rx * 0.42));
  const knotX = Math.sin(TAU * (u * knotFreq + 0.13 * Math.sin(TAU * v)));
  const knotY = Math.cos(TAU * (v * ry * 0.52));
  const rings = Math.sin(TAU * (x + bend + 0.28 * knotX * knotY));
  return Math.pow(0.5 + 0.5 * rings, 8);
}

export function sampleCustomTexture(texture, u, v, invert = false, contrast = 1.4, seamless = true) {
  if (!texture?.data?.length || !texture.width || !texture.height) return 0;
  const { data, width: w, height: h } = texture;
  const read = (x, y) => data[Math.max(0, Math.min(h - 1, y)) * w + ((x % w) + w) % w] || 0;
  const sample = (uu) => {
    const x = fract(uu) * w, y = clamp(v, 0, 1) * (h - 1), x0 = Math.floor(x), y0 = Math.floor(y);
    const tx = x - x0, ty = y - y0;
    const a = read(x0,y0)*(1-tx)+read(x0+1,y0)*tx, b = read(x0,y0+1)*(1-tx)+read(x0+1,y0+1)*tx;
    return a*(1-ty)+b*ty;
  };
  let value = sample(u);
  if (seamless) {
    const band = 0.08, d = Math.min(fract(u), 1 - fract(u));
    if (d < band) { const opposite = sample(u + 0.5), k = smooth(0, band, d); value = (value + opposite) * 0.5 * (1 - k) + value * k; }
  }
  if (invert) value = 1 - value;
  return clamp((value - 0.5) * clamp(contrast, 0.2, 4) + 0.5, 0, 1);
}

export function buildRollerMesh(input = {}) {
  const p = { ...ROLLER_DEFAULTS, ...input };
  const length = clamp(p.length, 20, 250), diameter = clamp(p.diameter, 12, 100);
  const outer = diameter / 2, hole = clamp(p.hole, 2, diameter - 3) / 2;
  const depth = clamp(p.depth, 0.2, Math.min(4, (outer - hole) * 0.65));
  const radial = Math.round(clamp(p.resolution, 96, 640));
  // Celdas casi cuadradas sobre la superficie: evita suavizar el dibujo en Z.
  const rows = Math.max(48, Math.round(radial * length / (Math.PI * diameter)));
  const verts = [], tri = [];
  const push = (x, y, z) => { verts.push(x, y, z); return verts.length / 3 - 1; };
  const idx = (ring, i) => ring * radial + (i % radial + radial) % radial;

  // Exterior texturado. Los extremos quedan lisos para apoyar e imprimir mejor.
  for (let j = 0; j <= rows; j++) {
    const v = j / rows, z = v * length;
    const edgeFade = smooth(0, 0.025, v) * (1 - smooth(0.975, 1, v));
    for (let i = 0; i < radial; i++) {
      const u = i / radial, h = p.pattern === 'custom'
        ? sampleCustomTexture(p.customTexture, u * p.repeatX, v * p.repeatY, p.invert, p.contrast, p.seamless !== false)
        : patternHeight(p.pattern, u, v, p.repeatX, p.repeatY);
      const signed = p.mode === 'engrave' ? -h : h;
      const r = outer + signed * depth * edgeFade;
      push(r * Math.cos(TAU * u), r * Math.sin(TAU * u), z);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < radial; i++) {
    const a = idx(j, i), b = idx(j, i + 1), c = idx(j + 1, i), d = idx(j + 1, i + 1);
    tri.push(a, b, c, b, d, c);
  }

  // Interior liso, con normales hacia el hueco.
  const innerStart = verts.length / 3;
  for (let j = 0; j <= rows; j++) for (let i = 0; i < radial; i++) {
    const u = i / radial; push(hole * Math.cos(TAU * u), hole * Math.sin(TAU * u), (j / rows) * length);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < radial; i++) {
    const a = innerStart + idx(j, i), b = innerStart + idx(j, i + 1), c = innerStart + idx(j + 1, i), d = innerStart + idx(j + 1, i + 1);
    tri.push(a, c, b, b, c, d);
  }

  // Aros de cierre inferior y superior.
  for (const top of [false, true]) {
    const jo = top ? rows : 0, ji = innerStart + (top ? rows * radial : 0);
    for (let i = 0; i < radial; i++) {
      const on = idx(jo, i), ox = idx(jo, i + 1), inn = ji + i, inx = ji + ((i + 1) % radial);
      if (top) tri.push(on, ox, inn, ox, inx, inn); else tri.push(on, inn, ox, ox, inn, inx);
    }
  }
  return { numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tri), params: { ...p, length, diameter, hole: hole * 2, depth, radial, rows }, triangles: tri.length / 3 };
}

export function meshToBinarySTL(mesh, name = 'Rodillo texturizador') {
  const v = mesh.vertProperties, t = mesh.triVerts;
  const out = new ArrayBuffer(84 + (t.length / 3) * 50), view = new DataView(out);
  const head = new TextEncoder().encode(name.slice(0, 80)); new Uint8Array(out, 0, head.length).set(head);
  view.setUint32(80, t.length / 3, true); let o = 84;
  for (let i = 0; i < t.length; i += 3) {
    const ai = t[i] * 3, bi = t[i + 1] * 3, ci = t[i + 2] * 3;
    const ax=v[ai], ay=v[ai+1], az=v[ai+2], bx=v[bi], by=v[bi+1], bz=v[bi+2], cx=v[ci], cy=v[ci+1], cz=v[ci+2];
    const ux=bx-ax, uy=by-ay, uz=bz-az, vx=cx-ax, vy=cy-ay, vz=cz-az;
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx; const n=Math.hypot(nx,ny,nz)||1; nx/=n; ny/=n; nz/=n;
    for (const q of [nx,ny,nz,ax,ay,az,bx,by,bz,cx,cy,cz]) { view.setFloat32(o,q,true); o+=4; }
    view.setUint16(o,0,true); o+=2;
  }
  return new Blob([out], { type: 'model/stl' });
}
