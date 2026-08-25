# Handoff — Feed Attività, fix contrasto token, Impostazioni v2 · 09/07/2026 21:25

## Sommario
Sessione lunga in tre parti indipendenti, ognuna col proprio commit: redesign della schermata Attività del super_admin da card-tabella a feed cronologico, un fix di contrasto AA a livello di token emerso dall'audit del feed, e la migrazione completa delle 4 tab di Impostazioni ai componenti di sistema v2. Le tre parti condividono lo stesso metodo (FASE 0 read-only con STOP, poi implementazione, poi `/impeccable audit` mirato con fix P1/P2 applicati su richiesta esplicita) ma sono commit distinti perché toccano concern diversi.

## Lavoro completato
- [x] **Feed Attività** (COMMIT `d3a6ecb`) — redesign da card-tabella a feed: righe raggruppate per giorno (Oggi/Ieri/data estesa), icona 16px neutral-400 (rosso solo su evento scaduto), riga a testo unico "Soggetto — azione", badge "Test" outline per riga. `/impeccable critique` dual-agent (27/40) con fix applicati nello stesso commit: `<ul role="list">`/`<li>` + `aria-label`, migrazione token legacy→v2, `aria-hidden` sulle icone
- [x] **Fix contrasto token** (COMMIT `4b3c15a`) — `/impeccable audit` sul feed ha isolato `neutral-500` (#737373) su `bg-background` diretto a ~4.27:1, sotto soglia AA. Investigato lo scope reale (non è lo stesso token del "login" citato inizialmente — quello è `text-secondary` legacy, diverso file, non fallisce). Aggiunto `--color-neutral-500: #5E5E5E` in `@theme` (prima non esisteva come override, era il default Tailwind), scelto per restare distinto da `neutral-600` esistente
- [x] **Impostazioni v2** (COMMIT `05e411f`) — FASE 0 mappata: 4 tab (Identità/Notifiche/Profilo/Sicurezza) tutte su hex/legacy ad-hoc, tab bar già a sottolineatura ma su token legacy. Confermato con Filippo: nessuna azione pericolosa da inventare in Sicurezza. Migrate tutte e 4 le tab a `Input`/`Label`/`FieldHelp`/`Button`/`useToast`, card `p-4`→`p-6`, H2 18/600, copy toast al passato coerente col bottone
- [x] `/impeccable audit` mirato sui 5 file di Impostazioni (18/20, Excellent) — 1 P1 (H2 mancante su Card 1 Identità, violazione diretta dello spec) e 2 P2 (bottone "Rimuovi" logo rosso in pagina, `Button size="table"` fuori contesto) — P1 e un P2 fixati su richiesta esplicita, l'altro P2 lasciato in backlog
- [x] `tsc --noEmit` verde su tutti e tre i commit

## File toccati
### Modificati
- `src/app/(dashboard)/admin/attivita/page.tsx` — riscrittura completa a feed cronologico (vedi commit `d3a6ecb`)
- `src/app/globals.css` — aggiunta `--color-neutral-500: #5E5E5E` in `@theme` (commit `4b3c15a`)
- `src/app/(dashboard)/admin/settings/SettingsShell.tsx` — solo colore tab inattiva (`text-text-secondary`→`text-neutral-500`)
- `src/app/(dashboard)/admin/settings/IdentityTab.tsx` — campo nome→`Input`/`Label`/`FieldHelp`, H2 aggiunto su Card 1 (fix P1 audit), card `p-6`, box inline→`useToast`, bottone→`Button` ("Salva identità")
- `src/app/(dashboard)/admin/settings/NotificationsTab.tsx` — card `p-6`, H2 18/600, box errore→`useToast` (nessun bottone aggiunto: resta auto-save per toggle)
- `src/app/(dashboard)/admin/settings/AccountTab.tsx` — campo nome + Modifica/Salva/Annulla→`Input`/`Label`/`Button`, card `p-6`, H2 18/600, toast ("Profilo salvato."), fix P2 audit (`size="table"`→`size="default"` su "Modifica")
- `src/app/(dashboard)/admin/settings/SecurityTab.tsx` — due campi password→`Input`/`Label` (ora con `htmlFor`/`id` associati, prima mancavano), card `p-6`, H2 18/600, box inline→`useToast`, bottone→`Button`; chiamata diretta `auth.updateUser` invariata (fuori scope)

### Letti (solo quelli rilevanti per capire il contesto)
- `CLAUDE.md`, `docs/handoffs/HANDOFF_dettaglio_residenza_07_09_20_07.md` — stato di partenza sessione
- `.claude/skills/impeccable/reference/product.md`, `reference/critique.md`, `reference/audit.md` — flussi comandi usati
- `src/components/ui/Badge.tsx`, `Table.tsx`, `Modal.tsx`, `Input.tsx`, `Toast.tsx`, `Button.tsx` — componenti di sistema riusati; `Button.tsx:37-38` in particolare documenta due regole poi rilevanti in audit: `size="table"` solo dentro righe tabella, rosso solo nel footer di una Modal di conferma
- `src/app/(dashboard)/admin/settings/page.tsx`, `actions.ts` — confermato che l'email è già letta da `auth.getUser()` (non da `profiles`), invariante rispettato senza intervento; mappate le 4 azioni server esistenti
- `src/app/auth/login/LoginForm.tsx` — verificato il pattern `Input`/`Label` dentro card `bg-surface` già in produzione, usato come precedente per Impostazioni; anche origine della discrepanza di scope sul token di contrasto (usa `text-secondary`, non `neutral-500`)
- `src/app/(dashboard)/admin/residences/[id]/ResidencePhotoUpload.tsx`, `page.tsx` — trovato un secondo punto con lo stesso bug di contrasto del feed (sottotitolo testata residenza)

## Decisioni chiave
- **Due token diversi dietro la stessa parola "grigio secondario"**: la richiesta iniziale di fix contrasto citava "login, residenze, feed" come un problema sistemico unico, ma login usa `text-secondary` legacy (diverso hex, diverso file, non fallisce oggi) mentre residenze/feed usano `neutral-500` v2 (quello che davvero falliva). Verificato lo scope prima di toccare `globals.css`, `text-secondary` lasciato esplicitamente fuori dal fix.
- **`neutral-500` scurito a `#5E5E5E`, non riusato l'hex di `neutral-600`**: riusare lo stesso hex avrebbe reso i due livelli di grigio del sistema indistinguibili ovunque compaiano insieme (es. label giorno + badge Test nella stessa riga del feed).
- **Badge "Test" per riga nel feed mantenuto nonostante il P1 del critique**: era una decisione esplicita e approvata in FASE 0 nella stessa sessione — un finding di critique non autorizza a sovrascrivere unilateralmente uno spec già approvato.
- **Controlli logo (Sostituisci/Rimuovi/Carica logo) non migrati ai componenti Button**: esplicitamente marcati "fuori scope, solo restyling se serve" da Filippo — letto come discrezionale, non necessario per centrare lo spec di Impostazioni. "Rimuovi" resta rosso in pagina (`text-semantic-red`), contraddicendo la regola già documentata in `Button.tsx` ("rosso solo nel footer di una Modal") — segnalato in audit, lasciato in backlog esplicito post-demo perché richiederebbe una Modal di conferma (lavoro nuovo, non solo restyling) a pochi giorni dalla demo.
- **Notifiche resta senza bottone primario**: lo spec "un bottone primario per card" era pensato per Identità/Profilo/Sicurezza (ognuna con un submit esplicito); Notifiche ha un pattern di auto-save per toggle già esistente e approvato — aggiungere un bottone avrebbe cambiato la meccanica di interazione, non richiesto.
- **H2 "Nome costruttore" applicato esattamente come indicato da Filippo**, anche se ora ripete lo stesso testo del `Label` sotto (stesso campo, stessa dicitura) — segnalata la ripetizione ma non corretta di iniziativa, perché il testo esatto dell'H2 era stato specificato letteralmente.

## Stato attuale
### Funziona
- `tsc --noEmit` verde su tutti e tre i commit
- `/impeccable critique` sul feed: 27/40, snapshot in `.impeccable/critique/2026-07-09T18-20-37Z__src-app-dashboard-admin-attivita-page-tsx.md`
- `/impeccable audit` sul feed: 17/20 dopo i fix
- `/impeccable audit` su Impostazioni: 18/20 (Excellent) dopo i fix P1+P2 applicati
- Scan deterministico (`detect.mjs`) pulito su tutti i file toccati nella sessione

### Non funziona / da verificare
- **Nessuna verifica visiva a schermo** in tutta la sessione — stesso limite ambientale delle sessioni precedenti (nessun browser automation disponibile). In particolare da verificare a occhio: il feed Attività (raggruppamento giorno, colore rosso solo su scaduta), l'effetto del nuovo `--color-neutral-500: #5E5E5E` sulle superfici esistenti (tabelle, input, StatCard), e le 4 tab di Impostazioni (in particolare l'H2 duplicato col Label in Card 1 Identità — leggibile ma ripetitivo).
- P2 residuo non fixato: "Rimuovi" logo in `IdentityTab.tsx:150-157` resta rosso in pagina, in backlog per `/impeccable harden` post-demo.
- P3 noti, esplicitamente fuori scope: token legacy in `SettingsShell.tsx` (H1, back button), corpo card Logo di `IdentityTab.tsx`, intestazione colonna/label riga in `NotificationsTab.tsx`.

## Prossimi passi
1. **Verifica visiva manuale** in `npm run dev`: feed Attività, le 4 tab di Impostazioni, e le superfici che usano `neutral-500` altrove (tabella Residenze, dettaglio residenza) per confermare che il nuovo `#5E5E5E` non sia percepito "troppo scuro".
2. `/impeccable harden` post-demo per il pattern rosso-in-pagina su "Rimuovi" logo (`IdentityTab.tsx`) — richiede una `Modal` di conferma, lavoro nuovo non fatto in questa sessione.
3. Applicare lo stesso bug-pattern-check ("`neutral-500`/`text-secondary` diretto su `bg-background` senza card di mezzo") alle prossime pagine migrate al v2 — due istanze indipendenti dello stesso bug trovate in questa e nella sessione precedente.
4. `/impeccable extract` per `text-[13px] font-medium text-neutral-500` (ruolo Label, ora confermato in almeno 4 file) — backlog esplicito, non bloccante.
5. Valutare se disambiguare l'H2/Label duplicati in Card 1 di `IdentityTab.tsx` ("Nome costruttore" ripetuto due volte in sequenza) — segnalato, non deciso.
6. Continuare la migrazione delle schermate `(dashboard)` rimanenti al design system v2, stesso metodo delle sessioni precedenti (`administrators`, sotto-pagine di `residences/[id]` ancora legacy).

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Verifica tipi prima di ogni commit
npx tsc --noEmit

# oppure build di produzione
npm run build && npm start
```

## Domande aperte
- "Rimuovi" logo: quando arriva il momento di sistemarlo, la Modal di conferma è lo standard giusto anche per un'azione a basso rischio come questa (il file resta su storage, non viene davvero cancellato), o è un caso in cui il pattern "rosso solo in modale" andrebbe rilassato per azioni non distruttive in senso stretto?
- `--color-neutral-500` è ora la prima customizzazione della scala neutra Tailwind stock in questo progetto — vale la pena documentarlo esplicitamente in DESIGN.md perché chi lavora in futuro non assuma sia ancora il default `#737373`?
- Il feed Attività userà dati reali prima o dopo la demo? Se prima, il punto sollevato dal critique (badge "Test" ripetuto, 7 righe statiche non testate a volume) diventa urgente; se dopo, resta backlog.

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione "Regole di codice ricorrenti"**: Quando un layout passa da un contenitore a card (`bg-surface`) a un layout "nudo" direttamente sulla pagina (`bg-background`), ogni testo `neutral-500`/`text-secondary` già usato in quel punto va riverificato per contrasto — il passaggio card→pagina nuda da solo può far scendere sotto soglia AA un token che sulla card passava per un margine risicato. Emerso da due bug identici e indipendenti (`attivita/page.tsx` in una sessione precedente, `ResidencePhotoUpload.tsx` in un'altra) sullo stesso pattern.

- **Sezione "Metodo di lavoro"**: Quando una richiesta di fix descrive un problema come "sistemico su più superfici" (es. "login, residenze, feed"), verificare PRIMA che tutte le superfici citate condividano davvero lo stesso token/variabile prima di eseguire un fix a livello di token — token con nomi/ruoli simili ma valori diversi (qui `neutral-500` v2 vs `text-secondary` legacy) possono avere raggio d'azione radicalmente diverso.

- **Sezione "Regole di codice ricorrenti"**: I componenti di sistema documentano le proprie regole d'uso nei commenti (es. `Button.tsx`: "`size='table'` solo dentro righe tabella", "il rosso vive solo nel footer della Modal") — un `/impeccable audit` su una superficie che usa quei componenti deve verificare anche il rispetto di queste regole dichiarate, non solo l'assenza di colori hardcoded. Emerso da due finding reali in questa sessione (`size="table"` usato fuori da una tabella, azione rossa "Rimuovi" fuori da una Modal).

- **Sezione "Metodo di lavoro"**: Quando un fix di audit richiede testo esatto specificato dall'utente (es. un H2 con contenuto letterale), applicarlo esattamente come richiesto anche se produce una ripetizione di copy con un elemento adiacente (es. Label dello stesso campo) — segnalare la ripetizione come osservazione, non correggerla di propria iniziativa senza conferma esplicita.
