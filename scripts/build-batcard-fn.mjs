// Genera supabase/functions/batcard-submit/index.ts en UN solo archivo (para pegar en el panel de Supabase),
// con las mismas reglas que usa el juego. Correr después de cambiar algo en src/lib/batcard/.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('supabase/functions/batcard-submit', { recursive: true });
await build({
  entryPoints: ['scripts/batcard-submit.src.js'],
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  outfile: 'supabase/functions/batcard-submit/index.ts',
  banner: { js: '// @ts-nocheck\n// GENERADO por scripts/build-batcard-fn.mjs — no editar a mano.\n// Edge Function batcard-submit: rejuega la partida de BATCARD y la registra en el ranking.' },
  logLevel: 'warning',
});
console.log('OK supabase/functions/batcard-submit/index.ts');
