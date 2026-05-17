/* Service Worker - キャッシュ管理 */
var CACHE_VERSION = 'v20260518b';
var CACHE_NAME = 'amafuri-' + CACHE_VERSION;

/* インストール時：即座に有効化 */
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

/* 有効化時：古いキャッシュをすべて削除 */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* フェッチ：HTMLは常にネットワーク優先、他はキャッシュ優先 */
self.addEventListener('fetch', function(e) {
  /* ナビゲーション（HTMLページ）は必ずネットワークから取得 */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        return res;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  /* JS/CSS等：キャッシュ優先（なければネットワーク） */
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        return res;
      });
    })
  );
});
