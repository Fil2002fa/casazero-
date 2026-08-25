# Handoff — Notifiche super_admin solo email · 01/07/2026 23:40

## Sommario
Rimossa la colonna Push dal tab Notifiche della dashboard super_admin: la dashboard è
uno strumento desktop senza PWA né service worker, quindi le notifiche push non hanno un
canale reale su cui arrivare. Resta il solo canale email. Modifica isolata al tab
super_admin — le preferenze push del residente (shell app, PWA reale) non sono state toccate.

## Lavoro completato
- [x] Rimossa colonna Push (header + toggle per riga) da `NotificationsTab.tsx`
- [x] Rimosso import `Smartphone` e la nota "Le notifiche push richiedono l'installazione…"
- [x] Semplificato il tipo `PrefRow`: `emailKey` non più nullable, eliminato il fallback `—`
- [x] Rimosse le chiavi `push_*` da `AdminNotificationPrefs` e dal default in `database.ts`
- [x] Build verde (`npm run build`, 20/20 pagine)
- [x] Commit `ea91916` con messaggio richiesto

## File toccati
### Modificati
- `src/app/(dashboard)/admin/settings/NotificationsTab.tsx` — rimossa colonna Push (header,
  icona `Smartphone`, toggle per riga) e la nota informativa sull'installazione app. `PrefRow`
  ora ha solo `label` + `emailKey` (non nullable); mantenuto l'header colonna "Email" per
  chiarezza visiva. La riga "Report annuale generato" resta col solo toggle email (off default).
- `src/types/database.ts` — rimosse `push_n3_completed`, `push_new_resident`,
  `push_report_generated` da `AdminNotificationPrefs` e da `DEFAULT_ADMIN_NOTIFICATION_PREFS`.
  L'interfaccia ora descrive solo i 4 eventi email.

### Letti (contesto)
- `src/app/(dashboard)/admin/settings/actions.ts` — verificato che `updateAdminNotificationPrefs`
  passa l'oggetto prefs così com'è: nessuna modifica necessaria, segue il tipo aggiornato.
- `src/app/(dashboard)/admin/settings/page.tsx` — verificato il merge `DEFAULT + account.notification_prefs`:
  regge automaticamente le chiavi ridotte.

## Decisioni chiave
- **Nessuna migrazione DB di pulizia**: le chiavi `push_*` già salvate nel JSONB
  `profiles.notification_prefs` dei super_admin esistenti restano come dati orfani. Non danno
  fastidio (il merge in page.tsx ignora le chiavi extra). Alternativa scartata: migrazione di
  cleanup — non necessaria e a rischio inutile.
- **Header colonna "Email" mantenuto**: con una sola colonna si poteva assorbire l'header nel
  design, ma lasciarlo esplicito è più chiaro e coerente con lo stile esistente del tab.
- **Ambito strettamente super_admin**: non toccato nulla in `src/app/(app)/`
  (`ProfiloClient.tsx`, actions residente) — lì la PWA esiste ed è il canale principale.

## Stato attuale
### Funziona
- Build production verde, type-check pulito.
- Tab Notifiche super_admin mostra 4 righe evento con il solo toggle email.

### Non funziona / da verificare
- Non verificato a runtime in browser (nessun dev server avviato in questa sessione).
  Da controllare visivamente il layout del tab con una sola colonna.
- Il recapito email effettivo delle notifiche super_admin non è oggetto di questa sessione
  (solo le preferenze UI): lo stato del pipeline email a monte resta invariato.

## Prossimi passi
1. Aprire `/admin/settings` → tab Notifiche in browser e verificare allineamento visivo
   della colonna Email unica e dei 4 toggle.
2. Valutare (già segnalato in HANDOFF_settings_cleanup_07_01_23_36.md) se rinominare le chiavi
   `email_n2_*`/`email_n3_*` per allinearle alla terminologia a due assi — è un concern separato.
3. Committare gli handoff non tracciati e `.claude/settings.local.json` se opportuno (fuori scope).

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (in finestra PowerShell separata e persistente)
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Le chiavi `push_*` orfane nel JSONB vanno bene lasciate a tempo indeterminato, o serve
  una migrazione di cleanup in una fase futura di consolidamento schema?
- Il tab Notifiche super_admin è puramente dichiarativo finché il pipeline email a monte
  non consuma queste preferenze: chi/quando implementa l'invio effettivo?
