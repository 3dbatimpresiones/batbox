// Requiere: npm i @electric-sql/pglite (fuera del repo) y correr con node desde esa carpeta.
// Prueba 051 (INSIGNIAS, sobre 049) sobre 001–013, 026, 029 y 044–045.
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
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  alter table storage.objects enable row level security;
  grant usage on schema auth, storage, public to anon, authenticated, service_role;
`);
for (const f of [COT, '001_batbox_contenidos.sql', '002_batbox_imagenes.sql', '003_batbox_interaccion.sql', '007_batbox_equipo.sql', '008_batbox_wiki.sql', '012_batbox_seguridad.sql', '013_batbox_columnas_privadas.sql', '026_batbox_maker_tycoon.sql', '029_batbox_mt_foto_perfil.sql', '044_batbox_community_nucleo.sql', '045_batbox_forum.sql'])
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


await db.exec(`grant all on storage.objects, storage.buckets to authenticated, service_role;`);
await db.exec(`revoke all on public.bb_posts, public.bb_post_reactions, public.bb_post_comments, public.bb_post_saves, public.bb_notifications from authenticated;
  grant select, insert, delete on public.bb_posts to authenticated; grant update (body, category, tags, media, video_url) on public.bb_posts to authenticated;
  grant select, insert, delete on public.bb_post_reactions to authenticated; grant update (kind) on public.bb_post_reactions to authenticated;
  grant select, insert, delete on public.bb_post_comments to authenticated; grant select, insert, delete on public.bb_post_saves to authenticated;
  grant select, delete on public.bb_notifications to authenticated; grant update (read_at) on public.bb_notifications to authenticated;`);
let r = await x(F('049_batbox_gallery.sql'));
ok('049 se aplica', !r.err, r.err);
r = await x(F('051_batbox_badges.sql'));
ok('051 se aplica', !r.err, r.err);
r = await x(F('051_batbox_badges.sql'));
ok('051 dos veces', !r.err, r.err);

const save = (u, n) => as(u, () => q(`select public.bb_gallery_save(null, $1, 'Descripción del proyecto', 'impresion-fdm', array['petg'], $2::jsonb, null, 'done', 'FDM', null, null, null, '{}'::jsonb, '[]'::jsonb, false, true, true) id`,
  [n, JSON.stringify([{ path: `${u.id}/${n.slice(0, 3)}.webp` }])]));
r = await save(U.ana, 'Proyecto de Ana para la semana');
const pa = r.rows?.[0]?.id;
r = await save(U.beto, 'Proyecto de Beto para la semana');
const pb = r.rows?.[0]?.id;
ok('hay dos proyectos publicados', !!pa && !!pb, r.err);

r = await as(U.c1, () => q(`select public.bb_badges_list() l`));
ok('catálogo con la insignia "maker-semana"', r.rows?.[0]?.l?.[0]?.slug === 'maker-semana');
r = await as(U.ext, () => q(`select public.bb_badges_list() l`));
ok('no miembro NO ve el catálogo', r.rows?.[0]?.l?.length === 0);
r = await as(U.c1, () => q(`select public.bb_profile('${U.ana.id}') p`));
ok('antes de ganar, sin insignias', r.rows?.[0]?.p?.badges?.length === 0);

r = await as(U.ana, () => q(`select public.bb_badge_award('${U.ana.id}', 'maker-semana', '${pa}')`));
ok('nadie se otorga insignias solo (función interna)', !!r.err);
r = await as(U.ana, () => q(`insert into public.bb_user_badges (user_id, badge_slug) values ('${U.ana.id}', 'maker-semana')`));
ok('ni por tabla', !!r.err);
r = await as(U.beto, () => q(`select public.bb_gallery_feature('${pb}', false, true)`));
ok('usuario NO elige al maker de la semana', !!r.err);
r = await as(U.mod, () => q(`select public.bb_gallery_feature('${pb}', false, true)`));
ok('editor NO elige (solo admin)', !!r.err);

r = await as(U.owner, () => q(`select public.bb_gallery_feature('${pa}', false, true)`));
ok('admin elige el proyecto de la semana', !r.err, r.err);
r = await as(U.c1, () => q(`select public.bb_profile('${U.ana.id}') p`));
ok('la autora recibe la insignia (visible en su perfil)', r.rows?.[0]?.p?.badges?.[0]?.slug === 'maker-semana' && r.rows[0].p.badges[0].count === 1, JSON.stringify(r.rows?.[0]?.p?.badges));
r = await as(U.c1, () => q(`select public.bb_profile('${U.beto.id}') p`));
ok('quien no ganó no la tiene', r.rows?.[0]?.p?.badges?.length === 0);
r = await as(U.ana, () => q(`select public.bb_notifications_list(5) l`));
const n = r.rows?.[0]?.l?.items?.find((i) => i.kind === 'badge');
ok('aviso en la campana apuntando al proyecto', n?.post_id === pa && n.ref_type === 'badge' && n.snippet === 'Maker destacado de la semana', JSON.stringify(n));
r = await as(U.owner, () => q(`select public.bb_gallery_feature('${pa}', false, true)`));
r = await as(U.c1, () => q(`select public.bb_profile('${U.ana.id}') p`));
ok('elegir el mismo proyecto dos veces no duplica la insignia', r.rows?.[0]?.p?.badges?.[0]?.count === 1);

await as(U.owner, () => q(`select public.bb_gallery_feature('${pb}', false, true)`));
r = await as(U.c1, () => q(`select public.bb_gallery_list(null, null, 'recent', null, null, false, 'week_pick') l`));
ok('el proyecto de la semana pasa al nuevo (uno solo)', r.rows?.[0]?.l?.items?.length === 1 && r.rows[0].l.items[0].id === pb);
r = await as(U.c1, () => q(`select public.bb_profile('${U.ana.id}') p`));
ok('la insignia ya ganada se conserva', r.rows?.[0]?.p?.badges?.[0]?.count === 1);
r = await as(U.c1, () => q(`select public.bb_profile('${U.beto.id}') p`));
ok('el nuevo ganador la recibe', r.rows?.[0]?.p?.badges?.[0]?.slug === 'maker-semana');

r = await save(U.ana, 'Otro proyecto de Ana destacado');
const pa2 = r.rows?.[0]?.id;
await as(U.owner, () => q(`select public.bb_gallery_feature('${pa2}', false, true)`));
r = await as(U.c1, () => q(`select public.bb_profile('${U.ana.id}') p`));
ok('ganar con otro proyecto suma (cuenta 2)', r.rows?.[0]?.p?.badges?.[0]?.count === 2);
r = await as(U.owner, () => q(`select public.bb_gallery_feature('${pa}', true)`));
r = await as(U.c1, () => q(`select public.bb_profile('${U.ana.id}') p`));
ok('"Selección 3DBAT" NO otorga la insignia de la semana', r.rows?.[0]?.p?.badges?.[0]?.count === 2);
ok('el perfil no expone correos ni teléfonos', !/@|1111|2222/.test(JSON.stringify(r.rows?.[0]?.p)));

r = await as(U.owner, () => q(`insert into public.bb_badges (slug, name, description) values ('top-fdm', 'Top FDM', 'Prueba') returning slug`));
ok('admin puede crear insignias nuevas', r.rows?.length === 1, r.err);
r = await as(U.ana, () => q(`insert into public.bb_badges (slug, name) values ('mia', 'Mía')`));
ok('usuario NO crea insignias', !!r.err);

r = await x(F('051_rollback.sql'));
ok('rollback corre', !r.err, r.err);
r = await as(U.c1, () => q(`select public.bb_profile('${U.ana.id}') p`));
ok('tras el rollback el perfil sigue andando', !r.err && r.rows?.[0]?.p?.creations === 2, r.err);
r = await as(U.owner, () => q(`select public.bb_gallery_feature('${pa}', true, null)`));
ok('tras el rollback destacar sigue andando', !r.err, r.err);
r = await x(F('051_batbox_badges.sql'));
ok('re-aplica tras rollback', !r.err, r.err);
console.log(`\n${pass} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
