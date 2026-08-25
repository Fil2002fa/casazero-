# Handoff — Colore brand fisso + pagina Attività · 01/07/2026 20:46

## Sommario
Sessione dedicata alla chiusura dell'Approccio A per la dashboard super_admin: creata
la pagina Attività con dati demo (ultimo commit del piano sidebar) e rimosso il color
picker white-label rendendo il colore brand fisso (#04342C) in tutti i punti dell'app.
La rimozione del picker è stata propagata coerentemente a whitelabel, pagina QR di
benvenuto e report PDF per evitare che valori vecchi salvati in `builders.primary_color`
mostrino colori incoerenti.

## Lavoro completato
- [x] Pagina `/admin/attivita` con feed cronologico di eventi demo (hardcoded) + badge "Dati demo"
- [x] Rimosso color picker dal tab Identità costruttore in `/admin/settings`
- [x] `whitelabel.ts`: `brandDark` ora sempre `#04342C`, non legge più `primary_color`
- [x] Action `updateBuilderSettings`: rimosso `primary_color` dal payload di update
- [x] Rimossa propagazione prop `builderColor`/`initialColor` lungo la catena settings
- [x] Pagina QR benvenuto (`welcome/[token]/page.tsx`): colore fisso `#04342C`
- [x] Report PDF (`api/report/route.ts`): `builderColor` fisso `#04342C` in entrambi gli scope (unità + residenza)
- [x] Build verde verificata prima di ogni commit (3 commit totali)

## File toccati
### Creati
- `src/app/(dashboard)/admin/attivita/page.tsx` — Server Component (`requireRole(['super_admin'])`), feed cronologico read-only con 7 eventi hardcoded, icone/colori per tipo evento, badge "Dati demo". Dichiaratamente mock per la demo, nessun backend eventi.

### Modificati
- `src/lib/whitelabel.ts` — `brandDark` ritorna sempre `#04342C`; rimosso `primary_color` dalla select (fetcha solo `logo_url, name`)
- `src/app/(dashboard)/admin/settings/IdentityTab.tsx` — rimosso blocco UI color picker (input colore, hex, label, stato `previewColor`) e prop `initialColor`; anteprima header usa costante `BRAND_DARK`
- `src/app/(dashboard)/admin/settings/actions.ts` — `primary_color` non più letto dal form né incluso in `updateData`
- `src/app/(dashboard)/admin/settings/SettingsShell.tsx` — rimossa prop `builderColor` da interface e dal passaggio a `IdentityTab`
- `src/app/(dashboard)/admin/settings/page.tsx` — rimosso `primary_color` dalla select builders e la prop `builderColor` passata a `SettingsShell`
- `src/app/welcome/[token]/page.tsx` — `brandDark = '#04342C'` fisso (era `builder?.primary_color?.trim() || '#04342C'`)
- `src/app/api/report/route.ts` — `builderColor = '#04342C'` fisso in entrambe le righe (scope unità `:86` e scope residenza `:130`)
- `.claude/settings.local.json` — modifiche di configurazione locale (non legate alla feature)

### Letti (solo quelli rilevanti per capire il contesto)
- `src/app/(dashboard)/admin/manutenzioni/page.tsx` — pattern card/stat/section per allineare stile pagina Attività
- `src/app/(dashboard)/admin/residences/page.tsx` — pattern header/card super_admin
- `src/components/AdminSidebar.tsx` (via grep) — conferma che la voce Attività punta già a `/admin/attivita` con badge "test"
- `src/app/globals.css` — verifica classi semantic (red/amber/blue + bg) disponibili nel design system

## Decisioni chiave
- **Colonna `primary_color` NON droppata dal DB**: lasciata nello schema, smette solo di essere letta/scritta dall'app. Nessuna migrazione in questa sessione. Alternativa scartata: rimuovere la colonna (avrebbe richiesto migrazione + rischio su dati esistenti, non necessario).
- **`primary_color` lasciato nelle select di `welcome` e `report`**: recuperato insieme a `name`/`logo_url`, si è preferito diff minimo a basso rischio invece di ripulire select e type. Il valore semplicemente non viene più usato per renderizzare.
- **Fix colore in 2 step separati**: prima whitelabel+settings (commit cb4fa1f), poi QR+report (commit 4c29ae6). Nel primo commit i punti residui erano stati esplicitamente segnalati invece di modificarli silenziosamente, come da regola.
- **Pagina Attività con dati hardcoded**: nessuna tabella eventi / trigger / cron. Scelta esplicita per la demo a Furlan; costruire un motore eventi reale è fuori scope.

## Stato attuale
### Funziona
- Build production verde (`npm run build`) — 20 pagine generate, route `/admin/attivita` registrata
- Colore brand `#04342C` coerente in: app shell (whitelabel), tab Identità (anteprima), pagina QR benvenuto, report PDF
- Tab Identità continua a gestire nome, email, telefono, logo (non toccati)

### Non funziona / da verificare
- Verifica visiva runtime NON eseguita (nessun dev server avviato in sessione): pagina Attività e anteprima header andrebbero controllate a schermo
- `builders.primary_color` in DB può contenere ancora valori vecchi (es. nero `#0d0d0d`): innocui ora, ma restano come dato morto
- Report PDF: rigenerare un report per confermare che l'header usi il verde fisso a runtime

## Prossimi passi
1. Avviare il dev server (finestra PowerShell separata) e verificare a schermo `/admin/attivita` e l'anteprima header nel tab Identità
2. Rigenerare un report PDF (unità + residenza) per confermare header `#04342C` a runtime
3. Eventuale cleanup opzionale: rimuovere `primary_color` da select/type in `welcome/[token]/page.tsx` e `api/report/route.ts` (dato morto)
4. Proseguire con le milestone M5 rimanenti (report PDF rifinitura, notifiche push, seed demo Residenza Cavaccio)

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (in finestra PowerShell separata e persistente)
npm run dev

# Build production (verde obbligatoria prima dei commit)
npm run build && npm start
```

## Domande aperte
- Vale la pena una migrazione futura per azzerare/deprecare `builders.primary_color` in DB, o si lascia come colonna dormiente?
- La pagina Attività resterà demo per la presentazione a Furlan o si valuta un feed reale (tabella eventi + RLS) in una fase successiva?
