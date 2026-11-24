/* BATBOX: sólo avisos. El Service Worker no intercepta navegación ni recursos. */
const scope = new URL(self.registration.scope);
const vault = 'batbox-rifas-push-v1';
const stateKey = new URL('__rifas_push_device__', scope).href;
const seenKey = new URL('__rifas_push_seen__', scope).href;
const idPattern = /^[a-f0-9-]{36}$/i;
let pushChain = Promise.resolve();

async function privateState() {
  const cache = await caches.open(vault);
  const state = await (await cache.match(stateKey))?.json();
  return { cache, state };
}

function destination(message) {
  if (message.test) return new URL('#/admin?tab=rifas&v=notificaciones', scope).href;
  if (!idPattern.test(message.entry || '') || !/^[a-z0-9ñ-]{3,60}$/.test(message.slug || '')) return null;
  return new URL(`#/rifas/${encodeURIComponent(message.slug)}/mi/${message.entry}`, scope).href;
}

// Cada push TIENE que mostrar una notificación: Safari/iOS revoca el permiso si llegan
// pushes "silenciosos" y Chrome muestra "este sitio se actualizó en segundo plano".
// Si el aviso no se puede mostrar tal cual (vencido, de otro usuario del dispositivo,
// datos inválidos), se muestra uno genérico SIN datos privados.
function showGeneric() {
  return self.registration.showNotification('BAT RIFAS', {
    body: 'Tenés un aviso nuevo. Entrá a BATBOX para verlo.',
    icon: new URL('batbox-icon-192.png', scope).href, badge: new URL('batbox-icon-192.png', scope).href,
    tag: 'bat-rifa-generic', renotify: false,
    data: { href: new URL('#/rifas', scope).href, generic: true },
  });
}

async function show(event) {
  let m = null;
  try { m = event.data?.json(); } catch { m = null; }
  if (!m || !idPattern.test(m.id || '') || !Number.isFinite(m.until) || m.until <= Date.now()) return showGeneric();
  const href = destination(m);
  if (!href || typeof m.title !== 'string' || typeof m.body !== 'string') return showGeneric();
  const { cache, state } = await privateState();
  if (state?.device !== m.device || !(m.test ? state.admin : state.entries?.includes(m.entry))) return showGeneric();
  const seen = (await (await cache.match(seenKey))?.json() || []).filter((r) => r.until > Date.now());
  const options = {
    body: m.body.slice(0, 600), icon: new URL('batbox-icon-192.png', scope).href,
    badge: new URL('batbox-icon-192.png', scope).href, tag: `bat-rifa-${m.id}`, renotify: false,
    data: { href, device: m.device, entry: m.entry, test: m.test },
  };
  // Repetido: se vuelve a mostrar con la misma etiqueta (reemplaza la anterior, sin sonar de nuevo).
  await self.registration.showNotification(m.title.slice(0, 120), options);
  if (!seen.some((r) => r.id === m.id)) {
    await cache.put(seenKey, new Response(JSON.stringify([...seen.slice(-199), { id: m.id, until: m.until }])));
  }
}

self.addEventListener('push', (event) => {
  pushChain = pushChain.then(() => show(event)).catch(() => showGeneric().catch(() => {}));
  event.waitUntil(pushChain);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const d = event.notification.data;
    if (d?.generic) {
      const target = new URL('#/rifas', scope).href;
      for (const w of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
        if (new URL(w.url).pathname === scope.pathname) { const c = await w.navigate(target).catch(() => null); if (c) { await c.focus(); return; } }
      }
      await self.clients.openWindow(target);
      return;
    }
    const { state } = await privateState();
    if (!d?.href || state?.device !== d.device || !(d.test ? state.admin : state.entries?.includes(d.entry))) return;
    const target = new URL(d.href);
    if (target.origin !== scope.origin || target.pathname !== scope.pathname) return;
    for (const window of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      const current = new URL(window.url);
      if (current.origin === scope.origin && current.pathname === scope.pathname) {
        const client = current.href === target.href ? window : await window.navigate(target.href).catch(() => null);
        if (client) { await client.focus(); return; }
      }
    }
    await self.clients.openWindow(target.href);
  })());
});
