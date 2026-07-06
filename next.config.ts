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
  },
}

export default nextConfig
