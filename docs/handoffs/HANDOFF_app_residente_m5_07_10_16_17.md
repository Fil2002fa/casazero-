# Handoff — Redesign app residente M5 (Manutenzioni/Fascicolo/Documenti/Profilo) + vista inviti super_admin · 10/07/2026 16:17

## Sommario
Sessione in due parti indipendenti, ognuna con FASE 0 read-only e commit separati. La prima ha rimosso il QR dalla vista invito super_admin (che compete solo al residente) e ha esposto/hardenato l'invito in blocco per unità. La seconda, più estesa, ha portato la shell `(app)` del residente (Manutenzioni, flusso di completamento, Fascicolo, Documenti, Profilo) al design system v2 e alle fondamenta mobile (16px, touch target 44px, card p-4/xl), separando esplicitamente un commit di correzione dati (stato live invece di `status`/`priority` salvati) dal redesign visivo vero e proprio.

## Lavoro completato
- [x] COMMIT `825ff9d` — rimozione QR dalla vista invito super_admin (`admin/residences/[id]/units`), link invito visibile per intero + copia con toast
- [x] COMMIT `283e919` — hardening server-side di `createBulkInvites`: controllo "senza account attivo" anche lato server con l'helper condiviso `unitHasNoActiveAccount`, non più solo lato client
- [x] COMMIT `daa3803` — coda del primo commit: rimossi riferimenti QR residui in copy/icona ("Genera invito QR" → "Genera invito")
- [x] COMMIT `fd3dad4` — bottone bulk "Genera inviti per tutte le unità" spostato in testata, sempre visibile, nessuna modale (non distruttivo), toast con esito reale
- [x] COMMIT `e612d2e` — Manutenzioni residente (lista + dettaglio) migrate da `status`/`priority` salvati a stato live (`isOverdueLive`/`resolveCompletionMode`/`resolveLiveStatus`); bug trovato e corretto nello stesso commit: banner "Prossima scadenza" mostrato anche su voci promemoria
- [x] COMMIT `a50f653` — redesign Manutenzioni a tre sezioni (Da fare/In programma/Consigli per la tua casa) con bottom sheet di completamento (nuovo componente `BottomSheet`), fondamenta mobile applicate
- [x] COMMIT `6b76541` — Fascicolo (solo allineamento token, nessun redesign), Documenti (righe piatte h-14/56px), Profilo (card account read-only, inviti familiari e notifiche invariati)
- [x] `/impeccable audit` prima di ogni commit, con fix P0/P1/P2 applicati su richiesta esplicita — dettagli in "Decisioni chiave"
- [x] `tsc --noEmit` verde su tutti e 7 i commit; `npm run build` verificato verde dopo la migrazione dati

## File toccati
### Creati
- `src/components/ui/BottomSheet.tsx` — nuovo primitivo di sistema: variante mobile di `Modal.tsx`, ancorata in basso, radius solo in alto, stesso focus-trap/portal
- `src/app/(app)/manutenzioni/CompletionSheet.tsx` — form di completamento (Note/Allegato facoltativi) dentro la bottom sheet, data intervento impostata automaticamente a oggi
- `src/app/(app)/manutenzioni/CompletionAction.tsx` — wrapper client (bottone + sheet), riusato dal dettaglio item
- `src/app/(app)/manutenzioni/ManutenzioniList.tsx` — le tre sezioni della lista Manutenzioni, badge di sistema (`StatusBadge`/`PromemoriaBadge`/`TypeBadge`)

### Modificati
- `src/app/(dashboard)/admin/residences/[id]/units/page.tsx` — rimossa generazione QR (`qrcode`)
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — QR rimosso dal render, link testuale, bottone bulk in testata, banner ridotto a indicatore
- `src/app/(dashboard)/admin/residences/[id]/units/actions.ts` — `createBulkInvites` verifica server-side account attivo
- `src/lib/maintenance-status.ts` — aggiunto `modeToPriority(mode)` condiviso (deriva sigla legacy da `completion_mode`, mai da `priority` salvata)
- `src/app/(app)/manutenzioni/page.tsx` — riscritta due volte: prima migrazione dati (stesso 4-bucket), poi redesign (3 bucket), fondamenta mobile
- `src/app/(app)/manutenzioni/[id]/page.tsx` — gate azione residente/amministratore su `completion_mode` live, completamento spostato su bottom sheet, tipografia 16px/serif 22-600
- `src/app/(app)/fascicolo/page.tsx` — solo fondamenta (padding, touch target, tipografia), fix audit (focus-visible, touch target link allegato, badge 10px→12px)
- `src/app/(app)/documenti/page.tsx` — righe `DocCard` riscritte come singolo tap target h-14, fix audit (label ricerca, focus-visible)
- `src/app/(app)/profilo/ProfiloClient.tsx` — card account read-only, Esci→ghost, fix audit (`text-green-600`→`text-brand-dark`, focus-visible, badge 10px→12px)
- `src/app/(app)/profilo/actions.ts` — rimossa `updateProfile` (dead code dopo la rimozione dell'edit inline)

### Eliminati
- `src/components/CompleteN2Form.tsx` — completamente sostituito da `CompletionSheet`/`CompletionAction`

### Letti (solo quelli rilevanti per capire il contesto)
- `CLAUDE.md`, handoff precedenti (`impostazioni_settings`, `shell_login_residenze`, `stato_scaduta_live`, `sblocco_fascicolo`, `home_residente_foto`, `manutenzioni_v2`) — stato di partenza e invarianti già stabiliti
- `.claude/skills/impeccable/reference/{audit,product}.md`, `PRODUCT.md`, `DESIGN.md` — metodo e token di sistema
- `src/components/ui/{Badge,Button,Input,Modal,Toast}.tsx` — componenti v2 riusati (nessun nuovo badge necessario: `StatusBadge`/`PromemoriaBadge`/`TypeBadge` già esistevano)
- `src/app/(dashboard)/admin/residences/[id]/MaintenancePlanTable.tsx` — precedente per il pattern badge riusato nella lista Manutenzioni
- `src/components/{PriorityBadge,MaintenanceCard}.tsx` — componenti legacy, non toccati (ancora in uso da home e dashboard admin)

## Decisioni chiave
- **Migrazione a stato live come commit separato e precedente al redesign** — su richiesta esplicita di Filippo: prima il fix di correttezza dati, poi il redesign UI che costruisce sopra dati già corretti. Isola il rischio e rende leggibile il diff del redesign.
- **Tre sezioni invece di quattro**: "In corso" (voci prese in carico dall'amministratore) confluito in "In programma" insieme alle voci pianificate — `StatusBadge` colora naturalmente (ambra per in_corso, neutro per pianificata) invece di forzare un pill piatto, lettura di "pill neutro" come "non rosso/urgente" non come "sempre uno stesso colore".
- **Meta card "ogni X mesi" su tutte le sezioni con data**, non solo sulle promemoria — la card di lista mostra la cadenza, la data esatta resta nel dettaglio item.
- **P0 trovato in audit e corretto prima del commit**: il bottone "Registra completamento" compariva anche sulle voci condominiali scadute (mode amministratore) nella sezione "Da fare". Aggiunto `mode` a `ListItem`, bottone visibile solo se `mode==='residente'`, altrimenti testo informativo "A carico dell'amministratore di condominio."
- **Profilo reso read-only su istruzione esplicita ripetuta due volte** ("card account read-only" nel prompt originale e nella conferma successiva) — non un'iniziativa mia. Rimossa la UI di modifica inline nome/telefono e l'action `updateProfile` diventata dead code. Inviti familiari e preferenze notifiche mantenuti identici nella logica, solo fondamenta mobile applicate.
- **Fascicolo: nessun accordion, solo allineamento token** — confermato esplicitamente in FASE 0 (la premessa del task era sbagliata: l'accordion citato esiste solo nella vista super_admin, non qui). Il pallino colorato della timeline resta su `priority` legacy: fuori scope, richiederebbe una migrazione dati dedicata come quella fatta per Manutenzioni.
- **Fix di accessibilità applicati in audit finale** (istruzione esplicita "fammi e applica"): placeholder-come-label sul campo ricerca Documenti, `text-green-600` hardcoded in Profilo (violava la "Regola del Silenzio" di DESIGN.md — successo si mostra in tinta brand, mai verde acceso), touch target sotto 44px sui link allegato Fascicolo, `focus-visible` mancante su ogni link/bottone raw creato in sessione, badge sotto la scala Micro (10px→12px).

## Stato attuale
### Funziona
- `tsc --noEmit` verde su tutti e 7 i commit; `npm run build` verificato verde dopo la migrazione dati Manutenzioni
- Scan deterministico `/impeccable` (`detect.mjs`) pulito su ogni file toccato in sessione
- Nessuna modifica RLS/migrazione DB eseguita — solo codice applicativo

### Non funziona / da verificare
- **Nessuna verifica visiva reale in browser** in tutta la sessione — stesso limite ambientale delle sessioni precedenti (nessun tool di browser automation disponibile). Da vedere a schermo prima della demo: vista unità super_admin (QR rimosso, bulk invite in testata), le tre sezioni di Manutenzioni, la bottom sheet di completamento, Fascicolo/Documenti/Profilo col nuovo layout.
- **RLS su `completions` per `mode='amministratore'` non verificato**: il fix P0 di questa sessione filtra il bottone lato UI (`mode==='residente'`), ma non è stato verificato se il server/RLS blocca già autonomamente un INSERT di un client su una voce a carico dell'amministratore — se non lo fa, il gate UI è l'unica difesa reale.

## Prossimi passi
1. Verifica visiva manuale di tutte le pagine toccate su viewport mobile reale, in particolare la bottom sheet e le tre sezioni di Manutenzioni.
2. Verificare (query diretta o test manuale) se RLS blocca un tentativo di `completeN2` su una voce `mode='amministratore'` — se no, valutare un controllo server-side esplicito nell'action, stesso pattern del fix P0 fatto su `createBulkInvites` nella prima parte della sessione.
3. Migrare il pallino timeline del Fascicolo da `priority` legacy a `completion_mode` live — commit dedicato, stesso pattern già applicato a Manutenzioni.
4. Decidere se uniformare il badge "Condominio"/"Unità" del Fascicolo (oggi mescola `brand-light` e `semantic-blue-bg`, due generazioni di token diverse).
5. Continuare la migrazione delle schermate `(dashboard)` rimanenti al design system v2 (administrators, ecc.), se prossima priorità di Filippo.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Verifica tipi prima di ogni commit
npx tsc --noEmit

# oppure build di produzione
npm run build && npm start
```

## Domande aperte
- RLS `completions`: il blocco per `mode='amministratore'` esiste già lato server, o il gate UI del fix P0 è l'unica barriera oggi?
- Pallino timeline Fascicolo su `priority` legacy: commit dedicato subito o debito esplicito post-demo?
- Badge "Condominio"/"Unità" a due generazioni di token: uniformare a `status-*` v2 o lasciare?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Invarianti**: "Ogni superficie che mostra o abilita un'azione condizionata su stato/modalità di una manutenzione (bottone di completamento, gate di visibilità, badge) deve usare `isOverdueLive`/`resolveCompletionMode`/`resolveLiveStatus`/`modeToPriority` di `src/lib/maintenance-status.ts`, mai leggere `status`/`priority` salvati direttamente — anche quando il controllo è puramente lato UI (mostra/nascondi un bottone), non solo nei conteggi. Bug reale di questa sessione: un bottone 'Registra completamento' visibile anche su voci a carico dell'amministratore perché il bucket 'scadute' non distingueva la modalità."

- **Sezione Metodo di lavoro**: "Quando un redesign UI tocca una superficie i cui dati sottostanti erano già scorretti (es. stato salvato invece di calcolato live), separare SEMPRE il fix di correttezza dati in un commit precedente e distinto dal redesign visivo — mai bundlarli nello stesso commit. Isola il rischio e mantiene il diff del redesign leggibile e mirato al solo cambiamento visivo."

- **Sezione Regole di codice ricorrenti**: "Ogni elemento interattivo scritto a mano (`<a>`/`<button>` che non passa da `Button`/`Input` di sistema) deve avere esplicitamente `focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-dark/20` — i componenti di sistema lo hanno di default, un elemento raw no. Verificarlo esplicitamente in ogni audit di superficie con link/pill/chip custom, non solo il contrasto colore."

- **Sezione Regole di codice ricorrenti**: "Quando una card/riga deve essere sia navigabile (tap → dettaglio) sia contenere un'azione secondaria (bottone), struttura `Link` (info) e `Button` (azione) come elementi SIBLING dentro un `div` wrapper comune — mai uno annidato nell'altro. Pattern confermato due volte in questa sessione (header unità in `UnitsManager`, card 'Da fare' in `ManutenzioniList`)."
