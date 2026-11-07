# Handoff — Tab Parti comuni (E1b commit 9) · 07/11/2026 11:15

## Sommario
Aggiunto alla pagina Documenti della residenza (`DocumentiClient.tsx`) il tab "Parti comuni": la checklist dei documenti attesi, che stava in fondo alla Panoramica come "Da caricare / Escluse dalla consegna", si è spostata nel tab (non duplicata). Ogni riga è cliccabile per intero: la caricata apre il pannello laterale, la mancante apre la modale di caricamento con destinazione Residenza e tipo già scelto. Tre commit sequenziali su `main`, nessuna modifica a classify-document, migrazioni, RLS o `completions`.

## Lavoro completato
- [x] FASE 0 con decisioni D1-D4 approvate
- [x] Commit 1 `6974257` — regola pura `common-documents.ts` + `verify:common` (31 casi, mutazione provata: rosso se vince il documento meno recente)
- [x] Commit 2 `8e2c8ef` — tab, righe, spostamento della checklist, rimozione di `MissingDocumentsSection`/`SCOPE_LABELS`
- [x] Commit 3 `3a4cd97` — caricamento dalla riga mancante (preset con unità nulla), provato su TEST wizard A con ripristino
- [ ] Handoff / promozione leggi (questo documento)

## File toccati
### Creati
- `src/lib/common-documents.ts` — `commonDocuments(checklist, docs)`, `commonBadge`, `commonScopeLabel`: righe, escluse, contatore caricati/totale, documento più recente per voce, categoria da `DOC_TYPE_TO_CATEGORY`
- `scripts/verify-common-documents.mjs` — 31 casi (script `verify:common` in `package.json`)
- `src/app/(dashboard)/admin/residences/[id]/documenti/CommonDocumentsList.tsx` — tab: righe (`CommonRow`), escluse compresse (`ExcludedRow`), stato "non disponibile" con Riprova, warning, nota documenti non classificati

### Modificati
- `package.json` — script `verify:common`
- `.../documenti/DocumentTabs.tsx` — voce `parti-comuni` prima di `da-rivedere`; `counts` accetta numero o testo (`badgeVisible`)
- `.../documenti/DocumentiClient.tsx` — `common = useMemo(commonDocuments)`, badge, pannello sempre montato con `hidden`, `UploadPreset` (unitId nullable, category nullable), `openUploadForCommon`, banner "per Parti comuni", opzione "Scegli categoria…" se tipo senza categoria; rimossi `MissingDocumentsSection`, `MissingRow`, `ExcludedRow`, `SCOPE_LABELS`, `scopeLabel`

### Letti (rilevanti)
- `src/lib/document-checklist.ts` — fonte della checklist (`computeResidenceChecklist`, `matchingDocuments`, scope condominium/dossier_admin/residence)
- `src/lib/unit-documents.ts:214` — `otherVersions` ritorna `[]` con `unit_id` null
- `src/lib/document-classification.ts:72` — `DOC_TYPE_TO_CATEGORY` (esisteva già)
- `.../documenti/ReviewList.tsx`, `UnitDocumentMatrix.tsx` — precedenti del pattern riga cliccabile e del preset di caricamento

## Decisioni chiave
- **D1 Non applicabile**: resta nella riga, in un contenitore fratello con `stopPropagation`, solo super_admin (`canManageChecklist`), come in `ReviewList`. Scartato: spostarlo altrove (UX non richiesta). Le escluse restano in coda, sezione compressa.
- **D2 Categoria**: riusata `DOC_TYPE_TO_CATEGORY`; per tipi non mappati categoria NON precaricata (placeholder disabilitato), mai un fallback indovinato. Un caso del verify fa fallire una futura voce senza categoria.
- **D3 Scope**: tutti e tre gli scope nel tab; etichetta d'ambito solo dove differisce da "Parti comuni" (Dossier amministratore, Residenza). Conseguenza: le escluse `condominium` non mostrano più "Parti comuni".
- **D4 Contatore**: caricati/totale, totale senza le non applicabili; badge sempre visibile se totale > 0 (anche 0/N), nascosto se checklist non disponibile, stile neutro (non ambra).
- **Più documenti sulla voce**: la riga apre il più recente per `created_at`, stabile a parità. Gli altri restano raggiungibili da "Tutti i documenti".
- **Documento citato dalla checklist ma assente da `docs`**: riga "caricata" con `doc: null`, non cliccabile (checklist e docs sono due letture separate).
- **Esclusa ma soddisfatta**: va in `excluded`, non conta tra i caricati.
- **Ordine tab**: Panoramica, Tutti i documenti, Parti comuni, Da rivedere (scelta mia, non specificata).

## Stato attuale
### Funziona
- `npm run verify` pulito (tsc + lint); `verify:common` 31, `docreview` 92, `doctable` 107, `unitdocs` 57, `panel` 41, `docdelete` 43, `docunit` 18, `contrast` 12
- Santa Giustina (sola lettura): tab 3/17, clic su riga caricata apre il pannello giusto, console pulita, 0 elementi interattivi annidati
- TEST wizard A: clic su "Polizza decennale postuma" → modale "per Parti comuni", categoria Amministrativi, upload con `unit_id` null, classificata `polizza_decennale`, tab 1/18 → 2/18; documento cancellato per id, `documents` tornata a 1 riga (`test-r3`)

### Non funziona / da verificare
- Ramo "Scegli categoria…" non provato nel browser (oggi irraggiungibile: tutti i 14 tipi del tab hanno categoria)
- Invio/Spazio da tastiera sulla riga non provati a mano (sono `<button>` nativi)
- Non verificato se l'upload scrive un evento nel registro attività (dopo il ripristino potrebbe restarne uno)
- File orfano nel bucket `documents`: `8e309f07-c274-43af-b7a5-7af53fed9a51/amministrativi/1794046295423_test-parti-comuni.pdf` (già nel backlog degli orfani)
- Voce con unico documento assegnato a un'unità (es. polizza decennale Santa Giustina) resta "Da caricare": regola della checklist, non toccata
- `otherVersions` vuoto per documenti senza unità: sulle voci con più documenti (3 garanzie su Cavaccio) il pannello non mostra "altre versioni"
- `docs/handoffs/fix-classify-piano.md` è non tracciato da prima di questa sessione

## Prossimi passi
1. Decidere se mostrare le "altre versioni" nel pannello per i documenti senza unità (oggi `unit-documents.ts:214`), partendo dalle voci con più documenti (garanzie Cavaccio).
2. Provare a mano Invio/Spazio e Tab sulle righe del tab (focus visibile) e il caso `doc: null`.
3. Controllare in `activity` se l'upload di prova ha lasciato un evento e deciderne il ripristino.
4. Valutare se "Polizza decennale" con documento solo su un'unità debba almeno avere un'indicazione nella riga.

## Comandi da rilanciare
```bash
npm run dev
npm run verify
npm run verify:common
```

## Domande aperte
- Ordine dei tab: va bene "Parti comuni" prima di "Da rivedere"?
- Le escluse `condominium` senza etichetta "Parti comuni": accettabile?

## Leggi emerse (candidate per CLAUDE.md)
- **Regole di codice**: Righe cliccabili per intero: il click vive sul `<li>`, dentro c'è un solo `<button>` nativo (tastiera e screen reader; Invio/Spazio generano un click che risale alla riga) e le azioni secondarie stanno in un contenitore fratello con `stopPropagation`. Mai un elemento interattivo dentro un altro. Esempi: `ReviewList.tsx`, `CommonDocumentsList.tsx`.
- **Regole di codice**: Categoria precaricata nel caricamento solo da `DOC_TYPE_TO_CATEGORY` (`src/lib/document-classification.ts`). Se il tipo non ha categoria mappata, nessun valore precaricato (placeholder disabilitato): mai un fallback indovinato.
- **Metodo di lavoro**: Un verify che protegge una regola va provato rotto a mano prima del commit (si inverte la regola, si vede almeno un caso rosso, si ripristina e si confrontano hash e `git diff`).
