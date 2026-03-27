// src/pages/RawAnalyserPage.tsx
// Raw Analyser — SCB/inverter time-series viewer with cascading equipment selection

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import { http } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Card, Button, EmptyState, ErrorBanner, Spinner, KPITile } from '@/components/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SCBDisplay { col: string; display_label: string }

interface TimeseriesRow {
  timestamp:    string
  date:         string
  time:         string
  inv_stn_name: string
  inv_name:     string
  [scb: string]: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

const rawApi = {
  sites:       () => http.get<string[]>('/raw/sites').then((r) => r.data),
  invStations: (site: string) =>
    http.get<string[]>('/raw/inv-stations', { params: { site_name: site } }).then((r) => r.data),
  inverters: (site: string, invStations: string[]) =>
    http.get<string[]>('/raw/inverters', {
      params: { site_name: site, inv_stations: invStations },
      paramsSerializer: (p) => {
        const s = new URLSearchParams()
        s.set('site_name', p.site_name)
        for (const v of p.inv_stations) s.append('inv_stations', v)
        return s.toString()
      },
    }).then((r) => r.data),
  units: (site: string, invStations: string[], inverters: string[]) =>
    http.get<string[]>('/raw/units', {
      params: { site_name: site, inv_stations: invStations, inverters },
      paramsSerializer: (p) => {
        const s = new URLSearchParams()
        s.set('site_name', p.site_name)
        for (const v of p.inv_stations) s.append('inv_stations', v)
        for (const v of p.inverters) s.append('inverters', v)
        return s.toString()
      },
    }).then((r) => r.data),
  scbs: (site: string, invStations: string[], inverters: string[], units: string[]) =>
    http.get<SCBDisplay[]>('/raw/scbs', {
      params: { site_name: site, inv_stations: invStations, inverters, units },
      paramsSerializer: (p) => {
        const s = new URLSearchParams()
        s.set('site_name', p.site_name)
        for (const v of p.inv_stations) s.append('inv_stations', v)
        for (const v of p.inverters) s.append('inverters', v)
        for (const v of p.units) s.append('units', v)
        return s.toString()
      },
    }).then((r) => r.data),
  dateBounds: (site: string) =>
    http.get<{ date_min: string | null; date_max: string | null }>('/raw/date-bounds', {
      params: { site_name: site },
    }).then((r) => r.data),
  timeseries: (body: {
    site_name: string; from_date: string; to_date: string;
    inv_stations: string[]; inverters: string[]; units: string[];
    scb_cols: string[]; normalize: boolean;
  }) => http.post<TimeseriesRow[]>('/raw/timeseries', body).then((r) => r.data),
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-chip selector helper
// ─────────────────────────────────────────────────────────────────────────────

function ChipSelect({
  label, options, selected, onChange, loading, max = 50,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
  loading?: boolean
  max?: number
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])

  return (
    <div className="flex flex-col gap-1.5 min-w-[180px]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-surface-muted uppercase tracking-wide">{label}</p>
        {options.length > 0 && (
          <div className="flex gap-1.5 text-xs">
            <button className="text-amber-700 underline" onClick={() => onChange(options)}>All</button>
            <span className="text-surface-muted">·</span>
            <button className="text-surface-muted underline" onClick={() => onChange([])}>None</button>
          </div>
        )}
      </div>
      {loading ? (
        <div className="flex items-center gap-1.5"><Spinner size="sm" /><span className="text-xs text-surface-muted">Loading…</span></div>
      ) : options.length === 0 ? (
        <p className="text-xs text-surface-muted italic">No options</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto max-w-xs">
          {options.slice(0, max).map((o) => (
            <button
              key={o}
              onClick={() => toggle(o)}
              className={cn(
                'badge text-xs cursor-pointer transition-all',
                selected.includes(o)
                  ? 'bg-amber-brand/20 border-amber-brand text-amber-700 font-bold'
                  : 'badge-gray',
              )}
            >
              {o}
            </button>
          ))}
          {options.length > max && (
            <span className="badge badge-gray text-xs">+{options.length - max} more</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Time-series chart
// ─────────────────────────────────────────────────────────────────────────────

function timeseriesChartOption(rows: TimeseriesRow[], scbCols: string[], normalize: boolean) {
  // Up to 12 series for readability
  const useCols = scbCols.slice(0, 12)
  const timestamps = rows.map((r) => r.time || r.timestamp?.slice(11, 16) || '')

  // Generate distinguishable colours
  const COLORS = [
    '#ffb300','#6366f1','#22c55e','#ef4444','#06b6d4',
    '#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316',
    '#64748b','#0ea5e9',
  ]

  const series = useCols.map((col, idx) => ({
    name: col,
    type: 'line',
    data: rows.map((r) => {
      const v = r[col]
      return v == null ? null : +Number(v).toFixed(2)
    }),
    smooth: true,
    lineStyle: { width: 1.5, color: COLORS[idx % COLORS.length] },
    itemStyle: { color: COLORS[idx % COLORS.length] },
    symbol: 'none',
  }))

  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number | null) => v == null ? '—' : `${v.toFixed(2)}${normalize ? ' (norm)' : ' A'}`,
    },
    legend: {
      type: 'scroll',
      top: 0, right: 0,
      itemWidth: 10, itemHeight: 10,
      textStyle: { fontSize: 10 },
    },
    grid: { top: 36, bottom: 48, left: 64, right: 16 },
    xAxis: {
      type: 'category',
      data: timestamps,
      axisLabel: { fontSize: 9, rotate: 30, interval: Math.floor(timestamps.length / 8) },
    },
    yAxis: {
      type: 'value',
      name: normalize ? 'Normalized' : 'Current (A)',
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10 },
    },
    series,
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', height: 20, bottom: 4 },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function RawAnalyserPage() {
  const [site,         setSite]         = useState('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [invStations,  setInvStations]  = useState<string[]>([])
  const [inverters,    setInverters]    = useState<string[]>([])
  const [units,        setUnits]        = useState<string[]>([])
  const [scbCols,      setScbCols]      = useState<string[]>([])
  const [normalize,    setNormalize]    = useState(false)
  const [rows,         setRows]         = useState<TimeseriesRow[] | null>(null)
  const [apiError,     setApiError]     = useState('')

  // Reset cascades when site changes
  useEffect(() => {
    setInvStations([])
    setInverters([])
    setUnits([])
    setScbCols([])
    setDateFrom('')
    setDateTo('')
    setRows(null)
  }, [site])
  useEffect(() => { setInverters([]); setUnits([]); setScbCols([]) }, [invStations])
  useEffect(() => { setUnits([]); setScbCols([]) }, [inverters])
  useEffect(() => { setScbCols([]) }, [units])

  const { data: sites, isLoading: loadingSites } = useQuery({
    queryKey: ['raw', 'sites'],
    queryFn: rawApi.sites,
  })

  const { data: bounds } = useQuery({
    queryKey: ['raw', 'date-bounds', site],
    queryFn: () => rawApi.dateBounds(site),
    enabled: !!site,
  })

  useEffect(() => {
    if (bounds) {
      if (!dateFrom && bounds.date_min) setDateFrom(bounds.date_min)
      if (!dateTo   && bounds.date_max) setDateTo(bounds.date_max)
    }
  }, [bounds])

  const { data: invStationList, isLoading: loadingIS } = useQuery({
    queryKey: ['raw', 'inv-stations', site],
    queryFn: () => rawApi.invStations(site),
    enabled: !!site,
  })

  const { data: inverterList, isLoading: loadingInv } = useQuery({
    queryKey: ['raw', 'inverters', site, invStations],
    queryFn: () => rawApi.inverters(site, invStations),
    enabled: !!site && invStations.length > 0,
  })

  const { data: unitList, isLoading: loadingUnits } = useQuery({
    queryKey: ['raw', 'units', site, invStations, inverters],
    queryFn: () => rawApi.units(site, invStations, inverters),
    enabled: !!site && inverters.length > 0,
  })

  const { data: scbList, isLoading: loadingSCBs } = useQuery({
    queryKey: ['raw', 'scbs', site, invStations, inverters, units],
    queryFn: () => rawApi.scbs(site, invStations, inverters, units),
    enabled: !!site && (inverters.length > 0 || units.length > 0),
  })

  const fetchMutation = useMutation({
    mutationFn: () => rawApi.timeseries({
      site_name:    site,
      from_date:    dateFrom,
      to_date:      dateTo,
      inv_stations: invStations,
      inverters,
      units,
      scb_cols:     scbCols,
      normalize,
    }),
    onSuccess: (data) => { setRows(data); setApiError('') },
    onError:   (e: Error) => setApiError(e.message || 'Failed to fetch time-series.'),
  })

  const scbColOptions = (scbList ?? []).map((s) => s.col)
  const selectedSCBLabels = scbCols.map(
    (c) => scbList?.find((s) => s.col === c)?.display_label ?? c,
  )

  const summaryStats = rows && scbCols.length > 0 ? (() => {
    const vals = rows.flatMap((r) =>
      scbCols.map((c) => r[c] as number | null).filter((v) => v != null),
    ) as number[]
    return {
      count: vals.length,
      avg: vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '—',
      min: vals.length ? Math.min(...vals).toFixed(2) : '—',
      max: vals.length ? Math.max(...vals).toFixed(2) : '—',
    }
  })() : null

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl text-navy-800">Raw Analyser</h1>
        <p className="text-sm text-surface-muted mt-0.5">
          SCB / inverter time-series viewer · 06:00–18:00 operational window
        </p>
      </div>

      {/* Site + date */}
      <Card className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Site</label>
          {loadingSites ? <Spinner size="sm" /> : (
            <select className="select w-52" value={site} onChange={(e) => setSite(e.target.value)}>
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
        <label className="flex items-center gap-2 text-sm cursor-pointer pb-1">
          <input
            type="checkbox"
            checked={normalize}
            onChange={(e) => setNormalize(e.target.checked)}
            className="h-4 w-4 rounded accent-amber-brand"
          />
          Normalize by load_kwp
        </label>
      </Card>

      {/* Cascading equipment selectors */}
      {site && (
        <Card className="flex flex-wrap gap-6 items-start">
          <ChipSelect
            label="Inv Stations"
            options={invStationList ?? []}
            selected={invStations}
            onChange={setInvStations}
            loading={loadingIS}
          />
          {invStations.length > 0 && (
            <ChipSelect
              label="Inverters"
              options={inverterList ?? []}
              selected={inverters}
              onChange={setInverters}
              loading={loadingInv}
            />
          )}
          {inverters.length > 0 && (
            <ChipSelect
              label="Units"
              options={unitList ?? []}
              selected={units}
              onChange={setUnits}
              loading={loadingUnits}
            />
          )}
          {(inverters.length > 0 || units.length > 0) && (
            <ChipSelect
              label={`SCBs (${scbColOptions.length})`}
              options={scbColOptions}
              selected={scbCols}
              onChange={setScbCols}
              loading={loadingSCBs}
              max={80}
            />
          )}

          {scbCols.length > 0 && (
            <div className="flex flex-col gap-2 justify-end">
              <Button
                variant="primary"
                loading={fetchMutation.isPending}
                disabled={!dateFrom || !dateTo}
                onClick={() => fetchMutation.mutate()}
              >
                Fetch Data
              </Button>
              {scbCols.length > 12 && (
                <p className="text-xs text-amber-700">
                  ⚠️ Chart shows first 12 of {scbCols.length} SCBs
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Error */}
      {apiError && <ErrorBanner message={apiError} />}

      {/* Loading */}
      {fetchMutation.isPending && (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      )}

      {/* Results */}
      {rows && !fetchMutation.isPending && (
        <>
          {summaryStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPITile label="Data Points"  value={summaryStats.count.toLocaleString()} />
              <KPITile label="Avg Current"  value={summaryStats.avg} unit={normalize ? '' : 'A'} />
              <KPITile label="Min Current"  value={summaryStats.min} unit={normalize ? '' : 'A'} />
              <KPITile label="Max Current"  value={summaryStats.max} unit={normalize ? '' : 'A'} />
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState message="No data in the 06:00–18:00 window for this selection" icon="📉" />
          ) : (
            <Card className="p-4">
              <h3 className="text-sm font-bold text-navy-800 mb-3">
                {scbCols.length} SCB Time-series · {rows.length} timestamps · {dateFrom} → {dateTo}
              </h3>
              <ReactECharts
                option={timeseriesChartOption(rows, scbCols, normalize)}
                style={{ height: 380 }}
              />
            </Card>
          )}

          {/* Raw table (first 100 rows) */}
          {rows.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
                <h3 className="text-sm font-bold text-navy-800">Raw Data</h3>
                <span className="text-xs text-surface-muted">
                  Showing {Math.min(rows.length, 100)} of {rows.length} rows
                </span>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Inv Station</th>
                      <th>Inverter</th>
                      {scbCols.slice(0, 12).map((c) => <th key={c}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((r, i) => (
                      <tr key={i}>
                        <td className="font-mono text-xs">{r.date}</td>
                        <td className="font-mono text-xs">{r.time}</td>
                        <td className="text-xs">{r.inv_stn_name}</td>
                        <td className="text-xs">{r.inv_name}</td>
                        {scbCols.slice(0, 12).map((c) => (
                          <td key={c} className="font-mono text-xs text-right">
                            {r[c] == null ? '—' : Number(r[c]).toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {!rows && !fetchMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-surface-muted">
          <span className="text-5xl">📈</span>
          <p className="text-sm font-medium">
            Select site → equipment → SCBs → Fetch Data
          </p>
        </div>
      )}
    </div>
  )
}
