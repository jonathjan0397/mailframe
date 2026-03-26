/**
 * MailFrame Service Worker — cache-first for app shell, network-first for API.
 * Also handles notification clicks so the app window is focused or opened.
 */
const CACHE = "mailframe-v1";
const SHELL = ["/mailframe/", "/mailframe/index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Notification click — focus existing window or open a new one
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = e.notification.data?.url || "/mailframe/";
  e.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.startsWith(self.location.origin + "/mailframe") && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      })
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Never intercept API or cross-origin requests
  if (url.pathname.startsWith("/api/") || url.origin !== self.location.origin) return;

  // Cache-first for static assets (JS/CSS/fonts)
  if (url.pathname.match(/\.(js|css|woff2?|png|svg|ico)$/)) {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached ?? fetch(e.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return res;
        })
      )
    );
    return;
  }

  // Network-first for HTML (always get fresh app shell)
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/mailframe/") ?? caches.match("/mailframe/index.html"))
    );
  }
});
