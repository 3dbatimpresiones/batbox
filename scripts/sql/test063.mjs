// Requiere: npm i @electric-sql/pglite (fuera del repo) y correr con node desde esa carpeta.
// Prueba 063 (BIBLIOTECA 3D: visor 3D, bucket privado) sobre 058–060 y cotizador + 001–003, 007, 008, 012, 013, 022, 026, 029, 044, 045, 049.
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

// ===================== 063 visor 3D =====================
await q(`update public.authorized_members set subscription_expires_at = now() + interval '5 days' where email='paga@gmail.com'`);
const c63 = v(await as(U.paga, () => q('select public.bb_lib_categories_list()')));
const m63 = v(await as(U.owner, () => q(`select public.bb_lib_admin_model_save($1::jsonb)`, [JSON.stringify({
  slug: 'gtr', name: 'Nissan GT-R', category_id: c63[0].id, storage_key: 'CCCCCCCCCC1', file_name: 'g.zip', license_status: 'verified' })])));
await as(U.owner, () => q(`select public.bb_lib_admin_model_status($1,'published')`, [m63]));
ok('063 bucket privado creado', v(await q(`select public from storage.buckets where id='bb-lib-previews'`)) === false);
ok('063 sin vista previa: la ficha la trae vacía', v(await as(U.paga, () => q(`select public.bb_lib_model('gtr')`))).preview_key === null);
await q(`update public.bb_lib_models set preview_key='gtr.glb', preview_meta='{"mode":"stl","size_mm":[100,200,50]}' where id=$1`, [m63]);
const d63 = v(await as(U.paga, () => q(`select public.bb_lib_model('gtr')`)));
ok('063 ficha con vista previa y datos', d63.preview_key === 'gtr.glb' && d63.preview_meta.mode === 'stl' && !('preview_error' in d63));
await q(`insert into storage.objects (bucket_id, name) values ('bb-lib-previews', 'gtr.glb')`);
const seen = async (u) => (await as(u, () => q(`select name from storage.objects where bucket_id='bb-lib-previews'`))).rows?.length || 0;
ok('063 pago puede leer la vista previa', (await seen(U.paga)) === 1);
ok('063 prueba gratis NO puede leerla', (await seen(U.prueba)) === 0);
ok('063 anónimo NO puede leerla', ((await as(null, () => q(`select name from storage.objects where bucket_id='bb-lib-previews'`))).rows?.length || 0) === 0);
const rb63 = await (async () => { try { await db.exec(read(BB + '063_rollback.sql')); return {}; } catch (e) { return { err: e.message }; } })();
ok('063 rollback limpio y la ficha sigue andando', !rb63.err && !!v(await as(U.paga, () => q(`select public.bb_lib_model('gtr')`))), rb63.err);

console.log(`\n${pass} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
