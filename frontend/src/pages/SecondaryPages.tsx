// src/pages/CommentsPage.tsx
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { commentsApi, analyticsApi } from '@/lib/api'
import { keys } from '@/hooks/useQueryKeys'
import { fmtDate, fmtDateTime, summariseList, isoToday } from '@/lib/utils'
import {
  Card, Button, Input, ErrorBanner, EmptyState, Skeleton, Spinner, Badge,
} from '@/components/ui'
import type { Comment, CommentCreate } from '@/types'

export function CommentsPage() {
  const qc = useQueryClient()
  const today = isoToday()

  const [selectedSites, setSelectedSites] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState(today.slice(0, 7) + '-01')
  const [dateTo, setDateTo] = useState(today)
  const [applied, setApplied] = useState<{ sites: string[]; d1: string; d2: string } | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CommentCreate>({
    site_name: '',
    equipment_names: [],
    start_date: today,
    end_date: today,
    deviation: '',
    reasons: [],
    remarks: '',
  })

  const { data: sites } = useQuery({ queryKey: keys.analyticsSites(), queryFn: analyticsApi.sites })

  const { data: comments, isLoading } = useQuery({
    queryKey: applied ? keys.comments(applied.sites, applied.d1, applied.d2) : ['noop'],
    queryFn: () => commentsApi.list(applied!.sites, applied!.d1, applied!.d2),
    enabled: !!applied,
  })

  const deleteMutation = useMutation({
    mutationFn: commentsApi.delete,
    onSuccess: () => {
      if (applied) qc.invalidateQueries({ queryKey: keys.comments(applied.sites, applied.d1, applied.d2) })
    },
  })

  const createMutation = useMutation({
    mutationFn: commentsApi.create,
    onSuccess: () => {
      setShowForm(false)
      if (applied) qc.invalidateQueries({ queryKey: keys.comments(applied.sites, applied.d1, applied.d2) })
    },
  })

  const toggleSite = (s: string) =>
    setSelectedSites((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl text-navy-800">Add Comments</h1>
          <p className="text-sm text-surface-muted mt-0.5">Operational deviation notes per site &amp; equipment</p>
        </div>
        <Button variant="primary" onClick={() => setShowForm(true)}>+ Add Comment</Button>
      </div>

      {/* Filter bar */}
      <Card className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Sites</p>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto max-w-sm">
            {(sites ?? []).map((s) => (
              <button key={s} onClick={() => toggleSite(s)}
                className={`badge text-xs cursor-pointer ${selectedSites.includes(s) ? 'bg-amber-brand/20 border-amber-brand text-amber-700 font-bold' : 'badge-gray'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">From</label>
          <input type="date" className="input w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">To</label>
          <input type="date" className="input w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <Button variant="ghost" onClick={() => setApplied({ sites: selectedSites, d1: dateFrom, d2: dateTo })}
          disabled={!selectedSites.length}>Fetch</Button>
      </Card>

      {/* Table */}
      {isLoading && (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      )}

      {comments && comments.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Equipment</th>
                  <th>Period</th>
                  <th>Deviation</th>
                  <th>Reasons</th>
                  <th>Remarks</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {comments.map((c: Comment) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.site_name}</td>
                    <td className="text-xs">{summariseList(c.equipment_names)}</td>
                    <td className="font-mono text-xs whitespace-nowrap">{fmtDate(c.start_date)} – {fmtDate(c.end_date)}</td>
                    <td><span className="font-mono text-xs">{c.deviation}</span></td>
                    <td className="text-xs max-w-[180px] truncate">{summariseList(c.reasons)}</td>
                    <td className="text-xs max-w-[160px] truncate">{c.remarks ?? '—'}</td>
                    <td className="text-xs text-surface-muted whitespace-nowrap">{fmtDateTime(c.created_at)}</td>
                    <td>
                      <button
                        onClick={() => deleteMutation.mutate(c.id)}
                        className="text-red-400 hover:text-red-600 text-xs transition-colors"
                      >✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {applied && !isLoading && (!comments || comments.length === 0) && (
        <EmptyState message="No comments found for the selected criteria" icon="📝" />
      )}

      {/* Add Comment form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <Card className="relative w-full max-w-lg animate-slide-up">
            <h3 className="font-bold text-navy-800 mb-4">New Comment</h3>
            <div className="flex flex-col gap-3">
              <Input label="Site Name" value={form.site_name} onChange={(e) => setForm((f) => ({ ...f, site_name: e.target.value }))} />
              <Input label="Equipment Names (comma-separated)" value={form.equipment_names.join(', ')}
                onChange={(e) => setForm((f) => ({ ...f, equipment_names: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start Date" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
                <Input label="End Date" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
              <Input label="Deviation" value={String(form.deviation)} onChange={(e) => setForm((f) => ({ ...f, deviation: e.target.value }))} />
              <Input label="Reasons (comma-separated)" value={form.reasons.join(', ')}
                onChange={(e) => setForm((f) => ({ ...f, reasons: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Remarks</label>
                <textarea className="input h-20 resize-none" value={form.remarks ?? ''} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
              </div>
              {createMutation.isError && <ErrorBanner message="Failed to create comment. Please check your inputs." />}
              <div className="flex gap-2 justify-end mt-1">
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button variant="primary" loading={createMutation.isPending}
                  onClick={() => createMutation.mutate(form)}>Save</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta Viewer
// ─────────────────────────────────────────────────────────────────────────────

export function MetaViewerPage() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null)

  const { data: tables, isLoading } = useQuery({ queryKey: keys.metaTables(), queryFn: () =>
    import('@/lib/api').then(m => m.metaApi.tables()) })

  const { data: schema } = useQuery({
    queryKey: keys.metaSchema(selectedTable ?? ''),
    queryFn: () => import('@/lib/api').then(m => m.metaApi.schema(selectedTable!)),
    enabled: !!selectedTable,
  })

  const { data: sample } = useQuery({
    queryKey: keys.metaSample(selectedTable ?? '', 10),
    queryFn: () => import('@/lib/api').then(m => m.metaApi.sample(selectedTable!, 10)),
    enabled: !!selectedTable,
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-navy-800">Meta Viewer</h1>
        <p className="text-sm text-surface-muted mt-0.5">DuckDB table inspector — schema and sample data</p>
      </div>

      <div className="grid grid-cols-[240px_1fr] gap-4">
        {/* Table list */}
        <Card className="p-2 h-fit">
          {isLoading && <Spinner />}
          {(tables ?? []).map((t) => (
            <button
              key={t.table_name}
              onClick={() => setSelectedTable(t.table_name)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${
                selectedTable === t.table_name
                  ? 'bg-amber-brand/10 text-amber-800 font-bold'
                  : 'text-navy-700 hover:bg-surface'
              }`}
            >
              <span className="font-mono">{t.table_name}</span>
              <span className="text-xs text-surface-muted">{t.row_count.toLocaleString()}</span>
            </button>
          ))}
        </Card>

        {/* Schema + sample */}
        <div className="flex flex-col gap-4">
          {selectedTable ? (
            <>
              {schema && (
                <Card className="p-0 overflow-hidden">
                  <div className="px-4 py-3 border-b border-surface-border">
                    <h3 className="text-sm font-bold text-navy-800">Schema — <span className="font-mono">{selectedTable}</span></h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead><tr><th>#</th><th>Column</th><th>Type</th><th>Not Null</th><th>PK</th></tr></thead>
                      <tbody>
                        {schema.map((col) => (
                          <tr key={col.cid}>
                            <td className="text-surface-muted">{col.cid}</td>
                            <td className="font-mono font-medium">{col.name}</td>
                            <td><span className="font-mono text-xs badge-blue badge">{col.type}</span></td>
                            <td>{col.notnull ? '✓' : ''}</td>
                            <td>{col.pk ? <Badge variant="amber">PK</Badge> : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {sample && sample.length > 0 && (
                <Card className="p-0 overflow-hidden">
                  <div className="px-4 py-3 border-b border-surface-border">
                    <h3 className="text-sm font-bold text-navy-800">Sample (10 rows)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>{Object.keys(sample[0]).map((k) => <th key={k}>{k}</th>)}</tr>
                      </thead>
                      <tbody>
                        {sample.map((row, i) => (
                          <tr key={i}>
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="font-mono text-xs max-w-[180px] truncate">{String(v ?? '—')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          ) : (
            <EmptyState message="Select a table to inspect" icon="🧭" />
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Permit placeholder pages (S1 / S2 / S3) — full implementation in Phase 8
// ─────────────────────────────────────────────────────────────────────────────

function PermitPlaceholder({ title, role, icon }: { title: string; role: string; icon: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-navy-800">{title}</h1>
        <p className="text-sm text-surface-muted mt-0.5">{role} portal — Permit To Work management</p>
      </div>
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-surface-muted">
        <span className="text-6xl">{icon}</span>
        <div className="text-center">
          <p className="font-bold text-navy-700 text-lg">{title}</p>
          <p className="text-sm mt-1">Full permit workflow UI coming in Phase 8.</p>
          <p className="text-xs mt-2 font-mono">Backend endpoints are live at <code className="bg-surface-border px-1 rounded">/api/v1/permits/{role.toLowerCase().replace(' ', '')}/ptw</code></p>
        </div>
      </div>
    </div>
  )
}

export function S1Page() { return <PermitPlaceholder title="S1 Portal — Permit Receiver" role="s1" icon="📋" /> }
export function S2Page() { return <PermitPlaceholder title="S2 Portal — Forwarding" role="s2" icon="📤" /> }
export function S3Page() { return <PermitPlaceholder title="S3 Portal — Approval" role="s3" icon="✅" /> }
