import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import * as api from '../lib/communityApi.js';
import Icon from '../components/Icon.jsx';
import { Avatar } from '../components/Community.jsx';
import { gateView } from '../components/CommunityGate.jsx';
import { Empty, PageHead } from '../components/ui.jsx';
import { Nm } from '../components/Featured.jsx';
import { SocialIcon } from '../components/BrandIcon.jsx';
import { safeUrl } from '../lib/safeUrl.js';

const MakerMap = lazy(() => import('../components/MakerMap.jsx'));

// =====================================================================
// MAPA MAKER (#/mapa) — makers por ciudad. Solo Makers Club y 100 % voluntario.
// Privacidad: solo ciudades de un catálogo; nunca domicilios ni GPS. Quien se
// une elige su ciudad, puede ocultarse o abandonar el mapa cuando quiera.
// =====================================================================

function JoinPanel({ places, mine, onChanged }) {
  const [country, setCountry] = useState(mine?.country || 'Argentina');
  const [region, setRegion] = useState(mine?.region || '');
  const [place, setPlace] = useState(mine?.place_id || '');
  const [spec, setSpec] = useState((mine?.specialties || []).join(', '));
  const [visible, setVisible] = useState(mine ? mine.visible : true);
  const [links, setLinks] = useState(mine?.links?.length ? mine.links : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [sug, setSug] = useState(null);

  const countries = useMemo(() => [...new Set(places.map((p) => p.country))], [places]);
  const regions = useMemo(() => [...new Set(places.filter((p) => p.country === country).map((p) => p.region))], [places, country]);
  const cities = useMemo(() => places.filter((p) => p.country === country && p.region === region), [places, country, region]);

  const run = async (fn, msg) => {
    setBusy(true); setError(''); setOk('');
    try { await fn(); setOk(msg); await onChanged(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const save = () => run(() => api.mapJoin({ place, specialties: spec.split(',').map((s) => s.trim()).filter(Boolean), visible,
    links: links.filter((l) => l.label.trim() && l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })) }), mine ? 'Cambios guardados.' : '¡Listo! Ya aparecés en el mapa.');

  return (
    <section className="card mm-join">
      <h2>{mine ? 'Tu lugar en el mapa' : 'Sumate al mapa (opcional)'}</h2>
      <p className="cm-date"><Icon name="shield" size={13} /> Mostramos solo tu <b>ciudad</b> con un punto central igual para todos. Nunca tu dirección ni tu ubicación exacta, y podés salir cuando quieras.</p>
      <div className="cm-row">
        <label className="field"><span>País</span><div className="pink-input"><select value={country} onChange={(e) => { setCountry(e.target.value); setRegion(''); setPlace(''); }}>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}</select></div></label>
        <label className="field"><span>Provincia o región</span><div className="pink-input"><select value={region} onChange={(e) => { setRegion(e.target.value); setPlace(''); }}>
          <option value="">Elegí…</option>{regions.map((r) => <option key={r} value={r}>{r}</option>)}</select></div></label>
        <label className="field"><span>Ciudad</span><div className="pink-input"><select value={place} onChange={(e) => setPlace(e.target.value)} disabled={!region}>
          <option value="">Elegí…</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.city}</option>)}</select></div></label>
      </div>
      <label className="field"><span>Tus especialidades (separadas por coma, hasta 6)</span>
        <div className="pink-input"><input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="FDM, resina, CAD, láser…" /></div></label>
      <div className="mm-links">
        <div className="cm-date">Tus redes (opcional, hasta 4 enlaces)</div>
        {links.map((l, i) => (
          <div key={i} className="ga-kv">
            <div className="pink-input"><input value={l.label} maxLength={30} placeholder="Red (ej.: Instagram)" onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></div>
            <div className="pink-input"><input value={l.url} maxLength={300} inputMode="url" placeholder="https://instagram.com/tu_usuario" onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} /></div>
            <button type="button" className="mini-btn" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label="Quitar enlace">×</button>
          </div>
        ))}
        {links.length < 4 && <button type="button" className="cm-link" onClick={() => setLinks([...links, { label: '', url: 'https://' }])}>+ Agregar red</button>}
        <small className="cm-date">Solo enlaces que empiecen con https://. Los ven los miembros del Makers Club. No pongas teléfono ni dirección.</small>
      </div>
      <label className="nb-pref"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Mostrarme en el mapa</label>
      {error && <div className="feedback-error">{error}</div>}
      {ok && <div className="cm-ok">{ok}</div>}
      <div className="modal-actions">
        {mine && <button type="button" className="btn text" disabled={busy} onClick={() => run(() => api.mapLeave(), 'Saliste del mapa y se borraron tus datos de ubicación.')}>Abandonar el mapa</button>}
        <span className="cm-spacer" />
        <button type="button" className="btn primary" disabled={busy || !place} onClick={save}><Icon name="pin" size={16} /> {mine ? 'Guardar' : 'Aparecer en el mapa'}</button>
      </div>
      <details className="mm-sug" open={!!sug} onToggle={(e) => setSug(e.target.open ? (sug || { country, region: '', city: '' }) : null)}>
        <summary>¿No está tu ciudad? Pedí que la agreguen</summary>
        {sug && <div className="mm-sug-f">
          <div className="pink-input"><input value={sug.country} placeholder="País" onChange={(e) => setSug({ ...sug, country: e.target.value })} /></div>
          <div className="pink-input"><input value={sug.region} placeholder="Provincia o región" onChange={(e) => setSug({ ...sug, region: e.target.value })} /></div>
          <div className="pink-input"><input value={sug.city} placeholder="Ciudad" onChange={(e) => setSug({ ...sug, city: e.target.value })} /></div>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => run(() => api.mapSuggest(sug), 'Gracias: el equipo la revisa y la suma al catálogo.')}>Enviar sugerencia</button>
        </div>}
      </details>
    </section>
  );
}

export default function MapMaker() {
  const { access, isMember, signIn } = useAuth();
  const flags = api.useCommunityFlags();
  const [places, setPlaces] = useState(null);
  const [mine, setMine] = useState(undefined);
  const [sel, setSel] = useState(null);
  const [specialty, setSpecialty] = useState('');
  const [makers, setMakers] = useState(null);
  const [error, setError] = useState('');
  const enabled = isMember && !!flags?.batmap;

  const reload = useCallback(async () => {
    try { const [p, m] = await Promise.all([api.mapPlaces(), api.mapMy()]); setPlaces(p); setMine(m); setError(''); }
    catch (e) { setError(e.missing ? 'El Mapa Maker todavía no está instalado en la base (falta la migración 048).' : e.message); setPlaces([]); setMine(null); }
  }, []);
  useEffect(() => { if (enabled) reload(); }, [enabled, reload]);
  useEffect(() => {
    if (!enabled || !places) return;
    setMakers(null);
    api.mapMakers({ place: sel?.id, specialty: specialty.trim() }).then(setMakers).catch((e) => setError(e.message));
  }, [enabled, places, sel, specialty]);

  const gate = gateView({ access, isMember, enabled, flagsLoaded: flags !== null, signIn, to: '/mapa', icon: 'pin',
    title: 'Mapa Maker', text: 'Descubrí makers de tu ciudad y de todo el país. Participar es voluntario y solo se muestra la ciudad.' });
  if (gate) return gate;

  const total = (places || []).reduce((n, p) => n + p.makers, 0);
  return (
    <div className="cm-page mm-page">
      <PageHead icon="pin" label="Comunidad" title="Mapa Maker" text="Makers de distintas ciudades y regiones. Solo aparece quien decide sumarse, y solo con su ciudad." />
      {error && <div className="feedback-error">{error}</div>}
      {!places || mine === undefined ? <div className="empty"><div className="spinner" /></div> : <>
        <div className="mm-top">
          <Suspense fallback={<div className="mm-map"><div className="empty"><div className="spinner" /></div></div>}>
            <MakerMap places={places} selectedId={sel?.id} onSelect={(p) => setSel((cur) => (cur?.id === p.id ? null : p))} />
          </Suspense>
          <div className="mm-list">
            <div className="cm-date">{sel ? <>Makers en <b>{sel.city}</b> <button type="button" className="cm-link" onClick={() => setSel(null)}>ver todos</button></> : `${total} ${total === 1 ? 'maker' : 'makers'} en el mapa`}</div>
            <div className="pink-input"><input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Filtrar por especialidad (ej.: resina)" aria-label="Especialidad" /></div>
            {!makers ? <div className="cm-loading"><span className="spinner xs" /></div>
              : makers.length === 0 ? <Empty icon="users" title="Nadie por acá todavía" text={mine ? 'Probá otra ciudad o quitá el filtro.' : 'Podés ser la primera persona de tu ciudad.'} />
                : <ul className="mm-ul">{makers.map((m) => (
                  <li key={m.user_id}><a className="mm-maker" href={'#/batfeed/perfil/' + m.user_id}><Avatar author={m} size={38} uid={m.user_id} />
                    <div><b><Nm uid={m.user_id}>{m.name}</Nm></b> <span className="cm-date">· {m.city}</span>
                      <div className="chips">{m.specialties.map((s) => <span key={s} className="chip cat">{s}</span>)}</div></div></a>
                    {m.links?.length > 0 && <div className="mm-socials">{m.links.map((l) => safeUrl(l.url) && (
                      <a key={l.url} href={safeUrl(l.url)} target="_blank" rel="noopener noreferrer" className="mm-soc" title={l.url}><SocialIcon social={{ ...l, icon: 'link' }} size={15} /> {l.label}</a>))}</div>}</li>))}</ul>}
          </div>
        </div>
        <JoinPanel key={mine?.place_id || 'new'} places={places} mine={mine} onChanged={reload} />
      </>}
    </div>
  );
}
