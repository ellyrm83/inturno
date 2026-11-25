// InTurno: servizio per gli avvisi ad app chiusa (Cloudflare Worker, gratuito).
// Dal servizio passa solo "c'è una novità per questa persona": nessun turno, nome, importo o statino.
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

async function invia(sub, env) {
  const r = await fetch(sub.endpoint, { method: "POST", headers: { Authorization: await vapidHeader(sub.endpoint, env), TTL: "86400", Urgency: "normal", "Content-Length": "0" } });
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
      const l = (await leggi(uid)).filter(x => x.endpoint !== s.endpoint); l.unshift({ endpoint: s.endpoint }); // serve solo l'indirizzo: gli avvisi non hanno contenuto
      await env.SUBS.put(chiave(uid), JSON.stringify(l.slice(0, 5))); return out({ ok: true });
    }
    if (path === "/unsub") { const l = (await leggi(uid)).filter(x => x.endpoint !== body.endpoint); await env.SUBS.put(chiave(uid), JSON.stringify(l)); return out({ ok: true }); }
    if (path === "/send") {
      const to = [...new Set(Array.isArray(body.to) ? body.to : [])].filter(u => typeof u === "string" && u && u !== uid).slice(0, 50); if (!to.length) return out({ ok: true, inviati: 0 });
      const ora = "r:" + uid + ":" + Math.floor(Date.now() / 3600e3), n = parseInt((await env.SUBS.get(ora)) || "0", 10);
      if (n >= 60) return out({ errore: "troppi avvisi, riprova più tardi" }, 429);
      await env.SUBS.put(ora, String(n + 1), { expirationTtl: 7200 });
      let inviati = 0;
      for (const u of to) { const l = await leggi(u), vivi = [];
        for (const s of l) { let st = 0; try { st = await invia(s, env); } catch (e) { st = 0; } if (st === 404 || st === 410) continue; vivi.push(s); if (st >= 200 && st < 300) inviati++; }
        if (vivi.length !== l.length) await env.SUBS.put(chiave(u), JSON.stringify(vivi)); }
      return out({ ok: true, inviati });
    }
    return out({ errore: "percorso sconosciuto" }, 404);
  },
};
