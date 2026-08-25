# Handoff — Bridge pulizia igiene (post-B0, pre-Fase B) · 20/07/2026 18:45

## Sommario
Sessione ponte tra la chiusura di B0 (sicurezza storage RLS) e l'inizio di B1: nessun codice applicativo toccato, solo igiene di processo. Promosse in CLAUDE.md le 3 leggi candidate emerse dall'handoff B0, ripulito un working tree sporco da 5+ sessioni con un commit per ogni natura di modifica, e aggiornato lo stato dei rischi FASE 0 di Fase B in un documento vivo che sostituisce la ricostruzione a memoria a inizio B1.

## Lavoro completato
- [x] TASK 1 — Promosse in CLAUDE.md le 3 leggi candidate dell'handoff B0 (bug class `objects.name` non qualificato nelle policy RLS storage, immutabilità estesa agli attachments, onestà del footer di verifica quando un probe non è eseguibile), più la sezione Wiki Knowledge Base già presente nel working tree
- [x] TASK 2 — Working tree ripulito in 5 commit separati per natura: leggi CLAUDE.md, rimozione spec v1 + duplicato accidentale, tracciamento skill `impeccable`/DESIGN.md/PRODUCT.md, gitignore di `.impeccable/`, fix contrasto AA con allineamento contestuale di DESIGN.md
- [x] TASK 3 — Creato `docs/fase0-fase-b-status.md` (documento vivo, non snapshot): rischio 1 (RLS storage) marcato chiuso, verifica per-documento in `/api/download` declassata a backlog, stato aggiornato dei 6 rischi aperti per B1-B6 con riferimento file:riga
- [x] `npx tsc --noEmit` verde prima di ciascuno dei 6 commit di questa sessione, diff mostrato e approvato prima di ogni commit
- [x] `git status` pulito a fine sessione (obiettivo esplicito dato a inizio sessione)

## File toccati
### Creati
- `docs/fase0-fase-b-status.md` — stato vivo dei rischi FASE 0 Fase B: 1 chiuso, 1 declassato a backlog, 6 aperti per B1-B6 con evidenza file:riga

### Modificati
- `CLAUDE.md` — aggiunte 3 leggi (sezioni Regole di codice ricorrenti, Invarianti, Metodo di lavoro) + tenuta la sezione Wiki Knowledge Base
- `src/app/globals.css:17` — `--color-text-secondary` da `#6B7A74` a `#5F6E68`: il vecchio valore dava 4.06:1 su `bg-background`, sotto la soglia AA 4.5:1 quando il testo poggia sulla pagina invece che su una card
- `DESIGN.md` — `text-secondary` allineato a `#5F6E68` nello stesso commit del fix CSS, per non lasciare il documento di design disallineato dal valore reale
- `.gitignore` — aggiunto `.impeccable/` (cache/stato runtime locale della skill, stessa natura di `.claude/settings.local.json` già ignorato)

### Rimossi
- `docs/spec.md` — spec v1 dichiarata parzialmente superata in CLAUDE.md (N1/N2/N3 abolito, 27 vs 19 voci)
- `docs/Nuovo File PY.py` — verificato con `diff` essere una copia identica di `docs/spec.md` sotto nome di file Windows di default con estensione `.py`; nessuno stack Python nel progetto, artefatto accidentale

### Tracciati per la prima volta
- `.claude/skills/impeccable/` (98 file, ~2.3MB) — pacchetto della skill di design installata, versionato perché disponibile in sessioni/clone futuri
- `PRODUCT.md` — brand personality e anti-reference reali di CasaZero, usati dalla skill `impeccable`

### Letti (solo quelli rilevanti per capire il contesto)
- `docs/handoffs/HANDOFF_storage_rls_b0_07_20_17_49.md` — fonte delle 3 leggi candidate e del contesto B0
- `next.config.ts:14` — `serverActions.bodySizeLimit: '5mb'`, evidenza per il rischio aperto "limite body" in `fase0-fase-b-status.md`
- `supabase/migrations/001_schema.sql:11,136,180` — enum `document_category` e `maintenance_items.template_id NOT NULL`, evidenza per due rischi aperti
- `supabase/migrations/012_create_residence_atomic.sql`, `013_add_unit_atomic.sql` — confermato che le RPC di creazione item/unità lasciano `completion_mode`/`obligation_type` NULL e non toccano `priority`
- `supabase/migrations/021_maintenance_items_role_column_guard.sql` — trigger che blocca già la scrittura di `activation_status` da ruolo admin
- `supabase/seed.sql` — unica scrittura oggi esistente su `maintenance_templates` (nessuna scrittura applicativa)
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx:16` — `requireRole(['super_admin'])`, evidenza del gap upload-dashboard vs PWA
- `.impeccable/*` — ispezionati tutti i file per confermare che sono stato/cache locale (config consenso hook, cache hook, sessione live, critique) e non contenuto di progetto

## Decisioni chiave
- **`docs/Nuovo File PY.py` eliminato senza discussione**: `diff` contro `docs/spec.md` ha mostrato contenuto identico. Non è stato trattato come "documento sconosciuto da preservare" perché la prova (diff) precede la cancellazione, coerente col metodo FASE 0.
- **`.claude/skills/impeccable/` tracciato, `.impeccable/` no**: la distinzione è tra pacchetto della skill (codice/reference versionabile, riproducibile su ogni macchina) e stato runtime locale (consenso hook, cache, sessioni live) — stessa logica già applicata a `.claude/settings.local.json`.
- **Fix contrasto CSS e allineamento DESIGN.md nello stesso commit**: decisione esplicita di Filippo per evitare di introdurre proprio ora la divergenza displayed-vs-saved che le leggi del progetto vietano (fonte di verità unica per lo stesso valore su più superfici).
- **`docs/fase0-fase-b-status.md` come documento vivo, non come nuovo handoff datato**: gli handoff sono snapshot di sessione e non versionati (`docs/handoffs/` è in `.gitignore`); lo stato dei rischi FASE 0 deve sopravvivere alle sessioni e restare tracciato, quindi vive in `docs/` come file che si aggiorna in loco.
- **Requisito `requireRole(['super_admin'])` su upload dashboard**: la sessione B0 aveva lasciato la domanda aperta se fosse vincolo di prodotto o gap. Deciso ora e registrato nel documento di stato: è un gap, da colmare in B6 (vista per condominio all'admin), non prima — non un vincolo di prodotto voluto.
- **`docs/fase0-fase-b-status.md` è un commit a sé, non fuso nei 5 pianificati**: nessuno dei 5 commit concordati a inizio sessione copriva questo file; per rispettare "un concern per commit" e l'obiettivo di `git status` pulito è stato aggiunto un sesto commit, segnalato esplicitamente a Filippo invece di essere assorbito in silenzio.

## Stato attuale
### Funziona
- `git status` pulito, 6 commit sequenziali tutti con `npx tsc --noEmit` verde prima del commit
- CLAUDE.md aggiornato con le 3 leggi + sezione wiki, coerente collo stile lean del file
- `docs/fase0-fase-b-status.md` pronto come base per la FASE 0 di B1

### Non funziona / da verificare
- Nessuna modifica applicativa in questa sessione: gli item "Non funziona" dell'handoff B0 restano invariati (upload admin da PWA non testato, gestione errore mancante in `completeN2` sull'INSERT `attachments`, orfano `Certeficato_enegertico.pdf` in `documents`) — non riaperti qui, restano in backlog

## Prossimi passi
1. FASE 0 di B1 in sessione dedicata: partire da `docs/fase0-fase-b-status.md` invece di ridiagnosticare da zero i rischi aperti
2. Decisione architetturale su `maintenance_items.template_id NOT NULL` (nullable vs. template ad-hoc) prima di scrivere codice per B5
3. Decidere l'architettura di upload client-diretto con signed URL per B3, dato il limite `bodySizeLimit: '5mb'` di `next.config.ts`
4. Quando si arriva a B6: rimuovere `requireRole(['super_admin'])` da `admin/residences/[id]/documenti/page.tsx:16` per allineare la dashboard alla PWA (decisione già presa, solo da eseguire)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Nessuna nuova in questa sessione. Restano aperte quelle dell'handoff B0 (probe SQL alternativo per DELETE su `storage.objects`, già mitigato da `storage.protect_delete()`).

## Leggi emerse (candidate per CLAUDE.md)
Nessuna. Questa sessione ha applicato leggi già approvate (provenienti dall'handoff B0), non ne ha generate di nuove — è stata igiene di processo, non sviluppo.
