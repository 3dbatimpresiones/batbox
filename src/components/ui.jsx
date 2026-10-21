import Icon from './Icon.jsx';

export function AccessChip({ access }) {
  return access === 'club'
    ? <span className="chip club"><Icon name="lock" size={11} /> Makers Club</span>
    : <span className="chip free">Gratis</span>;
}

export function SampleChip({ show = true }) {
  if (!show) return null;
  return <span className="chip sample" title="Contenido de muestra: se reemplaza por contenido real más adelante">EJEMPLO</span>;
}

export function SectionHead({ label, title, to, linkText = 'Ver todo' }) {
  return (
    <div className="sec-head">
      <div>
        {label && <div className="section-label">{label}</div>}
        <h2>{title}</h2>
      </div>
      {to && <a className="sec-link" href={'#' + to}>{linkText} <Icon name="arrowRight" size={16} /></a>}
    </div>
  );
}

export function PageHead({ icon, label, title, text, children }) {
  return (
    <header className="page-head">
      <div className="ph-ico"><Icon name={icon} size={26} /></div>
      <div className="ph-txt">
        <div className="section-label">{label}</div>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {children}
    </header>
  );
}

export function Empty({ icon = 'search', title, text }) {
  return (
    <div className="empty">
      <div className="big-ico"><Icon name={icon} size={26} /></div>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
    </div>
  );
}

export function Options({ value, onChange, options }) {
  return (
    <div className="opts" role="group">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        return (
          <button key={v} type="button" className={'opt' + (value === v ? ' active' : '')} onClick={() => onChange(v)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Diálogo de confirmación (modal del sistema de diseño 3DBAT).
export function Confirm({ open, title, text, yes = 'Confirmar', no = 'Cancelar', danger, onYes, onNo }) {
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onNo}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {text && <p>{text}</p>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onNo}>{no}</button>
          <button className={'btn ' + (danger ? 'danger' : 'primary')} onClick={onYes} autoFocus>{yes}</button>
        </div>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', onSubmit, autoFocus }) {
  return (
    <form className="pink-input search-input" onSubmit={(e) => { e.preventDefault(); onSubmit?.(value); }} role="search">
      <Icon name="search" size={18} className="si-ico" />
      <input type="search" value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} onFocus={(e) => e.target.select()} aria-label={placeholder} />
    </form>
  );
}
