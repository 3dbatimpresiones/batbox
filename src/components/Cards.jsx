import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { faviconUrl, isVerticalMedia, siteHost, thumbSrc } from '../lib/media.js';
import { TOOL_STATUS } from '../data/tools.js';
import { MEDIA_PLATFORMS } from '../data/sample.js';
import { PLATFORM_LABEL } from '../data/tutorials.js';
import { fmtDate } from '../lib/text.js';
import Icon from './Icon.jsx';
import { AccessChip, SampleChip } from './ui.jsx';
import { CardStats } from './Interaction.jsx';

const KIND_ICON = { tutorial: 'graduation', video: 'play', resource: 'library', news: 'newspaper' };

// Un recurso con enlace abre directo la página en una pestaña aparte, sin sacar de BATBOX
// (pedido del dueño). Sin enlace visible (Makers Club sin acceso) abre su ficha, que explica cómo acceder.
const isDirect = (item) => item.kind === 'resource' && !!item.url;
export const itemLink = (item) => (isDirect(item)
  ? { href: item.url, target: '_blank', rel: 'noopener noreferrer' }
  : { href: '#/ver/' + item.id });

// Miniatura: imagen real si existe (YouTube), si no degradé por tipo/plataforma + ícono.
export function Thumb({ item, big }) {
  const icon = item.platform ? MEDIA_PLATFORMS[item.platform]?.icon || 'play' : KIND_ICON[item.kind];
  const isVideo = item.kind === 'video' || !!item.platform;
  const src = thumbSrc(item);
  const [broken, setBroken] = useState(false);
  const [iconBroken, setIconBroken] = useState(false);
  useEffect(() => { setBroken(false); setIconBroken(false); }, [src, item.url]);
  const showImg = src && !broken;
  // Recurso sin miniatura: logo + dominio de la página (si se puede ver el enlace).
  const site = !showImg && item.kind === 'resource' && item.url && !iconBroken ? { host: siteHost(item.url), icon: faviconUrl(item.url) } : null;
  const vertical = showImg && isVerticalMedia(item);
  return (
    <div className={`thumb k-${item.kind}${item.platform ? ' p-' + item.platform : ''}${showImg ? ' has-img' : ''}${vertical ? ' vertical' : ''}${big ? ' big' : ''}`}>
      {vertical && <img className="thumb-bg" src={src} alt="" aria-hidden="true" loading="lazy" referrerPolicy="no-referrer" />}
      {showImg
        ? <img className={vertical ? 'thumb-fg' : ''} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : site?.icon
          ? <span className="thumb-site"><img src={site.icon} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setIconBroken(true)} /><b>{site.host}</b></span>
          : <Icon name={icon} size={big ? 54 : 34} />}
      {isVideo && <span className="thumb-play"><Icon name="play" size={16} /></span>}
      {item.platform && item.kind !== 'video' && <span className="thumb-platform"><Icon name={icon} size={13} /> {PLATFORM_LABEL[item.platform]}</span>}
      {item.duration && <span className="thumb-badge">{item.duration}</span>}
      {item.access === 'club' && <span className="thumb-lock"><Icon name="lock" size={13} /></span>}
    </div>
  );
}

// Versión compacta (fila con ícono) para listas laterales.
export function MiniCard({ item }) {
  return (
    <a className="mini-card" {...itemLink(item)}>
      <span className={`mini-ico k-${item.kind}`}><Icon name={KIND_ICON[item.kind]} size={20} />
        {item.access === 'club' && <span className="mini-lock"><Icon name="lock" size={10} /></span>}
      </span>
      <span className="mini-txt">
        <strong>{item.title}</strong>
        <small>{item.description}</small>
      </span>
      <span className="chips mini-chips">
        <span className="chip cat">{item.category}</span>
        <SampleChip show={item.sample} />
      </span>
    </a>
  );
}

export function ContentCard({ item }) {
  return (
    <a className="c-card" {...itemLink(item)}>
      <Thumb item={item} />
      <div className="c-body">
        <div className="chips">
          {(item.kind === 'video' ? item.platformLabel : item.category) && <span className="chip cat">{item.kind === 'video' ? item.platformLabel : item.category}</span>}
          <AccessChip access={item.access} />
          <SampleChip show={item.sample} />
        </div>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <div className="c-meta">
          {item.level && <span>{item.level}</span>}
          {item.date && <span>{fmtDate(item.date)}</span>}
          {item.kind === 'resource' && <span>{item.category}</span>}
          <CardStats item={item} />
        </div>
      </div>
    </a>
  );
}

export function NewsRow({ item }) {
  return (
    <a className="news-row" href={'#/ver/' + item.id}>
      <div className="news-date">{fmtDate(item.date)}</div>
      <div className="news-txt">
        <strong>{item.title}</strong>
        <small>{item.description}</small>
      </div>
      <div className="chips">
        {item.access === 'club' && <AccessChip access="club" />}
        <SampleChip show={item.sample} />
      </div>
    </a>
  );
}

// Botón de una herramienta según su estado y el acceso de la persona.
function ToolAction({ tool }) {
  const { access, signIn } = useAuth();
  if (tool.status !== 'available') {
    return <button className="btn ghost" disabled>Próximamente</button>;
  }
  // El enlace de una herramienta club solo llega a miembros (RLS); el resto ve cómo acceder.
  const open = !tool.url ? <button className="btn ghost" disabled>Sin enlace</button> : (
    <a className="btn primary" href={tool.url} target="_blank" rel="noopener">
      Abrir herramienta <Icon name="external" size={16} />
    </a>
  );
  if (tool.access === 'free' || access === 'member') return open;
  if (access === 'loading') return <button className="btn ghost" disabled>Verificando…</button>;
  if (access === 'guest') {
    return <button className="btn primary" onClick={() => signIn()}><Icon name="login" size={16} /> Ingresar para abrir</button>;
  }
  return <a className="btn ghost" href="#/club">Ver cómo acceder</a>;
}

export function ToolCard({ tool }) {
  const st = TOOL_STATUS[tool.status] || TOOL_STATUS.available;
  const [shotOk, setShotOk] = useState(true);
  const shot = shotOk ? thumbSrc(tool) : null;
  const chips = (
    <div className="chips">
      <span className={'chip ' + st.cls}>{st.label}</span>
      <AccessChip access={tool.access} />
    </div>
  );
  return (
    <article className={'card tool-card' + (shot ? ' with-shot' : '') + (tool.status === 'soon' ? ' is-soon' : '')}>
      {shot ? (
        <div className="tool-shot">
          <img src={shot} alt={`Vista de ${tool.name}`} loading="lazy" onError={() => setShotOk(false)} />
          {chips}
          <div className="card-icon lg"><Icon name={tool.icon} size={24} /></div>
        </div>
      ) : (
        <div className="tool-top">
          <div className="card-icon lg"><Icon name={tool.icon} size={24} /></div>
          {chips}
        </div>
      )}
      <h3 className="tool-title">{tool.access === 'club' && <Icon name="crown" size={19} className="club-crown" />}{tool.name}</h3>
      <p>{tool.description}</p>
      <div className="tool-foot">
        {tool.category ? <span className="chip cat">{tool.category}</span> : <span />}
        <ToolAction tool={tool} />
      </div>
    </article>
  );
}

export function Grid({ children, min = 260 }) {
  return <div className="grid" style={{ '--min': min + 'px' }}>{children}</div>;
}
