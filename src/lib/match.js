// Sugiere a qué miembro pertenece una suscripción de Mercado Pago que no se unió sola
// (pagó con un correo distinto al de su cuenta de Google). Compara el correo y el nombre
// del pagador en Mercado Pago con los datos de cada miembro. Es solo una sugerencia:
// el admin la confirma.

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s) => norm(s).split(/[^a-z]+/).filter((w) => w.length >= 3);
const squash = (s) => norm(s).replace(/[^a-z]/g, '');
const localPart = (email) => squash(String(email || '').split('@')[0]);

export function scoreMember(sub, m) {
  const subEmail = norm(sub.payer_email).trim();
  if (subEmail && subEmail === norm(m.email).trim()) return { score: 100, why: 'mismo correo' };
  let score = 0;
  const why = [];
  const sl = localPart(sub.payer_email);
  const ml = localPart(m.email);
  if (sl.length >= 5 && ml.length >= 5 && (sl === ml || sl.includes(ml) || ml.includes(sl))) { score += 60; why.push('correo parecido'); }

  const first = words(m.first_name);
  const last = words(m.last_name);
  const payer = new Set(words(sub.payer_name));
  const firstHit = first.some((w) => payer.has(w));
  const lastHit = last.some((w) => payer.has(w));
  if (firstHit && lastHit) { score += 70; why.push('mismo nombre y apellido'); }
  else if (lastHit) { score += 30; why.push('mismo apellido'); }

  // Nombre o apellido escritos dentro del correo de Mercado Pago (ej. juanperez.ventas@…)
  if (!lastHit && sl) {
    const lastIn = last.some((w) => w.length >= 4 && sl.includes(w));
    const firstIn = first.some((w) => w.length >= 3 && sl.includes(w));
    if (lastIn && firstIn) { score += 55; why.push('nombre y apellido en el correo'); }
    else if (lastIn) { score += 25; why.push('apellido en el correo'); }
  }
  // Usuario de Instagram / Discord dentro del correo
  for (const h of [m.instagram_username, m.discord_username]) {
    const hs = squash(h);
    if (hs.length >= 5 && sl.length >= 5 && (sl.includes(hs) || hs.includes(sl))) { score += 50; why.push('su usuario de Instagram/Discord'); break; }
  }
  return { score, why: why.join(' + ') };
}

// Mejor candidato para cada suscripción. "safe": coincidencia clara y sin empate.
export function suggest(sub, members) {
  let best = null, second = 0;
  for (const m of members) {
    if (m.status === 'rejected') continue;
    const r = scoreMember(sub, m);
    if (!best || r.score > best.score) { second = best?.score || 0; best = { ...r, member: m }; }
    else if (r.score > second) second = r.score;
  }
  if (!best || best.score < 50) return null;
  return { ...best, safe: best.score >= 70 && best.score - second >= 30 };
}
