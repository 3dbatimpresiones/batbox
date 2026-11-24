import Icon from './Icon.jsx';

// Debajo de los ganadores: dónde verificar el resultado y el vivo de Instagram del día del sorteo.
export const RESULTS_URL = 'https://notitimba.com/lots/';

export default function RaffleVerify({ many = true }) {
  return (
    <section className="rf-verifybox" aria-label="Verificar el resultado">
      <p><Icon name="check" size={18} /> <b>Verificá {many ? 'los ganadores' : 'el ganador'} acá:</b>{' '}
        <a href={RESULTS_URL} target="_blank" rel="noopener noreferrer">notitimba.com/lots</a></p>
      <small>Es la web que usamos el día del sorteo para ver los resultados en tiempo real.</small>
      <p className="rf-verify-live"><Icon name="instagram" size={18} /> Ese día siempre estamos <b>en vivo en Instagram</b>:{' '}
        <a href="https://www.instagram.com/3dbat.impresiones/" target="_blank" rel="noopener noreferrer">@3dbat.impresiones</a> con{' '}
        <a href="https://www.instagram.com/filacolor/" target="_blank" rel="noopener noreferrer">@filacolor</a>.</p>
    </section>
  );
}
