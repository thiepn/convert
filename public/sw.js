const CACHE = "thiepn-convert-phase9-v1";
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

function isEngineAsset(url) {
  return url.pathname.includes("/engines/")
    || /\.(?:wasm|worker\.js|worker\.mjs)$/i.test(url.pathname);
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

    if (isEngineAsset(url)) {
      const cached=await cache.match(request);
      if (cached) return withIsolationHeaders(cached);
      const network=withIsolationHeaders(await fetch(request));
      if (network && network.ok) await cache.put(request,network.clone());
      return network;
    }

    if (request.mode === "navigate") {
      try {
        const network=withIsolationHeaders(await fetch(request));
        if (network && network.ok) await cache.put(ROOT,network.clone());
        return network;
      } catch {
        const shell=await cache.match(ROOT);
        if (shell) return withIsolationHeaders(shell);
        throw new Error("Offline shell unavailable");
      }
    }

    const cached=await cache.match(request);
    if (cached) {
      event.waitUntil(
        fetch(request)
          .then(response=>{
            const normalized=withIsolationHeaders(response);
            if (normalized && normalized.ok) return cache.put(request,normalized.clone());
          })
          .catch(()=>undefined)
      );
      return withIsolationHeaders(cached);
    }

    const network=withIsolationHeaders(await fetch(request));
    if (network && network.ok) await cache.put(request,network.clone());
    return network;
  })());
});
