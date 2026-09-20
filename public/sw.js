const CACHE = "thiepn-convert-phase0-v2";
const ROOT = new URL("./", self.location.href).href;
const MANIFEST = new URL("manifest.webmanifest", self.location.href).href;
const CORE = [ROOT, MANIFEST];

function withIsolationHeaders(response) {
  if (!response || response.type === "opaque") return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const network = withIsolationHeaders(await fetch(request));
      if (network && network.ok) await cache.put(request, network.clone());
      return network;
    } catch {
      const cached = await cache.match(request);
      if (cached) return withIsolationHeaders(cached);
      if (request.mode === "navigate") {
        const shell = await cache.match(ROOT);
        if (shell) return withIsolationHeaders(shell);
      }
      throw new Error("Offline resource unavailable");
    }
  })());
});
