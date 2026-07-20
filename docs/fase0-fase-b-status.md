# FASE 0 Fase B (Pilastro Consegna) — stato rischi

Documento vivo: si aggiorna in loco ad ogni sessione che tocca un rischio,
non si riscrive da zero. Base di partenza per la FASE 0 di ogni B1-B6.

## Chiuso

- **Rischio 1 — RLS storage non scopate per tenant** (bucket `documents`,
  `attachments`). Chiuso da `022_storage_documents_scoped_rls.sql` e
  `023_storage_attachments_scoped_rls.sql`, sessione B0 del 20/07/2026.
  Dettaglio: `docs/handoffs/HANDOFF_storage_rls_b0_07_20_17_49.md`.

## Declassato a backlog

- **Verifica autorizzazione sul documento specifico in `/api/download`**
  (commit 2 originale del piano B0). La policy SELECT della 022 è già il
  gate che autorizza le signed URL: una verifica applicativa aggiuntiva
  sarebbe difesa in profondità, non un rischio aperto. Deciso in sessione
  B0, non riaperto.

## Aperti — da affrontare in B1-B6

- **Limite body 5mb** (`next.config.ts:14`, `serverActions.bodySizeLimit:
  '5mb'`) — in tensione col limite applicativo dichiarato di 50MB per gli
  upload documenti. Rilevante per B3 (upload multipli di PDF di consegna
  reali): probabile necessità di upload client-diretto con signed URL,
  pattern non ancora usato nel progetto.
- **`maintenance_items.template_id NOT NULL`** (`001_schema.sql:136`) —
  blocca B5 (proposte oltre catalogo) finché non si decide nullable vs.
  template ad-hoc con colonna di scoping. Tocca l'helper
  `isCountable`/`resolveCompletionMode` in `src/lib/maintenance-status.ts`,
  usato ovunque: decisione da prendere esplicitamente prima del codice.
- **Enum `document_category`** (`001_schema.sql:11`, 5 valori fissi:
  proprieta, tecnici, energetici, conformita, amministrativi) — B3
  (categorizzazione AI multi-PDF) dovrà mappare l'output del modello su
  questi 5 valori o estendere l'enum.
- **Dual-write su INSERT** (colonna legacy `priority` + i due assi
  `completion_mode`/`obligation_type`) — verificato: nessuna scrittura
  applicativa lo fa oggi. Le RPC di creazione item/unità
  (`012_create_residence_atomic.sql`, `013_add_unit_atomic.sql`) lasciano
  `completion_mode`/`obligation_type` NULL (ereditano dal template) e non
  toccano `priority`; l'unica scrittura su `maintenance_templates` è
  `supabase/seed.sql`. Il debito descritto in CLAUDE.md si attiva alla
  prima scrittura applicativa reale che imposta i due assi — probabile in
  B1-B6.
- **`activation_status`** — trigger `021_maintenance_items_role_column_guard.sql`
  blocca già la scrittura da ruolo admin. Da verificare se B6 (vista per
  condominio all'admin) richiede un varco.
- **`requireRole(['super_admin'])` su upload documenti da dashboard**
  (`src/app/(dashboard)/admin/residences/[id]/documenti/page.tsx:16`) —
  gap noto: nella PWA `(app)/documenti` l'admin può già caricare, nella
  dashboard no. **Decisione presa in sessione B0**: gap da colmare in B6
  (vista per condominio all'admin), non prima. Non è un vincolo di
  prodotto voluto, è un ordine di sviluppo.
