// BAT RIFAS — prueba de la migración 076 sobre Postgres embebido (PGlite), sin tocar la base real.
// Uso: node scripts/test-rifas.mjs [carpeta-para-el-csv-de-ejemplo]
// Cubre: reserva, idempotencia, concurrencia, vencimiento, comprobante, rechazo→reenvío→confirmación,
// permisos (anon / usuario sin rol / admin), cierre, padrón CSV reproducible y versionado.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2];
let ok = 0, bad = 0;
const check = (cond, msg) => { if (cond) { ok++; } else { bad++; console.log('FALLA:', msg); } };

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth; grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), '') = '1' $$;
  grant execute on function public.is_admin() to anon, authenticated;
  insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'admin@ejemplo.test');
`);
await db.exec(readFileSync(join(root, 'supabase/076_batbox_rifas.sql'), 'utf8'));

const ADMIN = "set role authenticated; set test.admin = '1'; set test.uid = '00000000-0000-0000-0000-00000000000a';";
const USER = "set role authenticated; set test.admin = '0'; set test.uid = '00000000-0000-0000-0000-00000000000b';";
const ANON = "set role anon; set test.admin = '0'; set test.uid = '';";
const SU = "";
const SERVICE = "set role service_role; set test.admin = '0'; set test.uid = '';";
const uuid = () => crypto.randomUUID();
async function as(who, sql, params = []) {
  await db.exec('reset role; ' + who);
  try { const r = await db.query(sql, params); return r.rows[0] ? Object.values(r.rows[0])[0] : null; }
  finally { await db.exec('reset role;'); }
}
async function fails(who, sql, params = []) { try { await as(who, sql, params); return false; } catch { return true; } }

// ---- 0. Etapa "solo admins" (bb_rf_admin_only = true) ----
{
  const g = await as(ADMIN, 'select public.bb_rf_admin_save($1)', [{ slug: 'rifa-gate', title: 'Rifa gate', terms: 'Bases de prueba gate.', price_cents: 100, transfer_info: 'Alias x.y.z' }]);
  await as(ADMIN, "select public.bb_rf_admin_set_status($1, 'published')", [g]);
  check((await as(ANON, 'select public.bb_rf_public($1)', ['rifa-gate'])) === null, 'solo admins: el público no ve la rifa');
  check((await as(ANON, 'select public.bb_rf_reserve($1,$2,$3,$4,$5,$6,$7)', ['rifa-gate', [1], 'Ana', 'a@ejemplo.test', '1155550000', 1, uuid()])).ok === false, 'solo admins: el público no reserva');
  check((await as(ADMIN, 'select public.bb_rf_public($1)', ['rifa-gate']))?.title === 'Rifa gate', 'solo admins: el admin sí la ve');
  check((await as(ADMIN, 'select public.bb_rf_reserve($1,$2,$3,$4,$5,$6,$7)', ['rifa-gate', [1], 'Ana', 'a@ejemplo.test', '1155550000', 1, uuid()])).ok, 'solo admins: el admin reserva');
  await db.exec("create or replace function public.bb_rf_admin_only() returns boolean language sql immutable as $$ select false $$;");
}

// ---- 1. Admin crea, previsualiza y publica ----
const rid = await as(ADMIN, 'select public.bb_rf_admin_save($1)', [{
  slug: 'rifa-prueba-makers', title: 'Rifa de prueba Makers', prizes: ['Rollo PLA 1 kg', 'Llavero 3DBAT'],
  description: 'Rifa ficticia para probar BAT RIFAS.', terms: 'Bases de prueba v1: el sorteo es externo.', price_cents: 150000,
  num_from: 0, num_to: 99, max_per_entry: 5, pay_hours: 24, transfer_info: 'Alias FICTICIO.PRUEBA (no transferir)',
  support_contact: 'soporte ficticio', draw_at: '2026-12-20T21:00:00-03:00' }]);
check(rid, 'crea borrador');
check((await as(ANON, 'select public.bb_rf_public($1)', ['rifa-prueba-makers'])) === null, 'borrador oculto al público');
check((await as(ADMIN, 'select public.bb_rf_public($1)', ['rifa-prueba-makers']))?.preview === true, 'admin previsualiza borrador');
check((await as(ADMIN, "select public.bb_rf_admin_set_status($1, 'published')", [rid])).ok, 'publica');
const pub = await as(ANON, 'select public.bb_rf_public($1)', ['rifa-prueba-makers']);
check(pub?.status === 'published' && pub.terms_version === 1, 'enlace público abre sin sesión');
check(!JSON.stringify(pub).includes('FICTICIO'), 'el talonario no expone instrucciones de pago antes de reservar');

// ---- 2. Reserva de varios números + consulta privada ----
let TV = 1;
const reserve = (nums, name, key = uuid(), email = 'ana@ejemplo.test', phone = '+54 9 11 5555 0000') =>
  as(ANON, 'select public.bb_rf_reserve($1,$2,$3,$4,$5,$6,$7)', ['rifa-prueba-makers', nums, name, email, phone, TV, key]);
const k1 = uuid();
const r1 = await reserve([7, 8, 9], 'José Pérez, "el maker"', k1);
check(r1.ok && r1.token.length === 64 && r1.code.length === 24, 'reserva varios números');
const again = await reserve([7, 8, 9], 'José Pérez, "el maker"', k1);
check(again.ok && again.repeated && again.token === r1.token, 'doble clic devuelve la misma operación');
const e1 = await as(ANON, 'select public.bb_rf_entry($1)', [r1.token]);
check(e1.status === 'pending' && e1.total_cents === 450000 && e1.numbers.length === 3 && e1.raffle.transfer_info.includes('FICTICIO'), 'consulta privada con importe e instrucciones');
check((await as(ANON, 'select public.bb_rf_entry($1)', ['x'.repeat(64)])) === null, 'token falso no ve nada');
check(!JSON.stringify(await as(ANON, 'select public.bb_rf_public($1)', ['rifa-prueba-makers'])).includes('José'), 'talonario sin datos personales');

// ---- 3. Concurrencia ----
const [c1, c2] = await Promise.all([reserve([50, 51], 'Uno'), reserve([51, 52], 'Dos')]);
check([c1, c2].filter((x) => x.ok).length === 1, 'dos solicitudes por el 51: una sola válida');
const loser = c1.ok ? c2 : c1;
check(JSON.stringify(loser.taken) === '[51]', 'informa exactamente qué número se ocupó');
const live51 = await as(SU, "select count(*)::int from public.bb_raffle_tickets where number = 51 and status <> 'released'");
check(live51 === 1, 'un único ticket vivo para el 51');
check(await fails(SU, `insert into public.bb_raffle_tickets (raffle_id, entry_id, number, verify_code)
  select raffle_id, entry_id, 51, 'dup' from public.bb_raffle_tickets where number = 51 limit 1`), 'el índice único bloquea un 51 duplicado');
check((await reserve([200], 'Fuera')).ok === false, 'rechaza números fuera de rango');
check((await reserve([1, 2, 3, 4, 5, 6], 'Muchos')).ok === false, 'respeta el máximo por reserva');
check((await as(ANON, 'select public.bb_rf_reserve($1,$2,$3,$4,$5,$6,$7)', ['rifa-prueba-makers', [60], 'Viejo', 'v@ejemplo.test', '1155550000', 99, uuid()])).ok === false, 'exige la versión vigente de las bases');

// ---- 4. Vencimiento y comprobante a tiempo ----
const r4 = await reserve([30], 'Vence Pronto', uuid(), 'vence@ejemplo.test');
await as(SU, "update public.bb_raffle_entries set expires_at = now() - interval '1 minute' where code = $1", [r4.code]);
const pubAfter = await as(ANON, 'select public.bb_rf_public($1)', ['rifa-prueba-makers']);
check(!pubAfter.held.includes(30), 'el 30 vencido figura libre aunque la limpieza no corrió');
check((await as(ANON, 'select public.bb_rf_entry($1)', [r4.token])).status === 'expired', 'la reserva sin comprobante vence');
check((await as(SERVICE, 'select public.bb_rf_attach_proof($1,$2,$3,$4)', [r4.token, 'x/y.jpg', 'image/jpeg', 1000])).ok === false, 'comprobante fuera de plazo rechazado');
check((await reserve([30], 'Otra Persona')).ok, 'el 30 vuelve a estar disponible');
check(await fails(ANON, 'select public.bb_rf_attach_proof($1,$2,$3,$4)', [r1.token, 'a', 'image/png', 1]), 'anon no puede registrar comprobantes directo');
check((await as(SERVICE, 'select public.bb_rf_attach_proof($1,$2,$3,$4)', [r1.token, 'e1/p1.jpg', 'image/jpeg', 12345])).ok, 'comprobante a tiempo');
check((await as(ANON, 'select public.bb_rf_entry($1)', [r1.token])).status === 'review', 'pasa a revisión y mantiene números');

// ---- 5. Rechazo → corrección → confirmación ----
const e1id = await as(SERVICE, 'select public.bb_rf_entry_id_by_token($1)', [r1.token]);
const opR = uuid();
check((await as(ADMIN, "select public.bb_rf_admin_reject($1,$2,'resend',12,$3)", [e1id, 'El importe no coincide', opR])).ok, 'rechaza con motivo y nuevo plazo');
check((await as(ADMIN, "select public.bb_rf_admin_reject($1,$2,'resend',12,$3)", [e1id, 'El importe no coincide', opR])).repeated, 'rechazo idempotente');
const e1r = await as(ANON, 'select public.bb_rf_entry($1)', [r1.token]);
check(e1r.status === 'rejected' && e1r.reject_reason === 'El importe no coincide' && e1r.can_upload, 'participante ve el motivo y puede reenviar');
check((await as(ANON, 'select public.bb_rf_public($1)', ['rifa-prueba-makers'])).held.includes(7), 'los números siguen apartados en el nuevo plazo');
check((await as(SERVICE, 'select public.bb_rf_attach_proof($1,$2,$3,$4)', [r1.token, 'e1/p2.pdf', 'application/pdf', 54321])).ok, 'reenvía comprobante');
check(await fails(USER, 'select public.bb_rf_admin_confirm($1,$2)', [e1id, uuid()]), 'usuario sin rol no confirma');
const opC = uuid();
check((await as(ADMIN, 'select public.bb_rf_admin_confirm($1,$2)', [e1id, opC])).ok, 'admin confirma');
check((await as(ADMIN, 'select public.bb_rf_admin_confirm($1,$2)', [e1id, uuid()])).repeated, 'confirmar dos veces no duplica');
const det = await as(ADMIN, 'select public.bb_rf_admin_entry($1)', [e1id]);
check(det.confirmed_by === '00000000-0000-0000-0000-00000000000a' && det.events.some((v) => v.kind === 'confirmed' && v.actor === 'admin@ejemplo.test'), 'registra quién y cuándo');
check(det.proofs.length === 2 && det.proofs.some((p) => p.status === 'rejected'), 'historial de comprobantes conservado');
check(det.access_token?.length === 64 && !('client_key' in det), 'la ficha admin trae el enlace del ticket (solo admins)');
check((await as(ADMIN, 'select public.bb_rf_admin_note($1,$2)', [det.id, 'Pagó en efectivo'])).ok && (await as(ADMIN, 'select public.bb_rf_admin_entry($1)', [det.id])).admin_notes === 'Pagó en efectivo', 'notas privadas');
check(await fails(USER, 'select public.bb_rf_admin_note($1,$2)', [det.id, 'x']), 'usuario no escribe notas');
const mails = await as(SU, 'select jsonb_agg(kind order by created_at) from public.bb_raffle_mail where entry_id = $1', [e1id]);
check(JSON.stringify(mails) === '["reserved","rejected","confirmed"]', 'correos en cola sin duplicar: ' + JSON.stringify(mails));

// ---- 6. Tickets y QR ----
const e1c = await as(ANON, 'select public.bb_rf_entry($1)', [r1.token]);
check(e1c.tickets.length === 3 && e1c.tickets[0].label === '07' && e1c.raffle.transfer_info === '', 'tickets confirmados con número formateado');
const ver = await as(ANON, 'select public.bb_rf_verify($1)', [e1c.tickets[0].verify_code]);
check(ver.valid === true && ver.number === '07' && Object.keys(ver).sort().join() === 'found,number,raffle,valid', 'QR verifica solo rifa, número y validez');
check((await as(ANON, 'select public.bb_rf_verify($1)', ['nada'])).found === false, 'QR inexistente');

// ---- 7. Permisos ----
check(await fails(ANON, 'select * from public.bb_raffle_proofs'), 'anon no lee comprobantes');
check(await fails(USER, 'select * from public.bb_raffle_entries'), 'usuario no lee participaciones');
check(await fails(USER, 'select public.bb_rf_admin_entry($1)', [e1id]), 'usuario no abre fichas');
check(await fails(USER, 'select public.bb_rf_admin_list()'), 'usuario no lista rifas admin');

// ---- Manual + bloqueo de condiciones ----
const man = await as(ADMIN, 'select public.bb_rf_admin_manual($1,$2,$3)', [rid, { numbers: [1, 2], name: 'María Núñez, Córdoba', email: 'maria@ejemplo.test', phone: '351 555 0000', confirm: true }, uuid()]);
check(man.ok && man.confirm.ok, 'participación manual confirmada');
check((await as(ADMIN, 'select public.bb_rf_admin_manual($1,$2,$3)', [rid, { numbers: [2], name: 'Choque', email: 'c@ejemplo.test', phone: '1155550000' }, uuid()])).ok === false, 'manual respeta disponibilidad');
check(await fails(ADMIN, 'select public.bb_rf_admin_save($1)', [{ id: rid, slug: 'rifa-prueba-makers', title: 'Rifa de prueba Makers', terms: 'Bases de prueba v1: el sorteo es externo.', price_cents: 99900, transfer_info: 'x' }]), 'precio bloqueado con participaciones');
await as(ADMIN, 'select public.bb_rf_admin_save($1)', [{ id: rid, slug: 'rifa-prueba-makers', title: 'Rifa de prueba Makers', terms: 'Bases de prueba v2.', transfer_info: 'Alias FICTICIO.PRUEBA (no transferir)', prizes: ['Rollo PLA 1 kg'] }]);
check((await as(ANON, 'select public.bb_rf_public($1)', ['rifa-prueba-makers'])).terms_version === 2, 'cambio de bases genera versión 2');
check((await as(SU, "select terms_version from public.bb_raffle_entries where code = $1", [r1.code])) === 1, 'la participación anterior conserva la versión 1');
const dup = await as(ADMIN, 'select public.bb_rf_admin_duplicate($1)', [rid]);
check((await as(SU, 'select count(*)::int from public.bb_raffle_entries where raffle_id = $1', [dup])) === 0, 'duplicar copia config sin participaciones');
const srch = await as(ADMIN, "select public.bb_rf_admin_entries($1,'núñez','','recent',1,25)", [rid]);
const srchN = await as(ADMIN, "select public.bb_rf_admin_entries($1,'8','','recent',1,25)", [rid]);
check(srch.total === 1 && srchN.rows[0]?.code === r1.code, 'búsqueda por nombre y por número');

// Un número con ceros iniciales y apellido con fórmula para probar escapes.
TV = 2;
const r9 = await reserve([0], '=HYPERLINK("x")', uuid(), 'cero@ejemplo.test', '11 5555 0001');
await as(SERVICE, 'select public.bb_rf_attach_proof($1,$2,$3,$4)', [r9.token, 'e9/p.png', 'image/png', 10]);
await as(ADMIN, 'select public.bb_rf_admin_confirm($1,$2)', [await as(SERVICE, 'select public.bb_rf_entry_id_by_token($1)', [r9.token]), uuid()]);

// ---- Compra mínima ----
{
  const m = await as(ADMIN, 'select public.bb_rf_admin_save($1)', [{ slug: 'rifa-minimo', title: 'Rifa minimo', terms: 'Bases de prueba minimo.', price_cents: 100, transfer_info: 'Alias x.y.z', min_per_entry: 3 }]);
  await as(ADMIN, "select public.bb_rf_admin_set_status($1, 'published')", [m]);
  const q = (nums) => as(ANON, 'select public.bb_rf_reserve($1,$2,$3,$4,$5,$6,$7)', ['rifa-minimo', nums, 'Ana', 'a@ejemplo.test', '1155550000', 1, uuid()]);
  const r1 = await q([1, 2]);
  check(r1.ok === false && /mínima es de 3/.test(r1.error), 'compra mínima: rechaza 2 de 3');
  check((await q([1, 2, 3])).ok, 'compra mínima: acepta 3');
  check((await as(ANON, 'select public.bb_rf_public($1)', ['rifa-minimo'])).min_per_entry === 3, 'compra mínima visible en el talonario');
}

// ---- 8/9. Cierre y CSV ----
check((await as(ADMIN, 'select public.bb_rf_admin_close($1,false)', [rid])).ok === false, 'cierre pide confirmar reservas pendientes');
const sum = await as(ADMIN, 'select public.bb_rf_admin_close_summary($1)', [rid]);
check(sum.confirmed_numbers === 6 && sum.pending.length > 0, 'resumen previo al cierre');
check((await as(ADMIN, 'select public.bb_rf_admin_close($1,true)', [rid])).ok, 'cierra liberando pendientes');
check((await reserve([70], 'Tarde')).ok === false, 'cerrada: no acepta reservas');
check(await fails(USER, 'select public.bb_rf_admin_export_create($1,null,$2)', [rid, uuid()]), 'usuario no exporta');
const x1 = await as(ADMIN, 'select public.bb_rf_admin_export_create($1,null,$2)', [rid, uuid()]);
check(x1.ok && x1.version === 1 && x1.row_count === 6, 'padrón v1 con 6 números confirmados');
const d1 = await as(ADMIN, 'select public.bb_rf_admin_export_get($1)', [x1.export_id]);
const d2 = await as(ADMIN, 'select public.bb_rf_admin_export_get($1)', [x1.export_id]);
check(d1.csv === d2.csv && d1.sha256 === d2.sha256, 'volver a descargar reproduce el archivo');
check(await fails(USER, 'select public.bb_rf_admin_export_get($1)', [x1.export_id]), 'usuario no descarga');
const lines = d1.csv.replace(/^﻿/, '').split('\n');
check(d1.csv.startsWith('﻿') && !d1.csv.endsWith('\n'), 'BOM y sin salto final (como Rifary)');
check(lines[0] === '"number","name","phone","email","status","code","date",seller,seller_code', 'encabezado Rifary');
const nums = lines.slice(1).map((l) => l.split(',')[0]);
check(new Set(nums).size === nums.length && nums.length === 6, 'cada número confirmado una sola vez');
check(nums[0] === '"00"' && nums.includes('"07"'), 'conserva ceros iniciales');
check(d1.csv.includes('"José Pérez, ""el maker"""'), 'nombre con tilde, coma y comillas bien escapado');
check(d1.csv.includes(`"'=HYPERLINK(""x"")"`), 'fórmula neutralizada');
check(lines.filter((l) => l.includes(r1.code)).length === 3, 'participación con varios números comparte code');
check(!d1.csv.includes('Otra Persona') && !d1.csv.includes('Vence Pronto'), 'excluye pendientes y vencidas');
check((await as(ADMIN, 'select public.bb_rf_admin_export_create($1,null,$2)', [rid, uuid()])).ok === false, 'nueva versión exige motivo');
const x2 = await as(ADMIN, 'select public.bb_rf_admin_export_create($1,$2,$3)', [rid, 'Corrección de prueba', uuid()]);
check(x2.ok && x2.version === 2, 'versión 2 con motivo');
check((await as(SU, 'select count(*)::int from public.bb_raffle_export_downloads')) === 2, 'registra cada descarga');

// ---- Dirección editable con la rifa publicada ----
{
  const g = await as(ADMIN, 'select public.bb_rf_admin_get($1)', [dup]);
  await as(ADMIN, 'select public.bb_rf_admin_save($1)', [{ ...g, transfer_info: 'Alias x.y.z', terms: 'Bases de la copia.' }]);
  await as(ADMIN, "select public.bb_rf_admin_set_status($1, 'published')", [dup]);
  await as(ADMIN, 'select public.bb_rf_admin_save($1)', [{ ...(await as(ADMIN, 'select public.bb_rf_admin_get($1)', [dup])), slug: 'rifa-navidena' }]);
  check((await as(ANON, 'select public.bb_rf_public($1)', ['rifa-navidena']))?.status === 'published', 'cambiar el link con la rifa publicada');
  check(await fails(ADMIN, 'select public.bb_rf_admin_save($1)', [{ ...(await as(ADMIN, 'select public.bb_rf_admin_get($1)', [dup])), slug: 'rifa-gate' }]), 'no deja repetir un link de otra rifa');
  await as(ADMIN, 'select public.bb_rf_admin_save($1)', [{ ...(await as(ADMIN, 'select public.bb_rf_admin_get($1)', [dup])), slug: 'rifa-navideña' }]);
  check((await as(ANON, 'select public.bb_rf_public($1)', ['rifa-navideña']))?.slug === 'rifa-navideña', 'link con ñ');
}

// ---- Ganadores e inicio de Rifas ----
check((await as(ANON, 'select public.bb_rf_active_count()')) >= 1, 'contador de rifas activas');
check(await fails(USER, 'select public.bb_rf_admin_set_winners($1,$2)', [rid, [7]]), 'usuario no carga ganadores');
check((await as(ADMIN, 'select public.bb_rf_admin_set_winners($1,$2)', [rid, [7, 1, 2]])).ok === false, 'no más ganadores que premios');
const win = await as(ADMIN, 'select public.bb_rf_admin_set_winners($1,$2)', [rid, [7]]);
check(win.ok && win.winners[0].number === '07' && /^José /.test(win.winners[0].name) && win.winners[0].prize === 'Rollo PLA 1 kg', 'ganador: número, premio y nombre corto');
check(!JSON.stringify(win.winners).includes('@') && !JSON.stringify(win.winners).includes('5555'), 'ganador sin email ni teléfono');
const home = await as(ANON, 'select public.bb_rf_home()');
check(home.finished?.slug === 'rifa-prueba-makers' && home.finished.winners.length === 1, 'inicio muestra la rifa finalizada con ganador');
await as(ADMIN, 'select public.bb_rf_admin_set_winners($1,$2)', [rid, [50]]);
check((await as(ANON, 'select public.bb_rf_public($1)', ['rifa-prueba-makers'])).winners[0].name === null, 'número no vendido: sin nombre');

// ---- Borrar cancelados/vencidos ----
{
  const before = await as(SU, "select count(*)::int from public.bb_raffle_entries where raffle_id = $1 and status in ('cancelled','expired')", [rid]);
  const live = await as(SU, "select count(*)::int from public.bb_raffle_entries where raffle_id = $1 and status not in ('cancelled','expired')", [rid]);
  check(await fails(USER, 'select public.bb_rf_admin_delete_entries($1,null)', [rid]), 'usuario no borra registros');
  const conf = await as(SU, "select id from public.bb_raffle_entries where raffle_id = $1 and status = 'confirmed' limit 1", [rid]);
  check((await as(ADMIN, 'select public.bb_rf_admin_delete_entries($1,$2)', [rid, conf])).ok === false, 'no borra una validada');
  const d = await as(ADMIN, 'select public.bb_rf_admin_delete_entries($1,null)', [rid]);
  check(d.ok && d.deleted === before && before > 0, 'borra todos los cancelados/vencidos: ' + before);
  check((await as(SU, "select count(*)::int from public.bb_raffle_entries where raffle_id = $1", [rid])) === live, 'las vigentes quedan intactas');
  check((await as(ADMIN, 'select public.bb_rf_admin_export_get($1)', [x1.export_id])).csv === d1.csv, 'el padrón ya exportado no cambia');
}

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'rifa-prueba-makers_v1.csv'), d1.csv, 'utf8');
  console.log('CSV de ejemplo:', join(outDir, 'rifa-prueba-makers_v1.csv'));
}
console.log(`${ok} OK, ${bad} fallas`);
process.exit(bad ? 1 : 0);
