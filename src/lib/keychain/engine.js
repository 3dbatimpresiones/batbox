// =====================================================================
// Motor del Creador de Llaveros: texto → contorno 2D → base + letras 3D.
// Funciona en el navegador y en Node (pruebas). Recibe el módulo de
// manifold-3d ya inicializado y una fuente de opentype.js.
// Unidades: milímetros. Eje Z hacia arriba, la base apoya en Z = 0.
// =====================================================================

export const DEFAULTS = {
  letterHeight: 14,     // alto de las mayúsculas (mm)
  letterSpacing: 0,     // espacio extra entre letras (mm)
  lineSpacing: 1.15,    // interlineado (× alto de letra) si hay 2 renglones
  align: 'center',      // 'left' | 'center' | 'right' (2 renglones)
  shape: 'follow',      // 'follow' (sigue las letras) | 'tag' (etiqueta) | 'capsule' (cápsula)
  border: 3,            // margen alrededor del texto (mm)
  cornerRadius: 3,      // esquinas de la etiqueta (mm)
  ring: 'left',         // 'left' | 'right' | 'top' | 'none'
  ringDiameter: 10,     // diámetro exterior de la anilla (mm)
  holeDiameter: 4.5,    // agujero (mm)
  ringOffset: 0,        // corre la anilla hacia afuera (+) o hacia adentro (−) (mm)
  style: 'raised',      // 'raised' (en relieve) | 'flush' (enrasadas / incrustadas)
  plateThickness: 2.4,  // grosor de la base (mm)
  letterDepth: 1.2,     // alto de las letras en relieve, o profundidad si van incrustadas (mm)
  curveDetail: 0.08,    // tolerancia al pasar curvas a segmentos (mm)
};

const SEG = 48; // segmentos de los círculos

// ---------- Texto → polígonos ----------
// Pasa las curvas del contorno de opentype a polilíneas (en unidades de la fuente).
function flattenPath(commands, tol) {
  const polys = [];
  let cur = null, x0 = 0, y0 = 0;
  const push = (x, y) => { cur.push([x, y]); x0 = x; y0 = y; };
  const steps = (len) => Math.max(2, Math.min(64, Math.ceil(len / tol)));
  for (const c of commands) {
    if (c.type === 'M') { if (cur && cur.length > 2) polys.push(cur); cur = []; push(c.x, c.y); }
    else if (c.type === 'L') push(c.x, c.y);
    else if (c.type === 'Q') {
      const n = steps(Math.hypot(c.x1 - x0, c.y1 - y0) + Math.hypot(c.x - c.x1, c.y - c.y1));
      const sx = x0, sy = y0;
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        push(u * u * sx + 2 * u * t * c.x1 + t * t * c.x, u * u * sy + 2 * u * t * c.y1 + t * t * c.y);
      }
    } else if (c.type === 'C') {
      const n = steps(Math.hypot(c.x1 - x0, c.y1 - y0) + Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + Math.hypot(c.x - c.x2, c.y - c.y2));
      const sx = x0, sy = y0;
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        push(u * u * u * sx + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          u * u * u * sy + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y);
      }
    } else if (c.type === 'Z') { if (cur && cur.length > 2) polys.push(cur); cur = null; }
  }
  if (cur && cur.length > 2) polys.push(cur);
  // Saca el último punto si repite el primero.
  return polys.map((p) => {
    const a = p[0], b = p[p.length - 1];
    return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9 ? p.slice(0, -1) : p;
  }).filter((p) => p.length > 2);
}

// Alto de las mayúsculas de la fuente (unidades de la fuente).
function capHeightOf(font) {
  const os2 = font.tables?.os2;
  if (os2?.sCapHeight > 0) return os2.sCapHeight;
  const h = font.charToGlyph('H');
  const bb = h?.getBoundingBox?.();
  if (bb && bb.y2 > bb.y1) return bb.y2 - Math.max(0, bb.y1);
  return font.unitsPerEm * 0.7;
}

// Polígonos (mm, Y hacia arriba) de un renglón, empezando en x = 0 sobre la línea base y = 0.
function linePolys(font, text, p) {
  const k = p.letterHeight / capHeightOf(font);         // mm por unidad de la fuente
  const tol = p.curveDetail / k;
  const glyphs = font.stringToGlyphs(text);
  const polys = [];
  let x = 0;
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const path = g.getPath(x, 0, font.unitsPerEm);        // en unidades (tamaño = unitsPerEm → 1:1)
    for (const poly of flattenPath(path.commands, tol)) polys.push(poly.map(([px, py]) => [px * k, -py * k]));
    let adv = g.advanceWidth || 0;
    if (i < glyphs.length - 1) adv += font.getKerningValue(g, glyphs[i + 1]) || 0;
    x += adv + p.letterSpacing / k;
  }
  return { polys, width: x * k - (glyphs.length ? p.letterSpacing : 0) };
}

const boundsOf = (cs) => { const b = cs.bounds(); return { minX: b.min[0], minY: b.min[1], maxX: b.max[0], maxY: b.max[1] }; };

// Texto (1 o 2 renglones) → CrossSection centrado en (0, 0).
export function textSection(M, font, text, opts = {}) {
  const p = { ...DEFAULTS, ...opts };
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2);
  if (!lines.length) return null;
  const parts = lines.map((l) => linePolys(font, l, p));
  const maxW = Math.max(...parts.map((l) => l.width));
  const lineGap = p.letterHeight * p.lineSpacing + p.letterHeight * 0.35;
  let cs = null;
  parts.forEach((l, i) => {
    if (!l.polys.length) return;
    const dx = p.align === 'left' ? 0 : p.align === 'right' ? maxW - l.width : (maxW - l.width) / 2;
    const dy = -i * lineGap;
    const s = new M.CrossSection(l.polys.map((poly) => poly.map(([x, y]) => [x + dx, y + dy])), 'NonZero');
    cs = cs ? M.CrossSection.union(cs, s) : s;
  });
  if (!cs || cs.isEmpty()) return null;
  const b = boundsOf(cs);
  return cs.translate([-(b.minX + b.maxX) / 2, -(b.minY + b.maxY) / 2]);
}

// Solo los contornos de afuera (rellena los huecos de la "o", la "a"…).
function fillHoles(M, cs) {
  const outers = cs.toPolygons().filter((poly) => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; }
    return a > 0;
  });
  return outers.length ? new M.CrossSection(outers, 'Positive') : cs;
}

function roundedRect(M, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  if (r <= 0.01) return M.CrossSection.square([w, h], true);
  return M.CrossSection.square([w - 2 * r, h - 2 * r], true).offset(r, 'Round', 2, SEG);
}

// Contorno 2D de la base (sin la anilla).
function baseOutline(M, text, p) {
  const b = boundsOf(text);
  const w = b.maxX - b.minX + 2 * p.border, h = b.maxY - b.minY + 2 * p.border;
  if (p.shape === 'tag') return roundedRect(M, w, h, p.cornerRadius);
  if (p.shape === 'capsule') return roundedRect(M, w, h, h / 2);
  // "Sigue las letras": contorno del texto agrandado, sin huecos internos.
  return fillHoles(M, text.offset(p.border, 'Round', 2, SEG));
}

// Dónde va la anilla: pegada al borde, a media altura del lado que corresponde.
function ringPlacement(M, outline, p) {
  const b = boundsOf(outline);
  const R = p.ringDiameter / 2;
  const inset = R * 0.75 - p.ringOffset; // cuánto se mete en la base
  if (p.ring === 'left') return [b.minX - R + inset, (b.minY + b.maxY) / 2];
  if (p.ring === 'right') return [b.maxX + R - inset, (b.minY + b.maxY) / 2];
  if (p.ring === 'top') return [(b.minX + b.maxX) / 2, b.maxY + R - inset];
  return null;
}

// Arma un llavero: devuelve las dos piezas (base y letras) como Manifold y su tamaño.
export function buildKeychain(M, font, text, opts = {}) {
  const p = { ...DEFAULTS, ...opts };
  p.holeDiameter = Math.min(p.holeDiameter, p.ringDiameter - 1.2);
  const txt = textSection(M, font, text, p);
  if (!txt) return null;
  let outline = baseOutline(M, txt, p);
  let hole = null;
  const at = p.ring !== 'none' ? ringPlacement(M, outline, p) : null;
  if (at) {
    const ring = M.CrossSection.circle(p.ringDiameter / 2, SEG).translate(at);
    // Une la anilla a la base con un puente redondeado (que no quede colgando de un punto).
    const bridged = M.CrossSection.union(outline, ring).offset(0.6, 'Round', 2, SEG).offset(-0.6, 'Round', 2, SEG);
    outline = M.CrossSection.union(bridged, ring);
    hole = M.CrossSection.circle(p.holeDiameter / 2, SEG).translate(at);
    outline = M.CrossSection.difference(outline, hole);
  }
  const T = p.plateThickness, D = p.letterDepth;
  let base, letters;
  const lettersCS = hole ? M.CrossSection.difference(txt, hole) : txt;
  if (p.style === 'flush') {
    const d = Math.min(D, T - 0.4);
    const pocket = M.Manifold.extrude(lettersCS, d + 0.01).translate([0, 0, T - d]);
    base = M.Manifold.difference(M.Manifold.extrude(outline, T), pocket);
    letters = M.Manifold.extrude(lettersCS, d).translate([0, 0, T - d]);
  } else {
    base = M.Manifold.extrude(outline, T);
    letters = M.Manifold.extrude(lettersCS, D).translate([0, 0, T]);
  }
  const ob = boundsOf(outline);
  const height = p.style === 'flush' ? T : T + D;
  return {
    base, letters,
    size: { x: ob.maxX - ob.minX, y: ob.maxY - ob.minY, z: height },
    bounds: ob,                        // del contorno 2D (para acomodar en la cama)
    colorChangeAt: p.style === 'flush' ? T - Math.min(D, T - 0.4) : T, // altura del cambio de color (mm)
  };
}
