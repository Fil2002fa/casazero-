-- ============================================================
-- CasaZero — 016: policy SELECT su builders per l'admin
-- GIA' APPLICATA da Filippo nel SQL Editor — questo file la versiona
-- nel repo, non va rieseguita come parte del normale flusso migrazioni.
-- ------------------------------------------------------------
-- Le policy esistenti su builders (super_admin, "members can read own")
-- dipendono tutte da czero_user_builder_id(), che per un profilo admin
-- è sempre NULL (l'admin è legato al builder solo indirettamente via
-- admin_assignments -> residences). Risultato: un admin non poteva mai
-- leggere il builder della propria residenza, a differenza di residences
-- e units che hanno già un ramo admin dedicato nelle rispettive funzioni
-- czero_can_access_residence/czero_can_access_unit.
--
-- Questa policy aggiunge lo stesso ramo per builders: un admin legge la
-- riga builders solo se esiste una sua assegnazione a una residenza di
-- quel builder. Nessuna policy esistente viene toccata.
--
-- Idempotente: DROP POLICY IF EXISTS prima del CREATE.
-- ============================================================

DROP POLICY IF EXISTS "builders: admin legge quello delle residenze assegnate" ON builders;
CREATE POLICY "builders: admin legge quello delle residenze assegnate"
  ON builders FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM admin_assignments aa
      JOIN residences r ON r.id = aa.residence_id
      WHERE aa.profile_id = auth.uid()
        AND r.builder_id = builders.id
    )
  );
