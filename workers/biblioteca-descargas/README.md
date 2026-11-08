# Biblioteca 3D — puente de descargas (etapa A, prueba)

Todo gratis: Google Cloud (API de Drive) + Cloudflare Workers plan gratis + Supabase actual.

## 1. Google Cloud (cuenta dedicada a la biblioteca)
1. console.cloud.google.com → crear proyecto `batbox-biblioteca` (no hace falta facturación).
2. "APIs y servicios" → habilitar **Google Drive API**.
3. "IAM" → "Cuentas de servicio" → crear `biblioteca-lector` (sin roles).
4. En la cuenta → "Claves" → "Agregar clave" → JSON. Guardar el archivo fuera del repo.
5. En Google Drive: compartir **solo** la carpeta raíz de la biblioteca con el correo de la cuenta de servicio, como **Lector**.

## 2. Supabase
Correr `supabase/058_batbox_biblioteca_prueba.sql` en el SQL Editor (rollback: `058_rollback.sql`).

## 3. Cloudflare
1. Crear cuenta gratis en dash.cloudflare.com.
2. En esta carpeta:
   ```
   npx wrangler login
   npx wrangler secret put SUPABASE_URL          (https://llciggitqtseosfklbjl.supabase.co)
   npx wrangler secret put SUPABASE_SERVICE_KEY  (Supabase → Settings → API → service_role)
   npx wrangler secret put GOOGLE_SA_JSON        (pegar el JSON completo de la clave)
   npx wrangler deploy
   ```
3. Abrir `https://<worker>.workers.dev/salud` → debe decir `ok`.

## 4. Prueba
1. Subir un STL a la carpeta de la biblioteca. Copiar su ID desde el enlace de Drive (`/file/d/<ID>/`).
2. En el SQL Editor:
   ```sql
   insert into public.bb_lib_grants (file_key, file_name)
   values ('<ID>', 'prueba.stl') returning token;
   ```
3. Abrir `https://<worker>.workers.dev/d/<token>` → debe descargarse.
4. Comprobar: el sexto uso del mismo enlace da 403; tras 10 minutos también; un archivo grande (>500 MB) se descarga completo y se puede reanudar.
