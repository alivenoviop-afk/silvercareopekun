/* SilverCare Опекун — офлайн-оболочка + клик по шторке возвращает на страницу.
   МЕНЯЙ ВЕРСИЮ при любом изменении оболочки, иначе залёживается кэш! */
var CACHE = 'guardian-v3';
var SHELL = ['guardian.html', 'guardian.css', 'guardian.js', 'manifest-guardian.json'];

self.addEventListener('install', function (e) {
  try {
    e.waitUntil(
      caches.open(CACHE).then(function (c) { return c.addAll(SHELL); })
        .then(function () { return self.skipWaiting(); }).catch(function () {})
    );
  } catch (err) {}
});

self.addEventListener('activate', function (e) {
  try {
    e.waitUntil(
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) {
          try { if (k !== CACHE) return caches.delete(k); } catch (err) {}
          return Promise.resolve(true);
        }));
      }).then(function () { return self.clients.claim(); }).catch(function () {})
    );
  } catch (err) {}
});

self.addEventListener('fetch', function (e) {
  try {
    var url = e.request.url || '';
    if (url.indexOf('ntfy.sh') !== -1 || url.indexOf('catbox.moe') !== -1) return; // сеть как есть
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        if (hit) return hit;
        return fetch(e.request).then(function (res) {
          try {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) {
              try { c.put(e.request, copy); } catch (err) {}
            }).catch(function () {});
          } catch (err) {}
          return res;
        }).catch(function () {
          return caches.match('guardian.html');
        });
      })
    );
  } catch (err) {}
});

self.addEventListener('notificationclick', function (e) {
  try { // тап по шторке — назад в кабинет
    e.notification.close();
    e.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
        try {
          if (list.length) { try { if ('focus' in list[0]) list[0].focus(); } catch (err) {} return null; }
          if (self.clients.openWindow) return self.clients.openWindow('guardian.html');
        } catch (err) {}
        return null;
      }).catch(function () {})
    );
  } catch (err) {}
});
