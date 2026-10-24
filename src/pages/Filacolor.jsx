import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { sb } from '../lib/supabase.js';
import { safeUrl } from '../lib/safeUrl.js';
import { FILACOLOR, SCORE_LABELS, fcUrl } from '../data/filacolor.js';
import { GAME_URL } from '../lib/mtApi.js';
import fcLogo from '../assets/filacolor-logo.png';

// =====================================================================
// #/filacolor — Abastecimiento oficial · FILACOLOR
// Proveedor oficial de la Comunidad Makers 3DBAT. Sin precios, stock ni
// descuentos en vivo: enlaces y destacados que carga el equipo (bb_settings 'filacolor').
// =====================================================================

export function useFilacolorSettings() {
  // undefined = cargando · null = el equipo todavía no cargó nada (se usan los destacados por defecto)
  const [extra, setExtra] = useState(undefined);
  useEffect(() => {
    let alive = true;
    sb.from('bb_settings').select('value').eq('key', 'filacolor').maybeSingle()
      .then(({ data }) => { if (alive) setExtra(data?.value ?? null); });
    return () => { alive = false; };
  }, []);
  return extra;
}
export const hlLink = (h) => safeUrl(h?.url) || fcUrl(h?.path || '/');

export default function Filacolor() {
  const extra = useFilacolorSettings();
  const [pick, setPick] = useState(['PLA', 'PETG', 'TPU']);
  const highlights = extra?.highlights?.length ? extra.highlights : FILACOLOR.highlights;
  const mats = FILACOLOR.materials.filter((m) => pick.includes(m.id));
  const toggle = (id) => setPick((p) => (p.includes(id) ? (p.length > 1 ? p.filter((x) => x !== id) : p) : p.length >= 3 ? [...p.slice(1), id] : [...p, id]));
  return (
    <div className="fc-page">
      <section className="fc-hero">
        <img src={fcLogo} alt="Filacolor" className="fc-hero-logo" />
        <div className="section-label">ABASTECIMIENTO OFICIAL · COMUNIDAD MAKERS 3DBAT</div>
        <h1>{FILACOLOR.tagline}</h1>
        <p>{FILACOLOR.about}</p>
        <div className="fc-ctas">
          <a className="fc-btn" href={fcUrl(FILACOLOR.links.filamentos)} target="_blank" rel="noopener noreferrer"><Icon name="sparkles" size={16} /> Ver filamentos</a>
          <a className="fc-btn" href={fcUrl(FILACOLOR.links.impresoras)} target="_blank" rel="noopener noreferrer"><Icon name="box" size={16} /> Impresoras</a>
          <a className="fc-btn" href={fcUrl(FILACOLOR.links.repuestos)} target="_blank" rel="noopener noreferrer"><Icon name="wrench" size={16} /> Repuestos y accesorios</a>
          <a className="fc-btn alt" href={fcUrl(FILACOLOR.links.servicio)} target="_blank" rel="noopener noreferrer"><Icon name="shield" size={16} /> Servicio técnico</a>
        </div>
      </section>

      {extra?.banner?.text && (
        <a className="fc-banner" href={hlLink(extra.banner)} target="_blank" rel="noopener noreferrer">{extra.banner.text} <Icon name="external" size={15} /></a>
      )}

      <section className="block">
        <div className="section-label">DESTACADOS</div>
        <div className="fc-highlights">
          {highlights.map((h, i) => (
            <a key={i} className="fc-hl card" href={hlLink(h)} target="_blank" rel="noopener noreferrer">
              {safeUrl(h.image) && <img src={safeUrl(h.image)} alt="" loading="lazy" />}
              <b>{h.title}</b><small>{h.text}</small>
              <span className="fc-hl-go">Ver en Filacolor <Icon name="external" size={13} /></span>
            </a>
          ))}
        </div>
      </section>

      <section className="block">
        <div className="section-label">COMPARADOR DE MATERIALES</div>
        <p className="fc-help">Elegí hasta 3 materiales para compararlos.</p>
        <div className="opts">{FILACOLOR.materials.map((m) => <button key={m.id} className={'opt' + (pick.includes(m.id) ? ' active' : '')} onClick={() => toggle(m.id)}>{m.id}</button>)}</div>
        <div className="fc-compare" style={{ '--n': mats.length }}>
          {mats.map((m) => (
            <div key={m.id} className="fc-mat card">
              <div className="fc-mat-h"><i style={{ background: m.color }} /><b>{m.id}</b></div>
              <small>{m.desc}</small>
              {Object.entries(SCORE_LABELS).map(([k, l]) => (
                <div key={k} className="fc-score"><span>{l}</span><span className="dots">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= m.score[k] ? 'on' : ''} />)}</span></div>
              ))}
              <div className="fc-kv"><span>Boquilla</span><b>{m.nozzle}</b></div>
              <div className="fc-kv"><span>Cama</span><b>{m.bed}</b></div>
              <div className="fc-kv"><span>Cerramiento</span><b>{m.enclosure}</b></div>
              <small><b>Ideal para:</b> {m.ideal}</small>
              <small className="muted">{m.note}</small>
              <a className="btn ghost sm" href={fcUrl(m.path)} target="_blank" rel="noopener noreferrer">Ver {m.id} en Filacolor <Icon name="external" size={13} /></a>
            </div>
          ))}
        </div>
      </section>

      <div className="two-blocks">
        <section className="block card fc-service">
          <div className="section-label">SERVICIO TÉCNICO</div>
          <h3>Reparación y puesta a punto de tu impresora</h3>
          <ul>{FILACOLOR.services.map((x) => <li key={x}><Icon name="check" size={15} /> {x}</li>)}</ul>
          <div className="fc-ctas">
            <a className="fc-btn" href={FILACOLOR.whatsapp + '?text=' + encodeURIComponent('Hola, vengo de BATBOX (3DBAT). Quiero pedir un turno para el servicio técnico.')} target="_blank" rel="noopener noreferrer"><Icon name="message" size={16} /> Pedir turno por WhatsApp</a>
          </div>
        </section>
        <section className="block card fc-info">
          <div className="section-label">DÓNDE ESTÁN</div>
          <p><Icon name="pin" size={16} /> {FILACOLOR.address}</p>
          <p><Icon name="clock" size={16} /> {FILACOLOR.hours}</p>
          <p><Icon name="box" size={16} /> {FILACOLOR.shipping}</p>
          <p><Icon name="instagram" size={16} /> <a href={FILACOLOR.instagram} target="_blank" rel="noopener noreferrer">@filacolor</a></p>
          <div className="section-label">MARCAS</div>
          <div className="fc-brands">{FILACOLOR.brands.map((b) => <span key={b} className="chip">{b}</span>)}</div>
        </section>
      </div>

      <a className="mt-fc-strip game" href={GAME_URL}>
        <Icon name="gamepad" size={26} />
        <span><b>En 3DBAT Maker Tycoon también</b><small>Filacolor es el proveedor de materiales de tu taller virtual.</small></span>
        <Icon name="arrowRight" size={18} />
      </a>
      <p className="fc-disclaimer">Precios, stock y promociones: siempre en filacolor.com.ar. Filacolor es el proveedor oficial de la Comunidad Makers 3DBAT.</p>
    </div>
  );
}
