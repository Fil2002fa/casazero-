# Handoff — Manutenzioni residente e guide (lavoro Codex 12–13 novembre 2026)

Data stesura: 2026-11-13. Documento scritto dal worktree principale `C:\progetti\casazero` (branch `main`).
Legenda: **[V]** verificato in sola lettura in questa sessione · **[R]** dal riepilogo dell'utente, non verificato · **[I]** ipotesi.

## 1. Dove si trova il codice Codex

- **Il codice Codex NON è nel worktree principale.** Vive in un worktree separato. **[V]**
  - Worktree: `C:\progetti\casazero-codex` **[V]**
  - Branch: `codex/profilo-residente`, HEAD `45b55d3` "feat: finalize resident maintenance guides v5" **[V]**
- Worktree principale: `C:\progetti\casazero`, branch `main` = `origin/main`, HEAD `69f6093` **[V]**
- Nessun push/merge/rebase/reset eseguito; nulla copiato fra worktree. **[V]**

### Stato Git verificato

| Worktree | Branch | HEAD | Non tracciati |
|---|---|---|---|
| `casazero` | `main` | `69f6093` | 8 file in `docs/handoffs/` (preesistenti: export-per-nuovo-repo, 4 HANDOFF_*, catalogo-testi-35.json.json, prova-awaiting-ripristino.md, ux-home-01.patch) |
| `casazero-codex` | `codex/profilo-residente` | `45b55d3` | solo `supabase/migrations/057_profiles_phone_grant.sql` |

- `057_profiles_phone_grant.sql` esiste solo nel worktree Codex, non tracciato, preesistente. Non toccato. **[V]**
- Altri branch locali: `backup-codex-profilo-residente` (5a426a6), `backup-pre-codex-sync` (cd55dfb), `fix/sicurezza-accesso` (1023f74). **[V]**

### Divergenza main ↔ Codex (importante)

- Merge-base: `0c82499`. `main` ha 5 commit in più, il branch Codex 9 in più (`git rev-list --left-right --count` = 5 / 9). **[V]**
- I commit di base sono presenti su entrambi i lati con **hash diversi** (riscritti/cherry-pick):
  - Profilo residente: main `cd55dfb` ↔ codex `8017858`
  - Lista: main `92480a0` ↔ codex `4b49d7e`
  - Dettaglio: main `8210685` ↔ codex `8169660`
  - Guide: main `1cec41a` ↔ codex `b30296b`
- Solo su `main`: `69f6093` (ripristino riquadro "Dettagli tecnici" per admin/super_admin). Non è nel branch Codex. **[V]**
- Solo su Codex: i 5 commit task 1B–5 (sotto). **[V]**
- Conseguenza: un futuro riallineamento richiede una decisione esplicita (cherry-pick dei 5 commit, merge o rebase). **Non eseguire senza approvazione.** Il diff `main..codex` tocca 16 file. **[V]**

## 2. Commit del lavoro Codex (tutti confermati nel branch) **[V]**

| Task | Commit | Messaggio |
|---|---|---|
| 1B | `13d476e` | add optional maintenance illustrations infrastructure |
| 2 | `8a7d223` | align resident maintenance list with v5 |
| 3 | `c05e89b` | align resident maintenance detail with v5 |
| 4 | `05770ec` | add maintenance guide illustrations from v5 |
| 5 | `45b55d3` | finalize resident maintenance guides v5 |

Il riepilogo dell'utente descrive il task 4 come "estrazione di cinque JPEG originali dal mockup": i cinque file sono presenti in `public/manutenzioni/` (serramento-maniglia-dettaglio, serramento-panoramica, vmc-estrazione-filtro, vmc-sostituzione-filtro, vmc-vano-filtri). **[V]** La provenienza dal mockup è **[R]**.

## 3. File principali (worktree Codex, diff `8017858..45b55d3`: 17 file, +1001/−269) **[V]**

Percorsi sotto `src/app/(app)/manutenzioni/` salvo indicazione:

- `page.tsx`, `ManutenzioniList.tsx` — lista v5
- `[id]/page.tsx` — dettaglio v5 (usa gli ID template delle due guide, righe ~168–169)
- `[id]/guida/page.tsx`, `GuideExperience.tsx`, `guide-v5.module.css` — esperienza guida
- `guide-eligibility.ts` — motore di idoneità alla guida
- `maintenance-illustrations.ts` — mappa illustrazioni opzionali per template (ID VMC filtri e serramenti)
- `MaintenanceHeader.tsx`, `MaintenanceIllustration.tsx`, `maintenance-v5.module.css`
- `src/components/BottomNav.tsx` — navigazione mobile
- `public/manutenzioni/*.jpg` — 5 immagini

Mockup approvato **[R]**: `C:\Users\raffa\Documents\casazero-manutenzioni-mockup-v5.html` (bianco #FFFFFF, verde #0b5149, titoli serif, header CasaZero, card v5, nav mobile). Il file non è stato aperto in questa sessione.

## 4. Guide: stato e idoneità

- Template abilitati **[V]** (presenti in `maintenance-illustrations.ts` e nel dettaglio):
  - VMC sostituzione filtri `010214e7-7058-4d5d-a70c-69654aa66fa0`
  - Controllo/lubrificazione serramenti `132b0e68-61e1-420b-adc6-e54703f49415`
- VMC pulizia condotti `70b3f1dd-f0ad-427c-9d38-f99143900778` esclusa **[R]**; non compare nel motore guide né nelle illustrazioni **[V]**.
- `guide-eligibility.ts` (**[V]**): `isResidentGuideAvailable` richiede tutti insieme: ruolo cliente, unità propria, voce di appartamento, `completionMode === 'residente'`, `activationStatus === 'inclusa'`, template attivo, e **allowlist chiusa** (`REVIEWED_PROCEDURES`) con confronto esatto di titolo, "chi lo fa" e passi. Un testo modificato nel DB esce automaticamente dalla guida.
- Le guide sono consultive: nessun checkbox, nessuna registrazione automatica **[R]**; coerente con la struttura osservata nel codice (nessuna scrittura nei file guida letti) ma non verificata riga per riga.

## 5. Problema prioritario: guide ↔ documentazione dell'impianto

Fatto **[V]**: i testi delle due guide rimandano a fonti esterne senza collegamento:
- VMC: "Spegni l'unità come indicato nel manuale." / "…se il manuale lo permette."
- Serramenti: "Usa solo il lubrificante indicato dal produttore." / "…lubrificare solo dove lo indica il manuale."

Fatto **[V]**: `src/lib/document-checklist.ts` (`DERIVED_MAP`) dichiara attese documentali per template: per VMC filtri e VMC condotti `dich_conformita_dm37` + `manuale` con `sistema: 'vmc'`, scope `residence`. Per i serramenti non ho trovato (ricerca puntuale sull'ID) una voce analoga.
**[I]** Questa mappa descrive i documenti *attesi*, non prova che siano stati caricati né associati all'impianto/unità corretti. Da verificare con query reali (fuori scope di questa sessione).

Altro, **[R]/[I]**: il numero di 35 manutenzioni attive + 10 template legacy disattivati è ricostruito dal repository e non certificato dal DB live. I quattro testi procedurali non abilitati nel repo non sono stati ispezionati qui. `docs/handoffs/catalogo-testi-35.json.json` (non tracciato su main) è probabilmente correlato **[I]**.

## 6. Decisioni UX **[R]** (approvate visivamente dall'utente)

- Design v5: bianco, verde #0b5149, serif per i titoli, header CasaZero, card v5, nav mobile.
- Guide consultive, senza checkbox, completamenti sempre separati.
- Illustrazioni opzionali (infrastruttura dedicata, task 1B).
- Test TypeScript e `verify` dichiarati passati nei report di implementazione **[R]** — **non rieseguiti qui**.

## 7. Vincoli (da rispettare nella ripresa)

- Non modificare DB, RLS, completamenti, cadenze, Super Admin o produzione.
- Non toccare `supabase/migrations/057_profiles_phone_grant.sql`.
- Niente merge, reset, rebase o push; niente copia automatica fra worktree.
- Non sovrascrivere `CLAUDE.md`; proposte alle leggi solo in "Leggi emerse".
- Invarianti di CLAUDE.md rilevanti: `completions` immutabile; promemoria mai "scaduta"; piano ≠ fascicolo; nomenclatura Modalità/Tipo (mai N1/N2/N3 in codice nuovo, salvo dual-write `priority`).
- Regola di metodo: FASE 0 read-only con STOP prima di ogni modifica; `npm run verify` con output completo prima di ogni commit.

## 8. Questioni aperte

1. **Strategia di riallineamento** main ↔ `codex/profilo-residente` (hash divergenti, `69f6093` solo su main).
2. **Collegamento documenti ↔ guida**: come associare documento, residenza, unità, impianto (`sistema`), produttore e modello; cosa significa "manuale verificato".
3. **Estensione della consultazione** a parti comuni e promemoria: oggi `isApartmentItem` e `completionMode === 'residente'` la escludono. Serve decisione architetturale che separi *consultazione* da *registrazione*, coerente con l'invariante promemoria.
4. **Conteggio manutenzioni** (35/10) da certificare sul DB live con query SELECT.
5. **Revisione tecnica dei testi** delle due guide esistenti (fonti, formule come "come indicato nel manuale").
6. Destino di `057_profiles_phone_grant.sql`.

## 9. Piano di ripresa (proposto)

1. FASE 0 read-only su Documenti: schema tabella documenti, come si legano a residenza/unità/sistema, `document-checklist.ts` e UI `admin/residences/[id]/documenti`, viste lato residente. Query SELECT sul DB per verificare se esistono manuali VMC/serramenti caricati e collegati. STOP per approvazione.
2. Proposta UX con tre stati: manuale verificato (link diretto), documento non verificato (avviso), manuale assente (messaggio + a chi rivolgersi).
3. Revisione dei testi delle due guide (nuova versione dell'allowlist e migrazione solo previa approvazione).
4. Progettazione guide informative vs operative per le altre manutenzioni; decisione su consultazione vs registrazione.
5. Estensione progressiva solo dopo verifica fonti e approvazione. Un concern per commit.
6. Decidere come portare i 5 commit Codex su `main`.

## 10. Cosa NON è stato fatto in questa sessione

Nessuna modifica al codice, al DB o ai worktree; nessun commit; `npm run verify` non eseguito; mockup HTML non aperto; DB live non interrogato.
