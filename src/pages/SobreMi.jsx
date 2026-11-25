import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import Hero from '../sobremi/components/sections/Hero.jsx';
import StatsBand from '../sobremi/components/sections/StatsBand.jsx';
import AboutMe from '../sobremi/components/sections/AboutMe.jsx';
import css from '../sobremi/sobremi.css?inline';

// Pestaña "Sobre mí" (#/sobre-mi): la portada que antes estaba en 3dbat.com.ar
// (presentación, impresora animada, la comunidad en números y quién está detrás de 3DBAT).
// Se dibuja dentro de un Shadow DOM: sus estilos (.hero, .card, .btn…) no se mezclan con BATBOX.
export default function SobreMi() {
  const host = useRef(null);
  useEffect(() => {
    const el = host.current;
    const shadow = el.shadowRoot || el.attachShadow({ mode: 'open' });
    shadow.replaceChildren();
    const style = document.createElement('style');
    style.textContent = css;
    const mount = document.createElement('div');
    shadow.append(style, mount);
    const root = createRoot(mount);
    root.render(<><Hero /><StatsBand /><AboutMe /></>);
    return () => { setTimeout(() => root.unmount(), 0); };
  }, []);
  return <div ref={host} className="sobremi-host" />;
}
