import { zipSync } from 'fflate';

const safeName = (name, fallback = 'pieza') => String(name || fallback)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || fallback;

export function binarySTL(part, name = 'BATSplit 3D') {
  const count = part.tri.length / 3;
  const out = new ArrayBuffer(84 + count * 50);
  const bytes = new Uint8Array(out);
  bytes.set(new TextEncoder().encode(name).subarray(0, 80));
  const dv = new DataView(out); dv.setUint32(80, count, true);
  for (let t = 0, o = 84; t < count; t++, o += 50) {
    const ia = part.tri[t * 3] * 3, ib = part.tri[t * 3 + 1] * 3, ic = part.tri[t * 3 + 2] * 3;
    const ax = part.vert[ia], ay = part.vert[ia + 1], az = part.vert[ia + 2];
    const ux = part.vert[ib] - ax, uy = part.vert[ib + 1] - ay, uz = part.vert[ib + 2] - az;
    const vx = part.vert[ic] - ax, vy = part.vert[ic + 1] - ay, vz = part.vert[ic + 2] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    [nx, ny, nz, ax, ay, az, part.vert[ib], part.vert[ib + 1], part.vert[ib + 2], part.vert[ic], part.vert[ic + 1], part.vert[ic + 2]]
      .forEach((v, i) => dv.setFloat32(o + i * 4, v, true));
  }
  return new Uint8Array(out);
}

export function piecesZip(parts, project = 'batsplit') {
  const files = {};
  parts.forEach((p, i) => { files[`${String(i + 1).padStart(2, '0')}-${safeName(p.name)}.stl`] = binarySTL(p, p.name); });
  return zipSync(files, { level: 0 });
}

export function downloadBytes(bytes, filename, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export { safeName };
