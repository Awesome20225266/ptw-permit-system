// src/lib/utils.ts — Shared utility helpers

export type StatusVariant = 'green' | 'amber' | 'red' | 'blue' | 'gray'

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'

// Tailwind class merging
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Date helpers ───────────────────────────────────────────────────────────

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), 'dd MMM yyyy')
  } catch {
    return iso
  }
}

export function fmtDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'dd MMM yyyy HH:mm')
  } catch {
    return iso
  }
}

// ─── Number formatters ───────────────────────────────────────────────────────

export function formatPct(val: number | null | undefined, decimals = 1): string {
  if (val == null || isNaN(val)) return '—'
  return `${val.toFixed(decimals)}%`
}

export function formatKWh(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '—'
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(2)} GWh`
  if (Math.abs(val) >= 1e3) return `${(val / 1e3).toFixed(2)} MWh`
  return `${val.toFixed(0)} kWh`
}

export function formatINR(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '—'
  if (Math.abs(val) >= 1e7) return `₹${(val / 1e7).toFixed(2)}Cr`
  if (Math.abs(val) >= 1e5) return `₹${(val / 1e5).toFixed(2)}L`
  if (Math.abs(val) >= 1e3) return `₹${(val / 1e3).toFixed(1)}K`
  return `₹${val.toFixed(0)}`
}

export function summariseList(items: string[], max = 3): string {
  if (!items || items.length === 0) return '—'
  if (items.length <= max) return items.join(', ')
  return `${items.slice(0, max).join(', ')} +${items.length - max} more`
}

export function deltaColor(val: number | null | undefined): string {
  if (val == null) return 'text-muted'
  if (val > 0) return 'text-green-600'
  if (val < 0) return 'text-red-600'
  return 'text-muted'
}

// ─── PTW Status helpers ──────────────────────────────────────────────────────

export type PTWStatus = 'OPEN' | 'WIP' | 'APPROVED' | 'REJECTED' | 'CLOSED' | 'PENDING_AT_S3'

export function ptw_status_variant(status: string | null | undefined): StatusVariant {
  switch ((status ?? '').toUpperCase()) {
    case 'APPROVED': return 'green'
    case 'WIP':      return 'blue'
    case 'OPEN':     return 'amber'
    case 'REJECTED': return 'red'
    case 'CLOSED':   return 'gray'
    case 'PENDING_AT_S3': return 'amber'
    default:         return 'gray'
  }
}

export function ptw_status_label(status: string | null | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'OPEN':         return 'Open'
    case 'WIP':          return 'WIP'
    case 'APPROVED':     return 'Approved'
    case 'REJECTED':     return 'Rejected'
    case 'CLOSED':       return 'Closed'
    case 'PENDING_AT_S3': return 'Pending Approval'
    default:             return status || 'Unknown'
  }
}
