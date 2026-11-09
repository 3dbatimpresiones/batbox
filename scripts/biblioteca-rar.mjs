// Lectura de RAR para la Biblioteca 3D (node-unrar-js, WebAssembly: no hace falta WinRAR).
// A diferencia del ZIP, el RAR se baja entero: no se puede leer solo un pedazo.
import { createExtractorFromData } from 'node-unrar-js';

const SKIP = /(^|[\\/])(__MACOSX|\.DS_Store|Thumbs\.db)/i;
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

export const isRar = (buf) => buf.length > 7 && buf.subarray(0, 4).toString('latin1') === 'Rar!';

// Lista de piezas (nombre y tamaño) sin descomprimir.
export async function rarList(buf) {
  const ex = await createExtractorFromData({ data: ab(buf) });
  const out = [];
  for (const h of ex.getFileList().fileHeaders) {
    if (h.flags.directory || SKIP.test(h.name)) continue;
    if (h.flags.encrypted) throw new Error('el RAR tiene contraseña');
    out.push({ name: h.name.split(/[\\/]/).pop(), size: h.unpSize });
  }
  return out;
}

// Descomprime los archivos que pasen el filtro (por nombre). Devuelve { nombre: Uint8Array }.
export async function rarExtract(buf, keep = () => true) {
  const ex = await createExtractorFromData({ data: ab(buf) });
  const out = {};
  const { files } = ex.extract({ files: (h) => !h.flags.directory && !SKIP.test(h.name) && keep(h.name) });
  for (const f of files) if (f.extraction) out[f.fileHeader.name.replace(/\\/g, '/')] = f.extraction;
  return out;
}
