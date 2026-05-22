const CACHE = "team365-v4";

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
