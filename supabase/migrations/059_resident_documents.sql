-- ============================================================
-- CasaZero — 059: documenti del residente
-- Tabella public.resident_documents, bucket privato resident-documents,
-- quattro helper, policy su tabella e su storage.objects.
-- ALLARGA l'accesso (nuove scritture per il ruolo client): si applica solo
-- con il si' scritto di Filippo.
--
-- Regole (decisioni del 13/11):
--   * un documento e' visibile solo se chi guarda E chi ha caricato sono
--     membri attivi della stessa unita' (vendita = i documenti del vecchio
--     proprietario spariscono da soli);
--   * solo ruolo client, in lettura, insert e delete, tabella e storage;
--     admin e super_admin non vedono nulla (il service role bypassa RLS);
--   * qualunque membro attivo dell'unita' puo' eliminare un documento visibile;
--   * nessun UPDATE: il documento non si modifica, si elimina e si ricarica;
--   * tipo da lista chiusa + titolo; PDF, JPEG, PNG, WebP; massimo 5 MB.
-- "Membro attivo" = unit_members.ended_at IS NULL: stesso predicato di
-- czero_can_access_unit e di tutte le letture dell'app.
--
-- Path dell'oggetto: {unit_id}/{uuid}.{ext}. Il nome file dell'utente non
-- entra mai nel path ne' nella tabella.
-- Flusso: createSignedUploadUrl (client di sessione, passa dalla policy
-- INSERT di storage) -> uploadToSignedUrl -> confirm: INSERT della riga,
-- poi controllo dimensione reale e magic bytes (lettura ammessa perche' la
-- riga esiste). Un upload mai confermato resta orfano: pulizia con service
-- role, in backlog.
-- objects.name sempre qualificato (bug class della 022).
-- ============================================================

-- ---------- 1. Helper ----------

-- Interno: fonte unica del predicato. Nessun EXECUTE per i client, cosi' non
-- serve a sondare le membership altrui.
CREATE OR REPLACE FUNCTION public.czero_unit_member_active(p_unit_id uuid, p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.unit_members um
     WHERE um.unit_id    = p_unit_id
       AND um.profile_id = p_profile_id
       AND um.ended_at IS NULL
  )
$$;

REVOKE ALL ON FUNCTION public.czero_unit_member_active(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- "Sono membro attivo di questa unita'?" Riguarda solo chi chiama.
CREATE OR REPLACE FUNCTION public.czero_is_active_unit_member(p_unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(public.czero_unit_member_active(p_unit_id, (SELECT auth.uid())), false)
$$;

REVOKE ALL ON FUNCTION public.czero_is_active_unit_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.czero_is_active_unit_member(uuid) TO authenticated;

-- Visibilita' di un documento: chi guarda e' client e membro attivo
-- dell'unita', e chi ha caricato e' ancora membro attivo della stessa unita'.
CREATE OR REPLACE FUNCTION public.czero_resident_doc_visible(p_unit_id uuid, p_uploaded_by uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    public.czero_user_role() = 'client'::public.user_role
    AND public.czero_unit_member_active(p_unit_id, (SELECT auth.uid()))
    AND public.czero_unit_member_active(p_unit_id, p_uploaded_by),
    false
  )
$$;

REVOKE ALL ON FUNCTION public.czero_resident_doc_visible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.czero_resident_doc_visible(uuid, uuid) TO authenticated;

-- Path di upload valido per chi chiama: client, forma {uuid}/{uuid}.{ext},
-- la cartella e' un'unita' di cui e' membro attivo. La regex viene prima del
-- cast, quindi un path malformato da' false e non un errore.
CREATE OR REPLACE FUNCTION public.czero_resident_upload_path_ok(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.czero_user_role() = 'client'::public.user_role
     AND p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$'
    THEN COALESCE(
      public.czero_unit_member_active(split_part(p_name, '/', 1)::uuid, (SELECT auth.uid())),
      false
    )
    ELSE false
  END
$$;

REVOKE ALL ON FUNCTION public.czero_resident_upload_path_ok(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.czero_resident_upload_path_ok(text) TO authenticated;

-- ---------- 2. Tabella ----------

CREATE TABLE public.resident_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id      uuid NOT NULL REFERENCES public.units(id)    ON DELETE CASCADE,
  uploaded_by  uuid NOT NULL DEFAULT auth.uid()
                             REFERENCES public.profiles(id) ON DELETE CASCADE,
  doc_kind     text NOT NULL
               CHECK (doc_kind IN ('ricevuta','rapporto_tecnico','garanzia','manuale','foto','altro')),
  title        text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  storage_path text NOT NULL UNIQUE,
  mime_type    text NOT NULL
               CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes   bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- il path deve stare nella cartella dell'unita' della riga
  CONSTRAINT resident_documents_path_check CHECK (
    storage_path ~ ('^' || unit_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$')
  )
);

CREATE INDEX resident_documents_unit_idx ON public.resident_documents (unit_id, created_at DESC);

ALTER TABLE public.resident_documents ENABLE ROW LEVEL SECURITY;

-- I privilegi di default danno tutto ad anon e authenticated: si toglie
-- tutto e si rimette solo cio' che serve. Nessun UPDATE.
REVOKE ALL ON public.resident_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.resident_documents TO authenticated;

CREATE POLICY "resident_documents: lettura tra membri attivi dell'unita"
  ON public.resident_documents FOR SELECT
  TO authenticated
  USING (public.czero_resident_doc_visible(unit_id, uploaded_by));

CREATE POLICY "resident_documents: insert del proprio documento"
  ON public.resident_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND public.czero_resident_doc_visible(unit_id, uploaded_by)
  );

CREATE POLICY "resident_documents: delete tra membri attivi dell'unita"
  ON public.resident_documents FOR DELETE
  TO authenticated
  USING (public.czero_resident_doc_visible(unit_id, uploaded_by));

-- ---------- 3. Bucket ----------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resident-documents', 'resident-documents', false, 5242880,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ---------- 4. Policy su storage.objects ----------

CREATE POLICY "resident-documents bucket: upload nella cartella dell'unita"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    objects.bucket_id = 'resident-documents'
    AND public.czero_resident_upload_path_ok(objects.name)
  );

CREATE POLICY "resident-documents bucket: lettura per riga visibile"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    objects.bucket_id = 'resident-documents'
    AND EXISTS (
      SELECT 1 FROM public.resident_documents rd
       WHERE rd.storage_path = objects.name
         AND public.czero_resident_doc_visible(rd.unit_id, rd.uploaded_by)
    )
  );

-- Stessa regola della lettura: l'oggetto si cancella prima della riga.
CREATE POLICY "resident-documents bucket: delete per riga visibile"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    objects.bucket_id = 'resident-documents'
    AND EXISTS (
      SELECT 1 FROM public.resident_documents rd
       WHERE rd.storage_path = objects.name
         AND public.czero_resident_doc_visible(rd.unit_id, rd.uploaded_by)
    )
  );

-- Nessuna policy UPDATE su storage.objects per questo bucket.

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (il bucket si elimina solo se vuoto)
--   DROP POLICY IF EXISTS "resident-documents bucket: delete per riga visibile"       ON storage.objects;
--   DROP POLICY IF EXISTS "resident-documents bucket: lettura per riga visibile"      ON storage.objects;
--   DROP POLICY IF EXISTS "resident-documents bucket: upload nella cartella dell'unita" ON storage.objects;
--   DROP TABLE IF EXISTS public.resident_documents;
--   DROP FUNCTION IF EXISTS public.czero_resident_upload_path_ok(text);
--   DROP FUNCTION IF EXISTS public.czero_resident_doc_visible(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.czero_is_active_unit_member(uuid);
--   DROP FUNCTION IF EXISTS public.czero_unit_member_active(uuid, uuid);
--   DELETE FROM storage.buckets WHERE id = 'resident-documents';
-- ============================================================

-- ============================================================
-- VERIFICA (esito reale da riportare qui dopo l'applicazione, mai segnaposto)
-- (V1) 4 funzioni SECURITY DEFINER, search_path vuoto; EXECUTE:
--      czero_unit_member_active nessuno tra anon e authenticated,
--      le altre tre solo authenticated.
-- (V2) resident_documents: RLS attiva, 3 policy, grant authenticated
--      SELECT/INSERT/DELETE, anon nessuno, 0 righe.
-- (V3) bucket privato, 5 MB, 4 tipi.
-- (V4) 3 policy nuove su storage.objects; policy degli altri bucket
--      invariate (confronto del testo prima e dopo).
-- (V5) simulazioni in transazione con ROLLBACK:
--      membro attivo: INSERT riga e oggetto nella cartella della sua unita' OK;
--      path di un'altra unita', path malformato, doc_kind fuori lista,
--      size > 5 MB: rifiutati;
--      convivente: vede e puo' eliminare il documento dell'altro membro;
--      membro di altra unita', admin, super_admin: 0 righe, 0 oggetti, INSERT 42501;
--      chi ha caricato con ended_at valorizzato: riga sparisce per chi resta;
--      ex membro: 0 righe, INSERT 42501;
--      nuovo membro dopo una vendita: non vede i documenti del precedente;
--      UPDATE: rifiutato (nessun grant).
-- (V6) flusso reale via API Storage con il residente di prova: da fare
--      con l'interfaccia, non simulabile.
-- ============================================================

-- ============================================================
-- ESITO REALE (2026-11-13, versione DB 20261113201300) — PASS
-- Prima di applicare: nessuno dei 4 helper, nessuna tabella, nessun bucket,
-- nessuna policy omonima; czero_user_role() legge profiles.role di auth.uid().
-- (V1) PASS. 4 funzioni prosecdef = true, proconfig search_path="".
--      czero_unit_member_active: anon no, authenticated no
--        (acl postgres, service_role).
--      czero_is_active_unit_member, czero_resident_doc_visible,
--      czero_resident_upload_path_ok: anon no, authenticated si'
--        (acl postgres, authenticated, service_role).
-- (V2) PASS. relrowsecurity = true; 3 policy (SELECT, INSERT, DELETE), tutte
--      TO authenticated; grant authenticated DELETE, INSERT, SELECT; anon e
--      PUBLIC nessuno; service_role completo; 0 righe.
-- (V3) PASS. resident-documents: public = false, file_size_limit 5242880,
--      allowed_mime_types application/pdf, image/jpeg, image/png, image/webp.
-- (V4) PASS. 3 policy nuove su storage.objects (INSERT, SELECT, DELETE, TO
--      authenticated); pg_policies mostra `rd.storage_path = objects.name`.
--      Le altre 13 policy: md5 di nome|cmd|ruoli|qual|with_check
--      a2d0bf30340705c3d8b3f56a0af0522e prima e dopo. Totale 16.
-- (V5) PASS. Un solo blocco DO, 59 passi con SET LOCAL ROLE e
--      request.jwt.claims, chiuso da RAISE EXCEPTION: tutto annullato.
--      Attori: A residente 39f4264d… di "Appartamento furlan 1" (Santa
--      Giustina); B client 1f98f422… come convivente e poi vecchio
--      proprietario, N client b230c3f3… come nuovo membro, entrambi con righe
--      di unit_members create nel blocco; O client c4e9b911… (Tencarola);
--      admin 7a210c85…; super_admin 99b90ec5…. Vendita simulata su "Unità 2"
--      di Santa Giustina (senza membri).
--      membro attivo A: INSERT oggetto 1 riga, INSERT riga 1 riga, vede
--        1 riga e 1 oggetto;
--      oggetto nella cartella di un'altra unita': 42501; riga per un'altra
--        unita': 42501; riga della propria unita' con path di un'altra: 23514;
--      path malformati (nome libero, .exe, uuid maiuscolo, sottocartella,
--        cartella non uuid): 42501 tutti e cinque, nessun errore di cast;
--      doc_kind 'contratto': 23514; size 5242881: 23514;
--      uploaded_by di un altro membro: 42501;
--      UPDATE riga: 42501 permission denied; UPDATE oggetto: 0 righe;
--      czero_unit_member_active chiamata dal client: 42501;
--      convivente B: vede 1 riga e 1 oggetto; carica il suo (A ne vede 2 e 2);
--        elimina oggetto e riga di A, 1 e 1 (A resta con 1 e 1);
--      O, admin, super_admin: 0 righe, 0 oggetti, INSERT riga 42501, INSERT
--        oggetto 42501, DELETE 0 righe; anon: 42501 permission denied;
--      B con ended_at valorizzato: A passa da 2 righe e 2 oggetti a 1 e 1;
--      ex membro B: 0 righe, 0 oggetti, INSERT riga 42501, INSERT oggetto
--        42501, DELETE 0 righe;
--      vendita: B carica in "Unità 2" (1 e 1), esce, entra N: N vede 0 righe
--        e 0 oggetti, DELETE 0 righe, carica il suo e vede 1 e 1; senza RLS
--        le righe erano 4 e gli oggetti 4.
--      Dopo il rollback: 0 righe in resident_documents, 0 oggetti nel bucket,
--      unit_members 10 righe come prima.
-- (V6) NON eseguito: flusso reale via API Storage (createSignedUploadUrl,
--      uploadToSignedUrl, download, remove) con il residente di prova.
-- Il testo applicato via MCP e' quello di questo file dalla sezione 1 a
-- NOTIFY, senza intestazione e senza i blocchi ROLLBACK e VERIFICA.
-- ============================================================
