// src/pages/SCBOTPage.tsx
// SCB Operation Theatre — median-based deviation analysis per SCB across a site

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { http } from '@/lib/api'
import { keys } from '@/hooks/useQueryKeys'
import { cn } from '@/lib/utils'
import { Card, Button, KPITile, EmptyState, ErrorBanner, Spinner, Badge, TabBar } from '@/components/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SCBDeviation {
  label:         string
  inv_stn_name:  string
  inv_name:      string
  scb_name:      string
  deviation_pct: number
  normalized_value?: number
  remark?: string
}

interface SCBInsight {
  category: string
  count:    number
  labels:   string[]
}

interface SCBOTResult {
  site_name:    string
  from_date:    string
  to_date:      string
  threshold:    number
  deviations:   SCBDeviation[]
  deviations_below_threshold: SCBDeviation[]
  insights:     SCBInsight[]
  kpis: {
    total_scbs:         number
    below_threshold:    number
    above_threshold:    number
    max_deviation_pct:  number | null
    min_deviation_pct:  number | null
    scb_cols_count:     number
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

const scbApi = {
  sites: () => http.get<string[]>('/scb/sites').then((r) => r.data),
  dateBounds: (siteName: string) =>
    http.get<{ date_min: string | null; date_max: string | null }>('/scb/date-bounds', {
      params: { site_name: siteName },
    }).then((r) => r.data),
  runOT: (body: { site_name: string; from_date: string; to_date: string; threshold: number }) =>
    http.post<SCBOTResult>('/scb/ot', body).then((r) => r.data),
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart: sorted deviation bar
// ─────────────────────────────────────────────────────────────────────────────

function deviationBarOption(rows: SCBDeviation[], threshold: number) {
  // Sort ascending (worst first)
  const sorted = [...rows].sort((a, b) => a.deviation_pct - b.deviation_pct)
  const labels = sorted.map((r) => r.label ?? `${r.inv_stn_name}-${r.inv_name}-${r.scb_name}`)
  const values = sorted.map((r) => +r.deviation_pct.toFixed(2))

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (p: Array<{ name: string; value: number }>) =>
        `${p[0].name}<br/>Deviation: <b>${p[0].value.toFixed(2)}%</b>`,
    },
    grid: { top: 16, bottom: 120, left: 56, right: 16 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { fontSize: 9, rotate: 55, interval: 0 },
    },
    yAxis: {
      type: 'value',
      name: 'Deviation %',
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10, formatter: '{value}%' },
    },
    markLine: {
      silent: true,
      data: [{ yAxis: threshold, lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 } }],
    },
    series: [{
      type: 'bar',
      data: values.map((v) => ({
        value: v,
        itemStyle: {
          color: v < -20 ? '#dc2626' : v < -10 ? '#f59e0b' : v < 0 ? '#facc15' : '#22c55e',
          borderRadius: v < 0 ? [0, 0, 3, 3] : [3, 3, 0, 0],
        },
      })),
      barMaxWidth: 18,
    }],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart: inverter-level heatmap
// ─────────────────────────────────────────────────────────────────────────────

function heatmapOption(rows: SCBDeviation[]) {
  const invs  = [...new Set(rows.map((r) => `${r.inv_stn_name}-${r.inv_name}`))].sort()
  const scbs  = [...new Set(rows.map((r) => r.scb_name))].sort()
  const data  = rows.map((r) => [
    scbs.indexOf(r.scb_name),
    invs.indexOf(`${r.inv_stn_name}-${r.inv_name}`),
    +r.deviation_pct.toFixed(1),
  ])
  const minV  = Math.min(...data.map((d) => d[2]))
  const maxV  = Math.max(...data.map((d) => d[2]))

  return {
    tooltip: {
      formatter: (p: { value: number[] }) =>
        `${invs[p.value[1]]} · ${scbs[p.value[0]]}<br/>Dev: <b>${p.value[2].toFixed(1)}%</b>`,
    },
    grid: { top: 8, bottom: 60, left: 100, right: 80 },
    xAxis: {
      type: 'category',
      data: scbs,
      axisLabel: { fontSize: 9, rotate: 45, interval: 0 },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category',
      data: invs,
      axisLabel: { fontSize: 10 },
      splitArea: { show: true },
    },
    visualMap: {
      min: Math.min(minV, -30),
      max: Math.max(maxV, 0),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemHeight: 100,
      textStyle: { fontSize: 10 },
      inRange: { color: ['#dc2626', '#f97316', '#facc15', '#bbf7d0', '#22c55e'] },
    },
    series: [{
      type: 'heatmap',
      data,
      label: {
        show: scbs.length <= 20,
        fontSize: 8,
        formatter: (p: { value: number[] }) => p.value[2].toFixed(0),
      },
    }],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function SCBOTPage() {
  const [site,        setSite]        = useState('')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [threshold,   setThreshold]   = useState(-3)
  const [result,      setResult]      = useState<SCBOTResult | null>(null)
  const [apiError,    setApiError]    = useState('')
  const [activeView,  setActiveView]  = useState<'bar' | 'heatmap' | 'table'>('bar')

  const { data: sites, isLoading: loadingSites } = useQuery({
    queryKey: ['scb', 'sites'],
    queryFn: scbApi.sites,
  })

  const { data: bounds } = useQuery({
    queryKey: ['scb', 'date-bounds', site],
    queryFn: () => scbApi.dateBounds(site),
    enabled: !!site,
  })

  useEffect(() => {
    if (bounds) {
      if (!dateFrom && bounds.date_min) setDateFrom(bounds.date_min)
      if (!dateTo   && bounds.date_max) setDateTo(bounds.date_max)
    }
  }, [bounds])

  const runMutation = useMutation({
    mutationFn: () => scbApi.runOT({
      site_name: site,
      from_date: dateFrom,
      to_date:   dateTo,
      threshold,
    }),
    onSuccess: (data) => { setResult(data); setApiError('') },
    onError:   (e: Error) => setApiError(e.message || 'SCB OT pipeline failed.'),
  })

  const kpis = result?.kpis
  const allDeviations   = result?.deviations ?? []
  const belowThreshold  = result?.deviations_below_threshold ?? []
  const displayRows     = belowThreshold.length > 0 ? belowThreshold : allDeviations

  const insightColorMap: Record<string, string> = {
    'Disconnected':     'red',
    'Night-time bad':   'amber',
    'Zero / near-zero': 'amber',
    'Low deviation':    'blue',
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl text-navy-800">SCB Operation Theatre</h1>
        <p className="text-sm text-surface-muted mt-0.5">
          Median-based SCB deviation analysis · Outlier nullification · String-level diagnostics
        </p>
      </div>

      {/* Control panel */}
      <Card className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Site</label>
          {loadingSites ? <Spinner size="sm" /> : (
            <select
              className="select w-52"
              value={site}
              onChange={(e) => { setSite(e.target.value); setDateFrom(''); setDateTo('') }}
            >
              <option value="">Select site…</option>
              {(sites ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">From</label>
          <input type="date" className="input w-36" value={dateFrom}
            min={bounds?.date_min ?? undefined} max={(dateTo || bounds?.date_max) ?? undefined}
            onChange={(e) => setDateFrom(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">To</label>
          <input type="date" className="input w-36" value={dateTo}
            min={(dateFrom || bounds?.date_min) ?? undefined} max={bounds?.date_max ?? undefined}
            onChange={(e) => setDateTo(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">
            Threshold %
          </label>
          <input
            type="number"
            className="input w-24 font-mono"
            value={threshold}
            step={1}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </div>

        <Button
          variant="primary"
          loading={runMutation.isPending}
          disabled={!site || !dateFrom || !dateTo}
          onClick={() => runMutation.mutate()}
        >
          Plot Now
        </Button>
      </Card>

      {/* Error */}
      {apiError && <ErrorBanner message={apiError} />}

      {/* Loading */}
      {runMutation.isPending && (
        <div className="flex flex-col items-center gap-3 py-12 text-surface-muted">
          <Spinner size="lg" />
          <p className="text-sm">Running SCB OT pipeline… this may take a moment.</p>
        </div>
      )}

      {/* Results */}
      {result && !runMutation.isPending && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KPITile label="Total SCBs"       value={String(kpis!.total_scbs)} />
            <KPITile
              label="Below Threshold"
              value={String(kpis!.below_threshold)}
              delta={`${((kpis!.below_threshold / Math.max(kpis!.total_scbs, 1)) * 100).toFixed(1)}%`}
              deltaPositive={false}
            />
            <KPITile
              label="Within Range"
              value={String(kpis!.above_threshold)}
              delta={`${((kpis!.above_threshold / Math.max(kpis!.total_scbs, 1)) * 100).toFixed(1)}%`}
              deltaPositive
            />
            <KPITile
              label="Min Deviation"
              value={(kpis!.min_deviation_pct ?? 0).toFixed(1)}
              unit="%"
              deltaPositive={(kpis!.min_deviation_pct ?? 0) > threshold}
            />
            <KPITile
              label="Max Deviation"
              value={(kpis!.max_deviation_pct ?? 0).toFixed(1)}
              unit="%"
              deltaPositive={(kpis!.max_deviation_pct ?? 0) >= 0}
            />
          </div>

          {/* Insight summary badges */}
          {result.insights.length > 0 && (
            <Card className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-bold text-surface-muted uppercase tracking-wide mr-1">
                Insights
              </span>
              {result.insights.map((ins) => (
                <div key={ins.category} className="flex items-center gap-1.5">
                  <Badge variant={(insightColorMap[ins.category] as 'red' | 'amber' | 'blue') ?? 'gray'}>
                    {ins.category} ({ins.count})
                  </Badge>
                </div>
              ))}
            </Card>
          )}

          {/* Chart / table */}
          {displayRows.length === 0 ? (
            <EmptyState
              message="No SCBs below the deviation threshold. All strings are within range."
              icon="✅"
            />
          ) : (
            <Card className="p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="text-sm font-bold text-navy-800">
                  {belowThreshold.length} SCBs below {threshold}% threshold
                </h3>
                <TabBar
                  tabs={[
                    { key: 'bar',     label: 'Bar Chart',  icon: '📊' },
                    { key: 'heatmap', label: 'Heatmap',    icon: '🌡️' },
                    { key: 'table',   label: 'Table',      icon: '📋' },
                  ]}
                  active={activeView}
                  onChange={(k) => setActiveView(k as typeof activeView)}
                />
              </div>

              {activeView === 'bar' && (
                <ReactECharts
                  option={deviationBarOption(displayRows, threshold)}
                  style={{ height: Math.min(500, Math.max(280, displayRows.length * 10 + 180)) }}
                />
              )}

              {activeView === 'heatmap' && (
                <ReactECharts
                  option={heatmapOption(allDeviations)}
                  style={{ height: Math.max(280, [...new Set(allDeviations.map((r) => `${r.inv_stn_name}-${r.inv_name}`))].length * 32 + 120) }}
                />
              )}

              {activeView === 'table' && (
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Inv Station</th>
                        <th>Inverter</th>
                        <th>SCB</th>
                        <th className="text-right">Deviation %</th>
                        <th>Severity</th>
                        <th>Remark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row, i) => {
                        const dev = row.deviation_pct
                        const severity =
                          dev < -20 ? 'red' :
                          dev < -10 ? 'amber' :
                          dev < 0   ? 'blue' : 'green'
                        return (
                          <tr key={i}>
                            <td className="font-mono text-xs">{row.inv_stn_name}</td>
                            <td className="font-mono text-xs">{row.inv_name}</td>
                            <td className="font-mono text-xs font-bold">{row.scb_name}</td>
                            <td className={cn(
                              'text-right font-mono text-xs font-semibold',
                              dev < -20 ? 'text-red-600' :
                              dev < -10 ? 'text-amber-600' : 'text-navy-700',
                            )}>
                              {dev.toFixed(2)}%
                            </td>
                            <td>
                              <Badge variant={severity as 'red' | 'amber' | 'blue' | 'green'}>
                                {dev < -20 ? 'Critical' : dev < -10 ? 'Warning' : dev < 0 ? 'Mild' : 'OK'}
                              </Badge>
                            </td>
                            <td className="text-xs text-surface-muted max-w-[200px] truncate">
                              {row.remark ?? '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {!result && !runMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-surface-muted">
          <span className="text-5xl">🔬</span>
          <p className="text-sm font-medium">
            Select a site, date range, and threshold, then click Plot Now
          </p>
        </div>
      )}
    </div>
  )
}
