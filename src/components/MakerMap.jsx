import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Mapa de ciudades con makers (Leaflet + teselas de OpenStreetMap, con su atribución).
// Solo dibuja los puntos de CIUDAD del catálogo: nunca hay coordenadas de personas.
export default function MakerMap({ places, selectedId, onSelect }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const cb = useRef(onSelect);
  cb.current = onSelect;

  useEffect(() => {
    const m = L.map(el.current, { center: [-38.4, -63.6], zoom: 4, minZoom: 2, worldCopyJump: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    layer.current.clearLayers();
    const bounds = [];
    for (const p of places) {
      if (p.lat == null || p.lng == null) continue;
      const has = p.makers > 0;
      const sel = p.id === selectedId;
      const c = L.circleMarker([Number(p.lat), Number(p.lng)], {
        radius: has ? Math.min(10 + p.makers * 2, 28) : 5, weight: sel ? 3 : 1.5,
        color: sel ? '#F78EB6' : has ? '#5DDADB' : '#94a3b8', fillColor: has ? '#8B5CF6' : '#334155', fillOpacity: has ? 0.75 : 0.5,
      }).addTo(layer.current);
      c.bindTooltip(`${p.city}${has ? ` · ${p.makers}` : ''}`, { direction: 'top' });
      c.on('click', () => cb.current(p));
      if (has) bounds.push([Number(p.lat), Number(p.lng)]);
    }
    if (bounds.length > 1) map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
  }, [places, selectedId]);

  return <div ref={el} className="mm-map" role="application" aria-label="Mapa de makers por ciudad" />;
}
