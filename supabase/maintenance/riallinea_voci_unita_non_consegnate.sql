-- ============================================================
-- Riallineamento dati: voci di unita datate su unita non consegnate
--
-- Origine: prima della 044, czero_add_unit_with_items (013:46) e
-- czero_create_residence_with_units (034:187) datavano le voci di unita
-- dalla residenza, ma creavano l'unita con delivery_date NULL. Ogni unita
-- creata dopo la 041 e' quindi "Non consegnata" con le voci gia datate
-- (caso noto: TestR9ssss in teolo, creata il 26/10).
--
-- DA ESEGUIRE DOPO L'APPLY DELLA 044: prima, ogni unita nuova tornerebbe
-- incoerente.
--
-- Regola (stessa di czero_register_delivery con data NULL, 046:105-145):
-- su un'unita non consegnata le voci ricalcolabili non hanno scadenza.
-- D1 tocca SOLO le voci:
--   - di unita (unit_id valorizzato) con units.delivery_date IS NULL,
--   - datate (next_due_date IS NOT NULL),
--   - 'inclusa' (le archiviate restano come sono, come nella RPC),
--   - non promemoria (completion_mode effettivo, voce ?? template): le
--     promemoria restano datate, decisione del 29/10 (vedi testata 044),
--   - senza override della voce (due_basis_override precede il gate:
--     maintenance-due.ts:171),
--   - SENZA completamenti (il fascicolo vince sul modello),
-- e salta le unita con un residente attivo (unit_members.ended_at IS NULL):
-- decisione del 29/10, restano segnalate come incoerenti in UI ("Residente
-- gia attivo") finche' non se ne registra la consegna.
--
-- Non tocca: completions (mai), units, unit_members, voci condominiali.
-- Imposta status = 'in_attesa' insieme a next_due_date NULL, come la RPC.
-- Scope: TUTTE le unita di ogni costruttore (archivio compreso). Per
-- limitarlo, aggiungere il filtro su builder_id indicato in ogni statement.
--
-- SQL Editor senza transazioni: statement singoli, idempotenti, da lanciare
-- uno alla volta nell'ordine C1 -> C2 -> D1 -> C3 -> C1.
-- ============================================================

-- C1 (prima e dopo) — una riga per unita non consegnata con voci datate.
-- residente_attivo = true: unita esclusa da D1 (da_correggere conta lo
-- stesso, per mostrare cosa resta incoerente).
SELECT b.name AS costruttore, r.name AS residenza, u.label AS unita,
       u.created_at::date AS creata,
       EXISTS (SELECT 1 FROM unit_members um
                WHERE um.unit_id = u.id AND um.ended_at IS NULL) AS residente_attivo,
       count(*) FILTER (WHERE mi.next_due_date IS NOT NULL) AS voci_datate,
       count(*) FILTER (WHERE mi.next_due_date IS NOT NULL
                          AND mi.activation_status = 'inclusa'
                          AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
                          AND mi.due_basis_override IS NULL
                          AND NOT EXISTS (SELECT 1 FROM completions c WHERE c.item_id = mi.id)) AS da_correggere,
       count(*) FILTER (WHERE mi.next_due_date IS NOT NULL
                          AND coalesce(mi.completion_mode, mt.completion_mode) = 'promemoria') AS promemoria_datate,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM completions c WHERE c.item_id = mi.id)) AS con_completamenti
FROM units u
JOIN residences r             ON r.id = u.residence_id
JOIN builders b               ON b.id = r.builder_id
JOIN maintenance_items mi     ON mi.unit_id = u.id
JOIN maintenance_templates mt ON mt.id = mi.template_id
WHERE u.delivery_date IS NULL
  -- AND r.builder_id = '<uuid builder>'
GROUP BY b.name, r.name, u.id, u.label, u.created_at
HAVING count(*) FILTER (WHERE mi.next_due_date IS NOT NULL) > 0
ORDER BY b.name, r.name, u.label;

-- C2 (prima) — totale che D1 correggera': annotare il numero, D1 deve
-- restituire lo stesso numero di righe.
SELECT count(*) AS voci_da_correggere
FROM maintenance_items mi
JOIN units u                  ON u.id = mi.unit_id
JOIN maintenance_templates mt ON mt.id = mi.template_id
WHERE u.delivery_date IS NULL
  AND mi.next_due_date IS NOT NULL
  AND mi.activation_status = 'inclusa'
  AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
  AND mi.due_basis_override IS NULL
  AND NOT EXISTS (SELECT 1 FROM completions c WHERE c.item_id = mi.id)
  AND NOT EXISTS (SELECT 1 FROM unit_members um WHERE um.unit_id = u.id AND um.ended_at IS NULL);
  -- filtro builder: AND u.residence_id IN (SELECT id FROM residences WHERE builder_id = '<uuid builder>')

-- D1 — correzione. Idempotente: un secondo lancio non trova righe (le voci
-- corrette hanno next_due_date NULL) e restituisce 0.
UPDATE maintenance_items mi
   SET next_due_date = NULL,
       status        = 'in_attesa'
  FROM units u, maintenance_templates mt
 WHERE u.id = mi.unit_id
   AND mt.id = mi.template_id
   AND u.delivery_date IS NULL
   AND mi.next_due_date IS NOT NULL
   AND mi.activation_status = 'inclusa'
   AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
   AND mi.due_basis_override IS NULL
   AND NOT EXISTS (SELECT 1 FROM completions c WHERE c.item_id = mi.id)
   AND NOT EXISTS (SELECT 1 FROM unit_members um WHERE um.unit_id = u.id AND um.ended_at IS NULL)
   -- filtro builder: AND u.residence_id IN (SELECT id FROM residences WHERE builder_id = '<uuid builder>')
RETURNING mi.id AS voce_corretta, mi.unit_id;

-- C3 (dopo) — atteso 0. Rilanciare poi C1: da_correggere resta > 0 solo
-- sulle righe con residente_attivo = true.
SELECT count(*) AS voci_da_correggere_attese_0
FROM maintenance_items mi
JOIN units u                  ON u.id = mi.unit_id
JOIN maintenance_templates mt ON mt.id = mi.template_id
WHERE u.delivery_date IS NULL
  AND mi.next_due_date IS NOT NULL
  AND mi.activation_status = 'inclusa'
  AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
  AND mi.due_basis_override IS NULL
  AND NOT EXISTS (SELECT 1 FROM completions c WHERE c.item_id = mi.id)
  AND NOT EXISTS (SELECT 1 FROM unit_members um WHERE um.unit_id = u.id AND um.ended_at IS NULL);

-- ============================================================
-- ESITO — eseguito il 2026-10-29 da Filippo nel SQL Editor, dopo la 044,
-- senza filtro builder. Sequenza piu corta di quella prevista sopra:
-- C1 prima -> D1 -> C1 dopo. C2 e C3 NON eseguite.
-- VARIANTE DI C1 usata (non quella di questo file): contava solo le voci da
-- correggere, promemoria escluse, con HAVING su da_correggere > 0.
-- C1 prima: 4 unita, tutte in Tencarola (Furlan srl), 5 voci da correggere
--           ciascuna, nessuna con residente attivo.
-- D1:       eseguita con l'esclusione dei residenti attivi e delle
--           promemoria, come UPDATE senza RETURNING: l'editor non ha
--           mostrato il numero di righe aggiornate.
-- C1 dopo:  vuota. Con la variante (HAVING da_correggere > 0), prova che
--           nessuna voce da correggere resta: le 20 voci (4 x 5) sono state
--           corrette.
-- CONTROLLO PROMEMORIA (atteso per ogni unita di Tencarola non consegnata:
-- promemoria_datate 3, ricalcolabili_datate 0, ricalcolabili_non_in_attesa 0):
--   SELECT u.label, u.delivery_date,
--          count(*) FILTER (WHERE coalesce(mi.completion_mode, mt.completion_mode) = 'promemoria') AS promemoria,
--          count(*) FILTER (WHERE coalesce(mi.completion_mode, mt.completion_mode) = 'promemoria'
--                             AND mi.next_due_date IS NOT NULL) AS promemoria_datate_attese_3,
--          count(*) FILTER (WHERE coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
--                             AND mi.next_due_date IS NOT NULL) AS ricalcolabili_datate_attese_0,
--          count(*) FILTER (WHERE coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
--                             AND mi.status <> 'in_attesa') AS ricalcolabili_non_in_attesa_attese_0
--   FROM units u
--   JOIN residences r             ON r.id = u.residence_id
--   JOIN maintenance_items mi     ON mi.unit_id = u.id
--   JOIN maintenance_templates mt ON mt.id = mi.template_id
--   WHERE r.name = 'Tencarola'
--   GROUP BY u.id, u.label, u.delivery_date
--   ORDER BY u.label;
-- ESITO del controllo promemoria: NON RIPORTATO (il messaggio di Filippo
-- del 29/10 conteneva il segnaposto al posto dell'output). Che D1 abbia
-- escluso le promemoria e' dichiarato da Filippo, non verificato da
-- questa query.
-- ============================================================
