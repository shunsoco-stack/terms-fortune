/* A deliberately small, first-party-only offline cache. No analytics data is cached. */
const CACHE = "terms-fortune-v1";
const CORE = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    const page = await cache.match("/");
    const html = await page.text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)]
      .map((match) => new URL(match[1].replaceAll("&amp;", "&"), self.location.origin))
      .filter((url) => url.origin === self.location.origin && url.pathname.startsWith("/_next/static/"))
      .map((url) => url.href);
    await cache.addAll([...new Set(assets)]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("terms-fortune-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_ASSETS" || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const urls = event.data.urls.slice(0, 100).filter((value) => {
      try {
        const url = new URL(value);
        return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
      } catch { return false; }
    });
    await Promise.allSettled(urls.map((url) => cache.add(url)));
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE).catch(() => null);
      try {
        const response = await fetch(request);
        if (response.ok && cache) await cache.put("/", response.clone()).catch(() => {});
        return response;
      } catch {
        return (cache && await cache.match("/").catch(() => undefined)) || Response.error();
      }
    })());
  } else if (url.pathname.startsWith("/_next/static/") || CORE.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE).catch(() => null);
      const cached = cache && await cache.match(request).catch(() => undefined);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && cache) await cache.put(request, response.clone()).catch(() => {});
      return response;
    })());
  }
});
