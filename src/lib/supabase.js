import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';

// IMPORTANTE: no definir `storageKey`.
// Con la clave por defecto (sb-llciggitqtseosfklbjl-auth-token) BATBOX lee y
// escribe la MISMA sesión que el Cotizador PRO, porque ambos viven en
// 3dbatimpresiones.github.io (mismo origen → mismo localStorage).
//
// flowType 'pkce': Google vuelve con ?code=... en lugar de tokens en el #,
// así no choca con el router por hash de BATBOX.
export const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
