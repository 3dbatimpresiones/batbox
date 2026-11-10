// Requiere: npm i @electric-sql/pglite (fuera del repo) y correr con node desde esa carpeta.
// Prueba 071 (BATCARD: ranking con semillas del servidor).
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
for (const f of [COT, '001_batbox_contenidos.sql', '002_batbox_imagenes.sql', '003_batbox_interaccion.sql', '007_batbox_equipo.sql', '008_batbox_wiki.sql', '012_batbox_seguridad.sql', '013_batbox_columnas_privadas.sql', '022_batbox_prueba_gratis.sql', '026_batbox_maker_tycoon.sql'])
  await db.exec(read(f.includes('/') ? f : BB + f));
await db.exec(read(BB + '071_batbox_batcard_ranking.sql'));
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222', U3 = '33333333-3333-3333-3333-333333333333';
await db.exec(`insert into auth.users values ('${U1}','a@x.com'),('${U2}','b@x.com'),('${U3}','c@x.com');
  insert into public.authorized_members (email, status, role) values ('a@x.com','approved','user'),('b@x.com','approved','user');`);
const as = async (uid, email, sql, params) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid || ''}', false), set_config('request.jwt.claims', '${JSON.stringify({ email: email || '' })}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const err = async (p) => { try { await p; return null; } catch (e) { return e.message; } };
const s1 = (await as(U1, 'a@x.com', 'select public.bb_bc_start() as s')).rows[0].s;
ok('miembro recibe semilla', /^[0-9A-F]{16}$/.test(s1), s1);
ok('no miembro rechazado', /Makers Club/.test(await err(as(U3, 'c@x.com', 'select public.bb_bc_start()')) || ''));
ok('anónimo rechazado', !!(await err(as(null, null, 'select public.bb_bc_start()'))));
ok('cliente no lee runs', !!(await err(as(U1, 'a@x.com', 'select * from public.bb_bc_runs'))));
ok('cliente no puede registrar', !!(await err(as(U1, 'a@x.com', `select public.bb_bc_record('${U1}', '${s1}', '{}', '[]')`))));
const res = (r) => JSON.stringify({ rules_version: 1, won: false, lot: 2, blind: 1, total: r, best_hand: 300, prints: 20 });
await db.exec('set role service_role');
const r1 = (await db.query(`select public.bb_bc_record($1, $2, $3::jsonb, '[]'::jsonb) as r`, [U1, s1, res(1500)])).rows[0].r;
ok('registra y da puesto', r1.rank === 1 && Number(r1.best) === 1500, JSON.stringify(r1));
ok('no repite semilla', /ya se cargó/.test(await err(db.query(`select public.bb_bc_record($1, $2, $3::jsonb, '[]'::jsonb)`, [U1, s1, res(9)])) || ''));
await db.exec('reset role');
const s2 = (await as(U2, 'b@x.com', 'select public.bb_bc_start() as s')).rows[0].s;
await db.exec('set role service_role');
ok('semilla ajena rechazada', /no es tuya/.test(await err(db.query(`select public.bb_bc_record($1, $2, $3::jsonb, '[]'::jsonb)`, [U1, s2, res(5)])) || ''));
await db.query(`select public.bb_bc_record($1, $2, $3::jsonb, '[]'::jsonb)`, [U2, s2, res(2500)]);
await db.exec('reset role');
const rk = (await as(null, null, "select public.bb_bc_ranking('global', 10) as r")).rows[0].r;
ok('ranking ordenado', rk.rows.length === 2 && Number(rk.rows[0].points) === 2500 && rk.rows[0].name === 'Maker anónimo', JSON.stringify(rk.rows));
const me = (await as(U1, 'a@x.com', "select public.bb_bc_ranking('semanal', 10) as r")).rows[0].r;
ok('mi puesto semanal', me.me && me.me.rank === 2 && me.rows.find((x) => x.me)?.name === 'Vos', JSON.stringify(me.me));
console.log(`\n${pass} OK, ${fail} fallas`); process.exit(fail ? 1 : 0);
