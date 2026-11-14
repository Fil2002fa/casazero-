import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'kuvekkseclhhcamojysj.supabase.co' },
    ],
  },
  experimental: {
    // Allinea il limite body delle Server Actions al bucket residence-photos (5 MB):
    // il default di 1 MB bloccava le foto 1-5MB prima che raggiungessero lo storage.
    serverActions: {
      bodySizeLimit: '5mb',
    },
    // Cache del router client per le pagine dinamiche: tornando entro 30 s su
    // una pagina già visitata non parte una nuova richiesta RSC. Ogni server
    // action con revalidatePath o cookie modificati (logout, invito) la
    // svuota per intero; le scritture di altri utenti si vedono entro 30 s.
    staleTimes: {
      dynamic: 30,
    },
  },
}

export default nextConfig
