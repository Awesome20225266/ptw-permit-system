// src/hooks/useQueryKeys.ts — Centralised React Query key factory

export const keys = {
  me: () => ['auth', 'me'] as const,

  // Analytics
  analyticsSites: () => ['analytics', 'sites'] as const,
  analyticsDates: (site: string) => ['analytics', 'dates', site] as const,
  analyticsDailyKpi: (site: string, date: string) => ['analytics', 'daily-kpi', site, date] as const,
  analyticsBudgetKpi: (site: string, date: string) => ['analytics', 'budget-kpi', site, date] as const,
  analyticsPr: (site: string, date: string) => ['analytics', 'pr', site, date] as const,
  analyticsSyd: (site: string, date: string) => ['analytics', 'syd', site, date] as const,

  // Portfolio
  portfolioSites: () => ['portfolio', 'sites'] as const,
  portfolioDateBounds: () => ['portfolio', 'date-bounds'] as const,
  portfolioSummary: (sites: string[], d1: string, d2: string) => ['portfolio', 'summary', sites, d1, d2] as const,
  portfolioRaw: (sites: string[], d1: string, d2: string) => ['portfolio', 'raw', sites, d1, d2] as const,

  // Operation
  operationSites: () => ['operation', 'sites'] as const,
  operationDateBounds: () => ['operation', 'date-bounds'] as const,
  operationSyd: (sites: string[], params: object) => ['operation', 'syd', sites, params] as const,
  operationPr: (sites: string[], params: object) => ['operation', 'pr', sites, params] as const,

  // Comments
  comments: (sites: string[], d1: string, d2: string) => ['comments', sites, d1, d2] as const,

  // Reconnect
  reconnectPlants: () => ['reconnect', 'plants'] as const,
  reconnectDateRange: (plants: string[]) => ['reconnect', 'date-range', plants] as const,
  reconnectData: (plants: string[], d1: string, d2: string) => ['reconnect', 'data', plants, d1, d2] as const,

  // Meta
  metaTables: () => ['meta', 'tables'] as const,
  metaSchema: (table: string) => ['meta', 'schema', table] as const,
  metaSample: (table: string, limit: number) => ['meta', 'sample', table, limit] as const,
  metaAllowedSites: () => ['meta', 'allowed-sites'] as const,
  metaMasterLocations: (site: string) => ['meta', 'master-locations', site] as const,
  metaMasterEquipment: (site: string) => ['meta', 'master-equipment', site] as const,

  // Permits S1
  s1WorkOrderSites: () => ['permits', 's1', 'work-order-sites'] as const,
  s1WorkOrders: (params: object) => ['permits', 's1', 'work-orders', params] as const,
  s1OpenWorkOrders: (params: object) => ['permits', 's1', 'open-work-orders', params] as const,
  s1ServerTime: () => ['permits', 's1', 'server-time'] as const,
  s1Ptw: (params?: object) => ['permits', 's1', 'ptw', params ?? {}] as const,
  s1EvidenceUrls: (ptwId: string) => ['permits', 's1', 'ptw', ptwId, 'evidence-urls'] as const,
  s1EvidenceCount: (ptwId: string) => ['permits', 's1', 'ptw', ptwId, 'evidence-count'] as const,

  // Permits S2
  s2WorkOrderSites: () => ['permits', 's2', 'work-order-sites'] as const,
  s2WorkOrders: (params: object) => ['permits', 's2', 'work-orders', params] as const,
  s2Users: () => ['permits', 's2', 'users'] as const,
  s2Ptw: (params?: object) => ['permits', 's2', 'ptw', params ?? {}] as const,

  // Permits S3
  s3WorkOrderSites: () => ['permits', 's3', 'work-order-sites'] as const,
  s3WorkOrders: (params: object) => ['permits', 's3', 'work-orders', params] as const,
  s3Users: () => ['permits', 's3', 'users'] as const,
  s3Ptw: (params?: object) => ['permits', 's3', 'ptw', params ?? {}] as const,

  // SCB OT
  scbSites: () => ['scb', 'sites'] as const,
  scbDateBounds: (site: string) => ['scb', 'date-bounds', site] as const,

  // Raw Analyser
  rawSites: () => ['raw', 'sites'] as const,
  rawInvStations: (site: string) => ['raw', 'inv-stations', site] as const,
  rawInverters: (site: string, stations: string[]) => ['raw', 'inverters', site, stations] as const,
  rawUnits: (site: string, stations: string[], invs: string[]) => ['raw', 'units', site, stations, invs] as const,
  rawDateBounds: (site: string) => ['raw', 'date-bounds', site] as const,
}
