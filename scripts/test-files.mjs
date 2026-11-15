// Pruebas de los enlaces de descarga (src/lib/files.js). Correr: node scripts/test-files.mjs
import { downloadKind, fileNameFromUrl } from '../src/lib/files.js';

let ok = 0;
const eq = (a, b, msg) => { if (a !== b) { console.error(`FALLA: ${msg}\n  esperado: ${b}\n  obtenido: ${a}`); process.exit(1); } ok++; };

const gh = 'https://github.com/3dbatimpresiones/batbox/releases/download/batview-basico-1.0.0/BATVIEW3D-Basico-Setup-1.0.0.exe';
eq(downloadKind(gh), 'installer', 'el instalador de la GitHub Release es un instalador');
eq(downloadKind('https://x.com/Setup.MSI?token=1'), 'installer', '.msi en mayúsculas y con parámetros');
eq(downloadKind('https://x.com/archivos/pack.zip'), 'file', 'un ZIP es un archivo');
eq(downloadKind('https://x.com/guia.pdf'), 'file', 'un PDF es un archivo');
eq(downloadKind('https://3dbatimpresiones.github.io/dbcarretesvacios/'), null, 'una página web común no es descarga');
eq(downloadKind('https://3dbat.com.ar/cotizador.html'), null, 'una página .html no es descarga');
eq(downloadKind('https://github.com/3dbatimpresiones/batbox/releases'), null, 'la lista de releases no es una descarga directa');
eq(downloadKind('#/pedidos'), null, 'una sección interna de BATBOX');
eq(downloadKind(''), null, 'sin enlace');
eq(downloadKind(undefined), null, 'enlace indefinido');
eq(downloadKind('https://x.com/exe'), null, 'la palabra exe sin punto no cuenta');
eq(fileNameFromUrl(gh), 'BATVIEW3D-Basico-Setup-1.0.0.exe', 'nombre del archivo desde la ruta');
eq(fileNameFromUrl('https://x.com/mi%20archivo.zip'), 'mi archivo.zip', 'nombre con espacios codificados');
eq(fileNameFromUrl('no es una url'), '', 'url inválida');
console.log(`OK ${ok}/${ok} pruebas de enlaces de descarga`);
