// Very minimal SW: cache only a tiny local allowlist; never touch dev/HMR or external domains.
const CACHE = "mleo-app-v1";
const LOCAL_ASSETS = [
  "/",
  "/favicon.ico",
  "/images/ludo/board.png",
  "/images/ludo/dog_0.png",
  "/images/ludo/dog_1.png",
  "/images/ludo/dog_2.png",
  "/images/ludo/dog_3.png",
]; // add only stable local files if you want

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(LOCAL_ASSETS).catch(err => {
        // Don't fail the install in dev
        console.warn("SW: skip caching in dev", err);
      })
    )
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isExternal = url.origin !== self.location.origin;
  const isDevAsset =
    url.pathname.includes("_next") || url.pathname.includes("hot-reloader-client");
  if (isExternal || isDevAsset) return; // let the browser handle it
  event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request)));
});
