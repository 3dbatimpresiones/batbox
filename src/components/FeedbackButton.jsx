import Icon from './Icon.jsx';

export const FEEDBACK_TOOLS = {
  'control-pedidos': { label: 'Control de Pedidos', back: '#/pedidos' },
  'creador-llaveros': { label: 'Creador de Llaveros Múltiples Nombres', back: '#/llaveros' },
  'personalizador-chops': { label: 'Personalizador de chops 3D', back: '#/chops' },
  'peso-carretes-vacios': { label: 'Peso de Carretes Vacíos', back: 'https://3dbatimpresiones.github.io/dbcarretesvacios/' },
  'huecos-pines': { label: 'Creador de Huecos para Pines', back: '#/tools' },
  'cotizador-pro': { label: 'Cotizador 3DBAT PRO 2.0', back: 'https://3dbatimpresiones.github.io/cotizador-3dbat-pro/' },
  'cotizador-free': { label: 'Cotizador 3DBAT FREE', back: 'https://3dbatimpresiones.github.io/cotizador-3dbat-free/' },
};

export const feedbackHref = (source) => `#/sugerencias?source=${encodeURIComponent(source)}`;

export default function FeedbackButton({ source, className = '' }) {
  return (
    <a className={'tool-feedback ' + className} href={feedbackHref(source)} title="Mandanos una idea o contanos si algo anda mal">
      <Icon name="message" size={16} /> Sugerencias
    </a>
  );
}
