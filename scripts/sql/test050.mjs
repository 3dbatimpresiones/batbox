// Requiere: npm i @electric-sql/pglite (fuera del repo) y correr con node desde esa carpeta.
// Prueba 050 (enlaces del Mapa Maker, sobre 048) sobre 001–013, 026, 029 y 044–046.
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


let r = await x(F('048_batbox_map.sql'));
ok('048 se aplica', !r.err, r.err);
r = await x(F('050_batbox_map_links.sql'));
ok('050 se aplica', !r.err, r.err);
r = await x(F('050_batbox_map_links.sql'));
ok('050 dos veces', !r.err, r.err);

r = await as(U.ana, () => q(`select public.bb_map_places_list() l`));
const pl = (city) => r.rows[0].l.find((p) => p.city === city).id;
const cba = pl('Córdoba');
const join = (u, links) => as(u, () => q(`select public.bb_map_join('${cba}', array['FDM'], true, $1::jsonb)`, [JSON.stringify(links)]));

r = await join(U.ana, [{ label: 'Instagram', url: 'https://instagram.com/ana3d' }, { label: 'Mi web', url: 'https://ana3d.com.ar' }]);
ok('se une con enlaces de redes', !r.err, r.err);
r = await as(U.ana, () => q(`select public.bb_map_my() m`));
ok('mi configuración incluye los enlaces', r.rows?.[0]?.m?.links?.length === 2 && r.rows[0].m.links[0].label === 'Instagram');
r = await as(U.beto, () => q(`select public.bb_map_join('${cba}', array['CNC'])`));
ok('los enlaces son opcionales (llamada sin ellos)', !r.err, r.err);
r = await as(U.c1, () => q(`select public.bb_map_makers('${cba}') l`));
const ana = r.rows?.[0]?.l?.find((m) => m.name === 'Ana G.');
ok('otros miembros ven los enlaces', ana?.links?.length === 2 && ana.links[1].url === 'https://ana3d.com.ar');
ok('quien no puso enlaces queda con lista vacía', r.rows?.[0]?.l?.find((m) => m.name === 'Beto P.')?.links?.length === 0);
ok('sin correos ni teléfonos', !/1111|2222|ana@gmail/.test(JSON.stringify(r.rows?.[0])));
r = await as(U.ext, () => q(`select public.bb_map_makers() l`));
ok('no miembro NO ve enlaces', r.rows?.[0]?.l?.length === 0);

for (const [name, links] of [
  ['http sin s', [{ label: 'x', url: 'http://sitio.com' }]],
  ['javascript:', [{ label: 'x', url: 'javascript:alert(1)' }]],
  ['mailto:', [{ label: 'x', url: 'mailto:yo@mail.com' }]],
  ['tel:', [{ label: 'x', url: 'tel:+5491155555555' }]],
  ['sin nombre', [{ label: '', url: 'https://a.com' }]],
  ['más de 4', Array.from({ length: 5 }, (_, i) => ({ label: 'l' + i, url: 'https://a.com/' + i }))],
  ['url con espacios', [{ label: 'x', url: 'https://a.com/ hola' }]],
  ['url larguísima', [{ label: 'x', url: 'https://a.com/' + 'a'.repeat(300) }]],
  ['no es lista', { label: 'x', url: 'https://a.com' }],
]) {
  r = await join(U.ana, links);
  ok(`enlace rechazado: ${name}`, !!r.err);
}
r = await as(U.ana, () => q(`select public.bb_map_my() m`));
ok('los rechazos no pisaron los enlaces guardados', r.rows?.[0]?.m?.links?.length === 2);

await as(U.ana, () => q(`select public.bb_map_set_visible(false)`));
r = await as(U.c1, () => q(`select public.bb_map_makers('${cba}') l`));
ok('oculta: tampoco se ven sus enlaces', !r.rows?.[0]?.l?.some((m) => m.name === 'Ana G.'));
await as(U.ana, () => q(`select public.bb_map_leave()`));
r = await as(U.owner, () => q(`select count(*)::int n from public.bb_map_pins where user_id = '${U.ana.id}'`));
ok('abandonar borra también los enlaces (la fila entera)', r.rows?.[0]?.n === 0);
r = await as(U.ana, () => q(`insert into public.bb_map_pins (user_id, place_id, links) values ('${U.ana.id}', '${cba}', '[]')`));
ok('sigue sin poder escribir pines directo', !!r.err);

r = await x(F('050_rollback.sql'));
ok('rollback corre', !r.err, r.err);
r = await x(F('050_batbox_map_links.sql'));
ok('re-aplica tras rollback', !r.err, r.err);
console.log(`\n${pass} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
