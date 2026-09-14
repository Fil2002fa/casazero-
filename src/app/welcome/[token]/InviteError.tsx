import Link from 'next/link'

export function InviteError({ message, loginHref = '/auth/login' }: { message: string; loginHref?: string }) {
  return (
    <div className="min-h-svh bg-[#F4F3EF] flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 bg-[#FCEBEB] rounded-full flex items-center justify-center mx-auto">
          <span className="text-2xl font-medium text-[#A32D2D]">!</span>
        </div>
        <h1 className="text-lg font-medium text-[#20302A]">Invito non disponibile</h1>
        <p className="text-sm text-[#20302A]/60">{message}</p>
        <Link
          href={loginHref}
          className="inline-block px-6 py-3 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: '#04342C' }}
        >
          Vai al login
        </Link>
      </div>
    </div>
  )
}
