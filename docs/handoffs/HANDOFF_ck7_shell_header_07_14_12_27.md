# Handoff — CK7 redesign header shell + coerenza padding · 14/07/2026 12:27

## Sommario
Sessione CK7 sul profilo super_admin: la shell `(dashboard)` aveva la striscia verde
dell'identità costruttore disallineata rispetto al contenuto e gerarchicamente più
prominente del titolo di pagina, e i padding erano incoerenti tra le pagine (tre
famiglie di container diverse, nessun punto di verità). FASE 0 read-only ha provato che
il disallineamento era strutturale (due griglie diverse) e che l'incoerenza nascondeva
due bug reali: `.pb-safe` che azzerava il padding inferiore su desktop e residui della
shell mobile (`pb-24`, `min-h-screen`) su otto pagine. Quattro commit hanno introdotto
un container unico nel layout, sostituito la striscia con una barra identità neutra
allineata alla griglia del contenuto, e allineato gli skeleton. Un P1 di contrasto
introdotto dalla migrazione resta aperto.

## Lavoro completato
- [x] FASE 0 read-only: censimento dei container di tutte le pagine dashboard, origine della striscia verde, misure di contrasto WCAG
- [x] `/impeccable audit` pre-CK7 sulla shell — 12/20 (Acceptable)
- [x] Commit `707b05b` — container unico nel layout `(dashboard)`, griglia condivisa in `src/lib/layout.ts`; 14 pagine e 7 skeleton perdono padding/larghezza locali; rimossi `pb-24`, `min-h-screen`, `pb-safe` dalla dashboard
- [x] Commit `545787c` — `BuilderIdentityBar` sostituisce `WhitelabelStrip`: fondo neutro, contenuto sulla stessa griglia del contenuto, altezza allineata al marchio della sidebar
- [x] Commit `a4c8138` — nessuna icona di fallback quando il logo del costruttore manca o non carica: resta il solo nome
- [x] Commit `8e47489` — skeleton di Fascicolo e Manutenzioni allineati all'intestazione in griglia (difetto lasciato dal primo commit)
- [x] `/impeccable audit` post-CK7 — 13/20
- [ ] **P1 aperto**: `text-secondary` sotto la soglia AA sul fondo pagina (vedi "Non funziona")

## File toccati
### Creati
- `src/lib/layout.ts` — fonte di verità unica della griglia della dashboard. `CONTENT_GRID = 'px-6'` (solo padding: nessuna larghezza massima, nessuna centratura) e `CONTENT_RHYTHM = 'pt-6 pb-12'`. La usano il container del contenuto e la barra identità, così il logo del costruttore cade sopra il titolo di pagina per costruzione.
- `src/components/BuilderIdentity.tsx` — `BuilderIdentityBar`: barra identità costruttore in cima alla shell. Fondo neutro (`bg-surface` + `border-b border-border`) a tutta larghezza, contenuto su `CONTENT_GRID`, altezza `h-14` (la stessa del blocco marchio in `AdminSidebar`, così i due marchi poggiano sulla stessa linea di base). Nessun fallback iconico: se `logoSrc` è nullo o l'immagine fallisce (`onError`), resta il solo nome. `imgError` si resetta a ogni cambio di `logoSrc`, quindi dopo un re-upload il logo riappare.

### Modificati
- `src/app/(dashboard)/layout.tsx` — il layout possiede ora il container del contenuto (`CONTENT_GRID` + `CONTENT_RHYTHM`); `<WhitelabelStrip>` nel suo wrapper `px-4 pt-4 pb-3` è sostituito da `<BuilderIdentityBar>`.
- 14 pagine dashboard (Residenze, Attività, Dettaglio residenza, Unità e inviti, Manutenzioni residenza, Fascicolo, Documenti, Fornitori, Nuova residenza, Manutenzioni catalogo, Manutenzione dettaglio, Amministratori, Amministratore dettaglio, `SettingsShell`) — rimossi i container radice locali (`max-w-6xl mx-auto px-8 py-8 pb-safe`, `p-6 space-y-6 pb-safe`, `min-h-screen bg-background pb-24` + `p-4`). Le barre sticky full-bleed sono diventate intestazioni dentro la griglia (`flex items-center gap-3 mb-6`); perdono la stickiness (confermato da Filippo: non serve).
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` e `.../documenti/DocumentiClient.tsx` — rimosso il `p-4` dal root (portavano il padding internamente).
- 7 `loading.tsx` della dashboard — allineati al container delle pagine che precedono. Fascicolo e Manutenzioni hanno richiesto un commit dedicato (`8e47489`) perché il primo passaggio aveva corretto solo la classe del div radice, lasciando il *contenuto* dello skeleton a disegnare la vecchia barra sticky.
- `src/components/BrandMark.tsx` — estratta `LeafIcon` (unica sorgente del path della foglia). Dopo `a4c8138` non è più esportata: la sidebar è il suo unico consumatore.
- `src/app/(dashboard)/admin/settings/IdentityTab.tsx` — l'anteprima "così appare nell'header" monta `BuilderIdentityBar`, quindi è letteralmente l'header e non può divergere. Lo swatch della thumbnail logo passa da fondo verde scuro a neutro: mostrava il logo su un fondo su cui non appare più. Rimossa la costante locale `BRAND_DARK`.

### Eliminati
- `src/components/WhitelabelStrip.tsx` — sostituito da `BuilderIdentity.tsx`.

### Letti (solo quelli rilevanti per capire il contesto)
- `DESIGN.md` righe 68-74 e 145 — scala di spaziatura chiusa a sei valori (4/8/12/16/24/48px), "qualunque altro valore è un errore, non una scelta". È la fonte dei numeri del container.
- `src/app/globals.css` righe 19-23 e 61-64 — override di `neutral-500` per motivi di contrasto (precedente da imitare) e definizione di `.pb-safe`.
- `src/lib/whitelabel.ts` — `getWhitelabelBrand()` legge `builders.logo_url` e `builders.name`; `brandDark` è fisso `#04342C`, non personalizzabile.
- `src/app/(app)/layout.tsx` — conferma che `BottomNav` esiste solo nella shell residente: `pb-24`/`pb-safe` lì restano legittimi e NON sono stati toccati.

## Decisioni chiave
- **I valori del container vengono dal design system, non da una pagina esistente** (vincolo esplicito di Filippo). Il `px-8 py-8` (32px) di Residenze è **fuori scala** — DESIGN.md riga 145 lo qualifica come errore — e il `p-4` (16px) di Unità e inviti è in scala ma tarato sul mobile. Scelti `px-6` (24px) e `pt-6 pb-12` (24/48px), tutti in scala.
- **Nessuna larghezza massima, nessuna centratura** (decisione di Filippo dopo una prima proposta con `max-w-6xl` + `lg:px-12`): il contenuto occupa tutta la larghezza disponibile accanto alla sidebar, con 24px di padding a ogni breakpoint. Da rivalutare se su monitor molto largo dovesse sembrare povero. Alternativa scartata: `max-w-6xl mx-auto` (1152px centrato), che era l'unica convenzione di larghezza preesistente nel codice ma non è un token.
- **Commit A atomico invece che diviso in A1/A2.** Una proposta iniziale prevedeva di introdurre il container prima e migrare le pagine dopo: scartata perché il commit intermedio avrebbe lasciato le pagine di famiglia B con padding doppio e barre sticky incassate in un contenitore centrato — cioè `master` visibilmente rotto. Container del layout e padding locali sono due metà dello stesso fatto: la migrazione è atomica per natura.
- **La barra identità è full-bleed nello sfondo ma il suo contenuto sta sulla griglia del contenuto.** Senza questo dettaglio il redesign non risolve il problema che l'ha originato: il logo continuerebbe a non allinearsi col titolo. È il motivo per cui `BuilderIdentityBar` importa `CONTENT_GRID` invece di dichiarare un proprio padding.
- **Nessun fallback iconico sull'identità costruttore** (richiesta esplicita di Filippo): quando il logo manca, mostrare la foglia CasaZero significherebbe mettere il marchio di CasaZero al posto di quello del costruttore, che è l'opposto del whitelabel.
- **`space-y-5` (20px) lasciato invariato** in `ManutenzioniClient`/`DocumentiClient`: è fuori scala come il 32px, ma è ritmo *interno* al contenuto e non container. Correggerlo avrebbe allargato il concern del commit.

## Stato attuale
### Funziona
- `npm run build` verde e `npx tsc --noEmit` a zero errori dopo ciascuno dei 4 commit.
- La griglia ha una sola fonte di verità (`src/lib/layout.ts`): la barra identità e il contenuto la condividono, quindi il logo del costruttore è allineato al titolo di pagina per costruzione.
- L'anteprima in Impostazioni → Identità monta lo stesso `BuilderIdentityBar` dell'header: non può divergere.
- Spariti dalla dashboard i 96px di `pb-24` (la `BottomNav` non esiste lì), lo scroll fantasma di `min-h-screen`, e i sei `pb-safe` che azzeravano il padding inferiore su desktop (`.pb-safe` è unlayered in `globals.css`, e in Tailwind v4 il CSS unlayered vince sulle utility in `@layer utilities`).
- Nessun residuo: `grep` di `pb-safe|pb-24|min-h-screen|max-w-6xl|px-8|py-8` sulla dashboard non restituisce nulla. La shell `(app)` residente è intatta.
- Audit `/impeccable`: 12/20 → 13/20.

### Non funziona / da verificare
- **P1 — `text-secondary` sotto AA sul fondo pagina (regressione CK7).** Le otto intestazioni di famiglia B avevano `<p className="text-xs text-text-secondary">` dentro la barra bianca: `#6B7A74` su `#FFFFFF` = **4,51:1** (passava). Ora quelle righe stanno sul fondo pagina: `#6B7A74` su `#F4F3EF` = **4,06:1**, sotto la soglia AA di 4,5:1, e sono testo da 12px. Il difetto del token era latente e già segnalato in FASE 0; CK7 lo ha attivato su otto superfici. Il sistema ha già il precedente della cura: `neutral-500` fu portato a `#5E5E5E` (5,84:1) per lo stesso motivo, con commento in `globals.css:19-23`.
- **NESSUNA VERIFICA VISIVA È STATA FATTA.** Build verde e tipi puliti non guardano i pixel: otto pagine hanno cambiato intestazione, il container è nuovo e non è stato aperto un browser in tutta la sessione. Il difetto degli skeleton (`8e47489`) è emerso dall'audit, non dalla build — la stessa classe di errore potrebbe averne lasciati altri.
- Tre `border-l-4` (side-stripe, ban assoluto del design system) restano in `administrators/page.tsx:230`, `administrators/[id]/page.tsx:249-251`, `ManutenzioniClient.tsx:468`. Preesistenti, fuori dallo scope della shell.
- La shell non ha un solo breakpoint: `AdminSidebar` è `w-60` fissa senza collapse, `CONTENT_GRID` è `px-6` a ogni larghezza. Su un laptop da 1024px restano ~784px di contenuto.

## Prossimi passi
1. `npm run dev` e passata visiva sulle pagine toccate (le 8 con intestazione nuova, più Impostazioni → Identità con e senza logo caricato) a schermo largo e stretto. È il passo che manca da due sessioni.
2. Correggere il token `text-secondary` in `src/app/globals.css` portandolo sopra 4,5:1 su `bg-background`, come già fatto per `neutral-500` (`#5E5E5E` dà 5,84:1). Tocca tutta l'app: commit dedicato, e verificare che non appiattisca i due livelli di grigio del sistema.
3. Rivalutare la larghezza del contenuto su monitor molto largo: senza `max-w`, su 2560px le righe di tabella superano abbondantemente la misura leggibile.
4. Sostituire i tre `border-l-4` con bordo pieno o tinta di sfondo (ban assoluto del design system).

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (finestra PowerShell separata)
npm run dev

# Build di verifica prima di ogni commit
npm run build
```

## Domande aperte
- Il fix di `text-secondary` va fatto sul token globale (una riga in `globals.css`, effetto su tutta l'app) o solo sulle superfici che poggiano su `bg-background`? Il token globale è più pulito ma cambia anche il grigio dentro le card, dove oggi passa.
- La sidebar `w-60` fissa senza collapse va bene finché la dashboard è desktop-only, o serve un breakpoint per i laptop da 1024px?
- `space-y-5` (20px) in `ManutenzioniClient`/`DocumentiClient` è fuori dalla scala chiusa: si normalizza a 24px in un commit di pulizia?

## Leggi emerse (candidate per CLAUDE.md)

Quattro leggi, tutte confermate da errori reali di questa sessione (due dei quali miei).

- **Sezione Regole di codice ricorrenti**: "Valori di layout dal design system, mai copiati da una pagina esistente. Padding, spaziature e larghezze vengono dalla scala chiusa di DESIGN.md (4/8/12/16/24/48px): qualunque altro valore è un errore, non una scelta. Una pagina esistente può essere il riferimento di *come deve sentirsi* il risultato, mai la fonte dei numeri — le pagine contengono già violazioni della scala (il `px-8`/32px di Residenze era una di queste)."

- **Sezione Regole di codice ricorrenti**: "Container unico nel layout, mai nelle pagine. Padding e larghezza del contenuto vivono in un solo punto (`src/lib/layout.ts` + il layout di shell); le pagine non dichiarano container propri. Quando si migra un container, gli `loading.tsx` vanno migrati insieme alle pagine: uno skeleton che disegna un contenitore diverso dalla pagina che precede è un layout shift a ogni navigazione, e né `tsc` né `npm run build` lo vedono."

- **Sezione Regole di codice ricorrenti**: "Un'anteprima deve montare il componente reale, non imitarlo. Se una superficie mostra 'così appare X' (es. Impostazioni → Identità), deve renderizzare lo stesso componente di X. Un'anteprima che replica il markup è una bugia in attesa del primo redesign."

- **Sezione Regole di codice ricorrenti**: "Cambiare il fondo di una superficie obbliga a ricontrollare il contrasto del testo che ci finisce sopra. I token di testo non passano AA su tutti i fondi: `text-secondary` (#6B7A74) dà 4,51:1 su `bg-surface` (passa) e 4,06:1 su `bg-background` (fallisce). Spostare un blocco da una card al fondo pagina è un cambio di contrasto, non un cambio di posizione."

- **Sezione Metodo di lavoro**: "Build verde non è verifica. `npm run build` e `tsc --noEmit` non guardano i pixel: ogni modifica che tocca layout, spaziature o gerarchia visiva va aperta nel browser prima del commit. Le sessioni che si chiudono con solo la build verde lasciano difetti visivi che emergono solo all'audit successivo."
