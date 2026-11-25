import { useEffect, useState } from 'react';

// Miembros aproximados del servidor de Discord, leídos de la invitación pública
// (no necesita clave). Si falla, devuelve null y se usa el número guardado.
export default function useDiscordCount(invite) {
  const [count, setCount] = useState(null);
  useEffect(() => {
    if (!invite) return undefined;
    const ctrl = new AbortController();
    fetch(`https://discord.com/api/v10/invites/${invite}?with_counts=true`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Number.isFinite(d.approximate_member_count)) setCount(d.approximate_member_count); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [invite]);
  return count;
}
