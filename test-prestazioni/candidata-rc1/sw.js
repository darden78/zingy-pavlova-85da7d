// Isolated scope; never delete caches belonging to the official app.
const CACHE='fantastica-test-rc1-v3';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./telefono.html','./supabase.umd.js','./phone-recovery.js','./icon-192.png','./icon-512.png'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||!u.href.startsWith(self.registration.scope)||u.pathname.endsWith('/verify.html')||u.pathname.endsWith('.apk')||u.pathname.endsWith('/telefono-version.txt'))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)))}return r}).catch(()=>caches.match(e.request)));});
