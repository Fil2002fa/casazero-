# Handoff — Passata estetica dashboard · 16/09/2026 15:21

## Sommario
Dopo il blocco responsive (37 commit, non ancora pushati) la dashboard `(dashboard)` era usabile ma non curata: tre debiti di stile lasciati apposta fuori da quel blocco (etichette maiuscole spaziate, bordi laterali colorati a mano, colori esadecimali che duplicano token). Questa sessione ha fatto FASE 0 con evidenza grezza da subagent, poi 5 commit sequenziali di pulizia, dal meccanico (colori→token) al visivo (rimozione bordi/maiuscole), ciascuno verificato e approvato da Filippo a 390 e 1280 prima del successivo. Un commit pianificato (13px→token label) è stato scartato in corsa perché la premessa — un token tipografico esistente — si è rivelata falsa.

## Lavoro completato
- [x] FASE 0: audit con subagent read-only, evidenza path:riga per i tre debiti + `text-[Npx]` fuori scala + spaziatura fuori scala 4/8/12/16/24/48
- [x] Commit `4086471` — colori esadecimali a mano → token DESIGN.md (6 file: `administrators/page.tsx`, `administrators/[id]/page.tsx`, `AdminBlock.tsx`, `FornitoriManager.tsx`, `DocumentiClient.tsx`, `AdminSidebar.tsx`)
- [x] Commit `ba02c68` — `p-5`/`space-y-5`/`mb-5` (20px, fuori scala e contro la regola scritta "mai p-5") → `p-6`/`space-y-6`/`mb-6` (7 occorrenze, 5 file)
- [x] Commit `bf663df` — `text-[10px]`/`text-[11px]`/`text-[15px]` arbitrari → `text-xs`/`text-sm` (30 righe, 12 file), esclusi i due componenti PWA-only e una riga con size prop intenzionalmente distinta
- [x] Commit `b426671` — rimosso `uppercase tracking-wide` da tutte le 13 occorrenze nel perimetro (badge sidebar incluso, nessuna eccezione)
- [x] Commit `cda14cf` — rimosso `border-l-4` fuori da `MaintenanceCard.tsx` (3 file), senza sostituto: i segnali di stato esistevano già altrove nella stessa card
- [ ] Commit "2" (text-[13px]→token label) — **scartato**, vedi Decisioni chiave e Domande aperte

## File toccati
### Creati
- `docs/handoffs/HANDOFF_passata_estetica_09_16_15_21.md` — questo documento

### Modificati
- `src/app/(dashboard)/admin/administrators/page.tsx` — hex→token, `text-[10px]`→`text-xs`, uppercase/tracking rimosso, `border-l-4`+`accentBorder` rimossi
- `src/app/(dashboard)/admin/administrators/[id]/page.tsx` — idem + `accentBorder` (variabile dead-code) rimossa
- `src/app/(dashboard)/admin/residences/[id]/AdminBlock.tsx` — hex→token, `text-[10/11px]`→`text-xs`, uppercase/tracking rimosso
- `src/app/(dashboard)/admin/residences/[id]/documenti/DocumentiClient.tsx` — hex→token, `p-5`/`space-y-5`→`p-6`/`space-y-6`, `text-[10/11px]`→`text-xs`, uppercase/tracking rimosso
- `src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx` — `mb-5`→`mb-6`
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — `p-5`/`space-y-5`→`p-6`/`space-y-6`, `border-l-4`+`accent` rimossi (card evento in ritardo/in corso)
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ItemConfigForm.tsx` — `text-[10px]`→`text-xs` (6 occorrenze)
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — `text-[10px]`→`text-xs`, uppercase/tracking rimosso
- `src/app/(dashboard)/admin/manutenzioni/[id]/page.tsx` — uppercase/tracking rimosso (2 occorrenze)
- `src/app/(dashboard)/admin/settings/IdentityTab.tsx`, `SecurityTab.tsx` — `space-y-5`→`space-y-6`; `IdentityTab.tsx` anche `text-[10px]`→`text-xs`
- `src/app/(dashboard)/admin/settings/NotificationsTab.tsx` — `text-[10px]`→`text-xs`
- `src/components/AdminSidebar.tsx` — `bg-[rgb(4_52_44/…)]`→`bg-brand-dark/6` e `/8`, `text-[10px]`→`text-xs`, uppercase/tracking rimosso (badge contatore sidebar)
- `src/components/FornitoriManager.tsx` — hex→token, `text-[10px]`→`text-xs`, uppercase/tracking rimosso
- `src/components/BrandMark.tsx` — `text-[15px]`→`text-sm` (default prop `textClassName`)
- `src/components/MaintenanceBadge.tsx` — solo riga 40 (`text-[10px]`→`text-xs`, label obbligo statica); **non** la riga 30 (size `xs` vs `sm`, distinzione voluta)

### Letti (solo quelli rilevanti per capire il contesto)
- `DESIGN.md` — fonte delle leggi verificate: scala tipografica (righe 27-63), scala spaziatura (68-74), regola `border-l-4`↔`MaintenanceCard` (247/283/293), regola eyebrow ritirata (196/206/289), "mai p-5" (246)
- `src/app/globals.css` — confermato: colori cablati in `@theme` (quindi hex→token è no-op visivo verificato), **nessun token tipografico** (`--text-*`) esiste — la scala di DESIGN.md è solo documentazione
- `.claude/skills/impeccable/scripts/detector/registry/antipatterns.mjs`, `reference/typeset.md`, `reference/audit.md` — vocabolario usato in FASE 0 (`border-accent-on-rounded`/`side-tab`, `design-system-color`, `wide-tracking`)
- `docs/handoffs/HANDOFF_dashboard_responsive_09_15_19_56.md` — handoff del blocco precedente, punto 6 della sua lista "Prossimi passi" è l'origine di questo blocco
- Import graph di `MaintenanceCard`/`MaintenanceBadge`/`PriorityBadge`, `ui/Table`/`ui/Input`, `BrandMark`, `InstallPrompt` — per stabilire perimetro reale dashboard vs `(app)` prima di ogni edit

## Decisioni chiave
- **Ordine meccanico→visivo**: prima le sostituzioni a resa identica (colori, spaziatura fuori scala verso valori già in uso), poi quelle che cambiano l'aspetto (maiuscole, bordi), ciascuna approvata da Filippo a 390/1280 prima della successiva. Scartato fare tutto in un commit unico.
- **Commit "text-[13px]→token label" scartato**: la premessa era che esistesse un token/utility per il ruolo Label (13px) in Tailwind. Verificato in `globals.css`: non esiste nessun `--text-label`/`--text-micro`, solo i colori sono cablati in `@theme`. Senza token non c'è nulla a cui sostituire l'arbitrary value — introdurlo ora sarebbe un'aggiunta di infrastruttura, non una pulizia. Rimandato a un blocco a sé (vedi Domande aperte).
- **10/11/15px → text-xs/text-sm senza adottare un ruolo**: per lo stesso motivo, la convergenza a 12/14px non è "adozione del ruolo micro/body" di DESIGN.md — è solo riduzione di tre valori arbitrari a quelli Tailwind stock già dominanti nel codice. Il messaggio di commit lo dichiara esplicitamente per non far sembrare la scala tipografica più cablata di quanto sia.
- **Esclusioni da PWA-shared**: `MaintenanceCard.tsx` e `PriorityBadge.tsx` sono usati solo in `(app)`, mai in `(dashboard)` — esclusi interamente. `ui/Table.tsx`/`ui/Input.tsx` (condivisi) sono stati toccati solo per il commit 2 (poi scartato); nessuna modifica è finita in un file condiviso con la PWA in questo blocco.
- **`MaintenanceBadge.tsx` riga 30 esclusa**: `size="xs"` (10px) è distinta apposta da `size="sm"` (12px, default) — sono due misure di badge diverse per contesti diversi, non un valore arbitrario per drift. Convergerle a 12px avrebbe cancellato la distinzione, non pulito un errore.
- **`border-l-4` rimosso senza sostituto**: in `administrators/*` lo sfondo tinto della card (`bg-semantic-red-bg`/`amber-bg`) resta l'unico segnale, già sufficiente. In `ManutenzioniClient.tsx:550` il bordo era il terzo segnale ridondante: `MaintenanceBadge` (pillola colorata) e il testo "in ritardo da N giorni"/"in corso" (colorato) restano intatti e bastano da soli.
- **F3b non risolto in questo blocco**: `#6B7A74` (valore *ritirato* di `text-secondary`, sotto soglia AA) in `lib/notifications.ts` e `#6B7280` (terzo grigio, mai stato un token) in `lib/pdf/*.tsx` sono fuori perimetro dashboard. Registrati come debito, non toccati.

## Stato attuale
### Funziona
- `npm run verify` verde su ogni commit di questo blocco (`4086471`, `ba02c68`, `bf663df`, `b426671`, `cda14cf`), solo il warning noto preesistente su `src/app/api/reconcile-documents/route.ts:12`.
- **Verificato da Filippo a 390 e 1280**: commit 1+3+4 insieme (nessuna resa inattesa) e commit 5 (le etichette si distinguono ancora dal valore senza maiuscole/tracking).

### Non funziona / da verificare
- **Commit 6 (border-l-4) non ancora verificato a schermo da Filippo** — è l'ultimo della sessione, fatto subito prima di questo handoff.
- **`main` è avanti di 42 commit su `origin/main`** (37 del blocco responsive + 5 di questo blocco), ancora non pushati — preesistente, non toccato qui.
- **`CLAUDE.md` modificato nel working tree** (+10 righe): preesistente da una sessione precedente, non toccato in questo blocco. Segnalato anche nell'handoff precedente come pendenza fuori blocco.
- **8 file di handoff non tracciati** in `docs/handoffs/`, precedenti a questa sessione — non toccati.

## Prossimi passi
1. **Filippo a 390 e 1280**: verificare `administrators/page.tsx`, `administrators/[id]/page.tsx` (card senza bordo laterale, sfondo tinto ancora leggibile come segnale) e `manutenzioni/ManutenzioniClient.tsx` (card evento senza bordo, badge+testo colorato ancora leggibili).
2. **Push**: dopo la verifica del commit 6, `git push origin main` (42 commit accumulati, includendo il blocco responsive precedente).
3. **Pendenza preesistente**: decidere su `CLAUDE.md` modificato nel working tree (+10 righe, non di questa sessione) e sugli 8 handoff non tracciati.
4. **Blocco infrastruttura tipografica** (separato, non estetico): valutare se introdurre `--text-display`/`--text-headline`/`--text-title`/`--text-body`/`--text-label`/`--text-micro` in `globals.css` per cablare la scala di DESIGN.md in classi Tailwind reali. Oggi la scala esiste solo come documentazione; ogni pulizia futura di `text-[Npx]` arbitrari si scontra con la stessa assenza già incontrata in questo blocco.
5. **F3b — grigi fuori palette in output non-dashboard**: `#6B7A74` (valore text-secondary ritirato, sotto soglia AA) in `lib/notifications.ts` (email transazionali) e `#6B7280` in `lib/pdf/ReportDocument.tsx`/`FascicoloDocument.tsx` (mai stato un token). Blocco a sé quando si toccano email/PDF.
6. **Wizard `residences/new`**: resta fuori perimetro, con gli stessi tre debiti di stile mai affrontati lì (visti di striscio durante i grep di questa sessione: `space-y-5`, `p-5` multipli).

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production (serve per il service worker)
npm run build && npm start

# gate pre-commit
npm run verify

# commit di questa sessione
git log --oneline a56fd29..HEAD
```

## Domande aperte
- **Infrastruttura tipografica**: vale la pena aprire il blocco per i 6 token `--text-*` in `globals.css`, o si resta con `text-xs`/`text-sm`/arbitrary value caso per caso? Condiziona ogni pulizia futura di dimensioni testo.
- **`text-[13px]` in `ui/Table.tsx`/`ui/Input.tsx`**: resta com'è (nessun token da adottare) o si introduce il token label prima, poi si migra? Dipende dalla risposta sopra.
- **Wizard `residences/new`**: quando entra in un blocco, eredita le stesse regole di questo (mechanical-first, p-5→p-6, ecc.) o merita un audit proprio?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione "Regole di codice ricorrenti"**: `Prima di proporre una sostituzione "a rischio zero" di un valore arbitrario verso un token dichiarato in DESIGN.md, verificare che il token sia davvero cablato in Tailwind (grep in globals.css / tailwind.config, non fidarsi della sola documentazione in DESIGN.md). La scala colori di DESIGN.md è cablata in @theme; la scala tipografica (display/headline/title/body/label/micro) oggi non lo è — è solo prosa. Trovata in sessione: un commit pianificato per "text-[13px] → token label" è stato scartato a metà lavoro perché il token non esiste.`

- **Sezione "Regole di codice ricorrenti"**: `Prima di rimuovere o convergere un valore che sembra arbitrario (dimensione, bordo, colore), controllare se alimenta una distinzione voluta tra varianti dello stesso componente (es. una prop size che rende due misure deliberatamente diverse). Un valore "fuori scala" non è sempre drift: a volte è la scala che non lo prevede ancora. Trovata in sessione: MaintenanceBadge.tsx size="xs" (10px) vs size="sm" (12px) — escluso dalla convergenza a 12px per questo motivo.`

- **Sezione "Metodo di lavoro"**: `Prima di editare un file usato da più superfici (dashboard + PWA, o dashboard + componente legacy), verificare l'albero degli import (grep "from .*NomeFile") per capire quali route lo montano davvero, non fidarsi del nome del file o della cartella. Trovata in sessione: MaintenanceCard.tsx e PriorityBadge.tsx sembravano condivisi ma sono montati solo in (app); MaintenanceBadge.tsx invece è montato solo in (dashboard) nonostante il nome gemello.`

Nessun'altra legge oltre queste tre. Filippo valuta se promuoverle.
