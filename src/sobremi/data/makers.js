import { LINKS } from '../config/site.js';

// La comunidad Makers 3DBAT se creó el 27/4/2023 (dato del dueño).
export const COMMUNITY_SINCE = new Date(2023, 3, 27);

// Años cumplidos desde una fecha (el 27/4/2027 pasa solo de 3 a 4).
function fullYearsSince(d, now = new Date()) {
  let y = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) y -= 1;
  return y;
}

// Contador de la comunidad. value: null = la tarjeta no se muestra.
// live: 'discord' = se actualiza solo en el navegador (si falla, queda value).
// Los demás se actualizan a mano: poné el número nuevo y la fecha.
export const STATS = [
  { id: 'discord', icon: 'discord', label: 'makers en Discord', value: 570, live: 'discord' },
  { id: 'whatsapp', icon: 'messageCircle', label: 'en la comunidad de WhatsApp', value: 1000, prefix: '+' }, // dato del dueño, 2026-10-21
  { id: 'club', icon: 'crown', label: 'miembros del Makers Club', value: 66 }, // dato del dueño 2026-10-21: total del Makers Club, incluye miembros de honor que no pagan (29 usan el Cotizador PRO)
  { id: 'years', icon: 'calendar', label: 'años de comunidad', value: fullYearsSince(COMMUNITY_SINCE), prefix: '+' }, // se actualiza solo cada 27/4
  { id: 'free', icon: 'calculator', label: 'usan el Cotizador FREE', value: null }, // no se mide (no tiene login)
];

// Qué hay adentro de BATBOX: solo accesos (el contenido vive allá, no se repite acá).
export const BATBOX_SECTIONS = [
  { icon: 'wrench', title: 'Herramientas', text: 'Cotizador 3DBAT y más apps para tu taller.', href: LINKS.batboxTools },
  { icon: 'graduation', title: 'Tutoriales', text: 'Slicer, mantenimiento, diseño y más.', href: LINKS.batboxAcademy },
  { icon: 'users', title: 'Comunidad', text: 'Discord y WhatsApp: ahí se resuelven las dudas.', href: LINKS.batboxCommunity },
  { icon: 'crown', title: 'Makers Club', text: 'Herramientas PRO y contenido exclusivo.', href: LINKS.batboxClub },
];
