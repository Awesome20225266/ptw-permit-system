// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
}

export interface UserInfo {
  username: string
  allowed_pages: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics (dashboard.py — daily KPI view)
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyKpiRow {
  site_name: string
  date: string
  abt_export_kwh: number | null
  poa: number | null
  pa_percent: number | null
  ga_percent: number | null
  [key: string]: unknown
}

export interface BudgetKpiRow {
  site_name: string
  date: string
  b_energy_kwh: number | null
  b_poa: number | null
  b_pa_percent: number | null
  b_ga_percent: number | null
  [key: string]: unknown
}

export interface PREquipmentRow {
  equipment_name: string
  pr_percent: number
}

export interface SYDEquipmentRow {
  equipment_name: string
  syd_percent: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio Analytics
// ─────────────────────────────────────────────────────────────────────────────

export interface PortfolioSummary {
  b_energy_kwh: number
  a_energy_kwh: number
  energy_gap_kwh: number
  b_poa: number
  a_poa: number
  b_pa_percent: number
  a_pa_percent: number
  b_ga_percent: number
  a_ga_percent: number
}

export interface PortfolioRawRow {
  site_name: string
  date: string
  b_energy_kwh: number | null
  abt_export_kwh: number | null
  b_poa: number | null
  poa: number | null
  b_pa_percent: number | null
  pa_percent: number | null
  b_ga_percent: number | null
  ga_percent: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Operation Theatre
// ─────────────────────────────────────────────────────────────────────────────

export interface SYDRow {
  site_name: string
  equipment_name: string
  date: string
  syd_dev_pct: number
}

export interface PRRow {
  site_name: string
  equipment_name: string
  date: string
  pr_pct: number
}

export type QueryMode = 'latest' | 'date' | 'range'

// ─────────────────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────────────────

export interface Comment {
  id: number
  site_name: string
  equipment_names: string[]
  start_date: string
  end_date: string
  deviation: number | string
  reasons: string[]
  remarks: string | null
  created_at: string
  created_by: string | null
}

export interface CommentCreate {
  site_name: string
  equipment_names: string[]
  start_date: string
  end_date: string
  deviation: number | string
  reasons: string[]
  remarks?: string
}

export interface BulkInsertResult {
  inserted: number
  duplicates: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconnect DSM
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconnectRow {
  plant_name: string
  date: string
  time: string
  block: number
  forecast_da_mw: number | null
  actual_mw: number | null
  accepted_schedule_eod_mw: number | null
  generated_schedule_mw: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta Viewer
// ─────────────────────────────────────────────────────────────────────────────

export interface TableInfo {
  table_name: string
  row_count: number
}

export interface ColumnInfo {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Permit (PTW)
// ─────────────────────────────────────────────────────────────────────────────

export type PTWStatus =
  | 'OPEN'
  | 'WIP'
  | 'PENDING_S2'
  | 'PENDING_S3'
  | 'APPROVED'
  | 'REJECTED'
  | 'CLOSED'
  | 'PERMIT_EXPIRED'
  | 'PENDING_AT_S3'

export type WorkOrderStatus =
  | 'OPEN'
  | 'PENDING_S2'
  | 'PENDING_S3'
  | 'APPROVED'
  | 'CLOSED'
  | 'PERMIT_EXPIRED'

export interface WorkOrder {
  work_order_id: string
  site_name: string
  location: string | null
  equipment: string | null
  frequency: string | null
  isolation_requirement: string | null
  date_planned: string | null
  date_s1_created: string | null
  date_s2_forwarded: string | null
  date_s3_approved: string | null
  date_s2_rejected: string | null
  date_s3_rejected: string | null
  date_s1_closed: string | null
  remark: string | null
  status: WorkOrderStatus | PTWStatus
}

export interface WorkOrderCreateInput {
  site_name: string
  location: string
  equipment: string
  frequency: string
  isolation_requirement: string
  date_planned: string
}

export interface WorkOrderUpdateInput extends WorkOrderCreateInput {
  remark: string
}

export interface WorkOrderKpis {
  total: number
  open: number
  pending_s2: number
  pending_s3: number
  approved: number
  closed: number
  expired: number
}

export interface PTWRequest {
  ptw_id: string
  permit_no: string
  site_name: string
  status: string
  derived_status: PTWStatus
  created_at: string
  created_by: string
  form_data: Record<string, unknown>
  work_order_ids?: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface DateBounds {
  date_min: string
  date_max: string
}

export type PageKey =
  | 'portfolio'
  | 'operation'
  | 'reconnect'
  | 'add_comments'
  | 'meta_viewer'
  | 's1'
  | 's2'
  | 's3'
  | 'scb_ot'
  | 'raw_analyser'
  | 'scb_ot'
