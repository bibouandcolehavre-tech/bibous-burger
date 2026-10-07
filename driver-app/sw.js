const CACHE = 'krokly-driver-shell-v2';
const STATIC = ['/driver/', '/driver/app.js', '/driver/style.css', '/driver/icon.svg', '/driver/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/driver/')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification('Krokly Driver · nouvelle alerte', {
    body: 'Ouvre ton espace livreur pour voir la course ou le test.',
    icon: '/driver/icon.svg',
    badge: '/driver/icon.svg',
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
