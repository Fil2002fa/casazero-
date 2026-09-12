-- ============================================================
-- CasaZero — 039: suppliers diventa anagrafica del costruttore
--                 + tabella "ha realizzato" (fornitore × residenza × sistema)
-- ANTEPRIMA. Applica Filippo nel SQL Editor; incolla poi l'output della
-- SELECT finale nel footer (convenzione 027/030/031/033/034/035/036/037/038).
-- ------------------------------------------------------------
-- CONCERN UNICO: spostare l'anagrafica fornitore dall'asse residenza all'asse
-- costruttore, e rendere esplicito in una tabella dedicata il fatto "questo
-- fornitore ha realizzato questo sistema in questa residenza".
--
-- MIGRAZIONE ADDITIVA, PER SCELTA. `suppliers.residence_id` resta NOT NULL e
-- invariata: 8 punti applicativi la usano oggi come chiave di scoping diretta
-- (fornitori/actions.ts:53, fornitori/page.tsx:28, manutenzioni/page.tsx:57,
-- residences/[id]/page.tsx:295, administrators/[id]/page.tsx:102,
-- administrators/page.tsx:78, più la policy "suppliers: super_admin gestisce"
-- di 002_rls.sql:417-425). Renderla nullable o rimuoverla adesso li romperebbe
-- tutti in una volta. Il porting di quei call-site su builder_id è debito
-- registrato, non lavoro di questo blocco: fino ad allora le due colonne
-- convivono e `residence_id` resta la residenza di PRIMA creazione del record.
--
-- COSA NON TOCCA:
--   • `completions` — fascicolo legale, nessuna FK verso suppliers (038:28).
--   • `maintenance_items.supplier_id` (001_schema.sql:142) — invariata.
--   • `suppliers.categories TEXT[]` — NON viene rimossa qui. È la sorgente del
--     backfill (parte 5) e resta finché il form non scrive sulla nuova tabella
--     (commit c). Rimuoverla e riempirla nella stessa migrazione significherebbe
--     distruggere la sorgente nello stesso atto in cui la si legge.
--   • `documents.sistema` — resta TEXT senza CHECK, deliberato (026:15-18).
--     Il CHECK dei 14 sistemi qui sotto vincola SOLO la nuova tabella.
--   • Le policy di `suppliers` — la 038 ha già lasciato "suppliers: super_admin
--     gestisce" come unica policy, ed è già scoped al builder. Invariata.
--
-- LISTA SISTEMI (14): i 9 di SISTEMI in src/lib/document-classification.ts:115-125
-- più 5 (coperture, spurghi, finiture, sicurezza, accessi) che esistono già come
-- valori reali di maintenance_templates.category (seed.sql + 033:64-145) e di
-- suppliers.categories (seed_cavaccio_demo.sql:70-100). Senza i 5 aggiunti, due
-- dei quattro fornitori demo (Coperture Friulane, Idroservice) finirebbero in
-- 'altro': il backfill sarebbe lossy. La costante TS viene estesa agli stessi
-- 14 valori nel commit successivo — questo CHECK e quella costante vanno
-- mantenuti allineati (script di confronto nel commit b).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- DROP POLICY IF EXISTS, CREATE INDEX IF NOT EXISTS, INSERT ... ON CONFLICT.
-- ============================================================


-- ============================================================
-- 0. PRE-VERIFICA — ESEGUIRE PRIMA, DA SOLA, E LEGGERE L'OUTPUT
-- ============================================================
-- `suppliers.categories` è testo libero (il form fa split su virgola senza
-- validazione: fornitori/actions.ts:48-55). Prima di applicare il resto, questa
-- query mostra quali valori esistono davvero e dove finirebbero. Qualunque riga
-- con sistema_mappato = 'altro' è perdita di granularità: se ne compaiono,
-- conviene decidere la mappatura PRIMA di eseguire il backfill, non dopo.
--
-- WITH mappa(categoria, sistema) AS (VALUES
--   ('termico','termico'), ('ventilazione','vmc'), ('vmc','vmc'),
--   ('elettrico','elettrico'), ('fotovoltaico','fotovoltaico'),
--   ('coperture','coperture'), ('sicurezza','sicurezza'), ('spurghi','spurghi'),
--   ('idrico','idrico_sanitario'), ('idrico_sanitario','idrico_sanitario'),
--   ('antincendio','antincendio'), ('ascensore','ascensore'),
--   ('finiture','finiture'), ('accessi','accessi'), ('gas','gas')
-- )
-- SELECT c.categoria_grezza,
--        COALESCE(m.sistema, 'altro') AS sistema_mappato,
--        COUNT(*) AS fornitori
--   FROM (SELECT unnest(categories) AS categoria_grezza FROM suppliers) c
--   LEFT JOIN mappa m ON m.categoria = lower(trim(c.categoria_grezza))
--  GROUP BY 1, 2
--  ORDER BY 2, 1;


-- ============================================================
-- 1. suppliers — builder_id e vat_number
-- ============================================================

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS builder_id UUID REFERENCES builders(id);

-- Partita IVA: FACOLTATIVA (molti subappaltatori entrano in anagrafica prima che
-- il dato ci sia) ma unica per costruttore quando presente — è la chiave naturale
-- su cui il commit (e) farà il match dalle dichiarazioni di conformità.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS vat_number TEXT;

-- La stringa vuota NON è NULL: senza questo CHECK, due fornitori salvati da un
-- form che manda '' invece di NULL collidono sull'UNIQUE parziale qui sotto e il
-- secondo salvataggio fallisce con un errore incomprensibile all'utente.
-- Il vincolo non entra nel merito del formato (11 cifre, prefissi esteri): la
-- validazione di forma sta nel form, qui si difende solo l'unicità.
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_vat_number_non_vuota;
ALTER TABLE suppliers ADD  CONSTRAINT suppliers_vat_number_non_vuota
  CHECK (vat_number IS NULL OR length(trim(vat_number)) > 0);

-- Backfill: il builder è quello della residenza di creazione.
-- `residences.builder_id` è NOT NULL (001_schema.sql:31), quindi la copertura è
-- totale e il SET NOT NULL subito sotto non può fallire per righe residue.
UPDATE suppliers s
   SET builder_id = r.builder_id
  FROM residences r
 WHERE r.id = s.residence_id
   AND s.builder_id IS DISTINCT FROM r.builder_id;

ALTER TABLE suppliers ALTER COLUMN builder_id SET NOT NULL;

-- UNIQUE parziale: più fornitori senza partita IVA per builder sono leciti,
-- due con la stessa partita IVA no. Un UNIQUE pieno su (builder_id, vat_number)
-- non basterebbe: in Postgres i NULL non collidono tra loro, quindi funzionerebbe
-- comunque — l'indice parziale lo rende esplicito e non indicizza i NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_builder_vat
  ON suppliers(builder_id, vat_number)
  WHERE vat_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_builder ON suppliers(builder_id);

COMMENT ON COLUMN suppliers.builder_id IS
  'Costruttore proprietario dell''anagrafica. Asse di scoping corrente.';
COMMENT ON COLUMN suppliers.residence_id IS
  'Residenza di prima creazione. Asse storico: il legame fornitore-residenza vive in supplier_installations. Non rimossa finché i call-site non migrano su builder_id.';
COMMENT ON COLUMN suppliers.vat_number IS
  'Partita IVA, facoltativa. Chiave naturale di match per la proposta dalle dichiarazioni di conformità.';


-- ============================================================
-- 2. supplier_installations — "ha realizzato"
-- ============================================================

CREATE TABLE IF NOT EXISTS supplier_installations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  supplier_id  UUID NOT NULL REFERENCES suppliers(id)   ON DELETE CASCADE,
  residence_id UUID NOT NULL REFERENCES residences(id)  ON DELETE CASCADE,

  -- I 14 sistemi. Speculare a SISTEMI (src/lib/document-classification.ts):
  -- ogni modifica va fatta in entrambi i posti, lo script del commit (b) lo prova.
  sistema      TEXT NOT NULL CHECK (sistema IN (
    'elettrico',
    'termico',
    'gas',
    'idrico_sanitario',
    'antincendio',
    'ascensore',
    'fotovoltaico',
    'vmc',
    'coperture',
    'spurghi',
    'finiture',
    'sicurezza',
    'accessi',
    'altro'
  )),

  -- Origine del collegamento: inserito a mano dal super_admin, oppure proposto
  -- da una dichiarazione di conformità e CONFERMATO dal super_admin. Non esiste
  -- un'origine "automatica": nessuna riga entra qui senza un atto umano.
  source       TEXT NOT NULL DEFAULT 'manuale' CHECK (source IN ('manuale', 'documento')),

  -- Documento sorgente, solo per source = 'documento'. ON DELETE SET NULL:
  -- se il documento sparisce il collegamento resta (il fornitore ha comunque
  -- realizzato l'impianto), ma perde la prova documentale.
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un collegamento manuale non ha un documento sorgente: se lo avesse, sarebbe
  -- 'documento'. Il verso opposto NON è vincolato, perché ON DELETE SET NULL
  -- può legittimamente lasciare source = 'documento' con documento NULL.
  CONSTRAINT supplier_installations_manuale_senza_documento
    CHECK (source <> 'manuale' OR source_document_id IS NULL),

  -- Lo stesso fornitore, nella stessa residenza, per lo stesso sistema, una volta
  -- sola. È anche ciò che rende ripetibile il backfill (ON CONFLICT DO NOTHING).
  CONSTRAINT supplier_installations_unici
    UNIQUE (supplier_id, residence_id, sistema)
);

CREATE INDEX IF NOT EXISTS idx_supplier_installations_supplier
  ON supplier_installations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_installations_residence
  ON supplier_installations(residence_id, sistema);

COMMENT ON TABLE supplier_installations IS
  'Fornitore x residenza x sistema: chi ha realizzato cosa, dove. Non e'' un fascicolo legale: modificabile e cancellabile dal super_admin.';


-- ============================================================
-- 3. RLS — solo super_admin dello stesso builder (stesso perimetro della 038)
-- ============================================================

ALTER TABLE supplier_installations ENABLE ROW LEVEL SECURITY;

-- NOTA SULLE QUALIFICAZIONI (bug class registrata in CLAUDE.md): qui è più
-- insidiosa del solito. Dopo la parte 1, `suppliers` ha SIA `builder_id` SIA
-- `residence_id`, e `residences` ha SIA `id` SIA `builder_id`: un riferimento
-- non qualificato dentro le subquery si legherebbe alla tabella della subquery
-- invece che a supplier_installations, producendo una tautologia sempre-vera
-- senza alcun errore di parsing. Ogni colonna sotto è qualificata con un alias
-- esplicito, comprese quelle di supplier_installations.
--
-- Niente czero_can_access_residence(): quella funzione (002_rls.sql:29-54)
-- include il ramo residente via unit_members. Qui il perimetro è un solo ruolo.

DROP POLICY IF EXISTS "supplier_installations: super_admin gestisce" ON supplier_installations;

CREATE POLICY "supplier_installations: super_admin gestisce"
  ON supplier_installations FOR ALL
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = supplier_installations.supplier_id
        AND s.builder_id = public.czero_user_builder_id()
    )
  )
  -- Il WITH CHECK è più stretto della USING, e deve esserlo: impedisce di
  -- collegare un fornitore del proprio builder a una residenza di un altro
  -- builder. La sola condizione sul fornitore non lo escluderebbe.
  WITH CHECK (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = supplier_installations.supplier_id
        AND s.builder_id = public.czero_user_builder_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.residences r
      WHERE r.id = supplier_installations.residence_id
        AND r.builder_id = public.czero_user_builder_id()
    )
    AND (
      supplier_installations.source_document_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.id = supplier_installations.source_document_id
          AND d.residence_id = supplier_installations.residence_id
      )
    )
  );

-- admin e residente: nessuna policy, per nessun comando. RLS nega.
-- Non serve una policy negativa, serve l'assenza di policy (stessa logica 037:133-134).


-- ============================================================
-- 4. Grants — secondo livello, indipendente dalle policy
-- ============================================================
-- Stesso trattamento di `suppliers` in 031_grants_hardening.sql:60,138:
-- authenticated ha i quattro privilegi di riga, il confinamento sta nelle policy.

REVOKE ALL ON public.supplier_installations FROM anon;
REVOKE ALL ON public.supplier_installations FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_installations TO authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.supplier_installations FROM authenticated;


-- ============================================================
-- 5. Backfill — i collegamenti già impliciti in suppliers.categories
-- ============================================================
-- `suppliers.categories` + `suppliers.residence_id` SONO già, di fatto, la
-- tripla (fornitore, residenza, sistema): il backfill è la loro esplicitazione,
-- non una ricostruzione. Non passa da maintenance_items, che darebbe lo stesso
-- risultato per via più lunga e perderebbe le categorie senza voci di piano.
-- origine 'manuale': questi collegamenti vengono da inserimenti umani, nessuno
-- è stato proposto da un documento.
-- Ripetibile: ON CONFLICT DO NOTHING sul vincolo di unicità.

WITH mappa(categoria, sistema) AS (VALUES
  ('termico','termico'), ('ventilazione','vmc'), ('vmc','vmc'),
  ('elettrico','elettrico'), ('fotovoltaico','fotovoltaico'),
  ('coperture','coperture'), ('sicurezza','sicurezza'), ('spurghi','spurghi'),
  ('idrico','idrico_sanitario'), ('idrico_sanitario','idrico_sanitario'),
  ('antincendio','antincendio'), ('ascensore','ascensore'),
  ('finiture','finiture'), ('accessi','accessi'), ('gas','gas')
)
INSERT INTO supplier_installations (supplier_id, residence_id, sistema, source)
SELECT s.id,
       s.residence_id,
       COALESCE(m.sistema, 'altro'),
       'manuale'
  FROM suppliers s
  CROSS JOIN LATERAL unnest(s.categories) AS c(categoria_grezza)
  LEFT JOIN mappa m ON m.categoria = lower(trim(c.categoria_grezza))
 WHERE s.categories IS NOT NULL
ON CONFLICT (supplier_id, residence_id, sistema) DO NOTHING;


-- ============================================================
-- 6. PostgREST — ultima istruzione eseguibile prima della verifica
-- ============================================================
-- Tabella nuova + due colonne nuove: senza reload, PostgREST le ignora
-- silenziosamente e il codice del commit (c) leggerebbe sempre vuoto.
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- AUTO-VERIFICA (ultima istruzione: il suo output va nel footer)
--   Attesi, su un DB con il solo seed Cavaccio:
--     fornitori                         = 4
--     fornitori_senza_builder           = 0
--     fornitori_con_piva                = 0
--     collegamenti                      = 7
--       (Rossi: termico + vmc · Bortoluzzi: elettrico + fotovoltaico ·
--        Coperture Friulane: coperture + sicurezza · Idroservice: spurghi)
--     collegamenti_in_altro             = 0   ← se > 0, mappatura da rivedere
--     collegamenti_cross_builder        = 0
--     policy_su_supplier_installations  = 1
-- ============================================================
SELECT
  (SELECT count(*) FROM suppliers)                                   AS fornitori,
  (SELECT count(*) FROM suppliers WHERE builder_id IS NULL)          AS fornitori_senza_builder,
  (SELECT count(*) FROM suppliers WHERE vat_number IS NOT NULL)      AS fornitori_con_piva,
  (SELECT count(*) FROM supplier_installations)                      AS collegamenti,
  (SELECT count(*) FROM supplier_installations
    WHERE sistema = 'altro')                                         AS collegamenti_in_altro,
  (SELECT count(*) FROM supplier_installations si
     JOIN suppliers  s ON s.id = si.supplier_id
     JOIN residences r ON r.id = si.residence_id
    WHERE s.builder_id <> r.builder_id)                              AS collegamenti_cross_builder,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'supplier_installations')                     AS policy_su_supplier_installations;


-- ============================================================
--
-- -- ESITO REALE (applicata da Filippo il __/__/2026) --
--
-- 0. Output della PRE-VERIFICA (valori di categories e mappatura):
--
-- 1. Riga restituita dall'auto-verifica:
--    fornitori:                        (atteso 4)
--    fornitori_senza_builder:          (atteso 0)
--    fornitori_con_piva:               (atteso 0)
--    collegamenti:                     (atteso 7)
--    collegamenti_in_altro:            (atteso 0)
--    collegamenti_cross_builder:       (atteso 0)
--    policy_su_supplier_installations: (atteso 1)
--
-- 2. Dettaglio dei collegamenti creati (query di controllo, facoltativa):
--    SELECT s.name, si.sistema, si.source
--      FROM supplier_installations si JOIN suppliers s ON s.id = si.supplier_id
--     ORDER BY s.name, si.sistema;
--
-- CONCLUSIONE:
-- ============================================================
