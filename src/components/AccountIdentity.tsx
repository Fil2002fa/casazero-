import { roleLabel } from '@/lib/roleLabel'
import type { UserRole } from '@/types/database'

// "Chi sono": nome, ruolo ed email dell'account in uso. Solo presentazione,
// nessun elemento interattivo: chi lo monta accanto a un logout lo mette come
// fratello, mai dentro (niente button annidati).
// L'email arriva dall'utente di sessione (auth.users), mai da profiles.
export function AccountIdentity({
  fullName,
  email,
  role,
  className = '',
}: {
  fullName: string | null
  email: string | null
  role: UserRole | string | null
  className?: string
}) {
  const name = fullName?.trim() || null
  const label = roleLabel(role)

  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-sm font-medium text-text-primary truncate">
        {name ?? email ?? 'Account senza nome'}
      </p>
      <p className="text-xs text-text-secondary truncate">
        {name && email ? `${label} · ${email}` : label}
      </p>
    </div>
  )
}
