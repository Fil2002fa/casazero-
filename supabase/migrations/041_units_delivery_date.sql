-- ============================================================
-- CasaZero — 041: data di consegna per unità (units.delivery_date)
-- APPLICATA a mano nel SQL Editor il 2026-10-24, verificata da Filippo:
-- esiti reali nel footer in fondo (V0-V6, tutti con l'atteso).
-- Statement singoli idempotenti, nessun BEGIN/COMMIT (il SQL Editor non
-- gira in transazione): rieseguibile senza effetti collaterali.
-- ------------------------------------------------------------
-- PERCHÉ (FASE 0 del 24/10): la data da cui partono TUTTE le scadenze esiste
-- solo a livello residenza (residences.delivery_date, 001_schema.sql:36), e la
-- RPC di creazione la usa identica per le voci condominiali e per quelle di
-- ogni unità (034_rpc_creazione_condizionale.sql:150-153 e :186-189, stessa
-- espressione carattere per carattere). Ma le unità si vendono e si consegnano
-- in momenti diversi, e alcune restano invendute a lungo: oggi un'unità non
-- consegnata ha le stesse scadenze di una consegnata il giorno della fine
-- lavori, il cron la marca 'scaduta' (api/cron/daily/route.ts:89-94) e manda
-- notifiche a zero destinatari. Su units non esiste nessuna colonna di questo
-- tipo: in 40 migrazioni l'unico ALTER TABLE units è l'ENABLE ROW LEVEL
-- SECURITY (002_rls.sql:94).
--
-- SEMANTICA DEL NULL (decisione Filippo del 24/10): NULL = unità non ancora
-- consegnata. Le voci di quell'unità avranno next_due_date NULL e le viste le
-- mostreranno "In attesa di consegna" — nessun uso di activation_status, che
-- resta la composizione del piano. Le voci di parti comuni continuano a
-- partire da residences.delivery_date.
--
-- QUESTA MIGRAZIONE NON CAMBIA NIENTE DI OSSERVABILE. Il backfill copia su
-- ogni unità la data della sua residenza, cioè esattamente la base che la RPC
-- ha già usato per calcolare le scadenze esistenti. Nessun next_due_date viene
-- toccato qui: il ricalcolo arriva con la UI di registrazione della consegna,
-- in un commit successivo, e solo sulle voci senza completamenti (completions
-- è il fascicolo legale, intoccabile).
--
-- SCRITTURA GIÀ RISERVATA AL SUPER_ADMIN: "units: super_admin aggiorna"
-- (002_rls.sql:169-175) è l'unica policy FOR UPDATE su units, quindi l'admin
-- non può scrivere questa colonna via RLS authenticated. Non serve un guard
-- per colonne come quello della 021.
-- ============================================================

-- 1. La colonna. Nullable per costruzione: NULL = non consegnata.
ALTER TABLE units ADD COLUMN IF NOT EXISTS delivery_date DATE;

-- 2. Il significato, accanto al dato.
COMMENT ON COLUMN units.delivery_date IS
  'Data di consegna chiavi di questa unità. NULL = non ancora consegnata: le voci di manutenzione dell''unità restano senza scadenza (next_due_date NULL). È la base di calcolo delle scadenze dell''unità; per le parti comuni la base resta residences.delivery_date.';

-- 3. Backfill dello stato attuale: ogni unità esistente eredita la data della
--    sua residenza, che è già la base con cui le sue scadenze sono state
--    calcolate. Tocca solo le righe a NULL, quindi rieseguirlo dopo un
--    successo non sovrascrive mai una data registrata a mano nel frattempo.
UPDATE units u
   SET delivery_date = r.delivery_date
  FROM residences r
 WHERE r.id = u.residence_id
   AND u.delivery_date IS NULL
   AND r.delivery_date IS NOT NULL;

-- ============================================================
-- VERIFICA PRE-APPLY (eseguire PRIMA degli statement sopra)
-- ============================================================
-- V0. La colonna non esiste ancora. Atteso: 0 righe.  ESITO: 0 righe.
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'units'
--    AND column_name = 'delivery_date';

-- V1. Baseline delle scadenze, da riconfrontare identica dopo l'apply.
--     ESITO: 1176 voci | 0 senza data | 2023-03-31 | 2031-12-13
-- SELECT count(*) AS voci,
--        count(*) FILTER (WHERE next_due_date IS NULL) AS senza_data,
--        min(next_due_date) AS prima, max(next_due_date) AS ultima
--   FROM maintenance_items;

-- ============================================================
-- VERIFICA POST-APPLY (footer da compilare con l'output reale)
-- ============================================================
-- V2. Colonna presente, tipo date, nullable. Atteso: 1 riga | date | YES
-- SELECT data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'units'
--    AND column_name = 'delivery_date';
-- ESITO: date | YES

-- V3. Nessuna unità resta senza data se la sua residenza ne ha una. Atteso: 0
-- SELECT count(*) AS unita_non_backfillate
--   FROM units u JOIN residences r ON r.id = u.residence_id
--  WHERE u.delivery_date IS NULL AND r.delivery_date IS NOT NULL;
-- ESITO: 0

-- V4. Subito dopo l'apply nessuna unità diverge dalla residenza. Atteso: 0
-- SELECT count(*) AS unita_divergenti
--   FROM units u JOIN residences r ON r.id = u.residence_id
--  WHERE u.delivery_date IS DISTINCT FROM r.delivery_date;
-- ESITO: 0

-- V5. Residenze senza data: le loro unità restano a NULL per costruzione.
-- SELECT r.name, count(u.id) AS unita_senza_data
--   FROM residences r LEFT JOIN units u ON u.residence_id = r.id
--  WHERE r.delivery_date IS NULL
--  GROUP BY r.name ORDER BY r.name;
-- ESITO: nessuna riga — nessuna residenza senza delivery_date, quindi il
--        backfill ha coperto tutte le unita.

-- V6. Scadenze invariate: stesso risultato di V1, riga per riga.
-- SELECT count(*) AS voci,
--        count(*) FILTER (WHERE next_due_date IS NULL) AS senza_data,
--        min(next_due_date) AS prima, max(next_due_date) AS ultima
--   FROM maintenance_items;
-- ESITO: 1176 voci | 0 senza data | 2023-03-31 | 2031-12-13 — identica alla
--        V1: nessuna scadenza toccata dalla migrazione.
