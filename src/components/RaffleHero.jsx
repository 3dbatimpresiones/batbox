import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import * as rifas from '../lib/rifasApi.js';
import '../styles/rifas.css';

// Banner del Inicio cuando hay una rifa activa: reemplaza el bloque BATBOX
// (logo, buscador y accesos) por la rifa, con premios, números y botón de participar.

export function useActiveRaffle() {
  const [r, setR] = useState(null);
  useEffect(() => {
    let on = true;
    rifas.getHome().then((h) => { if (on) setR(h?.active?.[0] || null); }).catch(() => {});
    return () => { on = false; };
  }, []);
  return r;
}

export default function RaffleHero({ r }) {
  const left = Math.max(0, r.total - r.taken);
  const pct = r.total ? Math.round((r.taken / r.total) * 100) : 0;
  const prizes = (r.prizes || []).flatMap((p) => String(p).split(/\n+/)).map((p) => p.trim()).filter(Boolean);
  const paused = r.status === 'paused';
  const href = '#/rifas/' + encodeURIComponent(r.slug);
  return (
    <div className="rf-hero2">
      <header className="rf-hero2-head">
        <span className="rf-kicker">BAT RIFAS · Makers 3DBAT</span>
        <h1 className={'rf-hero2-title' + (r.title.length > 22 ? ' long' : '')}>{r.title}</h1>
      </header>
      <a className="rf-hero2-img" href={href} aria-label={'Ver ' + r.title}>
        {r.cover_url ? <img src={r.cover_url} alt="" /> : <div className="rf-coverph"><Icon name="trophy" size={48} /><b>BAT RIFAS</b></div>}
        <span className="rf-live-badge">{paused ? 'Reservas pausadas' : '¡Rifa activa!'}</span>
      </a>
      <div className="rf-hero2-txt">
        {prizes.length > 0 && (
          <ol className="rf-prizelist mini">{prizes.map((p, i) => <li key={i}><span className="rf-place" aria-hidden>{i + 1}°</span><span>{p}</span></li>)}</ol>
        )}
        <div className="rf-hero2-stats">
          <div><b>{rifas.money(r.price_cents)}</b><small>por número</small></div>
          <div><b>{left}</b><small>quedan de {r.total}</small></div>
          <div><b>{rifas.fmtDate(r.draw_at, false) || 'Al agotar'}</b><small>sorteo</small></div>
        </div>
        <div className="rf-hero2-bar" role="img" aria-label={`${pct}% de los números ya tomados`}>
          <span className="rf-bar"><i style={{ width: pct + '%' }} /></span><small>{pct}% vendido · {left} números disponibles</small>
        </div>
        <a className="btn primary rf-hero2-cta" href={href}><Icon name="trophy" size={20} /> {paused ? 'Ver la rifa' : '¡Participar ahora!'}</a>
      </div>
    </div>
  );
}
