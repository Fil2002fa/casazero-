import React from 'react'
import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import { formatUnitLabel } from '@/lib/formatUnitLabel'

// ── Palette C ────────────────────────────────────────────────────────────────
const C = {
  brandDark:   '#04342C',
  brandMedium: '#0F6E56',
  brandLight:  '#E1F5EE',
  bgWarm:      '#F4F3EF',
  border:      '#E4E6E2',
  textPrimary: '#20302A',
  textSecondary: '#6B7280',
  red:         '#A32D2D',
  redBg:       '#FCEBEB',
  amber:       '#854F0B',
  blue:        '#185FA5',
  blueBg:      '#E6F1FB',
  white:       '#FFFFFF',
}

const S = StyleSheet.create({
  // Page
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.textPrimary,
    backgroundColor: C.white,
    paddingBottom: 52,
  },

  // Header band
  header: {
    backgroundColor: C.brandDark,
    paddingHorizontal: 32,
    paddingTop: 22,
    paddingBottom: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  builderTag: {
    color: '#9FE1CB',
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  reportTitle: {
    color: C.white,
    fontSize: 17,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  reportSubtitle: {
    color: '#9FE1CB',
    fontSize: 9,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  generatedLabel: {
    color: '#9FE1CB',
    fontSize: 7,
    marginBottom: 2,
  },
  generatedDate: {
    color: C.white,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },

  // Body
  body: {
    paddingHorizontal: 32,
    paddingTop: 20,
  },

  // Info strip
  infoStrip: {
    flexDirection: 'row',
    backgroundColor: C.bgWarm,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
    gap: 16,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 6.5,
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: C.textPrimary,
  },

  // Conformità
  conformitaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: C.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: 22,
    gap: 14,
  },
  conformitaLeft: {
    alignItems: 'center',
    minWidth: 64,
  },
  conformitaNumber: {
    fontSize: 30,
    fontFamily: 'Helvetica-Bold',
  },
  conformitaSubLabel: {
    fontSize: 6.5,
    color: C.textSecondary,
    marginTop: 1,
    textAlign: 'center',
  },
  conformitaRight: {
    flex: 1,
  },
  barTrack: {
    height: 6,
    backgroundColor: C.bgWarm,
    borderRadius: 3,
    marginBottom: 5,
    width: '100%',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  conformitaDetail: {
    fontSize: 7.5,
    color: C.textSecondary,
  },
  conformitaDetailBold: {
    fontFamily: 'Helvetica-Bold',
    color: C.textPrimary,
  },

  // Section heading
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.brandDark,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: C.brandLight,
  },
  sectionEmpty: {
    fontSize: 8,
    color: C.textSecondary,
    backgroundColor: C.bgWarm,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
  },

  // Completion entry
  completionEntry: {
    flexDirection: 'row',
    marginBottom: 7,
    paddingBottom: 7,
    borderBottomWidth: 0.5,
    borderBottomStyle: 'solid',
    borderBottomColor: C.border,
  },
  completionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 2,
    marginRight: 8,
    flexShrink: 0,
  },
  completionBody: {
    flex: 1,
  },
  completionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 1,
  },
  completionTitle: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: C.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  completionDate: {
    fontSize: 7.5,
    color: C.textSecondary,
    flexShrink: 0,
  },
  completionMeta: {
    fontSize: 7.5,
    color: C.textSecondary,
    marginBottom: 1,
  },
  completionNotes: {
    fontSize: 7.5,
    color: C.textSecondary,
    fontStyle: 'italic',
  },
  scopeBadge: {
    fontSize: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginLeft: 4,
  },

  // Year divider
  yearDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
    gap: 6,
  },
  yearLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: C.border,
  },
  yearLabel: {
    fontSize: 7,
    color: C.textSecondary,
    fontFamily: 'Helvetica-Bold',
  },

  // Overdue entry
  overdueEntry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 3,
    gap: 8,
  },
  overdueTitle: {
    flex: 1,
    fontSize: 8.5,
    color: C.textPrimary,
  },
  overdueDate: {
    fontSize: 7.5,
    flexShrink: 0,
  },
  priorityBadge: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    flexShrink: 0,
    marginTop: 0.5,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopStyle: 'solid',
    borderTopColor: C.border,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 6,
    color: C.textSecondary,
  },
  footerBrand: {
    fontSize: 6,
    color: C.brandMedium,
    fontFamily: 'Helvetica-Bold',
  },
})

// ── Types ─────────────────────────────────────────────────────────────────────
export type CompletionEntry = {
  completed_at: string
  title: string
  category: string
  priority: 'N1' | 'N2' | 'N3'
  is_condominium: boolean
  performed_by_name: string | null
  notes: string | null
  attachment_count: number
}

export type OverdueEntry = {
  title: string
  priority: 'N1' | 'N2' | 'N3'
  next_due_date: string
}

export type ReportData = {
  scope: 'unit' | 'residence'
  unitLabel: string | null
  residenceName: string
  residenceAddress: string | null
  energyClass: string | null
  deliveryDate: string | null
  builderName: string
  builderColor: string
  generatedAt: string
  conformita: number
  n2n3Total: number
  n2n3Ok: number
  completions: CompletionEntry[]
  overdueItems: OverdueEntry[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function conformitaColor(pct: number) {
  if (pct >= 80) return C.brandMedium
  if (pct >= 60) return C.amber
  return C.red
}

function priorityStyle(p: 'N1' | 'N2' | 'N3') {
  if (p === 'N2') return { color: C.blue,        backgroundColor: C.blueBg }
  if (p === 'N3') return { color: C.brandMedium,  backgroundColor: C.brandLight }
  return           { color: C.textSecondary,  backgroundColor: C.bgWarm }
}

function dotColor(p: 'N1' | 'N2' | 'N3') {
  if (p === 'N2') return C.blue
  if (p === 'N3') return C.brandMedium
  return C.textSecondary
}

// ── Document ─────────────────────────────────────────────────────────────────
export function ReportDocument(data: ReportData) {
  const color = conformitaColor(data.conformita)
  const thisYear = new Date().getFullYear()

  const scopeTitle = data.scope === 'unit' && data.unitLabel
    ? `${formatUnitLabel(data.unitLabel)} — ${data.residenceName}`
    : data.residenceName

  // Group completions by year
  const byYear: Record<number, CompletionEntry[]> = {}
  for (const c of data.completions) {
    const y = new Date(c.completed_at).getFullYear()
    if (!byYear[y]) byYear[y] = []
    byYear[y].push(c)
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a)

  return (
    <Document
      title={`Fascicolo — ${scopeTitle}`}
      author="CasaZero"
      creator="CasaZero"
    >
      <Page size="A4" style={S.page}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={S.header}>
          <View style={S.headerRow}>
            <View>
              <Text style={S.builderTag}>{data.builderName}</Text>
              <Text style={S.reportTitle}>Fascicolo dell&apos;immobile</Text>
              <Text style={S.reportSubtitle}>{scopeTitle}</Text>
            </View>
            <View style={S.headerRight}>
              <Text style={S.generatedLabel}>Generato il</Text>
              <Text style={S.generatedDate}>{data.generatedAt}</Text>
            </View>
          </View>
        </View>

        <View style={S.body}>

          {/* ── Info strip ───────────────────────────────────────────── */}
          <View style={S.infoStrip}>
            <View style={S.infoItem}>
              <Text style={S.infoLabel}>Residenza</Text>
              <Text style={S.infoValue}>{data.residenceName}</Text>
              {data.residenceAddress && (
                <Text style={{ ...S.infoLabel, marginTop: 1, textTransform: 'none' }}>
                  {data.residenceAddress}
                </Text>
              )}
            </View>
            {data.unitLabel && (
              <View style={S.infoItem}>
                <Text style={S.infoLabel}>Unità</Text>
                <Text style={S.infoValue}>{formatUnitLabel(data.unitLabel!)}</Text>
              </View>
            )}
            {data.energyClass && (
              <View style={S.infoItem}>
                <Text style={S.infoLabel}>Classe energetica</Text>
                <Text style={S.infoValue}>{data.energyClass}</Text>
              </View>
            )}
            {data.deliveryDate && (
              <View style={S.infoItem}>
                <Text style={S.infoLabel}>Data consegna</Text>
                <Text style={S.infoValue}>{fmtDate(data.deliveryDate)}</Text>
              </View>
            )}
          </View>

          {/* ── Conformità ───────────────────────────────────────────── */}
          <Text style={S.sectionTitle}>Conformità</Text>
          <View style={S.conformitaBox}>
            <View style={S.conformitaLeft}>
              <Text style={{ ...S.conformitaNumber, color }}>
                {data.conformita}%
              </Text>
              <Text style={S.conformitaSubLabel}>in regola</Text>
            </View>
            <View style={S.conformitaRight}>
              <View style={S.barTrack}>
                <View
                  style={{
                    ...S.barFill,
                    backgroundColor: color,
                    width: `${data.conformita}%`,
                  }}
                />
              </View>
              <Text style={S.conformitaDetail}>
                <Text style={S.conformitaDetailBold}>{data.n2n3Ok}</Text>
                {' manutenzioni N2/N3 in regola su '}
                <Text style={S.conformitaDetailBold}>{data.n2n3Total}</Text>
                {' totali — Anno '}
                <Text style={S.conformitaDetailBold}>{thisYear}</Text>
              </Text>
            </View>
          </View>

          {/* ── Interventi completati ─────────────────────────────────── */}
          <Text style={S.sectionTitle}>
            Interventi completati ({data.completions.length})
          </Text>

          {data.completions.length === 0 ? (
            <Text style={S.sectionEmpty}>Nessun intervento completato registrato.</Text>
          ) : (
            <View style={{ marginBottom: 22 }}>
              {years.map(year => (
                <View key={year} wrap={false}>
                  <View style={S.yearDivider}>
                    <View style={S.yearLine} />
                    <Text style={S.yearLabel}>{year}</Text>
                    <View style={S.yearLine} />
                  </View>
                  {byYear[year].map((c, i) => (
                    <View key={i} style={S.completionEntry} wrap={false}>
                      <View
                        style={{
                          ...S.completionDot,
                          backgroundColor: dotColor(c.priority),
                        }}
                      />
                      <View style={S.completionBody}>
                        <View style={S.completionTopRow}>
                          <Text style={S.completionTitle}>{c.title}</Text>
                          <Text style={S.completionDate}>{fmtDate(c.completed_at)}</Text>
                        </View>
                        <Text style={S.completionMeta}>
                          {c.category}
                          {c.performed_by_name ? ` · Eseguito da: ${c.performed_by_name}` : ''}
                          {c.is_condominium ? ' · [Condominio]' : ' · [Unità]'}
                          {c.attachment_count > 0 ? ` · 📎 ${c.attachment_count} allegat${c.attachment_count === 1 ? 'o' : 'i'}` : ''}
                        </Text>
                        {c.notes && (
                          <Text style={S.completionNotes}>{c.notes}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* ── Voci scadute ─────────────────────────────────────────── */}
          {data.overdueItems.length > 0 && (
            <>
              <Text style={S.sectionTitle}>
                Voci scadute non eseguite ({data.overdueItems.length})
              </Text>
              <View style={{ marginBottom: 20 }}>
                {data.overdueItems.map((item, i) => {
                  const ps = priorityStyle(item.priority)
                  const isAlt = i % 2 === 1
                  return (
                    <View
                      key={i}
                      style={{
                        ...S.overdueEntry,
                        backgroundColor: isAlt ? C.bgWarm : C.white,
                      }}
                      wrap={false}
                    >
                      <Text style={{ ...S.priorityBadge, ...ps }}>
                        {item.priority}
                      </Text>
                      <Text style={S.overdueTitle}>{item.title}</Text>
                      <Text style={{ ...S.overdueDate, color: C.red }}>
                        Scaduta il {fmtDate(item.next_due_date)}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </>
          )}

        </View>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>
            Documento generato automaticamente — registro permanente non modificabile.
          </Text>
          <Text style={S.footerBrand}>CasaZero</Text>
        </View>

      </Page>
    </Document>
  )
}
