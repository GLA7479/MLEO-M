// public/sw.js
const CACHE = "mleo-home-v1";
const PRECACHE_URLS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((n) => (n === CACHE ? null : caches.delete(n))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Network-first for dynamic; cache-first for same-origin static
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((resp) => {
              const copy = resp.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
              return resp;
            })
            .catch(() => caches.match("/"))
      )
    );
  }
});
