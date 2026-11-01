import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../lib/communityApi.js';
import Icon from './Icon.jsx';
import { Avatar } from './Community.jsx';
import { Empty } from './ui.jsx';
import { BadgeImg } from './Badge.jsx';
import { Nm } from './Featured.jsx';

// Tarjetas y cuadrícula de la Galería Maker. La foto es la protagonista.
// Se usan en #/galeria y en la pestaña "Mis creaciones" de los perfiles.

// Portada con pasada automática de fotos (carrusel) cuando el proyecto tiene varias.
function Cover({ media, seed }) {
  const urls = (media || []).map((m) => api.imageUrl(m.path));
  const [i, setI] = useState(0);
  const n = urls.length;
  useEffect(() => {
    if (n < 2) return undefined;
    let t;
    const start = setTimeout(() => { t = setInterval(() => { if (document.visibilityState === 'visible') setI((x) => (x + 1) % n); }, 3200); }, (seed % 7) * 350);
    return () => { clearTimeout(start); clearInterval(t); };
  }, [n, seed]);
  if (n === 0) return <div className="ga-nocover"><Icon name="image" size={30} /></div>;
  return (
    <>
      {urls.map((u, k) => <img key={u} src={u} alt="" loading={k === 0 ? 'lazy' : 'lazy'} decoding="async" className={'ga-slide' + (k === i ? ' on' : '')} />)}
      {n > 1 && <span className="ga-dots" aria-hidden="true">{urls.map((u, k) => <i key={u} className={k === i ? 'on' : ''} />)}</span>}
    </>
  );
}

export function GalleryCard({ p, author, compact }) {
  const seed = [...String(p.id)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <a className={'ga-card' + (compact ? ' compact' : '')} href={'#/galeria/p/' + p.id}>
      <div className="ga-cover">
        <Cover media={p.media} seed={seed} />
        <div className="ga-badges">
          {p.week_pick && <span className="chip club"><Icon name="trophy" size={11} /> Proyecto de la semana</span>}
          {p.pick && !p.week_pick && <span className="chip cat"><Icon name="star" size={11} /> Selección 3DBAT</span>}
          {p.status === 'draft' && <span className="chip sample">Borrador</span>}
          {p.state === 'wip' && <span className="chip muted">En desarrollo</span>}
        </div>
        {p.media?.length > 1 && <span className="ga-count"><Icon name="image" size={12} /> {p.media.length}</span>}
      </div>
      <div className="ga-info">
        <h3>{p.title}</h3>
        <div className="ga-meta">
          <span className="ga-author"><Avatar author={author} size={20} uid={p.user_id} /> <Nm uid={p.user_id}>{author?.name || 'Maker'}</Nm></span>
          <span className="ga-stats"><span title="Reacciones">♥ {p.reaction_count}</span><span title="Comentarios"><Icon name="message" size={12} /> {p.comment_count}</span></span>
        </div>
        {!compact && p.category_name && <span className="chip muted">{p.category_name}</span>}
      </div>
    </a>
  );
}

// Cuadrícula con carga progresiva. `filters` = { q, category, sort, state, author, saved, featured, drafts }.
export function GalleryGrid({ filters, limit = 12, empty, compact, bare }) {
  const [items, setItems] = useState([]);
  const [authors, setAuthors] = useState({});
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const key = JSON.stringify(filters);

  const load = useCallback(async (reset, from) => {
    const my = ++seq.current;
    if (reset) setLoading(true);
    try {
      const res = await api.galleryList({ ...filters, limit, offset: reset ? 0 : from });
      if (my !== seq.current) return;
      setItems((cur) => (reset ? res.items : [...cur, ...res.items.filter((x) => !cur.some((c) => c.id === x.id))]));
      setAuthors((a) => ({ ...a, ...res.authors }));
      setDone(res.items.length < limit); setError('');
    } catch (e) { if (my === seq.current) setError(e.missing ? 'La Galería Maker todavía no está instalada en la base (falta la migración 049).' : e.message); }
    finally { if (my === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, limit]);
  useEffect(() => { load(true, 0); }, [load]);

  if (loading) return <div className="empty"><div className="spinner" /></div>;
  if (error) return <div className="gate card gate-wide"><p>{error}</p><button type="button" className="btn ghost" onClick={() => load(true, 0)}><Icon name="refresh" size={16} /> Reintentar</button></div>;
  if (items.length === 0) return bare ? null : empty || <Empty icon="image" title="No encontramos proyectos" text="Probá con otros filtros o publicá el tuyo." />;
  return (
    <>
      <div className={'ga-grid' + (compact ? ' compact' : '')}>{items.map((p) => <GalleryCard key={p.id} p={p} author={authors[p.user_id]} compact={compact} />)}</div>
      {!done && <div className="cm-sentinel"><button type="button" className="btn ghost" onClick={() => load(false, items.length)}>Ver más</button></div>}
    </>
  );
}

// Confeti decorativo (solo CSS, sin librerías). Valores fijos para que no cambie en cada render.
const CONFETTI_COLORS = ['#F78EB6', '#5DDADB', '#8B5CF6', '#3B82F6', '#ffffff'];
const CONFETTI = Array.from({ length: 80 }, (_, i) => ({
  left: `${(i * 37 + 7) % 101}%`, background: CONFETTI_COLORS[i % 5], animationDelay: `${((i * 53) % 70) / 10}s`,
  animationDuration: `${5 + ((i * 29) % 40) / 10}s`, transform: `rotate(${(i * 47) % 360}deg)`, width: `${6 + (i % 3) * 2}px`, height: `${9 + (i % 4) * 2}px`,
  borderRadius: i % 3 === 0 ? '50%' : '2px',
}));

// "Maker destacado de la semana" para el Inicio. Solo aparece a miembros, con la Galería activa y un proyecto elegido por el equipo.
export function WeekMakerBlock({ isMember, isAdmin }) {
  const flags = api.useCommunityFlags();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const on = isMember && !!flags?.batgallery;
  useEffect(() => { if (on) api.galleryList({ featured: 'week_pick', limit: 1 }).then(setData).catch(() => setData(null)); }, [on]);
  const p = data?.items?.[0];
  if (!on || !p) return null;
  const author = data.authors[p.user_id];
  const caption = `🏆 Maker destacado de la semana en BATBOX: ${author?.name || 'un maker de la comunidad'}\n\n"${p.title}"${p.machine ? `\n🖨️ ${p.machine}` : ''}${p.material ? ` · ${p.material}` : ''}\n\nSumate a la comunidad Makers 3DBAT y mostrá lo que hacés. #3DBAT #BATBOX #maker`;
  const copy = async () => { try { await navigator.clipboard.writeText(caption); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* sin portapapeles */ } };
  return (
    <section className="block ga-weekblock">
      <div className="ga-confetti" aria-hidden="true">{CONFETTI.map((c, i) => <i key={i} style={c} />)}</div>
      <h2 className="ga-weekbanner"><i className="ln" /><Icon name="trophy" size={26} /><span>MAKER DESTACADO DE LA SEMANA</span><Icon name="trophy" size={26} /><i className="ln" /></h2>
      <div className="ga-weekgrid">
        <div className="ga-weekcard">
          <GalleryCard p={p} author={author} />
          {isAdmin && <button type="button" className="btn ghost" onClick={copy}><Icon name="instagram" size={16} /> {copied ? 'Texto copiado' : 'Copiar texto para Instagram'}</button>}
        </div>
        <div className="ga-weekright">
        <aside className="ga-weeknote" aria-label="Sobre el maker destacado de la semana">
          <h3><Icon name="sparkles" size={16} /> ¿Qué es esto?</h3>
          <p>Cada semana el equipo de 3DBAT elige una creación de la Galería Maker para ponerla en el Inicio de BATBOX, donde la ve toda la comunidad.</p>
          <h3><Icon name="star" size={16} /> ¿Por qué aparece acá?</h3>
          <p>Porque su autor compartió un proyecto que nos pareció destacable por su calidad, su ingenio o lo bien documentado que está.</p>
          <h3><Icon name="image" size={16} /> ¿Cómo aparecer?</h3>
          <ul>
            <li>Publicá tu proyecto en la <a href="#/galeria/nuevo">Galería Maker</a>.</li>
            <li>Subí buenas fotos y sumá los datos técnicos (máquina, material, parámetros).</li>
            <li>Contá cómo lo hiciste: los proyectos bien explicados se notan.</li>
          </ul>
          <h3><Icon name="trophy" size={16} /> ¿Qué beneficios tiene?</h3>
          <ul>
            <li>Tu proyecto en el Inicio de BATBOX durante la semana.</li>
            <li>Posibilidad de que lo presentemos en las redes de 3DBAT.</li>
            <li>La <b>insignia de Maker destacado de la semana</b>, que queda en tu perfil para siempre y se suma cada vez que volvés a ganar.</li>
          </ul>
        </aside>
        <div className="ga-cta">
          <div><b>¿Tenés algo para mostrar?</b><small>La próxima semana el destacado puede ser tu proyecto.</small></div>
          <a className="btn primary ga-cta-btn" href="#/galeria/nuevo"><Icon name="trophy" size={18} /> ¡Quiero ser Maker destacado!</a>
          <a className="btn ghost" href="#/galeria">Ver galería</a>
        </div>
        </div>
      </div>
    </section>
  );
}
