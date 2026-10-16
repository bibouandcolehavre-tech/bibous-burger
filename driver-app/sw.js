const CACHE = 'krokly-driver-shell-v10';
// Only this public shell is stored. Never intercept APIs, authenticated
// requests, query strings or future routes that may contain private data.
const STATIC = ['/driver/', '/driver/app.js', '/driver/gps.js', '/driver/guidance-core.js', '/driver/guidance.js', '/driver/style.css', '/driver/icon.svg', '/driver/icon-192.png', '/driver/icon-512.png', '/driver/apple-touch-icon.png', '/driver/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('krokly-driver-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.search || !STATIC.includes(url.pathname) || event.request.headers.has('Authorization')) return;
  event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match(event.request))));
});
self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification('Krokli Driver · nouvelle alerte', {
    body: 'Ouvre ton espace livreur pour voir la course ou le test.',
    icon: '/driver/icon-192.png',
    badge: '/driver/icon-192.png',
    tag: 'krokly-driver-alert',
    renotify: true,
    data: { url: '/driver/' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => new URL(client.url).pathname.startsWith('/driver/'));
    if (existing) { await existing.focus(); existing.navigate('/driver/'); return; }
    return self.clients.openWindow('/driver/');
  }));
});
