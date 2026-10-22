// =====================================================================
// CONFIGURACIÓN PÚBLICA DE BATBOX
// Todo lo que está acá es público por diseño (va al navegador).
// NUNCA poner acá la service_role key ni contraseñas.
// =====================================================================

// Mismo proyecto Supabase que el Cotizador 3DBAT PRO 2.0.
export const SUPABASE_URL = 'https://llciggitqtseosfklbjl.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_du93qodYkSZRevJ-BgXUGw_BrFc6JMO';

// Precio de la suscripción mensual al Makers Club (se muestra en la web; el cobro real lo define el plan de Mercado Pago).
export const CLUB_PRICE = 5000;
export const CLUB_PRICE_TEXT = '$' + CLUB_PRICE.toLocaleString('es-AR');

export const LINKS = {
  cotizadorPro: 'https://3dbatimpresiones.github.io/cotizador-3dbat-pro/',
  cotizadorFree: 'https://3dbatimpresiones.github.io/cotizador-3dbat-free/',
  carretesVacios: 'https://3dbatimpresiones.github.io/dbcarretesvacios/',
  // Suscripción mensual al Makers Club (plan de Mercado Pago) y dónde la gestiona cada persona.
  mpSubscribe: 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=2c9380848b8b1e59018b8ba9505d0065',
  mpManage: 'https://www.mercadopago.com.ar/subscriptions',
};

// Cuentas DUEÑAS (las únicas que dan o quitan permisos): las define la base
// (bb_owner_emails() en supabase/007). A propósito NO están acá: este archivo es público.

// Portada de 3DBAT: BATBOX también se publica dentro del dominio de la web (en /batbox/),
// y desde ahí se puede volver a la portada (/). En GitHub Pages o en local no hay portada.
const HOST = typeof window !== 'undefined' ? window.location.hostname : '';
export const PORTAL_URL = HOST.endsWith('github.io') || HOST === 'localhost' ? null : '/';

// Canales de 3DBAT (para los botones de suscribirse / seguir junto a cada video).
export const YOUTUBE = {
  channelId: 'UCBWIscRbi6Vq5qvLHVna3Pg',
  url: 'https://www.youtube.com/@3dbat.impresiones',
};
export const INSTAGRAM = {
  handle: '3dbat.impresiones',
  url: 'https://www.instagram.com/3dbat.impresiones/',
};

// Redes y comunidad. url: null = enlace todavía no cargado.
// TODO(Etapa 4): reemplazar por los enlaces reales que pase el admin.
export const SOCIALS = [
  { id: 'instagram', label: 'Instagram', icon: 'instagram', handle: '3DBAT IMPRESIONES', url: null },
  { id: 'youtube', label: 'YouTube', icon: 'youtube', handle: '3DBAT IMPRESIONES', url: null },
  { id: 'discord', label: 'Discord', icon: 'message', handle: 'Comunidad Makers 3DBAT', url: null },
  { id: 'grupos', label: 'Grupos de la comunidad', icon: 'users', handle: 'Grupos públicos', url: null },
];
