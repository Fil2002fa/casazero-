# Ripristino prova "In attesa di consegna" (2026-11-11)

Profilo: pippoloro02+residente (c4e9b911-724b-4c63-bcda-1ac84be55f1a)

Stato modificato:
- riga Tencarola Unità 3 (15a6c572-4aad-427d-9a6b-5963be32cf77): ended_at = now() (era NULL)
- riga nuova TEST wizard A (43d6ff1a-a80b-48de-9ba9-8e8be5e55cde), unità 1ea79e94-a5f2-447a-8d82-1703aa5f45a3

## Ripristino (un solo statement)

```sql
with closed as (
  update unit_members set ended_at = now()
  where id = '43d6ff1a-a80b-48de-9ba9-8e8be5e55cde' and ended_at is null
  returning id
)
update unit_members set ended_at = null
where id = '15a6c572-4aad-427d-9a6b-5963be32cf77'
returning id, unit_id, ended_at;
```

Verifica: una sola membership attiva (Tencarola Unità 3).

```sql
select um.id, un.label, um.ended_at from unit_members um join units un on un.id=um.unit_id
where um.profile_id='c4e9b911-724b-4c63-bcda-1ac84be55f1a' order by um.created_at;
```
