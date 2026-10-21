import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { NAV, MOBILE_MAIN } from '../data/nav.js';
import { useContent } from '../data/ContentContext.jsx';
import Icon from './Icon.jsx';

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
      <span className="acct-name">{displayName.split('@')[0]}</span>
    </a>
  );
}

export function Header({ route }) {
  const section = route.parts[0] ?? '';
  return (
    <header className="bb-top">
      <div className="bb-top-in">
        <Brand />
        <nav className="top-nav" aria-label="Secciones">
          {NAV.map((n) => (
            <a key={n.key} href={'#' + n.to} className={'nav-link' + (section === n.key ? ' active' : '') + (n.key === 'club' ? ' club' : '')}>
              {n.key === 'club' && <Icon name="crown" size={15} />}
              {n.short}
            </a>
          ))}
        </nav>
        <div className="top-actions">
          <a className={'icon-btn' + (section === 'buscar' ? ' active' : '')} href="#/buscar" title="Buscar" aria-label="Buscar">
            <Icon name="search" />
          </a>
          <AccountButton />
        </div>
      </div>
    </header>
  );
}

export function BottomNav({ route }) {
  const section = route.parts[0] ?? '';
  const [open, setOpen] = useState(false);
  const { isAdmin } = useAuth();
  useEffect(() => setOpen(false), [route.path]);

  const main = NAV.filter((n) => MOBILE_MAIN.includes(n.key));
  const more = NAV.filter((n) => !MOBILE_MAIN.includes(n.key));
  const moreActive = more.some((n) => n.key === section) || ['acceso', 'admin', 'buscar'].includes(section);

  return (
    <>
      {open && (
        <div className="sheet-back" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {more.map((n) => (
              <a key={n.key} href={'#' + n.to} className={'sheet-link' + (section === n.key ? ' active' : '')}>
                <Icon name={n.icon} /> {n.label}
              </a>
            ))}
            <a href="#/buscar" className="sheet-link"><Icon name="search" /> Buscar</a>
            <a href="#/acceso" className="sheet-link"><Icon name="user" /> Mi cuenta</a>
            {isAdmin && <a href="#/admin" className="sheet-link"><Icon name="shield" /> Panel admin</a>}
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
        {SOCIALS.filter((s) => s.url).map((s) => (
          <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="icon-btn sm" aria-label={s.label}>
            <Icon name={s.icon} size={18} />
          </a>
        ))}
      </div>
      <p><b>BATBOX</b> · 3DBAT IMPRESIONES · Todo tu universo maker, en un solo lugar.</p>
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
