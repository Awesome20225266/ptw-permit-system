// src/components/ui/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared primitive UI components
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'
import { cn } from '@/lib/utils'
import type { StatusVariant } from '@/lib/utils'

// ── Badge ─────────────────────────────────────────────────────────────────────

const variantClasses: Record<StatusVariant, string> = {
  green: 'badge-green',
  amber: 'badge-amber',
  red:   'badge-red',
  blue:  'badge-blue',
  gray:  'badge-gray',
}

interface BadgeProps {
  variant?: StatusVariant
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'gray', children, className }: BadgeProps) {
  return (
    <span className={cn(variantClasses[variant], className)}>
      {children}
    </span>
  )
}

// ── Button ────────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const base = variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-ghost'
  const sz = size === 'sm' ? 'px-3 py-1.5 text-xs' : ''
  return (
    <button
      className={cn(base, sz, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} />
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card p-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={i === 0 ? 'h-5 w-2/3' : 'h-4'} />
      ))}
    </div>
  )
}

// ── Input / Select ────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">{label}</label>}
      <input className={cn('input', error && 'border-red-400 focus:ring-red-300', className)} {...props} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
}

export function Select({ label, options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">{label}</label>}
      <select className={cn('select', className)} {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card p-4', className)} {...props}>{children}</div>
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

interface KPITileProps {
  label: string
  value: string
  unit?: string
  delta?: string
  deltaPositive?: boolean
  note?: string
  className?: string
}

export function KPITile({ label, value, unit, delta, deltaPositive, note, className }: KPITileProps) {
  return (
    <div className={cn('card p-4 flex flex-col gap-1', className)}>
      <p className="kpi-label">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="kpi-value">{value}</span>
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {delta && (
        <p className={deltaPositive ? 'kpi-delta-pos text-sm' : 'kpi-delta-neg text-sm'}>
          {deltaPositive ? '▲' : '▼'} {delta}
        </p>
      )}
      {note && <p className="kpi-note mt-0.5">{note}</p>}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({ message = 'No data available', icon = '📭' }: { message?: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-surface-muted">
      <span className="text-4xl">{icon}</span>
      <p className="text-sm font-medium">{message}</p>
    </div>
  )
}

// ── Error banner ──────────────────────────────────────────────────────────────

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
      <span className="text-base leading-none mt-0.5">⚠️</span>
      <span>{message}</span>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sz = size === 'sm' ? 'h-4 w-4 border-2' : size === 'lg' ? 'h-8 w-8 border-4' : 'h-6 w-6 border-2'
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-current border-t-transparent text-amber-brand',
        sz,
        className,
      )}
    />
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Divider({ label }: { label?: string }) {
  if (!label) return <hr className="border-surface-border my-4" />
  return (
    <div className="flex items-center gap-3 my-4">
      <hr className="flex-1 border-surface-border" />
      <span className="text-xs text-surface-muted font-semibold uppercase tracking-wider">{label}</span>
      <hr className="flex-1 border-surface-border" />
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: string
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative bg-white rounded-2xl shadow-xl border border-surface-border w-full animate-slide-up',
          'flex flex-col max-h-[92vh]',
          width,
        )}
      >
        {title && (
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-surface-border">
            <h2 className="text-base font-bold text-navy-800">{title}</h2>
            <button
              onClick={onClose}
              className="text-surface-muted hover:text-navy-800 transition-colors text-xl leading-none"
            >
              ×
            </button>
          </div>
        )}
        <div className="px-6 py-4 flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

interface TabItem {
  key: string
  label: string
  icon?: string
}

interface TabBarProps {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
  className?: string
}

export function TabBar({ tabs, active, onChange, className }: TabBarProps) {
  return (
    <div className={cn('flex gap-1 bg-surface rounded-lg p-1 border border-surface-border', className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all duration-150',
            active === t.key
              ? 'bg-amber-brand text-navy-900 shadow-sm'
              : 'text-surface-muted hover:text-navy-800',
          )}
        >
          {t.icon && <span>{t.icon}</span>}
          {t.label}
        </button>
      ))}
    </div>
  )
}
