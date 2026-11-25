import Icon from './Icon.jsx';

// Botón / enlace con el estilo 3DBAT.
// variant: 'primary' (cyan) · 'dark' (oscuro con texto cyan) · 'ghost' (contorno)
// Con href se renderiza <a>; los enlaces externos se abren en otra pestaña.
export default function Button({ href, variant = 'primary', size, icon, iconRight, children, className = '', ...rest }) {
  const cls = ['btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className].filter(Boolean).join(' ');
  const content = (
    <>
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
      {iconRight && <Icon name={iconRight} size={18} />}
    </>
  );
  if (href) {
    const external = /^(https?:|mailto:)/.test(href);
    return (
      <a className={cls} href={href} {...(external && { target: '_blank', rel: 'noopener noreferrer' })} {...rest}>
        {content}
      </a>
    );
  }
  return <button type="button" className={cls} {...rest}>{content}</button>;
}
