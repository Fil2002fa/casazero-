import AdminSidebar, { MobileNav } from '@/components/AdminSidebar'
import { BuilderIdentityBar } from '@/components/BuilderIdentity'
import { getWhitelabelBrand } from '@/lib/whitelabel'
import { requireProfile } from '@/lib/auth'
import { CONTENT_GRID, CONTENT_RHYTHM } from '@/lib/layout'
import { ToastProvider } from '@/components/ui/Toast'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Senza profilo si torna al login, come fanno già le pagine via requireRole:
  // la shell non disegna mai la navigazione di un ruolo che l'utente non ha.
  const [{ brandDark, logoUrl, builderName }, profile] = await Promise.all([
    getWhitelabelBrand(),
    requireProfile(),
  ])

  const role = profile.role

  // Due stati soli.
  // Da lg in su: sidebar fissa e <main> che scorre accanto, dentro un contenitore
  // alto quanto il viewport (h-dvh e non h-screen: sul telefono 100vh include la
  // barra del browser).
  // Sotto lg: niente sidebar, navigazione nel drawer aperto dall'header, e scorre
  // il documento come nella PWA residente, non <main>. L'header resta attaccato in
  // alto perché l'hamburger non esca di vista sulle liste lunghe: è la stessa
  // barra, con il fondo e il bordo che ha già, nessuna ombra. Il main occupa tutto
  // il viewport, quindi i breakpoint delle pagine misurano davvero il contenuto.
  // Nessuna protezione contro lo scroll orizzontale: se compare, è una rottura
  // da correggere nel componente, non da nascondere.
  return (
    <div
      className="bg-background lg:flex lg:h-dvh lg:overflow-hidden"
      style={{ '--wl-brand-dark': brandDark } as React.CSSProperties}
    >
      {/* Toast della dashboard: provider annidato con la posizione di questa shell,
          che non ha BottomNav. Non aggiunge nodi al DOM: sidebar e main restano
          figli diretti del contenitore flex. */}
      <ToastProvider placement="dashboard">
        <AdminSidebar role={role} />

        <main className="lg:flex-1 lg:overflow-auto">
          {/* Identità costruttore — CasaZero resta il marchio della sidebar (BrandMark) */}
          <BuilderIdentityBar
            name={builderName}
            logoSrc={logoUrl}
            leading={<MobileNav role={role} />}
            className="sticky top-0 z-sticky lg:static lg:z-auto"
          />

          {/* Container unico del contenuto: le pagine non dichiarano più padding né
              larghezza proprie, li prendono da qui (src/lib/layout.ts). */}
          <div className={`${CONTENT_GRID} ${CONTENT_RHYTHM}`}>
            {children}
          </div>
        </main>
      </ToastProvider>
    </div>
  )
}
