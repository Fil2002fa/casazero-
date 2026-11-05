# Handoff — Blocco fix rapidi e cron in produzione (B37, B39) · 05/11/2026 12:05

Milestone attiva: M5. Branch `main`, allineato a `origin/main` (HEAD `f932175`), working tree pulito, CI verde su ogni commit. Nessuna migrazione applicata in questa sessione (`docs/migrations.log` invariato).

## Sommario
Chiuso il blocco di 6 fix rapidi del 5/11 (B32, B28, R10e, R8e, B25, R1b) con un commit per voce. Poi la diagnosi ha mostrato che **il cron giornaliero in produzione non aveva mai girato**: il middleware rimandava al login (307) ogni richiesta senza cookie di sessione, e la chiamata di Vercel non ne ha. Corretto il percorso pubblico (B37), lanciata a mano da Filippo la prima run sul DB unico (68 voci in ritardo), e poi aggiunto il link diretto alla voce nelle email, scelto per ruolo del destinatario (B39). La prima run ha mostrato un'esecuzione doppia in parallelo (B40, aperto).

## Lavoro completato
- [x] **B32** `8922887` — rimosso il parametro `req` inutilizzato da `GET` in `api/reconcile-documents`. Ultimo warning lint del progetto: `npm run lint` ora a zero.
- [x] **B28** `8cebc79` — campo Email del login con `name="email"` e `autoComplete="email"`.
- [x] **R10e** `fa9ebdb` — `name={field.key}` sui controlli del pannello "Correggi dati".
- [x] **R8e** `7d9e662` — "(+ X mesi)" della finestra "Includi nel piano" passa da `pluralize`.
- [x] **B25** `26ea4de` — il cron rifiuta con 500 e log se `CRON_SECRET` manca o è vuota (prima `Bearer undefined` passava).
- [x] **R1b** `8b6ae11` — `error` non più scartato: nomi di chi ha escluso le voci, anagrafica fornitori/installazioni in `documenti/page.tsx`, e `getAuthorizedSupplierLinker`. Se l'anagrafica non si legge la proposta fornitore si sospende con banner "Riprova" invece di proporre "nessun match" (rischio doppione).
- [x] **B37** `36451cc` — `pathname.startsWith('/api/cron/')` tra i percorsi pubblici del middleware. Provato in produzione dopo il deploy: `curl` senza header e con `Bearer sbagliato` danno 401 (prima 307).
- [x] **Prima run del cron** — lanciata da Filippo dal pulsante Run di Vercel (Cron Jobs) alle 10:42 UTC del 5/11. Verifica e confronto con la simulazione: sezione "Stato attuale".
- [x] **B39** `f932175` — link diretto alla voce nelle email del cron e del sollecito manuale, per ruolo del destinatario. Prova **sostitutiva** (vedi Decisioni e Stato).
- [ ] **R10d** — rimandata fuori dal blocco (vedi Prossimi passi).

## File toccati
### Creati
- `scripts/verify-maintenance-links.mjs` — 15 casi su `maintenanceItemUrl` (client, admin, super_admin, ruolo mancante/sconosciuto, id con caratteri riservati) e sui 3 template del cron (l'href è esattamente l'URL ricevuto). Lancio: `npm run verify:link`.
- `docs/handoffs/HANDOFF_blocco_fix_cron_11_05_12_05.md` — questo file.

### Modificati
- `src/app/api/reconcile-documents/route.ts` — B32.
- `src/app/auth/login/LoginForm.tsx` — B28.
- `src/app/(dashboard)/admin/residences/[id]/documenti/CorrectDataPanel.tsx` — R10e.
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — R8e (riga 770).
- `src/app/api/cron/daily/route.ts` — B25 (controllo segreto); B39: `EmailBuilder`, `notifyUnitMembers`/`notifyResidenceAdmins` costruiscono l'email per destinatario con il ruolo letto da `getRolesForProfiles`, ruolo di ripiego `client` per i membri di unità e `admin` per gli assegnati.
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx`, `DocumentiClient.tsx`, `actions.ts` — R1b. Nuova prop obbligatoria `supplierDataUnavailable`; `getAuthorizedSupplierLinker` usa `.maybeSingle()` e ritorna "Errore tecnico, riprova." sul guasto.
- `src/middleware.ts` — B37, una riga.
- `src/lib/notifications.ts` — B39: nuovo `maintenanceItemUrl(appUrl, role, itemId)`; `emailMaintenanceDue`, `emailPromemoriaDue`, `emailMaintenanceReminder` ricevono `actionUrl` invece di `appUrl`.
- `src/lib/notification-recipients.ts` — B39: nuovo `getRolesForProfiles` (unico punto di lettura dei ruoli, errore loggato e mappa vuota).
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/actions.ts` — B39: `sollecitaItem` costruisce l'email per destinatario con `maintenanceItemUrl`; prima il link dipendeva dalla modalità della voce.
- `package.json` — script `verify:link`.

### Letti (rilevanti per il contesto)
- `src/middleware.ts` — matcher (`:96-100`, esclude solo statici e immagini) e `isPublicPath` (`:58-62`).
- `src/app/(app)/layout.tsx:12` — `if (profile && profile.role !== 'client') redirect('/admin')`: causa per cui il link residente apre la dashboard con una sessione admin, perdendo il percorso.
- `vercel.json` — un solo cron, `/api/cron/daily`, `0 7 * * *` (UTC).
- `src/lib/notifications.ts:22-59` — `sendEmail`: Resend, `from` da `RESEND_FROM` oppure sandbox `onboarding@resend.dev`.
- `src/lib/maintenance-due.ts:75` — `nextDueFrom`: un solo passo per run.
- `src/app/(dashboard)/admin/manutenzioni/[id]/page.tsx:48` e `src/app/(app)/manutenzioni/[id]/page.tsx` — le due route di dettaglio voce.
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/page.tsx:13-26` — accetta solo `?filtro=` e `?modalita=`, nessun parametro per aprire una voce.

## Decisioni chiave
- **B25: 500 e non 401 se `CRON_SECRET` manca.** Una configurazione mancante è un guasto tecnico, non un rifiuto di accesso. Il controllo precede il confronto.
- **R1b: gate esistente, non uno nuovo.** Con l'anagrafica illeggibile `canLinkSuppliers` diventa false (stesso gate dell'admin, `supplierContext` null) e un banner con "Riprova" lo dice all'utente. Scartato: far girare la proposta su liste vuote.
- **R1b: `.maybeSingle()` al posto di `.single()`** in `getAuthorizedSupplierLinker`, così "profilo assente" (dominio) e guasto tecnico non collassano nello stesso messaggio. La stringa "Errore tecnico, riprova." è duplicata rispetto a `OVERRIDE_TECH_ERROR` (`actions.ts:828`): scelta consapevole di Filippo, niente costante condivisa.
- **B37: solo `/api/cron/`, con la barra finale.** Scartato rendere pubblico tutto `/api`: le altre 7 route si autenticano con la sessione e nessuna è chiamata da servizi esterni (verificato).
- **Niente `dryRun` per il cron.** Filippo ha deciso di lasciare girare la prima run dopo una simulazione read-only su tutto il DB (68 voci, 6 residenze, nessuna reale, email solo ai suoi account).
- **B39: link per ruolo del destinatario, non per modalità della voce.** Un membro di unità può essere un admin (account di test, es. `filippoloro02` a Cavaccio). Ruolo mancante → elenco `/manutenzioni`, il link di prima. Ripiego sul ruolo implicito dalla fonte (membro di unità = client, assegnato = admin) se la lettura dei ruoli fallisce. Un admin non assegnato alla residenza atterra su "non trovato" per la RLS: accettato da Filippo.
- **B39: 4 file di codice invece dei 3 approvati.** `getRolesForProfiles` sta in `notification-recipients.ts` per non duplicare la query dei ruoli in due superfici (regola dei helper condivisi). Segnalato come scope creep a Filippo nel messaggio e qui.
- **B39: prova sostitutiva accettata da Filippo.** Il sollecito manuale su una residenza di test non era eseguibile (vedi Stato). Alternativa scelta tra: membro di prova temporaneo (scritture in `unit_members`, `notifications` e registro immutabile), prova sostitutiva, non committare.
- **R10d fuori dal blocco.** Togliere `set_at` dal payload client non basta: sul conflitto l'upsert non lo aggiorna. Serve una migrazione 050 con trigger `BEFORE INSERT OR UPDATE` che pone `NEW.set_at := now()`, poi si toglie il valore dal payload in `actions.ts` (`upsertDocumentFieldOverride`, ~`:887`). Non è nell'elenco delle migrazioni additive di CLAUDE.md: mostrare il SQL e chiedere conferma.

## Stato attuale
### Funziona
- Produzione: `https://casazero.vercel.app/api/cron/daily` risponde 401 senza header e con segreto sbagliato; `CRON_SECRET` è impostata (Production e Preview, verificato da Filippo).
- `npm run verify` pulito su ogni commit; `npm run verify:link` 15 casi ok; CI verde (ultimo run `42015862077`, commit `f932175`).
- **Prima run del cron, confronto con la simulazione** (stato finale, ultima modifica 10:42:54 UTC):
  - Voci toccate: 66 su 68, come previsto (58 promemoria + 8 `scaduta`), nelle stesse residenze: Residenza Cavaccio 33 promemoria + 3 residente + 1 amministratore; Residenza Teolo 10; test after redesign 5; Furlan "residenza teolo" 4 residente; TEST wizard b 10. "Test manutenzione" intatta (2 voci già `scaduta`, nessun destinatario).
  - Promemoria ancora nel passato: 31 (tutti Cavaccio, frequenza 1 mese), come previsto.
  - Destinatari: solo `lorofilippo2002` e `filippoloro02`. Nessuna persona esterna. Nessuna residenza reale toccata. Il cron non scrive su `completions` (letto nel codice, non riverificato con una query).
- Email arrivata a `filippoloro02` con l'oggetto corretto (dichiarato da Filippo).
- Gli URL generati da B39 per una voce reale Furlan (`7db06d03-b2ab-4b79-a794-2d75d3f7095c`, "VMC: sostituzione filtri", residenza teolo): `client` → `/manutenzioni/<id>`, `admin` e `super_admin` → `/admin/manutenzioni/<id>`, ruolo nullo → `/manutenzioni`. Aperto come `pippoloro02`: l'URL admin mostra la voce; l'URL client rimanda a `/admin` (layout).

### Non funziona / da verificare
- **Esecuzione doppia (B40, aperto).** La prima run ha lasciato 10 righe in `notifications` invece di 5 (8 `n1_due`, 2 `n2_due`, tutte `pending`), con duplicati: stessa voce e stesso destinatario a 200 ms (10:42:35.036 e .236), due `n2_due` sulla stessa voce (10:42:40 e 10:42:44), alcuni promemoria avanzati di due passi (es. "Controllo visivo prese e comandi" 12/8 → 12/10; "Controllo inverter" 24/8 → 24/9 o 24/10). Il ritmo delle richieste API raddoppia verso le 10:42:30 (da 15-20 a 57-63 ogni 5 secondi). Ipotesi: due invocazioni sovrapposte. Non provato: serve il log di funzione di Vercel. `checkDedup` con intervallo 0 risponde sempre sì (`route.ts`, `if (intervalDays === 0) return true`). Il cron non ha lock né idempotenza.
- **B39, collegamento runtime non provato.** `sollecitaItem` e il cron usano il nuovo helper, ma sono verificati solo da `tsc`. Il sollecito manuale non era eseguibile: `pippoloro02` è super_admin di Furlan e `sollecitaItem` rifiuta item di altri builder (`actions.ts:109-110`); Cavaccio è di "Archivio pre-demo"; nessuna residenza Furlan ha una voce in ritardo con un destinatario, a parte Portello, Bassanello e Santa Giustina (escluse da Filippo). Il messaggio di commit lo dichiara.
- **Prima verifica reale di B39: la run automatica di domani 06/11 alle 07:00 UTC.** Il cron è ora raggiungibile e girerà da solo. Stima con i dati attuali: circa 5 email, a `lorofilippo2002` (prese, inverter, primo sollecito della "Pulizia condotti") e a `filippoloro02` (prese, inverter), con i link nuovi. `lorofilippo2002` (client) dovrebbe avere `/manutenzioni/<id>`; `filippoloro02` (admin, non assegnato a Cavaccio) `/admin/manutenzioni/<id>` e "non trovato". Confermare dopo che il deploy di `f932175` su Vercel sia in stato Ready.
- **Recapito email.** Lo stato delle notifiche del cron resta `pending` per sempre (il cron non aggiorna `status` né `sent_at`). Non si sa se `lorofilippo2002` ha ricevuto qualcosa: 6 delle 10 righe sono sue. Controllare la dashboard Resend per eventuali 403 (sandbox). Nei 6 solleciti manuali di settembre l'unico destinatario è `filippoloro02`, coerente con la sandbox. `RESEND_FROM` su Vercel non verificata.
- **Le tre anomalie del cron (in backlog, non corrette):**
  1. il sollecito parte il giorno dopo l'avviso: l'avviso di scadenza (tipo `n2_due`) mette la voce `scaduta`, e alla run successiva `n2_reminder` non trova niente nei 14 giorni, quindi scatta subito;
  2. i promemoria avanzano di un solo passo per run, quelli da 1 mese ripetono la notifica ogni giorno finché la scadenza non arriva al futuro (fino a 4 giorni);
  3. le notifiche del cron restano sempre `pending`.
- **Dati demo rimasti in giro:** 8 voci `scaduta` e 58 scadenze avanzate sul DB unico; le 2 voci `scaduta` di "Test manutenzione" non hanno destinatari; le 4 voci di Furlan "residenza teolo" sono su un'unità di test ("TEST perimetro 2”") senza membri.
- La nota dell'handoff precedente su `d6d3eb88` con scadenza 2024-03-01 è superata: oggi `d6d3eb88` è la VMC del 9/10/2026, la voce del 2024 è `f0bf3af5` (Cavaccio, "Pulizia condotti", consegna unità 1/3/2023 + 12 mesi, voce creata il 25/6/2026).

## Prossimi passi
1. **Dopo le 07:00 UTC del 06/11**: controllare che la run di Vercel sia unica (log di funzione di Vercel) e che `notifications` abbia solo righe senza duplicati. Leggere gli URL reali nelle email arrivate a `filippoloro02` e `lorofilippo2002` e aprirli con la sessione giusta. Se la run risulta doppia, partire da B40.
2. **B40, idempotenza del cron**: guardia contro l'esecuzione doppia (lock o dedup per voce e giorno) e dedup anche per `n1_due`. Va nel blocco "cron robusto".
3. **Blocco "cron robusto"**: rispettare `profiles.notification_prefs` (il cron non lo legge, anche se `ProfiloClient.tsx` offre i toggle `email_reminders` e `email_n3_status`); correggere le tre anomalie sopra; aggiornare `status` e `sent_at` delle notifiche inviate.
4. **B5, esclusione del builder di archivio** ("Archivio pre-demo", 15 residenze) dalle notifiche del cron: opzioni valutate, flag su `builders`/`residences` filtrato nella SELECT di `route.ts` (migrazione additiva, la più solida), variabile d'ambiente con lista di builder esclusi, oppure `notification_prefs`.
5. **B15**: il fallback `NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'` è in 6 file e 7 occorrenze (`cron/daily/route.ts:15`, `residences/[id]/manutenzioni/actions.ts:17`, `admin/manutenzioni/actions.ts:8`, `profilo/page.tsx`, `units/page.tsx`, `residences/[id]/page.tsx`); un'email con link a localhost parte in silenzio.
6. **Stessa classe di bug di R1b, non toccati:** `documenti/page.tsx:35` (`residence` senza `error`, su guasto tecnico porta a `notFound()`), `documenti/actions.ts:59` (`getAuthorizedDocumentUser`) e `:85` (`getAuthorizedChecklistManager`), `:253` (`storage.list` senza `error`).
7. **R10d**: migrazione 050 con trigger su `document_field_overrides.set_at`, poi togliere il valore dal payload.
8. Valutare se applicare `maintenanceItemUrl` anche a `emailN3StatusChanged` (`notifications.ts`, usata da `admin/manutenzioni/actions.ts:166`): oggi il suo link resta `${appUrl}/manutenzioni`, non è del cron e i destinatari non sono stati verificati.

## Comandi da rilanciare
```bash
# Gate pre-commit
npm run verify

# Prova del link alla voce (15 casi)
npm run verify:link

# Server di sviluppo (porta 3000, ora fermo); il cron NON gira in locale
npm run dev

# Controllo non distruttivo della route cron in produzione: atteso 401 (non 307, non 200)
curl -i https://casazero.vercel.app/api/cron/daily
curl -i -H "Authorization: Bearer sbagliato" https://casazero.vercel.app/api/cron/daily

# CI dell'ultimo push
gh run list --limit 3
```

## Domande aperte
- Quante volte è partito il job alle 10:42 UTC? Se Filippo ha premuto Run due volte o se Vercel ha invocato la funzione due volte lo dice solo il log di funzione di Vercel.
- `RESEND_FROM` è impostata su Vercel con un dominio verificato? `lorofilippo2002` riceve davvero le email?
- Come escludere "Archivio pre-demo" dal cron (B5): colonna nuova, variabile d'ambiente o `notification_prefs`?
- La prova dal vivo del sollecito manuale con `maintenanceItemUrl` va rifatta quando c'è una sessione adatta (client, oppure admin/super_admin di Archivio pre-demo, o un destinatario su una residenza Furlan di test). Quale?
- Il link nelle email di `emailN3StatusChanged` va portato sul nuovo helper?

## Leggi emerse (candidate per CLAUDE.md)

- **Regole di codice**: "**Route chiamate da servizi esterni senza sessione** (cron di Vercel, webhook) vanno elencate in `isPublicPath` di `src/middleware.ts` e protette da un segreto proprio nella route. Classe di bug: una route protetta solo da segreto ma non pubblica nel middleware non viene mai raggiunta dal chiamante esterno, riceve 307 verso `/auth/login` e non dà nessun errore (il cron è rimasto fermo senza che nessuno se ne accorgesse). Prevenzione: dopo ogni nuova route esterna, `curl -i` senza header in produzione deve rispondere 401, mai 307 né 200."
- **Regole di codice**: "**Segreti nei confronti di header.** Mai `Bearer ${process.env.X}` senza prima verificare che `X` sia valorizzata: se manca, il template produce `Bearer undefined` e quella stringa passa. Segreto assente o vuoto = 500 con log, non 401."
- **Regole di codice**: "**Link nelle email di manutenzione**: un'unica funzione, `maintenanceItemUrl` in `src/lib/notifications.ts`, sceglie il percorso dal RUOLO del destinatario (client → `/manutenzioni/<id>`, admin e super_admin → `/admin/manutenzioni/<id>`, ruolo mancante → `/manutenzioni`), mai dalla modalità della voce e mai con percorsi scritti a mano nei template. Motivo: `(app)/layout.tsx` rimanda ogni ruolo diverso da client a `/admin` perdendo il percorso, senza errore."
- **Metodo di lavoro**: "**Job con effetti esterni (email, scritture) mai lasciati girare per la prima volta su dati arretrati senza simulazione read-only e senza idempotenza.** Prima della prima run: SELECT che applica la logica del job ai dati di oggi, divisa per residenza e per destinatario. Un job di produzione deve reggere due invocazioni ravvicinate (lock o dedup per voce e giorno): la prima run di `/api/cron/daily` ha duplicato notifiche e fatto avanzare alcuni promemoria di due passi. Le query di verifica lanciate mentre il job gira mostrano uno stato parziale: attendere l'ultima modifica più un margine, poi rifare."
- **Metodo di lavoro**: "**Verificare in FASE 0 che i dati permettano la prova richiesta** (destinatari, builder e sessione disponibili). Se la prova non è eseguibile, dichiararlo nel messaggio di commit con ciò che resta coperto solo da `tsc`, invece di presentare una prova sostitutiva come equivalente."
- **Stack (Ambiente di sviluppo)**: "In PowerShell `$env:X = ''` **cancella** la variabile invece di svuotarla, e Next rilegge il valore da `.env.local`. Per avviare un processo con una variabile davvero vuota usare Node: `spawn(process.execPath, ['node_modules/next/dist/bin/next','dev'], { env: { ...process.env, X: '' } })`. Non modificare `.env.local` per provare un ramo 'variabile assente'."
