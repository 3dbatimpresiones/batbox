// Requiere: npm i @electric-sql/pglite (fuera del repo) y correr con node desde esa carpeta.
// Prueba 061 (BIBLIOTECA 3D: etiquetas automáticas, filtros, relacionados, valoraciones, colecciones, lanzamiento) sobre 058–060 y cotizador + 001–003, 007, 008, 012, 013, 022, 026, 029, 044, 045, 049.
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

// ===================== 061 =====================
const cats = v(await as(U.paga, () => q('select public.bb_lib_categories_list()')));
const autos = cats.find((c) => c.slug === 'autos').id;
const mk = async (name, key) => v(await as(U.owner, () => q(`select public.bb_lib_admin_model_save($1::jsonb)`, [JSON.stringify({
  slug: name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  name, category_id: autos, storage_key: key, file_name: 'x.zip', license_status: 'verified' })])));
const ids = {};
for (const [n, k] of [['Audi R8 V10 Plus (GT-RC) Escala 1:12', 'AAAAAAAAAA1'], ['Audi RS6 C8 GT Edition (GT-RC) Escala 1:12', 'AAAAAAAAAA2'],
  ['VolksWagen R32 MK5 con dirección Escala 1:19', 'AAAAAAAAAA3'], ['Volkswagen Gol Trend', 'AAAAAAAAAA4'], ['Toyota Supra A90 con Dirección Escala 1:19', 'AAAAAAAAAA5']]) {
  ids[n] = await mk(n, k);
  await as(U.owner, () => q(`select public.bb_lib_admin_model_status($1,'published')`, [ids[n]]));
}
const R8 = 'Audi R8 V10 Plus (GT-RC) Escala 1:12';
const tagsOf = async (id) => v(await q(`select array_to_string(tags, ',') from public.bb_lib_models where id=$1`, [id]));
const t8 = await tagsOf(ids[R8]);
ok('061 etiquetas auto: escala + gt-rc + marca', /escala 1:12/.test(t8) && /gt-rc/.test(t8) && /audi/.test(t8), t8);
ok('061 "VolksWagen" y "Volkswagen" = misma marca', (await tagsOf(ids['VolksWagen R32 MK5 con dirección Escala 1:19'])).includes('volkswagen') && (await tagsOf(ids['Volkswagen Gol Trend'])).includes('volkswagen'));
ok('061 "con dirección"/"Dirección" = misma etiqueta', (await tagsOf(ids['Toyota Supra A90 con Dirección Escala 1:19'])).includes('con direccion') && (await tagsOf(ids['VolksWagen R32 MK5 con dirección Escala 1:19'])).includes('con direccion'));
const tags = v(await as(U.paga, () => q('select public.bb_lib_tags()')));
ok('061 filtros: solo etiquetas con 2+ modelos', tags.some((t) => t.tag === 'escala 1:12' && t.count === 2) && !tags.some((t) => t.tag === 'toyota'), JSON.stringify(tags));
const f1 = v(await as(U.paga, () => q(`select public.bb_lib_models_list(p_tag => 'escala 1:19')`)));
ok('061 filtrar por etiqueta', f1?.length === 2, JSON.stringify(f1?.length));
ok('061 tarjeta trae fotos y valoración', !!f1 && 'photos' in f1[0] && 'rating_count' in f1[0]);
const rel = v(await as(U.paga, () => q(`select public.bb_lib_related($1)`, [ids[R8]])));
ok('061 relacionados: primero el más parecido, sin sí mismo', rel?.[0]?.name.startsWith('Audi RS6') && !rel.some((r) => r.id === ids[R8]), JSON.stringify(rel?.map((r) => r.name)));
ok('061 renombrar recalcula etiquetas', !(await as(U.owner, () => q(`select public.bb_lib_admin_model_save($1::jsonb)`, [JSON.stringify({ id: ids['Volkswagen Gol Trend'], name: 'Fiat 600 Escala 1:10' })]))).err && /fiat/.test(await tagsOf(ids['Volkswagen Gol Trend'])));

// Valoraciones
await q(`update public.authorized_members set subscription_expires_at = now() + interval '5 days' where email='paga@gmail.com'`);
const r8 = ids[R8];
ok('061 no se puede valorar sin descargar', /después de descargarlo/.test((await as(U.paga, () => q(`select public.bb_lib_review_save($1, 5, 'x')`, [r8]))).err || ''));
await as(U.paga, () => q(`select public.bb_lib_download($1)`, [r8]));
ok('061 valorar después de descargar', !(await as(U.paga, () => q(`select public.bb_lib_review_save($1, 4, 'Muy bueno')`, [r8]))).err);
await as(U.paga, () => q(`select public.bb_lib_review_save($1, 2, 'Cambié de opinión')`, [r8]));
await as(U.owner, () => q(`select public.bb_lib_review_save($1, 5, '')`, [r8]));
const card = v(await as(U.paga, () => q(`select public.bb_lib_model('audi-r8-v10-plus-gt-rc-escala-1-12')`)));
ok('061 promedio y cantidad correctos al editar', Number(card?.rating) === 3.5 && card?.rating_count === 2, JSON.stringify([card?.rating, card?.rating_count]));
ok('061 estrellas fuera de rango', !!(await as(U.paga, () => q(`select public.bb_lib_review_save($1, 9, '')`, [r8]))).err);
const rl = v(await as(U.paga, () => q(`select public.bb_lib_reviews_list($1)`, [r8])));
ok('061 lista de reseñas, la mía primero', rl?.items.length === 2 && rl.items[0].mine && rl.can_review === true);
ok('061 un miembro no borra reseñas ajenas', !!(await as(U.paga, () => q(`select public.bb_lib_review_delete($1, $2)`, [r8, U.owner.id]))).err);
await as(U.owner, () => q(`select public.bb_lib_review_delete($1, $2)`, [r8, U.paga.id]));
const c2 = v(await as(U.paga, () => q(`select public.bb_lib_model('audi-r8-v10-plus-gt-rc-escala-1-12')`)));
ok('061 admin borra reseña y se recalcula', Number(c2?.rating) === 5 && c2?.rating_count === 1);

// Colecciones
const col = v(await as(U.paga, () => q(`select public.bb_lib_collection_save('Para imprimir')`)));
ok('061 crear colección', !!col);
ok('061 agregar a colección', v(await as(U.paga, () => q(`select public.bb_lib_collection_toggle($1,$2)`, [col, r8]))) === true);
const mc = v(await as(U.paga, () => q(`select public.bb_lib_my_collections($1)`, [r8])));
ok('061 mis colecciones: cantidad y "ya está"', mc?.[0]?.count === 1 && mc[0].has === true);
ok('061 modelos de la colección', v(await as(U.paga, () => q(`select public.bb_lib_collection_models($1)`, [col])))?.length === 1);
ok('061 otro no ve mi colección', !!(await as(U.owner, () => q(`select public.bb_lib_collection_models($1)`, [col]))).err);
ok('061 quitar de colección', v(await as(U.paga, () => q(`select public.bb_lib_collection_toggle($1,$2)`, [col, r8]))) === false);
ok('061 nombre vacío rechazado', !!(await as(U.paga, () => q(`select public.bb_lib_collection_save('  ')`))).err);
await as(U.paga, () => q(`select public.bb_lib_collection_delete($1)`, [col]));
ok('061 borrar colección', v(await as(U.paga, () => q('select public.bb_lib_my_collections()')))?.length === 0);
ok('061 prueba gratis sin colecciones', !!(await as(U.prueba, () => q(`select public.bb_lib_collection_save('x')`))).err);

// Lanzamiento
await q(`delete from public.bb_notifications`);
// La base de prueba ya se "lanzó" al prepararse: se limpia la fecha sin el disparador para probar desde cero.
await db.exec(`alter table public.bb_settings disable trigger bb_lib_on_launch;
  update public.bb_settings set value = '{"biblioteca": false, "batfeed": true}'::jsonb where key='community_flags';
  alter table public.bb_settings enable trigger bb_lib_on_launch;`);
ok('061 apagado: sin fecha de lanzamiento', !('biblioteca_launched_at' in v(await q(`select value from public.bb_settings where key='community_flags'`))));
await setFlag(true);
const fl = v(await q(`select value from public.bb_settings where key='community_flags'`));
const nL = v(await q(`select count(*)::int from public.bb_notifications where kind='library_launch'`));
const nLp = v(await q(`select count(*)::int from public.bb_notifications where kind='library_launch' and user_id=$1`, [U.prueba.id]));
ok('061 al prender: fecha + aviso a pagos (no a prueba gratis)', !!fl.biblioteca_launched_at && nL >= 2 && nLp === 0, `avisos=${nL}`);
await q(`update public.bb_settings set value = '{"biblioteca": true, "batfeed": true}'::jsonb where key='community_flags'`);
const fl2 = v(await q(`select value from public.bb_settings where key='community_flags'`));
ok('061 guardar interruptores sin la fecha la conserva', fl2.biblioteca_launched_at === fl.biblioteca_launched_at);
await setFlag(false); await setFlag(true);
ok('061 apagar y prender de nuevo no repite el aviso', v(await q(`select count(*)::int from public.bb_notifications where kind='library_launch'`)) === nL);

// Rollback
const rb = await (async () => { try { await db.exec(read(BB + '061_rollback.sql')); return {}; } catch (e) { return { err: e.message }; } })();
ok('061 rollback limpio y el listado sigue andando', !rb.err && (v(await as(U.paga, () => q('select public.bb_lib_models_list()'))) || []).length >= 4, rb.err);

console.log(`\n${pass} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
