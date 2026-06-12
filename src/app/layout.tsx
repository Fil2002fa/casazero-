import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import PwaInit from '@/components/PwaInit'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'CasaZero',
    template: '%s · CasaZero',
  },
  description: 'Il libretto di manutenzione digitale della tua casa',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CasaZero',
  },
}

export const viewport: Viewport = {
  themeColor: '#04342C',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={inter.variable}>
      <body className="bg-background font-sans antialiased">
        <PwaInit />
        {children}
      </body>
    </html>
  )
}
