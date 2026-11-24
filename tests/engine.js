// Carica dal vero index.html le funzioni del calcolo stipendio (stesso codice dell'app, non una copia)
// e le esegue in un ambiente isolato, con dati di prova.
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const blocks = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const src = blocks.find(b => /function salMeseRaw\(/.test(b));
if (!src) throw new Error("Codice dell'app non trovato in index.html");

// estrae "function nome(...) {...}" o "const nome = ...;" bilanciando parentesi e stringhe
function scan(from, open) {
  let depth = 0, q = null;
  for (let k = from; k < src.length; k++) {
    const ch = src[k];
    if (q) { if (ch === "\\") k++; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; continue; }
    if (ch === "/" && src[k + 1] === "/") { while (k < src.length && src[k] !== "\n") k++; continue; }
    if (ch === "/" && src[k + 1] === "*") { k = src.indexOf("*/", k) + 1; continue; }
    if ("({[".includes(ch)) depth++;
    else if (")}]".includes(ch)) { depth--; if (open && depth === 0 && ch === "}") return k + 1; }
    else if (!open && depth === 0 && ch === ";") return k + 1;
  }
  throw new Error("Estrazione fallita");
}
function grabFn(name) {
  const m = new RegExp("(^|\\n)\\s*function " + name + "\\(").exec(src); if (!m) return null;
  const start = m.index + m[0].indexOf("function");
  return src.slice(start, scan(src.indexOf("{", start), true));
}
function grabConst(name) {
  const m = new RegExp("(^|\\n)\\s*const " + name + " = ").exec(src); if (!m) return null;
  const start = m.index + m[0].indexOf("const");
  return src.slice(start, scan(start, false));
}

const FUNZIONI = ["salMese", "salMeseRaw", "salPrevM", "salPagaData", "salMonths", "salExtra", "festivo", "pasqua", "salPct", "maggOrd", "salNet", "findIn", "matchName", "applyOv", "decode", "tH", "nightOf", "tHm", "origOf", "salRegoleDaBusta"];
const COSTANTI = ["nz", "hfx", "NIGHT"];

function creaAmbiente({ cfg = {}, nome = "ELISA" } = {}) {
  const parti = [];
  for (const nome of [...FUNZIONI, ...COSTANTI]) { const t = grabFn(nome) || grabConst(nome); if (!t) throw new Error("Nel codice dell'app non trovo: " + nome); parti.push(t); }
  const ctx = { console, Math, Date, JSON, Map, Set, window: {} };
  vm.createContext(ctx);
  ctx.window.__IT_RULES = { legenda: [{ code: "R1", tipo: "riposo" }, { code: "R2", tipo: "riposo" }] }; // come nelle regole reali: R1/R2 sono riposi
  const codice = `
    const S = { months: [] };
    const SET = { nDa: "20:00", nA: "08:00" };
    const P = { name: ${JSON.stringify(nome)} };
    let SAL = { cfg: ${JSON.stringify(cfg)}, mesi: {} };
    let OV = {};
    const MESI_L = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
    ${parti.join("\n")}
    // nel test le variazioni sono salvate come OV["<chiave mese>:<giorno 0-based>"]
    function codesOf(m, name) { return (m.people.get(name) || []).map((code, i) => { const o = OV[m.key + ":" + i]; return o ? applyOv(decode(code), o) : decode(code); }); }
    globalThis.__api = { S, SAL, OV, P, SET, salMese, salMeseRaw, salPagaData, salPrevM, nz, salRegoleDaBusta };
  `;
  vm.runInContext(codice, ctx, { filename: "app(index.html)" });
  return ctx.__api;
}

// mese di prova: turni dati come { giorno(1-based): "@HH:MM-HH:MM" }
function mese(anno, mese, turni, nome = "ELISA") {
  const giorni = new Date(anno, mese, 0).getDate(), v = [];
  for (let g = 1; g <= giorni; g++) v.push(turni[g] || "R");
  return { key: anno + "-" + String(mese).padStart(2, "0"), year: anno, month: mese, people: new Map([[nome, v]]), predicted: false };
}

module.exports = { creaAmbiente, mese };
