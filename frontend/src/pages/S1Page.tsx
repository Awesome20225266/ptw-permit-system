// src/pages/S1Page.tsx — S1 Permit Receiver (v2: universal filter)

import React, { useState, useMemo, useEffect, useRef } from 'react'
import Select from 'react-select'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { permitApi, metaApi, downloadBlob } from '@/lib/api'
import { keys } from '@/hooks/useQueryKeys'
import { ptw_status_variant, ptw_status_label, fmtDate, fmtDateTime } from '@/lib/utils'
import { Badge, Button, Card, EmptyState, ErrorBanner, Spinner, Modal } from '@/components/ui'
import {
  HazardsSection, RisksSection, PPESection, PrecautionsSection,
  AssociatedPermitsSection, ToolsSection, IssuerChecklistSection,
  UndertakingSection, PeopleSection,
} from './PermitFormParts'
import type { PTWFormData } from './permitTypes'
import type { WorkOrder, WorkOrderKpis, PTWRequest } from '@/types'
import { useLang, useViewMode, tl } from '@/store/languageStore'
import { useUser } from '@/store/authStore'
import { cn } from '@/lib/utils'

// Today's date as YYYY-MM-DD
const todayStr = new Date().toISOString().split('T')[0]

// ─────────────────────────────────────────────────────────────────────────────
// Status meta + badge
// ─────────────────────────────────────────────────────────────────────────────

const WO_STATUS_META: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  OPEN:           { label: 'Open',           bg: 'bg-sky-100',    text: 'text-sky-700',    dot: 'bg-sky-500' },
  PENDING_S2:     { label: 'Pending S2',     bg: 'bg-orange-100', text: 'text-orange-600', dot: 'bg-orange-500' },
  PENDING_S3:     { label: 'Pending S3',     bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-600' },
  APPROVED:       { label: 'Approved',       bg: 'bg-lime-100',   text: 'text-lime-700',   dot: 'bg-lime-500' },
  CLOSED:         { label: 'Closed',         bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
  PERMIT_EXPIRED: { label: 'Permit Expired', bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
  REJECTED:       { label: 'Rejected',       bg: 'bg-rose-100',   text: 'text-rose-700',   dot: 'bg-rose-500' },
}

function WOStatusBadge({ status }: { status: string }) {
  const meta = WO_STATUS_META[status] ?? { label: status, bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${meta.bg} ${meta.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_KPIS: WorkOrderKpis = { total: 0, open: 0, pending_s2: 0, pending_s3: 0, approved: 0, closed: 0, expired: 0 }

function KpiCard({ label, value, icon, bg, text, border, sublabel }: {
  label: string; value: number; icon: string; bg: string; text: string; border: string; sublabel?: string
}) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl px-4 py-3 border ${bg} ${border} flex-1 min-w-[90px]`}>
      <div className="flex items-center justify-between">
        <span className="text-lg leading-none">{icon}</span>
        <span className={`text-2xl font-extrabold ${text}`}>{value}</span>
      </div>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${text} opacity-80`}>{label}</p>
      {sublabel && (
        <p className={`text-[9px] font-normal ${text} opacity-60 -mt-0.5`}>* {sublabel}</p>
      )}
    </div>
  )
}

function KpiSummary({ kpis, loading }: { kpis: WorkOrderKpis; loading: boolean }) {
  if (loading) return <div className="flex justify-center py-4"><Spinner /></div>
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-stretch">
      <KpiCard label="Total"      value={kpis.total}      icon="📋" bg="bg-slate-50"  text="text-slate-700"  border="border-slate-200" />
      <KpiCard label="Open"       value={kpis.open}       icon="🔵" bg="bg-sky-50"    text="text-sky-700"    border="border-sky-200"   sublabel="PTW not initiated" />
      <KpiCard label="Pending S2" value={kpis.pending_s2} icon="🟠" bg="bg-orange-50" text="text-orange-600" border="border-orange-200"/>
      <KpiCard label="Pending S3" value={kpis.pending_s3} icon="🟡" bg="bg-amber-50"  text="text-amber-700"  border="border-amber-200" />
      <KpiCard label="Approved"   value={kpis.approved}   icon="🟢" bg="bg-lime-50"   text="text-lime-700"   border="border-lime-200"  />
      <KpiCard label="Expired"    value={kpis.expired}    icon="🔴" bg="bg-red-50"    text="text-red-700"    border="border-red-200"   />
      <KpiCard label="Closed ✓"   value={kpis.closed}     icon="✅" bg="bg-green-50"  text="text-green-700"  border="border-green-200" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Permit-number helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildPermitNo(ids: string[]): string {
  const nums = ids.map((id) => { const m = id.match(/(\d+)$/); return m ? String(parseInt(m[1], 10)) : id })
  return `PTW-${nums.join('/')}`
}
function buildWODisplay(ids: string[]): string {
  const nums = ids.map((id) => { const m = id.match(/(\d+)$/); return m ? String(parseInt(m[1], 10)) : id })
  return `WO-${nums.join('/')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// react-select custom styles
// ─────────────────────────────────────────────────────────────────────────────

const selectStyles = {
  control: (base: object, state: { isFocused: boolean }) => ({
    ...base,
    borderColor: state.isFocused ? '#ffb300' : '#e2e8f0',
    boxShadow: state.isFocused ? '0 0 0 2px rgba(255,179,0,0.25)' : 'none',
    borderRadius: '0.5rem', minHeight: '38px', fontSize: '13px',
    '&:hover': { borderColor: '#ffb300' },
  }),
  option: (base: object, state: { isSelected: boolean; isFocused: boolean }) => ({
    ...base, fontSize: '13px',
    backgroundColor: state.isSelected ? '#ffb300' : state.isFocused ? '#fff8e1' : 'white',
    color: state.isSelected ? '#1a202c' : '#374151',
  }),
  multiValue: (base: object) => ({ ...base, backgroundColor: '#fff8e1', borderRadius: '0.375rem' }),
  multiValueLabel: (base: object) => ({ ...base, color: '#92400e', fontSize: '12px', fontWeight: 600 }),
  multiValueRemove: (base: object) => ({ ...base, color: '#92400e', '&:hover': { backgroundColor: '#fde68a', color: '#7c2d12' } }),
}

// ─────────────────────────────────────────────────────────────────────────────
// PaginatedTable — Excel-style column filters + pagination
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 11

interface ColDef {
  key: string
  label: string
  render?: (row: Record<string, unknown>) => React.ReactNode
  filterable?: boolean
  wrap?: boolean
  width?: string
}

function PaginatedTable({
  cols,
  rows,
  pageSize = PAGE_SIZE,
  emptyMsg = 'No data found.',
  loading = false,
}: {
  cols: ColDef[]
  rows: Record<string, unknown>[]
  pageSize?: number
  emptyMsg?: string
  loading?: boolean
}) {
  const [page, setPage] = useState(1)
  const [colFilters, setColFilters] = useState<Record<string, string>>({})

  const setFilter = (key: string, val: string) => {
    setColFilters((f) => ({ ...f, [key]: val }))
    setPage(1)
  }

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        cols.every(({ key, filterable = true }) => {
          if (!filterable) return true
          const f = (colFilters[key] ?? '').toLowerCase().trim()
          if (!f) return true
          return String(row[key] ?? '').toLowerCase().includes(f)
        }),
      ),
    [rows, colFilters, cols],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              {cols.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className="px-3 py-2 text-left font-semibold text-slate-600 align-top"
                >
                  <div className="text-[11px] uppercase tracking-wide mb-1 whitespace-nowrap">{col.label}</div>
                  {col.filterable !== false && (
                    <input
                      type="text"
                      className="w-full text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-white font-normal outline-none focus:border-amber-400 transition-colors"
                      placeholder="Filter…"
                      value={colFilters[col.key] ?? ''}
                      onChange={(e) => setFilter(col.key, e.target.value)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={cols.length} className="text-center py-10">
                  <Spinner size="lg" />
                </td>
              </tr>
            ) : slice.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="text-center py-10 text-sm text-surface-muted">
                  {emptyMsg}
                </td>
              </tr>
            ) : (
              slice.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-100 hover:bg-amber-50/40 transition-colors"
                >
                  {cols.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 text-sm ${col.wrap ? 'break-words' : 'whitespace-nowrap'}`}
                    >
                      {col.render ? col.render(row) : (String(row[col.key] ?? '') || '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-200 text-xs">
          <span className="text-surface-muted">
            Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:border-amber-300 transition-colors"
            >
              ‹
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p = i + 1
              if (totalPages > 7) {
                if (safePage <= 4) p = i + 1
                else if (safePage >= totalPages - 3) p = totalPages - 6 + i
                else p = safePage - 3 + i
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded border text-xs font-medium transition-colors ${
                    p === safePage
                      ? 'bg-amber-400 border-amber-400 text-navy-900 font-bold'
                      : 'border-slate-200 text-slate-600 hover:border-amber-300'
                  }`}
                >
                  {p}
                </button>
              )
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:border-amber-300 transition-colors"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Universal filter props shared by all tabs
// ─────────────────────────────────────────────────────────────────────────────

interface FilterProps {
  filterSite: string
  filterStart: string
  filterEnd: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Work Orders tab — driven by universal filter
// ─────────────────────────────────────────────────────────────────────────────

function WorkOrdersTab({
  workOrders,
  loading,
  filterSite,
  ptws,
}: {
  workOrders: WorkOrder[]
  loading: boolean
  filterSite: string
  ptws: PTWRequest[]
}) {
  const lang = useLang()
  const [downloading, setDownloading] = useState<string | null>(null)
  const [viewPtw, setViewPtw] = useState<PTWRequest | null>(null)

  const handlePdfForWO = async (wo: WorkOrder) => {
    const ptw = ptws.find((p) => (p.work_order_ids ?? []).includes(wo.work_order_id))
    if (!ptw) return
    setDownloading(wo.work_order_id)
    try {
      const blob = await permitApi.s1DownloadPdf(ptw.ptw_id)
      downloadBlob(blob, `PTW_${ptw.permit_no}.pdf`)
    } finally {
      setDownloading(null)
    }
  }

  const woColumns: ColDef[] = [
    {
      key: 'work_order_id',
      label: tl('Work Order ID', lang),
      wrap: true,
      width: '130px',
      render: (r) => (
        <span className="font-mono text-xs font-bold text-sky-700 break-all leading-tight">
          {r.work_order_id as string}
        </span>
      ),
    },
    {
      key: 'site_name',
      label: tl('Site', lang),
      wrap: true,
      width: '90px',
    },
    {
      key: 'location',
      label: tl('Location', lang),
      wrap: true,
      width: '160px',
      render: (r) => {
        const locs = String(r.location ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (locs.length <= 1) return <span className="text-xs">{locs[0] || '—'}</span>
        return (
          <div className="flex flex-col gap-0.5 text-xs leading-tight">
            {locs.map((l, i) => <span key={i}>{l}</span>)}
          </div>
        )
      },
    },
    {
      key: 'equipment',
      label: tl('Equipment', lang),
      wrap: true,
      width: '120px',
    },
    { key: 'frequency', label: tl('Frequency', lang), width: '100px' },
    {
      key: 'status',
      label: tl('Status', lang),
      render: (r) => {
        const wo = r as unknown as WorkOrder
        // Show PDF button for any status that has an associated PTW (non-OPEN)
        const hasPtw = r.status !== 'OPEN'
        return (
          <div className="flex items-center gap-2 flex-wrap">
            {hasPtw ? (
              <button
                title={tl('Click to view PDF', lang)}
                onClick={() => handlePdfForWO(wo)}
                disabled={downloading === wo.work_order_id}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border transition-all hover:shadow-sm disabled:opacity-50 cursor-pointer"
                style={{ background: 'none', border: 'none', padding: 0 }}
              >
                <WOStatusBadge status={r.status as string} />
                <span className="text-[9px] px-1 py-0.5 rounded bg-navy-800/10 hover:bg-amber-100 text-navy-600 font-medium">
                  {downloading === wo.work_order_id ? '…' : 'PDF ↓'}
                </span>
              </button>
            ) : (
              <WOStatusBadge status={r.status as string} />
            )}
          </div>
        )
      },
    },
    {
      key: '_view',
      label: tl('Actions', lang),
      filterable: false,
      render: (r) => {
        const wo = r as unknown as WorkOrder
        const linkedPtw = ptws.find((p) => (p.work_order_ids ?? []).includes(wo.work_order_id))
        if (!linkedPtw) return null
        return (
          <Button variant="ghost" size="sm" onClick={() => setViewPtw(linkedPtw)}>
            {tl('View PTW', lang)}
          </Button>
        )
      },
    },
  ]

  if (!filterSite) {
    return (
      <EmptyState message={tl('Select site to activate', lang)} icon="📋" />
    )
  }

  return (
    <>
      <div className="rounded-xl overflow-hidden border border-slate-200">
        <PaginatedTable
          cols={woColumns}
          rows={workOrders as unknown as Record<string, unknown>[]}
          loading={loading}
          emptyMsg={tl('No work orders found', lang)}
        />
      </div>

      {/* View PTW modal for work orders */}
      <Modal
        open={!!viewPtw}
        onClose={() => setViewPtw(null)}
        title={`PTW — ${viewPtw?.permit_no}`}
        width="max-w-3xl"
      >
        {viewPtw && <PTWViewContent ptw={viewPtw} />}
      </Modal>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PTW Success Card
// ─────────────────────────────────────────────────────────────────────────────

interface SubmittedPTW {
  ptw_id: string
  permit_no: string
  site_name: string
  work_location: string
  work_order_ids: string[]
  validity_date: string
  created_by: string
}

function PTWSuccessCard({
  ptw,
  onEdit,
  onNew,
  lang,
}: {
  ptw: SubmittedPTW
  onEdit: () => void
  onNew: () => void
  lang: ReturnType<typeof useLang>
}) {
  const [downloading, setDownloading] = useState(false)
  const [dlError, setDlError] = useState('')

  const handleDownload = async () => {
    setDownloading(true)
    setDlError('')
    try {
      const blob = await permitApi.s1DownloadPdf(ptw.ptw_id)
      downloadBlob(blob, `PTW_${ptw.permit_no}.pdf`)
    } catch {
      setDlError('PDF generation failed. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 items-center py-4">
      <div className="w-full max-w-xl">
        <Card className="p-6 border-green-200 bg-green-50">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">✅</span>
            <div>
              <h3 className="font-bold text-green-800 text-lg">PTW Request Submitted</h3>
              <p className="text-green-700 text-sm">Submitted for S2 Approval</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-surface-muted text-xs uppercase tracking-wide font-semibold">{tl('Permit No', lang)}</span>
              <p className="font-mono font-bold text-navy-800">{ptw.permit_no}</p>
            </div>
            <div>
              <span className="text-surface-muted text-xs uppercase tracking-wide font-semibold">{tl('Site', lang)}</span>
              <p className="font-semibold text-navy-800">{ptw.site_name}</p>
            </div>
            <div>
              <span className="text-surface-muted text-xs uppercase tracking-wide font-semibold">{tl('Work Location', lang)}</span>
              <p className="font-semibold text-navy-800">{ptw.work_location || '—'}</p>
            </div>
            <div>
              <span className="text-surface-muted text-xs uppercase tracking-wide font-semibold">{tl('Permit Validity Date', lang)}</span>
              <p className="font-semibold text-navy-800">{ptw.validity_date}</p>
            </div>
            <div className="sm:col-span-2">
              <span className="text-surface-muted text-xs uppercase tracking-wide font-semibold">Work Orders</span>
              <p className="font-mono text-xs text-navy-800 mt-1 break-all">
                {(ptw.work_order_ids ?? []).join(' · ')}
              </p>
            </div>
          </div>
          {dlError && <div className="mt-3"><ErrorBanner message={dlError} /></div>}
          <div className="flex flex-wrap gap-2 mt-5">
            <Button variant="primary" loading={downloading} onClick={handleDownload} size="sm">
              📥 Download PTW PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>✏️ Edit</Button>
            <Button variant="ghost" size="sm" onClick={onNew}>➕ Request Another PTW</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence thumbnail for S1 — fetches via blob to avoid CORS on cross-origin img
// ─────────────────────────────────────────────────────────────────────────────

function S1EvidenceThumb({ signedUrl, path, index }: { signedUrl: string; path: string; index: number }) {
  const fileName = path.split('/').pop() ?? `photo_${index + 1}`
  const label = fileName
    .replace(/\.(jpg|jpeg|png|webp)$/i, '')
    .replace(/_\d{13}_\d{8}_\d{6}$/, '')
    .replace(/_\d{8}_\d{6}$/, '')
    .replace(/_/g, ' ')
    .trim() || `Photo ${index + 1}`

  const [objectUrl, setObjectUrl] = React.useState<string | null>(null)
  const [errored, setErrored] = React.useState(false)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!signedUrl) { setLoading(false); setErrored(true); return }
    let revoked = false
    fetch(signedUrl)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob() })
      .then(blob => { if (!revoked) { setObjectUrl(URL.createObjectURL(blob)); setLoading(false) } })
      .catch(() => { if (!revoked) { setLoading(false); setErrored(true) } })
    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedUrl])

  return (
    <a
      href={signedUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 transition-colors"
    >
      {loading ? (
        <div className="w-full h-32 bg-slate-100 animate-pulse flex items-center justify-center text-[11px] text-slate-400">Loading…</div>
      ) : errored ? (
        <div className="w-full h-32 bg-red-50 flex flex-col items-center justify-center text-[11px] text-red-400 gap-1">
          <span>⚠ Failed to load</span>
          <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-500">Open in tab</a>
        </div>
      ) : (
        <img src={objectUrl ?? signedUrl} alt={label} className="w-full h-32 object-cover bg-slate-100" onError={() => setErrored(true)} />
      )}
      <div className="px-2 py-1.5 bg-slate-50 border-t border-slate-100">
        <p className="text-[10px] text-slate-500 truncate">{label}</p>
      </div>
    </a>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared PTW read-only view (used by WorkOrdersTab + ManagePTWTab)
// ─────────────────────────────────────────────────────────────────────────────

function PTWViewContent({ ptw }: { ptw: PTWRequest; lang?: string }) {
  const lang = useLang()
  const fd = (ptw.form_data as PTWFormData & Record<string, unknown>) ?? {}
  // Fetch evidence with signed URLs (shown for any PTW that has evidence)
  const { data: evidenceItems = [], isLoading: evidenceLoading } = useQuery({
    queryKey: ['s1-evidence-signed', ptw.ptw_id],
    queryFn: () => permitApi.s1EvidenceList(ptw.ptw_id),
    staleTime: 0,
    retry: 2,
  })

  // Permit Details fields
  const descWork   = String(fd['description_of_work'] ?? fd['work_description'] ?? '')
  const contractor = String(fd['contractor_name'] ?? '')
  const workLoc    = String(fd['work_location'] ?? '')
  const validDate  = String(fd['permit_validity_date'] ?? '')
  const startTime  = String(fd['start_time'] ?? '')
  const endTime    = String(fd['end_time'] ?? '')
  const receiver   = String(fd['permit_receiver'] ?? fd['receiver_name'] ?? '—')

  // S2 Forwarding Details fields
  const permitHolder = String(fd['permit_holder'] ?? fd['holder_name'] ?? '—')
  const isoReq       = String(fd['isolation_requirement'] ?? '—')
  const ptwRaw       = ptw as unknown as Record<string, unknown>
  const dateS2       = ptwRaw.date_s2_forwarded
    ? fmtDateTime(String(ptwRaw.date_s2_forwarded)) : '—'

  // S3 Approval Details fields
  const issuerName = String(fd['permit_issuer_name'] ?? fd['issuer_name'] ?? '—')
  const issuerDt   = fd['issuer_datetime'] ? fmtDateTime(String(fd['issuer_datetime'])) : '—'
  const s3Remark   = String(fd['s3_remark'] ?? fd['remark'] ?? '—')

  return (
    <div className="flex flex-col gap-4 pr-1">
      {/* ── 1. Permit Details ─────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Permit Details</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 p-4 text-sm">
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Permit No</p><p className="font-mono font-bold text-navy-800">{ptw.permit_no}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Status</p><Badge variant={ptw_status_variant(ptw.derived_status)}>{ptw_status_label(ptw.derived_status)}</Badge></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Site</p><p>{ptw.site_name || '—'}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Work Location</p><p>{workLoc || '—'}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Permit Validity Date</p><p>{validDate || '—'}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Created By</p><p>{ptw.created_by || '—'}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Contractor / Team</p><p>{contractor || '—'}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Permit Receiver</p><p>{receiver}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Start Time</p><p>{startTime ? fmtDateTime(startTime) : '—'}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">End Time</p><p>{endTime ? fmtDateTime(endTime) : '—'}</p></div>
          {descWork && (
            <div className="sm:col-span-2"><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Description of Work</p><p className="whitespace-pre-wrap">{descWork}</p></div>
          )}
          <div className="sm:col-span-2"><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Work Orders</p><p className="font-mono text-xs text-navy-800 break-all">{(ptw.work_order_ids ?? []).join(' · ')}</p></div>
        </div>
      </div>

      {/* ── 2. S2 Forwarding Details — only if forwarded ──────────────── */}
      {permitHolder !== '—' && (
        <div className="rounded-lg border border-sky-200 overflow-hidden">
          <div className="bg-sky-50 px-4 py-2 border-b border-sky-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-600">S2 — Forwarding Details</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 p-4 text-sm">
            <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Permit Holder</p><p className="font-semibold">{permitHolder}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Isolation Requirement</p><p className="font-semibold">{isoReq}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Forwarded to S3</p><p>{dateS2}</p></div>
          </div>
        </div>
      )}

      {/* ── 3. S3 Approval Details — only if approved ─────────────────── */}
      {issuerName !== '—' && (
        <div className="rounded-lg border border-green-200 overflow-hidden">
          <div className="bg-green-50 px-4 py-2 border-b border-green-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-green-700">S3 — Approval Details</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 p-4 text-sm">
            <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Permit Issuer</p><p className="font-semibold">{issuerName}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Approved At</p><p>{issuerDt}</p></div>
            <div className="sm:col-span-2"><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Remark</p><p>{s3Remark}</p></div>
          </div>
        </div>
      )}

      {/* ── 4. Evidence photos ────────────────────────────────────────── */}
      <div className="border border-surface-border rounded-xl overflow-hidden">
        <div className="bg-slate-50 border-b border-surface-border px-4 py-2.5 flex items-center gap-2">
          <span>📷</span>
          <h3 className="text-sm font-bold text-navy-800">{tl('Evidence Photos', lang)}</h3>
          {evidenceItems.length > 0 && (
            <span className="ml-auto text-xs text-slate-500 font-semibold">
              {evidenceItems.length} photo{evidenceItems.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {evidenceLoading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : evidenceItems.length > 0 ? (
          <div className="p-4 flex flex-col gap-4">
            {/* Closure Evidence */}
            {evidenceItems.filter(e => e.folder === 'closure').length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">🔒 Closure Evidence</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {evidenceItems.filter(e => e.folder === 'closure').map((item, i) => (
                    <S1EvidenceThumb key={item.path} signedUrl={item.signed_url} path={item.path} index={i} />
                  ))}
                </div>
              </div>
            )}
            {/* Isolation Evidence */}
            {evidenceItems.filter(e => e.folder === 'isolation').length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">🔌 Isolation Evidence</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {evidenceItems.filter(e => e.folder === 'isolation').map((item, i) => (
                    <S1EvidenceThumb key={item.path} signedUrl={item.signed_url} path={item.path} index={i} />
                  ))}
                </div>
              </div>
            )}
            {/* TBT Evidence */}
            {evidenceItems.filter(e => e.folder === 'tbt').length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">📋 Tool Box Talk Evidence</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {evidenceItems.filter(e => e.folder === 'tbt').map((item, i) => (
                    <S1EvidenceThumb key={item.path} signedUrl={item.signed_url} path={item.path} index={i} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-surface-muted italic px-4 py-3">{tl('No evidence photos uploaded', lang)}</p>
        )}
      </div>

      {/* ── Full form — read-only sections ───────────────────────────── */}
      <HazardsSection values={fd} onChange={() => {}} readOnly />
      <RisksSection values={fd} onChange={() => {}} readOnly />
      <PPESection values={fd} onChange={() => {}} readOnly />
      <PrecautionsSection values={fd} onChange={() => {}} readOnly />
      <AssociatedPermitsSection values={fd} onChange={() => {}} readOnly />
      <ToolsSection values={fd} onChange={() => {}} readOnly />
      <IssuerChecklistSection values={fd} onChange={() => {}} readOnly />
      <PeopleSection values={fd} onChange={() => {}} readOnly hideHolderIssuer
        receiverDatetime={
          fmtDateTime(String((fd as Record<string, unknown>)['receiver_datetime'] ?? ''))
          || fmtDateTime(ptw.created_at)
        }
      />
      <UndertakingSection values={fd} onChange={() => {}} readOnly />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Request PTW tab — receives filter props, no internal date pickers
// ─────────────────────────────────────────────────────────────────────────────

interface WOOption {
  value: string
  label: string
  site_name: string
  location: string
  equipment: string
}

const EMPTY_FORM: PTWFormData = { undertaking_accept: false, permit_receiver: '' }

function RequestPTWTab({
  filterSite,
  filterStart,
  filterEnd,
  editTarget,
  onEditDone,
  loggedInUser,
}: FilterProps & { editTarget: PTWRequest | null; onEditDone: () => void; loggedInUser: string }) {
  const lang = useLang()
  const viewMode = useViewMode()
  const qc = useQueryClient()

  const [woFetchEnabled, setWoFetchEnabled] = useState(false)
  const [selectedOptions, setSelectedOptions] = useState<WOOption[]>([])
  const [form, setForm] = useState<PTWFormData>({ ...EMPTY_FORM, permit_receiver: loggedInUser } as PTWFormData)
  const setField = (key: keyof PTWFormData, val: unknown) =>
    setForm((f) => ({ ...f, [key]: val }))

  // Keep permit_receiver in sync with logged-in user (handles delayed auth load)
  useEffect(() => {
    if (loggedInUser && !(form as Record<string, unknown>)['permit_receiver']) {
      setForm((f) => ({ ...f, permit_receiver: loggedInUser } as PTWFormData))
    }
  }, [loggedInUser]) // eslint-disable-line react-hooks/exhaustive-deps

  const [editPtwId, setEditPtwId] = useState<string | null>(null)
  const [editPermitNo, setEditPermitNo] = useState('')
  const [submitted, setSubmitted] = useState<SubmittedPTW | null>(null)

  // Server time for validity date + receiver datetime
  const { data: serverTime } = useQuery({
    queryKey: keys.s1ServerTime(),
    queryFn: () => permitApi.s1ServerTime(),
    staleTime: 60_000,
  })

  // Fetch open WOs using universal filter params
  const woQueryParams = {
    ...(filterSite  ? { site_name:   filterSite  } : {}),
    ...(filterStart ? { start_date: filterStart } : {}),
    ...(filterEnd   ? { end_date:   filterEnd   } : {}),
  }
  const { data: openWOs = [], isLoading: loadingWOs } = useQuery({
    queryKey: keys.s1OpenWorkOrders(woQueryParams),
    queryFn: () => permitApi.s1OpenWorkOrders(woQueryParams),
    enabled: woFetchEnabled,
    staleTime: 30_000,
  })

  const woOptions: WOOption[] = useMemo(
    () =>
      openWOs.map((wo) => ({
        value: wo.work_order_id,
        label: `${wo.work_order_id} – ${wo.location ?? '?'} – ${wo.equipment ?? '?'}`,
        site_name: wo.site_name ?? '',
        location: wo.location ?? '',
        equipment: wo.equipment ?? '',
      })),
    [openWOs],
  )

  // Pre-fill form when entering edit mode from ManagePTWTab
  useEffect(() => {
    if (editTarget) {
      setEditPtwId(editTarget.ptw_id)
      setEditPermitNo(editTarget.permit_no)
      setSelectedOptions([])
      setWoFetchEnabled(false)
      setSubmitted(null)
      const fd = (editTarget.form_data ?? {}) as PTWFormData
      setForm({ ...EMPTY_FORM, permit_receiver: loggedInUser, ...fd } as PTWFormData)
    }
  }, [editTarget, loggedInUser])

  const isEditing = !!editPtwId
  const selectedIds = selectedOptions.map((o) => o.value)
  const sites = [...new Set(selectedOptions.map((o) => o.site_name).filter(Boolean))]
  const siteName = sites.length === 1 ? sites[0] : ''
  const locations = [...new Set(selectedOptions.map((o) => o.location).filter(Boolean))]
  const workLocation = locations.join('-')
  const permitNo = isEditing ? editPermitNo : (selectedIds.length > 0 ? buildPermitNo(selectedIds) : '')
  const woDisplay = selectedIds.length > 0 ? buildWODisplay(selectedIds) : ''
  const validityDate = serverTime?.validity_date ?? ''
  const multisiteError =
    sites.length > 1
      ? 'Selected work orders belong to different sites. Please select work orders from the same site.'
      : ''

  const createMutation = useMutation({
    mutationFn: () =>
      permitApi.s1CreatePtwV2({
        permit_no: permitNo,
        site_name: siteName,
        work_order_ids: selectedIds,
        description_of_work: String(form.description_of_work ?? ''),
        contractor_name: String(form.contractor_name ?? ''),
        work_location: workLocation,
        validity_date: validityDate,
        extra_form_data: form as Record<string, unknown>,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['permits', 's1', 'ptw'], exact: false })
      qc.invalidateQueries({ queryKey: keys.s1OpenWorkOrders({}) })
      setSubmitted(data as SubmittedPTW)
    },
  })

  const editMutation = useMutation({
    mutationFn: () =>
      permitApi.s1EditPtwV2(editPtwId!, {
        permit_no: editPermitNo,
        work_order_ids: selectedIds,
        description_of_work: String(form.description_of_work ?? ''),
        contractor_name: String(form.contractor_name ?? ''),
        work_location: workLocation,
        validity_date: validityDate,
        extra_form_data: form as Record<string, unknown>,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['permits', 's1', 'ptw'], exact: false })
      setSubmitted(data as SubmittedPTW)
      setEditPtwId(null)
      onEditDone()
    },
  })

  const activeMutation = isEditing ? editMutation : createMutation
  const mutationError = activeMutation.error as Error | null

  const canSubmit =
    (isEditing || (selectedIds.length > 0 && sites.length === 1)) &&
    String(form.description_of_work ?? '').trim() !== '' &&
    String(form.contractor_name ?? '').trim() !== '' &&
    form.undertaking_accept === true

  function resetAll() {
    setWoFetchEnabled(false)
    setSelectedOptions([])
    setForm({ ...EMPTY_FORM, permit_receiver: loggedInUser } as PTWFormData)
    setEditPtwId(null)
    setEditPermitNo('')
    setSubmitted(null)
    onEditDone()
  }

  if (submitted) {
    return (
      <PTWSuccessCard
        ptw={submitted}
        lang={lang}
        onEdit={() => {
          setEditPtwId(submitted.ptw_id)
          setEditPermitNo(submitted.permit_no)
          setSelectedOptions([])
          setWoFetchEnabled(false)
          setSubmitted(null)
        }}
        onNew={resetAll}
      />
    )
  }

  const showForm = isEditing || (selectedIds.length > 0 && sites.length === 1)

  return (
    <div className="flex flex-col gap-5">
      {/* Edit mode banner */}
      {isEditing && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="text-amber-600 text-lg">✏️</span>
          <p className="text-sm font-semibold text-amber-800">
            Editing PTW — <span className="font-mono">{editPtwId}</span>
          </p>
          <Button variant="ghost" size="sm" onClick={resetAll} className="ml-auto">
            {tl('Cancel', lang)}
          </Button>
        </div>
      )}

      {/* Work-order selector — hidden in edit mode */}
      {!isEditing && (
        <Card className="p-4">
          {!filterSite && (
            <p className="text-sm text-amber-700 font-medium">
              ⚠️ Please select a Site and date range in the filter bar above, then open the dropdown to load work orders.
            </p>
          )}
          <div className="flex flex-col gap-1 mt-2">
            <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wide">
              {tl('Work Orders', lang)}
              {loadingWOs && <Spinner size="sm" className="ml-1 inline" />}
            </label>
            <Select<WOOption, true>
              isMulti
              options={woOptions}
              value={selectedOptions}
              isLoading={loadingWOs}
              isDisabled={!filterSite}
              onMenuOpen={() => setWoFetchEnabled(true)}
              onChange={(vals) => setSelectedOptions(vals as WOOption[])}
              placeholder={filterSite ? 'Click to load & select work orders…' : 'Select a site first…'}
              noOptionsMessage={() => (loadingWOs ? 'Loading…' : 'No open work orders for this date range')}
              styles={selectStyles as object}
              classNamePrefix="wo-select"
            />
          </div>
          {multisiteError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <span className="text-red-500 text-sm flex-shrink-0">⚠️</span>
              <p className="text-red-700 text-xs font-semibold">{multisiteError}</p>
            </div>
          )}
        </Card>
      )}

      {/* Full PTW form */}
      {showForm && (
        <>
          {/* Permit Header */}
          <div className="border border-surface-border rounded-xl overflow-hidden">
            <div className="bg-navy-800/[0.03] border-b border-surface-border px-4 py-2.5 flex items-center gap-2">
              <span className="text-base">📋</span>
              <h3 className="text-sm font-bold text-navy-800">{tl('Permit Header', lang)}</h3>
              {!isEditing && (
                <span className="ml-auto text-[10px] text-surface-muted">Auto-populated from selected work orders</span>
              )}
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wide">{tl('Permit No', lang)}</label>
                  <div className="input font-mono bg-slate-50 text-slate-700 select-all text-sm">{permitNo || '—'}</div>
                </div>
                {!isEditing && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wide">{tl('Site', lang)}</label>
                      <div className="input bg-slate-50 text-slate-700 text-sm">{siteName || '—'}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wide">Work Order IDs</label>
                      <div className="input font-mono bg-slate-50 text-slate-700 text-xs">{woDisplay || '—'}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wide">{tl('Work Location', lang)}</label>
                      <div className="input bg-slate-50 text-slate-700 text-sm">{workLocation || '—'}</div>
                    </div>
                  </>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wide">{tl('Permit Validity Date', lang)}</label>
                  <div className="input bg-slate-50 text-slate-700 text-sm flex items-center gap-2">
                    <span>{validityDate || '…'}</span>
                    <span className="text-[10px] text-surface-muted ml-auto">(IST +8h)</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wide">
                    {tl('Permit Receiver Name', lang)}
                  </label>
                  <select
                    className="select text-sm"
                    value={String((form as Record<string, unknown>)['permit_receiver'] ?? loggedInUser)}
                    onChange={(e) => setForm((f) => ({ ...f, permit_receiver: e.target.value } as PTWFormData))}
                  >
                    <option value={loggedInUser}>{loggedInUser}</option>
                  </select>
                </div>
              </div>

              <div className={viewMode === 'mobile' ? 'flex flex-col gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
                <div className={`flex flex-col gap-1 ${viewMode !== 'mobile' ? 'md:col-span-2' : ''}`}>
                  <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wide">
                    {tl('Description of Work', lang)} <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className="input h-20 resize-none text-sm"
                    value={String(form.description_of_work ?? '')}
                    onChange={(e) => setField('description_of_work', e.target.value)}
                    placeholder="Describe the scope and nature of work…"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wide">
                    {tl('Contractor / Team Name', lang)} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="input text-sm"
                    value={String(form.contractor_name ?? '')}
                    onChange={(e) => setField('contractor_name', e.target.value)}
                    placeholder="e.g. Zelestra Electrical Team"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={viewMode === 'mobile' ? 'flex flex-col gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
            <HazardsSection     values={form} onChange={setField} />
            <RisksSection       values={form} onChange={setField} />
            <PPESection         values={form} onChange={setField} />
            <PrecautionsSection values={form} onChange={setField} />
          </div>
          <div className={viewMode === 'mobile' ? 'flex flex-col gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
            <AssociatedPermitsSection values={form} onChange={setField} />
            <ToolsSection             values={form} onChange={setField} />
          </div>
          <IssuerChecklistSection values={form} onChange={setField} />
          <PeopleSection
            values={form}
            onChange={setField}
            hideHolderIssuer
            receiverDatetime={serverTime?.now_ist}
            receiverOptions={loggedInUser ? [loggedInUser] : undefined}
          />
          <UndertakingSection values={form} onChange={setField} />

          {mutationError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <span className="text-red-500 text-sm flex-shrink-0">⚠️</span>
              <p className="text-red-700 text-xs font-semibold">
                {mutationError.message || 'Failed to submit PTW.'}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2 pb-4">
            <Button
              variant="primary"
              loading={activeMutation.isPending}
              disabled={!canSubmit}
              onClick={() => activeMutation.mutate()}
              className="px-8"
            >
              {isEditing ? `💾 ${tl('Save Changes', lang)}` : tl('Submit PTW Request', lang)}
            </Button>
            <Button variant="ghost" onClick={resetAll}>{tl('Clear Form', lang)}</Button>
            {!form.undertaking_accept && (
              <p className="text-xs text-amber-700">
                {tl('Accept undertaking before submitting', lang)}
              </p>
            )}
          </div>
        </>
      )}

      {!showForm && !isEditing && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-surface-muted">
          <span className="text-5xl">📋</span>
          <p className="text-sm font-medium">
            {filterSite
              ? 'Select one or more work orders from the dropdown above'
              : 'Select a site in the filter bar, then pick work orders from the dropdown'}
          </p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera Capture — live camera + GPS + IST timestamp watermark (same as S2)
// ─────────────────────────────────────────────────────────────────────────────

interface CaptureResult { blob: Blob; previewUrl: string }

function CameraCapture({
  label, onCapture, disabled = false,
}: {
  label: string; onCapture: (result: CaptureResult) => void; disabled?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [videoReady, setVideoReady] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [camError, setCamError] = useState('')

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    }
  }, [stream])

  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()) }, [stream])

  const openCamera = async () => {
    setCamError('')
    setVideoReady(false)
    setIsOpen(true)
    setGpsStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsStatus('ready') },
      () => setGpsStatus('error'),
      { timeout: 8000, enableHighAccuracy: false },
    )
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      setStream(mediaStream)
    } catch {
      setCamError('Camera access denied. Please allow camera permissions in your browser and retry.')
      setIsOpen(false)
    }
  }

  const takePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const w = video.videoWidth || video.clientWidth || 1280
    const h = video.videoHeight || video.clientHeight || 720
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, w, h)
    const now = new Date()
    const istStr = now.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }) + ' IST'
    const geoStr = coords ? `Lat: ${coords.lat.toFixed(4)}   Lng: ${coords.lng.toFixed(4)}` : '(GPS unavailable)'
    const BAR = 56
    ctx.fillStyle = 'rgba(0,0,0,0.70)'
    ctx.fillRect(0, h - BAR, w, BAR)
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${Math.max(12, Math.round(w / 90))}px Arial, sans-serif`
    ctx.fillText(istStr, 12, h - BAR + 20)
    ctx.fillText(geoStr, 12, h - BAR + 42)
    stream?.getTracks().forEach((t) => t.stop())
    setStream(null)
    setIsOpen(false)
    setVideoReady(false)
    const previewUrl = canvas.toDataURL('image/jpeg', 0.92)
    setPreview(previewUrl)
    canvas.toBlob((blob) => { if (blob) onCapture({ blob, previewUrl }) }, 'image/jpeg', 0.92)
  }

  const retake = () => { setPreview(null); setCoords(null); setGpsStatus('idle'); setCamError('') }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <canvas ref={canvasRef} className="hidden" />
      {camError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-1.5">{camError}</p>}
      {preview ? (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <img src={preview} alt="Captured" className="rounded-lg border border-slate-200 w-full max-h-52 object-cover" />
            <span className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">✓ Captured</span>
          </div>
          <Button variant="ghost" size="sm" onClick={retake} disabled={disabled}>↩ Retake</Button>
        </div>
      ) : isOpen && stream ? (
        <div className="flex flex-col gap-2">
          {gpsStatus === 'loading' && <p className="text-xs text-amber-600 flex items-center gap-1.5"><Spinner size="sm" /> Acquiring GPS location…</p>}
          {gpsStatus === 'error' && <p className="text-xs text-orange-500">⚠ GPS unavailable — photo will be captured without coordinates</p>}
          <div className="relative rounded-lg overflow-hidden border border-slate-300 bg-black">
            <video
              ref={videoRef}
              className="w-full max-h-52 object-cover"
              muted
              playsInline
              onCanPlay={() => setVideoReady(true)}
            />
            {!videoReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Spinner size="lg" />
                <span className="ml-2 text-white text-sm">Starting camera…</span>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-3 py-1 text-[10px] text-white font-mono">
              GPS + IST timestamp watermark will be added on capture
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={takePhoto} disabled={!videoReady}>
            {videoReady ? '📸 Capture Photo' : 'Waiting for camera…'}
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="ghost" size="sm" onClick={openCamera} disabled={disabled}>
            📷 Open Camera
          </Button>
          <p className="text-[10px] text-slate-400 mt-1">Camera only · GPS + IST timestamp watermark auto-applied</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Closure modal — undertaking checkboxes + camera evidence (camera-only)
// ─────────────────────────────────────────────────────────────────────────────

const CLOSURE_UNDERTAKING = [
  'All isolation has been normalised and LOTO has been removed',
  'All work has been completed safely and in accordance with the PTW conditions',
  'All personnel involved have left the work area',
  'Site has been left in a safe, clean and secure condition',
]

// ─────────────────────────────────────────────────────────────────────────────
// Closure automation — auto-generate all closure metadata on Confirm Closure
// ─────────────────────────────────────────────────────────────────────────────

function toISTString(d: Date): string {
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).replace(', ', ' ')
}

function buildClosureDetails(ptw: PTWRequest, checked: Record<number, boolean>) {
  const fd = (ptw.form_data ?? {}) as Record<string, unknown>
  const now = new Date()

  // Timestamps — receiver = now, holder = now+2min, issuer = now+3min
  const closure_receiver_datetime = toISTString(now)
  const closure_holder_datetime   = toISTString(new Date(now.getTime() + 2 * 60_000))
  const closure_issuer_datetime   = toISTString(new Date(now.getTime() + 3 * 60_000))

  // Signatures — mapped from existing permit data
  const closure_receiver_signature = String(fd.permit_receiver_signature ?? fd.receiver_name ?? '')
  const closure_holder_signature   = String(fd.holder_name ?? '')
  const closure_issuer_signature   = String(fd.issuer_name ?? '')

  // Names — receiver prefers permit_receiver_name, falls back to receiver_name
  const closure_receiver_name = String(fd.permit_receiver_name ?? fd.receiver_name ?? '')
  const closure_holder_name   = String(fd.holder_name ?? '')
  const closure_issuer_name   = String(fd.issuer_name ?? '')

  // Undertaking proof — list of confirmed statement texts
  const closure_undertaking_proof       = CLOSURE_UNDERTAKING.filter((_, i) => checked[i])
  const closure_undertaking_all_checked = closure_undertaking_proof.length === CLOSURE_UNDERTAKING.length

  return {
    closure_receiver_datetime,
    closure_holder_datetime,
    closure_issuer_datetime,
    closure_receiver_signature,
    closure_holder_signature,
    closure_issuer_signature,
    closure_receiver_name,
    closure_holder_name,
    closure_issuer_name,
    closure_undertaking_proof,
    closure_undertaking_all_checked,
  }
}

function ClosureModal({
  ptw,
  onClose,
  onSuccess,
}: {
  ptw: PTWRequest
  onClose: () => void
  onSuccess: () => void
}) {
  const MAX_PHOTOS = 5
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [notes, setNotes] = useState('')
  const [capturedBlobs, setCapturedBlobs] = useState<(Blob | null)[]>([null])
  const [slotCount, setSlotCount] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const allChecked = CLOSURE_UNDERTAKING.every((_, i) => checked[i])
  const capturedCount = capturedBlobs.filter(Boolean).length
  const canClose = allChecked && capturedCount > 0

  const toggle = (i: number) => setChecked((c) => ({ ...c, [i]: !c[i] }))

  const handleCapture = (slotIdx: number, result: CaptureResult) => {
    setCapturedBlobs((prev) => {
      const next = [...prev]
      next[slotIdx] = result.blob
      return next
    })
  }

  const addSlot = () => {
    if (slotCount < MAX_PHOTOS) {
      setSlotCount((n) => n + 1)
      setCapturedBlobs((prev) => [...prev, null])
    }
  }

  /** Auto-generates all closure metadata and submits the PTW closure. */
  const handlePTWClosure = async () => {
    setSubmitting(true)
    setError('')
    try {
      const woIds: string[] = ptw.work_order_ids ?? []
      const closureDetails = buildClosureDetails(ptw, checked)

      const fd = new FormData()
      fd.append('work_order_ids', JSON.stringify(woIds))
      fd.append('closure_notes', notes)
      fd.append('closure_details', JSON.stringify(closureDetails))
      capturedBlobs.forEach((blob, i) => {
        if (blob) fd.append('files', blob, `closure_photo_${i + 1}_${Date.now()}.jpg`)
      })

      await permitApi.s1CloseWithEvidence(ptw.ptw_id, fd)
      onSuccess()
    } catch {
      setError('Closure failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Close PTW — ${ptw.permit_no}`} width="max-w-lg">
      <div className="flex flex-col gap-5 max-h-[80vh] overflow-y-auto pr-1">

        {/* Permit info banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
          <p><span className="font-semibold text-amber-800">Permit:</span> {ptw.permit_no}</p>
          <p><span className="font-semibold text-amber-800">Site:</span> {ptw.site_name}</p>
          {(ptw.work_order_ids ?? []).length > 0 && (
            <p className="text-xs font-mono text-amber-700 mt-1">
              WOs: {(ptw.work_order_ids ?? []).join(', ')}
            </p>
          )}
        </div>

        {/* ── Section 1: Closure Undertaking ── */}
        <div className="border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">
            1. Closure Undertaking <span className="text-red-500">*</span>
            <span className="text-[10px] font-normal normal-case ml-1">(all items must be ticked)</span>
          </p>
          <div className="flex flex-col gap-2.5">
            {CLOSURE_UNDERTAKING.map((item, i) => (
              <label key={i} className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={!!checked[i]}
                  onChange={() => toggle(i)}
                  className="mt-0.5 w-4 h-4 accent-amber-500 flex-shrink-0"
                />
                <span className={`text-sm leading-relaxed ${checked[i] ? 'text-green-800 line-through decoration-green-500' : 'text-navy-700'}`}>
                  {item}
                </span>
              </label>
            ))}
          </div>
          {allChecked && (
            <p className="mt-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-1.5 font-medium">
              ✓ All undertaking items confirmed — saved as proof in permit record
            </p>
          )}
        </div>

        {/* ── Section 2: Evidence Photos (camera-only, GPS + IST watermark) ── */}
        <div className="border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-4">
            2. Evidence Photos <span className="text-red-500">*</span>
            <span className="text-[10px] font-normal normal-case ml-1">(at least 1 · camera only · GPS + timestamp auto-added)</span>
          </p>
          <div className="flex flex-col gap-4">
            {Array.from({ length: slotCount }).map((_, idx) => (
              <div key={idx} className="border border-slate-100 rounded-lg p-3 bg-slate-50">
                <CameraCapture
                  label={`Closure Photo ${idx + 1}`}
                  onCapture={(result) => handleCapture(idx, result)}
                  disabled={submitting}
                />
              </div>
            ))}
            {slotCount < MAX_PHOTOS && capturedBlobs[slotCount - 1] !== null && (
              <button
                type="button"
                onClick={addSlot}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-amber-400 text-xs text-amber-700 hover:bg-amber-50 transition-colors self-start"
              >
                + Add Another Photo
              </button>
            )}
            {capturedCount > 0 && (
              <p className="text-xs text-green-700 font-medium">
                {capturedCount} photo{capturedCount > 1 ? 's' : ''} captured
              </p>
            )}
          </div>
        </div>

        {/* ── Section 3: Closure Notes ── */}
        <div className="border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
            3. Closure Notes (optional)
          </p>
          <textarea
            className="input h-16 resize-none text-sm w-full"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional closure remarks…"
          />
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="flex gap-2 justify-end pt-1 border-t border-slate-100">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!canClose || submitting}
            loading={submitting}
            onClick={handlePTWClosure}
          >
            ✅ Confirm Closure
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Manage PTWs tab
// ─────────────────────────────────────────────────────────────────────────────

function ManagePTWTab({
  filterSite,
  onEditRequest,
  ptws,
  ptwsLoading,
}: {
  filterSite: string
  onEditRequest: (ptw: PTWRequest) => void
  ptws: PTWRequest[]
  ptwsLoading: boolean
}) {
  const lang = useLang()
  const qc = useQueryClient()
  const [viewPtw, setViewPtw] = useState<PTWRequest | null>(null)
  const [closePtw, setClosePtw] = useState<PTWRequest | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const isLoading = ptwsLoading

  const handleDownload = async (ptw: PTWRequest) => {
    setDownloading(ptw.ptw_id)
    try {
      const blob = await permitApi.s1DownloadPdf(ptw.ptw_id)
      downloadBlob(blob, `PTW_${ptw.permit_no}.pdf`)
    } finally {
      setDownloading(null)
    }
  }

  const handleDelete = async (ptw: PTWRequest) => {
    if (!window.confirm(
      `${tl('Delete PTW', lang)} ${ptw.permit_no}?\n${tl('This will reset the work orders back to OPEN status.', lang)}`
    )) return
    setDeleting(ptw.ptw_id)
    try {
      await permitApi.s1DeletePtw(ptw.ptw_id)
      qc.invalidateQueries({ queryKey: ['permits', 's1'], exact: false })
    } catch {
      alert(tl('Delete failed. Please try again.', lang))
    } finally {
      setDeleting(null)
    }
  }

  const ptwColumns: ColDef[] = [
    {
      key: 'permit_no',
      label: tl('Permit No', lang),
      wrap: true,
      width: '140px',
      render: (r) => {
        const pn = r.permit_no as string
        // Wrap after "PTW-" prefix: split numeric parts on "/"
        const parts = pn.replace(/^PTW-/, '').split('/')
        return (
          <div className="font-mono text-xs font-bold text-navy-800">
            <span className="text-amber-700">PTW-</span>
            {parts.map((p, i) => (
              <span key={i} className="block">{i > 0 ? `/${p}` : p}</span>
            ))}
          </div>
        )
      },
    },
    { key: 'site_name', label: tl('Site', lang) },
    {
      key: 'work_order_ids',
      label: tl('Work Orders', lang),
      wrap: true,
      width: '180px',
      render: (r) => {
        const ids = (r.work_order_ids as string[]) ?? []
        return (
          <div className="flex flex-col gap-0.5">
            {ids.map((id, i) => (
              <span key={i} className="font-mono text-[11px] text-slate-600 block">{id}</span>
            ))}
          </div>
        )
      },
    },
    {
      key: 'created_at',
      label: tl('Created', lang),
      render: (r) => <span className="text-xs whitespace-nowrap">{fmtDate(r.created_at as string)}</span>,
    },
    {
      key: 'created_by',
      label: tl('By', lang),
      render: (r) => <span className="text-xs text-surface-muted">{r.created_by as string}</span>,
    },
    {
      key: 'derived_status',
      label: tl('Status', lang),
      render: (r) => <WOStatusBadge status={r.derived_status as string} />,
    },
    {
      key: '_actions',
      label: tl('Actions', lang),
      filterable: false,
      render: (r) => {
        const ptw = r as unknown as PTWRequest
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setViewPtw(ptw)}>{tl('View', lang)}</Button>
            <Button
              variant="ghost"
              size="sm"
              loading={downloading === ptw.ptw_id}
              onClick={() => handleDownload(ptw)}
            >
              PDF ↓
            </Button>
            {(ptw.derived_status as string) === 'PENDING_S2' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEditRequest(ptw)}
                  className="text-amber-600 border-amber-200 hover:bg-amber-50"
                >
                  ✏️ {tl('Edit', lang)}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={deleting === ptw.ptw_id}
                  onClick={() => handleDelete(ptw)}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  🗑 {tl('Delete', lang)}
                </Button>
              </>
            )}
            {ptw.derived_status === 'APPROVED' && (
              <Button variant="danger" size="sm" onClick={() => setClosePtw(ptw)}>
                {tl('Close PTW', lang)}
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  if (!filterSite) {
    return <EmptyState message={tl('Select site to activate', lang)} icon="📄" />
  }

  return (
    <div className="flex flex-col gap-4">
      {isLoading && <div className="flex justify-center py-10"><Spinner size="lg" /></div>}

      {!isLoading && (
        <div className="rounded-xl overflow-hidden border border-slate-200">
          <PaginatedTable
            cols={ptwColumns}
            rows={ptws as unknown as Record<string, unknown>[]}
            loading={false}
            emptyMsg={tl('No PTW requests found', lang)}
          />
        </div>
      )}

      {/* View modal — full scrollable PTW form with evidence photos */}
      <Modal
        open={!!viewPtw}
        onClose={() => setViewPtw(null)}
        title={`PTW — ${viewPtw?.permit_no}`}
        width="max-w-3xl"
      >
        {viewPtw && <PTWViewContent ptw={viewPtw} />}
      </Modal>

      {/* Closure modal with evidence upload */}
      {closePtw && (
        <ClosureModal
          ptw={closePtw}
          onClose={() => setClosePtw(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['permits', 's1', 'ptw'], exact: false })
            setClosePtw(null)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page root — universal filter + KPI cards above tabs
// ─────────────────────────────────────────────────────────────────────────────

export function S1Page() {
  const lang = useLang()
  const viewMode = useViewMode()
  const user = useUser()
  const loggedInUser = user?.username ?? ''
  const [tab, setTab] = useState('work_orders')

  // ── Pending filter state (Apply button pattern) — persisted in localStorage ─
  const _savedFilters = (() => {
    try { return JSON.parse(localStorage.getItem('s1_filters') ?? 'null') } catch { return null }
  })()
  const [pendingSite, setPendingSite] = useState<string>(_savedFilters?.pendingSite ?? '')
  const [pendingStart, setPendingStart] = useState<string>(_savedFilters?.pendingStart ?? todayStr)
  const [pendingEnd, setPendingEnd] = useState<string>(_savedFilters?.pendingEnd ?? todayStr)

  // ── Applied filter state (drives all queries) — also persisted ──────────
  const [filterSite, setFilterSite] = useState<string>(_savedFilters?.filterSite ?? '')
  const [filterStart, setFilterStart] = useState<string>(_savedFilters?.filterStart ?? todayStr)
  const [filterEnd, setFilterEnd] = useState<string>(_savedFilters?.filterEnd ?? todayStr)

  const applyFilter = () => {
    setFilterSite(pendingSite)
    setFilterStart(pendingStart)
    setFilterEnd(pendingEnd)
    try {
      localStorage.setItem('s1_filters', JSON.stringify({
        pendingSite, pendingStart, pendingEnd,
        filterSite: pendingSite, filterStart: pendingStart, filterEnd: pendingEnd,
      }))
    } catch { /* ignore storage errors */ }
  }

  const clearFilter = () => {
    setPendingSite('')
    setPendingStart(todayStr)
    setPendingEnd(todayStr)
    setFilterSite('')
    setFilterStart(todayStr)
    setFilterEnd(todayStr)
    try { localStorage.removeItem('s1_filters') } catch { /* ignore */ }
  }

  // ── Cross-tab edit state ────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<PTWRequest | null>(null)

  // ── Site list — filtered by logged-in user's access (dashboard_users.site → master_db) ──
  const { data: siteList = [], isLoading: sitesLoading, isFetched: sitesFetched } = useQuery({
    queryKey: keys.metaAllowedSites(),
    queryFn: metaApi.allowedSites,
    staleTime: 5 * 60_000,
  })

  // ── Work orders query (for KPIs + WorkOrdersTab) ────────────────────────
  const filterParams = {
    ...(filterSite  ? { site_name:   filterSite  } : {}),
    ...(filterStart ? { start_date: filterStart } : {}),
    ...(filterEnd   ? { end_date:   filterEnd   } : {}),
  }
  const { data: woResult, isLoading: woLoading } = useQuery({
    queryKey: keys.s1WorkOrders(filterParams),
    queryFn: () => permitApi.s1WorkOrders(filterParams),
    enabled: !!filterSite,
  })
  const kpis: WorkOrderKpis = woResult?.kpis ?? DEFAULT_KPIS
  const workOrders: WorkOrder[] = woResult?.data ?? []

  // ── PTW list query — filtered by site + date_planned range ─────────────────
  // Backend scopes PTWs to work orders whose date_planned is in the filter range
  const ptwParams = {
    ...(filterSite  ? { site_name:   filterSite  } : {}),
    ...(filterStart ? { start_date: filterStart } : {}),
    ...(filterEnd   ? { end_date:   filterEnd   } : {}),
  }
  const { data: ptws = [], isLoading: ptwsLoading } = useQuery({
    queryKey: keys.s1Ptw(ptwParams),
    queryFn: () => permitApi.s1ListPtw(ptwParams),
    enabled: !!filterSite,
  })

  // ── All PTWs for site (no date filter) — used by WorkOrdersTab for View button ──
  // We need ALL PTWs in the site so the "View PTW" button appears for any WO,
  // regardless of the current date range filter.
  const siteOnlyPtwParams = filterSite ? { site_name: filterSite } : {}
  const { data: allSitePtws = [] } = useQuery({
    queryKey: keys.s1Ptw(siteOnlyPtwParams),
    queryFn: () => permitApi.s1ListPtw(siteOnlyPtwParams),
    enabled: !!filterSite,
    staleTime: 2 * 60 * 1000,
  })

  const filterProps: FilterProps = { filterSite, filterStart, filterEnd }

  const TABS = [
    { key: 'work_orders', label: tl('Work Orders', lang), icon: '📋' },
    { key: 'request',     label: tl('Request PTW', lang), icon: '➕' },
    { key: 'manage',      label: tl('My PTWs', lang),     icon: '📄' },
  ]

  return (
    <div className="flex flex-col gap-5 pl-1 md:pl-2">
      {/* Page heading */}
      <div className="flex items-start justify-between flex-wrap gap-2 pt-1">
        <div>
          <h1 className="font-display text-2xl text-navy-800">{tl('S1 Receiver', lang)}</h1>
          <p className="text-sm text-surface-muted mt-0.5">
            {tl('Universal Filter', lang)}
          </p>
        </div>
        <span className="badge badge-blue text-xs self-start">S1 Portal</span>
      </div>

      {/* ── Universal Filter Bar ── */}
      <Card className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-surface-muted mb-3">
          🔍 {tl('Universal Filter', lang)}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wide">
              {tl('Site', lang)} <span className="text-red-500">*</span>
            </label>
            {sitesLoading ? (
              <select className="select text-sm" disabled>
                <option>Loading sites…</option>
              </select>
            ) : sitesFetched && siteList.length === 0 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 font-medium">
                ⚠️ No site access configured. Contact your administrator.
              </div>
            ) : (
              <select
                className="select text-sm"
                value={pendingSite}
                onChange={(e) => setPendingSite(e.target.value)}
              >
                <option value="">— Select site —</option>
                {siteList.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wide">
              {tl('Start Date', lang)}
            </label>
            <input
              type="date"
              className="input text-sm"
              value={pendingStart}
              onChange={(e) => setPendingStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wide">
              {tl('End Date', lang)}
            </label>
            <input
              type="date"
              className="input text-sm"
              value={pendingEnd}
              onChange={(e) => setPendingEnd(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 justify-end">
            <label className="text-[11px] font-semibold text-transparent uppercase select-none">Apply</label>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={applyFilter}
                disabled={!pendingSite}
                className="flex-1"
              >
                ✓ {tl('Apply Filter', lang)}
              </Button>
              {filterSite && (
                <Button variant="ghost" size="sm" onClick={clearFilter} className="text-xs">
                  ✕
                </Button>
              )}
            </div>
          </div>
        </div>
        {!filterSite && (
          <p className="text-[11px] text-amber-700 mt-2 font-medium">
            {tl('Select site to activate', lang)}
          </p>
        )}
        {filterSite && (
          <p className="text-[11px] text-green-700 mt-2 font-medium">
            ✓ Showing: <strong>{filterSite}</strong> · {filterStart} → {filterEnd}
          </p>
        )}
      </Card>

      {/* ── KPI Summary ── */}
      {filterSite && <KpiSummary kpis={kpis} loading={woLoading} />}

      {/* ── Tabbed Panel (tab bar + content in one bordered card) ── */}
      <div className="rounded-xl border-2 border-surface-border shadow-sm overflow-hidden bg-white">
        {/* Tab Bar */}
        <div className="flex border-b-2 border-surface-border bg-slate-50">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key)
                if (t.key !== 'request') setEditTarget(null)
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-semibold transition-all duration-150 border-b-2 -mb-[2px]',
                tab === t.key
                  ? 'border-amber-400 bg-white text-navy-900'
                  : 'border-transparent text-surface-muted hover:text-navy-800 hover:bg-slate-100',
              )}
            >
              <span>{t.icon}</span>
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="min-h-[300px] p-4">
          {tab === 'work_orders' && (
            <WorkOrdersTab
              workOrders={workOrders}
              loading={woLoading}
              filterSite={filterSite}
              ptws={allSitePtws}
            />
          )}

          {tab === 'request' && (
            <RequestPTWTab
              {...filterProps}
              editTarget={editTarget}
              onEditDone={() => setEditTarget(null)}
              loggedInUser={loggedInUser}
            />
          )}

          {tab === 'manage' && (
            <ManagePTWTab
              filterSite={filterSite}
              ptws={ptws}
              ptwsLoading={ptwsLoading}
              onEditRequest={(ptw) => {
                setEditTarget(ptw)
                setTab('request')
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
