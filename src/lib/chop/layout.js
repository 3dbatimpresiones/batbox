// =====================================================================
// Personalizador de chops · distribución del patrón (pura, sin 3D).
// La usan la vista previa y la exportación: mismas posiciones y medidas.
//
// Superficie de referencia: cono (o cilindro) de eje Z, que va de la altura
// z0 (radio r0) a z1 (radio r1). Todo en milímetros.
//   p = { rows, cols, width, gapV, startH, startAngle, coverage, stagger,
//         exclude, exclCenter, exclWidth }
//         spin (giro del diseño, °), radial (acercar −/alejar + de la pared, mm),
//         overrides: { 'fila-col': { da (°), dh (mm), dr (mm), spin (°), s (escala) } }  ← diseños sueltos (Shift)
//   axis = { z0, z1, r0, r1 }   ·   aspect = alto / ancho del diseño
// =====================================================================

export const LIMITS = { rows: 12, cols: 24, total: 150 };

export const rAt = (axis, h) => axis.r0 + (axis.r1 - axis.r0) * ((h - axis.z0) / Math.max(1e-6, axis.z1 - axis.z0));
// Inclinación de la pared (0 = cilindro). Positiva si se abre hacia arriba.
export const slantOf = (axis) => Math.atan2(axis.r1 - axis.r0, Math.max(1e-6, axis.z1 - axis.z0));

const wrap = (a) => ((a % 360) + 360) % 360;
const angDist = (a, b) => { const d = Math.abs(wrap(a) - wrap(b)); return Math.min(d, 360 - d); };

export function computeLayout(p, axis, aspect) {
  const W = p.width, H = p.width * aspect;
  const phi = slantOf(axis), cos = Math.cos(phi);
  const cols = Math.max(1, Math.round(p.cols)), rows = Math.max(1, Math.round(p.rows));
  const full = p.coverage >= 359.999;
  const step = p.coverage / cols;                       // separación horizontal: sale de columnas y cobertura
  const items = [], warnings = [];
  let outOfZone = 0, inHandle = 0;

  for (let i = 0; i < rows; i++) {
    // Altura del centro, medida sobre la pared (en un cono la pared es inclinada).
    const along = p.startH + H / 2 + i * (H + p.gapV);
    const h = axis.z0 + along * cos;
    const top = axis.z0 + (along + H / 2) * cos, bottom = axis.z0 + (along - H / 2) * cos;
    if (bottom < axis.z0 - 0.01 || top > axis.z1 + 0.01) { outOfZone += cols; continue; }
    const r = rAt(axis, h);
    const halfDeg = ((W / 2) / r) * (180 / Math.PI);
    const shift = p.stagger && i % 2 === 1 ? step / 2 : 0;
    for (let j = 0; j < cols; j++) {
      const off = (j + 0.5) * step + shift;
      if (!full && off + halfDeg > p.coverage + 0.01) continue;   // alternadas en cobertura parcial: la última no entra
      const angle = wrap(p.startAngle + off);
      if (p.exclude && angDist(angle, p.exclCenter) < p.exclWidth / 2 + halfDeg) { inHandle++; continue; }
      const key = `${i}-${j}`, ov = p.overrides?.[key] || {};
      const al = along + (ov.dh || 0), hh = axis.z0 + al * cos;
      items.push({ key, row: i, col: j, angle: wrap(angle + (ov.da || 0)), h: hh, along: al, r: rAt(axis, hh),
        dr: (p.radial || 0) + (ov.dr || 0), spin: (p.spin || 0) + (ov.spin || 0), s: ov.s || 1, loose: !!p.overrides?.[key] });
    }
  }

  // Avisos (no frenan: el usuario decide).
  const r0 = Math.min(axis.r0, axis.r1);
  const widthDeg = (W / r0) * (180 / Math.PI);
  if (widthDeg > step + 0.01) warnings.push('Los diseños se tocan o se superponen de costado: bajá el ancho, las columnas o subí la cobertura.');
  if (widthDeg > 120) warnings.push('El diseño es muy ancho para este radio: se va a deformar mucho al curvarse.');
  if (outOfZone) warnings.push(`${outOfZone} ${outOfZone === 1 ? 'diseño queda' : 'diseños quedan'} fuera de la zona decorable (filas que no entran en altura).`);
  if (inHandle) warnings.push(`${inHandle} ${inHandle === 1 ? 'diseño se saltea' : 'diseños se saltean'} por la zona del asa.`);
  if (items.length > LIMITS.total) warnings.push(`Máximo ${LIMITS.total} diseños por chop.`);

  return { items: items.slice(0, LIMITS.total), W, H, step, warnings };
}
