import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { SOCIALS as DEFAULT_SOCIALS } from '../config.js';
import { TOOLS as LOCAL_TOOLS } from './tools.js';
import { TUTORIALS as LOCAL_TUTORIALS, PLATFORM_LABEL } from './tutorials.js';
import { SAMPLE_ITEMS, MEDIA_PLATFORMS } from './sample.js';

// =====================================================================
// CONTENIDOS DE BATBOX
// Fuente principal: Supabase (bb_content + bb_content_body, migración 001).
// RLS decide qué ve cada uno: el enlace de lo "club" solo llega a miembros.
// Si las tablas todavía no existen o falla la red, se usan los datos
// locales (tools.js / tutorials.js) para que la web nunca quede vacía.
// Videos, recursos y novedades muestran ejemplos hasta que haya reales.
// =====================================================================

const Ctx = createContext(null);

// Solo en `npm run dev`: ?simular=admin&simdb usa los datos locales como si
// vinieran de Supabase, para probar el panel admin sin la migración.
const SIM_DB = import.meta.env.DEV && new URLSearchParams(window.location.search).has('simdb');
function simRows() {
  return [...LOCAL_TOOLS.map((t) => ({ ...t, kind: 'tool', title: t.name })), ...LOCAL_TUTORIALS].map((x, i) => ({
    ...x, dbId: 'sim-' + i, pubStatus: i === 4 ? 'draft' : 'published', sortOrder: (i + 1) * 10, hasBody: true,
    rawYoutubeId: x.youtubeId || (x.url?.match(/[?&]v=([^&]+)/) || [])[1] || null, embeddable: x.platform !== 'youtube' || !!x.youtubeId, body: '',
  }));
}
const SAMPLE_KINDS = ['resource', 'news'];
// Módulo Multimedia eliminado (2026-10-21): los videos no se muestran en ningún lado.
const HIDDEN_KINDS = ['video'];

function mapRow(r) {
  const b = (Array.isArray(r.bb_content_body) ? r.bb_content_body[0] : r.bb_content_body) || null;
  const platformLabel = r.kind === 'video' ? MEDIA_PLATFORMS[r.platform]?.label : PLATFORM_LABEL[r.platform];
  return {
    id: r.slug, dbId: r.id, kind: r.kind,
    title: r.title, name: r.title, description: r.description, category: r.category,
    access: r.access, pubStatus: r.status, featured: r.featured, sortOrder: r.sort_order,
    platform: r.platform, platformLabel, thumb: r.thumb_url,
    icon: r.icon || 'box', status: r.tool_status || 'available',
    date: r.kind === 'news' || r.kind === 'video' ? r.published_at?.slice(0, 10) : undefined,
    // Cuerpo (null si RLS no lo deja ver: contenido club sin membresía)
    hasBody: !!b,
    url: b?.url ?? null,
    youtubeId: b && b.embeddable !== false ? b.youtube_id : null,
    rawYoutubeId: b?.youtube_id ?? null,
    instagramCode: b?.instagram_code ?? null,
    embeddable: b?.embeddable ?? true,
    body: b?.body ?? '',
    sample: false,
  };
}

const LOCAL = {
  tools: LOCAL_TOOLS.map((t) => ({ ...t, title: t.name, hasBody: true, pubStatus: 'published' })),
  items: [...LOCAL_TUTORIALS.map((t) => ({ ...t, hasBody: true, pubStatus: 'published' })), ...SAMPLE_ITEMS],
};

export function ContentProvider({ children }) {
  const { user, access } = useAuth();
  const [state, setState] = useState({ loading: true, source: 'local', rows: [], settings: {}, error: null });
  // Cantidades públicas de likes/dislikes/comentarios (migración 003). Vacío si no existe.
  const [stats, setStats] = useState({});
  const [statsVersion, setStatsVersion] = useState(0);
  const reloadStats = useCallback(() => setStatsVersion((v) => v + 1), []);
  useEffect(() => {
    let cancelled = false;
    sb.rpc('bb_content_stats').then(({ data, error }) => {
      if (!cancelled && error && SIM_DB) {
        setStats(Object.fromEntries(simRows().map((r, i) => [r.dbId, { content_id: r.dbId, likes: (i * 7) % 12, dislikes: i % 3 === 0 ? 1 : 0, comments: i % 4 }])));
        return;
      }
      if (cancelled || error || !data) return;
      setStats(Object.fromEntries(data.map((r) => [r.content_id, r])));
    });
    return () => { cancelled = true; };
  }, [statsVersion]);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (access === 'loading') return undefined;
    let cancelled = false;
    (async () => {
      const [c, s] = await Promise.all([
        sb.from('bb_content').select('*, bb_content_body(*)')
          .order('sort_order', { ascending: true }).order('published_at', { ascending: false, nullsFirst: false }),
        sb.from('bb_settings').select('key, value'),
      ]);
      if (cancelled) return;
      if (c.error && SIM_DB) {
        setState({ loading: false, source: 'db', rows: simRows(), settings: {}, error: null });
        return;
      }
      if (c.error) {
        console.warn('[BATBOX] contenidos desde Supabase no disponibles, uso datos locales:', c.error.message);
        setState({ loading: false, source: 'local', rows: [], settings: {}, error: c.error });
        return;
      }
      setState({
        loading: false, source: 'db', rows: c.data.map(mapRow),
        settings: Object.fromEntries((s.data || []).map((x) => [x.key, x.value])), error: null,
      });
    })();
    return () => { cancelled = true; };
  }, [user?.id, access, version]);

  const value = useMemo(() => {
    let tools, items;
    if (state.source === 'db') {
      const pub = state.rows.filter((r) => r.pubStatus === 'published');
      tools = pub.filter((r) => r.kind === 'tool');
      items = pub.filter((r) => r.kind !== 'tool');
      // Ejemplos solo para tipos que todavía no tienen contenido real.
      for (const k of SAMPLE_KINDS) {
        if (!items.some((i) => i.kind === k)) items = items.concat(SAMPLE_ITEMS.filter((i) => i.kind === k));
      }
    } else {
      ({ tools, items } = LOCAL);
    }
    items = items.filter((i) => !HIDDEN_KINDS.includes(i.kind));
    const socials = Array.isArray(state.settings.socials) ? state.settings.socials : DEFAULT_SOCIALS;
    return {
      ...state,
      tools,
      items,
      all: [...tools, ...items],
      usingSamples: items.some((i) => i.sample),
      byKind: (kind) => (kind === 'tool' ? tools : items.filter((i) => i.kind === kind)),
      findItem: (slug) => items.find((i) => i.id === slug),
      socials,
      adminRows: state.rows, // incluye borradores (solo llegan si sos admin o editor, por RLS)
      reload,
      statsOf: (dbId) => (dbId ? stats[dbId] : undefined),
      interactionsEnabled: Object.keys(stats).length > 0,
      reloadStats,
    };
  }, [state, reload, stats, reloadStats]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useContent() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useContent fuera de ContentProvider');
  return ctx;
}

export const newest = (list) => [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
