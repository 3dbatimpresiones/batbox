import { strToU8, zipSync } from 'fflate';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function binary3MF(part, name = 'BATTEXTURE 3D') {
  if (!part?.vert?.length || !part?.tri?.length) throw new Error('No hay geometria para exportar en 3MF.');
  const vertices = [];
  for (let i = 0; i < part.vert.length; i += 3) vertices.push(`<vertex x="${part.vert[i]}" y="${part.vert[i + 1]}" z="${part.vert[i + 2]}"/>`);
  const triangles = [];
  for (let i = 0; i < part.tri.length; i += 3) triangles.push(`<triangle v1="${part.tri[i]}" v2="${part.tri[i + 1]}" v3="${part.tri[i + 2]}"/>`);
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="es-AR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${esc(name)}</metadata><metadata name="Application">BATTEXTURE 3D · BATBOX</metadata><metadata name="Description">Geometria texturizada fisicamente</metadata><resources><object id="1" name="${esc(name)}" type="model"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  const types = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  return zipSync({ '[Content_Types].xml': strToU8(types), '_rels/.rels': strToU8(rels), '3D/3dmodel.model': strToU8(model) }, { level: 6 });
}

