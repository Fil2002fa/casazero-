# Fix classify-document: errori scartati in silenzio. Piano (FASE 0)

Stato: **solo diagnosi, nulla implementato, nessun commit.** Base: HEAD `8fcfef4`, `git status` pulito all'apertura.
Il commit non si fa finché l'altra sessione ha codice non committato.

## Vincoli
- Una route (`src/app/api/classify-document/route.ts`) più un modulo puro e il suo script verify. Nessuna UI, nessun JSX.
- `DocumentiClient.tsx` non si tocca: conosce già `write_error` e 500 (`batch-failures.ts:51`).
- Pattern: R1b (8b6ae11), "Errore tecnico, riprova" distinto dai messaggi di dominio, `.maybeSingle()` dove serve.

## Riscontri A-N
Legenda: T = errore tecnico (500, "Errore tecnico, riprova"); D = esito di dominio (messaggio in italiano).

| # | Riga | Chiamata | Oggi | Corretto |
|---|---|---|---|---|
| A | `route.ts:134` | `auth.getUser()` | `error` mai letto: rete/servizio giù diventa `user=null`, 401 "Non autenticato", il client mostra "sessione scaduta" | T (500) |
| B | `route.ts:139-146` | select `profiles` `.single()` | errore tecnico diventa `profile=null`, 403 "Permessi insufficienti" | T (500); il 403 solo per ruolo non ammesso |
| C | `route.ts:166-172` | select `documents` `.single()` | errore tecnico diventa 404 "Documento non trovato" | T; il 404 solo con `.maybeSingle()` null |
| D | `route.ts:185-192` | select `residences` | `error` scartato, guasto diventa 404 | T |
| E | `route.ts:194-200` | count `admin_assignments` | `error` scartato, `count=null` diventa 404 | T |
| F | `route.ts:212` | update `in_corso` | esito ignorato, si procede e si spende la chiamata AI | T, fermare con 500 prima dell'AI |
| G | `route.ts:226-231`, `236-241` | update `da_revisionare` (non PDF, oltre 32MB) | esito ignorato: 200 al client, DB resta `in_corso` | T, `write_error` |
| H | `route.ts:336-345` | update finale della classificazione | **il più grave**: esito ignorato, 200 `status: finalStatus`, DB resta `in_corso`, risposta AI persa; il batch può accodare l'estrazione (`DocumentiClient.tsx:445`) su un documento non `completata` | T, `write_error` |
| I | `route.ts:372` | rollback a `non_classificato` (servizio giù) | esito ignorato, documento può restare `in_corso` | il 503 resta; loggare la scrittura fallita |
| J | `route.ts:379` | scrittura `fallita` | esito ignorato, documento può restare `in_corso` | `document_error` resta; loggare la scrittura fallita |
| K | `route.ts:379-380` | catch `document_error` | nessun `console.error` del messaggio (`extract-document/route.ts:413` lo fa) | aggiungere il log con `documentId` |
| L | `route.ts:105-113` | `isServiceUnavailableError` | non include `NotFoundError`, `PermissionDeniedError`, `BadRequestError`: possibile config scambiata per problema del documento. **Ipotesi, non provata.** | **fuori da questo commit** (decisione 2) |
| M | `route.ts:349` | `refreshUnitProposal` | esito `{ok:false}` ignorato, ma i tre rami loggano già (`document-unit-proposal.server.ts:29,44,64`); voluto e commentato | nessuna modifica |
| N | `route.ts:215-221` | download storage | `downloadError` controllato ma finisce in `fallita`/502, cioè "colpa del documento" | T: 500 + rollback a `non_classificato` (decisione 3) |

Esiti Anthropic: tutti dentro try/catch (`route.ts:249-281`), nessuno scartato; i buchi sono K e L.

## Effetto sul caricamento multiplo (E1b 11)
`classifyDocuments` (`DocumentiClient.tsx:429-467`) è sequenziale; un fallimento non ferma gli altri tranne `service_unavailable`.
- F, G, H rispondono 200: il client non incrementa `failures`, nessun banner. Il documento resta `in_corso`.
- `pendingClassification` (`DocumentiClient.tsx:281-283`) prende solo `non_classificato` e `fallita`, mai `in_corso`: il bottone "Classifica documenti" non lo riprende, la tabella mostra "In classificazione" (`document-rows.ts:175`) per sempre.
- Caso H: possibile estrazione accodata su un documento non `completata`, risposta 409 `not_extractable` non contata come fallimento.
- Dopo il fix A-E: un guasto tecnico appare come `errore_server` invece di "sessione scaduta" / "non accessibile".

## Decisioni
1. **Deroga approvata** (B14): `classify-document` non è più "byte-identica"; riusa `authorizeDocumentActor` (`src/lib/document-access.ts:41`). Aggiornare il commento in `document-access.ts:9` e il commento di duplicazione in `route.ts:174-183`.
2. **L fuori da questo commit.**
3. **N = errore tecnico**: 500 `write_error`-style (`Errore tecnico, riprova`) più rollback a `non_classificato`.
4. **Documenti già `in_corso`:** solo SELECT read-only, nessuna scrittura.

## Esito SELECT (read-only, progetto `kuvekkseclhhcamojysj`, 2026-11-07)
```sql
select d.id, d.title, d.residence_id, r.name as residence_name, d.created_at
from documents d left join residences r on r.id = d.residence_id
where d.classification_status = 'in_corso'
order by d.created_at;
```
Risultato: **0 righe.** Nessun documento oggi bloccato in `in_corso`, quindi nessun intervento di sblocco necessario.
Nota: il primo tentativo con `d.updated_at` ha dato errore 42703, la colonna non esiste su `documents`; nessun effetto.

## Piano commit (uno solo)
**Commit 1: classify-document, error non più scartato**
- `src/app/api/classify-document/route.ts`: A-K e N; `ClassificationWriteError` locale; A-E tramite `authorizeDocumentActor` più `error` da `getUser()`; helper di scrittura con controllo `error`; commento aggiornato.
- `src/lib/document-access.ts`: solo il commento alla riga 9.
- Modulo puro in `src/lib` con la logica da provare (helper di scrittura e mappatura esito, client iniettato).
- `scripts/verify-classify-write.mjs` e riga `verify:classifywrite` in `package.json`.

**Prova senza browser:** `npm run verify:classifywrite`. Un finto client Supabase con `update()` che torna `{ error: { message: 'forzato', code: 'XX000' } }`:
- l'helper lancia `ClassificationWriteError`, il catch produce 500 con `cause: 'write_error'`;
- `classifyBatchFailure({ status: 500, cause: 'write_error' })` dà `errore_salvataggio`;
- con `getUser`, profilo, documento, residenza, conteggio e storage in errore forzato, ogni ramo dà 500 "Errore tecnico, riprova" e mai 401/403/404;
- guasto storage: rollback a `non_classificato` richiesto e risposta 500;
- stesso client senza errore: 200 invariato.
Poi `npm run verify` con output integrale, diff mostrato prima del commit.

**Non coperto dalla prova:** il wiring reale con il vero client Supabase (serve browser o chiamata con sessione).

## Leggi emerse (da proporre per CLAUDE.md)
- Le scritture di stato con `await admin.from(...).update(...)` senza `error` sono la stessa bug class del select: un update il cui esito condiziona la risposta al client va sempre controllato.
- Uno stato transitorio (`in_corso`) deve sempre avere una via di ritorno: se la scrittura che lo chiude fallisce, va loggata, mai taciuta.

## Prossimo passo
Attendere che l'altra sessione committi o ripulisca il working tree, poi implementare il commit 1.
