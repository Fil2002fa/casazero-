-- ============================================================
-- CasaZero — M2: trigger ricalcolo scadenze
-- Applica DOPO 002_rls.sql
-- ============================================================

-- Ricalcola next_due_date e resetta lo stato dopo ogni completion
CREATE OR REPLACE FUNCTION czero_recalc_due()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_freq INTEGER;
BEGIN
  SELECT COALESCE(mi.frequency_months, mt.frequency_months)
  INTO v_freq
  FROM maintenance_items mi
  JOIN maintenance_templates mt ON mt.id = mi.template_id
  WHERE mi.id = NEW.item_id;

  UPDATE maintenance_items
  SET
    next_due_date = (NEW.completed_at::DATE + (v_freq || ' months')::INTERVAL)::DATE,
    status        = 'in_attesa',
    updated_at    = NOW()
  WHERE id = NEW.item_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_completion_inserted ON completions;
CREATE TRIGGER on_completion_inserted
  AFTER INSERT ON completions
  FOR EACH ROW EXECUTE FUNCTION czero_recalc_due();

-- Indici per il cron job e le query frequenti
CREATE INDEX IF NOT EXISTS idx_items_next_due      ON maintenance_items(next_due_date);
CREATE INDEX IF NOT EXISTS idx_items_status_due    ON maintenance_items(status, next_due_date);
CREATE INDEX IF NOT EXISTS idx_notif_payload_item  ON notifications USING gin(payload jsonb_path_ops);
