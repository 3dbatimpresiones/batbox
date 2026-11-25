// Sección de la página: label cyan + título + intro, y el contenido debajo.
export default function Section({ id, label, title, intro, className = '', children }) {
  return (
    <section id={id} className={`section ${className}`.trim()} aria-labelledby={`${id}-title`}>
      <div className="container">
        <header className="section-header">
          {label && <div className="section-label">{label}</div>}
          <h2 id={`${id}-title`} className="section-title">{title}</h2>
          {intro && <p className="section-intro">{intro}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}
