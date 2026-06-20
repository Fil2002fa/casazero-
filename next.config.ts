import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'kuvekkseclhhcamojysj.supabase.co' },
    ],
  },
}

export default nextConfig
