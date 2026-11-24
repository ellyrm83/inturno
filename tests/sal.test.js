// Test del calcolo stipendio di InTurno.  Si lanciano con:  node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { creaAmbiente, mese } = require("./engine");

const CFG = { fisso: 1650, pagaOra: 10, soglia: 8, percNott: 50, percAll: 25, percStr: 30, percDom: 0, percFest: 0, mode: "semplice", nettoPerc: 72 };
const vicino = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || "") + ` atteso ${b}, trovato ${a}`);

function nuovo() { const api = creaAmbiente({ cfg: CFG }); return api; }
function aggiungi(api, ...mesi) { mesi.forEach(m => { api.S.months.push(m); api.SAL.mesi[m.key] = api.SAL.mesi[m.key] || {}; }); }

test("turno di 6 ore normale: nessun allungo, solo notturno 20-21", () => {
  const api = nuovo(), nov = mese(2026, 11, { 3: "@15:00-21:00" }); aggiungi(api, nov);
  const r = api.salMese(nov);
  vicino(r.ordH, 0, "allungo"); vicino(r.strH, 0, "straordinario"); vicino(r.nott, 1, "ore notturne del turno"); vicino(r.ore, 6, "ore lavorate");
});

test("turno spostato con la stessa durata (10-16 -> 14:30-20:30) NON è allungo", () => {
  const api = nuovo(), nov = mese(2026, 11, { 17: "@10:00-16:00" }), dic = mese(2026, 12, {}); aggiungi(api, nov, dic);
  api.OV["2026-11:16"] = { tipo: "variazione", inizio: "14:30", fine: "20:30" };
  const busta = api.salMese(dic); // la busta di dicembre porta gli extra di novembre
  vicino(busta.ordH, 0, "allungo nella busta di dicembre"); vicino(busta.strH, 0);
  const own = api.salMese(nov).own; vicino(own.ordH, 0, "allungo di novembre"); vicino(own.nott, 0.5, "notturno 20-20:30");
});

test("15-21 -> 15-21:30: mezz'ora di allungo notturno, pagata nella busta del mese dopo", () => {
  const api = nuovo(), nov = mese(2026, 11, { 23: "@15:00-21:00" }), dic = mese(2026, 12, {}); aggiungi(api, nov, dic);
  api.OV["2026-11:22"] = { tipo: "variazione", inizio: "15:00", fine: "21:30" };
  const busta = api.salMese(dic);
  vicino(busta.ordH, 0.5, "allungo"); vicino(busta.ordNott, 0.5, "di cui notturno"); vicino(busta.strH, 0);
  vicino(busta.vOrd, 0.5 * 10 * (1 + 0.25 + 0.5), "importo allungo notturno");
  const nv = api.salMese(nov);
  vicino(nv.ordH, 0, "la busta di novembre non include gli extra di novembre"); vicino(nv.own.ordH, 0.5, "ma li ha maturati");
  vicino(nv.nott, 1, "il notturno del turno resta 20-21 (la mezz'ora è già conteggiata come allungo)");
  vicino(nv.dispOrd, 0, "senza ottobre caricato non ci sono ore di allungo disponibili");
});

test("ore in più segnate a mano + variazione che le copre: niente doppio conteggio", () => {
  const api = nuovo(), nov = mese(2026, 11, { 23: "@15:00-21:00" }), dic = mese(2026, 12, {}); aggiungi(api, nov, dic);
  api.SAL.mesi["2026-11"].extra = { 23: { piu: "0,5", dove: "dopo" } }; // registrate prima, senza riferimento
  api.OV["2026-11:22"] = { tipo: "variazione", inizio: "15:00", fine: "21:30" };
  vicino(api.salMese(dic).ordH, 0.5, "legacy senza rif");
  api.SAL.mesi["2026-11"].extra[23].rif = { s: 15, e: 21 }; // registrate con il turno 15-21
  vicino(api.salMese(dic).ordH, 0.5, "con rif");
  api.SAL.mesi["2026-11"].extra[23].rif = { s: 15, e: 21.5 }; // registrate dopo la variazione: sono davvero in più
  vicino(api.salMese(dic).ordH, 1, "ore in più oltre la variazione");
});

test("oltre le 8 ore di turno l'extra è straordinario", () => {
  const api = nuovo(), nov = mese(2026, 11, { 5: "@10:00-16:00" }), dic = mese(2026, 12, {}); aggiungi(api, nov, dic);
  api.SAL.mesi["2026-11"].extra = { 5: { piu: "3", dove: "dopo" } }; // 6h + 3h: 2h ordinarie, 1h straordinario
  const b = api.salMese(dic); vicino(b.ordH, 2, "ordinarie"); vicino(b.strH, 1, "straordinario");
});

test("maturato a oggi: oggi conta solo fino all'ora attuale", () => {
  const api = nuovo(), nov = mese(2026, 11, { 10: "@15:00-21:00" }); aggiungi(api, nov);
  const oggi = new Date(2026, 10, 10, 23, 59, 59);
  vicino(api.salMese(nov, { fino: oggi, ora: 18 }).ore, 3, "alle 18 sono passate 3 ore");
  vicino(api.salMese(nov, { fino: oggi, ora: 20.5 }).nott, 0.5, "alle 20:30 mezz'ora di notturno");
  vicino(api.salMese(nov, { fino: oggi, ora: 23 }).ore, 6, "a fine turno tutte");
  vicino(api.salMese(nov, { fino: new Date(2026, 10, 9, 23, 59, 59) }).ore, 0, "il giorno 10 non conta se oggi è il 9");
});

test("data di pagamento: il 10 del mese dopo; sabato/domenica -> 9; festivo -> giorno prima", () => {
  const api = nuovo(), data = (anno, mm) => { const d = api.salPagaData({ year: anno, month: mm }, CFG); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  assert.equal(data(2026, 10), "2026-11-10");   // martedì
  assert.equal(data(2026, 11), "2026-12-10");   // giovedì
  assert.equal(data(2026, 12), "2027-1-9");     // 10 gennaio 2027 è domenica -> sabato 9
  assert.equal(data(2026, 9), "2026-10-9");     // 10 ottobre 2026 è sabato -> venerdì 9
  assert.equal(data(2027, 4), "2027-5-10");     // lunedì
});

test("giorno di pagamento configurabile", () => {
  const api = nuovo(), d = api.salPagaData({ year: 2026, month: 11 }, Object.assign({}, CFG, { giornoPaga: "15" })); // 15 dicembre 2026 è un martedì
  assert.equal(d.getDate(), 15);
});

test("mancato riposo: un riposo R1 lavorato è pagato con la percentuale del mancato riposo, nella busta del mese dopo", () => {
  const api = nuovo(); api.SAL.cfg.percMR1 = "100";
  const nov = mese(2026, 11, { 12: "R1" }), dic = mese(2026, 12, {}); aggiungi(api, nov, dic);
  api.OV["2026-11:11"] = { tipo: "variazione", inizio: "15:00", fine: "21:00" }; // il riposo diventa un turno 15-21
  const b = api.salMese(dic);
  vicino(b.mrH, 6, "ore di mancato riposo"); vicino(b.vMR, 6 * 10 * (1 + 1), "importo = ore × paga oraria × (1 + 100%)");
  vicino(b.ordH, 0, "non è allungo"); vicino(b.strH, 0, "non è straordinario");
  const nv = api.salMese(nov); vicino(nv.vMR, 0, "nella busta di novembre non c'è"); vicino(nv.mNott, 0, "né maggiorazione notturna a parte");
});

test("mancato riposo senza percentuale impostata: usa quella dello straordinario festivo", () => {
  const api = nuovo(), nov = mese(2026, 11, { 12: "R2" }), dic = mese(2026, 12, {}); aggiungi(api, nov, dic);
  api.OV["2026-11:11"] = { tipo: "variazione", inizio: "10:00", fine: "16:00" };
  vicino(api.salMese(dic).vMR, 6 * 10 * 1.3, "fallback straordinario +30%");
});

test("busta importata: le voci nuove (mancato riposo) entrano nelle regole, senza toccare quelle già impostate", () => {
  const api = nuovo(), C = api.SAL.cfg;
  let r = api.salRegoleDaBusta([{ n: "MANCATO RIPOSO R1 60%", base: "6,00", piu: "36,00" }, { n: "Indennita' di turno", piu: "5,00" }, { n: "Rimborso spese vario", piu: "20,00" }], C);
  assert.equal(C.percMR1, "60"); assert.equal(r.agg.length, 1); assert.equal(JSON.stringify(r.ign), JSON.stringify(["Rimborso spese vario"])); // (JSON: gli array vengono da un altro ambiente di esecuzione)
  C.percMR1 = "75"; r = api.salRegoleDaBusta([{ n: "MANCATO RIPOSO R1 60%" }], C); assert.equal(C.percMR1, "75"); assert.equal(r.agg.length, 0); // non sovrascrive
  r = api.salRegoleDaBusta([{ n: "MANC. RIPOSO R2", base: "15,00", piu: "90,00" }], C); // senza %: ricavata da 15 € sull'ora a 10 €/h => +50%
  assert.equal(C.percMR2, "50");
});

test("prossimo accredito: la busta con la data di pagamento più vicina da oggi in poi", () => {
  const api = nuovo(), nov = mese(2026, 11, {}), dic = mese(2026, 12, {}), ott = mese(2026, 10, {});
  const mesi = [ott, nov, dic], su = (anno, mm, gg) => api.salProssimoAccredito(mesi, CFG, new Date(anno, mm - 1, gg));
  let r = su(2026, 11, 24); assert.equal(r.m.month, 11); assert.equal(r.d.getDate(), 10); assert.equal(r.d.getMonth() + 1, 12); assert.equal(r.giorni, 16); // busta di novembre, il 10 dicembre
  r = su(2026, 12, 10); assert.equal(r.m.month, 11); assert.equal(r.giorni, 0); // il giorno stesso conta ancora "oggi"
  r = su(2026, 12, 11); assert.equal(r.m.month, 12); assert.equal(r.d.getDate(), 9); // busta di dicembre: il 10 gennaio 2027 è domenica -> sabato 9
  assert.equal(su(2027, 1, 10), null); // dopo l'ultima busta caricata non c'è altro
});

test("ore di allungo ancora disponibili: contano solo i giorni da oggi in poi, al netto di quelle già segnate", () => {
  const api = nuovo(), t = { 5: "@10:00-16:00", 6: "@10:00-16:00" }, mar = mese(2099, 3, t), apr = mese(2099, 4, {}); aggiungi(api, mar, apr);
  api.SAL.mesi["2099-03"].extra = { 5: { piu: "1", dove: "dopo" } }; // giorno 5: 6h + 1h segnata => restano 1h; giorno 6: 2h
  vicino(api.salMese(apr).dispFut, 3, "mese tutto nel futuro: (8-6-1) + (8-6)");
  const pass = mese(2000, 3, t), pass2 = mese(2000, 4, {}); const api2 = nuovo(); aggiungi(api2, pass, pass2);
  vicino(api2.salMese(pass2).dispFut, 0, "mese passato: nessuna ora disponibile");
  vicino(nuovo().salMese(mese(2099, 5, {}), { noExtra: true }).dispFut, 0, "senza mese prima non c'è nulla da pianificare");
});
