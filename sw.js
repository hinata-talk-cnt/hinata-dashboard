const CACHE_NAME = 'hinata-dashboard-v1';

// キャッシュするベースのファイル
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

// インストール時に初期ファイルをキャッシュ
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
});

// 通信発生時の処理（ネットワーク・ファースト戦略）
// 常に最新のデータを取得しに行き、オフライン時のみキャッシュを返す
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // ネットワークから取得できたら、ついでにキャッシュも最新に更新しておく
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // オフライン時は保存してあるキャッシュを返す
                return caches.match(event.request);
            })
    );
});