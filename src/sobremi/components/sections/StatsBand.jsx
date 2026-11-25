import { DISCORD_INVITE } from '../../config/site.js';
import { STATS } from '../../data/makers.js';
import useDiscordCount from '../../hooks/useDiscordCount.js';
import Icon from '../ui/Icon.jsx';

const fmt = new Intl.NumberFormat('es-AR');

// "La comunidad en números": solo muestra las cifras que tienen dato.
export default function StatsBand() {
  const discord = useDiscordCount(DISCORD_INVITE);
  const stats = STATS
    .map((s) => (s.live === 'discord' && discord ? { ...s, value: discord } : s))
    .filter((s) => Number.isFinite(s.value));
  if (!stats.length) return null;
  return (
    <section className="stats-band" aria-label="La comunidad en números">
      <div className="container">
        <div className="stats-panel">
          <div className="section-label stats-label">LA COMUNIDAD EN NÚMEROS</div>
          <ul className="stats-list">
            {stats.map((s) => (
              <li key={s.id} className="stat">
                <span className="stat-ico"><Icon name={s.icon} size={20} /></span>
                <span className="stat-txt">
                  <strong>{s.prefix}{fmt.format(s.value)}</strong>
                  <small>{s.label}{s.live && <span className="live-dot" title="Se actualiza solo" />}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
