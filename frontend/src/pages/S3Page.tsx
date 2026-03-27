// src/pages/S3Page.tsx — S3 Permit Approval (v3: work orders tab + create)

import React, { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { permitApi, metaApi, downloadBlob } from '@/lib/api'
import { keys } from '@/hooks/useQueryKeys'
import { fmtDateTime } from '@/lib/utils'
import { Badge, Button, Card, ErrorBanner, Spinner, Modal } from '@/components/ui'
import {
  HazardsSection, RisksSection, PPESection, PrecautionsSection,
  AssociatedPermitsSection, ToolsSection, IssuerChecklistSection,
  UndertakingSection, PeopleSection,
} from './PermitFormParts'
import { SubNav, WorkOrderModal, WorkOrdersTable, Toast } from './WorkOrderComponents'
import type { ActiveTab } from './WorkOrderComponents'
import type { PTWFormData } from './permitTypes'
import type { WorkOrder, WorkOrderKpis, PTWRequest } from '@/types'
import { useLang, tl } from '@/store/languageStore'
import { useUser } from '@/store/authStore'

const todayStr = new Date().toISOString().split('T')[0]
const PAGE_SIZE = 11

// ─────────────────────────────────────────────────────────────────────────────
// Status badge — identical to S1 / S2
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
// KPI cards — identical to S1 / S2
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_KPIS: WorkOrderKpis = { total: 0, open: 0, pending_s2: 0, pending_s3: 0, approved: 0, closed: 0, expired: 0 }

function KpiCard({ label, value, icon, bg, text, border }: {
  label: string; value: number; icon: string; bg: string; text: string; border: string
}) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl px-4 py-3 border ${bg} ${border} flex-1 min-w-[90px]`}>
      <div className="flex items-center justify-between">
        <span className="text-lg leading-none">{icon}</span>
        <span className={`text-2xl font-extrabold ${text}`}>{value}</span>
      </div>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${text} opacity-80`}>{label}</p>
    </div>
  )
}

function KpiSummary({ kpis, loading }: { kpis: WorkOrderKpis; loading: boolean }) {
  if (loading) return <div className="flex justify-center py-4"><Spinner /></div>
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-stretch">
      <KpiCard label="Total"      value={kpis.total}      icon="📋" bg="bg-slate-50"  text="text-slate-700"  border="border-slate-200" />
      <KpiCard label="Open"       value={kpis.open}       icon="🔵" bg="bg-sky-50"    text="text-sky-700"    border="border-sky-200"   />
      <KpiCard label="Pending S2" value={kpis.pending_s2} icon="🟠" bg="bg-orange-50" text="text-orange-600" border="border-orange-200"/>
      <KpiCard label="Pending S3" value={kpis.pending_s3} icon="🟡" bg="bg-amber-50"  text="text-amber-700"  border="border-amber-200" />
      <KpiCard label="Approved"   value={kpis.approved}   icon="🟢" bg="bg-lime-50"   text="text-lime-700"   border="border-lime-200"  />
      <KpiCard label="Expired"    value={kpis.expired}    icon="🔴" bg="bg-red-50"    text="text-red-700"    border="border-red-200"   />
      <KpiCard label="Closed ✓"   value={kpis.closed}     icon="✅" bg="bg-green-50"  text="text-green-700"  border="border-green-200" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Paginated table — identical to S1 / S2
// ─────────────────────────────────────────────────────────────────────────────

interface ColDef {
  key: string
  label: string
  render?: (row: Record<string, unknown>) => React.ReactNode
  filterable?: boolean
  wrap?: boolean
  width?: string
}

function PaginatedTable({
  cols, rows, pageSize = PAGE_SIZE, emptyMsg = 'No data found.', loading = false,
}: {
  cols: ColDef[]; rows: Record<string, unknown>[]
  pageSize?: number; emptyMsg?: string; loading?: boolean
}) {
  const [page, setPage] = useState(1)
  const [colFilters, setColFilters] = useState<Record<string, string>>({})

  const setFilter = (key: string, val: string) => {
    setColFilters((f) => ({ ...f, [key]: val }))
    setPage(1)
  }

  const filtered = useMemo(
    () => rows.filter((row) =>
      cols.every(({ key, filterable = true }) => {
        if (!filterable) return true
        const f = (colFilters[key] ?? '').toLowerCase().trim()
        if (!f) return true
        return String(row[key] ?? '').toLowerCase().includes(f)
      })
    ),
    [rows, colFilters, cols],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" style={{ tableLayout: 'fixed', minWidth: '1085px' }}>
          <thead>
            {/* Header + inline filter row — identical to S2 style */}
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              {cols.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width, minWidth: col.width }}
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
              <tr><td colSpan={cols.length} className="text-center py-10"><Spinner /></td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={cols.length} className="text-center py-10 text-slate-400 text-sm">{emptyMsg}</td></tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-amber-50/40 transition-colors">
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2.5 text-sm text-slate-700 ${c.wrap ? 'break-words' : 'whitespace-nowrap overflow-hidden'}`}
                      style={c.width ? { width: c.width, minWidth: c.width, maxWidth: c.width } : {}}
                    >
                      {c.render ? c.render(row) : (String(row[c.key] ?? '') || '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 pt-3 pb-1 text-xs text-slate-500">
          <span>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={safePage === 1} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => Math.abs(p - safePage) <= 2).map((p) => (
              <button key={p} onClick={() => setPage(p)}
                className={`px-2 py-1 rounded border text-xs font-semibold transition-colors ${p === safePage ? 'bg-amber-400 border-amber-400 text-white' : 'border-slate-200 hover:bg-slate-50'}`}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">›</button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">»</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Permit No cell — wraps after first WO (identical to S1 / S2)
// ─────────────────────────────────────────────────────────────────────────────

function PermitNoCell({ value }: { value: string }) {
  const parts = value.split('-')
  if (parts.length <= 1) return <span className="font-mono text-xs font-bold">{value}</span>
  return (
    <span className="font-mono text-xs font-bold leading-tight">
      {parts[0]}
      {parts.length > 1 && (
        <><br /><span className="text-slate-500">{parts.slice(1).join('-')}</span></>
      )}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence thumbnail — fetch via blob to avoid CORS on cross-origin img
// ─────────────────────────────────────────────────────────────────────────────

function EvidenceThumb({ signedUrl, path, index }: { signedUrl: string; path: string; index: number }) {
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
    <a href={signedUrl || '#'} target="_blank" rel="noopener noreferrer"
      className="group block rounded-lg overflow-hidden border border-slate-200 hover:border-violet-400 transition-colors">
      {loading ? (
        <div className="w-full h-32 bg-slate-100 animate-pulse flex items-center justify-center text-[11px] text-slate-400">Loading…</div>
      ) : errored ? (
        <div className="w-full h-32 bg-red-50 flex flex-col items-center justify-center text-[11px] text-red-400 gap-1">
          <span>⚠ Failed to load</span>
          <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="underline text-violet-500">Open in tab</a>
        </div>
      ) : (
        <img src={objectUrl ?? signedUrl} alt={label} className="w-full h-32 object-cover bg-slate-100 group-hover:opacity-90 transition-opacity" onError={() => setErrored(true)} />
      )}
      <div className="px-2 py-1.5 bg-slate-50 border-t border-slate-100">
        <p className="text-[10px] text-slate-500 truncate">{label}</p>
      </div>
    </a>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// S3 View Modal — shows full PTW (S1 + S2 + S3 data + evidence)
// ─────────────────────────────────────────────────────────────────────────────

function S3ViewModal({ ptw, onClose }: { ptw: PTWRequest; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false)
  const fd = ((ptw.form_data as Record<string, unknown>) ?? {}) as PTWFormData & Record<string, unknown>
  const noop = () => {}

  const permitHolder  = String(fd.permit_holder ?? fd.holder_name ?? '—')
  const isoReq        = String(fd.isolation_requirement ?? '—')
  const dateS2        = (ptw as Record<string, unknown>).date_s2_forwarded
    ? fmtDateTime(String((ptw as Record<string, unknown>).date_s2_forwarded)) : '—'
  // Check both field names — backend stores as issuer_name, legacy may use permit_issuer_name
  const issuerName    = String(fd.permit_issuer_name ?? fd.issuer_name ?? '—')
  const issuerDt      = fd.issuer_datetime ? fmtDateTime(String(fd.issuer_datetime)) : '—'
  const s3Remark      = String(fd.s3_remark ?? fd.remark ?? '—')
  const validityDate  = String(fd.permit_validity_date ?? fd.validity_date ?? '—')
  const descWork      = String(fd.description_of_work ?? fd.work_description ?? '—')
  const workLoc       = String(fd.work_location ?? '—')
  const contractor    = String(fd.contractor_name ?? '—')
  const receiver      = String(fd.permit_receiver ?? fd.receiver_name ?? '—')
  const startTime     = String((fd as Record<string, unknown>).start_time ?? '')
  const endTime       = String((fd as Record<string, unknown>).end_time ?? '')

  const { data: evidenceItems = [], isLoading: evidenceLoading } = useQuery({
    queryKey: ['s3-evidence', ptw.ptw_id],
    queryFn: () => permitApi.s3EvidenceList(ptw.ptw_id),
    staleTime: 0,
    retry: 2,
  })
  const isolationPhotos = evidenceItems.filter((e) => e.folder === 'isolation')
  const tbtPhotos       = evidenceItems.filter((e) => e.folder === 'tbt')

  const handleDownloadPdf = async () => {
    setDownloading(true)
    try {
      const blob = await permitApi.s1DownloadPdf(ptw.ptw_id)
      downloadBlob(blob, `PTW_${ptw.permit_no}.pdf`)
    } catch {
      alert('PDF generation failed. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      {/* Permit details */}
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Permit Details</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 p-4 text-sm">
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Permit No</p><p className="font-mono font-bold text-navy-800">{ptw.permit_no}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Status</p><WOStatusBadge status={ptw.derived_status ?? 'PENDING_S3'} /></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Site</p><p>{ptw.site_name || '—'}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Work Location</p><p>{workLoc}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Permit Validity Date</p><p>{validityDate}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Created By</p><p>{ptw.created_by || '—'}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Contractor / Team</p><p>{contractor}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Permit Receiver</p><p>{receiver}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Start Time</p><p>{startTime ? fmtDateTime(startTime) : '—'}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">End Time</p><p>{endTime ? fmtDateTime(endTime) : '—'}</p></div>
          {descWork && descWork !== '—' && (
            <div className="sm:col-span-2"><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Description of Work</p><p className="whitespace-pre-wrap">{descWork}</p></div>
          )}
          <div className="sm:col-span-2"><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Work Orders</p><p className="font-mono text-xs text-navy-800 break-all">{(ptw.work_order_ids ?? []).join(' · ')}</p></div>
        </div>
      </div>

      {/* S2 Forwarding Details */}
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

      {/* S3 Approval Details — always show if approved */}
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

      {/* S2 Evidence Photos */}
      <div className="rounded-lg border border-violet-200 overflow-hidden">
        <div className="bg-violet-50 px-4 py-2.5 border-b border-violet-200 flex items-center gap-2">
          <span>📷</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-violet-700">S2 Evidence Photos</span>
          {evidenceItems.length > 0 && (
            <span className="ml-auto text-[11px] text-violet-500 font-semibold">
              {evidenceItems.length} photo{evidenceItems.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {evidenceLoading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : evidenceItems.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-400 text-center">No evidence photos uploaded yet.</p>
        ) : (
          <div className="p-4 flex flex-col gap-5">
            {isolationPhotos.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">🔒 Isolation Evidence ({isolationPhotos.length})</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {isolationPhotos.map((item, i) => <EvidenceThumb key={item.path} signedUrl={item.signed_url} path={item.path} index={i} />)}
                </div>
              </div>
            )}
            {tbtPhotos.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">📋 Tool Box Talk Evidence ({tbtPhotos.length})</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {tbtPhotos.map((item, i) => <EvidenceThumb key={item.path} signedUrl={item.signed_url} path={item.path} index={i} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Full PTW form — read-only */}
      <HazardsSection values={fd} onChange={noop} readOnly />
      <RisksSection values={fd} onChange={noop} readOnly />
      <PPESection values={fd} onChange={noop} readOnly />
      <PrecautionsSection values={fd} onChange={noop} readOnly />
      <AssociatedPermitsSection values={fd} onChange={noop} readOnly />
      <ToolsSection values={fd} onChange={noop} readOnly />
      <IssuerChecklistSection values={fd} onChange={noop} readOnly />
      <PeopleSection values={fd} onChange={noop} readOnly hideHolderIssuer
        receiverDatetime={
          fmtDateTime(String((fd as Record<string, unknown>)['receiver_datetime'] ?? ''))
          || fmtDateTime(String((ptw as Record<string, unknown>).date_s1_created ?? ''))
        }
      />
      <UndertakingSection values={fd} onChange={noop} readOnly />

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="primary" loading={downloading} onClick={handleDownloadPdf}>
          ⬇ Download PDF
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// S3 Approve Modal
// ─────────────────────────────────────────────────────────────────────────────

function S3ApproveModal({
  ptw, loggedInUsername, onClose, onSuccess,
}: {
  ptw: PTWRequest
  loggedInUsername: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [issuerName] = useState(loggedInUsername)
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const handleApprove = async () => {
    setSubmitting(true)
    setError('')
    try {
      await permitApi.s3ApprovePtwById(ptw.ptw_id, issuerName, remark.trim() || 'Approved')
      qc.invalidateQueries({ queryKey: ['permits', 's3'] })
      setApproved(true)
      setTimeout(() => onSuccess(), 2000)
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Approval failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (approved) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-10 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl">✅</div>
        <div>
          <p className="text-lg font-bold text-green-700">Permit Approved!</p>
          <p className="text-sm text-slate-500 mt-1">
            PTW <strong>{ptw.permit_no}</strong> has been approved by <strong>{issuerName}</strong>.
          </p>
          <p className="text-xs text-slate-400 mt-2">This window will close automatically…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-2">
      {/* Permit summary */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div><span className="text-slate-500 text-xs">Permit No</span><br /><strong className="font-mono text-xs">{ptw.permit_no}</strong></div>
          <div><span className="text-slate-500 text-xs">Site</span><br /><strong>{ptw.site_name}</strong></div>
          <div className="sm:col-span-2"><span className="text-slate-500 text-xs">Work Orders</span><br /><span className="text-xs font-mono break-all">{(ptw.work_order_ids ?? []).join(', ')}</span></div>
        </div>
      </div>

      {/* Permit Issuer — locked to logged-in user */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Permit Issuer
        </label>
        <div className="select bg-slate-50 border-slate-200 text-slate-700 cursor-not-allowed">
          {issuerName}
        </div>
        <p className="text-[11px] text-slate-400">Issuer is set to the currently logged-in user.</p>
      </div>

      {/* Remark */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Remark</label>
        <textarea
          className="input h-20 resize-none text-sm"
          placeholder="Optional approval remark…"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          disabled={submitting}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 flex items-start gap-2">
          <span className="mt-0.5">⚠</span><span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-200 gap-2">
        <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" loading={submitting} onClick={handleApprove}>
          ✓ Approve Permit
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main S3 Page
// ─────────────────────────────────────────────────────────────────────────────

export function S3Page() {
  const lang = useLang()
  const user = useUser()
  const loggedInUsername = user?.username ?? ''

  const [pendingSite,  setPendingSite]  = useState('')
  const [pendingStart, setPendingStart] = useState(todayStr)
  const [pendingEnd,   setPendingEnd]   = useState(todayStr)
  const [site,         setSite]         = useState('')
  const [startDate,    setStartDate]    = useState(todayStr)
  const [endDate,      setEndDate]      = useState(todayStr)
  // Data queries are disabled until the user explicitly clicks Apply Filter
  const [filterApplied, setFilterApplied] = useState(false)

  const [viewPtw,    setViewPtw]    = useState<PTWRequest | null>(null)
  const [approvePtw, setApprovePtw] = useState<PTWRequest | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [downloadingPtwId, setDownloadingPtwId] = useState<string | null>(null)

  // Work Orders tab (S3 — create + edit, same logic as S2)
  const [activeTab, setActiveTab]       = useState<ActiveTab>('ptw')
  const [showCreateWO, setShowCreateWO] = useState(false)
  const [editWO, setEditWO]             = useState<WorkOrder | null>(null)
  const [woToast, setWoToast]           = useState('')

  const handleDownload = async (ptw: PTWRequest) => {
    setDownloadingPtwId(ptw.ptw_id)
    try {
      const blob = await permitApi.s1DownloadPdf(ptw.ptw_id)
      downloadBlob(blob, `PTW_${ptw.permit_no}.pdf`)
    } catch {
      alert('PDF generation failed. Please try again.')
    } finally {
      setDownloadingPtwId(null)
    }
  }

  const filterParams = useMemo(() => ({
    site_name:  site      || undefined,
    start_date: startDate || undefined,
    end_date:   endDate   || undefined,
  }), [site, startDate, endDate])

  const { data: sites = [], isLoading: sitesLoading, isFetched: sitesFetched } = useQuery({ queryKey: keys.metaAllowedSites(), queryFn: metaApi.allowedSites, staleTime: 5 * 60_000 })
  const { data: woData, isLoading: woLoading } = useQuery({
    queryKey: keys.s3WorkOrders(filterParams),
    queryFn: () => permitApi.s3WorkOrders(filterParams),
    enabled: filterApplied,
  })
  const kpis: WorkOrderKpis = { ...DEFAULT_KPIS, ...(woData?.kpis ?? {}) }
  const workOrders = (woData?.data ?? []) as WorkOrder[]

  const { data: ptws = [], isLoading: ptwLoading, error: ptwError } = useQuery({
    queryKey: keys.s3Ptw(filterParams),
    queryFn: () => permitApi.s3ListPtw(filterParams),
    enabled: filterApplied,
  })

  const applyFilter = () => {
    setSite(pendingSite)
    setStartDate(pendingStart)
    setEndDate(pendingEnd)
    setFilterApplied(true)
  }

  const tableRows = useMemo(() => ptws.map((p) => {
    const fd = (p.form_data as Record<string, unknown>) ?? {}
    return {
      ...p,
      _ptw: p,
      permit_no_display:   p.permit_no ?? '',
      site_display:        p.site_name ?? '—',
      receiver_display:    String((p as Record<string, unknown>).receiver_name ?? fd.receiver_name ?? fd.permit_receiver ?? '—'),
      holder_display:      String((p as Record<string, unknown>).holder_name ?? fd.permit_holder ?? fd.holder_name ?? '—'),
      forwarded_display:   (p as Record<string, unknown>).date_s2_forwarded
        ? fmtDateTime(String((p as Record<string, unknown>).date_s2_forwarded)) : '—',
      status_display:      p.derived_status ?? 'PENDING_S3',
    }
  }), [ptws])

  const tableCols: ColDef[] = [
    {
      key: 'permit_no_display',
      label: tl('Permit No', lang),
      width: '200px',
      wrap: true,
      render: (row) => <PermitNoCell value={String(row.permit_no_display ?? '')} />,
    },
    {
      key: 'receiver_display',
      label: tl('Receiver', lang),
      width: '150px',
    },
    {
      key: 'holder_display',
      label: tl('Holder', lang),
      width: '200px',
    },
    {
      key: 'forwarded_display',
      label: tl('Forwarded At', lang),
      width: '160px',
      filterable: false,
    },
    {
      key: 'status_display',
      label: tl('Status', lang),
      width: '145px',
      filterable: false,
      render: (row) => <WOStatusBadge status={String(row.status_display)} />,
    },
    {
      key: '_action',
      label: tl('Action', lang),
      width: '230px',
      filterable: false,
      render: (row) => {
        const ptw = row._ptw as PTWRequest
        const status = ptw.derived_status ?? 'PENDING_S3'
        const canApprove = status === 'PENDING_S3'
        const isDownloading = downloadingPtwId === ptw.ptw_id
        return (
          <div className="flex gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setViewPtw(ptw)} className="text-xs">View</Button>
            {canApprove && (
              <Button variant="primary" size="sm" onClick={() => setApprovePtw(ptw)} className="text-xs bg-green-600 hover:bg-green-700">
                ✓ Approve
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              disabled={isDownloading}
              onClick={() => handleDownload(ptw)}
            >
              {isDownloading ? <><Spinner size="sm" /> Downloading…</> : '⬇ PDF'}
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-5 pl-1 md:pl-2">
      {/* Header */}
      <div className="pt-1">
        <h1 className="font-display text-xl md:text-2xl text-navy-800 font-bold">
          {tl('S3 — Permit Approval', lang)}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {tl('Review forwarded permits · Issue approval · Download stamped PDFs', lang)}
        </p>
      </div>

      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700 flex items-center justify-between">
          ✅ {successMsg}
          <button onClick={() => setSuccessMsg('')} className="text-green-500 hover:text-green-700 ml-4">✕</button>
        </div>
      )}

      {/* Universal Filter */}
      <Card className="p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">
          {tl('Universal Filter', lang)}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase">{tl('Site', lang)}</label>
            {sitesLoading ? (
              <select className="select text-sm" disabled>
                <option>Loading sites…</option>
              </select>
            ) : sitesFetched && sites.length === 0 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 font-medium">
                ⚠️ No site access configured. Contact your administrator.
              </div>
            ) : (
              <select className="select text-sm" value={pendingSite} onChange={(e) => setPendingSite(e.target.value)}>
                <option value="">— Select site —</option>
                {sites.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase">{tl('Start Date', lang)}</label>
            <input type="date" className="input text-sm" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase">{tl('End Date', lang)}</label>
            <input type="date" className="input text-sm" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1 justify-end">
            <label className="text-[11px] font-semibold text-transparent uppercase select-none">Apply</label>
            <Button variant="primary" onClick={applyFilter} className="w-full">{tl('Apply Filter', lang)}</Button>
          </div>
        </div>
      </Card>

      {/* KPI Cards — only shown once filter is applied */}
      {filterApplied && <KpiSummary kpis={kpis} loading={woLoading} />}

      {/* Toast */}
      {woToast && <Toast message={woToast} onDismiss={() => setWoToast('')} />}

      {/* Sub-header navigation + tabbed content */}
      <div className="rounded-xl border-2 border-slate-200 shadow-sm overflow-hidden">
        <SubNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onCreateWorkOrder={() => setShowCreateWO(true)}
        />

        <div className="p-4">
          {/* ── PTW Approval Table tab ── */}
          {activeTab === 'ptw' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-600">
                  {tl('PTW Approval Table', lang)}
                  {filterApplied && <span className="ml-2 text-xs text-slate-400 font-normal">({ptws.length} {tl('records', lang)})</span>}
                </span>
                {site && <span className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">{site}</span>}
              </div>
              {!filterApplied ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-400">
                  <span className="text-4xl">🔍</span>
                  <p className="text-sm font-medium text-slate-500">Select a site and date range, then click <strong>Apply Filter</strong></p>
                </div>
              ) : ptwError ? (
                <ErrorBanner message="Failed to load PTW records. Please try again." />
              ) : (
                <PaginatedTable
                  cols={tableCols}
                  rows={tableRows as unknown as Record<string, unknown>[]}
                  loading={ptwLoading}
                  emptyMsg="No S2-forwarded PTWs found for the selected filters."
                />
              )}
            </>
          )}

          {/* ── Work Orders tab (S3 — edit allowed same as S2) ── */}
          {activeTab === 'workorders' && (
            !filterApplied ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-400">
                <span className="text-4xl">🔍</span>
                <p className="text-sm font-medium text-slate-500">Select a site and date range, then click <strong>Apply Filter</strong></p>
              </div>
            ) : (
              <WorkOrdersTable
                workOrders={workOrders}
                loading={woLoading}
                allowEdit={true}
                onEdit={(wo) => setEditWO(wo)}
              />
            )
          )}
        </div>
      </div>

      {/* View Modal */}
      <Modal
        open={!!viewPtw}
        onClose={() => setViewPtw(null)}
        title={`View PTW — ${viewPtw?.permit_no ?? ''}`}
        width="max-w-4xl"
      >
        {viewPtw && <S3ViewModal ptw={viewPtw} onClose={() => setViewPtw(null)} />}
      </Modal>

      {/* Approve Modal */}
      <Modal
        open={!!approvePtw}
        onClose={() => setApprovePtw(null)}
        title={`Approve PTW — ${approvePtw?.permit_no ?? ''}`}
        width="max-w-lg"
      >
        {approvePtw && (
          <S3ApproveModal
            ptw={approvePtw}
            loggedInUsername={loggedInUsername}
            onClose={() => setApprovePtw(null)}
            onSuccess={() => {
              setApprovePtw(null)
              setSuccessMsg(`PTW ${approvePtw?.permit_no} approved successfully.`)
            }}
          />
        )}
      </Modal>

      {/* Create Work Order Modal */}
      <WorkOrderModal
        mode="create"
        portal="s3"
        sites={sites}
        open={showCreateWO}
        onClose={() => setShowCreateWO(false)}
        onSuccess={(msg) => { setWoToast(msg) }}
      />

      {/* Edit Work Order Modal (S3) */}
      <WorkOrderModal
        mode="edit"
        portal="s3"
        editPortal="s3"
        initialData={editWO ?? undefined}
        sites={sites}
        open={!!editWO}
        onClose={() => setEditWO(null)}
        onSuccess={(msg) => { setEditWO(null); setWoToast(msg) }}
      />
    </div>
  )
}
