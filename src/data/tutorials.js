// =====================================================================
// TUTORIALES REALES de 3DBAT (BAT ACADEMY)
// Importados el 2026-10-21 desde la extensión "Makers 3DBAT Admin Suite"
// (sección Tutoriales). Las descripciones son borradores a partir del
// título: la extensión no tenía descripción cargada.
// TODO(Etapa 4-5): pasan a Supabase y se editan desde el panel admin.
// Orden: el más reciente agregado primero.
// =====================================================================

export const ACADEMY_CATEGORIES = ['Bambu Lab A1 / A1 Mini', 'Slicer', 'Diseño y modelos', 'Trucos y mantenimiento'];

const A1 = 'Bambu Lab A1 / A1 Mini';

// embeddable: false cuando el video tiene desactivada la inserción en YouTube
// (se muestra la miniatura y se abre en YouTube). Si se activa en YouTube Studio
// → Detalles → "Permitir inserción", se puede sacar el `false`.
const yt = (id, embeddable = true) => ({
  platform: 'youtube', youtubeId: embeddable ? id : null,
  url: `https://www.youtube.com/watch?v=${id}`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
});
const ig = (code) => ({ platform: 'instagram', instagramCode: code, url: `https://www.instagram.com/p/${code}/` });

const T = (o) => ({ kind: 'tutorial', access: 'free', sample: false, ...o });

export const TUTORIALS = [
  T({ id: 'tut-z-offset-a1', title: 'Z OFFSET BAMBULAB A1 / A1 MINI', description: 'Cómo ajustar el Z offset de tu A1 / A1 Mini.', category: A1, ...ig('DMthGPcxbaQ') }),
  T({ id: 'tut-doblar-piezas', title: 'Doblar piezas con la CAMA de tu impresora 3D', description: 'Usá el calor de la cama para doblar y darle forma a piezas impresas.', category: 'Trucos y mantenimiento', ...ig('DEVyWWoxJsn') }),
  T({ id: 'tut-cambio-boquilla-a1', title: 'Cambio de BOQUILLA / NOZZLE en 1 minuto BambuLab A1 / A1 MINI', description: 'Paso a paso para cambiar la boquilla de tu A1 / A1 Mini en un minuto.', category: A1, ...ig('DEnb5WLSir4') }),
  T({ id: 'tut-tubos-teflon-a1', title: 'Coloca correctamente los TUBOS DE TEFLÓN guía en BambuLab A1 / A1 MINI', description: 'Cómo ubicar bien los tubos de teflón guía de la A1 / A1 Mini.', category: A1, ...ig('DL_BpsRRy9Z') }),
  T({ id: 'tut-soportes', title: 'SOPORTES — dónde SÍ y dónde NO según el caso', description: 'Cuándo conviene poner soportes y cuándo no, según la pieza.', category: 'Slicer', ...ig('DN_fB6DEW60') }),
  T({ id: 'tut-primera-capa-a1', title: 'Solución a la PRIMER CAPA APLASTADA en A1 / A1 MINI', description: 'Cómo solucionar la primera capa aplastada en la A1 / A1 Mini.', category: A1, ...ig('DPzx5-WEbBN') }),
  T({ id: 'tut-roce-boquilla-a1', title: 'Elimina el ROCE de boquilla en tu BambuLab A1 / A1 MINI', description: 'Cómo evitar que la boquilla roce las piezas en la A1 / A1 Mini.', category: A1, ...ig('DN7AqpLDi1w') }),
  T({ id: 'tut-limpiar-cama', title: 'Limpia la CAMA de tu impresora 3D con estos 2 métodos', description: 'Dos métodos para limpiar la cama de tu impresora 3D.', category: 'Trucos y mantenimiento', ...ig('DUoCF6vEYAh') }),
  T({ id: 'tut-retirar-filamento-a1', title: 'Cómo retirar el filamento manualmente de tu A1 / A1 MINI en 2 minutos', description: 'Cómo sacar el filamento a mano de tu A1 / A1 Mini en 2 minutos.', category: A1, ...ig('DOOz7fcEfWo') }),
  T({ id: 'tut-bajar-version-a1', title: 'Baja de versión A1 / A1 MINI a la más estable', description: 'Cómo volver tu A1 / A1 Mini a la versión de firmware más estable.', category: A1, ...ig('DUq_u2dEs36') }),
  T({ id: 'tut-objetos-apilados', title: 'Coloca objetos UNO sobre OTRO sin que se bajen solos a la cama', description: 'Cómo apilar objetos en el slicer sin que bajen solos a la cama.', category: 'Slicer', ...ig('DVgnzHjEfpH') }),
  T({ id: 'tut-foto-a-stl', title: 'Convertí cualquier FOTO a OBJETO 3D en formato STL', description: 'Pasá cualquier foto a un objeto 3D en formato STL.', category: 'Diseño y modelos', ...ig('DOJMBfgDn4O') }),
  T({ id: 'tut-torre-purga-orca', title: 'TORRE DE PURGA EN ORCA SLICER - SOLUCIÓN DEFINITIVA', description: 'La solución definitiva para la torre de purga en Orca Slicer.', category: 'Slicer', featured: true, ...yt('gwC5o0jazFg') }),
  T({ id: 'tut-llaveros-una-capa', title: 'LLAVEROS EN UNA CAPA CON SOLO 1 FOTO SIN DISEÑAR NADA', description: 'Llaveros en una sola capa a partir de una foto, sin diseñar nada.', category: 'Diseño y modelos', featured: true, ...yt('W4zFluOZnjA', false) }),
];

export const PLATFORM_LABEL = { youtube: 'YouTube', short: 'YouTube Shorts', instagram: 'Instagram', other: 'Enlace' };
