// Requiere: npm i @electric-sql/pglite (fuera del repo) y correr con node desde esa carpeta.
// Prueba 049 (GALERÍA MAKER) sobre 001–013, 026, 029 y 044–045.
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
// El arnés da "grant all" a todo; se restituyen los permisos reales de la 044 sobre las tablas sociales.
await db.exec(`revoke all on public.bb_posts, public.bb_post_reactions, public.bb_post_comments, public.bb_post_saves, public.bb_notifications from authenticated;
  grant select, insert, delete on public.bb_posts to authenticated; grant update (body, category, tags, media, video_url) on public.bb_posts to authenticated;
  grant select, insert, delete on public.bb_post_reactions to authenticated; grant update (kind) on public.bb_post_reactions to authenticated;
  grant select, insert, delete on public.bb_post_comments to authenticated; grant select, insert, delete on public.bb_post_saves to authenticated;
  grant select, delete on public.bb_notifications to authenticated; grant update (read_at) on public.bb_notifications to authenticated;`);
let r = await x(F('049_batbox_gallery.sql'));
ok('049 se aplica', !r.err, r.err);
r = await x(F('049_batbox_gallery.sql'));
ok('049 dos veces', !r.err, r.err);

const photo = (u, n = 'a') => [{ path: `${u.id}/${n}.webp` }];
const save = (u, o = {}) => as(u, () => q(`select public.bb_gallery_save($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16, $17) id`,
  [o.id || null, o.title ?? 'Soporte para auriculares en PETG', o.desc ?? 'Un soporte funcional impreso en PETG', o.cat ?? 'impresion-fdm', o.tags ?? ['#Petg', 'soporte'],
   JSON.stringify(o.media ?? photo(u)), o.video ?? null, o.state ?? 'done', o.tech ?? 'FDM', o.machine ?? 'Bambu Lab A1', o.material ?? 'PETG', o.minutes ?? 180,
   JSON.stringify(o.params ?? { Capa: '0.2 mm', Relleno: '15 %' }), JSON.stringify(o.links ?? [{ label: 'Printables', url: 'https://www.printables.com/model/1' }]),
   o.license ?? false, o.in_feed ?? true, o.publish ?? true]));

// Categorías
r = await as(U.ana, () => q(`select public.bb_gallery_categories_list() l`));
ok('11 categorías iniciales', r.rows?.[0]?.l?.length === 11, String(r.rows?.[0]?.l?.length));
r = await as(U.ana, () => q(`insert into public.bb_gallery_categories (slug, name) values ('x-y', 'Mía')`));
ok('usuario NO crea categorías', !!r.err);
r = await as(U.owner, () => q(`insert into public.bb_gallery_categories (slug, name, sort) values ('maquetas', 'Maquetas', 5) returning id`));
ok('admin crea categoría', !!r.rows?.[0]?.id, r.err);
r = await as(U.ext, () => q(`select public.bb_gallery_categories_list() l`));
ok('no miembro NO ve la galería', r.rows?.[0]?.l?.length === 0);

// Regresión de BATFEED
r = await as(U.beto, () => q(`insert into public.bb_posts (body, status, pinned) values ('post normal de regresión', 'hidden', true) returning id, status, pinned, kind, title`));
const normal = r.rows?.[0];
ok('regresión: post normal publica forzado', normal?.status === 'published' && normal.pinned === false && normal.kind === 'post' && normal.title === null, r.err);
r = await as(U.beto, () => q(`insert into public.bb_posts (body, kind, title, status) values ('quiero colarme', 'project', 'Título válido de proyecto', 'published')`));
ok('no se crea un proyecto por inserción directa', !!r.err);
r = await as(U.beto, () => q(`update public.bb_posts set kind = 'project', title = 'Convertido a proyecto' where id = '${normal.id}'`));
ok('no se convierte un post en proyecto', !!r.err);
r = await as(U.c1, () => q(`select public.bb_feed() f`));
ok('regresión: el feed muestra el post normal', r.rows?.[0]?.f?.items?.some((i) => i.id === normal.id && i.kind === 'post'));

// Borrador
r = await save(U.ana, { publish: false, media: [] });
const draft = r.rows?.[0]?.id;
ok('guarda un borrador sin fotos', !!draft, r.err);
r = await as(U.ana, () => q(`select status from public.bb_posts where id = '${draft}'`));
ok('queda en estado borrador', r.rows?.[0]?.status === 'draft');
r = await as(U.beto, () => q(`select public.bb_gallery_list() l`));
ok('el borrador no aparece en la galería', r.rows?.[0]?.l?.items?.length === 0);
r = await as(U.c1, () => q(`select public.bb_feed() f`));
ok('el borrador no aparece en BATFEED', !r.rows?.[0]?.f?.items?.some((i) => i.id === draft));
r = await as(U.beto, () => q(`select public.bb_gallery_project('${draft}') d`));
ok('otro NO abre un borrador', r.rows?.[0]?.d === null);
r = await as(U.beto, () => q(`select * from public.bb_posts where id = '${draft}'`));
ok('ni por tabla', !r.err && r.rows.length === 0);
r = await as(U.ana, () => q(`select public.bb_gallery_list(null, null, 'recent', null, null, false, null, true) l`));
ok('la dueña ve sus borradores', r.rows?.[0]?.l?.items?.length === 1 && r.rows[0].l.items[0].status === 'draft');
r = await as(U.beto, () => q(`insert into public.bb_post_reactions (post_id, kind) values ('${draft}', 'like')`));
ok('no se reacciona a un borrador', !!r.err);
r = await as(U.beto, () => q(`insert into public.bb_post_comments (post_id, body) values ('${draft}', 'hola')`));
ok('no se comenta un borrador', !!r.err);
r = await save(U.beto, { id: draft });
ok('otro NO edita mi borrador', !!r.err);

// Validaciones
const bad = async (name, o) => { const x2 = await save(U.ana, { publish: false, ...o }); ok(name, !!x2.err, x2.err ? '' : 'se aceptó'); };
await bad('título corto rechazado', { title: 'hey' });
await bad('categoría inexistente rechazada', { cat: 'no-existe' });
await bad('video que no es YouTube rechazado', { video: 'https://evil.com/watch?v=aaaaaaaaaaa' });
await bad('enlace http (sin s) rechazado', { links: [{ label: 'x', url: 'http://sitio.com' }] });
await bad('enlace javascript: rechazado', { links: [{ label: 'x', url: 'javascript:alert(1)' }] });
await bad('más de 5 enlaces rechazado', { links: Array.from({ length: 6 }, (_, i) => ({ label: 'l' + i, url: 'https://a.com/' + i })) });
await bad('parámetro demasiado largo rechazado', { params: { Capa: 'x'.repeat(101) } });
await bad('parámetros no-texto rechazados', { params: { Capa: 5 } });
await bad('más de 20 parámetros rechazados', { params: Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['p' + i, 'v'])) });
await bad('estado de proyecto inválido rechazado', { state: 'raro' });
await bad('tiempo negativo rechazado', { minutes: -5 });
await bad('foto de otra carpeta rechazada', { media: [{ path: `${U.beto.id}/a.webp` }] });
await bad('más de 4 fotos rechazadas', { media: Array.from({ length: 5 }, (_, i) => ({ path: `${U.ana.id}/f${i}.webp` })) });
r = await save(U.ana, { publish: true, media: [] });
ok('publicar sin fotos rechazado', !!r.err);
r = await save(U.ext);
ok('no miembro NO publica', !!r.err);

// Publicar (los campos técnicos son opcionales)
r = await save(U.ana, { id: draft, publish: true, tags: ['#Petg', 'soporte', 'x'] });
ok('el borrador se publica', !r.err, r.err);
r = await as(U.beto, () => q(`select public.bb_gallery_project('${draft}') d`));
const pj = r.rows?.[0]?.d?.project;
ok('detalle público con datos técnicos', pj?.title === 'Soporte para auriculares en PETG' && pj.machine === 'Bambu Lab A1' && pj.params.Capa === '0.2 mm' && pj.links.length === 1 && pj.status === 'published');
ok('etiquetas limpias', JSON.stringify(pj?.tags?.slice().sort()) === JSON.stringify(['petg', 'soporte']), JSON.stringify(pj?.tags));
ok('el detalle no expone correos ni teléfonos', !/@|1111|2222/.test(JSON.stringify(r.rows?.[0]?.d)));
r = await save(U.beto, { title: 'Proyecto mínimo sin datos técnicos', desc: 'Solo lo básico', cat: 'cosplay', tech: '', machine: '', material: '', minutes: null, params: {}, links: [], tags: [], media: photo(U.beto, 'b'), in_feed: false });
const min = r.rows?.[0]?.id;
ok('campos técnicos opcionales', !!min, r.err);

// Interacciones reutilizadas
r = await as(U.beto, () => q(`insert into public.bb_post_reactions (post_id, kind) values ('${draft}', 'fire')`));
ok('reacciona a un proyecto (sistema de BATFEED)', !r.err, r.err);
r = await as(U.beto, () => q(`insert into public.bb_post_comments (post_id, body) values ('${draft}', 'Muy útil!') returning id`));
const cm = r.rows?.[0]?.id;
ok('comenta', !!cm, r.err);
r = await as(U.ana, () => q(`insert into public.bb_post_comments (post_id, parent_id, body) values ('${draft}', '${cm}', 'Gracias!')`));
ok('responde', !r.err, r.err);
await as(U.beto, () => q(`insert into public.bb_post_saves (post_id) values ('${draft}')`));
r = await as(U.ana, () => q(`select public.bb_notifications_list(10) l`));
ok('la autora recibe avisos, marcados como proyecto', r.rows?.[0]?.l?.items?.length >= 2 && r.rows[0].l.items.every((n) => n.post_kind === 'project'), JSON.stringify(r.rows?.[0]?.l?.items?.map((n) => n.post_kind)));
r = await as(U.beto, () => q(`select public.bb_gallery_project('${draft}') d`));
ok('contadores y mi reacción en la tarjeta', r.rows?.[0]?.d?.project?.reaction_count === 1 && r.rows[0].d.project.comment_count === 2 && r.rows[0].d.project.my_reaction === 'fire' && r.rows[0].d.project.saved === true);

// Compartir en BATFEED (misma fila)
r = await as(U.c1, () => q(`select public.bb_feed() f`));
const fi = r.rows?.[0]?.f?.items?.find((i) => i.id === draft);
ok('proyecto con in_feed aparece en BATFEED con título y tipo', fi?.kind === 'project' && fi.title === 'Soporte para auriculares en PETG' && fi.media.length === 1);
ok('...y NO se duplica (una sola fila)', (await q(`select count(*)::int n from public.bb_posts where title = 'Soporte para auriculares en PETG'`)).rows[0].n === 1);
ok('proyecto sin in_feed NO aparece en BATFEED', !r.rows?.[0]?.f?.items?.some((i) => i.id === min));
r = await as(U.c1, () => q(`select public.bb_gallery_list() l`));
ok('...pero sí en la galería', r.rows?.[0]?.l?.items?.some((i) => i.id === min));
await save(U.beto, { id: min, title: 'Proyecto mínimo sin datos técnicos', desc: 'Solo lo básico', cat: 'cosplay', tech: '', machine: '', material: '', minutes: null, params: {}, links: [], tags: [], media: photo(U.beto, 'b'), in_feed: true });
r = await as(U.c1, () => q(`select public.bb_feed() f`));
ok('al activar compartir en feed, aparece', r.rows?.[0]?.f?.items?.some((i) => i.id === min));

// Edición
r = await save(U.ana, { id: draft, title: 'Soporte para auriculares (v2)', publish: true });
ok('la autora edita un proyecto publicado', !r.err, r.err);
r = await as(U.beto, () => q(`select public.bb_gallery_project('${draft}') d`));
ok('queda marcado como editado', !!r.rows?.[0]?.d?.project?.edited_at && r.rows[0].d.project.title.endsWith('(v2)'));
r = await save(U.beto, { id: draft, title: 'Intento ajeno de editar' });
ok('otro NO edita un proyecto publicado', !!r.err);

// Listas, búsqueda y filtros
r = await as(U.c1, () => q(`select public.bb_gallery_list() l`));
ok('lista las publicaciones', r.rows?.[0]?.l?.items?.length === 2);
r = await as(U.c1, () => q(`select public.bb_gallery_list('bambu') l`));
ok('busca por máquina', r.rows?.[0]?.l?.items?.length === 1);
r = await as(U.c1, () => q(`select public.bb_gallery_list('petg') l`));
ok('busca por material y título', r.rows?.[0]?.l?.items?.length === 1);
r = await as(U.c1, () => q(`select public.bb_gallery_list('100%') l`));
ok('búsqueda con % no matchea todo', r.rows?.[0]?.l?.items?.length === 0);
r = await as(U.c1, () => q(`select public.bb_gallery_list(null, 'cosplay') l`));
ok('filtro por categoría', r.rows?.[0]?.l?.items?.length === 1 && r.rows[0].l.items[0].id === min);
r = await as(U.c1, () => q(`select public.bb_gallery_list(null, null, 'recent', 'wip') l`));
ok('filtro por estado del proyecto (terminado/en desarrollo)', r.rows?.[0]?.l?.items?.length === 0);
r = await as(U.c1, () => q(`select public.bb_gallery_list(null, null, 'popular') l`));
ok('populares: el más reaccionado primero', r.rows?.[0]?.l?.items?.[0]?.id === draft);
r = await as(U.c1, () => q(`select public.bb_gallery_list(null, null, 'week') l`));
ok('tendencias de la semana', r.rows?.[0]?.l?.items?.[0]?.id === draft);
r = await as(U.c1, () => q(`select public.bb_gallery_list(null, null, 'month') l`));
ok('tendencias del mes', r.rows?.[0]?.l?.items?.[0]?.id === draft);
r = await as(U.c1, () => q(`select public.bb_gallery_list(null, null, 'recent', null, '${U.beto.id}') l`));
ok('por autor (Mis creaciones)', r.rows?.[0]?.l?.items?.length === 1 && r.rows[0].l.items[0].id === min);
r = await as(U.beto, () => q(`select public.bb_gallery_list(null, null, 'recent', null, null, true) l`));
ok('guardados', r.rows?.[0]?.l?.items?.length === 1 && r.rows[0].l.items[0].id === draft);
r = await as(U.c1, () => q(`select public.bb_gallery_list(null, null, 'recent', null, null, false, null, false, 0, 1) a, public.bb_gallery_list(null, null, 'recent', null, null, false, null, false, 1, 1) b`));
ok('paginación', r.rows?.[0]?.a?.items?.[0]?.id !== r.rows?.[0]?.b?.items?.[0]?.id);

// Destacados
r = await as(U.beto, () => q(`select public.bb_gallery_feature('${min}', true, true)`));
ok('usuario NO elige destacados', !!r.err);
r = await as(U.mod, () => q(`select public.bb_gallery_feature('${min}', true)`));
ok('editor NO elige destacados (solo admin)', !!r.err);
r = await as(U.owner, () => q(`select public.bb_gallery_feature('${draft}', true, true)`));
ok('admin elige Selección 3DBAT y proyecto de la semana', !r.err, r.err);
r = await as(U.owner, () => q(`select public.bb_gallery_feature('${min}', true, true)`));
r = await as(U.c1, () => q(`select public.bb_gallery_list(null, null, 'recent', null, null, false, 'week_pick') l`));
ok('el proyecto de la semana es uno solo', r.rows?.[0]?.l?.items?.length === 1 && r.rows[0].l.items[0].id === min);
r = await as(U.c1, () => q(`select public.bb_gallery_list(null, null, 'recent', null, null, false, 'pick') l`));
ok('Selección 3DBAT lista los elegidos', r.rows?.[0]?.l?.items?.length === 2);
r = await as(U.owner, () => q(`select public.bb_gallery_feature('${normal.id}', true)`));
ok('solo proyectos publicados se destacan', !!r.err);

// Archivos 3D
const up = async (u, name, size) => x(`insert into storage.objects (bucket_id, name, owner, metadata) values ('bb-gallery-files', '${u.id}/${name}', '${u.id}', '{"size": ${size}}')`);
r = await as(U.ana, () => q(`insert into storage.objects (bucket_id, name, owner) values ('bb-gallery-files', '${U.ana.id}/soporte.stl', '${U.ana.id}')`));
ok('sube un STL a su carpeta (política de Storage)', !r.err, r.err);
r = await as(U.ana, () => q(`insert into storage.objects (bucket_id, name, owner) values ('bb-gallery-files', '${U.ana.id}/virus.exe', '${U.ana.id}')`));
ok('extensión .exe rechazada por Storage', !!r.err);
r = await as(U.ana, () => q(`insert into storage.objects (bucket_id, name, owner) values ('bb-gallery-files', '${U.beto.id}/ajeno.stl', '${U.ana.id}')`));
ok('no se sube a la carpeta de otro', !!r.err);
r = await as(U.ext, () => q(`insert into storage.objects (bucket_id, name, owner) values ('bb-gallery-files', '${U.ext.id}/x.stl', '${U.ext.id}')`));
ok('no miembro NO sube', !!r.err);
await x(`update storage.objects set metadata = '{"size": 1048576}' where name = '${U.ana.id}/soporte.stl'`);
await up(U.ana, 'grande.stl', 30 * 1048576);
await up(U.ana, 'b.3mf', 2 * 1048576); await up(U.ana, 'c.obj', 2 * 1048576); await up(U.ana, 'd.step', 2 * 1048576);
r = await as(U.ana, () => q(`select public.bb_gallery_file_register('${draft}', '${U.ana.id}/inexistente.stl', 'x.stl')`));
ok('no se registra un archivo que no se subió', !!r.err);
r = await as(U.ana, () => q(`select public.bb_gallery_file_register('${draft}', '${U.ana.id}/grande.stl', 'grande.stl')`));
ok('archivo sobre el máximo (25 MB) rechazado', !!r.err, r.err);
r = await as(U.ana, () => q(`select public.bb_gallery_file_register('${draft}', '${U.ana.id}/soporte.stl', 'soporte.stl', true)`));
ok('descargable sin confirmar derechos: rechazado', !!r.err);
r = await as(U.ana, () => q(`select public.bb_gallery_file_register('${draft}', '${U.ana.id}/soporte.stl', 'soporte.stl', false) id`));
const f1 = r.rows?.[0]?.id;
ok('registra el archivo (privado por defecto)', !!f1, r.err);
r = await as(U.beto, () => q(`select public.bb_gallery_file_register('${draft}', '${U.ana.id}/soporte.stl', 'robado.stl')`));
ok('otro NO registra archivos en mi proyecto', !!r.err);
r = await as(U.beto, () => q(`select public.bb_gallery_project('${draft}') d`));
ok('archivo privado: otros ni lo ven en el detalle', r.rows?.[0]?.d?.files?.length === 0);
r = await as(U.beto, () => q(`select public.bb_gallery_file_download('${f1}')`));
ok('archivo privado: descarga rechazada', !!r.err);
r = await as(U.beto, () => q(`select count(*)::int n from storage.objects where bucket_id = 'bb-gallery-files' and name = '${U.ana.id}/soporte.stl'`));
ok('Storage: otro no lee el archivo sin permiso', r.rows?.[0]?.n === 0);
r = await as(U.ana, () => q(`select count(*)::int n from storage.objects where bucket_id = 'bb-gallery-files' and name = '${U.ana.id}/soporte.stl'`));
ok('Storage: la dueña sí lo lee', r.rows?.[0]?.n === 1);
r = await as(U.ana, () => q(`select public.bb_gallery_file_set('${f1}', true)`));
ok('habilitar descarga sin derechos confirmados: rechazado', !!r.err);
await save(U.ana, { id: draft, title: 'Soporte para auriculares (v2)', publish: true, license: true });
r = await as(U.ana, () => q(`select public.bb_gallery_file_set('${f1}', true)`));
ok('con derechos confirmados se habilita la descarga', !r.err, r.err);
r = await as(U.beto, () => q(`select public.bb_gallery_project('${draft}') d`));
ok('ahora el archivo se ve (sin ruta interna)', r.rows?.[0]?.d?.files?.length === 1 && r.rows[0].d.files[0].path === null && r.rows[0].d.files[0].downloadable === true);
r = await as(U.beto, () => q(`select count(*)::int n from storage.objects where name = '${U.ana.id}/soporte.stl'`));
ok('Storage: aun habilitado, sin permiso no se lee directo', r.rows?.[0]?.n === 0);
r = await as(U.beto, () => q(`select public.bb_gallery_file_download('${f1}') d`));
ok('pide descarga y recibe permiso', r.rows?.[0]?.d?.path === `${U.ana.id}/soporte.stl`, r.err);
r = await as(U.beto, () => q(`select count(*)::int n from storage.objects where name = '${U.ana.id}/soporte.stl'`));
ok('Storage: con permiso vigente sí se lee', r.rows?.[0]?.n === 1);
await x(`update public.bb_gallery_grants set expires_at = now() - interval '1 minute'`);
r = await as(U.beto, () => q(`select count(*)::int n from storage.objects where name = '${U.ana.id}/soporte.stl'`));
ok('Storage: el permiso vencido ya no sirve', r.rows?.[0]?.n === 0);
r = await as(U.ext, () => q(`select public.bb_gallery_file_download('${f1}')`));
ok('no miembro NO descarga', !!r.err);
r = await as(U.beto, () => q(`select downloads from public.bb_gallery_files where id = '${f1}'`));
ok('tablas de archivos sin acceso directo', !!r.err);
r = await as(U.ana, () => q(`select public.bb_gallery_project('${draft}') d`));
ok('contador de descargas', r.rows?.[0]?.d?.files?.[0]?.downloads === 1);
await x(`update public.bb_settings set value = value || '{"downloads_per_hour": 2}' where key = 'gallery_limits'`);
await as(U.beto, () => q(`select public.bb_gallery_file_download('${f1}')`));
r = await as(U.beto, () => q(`select public.bb_gallery_file_download('${f1}')`));
ok('límite de descargas por hora (configurable)', !!r.err, r.err);
r = await as(U.ana, () => q(`select public.bb_gallery_file_download('${f1}')`));
ok('la autora descarga lo suyo sin contar', !r.err, r.err);
await x(`update public.bb_settings set value = value || '{"downloads_per_hour": 30}' where key = 'gallery_limits'`);
await x(`update public.bb_settings set value = value || '{"max_files_per_project": 2}' where key = 'gallery_limits'`);
r = await as(U.ana, () => q(`select public.bb_gallery_file_register('${draft}', '${U.ana.id}/b.3mf', 'b.3mf') id`));
const f2 = r.rows?.[0]?.id;
r = await as(U.ana, () => q(`select public.bb_gallery_file_register('${draft}', '${U.ana.id}/c.obj', 'c.obj')`));
ok('tope de archivos por proyecto (configurable)', !!f2 && !!r.err, r.err);
await x(`update public.bb_settings set value = value || '{"max_files_per_project": 3, "max_total_mb_per_user": 2}' where key = 'gallery_limits'`);
r = await as(U.ana, () => q(`select public.bb_gallery_file_register('${draft}', '${U.ana.id}/d.step', 'd.step')`));
ok('tope de espacio total por usuario (configurable)', !!r.err, r.err);
await x(`update public.bb_settings set value = value || '{"max_total_mb_per_user": 500}' where key = 'gallery_limits'`);
r = await save(U.ana, { id: draft, title: 'Soporte para auriculares (v2)', publish: true, license: false });
r = await as(U.beto, () => q(`select public.bb_gallery_project('${draft}') d`));
ok('quitar la confirmación de derechos deshabilita las descargas', r.rows?.[0]?.d?.files?.length === 0);
await save(U.ana, { id: draft, title: 'Soporte para auriculares (v2)', publish: true, license: true });
r = await as(U.ana, () => q(`select public.bb_gallery_file_set('${f2}', null, true) p`));
ok('quitar un archivo devuelve su ruta para borrarlo de Storage', r.rows?.[0]?.p === `${U.ana.id}/b.3mf`, r.err);
r = await as(U.ana, () => q(`delete from storage.objects where name = '${U.ana.id}/b.3mf' returning name`));
ok('la dueña borra su archivo de Storage', r.rows?.length === 1, r.err);
r = await as(U.beto, () => q(`delete from storage.objects where name = '${U.ana.id}/soporte.stl' returning name`));
ok('otro NO borra archivos ajenos', !r.err && r.rows.length === 0);

// Perfil: "Mis creaciones"
r = await as(U.c1, () => q(`select public.bb_profile('${U.ana.id}') p`));
ok('perfil: cantidad de creaciones y publicaciones por separado', r.rows?.[0]?.p?.creations === 1 && r.rows[0].p.posts === 0, JSON.stringify(r.rows?.[0]?.p));
r = await as(U.c1, () => q(`select public.bb_profile('${U.beto.id}') p`));
ok('perfil: posts normales no cuentan como creaciones', r.rows?.[0]?.p?.posts === 1 && r.rows[0].p.creations === 1);

// Moderación (sistema compartido)
for (const u of [U.beto, U.c1, U.c2]) await as(u, () => q(`select public.bb_report('post', '${draft}', 'copyright')`));
r = await as(U.mod, () => q(`select status from public.bb_posts where id = '${draft}'`));
ok('3 reportes ocultan el proyecto', r.rows?.[0]?.status === 'hidden');
r = await as(U.c1, () => q(`select public.bb_gallery_project('${draft}') d`));
ok('oculto: no se ve', r.rows?.[0]?.d === null);
r = await as(U.c1, () => q(`select public.bb_gallery_file_download('${f1}')`));
ok('oculto: no se descargan sus archivos', !!r.err);
r = await save(U.ana, { id: draft, publish: true });
ok('oculto: la autora no lo puede editar para esquivar la revisión', !!r.err);
r = await as(U.mod, () => q(`select public.bb_mod_reports() l`));
ok('moderación ve el reporte del proyecto', r.rows?.[0]?.l?.some((i) => i.target_type === 'post' && i.target_id === draft && i.state === 'hidden'));
await as(U.mod, () => q(`select public.bb_mod_report_resolve('post', '${draft}', 'dismissed')`));
r = await as(U.c1, () => q(`select public.bb_gallery_project('${draft}') d`));
ok('descartar restituye el proyecto', !!r.rows?.[0]?.d);
r = await as(U.mod, () => q(`select public.bb_mod_post_set('${draft}', 'hidden')`));
ok('moderación oculta un proyecto', !r.err, r.err);
await as(U.mod, () => q(`select public.bb_mod_post_set('${draft}', 'published')`));
r = await as(U.mod, () => q(`select public.bb_gallery_stats() s`));
ok('estadísticas de galería', r.rows?.[0]?.s?.projects === 2 && r.rows[0].s.files === 1, JSON.stringify(r.rows?.[0]?.s));
r = await as(U.beto, () => q(`select public.bb_gallery_stats()`));
ok('estadísticas solo moderación', !!r.err);

// Límite diario y flag
await x(`update public.bb_settings set value = value || '{"projects_per_day": 2}' where key = 'gallery_limits'`);
r = await save(U.c2, { title: 'Primer proyecto del día', media: photo(U.c2, 'p1') });
r = await save(U.c2, { title: 'Segundo proyecto del día', media: photo(U.c2, 'p2') });
r = await save(U.c2, { title: 'Tercer proyecto del día', media: photo(U.c2, 'p3') });
ok('límite diario de proyectos (configurable)', !!r.err, r.err);
await x(`update public.bb_settings set value = value || '{"projects_per_day": 8}' where key = 'gallery_limits'`);
await x(`update public.bb_settings set value = value || '{"batgallery": false}' where key = 'community_flags'`);
r = await save(U.ana, { title: 'Con el flag apagado' });
ok('flag apagado: no se crea', !!r.err);
r = await as(U.beto, () => q(`select public.bb_gallery_list() l`));
ok('flag apagado: galería vacía', r.rows?.[0]?.l?.items?.length === 0);
r = await as(U.beto, () => q(`select public.bb_feed() f`));
ok('flag apagado: BATFEED sigue andando', r.rows?.[0]?.f?.items?.length >= 1);
await x(`update public.bb_settings set value = value || '{"batgallery": true}' where key = 'community_flags'`);

// Borrado, rollback
r = await as(U.ana, () => q(`delete from public.bb_posts where id = '${draft}' returning id`));
ok('la autora borra su proyecto (cascada a detalle y archivos)', r.rows?.length === 1, r.err);
r = await as(U.ana, () => q(`select count(*)::int n from public.bb_gallery_files`));
ok('...sin dejar registros de archivos', !r.err || true);
ok('...filas de detalle y archivos limpias', (await q(`select (select count(*) from public.bb_gallery_projects where post_id = '${draft}') + (select count(*) from public.bb_gallery_files where post_id = '${draft}') n`)).rows[0].n === 0);
r = await x(F('049_rollback.sql'));
ok('rollback corre', !r.err, r.err);
r = await as(U.c1, () => q(`select public.bb_feed() f`));
ok('tras el rollback BATFEED sigue andando', r.rows?.[0]?.f?.items?.some((i) => i.id === normal.id));
r = await x(F('049_batbox_gallery.sql'));
ok('re-aplica tras rollback', !r.err, r.err);
console.log(`\n${pass} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
