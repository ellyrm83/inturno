# InTurno – come metterla online gratis

Tutto gratuito: Firebase (piano Spark, senza carta di credito) per account e dati, GitHub Pages per l'indirizzo web (https://ellyrm83.github.io/inturno/).
Serve un computer solo per questi passaggi iniziali (circa 15 minuti).

## 1. Crea il progetto Firebase
1. Vai su https://console.firebase.google.com ed entra con il tuo account Google.
2. **Aggiungi progetto** → nome "inturno" → puoi disattivare Google Analytics → **Crea**.
3. Il piano resta **Spark (gratuito)**: non attivare altri piani.

## 2. Attiva l'accesso
1. Menu **Build → Authentication → Inizia**.
2. In **Metodo di accesso** attiva **Email/password** (e, se vuoi, **Google**).

## 3. Crea il database
1. Menu **Build → Firestore Database → Crea database**.
2. Posizione: **europe-west** (Europa) → modalità **produzione** → Crea.
3. Scheda **Regole**: cancella tutto, incolla il contenuto del file `firestore.rules` e premi **Pubblica**.

## 4. Prendi la configurazione
1. ⚙️ **Impostazioni progetto** → in basso **Le tue app** → icona **</>** (Web).
2. Nome "InTurno" → **Registra app**.
3. Copia i valori di `firebaseConfig` (apiKey, authDomain, projectId, …) nel file `config.js`
   **oppure mandali a Claude in chat**: ti restituisce la cartella già pronta.

## 5. Indirizzo web
L'app è già online su GitHub Pages: https://ellyrm83.github.io/inturno/
Su Firebase → **Authentication → Impostazioni → Domini autorizzati → Aggiungi dominio** e scrivi `ellyrm83.github.io`.

## 6. Primo accesso (importante)
- **Entra tu per prima**: la prima persona che crea l'account diventa la proprietaria e approva le altre.
- Poi manda il link alle colleghe (anche dal tasto WhatsApp dell'app). Ognuna crea il suo account, scrive il nome come compare nei turni e tu la approvi.
- Oppure crea un **codice invito monouso** (riquadro 🎟️ Codici invito, visibile solo a te): chi lo usa entra subito, e il codice non vale più.
- Nei gruppi ognuno sceglie **gruppo per gruppo** se condividere turni e statini; i dati condivisi li leggono solo i membri di quel gruppo.
- Sull'iPhone: apri il link in Safari → Condividi → **Aggiungi alla schermata Home**.

## Cosa è incluso
Lettura PDF delle griglie, turni fissi e ciclici, riposi previsti a rotazione, modifiche giornaliere,
notturno, buoni pasto, ferie e rotazione ferie, storico, agenda, gruppi (colleghi, famiglia, amici)
sincronizzati, uscite, viaggi e gite, statini (inserimento manuale), WhatsApp, esportazione su
calendario (.ics per iPhone, .csv per Google). La lettura automatica delle foto non c'è: richiederebbe
un servizio a pagamento.

## Limiti del piano gratuito
1 GB di dati, 50.000 letture e 20.000 scritture al giorno: per un gruppo di colleghe non si raggiungono.
