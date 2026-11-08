// Requiere: npm i @electric-sql/pglite (fuera del repo) y correr con node desde esa carpeta.
// Prueba 045 (BATFORUM + reportes genéricos) sobre 001–013, 026, 029 y 044.
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
for (const f of [COT, '001_batbox_contenidos.sql', '002_batbox_imagenes.sql', '003_batbox_interaccion.sql', '007_batbox_equipo.sql', '008_batbox_wiki.sql', '012_batbox_seguridad.sql', '013_batbox_columnas_privadas.sql', '026_batbox_maker_tycoon.sql', '029_batbox_mt_foto_perfil.sql', '044_batbox_community_nucleo.sql'])
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
await db.exec(`update public.authorized_members set auth_user_id = '${U.owner.id}' where email = '${U.owner.email}';
  insert into public.authorized_members (email, status, role, first_name, last_name, phone, auth_user_id) values
  ('ana@gmail.com','approved','user','Ana','Gómez','1111','${U.ana.id}'),
  ('beto@gmail.com','approved','user','Beto','Pérez','2222','${U.beto.id}'),
  ('mod@gmail.com','approved','editor','Mora','Díaz','3333','${U.mod.id}'),
  ('c1@gmail.com','approved','user','C','Uno','4','${U.c1.id}'),
  ('c2@gmail.com','approved','user','C','Dos','5','${U.c2.id}'),
  ('ext@gmail.com','pending','user','Ext','Raño','9','${U.ext.id}');`);
async function as(user, fn) {
  const claims = user ? JSON.stringify({ sub: user.id, email: user.email }) : '{}';
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [user?.id || '', claims]);
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const q = async (sql, p) => { try { return { rows: (await db.query(sql, p)).rows }; } catch (e) { return { err: e.message }; } };
const x = async (sql) => { try { await db.exec(sql); return {}; } catch (e) { return { err: e.message }; } };
const F = (f) => read(BB + f);

let r = await x(F('045_batbox_forum.sql'));
ok('045 se aplica', !r.err, r.err);
r = await x(F('045_batbox_forum.sql'));
ok('045 dos veces', !r.err, r.err);

// Categorías
r = await as(U.ana, () => q(`select public.bb_forum_categories_list() l`));
const cats = r.rows?.[0]?.l;
ok('14 categorías iniciales', cats?.length === 14, r.err);
ok('categorías en el orden pedido (FDM primero, consultas al final)', cats?.[0]?.slug === 'impresion-3d-fdm' && cats?.[13]?.slug === 'consultas-generales');
r = await as(U.ext, () => q(`select public.bb_forum_categories_list() l`));
ok('no miembro NO ve categorías', r.rows?.[0]?.l?.length === 0);
r = await as(null, () => q(`select * from public.bb_forum_categories`));
ok('visitante NO lee categorías', !!r.err);
r = await as(U.ana, () => q(`insert into public.bb_forum_categories (slug, name) values ('x-y', 'Mía')`));
ok('usuario NO crea categorías', !!r.err);
r = await as(U.mod, () => q(`insert into public.bb_forum_categories (slug, name) values ('x-y', 'Mía')`));
ok('editor NO crea categorías (solo admin)', !!r.err);
r = await as(U.owner, () => q(`insert into public.bb_forum_categories (slug, name, sort) values ('laminadores', 'Laminadores', 5) returning id`));
ok('admin crea categoría', !!r.rows?.[0]?.id, r.err);
const catNew = r.rows?.[0]?.id;
r = await as(U.owner, () => q(`update public.bb_forum_categories set active = false where slug = 'anycubic'`));
r = await as(U.ana, () => q(`select public.bb_forum_categories_list() l`));
ok('categoría desactivada se oculta a miembros', r.rows[0].l.length === 14 && !r.rows[0].l.some((c) => c.slug === 'anycubic') && r.rows[0].l[0].slug === 'laminadores');
await as(U.owner, () => q(`update public.bb_forum_categories set active = true where slug = 'anycubic'`));
const cat = (slug) => cats.find((c) => c.slug === slug).id;

// Temas
r = await as(U.ana, () => q(`insert into public.bb_forum_topics (category_id, title, body, status, pinned, closed, reply_count) values ($1, 'Capa que no pega en la A1', 'La primera capa se levanta, ¿qué hago?', 'removed', true, true, 99) returning id, status, pinned, closed, reply_count, user_id`, [cat('bambu-lab')]));
const topic = r.rows?.[0];
ok('miembro crea tema', !!topic, r.err);
ok('estado/destacado/cerrado/contador no se falsean', topic?.status === 'published' && !topic.pinned && !topic.closed && topic.reply_count === 0);
r = await as(U.ana, () => q(`insert into public.bb_forum_topics (category_id, title, body) values ($1, 'hey', 'x')`, [cat('bambu-lab')]));
ok('título muy corto rechazado', !!r.err);
r = await as(U.ana, () => q(`insert into public.bb_forum_topics (category_id, title, body) values ('${U.ana.id}', 'Título válido', 'x')`));
ok('categoría inexistente rechazada', !!r.err);
r = await as(U.ext, () => q(`insert into public.bb_forum_topics (category_id, title, body) values ($1, 'Tema de no miembro', 'x')`, [cat('bambu-lab')]));
ok('no miembro NO crea temas', !!r.err);
r = await as(U.beto, () => q(`insert into public.bb_forum_topics (category_id, title, body, media) values ($1, 'Con imagen ajena', 'x', '[{"path":"${U.ana.id}/a.jpg"}]')`, [cat('bambu-lab')]));
ok('imagen de otra carpeta rechazada', !!r.err);
r = await as(U.beto, () => q(`insert into public.bb_forum_topics (category_id, title, body, media) values ($1, 'Con imagen propia', 'x', '[{"path":"${U.beto.id}/a.webp"}]') returning id`, [cat('creality')]));
ok('imagen propia aceptada', !!r.rows?.[0], r.err);
r = await as(U.beto, () => q(`update public.bb_forum_topics set title = 'Hackeo del tema' where id = '${topic.id}' returning id`));
ok('otro NO edita mi tema', !r.err && r.rows.length === 0);
r = await as(U.ana, () => q(`update public.bb_forum_topics set closed = true where id = '${topic.id}'`));
ok('autor NO cierra por tabla (sin permiso de columna)', !!r.err);
r = await as(U.ana, () => q(`update public.bb_forum_topics set title = 'Capa que no pega en la A1 (editado)' where id = '${topic.id}' returning edited_at`));
ok('autor edita título', !!r.rows?.[0]?.edited_at, r.err);

// Respuestas
r = await as(U.beto, () => q(`insert into public.bb_forum_replies (topic_id, body) values ('${topic.id}', 'Limpiá la cama con alcohol isopropílico') returning id`));
const rep1 = r.rows?.[0];
ok('responde', !!rep1, r.err);
r = await as(U.c1, () => q(`insert into public.bb_forum_replies (topic_id, body) values ('${topic.id}', 'Subí 5° la temperatura de cama') returning id`));
const rep2 = r.rows?.[0];
r = await as(U.ext, () => q(`insert into public.bb_forum_replies (topic_id, body) values ('${topic.id}', 'x')`));
ok('no miembro NO responde', !!r.err);
r = await as(U.ana, () => q(`select public.bb_notifications_unread() n`));
ok('autora recibe avisos de respuestas', r.rows?.[0]?.n === 2, JSON.stringify(r.rows));
r = await as(U.ana, () => q(`select public.bb_notifications_list(5) l`));
ok('aviso apunta al tema (ref_type topic, post_id)', r.rows?.[0]?.l?.items?.every((n) => n.kind === 'forum_reply' && n.ref_type === 'topic' && n.post_id === topic.id));
r = await as(U.ana, () => q(`select public.bb_forum_topic('${topic.id}') t`));
ok('contador de respuestas = 2', r.rows?.[0]?.t?.topic?.reply_count === 2, JSON.stringify(r.rows?.[0]?.t?.topic));

// Solución
r = await as(U.beto, () => q(`select public.bb_forum_set_solution('${topic.id}', '${rep1.id}')`));
ok('otro usuario NO marca solución', !!r.err);
r = await as(U.ana, () => q(`select public.bb_forum_set_solution('${topic.id}', '${rep1.id}')`));
ok('autora marca solución', !r.err, r.err);
r = await as(U.beto, () => q(`select public.bb_notifications_list(5) l`));
ok('autor de la solución recibe aviso', r.rows?.[0]?.l?.items?.some((n) => n.kind === 'forum_solution'));
r = await as(U.ana, () => q(`select public.bb_forum_replies_list('${topic.id}') l`));
ok('respuesta marcada como solución', r.rows?.[0]?.l?.items?.find((i) => i.id === rep1.id)?.is_solution === true);
r = await as(U.ana, () => q(`select public.bb_forum_set_solution('${topic.id}', '${U.ana.id}')`));
ok('respuesta inválida rechazada', !!r.err);
r = await as(U.ana, () => q(`select public.bb_forum_topics_list(null, null, 'solved') l`));
ok('filtro resueltas', r.rows?.[0]?.l?.items?.length === 1 && r.rows[0].l.items[0].solved === true);
r = await as(U.ana, () => q(`select public.bb_forum_topics_list(null, null, 'unsolved') l`));
ok('filtro sin resolver', r.rows?.[0]?.l?.items?.length === 1 && r.rows[0].l.items[0].category === 'creality');
r = await as(U.ana, () => q(`select public.bb_forum_set_solution('${topic.id}', null)`));
r = await as(U.ana, () => q(`select public.bb_forum_topics_list(null, null, 'solved') l`));
ok('se puede quitar la solución', r.rows?.[0]?.l?.items?.length === 0);
await as(U.ana, () => q(`select public.bb_forum_set_solution('${topic.id}', '${rep1.id}')`));

// Cerrar
r = await as(U.beto, () => q(`select public.bb_forum_topic_set('${topic.id}', true)`));
ok('otro NO cierra mi tema', !!r.err);
r = await as(U.ana, () => q(`select public.bb_forum_topic_set('${topic.id}', true, true)`));
ok('autora NO destaca (solo moderación)', !!r.err);
r = await as(U.ana, () => q(`select public.bb_forum_topic_set('${topic.id}', true)`));
ok('autora cierra su tema', !r.err, r.err);
r = await as(U.beto, () => q(`insert into public.bb_forum_replies (topic_id, body) values ('${topic.id}', 'tarde')`));
ok('tema cerrado: nadie responde', !!r.err);
r = await as(U.mod, () => q(`insert into public.bb_forum_replies (topic_id, body) values ('${topic.id}', 'Nota de moderación')`));
ok('...salvo moderación', !r.err, r.err);
await as(U.ana, () => q(`select public.bb_forum_topic_set('${topic.id}', false)`));

// Listado
r = await as(U.mod, () => q(`select public.bb_forum_topic_set('${topic.id}', null, true)`));
ok('moderación destaca', !r.err, r.err);
r = await as(U.beto, () => q(`select public.bb_forum_topics_list() l`));
ok('destacado primero', r.rows?.[0]?.l?.items?.[0]?.id === topic.id && r.rows[0].l.items[0].pinned);
r = await as(U.beto, () => q(`select public.bb_forum_topics_list('creality') l`));
ok('filtro por categoría', r.rows?.[0]?.l?.items?.length === 1);
r = await as(U.beto, () => q(`select public.bb_forum_topics_list(null, 'primera capa') l`));
ok('búsqueda por texto', r.rows?.[0]?.l?.items?.length === 1);
r = await as(U.beto, () => q(`select public.bb_forum_topics_list(null, '100%') l`));
ok('búsqueda con % no matchea todo', r.rows?.[0]?.l?.items?.length === 0);
r = await as(U.beto, () => q(`select public.bb_forum_topics_list(null, null, 'all', 'new', 0, 1) a, public.bb_forum_topics_list(null, null, 'all', 'new', 1, 1) b`));
ok('paginación por offset', r.rows?.[0]?.a?.items?.[0]?.id !== r.rows?.[0]?.b?.items?.[0]?.id && r.rows[0].b.items.length === 1);
ok('listas sin correos ni teléfonos', !/@|1111|2222/.test(JSON.stringify(r.rows?.[0])));

// Reportes de foro + regresión de BATFEED
r = await as(U.beto, () => q(`select public.bb_report('reply', '${rep1.id}', 'spam')`));
ok('no se reporta la propia respuesta', !!r.err);
r = await as(U.ana, () => q(`select public.bb_report('nada', 'x', 'spam')`));
ok('tipo desconocido rechazado', !!r.err);
for (const u of [U.ana, U.c1, U.c2]) await as(u, () => q(`select public.bb_report('reply', '${rep1.id}', 'spam')`));
r = await as(U.mod, () => q(`select status from public.bb_forum_replies where id = '${rep1.id}'`));
ok('3 reportes ocultan la respuesta', r.rows?.[0]?.status === 'removed');
r = await as(U.ana, () => q(`select public.bb_forum_topic('${topic.id}') t`));
ok('contador baja al ocultarse', r.rows?.[0]?.t?.topic?.reply_count === 2, String(r.rows?.[0]?.t?.topic?.reply_count));
r = await as(U.mod, () => q(`select public.bb_mod_reports() l`));
const rp = r.rows?.[0]?.l?.find((i) => i.target_type === 'reply');
ok('panel de moderación muestra la respuesta reportada', rp?.count === 3 && rp.state === 'removed' && !!rp.preview && rp.author === 'Beto P.', JSON.stringify(rp));
r = await as(U.mod, () => q(`select public.bb_mod_report_resolve('reply', '${rep1.id}', 'dismissed')`));
r = await as(U.mod, () => q(`select status from public.bb_forum_replies where id = '${rep1.id}'`));
ok('descartar restituye la respuesta', r.rows?.[0]?.status === 'published');
for (const u of [U.beto, U.c1, U.c2]) await as(u, () => q(`select public.bb_report('topic', '${topic.id}', 'otro')`));
r = await as(U.mod, () => q(`select status from public.bb_forum_topics where id = '${topic.id}'`));
ok('3 reportes ocultan el tema', r.rows?.[0]?.status === 'hidden');
r = await as(U.beto, () => q(`select public.bb_forum_topic('${topic.id}') t`));
ok('tema oculto no se ve', r.rows?.[0]?.t === null);
await as(U.mod, () => q(`select public.bb_mod_report_resolve('topic', '${topic.id}', 'dismissed')`));
r = await as(U.beto, () => q(`select public.bb_forum_topic('${topic.id}') t`));
ok('tema restituido', !!r.rows?.[0]?.t);
// BATFEED sigue igual
r = await as(U.ana, () => q(`insert into public.bb_posts (body) values ('post de regresión') returning id`));
const post = r.rows?.[0];
for (const u of [U.beto, U.c1, U.c2]) await as(u, () => q(`select public.bb_report('post', '${post.id}', 'spam')`));
r = await as(U.mod, () => q(`select status from public.bb_posts where id = '${post.id}'`));
ok('regresión: 3 reportes ocultan un post', r.rows?.[0]?.status === 'hidden');
await as(U.mod, () => q(`select public.bb_mod_report_resolve('post', '${post.id}', 'dismissed')`));
r = await as(U.mod, () => q(`select status from public.bb_posts where id = '${post.id}'`));
ok('regresión: descartar restituye el post', r.rows?.[0]?.status === 'published');
r = await as(U.beto, () => q(`select public.bb_mod_reports() l`));
ok('no moderador NO ve reportes', !!r.err);

// Moderación del foro
r = await as(U.mod, () => q(`select public.bb_forum_reply_remove('${rep2.id}', 'insulto')`));
ok('moderación quita una respuesta', !r.err, r.err);
r = await as(U.beto, () => q(`select public.bb_forum_reply_remove('${rep2.id}')`));
ok('no moderador NO quita respuestas', !!r.err);
r = await as(U.mod, () => q(`select count(*)::int n from public.bb_mod_log where action like 'forum%'`));
ok('acciones del foro registradas', r.rows?.[0]?.n >= 2, JSON.stringify(r.rows));
r = await as(U.mod, () => q(`select public.bb_forum_stats() s`));
ok('estadísticas del foro', r.rows?.[0]?.s?.topics >= 2, r.err);
r = await as(U.ana, () => q(`select public.bb_target_info('post', '${post.id}')`));
ok('bb_target_info no se llama desde la web', !!r.err);

// Límite de temas
for (let i = 0; i < 6; i++) r = await as(U.c2, () => q(`insert into public.bb_forum_topics (category_id, title, body) values ($1, 'Tema número ${i}', 'x')`, [cat('cnc')]));
ok('límite de 5 temas por hora', !!r.err, r.err);

// Flag apagado
await x(`update public.bb_settings set value = value || '{"batforum": false}' where key = 'community_flags'`);
r = await as(U.ana, () => q(`insert into public.bb_forum_topics (category_id, title, body) values ($1, 'Con flag apagado', 'x')`, [cat('cnc')]));
ok('flag apagado: no se crea', !!r.err);
r = await as(U.ana, () => q(`select public.bb_forum_topics_list() l`));
ok('flag apagado: lista vacía', r.rows?.[0]?.l?.items?.length === 0);
await x(`update public.bb_settings set value = value || '{"batforum": true}' where key = 'community_flags'`);

// Borrado y rollback
r = await as(U.ana, () => q(`delete from public.bb_forum_topics where id = '${topic.id}' returning id`));
ok('autora borra su tema (cascada)', r.rows?.length === 1, r.err);
r = await x(F('045_rollback.sql'));
ok('rollback corre', !r.err, r.err);
r = await x(F('045_batbox_forum.sql'));
ok('re-aplica tras rollback', !r.err, r.err);
console.log(`\n${pass} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
