# Handoff — Accesso amministratore alle sotto-pagine residenza · 07/09/2026 13:08

## Sommario
La sessione ha aperto all'amministratore di condominio l'intera area residenza della dashboard, che fino a ieri era riservata al costruttore: Fascicolo (pagina e PDF), Manutenzioni, Documenti (upload, classificazione automatica, conferma classificazione), più un elenco residenze suo e una sidebar che lo porta lì. Il lavoro è partito da una FASE 0 trasversale sulle autorizzazioni, che ha stabilito il principio applicato poi in ogni commit: dove il codice usa il client scoped-utente non si scrive logica di appartenenza (la fa la RLS), dove usa il service client il controllo applicativo è l'unica barriera e va scritto esplicitamente. Cinque commit sono chiusi e verificati; due (elenco residenze e sidebar) sono in working tree, con build verde, in attesa della verifica funzionale di Filippo.

## Lavoro completato
- [x] FASE 0 — diagnosi read-only delle autorizzazioni admin-su-residenza su Fascicolo, Manutenzioni, Documenti
- [x] 4a — Fascicolo: pagina e route PDF aperte all'admin assegnato (`a3a98c6`)
- [x] 4b — Manutenzioni: pagina aperta, composizione del piano nascosta (`4237170`)
- [x] 4b-bis — Manutenzioni: vista "Escluse" e suo selettore nascosti all'admin (`5bb10cf`)
- [x] 4c — Documenti: pagina, upload e conferma classificazione aperti; eccezioni checklist chiuse (`c6713c9`)
- [x] 4d — Classificazione AI: lancio aperto all'admin assegnato (`09f1075`)
- [x] FASE 0 breve sulla sidebar: accertato che elenco residenze admin e Impostazioni admin NON esistevano
- [ ] 5a — Elenco residenze per l'admin: scritto, `tsc` verde, NON committato (in working tree)
- [ ] 5b — Sidebar admin a due voci: scritto, `tsc` verde, NON committato (in working tree)

## File toccati

### Creati
Nessun file nuovo. Tutte le viste per ruolo sono rami dentro le pagine esistenti, per scelta esplicita (vedi Decisioni chiave).

### Modificati

**Committati (commit 4a → 4d)**
- `src/app/(dashboard)/admin/residences/[id]/fascicolo/page.tsx` — `requireRole` allargato a `['admin','super_admin']`. Nient'altro: lo scoping lo fa la RLS.
- `src/app/api/fascicolo-pdf/route.ts` — aggiunto ramo admin che conta la riga in `admin_assignments`; ramo super_admin (confronto `builder_id`) invariato, solo racchiuso in un `if`. Gira in service role: questo gate è l'unica barriera.
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/page.tsx` — ruolo allargato; passa `canManagePlan={profile.role === 'super_admin'}`.
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — nuova prop obbligatoria `canManagePlan`; nasconde "Escludi dal piano", "Includi nel piano", il selettore Attive/Escluse e la sezione dei tipi esclusi. Aggiunto `effectivePlanView` che forza la vista su `attive` quando la prop è falsa.
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx` — ruolo allargato; passa `canManageChecklist={profile.role === 'super_admin'}`.
- `src/app/(dashboard)/admin/residences/[id]/documenti/actions.ts` — `getAuthorizedSuperAdmin` spaccata in `getAuthorizedDocumentUser` (admin + super_admin: upload, conferma documento, conferma classificazione) e `getAuthorizedChecklistManager` (solo super_admin: eccezioni checklist). Corretto il commento di `confirmClassification`, che descriveva la policy `documents` come super_admin-only.
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — nuova prop obbligatoria `canManageChecklist`, propagata a `ChecklistSection` e `ChecklistItemRow`; nasconde "Segna non applicabile" e "Annulla non applicabile" lasciando leggibili motivazione e attribuzione delle esclusioni già decise.
- `src/app/api/classify-document/route.ts` — ramo admin via `admin_assignments`; ramo super_admin (query su `residences` filtrata per `builder_id`) invariato. Entrambi rispondono 404, non 403.

**In working tree, NON committati**
- `src/app/(dashboard)/admin/residences/page.tsx` (5a) — `requireRole` allargato + `if (profile.role === 'admin') return <AdminResidencesView />`. Il nuovo componente in fondo al file interroga solo `residences` + conteggio unità, senza `admin_assignments`.
- `src/app/(dashboard)/admin/residences/ResidencesTable.tsx` (5a) — nuova prop obbligatoria `showAdminColumn`; `adminName` diventa opzionale nel tipo `ResidenceRow`.
- `src/app/(dashboard)/admin/residences/ResidencesEmptyState.tsx` (5a) — aggiunto `ResidencesEmptyStateAdmin`, senza call-to-action.
- `src/components/AdminSidebar.tsx` (5b) — `ADMIN_ITEMS` passa da una voce ("Manutenzioni") a due: "Residenze" → `/admin/residences`, "Attività" → `/admin/manutenzioni`. `SUPER_ADMIN_ITEMS` intatto.

### Letti (rilevanti per il contesto)
- `supabase/migrations/002_rls.sql` — definisce `czero_can_access_residence()` (righe 29-54, con il ramo admin via `admin_assignments`), `czero_user_role()`, e le policy su `residences`, `documents`, `completions`, `maintenance_items`. È la fonte di verità dello scoping.
- `supabase/migrations/022_storage_documents_scoped_rls.sql` — policy storage bucket `documents`, con ramo admin esplicito su INSERT.
- `supabase/migrations/023_storage_attachments_scoped_rls.sql` — SELECT allegati già aperta all'admin: gli allegati del fascicolo funzionavano senza modifiche.
- `supabase/migrations/027_document_checklist.sql` — policy `checklist_exception: super_admin gestisce tutto`, riga 96: NON ha un ramo admin. È il motivo per cui le eccezioni checklist sono rimaste chiuse.
- `supabase/migrations/021_maintenance_items_role_column_guard.sql` — trigger che vieta all'admin di toccare `activation_status`; conferma che "Configura" era già autorizzato end-to-end per l'admin.
- `src/app/api/report/route.ts` righe 142-149 — pattern preesistente di autorizzazione admin-su-residenza dietro service client, copiato in 4a e 4d.
- `src/lib/auth.ts` — `requireRole`/`getProfile`; `requireRole` ritorna il `Profile`, per questo i rami per ruolo possono leggere `profile.role` senza query aggiuntive.

## Decisioni chiave

- **Due strati di autorizzazione, non uno**: la FASE 0 ha stabilito che il DB ha già un meccanismo unico e corretto (`czero_can_access_residence`), mentre lo strato applicativo ne ha cinque diversi. Conseguenza operativa: dove si usa il client scoped-utente basta allargare `requireRole` e la RLS fa lo scoping da sola; solo dove si usa `createServiceClient()` serve un controllo applicativo esplicito. Alternativa scartata: scrivere un controllo di appartenenza in ogni pagina, che avrebbe creato una seconda fonte di verità accanto alla RLS.

- **Il ramo super_admin si affianca, non si fonde**: in `fascicolo-pdf` e `classify-document` il controllo di tenancy del costruttore (`builder_id`) è rimasto identico parola per parola, racchiuso in un `if`, con il ramo admin accanto. Motivo: entrambe girano in service role, la RLS è bypassata e una "semplificazione" che unificasse i due controlli aprirebbe il fascicolo legale di un costruttore a un super_admin di un altro builder.

- **Prop di gating obbligatorie e in positivo**: `canManagePlan`, `canManageChecklist`, `showAdminColumn` sono tutte richieste senza valore di default. Alternativa scartata: `readOnly?: boolean` con default. Se il default fosse "nascondi", un chiamante distratto toglierebbe le funzioni al costruttore in silenzio, senza errore; con la prop obbligatoria l'omissione fallisce in build.

- **Split dell'helper documenti invece di allargamento**: `getAuthorizedSuperAdmin` è stata spaccata in due invece di essere rilassata in blocco, perché le due famiglie di action rispondono a due RLS diverse. Allargarla tutta avrebbe dato all'admin un errore RLS grezzo sull'upsert delle eccezioni, o lo zero-righe fuorviante di `clearChecklistException`, invece di un rifiuto pulito.

- **404 e non 403 in `classify-document`**: la route rispondeva già 404 "Documento non trovato" quando il super_admin puntava fuori dal suo builder. Il ramo admin usa lo stesso codice: codici diversi per i due ruoli rivelerebbero all'admin l'esistenza di documenti fuori dalle sue residenze.

- **Stessa rotta, rami per ruolo**: `/admin/residences` e `/admin/residences/[id]` servono entrambi i ruoli con viste diverse, invece di rotte parallele tipo `/admin/mie-residenze`. Admin e costruttore guardano lo stesso oggetto da due angoli; duplicare le rotte avrebbe duplicato anche i link e le query.

- **"Attività" punta a due rotte diverse secondo il ruolo**: per il super_admin `/admin/attivita` (pagina demo, badge "test"), per l'admin `/admin/manutenzioni` (vista trasversale reale). Scelta consapevole di Filippo, annotata nel codice perché a distanza di mesi sembrerebbe un bug.

## Stato attuale

### Funziona
Tutto verificato funzionalmente da Filippo con gli account reali (`filippoloro02` admin, `pippoloro02` super_admin):

- Fascicolo: admin sulla residenza assegnata apre la pagina e scarica il PDF; su una residenza non assegnata ottiene 404 sulla pagina e `{"error":"Accesso negato"}` sulla chiamata diretta alla route; super_admin invariato.
- Manutenzioni: admin apre la pagina, "Configura" presente e funzionante, "Escludi dal piano" e "Includi nel piano" assenti, nessun selettore Attive/Escluse, nessuna sezione tipi esclusi; super_admin ha tutto.
- Documenti: admin carica, lancia la classificazione automatica e conferma la classificazione; checklist espansa senza alcun controllo di eccezione; super_admin ha il flusso completo con le eccezioni.

### Non funziona / da verificare
- **5a e 5b non sono verificati funzionalmente.** Sono in working tree con `npx tsc --noEmit` verde, ma nessuno ha ancora aperto la pagina. Da provare: elenco residenze admin (solo le sue, righe cliccabili, niente pulsante "Nuova residenza", niente colonna Amministratore), empty state admin con zero residenze assegnate, vista super_admin identica a prima, e sidebar con le due voci nei due ruoli.
- **Nessuna migrazione è stata applicata in questa sessione.** Il DB è quello di partenza.
- L'admin non ha una pagina Impostazioni: `/admin/settings` è super_admin-only e il suo contenuto è identità del costruttore. Inoltre legge `profile.builder_id!` con asserzione non-null su una colonna nullable, che per un admin può essere `null`.

## Prossimi passi
1. Verificare funzionalmente 5a, poi committarlo da solo (tre file: `page.tsx`, `ResidencesTable.tsx`, `ResidencesEmptyState.tsx`).
2. Verificare funzionalmente 5b, poi committarlo da solo (`AdminSidebar.tsx`). Due commit separati, un concern ciascuno.
3. Decidere il residuo informativo delle eccezioni checklist: oggi l'admin legge motivazione e "Escluso da X · data" delle voci già escluse, senza poter agire. Se si applica lo stesso principio di 4b-bis (dove la composizione del piano è stata nascosta anche in lettura), va nascosto anche questo — e allora va deciso cosa fare del contatore "N escluse" negli scope della checklist, che oggi l'admin vede comunque.
4. Disegnare il commit di unificazione dell'autorizzazione admin-su-residenza dietro service client: ora ci sono tre copie dichiarate (`api/report/route.ts:142-149`, `api/fascicolo-pdf/route.ts`, `api/classify-document/route.ts`). Sede naturale `src/lib/auth.ts`, accanto a `requireRole`/`getProfile`. Da fare dopo la demo, come dichiarato nei commenti delle tre copie.
5. Decidere se e cosa mettere in una pagina Impostazioni per l'admin (notifiche? nome? cambio password?). La sezione `notification_prefs` di `admin/settings/page.tsx` è l'unica parte già riusabile.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Verifica prima di ogni commit
npx tsc --noEmit

# oppure production
npm run build && npm start
```

## Domande aperte
- Il residuo informativo delle eccezioni checklist va nascosto all'admin per simmetria con 4b-bis, oppure tenuto perché spiega un contatore che l'admin vede comunque? Deciso da Filippo, non assorbito.
- `adminName` nel tipo `ResidenceRow` è stato reso opzionale per non passare un `null` finto dalla vista admin. Il costo è che il tipo non costringe più il costruttore a fornirlo. L'alternativa rigorosa è una union discriminata sulle props (`showAdminColumn: true` implica righe con `adminName` obbligatorio): più precisa, più pesante su un componente di 40 righe. Da confermare o ribaltare.
- La shell `(app)` per l'admin resta un debito noto: `(app)/fascicolo` e `(app)/documenti` gli mostrano UNA sola residenza scelta con `.limit(1)` su `admin_assignments`, mentre ora la dashboard gliele mostra tutte. Due perimetri diversi per lo stesso ruolo, senza nulla in UI che lo dica.
- La voce "Attività" con due rotte diverse per ruolo va bene a regime, o `/admin/attivita` (demo) va promossa/rimossa prima della consegna?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Invarianti**: Autorizzazione a due strati. `czero_can_access_residence()` + `czero_user_role()` sono l'unica fonte di verità sull'appartenenza. Dove il codice usa il client scoped-utente (`createClient()`), aprire una superficie a un ruolo significa solo allargare `requireRole`: non si scrivono controlli applicativi di appartenenza, che sarebbero una seconda fonte di verità. Dove usa `createServiceClient()` la RLS è bypassata e il gate applicativo è l'unica barriera: lì il controllo va scritto esplicitamente, e il ramo di tenancy esistente non si fonde mai con quello nuovo — si affianca. Fondere il confronto `builder_id` del super_admin con un altro ramo apre i dati di un costruttore agli utenti di un altro.

- **Sezione Regole di codice**: Prima di allargare un gate applicativo a un ruolo nuovo, verificare che la policy RLS della tabella abbia già un ramo per quel ruolo. Se non ce l'ha, il gate allargato produce un errore RLS grezzo o uno zero-righe silenzioso — cioè un messaggio fuorviante al posto di un rifiuto pulito. In quel caso o si lascia chiuso, o serve una migrazione: mai solo codice applicativo.

- **Sezione Regole di codice**: Le prop che nascondono funzioni per ruolo sono obbligatorie, senza valore di default, e nominate in positivo (`canManagePlan`, `canManageChecklist`, `showAdminColumn`). Un default "nascondi" toglierebbe le funzioni al ruolo pieno in silenzio, senza errore; una prop obbligatoria fa fallire la build sul chiamante che la dimentica.

- **Sezione Regole di codice**: Quando una vista per ruolo nasconde un tab o una modalità, non basta non renderizzare il selettore: va anche neutralizzato lo stato che vi corrisponde (es. `effectivePlanView = canManagePlan ? planView : 'attive'`). Altrimenti basta che un giorno un parametro URL o un default cambi perché l'utente atterri su una schermata da cui non ha modo di uscire.

- **Sezione Regole di codice**: Su una stessa route, i rami di ruolo devono rispondere con lo stesso status code alla stessa condizione di accesso negato. Un ramo che risponde 403 accanto a uno che risponde 404 rivela per differenza l'esistenza delle risorse fuori dal perimetro di chi chiede.
