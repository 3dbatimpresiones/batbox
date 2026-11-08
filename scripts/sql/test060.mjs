// Requiere: npm i @electric-sql/pglite (fuera del repo) y correr con node desde esa carpeta.
// Prueba 058 + 059 + 060 (BIBLIOTECA 3D: galería, mis descargas y avisos) sobre cotizador + 001–003, 007, 008, 012, 013, 022, 026, 029, 044, 045, 049.
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

// --- Acceso ---
ok('anónimo no lista', !!(await as(null, () => q('select public.bb_lib_models_list()'))).err);
const trialMember = v(await as(U.prueba, () => q('select public.bb_is_member()')));
ok('prueba gratis es miembro en BATBOX (control)', trialMember === true);
ok('prueba gratis NO entra a la biblioteca', /exclusiva/.test((await as(U.prueba, () => q('select public.bb_lib_models_list()'))).err || ''));
ok('prueba gratis NO descarga', !!(await as(U.prueba, () => q(`select public.bb_lib_download(gen_random_uuid())`))).err);
ok('membresía vencida NO entra', !!(await as(U.vencida, () => q('select public.bb_lib_categories_list()'))).err);
const cats = v(await as(U.paga, () => q('select public.bb_lib_categories_list()')));
ok('pago ve la categoría Autos', cats?.some((c) => c.slug === 'autos'));
ok('tabla de modelos no se lee directo', !!(await as(U.paga, () => q('select * from public.bb_lib_models'))).err);
ok('tabla de descargas no se lee directo', !!(await as(U.paga, () => q('select * from public.bb_lib_downloads'))).err);

// --- Administración ---
const autos = cats.find((c) => c.slug === 'autos').id;
ok('pago no puede crear modelos', !!(await as(U.paga, () => q(`select public.bb_lib_admin_model_save('{}'::jsonb)`))).err);
ok('editor no es admin de la biblioteca', !!(await as(U.editor, () => q(`select public.bb_lib_admin_stats()`))).err);
const mk = (slug, key) => as(U.owner, () => q(`select public.bb_lib_admin_model_save($1::jsonb)`, [JSON.stringify({
  slug, name: 'VW R32 ' + slug, category_id: autos, tags: ['Auto', ' escala '], storage_key: key, file_name: slug + '.zip',
  size_bytes: 43600000, parts: [{ name: 'carroceria.stl' }, { name: 'ruedas.stl' }] })]));
const m1 = v(await mk('vw-r32', '1ikTziO5QMA5zevdT8-3sh5kN6lDjUPys'));
ok('admin crea modelo en borrador', !!m1);
const tg = v(await q(`select array_to_string(tags, ',') from public.bb_lib_models where id=$1`, [m1]));
ok('etiquetas normalizadas', tg === 'auto,escala', tg);
ok('borrador no aparece para el pago', (v(await as(U.paga, () => q('select public.bb_lib_models_list()'))) || []).length === 0);
ok('borrador no se descarga', !!(await as(U.paga, () => q(`select public.bb_lib_download($1)`, [m1]))).err);
ok('no publica sin licencia verificada', /licencia/.test((await as(U.owner, () => q(`select public.bb_lib_admin_model_status($1,'published')`, [m1]))).err || ''));
ok('restricción de la tabla también lo impide', !!(await q(`update public.bb_lib_models set status='published' where id=$1`, [m1])).err);
await as(U.owner, () => q(`select public.bb_lib_admin_model_save($1::jsonb)`, [JSON.stringify({ id: m1, license_status: 'verified', license: 'Propia' })]));
ok('publica con licencia verificada', !(await as(U.owner, () => q(`select public.bb_lib_admin_model_status($1,'published')`, [m1]))).err);
const list = v(await as(U.paga, () => q(`select public.bb_lib_models_list($1, 'r32')`, [autos])));
ok('pago ve el modelo publicado y busca', list?.length === 1 && list[0].parts_count === 2);
const det = v(await as(U.paga, () => q(`select public.bb_lib_model('vw-r32')`)));
ok('ficha sin datos internos para el pago', det && !('storage_key' in det) && !('license_status' in det));

// --- Descargas y cupo ---
let lastErr = '';
for (let i = 1; i <= 6; i++) {
  const r = await as(U.paga, () => q(`select public.bb_lib_download($1)`, [m1]));
  if (i <= 5) ok(`descarga ${i} de 5`, v(r)?.remaining === 5 - i, JSON.stringify(v(r) || r.err));
  else lastErr = r.err || '';
}
ok('la 6.ª se rechaza con aviso de hora', /máximo de 5/.test(lastErr) && /a las/.test(lastErr), lastErr);
const quota = v(await as(U.paga, () => q('select public.bb_lib_quota()')));
ok('cupo: 0 restantes y hora de liberación', quota.remaining === 0 && !!quota.next_free_at && quota.paid === true);
ok('contador de descargas = 5', v(await q(`select downloads from public.bb_lib_models where id=$1`, [m1])) === 5);
await q(`update public.bb_lib_downloads set created_at = now() - interval '25 hours' where id = (select min(id) from public.bb_lib_downloads)`);
ok('ventana de 24 h: se libera 1 cupo', v(await as(U.paga, () => q(`select public.bb_lib_download($1)`, [m1])))?.remaining === 0);
let adminOk = true;
for (let i = 0; i < 8; i++) adminOk = adminOk && !(await as(U.owner, () => q(`select public.bb_lib_download($1)`, [m1]))).err;
ok('admin sin límite (8 descargas)', adminOk);
const tok = v(await as(U.owner, () => q(`select public.bb_lib_download($1)`, [m1]))).token;
await db.exec('set role service_role');
const red = await q(`select * from public.bb_lib_redeem($1)`, [tok]);
await db.exec('reset role');
ok('el puente canjea el permiso', red.rows?.[0]?.file_key === '1ikTziO5QMA5zevdT8-3sh5kN6lDjUPys');
ok('miembro no puede canjear permisos', !!(await as(U.paga, () => q(`select * from public.bb_lib_redeem($1)`, [tok]))).err);

// --- Favoritos ---
ok('agrega favorito', v(await as(U.paga, () => q(`select public.bb_lib_favorite_toggle($1)`, [m1]))) === true);
ok('aparece en mis favoritos', v(await as(U.paga, () => q('select public.bb_lib_my_favorites()')))?.length === 1);
ok('ficha marca favorito', v(await as(U.paga, () => q(`select public.bb_lib_model('vw-r32')`))).is_favorite === true);
ok('quita favorito', v(await as(U.paga, () => q(`select public.bb_lib_favorite_toggle($1)`, [m1]))) === false);
await as(U.paga, () => q(`select public.bb_lib_favorite_toggle($1)`, [m1]));
await q(`update public.authorized_members set subscription_expires_at = now() - interval '1 day' where email='paga@gmail.com'`);
ok('al vencer pierde acceso', !!(await as(U.paga, () => q('select public.bb_lib_my_favorites()'))).err);
ok('pero el favorito se conserva', v(await q(`select count(*)::int from public.bb_lib_favorites where user_id=$1`, [U.paga.id])) === 1);

// --- 060: galería, mis descargas, avisos ---
await q(`update public.authorized_members set subscription_expires_at = now() + interval '5 days' where email='paga@gmail.com'`);
await q(`update public.bb_lib_models set images='["a.webp","b.webp"]'::jsonb where id=$1`, [m1]);
const d2 = v(await as(U.paga, () => q(`select public.bb_lib_model('vw-r32')`)));
ok('060 ficha trae la galería', d2?.images?.length === 2);
const md = v(await as(U.paga, () => q('select public.bb_lib_my_downloads()')));
ok('060 mis descargas: 1 modelo con 6 descargas', md?.length === 1 && md[0].times === 6 && !!md[0].last_download, JSON.stringify(md));
ok('060 prueba gratis no ve mis descargas', !!(await as(U.prueba, () => q('select public.bb_lib_my_downloads()'))).err);
ok('060 miembro no puede mandar avisos', !!(await as(U.paga, () => q(`select public.bb_lib_notify_new(1,'x')`))).err);
await db.exec('set role service_role');
const sent = v(await q(`select public.bb_lib_notify_new(2,'Peugeot 206, Gol Trend')`));
await q(`select public.bb_lib_notify_new(1,'Supra')`);
await db.exec('reset role');
const cnt = async (u) => v(await q(`select count(*)::int from public.bb_notifications where user_id=$1 and kind='library_new'`, [u.id]));
const [nPaga, nPrueba, nVenc] = [await cnt(U.paga), await cnt(U.prueba), await cnt(U.vencida)];
ok('060 aviso llega a pagos y no a prueba/vencidos', sent >= 2 && nPaga === 1 && nPrueba === 0 && nVenc === 0, `sent=${sent} paga=${nPaga} prueba=${nPrueba} venc=${nVenc}`);
const bell = v(await as(U.paga, () => q('select public.bb_notifications_list()')));
ok('060 aparece en la campanita', bell?.items?.some((n) => n.kind === 'library_new' && /2 nuevos/.test(n.snippet)), JSON.stringify(bell?.items?.[0]));
// Antes del lanzamiento (interruptor apagado): solo admins.
await setFlag(false);
await q(`delete from public.bb_notifications where kind='library_new'`);
ok('060 cerrada: miembro pago ve "próximamente" (sin datos)', !!(await as(U.paga, () => q('select public.bb_lib_models_list()'))).err);
ok('060 cerrada: miembro pago no descarga', !!(await as(U.paga, () => q(`select public.bb_lib_download($1)`, [m1]))).err);
ok('060 cerrada: cupo dice paid=false', v(await as(U.paga, () => q('select public.bb_lib_quota()'))).paid === false);
ok('060 cerrada: admin sí entra', (v(await as(U.owner, () => q('select public.bb_lib_models_list()'))) || []).length >= 1);
await db.exec('set role service_role');
await q(`select public.bb_lib_notify_new(1,'Secreto')`);
await db.exec('reset role');
ok('060 cerrada: el aviso llega solo a admins', (await cnt(U.paga)) === 0 && (await cnt(U.owner)) === 1);
await setFlag(true);
ok('060 abierta de nuevo: miembro pago entra', !(await as(U.paga, () => q('select public.bb_lib_models_list()'))).err);
const rb60 = await (async () => { try { await db.exec(read(BB + '060_rollback.sql')); return {}; } catch (e) { return { err: e.message }; } })();
ok('060 rollback limpio y la ficha sigue andando', !rb60.err && !!v(await as(U.paga, () => q(`select public.bb_lib_model('vw-r32')`))), rb60.err);
await q(`update public.authorized_members set subscription_expires_at = now() - interval '1 day' where email='paga@gmail.com'`);

// --- Admin y rollback ---
const st = v(await as(U.owner, () => q('select public.bb_lib_admin_stats()')));
ok('estadísticas de admin', st.published === 1 && st.downloads_total === 6);
const rb = await (async () => { try { await db.exec(read(BB + '059_rollback.sql')); return {}; } catch (e) { return { err: e.message }; } })();
ok('rollback 059 limpio', !rb.err && !v(await q(`select to_regclass('public.bb_lib_models')`)) && !!v(await q(`select to_regclass('public.bb_lib_grants')`)), rb.err);

console.log(`\n${pass} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
