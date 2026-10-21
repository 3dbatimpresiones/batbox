import { useEffect, useState } from 'react';

// Router mínimo por hash (#/academy, #/ver/id, #/buscar?q=pla).
// GitHub Pages no sabe resolver rutas de SPA; con # nunca hay 404.

function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return {
    path: path || '/',
    parts: path.split('/').filter(Boolean),
    query: Object.fromEntries(new URLSearchParams(qs)),
  };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(to) {
  window.location.hash = to;
}

export function currentRoute() {
  return window.location.hash.replace(/^#/, '') || '/';
}
