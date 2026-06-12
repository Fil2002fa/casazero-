import Link from 'next/link'

export default function AuthErrorPage() {
  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-4">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-semantic-red-bg mb-2">
          <span className="text-semantic-red text-xl">!</span>
        </div>
        <h1 className="text-xl font-medium text-text-primary">Accesso non riuscito</h1>
        <p className="text-sm text-text-secondary max-w-xs">
          Il link potrebbe essere scaduto o già usato. Riprova.
        </p>
        <Link
          href="/auth/login"
          className="inline-block mt-2 px-6 py-2 bg-brand-dark text-brand-light rounded-lg text-sm font-medium hover:bg-brand-medium transition-colors"
        >
          Torna al login
        </Link>
      </div>
    </div>
  )
}
