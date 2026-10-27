import { strFromU8, unzipSync } from 'fflate';

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_FILES = 500;
const MAX_ZIP_ENTRY = 150 * 1024 * 1024;
const MAX_ZIP_TOTAL = 300 * 1024 * 1024;

const num = (value) => {
  const n = Number.parseFloat(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function lineValue(text, keys) {
  for (const key of keys) {
    const match = text.match(new RegExp(`^\\s*;?\\s*${key}\\s*[:=]\\s*(.+)$`, 'im'));
    if (match) return match[1].trim();
  }
  return null;
}

function list(value) {
  if (!value) return [];
  return value.split(/[;,]/).map((v) => v.trim().replace(/^"|"$/g, '')).filter(Boolean);
}

function numberList(value) {
  return list(value).map(num).filter((v) => v != null);
}

function parseTime(text) {
  const seconds = lineValue(text, ['total time_seconds', 'time_seconds']);
  if (seconds && num(seconds) > 0) return { seconds: num(seconds), source: 'Segundos totales informados por el laminador' };
  const raw = lineValue(text, ['total estimated time', 'estimated printing time.*', 'model printing time']);
  if (!raw) return null;
  const days = num((raw.match(/([\d.]+)\s*d/i) || [])[1]) || 0;
  const hours = num((raw.match(/([\d.]+)\s*h/i) || [])[1]) || 0;
  const minutes = num((raw.match(/([\d.]+)\s*m(?!s)/i) || [])[1]) || 0;
  const secs = num((raw.match(/([\d.]+)\s*s/i) || [])[1]) || 0;
  const total = days * 86400 + hours * 3600 + minutes * 60 + secs;
  return total > 0 ? { seconds: total, source: 'Tiempo estimado informado por el laminador' } : null;
}

function normalizeColor(value, index) {
  const clean = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(clean) ? clean : ['#F78EB6', '#5DDADB', '#FBBF24', '#A78BFA', '#34D399', '#FB7185'][index % 6];
}

function colorName(value) {
  const clean = String(value || '').trim().toLowerCase();
  const match = clean.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return '';
  const [r, g, b] = match.slice(1).map((part) => Number.parseInt(part, 16));
  if (Math.max(r, g, b) < 50) return 'Negro';
  if (Math.min(r, g, b) > 240) return 'Blanco';
  if (r > 200 && g < 90 && b < 90) return 'Rojo';
  if (g > 180 && r < 120 && b < 140) return 'Verde';
  if (b > 180 && r < 120 && g < 150) return 'Azul';
  if (r > 200 && g > 180 && b < 100) return 'Amarillo';
  return '';
}

export function parseGCodeText(text, name = 'archivo.gcode') {
  const time = parseTime(text);
  const perFilament = numberList(lineValue(text, ['filament used \\[g\\]']));
  const totalExplicit = num(lineValue(text, ['total filament (?:used|weight) \\[g\\]']));
  const model = numberList(lineValue(text, ['model filament (?:used )?\\[g\\]', 'filament used for (?:model|object) \\[g\\]']));
  const tower = numberList(lineValue(text, ['(?:wipe )?tower filament (?:used )?\\[g\\]', 'filament used for (?:wipe )?tower \\[g\\]']));
  const colors = list(lineValue(text, ['filament_colour', 'filament_color']));
  const types = list(lineValue(text, ['filament_type', 'material_type']));
  const settings = list(lineValue(text, ['filament_settings_id']));
  const count = Math.max(perFilament.length, model.length, tower.length, colors.length, types.length, settings.length, totalExplicit != null ? 1 : 0);
  const warnings = [];
  let grams = perFilament;
  let includes = 'No se pudo determinar si el consumo incluye purgas o torre.';
  if (perFilament.length) includes = 'Se usa el consumo por filamento informado por el laminador; no se suma nuevamente torre ni purgas.';
  else if (model.length && tower.length && model.length === tower.length) {
    grams = model.map((value, i) => value + tower[i]);
    includes = 'El archivo separa modelo y torre; el total mostrado suma ambos una sola vez.';
  } else if (totalExplicit != null) {
    grams = [totalExplicit];
    includes = 'Se usa el total explícito del laminador; no se suma ninguna categoría adicional.';
  }
  if (totalExplicit != null && grams.length > 1) {
    const rows = grams.reduce((sum, value) => sum + value, 0);
    if (Math.abs(rows - totalExplicit) > Math.max(0.05, totalExplicit * 0.01)) warnings.push(`El total declarado (${totalExplicit.toFixed(2)} g) no coincide con las filas (${rows.toFixed(2)} g). Revisá los datos antes de calcular.`);
  }
  if (!time) warnings.push('No se detectó un tiempo de impresión confiable. Completalo manualmente.');
  if (!grams.length) warnings.push('No se detectó consumo en gramos. Completalo manualmente; no se convierten metros a gramos.');
  warnings.push('El G-code no informa de forma confiable cuántas piezas comerciales hay en la cama. Ingresá ese valor manualmente.');
  const filaments = Array.from({ length: Math.max(count, grams.length) }, (_, index) => ({
    position: String(index + 1),
    name: settings[index] || types[index] || `Filamento ${index + 1}`,
    material: types[index] || '',
    color: normalizeColor(colors[index], index),
    colorName: colorName(colors[index]),
    gramsPerBed: grams[index] ?? null,
    modelGrams: model[index] ?? null,
    towerGrams: tower[index] ?? null,
  })).filter((f) => f.gramsPerBed != null || f.modelGrams != null || f.towerGrams != null || f.name || f.material);
  return {
    kind: 'gcode', name, sliced: true, producer: lineValue(text, ['generated by', 'slicer']) || 'G-code',
    plates: [{ id: '1', name: 'Cama 1', seconds: time?.seconds ?? null, filaments, totalGrams: totalExplicit, includes, warnings }],
    warnings,
  };
}

function inspectZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El 3MF no es un ZIP válido o está incompleto.');
  const entries = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entries > MAX_ZIP_FILES) throw new Error(`El 3MF tiene demasiados archivos internos (${entries}; máximo ${MAX_ZIP_FILES}).`);
  let offset = centralOffset, total = 0;
  const names = [];
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('El índice interno del 3MF está dañado.');
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (size === 0xffffffff) throw new Error('Los 3MF ZIP64 todavía no están soportados.');
    if (size > MAX_ZIP_ENTRY) throw new Error('El 3MF contiene un archivo interno demasiado grande.');
    total += size;
    if (total > MAX_ZIP_TOTAL) throw new Error('El 3MF descomprimido supera el límite seguro de 300 MB.');
    names.push(new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

function attrs(tag) {
  const out = {};
  for (const match of tag.matchAll(/([:\w-]+)="([^"]*)"/g)) out[match[1]] = match[2];
  return out;
}

function metadataOf(block) {
  const out = {};
  for (const match of block.matchAll(/<metadata\s+([^>]*?)\/?>(?:([^<]*)<\/metadata>)?/gi)) {
    const a = attrs(match[1]);
    const key = a.key || a.name;
    if (key) out[key] = a.value ?? match[2]?.trim() ?? '';
  }
  return out;
}

function plateFromBlock(block, index) {
  const meta = metadataOf(block);
  const filaments = [...block.matchAll(/<filament\s+([^>]*?)\/?\s*>/gi)].map((match, i) => {
    const a = attrs(match[1]);
    return {
      position: String(a.id || i + 1), name: a.type || `Filamento ${a.id || i + 1}`, material: a.type || '',
      color: normalizeColor(a.color, i), colorName: '', gramsPerBed: num(a.used_g), modelGrams: null, towerGrams: null,
    };
  }).filter((f) => f.gramsPerBed != null);
  return {
    id: String(meta.index || meta.plater_id || index + 1), name: meta.plate_name || meta.plater_name || `Cama ${index + 1}`,
    seconds: num(meta.prediction) || num(meta.time_seconds), filaments, totalGrams: num(meta.weight),
    includes: filaments.length ? 'Se usa used_g de cada filamento en los metadatos del laminador; no se suman nuevamente torre ni purgas.' : 'No se detectó consumo por filamento.',
    warnings: ['La cantidad de piezas por cama requiere confirmación manual; no se cuentan mallas ni volúmenes.'],
  };
}

function parseJson(bytes) {
  if (!bytes) return null;
  try { return JSON.parse(strFromU8(bytes)); } catch { return null; }
}

function projectInfo(files, names) {
  const settingsKey = names.find((key) => /(?:^|\/)project_settings\.config$/i.test(key));
  const modelSettingsKey = names.find((key) => /(?:^|\/)model_settings\.config$/i.test(key));
  const settings = parseJson(settingsKey ? files[settingsKey] : null) || {};
  const colors = Array.isArray(settings.filament_colour) ? settings.filament_colour : [];
  const types = Array.isArray(settings.filament_type) ? settings.filament_type : [];
  const profiles = Array.isArray(settings.filament_settings_id) ? settings.filament_settings_id : [];
  const nozzles = Array.isArray(settings.nozzle_diameter) ? settings.nozzle_diameter : [];
  const filamentCount = Math.max(colors.length, types.length, profiles.length);
  const headCount = Math.max(nozzles.length, Array.isArray(settings.extruder_type) ? settings.extruder_type.length : 0);
  const colorSystem = headCount > 1 ? 'multihead' : filamentCount > 1 ? 'ams' : (headCount === 1 || filamentCount === 1) ? 'single' : null;
  const filaments = Array.from({ length: filamentCount }, (_, index) => ({
    position: String(index + 1), name: profiles[index] || types[index] || `Filamento ${index + 1}`,
    material: types[index] || '', color: normalizeColor(colors[index], index), colorName: colorName(colors[index]),
    gramsPerBed: null, modelGrams: null, towerGrams: null,
  }));
  const modelSettings = modelSettingsKey ? strFromU8(files[modelSettingsKey]) : '';
  const plates = [...modelSettings.matchAll(/<plate(?:\s[^>]*)?>([\s\S]*?)<\/plate>/gi)].map((match, index) => {
    const meta = metadataOf(match[1]);
    const objectCount = (match[1].match(/<model_instance\b[^>]*\/?\s*>/gi) || []).length;
    const thumbnailFile = meta.thumbnail_file || meta.thumbnail_no_light_file || '';
    return {
      id: String(meta.plater_id || index + 1), name: meta.plater_name || `Cama ${index + 1}`,
      seconds: null, filaments: filaments.map((row) => ({ ...row })), totalGrams: null, objectCount,
      thumbnailFile, thumbnail: thumbnailFile && files[thumbnailFile] ? files[thumbnailFile].slice() : null,
      includes: null, warnings: [],
    };
  });
  return { printerModel: settings.printer_model || '', colorSystem, filaments, plates };
}

export function parse3MFBuffer(buffer, name = 'archivo.3mf') {
  const names = inspectZip(buffer);
  const files = unzipSync(new Uint8Array(buffer));
  const sliceKey = names.find((key) => /(?:^|\/)slice_info\.config$/i.test(key));
  const gcodeKeys = names.filter((key) => /\.gcode$/i.test(key)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const modelKey = names.find((key) => /\.model$/i.test(key));
  const modelText = modelKey ? strFromU8(files[modelKey]) : '';
  const application = (modelText.match(/<metadata\s+name="Application"[^>]*>([^<]+)</i) || [])[1] || '3MF';
  const project = projectInfo(files, names);
  let plates = [];
  if (sliceKey) {
    const xml = strFromU8(files[sliceKey]);
    plates = [...xml.matchAll(/<plate(?:\s[^>]*)?>([\s\S]*?)<\/plate>/gi)].map((match, index) => plateFromBlock(match[1], index));
  }
  const gcodePlates = gcodeKeys.map((key, index) => ({ ...parseGCodeText(strFromU8(files[key]), key).plates[0], id: String(index + 1), name: `Cama ${index + 1}` }));
  if (!plates.length) plates = gcodePlates;
  else gcodePlates.forEach((gcode, index) => {
    if (!plates[index]) plates[index] = gcode;
    else plates[index] = {
      ...plates[index],
      seconds: plates[index].seconds ?? gcode.seconds,
      filaments: plates[index].filaments.length ? plates[index].filaments : gcode.filaments,
      totalGrams: plates[index].totalGrams ?? gcode.totalGrams,
      includes: plates[index].filaments.length ? plates[index].includes : gcode.includes,
      warnings: [...new Set([...(plates[index].warnings || []), ...(gcode.warnings || [])])],
    };
  });
  if (plates.length && project.plates.length) plates = plates.map((plate, index) => ({
    ...plate,
    objectCount: project.plates[index]?.objectCount ?? plate.objectCount ?? null,
    thumbnailFile: project.plates[index]?.thumbnailFile || plate.thumbnailFile || '',
    thumbnail: project.plates[index]?.thumbnail || plate.thumbnail || null,
  }));
  const hasUsableSliceStats = plates.some((plate) => plate.seconds > 0 || plate.filaments?.some((f) => f.gramsPerBed != null));
  const sliced = Boolean(gcodeKeys.length || hasUsableSliceStats);
  const warnings = [];
  if (!sliced) {
    if (project.plates.length) plates = project.plates;
    else if (!plates.length) plates = [{ id: '1', name: 'Carga manual', seconds: null, filaments: project.filaments, objectCount: null, warnings: [] }];
    warnings.push('El 3MF es un proyecto guardado sin G-code ni estadísticas finales. Podemos leer impresora, placas y materiales, pero el tiempo y los gramos deben cargarse manualmente o venir de una placa ya laminada.');
  }
  if (sliced && !plates.length) warnings.push('Se detectaron datos de laminado, pero no una cama utilizable. Completá los datos manualmente.');
  return {
    kind: '3mf', name, sliced, producer: application, printerModel: project.printerModel,
    colorSystem: project.colorSystem,
    plates: plates.length ? plates : [{ id: '1', name: 'Carga manual', seconds: null, filaments: project.filaments, warnings: [] }], warnings,
  };
}

export function mergePlateStats(projectInfo, targetIndex, statsInfo) {
  const source = statsInfo?.plates?.find((plate) => plate.seconds > 0 || plate.filaments?.some((f) => f.gramsPerBed != null));
  if (!source) throw new Error('El archivo complementario no contiene tiempo ni consumo en gramos. Exportá el G-code después de laminar esa cama.');
  if (!projectInfo?.plates?.[targetIndex]) throw new Error('La cama seleccionada ya no está disponible. Volvé a elegirla.');
  const target = projectInfo.plates[targetIndex];
  const count = Math.max(target.filaments?.length || 0, source.filaments?.length || 0);
  const filaments = Array.from({ length: count }, (_, index) => {
    const current = target.filaments?.[index] || {};
    const detected = source.filaments?.[index] || {};
    return {
      ...current,
      position: current.position || detected.position || String(index + 1),
      name: current.name || detected.name || `Filamento ${index + 1}`,
      material: current.material || detected.material || '',
      color: current.color || detected.color || normalizeColor('', index),
      colorName: current.colorName || detected.colorName || '',
      gramsPerBed: detected.gramsPerBed ?? current.gramsPerBed ?? null,
      modelGrams: detected.modelGrams ?? current.modelGrams ?? null,
      towerGrams: detected.towerGrams ?? current.towerGrams ?? null,
    };
  });
  const plates = projectInfo.plates.map((plate, index) => index === targetIndex ? {
    ...plate,
    seconds: source.seconds ?? plate.seconds ?? null,
    filaments,
    totalGrams: source.totalGrams ?? plate.totalGrams ?? null,
    includes: source.includes || 'Tiempo y consumos completados desde el archivo laminado.',
    warnings: [...new Set([...(source.warnings || [])])].filter((warning) => !/piezas.*cama|cantidad de piezas/i.test(warning)),
    statsSource: statsInfo.name || 'G-code complementario',
  } : plate);
  const allComplete = plates.every((plate) => plate.seconds > 0 && plate.filaments?.some((f) => f.gramsPerBed != null));
  return { ...projectInfo, plates, sliced: allComplete, companion: true };
}

export async function parseProductionFile(file) {
  if (!file) throw new Error('Elegí un archivo.');
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo supera el límite de 100 MB. Exportá solo la cama necesaria o completá los datos manualmente.');
  if (/\.3mf$/i.test(file.name)) return parse3MFBuffer(await file.arrayBuffer(), file.name);
  if (/\.(gcode|gco)$/i.test(file.name)) return parseGCodeText(await file.text(), file.name);
  throw new Error('Formato no compatible. Usá G-code, GCO o 3MF; también podés completar todo manualmente.');
}
