# Handoff — Micro-fix UI (logo, cursor-pointer, Sollecita) · 13/07/2026 21:00

## Sommario
Sessione di micro-fix indipendenti sul profilo super_admin, un commit per concern
come da metodo. Toccati: logo sidebar reso cliccabile, cursor-pointer mancante su
due bottoni della pagina Unità e su tutto il componente Button del design system,
e aggiunto un bottone "Sollecita" (solo UI, nessun backend) sulle voci scadute
della zona attenzione in Manutenzioni.

## Lavoro completato
- [x] Logo "CasaZero" in cima alla sidebar reso cliccabile → link a `/admin/residences`
- [x] Cursor-pointer mancante su bottoni "Aggiungi" / "Genera inviti per tutte le unità" (fix puntuale, non passano dal componente Button)
- [x] Cursor-pointer mancante globalmente sul componente `Button` del design system (fix in un solo punto, `BASE`)
- [x] Bottone "Sollecita" (solo UI, toast via `useToast()`, nessuna scrittura DB) sulle voci con status `scaduta` live nella zona attenzione di Manutenzioni

## File toccati
### Creati
Nessuno.

### Modificati
- `src/components/AdminSidebar.tsx` — il blocco logo (`<div>` con `BrandMark`) è diventato un `<Link href="/admin/residences">`; nessun annidamento perché `BrandMark` non contiene elementi interattivi.
- `src/app/(dashboard)/admin/residences/[id]/units/UnitsManager.tsx` — aggiunta classe `cursor-pointer` (e `disabled:cursor-not-allowed` dove pertinente) ai due `<button>` grezzi "Aggiungi" e "Genera inviti per tutte le unità", che non passano dal componente Button condiviso.
- `src/components/ui/Button.tsx` — aggiunta `cursor-pointer` a `BASE` e `disabled:cursor-not-allowed` accanto a `disabled:pointer-events-none`, per coprire tutti gli usi futuri e presenti del componente.
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — import di `Button` e `useToast`; chiamata a `useToast()` in testa a `ManutenzioniClient`; nel blocco "zona attenzione" (dentro il `.map` di `allAttentionItems`), aggiunto un `Button variant="secondary" size="table"` con icona `Bell` e testo "Sollecita", visibile solo quando `overdueNow` è vero (status `scaduta` live); `onClick` chiama `showToast('success', 'Sollecito inviato all'amministratore')`, nessuna azione server.

### Letti (solo quelli rilevanti per capire il contesto)
- `src/components/BrandMark.tsx` — verificato che non contiene elementi interattivi, per escludere il rischio di annidamento button/link.
- `src/components/ui/Toast.tsx` — verificata la firma di `useToast()`/`showToast(kind, message)` e che `ToastProvider` è montato in `src/app/layout.tsx` (root), quindi disponibile ovunque nel dashboard.
- `src/app/(dashboard)/admin/administrators/SollecitaButton.tsx` — componente "Sollecita" preesistente (stub visuale, mostra "Funzione in arrivo" al click, nessuna logica reale) usato nella pagina Amministratori; non toccato in questa sessione, citato solo come precedente di naming/pattern.
- Righe 150–202 e 700–750 di `ManutenzioniClient.tsx` — per capire la struttura di `allAttentionItems` (guardia strutturale `mode !== 'promemoria'`) e il pattern "Sollecita" già esistente in `UnitRow` (drill-down per-unità, diverso dalla zona attenzione).

## Decisioni chiave
- **Fix puntuale vs fix globale sul cursor-pointer**: i due bottoni segnalati in Unità e inviti sono `<button>` grezzi con classi Tailwind hand-rolled, non passano dal componente `Button` del design system. Il fix è stato quindi fatto in due passaggi separati e in due commit distinti: prima il fix puntuale sui due bottoni (causa reale del bug segnalato), poi — su richiesta esplicita di Filippo — il fix del gap latente nel componente `Button.tsx` (che affliggeva tutti gli altri usi del componente nell'app, mai testato ma logicamente presente).
- **Bottone Sollecita solo su `scaduta` live, non su `in_corso`**: la zona attenzione mostra sia voci scadute (rosso, `overdueNow`) sia voci "in corso" (ambra, non ancora scadute ma vicine). Il bottone appare solo quando `overdueNow === true`, coerente con l'invariante "Promemoria non è mai scaduta" e con la richiesta esplicita di non mostrarlo su voci pianificate/promemoria. Le voci promemoria sono già escluse strutturalmente da `allAttentionItems` (`mode !== 'promemoria'`), quindi nessun controllo aggiuntivo necessario.
- **Riuso del componente Button (secondary/table) invece di un bottone custom**: coerente con il vincolo "azione secondaria/outline, non primaria" e con il pattern già in uso in `ManutenzioniTable.tsx` (`variant="secondary" size="table"` per azioni dentro righe compatte).
- **Nessun fix al pattern "side-tab" (`border-l-4` accent) sulle card della zona attenzione**: il design hook lo ha segnalato due volte durante gli edit, ma è codice preesistente non toccato da questa sessione — lasciato invariato, fuori scope.

## Stato attuale
### Funziona
- `tsc --noEmit` verde dopo ciascuno dei 4 commit.
- Logo sidebar naviga a `/admin/residences`.
- I due bottoni in Unità e inviti mostrano cursor-pointer al hover; il componente Button del design system lo mostra ovunque sia usato.
- Bottone "Sollecita" compare solo sulle voci scadute in zona attenzione; al click mostra toast di successo, nessuna chiamata backend.

### Non funziona / da verificare
- Nessuna verifica visiva in browser eseguita in questa sessione (solo `tsc --noEmit` + diff review). Da controllare a vista: aspetto del bottone Sollecita nella card (allineamento `ml-auto` con `flex-wrap`), e comportamento cursor-pointer sui bottoni disabilitati.
- Il componente `SollecitaButton.tsx` (pagina Amministratori) resta uno stub non funzionante — non toccato, citato solo come precedente. Se Filippo vuole coerenza, andrebbe allineato al pattern toast introdotto qui.
- Backend reale del "Sollecita" (invio notifica/email all'amministratore) è esplicitamente post-demo, non implementato.

## Prossimi passi
1. Verifica visiva in browser della card zona attenzione con più voci scadute contemporaneamente (wrap del bottone su schermi stretti).
2. Decidere se allineare `SollecitaButton.tsx` (pagina Amministratori) allo stesso pattern toast, o lasciarlo come stub separato.
3. Quando si affronterà il backend "Sollecita" post-demo, definire lo storage (tabella? colonna su item?) e chi riceve la notifica (admin assegnato via `admin_assignments`).

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure build di verifica
npm run build
```

## Domande aperte
- Il testo del toast "Sollecito inviato all'amministratore" è provvisorio (placeholder da Filippo nel prompt) — va bene come copy definitiva o serve rifinirla?
- Per la card zona attenzione, il bottone Sollecita usa `size="table"` (pensata per righe di tabella) fuori da un contesto tabellare: visivamente accettabile o serve una size dedicata per contesti "card compatta"?

## Leggi emerse (candidate per CLAUDE.md)
Nessuna. I fix di questa sessione sono correzioni puntuali di UI (cursor-pointer, link,
bottone solo-UI) che rientrano già nelle regole esistenti (helper condivisi, un concern
per commit, azioni per stato) senza richiedere nuove leggi.
