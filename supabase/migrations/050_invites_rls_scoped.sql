-- 050 — invites: RLS coerente con il builder e senza ruolo super_admin (A5, B23).
--
-- Problema (provato sul DB il 05/11/2026 con una simulazione rolled back): le policy
-- "invites: super_admin full" e "invites: super_admin gestisce" collegano residence_id
-- e unit_id con un OR e non vincolano `role`. Un super_admin del builder A può inserire
-- un invito {residence_id: sua residenza, unit_id: unità del builder B, role: super_admin}.
-- Il commit a161d4a chiude il percorso in accept-invite.ts; questa migrazione lo chiude
-- anche nel DB.
--
-- Effetto: più restrittivo, mai più permissivo. Nessun dato viene toccato.
-- Ordine: prima si creano le policy nuove, poi si tolgono le vecchie, così non c'è
-- nessun istante senza accesso per i casi legittimi (le policy permissive si sommano in OR).

-- 1. super_admin: tutto ciò che tocca un invito sta nel proprio builder.
--    Con unit_id l'unità deve stare in una residenza del proprio builder e, se
--    residence_id c'è, coincidere con quella. In scrittura il ruolo è solo client o admin.
create policy "invites: super_admin nel proprio builder"
  on public.invites
  for all
  to public
  using (
    czero_user_role() = 'super_admin'
    and exists (
      select 1 from public.residences r
      where r.builder_id = czero_user_builder_id()
        and (
          (invites.unit_id is null and invites.residence_id = r.id)
          or (
            invites.unit_id is not null
            and exists (
              select 1 from public.units u
              where u.id = invites.unit_id
                and u.residence_id = r.id
                and (invites.residence_id is null or invites.residence_id = r.id)
            )
          )
        )
    )
  )
  with check (
    czero_user_role() = 'super_admin'
    and invites.role in ('client', 'admin')
    and exists (
      select 1 from public.residences r
      where r.builder_id = czero_user_builder_id()
        and (
          (invites.unit_id is null and invites.residence_id = r.id)
          or (
            invites.unit_id is not null
            and exists (
              select 1 from public.units u
              where u.id = invites.unit_id
                and u.residence_id = r.id
                and (invites.residence_id is null or invites.residence_id = r.id)
            )
          )
        )
    )
  );

-- 2. admin (condominio): può inserire solo inviti client; se c'è unit_id,
--    l'unità deve stare nella residenza dell'invito (prima non era controllato).
create policy "invites: admin inserisce client coerenti"
  on public.invites
  for insert
  to public
  with check (
    czero_user_role() = 'admin'
    and invites.role = 'client'
    and czero_can_access_residence(invites.residence_id)
    and (
      invites.unit_id is null
      or exists (
        select 1 from public.units u
        where u.id = invites.unit_id
          and u.residence_id = invites.residence_id
      )
    )
  );

-- 3. Si tolgono le tre policy sostituite (le altre due dell'admin, lettura e delete,
--    restano invariate).
drop policy if exists "invites: super_admin full" on public.invites;
drop policy if exists "invites: super_admin gestisce" on public.invites;
drop policy if exists "invites: admin can insert for assigned" on public.invites;
