// InTurno: servizio per gli avvisi ad app chiusa (Cloudflare Worker, gratuito).
// Dal servizio passa un avviso breve ("Elisa ha condiviso lo statino · Terminal 1", cifrato: lo legge solo il telefono) o, senza testo, solo "c'è una novità". Mai turni, importi o contenuto degli statini.
// Impostazioni (le inserisci nel pannello Cloudflare, vedi NOTIFICHE.md):
//   SUBS         → archivio KV (le iscrizioni dei telefoni)
//   VAPID_JWK    → chiave privata (segreto)
//   VAPID_PUBLIC → chiave pubblica (la stessa di config.js)
//   PROJECT_ID   → inturno-f5504 (facoltativo, è il valore predefinito)
//   ORIGIN       → https://ellyrm83.github.io (facoltativo, è il valore predefinito)
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const enc = new TextEncoder();
let JWKS = null, JWKS_T = 0;

async function verificaToken(tok, projectId) {
  const [h, p, sg] = String(tok || "").split("."); if (!h || !p || !sg) throw new Error("token");
  const head = JSON.parse(new TextDecoder().decode(unb64u(h))), pay = JSON.parse(new TextDecoder().decode(unb64u(p)));
  if (head.alg !== "RS256") throw new Error("alg");
  if (!JWKS || Date.now() - JWKS_T > 3600e3) { const r = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"); JWKS = (await r.json()).keys; JWKS_T = Date.now(); }
  const jwk = JWKS.find(k => k.kid === head.kid); if (!jwk) throw new Error("kid");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64u(sg), enc.encode(h + "." + p)))) throw new Error("firma");
  const now = Date.now() / 1000;
  if (pay.aud !== projectId || pay.iss !== "https://securetoken.google.com/" + projectId || pay.exp < now || !pay.sub) throw new Error("claim");
  return pay.sub;
}

async function vapidHeader(endpoint, env) {
  const aud = new URL(endpoint).origin, jwk = JSON.parse(env.VAPID_JWK);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))), body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:noreply@inturno.invalid" })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}

// cifratura del messaggio (RFC 8291, aes128gcm): lo legge solo il telefono, nemmeno il servizio di recapito
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
async function cifra(sub, testo) {
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; a.forEach(x => { o.set(x, i); i += x.length; }); return o; };
  const prk = await hkdf(auth, ecdh, cat(enc.encode("WebPush: info\0"), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, prk, enc.encode("Content-Encoding: aes128gcm\0"), 16), nonce = await hkdf(salt, prk, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(enc.encode(testo), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0, 65]), asPub, ct);
}
async function invia(sub, env, msg) {
  const h = { Authorization: await vapidHeader(sub.endpoint, env), TTL: "86400", Urgency: "normal" };
  let body = null;
  if (msg && sub.keys && sub.keys.p256dh && sub.keys.auth) { try { body = await cifra(sub, JSON.stringify(msg)); h["Content-Encoding"] = "aes128gcm"; h["Content-Type"] = "application/octet-stream"; } catch (e) { body = null; } }
  if (!body) h["Content-Length"] = "0";
  const r = await fetch(sub.endpoint, { method: "POST", headers: h, body });
  return r.status;
}

export default {
  async fetch(req, env) {
    const origin = env.ORIGIN || "https://ellyrm83.github.io", projectId = env.PROJECT_ID || "inturno-f5504";
    const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
    const out = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...cors, "Content-Type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return out({ ok: true, servizio: "InTurno avvisi" });
    const path = new URL(req.url).pathname.replace(/\/$/, "");
    let uid; try { uid = await verificaToken((req.headers.get("Authorization") || "").replace(/^Bearer /, ""), projectId); } catch (e) { return out({ errore: "non autorizzato" }, 401); }
    let body = {}; try { body = await req.json(); } catch (e) {}
    const chiave = u => "s:" + u;
    const leggi = async u => { try { return JSON.parse((await env.SUBS.get(chiave(u))) || "[]"); } catch (e) { return []; } };
    if (path === "/sub") {
      const s = body.sub; if (!s || !/^https:\/\//.test(s.endpoint || "") || !s.keys) return out({ errore: "iscrizione non valida" }, 400);
      const l = (await leggi(uid)).filter(x => x.endpoint !== s.endpoint); l.unshift({ endpoint: s.endpoint, keys: { p256dh: String(s.keys.p256dh || ""), auth: String(s.keys.auth || "") } });
      await env.SUBS.put(chiave(uid), JSON.stringify(l.slice(0, 5))); return out({ ok: true });
    }
    if (path === "/unsub") { const l = (await leggi(uid)).filter(x => x.endpoint !== body.endpoint); await env.SUBS.put(chiave(uid), JSON.stringify(l)); return out({ ok: true }); }
    if (path === "/send") {
      const to = [...new Set(Array.isArray(body.to) ? body.to : [])].filter(u => typeof u === "string" && u && u !== uid).slice(0, 50); if (!to.length) return out({ ok: true, inviati: 0 });
      const ora = "r:" + uid + ":" + Math.floor(Date.now() / 3600e3), n = parseInt((await env.SUBS.get(ora)) || "0", 10);
      if (n >= 60) return out({ errore: "troppi avvisi, riprova più tardi" }, 429);
      await env.SUBS.put(ora, String(n + 1), { expirationTtl: 7200 });
      const m0 = body.msg, msg = m0 && typeof m0.t === "string" ? { t: m0.t.slice(0, 60), b: String(m0.b || "").slice(0, 120) } : null; let inviati = 0;
      for (const u of to) { const l = await leggi(u), vivi = [];
        for (const s of l) { let st = 0; try { st = await invia(s, env, msg); } catch (e) { st = 0; } if (st === 404 || st === 410) continue; vivi.push(s); if (st >= 200 && st < 300) inviati++; }
        if (vivi.length !== l.length) await env.SUBS.put(chiave(u), JSON.stringify(vivi)); }
      return out({ ok: true, inviati });
    }
    return out({ errore: "percorso sconosciuto" }, 404);
  },
};
