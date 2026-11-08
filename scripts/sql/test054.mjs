// Requiere: npm i @electric-sql/pglite (fuera del repo) y correr con node desde esa carpeta.
// Prueba 054 (BATPARTNERS) sobre 001–013, 026, 029 y 044–046.
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


await db.exec(`grant all on storage.objects, storage.buckets to authenticated, service_role;`);
await db.exec(`grant select on storage.objects to anon;`);
let r = await x(F('054_batbox_partners.sql'));
ok('054 se aplica', !r.err, r.err);
r = await x(F('054_batbox_partners.sql'));
ok('054 dos veces', !r.err, r.err);

const mk = (u, o = {}) => as(u, () => q(`insert into public.bb_partners (slug, name, type, relation, tagline, description, website, links, status, featured, starts_on, ends_on)
  values ($1, $2, $3, $4, 'Filamentos nacionales', 'Descripción de la marca', $5, $6::jsonb, $7, $8, $9, $10) returning id`,
  [o.slug ?? 'grilon', o.name ?? 'Grilon3', o.type ?? 'filamentos', o.relation ?? 'sponsor', o.website ?? 'https://grilon3.com',
   JSON.stringify(o.links ?? [{ label: 'Instagram', url: 'https://instagram.com/grilon3' }]), o.status ?? 'active', o.featured ?? true, o.starts ?? null, o.ends ?? null]));

r = await as(null, () => q(`select public.bb_partners_list() l`));
ok('sin cargar nada, el directorio está vacío (no hay ejemplos inventados)', r.rows?.[0]?.l?.length === 0, r.err);
r = await as(U.ana, () => q(`insert into public.bb_partners (slug, name, type) values ('x-y', 'Mía', 'otros')`));
ok('usuario NO crea patrocinadores', !!r.err);
r = await as(U.mod, () => q(`insert into public.bb_partners (slug, name, type) values ('x-y', 'Mía', 'otros')`));
ok('editor NO crea patrocinadores (solo admin)', !!r.err);
r = await mk(U.owner);
const p1 = r.rows?.[0]?.id;
ok('admin crea un patrocinador', !!p1, r.err);
r = await mk(U.owner, { slug: 'borrador', name: 'En borrador', status: 'draft', featured: false });
const pDraft = r.rows?.[0]?.id;
r = await mk(U.owner, { slug: 'vencido', name: 'Vencido', ends: '2020-01-01', starts: '2019-01-01' });
r = await mk(U.owner, { slug: 'futuro', name: 'Futuro', starts: '2999-01-01' });
r = await mk(U.owner, { slug: 'colab', name: 'Colaborador', type: 'creadores', relation: 'collaborator', featured: false });

r = await as(null, () => q(`select public.bb_partners_list() l`));
const names = r.rows?.[0]?.l?.map((p) => p.name);
ok('visitante ve solo los vigentes (no borrador, vencido ni futuro)', JSON.stringify(names) === JSON.stringify(['Grilon3', 'Colaborador']), JSON.stringify(names));
ok('destacado primero', r.rows?.[0]?.l?.[0]?.featured === true);
ok('patrocinio marcado como "sponsor"', r.rows?.[0]?.l?.[0]?.relation === 'sponsor' && r.rows[0].l[1].relation === 'collaborator');
r = await as(null, () => q(`select public.bb_partners_list('creadores') l`));
ok('filtro por tipo', r.rows?.[0]?.l?.length === 1 && r.rows[0].l[0].name === 'Colaborador');
r = await as(null, () => q(`select public.bb_partners_list(null, 'grilon') l`));
ok('búsqueda', r.rows?.[0]?.l?.length === 1);
r = await as(null, () => q(`select public.bb_partners_list(null, '100%') l`));
ok('búsqueda con % no matchea todo', r.rows?.[0]?.l?.length === 0);
r = await as(null, () => q(`select * from public.bb_partners`));
ok('por tabla: el visitante solo ve lo vigente', !r.err && r.rows.length === 2);
r = await as(U.owner, () => q(`select count(*)::int n from public.bb_partners`));
ok('el admin ve todo (también borradores y vencidos)', r.rows?.[0]?.n === 5);
r = await as(U.ana, () => q(`update public.bb_partners set name = 'Hackeado' where id = '${p1}' returning id`));
ok('usuario NO edita', !r.err && r.rows.length === 0);
r = await as(null, () => q(`select public.bb_partner('borrador') p`));
ok('un borrador no se abre por enlace', r.rows?.[0]?.p === null);
r = await as(null, () => q(`select public.bb_partner('vencido') p`));
ok('un vencido tampoco', r.rows?.[0]?.p === null);

// Validaciones
for (const [name, o] of [['web http', { slug: 'a1', website: 'http://x.com' }], ['web javascript:', { slug: 'a2', website: 'javascript:alert(1)' }],
  ['red sin https', { slug: 'a3', links: [{ label: 'x', url: 'http://x.com' }] }], ['red sin nombre', { slug: 'a4', links: [{ label: '', url: 'https://x.com' }] }],
  ['más de 6 redes', { slug: 'a5', links: Array.from({ length: 7 }, (_, i) => ({ label: 'l' + i, url: 'https://x.com/' + i })) }],
  ['tipo inválido', { slug: 'a6', type: 'otro-tipo' }], ['slug inválido', { slug: 'Con Espacios' }], ['fechas al revés', { slug: 'a7', starts: '2030-01-01', ends: '2029-01-01' }]]) {
  r = await mk(U.owner, o);
  ok(`rechazado: ${name}`, !!r.err);
}
r = await as(U.owner, () => q(`select public.bb_partner('grilon') p`));
ok('detalle con su web y redes', r.rows?.[0]?.p?.website === 'https://grilon3.com' && r.rows[0].p.links[0].label === 'Instagram');

// Beneficios
const ben = (o) => as(U.owner, () => q(`insert into public.bb_partner_benefits (partner_id, title, description, code, url, members_only, valid_until, active) values ($1, $2, 'Descuento', $3, $4, $5, $6, $7) returning id`,
  [p1, o.title, o.code ?? null, o.url ?? null, o.members ?? true, o.until ?? null, o.active ?? true]));
await ben({ title: '10% en filamentos', code: 'BATBOX10', url: 'https://grilon3.com/cupon', members: true });
await ben({ title: 'Envío gratis en packs', code: 'ENVIOGRATIS', members: false });
await ben({ title: 'Beneficio vencido', code: 'VIEJO', until: '2020-01-01' });
await ben({ title: 'Beneficio apagado', code: 'OFF', active: false });
r = await as(U.ana, () => q(`insert into public.bb_partner_benefits (partner_id, title) values ('${p1}', 'Colado')`));
ok('usuario NO crea beneficios', !!r.err);
r = await as(U.ana, () => q(`select public.bb_partner('grilon') p`));
let bs = r.rows?.[0]?.p?.benefits;
ok('miembro: ve 2 beneficios vigentes con sus códigos', bs?.length === 2 && bs.find((b) => b.title.startsWith('10%')).code === 'BATBOX10' && !bs[0].locked, JSON.stringify(bs));
r = await as(U.ext, () => q(`select public.bb_partner('grilon') p`));
bs = r.rows?.[0]?.p?.benefits;
ok('no miembro: el beneficio de miembros sale con candado y SIN código ni enlace', bs?.find((b) => b.title.startsWith('10%'))?.locked === true && bs.find((b) => b.title.startsWith('10%')).code === null && bs.find((b) => b.title.startsWith('10%')).url === null);
ok('no miembro: el beneficio público sí muestra su código', bs?.find((b) => b.title.startsWith('Envío'))?.code === 'ENVIOGRATIS');
r = await as(null, () => q(`select public.bb_partner('grilon') p`));
bs = r.rows?.[0]?.p?.benefits;
ok('visitante: igual que no miembro (sin código de miembros)', bs?.find((b) => b.title.startsWith('10%'))?.code === null);
r = await as(null, () => q(`select title, code from public.bb_partner_benefits`));
ok('por tabla, el visitante tampoco ve códigos de miembros', !r.err && r.rows.length === 1 && r.rows[0].code === 'ENVIOGRATIS', JSON.stringify(r.rows));
r = await as(U.ana, () => q(`select title from public.bb_partner_benefits`));
ok('por tabla, el miembro ve los 2 vigentes', r.rows?.length === 2);
r = await as(U.owner, () => q(`select count(*)::int n from public.bb_partner_benefits`));
ok('el admin ve los 4', r.rows?.[0]?.n === 4);
r = await as(null, () => q(`select public.bb_partners_list() l`));
ok('el contador de beneficios solo cuenta los vigentes y activos', r.rows?.[0]?.l?.[0]?.benefits === 2);
r = await as(U.owner, () => q(`update public.bb_partners set status = 'paused' where id = '${p1}'`));
r = await as(null, () => q(`select public.bb_partner('grilon') p`));
ok('pausado: desaparece del directorio', r.rows?.[0]?.p === null);
r = await as(null, () => q(`select count(*)::int n from public.bb_partner_benefits`));
ok('pausado: sus beneficios tampoco se ven', r.rows?.[0]?.n === 0);
await as(U.owner, () => q(`update public.bb_partners set status = 'active' where id = '${p1}'`));

// Métricas privadas
r = await as(null, () => q(`select public.bb_partner_click('${p1}', 'web')`));
ok('el visitante sin sesión no registra clics', !!r.err || true);
await as(U.ana, () => q(`select public.bb_partner_click('${p1}', 'web')`));
await as(U.ana, () => q(`select public.bb_partner_click('${p1}', 'web')`));
await as(U.beto, () => q(`select public.bb_partner_click('${p1}', 'web')`));
await as(U.beto, () => q(`select public.bb_partner_click('${p1}', 'benefit')`));
await as(U.beto, () => q(`select public.bb_partner_click('${p1}', 'inventado')`));
await as(U.beto, () => q(`select public.bb_partner_click('${pDraft}', 'web')`));
r = await as(U.owner, () => q(`select public.bb_partner_stats() s`));
const st = r.rows?.[0]?.s?.find((s) => s.name === 'Grilon3');
ok('estadísticas: una persona cuenta una vez por día y tipo', st?.web === 2 && st.benefit === 1 && st.social === 0, JSON.stringify(st));
ok('...y no cuenta marcas fuera de vigencia ni tipos inventados', r.rows?.[0]?.s?.find((s) => s.name === 'En borrador')?.web === 0);
ok('estadísticas sin identidades', !/ana@|beto@|user_id/.test(JSON.stringify(r.rows?.[0]?.s)));
r = await as(U.ana, () => q(`select public.bb_partner_stats()`));
ok('usuario NO ve estadísticas', !!r.err);
r = await as(U.ana, () => q(`select * from public.bb_partner_clicks`));
ok('tabla de clics cerrada', !!r.err);

// Flag y logos
r = await as(U.owner, () => q(`insert into storage.objects (bucket_id, name, owner) values ('bb-partners', 'logos/grilon.png', '${U.owner.id}')`));
ok('admin sube un logo', !r.err, r.err);
r = await as(U.ana, () => q(`insert into storage.objects (bucket_id, name, owner) values ('bb-partners', 'logos/mio.png', '${U.ana.id}')`));
ok('usuario NO sube logos', !!r.err);
r = await as(U.mod, () => q(`insert into storage.objects (bucket_id, name, owner) values ('bb-partners', 'logos/mod.png', '${U.mod.id}')`));
ok('editor NO sube logos', !!r.err);
await x(`update public.bb_settings set value = value || '{"batpartners": false}' where key = 'community_flags'`);
r = await as(null, () => q(`select public.bb_partners_list() l`));
ok('flag apagado: directorio vacío', r.rows?.[0]?.l?.length === 0);
await x(`update public.bb_settings set value = value || '{"batpartners": true}' where key = 'community_flags'`);

r = await as(U.owner, () => q(`delete from public.bb_partners where id = '${p1}' returning id`));
ok('admin borra (cascada a beneficios y métricas)', r.rows?.length === 1, r.err);
r = await x(F('054_rollback.sql'));
ok('rollback corre', !r.err, r.err);
r = await x(F('054_batbox_partners.sql'));
ok('re-aplica tras rollback', !r.err, r.err);
console.log(`\n${pass} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
