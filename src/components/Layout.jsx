import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { NAV, MOBILE_MAIN } from '../data/nav.js';
import { useContent } from '../data/ContentContext.jsx';
import { PORTAL_URL } from '../config.js';
import Icon from './Icon.jsx';
import { SocialIcon } from './BrandIcon.jsx';
import { safeUrl } from '../lib/safeUrl.js';
import { LiveChip } from './Tycoon.jsx';
import NotificationBell from './NotificationBell.jsx';
import { FeatIso, useFeaturedUid } from './Featured.jsx';
import { useCommunityFlags } from '../lib/communityApi.js';

const SUB_KEYS = NAV.filter((n) => n.sub).map((n) => n.key);

// Oculta del menú los módulos de comunidad apagados o sin acceso.
// La Biblioteca 3D se ve como "Próximamente" hasta que se prende el interruptor "biblioteca" (los admins ya la usan).
function useNav() {
  const { isMember, isAdmin } = useAuth();
  const flags = useCommunityFlags();
  return NAV.filter((n) => !n.flag || ((isMember || n.public) && flags?.[n.flag]))
    .map((n) => (n.key === 'biblioteca' && !isAdmin && !flags?.biblioteca ? { ...n, soon: true } : n));
}
const Soon = ({ n }) => (n.soon ? <span className="nav-soon">Pronto</span> : null);

export function Brand({ compact }) {
  return (
    <a className="brand" href="#/" aria-label="BATBOX — inicio">
      <div className="brand-logo"><Icon name="box" size={24} /></div>
      {!compact && (
        <div className="brand-txt">
          <span className="brand-name">BAT<span>BOX</span></span>
          <span className="brand-by">by 3DBAT IMPRESIONES</span>
        </div>
      )}
    </a>
  );
}

function AccountButton() {
  const { access, user, displayName } = useAuth();
  const featured = useFeaturedUid();
  if (access === 'loading') {
    return <span className="acct-btn" aria-label="Verificando sesión"><span className="spinner xs" /></span>;
  }
  if (!user) {
    return <a className="acct-btn login" href="#/acceso"><Icon name="login" size={18} /><span>Ingresar</span></a>;
  }
  const initial = (displayName || '?').trim().charAt(0).toUpperCase();
  return (
    <a className="acct-btn" href="#/acceso" title="Tu cuenta">
      <span className="avatar">{initial}<span className={'status-dot s-' + access} /></span>
      {user && featured === user.id && <FeatIso size={30} />}
      <span className={'acct-name' + (user && featured === user.id ? ' feat-name' : '')}>{displayName.split('@')[0]}</span>
    </a>
  );
}

export function Header({ route }) {
  const section = route.parts[0] ?? '';
  const nav = useNav();
  return (
    <header className="bb-top">
      <div className="bb-top-in">
        {PORTAL_URL && (
          <a className="portal-link" href={PORTAL_URL} title="Volver a la portada de 3DBAT" aria-label="Volver a la portada de 3DBAT">
            <Icon name="home" size={18} /><span>3DBAT</span>
          </a>
        )}
        <Brand />
        <nav className="top-nav" aria-label="Secciones">
          {nav.filter((n) => !n.sub).map((n) => (
            <a key={n.key} href={'#' + n.to} className={'nav-link' + (section === n.key || (n.key === 'community' && SUB_KEYS.includes(section)) ? ' active' : '') + (n.key === 'club' ? ' club' : '') + (n.key === 'juego' ? ' game' : '')}>
              {n.key === 'club' && <Icon name="crown" size={15} />}
              {n.key === 'juego' && <Icon name="gamepad" size={15} />}
              {n.short}<Soon n={n} />
            </a>
          ))}
        </nav>
        <div className="top-actions">
          <LiveChip />
          <a className={'icon-btn' + (section === 'buscar' ? ' active' : '')} href="#/buscar" title="Buscar" aria-label="Buscar">
            <Icon name="search" />
          </a>
          <NotificationBell />
          <AccountButton />
        </div>
      </div>
    </header>
  );
}

export function BottomNav({ route }) {
  const section = route.parts[0] ?? '';
  const [open, setOpen] = useState(false);
  const { canEdit, isAdmin } = useAuth();
  const nav = useNav();
  useEffect(() => setOpen(false), [route.path]);

  const main = nav.filter((n) => MOBILE_MAIN.includes(n.key));
  const more = nav.filter((n) => !MOBILE_MAIN.includes(n.key) && !n.sub);
  const moreActive = more.some((n) => n.key === section) || SUB_KEYS.includes(section) || ['acceso', 'admin', 'buscar'].includes(section);

  return (
    <>
      {open && (
        <div className="sheet-back" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {more.map((n) => (
              <a key={n.key} href={'#' + n.to} className={'sheet-link' + (section === n.key ? ' active' : '')}>
                <Icon name={n.icon} /> {n.label}<Soon n={n} />
              </a>
            ))}
            <a href="#/buscar" className="sheet-link"><Icon name="search" /> Buscar</a>
            <a href="#/acceso" className="sheet-link"><Icon name="user" /> Mi cuenta</a>
            {canEdit && <a href="#/admin" className="sheet-link"><Icon name="shield" /> {isAdmin ? 'Panel admin' : 'Panel de editor'}</a>}
          </div>
        </div>
      )}
      <nav className="bottom-nav" aria-label="Navegación">
        {main.map((n) => (
          <a key={n.key} href={'#' + n.to} className={'bn-item' + (section === n.key ? ' active' : '')}>
            <Icon name={n.icon} /><span>{n.short}</span>
          </a>
        ))}
        <button className={'bn-item' + (open || moreActive ? ' active' : '')} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Icon name="grid" /><span>Más</span>
        </button>
      </nav>
    </>
  );
}

export function Footer() {
  const { socials: SOCIALS } = useContent();
  return (
    <footer className="foot">
      <div className="foot-socials">
        {SOCIALS.filter((s) => safeUrl(s.url)).map((s) => (
          <a key={s.id} href={safeUrl(s.url)} target="_blank" rel="noopener noreferrer" className="icon-btn sm" aria-label={s.label}>
            <SocialIcon social={s} size={18} />
          </a>
        ))}
      </div>
      <p>
        <b>BATBOX</b> · {PORTAL_URL ? <a href={PORTAL_URL}>3DBAT IMPRESIONES</a> : '3DBAT IMPRESIONES'} · Todo tu universo maker, en un solo lugar.
      </p>
    </footer>
  );
}

export function DevBanner() {
  const { usingSamples } = useContent();
  if (!usingSamples) return null;
  return (
    <div className="dev-banner">
      Versión en desarrollo · el contenido marcado <span className="chip sample">EJEMPLO</span> es de muestra
    </div>
  );
}

export function Toast() {
  const { notice, clearNotice } = useAuth();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clearNotice, notice.type === 'err' ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [notice, clearNotice]);
  if (!notice) return null;
  return <div className={'toast' + (notice.type === 'err' ? ' err' : '')} role="status">{notice.text}</div>;
}
