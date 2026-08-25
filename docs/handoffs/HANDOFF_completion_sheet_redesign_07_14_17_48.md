# Handoff — Redesign CompletionSheet residente · 14/07/2026 17:48

## Sommario
Lo sheet con cui il residente registra un intervento sembrava una to-do app (titolo nudo, due campi
facoltativi, un bottone "Salva") mentre in realtà scrive nel fascicolo legale immutabile dell'immobile.
Redesign solo UI in due commit: prima il threading di nome residenza e label unità fino al componente
dai due percorsi che lo aprono (lista e dettaglio), poi la ricomposizione visiva dello sheet (titolo in
Source Serif 4, riga di contesto, data dell'intervento visibile, CTA "Registra nel fascicolo" con
micro-copy di garanzia). La server action `completeN2`, l'INSERT in `completions`, i field name, la
validazione e i `revalidatePath` non sono stati toccati.

## Lavoro completato
- [x] FASE 0 diagnostica read-only su `CompletionSheet` / `BottomSheet` con report e stop
- [x] Commit `72c427b` — threading di `residenceName` e `unitLabel` fino allo sheet dai due call site
- [x] Commit `493dcc9` — redesign UI dello sheet + `subtitle` opzionale su `BottomSheet`
- [x] Chiuso alla radice un bug timezone latente sulla data del completamento (vedi Decisioni chiave)
- [x] `npx tsc --noEmit` verde e `npm run build` verde su entrambi i commit
- [ ] Prova visiva dello sheet aperto dai due percorsi: NON eseguita (vedi "Non funziona / da verificare")

## File toccati
### Creati
- Nessuno.

### Modificati
- `src/app/(app)/manutenzioni/CompletionSheet.tsx` — riceve `residenceName` e `unitLabel`; compone la
  riga di contesto "Verrà registrato nel fascicolo di {residenza} · {unità}" passata a `BottomSheet`
  come `subtitle`; mostra la data dell'intervento in una riga inset `bg-background`; CTA "Registra nel
  fascicolo" + micro-copy di permanenza; toast di successo "Registrato nel fascicolo.".
  La data è ora una singola costante `useState(todayISO)` usata sia per l'hidden field `completedAt`
  sia per il display.
- `src/components/ui/BottomSheet.tsx` — nuova prop opzionale `subtitle?: ReactNode` renderizzata sotto
  il titolo; il titolo passa a Source Serif 4 (`font-serif text-[22px] font-semibold`), stessa scala
  delle intestazioni di pagina. `title` resta la fonte di `aria-labelledby` (`id="sheet-title"`).
- `src/app/(app)/manutenzioni/page.tsx` — passa a `ManutenzioniList` `residenceName` e `unitLabel`,
  già disponibili nello scope (query `unit_members → units(label), residences(name)`), zero query nuove.
- `src/app/(app)/manutenzioni/ManutenzioniList.tsx` — accetta le due prop e le inoltra a `CompletionSheet`.
- `src/app/(app)/manutenzioni/CompletionAction.tsx` — accetta le due prop e le inoltra a `CompletionSheet`.
- `src/app/(app)/manutenzioni/[id]/page.tsx` — SELECT read-only estesa con `units(label)` e
  `residences(name)` sull'item (nessuna scrittura, nessuna migrazione); i valori vengono passati a
  `CompletionAction`.

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/(app)/manutenzioni/actions.ts` — per confermare cosa NON toccare: `completeN2` legge dal
  FormData `itemId`, `unitId`, `residenceId`, `completedAt`, `notes`, `attachment` e fa l'INSERT in
  `completions`. Contratto invariato.
- `src/components/ui/Button.tsx` — il primary è `rounded-lg` su `bg-brand-dark` (#04342C); `rounded-xl`
  nel design system è il radius delle card, non dei bottoni.
- `src/components/ui/Input.tsx` — `Label` e `Textarea` riusati così come sono.
- `src/lib/maintenance-status.ts` — `todayISO()` è UTC-based; modulo puro, importabile da un client component.
- `src/lib/formatUnitLabel.ts` — helper obbligatorio per rendere la label unità.
- `src/app/globals.css` — token colore/tipografia (`--color-background: #F4F3EF`, `--color-border: #E4E6E2`,
  `--font-serif`).

## Decisioni chiave
- **Data mostrata e data salvata da una sola costante**: prima l'hidden field calcolava
  `new Date().toISOString().split('T')[0]` inline. `todayISO()` è UTC: in Italia tra le 00:00 e le 02:00
  il giorno UTC è ancora quello precedente. Mostrare la data ricalcolandola a parte avrebbe potuto far
  dire allo sheet "14 luglio" mentre nel fascicolo finiva "13 luglio". Ora il valore è calcolato una volta
  (`const [completedAt] = useState(todayISO)`) e alimenta sia l'hidden field sia il display: non possono
  divergere. Alternativa scartata: formattare `new Date()` per il display (avrebbe reintrodotto la divergenza).
- **SELECT read-only estesa nel dettaglio invece di sheet asimmetrico**: dalla lista i dati di contesto
  erano già in scope; dal dettaglio no (nessun join su `units`/`residences`). Scartata l'ipotesi di mostrare
  il contesto solo dalla lista: avrebbe prodotto due sheet diversi a seconda di come ci si arriva.
- **Nessun `TypeBadge` nell'header dello sheet**: sarebbe ridondante (l'utente ha appena toccato la card
  che lo mostra) e avrebbe richiesto di aggiungere `obligation_type` alle SELECT. Header = titolo +
  contesto + data.
- **CTA "Registra nel fascicolo" solo sul submit, non propagata**: i due trigger (bottone della card in
  `ManutenzioniList` e bottone del dettaglio in `CompletionAction`) restano "Registra completamento".
  Il trigger apre, il submit impegna.
- **`Button` riusato senza modifiche di stile**: il brief chiedeva `radius xl`, ma nel design system i
  bottoni sono `rounded-lg`. Introdurre un radius nuovo sarebbe stato uno stile nuovo.
- **`subtitle?: ReactNode` su `BottomSheet` invece di header dentro i children**: `CompletionSheet` è
  l'unico consumatore di `BottomSheet` in tutto il repo, quindi blast radius nullo, e `title` resta il
  nome accessibile.

## Stato attuale
### Funziona
- `npx tsc --noEmit`: zero errori.
- `npm run build`: verde; compilano entrambe le route `/manutenzioni` e `/manutenzioni/[id]`.
- Working tree pulito per i file di questa sessione (tutto committato in `72c427b` e `493dcc9`).

### Non funziona / da verificare
- **Nessuna verifica visiva eseguita.** Il progetto non ha Playwright né un MCP browser e il login
  residente è magic-link/Google: l'agente non ha potuto autenticarsi come `lorofilippo2002` per fare
  screenshot. Da controllare a mano con sessione residente: `/manutenzioni` (card in "Da fare" →
  "Registra completamento") e `/manutenzioni/<id>` della stessa voce, verificando che la riga di
  contesto sia identica nei due percorsi.
  Prova di codice a supporto: la stringa è composta in un solo punto (`CompletionSheet.tsx`) e dal
  dettaglio `canCompleteResident` (`src/app/(app)/manutenzioni/[id]/page.tsx`) richiede
  `membership.unit_id === item.unit_id`, quindi `units(label)`/`residences(name)` risolvono per
  costruzione sulla stessa riga che la lista legge da `unit_members`.
- Il flusso di submit end-to-end (INSERT reale in `completions` + upload allegato) non è stato
  ri-testato in questa sessione: il codice non è stato toccato, ma la regressione non è esclusa per prova.
- Il working tree contiene modifiche PREESISTENTI non di questa sessione e non committate:
  `CLAUDE.md` modificato (sezione Wiki Knowledge Base), `docs/spec.md` cancellato, e i non tracciati
  `.claude/skills/`, `.impeccable/`, `DESIGN.md`, `PRODUCT.md`, `docs/Nuovo File PY.py`.

## Prossimi passi
1. Aprire il dev server con sessione residente (`lorofilippo2002`) e confrontare lo sheet dai due
   percorsi (lista e dettaglio della stessa voce): la riga "Verrà registrato nel fascicolo di … · …"
   deve essere identica, e la data mostrata deve coincidere con quella salvata dopo il submit.
2. Registrare un completamento di prova e verificare in `completions` che `completed_at` sia il giorno
   mostrato nello sheet (controllo diretto del fix timezone).
3. Decidere se il toast "Registrato nel fascicolo." e la CTA vadano allineati anche altrove (es. il
   ciclo amministratore in `N3AdminActions`), oggi ancora con linguaggio "completamento".
4. Valutare se estrarre un helper condiviso per la formattazione data lunga `it-IT`: oggi l'idioma
   `toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })` è duplicato inline
   in ~20 file (scelta consapevole in questa sessione: non introdotto per non fare scope creep).

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Il fix timezone è chiuso dentro lo sheet, ma `todayISO()` resta UTC-based ed è usato ovunque per
  calcolare "scaduta" (`isOverdueLive`). Nelle ore 00:00–02:00 italiane l'app valuta le scadenze sul
  giorno precedente: va sanato alla fonte (`todayISO()` in ora locale Europe/Rome) o è tollerato?
- La micro-copy sotto la CTA ("L'intervento resta registrato in modo permanente nel fascicolo
  dell'immobile e accompagna la casa nel tempo") è definitiva o va rivista con il copy di prodotto?

## Leggi emerse (candidate per CLAUDE.md)

- **Sezione Invarianti**: Data mostrata e data salvata sono lo stesso valore. Qualsiasi form che
  scrive una data nel fascicolo calcola la data UNA volta e usa quella costante sia per l'hidden field
  sia per il display. Mai ricalcolare `new Date()` per la resa a schermo: `todayISO()` è UTC e in Italia
  tra le 00:00 e le 02:00 restituisce il giorno precedente, quindi due calcoli separati possono mostrare
  un giorno e registrarne un altro.

- **Sezione Regole di codice ricorrenti (bug class note)**: Componenti UI condivisi: quando serve più
  contenuto di quello che una prop stringa può reggere (es. un header con contesto), aggiungere una prop
  opzionale tipizzata `ReactNode` al componente esistente invece di duplicarlo o di svuotare la prop
  stringa. La prop stringa deve restare la fonte del nome accessibile (`aria-labelledby`).

- **Sezione Regole di codice ricorrenti (bug class note)**: Coerenza del radius: `rounded-xl` è il radius
  delle card, `rounded-lg` quello di bottoni e campi. Non introdurre radius nuovi su richiesta generica:
  verificare sempre il componente reale del design system prima di applicare un valore.

- **Sezione Metodo di lavoro**: Le superfici che aprono lo stesso componente da percorsi diversi (lista e
  dettaglio) devono alimentarlo con gli stessi dati: se un percorso non li ha in scope, si estende la SELECT
  read-only di quel percorso: mai mostrare un componente diverso a seconda di come ci si è arrivati.
