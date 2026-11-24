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
- `npm run test:rifas -- [carpeta]`: pruebas en PGlite. Con carpeta de salida genera el CSV de ejemplo.
- `npm run build`

## Para producción
1. Correr 076 en SQL Editor.
2. Desplegar `bb-rifas` con "Verify JWT" desactivado.
3. Secrets `RESEND_API_KEY`, `RIFAS_MAIL_FROM` (dominio verificado en Resend) y, si hace falta, `RIFAS_PUBLIC_URL`.
4. Publicar web-3dbat con `rifa/index.php`.
5. Probar con el sorteador real de la comunidad el CSV de ejemplo.

## Web Push

Archivos del circuito: `supabase/079_batbox_rifas_web_push.sql` y `080_batbox_rifas_web_push_cron.sql`; `supabase/functions/bb-rifas-push/index.ts`; `src/lib/rifasPush.js` y `src/components/RafflePush.jsx`; `public/batbox-sw.js`, `public/batbox-manifest.json` y `public/batbox-icon.png` (convertido desde el ícono oficial). Integraciones: `index.html`, `AuthContext.jsx`, las páginas `Rifas.jsx`, `AdminRifas.jsx` y `Batcard.jsx`, y `rifas.css`. Las suites están en `scripts/test-rifas-push*.mjs`.

Cada ticket privado tiene **Notificaciones de esta rifa → Mis avisos**. La bandeja se guarda por participación y funciona sin cuenta ni permiso push. La bandeja de Comunidad depende de la sesión de Makers Club; los avisos de invitados se consultan desde el ticket. Un “Aceptado por el servicio push” es una respuesta del proveedor, no una confirmación de entrega. Sólo el botón de lectura marca un aviso como leído.

El opt-in se hace en el ticket. El correo escrito al reservar no autoriza suscripciones. Se verifica el token privado del ticket, se vincula un dispositivo y se registran preferencias por rifa en ese dispositivo. Las reservas nuevas del mismo navegador se vinculan si se habilitaron avisos para esa rifa. La desvinculación, el cierre de sesión y el cambio de cuenta eliminan los vínculos locales y revocan la suscripción de ese perfil. En un perfil de invitado compartido se usa **Desvincular este dispositivo** desde el ticket. En otro dispositivo, se activa desde el enlace privado del mismo ticket.

La notificación abre `#/rifas/<slug>/mi/<id>` mediante el Service Worker de BATBOX. El identificador de la ruta no autoriza una consulta. La app resuelve el ticket desde el vínculo privado de ese perfil. Si se limpió el almacenamiento local o se cambió de cuenta, hace falta recuperar el enlace del correo. En iOS/iPadOS 16.4 o posterior se agrega BATBOX a la pantalla de inicio; **Rifas → Abrir mi ticket** permite pegar ahí el enlace. El Service Worker sólo maneja avisos y clics; no instala reglas de caché de navegación. BATCARD mantiene su manifiesto e ícono.

Los eventos de negocio se almacenan con la transición que los generó. La cola tiene un registro por evento y dispositivo y hasta cuatro intentos con espera creciente. La baja de una suscripción confirmada por HTTP 404/410 elimina sus claves y preferencias. Los fallos transitorios conservan la suscripción. Los recordatorios se controlan por versión de plazo, se omiten si el plazo inicial es menor a la anticipación, y se invalidan al confirmar, cancelar, vencer o entrar en revisión. BAT Rifas actualmente conserva la reserva en revisión. El flujo administrativo vigente aprueba el pago de la reserva completa; si una operación interna aprueba un subconjunto de tickets, el evento sólo incluye ese subconjunto. La cancelación pública desde el ticket no forma parte del flujo actual. Se notifican las cancelaciones administrativas vigentes.

### Preparación y despliegue

1. En entorno de prueba, aplicar `079_batbox_rifas_web_push.sql` sobre 076–078. Es aditiva y deja el envío general apagado. Aplicar cada migración de esquema una sola vez; `080` sí es reejecutable. No reaplicar 076/078 para desactivar Web Push. Usar el interruptor general y, si hace falta detener el trabajador, desprogramar sólo `bb-rifas-push` desde Supabase Cron.
2. Generar una pareja VAPID, por ejemplo con `npx --yes web-push@3.6.7 generate-vapid-keys` en una consola privada. Cargar `RIFAS_VAPID_PUBLIC_KEY`, `RIFAS_VAPID_PRIVATE_KEY` y `RIFAS_VAPID_SUBJECT` (URI `mailto:` o `https:` de contacto real) en Supabase Edge Functions Secrets. Guardar la pareja en el gestor de secretos. Si rota la clave, los dispositivos deben desvincularse y volver a activar. La función devuelve al cliente únicamente la clave pública.
3. Desplegar la nueva Edge Function `bb-rifas-push` con **Verify JWT desactivado**. El GET sirve la clave pública. El POST de la tarea verifica la clave `bb_rifas_cron` de Vault antes de acceder a la cola. El archivo 080 apunta al proyecto BATBOX de producción; al preparar staging con ese archivo, sustituir la URL por la del proyecto de prueba y usar su propia clave en Vault. Aplicar `080_batbox_rifas_web_push_cron.sql` en el entorno correspondiente. Requiere pg_cron y pg_net. No cambia la tarea existente `bb-rifas-tick` de correo.
4. Publicar el frontend por el flujo habitual, con `/batbox/batbox-sw.js`, `/batbox/batbox-manifest.json` y el ícono. Usar HTTPS y comprobar los tipos JavaScript, JSON y PNG. Para pruebas de entrega en otro origen de staging, agregar su origen a la lista de CORS de la Edge Function y su URL base exacta a la validación SQL de suscripción, en el proyecto de prueba.
5. En **Admin → Rifas → Notificaciones de rifas**, revisar plantillas y permisos. Vincular el dispositivo del administrador y enviar una prueba al evento seleccionado. Desde un ticket ficticio, verificar los avisos de la bandeja y los del dispositivo. Habilitar el interruptor general recién después de la prueba. Volver a habilitarlo no encola avisos que estaban desactivados.

La tarea de push se ejecuta cada minuto, reclama hasta 32 envíos por vuelta y conserva los trabajos durante interrupciones. Con la cola al día, aproximadamente un minuto separa la hora objetivo del intento de envío, más el tiempo del proveedor. El recordatorio inicial se programa 30 minutos antes. Carga, conectividad y permisos pueden demorar u omitir la entrega. El correo conserva su circuito de envío y el vencimiento usa la misma transición de BAT Rifas.

Referencias oficiales: [requisitos de Web Push de WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [programar Edge Functions en Supabase](https://supabase.com/docs/guides/functions/schedule-functions), [PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe).

### Verificación local

- `npm run test:rifas-push`: PGlite, permisos y estados de navegador simulados, varias rifas/dispositivos, enrutamiento seguro y cambio de cuenta, validación del SQL de Cron con extensiones simuladas.
- `npx --yes deno@2.5.6 run --node-modules-dir=none --no-lock --allow-env scripts/test-rifas-push-edge.mjs`: VAPID y cifrado real con Supabase y transporte simulados.
- En staging queda pendiente la entrega real en Chromium/Firefox/Safari y en iPhone/iPad instalado. También la configuración de Vault y la ejecución de las extensiones reales del proyecto.
