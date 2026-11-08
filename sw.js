// The site's helper that runs in the background: makes it installable as an app, shows game alerts,
// and shows the last-loaded page if the connection drops. It never caches scores, so they're always live.
const SHELL = "cbb-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", e => {
  if (e.request.mode !== "navigate") return; // everything else goes straight to the network
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put("/", copy)) }
    return r;
  }).catch(() => caches.match("/")));
});

// ---- game alerts ----
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {} } catch { d = { title: "College Basketball", body: e.data ? e.data.text() : "" } }
  e.waitUntil(self.registration.showNotification(d.title || "College Basketball", {
    body: d.body || "", icon: "/icon-192.png", badge: "/badge-72.png", tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || "/#scores" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/#scores";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) if (new URL(w.url).origin === self.location.origin) { await w.focus(); try { await w.navigate(url) } catch { w.postMessage({ open: url }) } return }
    await self.clients.openWindow(url);
  })());
});
