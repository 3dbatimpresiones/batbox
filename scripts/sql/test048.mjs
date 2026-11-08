// Requiere: npm i @electric-sql/pglite (fuera del repo) y correr con node desde esa carpeta.
// Prueba 048 (Mapa Maker) sobre 001–013, 026, 029 y 044–046.
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
r = await x(F('048_batbox_map.sql'));
ok('048 dos veces', !r.err, r.err);

r = await as(U.ana, () => q(`select public.bb_map_places_list() l`));
const places = r.rows?.[0]?.l;
ok('38 ciudades iniciales activas con punto', places?.length === 38 && places.every((p) => p.lat !== null && p.lng !== null), String(places?.length));
ok('puntos con 2 decimales (nivel ciudad)', places.every((p) => Math.abs(Number(p.lat) * 100 - Math.round(Number(p.lat) * 100)) < 1e-6));
const pl = (city) => places.find((p) => p.city === city).id;
r = await as(U.ext, () => q(`select public.bb_map_places_list() l`));
ok('no miembro NO ve el mapa', r.rows?.[0]?.l?.length === 0);
r = await as(null, () => q(`select * from public.bb_map_places`));
ok('visitante NO lee el catálogo', !!r.err);

// Voluntario: nadie aparece hasta que se une
r = await as(U.beto, () => q(`select public.bb_map_makers() l`));
ok('sin participantes al comienzo', r.rows?.[0]?.l?.length === 0);
r = await as(U.ana, () => q(`select public.bb_map_my() m`));
ok('no estoy en el mapa por defecto', r.rows?.[0]?.m === null);
r = await as(U.ana, () => q(`insert into public.bb_map_pins (user_id, place_id) values ('${U.ana.id}', '${pl('Córdoba')}')`));
ok('no se escribe pin directo', !!r.err);
r = await as(U.ext, () => q(`select public.bb_map_join('${pl('Córdoba')}')`));
ok('no miembro NO se une', !!r.err);
r = await as(U.ana, () => q(`select public.bb_map_join('${U.ana.id}')`));
ok('ciudad inexistente rechazada', !!r.err);
r = await as(U.ana, () => q(`select public.bb_map_join('${pl('Córdoba')}', array['FDM', 'Resina', 'FDM', ' '], true)`));
ok('miembro se une eligiendo ciudad', !r.err, r.err);
r = await as(U.ana, () => q(`select public.bb_map_my() m`));
ok('mi pin: ciudad y especialidades limpias', r.rows?.[0]?.m?.city === 'Córdoba' && r.rows[0].m.specialties.length === 2 && r.rows[0].m.visible === true);
await as(U.beto, () => q(`select public.bb_map_join('${pl('Córdoba')}', array['CNC'])`));
await as(U.c1, () => q(`select public.bb_map_join('${pl('Rosario')}', array['FDM'])`));

// Lectura
r = await as(U.c2, () => q(`select public.bb_map_places_list() l`));
const cnt = (city) => r.rows[0].l.find((p) => p.city === city).makers;
ok('conteo por ciudad', cnt('Córdoba') === 2 && cnt('Rosario') === 1 && cnt('Mendoza') === 0);
r = await as(U.c2, () => q(`select public.bb_map_makers('${pl('Córdoba')}') l`));
ok('makers de una ciudad', r.rows?.[0]?.l?.length === 2);
ok('sin correos, teléfonos ni coordenadas personales', !/@|1111|2222|lat|lng/.test(JSON.stringify(r.rows?.[0])));
r = await as(U.c2, () => q(`select public.bb_map_makers(null, null, 'fdm') l`));
ok('filtro por especialidad (mayúsculas indiferentes)', r.rows?.[0]?.l?.length === 2);
r = await as(U.c2, () => q(`select public.bb_map_makers(null, 'Córdoba') l`));
ok('filtro por región', r.rows?.[0]?.l?.length === 2);
r = await as(U.c2, () => q(`select * from public.bb_map_pins`));
ok('por tabla solo veo mi propio pin', !r.err && r.rows.length === 0);
r = await as(U.ana, () => q(`select count(*)::int n from public.bb_map_pins`));
ok('...y el mío', r.rows?.[0]?.n === 1);

// Ocultar y abandonar
await as(U.beto, () => q(`select public.bb_map_set_visible(false)`));
r = await as(U.c2, () => q(`select public.bb_map_places_list() l`));
ok('oculto: no cuenta', r.rows[0].l.find((p) => p.city === 'Córdoba').makers === 1);
r = await as(U.c2, () => q(`select public.bb_map_makers('${pl('Córdoba')}') l`));
ok('oculto: no aparece en la lista', r.rows?.[0]?.l?.length === 1 && r.rows[0].l[0].name === 'Ana G.');
r = await as(U.beto, () => q(`select public.bb_map_my() m`));
ok('oculto: yo sigo viendo mi configuración', r.rows?.[0]?.m?.visible === false);
await as(U.beto, () => q(`select public.bb_map_set_visible(true)`));
await as(U.beto, () => q(`select public.bb_map_leave()`));
r = await as(U.beto, () => q(`select public.bb_map_my() m`));
ok('abandonar borra el pin', r.rows?.[0]?.m === null);
r = await as(U.owner, () => q(`select count(*)::int n from public.bb_map_pins where user_id = '${U.beto.id}'`));
ok('no queda ninguna fila', r.rows?.[0]?.n === 0);
await as(U.ana, () => q(`select public.bb_map_join('${pl('Rosario')}', array['CNC'])`));
r = await as(U.c2, () => q(`select public.bb_map_makers('${pl('Córdoba')}') l`));
ok('cambiar de ciudad mueve el pin (no duplica)', r.rows?.[0]?.l?.length === 0);

// Sugerencias y administración del catálogo
r = await as(U.c2, () => q(`select public.bb_map_suggest('Uruguay', 'Montevideo', 'Montevideo')`));
ok('sugiere una ciudad', !r.err, r.err);
r = await as(U.c1, () => q(`select public.bb_map_places_list() l`));
ok('la sugerida NO aparece hasta que un admin la active', !r.rows[0].l.some((p) => p.city === 'Montevideo'));
const sug = (await q(`select id from public.bb_map_places where city = 'Montevideo'`)).rows[0].id;
r = await as(U.c1, () => q(`select public.bb_map_join('${sug}')`));
ok('no se puede unir a una ciudad inactiva', !!r.err);
r = await as(U.c1, () => q(`update public.bb_map_places set active = true, lat = -34.9, lng = -56.19 where id = '${sug}' returning id`));
ok('usuario NO activa ciudades', !r.err && r.rows.length === 0);
r = await as(U.mod, () => q(`update public.bb_map_places set active = true, lat = -34.9, lng = -56.19 where id = '${sug}' returning id`));
ok('editor NO activa ciudades (solo admin)', !r.err && r.rows.length === 0);
r = await as(U.owner, () => q(`update public.bb_map_places set active = true where id = '${sug}'`));
ok('no se activa sin punto (restricción)', !!r.err);
r = await as(U.owner, () => q(`update public.bb_map_places set active = true, lat = -34.9, lng = -56.19 where id = '${sug}' returning id`));
ok('admin activa con punto', r.rows?.length === 1, r.err);
r = await as(U.c1, () => q(`select public.bb_map_places_list() l`));
ok('ya aparece en el mapa', r.rows[0].l.some((p) => p.city === 'Montevideo'));
r = await as(U.owner, () => q(`insert into public.bb_map_places (country, region, city, lat, lng) values ('Chile', 'Valparaíso', 'Viña del Mar', -33.02, -71.55) returning id`));
ok('admin agrega ciudad', r.rows?.length === 1, r.err);
r = await as(U.c1, () => q(`insert into public.bb_map_places (country, region, city, lat, lng) values ('X', 'Y', 'Zeta', 1, 1)`));
ok('usuario NO agrega ciudades', !!r.err);
r = await as(U.c2, () => q(`select public.bb_map_suggest('A', 'B', 'C')`));
ok('sugerencia incompleta rechazada', !!r.err);

// Estadísticas
r = await as(U.mod, () => q(`select public.bb_map_stats() s`));
ok('estadísticas de moderación', r.rows?.[0]?.s?.makers >= 1 && r.rows[0].s.pending_places === 0, JSON.stringify(r.rows?.[0]?.s));
r = await as(U.beto, () => q(`select public.bb_map_stats()`));
ok('estadísticas solo moderación', !!r.err);

// Flag
await x(`update public.bb_settings set value = value || '{"batmap": false}' where key = 'community_flags'`);
r = await as(U.c2, () => q(`select public.bb_map_join('${pl('Rosario')}')`));
ok('flag apagado: no se une', !!r.err);
r = await as(U.c1, () => q(`select public.bb_map_makers() l`));
ok('flag apagado: lista vacía', r.rows?.[0]?.l?.length === 0);
await x(`update public.bb_settings set value = value || '{"batmap": true}' where key = 'community_flags'`);

// Privacidad al borrar usuario y rollback
await x(`delete from auth.users where id = '${U.c1.id}'`);
r = await as(U.owner, () => q(`select count(*)::int n from public.bb_map_pins where user_id = '${U.c1.id}'`));
ok('al borrar la cuenta desaparece el pin', r.rows?.[0]?.n === 0);
r = await x(F('048_rollback.sql'));
ok('rollback corre', !r.err, r.err);
r = await x(F('048_batbox_map.sql'));
ok('re-aplica tras rollback', !r.err, r.err);
console.log(`\n${pass} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
