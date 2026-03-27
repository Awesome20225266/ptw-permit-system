// src/pages/S2Page.tsx — S2 Permit Forwarding (v4: work orders tab + create/edit)

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { permitApi, downloadBlob } from '@/lib/api'
import { keys } from '@/hooks/useQueryKeys'
import { fmtDateTime } from '@/lib/utils'
import { Badge, Button, Card, EmptyState, ErrorBanner, Spinner, Modal } from '@/components/ui'
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
// Status badge (identical colours to S1)
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
// KPI cards
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
// Paginated table (same as S1 — Excel-style column filters + pagination)
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

  const setFilter = (key: string, val: string) => { setColFilters((f) => ({ ...f, [key]: val })); setPage(1) }

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
  const safePage = Math.min(page, totalPages)
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              {cols.map((col) => (
                <th key={col.key} style={{ width: col.width }} className="px-3 py-2 text-left font-semibold text-slate-600 align-top">
                  <div className="text-[11px] uppercase tracking-wide mb-1 whitespace-nowrap">{col.label}</div>
                  {col.filterable !== false && (
                    <input type="text" className="w-full text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-white font-normal outline-none focus:border-amber-400 transition-colors" placeholder="Filter…" value={colFilters[col.key] ?? ''} onChange={(e) => setFilter(col.key, e.target.value)} />
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
                <tr key={i} className="border-b border-slate-100 hover:bg-amber-50/40 transition-colors">
                  {cols.map((col) => (
                    <td key={col.key} className={`px-3 py-2.5 text-sm ${col.wrap ? 'break-words' : 'whitespace-nowrap'}`}>
                      {col.render ? col.render(row) : (String(row[col.key] ?? '') || '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 pt-3 pb-1 text-xs text-slate-500">
          <span>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={safePage === 1} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => Math.abs(p - safePage) <= 2).map((p) => (
              <button key={p} onClick={() => setPage(p)} className={`px-2 py-1 rounded border text-xs font-semibold transition-colors ${p === safePage ? 'bg-amber-400 border-amber-400 text-white' : 'border-slate-200 hover:bg-slate-50'}`}>{p}</button>
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
// Permit No renderer — same style as S1 ManagePTWTab
// ─────────────────────────────────────────────────────────────────────────────

function PermitNoCell({ value }: { value: string }) {
  const parts = (value ?? '').replace(/^PTW-/, '').split('/')
  const isWO = (value ?? '').startsWith('WO_')
  if (isWO) {
    const segments = (value ?? '').split('-')
    return (
      <div className="font-mono text-xs font-bold text-navy-800">
        <span className="block">{segments[0]}</span>
        {segments.length > 1 && <span className="text-slate-500 font-normal">{segments.slice(1).join('-')}</span>}
      </div>
    )
  }
  return (
    <div className="font-mono text-xs font-bold text-navy-800">
      <span className="text-amber-700">PTW-</span>
      {parts.map((p, i) => <span key={i} className="block">{i > 0 ? `/${p}` : p}</span>)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera Capture — live camera + GPS watermark (fixed black frame timing)
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
  const [videoReady, setVideoReady] = useState(false)   // true once frames arrive
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [camError, setCamError] = useState('')

  // Assign stream to video element AFTER React renders the <video> tag
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {/* ignore play() race */})
    }
  }, [stream])

  // Cleanup on unmount
  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()) }, [stream])

  const openCamera = async () => {
    setCamError('')
    setVideoReady(false)
    setIsOpen(true)

    // Start GPS (non-blocking — failure shows warning only)
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

    // Watermark bar
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
// S2 View Modal — full read-only form + PDF download
// ─────────────────────────────────────────────────────────────────────────────

function S2ViewModal({ ptw, onClose }: { ptw: PTWRequest; onClose: () => void }) {
  const fd = (ptw.form_data ?? {}) as PTWFormData & Record<string, unknown>
  const noop = () => {}
  const [downloading, setDownloading] = useState(false)

  const permitHolder = String(fd.permit_holder ?? fd.holder_name ?? '—')
  const isoReq       = String(fd.isolation_requirement ?? '—')
  const dateS2       = fd.date_s2_forwarded ? fmtDateTime(String(fd.date_s2_forwarded)) : '—'

  // S3 Approval Details
  const issuerName = String(fd.permit_issuer_name ?? fd.issuer_name ?? '—')
  const issuerDt   = fd.issuer_datetime ? fmtDateTime(String(fd.issuer_datetime)) : '—'
  const s3Remark   = String(fd.s3_remark ?? fd.remark ?? '—')

  // ── Fetch S2 evidence (isolation + tbt folders) ──────────────────────────
  const { data: evidenceItems = [], isLoading: evidenceLoading } = useQuery({
    queryKey: ['s2-evidence', ptw.ptw_id],
    queryFn: () => permitApi.s2EvidenceList(ptw.ptw_id),
    staleTime: 0,
    retry: 2,
  })

  // Group evidence by folder (signed_url provided by backend — no auth header needed)
  const isolationPhotos = evidenceItems.filter((item) => item.folder === 'isolation')
  const tbtPhotos = evidenceItems.filter((item) => item.folder === 'tbt')

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

  // Combine both key names for backward compat with old PTW data
  const validityDate = String((fd as Record<string, unknown>).permit_validity_date ?? (fd as Record<string, unknown>).validity_date ?? '—')
  const descWork = String((fd as Record<string, unknown>).description_of_work ?? (fd as Record<string, unknown>).work_description ?? '—')
  const workLoc = String((fd as Record<string, unknown>).work_location ?? '—')
  const contractor = String((fd as Record<string, unknown>).contractor_name ?? '—')
  const receiver = String((fd as Record<string, unknown>).permit_receiver ?? (fd as Record<string, unknown>).receiver_name ?? '—')
  const startTime  = String((fd as Record<string, unknown>).start_time ?? '')
  const endTime    = String((fd as Record<string, unknown>).end_time ?? '')

  return (
    // No max-h/overflow here — the Modal component handles scrolling
    <div className="flex flex-col gap-4 pb-2">
      {/* ── Permit header ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Permit Details</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 p-4 text-sm">
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Permit No</p><p className="font-mono font-bold text-navy-800">{ptw.permit_no}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Status</p><WOStatusBadge status={ptw.derived_status ?? 'PENDING_S2'} /></div>
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

      {/* ── S2 Forwarding Details — only if forwarded ─────────────────── */}
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

      {/* ── S3 Approval Details — only if approved ────────────────────── */}
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

      {/* ── S2 Evidence Photos ────────────────────────────────────────── */}
      <div className="rounded-lg border border-violet-200 overflow-hidden">
        <div className="bg-violet-50 px-4 py-2.5 border-b border-violet-200 flex items-center gap-2">
          <span>📷</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-violet-700">
            S2 Evidence Photos
          </span>
          {evidenceItems.length > 0 && (
            <span className="ml-auto text-[11px] text-violet-500 font-semibold">
              {evidenceItems.length} photo{evidenceItems.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {evidenceLoading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : evidenceItems.length === 0 ? (
          <div className="px-4 py-5 text-sm text-slate-400 text-center">
            No evidence photos uploaded yet.
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-5">
            {/* Isolation Evidence */}
            {isolationPhotos.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  🔒 Isolation Evidence ({isolationPhotos.length})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {isolationPhotos.map((item, i) => (
                    <EvidenceThumb
                      key={item.path}
                      signedUrl={item.signed_url}
                      path={item.path}
                      index={i}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* TBT / Signature Evidence */}
            {tbtPhotos.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  📋 Tool Box Talk Evidence ({tbtPhotos.length})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {tbtPhotos.map((item, i) => (
                    <EvidenceThumb
                      key={item.path}
                      signedUrl={item.signed_url}
                      path={item.path}
                      index={i}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Full PTW form — read only ─────────────────────────────────── */}
      <HazardsSection values={fd} onChange={noop} readOnly />
      <RisksSection values={fd} onChange={noop} readOnly />
      <PPESection values={fd} onChange={noop} readOnly />
      <PrecautionsSection values={fd} onChange={noop} readOnly />
      <AssociatedPermitsSection values={fd} onChange={noop} readOnly />
      <ToolsSection values={fd} onChange={noop} readOnly />
      <IssuerChecklistSection values={fd} onChange={noop} readOnly />
      <PeopleSection values={fd} onChange={noop} readOnly
        receiverDatetime={
          fmtDateTime(String((fd as Record<string, unknown>)['receiver_datetime'] ?? ''))
          || fmtDateTime(String((ptw as unknown as Record<string, unknown>).date_s1_created ?? ''))
        }
      />
      <UndertakingSection values={fd} onChange={noop} readOnly />

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-200 mt-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        <Button variant="primary" size="sm" loading={downloading} onClick={handleDownloadPdf}>
          ⬇ Download PDF
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence thumbnail — uses a Supabase pre-signed URL (no auth header needed)
// ─────────────────────────────────────────────────────────────────────────────

function EvidenceThumb({
  signedUrl, path, index,
}: { signedUrl: string; path: string; index: number }) {
  const fileName = path.split('/').pop() ?? `photo_${index + 1}`

  // Friendly label: strip extension and trailing timestamp suffix
  const label = fileName
    .replace(/\.(jpg|jpeg|png|webp)$/i, '')
    .replace(/_\d{13}_\d{8}_\d{6}$/, '')   // strip _1772695509241_20260305_125509
    .replace(/_\d{8}_\d{6}$/, '')           // strip _20260305_125509
    .replace(/_/g, ' ')
    .trim() || `Photo ${index + 1}`

  const [objectUrl, setObjectUrl] = React.useState<string | null>(null)
  const [errored, setErrored] = React.useState(false)
  const [loading, setLoading] = React.useState(true)

  // Fetch image via signed URL and create an object URL to avoid CORS restrictions
  React.useEffect(() => {
    if (!signedUrl) { setLoading(false); setErrored(true); return }
    let revoked = false
    fetch(signedUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.blob()
      })
      .then((blob) => {
        if (!revoked) {
          setObjectUrl(URL.createObjectURL(blob))
          setLoading(false)
        }
      })
      .catch(() => {
        if (!revoked) { setLoading(false); setErrored(true) }
      })
    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedUrl])

  const displaySrc = objectUrl ?? signedUrl

  return (
    <a
      href={signedUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg overflow-hidden border border-slate-200 hover:border-violet-400 transition-colors"
    >
      {loading ? (
        <div className="w-full h-32 bg-slate-100 animate-pulse flex items-center justify-center text-[11px] text-slate-400">
          Loading…
        </div>
      ) : errored ? (
        <div className="w-full h-32 bg-red-50 flex flex-col items-center justify-center text-[11px] text-red-400 gap-1">
          <span>⚠ Failed to load</span>
          <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="underline text-violet-500">
            Open in tab
          </a>
        </div>
      ) : (
        <img
          src={displaySrc}
          alt={label}
          className="w-full h-32 object-cover bg-slate-100 group-hover:opacity-90 transition-opacity"
          onError={() => setErrored(true)}
        />
      )}
      <div className="px-2 py-1.5 bg-slate-50 border-t border-slate-100">
        <p className="text-[10px] text-slate-500 truncate">{label || fileName}</p>
      </div>
    </a>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// S2 Process Modal — permit holder (default = logged-in user), isolation, TBT
// ─────────────────────────────────────────────────────────────────────────────

function S2ProcessModal({
  ptw, users, onClose, onSuccess,
}: {
  ptw: PTWRequest; users: string[]; onClose: () => void; onSuccess: () => void
}) {
  const fd = (ptw.form_data ?? {}) as PTWFormData & Record<string, unknown>
  const currentUser = useUser()
  const loggedInUsername = currentUser?.username ?? ''

  // Pre-fill permit holder: existing value → logged-in user → empty
  const [permitHolder, setPermitHolder] = useState(
    String(fd.permit_holder ?? fd.holder_name ?? loggedInUsername)
  )
  const [isolationReq, setIsolationReq] = useState<'YES' | 'NO'>(
    String(fd.isolation_requirement ?? 'NO').toUpperCase() === 'YES' ? 'YES' : 'NO'
  )
  const [isolationBlob, setIsolationBlob] = useState<Blob | null>(null)
  const [tbtBlob, setTbtBlob] = useState<Blob | null>(null)
  const [sigBlob, setSigBlob] = useState<Blob | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitStep, setSubmitStep] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const primaryWo = (ptw.work_order_ids ?? [])[0] ?? ptw.ptw_id
  const isAlreadyForwarded = ptw.derived_status === 'PENDING_S3'

  // Build user list: ensure logged-in user is always first option
  const userOptions = useMemo(() => {
    const list = [...users]
    if (loggedInUsername && !list.includes(loggedInUsername)) list.unshift(loggedInUsername)
    return list
  }, [users, loggedInUsername])

  const uploadFile = async (blob: Blob, folder: string, filename: string) => {
    await permitApi.s2UploadEvidence(ptw.ptw_id, blob, primaryWo, folder, filename)
  }

  const handleSubmit = async () => {
    if (!permitHolder.trim()) { setError('Please select a Permit Holder.'); return }
    if (isolationReq === 'YES' && !isolationBlob) { setError('Isolation evidence photo is required when Isolation = YES.'); return }
    if (!tbtBlob) { setError('Tool Box Talk photo is required.'); return }
    if (!sigBlob) { setError('Signature Sheet photo is required.'); return }

    setSubmitting(true)
    setSubmitStep('')
    setError('')

    const extractMsg = (err: unknown): string => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail
      if (!detail) return ''
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join('; ')
      return JSON.stringify(detail)
    }

    try {
      if (isolationReq === 'YES' && isolationBlob) {
        setSubmitStep('Uploading isolation evidence…')
        await uploadFile(isolationBlob, 'isolation', `isolation_${Date.now()}.jpg`)
      }
      setSubmitStep('Uploading Tool Box Talk photo…')
      await uploadFile(tbtBlob!, 'tbt', `tbt_photo_${Date.now()}.jpg`)
      setSubmitStep('Uploading signature sheet…')
      await uploadFile(sigBlob!, 'tbt', `signature_${Date.now()}.jpg`)

      setSubmitStep('Forwarding permit to S3…')
      await permitApi.s2ForwardPtw(ptw.ptw_id, {
        work_order_ids: ptw.work_order_ids ?? [],
        permit_holder: permitHolder.trim(),
        isolation_requirement: isolationReq,
        form_data_updates: {},
      })

      qc.invalidateQueries({ queryKey: ['permits', 's2'] })
      setSubmitStep('')
      setSubmitted(true)
      // Auto-close after 2 seconds with success callback
      setTimeout(() => { onSuccess() }, 2000)
    } catch (err: unknown) {
      const msg = extractMsg(err)
      setError(msg ? `Submission failed: ${msg}` : 'Submission failed. Check console for details.')
      console.error('[S2 submit]', err)
    } finally {
      setSubmitting(false)
      setSubmitStep('')
    }
  }

  const handleRevoke = async () => {
    if (!window.confirm('Revoke S2 forwarding? This resets the permit back to Pending S2.')) return
    try {
      await permitApi.s2RevokePtw(ptw.ptw_id, ptw.work_order_ids ?? [])
      qc.invalidateQueries({ queryKey: ['permits', 's2'] })
      onClose()
    } catch { setError('Revoke failed.') }
  }

  // ── Success screen — shown briefly after successful submission ──────────────
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-10 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl">✅</div>
        <div>
          <p className="text-lg font-bold text-green-700">Permit Submitted for S3 Approval!</p>
          <p className="text-sm text-slate-500 mt-1">
            PTW <strong>{ptw.permit_no}</strong> has been forwarded to S3 by <strong>{permitHolder}</strong>.
          </p>
          <p className="text-xs text-slate-400 mt-2">This window will close automatically…</p>
        </div>
      </div>
    )
  }

  return (
    // No max-h/overflow here — Modal handles scrolling
    <div className="flex flex-col gap-5 pb-2">
      {/* Permit summary */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-slate-500 text-xs">Permit No</span><br /><strong className="font-mono text-xs">{ptw.permit_no}</strong></div>
          <div><span className="text-slate-500 text-xs">Site</span><br /><strong>{ptw.site_name}</strong></div>
          <div className="col-span-2"><span className="text-slate-500 text-xs">Work Orders</span><br /><span className="text-xs font-mono break-all">{(ptw.work_order_ids ?? []).join(', ')}</span></div>
        </div>
      </div>

      {/* Step progress indicator during submission */}
      {submitStep && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-700 flex items-center gap-2">
          <Spinner />
          <span>{submitStep}</span>
        </div>
      )}

      {isAlreadyForwarded && (
        <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-2 text-sm text-sky-700">
          ℹ This PTW is already forwarded to S3. You may edit and re-submit, or revoke.
        </div>
      )}

      {/* Permit Holder */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Permit Holder <span className="text-red-500">*</span>
        </label>
        <select className="select" value={permitHolder} onChange={(e) => setPermitHolder(e.target.value)}>
          <option value="">— Select Permit Holder —</option>
          {userOptions.map((u) => (
            <option key={u} value={u}>{u}{u === loggedInUsername ? ' (you)' : ''}</option>
          ))}
        </select>
      </div>

      {/* Isolation Requirement */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Isolation Requirement <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-6">
          {(['YES', 'NO'] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="radio" checked={isolationReq === opt} onChange={() => setIsolationReq(opt)} className="w-4 h-4 accent-amber-500" />
              <span className={`text-sm font-bold ${opt === 'YES' ? 'text-orange-600' : 'text-slate-700'}`}>{opt}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Isolation Evidence */}
      {isolationReq === 'YES' && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-orange-700 mb-3">
            Isolation Evidence Photo <span className="text-red-500">*</span>
          </p>
          <CameraCapture label="Capture isolation board / LOTO / breaker photo" onCapture={({ blob }) => setIsolationBlob(blob)} disabled={submitting} />
        </div>
      )}

      {/* Tool Box Talk */}
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-4">Tool Box Talk Evidence</p>
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs text-slate-500 mb-2">Photo 1 — TBT Group Photo (workers attending meeting) <span className="text-red-500">*</span></p>
            <CameraCapture label="TBT Group Photo" onCapture={({ blob }) => setTbtBlob(blob)} disabled={submitting} />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-2">Photo 2 — Signature Sheet (workers signing) <span className="text-red-500">*</span></p>
            <CameraCapture label="Signature Sheet Photo" onCapture={({ blob }) => setSigBlob(blob)} disabled={submitting} />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 flex items-start gap-2">
          <span className="mt-0.5">⚠</span>
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-200 gap-2">
        <div>
          {isAlreadyForwarded && (
            <Button variant="ghost" size="sm" onClick={handleRevoke} disabled={submitting}>↩ Revoke</Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" loading={submitting} onClick={handleSubmit}>Submit for Approval ➜</Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main S2 Page
// ─────────────────────────────────────────────────────────────────────────────

export function S2Page() {
  const lang = useLang()

  const [pendingSite, setPendingSite] = useState('')
  const [pendingStart, setPendingStart] = useState(todayStr)
  const [pendingEnd, setPendingEnd] = useState(todayStr)
  const [site, setSite] = useState('')
  const [startDate, setStartDate] = useState(todayStr)
  const [endDate, setEndDate] = useState(todayStr)

  const [viewPtw, setViewPtw] = useState<PTWRequest | null>(null)
  const [processPtw, setProcessPtw] = useState<PTWRequest | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [downloadingPtwId, setDownloadingPtwId] = useState<string | null>(null)

  // Work Orders tab
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
    site_name: site || undefined,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  }), [site, startDate, endDate])

  const { data: sites = [] } = useQuery({ queryKey: keys.s2WorkOrderSites(), queryFn: permitApi.s2WorkOrderSites })
  const { data: users = [] } = useQuery({ queryKey: keys.s2Users(), queryFn: permitApi.s2Users })
  const { data: woData, isLoading: woLoading } = useQuery({ queryKey: keys.s2WorkOrders(filterParams), queryFn: () => permitApi.s2WorkOrders(filterParams) })
  const kpis: WorkOrderKpis = { ...DEFAULT_KPIS, ...(woData?.kpis ?? {}) }
  const workOrders = (woData?.data ?? []) as WorkOrder[]
  const { data: ptws = [], isLoading: ptwLoading, error: ptwError } = useQuery({ queryKey: keys.s2Ptw(filterParams), queryFn: () => permitApi.s2ListPtw(filterParams) })

  const applyFilter = () => { setSite(pendingSite); setStartDate(pendingStart); setEndDate(pendingEnd) }

  const tableRows = useMemo(() => ptws.map((p) => ({
    ...p,
    _ptw: p,
    permit_no_display: p.permit_no ?? '',
    permit_holder_display: String((p.form_data as Record<string, unknown>)?.permit_holder ?? (p.form_data as Record<string, unknown>)?.holder_name ?? '—'),
    status_display: p.derived_status ?? 'PENDING_S2',
  })), [ptws])

  const tableCols: ColDef[] = [
    {
      key: 'permit_no_display',
      label: tl('Permit No', lang),
      width: '180px',
      wrap: true,
      render: (row) => <PermitNoCell value={String(row.permit_no_display ?? '')} />,
    },
    {
      key: 'permit_holder_display',
      label: tl('Permit Holder', lang),
      width: '150px',
    },
    {
      key: 'created_by',
      label: tl('Created By', lang),
      width: '120px',
    },
    {
      key: 'status_display',
      label: tl('Status', lang),
      width: '150px',
      filterable: false,
      render: (row) => <WOStatusBadge status={String(row.status_display)} />,
    },
    {
      key: '_action',
      label: tl('Action', lang),
      width: '170px',
      filterable: false,
      render: (row) => {
        const ptw = row._ptw as PTWRequest
        const status = ptw.derived_status ?? 'PENDING_S2'
        const canProcess = status === 'PENDING_S2'
        const canEdit = status === 'PENDING_S3'
        const isDownloading = downloadingPtwId === ptw.ptw_id
        return (
          <div className="flex gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setViewPtw(ptw)} className="text-xs">View</Button>
            {(canProcess || canEdit) && (
              <Button variant="primary" size="sm" onClick={() => setProcessPtw(ptw)} className="text-xs">
                {canEdit ? 'Edit' : 'Process'}
              </Button>
            )}
            <Button
              variant="ghost" size="sm"
              onClick={() => handleDownload(ptw)}
              disabled={isDownloading}
              className="text-xs"
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
          {tl('S2 — Permit Forwarding', lang)}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {tl('Review S1 permits · Assign Permit Holder · Upload evidence · Forward to S3', lang)}
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
            <select className="select text-sm" value={pendingSite} onChange={(e) => setPendingSite(e.target.value)}>
              <option value="">{tl('All Sites', lang)}</option>
              {sites.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
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

      {/* KPI Cards */}
      <KpiSummary kpis={kpis} loading={woLoading} />

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
          {/* ── PTW Table tab ── */}
          {activeTab === 'ptw' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-600">
                  {tl('PTW Table', lang)}
                  <span className="ml-2 text-xs text-slate-400 font-normal">({ptws.length} {tl('records', lang)})</span>
                </span>
                {site && <span className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">{site}</span>}
              </div>
              {ptwError
                ? <ErrorBanner message="Failed to load PTW records. Please try again." />
                : <PaginatedTable
                    cols={tableCols}
                    rows={tableRows as unknown as Record<string, unknown>[]}
                    loading={ptwLoading}
                    emptyMsg={site ? 'No S1-submitted PTWs found for the selected filters.' : 'Select a site and date range, then click Apply Filter.'}
                  />
              }
            </>
          )}

          {/* ── Work Orders tab ── */}
          {activeTab === 'workorders' && (
            <WorkOrdersTable
              workOrders={workOrders}
              loading={woLoading}
              allowEdit
              onEdit={(wo) => setEditWO(wo)}
            />
          )}
        </div>
      </div>

      {/* View Modal */}
      <Modal open={!!viewPtw} onClose={() => setViewPtw(null)} title={`View PTW — ${viewPtw?.permit_no ?? ''}`} width="max-w-4xl">
        {viewPtw && <S2ViewModal ptw={viewPtw} onClose={() => setViewPtw(null)} />}
      </Modal>

      {/* Create Work Order Modal */}
      <WorkOrderModal
        mode="create"
        portal="s2"
        sites={sites}
        open={showCreateWO}
        onClose={() => setShowCreateWO(false)}
        onSuccess={(msg) => { setWoToast(msg) }}
      />

      {/* Edit Work Order Modal */}
      <WorkOrderModal
        mode="edit"
        portal="s2"
        initialData={editWO ?? undefined}
        sites={sites}
        open={!!editWO}
        onClose={() => setEditWO(null)}
        onSuccess={(msg) => { setEditWO(null); setWoToast(msg) }}
      />

      {/* Process Modal */}
      <Modal
        open={!!processPtw}
        onClose={() => setProcessPtw(null)}
        title={processPtw?.derived_status === 'PENDING_S3' ? `Edit S2 — ${processPtw?.permit_no ?? ''}` : `Process PTW — ${processPtw?.permit_no ?? ''}`}
        width="max-w-2xl"
      >
        {processPtw && (
          <S2ProcessModal
            ptw={processPtw}
            users={users}
            onClose={() => setProcessPtw(null)}
            onSuccess={() => { setProcessPtw(null); setSuccessMsg('PTW forwarded to S3 for approval.') }}
          />
        )}
      </Modal>
    </div>
  )
}
