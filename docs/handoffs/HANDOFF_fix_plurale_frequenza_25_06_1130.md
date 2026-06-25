# Handoff — Fix plurale frequenza · 25/06/2026 11:30

## Sommario
La stringa "ogni X mesi" nelle card manutenzione usciva come "ogni 1 mesi" quando la frequenza era 1 mese. La diagnosi ha rivelato che la stringa era hardcoded in due componenti separati senza alcun helper centralizzato. Si è scelto di creare `formatFrequency(months)` in `src/lib/formatFrequency.ts` — parallelo a `formatUnitLabel` già esistente — e di usarlo in entrambi i punti, così future variazioni toccano un solo file.

## Lavoro completato
- [x] Diagnosi FASE 0: identificati i 2 soli punti con "ogni … mesi" (nessun helper preesistente, PDF e dettaglio esclusi)
- [x] Creato helper `formatFrequency(months)` in `src/lib/formatFrequency.ts`
- [x] Applicato in `src/components/MaintenanceCard.tsx` (vista cliente N1)
- [x] Applicato in `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` (vista super_admin N1)
- [x] Build verde e commit `3300ade`

## File toccati
### Creati
- `src/lib/formatFrequency.ts` — helper puro: `formatFrequency(months: number | null | undefined): string` → "ogni 1 mese" / "ogni N mesi" / "ogni ? mesi"

### Modificati
- `src/components/MaintenanceCard.tsx` — import + uso `formatFrequency(frequencyMonths)` al posto della stringa inline
- `src/app/(dashboard)/admin/residences/[id]/manutenzioni/ManutenzioniClient.tsx` — import + uso `formatFrequency(item.frequency_months ?? tpl?.frequency_months)`

### Letti (solo quelli rilevanti per capire il contesto)
- `src/components/MaintenanceCard.tsx` — per vedere il contesto esatto della riga da modificare
- `src/lib/formatUnitLabel.ts` — per coerenza di stile con l'helper analogo già esistente

## Decisioni chiave
- **Helper centralizzato vs fix puntuale**: con 2 soli punti il fix inline sarebbe stato più veloce, ma l'helper è coerente col pattern `formatUnitLabel` già adottato nel progetto e previene derive future. L'utente ha scelto esplicitamente questa opzione.
- **`null | undefined` entrambi gestiti**: la firma accetta `number | null | undefined` perché `tpl?.frequency_months` può essere `undefined` se `tpl` è null, mentre il DB può restituire `null`. Il fallback è `"ogni ? mesi"`.

## Stato attuale
### Funziona
- Vista cliente (Home / Lista manutenzioni): card N1 mostra "ogni 1 mese", "ogni 12 mesi", ecc.
- Vista super_admin (Panoramica manutenzioni residenza): stessa correzione
- Build pulita, nessun errore TypeScript

### Non funziona / da verificare
- Nessun problema noto. Il PDF (`src/lib/pdf/`) non conteneva questa stringa — non toccato e non impattato.

## Prossimi passi
1. Verificare visivamente su dev server che "Controllo visivo prese e comandi" (N1, 1 mese) mostri "ogni 1 mese" e non "ogni 1 mesi".
2. Continuare con milestone M5: notifiche push, report PDF, seed demo Residenza Cavaccio.
3. Pulizia dati pendente: record `unit_members` stantio (filippolorotest102, Unità 1, Residenza Cavaccio) — il DELETE nel SQL Editor fallisce per RLS; usare MCP `execute_sql` (service role) o Table Editor UI.

## Comandi da rilanciare
```bash
# Avvia il server di sviluppo
npm run dev

# oppure production
npm run build && npm start
```

## Domande aperte
- Se in futuro si vuole rendere la frequenza più leggibile (es. "ogni mese" senza il numero quando è 1, o "ogni 2 settimane" per frequenze sub-mensili), il punto unico da toccare è `src/lib/formatFrequency.ts`.
