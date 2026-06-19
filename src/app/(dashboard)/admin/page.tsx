import { requireRole } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function AdminRootPage() {
  const profile = await requireRole(['admin', 'super_admin'])

  if (profile.role === 'super_admin') redirect('/admin/residences')
  redirect('/admin/manutenzioni')
}
