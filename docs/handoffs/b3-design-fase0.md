# B3 — Inventario del design attuale (FASE 0, sola lettura)

Data: 2026-11-05. Stato: COMPLETO, in attesa di approvazione di Filippo (nessun codice modificato).
Metodo: esplorazione di codice con subagent read-only; ogni riscontro con path:riga. Path relativi a `src/`.
Verificato direttamente: `find src` non trova nessun `error.tsx`, `not-found.tsx`, `global-error.tsx`.

## 1. Pagine

Root: `app/layout.tsx` (ToastProvider, PwaInit, Inter 400/500 + Source Serif 600, `lang="it"`). Esiste `middleware.ts`.

Ruoli: `(app)/layout` reindirizza a /admin se `role !== 'client'`. `(dashboard)/layout` usa `requireProfile`. Sidebar: super_admin (costruttore) = Residenze, Amministratori, Fornitori, Impostazioni; admin (condominio) = Residenze, Attività (→ /admin/manutenzioni).

### PWA residente `(app)` — layout con BottomNav
| URL | File | Ruolo | Componenti |
|---|---|---|---|
| / | (app)/page | client | MaintenanceCard, AwaitingDeliveryHomeCard, OBLIGATION_LABELS |
| /documenti | documenti/page, DocumentiList | client | UploadDocumentForm, DocumentiList |
| /fascicolo | fascicolo/page, FascicoloList | client | buttonVariants, FascicoloList |
| /manutenzioni | manutenzioni/page, ManutenzioniList | client | ManutenzioniList |
| /manutenzioni/[id] | [id]/page, CompletionAction, CompletionSheet | client; anche admin/super in "isAdminMode" | StatusBadge, PromemoriaBadge, TypeBadge, N3AdminActions, AwaitingDeliveryNote |
| /profilo | profilo/page, ProfiloClient | client | Button |

### Admin `(dashboard)/admin` — layout con AdminSidebar, MobileNav, BuilderIdentityBar
| URL | Ruolo | Componenti principali |
|---|---|---|
| /admin | redirect (super → /residences, admin → /manutenzioni) | — |
| /admin/residences | admin+super (`canManage` solo super) | PageHeader, buttonVariants, ui/Table |
| /admin/residences/new | solo super | DateField (pagina client) |
| /admin/residences/[id] | admin+super | BackLink, AdminBlock, ResidencePhotoUpload, UnitsSummaryTable |
| .../[id]/units | solo super | UnitsManager, RegistraConsegnaModal(+Multipla), InviteLinkCard, ui/Toast |
| .../[id]/documenti | admin+super | DocumentiClient, CorrectDataPanel, AssignUnitPanel, UnitDocumentMatrix, DateField |
| .../[id]/manutenzioni | admin+super (`canManagePlan` solo super) | ManutenzioniClient, ItemConfigForm, MaintenanceBadge, FilterCounters, ui/Input, Button, Modal, Toast |
| .../[id]/fascicolo | admin+super | ui/Table |
| .../[id]/fornitori | solo super | FornitoriManager |
| .../[id]/attivita | admin+super | ActivityTimelineRow |
| /admin/manutenzioni | solo admin | ManutenzioniTable, FilterCounters |
| /admin/manutenzioni/[id] | admin (azioni) + super (lettura) | N3AdminActions, ui/Badge, AwaitingDeliveryNote |
| /admin/administrators, /[id] | solo super | PageHeader |
| /admin/fornitori | solo super | FornitoriManager |
| /admin/attivita | solo super (pagina demo, voce di menu commentata) | ActivityTimelineRow, PILL_BASE |
| /admin/settings | solo super | SettingsShell, IdentityTab, NotificationsTab, AccountTab, SecurityTab |

### Login, invito, errori (nessun layout dedicato, nessun loading)
| URL | File | Componenti |
|---|---|---|
| /auth/login | login/page, LoginForm | ActiveSessionPanel, BrandMark, ui/Button, ui/Input |
| /auth/error | error/page | ActiveSessionPanel, buttonVariants |
| /welcome/[token] | page, InviteError | InstallPrompt, InviteError |
| /welcome/[token]/accept | accept/page, AcceptConfirm | InviteError |

Lacune strutturali:
- **Nessun `error.tsx`, `not-found.tsx`, `global-error.tsx`** in tutto `src/app`. Il codice chiama `notFound()` in manutenzioni/[id] (app e admin), administrators/[id], residences/[id] e sotto-pagine; `throw new Error` in administrators/[id]/page.tsx:50. Tutti finiscono sulle pagine standard di Next in inglese.
- `loading.tsx` solo su alcune route. Mancano: administrators/[id], attivita, fornitori, manutenzioni (+[id]), residences/new, units/documenti/fornitori/attivita di residenza, auth/*, welcome/*.
- Senza `metadata`: (app)/page, admin/page, residences/new, settings, auth/error, auth/login, welcome/* (usano "CasaZero").

## 4. Testi in inglese ed etichette duplicate

### Inglese
| # | Riscontro | Evidenza | Confidenza |
|---|---|---|---|
| 4.1 | Pagine 404 ed errore runtime standard di Next in inglese (mancano not-found/error/global-error) | vedi sezione 1 | alta (comportamento standard, app non eseguita) |
| 4.2 | Login mostra il messaggio grezzo di Supabase Auth | app/auth/login/LoginForm.tsx:44, :61 `text: error.message` | alta sul passaggio, il testo inglese dipende dal servizio |
| 4.3 | Molte server action restituiscono `error.message` di Postgres/Supabase, spesso finito in toast | (app)/manutenzioni/actions.ts:95; (app)/profilo/actions.ts:101,119; admin/manutenzioni/actions.ts:38; admin/settings/actions.ts:60,89; admin/fornitori/actions.ts:177; residences/[id]/actions.ts:66; units/actions.ts:257,309,340; fornitori/actions.ts:85,91,120,251,317,362 | alta sul passaggio, media sulla visibilità in UI |
| 4.4 | Prefisso italiano con coda inglese | (app)/documenti/actions.ts:50,66; residences/[id]/documenti/actions.ts:313,362,454,491,614,674,807; DocumentiClient.tsx:136 | alta |
| 4.5 | `friendlySupplierError` (lib/supplier-errors.ts:21) traduce solo i fornitori: modello da estendere | lib/supplier-errors.ts:21 | alta |
| 4.6 | API: 'Server misconfigured', 'Unauthorized', `error.message` grezzo | api/cron/daily/route.ts:46,51,75; api/download/route.ts:24 | alta, impatto basso (endpoint non UI) |
| 4.7 | Titoli doppi: template root `'%s · CasaZero'` + titoli con "— CasaZero" → "Fornitori — CasaZero · CasaZero" | app/layout.tsx:23-24; admin/fornitori/page.tsx:8; administrators/page.tsx:13; administrators/[id]/page.tsx:19; admin/manutenzioni/page.tsx:13 `'Attività — Amministratore'` | alta |
| 4.8 | Messaggi nativi dei form HTML (`required`) dipendono dal browser | residences/new/page.tsx:325 | bassa, non verificato |

Cerca di Loading/Submit/Cancel/Save/Back/Sign/Close/Delete in JSX, placeholder, aria-label, title: nessun risultato. La UI statica è italiana.

### Etichette duplicate o incoerenti
| # | Concetto | Varianti con file:riga |
|---|---|---|
| 4.9 | Stato in corso | "Caricamento…" generico (N3AdminActions.tsx:45; ManutenzioniTable.tsx:108; ResidencePhotoUpload.tsx:172; UploadDocumentForm.tsx:113) vs specifici "Salvataggio…", "Registrazione in corso…", "Creazione in corso…", "Invio in corso…", "Attivazione in corso…" |
| 4.10 | Salvare | "Salva" (AssignUnitPanel.tsx:69, CorrectDataPanel.tsx:131, FornitoriManager.tsx:360,617), "Salva foto" (ResidencePhotoUpload.tsx:172), "Salva nuova data" (RegistraConsegnaModal.tsx:207), "Salva configurazione" (ItemConfigForm.tsx:141), "Conferma" (N3AdminActions.tsx:121; DocumentiClient.tsx:1241), "Conferma classificazione" (DocumentiClient.tsx:1660), "Conferma" (AcceptConfirm.tsx:67). "Salva modifiche" non esiste |
| 4.11 | Uscire da un form | "Annulla" (residences/new/page.tsx:632, AdminBlock.tsx:174, DocumentiClient.tsx:702,1233, ManutenzioniClient.tsx:796/827/951, RegistraConsegnaModal.tsx:185, UnitsManager.tsx:244, AccountTab.tsx:85, FornitoriManager.tsx:237…, N3AdminActions.tsx:114) vs "Chiudi" (RegistraConsegnaModal.tsx:178/180/212, RegistraConsegnaMultiplaModal.tsx:195/198, DocumentiClient.tsx:602, "Chiudi revisione/correzione/unità" 1500-1524). "Annulla esclusione" (DocumentiClient.tsx:1254,1310) significa ripristino, non uscita |
| 4.12 | Copiare un link | "Copia link"/"Copiato" (ProfiloClient.tsx:210-212), "Copia"/"Copiato" (AdminBlock.tsx:269), "Copia link" + toast "Link copiato." (InviteLinkCard.tsx:22,35), "Link copiato" (InstallPrompt.tsx:139) |
| 4.13 | Creare/rimuovere | "Genera invito familiare" (ProfiloClient.tsx:230) vs "Genera invito" (UnitsManager.tsx:465); "Revoca invito" (ProfiloClient.tsx:197) vs "Rimuovi" (FornitoriManager.tsx:244,276,561) vs "Rimuovi collegamento" (486) — media, possibili varianti legittime |
| 4.14 | Condominio / Condominiale | "Condominio" come ambito (FascicoloList.tsx:26,124; ManutenzioniClient.tsx:556,636,674; fascicolo/page.tsx:100; residences/[id]/page.tsx:190,220) vs "Condominiale" (admin/manutenzioni/[id]/page.tsx:184; lib/activity-event-view.ts:88). "Residenza" coerente nel menu admin |
| 4.15 | "Attività" ha tre significati | sidebar admin → /admin/manutenzioni (AdminSidebar.tsx:39); pagina super /admin/attivita (AdminSidebar.tsx:29, commentata); /residences/[id]/attivita "Attività residenza". Lato residente la stessa vista si chiama "Manutenzioni" (BottomNav.tsx:10) |
| 4.16 | "Admin" mai visibile; "Amministratore" ovunque; "costruttore" sempre minuscolo (14 occorrenze, IdentityTab.tsx:115) | — |
| 4.17 | Logout | "Esci dall'account" (ProfiloClient.tsx:305, AdminSidebar.tsx:123) vs "Esci e accedi con un altro account" (ActiveSessionPanel.tsx:42, AcceptConfirm.tsx:76) — contesti diversi, plausibile |
| 4.18 | "Registra consegna" bottone in creazione, "Salva nuova data" in modifica; stesso testo come hint/etichetta (UnitsManager.tsx:478, InviteLinkCard.tsx:8, DateField.tsx:11) | RegistraConsegnaModal.tsx:167-173,207 |

## 2. Design system attuale

Definito in `app/globals.css` (`@theme`, Tailwind v4) + `app/layout.tsx:7-19` (font). Conteggi con grep su 185 file .ts/.tsx.

| Area | Token definiti | Note |
|---|---|---|
| Brand | brand-dark #04342C, brand-medium #0F6E56, brand-light #E1F5EE, brand-accent #9FE1CB | `--wl-brand-*` white-label in `:root` |
| Superfici | background #F4F3EF, surface #FFFFFF, border #E4E6E2 | |
| Testo | text-primary #20302A, text-secondary #5F6E68, neutral-500 sovrascritto #5E5E5E | commenti in globals.css documentano i contrasti AA |
| Semantici legacy | semantic-red/amber/blue (+ -bg) | marcati "non toccare" |
| Stato v2 | status-overdue #B42318, status-inprogress #B45309, status-reminder #175CD3 | |
| Ombra | `shadow-elevated` (solo elementi flottanti) | |
| z-index | `--z-index-*`: dropdown 20, sticky 30, modal-backdrop 40, modal 50, toast 60, tooltip 70 | |
| Font | Inter 400/500 (sans), Source Serif 4 600 (serif) | |
| Non definiti | scala spaziature, scala tipografica, raggi | si usa la scala stock Tailwind |

### Dove i token sono rispettati o ignorati

| # | Riscontro | Evidenza | Conf. |
|---|---|---|---|
| 2.1 | Hex scritti a mano concentrati in welcome/*, InstallPrompt, Button; email e PDF a parte (inevitabili). Tutti ricalcano token esistenti | righe con hex per file: lib/notifications.ts 26, welcome/[token]/page.tsx 20, lib/pdf/ReportDocument.tsx 18, lib/pdf/FascicoloDocument.tsx 11, AcceptConfirm.tsx 11, InstallPrompt.tsx 8, InviteError.tsx 6, BrandMark.tsx 3. `text-[#20302A]` x18, `text-[#0F6E56]` x5, `bg-[#F4F3EF]` x5. Es. AcceptConfirm.tsx:39,41,57,64-65; InstallPrompt.tsx:151,153,166 | alta |
| 2.2 | `ui/Button` ha due hover hex fuori token (verificato) | components/ui/Button.tsx:13 `hover:bg-[#0B4A40]`, :17 `hover:bg-[#961F15]` | alta |
| 2.3 | Nessuna classe colore Tailwind stock (red/gray/slate/amber/green/blue…): 0 occorrenze. Solo famiglia `neutral-*`: 103 usi (text-neutral-600 x31, -500 x26, -900 x21, bg-neutral-600/7 x13), senza token per 600/900/700/400. Anche `ui/*` usa neutral-900 invece di text-primary | Modal.tsx:49; Input.tsx FIELD_BASE; Button.tsx:14-15; settings tab AccountTab:34, IdentityTab:80/95, NotificationsTab:46, SecurityTab:49 | alta |
| 2.4 | `bg-white` (14) al posto di `bg-surface` (~133); backdrop modali a mano `bg-black/40` (6) vs `bg-brand-dark/40` dei componenti ui | administrators/page.tsx:170; administrators/[id]/page.tsx:176,230; AdminBlock.tsx:60; DocumentiClient.tsx:556; FornitoriManager.tsx:223,255; backdrop: FornitoriManager.tsx:222,254, new/page.tsx:620, DocumentiClient.tsx:555, ManutenzioniClient.tsx:750 (verificato con grep) | alta |
| 2.5 | Due sistemi di colore di stato in parallelo: legacy `semantic-*` 152 usi in 33 file (red 76, amber 42, red-bg 15, amber-bg 13, blue 4, blue-bg 2) vs `status-*` 39 (overdue 21, inprogress 16, reminder 2). Il blu del promemoria ha due valori (`semantic-blue` in FascicoloList.tsx:122 e MaintenanceBadge.tsx:25; `status-reminder` in Badge.tsx:46) | legacy: MaintenanceBadge.tsx:10-11,25; MaintenanceCard; UnitLifecycleBadge.tsx:7; FilterCounters. status: ui/Badge.tsx:8-9,46; ui/Button.tsx:17; ManutenzioniTable.tsx:39-40,110; DocumentiClient.tsx (entrambi nello stesso file) | alta |
| 2.6 | Font-size arbitrari: `text-[13px]` x13, `text-[22px]` x9, `text-[10px]` x2, `text-[15px]` x1. Titolo pagina incoerente: `PAGE_TITLE` = `font-serif text-3xl` (PageHeader.tsx:11) ma le pagine (app) scrivono a mano `text-[22px]` | documenti/page.tsx:69; fascicolo/page.tsx:159,207; manutenzioni/page.tsx:60,103; ProfiloClient.tsx:109; manutenzioni/[id]/page.tsx:102; DocumentiList.tsx:63; BottomSheet.tsx:100. Scala standard: text-sm 320, text-xs 300, text-base 26 | alta |
| 2.7 | Spaziature arbitrarie poche e sensate: `h-[72px]` x5, `h-[22px]` x3 (UnitDocumentMatrix.tsx:79 duplica PILL_BASE), `pb-[max(1rem,env(safe-area-inset-bottom))]` BottomSheet.tsx:90 mentre esiste `.pb-safe` in globals.css | | alta |
| 2.8 | Raggi: nessuna regola. rounded-xl 188, rounded-lg 152, rounded 80, rounded-full 45, rounded-md 12. `ui/Button` e `ui/Input` = rounded-lg; i bottoni a mano usano rounded-xl | new/page.tsx:418; DocumentiClient.tsx:600,707,722,1658; FornitoriManager.tsx:242,274; N3AdminActions.tsx:119,137; UploadDocumentForm.tsx:44 | alta |
| 2.9 | Ombre: `shadow-elevated` 4 (Modal.tsx:45, BottomSheet.tsx:90, Toast.tsx:68, AdminSidebar.tsx:191) rispetta la regola. Fuori regola: `shadow-lg` su modali a mano e `shadow-sm` su elementi non flottanti | shadow-lg: DocumentiClient.tsx:556, FornitoriManager.tsx:223,255. shadow-sm: DocumentiClient.tsx:1658, ManutenzioniClient.tsx:385,394 (i toggle ProfiloClient.tsx:358, NotificationsTab.tsx:93 sono accettabili) | alta |
| 2.10 | z-index: i modali a mano usano `z-50` numerico (= z-modal per coincidenza), header sticky `z-10` invece di `z-sticky`. Nessun `z-[..]` né `zIndex` inline | z-50: new/page.tsx:620, AdminBlock.tsx:53, DocumentiClient.tsx:555, ManutenzioniClient.tsx:750, FornitoriManager.tsx:222,254. z-10: manutenzioni/[id]/page.tsx:96, ProfiloClient.tsx:108 | alta |
| 2.11 | Font: caricati solo Inter 400/500 e Source Serif 600. `font-semibold` su testo sans (12 punti) viene sintetizzato dal browser. Titolo di `ui/Modal` è sans semibold, titolo di `ui/BottomSheet` è serif 600 (incoerenti). `<strong>` nudi → bold 700 sintetizzato. `font-mono` x1 non caricato | Modal.tsx:49 (verificato); BrandMark.tsx:41; LoginForm.tsx:71; welcome/[token]/page.tsx:122,226; residences/[id]/page.tsx:176,433; settings tab h2; `<strong>`: AwaitingDelivery.tsx:37, (app)/manutenzioni/[id]/page.tsx:129, admin/manutenzioni/[id]/page.tsx:164; AdminBlock.tsx:255 | alta |

Adozione componenti `ui/*`: 37 file importano da `components/ui`. Toast 12, Button 20 (9 solo `buttonVariants`), Badge 7, Input 7, Table 4, Modal 3, BottomSheet 1.

## 3. Componenti fatti in modi diversi

| # | Famiglia | Stato attuale | Evidenza |
|---|---|---|---|
| 3.1 | Bottoni | ~114 `<button>` a mano vs 31 `<Button>` e 11 `buttonVariants`. Almeno 15 varianti di className per il primario (rounded-lg/xl, py-2/2.5/3, text-xs/sm). I bottoni a mano non hanno focus ring né altezza touch coerente (`ui/Button`: `h-11 md:h-9`) | per file: DocumentiClient 26, FornitoriManager 16, UnitsManager 13, residences/new/page 11, ManutenzioniClient 10. Es. new/page.tsx:418,480,610; DocumentiClient.tsx:600,707; UnitsManager.tsx:208,236,305; AssignUnitPanel.tsx:67; AdminBlock.tsx:126,135,182,263; N3AdminActions.tsx:137 |
| 3.2 | Bottoni secondari/distruttivi/filtro | secondari a mano: DocumentiClient.tsx:697, new/page.tsx:512, ProfiloClient.tsx:224. Distruttivi solo testo rosso: InviteLinkCard.tsx:56, IdentityTab.tsx:133, ManutenzioniClient.tsx:665. Pill di filtro tutte diverse | DocumentiList.tsx:169, ManutenzioniClient.tsx:421, FascicoloList.tsx:71, AdminSidebar.tsx:94 |
| 3.3 | Card | nessun componente `Card`: stringa `bg-surface rounded-xl border border-border` ripetuta ~100 volte con padding p-3/4/5/6/8; varianti con `bg-white` | p-4 x48, p-6 x12, p-8 x10; `bg-white`: administrators/page.tsx:170, administrators/[id]/page.tsx:176,230, DocumentiClient.tsx:556, FornitoriManager.tsx:223; welcome/page.tsx:140,236; AcceptConfirm.tsx:41; InstallPrompt.tsx:151 |
| 3.4 | Badge/pill | `ui/Badge` (PILL_BASE `h-[22px] px-2.5`, 7 file) + legacy `MaintenanceBadge` (semantic-*, stesso significato di StatusBadge con colori diversi; ancora usato in (app)/page.tsx, ManutenzioniClient, ReportDocument, maintenance-labels) + ≥8 pill a mano | FascicoloList.tsx:119; administrators/[id]/page.tsx:187; DocumentiClient.tsx:1391,1468,1473; AdminSidebar.tsx:101; AwaitingDelivery.tsx:88; FornitoriManager.tsx:476; MaintenanceCard.tsx:52 |
| 3.5 | Form | `ui/Input` (Input/Textarea/Select/Label/FieldHelp/FieldError) in 7 file; 64 campi nativi fuori da ui (10 hidden), 36 `<label>` a mano. Classe dominante a mano (x20): `bg-background … focus:ring-2 focus:ring-brand-medium`, diversa dalla ufficiale (`bg-surface h-11 md:h-9 focus:ring-3 ring-brand-dark/12`). Variante compatta senza focus ring (x4) | per file: FornitoriManager 12, DocumentiClient 11, new/page 7, UploadDocumentForm 5, N3AdminActions 5, CompletionSheet 5, UnitsManager 4, ItemConfigForm 4; Input.tsx:4-8 |
| 3.6 | Tabelle | `ui/Table` in 4 file (ManutenzioniTable, ResidencesTable, fascicolo/page, UnitsSummaryTable); 1 `<table>` a mano; liste "righe in card" con divide-y (media confidenza, dedotta dalle classi) | UnitDocumentMatrix.tsx:58; administrators/page.tsx:170; administrators/[id]/page.tsx:176,230 |
| 3.7 | Avvisi | nessun `Alert`. ≥8 implementazioni (errore con/senza bordo, solo testo, warning ambra a 5 formati) tutte su `semantic-*`. `role="alert"` solo 2 volte (residences/[id]/documenti/page.tsx:37, AcceptConfirm.tsx:57); nessun banner info blu | residences/new/page.tsx:588,594; UnitsManager.tsx:251,258; (app)/page.tsx:198; ResidencePhotoUpload.tsx:154; AdminBlock.tsx:287; FornitoriManager.tsx:227,259; DeliveryPreviewWarnings.tsx:12,18; RegistraConsegnaModal.tsx:219; residences/[id]/page.tsx:415; testo errore: `text-semantic-red` x63, `text-status-overdue` x14 |
| 3.8 | Stati vuoti | nessun `EmptyState` (solo `ResidencesEmptyState` specifico); tono e dimensione cambiano ogni volta | `text-neutral-500` attivita/page.tsx:75; `text-text-secondary` FascicoloList.tsx:83; `text-brand-medium` ManutenzioniList.tsx:42; `text-brand-dark` administrators/page.tsx:154; `text-text-primary/50` administrators/[id]/page.tsx:87 |
| 3.9 | Modali | `ui/Modal` (3 file) e `ui/BottomSheet` (1) vs 6 modali a mano (z-50, bg-black/40, bianco, ombra diversa o assente). ManutenzioniClient.tsx usa entrambi nello stesso file. Solo 3 `role="dialog"` in tutto il codice, tutti in ui/* e AdminSidebar | new/page.tsx:620; ManutenzioniClient.tsx:750; DocumentiClient.tsx:555; FornitoriManager.tsx:222,254; AdminBlock.tsx:53 (grep verificato) |
| 3.10 | Spinner/loading | un solo approccio (lucide `Loader2` + `animate-spin`, 11 usi), con dimensioni w-3/3.5/4 e strokeWidth diversi; nessuno skeleton | AdminBlock.tsx:106,184,247; UnitsManager.tsx:284; DocumentiClient.tsx:735,755,1322,1392; RegistraConsegnaModal.tsx:227 |
| 3.11 | Errore pagina | due implementazioni parallele della stessa idea; nessun `error.tsx` | auth/error/page.tsx:30 (`semantic-red-bg`, buttonVariants) vs welcome/[token]/InviteError.tsx:7 (`bg-[#FCEBEB]`, `style={{backgroundColor:'#04342C'}}`) |

## 5. Responsive a 375px (solo lettura del codice, nessun browser)

Il codice è nel complesso curato: `viewport` senza maximum-scale (`app/layout.tsx:36-40`), `ui/Table` con wrapper `overflow-x-auto` che sotto lg diventa pila di card (`Table.tsx:32-54,67`), drawer mobile per la dashboard (`AdminSidebar.tsx:134,169-191`), padding `px-4 lg:px-6`. Nessuna rottura grave trovata nella PWA, in auth o in welcome.

| # | Gravità | Riscontro | Evidenza | Conf. |
|---|---|---|---|---|
| 5.1 | media | `ui/Modal` non ha `max-h` né `overflow-y-auto`: su telefono basso o in landscape il pannello esce dallo schermo e non scorre. `BottomSheet` invece li ha | Modal.tsx:45 (verificato: nessun `max-h` in Modal); BottomSheet.tsx:91 `max-h-[85vh] overflow-y-auto` | media-alta |
| 5.2 | media | Footer del `Modal` senza `flex-wrap` con bottoni `whitespace-nowrap`: link "Segna come non consegnata" + Annulla + Registra consegna superano i ~295px utili e sbordano (stima sulle lunghezze del testo, non misurata) | Modal.tsx:63 (verificato) `flex items-center justify-end gap-3 mt-6`; RegistraConsegnaModal.tsx:200,205-206 | media |
| 5.3 | media | Modali a mano senza `max-h`/scroll | new/page.tsx:620-621; FornitoriManager.tsx:222-223,254-255; ManutenzioniClient.tsx:750-754. Con scroll corretto: AdminBlock.tsx:60, DocumentiClient.tsx:556 | media |
| 5.4 | bassa | Input/textarea/select a `text-sm` (14px): iOS Safari fa zoom al focus sotto i 16px; nessuna regola in globals.css | Input.tsx:5; UploadDocumentForm.tsx:77; AddCommentForm.tsx:28; N3AdminActions.tsx:78 | media (comportamento iOS noto, non testato) |
| 5.5 | bassa | Wizard nuova residenza: etichetta fissa `w-40` + DateField, input ~140px a 375px; `grid-cols-2` senza variante mobile | new/page.tsx:371, :495 | media / bassa |
| 5.6 | bassa | `<h1>` con il nome della residenza senza `break-words` | welcome/[token]/page.tsx:226 | alta (basso rischio) |
| 5.7 | nessuna | Già gestiti: email con `break-all` (AcceptConfirm.tsx:52, ProfiloClient.tsx:126), filtri con larghezze fisse dentro `flex-wrap` (DocumentiClient.tsx:808,814,842,868), `UnitDocumentMatrix` con `overflow-x-auto` (:57-58), login `p-8` dentro `px-4` (LoginForm.tsx:78) | | alta |

Dashboard (desktop-first): sidebar e tabelle a posto; i problemi sono solo i modali (5.1-5.3).

## 6. Accessibilità di base

### 6.1 Contrasti calcolati sui token reali (soglie: testo 4.5:1, non-testo 3:1)
| Coppia | Rapporto | Esito |
|---|---|---|
| text-primary su bianco / su background | 13.84 / 12.46 | ok |
| text-secondary su bianco / background / brand-light | 5.36 / 4.83 / 4.72 | ok |
| brand-medium su bianco / brand-light / background | 6.20 / 5.46 / 5.59 | ok |
| bianco su brand-medium / brand-dark / status-overdue | 6.20 / 13.70 / 6.57 | ok |
| status-overdue su bianco / background | 6.57 / 5.92 | ok |
| status-inprogress su bianco / background | 5.02 / 4.52 | ok, al limite su background |
| status-reminder su bianco | 5.99 | ok |
| semantic red / amber / blue sui rispettivi -bg | 6.13 / 5.87 / 5.70 | ok |
| neutral-500 (#5E5E5E) su background | 5.84 | ok |
| accent #9FE1CB su brand-medium / su bianco | 4.17 / 1.49 | non usare; `brand-accent` non risulta usato nei .tsx |
| border #E4E6E2 su bianco / background | 1.26 / 1.13 | decorativo ok; non ok come bordo di controlli (6.6) |

### 6.2 Riscontri
| # | Gravità | Riscontro | Evidenza | Conf. |
|---|---|---|---|---|
| 6.2 | alta | Testo informativo con opacità: `text-text-primary/50` 2.97, `/40` 2.30, `/30` 1.82, `/60` 3.92 su bianco; `text-semantic-red/70` su red-bg 3.45, `text-semantic-amber/70` su amber-bg 3.17 | administrators/page.tsx:167,175,248; administrators/[id]/page.tsx:87,185,213,263; AdminBlock.tsx:90,104,162,194,220,234,255; (app)/page.tsx:203 (PWA); administrators/page.tsx:200 | alta |
| 6.3 | alta | Welcome (PWA pubblica): testo hex a opacità bassa, 2.9-3.9 | welcome/[token]/page.tsx:181,182,319; AcceptConfirm.tsx:48 | alta |
| 6.4 | alta | Anello di focus debole: `ring-brand-dark/20` su bianco = 1.48:1 (serve 3:1), spesso con `outline-none` come unico indicatore, ~25 usi. `Input.tsx:7` è ok perché cambia anche il bordo | Button.tsx:10 (verificato); Modal.tsx:55 (verificato); BottomSheet.tsx:109 (verificato); AdminSidebar.tsx:72,92,120,175,203; PageHeader.tsx:28; FascicoloList.tsx:69,147; DocumentiList.tsx:148,173; ProfiloClient.tsx:196,207,227 | alta sul calcolo, media sulla visibilità (ring con offset 2) |
| 6.5 | alta | Focus invisibile: `focus:outline-none` senza alcun ring su campi (4 punti verificati) | ItemConfigForm.tsx:84,100,115,130 | alta |
| 6.6 | media | Bordo dei campi (`border-border`) e toggle spento (`bg-border`) a 1.26:1, richiesti 3:1 per i controlli | Input.tsx:5; NotificationsTab.tsx:90; ProfiloClient.tsx:346 | media (valutazione severa, comune nei design system chiari) |
| 6.7 | alta | Label non associate: ~37 su 65 campi senza `htmlFor`/`aria-label`/wrapper; la `<label>` è sibling non collegata, o c'è solo il placeholder. Nella PWA: | UploadDocumentForm.tsx:67,72,83,96; AddCommentForm.tsx:23 (solo placeholder); N3AdminActions.tsx:60,72,86,98. Dashboard: FornitoriManager.tsx:299-607; UnitsManager.tsx:218,225,349; DocumentiClient.tsx:643,659,681,809; ItemConfigForm.tsx:81-125; ManutenzioniClient.tsx:526; new/page.tsx:660,682; ResidencePhotoUpload.tsx:117; IdentityTab.tsx:98. Esempi buoni: LoginForm.tsx:98, RegistraConsegnaModal.tsx:252, new/page.tsx:543 | alta sul riscontro, media sul conteggio (euristica) |
| 6.8 | alta | Toggle `role="switch"` senza nome accessibile (la label è un `<p>` non collegato) | ProfiloClient.tsx:335-343,263; NotificationsTab.tsx:83-90 | alta |
| 6.9 | media | Bottoni solo-icona senza `aria-label`/`title`, spesso con tap target piccoli | UploadDocumentForm.tsx:56 (PWA, ~24px); DocumentiClient.tsx:561; new/page.tsx:297; UnitsManager.tsx:360,367,377 (16-30px) | alta |
| 6.10 | alta | Errori non annunciati: solo 2 `role="alert"` in tutto il codice (AcceptConfirm.tsx:57, residences/[id]/documenti/page.tsx:37) e il Toast `role="status" aria-live="polite"`; ~40 `<p>` d'errore senza live region né `aria-describedby`; `aria-invalid` solo nei wrapper di Input.tsx; `FieldError` senza role | LoginForm.tsx:115-118; AddCommentForm.tsx:31; UploadDocumentForm.tsx:105; N3AdminActions.tsx:101; ProfiloClient.tsx:288; Input.tsx:67-73 | alta |
| 6.11 | media | Toast: montato insieme al testo (poco affidabile con i lettori di schermo), errori sempre `polite`, senza chiusura né pausa (8s errori, 4s successi) | Toast.tsx:16-19,62-71 | media |
| 6.12 | media | Sei modali a mano senza `role="dialog"`, focus trap, Escape, ripristino del focus. `ui/Modal` e `AdminSidebar` sono corretti (`useDialogFocus`); `BottomSheet` replica la stessa logica a mano (duplicazione) | new/page.tsx:620; AdminBlock.tsx:53; DocumentiClient.tsx:555; ManutenzioniClient.tsx:750; FornitoriManager.tsx:222,254 (verificato: nessun `role="dialog"` fuori da ui/ e AdminSidebar); BottomSheet.tsx:36-74 | alta |
| 6.13 | bassa | `id="modal-title"` e `id="sheet-title"` fissi: collidono se due modali sono montate insieme | Modal.tsx:43,49; BottomSheet.tsx:87,100 | media |
| 6.14 | media | PWA: BottomNav senza `aria-current="page"` (solo colore). Tap target sotto 44px: chiudi in UploadDocumentForm.tsx:55-57, bottone Carica `py-2.5` (:43), Aggiungi commento (AddCommentForm.tsx:36). Dashboard: Modal.tsx:55 `w-8 h-8`, Button `size="table"` h-8, toggle `w-9 h-5` | BottomNav.tsx:25-37 | alta |
| 6.15 | bassa | Nessuno skip link; nessun `prefers-reduced-motion`/`motion-reduce` (0 occorrenze) nonostante `animate-spin`/transizioni; `Table.tsx:68` con `max-lg:block` su `<table>` toglie la semantica tabellare sotto lg, `TableRow clickable` usa `role="button"` su `<tr>` (:123); da verificare se `BrandMark` ha testo accessibile nel link logo (AdminSidebar.tsx:69-72) | | media |
| 6.16 | ok | Zoom non bloccato; tutte le `<img>` hanno `alt`; BottomNav 48px, pill filtro e Button default 44px nella PWA | layout.tsx:36-40; BottomNav.tsx:30 | alta |

## 7. Proposta di ordine di lavoro (blocchi piccoli, senza nuovo stile)

Principio: prima ciò che non dipende dallo stile (correttezza, accessibilità, rete di sicurezza), poi il consolidamento sui componenti `ui/*` già esistenti (stesso aspetto, meno varianti), e solo alla fine il nuovo stile, che decide Filippo. Un concern per commit; ogni blocco ha `npm run verify` e una prova dal vivo da indicare.

**Fase A — rete di sicurezza e correttezza (nessuna decisione di stile)**
1. `not-found.tsx`, `error.tsx`, `global-error.tsx` in italiano, con i componenti esistenti. Prova: `npm run verify` + URL inesistente e errore forzato in dev.
2. Titoli: rimuovere il doppio suffisso "· CasaZero" e allineare `'Attività — Amministratore'` (4.7). Prova: verify + titolo scheda su 3 pagine.
3. Errori tecnici in italiano: estendere il modello di `lib/supplier-errors.ts` a un helper unico, applicandolo per area in commit separati (auth/login; profilo+manutenzioni; documenti; unità; fornitori/impostazioni). Rispetta la regola CLAUDE.md: errore di dominio ≠ guasto tecnico. È il blocco più ampio: da dividere.
4. Accessibilità PWA: `htmlFor`/`id` in `UploadDocumentForm`, `AddCommentForm`, `N3AdminActions`; `role="alert"` sui messaggi di errore e di `LoginForm`; `aria-label` sui toggle del profilo; `aria-current` su BottomNav; target 44px dove manca (6.7-6.10, 6.14).
5. Accessibilità dashboard: label dei campi legacy (per file), `aria-label` dei bottoni solo-icona, `focus:outline-none` senza ring in `ItemConfigForm` (6.5, 6.7, 6.9).
6. `ui/Modal`: `max-h` + scroll, footer `flex-wrap`, id con `useId` (5.1, 5.2, 6.13). Singolo file.

**Fase B — consolidamento su ciò che esiste (aspetto invariato)**
7. Sostituire i 6 modali a mano con `ui/Modal` (`FornitoriManager`, `DocumentiClient`, `ManutenzioniClient`, `new/page`, `AdminBlock`): un commit per file. Risolve in un colpo 5.3, 6.12, z-50, bg-black, shadow-lg. `AdminBlock` è una sheet responsive: valutare `BottomSheet` o un'estensione.
8. Hex → token in `welcome/*`, `InstallPrompt`, `InviteError`, hover di `Button.tsx` (2.1, 2.2, 2.4). Per l'hover serve scegliere se aggiungere un token.
9. `bg-white` → `bg-surface`, `z-10` → `z-sticky`, `<strong>` nudi → `font-medium` (2.4, 2.10, 2.11). Meccanico.
10. Campi a mano → `ui/Input/Select/Textarea`, per file, a partire dalla PWA, poi `FornitoriManager`, `DocumentiClient`, `new/page` (3.5).
11. Bottoni a mano → `ui/Button`, stessa strategia (3.1-3.2).
12. Opacità: sostituire `/30-/60` e `semantic-*/70` con colori pieni dei token (6.2, 6.3). Tocca di poco il look: da mostrare a Filippo.

**Fase C — dipende dalle decisioni di Filippo**
13. Nuovi componenti condivisi `Card`, `Alert`, `EmptyState`, `Spinner` (3.3, 3.7, 3.8, 3.10): prima il solo contratto delle prop, lo stile lo decide Filippo.
14. Migrazione `semantic-*` → `status-*` (2.5, 3.4). Rischi da tenere d'occhio: `MaintenanceBadge` è usato anche da `ReportDocument` (PDF); le card promemoria non devono mai leggere stato né diventare rosse (invariante CLAUDE.md).
15. Scala tipografica e pesi: titolo pagina unico (2.6), `font-semibold` su sans (2.11), token per `neutral-*` (2.3), raggi (2.8), ombre (2.9).
16. Focus ring a 3:1 e bordo dei controlli (6.4, 6.6): cambia l'aspetto di tutti i controlli, quindi insieme al nuovo stile.
17. Nuovo stile.

**Decisioni richieste a Filippo prima della Fase C**
- Quale famiglia sopravvive tra `semantic-*` e `status-*`? Tenere il blu "consigliata" in un solo valore.
- Raggio standard: `rounded-lg` (quello di `ui/Button`/`ui/Input`) o `rounded-xl` (quello dei bottoni a mano e delle card)?
- Vocabolario unico: "Condominio" / "Condominiale" / "Residenza", e una sola parola per "Salva", "Annulla/Chiudi", "Copia link" (4.9-4.14).
- "Attività" come nome delle tre viste (4.15): rinominare?

## Limiti di questa diagnosi
- Nessun browser, nessun avvio dell'app: i punti sul comportamento reale (404 standard di Next, zoom iOS, overflow dei footer) vengono dalla lettura del codice o dal comportamento noto, non da una prova.
- Verificati direttamente da me: assenza di `error.tsx`/`not-found.tsx`/`global-error.tsx`, `Button.tsx:13,17`, `Modal.tsx:45,49,55,63`, i 6 modali a mano (`fixed inset-0`), `ItemConfigForm.tsx:84,100,115,130`, `BottomSheet.tsx:91,109`. Il resto è di tre subagent di sola lettura; i conteggi grep sono da riverificare con la stessa query prima di ogni commit.
- Il conteggio dei campi senza label (6.7) è euristico.
