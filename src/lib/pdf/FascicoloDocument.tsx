import React from 'react'
import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import { formatUnitLabel } from '@/lib/formatUnitLabel'
import { pluralize } from '@/lib/pluralize'

// ── Palette C (stessa di ReportDocument.tsx) ──────────────────────────────────
const C = {
  brandDark:     '#04342C',
  brandLight:    '#E1F5EE',
  bgWarm:        '#F4F3EF',
  border:        '#E4E6E2',
  textPrimary:   '#20302A',
  textSecondary: '#6B7280',
  white:         '#FFFFFF',
}

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.textPrimary,
    backgroundColor: C.white,
    paddingBottom: 40,
  },
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
  eyebrow: {
    color: '#9FE1CB',
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  title: {
    color: C.white,
    fontSize: 17,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  subtitle: {
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
  body: {
    paddingHorizontal: 32,
    paddingTop: 18,
  },
  countLine: {
    fontSize: 8.5,
    color: C.textSecondary,
    marginBottom: 14,
  },

  // Tabella
  table: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: C.border,
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomStyle: 'solid',
    borderBottomColor: C.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  headRow: {
    backgroundColor: C.bgWarm,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headCell: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cellData: { width: '14%', fontSize: 7.5, color: C.textSecondary },
  cellVoce: { width: '38%', fontSize: 8, color: C.textPrimary, fontFamily: 'Helvetica-Bold', paddingRight: 6 },
  cellUnita: { width: '18%', fontSize: 7.5, color: C.textSecondary },
  cellRegistrato: { width: '22%', fontSize: 7.5, color: C.textSecondary },
  cellAllegato: { width: '8%', fontSize: 8, textAlign: 'right' },

  empty: {
    fontSize: 8.5,
    color: C.textSecondary,
    backgroundColor: C.bgWarm,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

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
  footerText: { fontSize: 6, color: C.textSecondary },
  footerBrand: { fontSize: 6, color: '#0F6E56', fontFamily: 'Helvetica-Bold' },
})

export type FascicoloRow = {
  completed_at: string
  title: string
  unit_label: string | null // null = condominio
  performed_by_name: string | null
  has_attachment: boolean
}

export type FascicoloData = {
  residenceName: string
  generatedAt: string
  rows: FascicoloRow[]
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function FascicoloDocument(data: FascicoloData) {
  return (
    <Document title={`Fascicolo — ${data.residenceName}`} author="CasaZero" creator="CasaZero">
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <View style={S.headerRow}>
            <View>
              <Text style={S.eyebrow}>CasaZero</Text>
              <Text style={S.title}>Fascicolo dell&apos;immobile</Text>
              <Text style={S.subtitle}>{data.residenceName}</Text>
            </View>
            <View style={S.headerRight}>
              <Text style={S.generatedLabel}>Generato il</Text>
              <Text style={S.generatedDate}>{data.generatedAt}</Text>
            </View>
          </View>
        </View>

        <View style={S.body}>
          <Text style={S.countLine}>
            {pluralize(data.rows.length, 'completamento registrato', 'completamenti registrati')}
          </Text>

          {data.rows.length === 0 ? (
            <Text style={S.empty}>Nessun completamento registrato.</Text>
          ) : (
            <View style={S.table}>
              <View style={[S.row, S.headRow]}>
                <Text style={[S.cellData, S.headCell]}>Data</Text>
                <Text style={[S.cellVoce, S.headCell]}>Voce</Text>
                <Text style={[S.cellUnita, S.headCell]}>Unità</Text>
                <Text style={[S.cellRegistrato, S.headCell]}>Registrato da</Text>
                <Text style={[S.cellAllegato, S.headCell]}> </Text>
              </View>
              {data.rows.map((r, i) => (
                <View
                  key={i}
                  style={i === data.rows.length - 1 ? [S.row, S.rowLast] : S.row}
                  wrap={false}
                >
                  <Text style={S.cellData}>{fmtDate(r.completed_at)}</Text>
                  <Text style={S.cellVoce}>{r.title}</Text>
                  <Text style={S.cellUnita}>{r.unit_label ? formatUnitLabel(r.unit_label) : 'Condominio'}</Text>
                  <Text style={S.cellRegistrato}>{r.performed_by_name ?? '—'}</Text>
                  <Text style={S.cellAllegato}>{r.has_attachment ? '📎' : ''}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

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
