# BAT RIFAS

Talonario propio de 3DBAT / Makers 3DBAT (reemplaza Rifary). El sorteo se hace por fuera; el entregable final es el padrón CSV.

## Rutas
- `#/rifas/<slug>`: talonario público (sin cuenta)
- `#/rifas/p/<token>`: participación privada (token de 64 hex, va en el correo)
- `#/rifas/v/<código>`: verificación pública del QR (solo rifa, número y validez)
- `#/admin?tab=rifas`: panel (solo `is_admin()`)
- `https://3dbat.com.ar/rifa/?r=<slug>`: enlace para compartir con vista previa de WhatsApp (`web-3dbat/public/rifa/index.php`), que redirige al hash

## Piezas
- `supabase/076_batbox_rifas.sql` (+ `076_rollback.sql`, `076_seed_rifa_prueba.sql`): tablas, reglas, permisos y bucket privado `bb-rifas-comprobantes`
- `supabase/functions/bb-rifas`: subida de comprobantes (validación por bytes, 5 MB) y correos (Resend)
- `src/lib/rifasApi.js`, `src/pages/Rifas.jsx`, `src/pages/AdminRifas.jsx`, `src/styles/rifas.css`

## Reglas clave
- Reserva atómica: `FOR UPDATE` sobre la rifa más un índice único parcial `(rifa, número)` para los números vivos. Los reintentos usan `client_key` y las acciones admin usan `op_key`.
- Importes en centavos (`bigint`). Fechas en `timestamptz`; todo lo que se ve está en America/Argentina/Buenos_Aires.
- El vencimiento se calcula al leer (`bb_rf_entry_live`) y se limpia de forma diferida en cada reserva o consulta.
- Con participaciones ya cargadas, el precio y el rango quedan bloqueados. Si cambian las bases, se crea una versión nueva y cada participación guarda la que aceptó.
- Padrón: hay que cerrar la rifa y no puede quedar nada en revisión ni pendiente. Cada versión se congela (filas, CSV y SHA-256). Para generar una versión nueva hace falta un motivo. Cada descarga queda registrada.

## CSV
El perfil `rifary` (por defecto) copia el export real de Rifary: UTF-8 con BOM, LF, sin salto final, encabezado `"number","name","phone","email","status","code","date",seller,seller_code`, una fila por número ordenada, número con ceros a la izquierda, `status` `PAID`, `code` compartido por participación y fecha `DD/MM/AAAA`.
Nombre y email llevan un `'` delante si empiezan con `= + - @`. El teléfono solo admite dígitos, espacios y `+`, y sale tal cual (como en Rifary).
El perfil `provisional` trae `numero,nombre,telefono,email,id_participacion,confirmado_el`.
Ejemplo con datos ficticios: `ejemplo-padron-ficticio.csv`.

## Pruebas
- `npm run test:rifas [carpeta]`: migración en PGlite, 70 chequeos. Genera el CSV de ejemplo.
- `npm run build`

## Para producción
1. Correr 076 en SQL Editor.
2. Desplegar `bb-rifas` con "Verify JWT" desactivado.
3. Secrets `RESEND_API_KEY`, `RIFAS_MAIL_FROM` (dominio verificado en Resend) y, si hace falta, `RIFAS_PUBLIC_URL`.
4. Publicar web-3dbat con `rifa/index.php`.
5. Probar con el sorteador real de la comunidad el CSV de ejemplo.
