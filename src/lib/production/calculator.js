const finite = (value) => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const positiveInt = (value) => Number.isInteger(Number(value)) && Number(value) > 0;
const SYSTEMS = new Set(['single', 'ams', 'multihead']);

export const COLOR_SYSTEM_LABELS = {
  single: 'Una boquilla · un material',
  ams: 'AMS / cambiador · una boquilla',
  multihead: 'Multicabezal / toolchanger',
};

export function validateProduction(input) {
  const errors = {};
  if (!positiveInt(input.quantity)) errors.quantity = 'Ingresá una cantidad entera mayor que cero.';
  if (!positiveInt(input.piecesPerBed)) errors.piecesPerBed = 'Ingresá cuántas piezas reales entran por cama.';
  if (!(finite(input.bedSeconds) > 0)) errors.bedSeconds = 'Ingresá un tiempo por cama mayor que cero.';
  if (!positiveInt(input.printers)) errors.printers = 'La cantidad de impresoras debe ser un entero mayor que cero.';
  if (!(finite(input.reservePct) >= 0 && finite(input.reservePct) <= 500)) errors.reservePct = 'El margen debe estar entre 0 % y 500 %.';
  if (!Array.isArray(input.filaments) || !input.filaments.length) errors.filaments = 'Agregá al menos un filamento.';
  else input.filaments.forEach((f, index) => {
    if (!(finite(f.gramsPerBed) >= 0)) errors[`filament-${index}`] = 'Ingresá gramos por cama válidos.';
  });
  const q = Number(input.quantity), p = Number(input.piecesPerBed);
  const remainder = positiveInt(q) && positiveInt(p) ? q % p : 0;
  if (input.mode === 'partial' && remainder && input.partialKind === 'specific') {
    if (!(finite(input.partialSeconds) > 0)) errors.partialSeconds = 'Ingresá el tiempo de la última cama parcial.';
    input.filaments?.forEach((f, index) => {
      if (!(finite(f.partialGrams) >= 0)) errors[`partial-${index}`] = 'Ingresá los gramos de la última cama parcial.';
    });
  }
  return errors;
}

function distributeDurations(durations, printerCount) {
  const printers = Array.from({ length: printerCount }, (_, index) => ({ index: index + 1, seconds: 0, batches: 0, partial: false }));
  durations.map((duration, index) => ({ ...duration, order: index }))
    .sort((a, b) => b.seconds - a.seconds || a.order - b.order)
    .forEach((duration) => {
      const target = printers.reduce((best, current) => current.seconds < best.seconds ? current : best, printers[0]);
      target.seconds += duration.seconds;
      target.batches += 1;
      target.partial ||= duration.partial === true;
    });
  return printers;
}

export function calculateProduction(input) {
  const errors = validateProduction(input);
  if (Object.keys(errors).length) return { ok: false, errors };

  const quantity = Number(input.quantity);
  const piecesPerBed = Number(input.piecesPerBed);
  const bedSeconds = Number(input.bedSeconds);
  const printersCount = Number(input.printers);
  const reservePct = Number(input.reservePct);
  const colorSystem = SYSTEMS.has(input.colorSystem) ? input.colorSystem : 'ams';
  const fullBatches = Math.floor(quantity / piecesPerBed);
  const remainder = quantity % piecesPerBed;
  const batches = Math.ceil(quantity / piecesPerBed);
  const partialMode = input.mode === 'partial' && remainder > 0;
  const estimatedPartial = partialMode && input.partialKind !== 'specific';
  const specificPartial = partialMode && input.partialKind === 'specific';
  const fullBedsUsed = partialMode ? fullBatches : batches;
  const produced = partialMode ? quantity : batches * piecesPerBed;
  const excess = produced - quantity;
  const factor = remainder / piecesPerBed;
  const partialSeconds = specificPartial ? Number(input.partialSeconds) : estimatedPartial ? bedSeconds * factor : 0;
  const machineSeconds = fullBedsUsed * bedSeconds + partialSeconds;
  const durations = Array.from({ length: fullBedsUsed }, () => ({ seconds: bedSeconds, partial: false }));
  if (partialMode) durations.push({ seconds: partialSeconds, partial: true });
  const printerLoads = distributeDurations(durations, printersCount);

  const filaments = input.filaments.map((f) => {
    const gramsPerBed = Number(f.gramsPerBed);
    const modelGrams = finite(f.modelGrams);
    const reportedWasteGrams = finite(f.towerGrams);
    let partialGrams = 0;
    let fixedWasteGrams = reportedWasteGrams;
    let partialBasis = 'none';
    if (specificPartial) {
      partialGrams = Number(f.partialGrams);
      partialBasis = 'specific';
    } else if (estimatedPartial) {
      if (colorSystem === 'ams' && modelGrams != null) {
        fixedWasteGrams = reportedWasteGrams ?? Math.max(0, gramsPerBed - modelGrams);
        const unclassified = Math.max(0, gramsPerBed - modelGrams - fixedWasteGrams);
        partialGrams = modelGrams * factor + unclassified * factor + fixedWasteGrams;
        partialBasis = 'ams-fixed-waste';
      } else if (reportedWasteGrams != null) {
        const scalable = Math.max(0, gramsPerBed - reportedWasteGrams);
        partialGrams = scalable * factor + reportedWasteGrams;
        partialBasis = 'reported-fixed-waste';
      } else {
        partialGrams = gramsPerBed * factor;
        partialBasis = 'proportional';
      }
    }
    const baseGrams = fullBedsUsed * gramsPerBed + partialGrams;
    const reserveGrams = baseGrams * (1 + reservePct / 100);
    const priceKg = finite(f.priceKg);
    const stock = finite(f.stock);
    const shortage = stock == null ? null : Math.max(0, reserveGrams - stock);
    const purchaseGrams = stock == null ? reserveGrams : shortage;
    return {
      ...f,
      gramsPerBed,
      modelGrams,
      towerGrams: reportedWasteGrams,
      fixedWasteGrams,
      partialBasis,
      partialGrams,
      baseGrams,
      reserveGrams,
      stock,
      shortage,
      purchaseGrams,
      spools1kg: purchaseGrams > 0 ? Math.ceil(purchaseGrams / 1000) : 0,
      baseCost: priceKg == null ? null : baseGrams / 1000 * priceKg,
      reserveCost: priceKg == null ? null : reserveGrams / 1000 * priceKg,
    };
  });
  const sum = (key) => filaments.reduce((total, f) => total + (f[key] || 0), 0);
  const costsComplete = filaments.every((f) => f.baseCost != null);

  return {
    ok: true,
    quantity,
    piecesPerBed,
    fullBatches,
    remainder,
    batches,
    fullBedsUsed,
    partialMode,
    estimatedPartial,
    produced,
    excess,
    bedSeconds,
    partialSeconds,
    machineSeconds,
    durationSeconds: Math.max(...printerLoads.map((p) => p.seconds), 0),
    printerLoads,
    colorSystem,
    colorSystemLabel: COLOR_SYSTEM_LABELS[colorSystem],
    reservePct,
    filaments,
    baseGrams: sum('baseGrams'),
    reserveGrams: sum('reserveGrams'),
    purchaseGrams: sum('purchaseGrams'),
    purchaseKg: sum('spools1kg'),
    baseCost: costsComplete ? sum('baseCost') : null,
    reserveCost: costsComplete ? sum('reserveCost') : null,
  };
}

export const formatNumber = (value, digits = 2) => Number(value).toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatGrams(value) {
  const grams = Number(value) || 0;
  const shown = `${formatNumber(grams)} g`;
  return grams >= 1000 ? `${formatNumber(grams / 1000)} kg (${shown})` : shown;
}

export function formatDuration(totalSeconds) {
  const rounded = Math.round(Number(totalSeconds) || 0);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (seconds && hours === 0) return `${minutes} min ${seconds} s`;
  return `${hours} h ${String(minutes).padStart(2, '0')} min`;
}
