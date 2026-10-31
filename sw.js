const CACHE_NAME = 'hinata-dashboard-v2';
const CDN_HOST = 'cdn.jsdelivr.net';

const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './js/store.js',
    './js/calendar.js',
    './js/views.js',
    './js/modal.js',
    './js/main.js'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// ネットワーク・ファースト。オフライン時のみキャッシュを返す
self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;
    if (!sameOrigin && url.hostname !== CDN_HOST) return;

    // ?v=タイムスタンプ付きURLがキャッシュに溜まらないよう、キーからvを除く
    url.searchParams.delete('v');
    const key = url.href;

    event.respondWith(
        fetch(req)
            .then(res => {
                const cacheable = sameOrigin
                    ? res.status === 200 && res.type === 'basic'
                    : res.ok || res.type === 'opaque';
                if (cacheable) {
                    const copy = res.clone();
                    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(key, copy)));
                }
                return res;
            })
            .catch(() =>
                caches.match(key).then(hit =>
                    hit || (req.mode === 'navigate' ? caches.match('./index.html') : null) || Response.error()
                )
            )
    );
});
