# Handoff — Integrazione Home e rifiniture residente da Codex · 12/11/2026 09:31

## Sommario
Sessione di integrazione su `main` del lavoro UI di Codex (worktree `C:\progetti\casazero-codex`, branch `codex/profilo-residente`) per la parte residente: Documenti, Fascicolo e redesign della Home (UX-HOME-02). Ogni diff è stato controllato (solo UI, nessuna modifica a query, permessi, completamenti, DB), committato nel worktree, cherry-pickato su `main` e pushato. Il worktree Codex è stato poi riallineato a `main`, con branch di backup.

## Lavoro completato
- [x] Task 5 Documenti: `84f5843` (titolo e nome file su righe distinte, a capo sui `_ - .`, pulsante "Scarica" esplicito)
- [x] Task 7 Fascicolo: `15ad2b7` (pulsante "Scarica report PDF" primario a tutta larghezza, nota sul perimetro della percentuale di conformità)
- [x] Task 2 Home, versione manuale: `d426382` (titolo con nome residenza e unità, fallback foto compatto con icona, tolto banner "Tutto in ordine" duplicato, card attesa consegna non ripetuta). Il diff di Codex su `page.tsx` NON è stato portato: toglieva `HomeRiepilogo`
- [x] UX-HOME-02: `0c82499` (unica card "Cosa fare adesso", dedupe per ID, accessi a Manutenzioni e Documenti, "Più avanti", filtro promemoria sulle urgenti)
- [x] Fix invariante promemoria: la lista `urgent` in `src/app/(app)/page.tsx` scarta i promemoria (`isInCorso` non li escludeva)
- [x] Push su `origin/main` (`34957ac..d426382`, poi `d426382..0c82499`); check `verify` GitHub e stato Vercel di `d426382` = success
- [x] Worktree Codex riallineato a `main` (due volte); backup `backup-codex-profilo-residente` (16 commit Codex, tutti già su `main` per patch equivalente)
- [x] Patch `docs/handoffs/ux-home-01.patch` salvata (ora obsoleta)
- [ ] Verifica a schermo a 375 px e stato "In attesa di consegna" dopo `0c82499`: NON fatta (QA Chrome Codex solo a 500 px)
- [ ] Deploy Vercel di `0c82499`: non verificato

## File toccati
### Creati
- `docs/handoffs/ux-home-01.patch` — diff intermedio UX-HOME-01 di Codex; non tracciato, obsoleto
- `docs/handoffs/HANDOFF_integrazione_home_codex_11_12_09_31.md` — questo file

### Modificati
- `src/app/(app)/page.tsx` — header con residenza e unità, fallback foto, `riepilogoAwaiting`, `primaryItem`, dedupe, nav accessi, "Più avanti", filtro promemoria su `urgent`
- `src/app/(app)/HomeRiepilogo.tsx` — ora riceve `shown`, `urgentCount`, `awaitingDelivery`; contiene banner rosso, "Tutto in regola", voce mostrata
- `src/app/(app)/documenti/DocumentiList.tsx` — card documento (vedi Task 5)
- `src/app/(app)/fascicolo/page.tsx` — header e conformità (vedi Task 7)

### Letti (rilevanti)
- `src/lib/maintenance-status.ts` — `isOverdueLive` esclude i promemoria, `isInCorso` no
- `src/components/AwaitingDelivery.tsx` — `AwaitingDeliveryHomeCard`

## Decisioni chiave
- **Task 2 rifatto a mano**: il diff di Codex rimuoveva `HomeRiepilogo` (card introdotta da `34957ac`) e il suo calcolo; scartato, applicati solo titolo, fallback foto, rimozione duplicati.
- **Filtro promemoria su `urgent` e non solo su `primaryItem`**: `urgent` alimenta anche banner, contatore e "Da completare"; filtrare solo `primaryItem` avrebbe lasciato il conteggio sporco.
- **Reset del worktree Codex invece di merge**: il branch aveva storia parallela e non conteneva i tipi della 055/056; mai mergiarlo in blocco.
- **Commit messaggi via file senza BOM**: `Set-Content -Encoding utf8` in PowerShell 5.1 aggiunge il BOM; usato `[IO.File]::WriteAllText` con `UTF8Encoding($false)`.

## Stato attuale
### Funziona
- `npx tsc --noEmit` e `npm run verify` (ESLint pulito) su `main` a `0c82499`
- Vercel `success` per `d426382`
- Nessuna query, RLS, completamento o DB toccato in questa sessione

### Non funziona / da verificare
- Home a 375 px e stato "In attesa di consegna" non provati a schermo
- Il conteggio urgenti della Home ora esclude i promemoria `in_corso`: può differire dalla lista Manutenzioni se esistono promemoria con quello stato (non verificato)
- "Altre N voci da seguire" è sparita; "Cosa fare adesso" può mostrare voci di Modalità amministratore (prima solo residente entro 30 giorni)
- Deploy Vercel di `0c82499` non controllato

## Prossimi passi
1. Aprire `/` a 375 px con `lorofilippo2002` e controllare: card unica, nessun duplicato fra "Cosa fare adesso" e "Più avanti", accessi Manutenzioni/Documenti su una o due colonne.
2. Provare l'unità non consegnata (`delivery_date` null): deve comparire solo il messaggio nella card, senza card grigia sotto.
3. Query di sola lettura per verificare se esistono promemoria con `status = 'in_corso'` e confrontare conteggio Home e lista Manutenzioni.
4. Controllare lo stato Vercel di `0c82499` (`gh api repos/Fil2002fa/casazero-/commits/0c82499/statuses`).
5. Decidere se eliminare `docs/handoffs/ux-home-01.patch` e se la modifica locale a `src/app/(app)/manutenzioni/[id]/page.tsx` (43 righe, non mia) va committata.

## Comandi da rilanciare
```bash
# Dev su porta 3000 (con npm run dev -- -p 3000 Next legge 3000 come cartella)
npx next dev --port 3000

npx tsc --noEmit
npm run verify
```

## Domande aperte
- Cosa si intendeva con "B1 e B2" nella richiesta di verifica? Nel repo sono voci di backlog sicurezza non collegate a questi task.
- Va tenuto il branch `backup-codex-profilo-residente`, o eliminato dopo la verifica a schermo?
- Mostrare voci di Modalità amministratore in "Cosa fare adesso" è voluto?

## Leggi emerse (candidate per CLAUDE.md)
- **Invarianti**: Ogni lista che alimenta contatori o card "urgenti/da fare" deve escludere esplicitamente `resolveCompletionMode(i) === 'promemoria'`: `isInCorso` non lo fa, e un promemoria con `status = 'in_corso'` nel DB non deve mai comparire come intervento urgente né mostrare date.
- **Metodo di lavoro**: Prima di integrare un diff di Codex da un worktree, confrontare la base con `git cherry main <branch>` e `git diff main <branch> -- <file>`: il branch può avere storia parallela con commit omonimi e tipi mancanti; mai merge in blocco, solo cherry-pick dei commit nuovi, poi `git reset --hard main` del worktree con branch di backup.
- **Metodo di lavoro**: Su Windows PowerShell 5.1 i file messaggio per `git commit -F` si scrivono senza BOM (`[IO.File]::WriteAllText(path, text, New-Object System.Text.UTF8Encoding($false))`); `Set-Content -Encoding utf8` aggiunge il BOM al titolo del commit.
- **Comandi**: Il dev server si avvia con `npx next dev --port 3000`, non `npm run dev -- -p 3000` (PowerShell/npm passa `3000` come directory del progetto).
