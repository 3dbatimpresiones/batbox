import { CLUB_BENEFITS } from '../data/sample.js';
import { CLUB_PRICE_TEXT } from '../config.js';
import Icon from './Icon.jsx';

// Qué incluye el Makers Club y cómo sumarse. Lo usan la página Makers Club
// (para quien todavía no es miembro) y Comunidad, así el texto es el mismo en todos lados.

export const JOIN_STEPS = [
  { n: 1, title: 'Entrá con Google', text: 'Tocá "Quiero unirme" e ingresá con tu cuenta de Google.' },
  { n: 2, title: 'Suscribite y completá tus datos', text: 'Plan mensual por Mercado Pago: se cobra solo y lo cancelás cuando quieras.' },
  { n: 3, title: 'Listo', text: 'Se activa solo. Entrás a Makers Club, al Cotizador PRO y a todas las herramientas.' },
];

export function Benefits() {
  return (
    <div className="benefits">
      {CLUB_BENEFITS.map((b) => (
        <div key={b.title} className="benefit">
          <span className="benefit-ico"><Icon name={b.icon} size={18} /></span>
          <div><strong>{b.title}</strong><small>{b.text}</small></div>
        </div>
      ))}
    </div>
  );
}

export function JoinSteps() {
  return (
    <ol className="steps">
      {JOIN_STEPS.map((s) => (
        <li key={s.n}><span className="step-n">{s.n}</span><div><strong>{s.title}</strong><small>{s.text}</small></div></li>
      ))}
    </ol>
  );
}

// Tarjeta completa: título, beneficios, cómo sumarte y (opcional) un botón al final.
export default function ClubPitch({ id, title = 'Beneficios de la membresía', steps = true, price = true, children }) {
  return (
    <section className="card club-info" id={id}>
      <div className="ci-head">
        <div className="card-icon lg pink"><Icon name="crown" size={24} /></div>
        <div>
          <div className="section-label">MAKERS CLUB 3DBAT</div>
          <h2>{title}</h2>
        </div>
      </div>
      {price && <p className="ci-price"><b>{CLUB_PRICE_TEXT} por mes</b> · suscripción automática por Mercado Pago · la cancelás cuando quieras</p>}
      <Benefits />
      {steps && <>
        <div className="section-label">CÓMO SUMARTE</div>
        <JoinSteps />
      </>}
      {children}
    </section>
  );
}
