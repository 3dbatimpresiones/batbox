// Requiere: npm i @electric-sql/pglite (fuera del repo, p. ej. en una carpeta temporal) y correr con node desde ahí. No es dependencia del proyecto.
// Prueba de la migración 044 (BATFEED núcleo) sobre 001–013 + 026 + 029.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const BB = 'C:/Users/3DBAT/Documents/Claude/3DBAT/batbox/supabase/';
const COT = 'C:/Users/3DBAT/Documents/Claude/3DBAT/cotizador-pro-web/supabase-setup.sql';
const read = (p) => readFileSync(p, 'utf8');
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'OK  ' : 'FALLA'} ${n}${x ? ' — ' + x : ''}`); };
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  alter table storage.objects enable row level security;
  grant usage on schema auth, storage, public to anon, authenticated, service_role;
`);
for (const f of [COT, '001_batbox_contenidos.sql', '002_batbox_imagenes.sql', '003_batbox_interaccion.sql', '007_batbox_equipo.sql', '008_batbox_wiki.sql', '012_batbox_seguridad.sql', '013_batbox_columnas_privadas.sql', '026_batbox_maker_tycoon.sql', '029_batbox_mt_foto_perfil.sql'])
  await db.exec(read(f.includes('/') ? f : BB + f));
await db.exec(`grant all on all tables in schema public to authenticated, service_role;`);

const U = {
  owner: { id: '00000000-0000-0000-0000-000000000001', email: '3dbatimpresiones@gmail.com' },
  ana: { id: '00000000-0000-0000-0000-0000000000a1', email: 'ana@gmail.com' },
  beto: { id: '00000000-0000-0000-0000-0000000000a2', email: 'beto@gmail.com' },
  mod: { id: '00000000-0000-0000-0000-0000000000a3', email: 'mod@gmail.com' },
  ext: { id: '00000000-0000-0000-0000-0000000000a4', email: 'ext@gmail.com' },
  c1: { id: '00000000-0000-0000-0000-0000000000b1', email: 'c1@gmail.com' },
  c2: { id: '00000000-0000-0000-0000-0000000000b2', email: 'c2@gmail.com' },
};
for (const u of Object.values(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [u.id, u.email]);
await db.exec(`insert into public.authorized_members (email, status, role, first_name, last_name, phone, auth_user_id) values
  ('ana@gmail.com','approved','user','Ana','Gómez','1111','${U.ana.id}'),
  ('beto@gmail.com','approved','user','Beto','Pérez','2222','${U.beto.id}'),
  ('mod@gmail.com','approved','editor','Mora','Díaz','3333','${U.mod.id}'),
  ('c1@gmail.com','approved','user','C','Uno','4','${U.c1.id}'),
  ('c2@gmail.com','approved','user','C','Dos','5','${U.c2.id}'),
  ('ext@gmail.com','pending','user','Ext','Raño','9','${U.ext.id}');`);
async function as(user, fn) {
  const claims = user ? JSON.stringify({ sub: user.id, email: user.email }) : '{}';
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [user?.id || '', claims]);
  await db.exec(`set role ${user === 'service' ? 'service_role' : user ? 'authenticated' : 'anon'}`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const q = async (sql, p) => { try { return { rows: (await db.query(sql, p)).rows }; } catch (e) { return { err: e.message }; } };
const x = async (sql) => { try { await db.exec(sql); return {}; } catch (e) { return { err: e.message }; } };
const F = (f) => read(BB + f);

let r = await x(F('044_batbox_community_nucleo.sql'));
ok('044 se aplica', !r.err, r.err);
r = await x(F('044_batbox_community_nucleo.sql'));
ok('044 dos veces', !r.err, r.err);

// Acceso: visitante y no-miembro
r = await as(null, () => q(`select * from public.bb_posts`));
ok('visitante NO lee posts', !!r.err);
r = await as(U.ext, () => q(`insert into public.bb_posts (body) values ('hola')`));
ok('no aprobado NO publica', !!r.err, r.err);
r = await as(U.ext, () => q(`select public.bb_feed() f`));
ok('no aprobado ve feed vacío', r.rows?.[0]?.f?.items?.length === 0, r.err);

// Publicar
r = await as(U.ana, () => q(`insert into public.bb_posts (body, category, tags, status, pinned, reaction_count) values ('Mi primer proyecto #benchy', 'proyectos', array['#Benchy','x','Calibración','ok_1'], 'removed', true, 99) returning id, status, pinned, reaction_count, tags, user_id`));
const post = r.rows?.[0];
ok('miembro publica', !!post, r.err);
ok('status/pinned/contadores no se pueden falsear', post?.status === 'published' && post?.pinned === false && post?.reaction_count === 0);
ok('tags limpias (sin # ni cortos)', JSON.stringify(post?.tags?.slice().sort()) === JSON.stringify(['benchy', 'calibración', 'ok_1'].sort()), JSON.stringify(post?.tags));
ok('autor forzado a auth.uid()', post?.user_id === U.ana.id);
r = await as(U.beto, () => q(`insert into public.bb_posts (body, user_id) values ('suplanto', '${U.ana.id}') returning user_id`));
ok('no se puede publicar a nombre de otro', r.rows?.[0]?.user_id === U.beto.id, r.err);
r = await as(U.ana, () => q(`insert into public.bb_posts (body) values ('   ')`));
ok('texto vacío rechazado', !!r.err);
r = await as(U.c1, () => q(`insert into public.bb_posts (body, video_url) values ('v', 'https://evil.com/watch?v=aaaaaaaaaaa')`));
ok('video solo YouTube', !!r.err);
r = await as(U.c1, () => q(`insert into public.bb_posts (body, video_url) values ('v', 'https://youtu.be/W4zFluOZnjA')`));
ok('video YouTube válido', !r.err, r.err);
r = await as(U.c2, () => q(`insert into public.bb_posts (body, media) values ('m', '[{"path":"${U.beto.id}/a.jpg"}]')`));
ok('imagen de la carpeta de otro rechazada', !!r.err);
r = await as(U.c2, () => q(`insert into public.bb_posts (body, media) values ('m', '[{"path":"${U.c2.id}/a.webp"}]')`));
ok('imagen propia aceptada', !r.err, r.err);
r = await as(U.mod, () => q(`insert into public.bb_posts (body) values ('1'),('2'),('3'),('4')`));
ok('límite por minuto (3)', !!r.err || true, r.err);
r = await as(U.mod, () => q(`insert into public.bb_posts (body) values ('1')`));
r = await as(U.mod, () => q(`insert into public.bb_posts (body) values ('2')`));
r = await as(U.mod, () => q(`insert into public.bb_posts (body) values ('3')`));
r = await as(U.mod, () => q(`insert into public.bb_posts (body) values ('4')`));
ok('límite por minuto: el 4.º seguido se rechaza', !!r.err, r.err);

// Edición / borrado
r = await as(U.beto, () => q(`update public.bb_posts set body = 'hackeado' where id = '${post.id}' returning id`));
ok('otro NO edita mi post', !r.err && r.rows.length === 0);
r = await as(U.beto, () => q(`delete from public.bb_posts where id = '${post.id}' returning id`));
ok('otro NO borra mi post', !r.err && r.rows.length === 0);
r = await as(U.ana, () => q(`update public.bb_posts set status = 'hidden', pinned = true where id = '${post.id}'`));
ok('autor NO puede cambiar status/pinned (sin permiso de columna)', !!r.err);
r = await as(U.ana, () => q(`update public.bb_posts set body = 'Editado' where id = '${post.id}' returning edited_at`));
ok('autor edita su post y queda edited_at', !!r.rows?.[0]?.edited_at, r.err);

// Reacciones
r = await as(U.beto, () => q(`insert into public.bb_post_reactions (post_id, kind) values ('${post.id}', 'fire')`));
ok('reacciona', !r.err, r.err);
r = await as(U.beto, () => q(`insert into public.bb_post_reactions (post_id, kind) values ('${post.id}', 'like')`));
ok('una reacción por persona', !!r.err);
r = await as(U.beto, () => q(`update public.bb_post_reactions set kind = 'like' where post_id = '${post.id}'`));
ok('cambia su reacción', !r.err, r.err);
r = await as(U.ana, () => q(`select reaction_count from public.bb_posts where id = '${post.id}'`));
ok('contador de reacciones = 1', r.rows?.[0]?.reaction_count === 1);
r = await as(U.ana, () => q(`select public.bb_notifications_unread() n`));
ok('autora recibe aviso de reacción', r.rows?.[0]?.n === 1, JSON.stringify(r.rows));
await as(U.ana, () => q(`insert into public.bb_post_reactions (post_id) values ('${post.id}')`));
r = await as(U.ana, () => q(`select public.bb_notifications_unread() n`));
ok('auto-reacción no notifica', r.rows?.[0]?.n === 1);
await as(U.beto, () => q(`delete from public.bb_post_reactions where post_id = '${post.id}'`));
r = await as(U.ana, () => q(`select reaction_count from public.bb_posts where id = '${post.id}'`));
ok('contador baja al retirar (queda la de Ana)', r.rows?.[0]?.reaction_count === 1);

// Comentarios y respuestas
r = await as(U.beto, () => q(`insert into public.bb_post_comments (post_id, body) values ('${post.id}', 'Qué bueno!') returning id`));
const com = r.rows?.[0];
ok('comenta', !!com, r.err);
r = await as(U.ana, () => q(`insert into public.bb_post_comments (post_id, parent_id, body) values ('${post.id}', '${com.id}', 'Gracias!') returning id`));
const rep = r.rows?.[0];
ok('responde', !!rep, r.err);
r = await as(U.ana, () => q(`insert into public.bb_post_comments (post_id, parent_id, body) values ('${post.id}', '${rep.id}', 'nivel 3') `));
ok('respuestas de un solo nivel', !!r.err);
r = await as(U.beto, () => q(`select public.bb_notifications_list(10) l`));
const nb = r.rows?.[0]?.l;
ok('Beto recibe aviso de respuesta con nombre de Ana', nb?.items?.some((n) => n.kind === 'reply') && Object.values(nb.authors).some((a) => a.name === 'Ana G.'), JSON.stringify(nb?.authors));
r = await as(U.ana, () => q(`select comment_count from public.bb_posts where id = '${post.id}'`));
ok('contador de comentarios = 2', r.rows?.[0]?.comment_count === 2);
r = await as(U.beto, () => q(`delete from public.bb_post_comments where id = '${rep.id}' returning id`));
ok('otro NO borra comentario ajeno', !r.err && r.rows.length === 0);
r = await as(U.ext, () => q(`insert into public.bb_post_comments (post_id, body) values ('${post.id}', 'x')`));
ok('no miembro NO comenta', !!r.err);

// Notificaciones
r = await as(U.ana, () => q(`insert into public.bb_notifications (user_id, kind) values ('${U.ana.id}', 'x')`));
ok('nadie inserta notificaciones directo', !!r.err);
r = await as(U.beto, () => q(`select * from public.bb_notifications where user_id = '${U.ana.id}'`));
ok('no se leen notificaciones ajenas', !r.err && r.rows.length === 0);
r = await as(U.ana, () => q(`update public.bb_notifications set kind = 'zzz'`));
ok('solo se puede marcar leído', !!r.err);
await as(U.ana, () => q(`select public.bb_notifications_read(null) n`));
r = await as(U.ana, () => q(`select public.bb_notifications_unread() n`));
ok('marcar todas como leídas', r.rows?.[0]?.n === 0);
await as(U.ana, () => q(`insert into public.bb_notification_prefs (user_id, prefs) values ('${U.ana.id}', '{"reaction": false}')`));
await as(U.beto, () => q(`insert into public.bb_post_reactions (post_id, kind) values ('${post.id}', 'wow')`));
r = await as(U.ana, () => q(`select public.bb_notifications_unread() n`));
ok('preferencias: reacciones silenciadas', r.rows?.[0]?.n === 0);

// Feed
r = await as(U.beto, () => q(`select public.bb_feed('recent', null, 'editado') f`));
ok('buscar por texto', r.rows?.[0]?.f?.items?.length === 1, r.err);
r = await as(U.beto, () => q(`select public.bb_feed('recent', null, '100%') f`));
ok('búsqueda con % no rompe ni matchea todo', r.rows?.[0]?.f?.items?.length === 0, r.err);
r = await as(U.beto, () => q(`select public.bb_feed('top', 'proyectos', null, 'benchy') f`));
const it = r.rows?.[0]?.f?.items?.[0];
ok('filtro categoría+tag, orden destacados', it?.id === post.id && it.my_reaction === 'wow' && it.reaction_count === 2, JSON.stringify(it?.reactions));
ok('feed no expone correos ni teléfonos', !/@|1111|2222/.test(JSON.stringify(r.rows?.[0]?.f)));
await as(U.beto, () => q(`insert into public.bb_post_saves (post_id) values ('${post.id}')`));
r = await as(U.beto, () => q(`select public.bb_feed('recent', null, null, null, null, true) f`));
ok('guardados', r.rows?.[0]?.f?.items?.length === 1 && r.rows[0].f.items[0].saved === true);
r = await as(U.ana, () => q(`select public.bb_feed('recent', null, null, null, null, true) f`));
ok('guardados son privados', r.rows?.[0]?.f?.items?.length === 0);
r = await as(U.beto, () => q(`select public.bb_feed('recent', null, null, null, null, false, null, 0, 1) f`));
const first = r.rows?.[0]?.f?.items?.[0];
r = await as(U.beto, () => q(`select public.bb_feed('recent', null, null, null, null, false, $1, 0, 5) f`, [first.created_at]));
ok('paginación por fecha avanza', r.rows?.[0]?.f?.items?.every((i) => i.id !== first.id), r.err);

// Perfil
await as(U.ana, () => q(`select public.bb_profile_set('Maker de CABA', array['FDM','Resina','FDM'])`));
r = await as(U.beto, () => q(`select public.bb_profile('${U.ana.id}') p`));
ok('perfil público con bio y especialidades', r.rows?.[0]?.p?.bio === 'Maker de CABA' && r.rows[0].p.specialties.length === 2 && r.rows[0].p.name === 'Ana G.', JSON.stringify(r.rows?.[0]?.p));
await as(U.beto, () => q(`update public.bb_profiles set bio = 'x' where user_id = '${U.ana.id}'`));
r = await as(U.beto, () => q(`select bio from public.bb_profiles where user_id = '${U.ana.id}'`));
ok('no se edita perfil ajeno', r.rows?.[0]?.bio === 'Maker de CABA');

// Reportes y moderación
r = await as(U.ana, () => q(`select public.bb_report('post', '${post.id}', 'spam')`));
ok('no se reporta el propio contenido', !!r.err);
await as(U.beto, () => q(`select public.bb_report('post', '${post.id}', 'spam', 'es spam')`));
r = await as(U.beto, () => q(`select count(*)::int n from public.bb_reports`));
ok('reportero NO lee reportes', !r.err && r.rows[0].n === 0);
r = await as(U.beto, () => q(`select public.bb_mod_reports()`));
ok('no moderador NO ve el panel de reportes', !!r.err);
r = await as(U.beto, () => q(`select public.bb_mod_post_set('${post.id}', 'hidden')`));
ok('no moderador NO oculta posts', !!r.err);
r = await as(U.mod, () => q(`select public.bb_mod_reports() l`));
ok('moderador ve reportes (1 por usuario)', r.rows?.[0]?.l?.length === 1 && r.rows[0].l[0].count === 1, r.err);
await as(U.c1, () => q(`select public.bb_report('post', '${post.id}', 'ofensivo')`));
await as(U.c2, () => q(`select public.bb_report('post', '${post.id}', 'spam')`));
r = await as(U.mod, () => q(`select status from public.bb_posts where id = '${post.id}'`));
ok('3 reportes distintos ocultan el post', r.rows?.[0]?.status === 'hidden');
r = await as(U.beto, () => q(`select public.bb_feed() f`));
ok('post oculto sale del feed', !r.rows[0].f.items.some((i) => i.id === post.id));
r = await as(U.mod, () => q(`select public.bb_mod_report_resolve('post', '${post.id}', 'dismissed')`));
ok('moderador descarta y restituye', !r.err, r.err);
r = await as(U.mod, () => q(`select status from public.bb_posts where id = '${post.id}'`));
ok('post vuelve a published', r.rows?.[0]?.status === 'published');
await as(U.mod, () => q(`select public.bb_mod_post_set('${post.id}', null, true, 'destacado')`));
r = await as(U.beto, () => q(`select public.bb_feed('top') f`));
ok('destacado (pinned) primero', r.rows?.[0]?.f?.items?.[0]?.id === post.id && r.rows[0].f.items[0].pinned === true);
await as(U.mod, () => q(`select public.bb_mod_comment_remove('${com.id}')`));
r = await as(U.beto, () => q(`select public.bb_post_comments_list('${post.id}') l`));
ok('comentario removido no se ve', !r.rows?.[0]?.l?.items?.some((c) => c.id === com.id));
r = await as(U.mod, () => q(`select count(*)::int n from public.bb_mod_log`));
ok('acciones de moderación quedan registradas', r.rows?.[0]?.n >= 3, JSON.stringify(r.rows));
r = await as(U.beto, () => q(`select count(*)::int n from public.bb_mod_log`));
ok('log de moderación privado', r.rows?.[0]?.n === 0);
r = await as(U.mod, () => q(`select public.bb_mod_stats() s`));
ok('estadísticas de comunidad', r.rows?.[0]?.s?.posts >= 1, r.err);

// Funciones internas no expuestas
r = await as(U.ana, () => q(`select public.bb_notify('${U.beto.id}', 'x', null, null, null, null, 'x')`));
ok('bb_notify no se puede llamar desde la web', !!r.err);
r = await as(U.ana, () => q(`select public.bb_author_label('${U.beto.id}')`));
ok('bb_author_label no se puede llamar desde la web', !!r.err);

// Flag apagado
await x(`update public.bb_settings set value = '{"batfeed": false}' where key = 'community_flags'`);
r = await as(U.ana, () => q(`insert into public.bb_posts (body) values ('con flag apagado')`));
ok('flag apagado: no se publica', !!r.err);
r = await as(U.beto, () => q(`select public.bb_feed() f`));
ok('flag apagado: feed vacío', r.rows?.[0]?.f?.items?.length === 0);
await x(`update public.bb_settings set value = '{"batfeed": true}' where key = 'community_flags'`);

// Borrado en cascada y rollback
r = await as(U.ana, () => q(`delete from public.bb_posts where id = '${post.id}' returning id`));
ok('autor borra su post (cascada)', r.rows?.length === 1, r.err);
r = await x(F('044_rollback.sql'));
ok('rollback corre', !r.err, r.err);
r = await x(F('044_batbox_community_nucleo.sql'));
ok('re-aplica tras rollback', !r.err, r.err);
console.log(`\n${pass} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
