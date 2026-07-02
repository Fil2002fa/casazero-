CasaZero — CLAUDE.md
CasaZero è il libretto di manutenzione digitale dell'immobile che un costruttore consegna
al momento della vendita. Multi-tenant. Cliente pilota: Furlan Costruzioni.
Residenza demo: Residenza Cavaccio (15 unità) — demo throwaway, verrà eliminata.

Questo file contiene le leggi del progetto. Lo stato corrente è nell'ultimo
handoff in docs/handoffs/ — leggilo sempre a inizio sessione.
Spec estesa (parzialmente superata, vedi nota in cima): docs/spec.md.
Catalogo manutenzioni corrente: docs/catalogo-manutenzioni-v2.md (19 voci).

Stack

Next.js 15 App Router + TypeScript, Tailwind v4, Vercel
Supabase: Postgres + RLS, Auth, Storage — project ref kuvekkseclhhcamojysj
@react-pdf/renderer per i PDF (route API con runtime = 'nodejs'), Resend per email
Dual shell: (dashboard) per super_admin/admin desktop · (app) per residente PWA
Ambiente di sviluppo: Windows / PowerShell. Il cron NON gira in locale: item con
next_due_date passata che appaiono "Pianificata" in dev è comportamento corretto.

Nomenclatura ufficiale (modello a due assi — v2)
La sigla N1/N2/N3 è ABOLITA. Non usarla mai in codice nuovo, UI, commenti o documenti.

Modalità (completion_mode) — chi completa: residente · amministratore · promemoria
Tipo (obligation_type) — vincolo: Obbligo di legge · Raccomandata · Consiglio

Dual-write attivo (debito tecnico intenzionale): ogni scrittura da form super_admin
aggiorna i due assi E la colonna legacy priority (promemoria→N1, residente→N2,
amministratore→N3), perché le viste residente e admin leggono ancora priority.
Non rimuovere priority né il dual-write finché quelle viste non migrano.
Invarianti (mai violare)

completions è il fascicolo legale: immutabile. Nessun agente o migrazione la tocca.
RLS: INSERT solo ruolo admin; il super_admin non deve MAI poter scrivere nel fascicolo.
Promemoria non è mai "scaduta". Le card promemoria non leggono status né confrontano
date, qualunque cosa dica il DB: rendering sempre "Consigliata · ogni X mesi", blu.
Vietato il linguaggio scadenza/scaduta su queste voci. Garanzia strutturale, non cosmetica.
Piano ≠ fascicolo. Item archiviati (activation_status) spariscono dal piano attivo
ma i loro completamenti restano visibili nello storico/fascicolo.
Email utenti da auth.users via service role client (auth.admin.getUserById),
mai da profiles (che non ha colonna email — non aggiungerla: due fonti di verità).
admin_assignments è stato corrente, non storico. Cambio admin = DELETE + INSERT.
Lo storico legale è solo completions.

Metodo di lavoro (non negoziabile)

FASE 0 — diagnosi read-only con STOP. Prima di qualsiasi modifica: investigare,
riportare i risultati e FERMARSI in attesa di approvazione esplicita.
Prove, non descrizioni. Ogni affermazione sul comportamento attuale va provata con
le righe di codice reali (path + numero riga) o con l'output di query eseguite.
Discrepanze di conteggio/dati: confrontare PRIMA lo scope delle query
(builder-wide vs singola residenza, filtrata vs no) e solo dopo le definizioni.
Eseguire le query esatte di ogni superficie e mostrare i risultati affiancati.
Un concern per commit. Task multipli = commit sequenziali separati. Segnalare
esplicitamente ogni scope creep invece di assorbirlo.
Build verde prima di ogni commit (npm run build o npx tsc --noEmit, zero errori)
e diff mostrato prima di committare.
Messaggi di commit: MAI here-string PowerShell con virgolette doppie. Usare riga
singola senza caratteri speciali, oppure git commit -F <file> con messaggio su file.
Migrazioni e RLS: solo anteprima. Mostrare lo SQL e fermarsi — le applica Filippo
a mano nel SQL Editor di Supabase. Mai auto-eseguire DDL o scritture sul DB.
Fine sessione: generare l'handoff con /handoff. Non modificare mai questo file
(CLAUDE.md) direttamente: proporre i cambiamenti nella sezione "Leggi emerse" dell'handoff.

Regole di codice ricorrenti (bug class note)

Helper condivisi obbligatori quando lo stesso valore appare in più superfici
(contatore + lista, schermo + PDF): una sola funzione fonte di verità
(es. unitHasNoActiveAccount, formatUnitLabel). Mai ricalcolare inline.
Pluralizzazione italiana via helper ("1 mese", non "1 mesi").
Mai elementi interattivi annidati (button dentro button/link) → hydration error.
Gap di configurazione: se esiste un elemento dedicato (es. card admin), il gap si
mostra lì; le tile ambra della zona attenzione sono solo per gap senza elemento dedicato.

Comandi
bashnpm run dev          # server di sviluppo (finestra PowerShell separata)
npm run build        # build di verifica prima di ogni commit
Account di test
pippoloro02 (super_admin) · filippoloro02 (admin) · lorofilippo2002 (residente)
Alias demo admin: pippoloro02+adminB/C@gmail.com