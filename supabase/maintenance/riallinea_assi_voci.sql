-- ============================================================
-- Riallineamento dati: modalita e tipo delle voci tornano al template
--
-- Origine: ItemConfigForm (manutenzioni/ItemConfigForm.tsx:31-37) scrive
-- SEMPRE completion_mode e obligation_type sulla voce, anche quando si
-- salva solo frequenza, garanzia o fornitore: la voce smette di seguire il
-- template. Caso visto: "Pulizia filtri climatizzatore" su "Appartamento
-- furlan 1" (Santa Giustina) con amministratore / A / N3 sulla voce
-- (updated_at 2026-09-19 16:01), mentre il template e' promemoria / C / N1:
-- il residente la vede "Obbligo di legge" in home e in /manutenzioni.
--
-- Decisioni del 31/10:
--   - il tipo (obligation_type) e' un fatto normativo del catalogo, non si
--     modifica per voce: NULL su TUTTE le voci, eredita sempre dal template;
--   - la modalita resta modificabile per voce, ma le 8 voci divergenti oggi
--     (Q3: Cavaccio 4, Santa Giustina 2, Teolo 1, Test manutenzione 1)
--     tornano al template: completion_mode e priority a NULL.
--
-- Ordine obbligato: D1 (modalita) PRIMA di D2 (tipo). Il criterio di D1
-- include la divergenza sul tipo: dopo D2 una voce divergente solo sul tipo
-- non verrebbe piu riconosciuta.
--
-- Non tocca: completions (mai), maintenance_templates, status, date,
-- frequenza, fornitore, garanzia. Scope: tutte le residenze.
--
-- SQL Editor senza transazioni: statement singoli, idempotenti, da lanciare
-- uno alla volta nell'ordine C1 -> C2 -> D1 -> D2 -> C1 -> C3.
-- ============================================================

-- C1 (prima e dopo) — Q3: voci incluse divergenti dal template.
-- Attese: 8 righe prima, 0 dopo.
SELECT r.name AS residenza, u.label AS unita, mt.title,
       mi.completion_mode AS item_mode, mt.completion_mode AS tpl_mode,
       mi.obligation_type AS item_tipo, mt.obligation_type AS tpl_tipo,
       coalesce(mi.priority, mt.priority) AS prio_effettiva,
       mi.updated_at
FROM maintenance_items mi
JOIN maintenance_templates mt ON mt.id = mi.template_id
JOIN residences r ON r.id = mi.residence_id
LEFT JOIN units u ON u.id = mi.unit_id
WHERE mi.activation_status = 'inclusa'
  AND (
       (mi.completion_mode IS NOT NULL AND mi.completion_mode IS DISTINCT FROM mt.completion_mode)
    OR (mi.obligation_type IS NOT NULL AND mi.obligation_type IS DISTINCT FROM mt.obligation_type)
    OR coalesce(mi.priority, mt.priority)::text IS DISTINCT FROM
         CASE coalesce(mi.completion_mode, mt.completion_mode)
           WHEN 'promemoria' THEN 'N1' WHEN 'residente' THEN 'N2' WHEN 'amministratore' THEN 'N3' END
  )
ORDER BY r.name, mt.title, u.label;

-- C2 (prima) — cosa cambia davvero. Una riga per voce con almeno un valore
-- proprio su modalita, tipo o priority, TUTTI gli stati di attivazione.
-- in_d1 = true: D1 la riporta al template (modalita e priority).
-- tipo_proprio = true: D2 azzera il tipo.
-- status/next_due_date: NON vengono toccati. Da guardare sulle voci che
-- passano da amministratore a promemoria: uno stato da lavori ('in_corso',
-- presa in carico) resta nel DB, ma le card promemoria non leggono status.
SELECT r.name AS residenza, u.label AS unita, mt.title, mi.activation_status,
       mi.completion_mode AS item_mode, mt.completion_mode AS tpl_mode,
       mi.obligation_type AS item_tipo, mt.obligation_type AS tpl_tipo,
       mi.priority AS item_prio, mt.priority AS tpl_prio,
       mi.status, mi.next_due_date,
       (mi.activation_status = 'inclusa' AND (
            (mi.completion_mode IS NOT NULL AND mi.completion_mode IS DISTINCT FROM mt.completion_mode)
         OR (mi.obligation_type IS NOT NULL AND mi.obligation_type IS DISTINCT FROM mt.obligation_type)
         OR coalesce(mi.priority, mt.priority)::text IS DISTINCT FROM
              CASE coalesce(mi.completion_mode, mt.completion_mode)
                WHEN 'promemoria' THEN 'N1' WHEN 'residente' THEN 'N2' WHEN 'amministratore' THEN 'N3' END
       )) AS in_d1,
       (mi.obligation_type IS NOT NULL) AS tipo_proprio
FROM maintenance_items mi
JOIN maintenance_templates mt ON mt.id = mi.template_id
JOIN residences r ON r.id = mi.residence_id
LEFT JOIN units u ON u.id = mi.unit_id
WHERE mi.completion_mode IS NOT NULL
   OR mi.obligation_type IS NOT NULL
   OR mi.priority IS NOT NULL
ORDER BY r.name, mt.title, u.label;

-- D1 — le voci divergenti (stesso criterio di C1) tornano al template su
-- modalita e priority. Atteso: UPDATE 8.
UPDATE maintenance_items mi
SET completion_mode = NULL,
    priority = NULL
FROM maintenance_templates mt
WHERE mt.id = mi.template_id
  AND mi.activation_status = 'inclusa'
  AND (
       (mi.completion_mode IS NOT NULL AND mi.completion_mode IS DISTINCT FROM mt.completion_mode)
    OR (mi.obligation_type IS NOT NULL AND mi.obligation_type IS DISTINCT FROM mt.obligation_type)
    OR coalesce(mi.priority, mt.priority)::text IS DISTINCT FROM
         CASE coalesce(mi.completion_mode, mt.completion_mode)
           WHEN 'promemoria' THEN 'N1' WHEN 'residente' THEN 'N2' WHEN 'amministratore' THEN 'N3' END
  );

-- D2 — il tipo non e' mai della voce: NULL ovunque, qualunque stato di
-- attivazione. Atteso: UPDATE = righe di C2 con tipo_proprio = true.
UPDATE maintenance_items
SET obligation_type = NULL
WHERE obligation_type IS NOT NULL;

-- C3 (dopo) — controlli finali. Attesi: tipo_proprio 0, divergenti 0.
-- residui_modalita: voci con modalita propria uguale al template (non
-- divergenti, lasciate come sono): solo informativo.
SELECT
  (SELECT count(*) FROM maintenance_items WHERE obligation_type IS NOT NULL) AS tipo_proprio,
  (SELECT count(*)
     FROM maintenance_items mi JOIN maintenance_templates mt ON mt.id = mi.template_id
    WHERE mi.activation_status = 'inclusa'
      AND (
           (mi.completion_mode IS NOT NULL AND mi.completion_mode IS DISTINCT FROM mt.completion_mode)
        OR coalesce(mi.priority, mt.priority)::text IS DISTINCT FROM
             CASE coalesce(mi.completion_mode, mt.completion_mode)
               WHEN 'promemoria' THEN 'N1' WHEN 'residente' THEN 'N2' WHEN 'amministratore' THEN 'N3' END
      )) AS divergenti,
  (SELECT count(*)
     FROM maintenance_items mi JOIN maintenance_templates mt ON mt.id = mi.template_id
    WHERE mi.completion_mode IS NOT NULL AND mi.completion_mode = mt.completion_mode) AS residui_modalita;

-- ============================================================
-- Esiti (eseguito da Filippo nel SQL Editor, 31/10/2026):
--   C1 prima: 9 righe, non 8 come Q3 — le 8 di Q3 piu "VMC: sostituzione
--             filtri" (Test manutenzione), divergente solo su priority.
--   C2: 30 righe; nessuna voce di Portello o Bassanello.
--   C4 (controllo aggiunto da Filippo, voci da riallineare con
--       completamenti): 2 righe — Cavaccio "Verifica messa a terra
--       condominiale" e Santa Giustina "Manutenzione cancelli e portoni
--       motorizzati", entrambe con modalita uguale al template
--       (amministratore): cambia solo il tipo, nessun impatto sulla
--       presentazione del fascicolo. completions non toccata.
--   D1: eseguita (conteggio righe non riportato).
--   D2: eseguita (conteggio righe non riportato).
--   C1 dopo: 0 righe.
--   C3: tipo_proprio 0, divergenti 0, residui_modalita 3 (modalita propria
--       uguale al template, lasciate come sono).
--   Verifica a schermo (Filippo, 31/10/2026): nella PWA del residente di
--       "Appartamento furlan 1" (filippogiochi2002) "Pulizia filtri
--       climatizzatore" e' tra i "Consigli per la tua casa" come
--       "Consigliata · ogni 6 mesi", senza "Obbligo di legge"; fascicolo
--       invariato (2 interventi).
-- ============================================================
