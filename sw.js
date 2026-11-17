"use strict";
(() => {
  // packages/web/killswitch-sw.ts
  var sw = self;
  var mine = (names, prefix) => names.filter((n) => n.startsWith(prefix));
  sw.addEventListener("install", (event) => {
    event.waitUntil(Promise.resolve(sw.skipWaiting()));
  });
  sw.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      try {
        await sw.clients.claim();
      } catch {
      }
      try {
        const names = await sw.caches.keys();
        await Promise.all(mine(names, "missao-olimpiadas-").map((n) => sw.caches.delete(n)));
      } catch {
      }
      try {
        await sw.registration.unregister();
      } catch {
      }
      try {
        const clients = await sw.clients.matchAll({ type: "window", includeUncontrolled: true });
        await Promise.all(clients.map((c) => c.navigate?.(c.url)?.catch(() => {
        })));
      } catch {
      }
    })());
  });
})();
