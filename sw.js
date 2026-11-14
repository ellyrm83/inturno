// Service worker: l'app si apre anche senza rete (i dati si sincronizzano appena torna la connessione)
const CACHE = "inturno-v32";
const FILES = ["./", "index.html", "config.js", "adapter.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// file calendario (.ics) preparati dall'app: su iPhone si aprono con «Aggiungi al calendario»
const ICS = new Map();
self.addEventListener("message", e => { const d = e.data || {}; if (d.type === "ics" && d.id) { ICS.set(d.id, d.data); setTimeout(() => ICS.delete(d.id), 10 * 60 * 1000); if (e.ports && e.ports[0]) e.ports[0].postMessage("ok"); } });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.origin === location.origin && u.pathname.endsWith("/cal.ics")) { const body = ICS.get(u.searchParams.get("id")); if (body) { e.respondWith(new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "inline; filename=InTurno.ics" } })); return; } }
  if (u.origin === location.origin) {
    // rete prima (per avere sempre l'ultima versione), cache se offline
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
  } else if (u.host === "www.gstatic.com") {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; })));
  }
});

self.addEventListener("notificationclick", e => { e.notification.close(); e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => { for (const w of ws) { if ("focus" in w) return w.focus(); } return clients.openWindow("./"); })); });
