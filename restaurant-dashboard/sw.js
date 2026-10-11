/* Only the generic offline warning is stored. No app HTML, API data or credentials. */
const CACHE = 'bibou-restaurant-offline-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.add('./offline.html'))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('bibou-restaurant-offline-') && key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request,{cache:'no-store'}).catch(async()=>
    (await caches.match('./offline.html')) || new Response('Connexion nécessaire pour le back-office.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})
  ));
});
