import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BookOpen, LockKeyhole } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireProfile } from '@/lib/auth'
import type { CompletionMode } from '@/types/database'
import { formatRegisteredBy } from '@/lib/formatRegisteredBy'
import { FascicoloList, type FascicoloEntry } from './FascicoloList'
import { MaintenanceHeader } from '../manutenzioni/MaintenanceHeader'
import maintenanceStyles from '../manutenzioni/maintenance-v5.module.css'
import styles from './fascicolo.module.css'

export const metadata: Metadata = { title: 'Fascicolo' }

type CompletionRow = {
  id: string
  completed_at: string
  performed_by_name: string | null
  notes: string | null
  unit_id: string | null
  residence_id: string
  maintenance_items: {
    completion_mode: CompletionMode | null
    maintenance_templates: { title: string; category: string; completion_mode: CompletionMode | null; scope: string } | null
  } | null
  attachments: { id: string; file_name: string; storage_path: string; mime_type: string | null }[]
}

export default async function FascicoloPage() {
  const profile = await requireProfile()
  const adminClient = createServiceClient()

  // Shell (app) solo per il residente: (app)/layout.tsx:12 rimanda gli altri
  // ruoli a /admin. Ripetuto qui perché layout e pagina vengono renderizzati
  // in parallelo e la pagina usa il service client.
  if (profile.role !== 'client') redirect('/admin')

  const { data: mem, error: memError } = await adminClient
    .from('unit_members')
    .select('unit_id, units(id, residence_id, label, residences(name))')
    .eq('profile_id', profile.id)
    .is('ended_at', null)
    .limit(1)
    .maybeSingle()
  if (memError) {
    console.error('[fascicolo] lettura unit_members fallita', { profileId: profile.id, memError })
    return <FascicoloMessage text="Errore tecnico nel caricamento del fascicolo, riprova." />
  }
  const unitRow = mem?.units as unknown as {
    id: string; residence_id: string; label: string; residences: { name: string } | null
  } | null
  // Senza unità attiva nessuna query: col service client e senza filtro si
  // leggerebbero voci e completamenti di tutte le residenze.
  if (!unitRow) return <FascicoloMessage text="Nessuna unità collegata al tuo account." />
  const primaryUnitId      = unitRow.id
  const primaryResidenceId = unitRow.residence_id
  const reportHref = `/api/report?scope=unit&id=${primaryUnitId}`

  // ── Completions ──────────────────────────────────────────────────────────
  // Usa adminClient per evitare dipendenza da RLS e applicare esplicitamente
  // lo stesso perimetro usato per il PDF (residence_id + unit_id).
  // Si carica sempre lo scope "Tutti": Unità e Condominio sono una partizione
  // su unit_id e li filtra FascicoloList in memoria, senza tornare al server.
  const completionsQuery = adminClient
    .from('completions')
    .select(`
      id, completed_at, performed_by_name, notes, unit_id, residence_id,
      maintenance_items(
        completion_mode,
        maintenance_templates(title, category, completion_mode, scope)
      ),
      attachments(id, file_name, storage_path, mime_type)
    `)
    .eq('residence_id', primaryResidenceId)
    // La propria unità + parti condominiali
    .or(`unit_id.eq.${primaryUnitId},unit_id.is.null`)
    .order('completed_at', { ascending: false })

  const completionsRes = await completionsQuery
  if (completionsRes.error) {
    console.error('[fascicolo] lettura completamenti fallita', {
      residenceId: primaryResidenceId,
      unitId: primaryUnitId,
      completionsError: completionsRes.error,
    })
    return <FascicoloMessage text="Errore tecnico nel caricamento del fascicolo, riprova." />
  }
  const rawCompletions = completionsRes.data

  const completions = (rawCompletions ?? []) as unknown as CompletionRow[]

  // Date e anno calcolati qui sul server e passati come
  // valori già pronti: calcolarli nel client darebbe testo diverso fra Node e
  // Safari e un mismatch di hydration.
  const entries: FascicoloEntry[] = completions.map(c => {
    const tpl = c.maintenance_items?.maintenance_templates
    return {
      id: c.id,
      title: tpl?.title ?? 'Intervento',
      category: tpl?.category ?? null,
      isCondominium: c.unit_id === null,
      dateStr: new Date(c.completed_at).toLocaleDateString('it-IT', {
        day: 'numeric', month: 'long', year: 'numeric',
      }),
      year: new Date(c.completed_at).getFullYear(),
      performedByName: formatRegisteredBy(
        c.performed_by_name,
        c.maintenance_items?.completion_mode ?? null,
        tpl?.completion_mode ?? null,
      ),
      notes: c.notes,
      attachments: c.attachments.map(att => ({
        id: att.id,
        file_name: att.file_name,
        storage_path: att.storage_path,
        mime_type: att.mime_type,
      })),
    }
  })

  return (
    <div className={styles.page}>
      <MaintenanceHeader residenceName={unitRow.residences?.name ?? 'La tua residenza'} unitLabel={unitRow.label ?? ''} />
      <div className={maintenanceStyles.view}>
        <header>
          <p className={maintenanceStyles.eyebrow}>La memoria della tua casa</p>
          <h1 className={maintenanceStyles.pageTitle}>Fascicolo<span>.</span></h1>
          <p className={maintenanceStyles.lead}>Tutti gli interventi registrati nel tempo, per il tuo appartamento e per le parti comuni.</p>
        </header>
        <section className={styles.register} aria-label="Riepilogo del registro">
          <p className={styles.registerTop}><BookOpen size={14} aria-hidden="true" /> Il tuo registro degli interventi</p>
          <div className={styles.registerBody}>
            <div>
              <p className={styles.registerValue}>{String(entries.length).padStart(2, '0')}</p>
              <p className={styles.registerMeta}>{entries.length === 1 ? 'intervento conservato' : 'interventi conservati'}<br />nel fascicolo</p>
            </div>
            <span className={styles.seal}><LockKeyhole size={13} aria-hidden="true" /> Storico permanente</span>
          </div>
        </section>
        <FascicoloList entries={entries} reportHref={reportHref} />
        <p className={styles.archiveNote}><LockKeyhole size={17} aria-hidden="true" /><span>Le registrazioni fanno parte dello storico permanente della casa. Non possono essere modificate da questa schermata.</span></p>
      </div>
    </div>
  )
}

// Stato senza dati (nessuna unità attiva o errore di lettura): stessa testata
// della pagina, nessun dato mostrato.
function FascicoloMessage({ text }: { text: string }) {
  return (
    <div className={styles.page}>
      <div className={maintenanceStyles.view}>
      <header>
        <p className={maintenanceStyles.eyebrow}>La memoria della tua casa</p>
        <h1 className={maintenanceStyles.pageTitle}>Fascicolo<span>.</span></h1>
      </header>
      <p className={styles.empty} role="status">{text}</p>
      </div>
    </div>
  )
}
