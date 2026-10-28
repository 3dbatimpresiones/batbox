import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import FeedbackButton from '../components/FeedbackButton.jsx';
import Icon from '../components/Icon.jsx';
import { Options, PageHead } from '../components/ui.jsx';
import { calculateProduction, COLOR_SYSTEM_LABELS, formatDuration, formatGrams, formatNumber } from '../lib/production/calculator.js';
import { mergePlateStats, parseProductionFile } from '../lib/production/parser.js';
import '../styles/production.css';

const STORAGE = 'bb-production-planner-v2';
const LEGACY_STORAGE = 'bb-production-planner-v1';
const TUTORIAL_STORAGE = 'bb-production-tutorial-v1';
const palette = ['#EF4444', '#FFFFFF', '#111827', '#5DDADB', '#FBBF24', '#A78BFA'];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankFilament = (index = 0) => ({ id: uid(), position: String(index + 1), name: '', material: '', color: palette[index % palette.length], colorName: '', gramsPerBed: '', modelGrams: '', towerGrams: '', partialGrams: '', priceKg: '', stock: '' });
const DEFAULT = {
  jobName: '', client: '', quantity: '', piecesPerBed: '', timeHours: '', timeMinutes: '', timeSeconds: '', printers: '1',
  colorSystem: 'ams',
  reserveMode: '10', customReserve: '', mode: 'full', partialKind: 'estimate', partialHours: '', partialMinutes: '', partialSeconds: '',
  filaments: [blankFilament()], origins: {},
};
const safeSaved = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    return saved?.form?.filaments?.length ? { ...DEFAULT, ...saved.form } : DEFAULT;
  } catch { return DEFAULT; }
};
const n = (value) => value === '' ? null : Number(value);
const totalSeconds = (hours, minutes, seconds) => (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TUTORIAL_STEPS = [
  { icon: 'box', targets: ['[data-tour="import"]'], title: 'Primero 3MF, después G-code', text: 'Seguí este orden para que cada archivo quede asociado correctamente:', tips: ['Primero subí el 3MF del proyecto: detecta la cama o las camas, la impresora, los materiales y las vistas 3D.', 'Después elegí una cama y subí el G-code correspondiente: detecta el tiempo y los gramos reales de esa cama.', 'Si el proyecto tiene varias camas, repetí el paso anterior con el G-code de cada una.', 'Los archivos se procesan solamente en tu navegador.'] },
  { icon: 'grid', targets: ['[data-tour="plates"]', '[data-tour="import"]'], title: 'Elegí visualmente la cama', text: 'Cuando el proyecto tiene varias camas, tocá la vista 3D de la que querés usar como referencia.', tips: ['La cama elegida queda marcada como ACTIVA.', 'Confirmá manualmente cuántas piezas comerciales contiene.'] },
  { icon: 'link', targets: ['[data-tour="companion"]', '[data-tour="import"]'], title: 'Completá la cama con su G-code', text: 'Si el 3MF no trae estadísticas, usá “Completar con G-code” para detectar tiempo y gramos de esa cama.', tips: ['Cada G-code se vincula únicamente a la cama activa.', 'Podés repetirlo con las demás camas sin perder sus vistas.'] },
  { icon: 'calculator', targets: ['[data-tour="order"]'], title: 'Definí el pedido y las impresoras', text: 'Ingresá unidades solicitadas, piezas por cama e impresoras equivalentes. El planificador calcula tandas, excedentes y duración.', tips: ['Las impresoras del mismo cálculo deben tener rendimiento y sistema equivalentes.', 'Podés elegir camas completas o una última cama parcial.'] },
  { icon: 'refresh', targets: ['[data-tour="filaments"]'], title: 'Elegí el sistema multicolor correcto', text: 'AMS y multicabezal no desperdician material de la misma manera.', tips: ['AMS: conserva purga y torre identificadas.', 'Multicabezal: no inventa purga; solo cuenta cebado o torre informados.'] },
  { icon: 'shield', targets: ['[data-tour="reserve"]', '[data-tour="order"]'], title: '¿Qué es el margen de reserva?', text: 'Es material extra de seguridad agregado al consumo calculado. Un margen del 10 % transforma 1,000 kg necesarios en 1,100 kg recomendados.', tips: ['Cubre fallas, purgas, restos de bobina, calibraciones y pequeñas diferencias reales.', 'No agrega piezas ni tiempo: solo aumenta el filamento recomendado.', 'Para trabajos confiables, 10 % es un buen punto de partida.'] },
  { icon: 'check', targets: ['[data-tour="results"]', '[data-tour="calculate"]'], title: 'Calculá y leé el plan de compra', text: 'Tocá “Calcular producción”. El resultado separa consumo exacto de compra comercial y redondea cada color a bobinas completas de 1 kg.', tips: ['Cargá tu stock para comprar solamente el faltante.', 'Revisá los kilos y las bobinas necesarias por cada color.', 'Copiá el resumen para WhatsApp o exportalo como CSV.'] },
];

function Origin({ value }) {
  if (!value) return null;
  return <span className={'pp-origin ' + value}>{value === 'detectado' ? 'Detectado' : 'Manual'}</span>;
}

function Field({ label, origin, error, children, hint }) {
  return <label className={'pp-field' + (error ? ' error' : '')}><span>{label}<Origin value={origin} /></span>{children}{hint && <small>{hint}</small>}{error && <em>{error}</em>}</label>;
}

function TutorialModal({ step, setStep, onClose, targetRect }) {
  const item = TUTORIAL_STEPS[step];
  const last = step === TUTORIAL_STEPS.length - 1;
  const viewportWidth = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
  const targetCenterX = targetRect ? targetRect.left + targetRect.width / 2 : viewportWidth / 2;
  const targetCenterY = targetRect ? targetRect.top + targetRect.height / 2 : viewportHeight / 2;
  const panelPosition = `${targetCenterY < viewportHeight / 2 ? 'bottom' : 'top'}-${targetCenterX < viewportWidth / 2 ? 'right' : 'left'}`;
  const targetRight = targetRect ? targetRect.left + targetRect.width : 0;
  const targetBottom = targetRect ? targetRect.top + targetRect.height : 0;
  return <>
    {targetRect ? <div className="pp-tour-shades" aria-hidden="true">
      <i style={{ left: 0, top: 0, width: '100vw', height: targetRect.top }} />
      <i style={{ left: 0, top: targetRect.top, width: targetRect.left, height: targetRect.height }} />
      <i style={{ left: targetRight, top: targetRect.top, width: Math.max(0, viewportWidth - targetRight), height: targetRect.height }} />
      <i style={{ left: 0, top: targetBottom, width: '100vw', height: Math.max(0, viewportHeight - targetBottom) }} />
    </div> : <div className="pp-tutorial-shade" aria-hidden="true" />}
    {targetRect && <div className="pp-tour-spotlight" style={targetRect} aria-hidden="true" />}
    <div className={`pp-tutorial-backdrop pp-tour-${panelPosition}`} role="presentation"><section className="pp-tutorial" role="dialog" aria-labelledby="pp-tutorial-title">
      <div className="pp-tutorial-top"><span>TUTORIAL GUIADO · {step + 1} DE {TUTORIAL_STEPS.length}</span><button type="button" onClick={onClose} aria-label="Cerrar tutorial"><Icon name="x" size={19} /></button></div>
      <div className="pp-tutorial-progress">{TUTORIAL_STEPS.map((_, index) => <i key={index} className={index <= step ? 'done' : ''} />)}</div>
      <div className="pp-tutorial-body">
        <div className="pp-tutorial-icon"><Icon name={item.icon} size={42} /></div>
        <div><h2 id="pp-tutorial-title">{item.title}</h2><p>{item.text}</p></div>
      </div>
      <ul>{item.tips.map((tip, index) => <li key={tip}><Icon name="check" size={15} /><strong className="pp-tutorial-number">{index + 1}.</strong><span>{tip}</span></li>)}</ul>
      <div className="pp-tutorial-actions"><button type="button" className="btn ghost" onClick={onClose}>Saltar tutorial</button><div>{step > 0 && <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>Atrás</button>}<button type="button" className="btn primary" onClick={() => last ? onClose() : setStep(step + 1)}>{last ? 'Empezar a usar' : 'Siguiente'}</button></div></div>
      <small className="pp-tutorial-note">No vuelve a abrirse solo. Podés verlo nuevamente desde “Cómo usar”.</small>
    </section></div>
  </>;
}

function TimeFields({ form, prefix = 'time', setField, error }) {
  return <Field label={prefix === 'time' ? 'Tiempo por cama' : 'Tiempo de la cama parcial'} origin={form.origins[prefix]} error={error}>
    <div className="pp-time">
      <input type="number" min="0" step="1" value={form[`${prefix}Hours`]} onChange={(e) => setField(`${prefix}Hours`, e.target.value, prefix)} placeholder="0" /><b>h</b>
      <input type="number" min="0" max="59" step="1" value={form[`${prefix}Minutes`]} onChange={(e) => setField(`${prefix}Minutes`, e.target.value, prefix)} placeholder="0" /><b>min</b>
      <input type="number" min="0" max="59" step="1" value={form[`${prefix}Seconds`]} onChange={(e) => setField(`${prefix}Seconds`, e.target.value, prefix)} placeholder="0" /><b>s</b>
    </div>
  </Field>;
}

function PlatePicker({ plates, selected, setSelected }) {
  const urls = useMemo(() => plates.map((plate) => plate.thumbnail?.length
    ? URL.createObjectURL(new Blob([plate.thumbnail], { type: 'image/png' })) : null), [plates]);
  useEffect(() => () => urls.forEach((url) => { if (url) URL.revokeObjectURL(url); }), [urls]);
  return <div className="pp-plate-picker" data-tour="plates">
    <div className="pp-plate-title"><span>{plates.length > 1 ? 'Elegí la cama de referencia' : 'Vista de la cama detectada'}</span><small>Vista 3D guardada dentro del proyecto</small></div>
    <div className="pp-plate-grid">{plates.map((plate, index) => <button type="button" key={`${plate.id}-${index}`} className={'pp-plate' + (selected === index ? ' active' : '')} aria-pressed={selected === index} onClick={() => setSelected(index)}>
      <span className="pp-plate-visual">{urls[index] ? <img src={urls[index]} alt={`Vista 3D de ${plate.name}`} /> : <span className="pp-plate-empty"><Icon name="box" size={30} />Sin vista previa</span>}<i>{selected === index ? 'ACTIVA' : `CAMA ${index + 1}`}</i></span>
      <span className="pp-plate-meta"><b>{plate.name}</b><small>{plate.statsSource ? '✓ G-code vinculado · ' : ''}{plate.objectCount != null ? `${plate.objectCount} objeto${plate.objectCount === 1 ? '' : 's'} detectado${plate.objectCount === 1 ? '' : 's'}` : 'Cantidad a confirmar'}</small></span>
    </button>)}</div>
  </div>;
}

function FilePanel({ info, selected, setSelected, onFile, busy, error, inputRef, title = 'Archivo de la cama de referencia', companionRef, onCompanion, companionState }) {
  const plate = info?.plates?.[selected];
  const gramsDetected = plate?.filaments?.filter((f) => f.gramsPerBed != null).length || 0;
  const visibleWarnings = plate?.statsSource ? (info?.warnings || []).filter((warning) => !/sin G-code|estadísticas finales/i.test(warning)) : (info?.warnings || []);
  return <section className="card pp-file-card" data-tour={title === 'Archivo de la cama de referencia' ? 'import' : undefined}>
    <div className="pp-section-head"><div><div className="section-label">IMPORTACIÓN LOCAL</div><h2>{title}</h2></div><Icon name="box" size={24} /></div>
    <input ref={inputRef} type="file" accept=".gcode,.gco,.3mf" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    <button type="button" className="pp-drop" onClick={() => inputRef.current?.click()} disabled={busy}>
      <Icon name="box" size={23} /><span><b>{busy ? 'Leyendo archivo…' : info ? 'Cambiar archivo' : 'Subir G-code o 3MF laminado'}</b><small>Máximo 100 MB · se procesa en este navegador y no se guarda</small></span>
    </button>
    {error && <div className="pp-alert err">{error}</div>}
    {info && <div className="pp-detected">
      <div><b>{info.name}</b><small>{[info.producer, info.printerModel, info.colorSystem ? COLOR_SYSTEM_LABELS[info.colorSystem] : '', info.companion ? 'Proyecto + G-code complementario' : info.sliced ? 'Estadísticas de laminado encontradas' : 'Proyecto sin estadísticas finales'].filter(Boolean).join(' · ')}</small></div>
      {info.plates.length > 0 && <PlatePicker plates={info.plates} selected={selected} setSelected={setSelected} />}
      {plate && <div className="pp-detect-grid"><span>Tiempo <b>{plate.seconds ? formatDuration(plate.seconds) : 'Falta'}</b></span><span>Filamentos <b>{plate.filaments?.length ? `${plate.filaments.length} materiales${gramsDetected === plate.filaments.length ? '' : ' · faltan gramos'}` : 'Faltan'}</b></span><span>Piezas/cama <b>{plate.objectCount ? `${plate.objectCount} objetos detectados · confirmar` : 'Requiere confirmación'}</b></span></div>}
      {onCompanion && info.kind === '3mf' && <div className={'pp-companion' + (plate?.statsSource ? ' ready' : '')} data-tour="companion">
        <input ref={companionRef} type="file" accept=".gcode,.gco,.3mf" hidden onChange={(e) => { onCompanion(e.target.files?.[0]); e.target.value = ''; }} />
        <div><b>{plate?.statsSource ? 'Datos de laminado vinculados' : 'Completá la cama activa'}</b><small>{plate?.statsSource ? plate.statsSource : 'Subí el G-code exportado de esta cama para detectar tiempo y gramos sin perder la vista 3D.'}</small></div>
        <button type="button" className="btn ghost sm" disabled={companionState?.busy} onClick={() => companionRef.current?.click()}><Icon name="upload" size={15} />{companionState?.busy ? 'Leyendo…' : plate?.statsSource ? 'Cambiar G-code' : 'Completar con G-code'}</button>
      </div>}
      {companionState?.error && <div className="pp-alert err">{companionState.error}</div>}
      {[...visibleWarnings, ...(plate?.warnings || [])].map((warning, i) => <div className="pp-alert" key={i}>⚠️ {warning}</div>)}
      {plate?.includes && <div className="pp-alert info">ℹ️ {plate.includes}</div>}
    </div>}
  </section>;
}

function resultSummary(form, result) {
  const title = form.jobName || 'Producción 3D';
  const who = form.client ? ` · ${form.client}` : '';
  const lines = [
    `🖨️ ${title}${who}`,
    `Sistema: ${result.colorSystemLabel}`,
    `${result.quantity} unidades · ${result.batches} tandas · ${result.piecesPerBed} piezas/cama${result.excess ? ` · ${result.excess} excedentes` : ''}`,
    `Tiempo: ${formatDuration(result.machineSeconds)} horas-máquina · duración estimada ${formatDuration(result.durationSeconds)} con ${result.printerLoads.length} impresora${result.printerLoads.length === 1 ? '' : 's'}`,
    `Material: ${formatGrams(result.baseGrams)} · reserva ${result.reservePct}%: ${formatGrams(result.reserveGrams)}`,
    ...result.filaments.map((f) => `${f.colorName || f.name || `Filamento ${f.position}`}: ${formatNumber(f.baseGrams)} g → reservar ${formatNumber(f.reserveGrams)} g${f.shortage > 0 ? ` · faltan ${formatNumber(f.shortage)} g` : ''}`),
    `Compra en bobinas de 1 kg: ${formatNumber(result.purchaseKg, 0)} kg en total (${formatNumber(result.purchaseKg, 0)} bobina${result.purchaseKg === 1 ? '' : 's'}), según el stock cargado.`,
  ];
  if (result.estimatedPartial) lines.push(result.colorSystem === 'ams' ? '⚠️ Última cama parcial estimada: el material de modelo se escala y la purga/torre identificada se conserva como gasto fijo.' : '⚠️ Última cama parcial estimada: no se agregó purga de AMS; solo se conserva como fijo el cebado o torre informado.');
  return lines.join('\n');
}

function downloadCsv(form, result) {
  const rows = [['Trabajo', form.jobName], ['Cliente', form.client], ['Sistema de color', result.colorSystemLabel], ['Pedido', result.quantity], ['Tandas', result.batches], ['Producidas', result.produced], ['Excedentes', result.excess], ['Horas máquina', result.machineSeconds / 3600], ['Duración estimada h', result.durationSeconds / 3600], ['Compra total kg', result.purchaseKg], [], ['Posición', 'Color', 'Nombre', 'g/cama', 'g pedido', 'g recomendados', 'Stock', 'Faltante exacto g', 'Comprar kg', 'Costo base', 'Costo con reserva']];
  result.filaments.forEach((f) => rows.push([f.position, f.colorName, f.name || f.material, f.gramsPerBed, f.baseGrams, f.reserveGrams, f.stock ?? '', f.purchaseGrams, f.spools1kg, f.baseCost ?? '', f.reserveCost ?? '']));
  const csv = '\ufeff' + rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${(form.jobName || 'plan-produccion').replace(/[^a-z0-9áéíóúñ -]/gi, '').trim().replace(/\s+/g, '-')}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Production() {
  const { notify } = useAuth();
  const fileRef = useRef(null), partialFileRef = useRef(null), companionRef = useRef(null);
  const [form, setForm] = useState(safeSaved);
  const [file, setFile] = useState(null), [plate, setPlate] = useState(0);
  const [partialFile, setPartialFile] = useState(null), [partialPlate, setPartialPlate] = useState(0);
  const [fileState, setFileState] = useState({ busy: false, error: '' });
  const [companionState, setCompanionState] = useState({ busy: false, error: '' });
  const [partialFileState, setPartialFileState] = useState({ busy: false, error: '' });
  const [result, setResult] = useState(() => { try { const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null')?.result; return saved?.colorSystem && 'purchaseKg' in saved && saved.filaments?.every((f) => 'purchaseGrams' in f) ? saved : null; } catch { return null; } });
  const [errors, setErrors] = useState({});
  const [tutorialOpen, setTutorialOpen] = useState(() => localStorage.getItem(TUTORIAL_STORAGE) !== 'seen');
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tourRect, setTourRect] = useState(null);
  const [guidedMode, setGuidedMode] = useState(true);
  const [plannerStep, setPlannerStep] = useState(0);

  const closeTutorial = () => { localStorage.setItem(TUTORIAL_STORAGE, 'seen'); setTutorialOpen(false); };
  const openTutorial = () => { setTutorialStep(0); setTutorialOpen(true); };

  useEffect(() => { localStorage.removeItem(LEGACY_STORAGE); }, []);
  useEffect(() => { localStorage.setItem(STORAGE, JSON.stringify({ form, result })); }, [form, result]);
  useEffect(() => {
    if (!tutorialOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') closeTutorial(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tutorialOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tutorialOpen) { setTourRect(null); return undefined; }
    const item = TUTORIAL_STEPS[tutorialStep];
    const target = item.targets.map((selector) => document.querySelector(selector)).find(Boolean);
    if (!target) { setTourRect(null); return undefined; }
    const updateRect = () => {
      const rect = target.getBoundingClientRect();
      const padding = 6;
      const left = Math.max(8, rect.left - padding);
      const top = Math.max(8, rect.top - padding);
      const right = Math.min(window.innerWidth - 8, rect.right + padding);
      const bottom = Math.min(window.innerHeight - 8, rect.bottom + padding);
      setTourRect({ left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) });
    };
    updateRect();
    const timer = window.setTimeout(() => { target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); updateRect(); }, 80);
    const settled = window.setTimeout(updateRect, 700);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateRect) : null;
    observer?.observe(target);
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.clearTimeout(timer); window.clearTimeout(settled); observer?.disconnect();
      window.removeEventListener('scroll', updateRect, true); window.removeEventListener('resize', updateRect);
    };
  }, [tutorialOpen, tutorialStep, file, result]);

  const setField = (key, value, originKey = key) => setForm((old) => ({ ...old, [key]: value, origins: { ...old.origins, [originKey]: 'manual' } }));
  const updateFilament = (id, key, value) => setForm((old) => ({ ...old, filaments: old.filaments.map((f) => f.id === id ? { ...f, [key]: value } : f), origins: { ...old.origins, [`filament-${id}-${key}`]: 'manual' } }));

  const applyPlate = (info, index, partial = false) => {
    const p = info?.plates?.[index]; if (!p) return;
    if (partial) {
      setForm((old) => ({ ...old,
        partialHours: p.seconds ? String(Math.floor(p.seconds / 3600)) : old.partialHours,
        partialMinutes: p.seconds ? String(Math.floor((p.seconds % 3600) / 60)) : old.partialMinutes,
        partialSeconds: p.seconds ? String(Math.round(p.seconds % 60)) : old.partialSeconds,
        partialKind: 'specific',
        filaments: old.filaments.map((f, i) => ({ ...f, partialGrams: p.filaments?.[i]?.gramsPerBed != null ? String(p.filaments[i].gramsPerBed) : f.partialGrams })),
        origins: { ...old.origins, partial: 'detectado' },
      }));
      return;
    }
    setForm((old) => ({ ...old,
      jobName: old.jobName || info.name.replace(/\.(gcode|gco|3mf)$/i, ''),
      colorSystem: info.colorSystem || old.colorSystem,
      timeHours: p.seconds ? String(Math.floor(p.seconds / 3600)) : old.origins.time === 'detectado' ? '' : old.timeHours,
      timeMinutes: p.seconds ? String(Math.floor((p.seconds % 3600) / 60)) : old.origins.time === 'detectado' ? '' : old.timeMinutes,
      timeSeconds: p.seconds ? String(Math.round(p.seconds % 60)) : old.origins.time === 'detectado' ? '' : old.timeSeconds,
      filaments: p.filaments?.length ? p.filaments.map((f, i) => ({ ...blankFilament(i), ...f, id: uid(), gramsPerBed: f.gramsPerBed == null ? '' : String(f.gramsPerBed), modelGrams: f.modelGrams == null ? '' : String(f.modelGrams), towerGrams: f.towerGrams == null ? '' : String(f.towerGrams) })) : old.filaments,
      origins: { ...old.origins, time: p.seconds ? 'detectado' : old.origins.time === 'detectado' ? undefined : old.origins.time, ...(p.filaments?.length ? { filaments: 'detectado' } : {}), ...(info.colorSystem ? { colorSystem: 'detectado' } : {}) },
    }));
  };

  const load = async (chosen, partial = false) => {
    if (!chosen) return;
    const setter = partial ? setPartialFileState : setFileState;
    setter({ busy: true, error: '' });
    try {
      const info = await parseProductionFile(chosen);
      if (partial) { setPartialFile(info); setPartialPlate(0); } else { setFile(info); setPlate(0); setCompanionState({ busy: false, error: '' }); }
      applyPlate(info, 0, partial);
      setter({ busy: false, error: '' });
    } catch (e) { setter({ busy: false, error: e.message }); }
  };
  const loadCompanion = async (chosen) => {
    if (!chosen || !file) return;
    setCompanionState({ busy: true, error: '' });
    try {
      const stats = await parseProductionFile(chosen);
      const merged = mergePlateStats(file, plate, stats);
      setFile(merged); applyPlate(merged, plate, false); setResult(null);
      setCompanionState({ busy: false, error: '' });
      notify('ok', `Tiempo y consumos vinculados a ${merged.plates[plate].name}.`);
    } catch (e) { setCompanionState({ busy: false, error: e.message }); }
  };
  useEffect(() => { if (file) applyPlate(file, plate, false); }, [plate]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (partialFile) applyPlate(partialFile, partialPlate, true); }, [partialPlate]); // eslint-disable-line react-hooks/exhaustive-deps

  const reservePct = form.reserveMode === 'custom' ? n(form.customReserve) : Number(form.reserveMode);
  const input = useMemo(() => ({
    quantity: n(form.quantity), piecesPerBed: n(form.piecesPerBed), bedSeconds: totalSeconds(form.timeHours, form.timeMinutes, form.timeSeconds),
    printers: n(form.printers), reservePct, mode: form.mode, partialKind: form.partialKind,
    partialSeconds: totalSeconds(form.partialHours, form.partialMinutes, form.partialSeconds),
    colorSystem: form.colorSystem,
    filaments: form.filaments.map((f) => ({ ...f, gramsPerBed: n(f.gramsPerBed), modelGrams: n(f.modelGrams), towerGrams: n(f.towerGrams), partialGrams: n(f.partialGrams), priceKg: n(f.priceKg), stock: n(f.stock) })),
  }), [form, reservePct]);
  const remainder = Number(form.quantity) > 0 && Number(form.piecesPerBed) > 0 ? Number(form.quantity) % Number(form.piecesPerBed) : 0;

  const calculate = () => {
    const next = calculateProduction(input);
    if (!next.ok) { setErrors(next.errors); setResult(null); notify('err', 'Revisá los campos marcados antes de calcular.'); return; }
    setErrors({}); setResult(next); if (guidedMode) setPlannerStep(4); notify('ok', 'Plan de producción calculado.');
  };
  const reset = () => { setForm({ ...DEFAULT, filaments: [blankFilament()] }); setResult(null); setErrors({}); setFile(null); setPartialFile(null); setCompanionState({ busy: false, error: '' }); localStorage.removeItem(STORAGE); };

  return <div className="pp-page">
    {tutorialOpen && <TutorialModal step={tutorialStep} setStep={setTutorialStep} onClose={closeTutorial} targetRect={tourRect} />}
    <PageHead icon="clock" label="HERRAMIENTAS · BATBOX" title="Planificador de producción 3D" text="Calculá tandas, horas, filamentos, reserva y reparto entre impresoras a partir de un laminado o con carga manual.">
      <div className="pp-head-actions"><button type="button" className="btn ghost sm" onClick={openTutorial}><Icon name="book" size={15} /> Cómo usar</button><FeedbackButton source="planificador-produccion" /></div>
    </PageHead>

    <div className="pp-guided-bar">
      <button type="button" className={'pp-guided-toggle' + (guidedMode ? ' active' : '')} aria-pressed={guidedMode} onClick={() => setGuidedMode((value) => !value)}><Icon name={guidedMode ? 'check' : 'grid'} size={17} /><span><b>Paso por paso</b><small>{guidedMode ? 'Activado · una etapa a la vez' : 'Desactivado · vista completa'}</small></span></button>
      {guidedMode && <div className="pp-guided-progress"><b>Paso {plannerStep + 1} de 5</b><span>{['Archivo', 'Pedido', 'Modalidad', 'Filamentos', 'Resultado'].map((label, index) => <button type="button" key={label} className={index === plannerStep ? 'active' : index < plannerStep ? 'done' : ''} onClick={() => setPlannerStep(index)} aria-label={`Ir a ${label}`}>{index + 1}</button>)}</span></div>}
    </div>

    <div className={guidedMode && plannerStep !== 0 ? 'pp-stage-hidden' : ''}>
      <FilePanel info={file} selected={plate} setSelected={setPlate} onFile={(f) => load(f)} busy={fileState.busy} error={fileState.error} inputRef={fileRef} companionRef={companionRef} onCompanion={loadCompanion} companionState={companionState} />
      {guidedMode && <div className="pp-step-actions"><span /><button type="button" className="btn primary" onClick={() => setPlannerStep(1)}>Siguiente: pedido <Icon name="arrow-right" size={16} /></button></div>}
    </div>

    <div className={'pp-form-grid' + (guidedMode ? ' guided' : '')}>
      <section className={'card pp-card' + (guidedMode && plannerStep !== 1 ? ' pp-stage-hidden' : '')} data-tour="order">
        <div className="pp-section-head"><div><div className="section-label">1 · PEDIDO</div><h2>Datos del trabajo</h2></div></div>
        <div className="pp-two"><Field label="Nombre del trabajo" origin={form.origins.jobName}><input value={form.jobName} onChange={(e) => setField('jobName', e.target.value)} placeholder="Ej.: Pedido de tapas" /></Field><Field label="Cliente (opcional)" origin={form.origins.client}><input value={form.client} onChange={(e) => setField('client', e.target.value)} placeholder="Nombre o empresa" /></Field></div>
        <div className="pp-three"><Field label="Unidades solicitadas" origin={form.origins.quantity} error={errors.quantity}><input type="number" min="1" step="1" value={form.quantity} onChange={(e) => setField('quantity', e.target.value)} /></Field><Field label="Piezas por cama" origin={form.origins.piecesPerBed} error={errors.piecesPerBed} hint="Confirmalo manualmente; no contamos mallas."><input type="number" min="1" step="1" value={form.piecesPerBed} onChange={(e) => setField('piecesPerBed', e.target.value)} /></Field><Field label="Impresoras equivalentes" origin={form.origins.printers} error={errors.printers}><input type="number" min="1" step="1" value={form.printers} onChange={(e) => setField('printers', e.target.value)} /></Field></div>
        <TimeFields form={form} setField={setField} error={errors.bedSeconds} />
        <Field label="Margen de reserva" error={errors.reservePct}><div className="pp-reserve"><Options value={form.reserveMode} onChange={(value) => setForm((old) => ({ ...old, reserveMode: value }))} options={[{ value: '0', label: '0 %' }, { value: '5', label: '5 %' }, { value: '10', label: '10 %' }, { value: 'custom', label: 'Otro' }]} />{form.reserveMode === 'custom' && <div className="pp-unit"><input type="number" min="0" max="500" value={form.customReserve} onChange={(e) => setField('customReserve', e.target.value, 'reserve')} /><b>%</b></div>}</div><div className="pp-reserve-help" data-tour="reserve"><Icon name="shield" size={17} /><span><b>Es material extra de seguridad.</b> Cubre fallas, purgas, calibraciones y restos de bobina. Con {formatNumber(reservePct || 0, 0)} %, cada 1 kg calculado recomienda <strong>{formatNumber(1 + (reservePct || 0) / 100, 2)} kg</strong>. No cambia piezas ni tiempo.</span></div></Field>
        {guidedMode && <div className="pp-step-actions"><button type="button" className="btn ghost" onClick={() => setPlannerStep(0)}>Anterior</button><button type="button" className="btn primary" onClick={() => setPlannerStep(2)}>Siguiente: modalidad <Icon name="arrow-right" size={16} /></button></div>}
      </section>

      <section className={'card pp-card pp-mode-card' + (guidedMode && plannerStep !== 2 ? ' pp-stage-hidden' : '')}>
        <div className="pp-section-head"><div><div className="section-label">2 · MODALIDAD</div><h2>Última cama</h2></div></div>
        <Options value={form.mode} onChange={(value) => setForm((old) => ({ ...old, mode: value }))} options={[{ value: 'full', label: 'Camas completas' }, { value: 'partial', label: 'Última cama parcial' }]} />
        <p className="pp-help">{form.mode === 'full' ? 'Se imprimen camas iguales hasta completar el pedido. Puede haber excedentes.' : 'Las camas completas se suman con una última cama que contiene solo el resto.'}</p>
        {form.mode === 'partial' && remainder > 0 && <>
          <Options value={form.partialKind} onChange={(value) => setForm((old) => ({ ...old, partialKind: value }))} options={[{ value: 'estimate', label: 'Estimar proporcional' }, { value: 'specific', label: 'Datos propios' }]} />
          {form.partialKind === 'estimate' ? <div className="pp-alert">⚠️ Aproximación: purgas, torre y tiempos fijos no suelen escalar de forma lineal.</div> : <>
            <FilePanel title="Laminado específico de la última cama" info={partialFile} selected={partialPlate} setSelected={setPartialPlate} onFile={(f) => load(f, true)} busy={partialFileState.busy} error={partialFileState.error} inputRef={partialFileRef} />
            <TimeFields form={form} prefix="partial" setField={setField} error={errors.partialSeconds} />
          </>}
        </>}
        {form.mode === 'partial' && remainder === 0 && <div className="pp-alert info">El pedido no tiene resto: ambas modalidades dan exactamente el mismo resultado.</div>}
        {guidedMode && <div className="pp-step-actions"><button type="button" className="btn ghost" onClick={() => setPlannerStep(1)}>Anterior</button><button type="button" className="btn primary" onClick={() => setPlannerStep(3)}>Siguiente: filamentos <Icon name="arrow-right" size={16} /></button></div>}
      </section>
    </div>

    <section className={'card pp-card pp-filaments' + (guidedMode && plannerStep !== 3 ? ' pp-stage-hidden' : '')} data-tour="filaments">
      <div className="pp-section-head"><div><div className="section-label">3 · FILAMENTOS <Origin value={form.origins.filaments} /></div><h2>Consumo por cama</h2></div><button type="button" className="btn ghost sm" onClick={() => setForm((old) => ({ ...old, filaments: [...old.filaments, blankFilament(old.filaments.length)] }))}>+ Agregar filamento</button></div>
      <div className="pp-color-system">
        <Field label="Sistema de impresión multicolor" origin={form.origins.colorSystem}>
          <select value={form.colorSystem} onChange={(e) => { setField('colorSystem', e.target.value); setResult(null); }}>
            <option value="ams">AMS / cambiador automático · una boquilla</option>
            <option value="multihead">Multicabezal / toolchanger · Snapmaker, Creator y similares</option>
            <option value="single">Una boquilla · un material, sin cambios automáticos</option>
          </select>
        </Field>
        <div className="pp-alert info">{form.colorSystem === 'ams'
          ? 'AMS y sistemas similares comparten una boquilla: los cambios generan purga y, muchas veces, torre. Usá el total del laminador; nunca sumamos ese descarte dos veces.'
          : form.colorSystem === 'multihead'
            ? 'Cada material tiene su propio cabezal: no aplicamos purgas de AMS. Solo contamos cebado, torre u ooze shield si el laminador lo informa o vos lo cargás.'
            : 'No se agregan cambios de color ni purgas automáticas. Se usa únicamente el consumo informado para esa boquilla.'}</div>
      </div>
      {errors.filaments && <div className="pp-alert err">{errors.filaments}</div>}
      <div className="pp-filament-columns"><span>Pos.</span><span>Material</span><span>Color</span><span>Total g/cama</span><span>Modelo</span><span>Purga / cebado</span><span>Precio/kg</span><span>Stock</span></div>
      <div className="pp-filament-list">{form.filaments.map((f, index) => <div className="pp-filament" key={f.id}>
        <div className="pp-filament-top"><b>Filamento {index + 1}</b>{form.filaments.length > 1 && <button type="button" className="mini-btn danger" onClick={() => setForm((old) => ({ ...old, filaments: old.filaments.filter((row) => row.id !== f.id) }))}><Icon name="trash" size={14} /></button>}</div>
        <div className="pp-filament-grid">
          <Field label="Posición"><input value={f.position} onChange={(e) => updateFilament(f.id, 'position', e.target.value)} /></Field>
          <Field label="Nombre / material"><input value={f.name} onChange={(e) => updateFilament(f.id, 'name', e.target.value)} placeholder="PLA, PETG…" /></Field>
          <Field label="Color"><div className="pp-color"><input type="color" value={f.color} onChange={(e) => updateFilament(f.id, 'color', e.target.value)} /><input value={f.colorName} onChange={(e) => updateFilament(f.id, 'colorName', e.target.value)} placeholder="Rojo" /></div></Field>
          <Field label="Gramos por cama" error={errors[`filament-${index}`]}><div className="pp-unit"><input type="number" min="0" step="0.01" value={f.gramsPerBed} onChange={(e) => updateFilament(f.id, 'gramsPerBed', e.target.value)} /><b>g</b></div></Field>
          <Field label="Modelo (si se informó)"><div className="pp-unit"><input type="number" min="0" step="0.01" value={f.modelGrams} onChange={(e) => updateFilament(f.id, 'modelGrams', e.target.value)} placeholder="—" /><b>g</b></div></Field>
          <Field label={form.colorSystem === 'ams' ? 'Purga/torre (si se informó)' : form.colorSystem === 'multihead' ? 'Cebado/torre por cabezal' : 'Cebado/torre (si existe)'}><div className="pp-unit"><input type="number" min="0" step="0.01" value={f.towerGrams} onChange={(e) => updateFilament(f.id, 'towerGrams', e.target.value)} placeholder="—" /><b>g</b></div></Field>
          {form.mode === 'partial' && remainder > 0 && form.partialKind === 'specific' && <Field label="g última cama" error={errors[`partial-${index}`]}><div className="pp-unit"><input type="number" min="0" step="0.01" value={f.partialGrams} onChange={(e) => updateFilament(f.id, 'partialGrams', e.target.value)} /><b>g</b></div></Field>}
          <Field label="Precio/kg (opcional)"><div className="pp-unit"><b>$</b><input type="number" min="0" step="0.01" value={f.priceKg} onChange={(e) => updateFilament(f.id, 'priceKg', e.target.value)} /></div></Field>
          <Field label="Stock disponible (opcional)" hint="Vacío significa sin informar, no cero."><div className="pp-unit"><input type="number" min="0" step="0.01" value={f.stock} onChange={(e) => updateFilament(f.id, 'stock', e.target.value)} /><b>g</b></div></Field>
        </div>
      </div>)}</div>
    </section>

    <div className={'pp-calc-actions' + (guidedMode && plannerStep !== 3 ? ' pp-stage-hidden' : '')} data-tour="calculate">{guidedMode && <button type="button" className="btn ghost" onClick={() => setPlannerStep(2)}>Anterior</button>}<button type="button" className="btn primary big" onClick={calculate}><Icon name="calculator" size={19} /> Calcular producción</button><button type="button" className="btn ghost" onClick={reset}>Restablecer</button></div>

    {result?.ok && (!guidedMode || plannerStep === 4) && <section className="pp-results" data-tour="results">
      {guidedMode && <div className="pp-step-actions pp-result-back"><button type="button" className="btn ghost" onClick={() => setPlannerStep(3)}>Anterior: filamentos</button><span /></div>}
      <div className="pp-result-head"><div><div className="section-label">RESULTADO</div><h2>{form.jobName || 'Plan de producción'}{form.client ? ` · ${form.client}` : ''}</h2></div><div className="pp-result-actions"><button className="btn ghost sm" onClick={async () => { await navigator.clipboard.writeText(resultSummary(form, result)); notify('ok', 'Resumen copiado para WhatsApp.'); }}><Icon name="message" size={15} /> Copiar resumen</button><button className="btn ghost sm" onClick={() => downloadCsv(form, result)}><Icon name="grid" size={15} /> Exportar CSV</button></div></div>
      <div className="pp-system-result"><span>Sistema considerado</span><b>{result.colorSystemLabel}</b></div>
      {result.estimatedPartial && <div className="pp-alert">⚠️ {result.colorSystem === 'ams' ? 'En la cama parcial se escaló el material del modelo y se mantuvo fija la purga/torre identificada. Si el archivo no separa esos gramos, el resultado sigue siendo aproximado.' : 'No se aplicó ninguna purga propia de AMS. El cálculo solo mantiene como gasto fijo el cebado o torre que figure informado; el resto se escala proporcionalmente.'} El tiempo puede variar por calentamiento y cambios de herramienta.</div>}
      <div className="pp-material-plan">
        <div className="pp-material-plan-head"><div><span>COMPRA Y PREPARACIÓN</span><h3>Filamento que tenés que tener listo</h3></div><b>Incluye {formatNumber(result.reservePct, 0)} % de margen</b></div>
        <div className="pp-material-plan-grid">{result.filaments.filter((f) => f.reserveGrams > 0).map((f) => <article key={f.id} className={f.shortage === 0 ? 'enough' : ''}>
          <div className="pp-material-name"><i style={{ background: f.color }} /><span><b>{f.colorName || f.name || f.material || `Filamento ${f.position}`}</b><small>{f.material && f.material !== f.name ? f.material : `Posición ${f.position}`}</small></span></div>
          <div className="pp-material-need"><span>NECESITÁS PARA EL TRABAJO</span><strong>{formatNumber(f.reserveGrams / 1000, 3)} kg</strong><small>{formatNumber(f.reserveGrams)} g con margen · uso base {formatNumber(f.baseGrams)} g</small></div>
          <div className="pp-material-buy"><span>{f.stock == null ? 'COMPRÁ SI PARTÍS DE CERO' : f.shortage > 0 ? 'TENÉS QUE COMPRAR' : 'STOCK SUFICIENTE'}</span><strong>{f.stock != null && f.shortage === 0 ? '0 kg' : `${formatNumber(f.spools1kg, 0)} kg`}</strong><small>{f.stock != null && f.shortage === 0 ? `Tenés ${formatNumber(f.stock)} g` : `${f.spools1kg} ${f.spools1kg === 1 ? 'bobina' : 'bobinas'} de 1 kg · faltante exacto ${formatNumber(f.purchaseGrams)} g`}</small></div>
        </article>)}</div>
        <div className="pp-material-total"><span><small>Consumo recomendado con margen</small><b>{formatNumber(result.reserveGrams / 1000, 3)} kg</b></span><span className="buy"><small>Compra total en bobinas de 1 kg</small><b>{formatNumber(result.purchaseKg, 0)} kg · {formatNumber(result.purchaseKg, 0)} bobina{result.purchaseKg === 1 ? '' : 's'}</b></span></div>
      </div>
      <div className="pp-stats">
        <div><span>Pedido / producidas</span><b>{result.quantity} / {result.produced}</b></div><div><span>Tandas necesarias</span><b>{result.batches}</b></div><div><span>Piezas por cama</span><b>{result.piecesPerBed}</b></div><div><span>Excedentes</span><b>{result.excess}</b></div>
        <div><span>Tiempo por cama</span><b>{formatDuration(result.bedSeconds)}</b></div><div><span>Horas-máquina</span><b>{formatDuration(result.machineSeconds)}</b></div><div><span>Duración estimada</span><b>{formatDuration(result.durationSeconds)}</b></div><div><span>Filamento recomendado</span><b>{formatNumber(result.reserveGrams / 1000, 3)} kg</b></div><div className="purchase"><span>Compra total</span><b>{formatNumber(result.purchaseKg, 0)} kg</b><small>{formatNumber(result.purchaseKg, 0)} bobina{result.purchaseKg === 1 ? '' : 's'} de 1 kg</small></div>
      </div>
      <div className="card pp-schedule"><h3>Reparto entre impresoras</h3><div>{result.printerLoads.map((printer) => <span key={printer.index}><b>Impresora {printer.index}</b>{printer.batches} {printer.batches === 1 ? 'tanda' : 'tandas'}{printer.partial ? ' · incluye parcial' : ''}<strong>{formatDuration(printer.seconds)}</strong></span>)}</div><small>Supone disponibilidad simultánea, igual rendimiento y el mismo sistema seleccionado. Si mezclás máquinas AMS y multicabezal, planificá cada grupo por separado. No incluye pausas, retiro de piezas ni reinicios.</small></div>
      <div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Color</th><th>Nombre</th><th>g/cama</th><th>g pedido</th><th>kg recomendados</th><th>Stock</th><th>Comprar kg</th><th>Costo opcional</th></tr></thead><tbody>{result.filaments.map((f) => <tr key={f.id}><td><i style={{ background: f.color }} />{f.colorName || '—'}</td><td>{f.name || f.material || `Filamento ${f.position}`}</td><td>{formatNumber(f.gramsPerBed)}</td><td>{formatNumber(f.baseGrams)}</td><td><b>{formatNumber(f.reserveGrams / 1000, 3)}</b><small>{formatNumber(f.reserveGrams)} g</small></td><td>{f.stock == null ? 'Sin informar' : formatNumber(f.stock)}</td><td className={f.spools1kg > 0 ? 'short' : ''}><b>{formatNumber(f.spools1kg, 0)} kg</b><small>{f.spools1kg} bobina{f.spools1kg === 1 ? '' : 's'} · faltan {formatNumber(f.purchaseGrams)} g</small></td><td>{f.baseCost == null ? '—' : <>{money.format(f.baseCost)}<small>Reserva: {money.format(f.reserveCost)}</small></>}</td></tr>)}</tbody><tfoot><tr><th colSpan="3">Total</th><th>{formatGrams(result.baseGrams)}</th><th>{formatNumber(result.reserveGrams / 1000, 3)} kg</th><th /><th>{formatNumber(result.purchaseKg, 0)} kg</th><th>{result.baseCost == null ? '—' : <>{money.format(result.baseCost)}<small>Reserva: {money.format(result.reserveCost)}</small></>}</th></tr></tfoot></table></div>
      {result.filaments.some((f) => f.stock == null) && <div className="pp-alert info">* Sin stock cargado, “Comprar” muestra todo lo que necesitás tener listo. Ingresá tu stock para ver solamente el faltante real.</div>}
      {result.baseCost != null && <div className="pp-alert info">Los importes son solo costo de material. No incluyen mano de obra, energía ni amortización.</div>}
    </section>}
  </div>;
}
