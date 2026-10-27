// =====================================================================
// Personalizador de chops · detección de la manija (sin dependencias:
// la usa el worker, que arma el STL, así la exportación nunca la saltea).
// =====================================================================

function bounds(pos) {
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 2; i < pos.length; i += 3) { minZ = Math.min(minZ, pos[i]); maxZ = Math.max(maxZ, pos[i]); }
  return { minZ, maxZ };
}

// ---------- Manija / asa (zona prohibida) ----------
// Corta el chop (ya con el eje en 0,0) en franjas de altura y, en 360 sectores de 1°,
// mira cuánto sobresale el contorno respecto del radio típico de esa altura (la mediana:
// los aros dan la vuelta entera y suben la mediana, la manija no). Los sectores que
// sobresalen forman arcos: ahí NUNCA puede ir un diseño. Devuelve los arcos con margen.
//   → [{ center (°), width (°), z0, z1 }]   (mismo ángulo que el patrón: atan2(y, x))
export const HANDLE_MARGIN_MM = 4;
export function detectHandle(pos) {
  const b = bounds(pos), H = b.maxZ - b.minZ;
  if (!(H > 2)) return [];
  const N = 360, dz = Math.max(0.5, H / 140);
  const hit = new Array(N).fill(null);       // por sector: { z0, z1 } de las alturas donde sobresale
  let rRef = 0;
  for (let z = b.minZ + dz / 2; z < b.maxZ; z += dz) {
    const bins = new Float64Array(N);
    const add = (x, y) => {
      const r = Math.hypot(x, y);
      const k = Math.floor(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360) % N;
      if (r > bins[k]) bins[k] = r;
    };
    for (let i = 0; i < pos.length; i += 9) {
      const pts = [];
      for (let e = 0; e < 3; e++) {
        const a = i + e * 3, c = i + ((e + 1) % 3) * 3;
        const za = pos[a + 2], zc = pos[c + 2];
        if ((za - z) * (zc - z) > 0 || za === zc) continue;
        const t = (z - za) / (zc - za);
        pts.push(pos[a] + (pos[c] - pos[a]) * t, pos[a + 1] + (pos[c + 1] - pos[a + 1]) * t);
      }
      if (pts.length < 4) continue;
      // Recorre el segmento entero (no solo las puntas) para no dejar sectores vacíos.
      const len = Math.hypot(pts[2] - pts[0], pts[3] - pts[1]), steps = Math.min(400, Math.ceil(len / 0.3));
      for (let s = 0; s <= steps; s++) { const u = s / Math.max(1, steps); add(pts[0] + (pts[2] - pts[0]) * u, pts[1] + (pts[3] - pts[1]) * u); }
    }
    const got = Array.from(bins).filter((r) => r > 0).sort((p, q) => p - q);
    if (got.length < N * 0.5) continue;      // corte incompleto (base o borde): no sirve de referencia
    const med = got[Math.floor(got.length / 2)];
    rRef = Math.max(rRef, med);
    const lim = med + Math.max(1.2, med * 0.04);
    for (let k = 0; k < N; k++) {
      if (bins[k] > lim) hit[k] = hit[k] ? { z0: Math.min(hit[k].z0, z), z1: Math.max(hit[k].z1, z) } : { z0: z, z1: z };
    }
  }
  if (!hit.some(Boolean)) return [];
  // Une sectores seguidos (tolera huecos de hasta 3°) en arcos, dando la vuelta por 0°.
  const on = hit.map(Boolean);
  if (on.every(Boolean)) return [];          // todo sobresale: no es una manija (textura pareja)
  let start = on.findIndex((v) => !v);
  const arcs = [];
  let cur = null, gap = 0;
  for (let n = 1; n <= N; n++) {
    const k = (start + n) % N;
    if (on[k]) {
      if (!cur) cur = { a: k, b: k, z0: hit[k].z0, z1: hit[k].z1 };
      else { cur.b = k; cur.z0 = Math.min(cur.z0, hit[k].z0); cur.z1 = Math.max(cur.z1, hit[k].z1); }
      gap = 0;
    } else if (cur && ++gap > 3) { arcs.push(cur); cur = null; gap = 0; }
  }
  if (cur) arcs.push(cur);
  const marginDeg = Math.max(4, (HANDLE_MARGIN_MM / Math.max(1, rRef)) * 180 / Math.PI);
  return arcs.map((c) => {
    const span = ((c.b - c.a + N) % N) + 1;              // sectores de 1°
    return { center: ((c.a + span / 2) % 360), width: span + marginDeg * 2,
      z0: c.z0 - dz - HANDLE_MARGIN_MM, z1: c.z1 + dz + HANDLE_MARGIN_MM };
  });
}
