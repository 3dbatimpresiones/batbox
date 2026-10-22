import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { currentRoute } from '../lib/router.js';

// =====================================================================
// AUTH DE BATBOX
// Reutiliza el sistema del Cotizador PRO sin modificarlo:
//   - Login: Google OAuth del mismo proyecto Supabase.
//   - Membresía: RPC public.get_my_access() (la misma que usa el cotizador).
//     Busca en authorized_members por auth_user_id o email y vincula sola
//     a los miembros aprobados que nunca habían iniciado sesión.
// Esto solo decide QUÉ SE MUESTRA. La protección real del contenido
// exclusivo va en la base (RLS), no acá.
// =====================================================================

const AuthCtx = createContext(null);
const RETURN_KEY = 'bb_return_to';

// Estados posibles de `access`:
//   loading · guest (sin sesión) · error (no se pudo consultar)
//   none (sesión sin registro en Makers Club) · member (approved)
//   pending · rejected · suspended · expired
function deriveAccess({ loading, session, member, error }) {
  if (loading) return 'loading';
  if (!session) return 'guest';
  if (error) return 'error';
  if (!member) return 'none';
  if (member.status === 'approved') return 'member';
  return member.status;
}

// ---- Modo simulación (SOLO en `npm run dev`, Vite lo elimina del build) ----
// http://localhost:5173/batbox/?simular=member|editor|admin|owner|pending|none|rejected|suspended|expired
// Sirve para ver cada estado de la interfaz sin iniciar sesión. No toca Supabase.
const SIM = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('simular') : null;
function simulatedState(kind) {
  const session = { user: { id: 'sim', email: 'maker@ejemplo.com', user_metadata: { full_name: 'Maker Ejemplo' } } };
  if (kind === 'guest') return { loading: false, session: null, member: null, error: null };
  if (kind === 'none') return { loading: false, session, member: null, error: null };
  // prueba gratis activa (quedan 9 días) / terminada
  if (kind === 'trial') {
    const end = new Date(Date.now() + 9 * 864e5).toISOString();
    return { loading: false, session, error: null, member: { email: 'maker@ejemplo.com', status: 'approved', role: 'user', subscription_expires_at: end, is_trial: true, trial_ends_at: end } };
  }
  if (kind === 'trialended') {
    return { loading: false, session, member: null, error: null, trial: { active: false, ends_at: new Date(Date.now() - 864e5).toISOString() } };
  }
  if (kind === 'owner') { // dueño: admin marcado como dueño por la base
    return { loading: false, session, error: null, owner: true,
      member: { email: 'dueno@ejemplo.com', first_name: '3DBAT', status: 'approved', role: 'admin', subscription_expires_at: null } };
  }
  const status = ['admin', 'editor', 'member'].includes(kind) ? 'approved' : kind;
  return {
    loading: false, session, error: null,
    member: { email: 'maker@ejemplo.com', first_name: 'Maker', status, role: kind === 'admin' || kind === 'editor' ? kind : 'user', subscription_expires_at: null },
  };
}

function readUrlAuthError() {
  const params = new URLSearchParams(window.location.search);
  return params.get('error_description') || params.get('error');
}

// Después de volver de Google: saca ?code / ?error de la URL y vuelve a la
// sección desde donde la persona tocó "Ingresar".
function cleanAuthParams(signedIn) {
  const url = new URL(window.location.href);
  const hadParams = ['code', 'error', 'error_description', 'error_code'].some((k) => url.searchParams.has(k));
  // supabase-js ya puede haber sacado el ?code de la URL antes de este aviso: si hay sesión
  // y quedó guardada una sección de vuelta, se usa igual.
  let ret = null;
  try {
    ret = sessionStorage.getItem(RETURN_KEY);
    if (hadParams || (signedIn && ret)) sessionStorage.removeItem(RETURN_KEY);
  } catch { /* storage bloqueado: se queda en la página actual */ }
  if (!hadParams && !(signedIn && ret)) return;
  ['code', 'error', 'error_description', 'error_code'].forEach((k) => url.searchParams.delete(k));
  window.history.replaceState(null, '', url.pathname + url.search + (ret ? '#' + ret : url.hash));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(() => (SIM ? simulatedState(SIM) : { loading: true, session: null, member: null, error: null }));
  const [notice, setNotice] = useState(() => {
    if (SIM) return { type: 'ok', text: `Modo simulación: ${SIM}` };
    const e = readUrlAuthError();
    return e ? { type: 'err', text: 'No se pudo iniciar sesión con Google: ' + e } : null;
  });
  const lastUid = useRef(undefined);

  const loadMember = useCallback(async (session) => {
    if (!session) {
      setState({ loading: false, session: null, member: null, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, session }));
    const { data, error } = await sb.rpc('get_my_access');
    if (error) {
      console.error('[BATBOX] get_my_access', error);
      setState({ loading: false, session, member: null, error: 'No pudimos comprobar tu acceso. Probá de nuevo en unos segundos.' });
      return;
    }
    const member = data?.[0] ?? null;
    // ¿Es la cuenta dueña? Lo decide la base (los correos de dueño no están en el código público).
    let owner = false;
    if (member?.role === 'admin' && member.status === 'approved') {
      const r = await sb.rpc('bb_is_owner');
      owner = r.data === true;
    }
    // Sin membresía: ¿tuvo prueba gratis y terminó? (para el recordatorio del Inicio)
    let trial = null;
    if (!member) {
      const t = await sb.rpc('bb_my_trial');
      trial = t.error ? null : t.data;
    }
    setState({ loading: false, session, member, error: null, owner, trial });
  }, []);

  useEffect(() => {
    if (SIM) return undefined;
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        lastUid.current = null;
        setState({ loading: false, session: null, member: null, error: null });
        return;
      }
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        cleanAuthParams(!!session);
        const uid = session?.user?.id ?? null;
        // Supabase vuelve a emitir SIGNED_IN al volver a la pestaña: si es la
        // misma persona no se vuelve a consultar (mismo fix que el cotizador).
        if (uid === lastUid.current) {
          setState((s) => ({ ...s, session }));
          return;
        }
        lastUid.current = uid;
        // Supabase recomienda no esperar otras llamadas dentro de este callback.
        setTimeout(() => loadMember(session), 0);
        return;
      }
      // TOKEN_REFRESHED, USER_UPDATED: solo se actualiza la sesión.
      if (session) setState((s) => ({ ...s, session }));
    });
    return () => subscription.unsubscribe();
  }, [loadMember]);

  const signIn = useCallback(async (returnTo = currentRoute()) => {
    if (SIM) { setNotice({ type: 'ok', text: 'Simulación: acá se abriría Google' }); return; }
    try { sessionStorage.setItem(RETURN_KEY, returnTo); } catch { /* sin storage: vuelve al inicio */ }
    const redirectTo = window.location.origin + window.location.pathname;
    // prompt=select_account: Google siempre deja elegir la cuenta (clave para "Usar otra cuenta").
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    });
    if (error) setNotice({ type: 'err', text: 'Error al conectar con Google. Intentá de nuevo.' });
  }, []);

  // scope 'local': cierra la sesión en este navegador (BATBOX y cotizador),
  // sin desconectar los otros dispositivos de la persona.
  const signOut = useCallback(async () => {
    if (!SIM) await sb.auth.signOut({ scope: 'local' });
    lastUid.current = null;
    setState({ loading: false, session: null, member: null, error: null });
  }, []);

  const recheck = useCallback(() => (SIM ? undefined : loadMember(state.session)), [loadMember, state.session]);
  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(() => {
    const access = deriveAccess(state);
    const user = state.session?.user ?? null;
    return {
      ...state,
      user,
      access,
      isMember: access === 'member',
      // Solo para mostrar el acceso al panel. Toda acción la valida la base (RLS / RPC).
      // Editor: contenidos, redes y comentarios. Admin: además Miembros y Actividad.
      // Dueño: además da y quita permisos (bb_admin_set_role).
      isAdmin: access === 'member' && state.member?.role === 'admin',
      isEditor: access === 'member' && state.member?.role === 'editor',
      canEdit: access === 'member' && ['admin', 'editor'].includes(state.member?.role),
      isOwner: access === 'member' && state.member?.role === 'admin' && state.owner === true,
      // Prueba gratis de 14 días (migración 022): entra como miembro hasta trialEndsAt.
      isTrial: access === 'member' && state.member?.is_trial === true,
      trialEndsAt: state.member?.trial_ends_at || null,
      trial: state.trial || null,
      displayName: state.member?.first_name || user?.user_metadata?.full_name?.split(' ')[0] || user?.email || '',
      email: state.member?.email || user?.email || '',
      signIn,
      signOut,
      recheck,
      notice,
      clearNotice,
      notify: (type, text) => setNotice({ type, text }),
      simulated: !!SIM,
    };
  }, [state, signIn, signOut, recheck, notice, clearNotice]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
