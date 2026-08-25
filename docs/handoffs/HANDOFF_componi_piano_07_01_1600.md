# Handoff — Componi piano (vista a livelli + fan-out includi/escludi) · 01/07/2026 16:00

## Sommario
Questa sessione ha riorganizzato la vista super_admin `/admin/residences/[id]/manutenzioni` da lista piatta (~405 righe item-unità) a una struttura a livelli (testa attenzione + piano per tipo con drill-down accordion), e ha introdotto la prima scrittura a fan-out del dominio manutenzioni: includere/escludere un intero tipo di manutenzione a livello residenza in un colpo. Il caso reale sbloccato è l'attivazione delle 3 voci fotovoltaico (FV) di Residenza Cavaccio, che esistono come 31 istanze archiviate mai raggiungibili da UI. Tutti i commit su `master`, build verde (`npx tsc --noEmit`).

## Lavoro completato
- [x] **Commit 8** `11d9c9d` — riorganizzazione vista a livelli (SOLO presentazione): testa zona-attenzione per-istanza, corpo per tipo raggruppato per categoria (~27 righe-tipo), accordion single-open con drill-down unità, select filtro-unità, helper `resolveAxes` come unico call-site degli assi
- [x] **Fix** `0c168a8` — natural sort delle unità nel filtro (`compareUnitLabels`): numeriche in ordine crescente, custom-name alfabetiche prima
- [x] **Commit 8b** `ba58e34` — fan-out includi/escludi un tipo a livello residenza: nuova action `setTemplateActivationForResidence`, sezione "Tipi esclusi dal piano", modale preview-before-apply
- [x] Diagnosi read-only FASE 0 per entrambi i commit (vista attuale + stato DB reale FV/RLS) — approvata prima di implementare
- [ ] **Verifica UI reale non eseguita** — il fan-out e i drill-down non sono coperti da test automatici (vedi "Non funziona / da verificare")

## File toccati
### Creati
- Nessun file di codice creato (solo questo handoff)

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — riscrittura struttura rendering a livelli (commit 8); `compareUnitLabels` (fix sort); `template_id`/`residenceName` nei tipi/props, struttura `excludedTemplates` (da `items` RAW), stato modale (`pendingAction`/`isPending`/`showExcluded`), sezione "Tipi esclusi", bottone "Escludi" nella riga-tipo, modale-overlay preview-before-apply (commit 8b)
- `src/app/(dashboard)/admin/residences/[id]/fornitori/actions.ts` — nuova server action `setTemplateActivationForResidence(templateId, residenceId, targetStatus)`: fan-out UPDATE su `activation_status`, solo super_admin, client RLS; inclusione con ricalcolo scadenze a bucket di frequenza; esclusione senza tocco a status/next_due_date
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/page.tsx` — `template_id` aggiunto alla SELECT di `maintenance_items`; nuova prop `residenceName={residence.name}` passata al client

### Letti (rilevanti per contesto)
- `src/components/MaintenanceBadge.tsx` — firma props (`status` obbligatorio; promemoria → blu fisso ignorando status). Determinante per il badge riga-tipo neutro (`status="in_attesa"`)
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ItemConfigForm.tsx` — ha già `open` interno: nessuno stato esterno necessario per "Configura" nel drill-down
- `supabase/migrations/001_schema.sql`, `002_rls.sql` — schema `maintenance_items`/`maintenance_templates` e RLS baseline
- `docs/handoffs/HANDOFF_manutenzioni_v2_01_07_1200.md` — contesto migrazione due assi (commit A-E)
- Schema + dati LIVE via Supabase MCP — stato reale FV Cavaccio, RLS, vincoli frequency_months

## Decisioni chiave
- **Vista a livelli tutto client-side (commit 8 solo-presentazione)**: aggregazione `byTemplate` (categoria→titolo) da `filteredItems`; contatori restano su `liveItems`/`yearCompletions` (zero divergenza count/list). Alternativa scartata: aggregare lato server (avrebbe toccato la query, fuori confine)
- **Badge riga-tipo con `status="in_attesa"` fisso**: mai passare uno status d'istanza (fuorviante, e violerebbe "promemoria non scade mai" se rep ha status sporco). L'urgenza è comunicata dalla sintesi testuale "Y in ritardo", con guardia `mode !== 'promemoria'` applicata a testa, sintesi e visibilità displayTemplate
- **Caso FV = UPDATE fan-out, non INSERT**: FASE 0 ha smentito l'assunzione "template mai materializzato". Le 31 istanze FV esistono già come righe `activation_status='archiviata'` con assi per-item NULL (ereditano dal template). Attivare = flip `archiviata→inclusa`
- **`activation_status` (item) ≠ `is_active` (template)**: `is_active` è GLOBALE (template condiviso tra tutti i costruttori, senza builder_id). VIETATO scriverlo per-residenza — l'inclusione vive solo su `activation_status` dell'item
- **Ricalcolo scadenze a bucket di frequenza**: `next_due_date = oggi + freq` per-riga con fallback `item.frequency_months ?? template.frequency_months` non è esprimibile in un singolo UPDATE literal via supabase-js. Soluzione: raggruppa per frequenza effettiva, un UPDATE per bucket (un solo statement per FV, dove non ci sono override). RPC/migration scartati per guardrail
- **Caso freq null escluso dallo schema**: `template.frequency_months` è `NOT NULL` + FK `NOT NULL` → il fallback non può mai essere null. Il guard `if (freq)` è difensivo su stato irraggiungibile, lasciato com'è. Nota: `freq=0` NON è vietato da CHECK (assente dai dati, min=1), edge fuori scope
- **RLS già sufficiente**: policy `"items: super_admin gestisce tutto"` è `FOR ALL` con `WITH CHECK` nullo (eredita da USING) → copre UPDATE multi-riga via client RLS. Nessuna migration, nessuna nuova policy. `completions` resta inaccessibile a super_admin (confermato su DB)

## Stato attuale
### Funziona
- `npx tsc --noEmit` verde su tutti e tre i commit
- Vista a livelli: testa attenzione, corpo per tipo, drill-down accordion, filtro-unità con natural sort
- Action `setTemplateActivationForResidence`: role check super_admin, dual-branch inclusione/esclusione, ritorna count righe toccate
- Modale preview-before-apply con i 3 contenuti obbligatori sull'inclusione (cosa succede / quante istanze / ricalcolo dichiarato)

### Non funziona / da verificare
- **Test UI reale non eseguito**: il dev server gira in finestra separata. Da verificare a mano su Cavaccio: (a) le 3 voci FV appaiono in "Tipi esclusi dal piano"; (b) Includi le porta nel piano con scadenze ricalcolate da oggi; (c) Escludi le riporta indietro senza toccare il fascicolo (una FV, "Test differenziale generale", ha già 1 completion storica su istanza archiviata — deve restare intatta)
- **Scadenze FV pregresse**: gli item FV avevano `next_due_date` risalenti al 2023. L'inclusione le ricalcola da oggi; senza il ricalcolo comparirebbero come "scadute da 3 anni". Verificare che il ricalcolo effettivo avvenga
- **`.claude/settings.local.json`** modificato ma non committato (config locale, non parte del lavoro)

## Prossimi passi
1. **Verificare visivamente** il ciclo includi/escludi FV su Residenza Cavaccio (i 3 punti a/b/c sopra), poi confermare che i contatori Scadute/In corso restino coerenti dopo l'inclusione
2. **Estensioni fan-out (commit futuri, stesso pattern action)**: modifica-frequenza-a-fan-out, assegna-fornitore-a-fan-out — esplicitamente fuori scope dell'8b
3. **Cleanup `effPriority`** inutilizzata nella lista (segnalato nel handoff precedente, non ancora fatto)
4. **Valutare hardening schema** `CHECK (frequency_months > 0)` su template e item (migration a mano) per chiudere l'edge freq=0
5. **Template v2 mancanti** (dal handoff precedente): "Manutenzione climatizzazione" e "Manutenzione fotovoltaico" — se inseriti senza istanze per una residenza, servirebbe il ramo INSERT fan-out (oggi non presente)

## Comandi da rilanciare
```bash
# Il dev server gira in una finestra PowerShell separata e persistente
cd C:\progetti\casazero
npm run dev

# Type check (verde prima di ogni commit)
npx tsc --noEmit

# Build di verifica
npm run build
```

## Domande aperte
- **Feedback post-azione nel modale**: oggi il modale si chiude su successo e la pagina si aggiorna via `revalidatePath`. Serve un toast/conferma esplicita col count ritornato, o il refresh visivo basta?
- **Ramo INSERT fan-out**: quando arriveranno i 2 template v2 senza istanze materializzate, "Includi" dovrà creare N righe da zero. Si estende `setTemplateActivationForResidence` con un branch INSERT, o si materializzano le istanze in fase di seed/creazione residenza?
- **Guardia riattivazione**: un tipo con completions storiche recenti dovrebbe avere una guardia extra prima dell'esclusione/inclusione, o il modale di conferma attuale è sufficiente?
- **`freq=0` hardening**: vale un CHECK a livello DB adesso, o si rimanda finché non emerge un caso reale?
