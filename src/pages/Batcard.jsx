import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../styles/batcard.css';
import portada from '../assets/batcard-portada.webp';
import Plasma from '../components/batcard/Plasma.jsx';
import Card, { CardBack } from '../components/batcard/Card.jsx';
import { sfx, setAudio, unlockAudio } from '../components/batcard/sfx.js';
import { confetti, burstAt, popText, shake, music, TRACKS, flashScreen } from '../components/batcard/juice.js';
import { newGame, step, preview, blindInfo, validateSave, LOTS } from '../lib/batcard/game.js';
import { MODS, MOD, CALIBRATIONS, CAL, PROFILES, PROF, BOSSES, BOSS, RULES, TARGETS, BLIND_NAMES, MIN_DECK, MATERIALS, SPOOLS, PACKS, SEALS, SEAL_CALS, INTEREST } from '../lib/batcard/catalog.js';
import { PATTERN, PATTERNS, SUITS, SUIT_IDS } from '../lib/batcard/hands.js';
import { fmtMult } from '../lib/batcard/score.js';
import { newSeed } from '../lib/batcard/rng.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { sb } from '../lib/supabase.js';
import { useBatcardPresence, useLive } from '../lib/mtApi.js';

// =====================================================================
// #/batcard — BATCARD · Un juego de 3DBAT IMPRESIONES.
// Roguelike de cartas. Motor puro en src/lib/batcard/; acá solo presentación.
// Gratis para todos. Con sesión de Google la semilla la da el servidor y la partida entra al ranking (verificada).
// =====================================================================

const K_SAVE = 'batcard.save', K_SET = 'batcard.ajustes', K_REC = 'batcard.record', K_TUTO = 'batcard.tutorial';
const ls = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
};
const DEF_SET = { crt: 'completo', motion: 'auto', flashes: true, vol: 0.6, music: 0.35, track: 'synthwave', mute: false, speed: 'normal' };
const SPEED = { normal: 320, rapida: 120 };

function useSettings() {
  const [s, setS] = useState(() => ({ ...DEF_SET, ...(ls.get(K_SET) || {}) }));
  useEffect(() => { ls.set(K_SET, s); setAudio(s.vol, s.mute); music.setTrack(s.track); music.setVolume(s.mute ? 0 : s.music); }, [s]);
  const sysReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Solo se reduce si el jugador lo elige en el juego: con 'reducir animaciones' de Windows el juego quedaba casi sin vida.
  const reduced = s.motion === 'reducido' || (s.motion === 'auto' && sysReduced && false);
  return [s, (patch) => setS((p) => ({ ...p, ...patch })), reduced];
}

// Pantalla completa real del navegador (oculta barras en Android, iPad y PC). Tiene que pedirse dentro del toque.
const canFull = () => typeof document !== 'undefined' && !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function enterFull() {
  if (!canFull() || isFull()) return;
  const el = document.documentElement;
  try { const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } catch { /* no soportado */ }
  try { screen.orientation?.lock?.('portrait').catch(() => {}); } catch { /* opcional */ }
}
function exitFull() {
  if (!isFull()) return;
  try { const r = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (r && r.catch) r.catch(() => {}); } catch { /* nada */ }
}
const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

// ---------- App instalable (webapp) ----------
// Mientras BATCARD está abierto se declara su propio manifiesto (pantalla completa, ícono propio),
// así "Instalar" instala BATCARD y no todo BATBOX. Al salir se restaura lo anterior.
let installEvt = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; window.dispatchEvent(new Event('bc-install-ready')); });
}
const isStandalone = () => typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function usePwaHead() {
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/batbox/';
    const added = [];
    const add = (tag, attrs) => { const el = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); el.dataset.batcard = '1'; document.head.appendChild(el); added.push(el); };
    const prevManifest = document.querySelector('link[rel="manifest"]:not([data-batcard])');
    if (prevManifest) prevManifest.setAttribute('rel', 'x-manifest-off');
    add('link', { rel: 'manifest', href: base + 'batcard-manifest.json' });
    add('link', { rel: 'apple-touch-icon', href: base + 'batcard-180.png' });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'BATCARD' });
    add('meta', { name: 'theme-color', content: '#090B20' });
    return () => { added.forEach((el) => el.remove()); if (prevManifest) prevManifest.setAttribute('rel', 'manifest'); };
  }, []);
}
function InstallButton() {
  const [ready, setReady] = useState(!!installEvt);
  const [help, setHelp] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { const f = () => setReady(true); window.addEventListener('bc-install-ready', f); window.addEventListener('appinstalled', () => setDone(true)); return () => window.removeEventListener('bc-install-ready', f); }, []);
  if (isStandalone() || done) return null;
  const ios = isIOS();
  if (!ready && !ios) return null;
  const install = async () => {
    if (ios) { setHelp(true); return; }
    installEvt.prompt();
    const r = await installEvt.userChoice.catch(() => null);
    if (r?.outcome === 'accepted') setDone(true);
    installEvt = null; setReady(false);
  };
  return (
    <>
      <button className="bc-btn bc-install" onClick={install}>📲 Instalar BATCARD <small>como app, a pantalla completa</small></button>
      {help && createPortal(
        <div className="bc-root bc-modal" role="dialog" aria-modal="true" aria-label="Instalar en iPhone o iPad" onClick={() => setHelp(false)}>
          <div className="bc-panel bc-help" onClick={(e) => e.stopPropagation()}>
            <div className="bc-row"><h2>Instalar BATCARD</h2><button className="bc-btn small" onClick={() => setHelp(false)}>Listo</button></div>
            <p>En iPhone y iPad se instala desde Safari:</p>
            <ol className="bc-list">
              <li>Tocá el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>
              <li>Elegí <b>Agregar a pantalla de inicio</b>.</li>
              <li>Tocá <b>Agregar</b>. Te queda el ícono de BATCARD y se abre a pantalla completa.</li>
            </ol>
            <p className="muted">Tu cuenta de Google funciona igual dentro de la app: ingresás una vez y queda guardada.</p>
          </div>
        </div>, document.body)}
    </>
  );
}

function loadSave() {
  const raw = ls.get(K_SAVE);
  if (!raw) return { save: null, problem: null };
  const why = validateSave(raw);
  if (why) return { save: null, problem: why };
  return { save: raw, problem: null };
}

export default function Batcard() {
  const [set, patch, reduced] = useSettings();
  const [screen, setScreen] = useState('menu');
  const [{ save, problem }, setSaveInfo] = useState(loadSave);
  const [st, setSt] = useState(null);
  const [mood, setMood] = useState('normal'); // color del fondo: lo decide lo que se VE (no se adelanta al resultado)
  // La música arranca con la primera interacción (los navegadores lo exigen) y se corta al salir.
  useEffect(() => {
    // iPad/Safari: el audio se habilita al SOLTAR el dedo (touchend) o con click, no al apoyarlo.
    const go = () => { unlockAudio(); if (!set.mute && set.music > 0) music.start(); };
    const evs = ['touchend', 'click', 'keydown'];
    evs.forEach((e) => window.addEventListener(e, go, { passive: true }));
    return () => { evs.forEach((e) => window.removeEventListener(e, go)); music.stop(); };
  }, [set.mute, set.music]);
  useEffect(() => {
    const lv = screen !== 'juego' || !st || st.phase !== 'round' ? 0 : st.round?.boss || st.round?.heat >= 5 ? 2 : 1;
    music.setLevel(lv);
  }, [screen, st]);
  const fxOn = !reduced && set.flashes;
  usePwaHead();
  // En partida el juego ocupa toda la pantalla (sin scroll de la página).
  useEffect(() => {
    if (screen !== 'juego') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [screen]);
  useBatcardPresence(screen === 'juego');

  const start = (s) => { setSt(s); setScreen('juego'); };
  const { simulated, signIn, user } = useAuth();
  const canRank = !!user && !simulated;
  const [starting, setStarting] = useState(false);
  // Con sesión: la semilla la da el servidor y la partida entra al ranking.
  const nueva = async () => {
    if (isTouch()) enterFull(); // en celular/tablet, pantalla completa al empezar
    ls.del(K_SAVE);
    if (!canRank) { start(newGame(newSeed())); return; }
    setStarting(true);
    const { data, error } = await sb.rpc('bb_bc_start');
    setStarting(false);
    if (error || !data) { start({ ...newGame(newSeed()), rankNote: error?.message || 'Sin conexión con el ranking.' }); return; }
    start({ ...newGame(data), ranked: true });
  };
  const continuar = () => { if (!save) return; if (isTouch()) enterFull(); start(save); };
  const aparcar = () => { exitFull(); setSaveInfo(loadSave()); setScreen('menu'); };
  const descartarRoto = () => { ls.set(K_SAVE + '.roto', ls.get(K_SAVE)); ls.del(K_SAVE); setSaveInfo({ save: null, problem: null }); };

  return (
    <div className={`bc-root crt-${set.crt}${reduced ? ' reduced' : ''}${set.flashes ? '' : ' noflash'}${screen === 'juego' ? ' bc-full' : ''}`}>
      <div className="bc-stage">
        <Plasma still={set.motion === 'reducido'} mood={screen === 'juego' ? mood : 'normal'} />
        <div className="bc-crt" aria-hidden="true" />
        <Crack />
        <div className="bc-glitch" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="bc-static" aria-hidden="true" />
        <div className="bc-content">
          {screen === 'menu' && (
            <Menu save={save} problem={problem} canRank={canRank} logged={!!user} signIn={signIn} starting={starting} onNew={nueva} onCont={continuar} onDropBad={descartarRoto} go={setScreen} />
          )}
          {screen === 'coleccion' && <Coleccion back={() => setScreen('menu')} />}
          {screen === 'ajustes' && <Ajustes set={set} patch={patch} back={() => setScreen(st ? 'juego' : 'menu')} />}
          {screen === 'juego' && st && (
            <Juego st={st} setSt={setSt} setMood={setMood} set={set} patch={patch} speed={SPEED[set.speed]} reduced={reduced} fxOn={fxOn}
              onMenu={aparcar} onAjustes={() => setScreen('ajustes')} onNew={nueva} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Grieta pixel art (solo en el fondo)
// Se dibuja en la misma grilla de 192×108 del fondo: cada trazo se rasteriza en píxeles (Bresenham)
// y se pinta en 3 capas, rosa y celeste corridos un píxel y núcleo blanco (desregistro neón del juego).
const CW = 192, CH = 108;
function buildCrack() {
  let z = 11;
  const rnd = () => { z = (z * 16807) % 2147483647; return (z - 1) / 2147483646; };
  const cx = 122, cy = 40, N = 13;
  const cells = new Map(); // "x,y" -> peso (1 = trazo fino, 2 = núcleo)
  const plot = (x, y, w) => { if (x < 0 || y < 0 || x >= CW || y >= CH) return; const k = x + ',' + y; cells.set(k, Math.max(cells.get(k) || 0, w)); };
  const line = (x0, y0, x1, y1, w) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) { plot(x0, y0, w); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  };
  const ends = [];
  for (let k = 0; k < N; k++) {
    const ang = (k / N) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const len = 50 + rnd() * 90, steps = 6 + Math.floor(rnd() * 4);
    let px = cx, py = cy; const pts = [];
    for (let j = 1; j <= steps; j++) {
      const r = (len * j) / steps, jit = (rnd() - 0.5) * 0.35;
      const x = cx + Math.cos(ang + jit) * r * 1.3, y = cy + Math.sin(ang + jit) * r * 0.75;
      line(px, py, x, y, j < 3 ? 2 : 1); pts.push([x, y]);
      if (j > 1 && rnd() < 0.35) { const ba = ang + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.6), bl = 5 + rnd() * 14; line(x, y, x + Math.cos(ba) * bl, y + Math.sin(ba) * bl * 0.7, 1); }
      px = x; py = y;
    }
    ends.push(pts);
  }
  const shards = [];
  for (const ri of [1, 3]) for (let k = 0; k < N; k++) {
    if (rnd() < 0.3) continue;
    const p1 = ends[k][Math.min(ri, ends[k].length - 1)], p2 = ends[(k + 1) % N][Math.min(ri, ends[(k + 1) % N].length - 1)];
    line(p1[0], p1[1], p2[0], p2[1], 1);
    if (ri === 1 && rnd() < 0.55) shards.push([[cx, cy], p1, p2]);
  }
  // Astillas: relleno con tramado (dither) de 1 de cada 2 píxeles, oscuro
  const dither = [];
  for (const [[ax, ay], [bx, by], [qx, qy]] of shards) {
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, qx))), maxX = Math.min(CW - 1, Math.ceil(Math.max(ax, bx, qx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, qy))), maxY = Math.min(CH - 1, Math.ceil(Math.max(ay, by, qy)));
    const side = (x1, y1, x2, y2, x, y) => (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      if ((x + y) % 2) continue;
      const s1 = side(ax, ay, bx, by, x, y), s2 = side(bx, by, qx, qy, x, y), s3 = side(qx, qy, ax, ay, x, y);
      if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) dither.push([x, y]);
    }
  }
  // Píxeles muertos: bloques sueltos de colores fuertes
  const dead = Array.from({ length: 9 }, (_, i) => [Math.floor(rnd() * CW), Math.floor(rnd() * CH), ['#24DCFF', '#FF39B8', '#E2B13C', '#ffffff'][i % 4], 1 + Math.floor(rnd() * 2)]);
  const pts = [...cells.entries()].map(([k, w]) => { const [x, y] = k.split(',').map(Number); return [x, y, w]; });
  return { pts, dither, dead, cx, cy };
}
const CRACK = buildCrack();
function Crack() {
  const { pts, dither, dead, cx, cy } = CRACK;
  return (
    <svg className="bc-crack" viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges" aria-hidden="true">
      <g fill="rgba(5,6,20,.55)">{dither.map(([x, y], i) => <rect key={i} x={x} y={y} width="1" height="1" />)}</g>
      <g fill="#FF39B8" opacity=".8">{pts.map(([x, y], i) => <rect key={i} x={x + 1} y={y} width="1" height="1" />)}</g>
      <g fill="#24DCFF" opacity=".8">{pts.map(([x, y], i) => <rect key={i} x={x - 1} y={y} width="1" height="1" />)}</g>
      <g fill="#F5E9DB">{pts.map(([x, y, w], i) => <rect key={i} x={x} y={y} width="1" height="1" opacity={w > 1 ? 1 : 0.8} />)}</g>
      <rect x={cx - 2} y={cy - 2} width="5" height="5" fill="#ffffff" />
      <rect x={cx - 1} y={cy - 1} width="3" height="3" fill="#24DCFF" />
      {dead.map(([x, y, c, sz], i) => <rect key={'d' + i} className="bc-dead" x={x} y={y} width={sz} height={sz} fill={c} />)}
    </svg>
  );
}

// ---------------------------------------------------------------- Menú
// Gente jugando ahora (mismo contador en vivo que Maker Tycoon; se actualiza solo).
function LiveChip() {
  const live = useLive();
  if (!live || live.batcard == null) return null;
  const n = Math.max(1, live.batcard); // vos estás jugando
  return <span className="bc-pill bc-live" title={`${live.online} makers en BATBOX ahora`}><i /> {n} {n === 1 ? 'jugando' : 'jugando'} ahora</span>;
}

function Menu({ save, problem, canRank, logged, signIn, starting, onNew, onCont, onDropBad, go }) {
  const rec = ls.get(K_REC);
  return (
    <div className="bc-menu">
      <LiveChip />
      <img className="bc-cover" src={portada} alt="BATCARD: la A del título es un alicate de corte al ras. Un juego de 3DBAT IMPRESIONES." />
      <h1 className="sr-only">BATCARD · Un juego de 3DBAT IMPRESIONES</h1>
      <p className="bc-tag">Cada partida es una orden de producción. Armá combinaciones, mejorá tu taller y pasá los controles de calidad.</p>
      {problem && (
        <div className="bc-alert" role="alert">
          No se pudo recuperar tu partida guardada ({problem}). No la borramos: podés descartarla y empezar otra.
          <button className="bc-btn small" onClick={onDropBad}>Descartar guardado</button>
        </div>
      )}
      <div className="bc-menu-btns">
        {save && <button className="bc-btn primary" onClick={onCont}>Continuar <small>Lote {save.lot + 1} · {BLIND_NAMES[save.blind]}{save.ranked ? ' · cuenta para el ranking' : ''}</small></button>}
        <button className={`bc-btn${save ? '' : ' primary'}`} disabled={starting} onClick={() => { if (!save || confirm('Empezar otra partida reemplaza la guardada. ¿Seguimos?')) onNew(); }}>{starting ? 'Preparando…' : 'Nueva partida'}</button>
        <button className="bc-btn" onClick={() => go('coleccion')}>Colección</button>
        <button className="bc-btn" onClick={() => go('ajustes')}>Ajustes</button>
      </div>
      <InstallButton />
      {rec && <p className="bc-rec">Récord: {rec.won ? 'orden completa' : `Lote ${rec.lot}`} · mejor mano {rec.best.toLocaleString('es-AR')} Calidad</p>}
      <p className="bc-foot">{canRank
        ? <>🏆 Estás en el <b>ranking</b>: cada partida entra al ranking <b>cuando termina</b> (ganes o pierdas). <a href="#/juego?juego=batcard&ver=ranking">Ver ranking</a></>
        : <>Gratis y sin límites, con o sin cuenta. <button className="bc-mini" onClick={() => signIn()}>Ingresá con Google</button> (la misma cuenta de BATBOX) para entrar al <a href="#/juego?juego=batcard&ver=ranking">ranking</a>.</>}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Juego
function Juego({ st, setSt, setMood, set, patch, speed, reduced, fxOn, onMenu, onAjustes, onNew }) {
  const [rolled, setRolled] = useState(null); // contador que sube rodando
  const [banner, setBanner] = useState(null);
  const [sel, setSel] = useState([]);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState('');
  const [anim, setAnim] = useState(null); // { prev, last, i }
  const [calPick, setCalPick] = useState(null); // índice de calibración esperando palo
  const [tuto, setTuto] = useState(() => ls.get(K_TUTO) ?? 0);
  const [help, setHelp] = useState(() => (ls.get(K_TUTO) ?? 0) === 0);
  const [fb, setFb] = useState(false);
  const fx = useRef(null);
  // Reparto: cada carta que entra a la mano vuela desde el mazo, una detrás de otra.
  // Cada vez que una carta entra a la mano (aunque ya haya estado antes) sale boca abajo desde el mazo.
  const dealt = useRef(new Map());
  const dealQ = useRef(0);
  const dealDelay = (id) => {
    const now = performance.now();
    let d = dealt.current.get(id);
    if (!d) { const n = dealQ.current++, delay = n * 90; d = { delay, until: now + delay + 900 }; dealt.current.set(id, d); setTimeout(() => sfx.deal(n), delay + 520); }
    return now < d.until ? d.delay : null;
  };
  useEffect(() => { const h = setTimeout(() => { dealQ.current = 0; }, 50); return () => clearTimeout(h); });
  // Las cartas que salieron de la mano se olvidan: si vuelven, se reparten de nuevo desde el mazo.
  useEffect(() => {
    const inHand = new Set(st.round?.hand || []);
    for (const id of [...dealt.current.keys()]) if (!inHand.has(id)) dealt.current.delete(id);
  });
  // Re-render al terminar el reparto para soltar la clase de reparto.
  const [, bump] = useState(0);
  useEffect(() => {
    const left = [...dealt.current.values()].map((d) => d.until - performance.now()).filter((x) => x > 0);
    if (!left.length) return undefined;
    const h = setTimeout(() => bump((n) => n + 1), Math.max(...left) + 20);
    return () => clearTimeout(h);
  });

  // Guardado tras cada transición confirmada (incluye compra y refresco).
  useEffect(() => {
    if (st.phase === 'victory' || st.phase === 'defeat') {
      ls.del(K_SAVE);
      const rec = ls.get(K_REC) || { lot: 0, best: 0, won: false };
      ls.set(K_REC, { lot: Math.max(rec.lot, st.lot + 1), best: Math.max(rec.best, st.stats.bestHand), won: rec.won || st.phase === 'victory' });
    } else ls.set(K_SAVE, st);
  }, [st]);
  useEffect(() => { ls.set(K_TUTO, tuto); }, [tuto]);
  useEffect(() => {
    const root = document.querySelector('.bc-root');
    if (root && st.phase !== 'defeat') root.classList.remove('tv-break', 'tv-broken');
    return () => root?.classList.remove('tv-break', 'tv-broken');
  }, [st.phase]);

  const view = anim ? anim.prev : st;
  const r = view.round;
  const info = blindInfo(view);
  // El fondo cambia según lo que está en pantalla: con la animación del puntaje todavía corriendo no se adelanta el dorado.
  useEffect(() => { setMood(view.phase === 'shop' ? 'shop' : (view.phase === 'round' || view.phase === 'preview') && info.boss ? 'boss' : 'normal'); }, [view.phase, info.boss, setMood]);
  const byId = useMemo(() => Object.fromEntries(view.deck.map((c) => [c.id, c])), [view.deck]);
  // Llega el jefe: golpe grave, destello rojo y cartel.
  const bossKey = view.phase === 'preview' && info.boss ? `${view.lot}-${info.boss}` : '';
  useEffect(() => {
    if (!bossKey) return undefined;
    const h = setTimeout(() => {
      sfx.boss();
      if (fxOn) { flashScreen('#ff2b4a', 600); shake(document.querySelector('.bc-preview'), true); }
      setBanner(`⚠ JEFE: ${BOSS[info.boss].name}`);
      setTimeout(() => setBanner(null), 1700);
    }, 250);
    return () => clearTimeout(h);
  }, [bossKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Créditos: el número salta cuando suben.
  const prevCred = useRef(view.credits);
  const [credPop, setCredPop] = useState(0);
  useEffect(() => { if (view.credits > prevCred.current) setCredPop((n) => n + 1); prevCred.current = view.credits; }, [view.credits]);

  const act = (action, after) => {
    const res = step(st, action);
    if (res.error) { setMsg(res.error); return null; }
    setMsg('');
    setSt(res.state);
    after?.(res);
    return res;
  };

  // Animación por etapas de la traza de puntaje.
  useEffect(() => {
    if (!anim) return undefined;
    const steps = anim.last.trace.length;
    if (anim.i >= steps) {
      // 1) pausa para disfrutar el total, 2) las cartas jugadas salen volando, 3) se cierra la jugada
      if (!anim.leaving) {
        const h0 = setTimeout(() => setAnim((a) => a && { ...a, leaving: true }), reduced ? 200 : 900);
        return () => clearTimeout(h0);
      }
      const h = setTimeout(() => {
        setAnim(null);
        if (st.phase === 'shop' || st.phase === 'victory') {
          const pay = st.lastWin?.pay || 4;
          sfx.win(); setTimeout(() => sfx.cash(Math.min(10, pay)), 450);
          if (fxOn) confetti({ n: st.phase === 'victory' ? 260 : 150, coins: pay * 3 });
          if (st.phase === 'victory' && fxOn) [300, 700, 1100].forEach((d) => setTimeout(() => confetti({ x: Math.random() * innerWidth, n: 120 }), d));
          const w = st.lastWin || {};
          const oneShot = w.left === RULES.prints - 1, over = w.score >= w.target * 2;
          setBanner(st.phase === 'victory' ? '¡ORDEN COMPLETA!' : oneShot ? `¡DE UNA! +${pay}` : over ? `¡SOBRADO! +${pay}` : `¡APROBADO! +${pay}`);
          if ((oneShot || over) && fxOn && st.phase !== 'victory') { flashScreen('#ffd27a', 450); [250, 600].forEach((d) => setTimeout(() => confetti({ x: Math.random() * innerWidth, n: 90, coins: 10 }), d)); }
          setTimeout(() => setBanner(null), 1800);
        }
        if (st.phase === 'defeat') {
          sfx.shatter(); setTimeout(() => sfx.lose(), 1400);
          const root = document.querySelector('.bc-root');
          if (root) { root.classList.remove('tv-break'); void root.offsetWidth; root.classList.add('tv-break', 'tv-broken'); }
        }
      }, reduced ? 120 : 520);
      return () => clearTimeout(h);
    }
    const h = setTimeout(() => {
      const t = anim.last.trace[anim.i];
      const prevT = anim.last.trace[anim.i - 1];
      if (t.phase === 'total') {
        const best = anim.prev.stats.bestHand;
        const big = t.total >= anim.prev.round.target * 0.4 || (best > 0 && t.total > best);
        sfx.tick(10); if (big) sfx.big();
        const scoreEl = document.querySelector('.bc-score-num');
        popText(document.querySelector('.bc-pop-anchor') || scoreEl, `+${t.total.toLocaleString('es-AR')}`, 'total', true); // a la derecha de la cama, donde hay lugar
        if (fxOn) { shake(document.querySelector('.bc-game'), big); if (big) burstAt(scoreEl, { n: 60 }); }
        if (big) { setBanner(best > 0 && t.total > best ? '¡RÉCORD DE MANO!' : '¡GRAN MANO!'); setTimeout(() => setBanner(null), 1300); }
        const from = anim.prev.round.score, to = from + t.total, t0 = performance.now(), dur = reduced ? 1 : 650;
        const roll = (now) => { const k = Math.min(1, (now - t0) / dur); setRolled(Math.round(from + (to - from) * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(roll); else setRolled(null); };
        requestAnimationFrame(roll);
      } else if (t.cardId && t.phase === 'repetir') {
        sfx.snap();
        const el = document.querySelector(`.bc-played [data-cid="${t.cardId}"]`);
        popText(el, '¡OTRA VEZ!', 'mult');
        if (fxOn) shake(el);
      } else if (t.cardId && t.phase === 'sello') {
        sfx.coin();
        popText(document.querySelector(`.bc-played [data-cid="${t.cardId}"]`), '+2 $', 'chips');
      } else if (t.cardId && t.phase === 'material') {
        const isMult = t.text.includes('Mult');
        if (isMult) sfx.mult(); else sfx.tick(anim.i);
        popText(document.querySelector(`.bc-played [data-cid="${t.cardId}"]`), t.text.split(': ')[1].replace(' (+1 Calor)', ''), isMult ? 'mult' : 'chips');
      } else if (t.cardId) {
        sfx.tick(anim.i);
        popText(document.querySelector(`.bc-played [data-cid="${t.cardId}"]`), `+${t.chips - (prevT ? prevT.chips : 0)}`, 'chips');
      } else if (t.modSlot != null) {
        const isMult = t.text.includes('Mult');
        if (isMult) sfx.mult(); else sfx.tick(anim.i);
        const modEl = document.querySelector(`[data-mslot="${t.modSlot}"]`);
        const isX = t.text.includes('×');
        const legend = MOD[view.mods[t.modSlot]]?.legendary;
        popText(modEl, t.text.split(': ')[1], isMult ? 'mult' : 'chips', isX);
        if (isX) { sfx.xmult(); if (fxOn) { flashScreen(legend ? '#ffd27a' : '#FF39B8', legend ? 520 : 300); shake(document.querySelector('.bc-bed'), true); } }
        if (legend) { sfx.legend(); if (fxOn) burstAt(modEl, { n: 60 }); }
        if (fxOn) shake(modEl);
      } else sfx.tick(anim.i);
      setAnim((a) => a && { ...a, i: a.i + 1 });
    }, anim.i === 0 ? 250 : Math.max(speed * 0.45, speed * Math.pow(0.9, anim.i))); // los golpes se aceleran a medida que suman
    return () => clearTimeout(h);
  }, [anim, speed, reduced, st.phase, fxOn]);

  const toggle = (id) => {
    if (anim) return;
    setSel((s) => {
      if (s.includes(id)) { sfx.deselect(); return s.filter((x) => x !== id); }
      if (s.length >= 5) { setMsg('Máximo 5 cartas.'); return s; }
      sfx.select(s.length + 1); return [...s, id];
    });
  };
  const imprimir = () => {
    if (anim || !sel.length) return;
    const prev = st;
    const res = act({ type: 'PLAY', ids: sel, overextrude: over });
    if (!res) return;
    sfx.print();
    setAnim({ prev, last: res.state.last, i: 0 });
    setSel([]); setOver(false);
    if (tuto === 0) setTuto(1);
    if (tuto === 2 && over) setTuto(3);
  };
  const descartar = () => {
    if (anim || !sel.length) return;
    if (act({ type: 'DISCARD', ids: sel })) { sfx.discard(sel.length); setSel([]); if (tuto === 1) setTuto(2); }
  };
  const usarCal = (idx, suit) => {
    const cal = CAL[st.cals[idx]];
    if (cal.target !== 'none' && sel.length !== 1) { setMsg(`Seleccioná exactamente 1 carta de tu mano para usar ${cal.name}.`); return; }
    if (cal.target === 'card+suit' && !suit) { setCalPick(idx); return; }
    if (act({ type: 'USE_CAL', idx, cardId: sel[0], suit })) { sfx.snap(); setCalPick(null); if (cal.id === 'corte_ras') setSel([]); }
  };

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input,select,textarea')) return;
      if (st.phase !== 'round' || anim) return;
      const k = e.key.toLowerCase();
      if (k === 'enter' && e.target.tagName !== 'BUTTON') imprimir();
      else if (k === 'i') imprimir();
      else if (k === 'd') descartar();
      else if (k === 's') setOver((o) => !o);
      else if (k === 'escape') setSel([]);
      else if (/^[1-8]$/.test(k) && st.round.hand[+k - 1]) toggle(st.round.hand[+k - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pv = !anim && st.phase === 'round' ? preview(st, sel, over) : null;
  const canOver = st.phase === 'round' && st.round.heat <= RULES.overLimit;
  const tShown = anim ? anim.last.trace[Math.min(anim.i, anim.last.trace.length) - 1] : null;
  const shownScore = anim ? (anim.i >= anim.last.trace.length ? anim.prev.round.score + anim.last.total : anim.prev.round.score) : r?.score ?? 0;
  const hand = r ? r.hand.filter((id) => !(anim && anim.last.played.includes(id))) : [];
  const litCards = anim ? new Set(anim.last.trace.slice(0, anim.i).filter((t) => t.cardId).map((t) => t.cardId)) : new Set();
  const litMods = anim ? new Set(anim.last.trace.slice(0, anim.i).filter((t) => t.modSlot != null).map((t) => t.modSlot)) : new Set();

  return (
    <div className="bc-game" ref={fx}>
      <header className="bc-hud">
        <div className="bc-hud-l">
          <LiveChip />
          <span className="bc-pill">Lote {view.lot + 1}/{LOTS}</span>
          <span className={`bc-pill ${info.boss ? 'boss' : ''}`}>{info.name}</span>
        </div>
        <div className="bc-hud-r">
          {r && <span className="bc-stat"><small>Calidad</small><b className={`bc-score-num${rolled != null ? ' bump' : ''}`}>{(rolled ?? shownScore).toLocaleString('es-AR')}</b></span>}
          {r && <span className="bc-stat"><small>Impresiones</small><b>{r.prints}</b></span>}
          {r && <span className="bc-stat"><small>Descartes</small><b>{r.discards}</b></span>}
          <span className="bc-stat brass"><small>Créditos</small><b key={credPop} className={credPop ? 'bc-credpop' : ''}>{view.credits}</b></span>
          <span className="bc-quick">
            {canFull() && <button className="bc-icon" onClick={() => (isFull() ? exitFull() : enterFull())} title="Pantalla completa" aria-label="Pantalla completa">⛶</button>}
            <button className={`bc-icon${set.motion === 'reducido' ? ' off' : ''}`} onClick={() => patch({ motion: set.motion === 'reducido' ? 'normal' : 'reducido' })}
              aria-pressed={set.motion !== 'reducido'} title={set.motion === 'reducido' ? 'Activar fondo animado' : 'Quitar movimiento del fondo'} aria-label="Fondo animado">🌀</button>
            <button className={`bc-icon${set.mute || !set.music ? ' off' : ''}`} onClick={() => patch(set.mute || !set.music ? { mute: false, music: set.music || 0.35 } : { music: 0 })}
              aria-pressed={!set.mute && !!set.music} title={set.mute || !set.music ? 'Activar música' : 'Apagar música'} aria-label="Música">♪</button>
            <button className="bc-icon" onClick={() => { const ids = Object.keys(TRACKS); const nx = ids[(ids.indexOf(set.track) + 1) % ids.length]; patch({ track: nx, mute: false, music: set.music || 0.35 }); setMsg(`🎵 ${TRACKS[nx].name}`); }} title="Cambiar de música" aria-label="Cambiar de música">⏭</button>
            <button className="bc-icon" onClick={() => setFb(true)} title="Enviar una sugerencia" aria-label="Sugerencias">💡</button>
          </span>
          <button className="bc-icon" onClick={() => setHelp(true)} aria-label="¿Cómo se puntúa?">?</button>
          <button className="bc-icon" onClick={onAjustes} aria-label="Ajustes">⚙</button>
          <button className="bc-icon" onClick={onMenu} aria-label="Guardar y volver al menú">⏏</button>
        </div>
      </header>

      <Mods st={view} lit={litMods} setSt={setSt} act={act} shop={st.phase === 'shop' && !anim} />

      {msg && <div className="bc-msg" role="status">{msg}</div>}

      {view.phase === 'preview' && <Preview st={view} onStart={() => act({ type: 'START_ROUND' }, () => sfx.print())} onSkip={() => act({ type: 'SKIP_BLIND' }, () => sfx.cash(4))} />}
      {st.pack && !anim && <PackOpen key={st.log.length} st={st} act={act} />}

      {view.phase === 'round' && r && (
        <>
          <div className={`bc-goal${(rolled ?? shownScore) >= r.target ? ' done' : ''}${info.boss ? ' boss' : ''}`}>
            <div className="bc-goal-l"><small>{info.boss ? `JEFE · ${info.name}` : info.name}</small><b>META {r.target.toLocaleString('es-AR')}</b></div>
            <div className="bc-goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={r.target} aria-valuenow={rolled ?? shownScore} aria-label="Calidad hacia la meta">
              <i style={{ width: `${Math.min(100, ((rolled ?? shownScore) / r.target) * 100)}%` }} />
              <span>{(rolled ?? shownScore).toLocaleString('es-AR')} / {r.target.toLocaleString('es-AR')}</span>
            </div>
            <div className="bc-goal-r">{(rolled ?? shownScore) >= r.target ? <b>¡SUPERADA!</b> : <><small>TE FALTAN</small><b>{(r.target - (rolled ?? shownScore)).toLocaleString('es-AR')}</b></>}</div>
          </div>
          <Heat heat={r.heat} forecast={pv ? pv.heat : over ? Math.min(6, r.heat + 2) : null} boss={r.boss} />
          <section className="bc-bed" aria-label="Cama de impresión">
            <span className="bc-pop-anchor" aria-hidden="true" />
            {anim ? (
              <>
                <div className={`bc-played${anim.leaving ? ' leaving' : ''}`}>
                  {anim.last.played.map((id) => <Card key={id} card={anim.prev.deck.find((c) => c.id === id)} scoring={anim.last.scoring.includes(id)} lit={litCards.has(id)} />)}
                </div>
                <div className="bc-trace" aria-live="polite">
                  <div className={`bc-cm${tShown?.phase === 'total' && anim.prev.round.score + tShown.total >= anim.prev.round.target ? ' fire' : ''}`}><span className="chips" key={'c' + (tShown ? tShown.chips : 0)}>{tShown ? tShown.chips : 0}</span><span className="x">×</span><span className="mult" key={'m' + (tShown ? tShown.mult : 0)}>{tShown ? fmtMult(tShown.mult) : 0}</span></div>
                  <ol>{anim.last.trace.slice(0, anim.i).map((t, i) => <li key={i} className={'ph-' + t.phase}>{t.text}</li>)}</ol>
                  {anim.i < anim.last.trace.length && <button className="bc-btn small" onClick={() => setAnim((a) => ({ ...a, i: a.last.trace.length }))}>Acelerar</button>}
                </div>
              </>
            ) : (
              <div className="bc-forecast">
                {pv ? (
                  <>
                    <b>{PATTERN[pv.pattern].name}</b>{pv.level > 0 && <small> nivel {pv.level + 1}</small>}
                    <span className="bc-cm small"><span className="chips">{pv.score.chips}</span><span className="x">×</span><span className="mult">{fmtMult(pv.score.mult)}</span></span>
                    <span className="bc-est">= <b>{pv.score.total.toLocaleString('es-AR')}</b> de Calidad</span>
                    <small>{pv.score.total + r.score >= r.target ? '¡Con esta mano pasás la meta!' : `Después te faltarían ${(r.target - r.score - pv.score.total).toLocaleString('es-AR')}`} · puntúan {pv.scoring.length} carta{pv.scoring.length > 1 ? 's' : ''}</small>
                  </>
                ) : <span className="muted">Elegí de 1 a 5 cartas para ver cuánto suman. Te faltan <b>{(r.target - r.score).toLocaleString('es-AR')}</b> de Calidad. <button className="bc-mini" onClick={() => setHelp(true)}>¿Cómo se puntúa?</button></span>}
                {view.last && !pv && <small className="muted">Última: {PATTERN[view.last.pattern].name} → {view.last.total.toLocaleString('es-AR')}</small>}
              </div>
            )}
          </section>

          <Tutorial step={tuto} setStep={setTuto} />

          <section className={`bc-hand${reduced ? '' : ' float'}`} aria-label="Tu mano">
            {hand.map((id, i) => (
              <Card key={id} card={byId[id]} idx={i} fan={{ i, n: hand.length }} deal={dealDelay(id)} selected={sel.includes(id)} order={sel.indexOf(id) + 1}
                scoring={pv?.scoring.includes(id)} onClick={() => toggle(id)} disabled={!!anim} />
            ))}
          </section>
          <div className="bc-draw">
            <span className="bc-deckpile" aria-hidden="true">
              {Array.from({ length: Math.min(4, Math.max(1, Math.ceil(r.draw.length / 8))) }, (_, k) => <CardBack key={k} className="bc-pilecard" />)}
            </span>
            <span>Mazo: {r.draw.length} / {view.deck.length}</span>
          </div>

          <div className="bc-actions">
            <button className="bc-btn primary big" onClick={imprimir} disabled={!!anim || !sel.length}>Imprimir <kbd>I</kbd></button>
            <label className={`bc-over${!canOver ? ' dis' : ''}`} title={canOver ? '' : 'Con Calor 5 o 6 no se puede'}>
              <input type="checkbox" checked={over} disabled={!canOver || !!anim} onChange={(e) => setOver(e.target.checked)} />
              Sobreextruir <small>+12 Capas · +2 Calor</small> <kbd>S</kbd>
            </label>
            <button className="bc-btn" onClick={descartar} disabled={!!anim || !sel.length || r.discards <= 0}>Descartar <kbd>D</kbd></button>
          </div>

          {view.cals.length > 0 && (
            <div className="bc-cals" aria-label="Calibraciones">
              {view.cals.map((id, i) => (
                <div key={i} className="bc-cal">
                  <b>{CAL[id].name}</b><small>{CAL[id].desc}</small>
                  {calPick === i ? (
                    <span className="bc-suits">{SUIT_IDS.map((s) => <button key={s} className="bc-btn small" onClick={() => usarCal(i, s)} aria-label={SUITS[s].name}>{SUITS[s].sym}</button>)}<button className="bc-btn small" onClick={() => setCalPick(null)}>✕</button></span>
                  ) : <button className="bc-btn small" disabled={!!anim} onClick={() => usarCal(i)}>Usar</button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {help && <Ayuda onClose={() => setHelp(false)} />}
      {fb && <Sugerencias st={st} onClose={() => setFb(false)} />}
      {banner && <div className="bc-banner" role="status" style={(() => { const b = document.querySelector('.bc-bed'); return b ? { top: `${Math.min(innerHeight - 60, b.getBoundingClientRect().bottom + 34)}px` } : undefined; })()}>{banner}</div>} {/* justo debajo de la mesa: no lo tapa el número dorado */}
      {view.phase === 'shop' && <Shop st={view} act={act} />}
      {(view.phase === 'victory' || view.phase === 'defeat') && <End st={view} onNew={onNew} onMenu={onMenu} />}
      <p className="bc-seed">Semilla {st.seed} · {st.deck.length} cartas en el mazo</p>
    </div>
  );
}

// Sugerencias: mismo comportamiento que Maker Tycoon (ventana dentro del juego, mismo canal bb_mt_feedback_send),
// marcadas con [BATCARD] para distinguirlas en el panel.
const FB_KINDS = [['idea', '💡 Una idea'], ['error', '🐞 Algo anda mal'], ['otro', '💬 Otra cosa']];
function Sugerencias({ st, onClose }) {
  const { user, signIn, displayName } = useAuth();
  const [kind, setKind] = useState('idea');
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sentOk, setSentOk] = useState(false);
  const logged = !!user;
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const send = async () => {
    setBusy(true); setErr('');
    const { error } = await sb.rpc('bb_mt_feedback_send', {
      p_message: '[BATCARD] ' + msg.trim(), p_kind: kind, p_contact: contact || null, p_name: logged ? null : name.trim(),
      p_context: { game: 'batcard', lot: st.lot + 1, blind: st.blind, phase: st.phase, ua: (navigator.userAgent || '').slice(0, 120), w: window.innerWidth },
    });
    setBusy(false);
    if (error) setErr(error.message || 'No se pudo enviar.'); else setSentOk(true);
  };
  return createPortal(
    <div className="bc-root bc-modal" role="dialog" aria-modal="true" aria-label="Sugerencias" onClick={onClose}>
      <div className="bc-panel bc-help bc-fb" onClick={(e) => e.stopPropagation()}>
        <div className="bc-row"><h2>Sugerencias</h2><button className="bc-btn small" onClick={onClose}>Cerrar</button></div>
        {sentOk ? (
          <>
            <p><b>¡Gracias! Ya le llegó al equipo de 3DBAT.</b> Las leemos todas: muchas cosas de los juegos salieron de ideas de la comunidad.</p>
            <button className="bc-btn primary big" onClick={onClose} autoFocus>Seguir jugando</button>
          </>
        ) : (
          <>
            <p>¿Qué te gustaría que tenga BATCARD? ¿Algo no funciona como esperabas? Contanos: lo lee el equipo de 3DBAT.</p>
            <div className="bc-fb-kinds">{FB_KINDS.map(([k, l]) => <button key={k} className={`bc-btn small${kind === k ? ' primary' : ''}`} onClick={() => setKind(k)}>{l}</button>)}</div>
            <textarea rows={5} maxLength={980} value={msg} onChange={(e) => setMsg(e.target.value)} autoFocus
              placeholder={kind === 'error' ? 'Ej.: cuando descarto en el celular, las cartas…' : 'Ej.: estaría bueno un Mod que premie las escaleras…'} />
            <small className="muted">{msg.length}/980</small>
            {!logged && (
              <>
                <label>¿Quién sos? (obligatorio)<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre o apodo" /></label>
                <label>¿Cómo te respondemos? (opcional)<input value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} placeholder="Tu Instagram, Discord o correo" /></label>
                <p className="muted">O <button className="bc-mini" onClick={() => signIn()}>ingresá con Google</button> y se firma sola.</p>
              </>
            )}
            {logged && <p className="muted">La mandás como <b>{displayName}</b>.</p>}
            {err && <p className="bc-fb-err" role="alert">{err}</p>}
            <button className="bc-btn primary big" disabled={busy || msg.trim().length < 5 || (!logged && name.trim().length < 2)} onClick={send}>{busy ? 'Enviando…' : 'Mandar sugerencia'}</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Ayuda({ onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="bc-root bc-modal" role="dialog" aria-modal="true" aria-label="Cómo se puntúa" onClick={onClose}>
      <div className="bc-panel bc-help" onClick={(e) => e.stopPropagation()}>
        <div className="bc-row"><h2>¿Cómo se puntúa?</h2><button className="bc-btn small" onClick={onClose} autoFocus>Entendido</button></div>
        <p>Cada ronda tiene una <b>meta de Calidad</b>. Tenés <b>{RULES.prints} impresiones</b> para llegar: cada impresión suma Calidad.</p>
        <p className="bc-formula"><span className="chips">Capas</span> × <span className="mult">Multiplicador</span> = Calidad</p>
        <ol className="bc-list">
          <li>Elegí de 1 a 5 cartas. El juego busca qué <b>Patrón</b> (mano de póker) forman.</li>
          <li>El Patrón da Capas y Multiplicador base (tabla de abajo).</li>
          <li>Las cartas que forman el Patrón suman su valor en Capas: 2–10 su número, J/Q/K 10, As 11.</li>
          <li>Después actúan tus Mods (de izquierda a derecha) y se multiplica.</li>
        </ol>
        <table className="bc-table"><thead><tr><th>Patrón</th><th>Capas × Mult</th><th>Ejemplo</th></tr></thead>
          <tbody>{PATTERNS.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.chips} × {p.mult}</td><td className="muted">{EJ[p.id]}</td></tr>)}</tbody></table>
        <h3>Ejemplo</h3>
        <p>Par de K: (12 + 10 + 10) × 2 = <b>64</b>. Trío de 7: (30 + 21) × 3 = <b>153</b>. Una Carta alta casi no suma: buscá Patrones más grandes.</p>
        <h3>Consejos</h3>
        <ul className="bc-list">
          <li>Al seleccionar cartas ves el <b>total exacto</b> antes de imprimir.</li>
          <li><b>Descartá</b> las cartas que no te sirven: se reponen y no gastás impresión ({RULES.discards} por ronda).</li>
          <li><b>Sobreextruir</b> da +12 Capas pero sube 2 de Calor. Descartar enfría 1.</li>
          <li><b>Saltear</b>: el Prototipo y la Tanda se pueden saltear para abrir un sobre gratis (no cobrás esa ronda). <b>Ahorro</b>: al ganar cobrás +1 por cada 5 Créditos guardados (máx. +5). <b>Sellos</b>: el Dorado da +2 Créditos al puntuar y el Rojo hace puntuar la carta dos veces.</li>
          <li><b>Sobres</b>: en Suministros hay 2 sobres por visita. Al abrirlo elegís 1 opción: una carta nueva para tu mazo, una calibración, un perfil o (en el Sobre Maker) un Mod.</li>
          <li><b>Materiales</b>: con una Bobina le cambiás el filamento a una carta (PETG, TPU, ASA, Carbono o Seda). Cada uno tiene su regla: mirala en la Colección.</li>
          <li>Ganar con impresiones de sobra da más Créditos para comprar Mods en Suministros.</li>
        </ul>
      </div>
    </div>,
    document.body,
  );
}
const EJ = { alta: 'A', par: 'K K', doble: '9 9 · 4 4', trio: '7 7 7', escalera: '5 6 7 8 9', color: '5 del mismo palo', full: '3 3 3 · 9 9', poker: '8 8 8 8', ecolor: 'escalera del mismo palo' };

function Heat({ heat, forecast, boss }) {
  return (
    <div className="bc-heat" role="meter" aria-valuemin={0} aria-valuemax={6} aria-valuenow={heat} aria-label={`Calor ${heat} de 6`}>
      <span className="lbl">Calor</span>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span key={i} className={`bc-seg${i <= heat && heat > 0 && i > 0 ? ' on' : ''}${forecast != null && i > heat && i <= forecast ? ' fc' : ''}${i === 6 ? ' max' : ''}`}>{i}</span>
      ))}
      <span className="txt">{forecast != null && forecast !== heat ? `→ ${forecast} si imprimís` : `${heat}/6`}{boss === 'hotend_saturado' && ' · ¡Hotend Saturado castiga el 6!'}</span>
    </div>
  );
}

function Mods({ st, lit, act, shop }) {
  const slots = Array.from({ length: RULES.maxMods }, (_, i) => st.mods[i]);
  if (!st.mods.length) return <p className="bc-nomods">Sin Mods de Taller todavía: se consiguen en Suministros, después de cada ronda ganada.</p>;
  return (
    <section className="bc-mods" aria-label="Mods de Taller (se aplican de izquierda a derecha)">
      {slots.map((id, i) => id ? (
        <ModCard key={id} mod={MOD[id]} lit={lit.has(i)} slot={i} extra={id === 'contador_horas' && st.modData ? ` (ahora +${3 * (st.modData.contador_horas || 0)})` : ''}>
          <span className="bc-mod-ctl">
            <button className="bc-mini" disabled={i === 0} onClick={() => act({ type: 'MOVE_MOD', from: i, to: i - 1 })} aria-label={`Mover ${MOD[id].name} a la izquierda`}>◀</button>
            {shop && <button className="bc-mini" onClick={() => act({ type: 'SELL_MOD', idx: i }, () => sfx.coin())}>Vender {Math.floor(MOD[id].price / 2)}</button>}
            <button className="bc-mini" disabled={i === st.mods.length - 1} onClick={() => act({ type: 'MOVE_MOD', from: i, to: i + 1 })} aria-label={`Mover ${MOD[id].name} a la derecha`}>▶</button>
          </span>
        </ModCard>
      ) : <div key={'v' + i} className="bc-mod empty">Slot de Mod</div>)}
    </section>
  );
}

function ModCard({ mod, lit, children, slot, extra = '' }) {
  const onMove = (e) => {
    const b = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', ((e.clientX - b.left) / b.width).toFixed(3));
    e.currentTarget.style.setProperty('--my', ((e.clientY - b.top) / b.height).toFixed(3));
  };
  return (
    <div className={`bc-mod fin-${mod.finish}${lit ? ' lit' : ''}`} data-mslot={slot} onPointerMove={onMove}>
      <span className="bc-mod-name">{mod.name}</span>
      <span className="bc-mod-desc">{mod.desc}{extra}</span>
      <span className="bc-mod-rar">{mod.rarity}</span>
      {children}
    </div>
  );
}

function Preview({ st, onStart, onSkip }) {
  const info = blindInfo(st);
  return (
    <section className="bc-panel bc-preview">
      <h2>Lote {st.lot + 1} · {info.name}</h2>
      <p className="big">Meta: <b>{info.target.toLocaleString('es-AR')}</b> de Calidad</p>
      <p>{RULES.prints} impresiones · {RULES.discards - (info.boss === 'bobina_enredada' ? 1 : 0)} descartes · mano de {RULES.handSize} · pago {info.pay} Créditos + 1 por impresión que sobre</p>
      {info.boss && <div className="bc-boss"><b>Jefe: {BOSS[info.boss].name}</b><span>{BOSS[info.boss].desc}</span></div>}
      <div className="bc-lotmap">{TARGETS[st.lot].map((t, i) => <span key={i} className={i === st.blind ? 'cur' : i < st.blind ? 'done' : ''}>{BLIND_NAMES[i]}<b>{t}</b></span>)}</div>
      <div className="bc-actions">
        <button className="bc-btn primary big" onClick={onStart} autoFocus>Arrancar la impresión</button>
        {st.v >= 4 && st.blind < 2 && <button className="bc-btn bc-skip" onClick={onSkip} title="No jugás esta ronda ni cobrás su pago, pero abrís un sobre gratis.">Saltear · sobre gratis 🎁</button>}
      </div>
      {st.v >= 4 && <p className="muted small">Ahorro: al ganar cobrás +1 Crédito por cada {INTEREST.per} que tengas (máximo +{INTEREST.max}).</p>}
    </section>
  );
}

const itemName = (it) => (it.kind === 'mod' ? MOD[it.id].name : it.kind === 'cal' ? CAL[it.id].name : PROF[it.id].name);
const itemDesc = (it, st) => {
  if (it.kind === 'mod') return MOD[it.id].desc;
  if (it.kind === 'cal') return CAL[it.id].desc;
  const p = PATTERN[PROF[it.id].pattern];
  const lv = st.levels[p.id] || 0;
  return `Perfil: sube ${p.name} a nivel ${lv + 2} (+${p.lvl[0]} Capas, +${p.lvl[1]} Mult).`;
};
const KIND = { mod: 'Mod', cal: 'Calibración', profile: 'Perfil' };

function Shop({ st, act }) {
  const w = st.lastWin;
  return (
    <section className="bc-panel bc-shop">
      {w && <div className="bc-cash">¡Control superado! {w.score.toLocaleString('es-AR')} / {w.target.toLocaleString('es-AR')} · cobrás <b>{w.pay}</b> Créditos ({w.base} base + {w.left} por impresiones sobrantes{w.extra.length ? ' + ' + w.extra.join(', ') : ''})</div>}
      <h2>Suministros</h2>
      {st.shop.packs && (
        <div className="bc-packs">
          {st.shop.packs.map((pk, i) => (
            <button key={i} className={`bc-pack p-${pk.kind}${pk.sold ? ' sold' : ''}`} disabled={pk.sold || st.credits < pk.price}
              title={PACKS[pk.kind].desc}
              onClick={() => act({ type: 'OPEN_PACK', slot: i }, () => sfx.coin())}>
              <span className="bc-pack-art"><i>BATCARD</i><b>{PACKS[pk.kind].name.replace('Sobre ', '')}</b><em>3DBAT</em></span>
              <span className="bc-pack-info"><b>{PACKS[pk.kind].name}</b><small>{PACKS[pk.kind].desc}</small>
                <span className="bc-btn small">{pk.sold ? 'Abierto' : `Abrir · ${pk.price}`}</span></span>
            </button>
          ))}
        </div>
      )}
      <div className="bc-items">
        {st.shop.items.map((it, i) => (
          <div key={i} className={`bc-item k-${it.kind}${it.sold ? ' sold' : ''}`}>
            <small>{KIND[it.kind]}{it.kind === 'mod' ? ' · ' + MOD[it.id].rarity : ''}</small>
            <b>{itemName(it)}</b>
            <span>{itemDesc(it, st)}</span>
            <button className="bc-btn small" disabled={it.sold || st.credits < it.price}
              onClick={(e) => { const el = e.currentTarget; act({ type: 'BUY', slot: i }, () => { sfx.coin(); burstAt(el, { n: 25 }); }); }}>
              {it.sold ? 'Comprado' : `Comprar · ${it.price}`}
            </button>
          </div>
        ))}
      </div>
      <p className="muted">Hasta {RULES.maxMods} Mods y {RULES.maxCals} calibraciones. Los Mods se aplican de izquierda a derecha: ordenalos con ◀ ▶.</p>
      <div className="bc-actions">
        <button className="bc-btn" disabled={st.credits < st.shop.rerollCost} onClick={() => act({ type: 'REROLL' })}>Refrescar · {st.shop.rerollCost}</button>
        <button className="bc-btn primary big" onClick={() => act({ type: 'LEAVE_SHOP' })}>Siguiente ronda</button>
      </div>
    </section>
  );
}

// Apertura de sobre: tiembla → se rompe → las opciones se dan vuelta de a una → elegís 1.
function PackOpen({ st, act }) {
  const { kind, opts } = st.pack;
  const [stage, setStage] = useState('shake');
  const [shown, setShown] = useState(0);
  const boxRef = useRef(null);
  useEffect(() => {
    const t1 = setTimeout(() => { setStage('rip'); sfx.rip(); burstAt(boxRef.current, { n: 40 }); }, 750);
    const t2 = setTimeout(() => setStage('reveal'), 1150);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  useEffect(() => {
    if (stage !== 'reveal' || shown >= opts.length) return undefined;
    const h = setTimeout(() => { sfx.flip(shown); const o = opts[shown]; if (o?.kind === 'mod' && MOD[o.id].legendary) { sfx.legend(); flashScreen('#ffd27a', 500); } setShown((n) => n + 1); if (shown === opts.length - 1 && kind === 'maker') sfx.shimmer(); }, 230);
    return () => clearTimeout(h);
  }, [stage, shown, opts.length, kind]);
  const pick = (i, el) => act({ type: 'PICK_PACK', idx: i }, () => { sfx.cash(5); burstAt(el, { n: 50 }); confetti({ n: 70 }); });
  const done = shown >= opts.length;
  return createPortal(
    <div className="bc-root bc-modal bc-packopen" role="dialog" aria-modal="true" aria-label={PACKS[kind].name}>
      <div className="bc-packstage" ref={boxRef}>
        {stage !== 'reveal' && (
          <div className={`bc-pack-art big p-${kind} ${stage}`}><i>BATCARD</i><b>{PACKS[kind].name.replace('Sobre ', '')}</b><em>3DBAT</em></div>
        )}
        {stage === 'reveal' && (
          <>
            <h2>{st.pack.free ? '¡Gratis! ' : ''}{PACKS[kind].name}</h2>
            <p className="muted">{done ? 'Elegí 1' : 'Abriendo…'}</p>
            <div className="bc-packopts">
              {opts.map((o, i) => (
                <div key={i} className={`bc-packopt${i < shown ? ' up' : ''}`} style={{ '--i': i }}>
                  <div className="bc-flip">
                    <div className="bc-flip-back"><CardBack /></div>
                    <div className="bc-flip-front">
                      {o.kind === 'card'
                        ? <Card card={{ ...o.card, id: 'pk' + i }} onClick={(e) => done && pick(i, e.currentTarget)} />
                        : <button className={`bc-item k-${o.kind}`} disabled={!done} onClick={(e) => pick(i, e.currentTarget)}>
                            <small>{KIND[o.kind]}{o.kind === 'mod' ? ' · ' + MOD[o.id].rarity : ''}</small>
                            <b>{itemName(o)}</b><span>{itemDesc(o, st)}</span>
                          </button>}
                    </div>
                  </div>
                  {o.kind === 'card' && i < shown && (
                    <small className="bc-packcap">{o.card.m ? MATERIALS[o.card.m].name : 'PLA'}{o.card.b ? ` · +${o.card.b} Capas` : ''}{o.card.sl ? ` · ${SEALS[o.card.sl].name}` : ''}</small>
                  )}
                </div>
              ))}
            </div>
            <div className="bc-actions"><button className="bc-btn" disabled={!done} onClick={() => act({ type: 'SKIP_PACK' })}>Saltear</button></div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Envía la partida terminada al servidor (una sola vez por semilla).
const sent = new Map();
function useSubmit(st) {
  const [res, setRes] = useState(() => sent.get(st.seed) || null);
  const send = async () => {
    setRes({ sending: true });
    const { data, error } = await sb.functions.invoke('batcard-submit', { body: { seed: st.seed, log: st.log, v: st.v } });
    let msg = error?.message;
    if (error?.context?.json) { try { msg = (await error.context.json()).error || msg; } catch { /* nada */ } }
    const r = error ? { error: msg || 'No se pudo enviar.' } : { ok: true, ...data };
    if (r.ok || /ya se cargó/.test(r.error || '')) sent.set(st.seed, r);
    setRes(r);
  };
  useEffect(() => { if (st.ranked && !sent.has(st.seed)) send(); }, [st.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return [res, send];
}

function End({ st, onNew, onMenu }) {
  const won = st.phase === 'victory';
  const [sub, retry] = useSubmit(st);
  return (
    <section className={`bc-panel bc-end ${won ? 'won' : 'lost'}`}>
      <h2>{won ? '¡Orden de producción completa!' : 'La impresión falló'}</h2>
      <p>{won ? `Superaste los ${LOTS} Lotes.` : `Llegaste al Lote ${st.lot + 1}, ${BLIND_NAMES[st.blind]}.`}</p>
      <ul className="bc-endstats">
        <li>Mejor mano: <b>{st.stats.bestHand.toLocaleString('es-AR')}</b></li>
        <li>Impresiones: <b>{st.stats.prints}</b></li>
        <li>Calidad total: <b>{st.stats.total.toLocaleString('es-AR')}</b></li>
        <li>Semilla: <b>{st.seed}</b></li>
      </ul>
      {st.ranked ? (
        <div className="bc-rankres" role="status">
          {sub?.sending && 'Verificando tu partida en el servidor…'}
          {sub?.ok && <>🏆 Partida verificada. Tu mejor marca: <b>{Number(sub.best).toLocaleString('es-AR')}</b> · puesto <b>#{sub.rank}</b> en el ranking. <a href="#/juego?juego=batcard&ver=ranking">Ver ranking</a></>}
          {sub?.error && <>No se pudo cargar al ranking: {sub.error} <button className="bc-mini" onClick={retry}>Reintentar</button></>}
        </div>
      ) : <p className="muted">{st.rankNote ? `Esta partida no cuenta para el ranking (${st.rankNote}).` : 'Esta partida no cuenta para el ranking: ingresá con tu cuenta de Google y empezá una partida nueva. Era sin la sesión iniciada.'}</p>}
      <div className="bc-actions">
        <button className="bc-btn primary big" onClick={onNew}>Nueva partida</button>
        <button className="bc-btn" onClick={onMenu}>Menú</button>
      </div>
    </section>
  );
}

const TIPS = [
  'Elegí de 1 a 5 cartas tocándolas (o con las teclas 1 a 8) y tocá Imprimir. Las cartas que forman el Patrón suman sus Capas.',
  'Bien. Si la mano no te sirve, seleccioná cartas y Descartalas: se reponen del mazo. Tenés pocos descartes por ronda.',
  'Nuevo: la Temperatura de Taller. Sobreextruir suma +12 Capas pero sube 2 de Calor. Descartar enfría 1. Con Calor 5 o 6 no podés Sobreextruir.',
];
function Tutorial({ step: s, setStep }) {
  if (s >= TIPS.length) return null;
  return (
    <div className="bc-tip" role="note">
      <span>{TIPS[s]}</span>
      <button className="bc-mini" onClick={() => setStep(TIPS.length)}>Ocultar tutorial</button>
    </div>
  );
}

// ---------------------------------------------------------------- Colección y ajustes
function Coleccion({ back }) {
  return (
    <div className="bc-panel bc-coll">
      <div className="bc-row"><h2>Colección</h2><button className="bc-btn small" onClick={back}>Volver</button></div>
      <h3>Mods de Taller</h3>
      <div className="bc-mods wrap">{MODS.map((m) => <ModCard key={m.id} mod={m} lit={false}><span className="bc-mod-rar">{m.price} Créditos</span></ModCard>)}</div>
      <h3>Patrones y Perfiles</h3>
      <table className="bc-table"><thead><tr><th>Patrón</th><th>Base</th><th>Por nivel</th><th>Perfil</th></tr></thead>
        <tbody>{PATTERNS.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.chips} × {p.mult}</td><td>+{p.lvl[0]} / +{p.lvl[1]}</td><td>{PROFILES.find((x) => x.pattern === p.id)?.name}</td></tr>)}</tbody></table>
      <h3>Sellos de calidad</h3>
      <div className="bc-mats">{Object.entries(SEALS).map(([k, m]) => (
        <div key={k} className="bc-mat-row"><span className={`bc-seal s-${k}`} /><b>{m.name}</b><span>{m.desc}</span></div>
      ))}</div>
      <h3>Materiales de las cartas</h3>
      <p className="muted">Las cartas son de PLA hasta que les ponés otro filamento con una <b>Bobina</b> (se compran en Suministros y se usan durante la ronda sobre una carta de tu mano). El material queda para toda la partida.</p>
      <div className="bc-mats">{Object.entries(MATERIALS).map(([k, m]) => (
        <div key={k} className={`bc-mat-row mat-${k}`}><span className="bc-mat">{m.short}</span><b>{m.name}</b><span>{m.desc}</span></div>
      ))}</div>
      <h3>Calibraciones</h3>
      <ul className="bc-list">{[...CALIBRATIONS, ...SPOOLS, ...SEAL_CALS].map((c) => <li key={c.id}><b>{c.name}</b> — {c.desc}</li>)}</ul>
      <p className="muted">Se usan durante una ronda, con 1 carta de tu mano seleccionada (Enfriamiento no necesita carta). Si no hay objetivo válido, no se gastan. El mazo no baja de {MIN_DECK} cartas.</p>
      <h3>Jefes de Control de Calidad</h3>
      <ul className="bc-list">{BOSSES.map((b) => <li key={b.id}><b>{b.name}</b> — {b.desc}</li>)}</ul>
      <h3>Cómo se calcula la Calidad</h3>
      <p>Calidad = Capas × Multiplicador. Orden: efecto del jefe → base del Patrón → cartas puntuadas (2–10 su número, figuras 10, as 11) → Mods de izquierda a derecha → ajustes finales. Se redondea hacia abajo una sola vez.</p>
      <h3>Palos del taller</h3>
      <ul className="bc-list">{SUIT_IDS.map((s) => <li key={s}>{SUITS[s].sym} {SUITS[s].name}: {SUITS[s].motif}</li>)}</ul>
    </div>
  );
}

function Ajustes({ set, patch, back }) {
  return (
    <div className="bc-panel bc-set">
      <div className="bc-row"><h2>Ajustes</h2><button className="bc-btn small" onClick={back}>Volver</button></div>
      <label>Efecto CRT
        <select value={set.crt} onChange={(e) => patch({ crt: e.target.value })}>
          <option value="apagado">Apagado</option><option value="suave">Suave</option><option value="completo">Completo</option>
        </select>
      </label>
      <label>Movimiento
        <select value={set.motion} onChange={(e) => patch({ motion: e.target.value })}>
          <option value="auto">Normal (recomendado)</option><option value="normal">Normal</option><option value="reducido">Reducido (fondo quieto)</option>
        </select>
      </label>
      <label><input type="checkbox" checked={set.flashes} onChange={(e) => patch({ flashes: e.target.checked })} /> Destellos y brillos</label>
      <label>Velocidad del puntaje
        <select value={set.speed} onChange={(e) => patch({ speed: e.target.value })}><option value="normal">Normal</option><option value="rapida">Rápida</option></select>
      </label>
      <label>Volumen <input type="range" min="0" max="1" step="0.05" value={set.vol} onChange={(e) => patch({ vol: +e.target.value })} /></label>
      <label>Pista <select value={set.track} onChange={(e) => patch({ track: e.target.value })}>{Object.entries(TRACKS).map(([id, t]) => <option key={id} value={id}>{t.name}</option>)}</select></label>
      <label>Música <input type="range" min="0" max="1" step="0.05" value={set.music} onChange={(e) => patch({ music: +e.target.value })} /></label>
      <label><input type="checkbox" checked={set.mute} onChange={(e) => patch({ mute: e.target.checked })} /> Silenciar</label>
      <p className="muted">Teclado: 1–8 elegir cartas · I imprimir · D descartar · S sobreextruir · Esc limpiar selección.</p>
    </div>
  );
}
