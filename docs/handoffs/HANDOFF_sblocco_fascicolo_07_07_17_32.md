# Handoff — Sblocco fascicolo (azione admin + vista super_admin + PDF) · 07/07/2026 17:32

## Sommario
Sessione per sbloccare il fascicolo prima della demo Furlan: la FASE 0 ha smontato due premesse sbagliate del task (l'azione di completamento admin esisteva già, i completamenti non erano 0) e ha isolato la vera causa — un gate che leggeva lo `status` salvato invece dello stato live, invisibile perché il cron non gira in locale. Da lì: fix del gate, verifica dell'accordion fascicolo già in produzione, nuova vista tabellare del fascicolo per super_admin con export PDF, e un fix di determinismo su una query `.limit(1)` senza `ORDER BY` segnalato da Filippo come rischio concreto sulla demo (non debito rimandabile).

## Lavoro completato
- [x] FASE 0 read-only: verificata esistenza/montaggio dell'azione admin, causa reale del "nessuna azione" negli screenshot, stato reale dell'accordion fascicolo, conteggio reale dei completamenti — tutto con query dirette su Supabase, non assunzioni
- [x] COMMIT A (`4d2a68e`): gate dell'azione di completamento admin corretto da `status`/priorità legacy N3 a stato live (`isOverdueLive`/`isInCorso`/`resolveCompletionMode`)
- [x] Verifica manuale di Filippo: 3 completamenti generati da UI come `filippoloro02`, coprono i 3 casi nota/allegato/vuoto (su item diversi da quelli originariamente indicati, riconciliato con query dirette)
- [x] COMMIT B: nessun commit necessario — l'accordion note/allegati nel dettaglio admin residenza era già in produzione da tre commit precedenti (`6c06a83`+), verificato funzionante sui 3 completamenti reali
- [x] COMMIT C (`e432df8`): nuova vista `/admin/residences/[id]/fascicolo` — tabella completamenti per super_admin (Data/Voce/Unità/Registrato da/Allegato), nessun filtro `activation_status` (invariante piano≠fascicolo), empty state senza illustrazioni
- [x] COMMIT D (`72fbc0d`): download PDF del fascicolo via `/api/fascicolo-pdf`, bottone "Scarica fascicolo (PDF)" in testata, pluralizzazione italiana via helper condiviso
- [x] Fix determinismo (`be52b0c`): `ORDER BY created_at` esplicito sui rami `admin` e `super_admin` di `(app)/fascicolo/page.tsx`, che sceglievano "la" residenza/assegnazione con `.limit(1)` senza ordine — rischio concreto di mostrare la residenza sbagliata in demo, non solo estetico
- [x] Due audit `/impeccable` (COMMIT A+C separati, COMMIT D insieme) — nessun P0/P1 bloccante, 8 finding in backlog
- [ ] Backlog accessibilità (8 finding) non risolto — rimandato a un giro unico di `/impeccable harden`

## File toccati
### Creati
- `src/app/(dashboard)/admin/residences/[id]/fascicolo/page.tsx` — tabella completamenti residenza per super_admin
- `src/app/(dashboard)/admin/residences/[id]/fascicolo/loading.tsx` — skeleton coerente con le altre route della residenza
- `src/lib/pdf/FascicoloDocument.tsx` — documento PDF minimale che replica le colonne della tabella (distinto da `ReportDocument.tsx`, che resta il report annuale ricco)
- `src/app/api/fascicolo-pdf/route.ts` — route Node.js (`runtime = 'nodejs'`) che genera il PDF, auth ristretta a super_admin del builder proprietario

### Modificati
- `src/app/(dashboard)/admin/manutenzioni/[id]/page.tsx` — `canAct` ora usa stato live (`isOverdueLive`/`isInCorso`/`resolveCompletionMode`) invece di `status`/`priority==='N3'`; passato `effectiveStatus` a `N3AdminActions`
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — bucket Scadute/In corso/Pianificate ricalcolati su stato live invece che su `status` salvato; `ItemCard` idem
- `src/app/(dashboard)/admin/residences/[id]/page.tsx` — aggiunta card "Fascicolo" con conteggio completamenti tra le "porte" di gestione residenza
- `src/app/(app)/fascicolo/page.tsx` — `ORDER BY created_at ascending` esplicito sui rami `admin` e `super_admin` che scelgono la residenza/assegnazione primaria

### Letti (solo quelli rilevanti per capire il contesto)
- `CLAUDE.md`, `docs/handoffs/HANDOFF_leak_activation_status_07_06_17_45.md` — stato di partenza sessione, bug class nota su `activation_status`
- `src/components/N3AdminActions.tsx`, `src/app/(dashboard)/admin/manutenzioni/actions.ts` — flusso di completamento admin esistente (`completeN3`/`takeChargeN3`), confermato già funzionante
- `src/lib/maintenance-status.ts` — fonte di verità per stato live, riusata nei fix
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — accordion fascicolo già committato, verificato non essere nel working tree
- `src/app/api/report/route.ts`, `src/lib/pdf/ReportDocument.tsx` — pattern PDF esistente riusato per stile e convenzioni in COMMIT D
- `src/types/database.ts`, `src/lib/pluralize.ts`, `src/lib/formatUnitLabel.ts` — tipi e helper condivisi

## Decisioni chiave
- **Fix mirato del gate invece di redesign completo (COMMIT A)**: la spec originale del task descriveva una modale nuova con campi diversi da quelli esistenti; FASE 0 ha mostrato che l'azione esisteva già e funzionava, solo nascosta dal bug status-vs-live. Scelto un fix chirurgico (stessi form/label esistenti, solo cambiato *quando* si mostrano) invece di sostituire `N3AdminActions` — meno rischio, sblocca subito, coerente con "un concern per commit". Il redesign a modale resta un'opzione futura se ancora voluta dopo aver visto il fix minimo in azione.
- **Banner "Scadenza" non corretto**: stesso identico bug (legge `status` grezzo) nel banner in testa al dettaglio item admin (`[id]/page.tsx` righe ~116-133), ma esplicitamente lasciato fuori scope perché il concern approvato era solo "canAct/classificazione bucket". Debito noto, non silenzioso.
- **Vista fascicolo super_admin come pagina nuova, non estensione**: non riusata né l'accordion di `ManutenzioniClient.tsx` (raggruppato per categoria/tipo, pensato per la gestione piano) né `(app)/fascicolo/page.tsx` (timeline per residente/admin) — la spec di COMMIT C (tabella flat con colonne precise) non corrispondeva a nessuna delle due, quindi nuova route dedicata `/admin/residences/[id]/fascicolo`.
- **PDF fascicolo separato dal report annuale esistente**: `FascicoloDocument.tsx` è un documento nuovo e minimale (solo le colonne della tabella), non un'estensione di `ReportDocument.tsx` (che include conformità e voci scadute, scope diverso). Riusata la stessa palette/stile per coerenza visiva tra i due PDF del prodotto.
- **Fix `ORDER BY` esteso ad admin oltre a super_admin**: Filippo aveva segnalato solo il ramo super_admin; esteso anche al ramo admin perché stesso identico pattern (`.limit(1)` senza ordine) e stesso rischio concreto con l'account di demo `filippoloro02` (assegnato a 2 residenze). Il ramo `client` non è stato toccato: strutturalmente un residente ha una sola unità attiva, non lo stesso rischio.
- **Nessun fix del `border-l-4`**: pattern segnalato dall'hook `/impeccable` come anti-pattern (side-stripe border) in tutte le card di stato, ma preesistente e diffuso su più file. Lasciato invariato, in backlog come decisione da prendere esplicitamente (confermarlo o sostituirlo), non deciso unilateralmente in questa sessione.

## Stato attuale
### Funziona
- Azione "Segna completata"/"Prendi in carico" ora visibile sugli item admin scaduti live anche con `status` salvato stale — verificato: 3 completamenti reali generati da `filippoloro02` su item prima bloccati
- Accordion note/allegati nel dettaglio admin residenza — verificato sui 3 casi (nota/allegato/vuoto), anche se distribuiti su item diversi da quelli inizialmente previsti
- Vista fascicolo super_admin (`/admin/residences/[id]/fascicolo`) — verificata con query diretta: 16 righe corrette per Residenza Cavaccio, colonna Unità/Condominio corretta, icona allegato su 3 righe corrette
- PDF fascicolo — testato in isolamento con `renderToBuffer` (con righe e con lista vuota), nessuna eccezione, dimensione buffer sensata
- Fix `ORDER BY` — verificato con query reale: seleziona deterministicamente Cavaccio sia per `pippoloro02` (residenza più vecchia tra 7) sia per `filippoloro02` (assegnazione più vecchia tra 2)
- `npx tsc --noEmit` verde su tutti e 5 i commit della sessione

### Non funziona / da verificare
- **Mai testato in browser reale**: né il click sul bottone "Registra completamento", né il download effettivo del PDF dalla UI — solo query dirette e `renderToBuffer` isolato. Da fare prima della demo.
- Banner "Scadenza" nel dettaglio item admin ancora su `status` grezzo (stesso bug di COMMIT A, non corretto — vedi Decisioni chiave)
- "VMC: sostituzione filtri" resta scaduta dal 2024-03-01 senza un completamento di test — deciso di non completarla in questa sessione
- 8 finding di accessibilità/design in backlog, non risolti (contrasto `text-secondary`/`bg-background`, label form non associate, 2× link icona-sola senza aria-label, `border-l-4` da decidere, target tattile back-button, palette PDF duplicata con hex leggermente diverso dal token web, bottone PDF che rischia di affollare l'header su viewport stretti, `scope="col"` mancante sulla tabella fascicolo)
- Una riga storica in `completions` ha `performed_by_profile_id` riconducibile all'account oggi `super_admin` (`pippoloro02`) — RLS attuale lo impedirebbe, quindi è quasi certamente un artefatto di un cambio ruolo passato del profilo di test, non un buco RLS reale (verificato con `pg_policy`), ma non approfondito oltre

## Prossimi passi
1. Test manuale end-to-end in browser: login come `filippoloro02`, cliccare "Registra completamento" su un item scaduto, verificare toast e aggiornamento — mai fatto un vero click-through in questa sessione
2. Test manuale del download PDF da `/admin/residences/[id]/fascicolo` come `pippoloro02` — verificare che il file scaricato sia leggibile e corretto
3. Decidere se completare "VMC: sostituzione filtri" prima della demo (scaduta dal 2024, buon caso dimostrativo se c'è tempo)
4. Un giro unico di `/impeccable harden` sugli 8 finding di accessibilità insieme, non file per file
5. FASE 0 dedicata al leak `activation_status` nel PDF report esistente (`src/app/api/report/route.ts`) — ancora mai investigato, ereditato dall'handoff del 06/07
6. Decidere se il banner "Scadenza" nel dettaglio admin va corretto ora (stesso bug del gate) o resta debito post-demo

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# Verifica tipi prima di ogni commit
npx tsc --noEmit

# oppure build di produzione
npm run build && npm start
```

## Domande aperte
- Il banner "Scadenza" nel dettaglio admin va corretto ora insieme al resto, o resta debito esplicito post-demo?
- `border-l-4` come indicatore di stato scaduto/in corso: lo confermiamo come pattern di sistema del prodotto (e lo persisto come eccezione nell'hook `/impeccable`) o lo sostituiamo con tinta di sfondo/bordo pieno?
- Vale la pena centralizzare la palette PDF (oggi duplicata identica tra `ReportDocument.tsx` e `FascicoloDocument.tsx`, con un hex leggermente diverso dal token web per `text-secondary`)?
- La riga storica con `performed_by_profile_id` di un account oggi super_admin merita un'indagine dedicata, o si accetta come artefatto di test?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione "Regole di codice ricorrenti"**: Qualsiasi superficie che decide di mostrare un'azione, un badge o un raggruppamento in base a "scaduta"/"in corso" deve usare `isOverdueLive`/`isInCorso`/`resolveCompletionMode` (`src/lib/maintenance-status.ts`), mai leggere `status` o la `priority` legacy N1/N2/N3 direttamente. Bug class nota: il cron non gira in locale e ha buchi anche in produzione, quindi `status` salvato è spesso stale rispetto a `next_due_date` — in questa sessione ha nascosto l'azione di completamento admin su item scaduti da mesi/anni. Verificare esplicitamente ad ogni nuova superficie admin/dettaglio item che legge lo stato di una voce.

- **Sezione "Regole di codice ricorrenti"**: Qualunque query che sceglie "la" riga primaria per un profilo con `.limit(1).single()` deve avere un `.order()` esplicito quando la cardinalità non è garantita a 1 (un builder può avere più residenze, un admin più assegnazioni). Senza `ORDER BY`, Postgres non garantisce quale riga torna: comportamento silenziosamente non deterministico, capace di mostrare al super_admin o all'admin la residenza sbagliata senza errori visibili. Il ramo `client` (un residente ha sempre una sola unità attiva) non ha questo rischio strutturalmente.

- **Sezione "Metodo di lavoro"** (candidata più debole, da confermare esplicitamente): in questa sessione ogni gruppo di file toccato è stato passato a `/impeccable audit` prima del commit, con esito allegato al commit stesso. Se Filippo vuole adottarlo come prassi standard per i commit che toccano file `(dashboard)`/`(app)`, andrebbe scritto esplicitamente in CLAUDE.md; altrimenti resta una scelta di questa sessione, non una legge.
