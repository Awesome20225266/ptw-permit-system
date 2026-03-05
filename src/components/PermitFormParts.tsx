// src/pages/permit/PermitFormParts.tsx
// Reusable form sections shared by all three permit portals

import React from 'react'
import { cn } from '@/lib/utils'
import type { PTWFormData } from './permitTypes'
import {
  HAZARD_FIELDS, RISK_FIELDS, PPE_FIELDS,
  PRECAUTION_FIELDS, ASSOCIATED_PERMITS, ISSUER_CHECKS,
} from './permitTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

interface SectionProps { title: string; icon: string; children: React.ReactNode }
export function FormSection({ title, icon, children }: SectionProps) {
  return (
    <div className="border border-surface-border rounded-xl overflow-hidden">
      <div className="bg-navy-800/[0.03] border-b border-surface-border px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-bold text-navy-800">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

interface CheckboxGridProps {
  fields: Array<{ key: keyof PTWFormData; label: string }>
  values: PTWFormData
  onChange: (key: keyof PTWFormData, val: boolean) => void
  readOnly?: boolean
  cols?: number
}
export function CheckboxGrid({ fields, values, onChange, readOnly, cols = 3 }: CheckboxGridProps) {
  return (
    <div className={cn(
      'grid gap-x-6 gap-y-2',
      cols === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2',
    )}>
      {fields.map(({ key, label }) => (
        <label
          key={key}
          className={cn(
            'flex items-center gap-2.5 text-sm cursor-pointer select-none',
            readOnly && 'cursor-default',
          )}
        >
          <input
            type="checkbox"
            checked={!!(values[key])}
            disabled={readOnly}
            onChange={(e) => !readOnly && onChange(key, e.target.checked)}
            className="h-4 w-4 rounded border-surface-border accent-amber-brand cursor-pointer disabled:cursor-default"
          />
          <span className={values[key] ? 'font-semibold text-navy-800' : 'text-navy-600'}>
            {label}
          </span>
        </label>
      ))}
    </div>
  )
}

interface TriStateProps {
  field: { key: keyof PTWFormData; label: string }
  value: string | undefined
  onChange: (key: keyof PTWFormData, val: string) => void
  readOnly?: boolean
}
export function TriStateRow({ field, value, onChange, readOnly }: TriStateProps) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-surface-border/50 last:border-0">
      <span className="text-sm text-navy-700 flex-1 pr-4">{field.label}</span>
      <div className="flex gap-1">
        {(['Y', 'N', 'NA'] as const).map((opt) => (
          <button
            key={opt}
            disabled={readOnly}
            onClick={() => !readOnly && onChange(field.key, value === opt ? '' : opt)}
            className={cn(
              'px-2.5 py-0.5 text-xs font-bold rounded border transition-all',
              value === opt
                ? opt === 'Y'
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : opt === 'N'
                  ? 'bg-red-500 border-red-500 text-white'
                  : 'bg-surface-muted border-surface-muted text-white'
                : 'border-surface-border text-surface-muted hover:border-navy-400 hover:text-navy-700',
              readOnly && 'cursor-default opacity-70',
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section components
// ─────────────────────────────────────────────────────────────────────────────

interface SectionBProps {
  values: PTWFormData
  onChange: (key: keyof PTWFormData, val: unknown) => void
  readOnly?: boolean
}

export function HazardsSection({ values, onChange, readOnly }: SectionBProps) {
  return (
    <FormSection title="A. Hazards" icon="⚠️">
      <CheckboxGrid
        fields={HAZARD_FIELDS}
        values={values}
        onChange={(k, v) => onChange(k, v)}
        readOnly={readOnly}
      />
      <div className="mt-3">
        <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Other hazards</label>
        <textarea
          className="input mt-1 h-14 resize-none text-sm"
          value={String(values.hz_others_text ?? '')}
          disabled={readOnly}
          onChange={(e) => onChange('hz_others_text', e.target.value)}
          placeholder="Describe any additional hazards…"
        />
      </div>
    </FormSection>
  )
}

export function RisksSection({ values, onChange, readOnly }: SectionBProps) {
  return (
    <FormSection title="B. Risks" icon="🔴">
      <CheckboxGrid
        fields={RISK_FIELDS}
        values={values}
        onChange={(k, v) => onChange(k, v)}
        readOnly={readOnly}
      />
      <div className="mt-3">
        <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Other risks</label>
        <textarea
          className="input mt-1 h-14 resize-none text-sm"
          value={String(values.rk_others_text ?? '')}
          disabled={readOnly}
          onChange={(e) => onChange('rk_others_text', e.target.value)}
          placeholder="Describe any additional risks…"
        />
      </div>
    </FormSection>
  )
}

export function PPESection({ values, onChange, readOnly }: SectionBProps) {
  return (
    <FormSection title="C. PPE Required" icon="🦺">
      <CheckboxGrid
        fields={PPE_FIELDS}
        values={values}
        onChange={(k, v) => onChange(k, v)}
        readOnly={readOnly}
      />
      <div className="mt-3">
        <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Other PPE</label>
        <textarea
          className="input mt-1 h-14 resize-none text-sm"
          value={String(values.ppe_others_text ?? '')}
          disabled={readOnly}
          onChange={(e) => onChange('ppe_others_text', e.target.value)}
          placeholder="Describe any additional PPE…"
        />
      </div>
    </FormSection>
  )
}

export function PrecautionsSection({ values, onChange, readOnly }: SectionBProps) {
  return (
    <FormSection title="D. Safety Precautions" icon="🛡️">
      <CheckboxGrid
        fields={PRECAUTION_FIELDS}
        values={values}
        onChange={(k, v) => onChange(k, v)}
        readOnly={readOnly}
        cols={3}
      />
      <div className="mt-3">
        <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Other precautions</label>
        <textarea
          className="input mt-1 h-14 resize-none text-sm"
          value={String(values.sp_others_text ?? '')}
          disabled={readOnly}
          onChange={(e) => onChange('sp_others_text', e.target.value)}
        />
      </div>
    </FormSection>
  )
}

export function AssociatedPermitsSection({ values, onChange, readOnly }: SectionBProps) {
  return (
    <FormSection title="E. Associated Permits" icon="📄">
      <CheckboxGrid
        fields={ASSOCIATED_PERMITS}
        values={values}
        onChange={(k, v) => onChange(k, v)}
        readOnly={readOnly}
        cols={3}
      />
      <div className="mt-3">
        <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">Others</label>
        <input
          type="text"
          className="input mt-1"
          value={String(values.ap_others_text ?? '')}
          disabled={readOnly}
          onChange={(e) => onChange('ap_others_text', e.target.value)}
        />
      </div>
    </FormSection>
  )
}

export function ToolsSection({ values, onChange, readOnly }: SectionBProps) {
  return (
    <FormSection title="F. Tools / Equipment Required" icon="🔧">
      <textarea
        className="input h-20 resize-none text-sm w-full"
        value={String(values.tools_equipment ?? '')}
        disabled={readOnly}
        onChange={(e) => onChange('tools_equipment', e.target.value)}
        placeholder="List all tools and equipment required for the work…"
      />
    </FormSection>
  )
}

export function IssuerChecklistSection({ values, onChange, readOnly }: SectionBProps) {
  return (
    <FormSection title="G. Safety Checklist (Permit Issuer)" icon="✅">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
        {ISSUER_CHECKS.map((field) => (
          <TriStateRow
            key={field.key}
            field={field}
            value={String(values[field.key] ?? '')}
            onChange={(k, v) => onChange(k, v)}
            readOnly={readOnly}
          />
        ))}
      </div>
    </FormSection>
  )
}

export function UndertakingSection({ values, onChange, readOnly }: SectionBProps) {
  return (
    <FormSection title="H. Undertaking (Mandatory)" icon="📝">
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-3">
        <p className="text-xs text-amber-800 font-medium">
          ⚠️ This undertaking must be accepted before submitting the permit.
        </p>
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={!!values.undertaking_accept}
          disabled={readOnly}
          onChange={(e) => !readOnly && onChange('undertaking_accept', e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-surface-border accent-amber-brand flex-shrink-0"
        />
        <span className={cn('text-sm leading-snug', values.undertaking_accept ? 'font-semibold text-navy-800' : 'text-navy-600')}>
          I have reviewed and understood the risk assessment, safety precautions, and emergency
          procedures. I accept responsibility for ensuring all personnel involved comply with the
          permit conditions.
        </span>
      </label>
    </FormSection>
  )
}

export function PeopleSection({ values, onChange, readOnly }: SectionBProps) {
  const field = (key: keyof PTWFormData, label: string, required = false) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        className="input"
        value={String(values[key] ?? '')}
        disabled={readOnly}
        onChange={(e) => onChange(key, e.target.value)}
      />
    </div>
  )

  return (
    <FormSection title="I. People Involved" icon="👥">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {field('receiver_name', 'Permit Receiver', true)}
        {field('holder_name', 'Permit Holder')}
        {field('issuer_name', 'Permit Issuer')}
        {field('coworker_1', 'Co-worker 1')}
        {field('coworker_2', 'Co-worker 2')}
        {field('coworker_3', 'Co-worker 3')}
        {field('coworker_4', 'Co-worker 4')}
        {field('coworker_5', 'Co-worker 5')}
        {field('coworker_6', 'Co-worker 6')}
      </div>
    </FormSection>
  )
}
