// src/pages/WorkOrderComponents.tsx
// Shared Work Order modal, table, and sub-nav used by S2Page and S3Page.

import React, { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { permitApi, metaApi } from '@/lib/api'
import { keys } from '@/hooks/useQueryKeys'
import { useUser } from '@/store/authStore'
import { Button, Modal, Spinner } from '@/components/ui'
import type { WorkOrder, WorkOrderCreateInput, WorkOrderUpdateInput } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const FREQUENCY_OPTIONS = [
  { value: 'D',  label: 'D — Daily' },
  { value: 'W',  label: 'W — Weekly' },
  { value: 'Q',  label: 'Q — Quarterly' },
  { value: 'HY', label: 'HY — Half Yearly' },
  { value: 'Y',  label: 'Y — Yearly' },
  { value: 'UP', label: 'UP — Unplanned' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Toast notification
// ─────────────────────────────────────────────────────────────────────────────

interface ToastProps { message: string; onDismiss: () => void }
export function Toast({ message, onDismiss }: ToastProps) {
  React.useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700 flex items-center justify-between gap-3 shadow-sm">
      <span>✅ {message}</span>
      <button onClick={onDismiss} className="text-green-500 hover:text-green-700">✕</button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CreatableMultiInput — Enter-to-add tags for Location / Equipment
// ─────────────────────────────────────────────────────────────────────────────

interface CreatableMultiProps {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
  placeholder?: string
  /** Optional list of suggestions from master_db when a site is selected */
  suggestions?: string[]
  /** True while the suggestions query is in-flight */
  suggestionsLoading?: boolean
  /** True when a site has been selected (controls whether to show the dropdown UI) */
  siteSelected?: boolean
}

export function CreatableMultiInput({
  label, values, onChange, disabled, placeholder, suggestions,
  suggestionsLoading, siteSelected,
}: CreatableMultiProps) {
  const [input, setInput] = useState('')

  const add = (val?: string) => {
    const t = (val ?? input).trim()
    if (t && !values.includes(t)) onChange([...values, t])
    if (!val) setInput('')
  }

  const availableSuggestions = (suggestions ?? []).filter((s) => !values.includes(s))
  const showDropdownArea = siteSelected // show dropdown UI whenever a site is chosen

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</label>

      {/* Suggestion dropdown — visible as soon as a site is selected */}
      {showDropdownArea && (
        <select
          className="select text-sm"
          value=""
          onChange={(e) => { if (e.target.value) add(e.target.value) }}
          disabled={disabled || suggestionsLoading || availableSuggestions.length === 0}
        >
          {suggestionsLoading
            ? <option value="">Loading suggestions…</option>
            : availableSuggestions.length === 0
              ? <option value="">— No suggestions for this site —</option>
              : (
                <>
                  <option value="">— Select from list —</option>
                  {availableSuggestions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </>
              )
          }
        </select>
      )}

      {/* Manual input + Add button (preserved as-is) */}
      <div className="flex gap-2">
        <input
          type="text"
          className="input text-sm flex-1"
          placeholder={placeholder ?? `Type and press Enter…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          disabled={disabled}
        />
        <Button variant="ghost" size="sm" onClick={() => add()} disabled={disabled || !input.trim()}>+ Add</Button>
      </div>

      {/* Selected values as tags */}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-semibold">
              {v}
              {!disabled && (
                <button className="hover:text-red-600 ml-0.5 text-amber-600" onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkOrderModal — create or edit
// ─────────────────────────────────────────────────────────────────────────────

interface WorkOrderModalProps {
  mode: 'create' | 'edit'
  initialData?: WorkOrder
  /** Portal for create; also used for edit if editPortal is not provided */
  portal: 's2' | 's3'
  /** Override portal used for the edit API call (defaults to portal) */
  editPortal?: 's2' | 's3'
  sites: string[]
  open: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
}

export function WorkOrderModal({
  mode, initialData, portal, editPortal, sites, open, onClose, onSuccess,
}: WorkOrderModalProps) {
  const qc = useQueryClient()
  useUser() // ensures auth context is available for API calls

  const parseCSV = (v: string | null | undefined) =>
    (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)

  const [siteName, setSiteName]       = useState(initialData?.site_name ?? '')
  const [locations, setLocations]     = useState<string[]>(parseCSV(initialData?.location))
  const [equipments, setEquipments]   = useState<string[]>(parseCSV(initialData?.equipment))
  const [frequency, setFrequency]     = useState(initialData?.frequency ?? '')
  const [isoReq, setIsoReq]           = useState<'YES' | 'NO'>((initialData?.isolation_requirement as 'YES' | 'NO') ?? 'NO')
  const [datePlanned, setDatePlanned] = useState(initialData?.date_planned?.split('T')[0] ?? '')
  const [remark, setRemark]           = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState('')

  // Feature 1: fetch allowed sites for the logged-in user from dashboard_users
  const { data: allowedSites = [], isLoading: sitesLoading, isFetched: sitesFetched } = useQuery({
    queryKey: keys.metaAllowedSites(),
    queryFn: metaApi.allowedSites,
    enabled: open,
    staleTime: 5 * 60_000,
  })

  // Feature 2 & 3: fetch location / equipment suggestions when a site is selected
  const { data: locationSuggestions = [], isFetching: locLoading } = useQuery({
    queryKey: keys.metaMasterLocations(siteName),
    queryFn: () => metaApi.masterLocations(siteName),
    enabled: open && !!siteName,
    staleTime: 5 * 60_000,
  })

  const { data: equipmentSuggestions = [], isFetching: equipLoading } = useQuery({
    queryKey: keys.metaMasterEquipment(siteName),
    queryFn: () => metaApi.masterEquipment(siteName),
    enabled: open && !!siteName,
    staleTime: 5 * 60_000,
  })

  // The site dropdown shows user-specific allowed sites.
  // Falls back to the prop-provided sites list if allowed-sites query is empty
  // (e.g. before the query resolves or if dashboard_users entry is missing).
  const siteOptions = allowedSites.length > 0 ? allowedSites : sites

  React.useEffect(() => {
    if (!open) return
    setSiteName(initialData?.site_name ?? '')
    setLocations(parseCSV(initialData?.location))
    setEquipments(parseCSV(initialData?.equipment))
    setFrequency(initialData?.frequency ?? '')
    setIsoReq((initialData?.isolation_requirement as 'YES' | 'NO') ?? 'NO')
    setDatePlanned(initialData?.date_planned?.split('T')[0] ?? '')
    setRemark('')
    setError('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSubmit = async () => {
    if (!siteName)    { setError('Site Name is required.'); return }
    if (!frequency)   { setError('Frequency is required.'); return }
    if (!datePlanned) { setError('Planned Date is required.'); return }
    if (mode === 'edit' && !remark.trim()) { setError('Remark is required for edits.'); return }

    const body: WorkOrderCreateInput = {
      site_name: siteName,
      location: locations.join(','),
      equipment: equipments.join(','),
      frequency,
      isolation_requirement: isoReq,
      date_planned: datePlanned,
    }

    setSubmitting(true)
    setError('')
    try {
      if (mode === 'create') {
        await permitApi.createWorkOrder(body, portal)
        qc.invalidateQueries({ queryKey: ['permits', portal], exact: false })
        onSuccess('Work Order created successfully.')
      } else {
        const updateBody: WorkOrderUpdateInput = { ...body, remark: remark.trim() }
        const ep = editPortal ?? portal
        await permitApi.editWorkOrder(ep, initialData!.work_order_id, updateBody)
        qc.invalidateQueries({ queryKey: ['permits', ep], exact: false })
        onSuccess('Work Order updated successfully.')
      }
      onClose()
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Operation failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const title = mode === 'create'
    ? 'Create Work Order'
    : `Edit Work Order — ${initialData?.work_order_id ?? ''}`

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-2xl">
      <div className="flex flex-col gap-5 pb-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Site Name — filtered by logged-in user's allowed sites */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Site Name <span className="text-red-500">*</span>
            </label>
            {sitesLoading ? (
              <select className="select text-sm" disabled>
                <option>Loading sites…</option>
              </select>
            ) : sitesFetched && siteOptions.length === 0 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 font-medium">
                ⚠️ No site access configured for your account. Contact your administrator.
              </div>
            ) : (
              <select
                className="select text-sm"
                value={siteName}
                onChange={(e) => { setSiteName(e.target.value); setLocations([]); setEquipments([]) }}
                disabled={submitting}
              >
                <option value="">— Select Site —</option>
                {siteOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>

          {/* Frequency */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Frequency <span className="text-red-500">*</span>
            </label>
            <select
              className="select text-sm"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              disabled={submitting}
            >
              <option value="">— Select Frequency —</option>
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Location — suggestions from master_db when a site is selected */}
          <CreatableMultiInput
            label="Location"
            values={locations}
            onChange={setLocations}
            disabled={submitting}
            placeholder="e.g. Inverter Yard…"
            suggestions={locationSuggestions}
            suggestionsLoading={locLoading}
            siteSelected={!!siteName}
          />

          {/* Equipment — suggestions from master_db when a site is selected */}
          <CreatableMultiInput
            label="Equipment"
            values={equipments}
            onChange={setEquipments}
            disabled={submitting}
            placeholder="e.g. Transformer…"
            suggestions={equipmentSuggestions}
            suggestionsLoading={equipLoading}
            siteSelected={!!siteName}
          />

          {/* Planned Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Planned Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className="input text-sm"
              value={datePlanned}
              onChange={(e) => setDatePlanned(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* Isolation Requirement */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Isolation Requirement
            </label>
            <div className="flex gap-4 pt-2">
              {(['YES', 'NO'] as const).map((val) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer text-sm font-semibold">
                  <input
                    type="radio"
                    className="accent-amber-500 w-4 h-4"
                    checked={isoReq === val}
                    onChange={() => setIsoReq(val)}
                    disabled={submitting}
                  />
                  {val}
                </label>
              ))}
            </div>
          </div>

          {/* Remark (edit only) */}
          {mode === 'edit' && (
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Remark <span className="text-red-500">*</span>
              </label>
              <textarea
                className="input h-20 resize-none text-sm"
                placeholder="Reason for edit e.g. Updated location due to revised maintenance plan."
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                disabled={submitting}
              />
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 flex items-start gap-2">
            <span className="mt-0.5">⚠</span><span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-200 gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" loading={submitting} onClick={handleSubmit}>
            {mode === 'create' ? '+ Create Work Order' : '✓ Update Work Order'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge (local, matches S2/S3 colours)
// ─────────────────────────────────────────────────────────────────────────────

const WO_STATUS_META: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  OPEN:           { label: 'Open',           bg: 'bg-sky-100',    text: 'text-sky-700',    dot: 'bg-sky-500' },
  PENDING_S2:     { label: 'Pending S2',     bg: 'bg-orange-100', text: 'text-orange-600', dot: 'bg-orange-500' },
  PENDING_S3:     { label: 'Pending S3',     bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-600' },
  APPROVED:       { label: 'Approved',       bg: 'bg-lime-100',   text: 'text-lime-700',   dot: 'bg-lime-500' },
  CLOSED:         { label: 'Closed',         bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
  PERMIT_EXPIRED: { label: 'Permit Expired', bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
}

function WOBadge({ status }: { status: string }) {
  const m = WO_STATUS_META[status] ?? { label: status, bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${m.bg} ${m.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.dot}`} />
      {m.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkOrdersTable
// ─────────────────────────────────────────────────────────────────────────────

const WO_PAGE_SIZE = 11

interface WorkOrdersTableProps {
  workOrders: WorkOrder[]
  loading: boolean
  /** When true shows Edit button (only when date_s1_created IS NULL) */
  allowEdit?: boolean
  onEdit?: (wo: WorkOrder) => void
}

export function WorkOrdersTable({ workOrders, loading, allowEdit = false, onEdit }: WorkOrdersTableProps) {
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const base = q
      ? workOrders.filter((wo) =>
          [wo.work_order_id, wo.site_name, wo.location, wo.equipment, wo.frequency]
            .some((v) => String(v ?? '').toLowerCase().includes(q))
        )
      : workOrders
    return base
  }, [workOrders, search])

  // Reset page when filter changes
  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1) }, [])

  const totalPages = Math.max(1, Math.ceil(filtered.length / WO_PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = filtered.slice((safePage - 1) * WO_PAGE_SIZE, safePage * WO_PAGE_SIZE)

  const colSpan = allowEdit ? 9 : 8

  return (
    <div className="flex flex-col gap-3">
      {/* Quick search */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          className="input text-sm w-64"
          placeholder="🔍 Quick search…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {search && (
          <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => handleSearch('')}>✕ Clear</button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              {[
                'Work Order ID', 'Site', 'Location', 'Equipment',
                'Freq.', 'Isolation', 'Planned Date', 'Status',
                ...(allowEdit ? ['Action'] : []),
              ].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} className="text-center py-10"><Spinner /></td></tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="text-center py-10 text-sm text-slate-400">
                  {search ? 'No matching work orders.' : 'No work orders found for the selected filters.'}
                </td>
              </tr>
            ) : (
              pageRows.map((wo) => (
                <tr key={wo.work_order_id} className="border-b border-slate-100 hover:bg-amber-50/40 transition-colors">
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs font-bold text-sky-700 break-all leading-tight">{wo.work_order_id}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">{wo.site_name}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[140px]">
                    {wo.location
                      ? wo.location.split(',').map((l, i) => <span key={i} className="block">{l.trim()}</span>)
                      : <span className="text-slate-400">—</span>
                    }
                  </td>
                  <td className="px-3 py-2.5 text-xs max-w-[120px]">
                    {wo.equipment
                      ? wo.equipment.split(',').map((e, i) => <span key={i} className="block">{e.trim()}</span>)
                      : <span className="text-slate-400">—</span>
                    }
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap font-semibold">{wo.frequency ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                      wo.isolation_requirement === 'YES' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {wo.isolation_requirement ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {wo.date_planned ? wo.date_planned.split('T')[0] : '—'}
                  </td>
                  <td className="px-3 py-2.5"><WOBadge status={wo.status as string} /></td>
                  {allowEdit && (
                    <td className="px-3 py-2.5">
                      {!wo.date_s1_created ? (
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => onEdit?.(wo)}>
                          ✏️ Edit
                        </Button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">PTW started</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-1.5 border-t border-slate-200 bg-slate-50 rounded-b-xl text-xs text-slate-500">
          <span>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(1)} disabled={safePage === 1} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-100">«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-100">‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(safePage - 2, totalPages - 4))
              const p = start + i
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`px-2 py-1 rounded border text-xs font-semibold ${safePage === p ? 'bg-amber-400 border-amber-400 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                  {p}
                </button>
              )
            })}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-100">›</button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-100">»</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-header navigation row
// ─────────────────────────────────────────────────────────────────────────────

export type ActiveTab = 'ptw' | 'workorders'

interface SubNavProps {
  activeTab: ActiveTab
  onTabChange: (tab: ActiveTab) => void
  onCreateWorkOrder: () => void
}

export function SubNav({ activeTab, onTabChange, onCreateWorkOrder }: SubNavProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-200 bg-white px-1 pt-1">
      {/* Left: tabs */}
      <div className="flex items-center gap-0.5">
        {([
          { key: 'ptw' as ActiveTab,        icon: '📋', label: 'PTW Table' },
          { key: 'workorders' as ActiveTab,  icon: '🔧', label: 'Work Orders' },
        ]).map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={`px-4 py-2.5 text-sm font-semibold transition-all duration-150 border-b-2 -mb-[2px] rounded-t-md ${
              activeTab === key
                ? 'border-amber-400 bg-amber-50/60 text-amber-900'
                : 'border-transparent text-slate-500 hover:text-navy-800 hover:bg-slate-50'
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Right: create button */}
      <Button variant="primary" size="sm" onClick={onCreateWorkOrder} className="shrink-0 mb-1">
        + Create Work Order
      </Button>
    </div>
  )
}
