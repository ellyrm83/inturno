# Avvisi ad app chiusa: attivazione (una volta sola, circa 10 minuti)

Serve un servizio gratuito di Cloudflare. Non chiede carta di pagamento.

## 1. Crea il servizio
1. Vai su https://dash.cloudflare.com e crea un account gratuito.
2. Menu a sinistra: **Workers e Pages** → **Crea** → **Crea Worker**. Chiamalo `inturno-push` → **Distribuisci**.
3. Tocca **Modifica codice**, cancella tutto, incolla il contenuto del file `strumenti/push-worker.js` e tocca **Distribuisci**.

## 2. Crea l'archivio
1. Menu a sinistra: **Archiviazione e database** → **KV** → **Crea uno spazio dei nomi**. Chiamalo `inturno-subs`.
2. Torna al Worker → **Impostazioni** → **Associazioni** → **Aggiungi** → **Spazio dei nomi KV**.
   Nome variabile: `SUBS`. Scegli `inturno-subs`.

## 3. Inserisci le chiavi
Worker → **Impostazioni** → **Variabili e segreti** → **Aggiungi**:
- `VAPID_PUBLIC` (tipo Testo): la chiave pubblica, la stessa che c'è in `config.js`
- `VAPID_JWK` (tipo **Segreto**): la chiave privata che ti ho dato in chat

## 4. Dammi l'indirizzo
Nella pagina del Worker trovi l'indirizzo, tipo `https://inturno-push.TUONOME.workers.dev`.
Scrivimelo in chat: lo metto io in `config.js`.

Dopo, apri InTurno dal telefono, tocca "Attiva notifiche" e consenti gli avvisi.
Su iPhone l'app deve essere aperta dalla schermata Home.

## Cosa passa dal servizio
- Statino condiviso: un avviso breve cifrato, tipo "Elisa ha condiviso lo statino · Terminal 1". Lo legge solo il telefono che lo riceve.
- Altri avvisi: solo "c'è una novità".
- Mai turni, importi o il contenuto dei voli.
Ogni persona può mandare al massimo 60 avvisi all'ora.
