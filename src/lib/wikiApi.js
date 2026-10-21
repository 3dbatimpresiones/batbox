import { useCallback, useEffect, useState } from 'react';
import { sb } from './supabase.js';
import { WIKI_TERMS } from '../data/wiki.js';

// =====================================================================
// WikiBAT editable (migración 008: tabla bb_wiki).
// Leer: todos. Crear / editar / borrar: equipo (admins y editores), lo valida la base (RLS).
// Si la tabla todavía no existe, la página usa la lista fija de data/wiki.js.
// =====================================================================

const COLS = 'id, term, en, tag, def, pros, cons';

// Solo `npm run dev` con ?simdb: la WikiBAT se muestra editable con la lista fija (no guarda nada).
const SIM = import.meta.env.DEV && new URLSearchParams(window.location.search).has('simdb');

export function useWiki() {
  const [state, setState] = useState({ terms: WIKI_TERMS, source: 'local', loading: true, error: null });
  const load = useCallback(async () => {
    if (SIM) { setState({ terms: WIKI_TERMS.map((t, i) => ({ id: 'sim-' + i, ...t })), source: 'db', loading: false, error: null }); return; }
    const { data, error } = await sb.from('bb_wiki').select(COLS);
    if (error) setState({ terms: WIKI_TERMS, source: 'local', loading: false, error });
    else setState({ terms: data, source: 'db', loading: false, error: null });
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

const clean = (t) => ({
  term: (t.term || '').trim(), en: (t.en || '').trim(), tag: (t.tag || '').trim(),
  def: (t.def || '').trim(), pros: (t.pros || '').trim(), cons: (t.cons || '').trim(),
});

export async function saveWikiTerm(t) {
  const row = clean(t);
  const res = t.id
    ? await sb.from('bb_wiki').update(row).eq('id', t.id).select('id')
    : await sb.from('bb_wiki').insert(row).select('id');
  if (res.error) {
    if (/bb_wiki_term_uidx|duplicate/i.test(res.error.message)) throw new Error('Ya existe un término con ese nombre.');
    if (/row-level security|permission/i.test(res.error.message)) throw new Error('Tu cuenta no tiene permiso para editar la WikiBAT.');
    throw new Error(res.error.message);
  }
  if (!res.data?.length) throw new Error('No se guardó: tu cuenta no tiene permiso para editar la WikiBAT.');
}

export async function deleteWikiTerm(id) {
  const res = await sb.from('bb_wiki').delete().eq('id', id).select('id');
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error('No se borró: tu cuenta no tiene permiso para editar la WikiBAT.');
}
