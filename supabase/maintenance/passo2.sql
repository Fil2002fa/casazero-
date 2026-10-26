-- già applicati: seed demo Padova e archivio pre-demo
-- ============================================================================
-- Seed demo Padova + parcheggio dati pre-demo — PASSO 2 di 3 (sola lettura)
-- Da eseguire a mano nel SQL Editor di Supabase dopo passo1.sql.
--
--   passo0.sql  query di sola lettura (baseline e guardie)
--   passo1.sql  un unico DO $$ … $$
--   passo2.sql  query di sola lettura (verifica)             ← QUESTO FILE
--
-- Confrontare ogni risultato con l'atteso nel commento. Il SQL Editor gira
-- come postgres e scavalca la RLS: la visibilità per ruolo si verifica a
-- schermo, non qui.
-- ============================================================================

-- 2.1 Residenze per builder. Atteso: Furlan srl 3, Archivio pre-demo 16
SELECT b.name AS builder, count(r.id) AS residenze
  FROM builders b LEFT JOIN residences r ON r.builder_id = b.id
 GROUP BY b.name ORDER BY b.name;

-- 2.2 Residenze sul builder demo. Atteso: le 3 di Padova
--     Bassanello 3 unità 32 voci · Portello 4 unità 38 voci · Santa Giustina 5 unità 47 voci
SELECT r.name, r.address, r.delivery_date, r.energy_class,
       (SELECT count(*) FROM units u WHERE u.residence_id = r.id)             AS unita,
       (SELECT count(*) FROM maintenance_items mi WHERE mi.residence_id = r.id) AS voci
  FROM residences r
 WHERE r.builder_id = '9923adbe-cfb4-47d3-b939-747bb30bcfe2'
 ORDER BY r.name;

-- 2.3 Voci scadute "live", stessa regola di isOverdueLive (maintenance-status.ts:85-94).
--     Atteso 6 righe:
--       Bassanello      amministratore  Controllo periodico estintori               (2026-02-01)
--       Bassanello      amministratore  Manutenzione impianto fotovoltaico          (2026-08-01)
--       Portello        amministratore  Verifica linee vita                         (2026-08-01)
--       Portello        residente       Controllo e lubrificazione serramenti  A1   (2026-08-01)
--       Santa Giustina  amministratore  Manutenzione cancelli e portoni motorizzati (2026-08-01)
--       Santa Giustina  amministratore  Pozzetti di ispezione e condotte: pulizia   (2026-08-01)
SELECT r.name AS residenza,
       coalesce(mi.completion_mode, mt.completion_mode) AS modalita,
       mt.title, u.label AS unita, mi.next_due_date, mi.status
  FROM maintenance_items mi
  JOIN maintenance_templates mt ON mt.id = mi.template_id
  JOIN residences r ON r.id = mi.residence_id
  LEFT JOIN units u ON u.id = mi.unit_id
 WHERE r.builder_id = '9923adbe-cfb4-47d3-b939-747bb30bcfe2'
   AND mi.activation_status = 'inclusa'
   AND mt.is_active
   AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
   AND mi.status NOT IN ('completata', 'in_corso')
   AND mi.next_due_date < CURRENT_DATE
 ORDER BY r.name, modalita, mt.title, u.label;

-- 2.4 Assegnazioni admin. Atteso: 3 righe, filippoloro02 sulle 3 di Padova
SELECT p.full_name, r.name AS residenza, b.name AS builder
  FROM admin_assignments a
  JOIN profiles p   ON p.id = a.profile_id
  JOIN residences r ON r.id = a.residence_id
  JOIN builders b   ON b.id = r.builder_id
 ORDER BY r.name;

-- 2.5 Membership attive. Atteso: filippolorotest102 → Residenza Portello / A1,
--     più le 3 di Cavaccio invariate (ora sul builder archivio)
SELECT p.full_name, r.name AS residenza, u.label, um.started_at, um.is_primary, b.name AS builder
  FROM unit_members um
  JOIN profiles p   ON p.id = um.profile_id
  JOIN units u      ON u.id = um.unit_id
  JOIN residences r ON r.id = u.residence_id
  JOIN builders b   ON b.id = r.builder_id
 WHERE um.ended_at IS NULL
 ORDER BY r.name, u.label;

-- 2.6 Builder dei profili. Atteso: Mario Bianchi e Luca Verdi → Archivio pre-demo;
--     Filippo test (super_admin), filippoloro02, filippolorotest102 → Furlan srl;
--     Filippo Loro e filippogiochi2002 (client di Cavaccio) → Furlan srl, invariati
SELECT p.full_name, p.role, b.name AS builder
  FROM profiles p LEFT JOIN builders b ON b.id = p.builder_id
 ORDER BY p.role, p.full_name;

-- 2.7 Fascicolo e registro intatti. Atteso: IDENTICO al passo 0.6 (18 / 4 / 6)
SELECT (SELECT count(*) FROM completions)     AS completions,
       (SELECT count(*) FROM attachments)     AS attachments,
       (SELECT count(*) FROM activity_events) AS activity_events;

-- 2.8 Dotazioni dichiarate. Atteso: 19 righe per residenza; presenti:
--     Portello nessuna · Santa Giustina cancello_motorizzato ·
--     Bassanello presidi_antincendio, impianto_fotovoltaico
SELECT r.name, count(*) AS dichiarate,
       string_agg(rf.feature_key, ', ' ORDER BY rf.feature_key) FILTER (WHERE rf.present) AS presenti
  FROM residence_features rf JOIN residences r ON r.id = rf.residence_id
 WHERE r.builder_id = '9923adbe-cfb4-47d3-b939-747bb30bcfe2'
 GROUP BY r.name ORDER BY r.name;

-- 2.9 Fornitori per builder. Atteso: Archivio pre-demo 6, nessuno su Furlan srl
SELECT b.name AS builder, count(s.id) AS fornitori
  FROM suppliers s JOIN builders b ON b.id = s.builder_id
 GROUP BY b.name;
