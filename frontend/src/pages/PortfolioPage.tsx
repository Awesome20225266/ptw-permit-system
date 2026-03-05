// src/pages/PortfolioPage.tsx
import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { portfolioApi } from '@/lib/api'
import { keys } from '@/hooks/useQueryKeys'
import { formatKWh, formatPct, fmtDate, deltaColor } from '@/lib/utils'
import {
  KPITile, SkeletonCard, ErrorBanner, EmptyState, Button,
  Select, Card, Skeleton,
} from '@/components/ui'
import type { PortfolioRawRow } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Chart helpers
// ─────────────────────────────────────────────────────────────────────────────

function energyTrendOption(rows: PortfolioRawRow[]) {
  const dates = rows.map((r) => fmtDate(r.date))
  const actual = rows.map((r) => r.abt_export_kwh ?? 0)
  const budget = rows.map((r) => r.b_energy_kwh ?? 0)

  return {
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatKWh(v) },
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 11 } },
    grid: { top: 36, bottom: 36, left: 60, right: 16 },
    xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: (v: number) => formatKWh(v) } },
    series: [
      {
        name: 'Actual', type: 'line', data: actual, smooth: true,
        lineStyle: { width: 2.5 }, symbol: 'none',
        itemStyle: { color: '#ffb300' }, areaStyle: { opacity: 0.08, color: '#ffb300' },
      },
      {
        name: 'Budget', type: 'line', data: budget, smooth: true,
        lineStyle: { width: 2, type: 'dashed' }, symbol: 'none',
        itemStyle: { color: '#5c6b8a' },
      },
    ],
  }
}

function performanceBarsOption(rows: PortfolioRawRow[]) {
  // Aggregate PA% and GA% per site
  const siteMap: Record<string, { paSum: number; gaSum: number; n: number }> = {}
  for (const r of rows) {
    if (!siteMap[r.site_name]) siteMap[r.site_name] = { paSum: 0, gaSum: 0, n: 0 }
    const s = siteMap[r.site_name]
    if (r.pa_percent != null) { s.paSum += r.pa_percent; s.n++ }
    if (r.ga_percent != null) s.gaSum += r.ga_percent
  }

  const sites = Object.keys(siteMap)
  const pa = sites.map((s) => +((siteMap[s].paSum / Math.max(siteMap[s].n, 1)) * 100).toFixed(1))
  const ga = sites.map((s) => +((siteMap[s].gaSum / Math.max(siteMap[s].n, 1)) * 100).toFixed(1))

  return {
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${v.toFixed(1)}%` },
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 11 } },
    grid: { top: 36, bottom: 48, left: 48, right: 16 },
    xAxis: { type: 'category', data: sites, axisLabel: { fontSize: 10, rotate: 30, interval: 0 } },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { fontSize: 10, formatter: '{value}%' } },
    series: [
      { name: 'PA%', type: 'bar', data: pa, barMaxWidth: 22, itemStyle: { color: '#ffb300', borderRadius: [4, 4, 0, 0] } },
      { name: 'GA%', type: 'bar', data: ga, barMaxWidth: 22, itemStyle: { color: '#6366f1', borderRadius: [4, 4, 0, 0] } },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function PortfolioPage() {
  const [selectedSites, setSelectedSites] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [applied, setApplied] = useState<{ sites: string[]; d1: string; d2: string } | null>(null)

  const { data: sites, isLoading: loadingSites } = useQuery({
    queryKey: keys.portfolioSites(),
    queryFn: portfolioApi.sites,
  })

  const { data: bounds } = useQuery({
    queryKey: keys.portfolioDateBounds(),
    queryFn: portfolioApi.dateBounds,
  })

  // Auto-fill date range when bounds load
  useEffect(() => {
    if (bounds) {
      if (!dateFrom) setDateFrom(bounds.date_min)
      if (!dateTo)   setDateTo(bounds.date_max)
    }
  }, [bounds])

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: applied ? keys.portfolioSummary(applied.sites, applied.d1, applied.d2) : [],
    queryFn: () => portfolioApi.summary(applied!.sites, applied!.d1, applied!.d2),
    enabled: !!applied,
  })

  const { data: raw, isLoading: loadingRaw } = useQuery({
    queryKey: applied ? keys.portfolioRaw(applied.sites, applied.d1, applied.d2) : [],
    queryFn: () => portfolioApi.raw(applied!.sites, applied!.d1, applied!.d2),
    enabled: !!applied,
  })

  const toggleSite = (site: string) => {
    setSelectedSites((prev) =>
      prev.includes(site) ? prev.filter((s) => s !== site) : [...prev, site],
    )
  }

  const handleApply = () => {
    if (!selectedSites.length || !dateFrom || !dateTo) return
    setApplied({ sites: selectedSites, d1: dateFrom, d2: dateTo })
  }

  const loading = loadingSummary || loadingRaw

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl text-navy-800">Portfolio Analytics</h1>
        <p className="text-sm text-surface-muted mt-0.5">Multi-site energy and performance summary</p>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-end gap-4">
        {/* Site multi-select */}
        <div className="flex flex-col gap-1 min-w-[200px]">
          <p className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Sites</p>
          {loadingSites ? (
            <Skeleton className="h-9 w-48" />
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {(sites ?? []).map((site) => (
                <button
                  key={site}
                  onClick={() => toggleSite(site)}
                  className={`badge text-xs cursor-pointer transition-all ${
                    selectedSites.includes(site)
                      ? 'bg-amber-brand/20 border-amber-brand text-amber-700 font-bold'
                      : 'badge-gray'
                  }`}
                >
                  {site}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">From</label>
          <input
            type="date"
            className="input w-36"
            value={dateFrom}
            min={bounds?.date_min}
            max={dateTo || bounds?.date_max}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">To</label>
          <input
            type="date"
            className="input w-36"
            value={dateTo}
            min={dateFrom || bounds?.date_min}
            max={bounds?.date_max}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <Button
          variant="primary"
          onClick={handleApply}
          disabled={!selectedSites.length || !dateFrom || !dateTo}
          loading={loading}
        >
          Run Analysis
        </Button>

        {selectedSites.length > 0 && (
          <button
            className="text-xs text-surface-muted hover:text-navy-800 underline"
            onClick={() => setSelectedSites([])}
          >
            Clear selection
          </button>
        )}
      </Card>

      {/* KPI tiles */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} rows={2} />)}
        </div>
      )}

      {summary && !loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPITile
            label="Actual Energy"
            value={formatKWh(summary.a_energy_kwh).split(' ')[0]}
            unit={formatKWh(summary.a_energy_kwh).split(' ')[1]}
            delta={`vs ${formatKWh(summary.b_energy_kwh)} budget`}
            deltaPositive={summary.a_energy_kwh >= summary.b_energy_kwh * 0.97}
          />
          <KPITile
            label="Energy Gap"
            value={formatKWh(Math.abs(summary.energy_gap_kwh)).split(' ')[0]}
            unit={formatKWh(Math.abs(summary.energy_gap_kwh)).split(' ')[1]}
            delta={summary.energy_gap_kwh >= 0 ? 'surplus' : 'shortfall'}
            deltaPositive={summary.energy_gap_kwh >= 0}
          />
          <KPITile
            label="Avg PA%"
            value={formatPct(summary.a_pa_percent)}
            delta={`Budget ${formatPct(summary.b_pa_percent)}`}
            deltaPositive={summary.a_pa_percent >= summary.b_pa_percent * 0.98}
          />
          <KPITile
            label="Avg GA%"
            value={formatPct(summary.a_ga_percent)}
            delta={`Budget ${formatPct(summary.b_ga_percent)}`}
            deltaPositive={summary.a_ga_percent >= summary.b_ga_percent * 0.98}
          />
        </div>
      )}

      {/* Charts */}
      {raw && raw.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="text-sm font-bold text-navy-800 mb-3">Energy Trend — Actual vs Budget</h3>
            <ReactECharts option={energyTrendOption(raw)} style={{ height: 280 }} />
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-bold text-navy-800 mb-3">Avg PA% & GA% by Site</h3>
            <ReactECharts option={performanceBarsOption(raw)} style={{ height: 280 }} />
          </Card>
        </div>
      )}

      {applied && !loading && (!raw || raw.length === 0) && (
        <EmptyState message="No data for the selected sites and date range" icon="📊" />
      )}

      {!applied && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-surface-muted">
          <span className="text-5xl">📊</span>
          <p className="text-sm font-medium">Select sites and a date range, then click Run Analysis</p>
        </div>
      )}
    </div>
  )
}
