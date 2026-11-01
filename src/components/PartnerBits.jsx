import { useEffect, useState } from 'react';
import * as api from '../lib/communityApi.js';
import Icon from './Icon.jsx';

export function RelationChip({ relation }) {
  return relation === 'sponsor'
    ? <span className="chip club" title="Colaboración comercial: esta marca colabora económicamente con 3DBAT"><Icon name="star" size={11} /> Patrocinado</span>
    : <span className="chip cat">Colaborador</span>;
}

export function PartnerLogo({ p, size = 84 }) {
  const url = api.partnerLogoUrl(p.logo_path);
  return (
    <div className={'pt-logo' + (p.logo_bare ? ' bare' : '')} style={{ width: size, height: size }}>
      {url ? <img src={url} alt={`Logo de ${p.name}`} loading="lazy" decoding="async" /> : <span>{p.name.charAt(0).toUpperCase()}</span>}
    </div>
  );
}

// Franja del Inicio: solo si hay marcas destacadas vigentes (si no, no aparece nada).
export function PartnersStrip() {
  const flags = api.useCommunityFlags();
  const [list, setList] = useState(null);
  useEffect(() => { if (flags?.batpartners) api.partnersList().then((l) => setList(l.filter((p) => p.featured).slice(0, 8))).catch(() => setList(null)); }, [flags]);
  if (!list?.length) return null;
  return (
    <section className="block pt-strip">
      <div className="sec-head"><div><div className="section-label">BATPARTNERS</div><h2>Nuestros patrocinadores</h2></div>
        <a className="sec-link" href="#/patrocinadores">Ver todos <Icon name="arrowRight" size={16} /></a></div>
      <div className="pt-strip-row">
        {list.map((p) => (
          <a key={p.id} href={'#/patrocinadores/' + p.slug} className="pt-strip-item" title={p.name + (p.relation === 'sponsor' ? ' · Patrocinado' : '')}>
            <PartnerLogo p={p} size={64} />
            <span>{p.name}</span>
            {p.relation === 'sponsor' && <small>Patrocinado</small>}
          </a>
        ))}
      </div>
    </section>
  );
}

// Banner del Inicio (arriba de BATBOX): logos de las marcas vigentes, patrocinadores primero.
export function PartnersBanner() {
  const flags = api.useCommunityFlags();
  const [list, setList] = useState(null);
  useEffect(() => {
    if (flags?.batpartners) api.partnersList().then((l) => setList(l.slice(0, 8))).catch(() => setList(null));
  }, [flags]);
  if (!list?.length) return null;
  return (
    <div className="pt-banner">
      <span className="pt-banner-label">Con el apoyo de</span>
      <div className="pt-banner-row">
        {list.map((p) => (
          <a key={p.id} href={'#/patrocinadores/' + p.slug} className="pt-banner-item" title={p.name + (p.relation === 'sponsor' ? ' · Patrocinado' : '')}>
            <PartnerLogo p={p} size={44} />
            <span>{p.name}</span>
          </a>
        ))}
        <a href="#/patrocinadores" className="pt-banner-more">Ver todos</a>
      </div>
    </div>
  );
}
