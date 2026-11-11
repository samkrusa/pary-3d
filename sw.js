/* Пары 3D — кэш оболочки и расписаний: приложение открывается без сети. */

const VERSION = "pary3d-v2";
const SHELL = [
  "./",
  "index.html",
  "style.css?v=1",
  "app.js?v=1",
  "three.min.js",
  "icon.svg",
  "manifest.webmanifest",
  "data/index.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Навигация — сеть, при обрыве оболочка из кэша.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req, { cache: "no-cache" })
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("index.html", copy));
          return res;
        })
        .catch(() => caches.match("index.html"))
    );
    return;
  }

  // Расписания — stale-while-revalidate.
  if (url.pathname.includes("/data/")) {
    event.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(req).then((hit) => {
          const net = fetch(req, { cache: "no-cache" })
            .then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // Остальное — из кэша, иначе сеть.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});