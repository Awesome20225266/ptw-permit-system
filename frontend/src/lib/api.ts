import axios, { type AxiosError } from 'axios'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import type {
  LoginRequest,
  LoginResponse,
  UserInfo,
  DailyKpiRow,
  BudgetKpiRow,
  PREquipmentRow,
  SYDEquipmentRow,
  PortfolioSummary,
  PortfolioRawRow,
  SYDRow,
  PRRow,
  Comment,
  CommentCreate,
  BulkInsertResult,
  ReconnectRow,
  TableInfo,
  ColumnInfo,
  WorkOrder,
  WorkOrderCreateInput,
  WorkOrderUpdateInput,
  WorkOrderKpis,
  PTWRequest,
  DateBounds,
} from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────────────────────────────────────────

export const http = axios.create({
  baseURL: '/api/v1',
  timeout: 30_000,
})

// Attach JWT on every request
http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 401 → clear cache then logout so the next user starts completely fresh
http.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      queryClient.clear()
      useAuthStore.getState().logout()
    }
    return Promise.reject(err)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (body: LoginRequest) =>
    http.post<LoginResponse>('/auth/login', body).then((r) => r.data),
  logout: () => http.post('/auth/logout'),
  me: () => http.get<UserInfo>('/auth/me').then((r) => r.data),
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────────────────

export const analyticsApi = {
  sites: () => http.get<string[]>('/analytics/sites').then((r) => r.data),

  dates: (siteName: string) =>
    http.get<string[]>('/analytics/dates', { params: { site_name: siteName } }).then((r) => r.data),

  dailyKpi: (siteName: string, date: string) =>
    http
      .get<DailyKpiRow[]>('/analytics/daily-kpi', { params: { site_name: siteName, date } })
      .then((r) => r.data),

  budgetKpi: (siteName: string, date: string) =>
    http
      .get<BudgetKpiRow[]>('/analytics/budget-kpi', { params: { site_name: siteName, date } })
      .then((r) => r.data),

  pr: (siteName: string, date: string) =>
    http
      .get<PREquipmentRow[]>('/analytics/pr', { params: { site_name: siteName, date } })
      .then((r) => r.data),

  syd: (siteName: string, date: string) =>
    http
      .get<SYDEquipmentRow[]>('/analytics/syd', { params: { site_name: siteName, date } })
      .then((r) => r.data),
}

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio
// ─────────────────────────────────────────────────────────────────────────────

export const portfolioApi = {
  sites: () => http.get<string[]>('/portfolio/sites').then((r) => r.data),

  dateBounds: () => http.get<DateBounds>('/portfolio/date-bounds').then((r) => r.data),

  summary: (sites: string[], dateFrom: string, dateTo: string) =>
    http
      .get<PortfolioSummary>('/portfolio/summary', {
        params: { sites, date_from: dateFrom, date_to: dateTo },
        paramsSerializer: (p) => {
          const s = new URLSearchParams()
          for (const site of p.sites) s.append('sites', site)
          s.set('date_from', p.date_from)
          s.set('date_to', p.date_to)
          return s.toString()
        },
      })
      .then((r) => r.data),

  raw: (sites: string[], dateFrom: string, dateTo: string) =>
    http
      .get<PortfolioRawRow[]>('/portfolio/raw', {
        params: { sites, date_from: dateFrom, date_to: dateTo },
        paramsSerializer: (p) => {
          const s = new URLSearchParams()
          for (const site of p.sites) s.append('sites', site)
          s.set('date_from', p.date_from)
          s.set('date_to', p.date_to)
          return s.toString()
        },
      })
      .then((r) => r.data),
}

// ─────────────────────────────────────────────────────────────────────────────
// Operation Theatre
// ─────────────────────────────────────────────────────────────────────────────

export const operationApi = {
  sites: () => http.get<string[]>('/operation/sites').then((r) => r.data),

  dateBounds: () => http.get<DateBounds>('/operation/date-bounds').then((r) => r.data),

  syd: (sites: string[], params?: { date?: string; date_from?: string; date_to?: string }) =>
    http
      .get<SYDRow[]>('/operation/syd', {
        params: { sites, ...params },
        paramsSerializer: (p) => {
          const s = new URLSearchParams()
          for (const site of p.sites ?? []) s.append('sites', site)
          if (p.date) s.set('date', p.date)
          if (p.date_from) s.set('date_from', p.date_from)
          if (p.date_to) s.set('date_to', p.date_to)
          return s.toString()
        },
      })
      .then((r) => r.data),

  pr: (sites: string[], params?: { date?: string; date_from?: string; date_to?: string }) =>
    http
      .get<PRRow[]>('/operation/pr', {
        params: { sites, ...params },
        paramsSerializer: (p) => {
          const s = new URLSearchParams()
          for (const site of p.sites ?? []) s.append('sites', site)
          if (p.date) s.set('date', p.date)
          if (p.date_from) s.set('date_from', p.date_from)
          if (p.date_to) s.set('date_to', p.date_to)
          return s.toString()
        },
      })
      .then((r) => r.data),
}

// ─────────────────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────────────────

export const commentsApi = {
  list: (siteNames: string[], startDate: string, endDate: string, limit = 500) =>
    http
      .get<Comment[]>('/comments', {
        params: { site_names: siteNames, start_date: startDate, end_date: endDate, limit },
        paramsSerializer: (p) => {
          const s = new URLSearchParams()
          for (const n of p.site_names) s.append('site_names', n)
          s.set('start_date', p.start_date)
          s.set('end_date', p.end_date)
          s.set('limit', String(p.limit))
          return s.toString()
        },
      })
      .then((r) => r.data),

  create: (body: CommentCreate) =>
    http.post<Comment>('/comments', body).then((r) => r.data),

  bulk: (payloads: CommentCreate[]) =>
    http.post<BulkInsertResult>('/comments/bulk', payloads).then((r) => r.data),

  update: (id: number, body: Partial<CommentCreate>) =>
    http.put<Comment>(`/comments/${id}`, body).then((r) => r.data),

  delete: (id: number) => http.delete(`/comments/${id}`),
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconnect
// ─────────────────────────────────────────────────────────────────────────────

export const reconnectApi = {
  plants: () => http.get<string[]>('/reconnect/plants').then((r) => r.data),

  dateRange: (plantNames: string[]) =>
    http
      .get<DateBounds>('/reconnect/date-range', {
        params: { plant_names: plantNames },
        paramsSerializer: (p) => {
          const s = new URLSearchParams()
          for (const n of p.plant_names) s.append('plant_names', n)
          return s.toString()
        },
      })
      .then((r) => r.data),

  data: (plantNames: string[], startDate: string, endDate: string) =>
    http
      .get<ReconnectRow[]>('/reconnect/data', {
        params: { plant_names: plantNames, start_date: startDate, end_date: endDate },
        paramsSerializer: (p) => {
          const s = new URLSearchParams()
          for (const n of p.plant_names) s.append('plant_names', n)
          s.set('start_date', p.start_date)
          s.set('end_date', p.end_date)
          return s.toString()
        },
      })
      .then((r) => r.data),
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta Viewer
// ─────────────────────────────────────────────────────────────────────────────

export const metaApi = {
  tables: () => http.get<TableInfo[]>('/meta/tables').then((r) => r.data),
  schema: (tableName: string) =>
    http.get<ColumnInfo[]>('/meta/schema', { params: { table_name: tableName } }).then((r) => r.data),
  sample: (tableName: string, limit = 10) =>
    http
      .get<Record<string, unknown>[]>('/meta/sample', { params: { table_name: tableName, limit } })
      .then((r) => r.data),

  /** Sites the logged-in user is allowed to access (from dashboard_users.site) */
  allowedSites: () =>
    http.get<string[]>('/meta/allowed-sites').then((r) => r.data),

  /** Distinct locations for a site from master_db */
  masterLocations: (siteName: string) =>
    http.get<string[]>('/meta/master-locations', { params: { site_name: siteName } }).then((r) => r.data),

  /** Distinct equipment for a site from master_db */
  masterEquipment: (siteName: string) =>
    http.get<string[]>('/meta/master-equipment', { params: { site_name: siteName } }).then((r) => r.data),
}

// ─────────────────────────────────────────────────────────────────────────────
// Permits
// ─────────────────────────────────────────────────────────────────────────────

export const permitApi = {
  // S1
  s1WorkOrderSites: () =>
    http.get<string[]>('/permits/s1/work-order-sites').then((r) => r.data),

  s1WorkOrders: (params?: { site_name?: string; start_date?: string; end_date?: string }) =>
    http.get<{ kpis: WorkOrderKpis; data: WorkOrder[] }>('/permits/s1/work-orders', { params }).then((r) => r.data),

  s1OpenWorkOrders: (params?: { start_date?: string; end_date?: string; site_name?: string }) =>
    http.get<WorkOrder[]>('/permits/s1/open-work-orders', { params }).then((r) => r.data),

  s1ServerTime: () =>
    http.get<{ now_ist: string; validity_date: string }>('/permits/s1/server-time').then((r) => r.data),

  s1ListPtw: (params?: { site_name?: string; start_date?: string; end_date?: string }) =>
    http.get<PTWRequest[]>('/permits/s1/ptw', { params }).then((r) => r.data),

  s1CreatePtw: (body: {
    permit_no: string
    site_name: string
    created_by: string
    form_data: Record<string, unknown>
  }) => http.post('/permits/s1/ptw', body).then((r) => r.data),

  s1CreatePtwV2: (body: {
    permit_no: string
    site_name: string
    work_order_ids: string[]
    description_of_work: string
    contractor_name: string
    work_location: string
    validity_date: string
    extra_form_data?: Record<string, unknown>
  }) => http.post<{
    ptw_id: string; permit_no: string; site_name: string
    work_location: string; work_order_ids: string[]; validity_date: string; created_by: string
  }>('/permits/s1/ptw/v2', body).then((r) => r.data),

  s1EditPtwV2: (ptwId: string, body: {
    permit_no: string
    work_order_ids: string[]
    description_of_work: string
    contractor_name: string
    work_location: string
    validity_date: string
    extra_form_data?: Record<string, unknown>
  }) => http.put(`/permits/s1/ptw/${ptwId}`, body).then((r) => r.data),

  s1ClosePtw: (
    ptwId: string,
    permitNo: string,
    formData: Record<string, unknown>,
    closureNotes: string,
  ) =>
    http
      .post(`/permits/s1/ptw/${ptwId}/close`, {
        permit_no: permitNo,
        form_data: formData,
        closure_notes: closureNotes,
      })
      .then((r) => r.data),

  s1CloseWithEvidence: (ptwId: string, formData: FormData) =>
    http
      .post(`/permits/s1/ptw/${ptwId}/close-with-evidence`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),

  s1DownloadPdf: (ptwId: string) =>
    http
      .get(`/permits/s1/ptw/${ptwId}/pdf`, { responseType: 'blob' })
      .then((r) => r.data as Blob),

  s1DeletePtw: (ptwId: string) =>
    http.delete(`/permits/s1/ptw/${ptwId}`).then((r) => r.data),

  /** Returns how many evidence photos exist for a closed PTW */
  s1EvidenceCount: (ptwId: string) =>
    http.get<{ ptw_id: string; count: number }>(`/permits/s1/ptw/${ptwId}/evidence-count`).then((r) => r.data),

  /** Returns evidence with pre-signed Supabase URLs (use instead of proxy URLs) */
  s1EvidenceList: (ptwId: string) =>
    http.get<Array<{ path: string; folder: string; signed_url: string }>>(
      `/permits/s1/ptw/${ptwId}/evidence-list`,
    ).then((r) => r.data),

  /**
   * Returns an array of backend proxy URLs (one per evidence photo).
   * Kept for backwards compatibility.
   */
  s1EvidenceUrls: (ptwId: string, count: number): string[] =>
    Array.from({ length: count }, (_, i) => `/api/v1/permits/s1/ptw/${ptwId}/evidence/${i}`),

  // S2 — universal filter & users
  s2WorkOrderSites: () =>
    http.get<string[]>('/permits/s2/work-order-sites').then((r) => r.data),

  s2WorkOrders: (params: { site_name?: string; start_date?: string; end_date?: string }) =>
    http.get<{ kpis: Record<string, number>; data: unknown[] }>('/permits/s2/work-orders', { params }).then((r) => r.data),

  s2Users: () =>
    http.get<string[]>('/permits/s2/users').then((r) => r.data),

  s2ListPtw: (params?: { site_name?: string; start_date?: string; end_date?: string }) =>
    http.get<PTWRequest[]>('/permits/s2/ptw', { params }).then((r) => r.data),

  /** Returns list of S2 evidence files with pre-signed Supabase URLs */
  s2EvidenceList: (ptwId: string) =>
    http.get<Array<{ path: string; folder: string; wo_id: string; signed_url: string }>>(
      `/permits/s2/ptw/${ptwId}/evidence`,
    ).then((r) => r.data),

  s2UploadEvidence: (
    ptwId: string,
    blob: Blob,
    workOrderId: string,
    folder: string,
    fileName: string,
  ) =>
    // Send raw binary body — avoids multipart parsing issues on Windows uvicorn
    http.post(
      `/permits/s2/ptw/${ptwId}/upload-evidence`,
      blob,
      {
        headers: { 'Content-Type': 'image/jpeg' },
        params: { work_order_id: workOrderId, folder, file_name: fileName },
      },
    ).then((r) => r.data),

  s2ForwardPtw: (
    ptwId: string,
    body: {
      work_order_ids: string[]
      permit_holder: string
      isolation_requirement: string
      form_data_updates?: Record<string, unknown>
    },
  ) =>
    http.post(`/permits/s2/ptw/${ptwId}/forward`, body).then((r) => r.data),

  s2RevokePtw: (ptwId: string, workOrderIds: string[]) =>
    http
      .post(`/permits/s2/ptw/${ptwId}/revoke`, { work_order_ids: workOrderIds })
      .then((r) => r.data),

  // S3 — universal filter, users, KPIs
  s3WorkOrderSites: () =>
    http.get<string[]>('/permits/s3/work-order-sites').then((r) => r.data),

  s3Users: () =>
    http.get<string[]>('/permits/s3/users').then((r) => r.data),

  s3WorkOrders: (params: { site_name?: string; start_date?: string; end_date?: string }) =>
    http.get<{ kpis: WorkOrderKpis; data: unknown[] }>('/permits/s3/work-orders', { params }).then((r) => r.data),

  s3ListPtw: (params: { site_name?: string; start_date?: string; end_date?: string } = {}) =>
    http.get<PTWRequest[]>('/permits/s3/ptw', { params }).then((r) => r.data),

  /** Approve a PTW by its UUID (preferred — direct lookup) */
  s3ApprovePtwById: (ptwId: string, issuerName: string, remark = 'Approved') =>
    http
      .post(`/permits/s3/ptw/${ptwId}/approve`, { issuer_name: issuerName, remark })
      .then((r) => r.data),

  /** Legacy: approve by work_order_id (kept for backwards compat) */
  s3ApprovePtw: (workOrderId: string, issuerName: string) =>
    http
      .post(`/permits/s3/ptw/${workOrderId}/approve-legacy`, { issuer_name: issuerName })
      .then((r) => r.data),

  s3RejectPtw: (workOrderId: string, reason?: string) =>
    http
      .post(`/permits/s3/ptw/${workOrderId}/reject`, { reason })
      .then((r) => r.data),

  s3RevokePtw: (workOrderId: string) =>
    http
      .post(`/permits/s3/ptw/${workOrderId}/revoke`)
      .then((r) => r.data),

  s3DownloadPdf: (workOrderId: string) =>
    http
      .get(`/permits/s3/ptw/${workOrderId}/pdf`, { responseType: 'blob' })
      .then((r) => r.data as Blob),

  /** S3 evidence (reuse S2 endpoints for viewing evidence) */
  s3EvidenceList: (ptwId: string) =>
    http.get<Array<{ path: string; folder: string; wo_id: string; signed_url: string }>>(
      `/permits/s2/ptw/${ptwId}/evidence`,
    ).then((r) => r.data),

  // ── Work Order CRUD (S2 = create + edit; S3 = create + edit) ─────────────

  /** Create a new work order (available in S2 and S3 portals) */
  createWorkOrder: (body: WorkOrderCreateInput, portal: 's2' | 's3') =>
    http.post<WorkOrder>(`/permits/${portal}/work-orders/create`, body).then((r) => r.data),

  /** Edit an existing work order — S2 or S3, blocked when PTW already started */
  editWorkOrder: (portal: 's2' | 's3', workOrderId: string, body: WorkOrderUpdateInput) =>
    http.put<WorkOrder>(`/permits/${portal}/work-orders/${workOrderId}`, body).then((r) => r.data),

  /** @deprecated use editWorkOrder('s2', ...) */
  s2EditWorkOrder: (workOrderId: string, body: WorkOrderUpdateInput) =>
    http.put<WorkOrder>(`/permits/s2/work-orders/${workOrderId}`, body).then((r) => r.data),
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Download a blob as a file — used for PDF downloads */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
