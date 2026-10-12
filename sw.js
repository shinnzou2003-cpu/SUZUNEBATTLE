/* CHRONO FIGHT service worker — offline play.
   Everything the game downloads is kept in the cache as it is used, so once a screen / fighter has been played
   online it also works offline. Nothing big is downloaded up front (the full game is ~300 MB).
   - index.html / game.js / *.json without ?v= : network first (updates show up right away), cache when offline
   - URLs with ?v= (atlases, voices, anim json)  : cache first; a new ?v= replaces the old copy
   - other files (mp4, mp3, webp, …)             : cache first, re-checked in the background (cheap 304 when unchanged)
   - <video>/<audio> Range requests              : served as 206 slices of the cached full file
   Bump SW_REV only to throw the whole cache away. */
const SW_REV = '20261012';
const CACHE = 'cf-' + SW_REV;
const SHELL = ['./', 'manifest.json', 'assets/icon_192.png', 'assets/icon_512.png'];
const NET_TIMEOUT = 4000;   // slow network: fall back to the cached copy after this long

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    // the page was loaded before this worker existed, so also store the game.js?v=… that index.html points at
    const html = await (await c.match('./')).text(), m = /src="(game\.js[^"]*)"/.exec(html);
    if (m) await c.add(m[1]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('cf-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') { e.respondWith(cacheFirst(req, url, false)); return; }
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (req.headers.has('range')) { e.respondWith(ranged(req, url)); return; }
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, new Request(self.registration.scope))); return; }
  if (/(\/|\.html|\.js)$/.test(url.pathname) || (!url.search && url.pathname.endsWith('.json'))) { e.respondWith(networkFirst(req, req)); return; }
  e.respondWith(cacheFirst(req, url, !url.searchParams.has('v')));
});

const okToStore = r => r && r.status === 200 && (r.type === 'basic' || r.type === 'cors' || r.type === 'opaque');

async function put(key, res, url) {
  const c = await caches.open(CACHE);
  await c.put(key, res);
  if (url && url.searchParams.has('v')) {   // drop older ?v= copies of the same file
    for (const k of await c.keys()) { const u = new URL(k.url); if (u.pathname === url.pathname && u.search !== url.search) c.delete(k); }
  }
}

async function networkFirst(req, key) {
  const net = fetch(req).then(r => { if (okToStore(r)) put(key, r.clone()); return r; });
  const timeout = new Promise(r => setTimeout(r, NET_TIMEOUT));
  try {
    const r = await Promise.race([net, timeout.then(() => caches.match(key, { ignoreSearch: true }))]);
    if (r) return r;
  } catch (e) { }
  return (await caches.match(key, { ignoreSearch: true })) || net;
}

// unversioned files: serve the cached copy, then ask the server once per worker lifetime whether it changed
const checked = new Set();
function revalidate(req, cached) {
  if (checked.has(req.url)) return;
  checked.add(req.url);
  const h = {}, et = cached.headers.get('etag'), lm = cached.headers.get('last-modified');
  if (et) h['If-None-Match'] = et; else if (lm) h['If-Modified-Since'] = lm; else return;
  fetch(req.url, { headers: h, cache: 'no-store' }).then(r => { if (okToStore(r)) return put(req.url, r); }).catch(() => checked.delete(req.url));
}

async function cacheFirst(req, url, recheck) {
  const hit = await caches.match(req);
  if (hit) { if (recheck) revalidate(req, hit); return hit; }
  const r = await fetch(req);
  if (okToStore(r)) put(req, r.clone(), url);
  return r;
}

// media elements ask for byte ranges; keep the whole file and cut the requested slice out of it
const inflight = new Map();
async function full(url) {
  const key = url.href;
  let hit = await caches.match(key);
  if (hit) { revalidate(new Request(key), hit); return hit; }
  if (!inflight.has(key)) {
    inflight.set(key, fetch(key).then(async r => { if (okToStore(r)) await put(key, r.clone(), url); return r; }).finally(() => inflight.delete(key)));
  }
  await inflight.get(key);
  return caches.match(key);
}
async function ranged(req, url) {
  let res;
  try { res = await full(url); } catch (e) { }
  if (!res) return fetch(req);
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let start = 0, end = size - 1;
  if (m && m[1]) { start = +m[1]; if (m[2]) end = Math.min(+m[2], size - 1); }
  else if (m && m[2]) start = Math.max(0, size - +m[2]);
  if (start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': res.headers.get('content-type') || '', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' }
  });
}
