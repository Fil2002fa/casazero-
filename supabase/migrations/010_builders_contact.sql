-- ============================================================
-- CasaZero — 010: contatti builder (email, telefono)
-- Applica in: Supabase Dashboard → SQL Editor → Run
-- ------------------------------------------------------------
-- Aggiunge i campi di contatto del costruttore usati nel Tab 1
-- "Identità costruttore" delle Impostazioni super_admin.
-- name, logo_url, primary_color esistono già (001_schema.sql).
-- ============================================================

ALTER TABLE builders ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE builders ADD COLUMN IF NOT EXISTS contact_phone TEXT;
