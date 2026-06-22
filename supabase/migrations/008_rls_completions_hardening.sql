-- ============================================================
-- CasaZero — M8: RLS hardening completions
-- Applica DOPO 007_notification_prefs.sql
--
-- Decisione di prodotto: solo admin assegnato (N3) e client
-- della propria unità (N2) possono inserire in completions.
-- Il super_admin non scrive mai il fascicolo direttamente:
-- il record completions è il registro legale degli interventi
-- e "eseguito_da" deve essere l'amministratore reale.
--
-- UPDATE e DELETE su completions restano senza policy →
-- bloccati a livello RLS per qualsiasi ruolo (immutabilità).
-- ============================================================

-- Sostituisce la policy esistente rimuovendo il ramo super_admin
DROP POLICY IF EXISTS "completions: inserimento autorizzato" ON completions;

CREATE POLICY "completions: inserimento autorizzato"
  ON completions FOR INSERT
  WITH CHECK (
    -- N2: client della propria unità
    (public.czero_user_role() = 'client'
      AND unit_id IS NOT NULL
      AND public.czero_can_access_unit(unit_id))
    OR
    -- N3: admin assegnato alla residenza dell'item
    (public.czero_user_role() = 'admin'
      AND public.czero_can_access_residence(residence_id))
  );

-- Verifica esplicita: nessuna policy UPDATE/DELETE esiste su completions.
-- Le righe seguenti sono no-op sicuri: se per errore qualcuno le avesse
-- create, vengono rimosse; se non esistono, DROP IF EXISTS non fa nulla.
DROP POLICY IF EXISTS "completions: aggiornamento" ON completions;
DROP POLICY IF EXISTS "completions: eliminazione"  ON completions;
