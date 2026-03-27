// src/pages/ReconnectPage.tsx
// Re Connect DSM Analysis — plant selection, date range, raw data table + deviation chart

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { reconnectApi } from '@/lib/api'
import { keys } from '@/hooks/useQueryKeys'
import { formatINR, fmtDate, cn } from '@/lib/utils'
import { Card, Button, EmptyState, Spinner, ErrorBanner, KPITile } from '@/components/ui'
import type { ReconnectRow } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Deviation chart — actual vs scheduled vs forecast per block
// ─────────────────────────────────────────────────────────────────────────────

function deviationChartOption(rows: ReconnectRow[]) {
  // Show last 96 blocks (one day) if more
  const slice = rows.slice(-96)
  const labels = slice.map((r) => `${r.date} B${r.block}`)
  const actual    = slice.map((r) => r.actual_mw ?? null)
  const scheduled = slice.map((r) => r.accepted_schedule_eod_mw ?? null)
  const forecast  = slice.map((r) => r.forecast_da_mw ?? null)

  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number | null) => v == null ? '—' : `${v.toFixed(2)} MW`,
    },
    legend: { top: 4, right: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 11 } },
    grid: { top: 36, bottom: 48, left: 56, right: 16 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { fontSize: 9, rotate: 30, interval: 11 }, // every 3 hrs
    },
    yAxis: {
      type: 'value',
      name: 'MW',
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10, formatter: '{value} MW' },
    },
    series: [
      {
        name: 'Actual',
        type: 'line',
        data: actual,
        smooth: true,
        lineStyle: { width: 2.5, color: '#ffb300' },
        itemStyle: { color: '#ffb300' },
        symbol: 'none',
        areaStyle: { opacity: 0.07, color: '#ffb300' },
      },
      {
        name: 'Scheduled',
        type: 'line',
        data: scheduled,
        smooth: true,
        lineStyle: { width: 2, type: 'dashed', color: '#6366f1' },
        itemStyle: { color: '#6366f1' },
        symbol: 'none',
      },
      {
        name: 'DA Forecast',
        type: 'line',
        data: forecast,
        smooth: true,
        lineStyle: { width: 1.5, type: 'dotted', color: '#94a3b8' },
        itemStyle: { color: '#94a3b8' },
        symbol: 'none',
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Direction deviation bars — count of UI vs OI blocks
// ─────────────────────────────────────────────────────────────────────────────

function directionBarOption(rows: ReconnectRow[]) {
  // Compute per-date UI/OI block counts
  const byDate: Record<string, { ui: number; oi: number; flat: number }> = {}
  for (const r of rows) {
    if (!byDate[r.date]) byDate[r.date] = { ui: 0, oi: 0, flat: 0 }
    const actual = r.actual_mw ?? 0
    const sched  = r.accepted_schedule_eod_mw ?? 0
    const diff   = actual - sched
    if (Math.abs(diff) < 0.01 * Math.max(actual, sched, 1)) byDate[r.date].flat++
    else if (actual > sched) byDate[r.date].ui++
    else byDate[r.date].oi++
  }

  const dates = Object.keys(byDate).sort()
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 4, right: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 11 } },
    grid: { top: 36, bottom: 48, left: 48, right: 16 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { fontSize: 10, rotate: 30, interval: 0 },
    },
    yAxis: {
      type: 'value',
      name: 'Blocks',
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10 },
    },
    series: [
      {
        name: 'UI (Over-injection)',
        type: 'bar',
        stack: 'dir',
        data: dates.map((d) => byDate[d].ui),
        itemStyle: { color: '#f59e0b', borderRadius: [0, 0, 0, 0] },
        barMaxWidth: 32,
      },
      {
        name: 'OI (Under-injection)',
        type: 'bar',
        stack: 'dir',
        data: dates.map((d) => byDate[d].oi),
        itemStyle: { color: '#ef4444' },
        barMaxWidth: 32,
      },
      {
        name: 'Flat / Within tolerance',
        type: 'bar',
        stack: 'dir',
        data: dates.map((d) => byDate[d].flat),
        itemStyle: { color: '#22c55e', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 32,
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary KPIs derived from raw data
// ─────────────────────────────────────────────────────────────────────────────

interface Summary {
  totalBlocks: number
  uiBlocks: number
  oiBlocks: number
  flatBlocks: number
  avgActualMW: number
  avgScheduledMW: number
  maxDevMW: number
}

function computeSummary(rows: ReconnectRow[]): Summary {
  let uiBlocks = 0, oiBlocks = 0, flatBlocks = 0
  let sumActual = 0, sumSched = 0, maxDev = 0

  for (const r of rows) {
    const actual = r.actual_mw ?? 0
    const sched  = r.accepted_schedule_eod_mw ?? 0
    sumActual += actual
    sumSched  += sched
    const dev = Math.abs(actual - sched)
    if (dev > maxDev) maxDev = dev
    if (dev < 0.01 * Math.max(actual, sched, 1)) flatBlocks++
    else if (actual > sched) uiBlocks++
    else oiBlocks++
  }

  const n = rows.length || 1
  return {
    totalBlocks: rows.length,
    uiBlocks,
    oiBlocks,
    flatBlocks,
    avgActualMW: sumActual / n,
    avgScheduledMW: sumSched / n,
    maxDevMW: maxDev,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function ReconnectPage() {
  const [selectedPlants, setSelectedPlants] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [applied, setApplied] = useState<{
    plants: string[]; d1: string; d2: string
  } | null>(null)
  const [activeChart, setActiveChart] = useState<'deviation' | 'direction'>('deviation')

  // Load plants
  const { data: plants, isLoading: loadingPlants } = useQuery({
    queryKey: keys.reconnectPlants(),
    queryFn: reconnectApi.plants,
  })

  // Load date bounds when plants change
  const { data: bounds } = useQuery({
    queryKey: keys.reconnectDateRange(selectedPlants),
    queryFn: () => reconnectApi.dateRange(selectedPlants),
    enabled: selectedPlants.length > 0,
  })

  useEffect(() => {
    if (bounds) {
      if (!dateFrom && bounds.date_min) setDateFrom(bounds.date_min)
      if (!dateTo   && bounds.date_max) setDateTo(bounds.date_max)
    }
  }, [bounds])

  // Fetch data
  const { data: reconnectData, isLoading: loadingData, isError } = useQuery({
    queryKey: applied ? keys.reconnectData(applied.plants, applied.d1, applied.d2) : ['noop'],
    queryFn: () => reconnectApi.data(applied!.plants, applied!.d1, applied!.d2),
    enabled: !!applied,
  })

  const togglePlant = (p: string) =>
    setSelectedPlants((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])

  const handleApply = () => {
    if (!selectedPlants.length || !dateFrom || !dateTo) return
    setApplied({ plants: selectedPlants, d1: dateFrom, d2: dateTo })
  }

  const summary = reconnectData ? computeSummary(reconnectData) : null

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl text-navy-800">Re Connect — DSM Analysis</h1>
        <p className="text-sm text-surface-muted mt-0.5">
          Deviation Settlement Mechanism · UI/OI block analysis · Actual vs scheduled generation
        </p>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-end gap-5">
        {/* Plant multi-select */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Plants</p>
            <div className="flex gap-1.5">
              <button
                className="text-xs text-amber-700 underline hover:text-amber-800"
                onClick={() => setSelectedPlants(plants ?? [])}
              >
                All
              </button>
              <span className="text-surface-muted text-xs">·</span>
              <button
                className="text-xs text-surface-muted underline hover:text-navy-800"
                onClick={() => setSelectedPlants([])}
              >
                Clear
              </button>
            </div>
          </div>
          {loadingPlants ? (
            <div className="flex items-center gap-2"><Spinner size="sm" /><span className="text-xs text-surface-muted">Loading plants…</span></div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-w-xs">
              {(plants ?? []).map((p) => (
                <button
                  key={p}
                  onClick={() => togglePlant(p)}
                  className={cn(
                    'badge text-xs cursor-pointer transition-all',
                    selectedPlants.includes(p)
                      ? 'bg-amber-brand/20 border-amber-brand text-amber-700 font-bold'
                      : 'badge-gray',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date range */}
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
          disabled={!selectedPlants.length || !dateFrom || !dateTo}
          loading={loadingData}
        >
          Analyse
        </Button>
      </Card>

      {/* Error */}
      {isError && <ErrorBanner message="Failed to load reconnect data. Please try again." />}

      {/* Loading */}
      {loadingData && (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      )}

      {/* Results */}
      {summary && reconnectData && !loadingData && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPITile
              label="Total Blocks"
              value={summary.totalBlocks.toLocaleString()}
              note={`${applied?.plants.join(', ')}`}
            />
            <KPITile
              label="UI Blocks"
              value={summary.uiBlocks.toString()}
              note="Over-injection"
              delta={`${((summary.uiBlocks / summary.totalBlocks) * 100).toFixed(1)}%`}
              deltaPositive={false}
            />
            <KPITile
              label="OI Blocks"
              value={summary.oiBlocks.toString()}
              note="Under-injection"
              delta={`${((summary.oiBlocks / summary.totalBlocks) * 100).toFixed(1)}%`}
              deltaPositive={false}
            />
            <KPITile
              label="Within Tolerance"
              value={summary.flatBlocks.toString()}
              delta={`${((summary.flatBlocks / summary.totalBlocks) * 100).toFixed(1)}%`}
              deltaPositive
            />
            <KPITile
              label="Avg Actual"
              value={summary.avgActualMW.toFixed(2)}
              unit="MW"
            />
            <KPITile
              label="Max Deviation"
              value={summary.maxDevMW.toFixed(2)}
              unit="MW"
              delta={summary.maxDevMW > 5 ? 'High deviation' : 'Within range'}
              deltaPositive={summary.maxDevMW <= 5}
            />
          </div>

          {/* Charts */}
          <Card className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-bold text-navy-800">Generation Profile</h3>
              <div className="flex gap-1.5">
                {[
                  { key: 'deviation',  label: 'Actual vs Scheduled' },
                  { key: 'direction',  label: 'UI / OI by Day' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setActiveChart(key as typeof activeChart)}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-lg border font-semibold transition-all',
                      activeChart === key
                        ? 'bg-amber-brand border-amber-brand text-navy-900'
                        : 'border-surface-border text-surface-muted hover:text-navy-800',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {activeChart === 'deviation' && (
              <ReactECharts
                option={deviationChartOption(reconnectData)}
                style={{ height: 320 }}
              />
            )}
            {activeChart === 'direction' && (
              <ReactECharts
                option={directionBarOption(reconnectData)}
                style={{ height: 320 }}
              />
            )}
          </Card>

          {/* Data table */}
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-navy-800">Block Data</h3>
              <span className="text-xs text-surface-muted">{reconnectData.length} rows</span>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Plant</th>
                    <th>Date</th>
                    <th>Block</th>
                    <th>Time</th>
                    <th>DA Forecast (MW)</th>
                    <th>Actual (MW)</th>
                    <th>Schedule EOD (MW)</th>
                    <th>Dev (MW)</th>
                    <th>Dir</th>
                  </tr>
                </thead>
                <tbody>
                  {reconnectData.slice(0, 200).map((r: ReconnectRow, i) => {
                    const actual = r.actual_mw ?? 0
                    const sched  = r.accepted_schedule_eod_mw ?? 0
                    const dev    = actual - sched
                    const devAbs = Math.abs(dev)
                    const tol    = 0.01 * Math.max(actual, sched, 1)
                    const dir    = devAbs < tol ? 'FLAT' : actual > sched ? 'UI' : 'OI'
                    return (
                      <tr key={i}>
                        <td className="text-xs font-medium">{r.plant_name}</td>
                        <td className="font-mono text-xs">{r.date}</td>
                        <td className="font-mono text-xs text-center">{r.block}</td>
                        <td className="font-mono text-xs">{r.time}</td>
                        <td className="font-mono text-xs text-right">{r.forecast_da_mw?.toFixed(2) ?? '—'}</td>
                        <td className="font-mono text-xs text-right font-semibold">{r.actual_mw?.toFixed(2) ?? '—'}</td>
                        <td className="font-mono text-xs text-right">{r.accepted_schedule_eod_mw?.toFixed(2) ?? '—'}</td>
                        <td className={cn(
                          'font-mono text-xs text-right font-semibold',
                          dev > tol ? 'text-amber-700' : dev < -tol ? 'text-red-600' : 'text-emerald-600',
                        )}>
                          {dev >= 0 ? '+' : ''}{dev.toFixed(2)}
                        </td>
                        <td>
                          <span className={cn(
                            'badge text-xs',
                            dir === 'UI'   ? 'badge-amber' :
                            dir === 'OI'   ? 'badge-red' :
                            'badge-green',
                          )}>
                            {dir}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {reconnectData.length > 200 && (
                    <tr>
                      <td colSpan={9} className="text-center text-xs text-surface-muted py-3">
                        Showing first 200 of {reconnectData.length} rows. Export for full data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Empty */}
      {applied && !loadingData && (!reconnectData || reconnectData.length === 0) && !isError && (
        <EmptyState message="No reconnect data for the selected plants and date range" icon="🔌" />
      )}

      {!applied && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-surface-muted">
          <span className="text-5xl">🔌</span>
          <p className="text-sm font-medium">Select plants and a date range, then click Analyse</p>
        </div>
      )}
    </div>
  )
}
