-- ============================================================
-- CasaZero — 052: proposta di unità per i documenti (E1b)
-- Approvata da Filippo il 2026-11-06 (FASE 0 E1b). Esiti in docs/migrations.log.
--
-- SOLO ADDITIVA: tre colonne nuove e nullable, un indice parziale. Nessuna
-- riga esistente cambia, nessuna policy RLS cambia (la scrittura resta quella di
-- "documents: admin e super_admin gestiscono"), completions non è toccata.
-- Rieseguibile (IF NOT EXISTS). Nessun BEGIN/COMMIT.
-- ------------------------------------------------------------
-- PERCHE': oggi l'unità letta dall'AI ("Interno A2") è solo un testo in
-- document_extractions.unita_riferimento e non diventa mai un'unità. La pagina
-- Documenti deve poter mostrare una PROPOSTA di unità distinta
-- dall'assegnazione (documents.unit_id), che resta l'unico dato che conta.
--
--   proposed_unit_id               unità proposta dal sistema; NULL = nessuna
--                                  proposta. ON DELETE SET NULL: se l'unità sparisce
--                                  la proposta cade, il documento non si cancella.
--   unit_proposal_confidence       fascia della proposta ('alta' | 'media' |
--                                  'bassa'), calcolata dal match testo → unità,
--                                  non dalla classificazione. Nessun vincolo di
--                                  coppia con proposed_unit_id: il SET NULL della FK
--                                  lo violerebbe.
--   unit_proposal_dismissed_at     "Ignora": quando una persona ha scelto di
--                                  lasciare il documento senza unità. Non si
--                                  ripropone dopo.
--
-- Proposta PENDENTE = unit_id IS NULL AND proposed_unit_id IS NOT NULL
--                     AND unit_proposal_dismissed_at IS NULL.
-- Una proposta non assegna mai nulla: unit_id lo scrive solo una persona.
-- ============================================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS proposed_unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_proposal_confidence text,
  ADD COLUMN IF NOT EXISTS unit_proposal_dismissed_at timestamptz;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_unit_proposal_confidence_check,
  ADD CONSTRAINT documents_unit_proposal_confidence_check
    CHECK (unit_proposal_confidence IS NULL OR unit_proposal_confidence IN ('alta', 'media', 'bassa'));

CREATE INDEX IF NOT EXISTS documents_pending_unit_proposal_idx
  ON public.documents (residence_id)
  WHERE unit_id IS NULL AND proposed_unit_id IS NOT NULL AND unit_proposal_dismissed_at IS NULL;
