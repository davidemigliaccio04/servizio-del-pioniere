# Il mio servizio — Web App

Web app responsive per iPhone, iPad e PC per registrare ore di servizio/lavoro, obiettivi mensili e annuali, studi biblici e sincronizzare i dati con Supabase.

## Struttura del progetto

```
servizio-app/
├── index.html            interfaccia (HTML)
├── styles.css             stile visivo, organizzato per sezione
├── config.js               chiavi Supabase (da compilare)
├── supabase.sql            schema del database
└── js/
    ├── constants.js        costanti condivise (mesi, regole, default)
    ├── utils.js              funzioni pure (date, formattazione, validazione)
    ├── state.js               stato globale dell'app in memoria
    ├── selectors.js           calcoli derivati dallo stato (totali, anno di servizio...)
    ├── storage.js             localStorage + Supabase (dati, autenticazione, sync)
    ├── render.js               disegna l'interfaccia a partire dallo stato
    ├── modal.js                logica dei modali (inserimento ore, export CSV)
    ├── events.js                collega i pulsanti alle azioni
    └── main.js                  punto di ingresso, avvia tutto
```

Il codice è diviso per responsabilità invece di stare tutto in un unico file, con un commento sopra ogni funzione che spiega cosa fa e perché. `main.js` è l'unico caricato da `index.html` (`<script type="module">`): importa tutti gli altri.

⚠️ **Con i moduli ES, l'app va servita via http/https** (Vercel, `npx serve`, ecc.) e non funziona aprendo `index.html` con doppio click (`file://`). Per testare in locale: `npx serve servizio-app` oppure `python3 -m http.server` nella cartella, poi apri l'indirizzo mostrato nel browser.

## Ritocchi su richiesta esplicita (v4)

- Rimossa la didascalia sotto la barra di progresso mensile (già ridondante: obiettivo e valide sono dentro la barra).
- Calendario: confermate celle fuori mese sbiadite (comportamento invariato).
- Il pulsante "+" apre sempre la data odierna reale; cliccare un giorno del calendario apre sempre quel giorno esatto.
- Popup "Aggiungi ore": nuovo header in stile Annulla / titolo / azione, con il link in alto e il pulsante in fondo che fanno esattamente la stessa cosa e mostrano lo stesso testo ("Aggiungi ore" o, in modifica, "Salva modifica").
- Minuti del wheel picker a step di 5 (prima 15).
- Riepilogo annuale: elenco dei mesi in righe cliccabili, ognuna apre direttamente quel mese nella schermata Mese.
- Confermate invariate: doppia freccia mese precedente/successivo, schermata Impostazioni.

## Allineamento alla specifica funzionale e al mockup grafico (v3)

Rispetto alla versione precedente, l'app è stata rivista per seguire fedelmente `specifica_web_app_servizio_ore.txt` e il mockup fornito:

- **Riepilogo mese**: rimosso il badge "Obiettivo: X ore" mostrato separatamente (la specifica lo vieta esplicitamente, punto 8, perché già rappresentato dentro la barra di progresso); al suo posto la didascalia "Ore valide" sotto la barra, come nel mockup. Servizio e Lavoro ora affiancati su due colonne; Studi biblici su una riga propria a piena larghezza con i controlli −/+.
- **Barra di progresso mensile**: il testo "X / Y ore" è ora ancorato dentro la parte colorata della barra (a sinistra), non più centrato sull'intera larghezza — coerente con il mockup.
- **Barra di navigazione inferiore (mobile)**: aggiunta, con le 5 azioni principali (Mese, Calendario, Aggiungi ore, Riepilogo, Impostazioni), come nel mockup "RIEPILOGO MESE — MOBILE".
- **Sidebar desktop**: aggiunta la voce "Esci" in fondo (visibile solo da autenticati), come nel mockup "VISIONE MESE — DESKTOP".
- **Impostazioni avanzate** (punto 18 della specifica): aggiunti i 3 colori mancanti — Colore icone, Colore testi, Colore sfondo — oltre a quelli già presenti (servizio, lavoro, barra, pulsanti). Le nuove colonne sono state aggiunte anche a `supabase.sql`, in modo retrocompatibile.
- **Giornata di lavoro standard** (punto 12): selezionando "Lavoro" su un nuovo inserimento, il time-picker propone 8:00 ore, restando comunque modificabile liberamente.
- **Regola abbuono lavoro**: aggiunto un blocco informativo pieghevole sotto il calendario che ne riassume il funzionamento, come nel mockup.
- **Popup "Aggiungi ore"**: pulsante "Salva" a piena larghezza con "Annulla" come link testuale sotto, invece dei due pulsanti affiancati, più vicino al mockup.

## Cosa è stato corretto in questa versione

1. **Data di avvio fissa** — l'app si apriva sempre su agosto 2026 invece che sul mese corrente. Ora parte dal mese reale.
2. **Obiettivi mensili salvati con l'anno sbagliato** — sincronizzando con Supabase, gli obiettivi di gennaio-agosto venivano salvati con l'anno di servizio errato e "saltavano" di un anno al ricaricamento. Ora la conversione è centralizzata in una funzione dedicata (`serviceYearForKey`).
3. **Il logout non puliva i dati a schermo** — su un dispositivo condiviso, dopo il logout restavano visibili le ore dell'account precedente. Ora lo stato si azzera davvero.
4. **Il selettore "Colore barre/progressi" non aveva effetto** — la variabile CSS non era collegata a nessuno stile. Ora la barra di progresso e la percentuale usano davvero quel colore.
5. **Dati locali persi al primo login** — chi usava l'app offline prima di configurare Supabase perdeva tutto al primo accesso. Ora, se il cloud è vuoto, i dati locali vengono caricati automaticamente.
6. **Nessuna validazione reale sui numeri delle impostazioni** — ora i valori vengono sempre riportati in un intervallo sensato anche se digitati a mano.
7. **Selezionando 24h+ nel time-picker si superava il limite consentito (24h)**, causando un errore poco chiaro dal database. Ora è bloccato con un messaggio comprensibile prima dell'invio.
8. **Salvataggio dei 12 obiettivi mensili uno alla volta** — ora è un'unica scrittura in batch, più veloce e senza stati intermedi incoerenti in caso di errore.
9. **Nessun fallback se si perde la connessione da autenticati** — un inserimento fatto offline andava perso. Ora viene salvato in locale e sincronizzato automaticamente al ritorno della connessione.
10. **Nomi personalizzati (servizio/lavoro) inseriti senza controlli in punti del codice che usano innerHTML** — resi sicuri.

## Nuove funzionalità

- Il time-picker ricorda l'ultima durata inserita invece di aprirsi sempre su 1h30.
- Aprendo "Aggiungi ore" sul mese corrente, la data proposta è oggi (non più sempre il giorno 1).
- Pulsante "Annulla" esplicito nel modale di inserimento.
- Link "Password dimenticata?" nelle impostazioni.

## 1. Creare il database gratuito

1. Crea un progetto su Supabase.
2. Apri SQL Editor.
3. Incolla tutto `supabase.sql` e premi Run.
4. Vai in Project Settings -> API.
5. Copia Project URL e anon/public key dentro `config.js`.

Supabase Free include PostgreSQL, Auth e realtime entro le quote del piano gratuito.

## 2. Pubblicare gratis

La cartella può essere pubblicata su un hosting statico come Vercel.

### Metodo consigliato

1. Crea un repository GitHub.
2. Carica tutti i file della cartella (mantenendo la sottocartella `js/`).
3. Importa il repository in Vercel.
4. Deploy.
5. Apri il link su iPhone/iPad/PC.
6. Crea un account nella sezione Impostazioni e usa lo stesso account su tutti i dispositivi.

## Sicurezza

La chiave `anon/public` di Supabase può stare nel frontend. La sicurezza dei dati è affidata alle policy Row Level Security incluse in `supabase.sql`: ogni utente può leggere/modificare soltanto i propri dati.

Non inserire mai nel frontend la `service_role key` di Supabase.

## Nota sul piano gratuito

Il piano gratuito di Supabase è sufficiente per questo progetto personale, ma i progetti Free possono essere messi in pausa dopo un periodo di inattività. Vercel Hobby è gratuito per progetti personali/non commerciali.

## Possibili miglioramenti futuri (non inclusi in questa versione)

- Esportazione anche in PDF, oltre al CSV già presente.
- Coda di sincronizzazione più completa per le modifiche/eliminazioni fatte offline (oggi solo i nuovi inserimenti vengono messi in coda).
- Test automatici per le funzioni di calcolo in `selectors.js`.
