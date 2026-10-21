# BATBOX · by 3DBAT IMPRESIONES

> Todo tu universo maker, en un solo lugar.

Hub web de 3DBAT: herramientas, tutoriales, videos, recursos, comunidad y zona exclusiva de Makers Club.

## Cómo verla en tu compu

1. Doble clic en `iniciar.bat` (la primera vez instala dependencias).
2. Se abre `http://localhost:5173/batbox/`.

O desde una terminal: `npm install` y después `npm run dev`.

### Ver cada estado de membresía (solo en desarrollo)

Sin iniciar sesión, agregando `?simular=` a la URL:

| URL | Qué muestra |
|---|---|
| `http://localhost:5173/batbox/?simular=guest#/club` | Visitante sin sesión |
| `http://localhost:5173/batbox/?simular=none#/club` | Con sesión pero sin registro en Makers Club |
| `http://localhost:5173/batbox/?simular=pending#/club` | Solicitud pendiente |
| `http://localhost:5173/batbox/?simular=member#/club` | Miembro aprobado |
| `http://localhost:5173/batbox/?simular=admin#/admin` | Administrador |
| `http://localhost:5173/batbox/?simular=rejected#/club` | Rechazado (también `suspended`, `expired`) |

El modo simulación no existe en el build publicado (Vite lo elimina).

## Cómo funciona el acceso

- **Mismo Supabase que el Cotizador PRO** (`llciggitqtseosfklbjl`). No hay otra base de usuarios.
- Login con Google. La membresía se consulta con la función existente `get_my_access()`,
  que reconoce a los miembros ya aprobados (por usuario o por email) y los vincula sola.
- **Sesión compartida con el cotizador**: al publicarse en `3dbatimpresiones.github.io/batbox/`
  (mismo origen que el cotizador) ambas apps leen la misma sesión del navegador.
  No se modifica `storageKey` en [src/lib/supabase.js](src/lib/supabase.js) por eso.
  Si algún día se usa un dominio propio, la sesión deja de compartirse (hay que volver a tocar "Ingresar").
- Lo que muestra la interfaz según el estado es solo presentación. El contenido exclusivo real
  se va a proteger en Supabase con RLS (Etapa 3).

## Estructura

```
src/
  config.js            URLs públicas, clave publishable, redes
  lib/supabase.js      cliente Supabase (PKCE, sesión compartida)
  lib/router.js        router por # (compatible con GitHub Pages)
  auth/AuthContext.jsx sesión + estado de membresía
  data/nav.js          secciones (sumar una sección = agregarla acá + App.jsx)
  data/tools.js        herramientas reales
  data/sample.js       DATOS DE EJEMPLO (se reemplazan en la Etapa 4)
  components/          íconos, tarjetas, panel de acceso, layout
  pages/               una página por sección
  styles/base.css      base del sistema de diseño 3DBAT
  styles/batbox.css    layout del portal
```

## Etapas

- [x] **1 · Base visual + auth** (local): estructura, navegación, estados de membresía con `get_my_access()`.
- [x] **2 · Prueba con miembros reales** (login Google local OK; Redirect URLs cargadas en Supabase).
- [x] **3 · Migración `bb_`**: `supabase/001_batbox_contenidos.sql` — probada con 31 tests de RLS en PGlite. Deshacer: `001_rollback.sql`. **Se corre a mano en el SQL Editor.**
- [x] **4 · Secciones conectadas** a Supabase ([src/data/ContentContext.jsx](src/data/ContentContext.jsx)); sin migración usa datos locales.
- [x] **5 · Panel admin** (`#/admin`): crear/editar/publicar/ocultar/destacar/ordenar/borrar contenido + redes sociales.
- [ ] **6 · Pruebas** de los 9 casos (incluye pasar cotizador ↔ BATBOX ya publicado).

### Panel admin

- Lo ven los usuarios con `role='admin'` y `status='approved'` en `authorized_members`.
- Cada escritura la valida Supabase con `is_admin()`; el panel es solo interfaz.
- Pegar un enlace de YouTube/Shorts/Instagram completa plataforma, ID y miniatura solos.
- Pestaña **Miembros** (`#/admin?tab=miembros`): aprobar, rechazar, suspender, reactivar, vencer, agregar, notas y vencimiento. Usa las mismas funciones `admin_*` de Supabase que el panel del cotizador (sin cambios en la base).
- **Miniaturas de Instagram**: Instagram no da un enlace fijo a la portada (los de su CDN vencen). Las de los tutoriales actuales están guardadas en `public/thumbs/ig/<codigo>.jpg` (lista en `src/lib/media.js`). Para contenido nuevo: botón **Subir imagen** en el editor → bucket `batbox-media` (`supabase/002_batbox_imagenes.sql`).
- **Interacción** (migración `003`, probada con 26 tests en PGlite): likes/dislikes y comentarios **solo Makers Club**; cantidades públicas vía `bb_content_stats()`; el autor lo pone la base; antispam 10/10 min; moderación en la pestaña **Comentarios**. Junto a cada video: botón oficial de suscripción de YouTube (iframe `subscribe_embed`) y enlaces para dar like/comentar en YouTube o Instagram (esas plataformas no permiten hacerlo desde otra web).
- **Completar con el enlace**: al pegar un enlace de YouTube/Instagram en un contenido nuevo se completan título, descripción y miniatura (editables). Lo hace la Edge Function `bb-link-preview` (solo admins; copia la portada de Instagram al bucket `batbox-media`). Sin la función, para YouTube igual trae título y miniatura vía oEmbed.
- Probar el panel sin migración (solo dev): `http://localhost:5173/batbox/?simular=admin&simdb#/admin` (no guarda).

## Archivos privados

La carpeta `supabase/` (migraciones SQL y Edge Functions) queda solo en la compu: está en `.gitignore` y no se publica.

## Reglas

- No tocar el Cotizador PRO ni la tabla `authorized_members` desde acá.
- Nunca poner la `service_role` key ni secretos en el frontend.
- Dependencias con versión exacta (`.npmrc` → `save-exact`).
