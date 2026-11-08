// Requiere: npm i @electric-sql/pglite (fuera del repo) y correr con node desde esa carpeta.
// Prueba 052 (maker destacado, sobre 049) sobre 001–013, 026, 029 y 044–045.
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
r = await x(F('052_batbox_featured_maker.sql'));
ok('052 se aplica', !r.err, r.err);
r = await x(F('052_batbox_featured_maker.sql'));
ok('052 dos veces', !r.err, r.err);

r = await as(U.c1, () => q(`select public.bb_featured_maker() u`));
ok('sin proyecto de la semana: null', r.rows?.[0]?.u === null, r.err);
r = await as(U.ana, () => q(`select public.bb_gallery_save(null, 'Proyecto destacado de Ana', 'Descripción', 'impresion-fdm', array['petg'], $1::jsonb, null, 'done', 'FDM', null, null, null, '{}'::jsonb, '[]'::jsonb, false, true, true) id`, [JSON.stringify([{ path: `${U.ana.id}/a.webp` }])]));
const pa = r.rows?.[0]?.id;
ok('proyecto publicado', !!pa, r.err);
await as(U.owner, () => q(`select public.bb_gallery_feature('${pa}', false, true)`));
r = await as(U.c1, () => q(`select public.bb_featured_maker() u`));
ok('cualquier miembro ve quién es el destacado', r.rows?.[0]?.u === U.ana.id, JSON.stringify(r.rows));
r = await as(U.beto, () => q(`select public.bb_featured_maker() u`));
ok('mismo resultado para todos', r.rows?.[0]?.u === U.ana.id);
r = await as(U.ext, () => q(`select public.bb_featured_maker() u`));
ok('no miembro: null', r.rows?.[0]?.u === null);
r = await as(null, () => q(`select public.bb_featured_maker() u`));
ok('visitante sin sesión: denegado', !!r.err);
await as(U.mod, () => q(`select public.bb_mod_post_set('${pa}', 'hidden')`));
r = await as(U.c1, () => q(`select public.bb_featured_maker() u`));
ok('si el proyecto se oculta, deja de figurar', r.rows?.[0]?.u === null);
await as(U.mod, () => q(`select public.bb_mod_post_set('${pa}', 'published')`));
await x(`update public.bb_settings set value = value || '{"batgallery": false}' where key = 'community_flags'`);
r = await as(U.c1, () => q(`select public.bb_featured_maker() u`));
ok('galería apagada: null', r.rows?.[0]?.u === null);
await x(`update public.bb_settings set value = value || '{"batgallery": true}' where key = 'community_flags'`);
r = await x(F('052_rollback.sql'));
ok('rollback corre', !r.err, r.err);
r = await x(F('052_batbox_featured_maker.sql'));
ok('re-aplica tras rollback', !r.err, r.err);
console.log(`\n${pass} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
