// Requiere: npm i @electric-sql/pglite (fuera del repo) y correr con node desde esa carpeta.
// Prueba 065 (BIBLIOTECA: borrar modelos) sobre 058–063.
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
  grant usage on schema auth, storage, public to anon, authenticated, service_role;
`);
for (const f of [COT, '001_batbox_contenidos.sql', '002_batbox_imagenes.sql', '003_batbox_interaccion.sql', '007_batbox_equipo.sql', '008_batbox_wiki.sql', '012_batbox_seguridad.sql', '013_batbox_columnas_privadas.sql', '022_batbox_prueba_gratis.sql', '026_batbox_maker_tycoon.sql', '029_batbox_mt_foto_perfil.sql', '044_batbox_community_nucleo.sql', '045_batbox_forum.sql', '049_batbox_gallery.sql'])
  await db.exec(read(f.includes('/') ? f : BB + f));
await db.exec(`grant all on all tables in schema public to authenticated, service_role;`);
await db.exec(read(BB + '058_batbox_biblioteca_prueba.sql'));
await db.exec(read(BB + '059_batbox_biblioteca.sql'));
await db.exec(read(BB + '060_batbox_biblioteca_extras.sql'));
await db.exec(read(BB + '061_batbox_biblioteca_social.sql'));
await db.exec(read(BB + '062_batbox_biblioteca_impresiones.sql'));
await db.exec(read(BB + '063_batbox_biblioteca_visor.sql'));
await db.exec('grant select on storage.objects to authenticated, anon; alter table storage.objects enable row level security;');
const setFlag = (on) => db.query(`insert into public.bb_settings (key, value) values ('community_flags', jsonb_build_object('biblioteca', $1::boolean, 'batfeed', true))
  on conflict (key) do update set value = public.bb_settings.value || jsonb_build_object('biblioteca', $1::boolean)`, [on]);
await setFlag(true); // las pruebas de 059 suponen la biblioteca abierta

const U = {
  owner: { id: '00000000-0000-0000-0000-000000000001', email: '3dbatimpresiones@gmail.com' },
  paga: { id: '00000000-0000-0000-0000-0000000000a1', email: 'paga@gmail.com' },
  vencida: { id: '00000000-0000-0000-0000-0000000000a2', email: 'vencida@gmail.com' },
  prueba: { id: '00000000-0000-0000-0000-0000000000a3', email: 'prueba@gmail.com' },
  editor: { id: '00000000-0000-0000-0000-0000000000a4', email: 'editor@gmail.com' },
};
for (const u of Object.values(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [u.id, u.email]);
await db.exec(`
  insert into public.authorized_members (email, status, role, first_name, auth_user_id)
  values ('${U.owner.email}','approved','admin','Dueño','${U.owner.id}')
  on conflict (email) do update set status='approved', role='admin', auth_user_id='${U.owner.id}';
  insert into public.authorized_members (email, status, role, first_name, auth_user_id, subscription_expires_at) values
  ('paga@gmail.com','approved','user','Paga','${U.paga.id}', now() + interval '20 days'),
  ('vencida@gmail.com','approved','user','Vencida','${U.vencida.id}', now() - interval '1 day'),
  ('editor@gmail.com','approved','editor','Editor','${U.editor.id}', null);
  insert into public.bb_trials (user_id, email, ends_at) values ('${U.prueba.id}', 'prueba@gmail.com', now() + interval '5 days');`);

async function as(user, fn) {
  const claims = user ? JSON.stringify({ sub: user.id, email: user.email }) : '{}';
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [user?.id || '', claims]);
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const q = async (sql, p) => { try { return { rows: (await db.query(sql, p)).rows }; } catch (e) { return { err: e.message }; } };
const v = (r) => r.rows?.[0] && Object.values(r.rows[0])[0];
await db.exec(read(BB + '065_batbox_biblioteca_borrar_modelo.sql'));
const cat = (await db.query(`insert into public.bb_lib_categories (name, slug) values ('c','c') returning id`)).rows[0].id;
const mid = (await db.query(`insert into public.bb_lib_models (slug, name, category_id, storage_provider, storage_key, file_name, status, thumb_key, images, preview_key)
  values ('m1','M1',$1,'gdrive','zzzzzzzzzzzz1','a.zip','draft','m1.webp', '["m1.webp","m1-2.webp"]'::jsonb, 'm1.v3.glb') returning id`, [cat])).rows[0].id;
const del = (u) => as(u, () => q('select public.bb_lib_admin_model_delete($1)', [mid]));
ok('paga no puede', !!(await del(U.paga)).err);
ok('editor no puede', !!(await del(U.editor)).err);
ok('anon no puede', !!(await del(null)).err);
ok('miembro no lee bb_lib_deleted', !!(await as(U.paga, () => q('select * from public.bb_lib_deleted'))).rows?.length === false);
const r = await del(U.owner); ok('admin borra', !r.err, r.err);
ok('modelo ya no está', !(await db.query(`select 1 from public.bb_lib_models where id=$1`, [mid])).rows.length);
const t = (await db.query(`select * from public.bb_lib_deleted where storage_key='zzzzzzzzzzzz1'`)).rows[0];
ok('lápida con archivos', t && t.files.preview === 'm1.v3.glb' && t.files.thumbs.length === 2 && t.cleaned === false, JSON.stringify(t?.files));
ok('borrar de nuevo avisa', /ya no existe/.test((await del(U.owner)).err || ''));
ok('undelete admin', !(await as(U.owner, () => q(`select public.bb_lib_admin_model_undelete('zzzzzzzzzzzz1')`))).err && !(await db.query(`select 1 from public.bb_lib_deleted`)).rows.length);
console.log(`\n${pass} OK, ${fail} fallas`); process.exit(fail ? 1 : 0);
