import { useState } from 'react';

// Gráficos del Control de Pedidos. Una sola serie por gráfico (cian de 3DBAT):
// la ganancia y los pedidos se ven en el cartel al pasar el mouse o tocar.
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const compact = (v) => (v >= 1e6 ? `$${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  : v >= 1e3 ? `$${Math.round(v / 1e3).toLocaleString('es-AR')} mil` : `$${Math.round(v)}`);
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const monthLabel = (ym, long = false) => {
  const [y, m] = ym.split('-').map(Number);
  if (long) return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
};

// Escala "linda" para el eje: 0, 1/3, 2/3 y el máximo redondeado.
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1.5 ? 1.5 : n <= 3 ? 3 : n <= 6 ? 6 : 10) * p;
}

// Productos más pedidos del mes (unidades). Barras horizontales con el valor al final.
export function TopProducts({ rows }) {
  const [hover, setHover] = useState(null);
  if (!rows.length) return <p className="oc-empty">Todavía no hay pedidos este mes.</p>;
  const max = Math.max(...rows.map((r) => r.units));
  return (
    <div className="oc-hbars" onMouseLeave={() => setHover(null)}>
      {rows.map((r, i) => (
        <div key={r.key} className={'oc-hrow' + (hover === i ? ' on' : '')} onMouseEnter={() => setHover(i)}
          onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
          aria-label={`${r.key}: ${r.units} unidades, ${money.format(r.income)}`}>
          <span className="oc-hlabel" title={r.key}>{r.key}</span>
          <span className="oc-htrack"><span className="oc-hbar" style={{ width: `${Math.max(2, (r.units / max) * 100)}%` }} /></span>
          <span className="oc-hval">{r.units.toLocaleString('es-AR')}</span>
          {hover === i && (
            <span className="oc-tip" role="tooltip">
              <b>{r.key}</b>
              <span>{r.units.toLocaleString('es-AR')} unidades · {r.count} {r.count === 1 ? 'pedido' : 'pedidos'}</span>
              <span>{money.format(r.income)}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// Productos más pedidos como torta (igual idea que la planilla original).
// Colores categóricos validados para daltonismo sobre fondo oscuro, en orden fijo;
// a partir del 7.º producto se agrupa en "Otros" (gris). Leyenda con nombre y unidades.
const SLOTS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];
const OTHER = '#7d859f';
export function ProductsDonut({ rows }) {
  const [hover, setHover] = useState(null);
  if (!rows.length) return <p className="oc-empty">Todavía no hay pedidos este mes.</p>;
  const shown = rows.length > SLOTS.length
    ? [...rows.slice(0, SLOTS.length - 1), rows.slice(SLOTS.length - 1).reduce((a, r) => ({ key: 'Otros', units: a.units + r.units, income: a.income + r.income, count: a.count + r.count }), { key: 'Otros', units: 0, income: 0, count: 0 })]
    : rows;
  const total = shown.reduce((a, r) => a + r.units, 0) || 1;
  const R = 70, W = 26, C = 2 * Math.PI * R, GAP = shown.length > 1 ? 2 : 0;
  let acc = 0;
  const color = (r, i) => (r.key === 'Otros' ? OTHER : SLOTS[i]);
  const h = hover != null ? shown[hover] : null;
  return (
    <div className="oc-donut" onMouseLeave={() => setHover(null)}>
      <div className="od-ring">
        <svg viewBox="0 0 180 180" role="img" aria-label="Productos más pedidos del mes">
          <circle cx="90" cy="90" r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={W} />
          {shown.map((r, i) => {
            const len = (r.units / total) * C;
            const seg = (
              <circle key={r.key} cx="90" cy="90" r={R} fill="none" stroke={color(r, i)} strokeWidth={hover === i ? W + 6 : W}
                strokeDasharray={`${Math.max(0, len - GAP)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 90 90)"
                opacity={hover == null || hover === i ? 1 : 0.4} onMouseEnter={() => setHover(i)} style={{ transition: 'opacity .15s, stroke-width .15s' }} />
            );
            acc += len;
            return seg;
          })}
        </svg>
        <div className="od-center" aria-hidden="true">
          <b>{(h ? h.units : total).toLocaleString('es-AR')}</b>
          <small>{h ? h.key : 'unidades'}</small>
        </div>
      </div>
      <ul className="od-legend">
        {shown.map((r, i) => (
          <li key={r.key} className={hover === i ? 'on' : ''} onMouseEnter={() => setHover(i)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
            <span className="od-sw" style={{ background: color(r, i) }} />
            <span className="od-name" title={r.key}>{r.key}</span>
            <span className="od-val">{r.units.toLocaleString('es-AR')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Ingresos de los últimos meses. Tocar una barra abre ese mes.
export function MonthlyIncome({ rows, selected, onSelect, unit = ['pedido', 'pedidos'], incomeLabel = 'Ingresos' }) {
  const [hover, setHover] = useState(null);
  const max = niceMax(Math.max(0, ...rows.map((r) => r.income)));
  const ticks = [max, (max * 2) / 3, max / 3, 0];
  return (
    <div className="oc-vchart">
      <div className="oc-axis" aria-hidden="true">
        {ticks.map((t) => <span key={t}>{compact(t)}</span>)}
      </div>
      <div className="oc-plot" onMouseLeave={() => setHover(null)}>
        <div className="oc-area" aria-hidden="true">
          {ticks.map((t) => <span key={t} className="oc-grid" style={{ bottom: `${(t / max) * 100}%` }} />)}
        </div>
        <div className="oc-cols">
          {rows.map((r, i) => (
            <button key={r.month} type="button" className={'oc-col' + (r.month === selected ? ' sel' : '') + (hover === i ? ' on' : '')}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              onClick={() => onSelect(r.month)}
              aria-label={`${monthLabel(r.month, true)}: ${money.format(r.income)}`}>
              <span className="oc-vbar" style={{ height: `${r.income > 0 ? Math.max(1.5, (r.income / max) * 100) : 0}%` }} />
              <span className="oc-xl">{MONTHS[Number(r.month.slice(5)) - 1]}<span className="oc-yr"> {r.month.slice(2, 4)}</span></span>
              {hover === i && (
                <span className={'oc-tip' + (i > rows.length - 4 ? ' left' : '')} role="tooltip">
                  <b>{monthLabel(r.month, true)}</b>
                  <span>{incomeLabel}: {money.format(r.income)}</span>
                  {r.profit != null && <span>Ganancia: {money.format(r.profit)}</span>}
                  <span>{r.count} {r.count === 1 ? unit[0] : unit[1]}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="sr-only"><table>
        <caption>{incomeLabel} por mes</caption>
        <thead><tr><th>Mes</th><th>{incomeLabel}</th><th>Ganancia</th><th>{unit[1].replace(/^./, (c) => c.toUpperCase())}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.month}><td>{monthLabel(r.month, true)}</td><td>{money.format(r.income)}</td><td>{r.profit == null ? '—' : money.format(r.profit)}</td><td>{r.count}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
