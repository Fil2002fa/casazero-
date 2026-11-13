# HANDOFF — Documenti residente: Blocco 1 + migrazione H (13/11/2026)

## Stato

- Branch locale `main` a `608ee24`. `origin/main` NON toccato (resta `d49173a`).
- Pushato solo `main:preview/documenti-residente` (stesso commit `608ee24`, con
  `--force-with-lease`). Deploy Vercel Preview: completato, build verde.
  URL: https://casazero-444nx67li-filippos-projects-599a4703.vercel.app
  (dettaglio: https://vercel.com/filippos-projects-599a4703/casazero/7xmRyLGeah6Kctm7hRfxjeGqZQzT)
  Il preview precedente (`f6c9567`, casazero-hc8c4csis-…) non contiene il merge Codex.
- `main` è avanti di 19 commit su `origin/main`: 5 del redesign manutenzioni v5
  (`055938a`…`ca982d7`), 7 del Blocco 1 + 058, 5 di Codex (`ef9ff97`, `f4a0c85`,
  `f8216e9`, `e7f5aab`, `ea3c761`: guide, area personale, fascicolo) col merge
  `b334644` fatto da Filippo, e `608ee24`. Pubblicare `main` su `origin/main` porta in
  produzione tutto: decisione ancora da prendere.
- Il merge Codex non ha toccato file del Blocco 1 e non contiene migrazioni. Aveva però
  messo due barre su `/fascicolo` e `/profilo` (MaintenanceHeader nella pagina +
  ResidentTopBar del layout): corretto in `608ee24`.
- Gate su `608ee24`: tsc, `npm run verify`, `verify:topbar` (21), `verify:resdocs` (48),
  `verify:download` (13), `scripts/verify-maintenance-guides.mjs` (PASS), `next build`: tutti verdi.

## Barra per route (una sola per route)

| Route | Barra |
|---|---|
| `/`, `/documenti` | `ResidentTopBar` dal layout |
| `/fascicolo`, `/profilo`, `/manutenzioni` | `MaintenanceHeader` nella pagina (marchio) |
| `/manutenzioni/[id]` | `MaintenanceHeader` con freccia |
| `/manutenzioni/[id]/guida` | header proprio della guida |
| `/profilo/dati-personali` | header proprio (freccia + titolo) |

Stati di messaggio del fascicolo (`FascicoloMessage`, `fascicolo/page.tsx:149-158`):
nessuna barra, perché la pagina non monta `MaintenanceHeader` in quel ramo.

## Commit della sessione (tutti con `npm run verify` verde)

| Commit | Contenuto |
|---|---|
| `207b086` | Barra in alto residente (`ResidentTopBar`) nel layout `(app)` (route ridotte poi in `608ee24`) |
| `70c485f` | Helper di vista `resident-documents-view.ts` (gruppi, filtri, ricerca, conteggi) + `verify:resdocs` |
| `f81d791` | `/api/download`: `inline=1` per aprire nel browser, default invariato + `verify:download` |
| `de43490` | Pagina Documenti nello stile del mockup (card verde, filtri, ricerca, Dal costruttore) |
| `7eae5a7` | Foglio di dettaglio (versioni, Apri, Scarica) |
| `380fd75` | Skeleton di caricamento |
| `f6c9567` | Migrazione 058 (vedi sotto) |
| `608ee24` | Barra del layout solo su `/` e `/documenti`; `verify:topbar` aggiornato |

## Migrazioni

- **058_storage_documents_lettura_per_riga.sql** — APPLICATA (versione DB 20261113153815).
  Restringe la SELECT del bucket `documents`: il residente legge un oggetto solo se esiste
  una riga `documents` con quel `storage_path` che può leggere; admin e super_admin
  restano sul path. Più indice `documents_storage_path_idx`. Rollback commentato nel file,
  esito reale nel footer e in `docs/migrations.log`.
  Prova: residente Santa Giustina da 6 a 5 oggetti visibili, 0 di altre unità, 5 righe
  ancora leggibili (3 gruppi); admin e super_admin con elenco identico (md5).
- **Numerazione:** la H è la **058**. 057 resta riservato al file `057_profiles_phone_grant.sql`
  di origine sconosciuta (non su main, NON applicare). La migrazione dei documenti del
  residente (helper, `resident_documents`, policy, bucket) diventa la **059**, non la 058.

## Decisioni prese (Blocco 2, per la 059)

- Visibile solo se chi guarda E chi ha caricato sono membri attivi della stessa unità.
- `czero_user_role() = 'client'` in lettura, insert e delete, tabella e storage.
- Blocco 1 senza sezione "I tuoi documenti" né CTA "Aggiungi": arrivano col Blocco 2.
- `UploadDocumentForm` nella PWA non si tocca.
- Simulazioni RLS con INSERT/DELETE in transazione con rollback: autorizzate.
- Il SQL finale della 059 va mostrato PRIMA di applicarlo.
- Residente di prova: opzione A, alias `lorofilippo2002+prova@gmail.com` su A1 di
  Residenza Prova `cb14e7c1…` col flusso di invito normale; se l'invito richiede la
  consegna, Filippo la registra dall'interfaccia. Non toccare `lorofilippo2002` né Cavaccio.
  Non ancora fatto.

## NON verificato (login solo magic link/Google, niente accesso dalla sessione)

- Resa a schermo di barra, pagina, foglio e skeleton contro il mockup, a 390px.
- Spazio tra barra e contenuto sulla home (padding 23px di `.home`).
- Una sola barra su ogni route (tabella sopra): dedotto dal codice, non visto a schermo.
- "Apri" su PDF nella PWA installata e ritorno all'app.
- Flusso reale dopo la 058 via API Storage (signed URL, `.list()` dal browser): provato
  solo con simulazioni RLS su `storage.objects`.
- Santa Giustina: 3 documenti nella card, 3 nella sezione, 3 nella home.
- Sul preview il login può non funzionare se il dominio non è tra gli URL di redirect
  consentiti di Supabase Auth (non controllato).

## Backlog (sezione da riportare nel handoff finale)

- (a) `maybeSingle()` su `unit_members` va in errore con due membership attive
  (home, documenti, manutenzioni, layout/barra). La barra mostra "Residenza non disponibile".
- (b) `accept-invite.ts:100-130` non chiude la membership precedente quando cambia
  `builder_id` del profilo.
- (c) Unificare `ResidentTopBar` e `MaintenanceHeader` su TUTTE le route del residente,
  inclusi fascicolo, profilo e `profilo/dati-personali` (oggi due componenti e due CSS con
  gli stessi valori); attivare `viewport-fit=cover` in `src/app/layout.tsx:36` insieme
  all'unificazione (oggi `env(safe-area-inset-top)` vale 0 su iPhone). Includere lo stato
  di messaggio del fascicolo, che oggi resta senza barra.
- (d) Salvare il telefono nel profilo richiede la 057 (`057_profiles_phone_grant.sql`), che
  vive NON tracciata nel worktree `casazero-codex` e non è applicata: oggi `authenticated`
  può leggere `profiles.phone` ma l'UPDATE è concesso solo su `full_name`,
  `notification_prefs`, `updated_at`. Su main nessuna action scrive `phone`.
- Anomalia dati: il profilo `7a210c85…` ha ruolo `admin` e una membership attiva a Cavaccio.
- `uploadDocument` in `(app)/documenti/actions.ts` dichiara "max 50 MB" ma passa dal corpo
  della server action (limite 5 MB in `next.config.ts`); ramo irraggiungibile dalla PWA.
- Titolo del foglio documenti a 22px (serif di `BottomSheet`) contro i 27px del mockup:
  richiede di toccare il componente condiviso.
- 2 oggetti del bucket `documents` senza riga (orfani), leggibili solo da admin e super_admin.

## Prossimi passi (in ordine, ciascuno con ok esplicito)

1. Controllo a occhio sul preview/telefono (lista sopra); eventuale commit di rifinitura.
2. Decisione sul push di `main` (include il v5 manutenzioni).
3. Blocco 2: SQL finale della 059 → ok → applicazione → azioni server (URL di upload
   firmato, conferma con verifica dimensione e magic bytes, eliminazione prima oggetto poi
   riga) → UI "I tuoi documenti". Il testo del sottotitolo della pagina torna a quello del
   mockup quando arriva la sezione.
