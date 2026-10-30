import Link from 'next/link'
import { AccountIdentity } from '@/components/AccountIdentity'
import { buttonVariants } from '@/components/ui/Button'
import { signOut } from '@/app/auth/actions'
import { homePathForRole } from '@/lib/auth'
import type { UserRole } from '@/types/database'

// Sessione gia' aperta su una pagina di accesso (errore di login, form di
// login): la si dichiara sempre, con le due uscite esplicite. Mai proseguire
// in silenzio con l'account precedente.
// `returnTo`: dove riporta il logout (il login, eventualmente con invito o
// deep link da conservare).
export function ActiveSessionPanel({
  fullName,
  email,
  role,
  returnTo = '/auth/login',
}: {
  fullName: string | null
  email: string | null
  role: UserRole | null
  returnTo?: string
}) {
  const name = fullName?.trim() || email || 'questo account'

  return (
    <div className="bg-surface rounded-xl border border-border p-5 space-y-4 text-left">
      <div className="space-y-2">
        <p className="text-xs text-text-secondary">Sei ancora connesso come</p>
        <AccountIdentity fullName={fullName} email={email} role={role} />
      </div>

      <div className="space-y-2">
        <Link href={homePathForRole(role)} className={buttonVariants('primary', 'default', 'w-full')}>
          Continua come {name}
        </Link>
        <form action={signOut.bind(null, returnTo)}>
          <button type="submit" className={buttonVariants('secondary', 'default', 'w-full')}>
            Esci e accedi con un altro account
          </button>
        </form>
      </div>
    </div>
  )
}
