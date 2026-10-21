import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BATBOX se publica en https://3dbatimpresiones.github.io/batbox/
// (mismo origen que el Cotizador PRO → comparten la sesión de Supabase).
export default defineConfig({
  base: '/batbox/',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
