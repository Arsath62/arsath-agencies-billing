/* ARSATH AGENCIES — offline service worker
   Paths are derived from the worker's own location, so the app works from a
   domain root (Netlify / Cloudflare) AND from a subfolder (GitHub Pages).

   STRATEGY (changed in v6 — this was a real source of "it feels unstable"):
     * the app shell (index.html / app.js / app.css / manifest) is NETWORK-FIRST
       with a cache fallback. Cache-first meant that after you uploaded a new
       version the phone kept serving the OLD html and JS until the cache rolled
       over, so CSS and JS could arrive from different releases and the layout
       broke. Network-first shows the new version immediately and still works
       fully offline, because the fallback is the last good copy.
     * icons are CACHE-FIRST (they never change, and it keeps the splash instant)
     * a failed precache of one asset no longer aborts the whole install       */
const CACHE = 'arsath-v10';   /* bump on every release: old caches are deleted on activate */
const PREVIOUS_CACHE = 'arsath-v9';   /* kept as a fallback until the new one is proven */
const BASE = new URL('./', self.location.href).href;   // e.g. https://user.github.io/arsath-agencies/

/* the versioned shell — must always be fetched fresh when a network exists */
const SHELL = ['', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest'].map((a) => BASE + a);
/* static art — safe to serve from cache forever */
const ART = [
  'icons/icon-32.png', 'icons/icon-72.png', 'icons/icon-96.png', 'icons/icon-144.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/favicon-16.png', 'icons/favicon-32.png'
].map((a) => BASE + a);

const HOME = BASE + 'index.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* Cache each asset individually. cache.addAll() is all-or-nothing, so a single
       missing icon (or a host that 404s on manifest.webmanifest) used to abort the
       entire install and leave the app with NO offline support at all. */
    const results = await Promise.all(
      SHELL.concat(ART).map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res.clone());
          return res && res.ok;
        } catch (e) { return false; }
      })
    );
    /* the shell is what matters; icons failing must not block the install */
    const shellOk = results.slice(0, SHELL.length).filter(Boolean).length;
    if (shellOk === 0) throw new Error('could not precache any shell asset');
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    /* delete everything except this release and the one before it, so a page that
       is already open can still read an asset it fetched a moment ago */
    await Promise.all(keys.filter((k) => k !== CACHE && k !== PREVIOUS_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Tell any open page that a newer version is ready, instead of swapping the files
   out from under it mid-session (which is what made the app feel inconsistent). */
async function notifyUpdate() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((c) => { try { c.postMessage({ type: 'ARSATH_UPDATE_READY' }); } catch (e) {} });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const reqUrl = new URL(req.url);
  if (reqUrl.origin !== self.location.origin) return;   // never touch cross-origin requests

  const isNav = req.mode === 'navigate';
  const isShell = SHELL.indexOf(req.url) !== -1 || reqUrl.pathname.endsWith('/app.js') ||
                  reqUrl.pathname.endsWith('/app.css') || reqUrl.pathname.endsWith('/index.html');

  /* ---- app shell + navigation: NETWORK FIRST, cache as the offline fallback ---- */
  if (isNav || isShell) {
    event.respondWith((async () => {
      const target = isNav ? HOME : req.url;
      try {
        const res = await fetch(isNav ? new Request(target, { cache: 'no-cache' }) : req, { cache: 'no-cache' });
        if (res && (res.ok || res.type === 'opaque')) {
          const cache = await caches.open(CACHE);
          await cache.put(target, res.clone());
        }
        return res;
      } catch (e) {
        /* offline: serve this release, then the previous one, then any copy */
        const hit = (await caches.match(target)) || (await caches.match(req)) ||
                    (await caches.match(HOME));
        if (hit) return hit;
        if (isNav) return new Response('<h1 style="font:600 20px system-ui;padding:24px">ARSATH AGENCIES is offline</h1>' +
          '<p style="font:400 14px system-ui;padding:0 24px;color:#475569">Reconnect once and reopen the app.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        throw e;
      }
    })());
    return;
  }

  /* ---- icons and other static art: CACHE FIRST, refresh in the background ---- */
  event.respondWith((async () => {
    const hit = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && (res.status === 200 || res.type === 'opaque')) {
        caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
      }
      return res;
    }).catch(() => hit);
    return hit || network;
  })());
});

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (!d || !d.type) return;
  if (d.type === 'ARSATH_SKIP_WAITING') self.skipWaiting();
  if (d.type === 'ARSATH_PING') { try { event.source.postMessage({ type: 'ARSATH_PONG', cache: CACHE }); } catch (e) {} }
  if (d.type === 'ARSATH_UPDATE_APPLIED') notifyUpdate();
});
