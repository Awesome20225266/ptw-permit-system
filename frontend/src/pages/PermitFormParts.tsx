// src/pages/permit/PermitFormParts.tsx
// Reusable form sections shared by all three permit portals

import React from 'react'
import { cn } from '@/lib/utils'
import type { PTWFormData } from './permitTypes'
import {
  HAZARD_FIELDS, RISK_FIELDS, PPE_FIELDS,
  PRECAUTION_FIELDS, ASSOCIATED_PERMITS, ISSUER_CHECKS,
} from './permitTypes'
import { useLang, useViewMode, tl } from '@/store/languageStore'

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
  const lang = useLang()
  const viewMode = useViewMode()
  const colClass = viewMode === 'mobile'
    ? 'grid-cols-1'
    : cols === 3
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2'

  return (
    <div className={cn('grid gap-x-6 gap-y-2', colClass)}>
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
            className="h-4 w-4 rounded border-surface-border accent-amber-brand cursor-pointer disabled:cursor-default flex-shrink-0"
          />
          <span className={values[key] ? 'font-semibold text-navy-800' : 'text-navy-600'}>
            {tl(label, lang)}
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
  const lang = useLang()
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-surface-border/50 last:border-0">
      <span className="text-sm text-navy-700 flex-1 pr-4">{tl(field.label, lang)}</span>
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
  const lang = useLang()
  return (
    <FormSection title={`A. ${tl('Hazards', lang)}`} icon="⚠️">
      <CheckboxGrid
        fields={HAZARD_FIELDS}
        values={values}
        onChange={(k, v) => onChange(k, v)}
        readOnly={readOnly}
      />
      <div className="mt-3">
        <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">
          {tl('Other hazards', lang)}
        </label>
        <textarea
          className="input mt-1 h-14 resize-none text-sm w-full"
          value={String(values.hz_others_text ?? '')}
          disabled={readOnly}
          onChange={(e) => onChange('hz_others_text', e.target.value)}
          placeholder={tl('Other hazards', lang)}
        />
      </div>
    </FormSection>
  )
}

export function RisksSection({ values, onChange, readOnly }: SectionBProps) {
  const lang = useLang()
  return (
    <FormSection title={`B. ${tl('Risks', lang)}`} icon="🔴">
      <CheckboxGrid
        fields={RISK_FIELDS}
        values={values}
        onChange={(k, v) => onChange(k, v)}
        readOnly={readOnly}
      />
      <div className="mt-3">
        <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">
          {tl('Other risks', lang)}
        </label>
        <textarea
          className="input mt-1 h-14 resize-none text-sm w-full"
          value={String(values.rk_others_text ?? '')}
          disabled={readOnly}
          onChange={(e) => onChange('rk_others_text', e.target.value)}
          placeholder={tl('Other risks', lang)}
        />
      </div>
    </FormSection>
  )
}

export function PPESection({ values, onChange, readOnly }: SectionBProps) {
  const lang = useLang()
  return (
    <FormSection title={`C. ${tl('PPE Required', lang)}`} icon="🦺">
      <CheckboxGrid
        fields={PPE_FIELDS}
        values={values}
        onChange={(k, v) => onChange(k, v)}
        readOnly={readOnly}
      />
      <div className="mt-3">
        <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">
          {tl('Other PPE', lang)}
        </label>
        <textarea
          className="input mt-1 h-14 resize-none text-sm w-full"
          value={String(values.ppe_others_text ?? '')}
          disabled={readOnly}
          onChange={(e) => onChange('ppe_others_text', e.target.value)}
          placeholder={tl('Other PPE', lang)}
        />
      </div>
    </FormSection>
  )
}

export function PrecautionsSection({ values, onChange, readOnly }: SectionBProps) {
  const lang = useLang()
  return (
    <FormSection title={`D. ${tl('Safety Precautions', lang)}`} icon="🛡️">
      <CheckboxGrid
        fields={PRECAUTION_FIELDS}
        values={values}
        onChange={(k, v) => onChange(k, v)}
        readOnly={readOnly}
        cols={3}
      />
      <div className="mt-3">
        <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">
          {tl('Other precautions', lang)}
        </label>
        <textarea
          className="input mt-1 h-14 resize-none text-sm w-full"
          value={String(values.sp_others_text ?? '')}
          disabled={readOnly}
          onChange={(e) => onChange('sp_others_text', e.target.value)}
        />
      </div>
    </FormSection>
  )
}

export function AssociatedPermitsSection({ values, onChange, readOnly }: SectionBProps) {
  const lang = useLang()
  return (
    <FormSection title={`E. ${tl('Associated Permits', lang)}`} icon="📄">
      <CheckboxGrid
        fields={ASSOCIATED_PERMITS}
        values={values}
        onChange={(k, v) => onChange(k, v)}
        readOnly={readOnly}
        cols={3}
      />
      <div className="mt-3">
        <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">
          {tl('Others', lang)}
        </label>
        <input
          type="text"
          className="input mt-1 w-full"
          value={String(values.ap_others_text ?? '')}
          disabled={readOnly}
          onChange={(e) => onChange('ap_others_text', e.target.value)}
        />
      </div>
    </FormSection>
  )
}

export function ToolsSection({ values, onChange, readOnly }: SectionBProps) {
  const lang = useLang()
  return (
    <FormSection title={`F. ${tl('Tools / Equipment Required', lang)}`} icon="🔧">
      <textarea
        className="input h-20 resize-none text-sm w-full"
        value={String(values.tools_equipment ?? '')}
        disabled={readOnly}
        onChange={(e) => onChange('tools_equipment', e.target.value)}
        placeholder={tl('List all tools and equipment', lang)}
      />
    </FormSection>
  )
}

export function IssuerChecklistSection({ values, onChange, readOnly }: SectionBProps) {
  const lang = useLang()
  const viewMode = useViewMode()
  const gridCols = viewMode === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'
  return (
    <FormSection title={`G. ${tl('Safety Checklist', lang)}`} icon="✅">
      <div className={cn('grid gap-x-8', gridCols)}>
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
  const lang = useLang()
  return (
    <FormSection title={`H. ${tl('Undertaking', lang)}`} icon="📝">
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-3">
        <p className="text-xs text-amber-800 font-medium">
          {tl('Undertaking warning', lang)}
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
          {tl('Undertaking text', lang)}
        </span>
      </label>
    </FormSection>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// People section — S1 hides Permit Holder and Permit Issuer
// ─────────────────────────────────────────────────────────────────────────────

interface PeopleSectionProps extends SectionBProps {
  /** When true, Permit Holder and Permit Issuer fields are hidden (S1 context) */
  hideHolderIssuer?: boolean
  /** Read-only datetime string to show as "Permit Receiver Date & Time" (S1 context) */
  receiverDatetime?: string
  /** If provided and not readOnly, Permit Receiver renders as a dropdown limited to these names */
  receiverOptions?: string[]
}

export function PeopleSection({ values, onChange, readOnly, hideHolderIssuer, receiverDatetime, receiverOptions }: PeopleSectionProps) {
  const lang = useLang()
  const viewMode = useViewMode()
  const gridCols = viewMode === 'mobile'
    ? 'grid-cols-1'
    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'

  const textField = (key: keyof PTWFormData, label: string, required = false) => (
    <div className="flex flex-col gap-1" key={key}>
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
    <FormSection title={`I. ${tl('People Involved', lang)}`} icon="👥">
      <div className={cn('grid gap-3', gridCols)}>
        {/* Permit Receiver name — dropdown when receiverOptions provided, else text */}
        {receiverOptions && !readOnly ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">
              {tl('Permit Receiver', lang)} <span className="text-red-500">*</span>
            </label>
            <select
              className="select"
              value={String(values.receiver_name ?? '')}
              onChange={(e) => onChange('receiver_name', e.target.value)}
            >
              <option value="">— {tl('Select', lang)} —</option>
              {receiverOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        ) : (
          textField('receiver_name', tl('Permit Receiver', lang), true)
        )}

        {/* Permit Receiver Date & Time — shows date_s1_created / receiver_datetime */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-surface-muted uppercase tracking-wide">
            {tl('Permit Receiver Date & Time', lang)}
          </label>
          {(hideHolderIssuer || readOnly) ? (
            /* Read-only: prefer explicit prop, then form_data field, then placeholder */
            <div className="input bg-slate-50 text-slate-600 text-xs font-mono select-all">
              {receiverDatetime || String(values.receiver_datetime ?? '') || '—'}
            </div>
          ) : (
            <input
              type="text"
              className="input"
              value={String(values.receiver_datetime ?? '')}
              disabled={readOnly}
              onChange={(e) => onChange('receiver_datetime', e.target.value)}
              placeholder="Auto-filled on submit"
            />
          )}
        </div>

        {/* Permit Holder + Issuer — hidden in S1 context, filled in S2/S3 */}
        {!hideHolderIssuer && textField('holder_name', 'Permit Holder')}
        {!hideHolderIssuer && textField('issuer_name', 'Permit Issuer')}

        {/* Co-workers */}
        {[1, 2, 3, 4, 5, 6].map((n) =>
          textField(`coworker_${n}` as keyof PTWFormData, `${tl('Co-worker', lang)} ${n}`)
        )}
      </div>
    </FormSection>
  )
}
