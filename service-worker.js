const VERSION = "petal-reader-v1.2.0";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/app.css",
  "./assets/js/app.js",
  "./assets/js/db.js",
  "./assets/js/fonts.js",
  "./assets/js/reader-engine.js",
  "./assets/js/dictionary.js",
  "./assets/js/backup.js",
  "./assets/js/icons.js",
  "./assets/js/hash-worker.js",
  "./assets/images/empty-library.png",
  "./assets/images/secret-garden-cover.png",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  // Keep in sync with BUNDLED_FONT_FACES in assets/js/fonts.js.
  "./assets/fonts/Lexend-Variable.ttf",
  "./assets/fonts/AtkinsonHyperlegible-Regular.ttf",
  "./assets/fonts/AtkinsonHyperlegible-Bold.ttf",
  "./vendor/foliate-js/view.js",
  "./vendor/foliate-js/epub.js",
  "./vendor/foliate-js/epubcfi.js",
  "./vendor/foliate-js/footnotes.js",
  "./vendor/foliate-js/overlayer.js",
  "./vendor/foliate-js/paginator.js",
  "./vendor/foliate-js/progress.js",
  "./vendor/foliate-js/search.js",
  "./vendor/foliate-js/text-walker.js",
  "./vendor/foliate-js/vendor/zip.js"
];

// Font files that may not be present yet. cache.addAll() rejects the whole
// install if any single entry 404s, so these are cached individually and a
// missing file simply falls back to the next font in the CSS stack.
const OPTIONAL_SHELL = [
  "./assets/fonts/OpenDyslexic-Regular.woff2",
  "./assets/fonts/OpenDyslexic-Bold.woff2",
  "./assets/fonts/ComicNeue-Regular.woff2",
  "./assets/fonts/ComicNeue-Bold.woff2"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(async cache => {
    await cache.addAll(SHELL);
    await Promise.all(OPTIONAL_SHELL.map(url => cache.add(url).catch(() => {})));
  }));
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CLEAN_OLD_CACHES") {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("petal-reader-") && key !== VERSION)
          .map(key => caches.delete(key))
      ))
    );
  }
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/dictionary/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).catch(() => caches.match("./index.html")))
    );
  } else {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});
