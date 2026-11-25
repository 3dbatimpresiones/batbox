import Icon from './Icon.jsx';

// Tarjeta glass del sistema de diseño (6.2). Con icon + title muestra el encabezado.
export default function Card({ as: Tag = 'article', icon, title, className = '', children, ...rest }) {
  return (
    <Tag className={`card ${className}`.trim()} {...rest}>
      {title && (
        <div className="card-head">
          {icon && <div className="card-icon"><Icon name={icon} /></div>}
          <h3>{title}</h3>
        </div>
      )}
      {children}
    </Tag>
  );
}
