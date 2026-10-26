-- già applicati: seed demo Padova e archivio pre-demo
-- ============================================================================
-- Seed demo Padova + parcheggio dati pre-demo — PASSO 0 di 3 (sola lettura)
-- Da eseguire a mano nel SQL Editor di Supabase (ruolo postgres).
--
--   passo0.sql  query di sola lettura (baseline e guardie)  ← QUESTO FILE
--   passo1.sql  un unico DO $$ … $$ (UNO statement = UNA transazione)
--   passo2.sql  query di sola lettura (verifica)
--
-- Confrontare ogni risultato con l'atteso nel commento. Se anche uno solo
-- diverge, NON lanciare passo1.sql.
-- ============================================================================

-- 0.1 Residenze sul builder demo. Atteso: 16
SELECT count(*) AS residenze_builder_demo
  FROM residences WHERE builder_id = '9923adbe-cfb4-47d3-b939-747bb30bcfe2';

-- 0.2 Nomi nuovi già presenti. Atteso: 0
SELECT count(*) AS nomi_gia_usati
  FROM residences
 WHERE name IN ('Residenza Portello', 'Residenza Santa Giustina', 'Residenza Bassanello');

-- 0.3 Builder archivio già presente. Atteso: 0
SELECT count(*) AS archivio_gia_presente FROM builders WHERE name = 'Archivio pre-demo';

-- 0.4 Profili coinvolti. Atteso: 4 righe con questi ruoli
--   7a210c85 admin (filippoloro02, admin demo)
--   88ba2c16 admin, ae7e0d00 admin (da parcheggiare)
--   9d3e163b client (filippolorotest102, residente demo)
SELECT id, role, full_name, builder_id
  FROM profiles
 WHERE id IN ('7a210c85-7816-4d5f-b802-176505947469',
              '88ba2c16-0caf-4502-b460-98e8545f211f',
              'ae7e0d00-8e28-4c9f-a624-8ed0169c06b7',
              '9d3e163b-6f21-42a7-a46a-53008cc5b011')
 ORDER BY role, full_name;

-- 0.5 Membership attive del residente demo. Atteso: 0
SELECT count(*) AS membership_attive_residente_demo
  FROM unit_members
 WHERE profile_id = '9d3e163b-6f21-42a7-a46a-53008cc5b011' AND ended_at IS NULL;

-- 0.6 Baseline del fascicolo e del registro (devono restare IDENTICI dopo il passo 1).
--     Atteso oggi: completions 18, attachments 4, activity_events 6
SELECT (SELECT count(*) FROM completions)     AS completions,
       (SELECT count(*) FROM attachments)     AS attachments,
       (SELECT count(*) FROM activity_events) AS activity_events;

-- 0.7 Assegnazioni admin attuali. Atteso: 6 righe, tutte su residenze da parcheggiare
SELECT a.profile_id, r.name
  FROM admin_assignments a JOIN residences r ON r.id = a.residence_id
 ORDER BY a.profile_id, r.name;

-- 0.8 Fornitori per builder. Atteso: Furlan srl 6 (tutti nati su residenze da parcheggiare)
SELECT b.name AS builder, count(s.id) AS fornitori
  FROM suppliers s JOIN builders b ON b.id = s.builder_id
 GROUP BY b.name;
