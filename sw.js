// Team 365 service worker.
// v5 (2 Oct 2026): push notifications. Bumping CACHE makes every installed phone
// pick up this file and drop the old cache.
const CACHE = "team365-v5";

const STATIC_ASSETS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// INSTALL
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );

  self.skipWaiting();
});

// ACTIVATE
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))
      );
    })
  );

  self.clients.claim();
});

// FETCH
self.addEventListener("fetch", event => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    (async () => {
      try {
        // Always try network first
        const response = await fetch(event.request);

        // Cache ONLY safe successful same-origin responses
        if (
          response &&
          response.status === 200 &&
          response.type === "basic"
        ) {
          const cache = await caches.open(CACHE);
          cache.put(event.request, response.clone());
        }

        return response;

      } catch (error) {

        // Try cache fallback
        const cached = await caches.match(event.request);

        if (cached) {
          return cached;
        }

        // Final fallback response
        return new Response("Offline", {
          status: 503,
          statusText: "Offline"
        });
      }
    })()
  );
});

// ── PUSH NOTIFICATIONS (2 Oct 2026) ──────────────────────────────────────────
// The server (Supabase edge function send-push) sends Declarative Web Push JSON:
//   {web_push:8030, notification:{title, body, navigate, tag, app_badge}, mutable:true}
// iPhone 18.4+ can show that by itself; everywhere else (and on iPhone too, when
// this runs) we show it here. RULE: every push MUST show a notification —
// iPhone cancels the subscription if one arrives and nothing is shown.
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
    const n = data.notification || {};
    const title = n.title || "Team 365";
    const url = n.navigate || "/";
    const tag = n.tag || "t365";
    const badgeNum = parseInt(n.app_badge, 10);
    // Let any open Team 365 window refresh straight away (messages, ring, lists).
    try {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      wins.forEach(w => { try { w.postMessage({ t365: "push", url, tag }); } catch (e) {} });
    } catch (e) {}
    try {
      if (self.navigator && self.navigator.setAppBadge && badgeNum > 0) await self.navigator.setAppBadge(badgeNum);
    } catch (e) {}
    await self.registration.showNotification(title, {
      body: n.body || "You have a new notification",
      tag,
      renotify: true,               // a new message in the same conversation still buzzes
      icon: "/icon-192.png",
      badge: "/badge-96.png",      // Android status-bar icon (white on transparent)
      lang: n.lang || "en-NZ",
      silent: n.silent === true,
      data: { url }
    });
  })());
});

// Tap → focus an open Team 365 window and send it where the notification points;
// if none is open, open the app at that address (?goto=messages&c=… etc.).
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const target = new URL(url, self.location.origin);
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === target.origin) {
        try { await w.focus(); } catch (e) {}
        try { w.postMessage({ t365: "open", url: target.href }); } catch (e) {}
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target.href);
  })());
});

// A push service can rotate a subscription; re-save it so pushes keep arriving.
self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil((async () => {
    try {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      wins.forEach(w => { try { w.postMessage({ t365: "resubscribe" }); } catch (e) {} });
    } catch (e) {}
  })());
});
