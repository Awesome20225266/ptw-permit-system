// src/pages/OperationPage.tsx
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { operationApi } from '@/lib/api'
import { keys } from '@/hooks/useQueryKeys'
import { cn } from '@/lib/utils'
import {
  Card, SkeletonCard, EmptyState, Button, TabBar, Skeleton,
} from '@/components/ui'
import type { SYDRow, PRRow, QueryMode } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Colour scale for SYD deviation
// ─────────────────────────────────────────────────────────────────────────────

function sydColor(pct: number): string {
  if (pct >= -5 && pct <= 5)  return '#22c55e'  // green — normal
  if (pct < -5  && pct >= -15) return '#f59e0b' // amber — mild
  if (pct > 5   && pct <= 15) return '#f59e0b'
  return '#ef4444'                               // red — significant
}

function heatmapOption(rows: SYDRow[] | PRRow[], valueKey: 'syd_dev_pct' | 'pr_pct') {
  const sites = [...new Set(rows.map((r) => r.site_name))]
  const equips = [...new Set(rows.map((r) => r.equipment_name))]
  const data = rows.map((r) => [
    equips.indexOf(r.equipment_name),
    sites.indexOf(r.site_name),
    +(r as Record<string, unknown>)[valueKey] as number,
  ])
  const minV = Math.min(...data.map((d) => d[2]))
  const maxV = Math.max(...data.map((d) => d[2]))

  return {
    tooltip: {
      formatter: (p: { value: number[] }) =>
        `${sites[p.value[1]]} · ${equips[p.value[0]]}<br/>${valueKey === 'syd_dev_pct' ? 'SYD Dev' : 'PR'}: <b>${p.value[2].toFixed(1)}%</b>`,
    },
    grid: { top: 16, bottom: 60, left: 80, right: 16 },
    xAxis: {
      type: 'category', data: equips,
      axisLabel: { fontSize: 9, rotate: 45, interval: 0 },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category', data: sites,
      axisLabel: { fontSize: 10 },
      splitArea: { show: true },
    },
    visualMap: {
      min: minV, max: maxV,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemHeight: 80,
      textStyle: { fontSize: 10 },
      inRange: {
        color: valueKey === 'syd_dev_pct'
          ? ['#ef4444', '#fbbf24', '#22c55e', '#fbbf24', '#ef4444']
          : ['#ef4444', '#fbbf24', '#22c55e'],
      },
    },
    series: [{
      type: 'heatmap',
      data,
      label: { show: equips.length <= 20, fontSize: 8, formatter: (p: { value: number[] }) => p.value[2].toFixed(0) },
    }],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function OperationPage() {
  const [selectedSites, setSelectedSites] = useState<string[]>([])
  const [mode, setMode] = useState<QueryMode>('latest')
  const [singleDate, setSingleDate] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [applied, setApplied] = useState<{
    sites: string[]
    mode: QueryMode
    date?: string
    date_from?: string
    date_to?: string
  } | null>(null)
  const [activeTab, setActiveTab] = useState<'syd' | 'pr'>('syd')

  const { data: sites, isLoading: loadingSites } = useQuery({
    queryKey: keys.opSites(),
    queryFn: operationApi.sites,
  })

  const { data: bounds } = useQuery({
    queryKey: keys.opBounds(),
    queryFn: operationApi.dateBounds,
  })

  const sydParams = applied
    ? applied.mode === 'date'
      ? { date: applied.date }
      : applied.mode === 'range'
      ? { date_from: applied.date_from, date_to: applied.date_to }
      : {}
    : {}

  const { data: sydData, isLoading: loadingSYD } = useQuery({
    queryKey: applied ? keys.opSYD(applied.sites, sydParams) : ['noop'],
    queryFn: () => operationApi.syd(applied!.sites, sydParams),
    enabled: !!applied && activeTab === 'syd',
  })

  const { data: prData, isLoading: loadingPR } = useQuery({
    queryKey: applied ? keys.opPR(applied.sites, sydParams) : ['noop'],
    queryFn: () => operationApi.pr(applied!.sites, sydParams),
    enabled: !!applied && activeTab === 'pr',
  })

  const toggleSite = (s: string) =>
    setSelectedSites((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])

  const handleApply = () => {
    if (!selectedSites.length) return
    const params: typeof applied = {
      sites: selectedSites,
      mode,
      ...(mode === 'date' && { date: singleDate }),
      ...(mode === 'range' && { date_from: dateFrom, date_to: dateTo }),
    }
    setApplied(params)
  }

  const loading = activeTab === 'syd' ? loadingSYD : loadingPR
  const activeData = activeTab === 'syd' ? sydData : prData
  const hasData = (activeData ?? []).length > 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-navy-800">Operation Theatre</h1>
        <p className="text-sm text-surface-muted mt-0.5">Equipment SYD deviation & PR performance heatmap</p>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-end gap-4">
        {/* Site picker */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Sites</p>
          {loadingSites ? <Skeleton className="h-8 w-48" /> : (
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto max-w-xs">
              {(sites ?? []).map((s) => (
                <button
                  key={s}
                  onClick={() => toggleSite(s)}
                  className={cn(
                    'badge text-xs cursor-pointer transition-all',
                    selectedSites.includes(s)
                      ? 'bg-amber-brand/20 border-amber-brand text-amber-700 font-bold'
                      : 'badge-gray',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mode selector */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Mode</p>
          <div className="flex gap-1.5">
            {(['latest', 'date', 'range'] as QueryMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-lg border font-semibold transition-all',
                  mode === m
                    ? 'bg-amber-brand border-amber-brand text-navy-900'
                    : 'border-surface-border text-surface-muted hover:text-navy-800',
                )}
              >
                {m === 'latest' ? 'Latest' : m === 'date' ? 'Date' : 'Range'}
              </button>
            ))}
          </div>
        </div>

        {mode === 'date' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Date</label>
            <input
              type="date"
              className="input w-36"
              value={singleDate}
              min={bounds?.date_min}
              max={bounds?.date_max}
              onChange={(e) => setSingleDate(e.target.value)}
            />
          </div>
        )}

        {mode === 'range' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">From</label>
              <input type="date" className="input w-36" value={dateFrom}
                min={bounds?.date_min} max={dateTo || bounds?.date_max}
                onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">To</label>
              <input type="date" className="input w-36" value={dateTo}
                min={dateFrom || bounds?.date_min} max={bounds?.date_max}
                onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </>
        )}

        <Button variant="primary" onClick={handleApply} disabled={!selectedSites.length} loading={loading}>
          Fetch
        </Button>
      </Card>

      {/* Tab + heatmap */}
      {applied && (
        <Card className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <TabBar
              tabs={[
                { key: 'syd', label: 'SYD Deviation', icon: '📡' },
                { key: 'pr',  label: 'PR Performance', icon: '⚡' },
              ]}
              active={activeTab}
              onChange={(k) => setActiveTab(k as 'syd' | 'pr')}
            />
            {hasData && (
              <p className="text-xs text-surface-muted">
                {(activeData ?? []).length} data points
              </p>
            )}
          </div>

          {loading && <SkeletonCard rows={6} />}

          {!loading && hasData && (
            <ReactECharts
              option={heatmapOption(
                activeData as SYDRow[] | PRRow[],
                activeTab === 'syd' ? 'syd_dev_pct' : 'pr_pct',
              )}
              style={{ height: Math.max(280, (new Set((activeData ?? []).map((r) => r.site_name)).size) * 36 + 100) }}
            />
          )}

          {!loading && !hasData && (
            <EmptyState message="No equipment data returned for this selection" icon="🏥" />
          )}
        </Card>
      )}

      {!applied && (
        <div className="flex flex-col items-center justify-center py-20 text-surface-muted gap-3">
          <span className="text-5xl">🏥</span>
          <p className="text-sm font-medium">Select sites and click Fetch to load the heatmap</p>
        </div>
      )}
    </div>
  )
}
