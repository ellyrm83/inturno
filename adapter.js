// InTurno – collegamento a Firebase (piano gratuito Spark).
// Fornisce all'app le stesse funzioni che usava dentro Claude: db, user, downloads.
(function () {
  const cfg = window.INTURNO_FIREBASE;
  let ready; window.__claudeReady = new Promise(r => (ready = r));
  const box = () => document.getElementById("gatebox");
  const show = html => { document.body.classList.add("locked"); const b = box(); if (b) b.innerHTML = html; };
  const whenDom = f => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", f) : f();

  // ---------- modalità solo su questo telefono (senza Firebase) ----------
  function localMode(reason) {
    const KEY = "__inturno_local_db"; let store = {}; try { store = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
    const subs = new Set(); const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} setTimeout(() => subs.forEach(f => f()), 0); };
    const snap = p => ({ id: p.split("/").pop(), exists: store[p] != null, data: () => (store[p] == null ? undefined : JSON.parse(JSON.stringify(store[p]))), metadata: { fromCache: false, hasPendingWrites: false } });
    const q = p => { const n = p.split("/").length + 1; const docs = Object.keys(store).filter(k => k.startsWith(p + "/") && k.split("/").length === n).map(snap); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false } }; };
    const D = p => ({ id: p.split("/").pop(), path: p, get: async () => snap(p), set: async d => { store[p] = JSON.parse(JSON.stringify(d)); save(); }, update: async d => { store[p] = Object.assign({}, store[p] || {}, JSON.parse(JSON.stringify(d))); save(); }, delete: async () => { delete store[p]; save(); },
      onSnapshot: n => { let last; const f = () => { const s = snap(p); const j = JSON.stringify(store[p]); if (j !== last) { last = j; n(s); } }; subs.add(f); setTimeout(f, 0); return () => subs.delete(f); }, collection: c => C(p + "/" + c) });
    const okW = (d, w) => w.every(([f, op, v]) => { const x = d && d[f]; return op === "array-contains" ? Array.isArray(x) && x.includes(v) : op === "==" ? x === v : true; });
    const qw = (p, w) => { const s = q(p); if (!w.length) return s; const docs = s.docs.filter(d => okW(store[p + "/" + d.id], w)); return Object.assign({}, s, { docs, size: docs.length, empty: !docs.length }); };
    const C = (p, w = []) => ({ path: p, doc: id => D(p + "/" + (id || Math.random().toString(36).slice(2))), add: async d => { const r = D(p + "/" + Math.random().toString(36).slice(2)); await r.set(d); return r; }, get: async () => qw(p, w),
      onSnapshot: n => { let last; const f = () => { const s = qw(p, w); const j = JSON.stringify(s.docs.map(d => [d.id, store[p + "/" + d.id]])); if (j !== last) { last = j; n(s); } }; subs.add(f); setTimeout(f, 0); return () => subs.delete(f); }, where(f, op, v) { return C(p, w.concat([[f, op, v]])); }, orderBy() { return this; }, limit() { return this; } });
    const batch = () => { const ops = []; return { set(r, d) { ops.push(() => r.set(d)); return this; }, update(r, d) { ops.push(() => r.update(d)); return this; }, delete(r) { ops.push(() => r.delete()); return this; }, commit: async () => { for (const o of ops) await o(); } }; };
    const uid = "u_locale";
    const user = { isOwner: async () => true, canEdit: async () => true, can: async () => null, id: async () => uid, me: async () => ({ id: uid, name: "", email: null, avatarUrl: "", color: "#7a68d4", isOwner: true, canEdit: true }), name: async () => "", email: async () => "", profiles: async ids => Object.fromEntries([].concat(ids || []).map(id => [id, { id, name: "", avatarUrl: "", color: "#7a68d4", email: null, isMe: id === uid, guest: false }])), search: async () => [] };
    window.__inturno = { use: async n => { if (n === "downloads" && window.claude && window.claude.use) { try { const d = await window.claude.use("downloads"); if (d) return d; } catch (e) {} } return n === "db" ? { doc: D, collection: C, batch } : n === "user" ? user : n === "downloads" ? downloads : null; } };
    window.__localMode = reason || true;
    whenDom(() => { const b = document.createElement("div"); b.className = "localbar"; b.innerHTML = "📱 Modalità su questo telefono: i dati restano qui. Per gruppi condivisi e accesso delle colleghe collega Firebase (vedi LEGGIMI)."; const w = document.querySelector(".wrap:not(#gate)"); if (w) w.prepend(b); });
    ready();
  }

  // ---------- db (stessa interfaccia usata dall'app) ----------
  const clean = d => JSON.parse(JSON.stringify(d === undefined ? {} : d));
  const err = e => ({ code: e && e.code === "permission-denied" ? "invalid_argument" : e && e.code === "resource-exhausted" ? "resource_exhausted" : "unavailable", message: e && e.message || String(e) });
  const meta = s => ({ fromCache: !!(s.metadata && s.metadata.fromCache), hasPendingWrites: !!(s.metadata && s.metadata.hasPendingWrites) });
  const dsnap = s => ({ id: s.id, exists: s.exists, data: () => (s.exists ? s.data() : undefined), metadata: meta(s) });
  const qsnap = s => { const docs = s.docs.map(dsnap); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta(s) }; };
  function docRef(path) {
    const ref = window.__fs.doc(path);
    return {
      id: ref.id, path,
      get: () => ref.get().then(dsnap).catch(e => { throw err(e); }),
      set: d => ref.set(clean(d)).catch(e => { throw err(e); }),
      update: d => ref.set(clean(d), { merge: true }).catch(e => { throw err(e); }),
      delete: () => ref.delete().catch(e => { throw err(e); }),
      onSnapshot: (next, bad) => ref.onSnapshot(s => next(dsnap(s)), e => bad && bad(err(e))),
      collection: c => colRef(path + "/" + c),
    };
  }
  function colRef(path, q) {
    const base = window.__fs.collection(path); const ref = q || base;
    return {
      path,
      doc: id => docRef(path + "/" + (id || base.doc().id)),
      add: d => base.add(clean(d)).then(r => docRef(path + "/" + r.id)),
      get: () => ref.get().then(qsnap).catch(e => { throw err(e); }),
      onSnapshot: (next, bad) => ref.onSnapshot(s => next(qsnap(s)), e => bad && bad(err(e))),
      where: (f, op, v) => colRef(path, ref.where(f, op, v)), orderBy() { return this; }, limit() { return this; },
    };
  }
  const batch = () => { const b = window.__fs.batch(); const R = r => window.__fs.doc(r.path); return { set(r, d) { b.set(R(r), clean(d)); return this; }, update(r, d) { b.set(R(r), clean(d), { merge: true }); return this; }, delete(r) { b.delete(R(r)); return this; }, commit: () => b.commit().catch(e => { throw err(e); }) }; };
  const db = { doc: docRef, collection: colRef, batch };

  // ---------- downloads: file salvato dal browser ----------
  const downloads = {
    save: async ({ filename, data }) => {
      const type = /\.ics$/i.test(filename) ? "text/calendar" : /\.csv$/i.test(filename) ? "text/csv" : "application/octet-stream";
      const blob = data instanceof Blob ? data : new Blob([data], { type });
      const file = new File([blob], filename, { type });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /iphone|ipad|android/i.test(navigator.userAgent)) {
        try { await navigator.share({ files: [file], title: filename }); return { status: "saved" }; } catch (e) { if (e && e.name === "AbortError") throw { code: "declined", message: "annullato" }; }
      }
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { status: "saved" };
    },
  };

  if (!cfg || !cfg.apiKey || String(cfg.apiKey).includes("INCOLLA")) { localMode("config"); return; }
  if (!window.firebase) { localMode("offline"); return; }
  firebase.initializeApp(cfg);
  const auth = firebase.auth(), fs = firebase.firestore(); window.__fs = fs;
  try { fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}

  // ---------- accesso ----------
  function loginScreen(msg) {
    show(`<h2>👋 Benvenuta in InTurno</h2><p class="muted">Accedi o crea il tuo account (gratis).</p>
      <div class="fgrid"><div class="full"><label>Email</label><input id="lem" type="email" autocomplete="email"></div>
      <div class="full"><label>Password (almeno 6 caratteri)</label><input id="lpw" type="password" autocomplete="current-password"></div></div>
      <div class="stbtn" style="margin-top:10px"><button class="btn" id="lin">Accedi</button><button class="btn ghost" id="lup">Crea account</button></div>
      <p style="margin-top:10px"><button class="mini" id="lrs">Password dimenticata</button></p>
      <p class="err" id="lerr">${msg || ""}</p>`);
    const em = () => document.getElementById("lem").value.trim(), pw = () => document.getElementById("lpw").value;
    const fail = e => { const m = { "auth/invalid-credential": "Email o password non corretti.", "auth/wrong-password": "Password non corretta.", "auth/user-not-found": "Account non trovato: tocca «Crea account».", "auth/email-already-in-use": "Esiste già un account con questa email: tocca «Accedi».", "auth/weak-password": "La password deve avere almeno 6 caratteri.", "auth/invalid-email": "Email non valida." }; document.getElementById("lerr").textContent = m[e.code] || e.message; };
    document.getElementById("lin").onclick = () => auth.signInWithEmailAndPassword(em(), pw()).catch(fail);
    document.getElementById("lup").onclick = () => auth.createUserWithEmailAndPassword(em(), pw()).catch(fail);
    document.getElementById("lrs").onclick = () => { if (!em()) { document.getElementById("lerr").textContent = "Scrivi prima la tua email."; return; } auth.sendPasswordResetEmail(em()).then(() => { document.getElementById("lerr").textContent = "Ti ho mandato un'email per cambiare la password."; }).catch(fail); };
    if (document.getElementById("lgo")) document.getElementById("lgo").onclick = () => { const p = new firebase.auth.GoogleAuthProvider(); const standalone = window.navigator.standalone || matchMedia("(display-mode: standalone)").matches;
      (standalone ? auth.signInWithRedirect(p) : auth.signInWithPopup(p).catch(e => e.code === "auth/popup-blocked" ? auth.signInWithRedirect(p) : Promise.reject(e))).catch(fail); };
  }
  window.__logout = () => auth.signOut().then(() => { try { Object.keys(localStorage).filter(k => k.startsWith("turni.")).forEach(k => localStorage.removeItem(k)); } catch (e) {} location.reload(); });

  let started = false;
  auth.onAuthStateChanged(async u => {
    if (!u) { whenDom(() => loginScreen()); return; }
    if (started) return; started = true;
    // la prima persona che entra diventa la proprietaria (approva le altre)
    let ownerUid = null;
    try {
      const o = await fs.doc("config/owner").get();
      if (o.exists) ownerUid = o.data().uid;
      else { await fs.doc("config/owner").set({ uid: u.uid, creato: new Date().toISOString() }); ownerUid = u.uid; }
    } catch (e) { console.warn("owner", e); }
    const names = {};
    const user = {
      isOwner: async () => ownerUid === u.uid,
      canEdit: async () => ownerUid === u.uid,
      can: async () => null,
      id: async () => u.uid,
      me: async () => ({ id: u.uid, name: u.displayName || "", email: u.email, avatarUrl: "", color: "#7a68d4", isOwner: ownerUid === u.uid, canEdit: ownerUid === u.uid }),
      name: async () => u.displayName || "",
      email: async () => u.email,
      profiles: async ids => Object.fromEntries([].concat(ids || []).map(id => [id, { id, name: names[id] || "", avatarUrl: "", color: "#7a68d4", email: null, isMe: id === u.uid, guest: false }])),
      search: async () => [],
    };
    window.__inturno = { use: async n => n === "db" ? db : n === "user" ? user : n === "downloads" ? downloads : null };
    ready();
  });
})();
