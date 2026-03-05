// src/pages/AnalyticsPage.tsx — Single-site daily KPI view
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { analyticsApi } from '@/lib/api'
import { keys } from '@/hooks/useQueryKeys'
import { isoToday, fmtDate, formatPct, formatKWh } from '@/lib/utils'
import { Card, EmptyState, ErrorBanner, Skeleton, KPITile } from '@/components/ui'

export function AnalyticsPage() {
  const today = isoToday()
  const [siteName, setSiteName] = useState('')
  const [date, setDate] = useState(today)

  const { data: sites, isLoading: sitesLoading } = useQuery({
    queryKey: keys.analyticsSites(),
    queryFn: analyticsApi.sites,
  })

  const { data: dailyKpi, isLoading: kpiLoading, error: kpiError } = useQuery({
    queryKey: keys.analyticsDailyKpi(siteName, date),
    queryFn: () => analyticsApi.dailyKpi(siteName, date),
    enabled: !!siteName && !!date,
  })

  const { data: prData } = useQuery({
    queryKey: keys.analyticsPr(siteName, date),
    queryFn: () => analyticsApi.pr(siteName, date),
    enabled: !!siteName && !!date,
  })

  const { data: sydData } = useQuery({
    queryKey: keys.analyticsSyd(siteName, date),
    queryFn: () => analyticsApi.syd(siteName, date),
    enabled: !!siteName && !!date,
  })

  const kpi = dailyKpi?.[0]

  const prChartOption = prData?.length ? {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: prData.map((r) => r.equipment_name), axisLabel: { rotate: 45, fontSize: 10 } },
    yAxis: { type: 'value', name: 'PR %', axisLabel: { formatter: '{value}%' } },
    series: [{ type: 'bar', data: prData.map((r) => r.pr_percent?.toFixed(1)), barMaxWidth: 30,
      itemStyle: { color: '#ffb300', borderRadius: [3,3,0,0] } }],
  } : null

  const sydChartOption = sydData?.length ? {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: sydData.map((r) => r.equipment_name), axisLabel: { rotate: 45, fontSize: 10 } },
    yAxis: { type: 'value', name: 'SYD %', axisLabel: { formatter: '{value}%' } },
    series: [{ type: 'bar', data: sydData.map((r) => r.syd_percent?.toFixed(1)), barMaxWidth: 30,
      itemStyle: { color: '#3b82f6', borderRadius: [3,3,0,0] } }],
  } : null

  return (
    <div className="page-root">
      <div className="page-header">
        <h1 className="page-title">Analytics — Daily KPI</h1>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="kpi-label block mb-1">Site</label>
          <select className="select" value={siteName} onChange={(e) => setSiteName(e.target.value)}>
            <option value="">Select site…</option>
            {sites?.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="kpi-label block mb-1">Date</label>
          <input type="date" className="input w-44" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {kpiError && <ErrorBanner message="Failed to load KPI data." />}

      {/* KPI tiles */}
      {(kpiLoading && siteName) ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : kpi ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPITile label="ABT Export" value={formatKWh(kpi.abt_export_kwh)} />
          <KPITile label="POA" value={kpi.poa != null ? `${kpi.poa.toFixed(1)} W/m²` : '—'} />
          <KPITile label="PA" value={formatPct(kpi.pa_percent)} />
          <KPITile label="GA" value={formatPct(kpi.ga_percent)} />
        </div>
      ) : siteName ? (
        <EmptyState message={`No KPI data for ${siteName} on ${fmtDate(date)}`} />
      ) : null}

      {/* Charts */}
      {prChartOption && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-muted mb-3">Performance Ratio by Equipment</h3>
          <ReactECharts option={prChartOption} style={{ height: 280 }} />
        </div>
      )}
      {sydChartOption && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-muted mb-3">SYD Deviation by Equipment</h3>
          <ReactECharts option={sydChartOption} style={{ height: 280 }} />
        </div>
      )}
    </div>
  )
}
