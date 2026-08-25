# Handoff — Pulizia tab Impostazioni (contatti builder + terminologia notifiche) · 01/07/2026 23:36

## Sommario
Sessione di rifinitura sui tab Impostazioni super_admin. Rimossi dal form Identità i due
campi di contatto builder (email/telefono) perché non collegati ad alcun flusso reale, in
attesa che sia deciso il modello di assistenza. Riformulate inoltre due label del tab
Notifiche per allinearle al modello a due assi delle Manutenzioni v2 (via terminologia
N2/N3, ormai superata).

## Lavoro completato
- [x] Rimossi i campi input "Email di contatto" e "Telefono assistenza" dal tab Identità
- [x] Ripulita la catena props page → SettingsShell → IdentityTab (rimossi builderEmail/builderPhone)
- [x] Rimossa scrittura di contact_email/contact_phone dalla server action updateBuilderSettings
- [x] Ridotta la select su `builders` in page.tsx a solo `name`
- [x] Verificato via grep che nessun altro punto del codice legge contact_email/contact_phone
- [x] Riformulate 2 label del tab Notifiche da terminologia N2/N3 al modello "a carico residente/amministratore"
- [x] Build verde su entrambi gli interventi + 2 commit separati

## File toccati
### Modificati
- `src/app/(dashboard)/admin/settings/IdentityTab.tsx` — rimossi i due input contatto e i props `initialEmail`/`initialPhone`; `Props` ora ha solo `initialName`
- `src/app/(dashboard)/admin/settings/actions.ts` — rimossi parsing e update di `contact_email`/`contact_phone` in `updateBuilderSettings`; aggiunto commento sul perché le colonne restano nello schema
- `src/app/(dashboard)/admin/settings/page.tsx` — select su `builders` ridotta a `name`; rimossi i props email/telefono passati a `SettingsShell`
- `src/app/(dashboard)/admin/settings/SettingsShell.tsx` — rimossi `builderEmail`/`builderPhone` da `Props` e dalla chiamata a `IdentityTab`
- `src/app/(dashboard)/admin/settings/NotificationsTab.tsx` — cambiate 2 `label` in `PREF_ROWS` (N3→"a carico amministratore", N2→"a carico residente"); chiavi dati invariate

### Letti (contesto)
- `supabase/migrations/010_builders_contact.sql` — verificato che le colonne contact_email/phone NON vanno droppate (migrazione applicata, colonne conservate)

## Decisioni chiave
- **Colonne DB conservate, non droppate**: contact_email/contact_phone restano nello schema
  (migrazione 010) ma smettono di essere lette/scritte dal form. Stesso pattern usato per
  primary_color quando è stato fissato il colore brand. Si ricollegano quando sarà definito
  il flusso di assistenza (residente → CasaZero centralizzato vs residente → builder diretto).
- **Chiavi AdminNotificationPrefs NON rinominate**: cambiate solo le label visibili, non le
  chiavi `push_n3_completed`/`email_n3_completed`/`email_n2_overdue_30`. Rinominare le chiavi
  sarebbe un refactor più ampio non richiesto; label e chiave sono campi separati in `PrefRow`,
  quindi la separazione è stata possibile senza toccare la struttura dati.

## Stato attuale
### Funziona
- `npm run build` verde su entrambi i commit
- Tab Identità: mostra solo Nome costruttore + Logo, salvataggio funzionante
- Tab Notifiche: label allineate al modello a due assi, toggle Push/Email invariati

### Non funziona / da verificare
- Nessuna regressione nota. Non verificato a runtime nel browser (solo build): consigliata
  una passata visiva sui due tab dopo `npm run dev`.

## Prossimi passi
1. Definire il flusso di assistenza reale e, di conseguenza, decidere se e come reintrodurre
   i campi contatto builder (con relativo punto di consumo lato residente/report)
2. Valutare se allineare anche le CHIAVI di AdminNotificationPrefs alla nuova terminologia a
   due assi (refactor più ampio: DB default + tipi + eventuali producer delle notifiche)
3. Passata visiva a runtime sui tab Identità e Notifiche

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo (in finestra PowerShell separata e persistente)
npm run dev

# Build di verifica
npm run build
```

## Domande aperte
- Il flusso di assistenza sarà centralizzato su CasaZero o diretto verso il builder? La
  risposta determina se i campi contatto tornano nel form Identità o altrove.
- Le chiavi `*_n2_*`/`*_n3_*` in AdminNotificationPrefs vanno rinominate per coerenza col
  modello a due assi, o si lasciano come identificatori interni ormai slegati dalle label?
