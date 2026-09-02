-- ============================================================
-- CasaZero — 035: accensione delle 16 voci condizionate della 033
-- Applica Filippo nel SQL Editor; subito dopo incolla nel footer l'output
-- della SELECT finale (convenzione 027/030/033/034).
-- ------------------------------------------------------------
-- COSA FA: porta is_active da false a true sulle 16 voci P1-P16 inserite
-- spente dalla 033. Nient'altro: nessun DDL, nessuna riga nuova, nessun
-- maintenance_items toccato.
--
-- COSA NON FA, ed e' il punto: accendere un template NON materializza
-- niente nei piani esistenti. La materializzazione avviene solo dentro
-- czero_create_residence_with_units (034:144-207) e czero_add_unit
-- (013:59-70), entrambe innescate da un'azione utente. Verificato prima
-- dell'apply: 886 maintenance_items in tutto il DB, di cui 0 puntano a una
-- delle 16 voci. Le 13 residenze esistenti hanno il piano gia'
-- materializzato e restano bit-per-bit identiche.
--
-- CHI CAMBIA: solo le residenze create DOPO questa migrazione, e solo per
-- le dotazioni che il wizard dichiara present=true. Il filtro e' gia' in
-- produzione dalla 034: qui non si aggiunge condizionalita', si rimuove
-- l'interruttore generale che la teneva inerte.
--
-- PERCHE' NON C'E' NOTIFY pgrst: non c'e' DDL. La schema-cache di PostgREST
-- indicizza tabelle e colonne, non i valori delle righe. Un UPDATE su
-- is_active e' letto immediatamente senza reload. Le migrazioni 027-034 lo
-- avevano perche' creavano tabelle, colonne o funzioni; questa no.
--
-- COME SONO IDENTIFICATE LE 16 VOCI: per predicato, non per UUID. Gli id
-- della 033 sono gen_random_uuid() generati all'apply, quindi diversi in
-- ogni ambiente e non citabili in un file di migrazione replayabile. Il
-- predicato e' lo stesso gia' usato dall'auto-verifica della 033 (:209-211):
--     sort_order BETWEEN 30 AND 45
--     AND is_conditional = true
--     AND condition_key IS NOT NULL
-- I 10 template spenti legacy (canali di gronda, bagni ciechi, carica
-- refrigerante, vasi di espansione, pompa di circolazione, registrazione
-- libretto, controllo prese, test differenziale FV, inverter FV, moduli FV)
-- hanno TUTTI condition_key NULL e sort_order < 30: sono esclusi due volte,
-- e restano spenti. Sono anche gli unici a cui puntano item gia' esistenti
-- (Cavaccio 122, Teolo 82, dublin 26, Test scadenze 42, Arcella 10):
-- accenderli per sbaglio farebbe riapparire quelle voci in cinque piani
-- reali. Per questo il predicato e' stretto e la guardia sotto e' fatale.
--
-- IDEMPOTENTE: la guardia conta le 16 voci a prescindere da is_active, e
-- l'UPDATE tocca solo quelle ancora spente. Rieseguire lo script aggiorna
-- 0 righe e stampa lo stesso risultato finale.
-- ============================================================

-- ------------------------------------------------------------
-- 1) GUARDIA — fallisce PRIMA di scrivere se il catalogo non e' nello
--    stato atteso (033 non applicata, gia' rimaneggiata, sort_order
--    riutilizzati da una migrazione successiva). Un'eccezione qui annulla
--    l'intera transazione: meglio nessun cambiamento che un cambiamento
--    parziale su un catalogo che non riconosciamo.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_voci    integer;
  v_chiavi  integer;
BEGIN
  SELECT count(*), count(DISTINCT condition_key)
    INTO v_voci, v_chiavi
    FROM public.maintenance_templates
   WHERE sort_order BETWEEN 30 AND 45
     AND is_conditional = true
     AND condition_key IS NOT NULL;

  IF v_voci <> 16 THEN
    RAISE EXCEPTION
      'Catalogo inatteso: attese 16 voci P1-P16 (sort_order 30-45, condizionali con chiave), trovate %. Migrazione annullata, nessuna riga modificata.',
      v_voci;
  END IF;

  -- 14 chiavi distinte sulle 16 voci: ascensore e autoclave ne governano
  -- due ciascuna (P1/P2 e P11/P12). Le altre 5 delle 19 dotazioni sono
  -- governate dalle voci gia' attive aggiornate dalla sezione 2/3 della 033.
  IF v_chiavi <> 14 THEN
    RAISE EXCEPTION
      'Catalogo inatteso: attese 14 condition_key distinte fra le 16 voci, trovate %. Migrazione annullata.',
      v_chiavi;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2) ACCENSIONE
-- ------------------------------------------------------------
UPDATE public.maintenance_templates
   SET is_active = true
 WHERE sort_order BETWEEN 30 AND 45
   AND is_conditional = true
   AND condition_key IS NOT NULL
   AND is_active = false;

-- ------------------------------------------------------------
-- 3) AUTO-VERIFICA IN CODA — SELECT, ultima istruzione dello script, quindi
--    il SQL Editor ne mostra il risultato. Gira nella stessa transazione:
--    se questi numeri tornano, lo script sta per committare. Se non compare
--    NESSUN risultato, la transazione e' stata annullata (guardia scattata
--    o errore) e il catalogo e' rimasto intatto: leggi il banner di errore
--    dell'editor e riportane il testo, non riapplicare alla cieca.
--
--    Una riga per condition_key, piu' la riga '(incondizionata)'.
--    ATTESO DOPO L'APPLY — 20 righe:
--      • 19 righe con chiave, spenti = 0 su tutte, somma attivi = 21
--        (16 nuove + 4 preesistenti della 033 sez.2 + messa a terra sez.3);
--        'ascensore' e 'autoclave' con attivi = 2, le altre 17 con attivi = 1
--      • '(incondizionata)' : attivi = 14, spenti = 10, totale = 24
--    Totale template attivi dopo l'apply: 35 (erano 19).
--    Le 19 chiavi devono coincidere ESATTAMENTE con RESIDENCE_FEATURES di
--    src/lib/residence-features.ts:49-163 — se non coincidono,
--    scripts/verify-residence-features.mjs esce non-zero, ed e' la guardia
--    da eseguire subito dopo questo apply.
-- ------------------------------------------------------------
SELECT
  coalesce(condition_key, '(incondizionata)')   AS condition_key,
  count(*) FILTER (WHERE is_active)             AS template_attivi,
  count(*) FILTER (WHERE NOT is_active)         AS template_spenti,
  count(*)                                      AS totale
FROM public.maintenance_templates
GROUP BY 1
ORDER BY (coalesce(condition_key, '(incondizionata)') = '(incondizionata)'), 1;

-- ============================================================
-- VERIFICA POST-APPLY (facoltativa, da eseguire a parte). Conferma che
-- nessun piano sia stato toccato: atteso 886 item e 0 sulle voci nuove,
-- identico al pre-apply.
-- ============================================================
-- SELECT
--   (SELECT count(*) FROM public.maintenance_items) AS item_totali_atteso_886,
--   (SELECT count(*) FROM public.maintenance_items mi
--      JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--     WHERE mt.sort_order BETWEEN 30 AND 45
--       AND mt.is_conditional = true) AS item_sulle_voci_nuove_atteso_0;
--
-- Poi, da terminale:  npm run verify:features   (atteso exit 0)
-- ============================================================
--
-- ── ESITO REALE (applicata da Filippo il __/__/2026) ──
--
-- 1. Guardia superata (nessuna eccezione):
--    Nessuna RAISE EXCEPTION sollevata: le 16 voci P1-P16 e le 14 chiavi
--    distinte attese sono state trovate cosi' come previsto dalla guardia.
--
-- 2. Righe aggiornate dall'UPDATE (atteso 16): 16, dedotto dall'auto-verifica
--    del punto 3 (non e' l'output diretto dell'UPDATE): tutte e 19 le chiavi
--    risultano con template_spenti = 0, mentre prima dell'apply le 16 voci
--    della 033 erano spente. Le 16 differenze osservate coincidono con le 16
--    attese dalla guardia.
--
-- 3. Auto-verifica in coda — conteggio per condition_key: 20 righe.
--    Le 19 chiavi con template_spenti = 0; ascensore e autoclave con
--    template_attivi = 2 ciascuna, le altre 17 con 1 -> 21 template
--    condizionati attivi in totale. Riga '(incondizionata)': attivi = 14,
--    spenti = 10, totale = 24. Totale template attivi dopo l'apply: 35
--    (erano 19, prima dell'apply). I 10 template legacy incondizionati
--    restano spenti, come previsto dal predicato che li esclude.
--
-- 4. Item totali e item sulle voci nuove (atteso 886 | 0): 886 | 0.
--    Identico al conteggio pre-apply: nessun piano esistente toccato.
--
-- 5. npm run verify:features — exit code: 0.
--    template condizionati a catalogo: 21 | condition_key distinti su DB: 19
--    | chiavi nella costante: 19 | duplicate nella costante: nessuna |
--    mancanti (a catalogo, non nella costante): nessuna | orfane (nella
--    costante, non a catalogo): nessuna. Costante e catalogo coincidono
--    esattamente in entrambe le direzioni.
--
-- CONCLUSIONE: le 16 voci P1-P16 della 033 sono state accese senza toccare
-- alcun piano esistente (886 item totali, 0 sulle voci nuove: identico al
-- conteggio pre-apply). Il primo tentativo di apply e' fallito prima di
-- scrivere: l'auto-verifica in coda usava un riferimento nudo a
-- condition_key nell'ORDER BY dopo un GROUP BY 1, respinto da Postgres
-- ("column must appear in the GROUP BY clause"); l'intera transazione e'
-- stata annullata, nessuna riga toccata sul catalogo. Corretto ripetendo
-- l'espressione di raggruppamento nell'ORDER BY
-- (coalesce(condition_key, '(incondizionata)') = '(incondizionata)'), che
-- preserva l'ordinamento previsto (le 19 dotazioni prima, poi
-- '(incondizionata)'); il secondo tentativo e' andato a buon fine.
-- ============================================================
