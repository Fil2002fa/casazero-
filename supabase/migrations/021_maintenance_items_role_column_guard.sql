-- ============================================================
-- CasaZero — 021: trigger BEFORE UPDATE su maintenance_items
-- (colonne per ruolo, RLS authenticated)
-- Applicata a mano nel SQL Editor il 2026-07-13, verificata da Filippo
-- (test negativi: admin che sposta un item tra due proprie residenze e
-- admin che tocca activation_status entrambi respinti dal trigger; test
-- positivi: admin che aggiorna solo status, admin che aggiorna l'intera
-- allowlist di updateMaintenanceItemConfig, e scrittura service role
-- (cron/completeN2) tutti passati senza errore).
-- ------------------------------------------------------------
-- Motivo: la policy "items: admin aggiorna stato" (002_rls.sql) verifica
-- solo czero_can_access_residence(residence_id) via USING (riusato come
-- WITH CHECK), senza vincolare le colonne. Un admin di residenza poteva
-- riscrivere via RLS diretta qualunque colonna della riga, incluse
-- id/template_id/residence_id/unit_id (identità dell'item) e
-- activation_status (composizione del piano, riservata a super_admin —
-- vedi setTemplateActivationForResidence).
--
-- Verifica dei flussi legittimi (grep .update su maintenance_items),
-- prima dell'apply: role='admin' scrive davvero, oltre a status
-- (takeChargeN3), anche frequency_months/priority/completion_mode/
-- obligation_type/warranty_info/supplier_id/next_due_date tramite
-- updateMaintenanceItemConfig (fornitori/actions.ts) — allowlist ampia
-- per non rompere quel flusso. Questione di prodotto (se admin debba
-- poter riclassificare i due assi) resta in backlog, non toccata qui.
-- Le scritture service role (cron giornaliero, ricalcolo di completeN2)
-- non passano da nessun ruolo RLS (czero_user_role() = NULL, nessuna
-- sessione utente) e restano non filtrate dal trigger.
-- ============================================================

CREATE OR REPLACE FUNCTION czero_maintenance_items_role_column_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role user_role;
BEGIN
  v_role := czero_user_role();

  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.residence_id IS DISTINCT FROM OLD.residence_id
     OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'colonna non modificabile via RLS authenticated';
  END IF;

  IF v_role = 'admin' AND NEW.activation_status IS DISTINCT FROM OLD.activation_status THEN
    RAISE EXCEPTION 'colonna non modificabile dal ruolo admin: activation_status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_items_role_column_guard ON public.maintenance_items;
CREATE TRIGGER maintenance_items_role_column_guard
  BEFORE UPDATE ON public.maintenance_items
  FOR EACH ROW EXECUTE FUNCTION czero_maintenance_items_role_column_guard();

-- ============================================================
-- VERIFICA POST-APPLY (footer standard, eseguita il 2026-07-13):
-- trigger presente e abilitato su maintenance_items.
-- ============================================================
-- SELECT tgname, tgenabled
-- FROM pg_trigger
-- WHERE tgrelid = 'public.maintenance_items'::regclass
--   AND tgname = 'maintenance_items_role_column_guard';

-- ============================================================
-- TEST NEGATIVO 1 (admin sposta l'item tra due proprie residenze — RLS
-- da sola lo permetterebbe, il trigger deve bloccarlo) — respinto.
-- ============================================================
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"7a210c85-7816-4d5f-b802-176505947469"}';
-- UPDATE public.maintenance_items SET residence_id = '3bdf4d00-85ae-4707-9def-80cd1cd4b0e4' WHERE id = 'e001527e-db55-4113-9cee-56e8915cf9e5';
-- RESET ROLE;

-- ============================================================
-- TEST NEGATIVO 2 (admin prova ad archiviare, colonna riservata a
-- super_admin) — respinto.
-- ============================================================
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"7a210c85-7816-4d5f-b802-176505947469"}';
-- UPDATE public.maintenance_items SET activation_status = 'archiviata' WHERE id = 'e001527e-db55-4113-9cee-56e8915cf9e5';
-- RESET ROLE;

-- ============================================================
-- TEST POSITIVO 1 (admin aggiorna solo status — takeChargeN3) —
-- passato, eseguito in transazione con ROLLBACK.
-- ============================================================
-- BEGIN;
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"7a210c85-7816-4d5f-b802-176505947469"}';
-- UPDATE public.maintenance_items SET status = 'in_corso' WHERE id = 'e001527e-db55-4113-9cee-56e8915cf9e5' RETURNING id, status;
-- RESET ROLE;
-- ROLLBACK;

-- ============================================================
-- TEST POSITIVO 2 (admin aggiorna l'intera allowlist —
-- updateMaintenanceItemConfig) — passato, eseguito in transazione con
-- ROLLBACK.
-- ============================================================
-- BEGIN;
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"7a210c85-7816-4d5f-b802-176505947469"}';
-- UPDATE public.maintenance_items
-- SET completion_mode = completion_mode, obligation_type = obligation_type, priority = priority,
--     frequency_months = frequency_months, warranty_info = warranty_info, supplier_id = supplier_id,
--     status = status, next_due_date = next_due_date
-- WHERE id = 'e001527e-db55-4113-9cee-56e8915cf9e5'
-- RETURNING id;
-- RESET ROLE;
-- ROLLBACK;

-- ============================================================
-- TEST POSITIVO 3 (service role — cron/completeN2, nessuna sessione
-- utente) — passato, nessun errore.
-- ============================================================
-- UPDATE public.maintenance_items SET next_due_date = next_due_date WHERE id = 'e001527e-db55-4113-9cee-56e8915cf9e5';
