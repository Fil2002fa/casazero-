import { requireRole } from '@/lib/auth'

// La pagina del wizard è un componente client e non può chiamare requireRole:
// il controllo di ruolo vive qui, prima che il wizard venga servito. Senza,
// un admin che apre l'URL vede il wizard e scopre il divieto solo all'invio
// (new/actions.ts). Stesso fallback delle altre pagine solo super_admin.
export default async function NewResidenceLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['super_admin'], '/admin/manutenzioni')
  return children
}
