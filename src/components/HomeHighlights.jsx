import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CONFETTI, WeekMakerBlock } from './GalleryCards.jsx';
import Icon from './Icon.jsx';
import * as rifas from '../lib/rifasApi.js';
import '../styles/rifas.css';

// Destacados del Inicio: carrusel entre "Maker destacado de la semana" y
// "Ganadores de la rifa" (este último durante 14 días desde que se informan los ganadores).
// Si solo hay uno de los dos, se muestra fijo, sin flechas ni puntos.

const WINNERS_DAYS = 14;
const ROTATE_MS = 9000;

function RaffleWinnersBlock({ fin, isAdmin }) {
  const [copied, setCopied] = useState(false);
  const many = fin.winners.length > 1;
  const caption = `🏆 ${many ? 'Ganadores' : 'Ganador'} de la rifa "${fin.title}" 🎉\n\n${fin.winners.map((w) => `${w.place}° ${w.prize}: N° ${w.number}${w.name ? ` — ${w.name}` : ' (número no vendido)'}`).join('\n')}\n\n¡Gracias a todos por participar! Seguí las próximas rifas en BATBOX. #3DBAT #BATBOX #rifa`;
  const copy = async () => { try { await navigator.clipboard.writeText(caption); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* sin portapapeles */ } };
  return (
    <section className="block ga-weekblock rf-winblock">
      <div className="ga-confetti" aria-hidden="true">{CONFETTI.map((c, i) => <i key={i} style={c} />)}</div>
      <h2 className="ga-weekbanner"><i className="ln" /><Icon name="trophy" size={26} /><span>{many ? 'GANADORES DE LA RIFA' : 'GANADOR DE LA RIFA'}</span><Icon name="trophy" size={26} /><i className="ln" /></h2>
      <div className="ga-weekgrid">
        <div className="ga-weekcard">
          <a className="ga-card rf-wincard" href={'#/rifas/' + fin.slug}>
            <div className="rf-wincard-img">
              {fin.cover_url ? <img src={fin.cover_url} alt="" loading="lazy" /> : <div className="rf-coverph"><Icon name="trophy" size={44} /><b>BAT RIFAS</b></div>}
              <span className="rf-wincard-tag"><Icon name="trophy" size={13} /> Rifa finalizada</span>
            </div>
            <div className="rf-wincard-body">
              <b className="rf-wincard-title">{fin.title}</b>
              <ol className="rf-winlist compact">
                {fin.winners.map((w) => (
                  <li key={w.place}><span className="rf-place" aria-hidden>{w.place}°</span>
                    <div className="rf-win-txt"><small>{w.prize}</small><b>{w.name || 'Número no vendido'}</b></div>
                    <span className="rf-win-n">{w.number}</span></li>))}
              </ol>
            </div>
          </a>
          {isAdmin && <button type="button" className="btn ghost" onClick={copy}><Icon name="instagram" size={16} /> {copied ? 'Texto copiado' : 'Copiar texto para Instagram'}</button>}
        </div>
        <div className="ga-weekright">
          <aside className="ga-weeknote" aria-label="Sobre la rifa">
            <h3><Icon name="sparkles" size={16} /> ¡Felicitaciones!</h3>
            <p>{many ? 'Estos son los ganadores' : 'Este es el ganador'} de la última rifa de la comunidad Makers 3DBAT. ¡Gracias a todos los que participaron!</p>
            <h3><Icon name="star" size={16} /> ¿Cómo se sorteó?</h3>
            <p>El sorteo se hizo por fuera de BATBOX, con el procedimiento de la comunidad que figura en las bases de la rifa.</p>
            <h3><Icon name="trophy" size={16} /> ¿Cómo participo en la próxima?</h3>
            <ul>
              <li>Atento al botón <b>Rifas</b> del menú: brilla cuando hay una rifa activa.</li>
              <li>Elegí tus números en el talonario, transferí y subí el comprobante.</li>
              <li>Cuando validamos el pago, tus números ya participan.</li>
            </ul>
          </aside>
          <div className="ga-cta">
            <div><b>¿Querés ser el próximo?</b><small>Las rifas se anuncian en BATBOX y en los grupos de la comunidad.</small></div>
            <a className="btn primary ga-cta-btn" href="#/rifas"><Icon name="trophy" size={18} /> Ver rifas</a>
            <a className="btn ghost" href={'#/rifas/' + fin.slug}>Ver talonario</a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomeHighlights({ isMember, isAdmin }) {
  const [fin, setFin] = useState(null);
  const [idx, setIdx] = useState(0);
  const [present, setPresent] = useState([false, false]);
  const [paused, setPaused] = useState(false);
  const refs = [useRef(null), useRef(null)];

  useEffect(() => {
    let on = true;
    rifas.getHome().then((h) => {
      const f = h?.finished;
      const fresh = f?.winners?.length && f.winners_at && Date.now() - new Date(f.winners_at).getTime() < WINNERS_DAYS * 864e5;
      if (on) setFin(fresh ? f : null);
    }).catch(() => {});
    return () => { on = false; };
  }, []);

  // ¿Qué diapositivas tienen contenido? (el Maker destacado puede no mostrarse)
  useLayoutEffect(() => {
    const check = () => setPresent((old) => { const n = refs.map((r) => !!r.current?.childElementCount); return n[0] === old[0] && n[1] === old[1] ? old : n; });
    check();
    const mo = new MutationObserver(check);
    refs.forEach((r) => r.current && mo.observe(r.current, { childList: true }));
    return () => mo.disconnect();
  });

  const slides = present.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  const multi = slides.length > 1;
  const current = slides.includes(idx) ? idx : slides[0] ?? 0;

  useEffect(() => {
    if (!multi || paused) return undefined;
    const t = setInterval(() => setIdx((i) => { const k = slides.indexOf(i); return slides[(k + 1) % slides.length]; }), ROTATE_MS);
    return () => clearInterval(t);
  }, [multi, paused, slides.join()]);

  const labels = ['Maker destacado de la semana', 'Ganadores de la rifa'];
  return (
    <div className={'hl-carousel' + (multi ? ' multi' : '')} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} aria-roledescription={multi ? 'carrusel' : undefined}>
      <div ref={refs[0]} className={'hl-slide' + (current === 0 ? ' on' : '')} aria-hidden={multi && current !== 0}><WeekMakerBlock isMember={isMember} isAdmin={isAdmin} /></div>
      <div ref={refs[1]} className={'hl-slide' + (current === 1 ? ' on' : '')} aria-hidden={multi && current !== 1}>{fin && <RaffleWinnersBlock fin={fin} isAdmin={isAdmin} />}</div>
      {multi && (
        <div className="hl-ctrl">
          <button type="button" className="icon-btn" aria-label="Anterior" onClick={() => setIdx(slides[(slides.indexOf(current) - 1 + slides.length) % slides.length])}>‹</button>
          {slides.map((i) => <button key={i} type="button" className={'hl-dot' + (i === current ? ' on' : '')} aria-label={labels[i]} aria-current={i === current} onClick={() => setIdx(i)} />)}
          <button type="button" className="icon-btn" aria-label="Siguiente" onClick={() => setIdx(slides[(slides.indexOf(current) + 1) % slides.length])}>›</button>
        </div>
      )}
    </div>
  );
}
